const OpenAI = require('openai');
const { FileAnalyzer } = require('./file-analyzer');
const { RepositoryAnalyzer } = require('./repository-analyzer');
const { FileManager } = require('./file-manager');
const { SolutionValidator } = require('./solution-validator');

class OpenAIIssueSolver {
  constructor(apiKey, config) {
    this.client = new OpenAI({
      apiKey: apiKey,
    });
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
    
    const issueInfo = this.config.getAnalysisIssueInfo();
    console.log(`📋 分析対象: ${issueInfo.title}`);
    console.log(`💬 コメント数: ${issueInfo.comments.length}件`);
    if (issueInfo.hasGeminiTrigger) {
      console.log('🎯 @gptトリガーが検出されました');
    }
    
    const repoContext = await this.repositoryAnalyzer.getRepositoryContext();
    const targetFiles = this.config.getTargetFiles();
    
    const analysisText = issueInfo.latestRequest || issueInfo.body;
    const relevantFiles = targetFiles.length > 0 
      ? targetFiles 
      : this.fileAnalyzer.findRelevantFiles(issueInfo.title, analysisText, repoContext);
    
    console.log(`📁 関連ファイル: ${relevantFiles.length}件`);
    if (relevantFiles.length > 0) {
      console.log('主要ファイル:', relevantFiles.slice(0, 5).join(', '));
    }
    
    const fileContents = this.fileAnalyzer.readRelevantFiles(relevantFiles);
    
    const extractedErrorInfo = this.fileAnalyzer.extractErrorInfo(analysisText);
    const combinedErrorInfo = [
      ...extractedErrorInfo.errors,
      ...extractedErrorInfo.stackTraces,
      ...issueInfo.errorInfo
    ];
    
    this.issueAnalysis = {
      title: issueInfo.title,
      body: issueInfo.body,
      originalBody: this.config.issueBody,
      labels: issueInfo.labels,
      relevantFiles: relevantFiles,
      fileContents: fileContents,
      errorInfo: [...new Set(combinedErrorInfo)],
      repositoryContext: repoContext,
      executionMode: this.config.executionMode,
      hasGeminiTrigger: issueInfo.hasGeminiTrigger,
      latestRequest: issueInfo.latestRequest,
      analysisContext: issueInfo.analysisContext,
      technicalContext: issueInfo.technicalContext,
      comments: issueInfo.comments,
      commentsCount: issueInfo.comments.length
    };
    
    console.log('✅ 分析フェーズ完了');
    console.log('発見された関連ファイル:', relevantFiles.length);
    console.log('検出されたエラーパターン:', this.issueAnalysis.errorInfo.length);
    console.log('技術スタック:', issueInfo.technicalContext.technologies.join(', ') || 'Auto-detect');
    
    return this.issueAnalysis;
  }

  async generateSolution() {
    console.log('計画フェーズ：OpenAI GPTでソリューション生成中...');
    console.log('使用モデル:', this.config.openaiModel);
    
    const prompt = this.buildSolutionPrompt();
    const maxRetries = this.config.openaiMaxRetries || 3;
    const retryDelay = this.config.openaiRetryDelay || 2000;
    const timeout = this.config.openaiTimeout || 3600000;
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 OpenAI APIにリクエスト送信中... (試行 ${attempt}/${maxRetries})`);
        
        const result = await this.callOpenAIWithTimeout({
          model: this.config.openaiModel,
          messages: [
            {
              role: 'system',
              content: 'You are an expert software developer that provides solutions in JSON format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 32768,
          response_format: { type: "json_object" }
        }, timeout);
        
        console.log('📥 OpenAIからレスポンスを受信');
        
        const responseText = result.choices[0].message.content;
        console.log('📝 レスポンステキストを抽出:', responseText.substring(0, 200) + '...');
        
        if (!responseText || responseText.trim() === '') {
          throw new Error('空のレスポンスを受信しました');
        }
        
        try {
          this.solution = this.parseOpenAIResponse(responseText);
          
          const validation = this.validator.validateSolution(this.solution);
          if (!validation.valid) {
            console.error('❌ ソリューション検証エラー:', validation.errors);
            
            if (attempt < maxRetries) {
              console.log('🔧 ソリューション修復を試行...');
              continue;
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
            continue;
          }
          
          console.log('Raw response:', responseText.substring(0, 500));
          this.solution = this.createFallbackSolution(responseText);
          return this.solution;
        }
      } catch (apiError) {
        lastError = apiError;
        console.error(`OpenAI APIエラー (試行 ${attempt}/${maxRetries}):`, apiError.message);
        
        if (attempt < maxRetries) {
          console.log(`🔄 ${retryDelay / 1000}秒後にリトライ...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw new Error(`ソリューション生成に失敗 (${maxRetries}回試行): ${lastError?.message || '不明なエラー'}`);
  }

  buildSolutionPrompt() {
    const analysisResult = this.analyzeIssueContent();
    
    let prompt = `You are an expert software developer. Please analyze this GitHub Issue and provide a concrete solution.

ISSUE ANALYSIS:
Title: ${this.issueAnalysis.title}
Original Issue Description: ${this.issueAnalysis.originalBody || 'N/A'}
Full Context (including comments): ${this.issueAnalysis.body}
Labels: ${this.issueAnalysis.labels.join(', ')}

GPT TRIGGER INFORMATION:
Has @gpt trigger: ${this.issueAnalysis.hasGeminiTrigger ? 'YES' : 'NO'}
Latest request: ${this.issueAnalysis.latestRequest || 'No specific request'}
Total comments: ${this.issueAnalysis.commentsCount || 0}

REQUIREMENT TYPE: ${analysisResult.type}
IMPLEMENTATION REQUIRED: ${analysisResult.needsImplementation ? 'YES' : 'NO'}
DETECTED TECHNOLOGIES: ${this.issueAnalysis.technicalContext.technologies.join(', ') || 'Auto-detect'}

`;
    
    if (this.issueAnalysis.hasGeminiTrigger) {
      prompt += `IMPORTANT: This issue was triggered by @gpt comment. Focus on the latest request:
"${this.issueAnalysis.latestRequest}"

`;
    }
    
    if (analysisResult.needsImplementation) {
      prompt += `IMPORTANT: This is a code implementation request. You MUST create actual code files.
REQUIRED: Include specific file paths and complete code content in your response.
EXAMPLE FILES: ${analysisResult.suggestedFiles.join(', ')}

`;
    }
    
    if (this.issueAnalysis.errorInfo.length > 0) {
      prompt += `ERROR INFORMATION (from issue + comments):\n${this.issueAnalysis.errorInfo.map(e => `- ${e}`).join('\n')}\n\n`;
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

  analyzeIssueContent() {
    const primaryText = this.issueAnalysis.latestRequest || this.issueAnalysis.body;
    const text = (this.issueAnalysis.title + ' ' + primaryText).toLowerCase();
    const repoContext = this.issueAnalysis.repositoryContext || {};
    
    const detectedTechs = this.issueAnalysis.technicalContext?.technologies || [];
    const technologiesSet = new Set(detectedTechs);
    
    if (text.includes('.ts') || text.includes('typescript')) technologiesSet.add('TypeScript');
    if (text.includes('.js') || text.includes('javascript')) technologiesSet.add('JavaScript');
    if (text.includes('.py') || text.includes('python')) technologiesSet.add('Python');
    if (text.includes('.java')) technologiesSet.add('Java');
    if (text.includes('react')) technologiesSet.add('React');
    if (text.includes('node') || text.includes('npm')) technologiesSet.add('Node.js');
    
    const technologies = Array.from(technologiesSet);
    
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
      
      if (text.includes('ハローワールド') || text.includes('hello world')) {
        if (technologies.includes('TypeScript')) {
          suggestedFiles = repoContext.hasSourceDir ? ['src/hello.ts'] : ['hello.ts'];
        } else if (technologies.includes('JavaScript')) {
          suggestedFiles = repoContext.hasSourceDir ? ['src/hello.js'] : ['hello.js'];
        } else if (technologies.includes('Python')) {
          suggestedFiles = ['hello.py'];
        }
      } else {
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

  extractFeatureName(text) {
    if (!text || typeof text !== 'string') {
      return 'feature';
    }
    const words = text.match(/\b[a-z]+\b/g) || [];
    const candidates = words.filter(w => w.length > 3 && !['test', 'file', 'code', 'impl'].includes(w));
    return candidates[0] || 'feature';
  }

  assessComplexity(text) {
    if (!text || typeof text !== 'string') {
      return 'low';
    }
    let score = 0;
    if (text.includes('api') || text.includes('database')) score += 2;
    if (text.includes('auth') || text.includes('security')) score += 2;
    if (text.includes('config') || text.includes('setting')) score += 1;
    return score > 3 ? 'high' : score > 1 ? 'medium' : 'low';
  }

  assessPriority(text) {
    if (!text || typeof text !== 'string') {
      return 'medium';
    }
    if (text.includes('緊急') || text.includes('urgent') || text.includes('重要')) return 'high';
    if (text.includes('バグ') || text.includes('bug') || text.includes('エラー')) return 'high';
    return 'medium';
  }

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

  async callOpenAIWithTimeout(requestConfig, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`OpenAI APIコールがタイムアウトしました (${timeout / 1000}秒)`));
      }, timeout);
      
      try {
        // codex-mini-latestモデルは/responsesエンドポイントを使用
        if (requestConfig.model === 'codex-mini-latest') {
          // Structured Outputsのスキーマを定義
          const jsonSchema = {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: ["feature", "bug", "test", "documentation", "enhancement"]
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"]
              },
              analysis: {
                type: "string",
                description: "Detailed problem analysis in Japanese"
              },
              planning: {
                type: "array",
                items: { type: "string" },
                description: "Step-by-step plan"
              },
              description: {
                type: "string",
                description: "Clear solution description in Japanese"
              },
              files: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    path: { type: "string" },
                    action: { type: "string", enum: ["create", "modify", "delete"] },
                    changes: { type: "string" },
                    content: {
                      oneOf: [
                        { type: "string" },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            type: { type: "string", enum: ["append", "prepend", "replace"] },
                            content: { type: "string" },
                            from: { type: "string" },
                            to: { type: "string" }
                          },
                          required: ["type"]
                        }
                      ]
                    }
                  },
                  required: ["path", "action", "changes", "content"]
                }
              },
              implementation: {
                type: "string",
                description: "Complete implementation details or code"
              },
              tests: {
                type: "string",
                description: "Testing recommendations in Japanese"
              },
              report: {
                type: "string",
                description: "Implementation report in Japanese"
              }
            },
            required: ["type", "confidence", "analysis", "planning", "description", "files", "implementation", "tests", "report"]
          };

          // /responsesエンドポイント用にリクエスト形式を変換（Structured Outputs対応）
          const responsesConfig = {
            model: requestConfig.model,
            input: requestConfig.messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            text: {
              format: {
                type: "json_schema",
                strict: true,
                name: "issue_solution",
                schema: jsonSchema
              }
            }
          };
          const result = await this.client.responses.parse(responsesConfig);
          
          // /chat/completions形式にレスポンスを変換
          const convertedResult = {
            choices: [{
              message: {
                content: JSON.stringify(result.output_parsed || result.output_text || result.output || {})
              }
            }]
          };
          clearTimeout(timeoutId);
          resolve(convertedResult);
        } else {
          // 他のモデルは従来通り/chat/completionsを使用
          const result = await this.client.chat.completions.create(requestConfig);
          clearTimeout(timeoutId);
          resolve(result);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  parseOpenAIResponse(responseText) {
    try {
      return JSON.parse(responseText);
    } catch (e1) {
      console.log('🔄 標準JSONパース失敗、クリーニングを試行...');
    }
    
    if (responseText && typeof responseText === 'string') {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/{[\s\S]*}/);
      
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } catch (e2) {
          console.log('🔄 JSONブロック抽出失敗、文字列クリーニングを試行...');
        }
      }
    }
    
    const fallback = this.extractKeyInformation(responseText);
    console.log('⚠️  JSONパース失敗、フォールバックソリューションを使用');
    return fallback;
  }

  extractKeyInformation(responseText) {
    if (!responseText) responseText = '';
    
    const analysisResult = this.analyzeIssueContent();
    
    const files = [];
    const codeBlockMatches = (responseText && typeof responseText === 'string') 
      ? responseText.match(/```(?:typescript|javascript|python)?\s*([\s\S]*?)```/g) || []
      : [];
    
    if (analysisResult.needsImplementation && codeBlockMatches.length > 0) {
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
      analysis: 'OpenAIからのレスポンスを処理し、必要な情報を抽出しました。',
      planning: ['コンテンツの分析', '必要な実装の特定', 'コードの生成'],
      description: responseText ? responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '') : '',
      files: files,
      implementation: codeBlockMatches.length > 0 ? codeBlockMatches[0] : responseText,
      tests: '実装後にテストを実行してください',
      report: 'OpenAIのレスポンスを処理し、フォールバックソリューションを生成しました。'
    };
  }
  
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
      if (this.config.executionMode === 'detailed') {
        await this.fileManager.createDocumentation(this.solution, this.issueAnalysis, this.config);
      } else {
        console.log('詳細ドキュメント生成をスキップ');
      }
    }
    
    console.log('✅ 修正フェーズ完了');
  }
}

module.exports = { OpenAIIssueSolver };