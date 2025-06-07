const { GoogleGenAI } = require('@google/genai');
const { FileAnalyzer } = require('./file-analyzer');
const { RepositoryAnalyzer } = require('./repository-analyzer');
const { FileManager } = require('./file-manager');
const { GeminiResponseHelper } = require('./gemini-response-helper');
const { SolutionValidator } = require('./solution-validator');

class GeminiIssueSolver {
  constructor(apiKey, config) {
    // 修正: APIキーをオブジェクトとして渡す
    this.ai = new GoogleGenAI({apiKey: apiKey});
    this.config = config;
    this.issueAnalysis = {};
    this.solution = null;
    this.fileAnalyzer = new FileAnalyzer();
    this.repositoryAnalyzer = new RepositoryAnalyzer();
    this.fileManager = new FileManager();
    this.validator = new SolutionValidator();
  }

  async analyzeIssue() {
    console.log('🔍 分析フェーズ：Issue分析を開始...');
    
    // ファイル分析
    const repoContext = await this.repositoryAnalyzer.getRepositoryContext();
    
    const targetFiles = this.config.getTargetFiles();
    const relevantFiles = targetFiles.length > 0 
      ? targetFiles 
      : this.fileAnalyzer.findRelevantFiles(this.config.issueTitle, this.config.issueBody, repoContext);
    
    console.log(`📁 関連ファイル: ${relevantFiles.length}件`);
    if (relevantFiles.length > 0) {
      console.log('主要ファイル:', relevantFiles.slice(0, 5).join(', '));
    }
    
    const fileContents = this.fileAnalyzer.readRelevantFiles(relevantFiles);
    const errorInfo = this.fileAnalyzer.extractErrorInfo(this.config.issueBody);
    
    this.issueAnalysis = {
      title: this.config.issueTitle,
      body: this.config.issueBody,
      labels: this.config.issueLabels ? this.config.issueLabels.split(',') : [],
      relevantFiles: relevantFiles,
      fileContents: fileContents,
      errorInfo: errorInfo,
      repositoryContext: repoContext,
      executionMode: this.config.executionMode
    };
    
    console.log('✅ 分析フェーズ完了');
    console.log('発見された関連ファイル:', relevantFiles.length);
    console.log('検出されたエラーパターン:', errorInfo.length);
    
    return this.issueAnalysis;
  }

  async generateSolution() {
    console.log('🤖 計画フェーズ：Geminiでソリューション生成中...');
    console.log('使用モデル:', this.config.geminiModel);
    
    let prompt = this.buildSolutionPrompt(); // letに変更
    const maxRetries = this.config.geminiMaxRetries || 3;
    const retryDelay = this.config.geminiRetryDelay || 2000; // 2秒
    const timeout = this.config.geminiTimeout || 3600000; // 1時間
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Gemini APIにリクエスト送信中... (試行 ${attempt}/${maxRetries})`);
        
        // タイムアウト付きでAPIコールを実行
        const result = await this.callGeminiWithTimeout({
          model: this.config.geminiModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            maxOutputTokens: 65536,  // トークン数を増加
          }
        }, timeout);
      
        console.log('📥 Geminiからレスポンスを受信');
        
        // 新しいSDKのレスポンス形式に対応
        let responseText = '';
        
        if (result.candidates && result.candidates.length > 0) {
          const candidate = result.candidates[0];
          
          // finishReasonをチェック
          if (candidate.finishReason === 'MAX_TOKENS') {
            console.warn('⚠️ レスポンスがトークン制限に達しました。制限を増加するか、プロンプトを短縮してください。');
          }
          
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            // partsがある場合
            responseText = candidate.content.parts
              .filter(part => part.text)
              .map(part => part.text)
              .join('');
          } else if (result.text) {
            // 直接textプロパティがある場合
            responseText = result.text;
          } else {
            throw new Error('レスポンスにテキストコンテンツが見つかりません');
          }
        } else {
          throw new Error('レスポンスにcandidatesが見つかりません');
        }
        
        console.log('📝 レスポンステキストを抽出:', responseText.substring(0, 200) + '...');
        
        if (!responseText || responseText.trim() === '') {
          throw new Error('空のレスポンスを受信しました');
        }
        
        try {
          // JSONパースの改善（複数の方法を試行）
          this.solution = this.parseGeminiResponse(responseText);
          
          // ソリューションの検証
          const validation = this.validator.validateSolution(this.solution);
          if (!validation.valid) {
            console.error('❌ ソリューション検証エラー:', validation.errors);
            
            // エラーに応じた修復試行
            if (attempt < maxRetries) {
              console.log('🔧 ソリューション修復を試行...');
              continue; // 次のリトライで改善されたプロンプトを使用
            }
            throw new Error('Invalid solution format: ' + validation.errors.join(', '));
          }
          
          if (validation.warnings.length > 0) {
            console.warn('⚠️  ソリューション警告:', validation.warnings);
          }
          
          console.log('✅ ソリューション生成完了:', this.solution.type);
          console.log('信頼度:', this.solution.confidence || 'medium');
          return this.solution;
        } catch (parseError) {
          console.error('JSONパースに失敗:', parseError.message);
          
          if (attempt < maxRetries) {
            console.log('🔄 パースエラーのため、プロンプトを調整してリトライ...');
            // 次のリトライでより簡単なJSONフォーマットを要求
            continue;
          }
          
          console.log('Raw response:', responseText.substring(0, 500));
          this.solution = this.createFallbackSolution(responseText);
          return this.solution;
        }
      } catch (apiError) {
        lastError = apiError;
        console.error(`Gemini APIエラー (試行 ${attempt}/${maxRetries}):`, apiError.message);
        
        if (attempt < maxRetries) {
          console.log(`🔄 エラーに応じてプロンプトを調整してリトライ...`);
          // エラータイプに応じてプロンプトを動的に調整
          prompt = this.adjustPromptForRetry(prompt, apiError, attempt);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    // すべての試行が失敗した場合
    throw new Error(`ソリューション生成に失敗 (${maxRetries}回試行): ${lastError?.message || '不明なエラー'}`);
  }

  // リトライ時のプロンプト調整
  adjustPromptForRetry(originalPrompt, error, attempt) {
    let adjustment = '';
    
    if (error.message.includes('parse') || error.message.includes('JSON')) {
      adjustment = `\n\nIMPORTANT: Previous attempt failed due to JSON parsing issues. Please ensure your response is valid JSON format. Start with { and end with }.\n`;
    } else if (error.message.includes('timeout')) {
      adjustment = `\n\nIMPORTANT: Previous attempt timed out. Please provide a more concise response with only essential information.\n`;
    } else if (error.message.includes('quota') || error.message.includes('rate')) {
      adjustment = `\n\nIMPORTANT: API rate limit encountered. Simplifying request.\n`;
    }
    
    // 試行回数に応じて簡略化
    if (attempt >= 2) {
      adjustment += `\n\nFORCE SIMPLE MODE: Provide only the most essential solution with minimal files array. Focus on core implementation only.\n`;
    }
    
    return originalPrompt + adjustment;
  }

  buildSolutionPrompt() {
    // Issue内容から実装要求を詳細に分析
    const analysisResult = this.analyzeIssueContent();
    
    let prompt = `You are an expert software developer. Please analyze this GitHub Issue and provide a concrete solution.

ISSUE ANALYSIS:
Title: ${this.issueAnalysis.title}
Description: ${this.issueAnalysis.body}
Labels: ${this.issueAnalysis.labels.join(', ')}

REQUIREMENT TYPE: ${analysisResult.type}
IMPLEMENTATION REQUIRED: ${analysisResult.needsImplementation ? 'YES' : 'NO'}
TECHNOLOGY STACK: ${analysisResult.technologies.join(', ') || 'Auto-detect'}

`;
    
    if (analysisResult.needsImplementation) {
      prompt += `IMPORTANT: This is a code implementation request. You MUST create actual code files.
REQUIRED: Include specific file paths and complete code content in your response.
EXAMPLE FILES: ${analysisResult.suggestedFiles.join(', ')}

`;
    }
    
    if (this.issueAnalysis.errorInfo.length > 0) {
      prompt += `ERROR INFORMATION:\n${this.issueAnalysis.errorInfo.map(e => `- ${e}`).join('\n')}\n\n`;
    }
    
    if (Object.keys(this.issueAnalysis.fileContents).length > 0) {
      prompt += 'EXISTING CODE CONTEXT:\n';
      Object.entries(this.issueAnalysis.fileContents).forEach(([file, content]) => {
        prompt += `=== ${file} ===\n${content.substring(0, 1000)}${content.length > 1000 ? '\n... (truncated)' : ''}\n\n`;
      });
    }
    
    if (this.issueAnalysis.repositoryContext) {
      prompt += `PROJECT CONTEXT:\n- Framework: ${this.issueAnalysis.repositoryContext.framework || 'Unknown'}\n- Dependencies: ${this.issueAnalysis.repositoryContext.mainDependencies?.slice(0, 5).join(', ') || 'None'}\n\n`;
    }
    
    prompt += `RELEVANT FILES: ${this.issueAnalysis.relevantFiles.slice(0, 10).join(', ')}\n\n`;
    prompt += this.getPromptTemplate();
    
    return prompt;
  }

  // Issue内容の詳細分析
  analyzeIssueContent() {
    const text = (this.issueAnalysis.title + ' ' + this.issueAnalysis.body).toLowerCase();
    const repoContext = this.issueAnalysis.repositoryContext || {};
    
    // テクノロジー検出
    const technologies = [];
    if (text.includes('.ts') || text.includes('typescript')) technologies.push('TypeScript');
    if (text.includes('.js') || text.includes('javascript')) technologies.push('JavaScript');
    if (text.includes('.py') || text.includes('python')) technologies.push('Python');
    if (text.includes('.java')) technologies.push('Java');
    if (text.includes('react')) technologies.push('React');
    if (text.includes('node') || text.includes('npm')) technologies.push('Node.js');
    
    // 要求タイプの判定
    let type = 'enhancement';
    let needsImplementation = false;
    let suggestedFiles = [];
    
    if (text.includes('テスト') || text.includes('test')) {
      type = 'test';
      needsImplementation = true;
      const testExt = technologies.includes('TypeScript') ? '.ts' : '.js';
      suggestedFiles = [`tests/feature.test${testExt}`, `tests/unit.test${testExt}`];
    } else if (text.includes('バグ') || text.includes('bug') || text.includes('エラー') || text.includes('error')) {
      type = 'bug_fix';
    } else if (text.includes('実装') || text.includes('implementation') || 
               text.includes('作成') || text.includes('create') ||
               text.includes('ハローワールド') || text.includes('hello world') ||
               technologies.length > 0) {
      type = 'feature';
      needsImplementation = true;
      
      // ファイル名の推測
      if (text.includes('ハローワールド') || text.includes('hello world')) {
        if (technologies.includes('TypeScript')) {
          suggestedFiles = repoContext.hasSourceDir ? ['src/hello.ts'] : ['hello.ts'];
        } else if (technologies.includes('JavaScript')) {
          suggestedFiles = repoContext.hasSourceDir ? ['src/hello.js'] : ['hello.js'];
        } else if (technologies.includes('Python')) {
          suggestedFiles = ['hello.py'];
        }
      } else {
        // 一般的な実装ファイルの推測
        const baseName = this.extractFeatureName(text);
        if (technologies.includes('TypeScript')) {
          suggestedFiles = repoContext.hasSourceDir ? [`src/${baseName}.ts`] : [`${baseName}.ts`];
        } else if (technologies.includes('JavaScript')) {
          suggestedFiles = repoContext.hasSourceDir ? [`src/${baseName}.js`] : [`${baseName}.js`];
        }
      }
    }
    
    return {
      type,
      needsImplementation,
      technologies,
      suggestedFiles,
      complexity: this.assessComplexity(text),
      priority: this.assessPriority(text)
    };
  }

  // 機能名の抽出
  extractFeatureName(text) {
    // 基本的な機能名を抽出
    const words = text.match(/\b[a-z]+\b/g) || [];
    const candidates = words.filter(w => w.length > 3 && !['test', 'file', 'code', 'impl'].includes(w));
    return candidates[0] || 'feature';
  }

  // 複雑度の評価
  assessComplexity(text) {
    let score = 0;
    if (text.includes('api') || text.includes('database')) score += 2;
    if (text.includes('auth') || text.includes('security')) score += 2;
    if (text.includes('config') || text.includes('setting')) score += 1;
    return score > 3 ? 'high' : score > 1 ? 'medium' : 'low';
  }

  // 優先度の評価
  assessPriority(text) {
    if (text.includes('緊急') || text.includes('urgent') || text.includes('重要')) return 'high';
    if (text.includes('バグ') || text.includes('bug') || text.includes('エラー')) return 'high';
    return 'medium';
  }

  // 推奨タイプの決定
  getRecommendedType(analysisResult) {
    return analysisResult.type;
  }

  getPromptTemplate() {
    const analysisResult = this.analyzeIssueContent();
    
    let template = `Please provide your solution in the following JSON format:

{
  "type": "${this.getRecommendedType(analysisResult)}",
  "confidence": "high|medium|low",
  "analysis": "Detailed problem analysis in Japanese",
  "planning": ["Step 1", "Step 2", "Step 3"],
  "description": "Clear solution description in Japanese",
  "files": [
    {
      "path": "exact/file/path.ext",
      "action": "create|modify|delete",
      "changes": "Description of changes",
      "content": "Complete file content for create OR modification object for modify"
    }
  ],
  "implementation": "Complete implementation details or code",
  "tests": "Testing recommendations in Japanese",
  "report": "Implementation report in Japanese"
}`;

    if (analysisResult.type === 'test') {
      template += `\n\nSPECIAL INSTRUCTIONS FOR TEST IMPLEMENTATION:
- Set type: "test"
- Include specific test file paths (e.g., "tests/feature.test.js")
- Provide complete test code with describe, it, expect patterns
- Match existing test framework (Jest, Mocha, etc.)
- Include both unit and integration tests if needed`;
    }

    template += `\n\nCRITICAL FILE MODIFICATION RULES:\n\nFor modify actions, use these content formats:\n1. Append: {"type": "append", "content": "text to add"}\n2. Prepend: {"type": "prepend", "content": "text to add at start"}\n3. Replace: {"type": "replace", "from": "text to find", "to": "replacement text"}\n\nEXAMPLE - Adding timestamp to README.md:\n{\n  "path": "README.md",\n  "action": "modify",\n  "changes": "Add last updated timestamp",\n  "content": {"type": "append", "content": "\\n---\\nLast updated: 2025-05-31 15:30:00"}\n}\n\nWARNING: Using string content in modify action will REPLACE the entire file!\nALWAYS use object format to preserve existing content.\nAll descriptions and reports should be in Japanese.`;
    
    if (analysisResult.needsImplementation) {
      template += `\n\nIMPLEMENTATION REQUIREMENTS:\n- Create actual ${analysisResult.technologies.join('/')} files\n- Provide complete, working code\n- Include proper imports/dependencies\n- Follow ${this.issueAnalysis.repositoryContext?.framework || 'project'} conventions\n- Ensure files are in correct directories`;
    }
    
    return template;
  }

  async callGeminiWithTimeout(requestConfig, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Gemini APIコールがタイムアウトしました (${timeout / 1000}秒)`));
      }, timeout);
      
      try {
        const result = await this.ai.models.generateContent(requestConfig);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  // 改善されたJSONパース処理
  parseGeminiResponse(responseText) {
    // 方法1: 標準JSONパース
    try {
      return JSON.parse(responseText);
    } catch (e1) {
      console.log('🔄 標準JSONパース失敗、クリーニングを試行...');
    }
    
    // 方法2: JSONブロックの抽出
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                     responseText.match(/{[\s\S]*}/);
    
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch (e2) {
        console.log('🔄 JSONブロック抽出失敗、文字列クリーニングを試行...');
      }
    }
    
    // 方法3: 簡略パーシング（キー情報を抽出）
    const fallback = this.extractKeyInformation(responseText);
    console.log('⚠️  JSONパース失敗、フォールバックソリューションを使用');
    return fallback;
  }

  // レスポンスからキー情報を抽出
  extractKeyInformation(responseText) {
    if (!responseText) responseText = '';
    
    const analysisResult = this.analyzeIssueContent();
    
    // ファイル情報の抽出
    const files = [];
    const codeBlockMatches = responseText.match(/```(?:typescript|javascript|python)?\s*([\s\S]*?)```/g) || [];
    
    if (analysisResult.needsImplementation && codeBlockMatches.length > 0) {
      // 最初のコードブロックを使用
      const codeContent = codeBlockMatches[0].replace(/```(?:typescript|javascript|python)?\s*/, '').replace(/```$/, '').trim();
      const suggestedPath = analysisResult.suggestedFiles[0] || this.guessPrimaryFile(analysisResult);
      
      files.push({
        path: suggestedPath,
        action: 'create',
        changes: '新しいファイルを作成',
        content: codeContent
      });
    }
    
    return {
      type: analysisResult.type,
      confidence: 'medium',
      analysis: 'Geminiからのレスポンスを処理し、必要な情報を抽出しました。',
      planning: ['コンテンツの分析', '必要な実装の特定', 'コードの生成'],
      description: responseText ? responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '') : '',
      files: files,
      implementation: codeBlockMatches.length > 0 ? codeBlockMatches[0] : responseText,
      tests: '実装後にテストを実行してください',
      report: 'Geminiのレスポンスを処理し、フォールバックソリューションを生成しました。'
    };
  }
  
  // プライマリファイルの推測
  guessPrimaryFile(analysisResult) {
    const repoContext = this.issueAnalysis.repositoryContext || {};
    
    if (analysisResult.technologies.includes('TypeScript')) {
      return repoContext.hasSourceDir ? 'src/index.ts' : 'index.ts';
    } else if (analysisResult.technologies.includes('JavaScript')) {
      return repoContext.hasSourceDir ? 'src/index.js' : 'index.js';
    } else if (analysisResult.technologies.includes('Python')) {
      return 'main.py';
    }
    return 'README.md';
  }
  
  createFallbackSolution(responseText) {
    return this.extractKeyInformation(responseText);
  }

  async implementSolution() {
    console.log('🔧 修正フェーズ：ソリューション実装中...');
    
    if (this.solution.files && this.solution.files.length > 0) {
      console.log('指定されたファイル修正を実行:', this.solution.files.length + '個のファイル');
      for (const fileAction of this.solution.files) {
        try {
          await this.fileManager.processFileAction(fileAction, this.solution, this.issueAnalysis);
        } catch (error) {
          console.error('ファイル処理に失敗', fileAction.path + ':', error.message);
        }
      }
    } else {
      console.log('⚠️ 特定のファイル修正が指定されていません');
      // ドキュメント生成は最小限に留める
      if (this.config.executionMode === 'detailed') {
        await this.fileManager.createDocumentation(this.solution, this.issueAnalysis, this.config);
      } else {
        console.log('詳細ドキュメント生成をスキップ');
      }
    }
    
    console.log('✅ 修正フェーズ完了');
  }
}

module.exports = { GeminiIssueSolver };
