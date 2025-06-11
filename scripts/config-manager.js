const { EnhancedIssueFetcher } = require('./enhanced-issue-fetcher');

class ConfigManager {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.githubToken = process.env.GITHUB_TOKEN;
    
    // 基本的なIssue情報（環境変数から - 後でAPI取得データで上書きされる）
    this.issueTitle = process.env.ISSUE_TITLE;
    this.issueBody = process.env.ISSUE_BODY;
    this.issueNumber = process.env.ISSUE_NUMBER;
    this.issueLabels = process.env.ISSUE_LABELS;
    this.commentBody = process.env.COMMENT_BODY;
    
    // API取得した完全なIssue情報（初期化後に設定される）
    this.completeIssueData = null;
    // モデル選択ロジック
    this.aiProvider = this.selectAIProvider();
    this.geminiModel = this.selectGeminiModel();
    this.openaiModel = this.selectOpenAIModel();
    this.forceImplementation = process.env.FORCE_IMPLEMENTATION === 'true';
    this.targetFiles = process.env.TARGET_FILES || '';
    this.executionMode = process.env.EXECUTION_MODE || 'auto';
    this.generateReport = process.env.GENERATE_REPORT === 'true';
    
    // Gemini API retry and timeout configuration
    this.geminiMaxRetries = parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10);
    this.geminiRetryDelay = parseInt(process.env.GEMINI_RETRY_DELAY || '2000', 10); // 2秒
    this.geminiTimeout = parseInt(process.env.GEMINI_TIMEOUT || '3600000', 10); // 1時間
    
    // Test phase configuration
    this.runTests = process.env.RUN_TESTS !== 'false'; // デフォルトは true
    this.testCommand = process.env.TEST_COMMAND || 'npm test';
    this.testMaxRetries = parseInt(process.env.TEST_MAX_RETRIES || '3', 10);
    
    // OpenAI API retry and timeout configuration
    this.openaiMaxRetries = parseInt(process.env.OPENAI_MAX_RETRIES || '3', 10);
    this.openaiRetryDelay = parseInt(process.env.OPENAI_RETRY_DELAY || '2000', 10); // 2秒
    this.openaiTimeout = parseInt(process.env.OPENAI_TIMEOUT || '3600000', 10); // 1時間
  }

  async validate() {
    // 基本的な必須パラメータのみチェック
    if (!this.issueNumber) {
      throw new Error('ISSUE_NUMBER is required');
    }
    
    console.log('✅ Configuration validated');
    console.log('実行モード:', this.executionMode);
    console.log('AIプロバイダー:', this.aiProvider);
    console.log('使用モデル:', this.aiProvider === 'openai' ? this.openaiModel : this.geminiModel);
  }

  async validateWithDiagnostics() {
    // Issue情報取得後の最新データで診断情報を出力
    this.updateIssueInfoFromCompleteData();
    this.logDiagnosticInfo();
    
    // AIプロバイダーに応じたAPIキーの厳密な検証
    if (this.aiProvider === 'openai') {
      if (!this.openaiApiKey) {
        this.throwDetailedOpenAIError();
      }
    } else {
      if (!this.geminiApiKey) {
        this.throwDetailedGeminiError();
      }
    }
  }

  updateIssueInfoFromCompleteData() {
    if (this.completeIssueData) {
      // 完全なIssue情報で環境変数データを更新
      this.issueBody = this.completeIssueData.body;
      this.issueTitle = this.completeIssueData.title;
      
      // AIプロバイダーを再選択（最新のIssue本文に基づいて）
      this.aiProvider = this.selectAIProvider();
    }
  }

  /**
   * GitHub APIからIssueの完全な情報を取得
   */
  async loadCompleteIssueData(github, context) {
    if (!github || !context) {
      console.log('⚠️ GitHub APIが利用できません。環境変数の情報を使用します。');
      return;
    }

    try {
      console.log('🔍 GitHub APIからIssue情報を完全取得中...');
      
      const fetcher = new EnhancedIssueFetcher(github, context);
      this.completeIssueData = await fetcher.fetchCompleteIssueData(parseInt(this.issueNumber));
      
      // 取得したデータで既存のプロパティを更新
      this.issueTitle = this.completeIssueData.title;
      this.issueBody = this.completeIssueData.body;
      this.issueLabels = this.completeIssueData.labels.join(',');
      
      // 最新の@gemini/@gptコメントがあれば、それを優先
      if (this.completeIssueData.latestGeminiComment) {
        this.commentBody = this.completeIssueData.latestGeminiComment.body;
        console.log(`🎯 最新のAIトリガーコメントを検出: ${this.completeIssueData.latestGeminiComment.author}`);
      }
      
      // モデル選択を再実行（コメント情報が更新されたため）
      this.aiProvider = this.selectAIProvider();
      this.geminiModel = this.selectGeminiModel();
      this.openaiModel = this.selectOpenAIModel();
      
      console.log('✅ Issue情報の完全取得完了');
      console.log(`📋 Issue: "${this.issueTitle}"`);
      console.log(`💬 コメント: ${this.completeIssueData.totalComments}件`);
      console.log(`🎯 AIトリガー: ${this.completeIssueData.geminiTriggerComments.length}件`);
      
    } catch (error) {
      console.error('❌ Issue情報の完全取得に失敗:', error.message);
      console.log('⚠️ 環境変数の情報を使用して続行します。');
    }
  }

  /**
   * 分析用のIssue情報を取得
   */
  getAnalysisIssueInfo() {
    if (this.completeIssueData) {
      return {
        title: this.completeIssueData.title,
        body: this.completeIssueData.fullContent, // 完全なコンテンツ
        analysisContext: this.completeIssueData.analysisContext, // AI分析用コンテキスト
        labels: this.completeIssueData.labels,
        hasGeminiTrigger: this.completeIssueData.hasGeminiTrigger,
        latestRequest: this.completeIssueData.analysisContext?.primaryRequest || this.completeIssueData.body,
        comments: this.completeIssueData.comments || [],
        errorInfo: this.completeIssueData.analysisContext?.errorInfo || [],
        technicalContext: this.completeIssueData.analysisContext?.technicalContext || { technologies: [], hasCodeBlocks: false }
      };
    } else {
      // フォールバック：環境変数の情報
      return {
        title: this.issueTitle,
        body: this.issueBody,
        labels: this.issueLabels ? this.issueLabels.split(',') : [],
        hasGeminiTrigger: false,
        latestRequest: this.commentBody || this.issueBody,
        comments: [],
        errorInfo: [],
        technicalContext: { technologies: [], hasCodeBlocks: false }
      };
    }
  }

  getTargetFiles() {
    return this.targetFiles ? this.targetFiles.split(',').map(f => f.trim()) : [];
  }

  selectAIProvider() {
    // 1. 環境変数から明示的に指定されている場合
    if (process.env.AI_PROVIDER) {
      console.log('環境変数からAIプロバイダーを使用:', process.env.AI_PROVIDER);
      return process.env.AI_PROVIDER.toLowerCase();
    }

    // 2. コメントボディから@gptパターンを検索（大文字小文字を区別しない）
    if (this.commentBody) {
      const gptPatterns = [
        /@gpt/i,
        /use.*gpt/i,
        /openai/i
      ];

      for (const pattern of gptPatterns) {
        if (pattern.test(this.commentBody)) {
          console.log('🎯 コメントから@gptトリガーを検出: OpenAI');
          return 'openai';
        }
      }
    }

    // 3. Issue ボディから@gptパターンを検索（大文字小文字を区別しない）
    if (this.issueBody) {
      const gptPatterns = [
        /@gpt/i,
        /use.*gpt/i,
        /openai/i
      ];

      for (const pattern of gptPatterns) {
        if (pattern.test(this.issueBody)) {
          console.log('🎯 Issue本文から@gptトリガーを検出: OpenAI');
          return 'openai';
        }
      }
    }

    // 4. デフォルトはGemini
    console.log('📌 デフォルトAIプロバイダーを使用: Gemini');
    return 'gemini';
  }

  selectOpenAIModel() {
    // 1. 環境変数から明示的に指定されている場合
    if (process.env.OPENAI_MODEL) {
      console.log('環境変数からOpenAIモデルを使用:', process.env.OPENAI_MODEL);
      return process.env.OPENAI_MODEL;
    }

    // 2. コメントボディから指定を検索
    if (this.commentBody) {
      // モデル切り替えパターン
      const modelPatterns = [
        { pattern: /codex-mini-latest/i, model: 'codex-mini-latest' },
        { pattern: /gpt-4o-mini/i, model: 'gpt-4o-mini' },
        { pattern: /gpt-4o/i, model: 'gpt-4o' },
        { pattern: /gpt-4\.1-mini/i, model: 'gpt-4.1-mini' },
        { pattern: /gpt-4\.1/i, model: 'gpt-4.1' },
        { pattern: /gpt-3\.5-turbo/i, model: 'gpt-3.5-turbo' },
        { pattern: /o3-mini/i, model: 'o3-mini' },
        { pattern: /o4-mini/i, model: 'o4-mini' }
      ];

      for (const { pattern, model } of modelPatterns) {
        if (pattern.test(this.commentBody)) {
          console.log(`🎯 コメントからOpenAIモデルを検出: ${model}`);
          return model;
        }
      }
    }

    // 3. Issue ボディから指定を検索
    if (this.issueBody) {
      const modelPatterns = [
        { pattern: /codex-mini-latest/i, model: 'codex-mini-latest' },
        { pattern: /gpt-4o-mini/i, model: 'gpt-4o-mini' },
        { pattern: /gpt-4o/i, model: 'gpt-4o' },
        { pattern: /gpt-4\.1-mini/i, model: 'gpt-4.1-mini' },
        { pattern: /gpt-4\.1/i, model: 'gpt-4.1' },
        { pattern: /gpt-3\.5-turbo/i, model: 'gpt-3.5-turbo' }
      ];

      for (const { pattern, model } of modelPatterns) {
        if (pattern.test(this.issueBody)) {
          console.log(`🎯 Issue本文からOpenAIモデルを検出: ${model}`);
          return model;
        }
      }
    }

    // 4. デフォルトモデル (codex-mini-latest)
    const defaultModel = 'codex-mini-latest';
    console.log('📌 デフォルトOpenAIモデルを使用:', defaultModel);
    return defaultModel;
  }

  selectGeminiModel() {
    // 1. 環境変数から明示的に指定されている場合
    if (process.env.GEMINI_MODEL) {
      console.log('環境変数からモデルを使用:', process.env.GEMINI_MODEL);
      return process.env.GEMINI_MODEL;
    }

    // 2. コメントボディから指定を検索
    if (this.commentBody) {
      // モデル切り替えパターン
      const modelPatterns = [
        { pattern: /@gemini-flash/i, model: 'gemini-2.5-flash-preview-05-20' },
        { pattern: /@gemini-pro/i, model: 'gemini-2.5-pro-preview-06-05' },
        { pattern: /model:\s*flash/i, model: 'gemini-2.5-flash-preview-05-20' },
        { pattern: /model:\s*pro/i, model: 'gemini-2.5-pro-preview-06-05' },
        { pattern: /use\s+flash/i, model: 'gemini-2.5-flash-preview-05-20' },
        { pattern: /use\s+pro/i, model: 'gemini-2.5-pro-preview-06-05' }
      ];

      for (const { pattern, model } of modelPatterns) {
        if (pattern.test(this.commentBody)) {
          console.log(`🎯 コメントからモデルを検出: ${model}`);
          return model;
        }
      }
    }

    // 3. Issue ボディから指定を検索
    if (this.issueBody) {
      const modelPatterns = [
        { pattern: /@gemini-flash/i, model: 'gemini-2.5-flash-preview-05-20' },
        { pattern: /@gemini-pro/i, model: 'gemini-2.5-pro-preview-06-05' },
        { pattern: /model:\s*flash/i, model: 'gemini-2.5-flash-preview-05-20' },
        { pattern: /model:\s*pro/i, model: 'gemini-2.5-pro-preview-06-05' }
      ];

      for (const { pattern, model } of modelPatterns) {
        if (pattern.test(this.issueBody)) {
          console.log(`🎯 Issue本文からモデルを検出: ${model}`);
          return model;
        }
      }
    }

    // 4. デフォルトモデル (gemini-2.5-pro-preview-06-05)
    const defaultModel = 'gemini-2.5-pro-preview-06-05';
    console.log('📌 デフォルトモデルを使用:', defaultModel);
    return defaultModel;
  }

  /**
   * 詳細な診断情報をログ出力
   */
  logDiagnosticInfo() {
    console.log('\n🔍 === API KEY診断情報 ===');
    console.log(`選択されたAIプロバイダー: ${this.aiProvider}`);
    console.log(`GEMINI_API_KEY存在: ${this.geminiApiKey ? 'はい' : 'いいえ'}`);
    console.log(`OPENAI_API_KEY存在: ${this.openaiApiKey ? 'はい' : 'いいえ'}`);
    
    // セキュリティ上の理由により、APIキーの詳細な情報は表示しない
    if (this.geminiApiKey) {
      console.log(`GEMINI_API_KEY設定状況: 正常に設定済み`);
    }
    
    if (this.openaiApiKey) {
      console.log(`OPENAI_API_KEY設定状況: 正常に設定済み`);
    }

    console.log('\n🔍 === トリガー検出情報 ===');
    console.log(`Issue本文: "${this.issueBody}"`);
    console.log(`コメント本文: "${this.commentBody || 'なし'}"`);
    
    // トリガーパターンの詳細チェック
    if (this.issueBody) {
      const gptPatterns = [/@gpt/i, /use.*gpt/i, /openai/i];
      const geminiPatterns = [/@gemini/i, /use.*gemini/i];
      
      console.log('\nGPTトリガーマッチ:');
      gptPatterns.forEach(pattern => {
        const match = pattern.test(this.issueBody);
        console.log(`  ${pattern.source}: ${match ? 'マッチ' : 'なし'}`);
      });
      
      console.log('\nGeminiトリガーマッチ:');
      geminiPatterns.forEach(pattern => {
        const match = pattern.test(this.issueBody);
        console.log(`  ${pattern.source}: ${match ? 'マッチ' : 'なし'}`);
      });
    }
    
    console.log('\n🔍 === 環境変数情報 ===');
    console.log(`GITHUB_TOKEN存在: ${process.env.GITHUB_TOKEN ? 'はい' : 'いいえ'}`);
    console.log(`ISSUE_NUMBER: ${this.issueNumber}`);
    console.log(`実行モード: ${this.executionMode}`);
    
    // セキュアな環境変数デバッグ（APIキーの詳細は表示しない）
    console.log('\n🔧 === 環境変数デバッグ ===');
    console.log(`OPENAI_API_KEY環境変数: ${process.env.OPENAI_API_KEY ? '設定済み' : '未設定'}`);
    console.log(`GEMINI_API_KEY環境変数: ${process.env.GEMINI_API_KEY ? '設定済み' : '未設定'}`);
    console.log(`GITHUB_REPOSITORY: ${process.env.GITHUB_REPOSITORY || '未設定'}`);
    console.log(`GITHUB_ACTOR: ${process.env.GITHUB_ACTOR || '未設定'}`);
    console.log(`GITHUB_EVENT_NAME: ${process.env.GITHUB_EVENT_NAME || '未設定'}`);
    console.log(`GITHUB_REF: ${process.env.GITHUB_REF || '未設定'}`);
    
    // 追加の環境変数チェック（よくある名前のバリエーション）
    console.log('\n🔍 === API KEY環境変数パターンチェック ===');
    const openaiVariants = [
      'OPENAI_API_KEY',
      'OPENAI_KEY', 
      'OPENAI-API-KEY',
      'OPENAI_API_KEYS',
      'OPEN_AI_API_KEY',
      'OPENAIKEY'
    ];
    
    openaiVariants.forEach(variant => {
      const value = process.env[variant];
      console.log(`${variant}: ${value ? '設定済み' : '未設定'}`);
    });
    
    // action.ymlから来る可能性のある入力パラメータもチェック
    console.log('\n🔍 === INPUT環境変数チェック ===');
    console.log(`INPUT_OPENAI-API-KEY: ${process.env['INPUT_OPENAI-API-KEY'] ? '設定済み' : '未設定'}`);
    console.log(`INPUT_OPENAI_API_KEY: ${process.env['INPUT_OPENAI_API_KEY'] ? '設定済み' : '未設定'}`);
    console.log(`INPUT_GEMINI-API-KEY: ${process.env['INPUT_GEMINI-API-KEY'] ? '設定済み' : '未設定'}`);
    console.log(`INPUT_GEMINI_API_KEY: ${process.env['INPUT_GEMINI_API_KEY'] ? '設定済み' : '未設定'}`);
    
    console.log('=== 環境変数デバッグ終了 ===');
    
    console.log('=== 診断情報終了 ===\n');
  }

  /**
   * OpenAI API キーエラーの詳細情報を出力
   */
  throwDetailedOpenAIError() {
    const repository = process.env.GITHUB_REPOSITORY || 'unknown';
    const actor = process.env.GITHUB_ACTOR || 'unknown';
    
    const errorMessage = [
      '\n❌ === OpenAI API KEY エラー詳細 ===',
      '',
      '🎯 問題: @gpt トリガーが検出されましたが、OPENAI_API_KEY が設定されていません',
      '',
      '🔧 考えられる原因:',
      '1. Secretsが設定されていない',
      '2. フォークしたリポジトリでSecretsにアクセスできない',
      '3. ワークフローファイルでSecretsが正しく参照されていない',
      '',
      '📋 解決方法:',
      `1. リポジトリ "${repository}" の Settings → Secrets and variables → Actions に移動`,
      '2. "New repository secret" をクリック',
      '3. Name: OPENAI_API_KEY',
      '4. Secret: OpenAI APIキーを貼り付け',
      '',
      '🔗 OpenAI APIキー取得方法:',
      '   https://platform.openai.com/api-keys',
      '',
      '⚙️ フォークリポジトリの場合:',
      '   元のリポジトリではなく、フォーク先のリポジトリにSecretsを設定する必要があります',
      '',
      '🛠️ ワークフローファイル確認事項:',
      '   ワークフローで以下のように設定されているか確認:',
      '   openai-api-key: ${{ secrets.OPENAI_API_KEY }}',
      '',
      '⚙️ または、Geminiを使用したい場合:',
      '   Issue本文を "@gemini" に変更してください',
      '',
      `🔍 現在の実行環境:`,
      `   リポジトリ: ${repository}`,
      `   実行者: ${actor}`,
      `   Issue本文: "${this.issueBody}"`,
      `   コメント: "${this.commentBody || 'なし'}"`,
      '',
      '=== エラー詳細終了 ==='
    ].join('\n');
    
    console.error(errorMessage);
    throw new Error('OPENAI_API_KEY is required when using @gpt trigger. Please check the diagnostic information above.');
  }

  /**
   * Gemini API キーエラーの詳細情報を出力
   */
  throwDetailedGeminiError() {
    const errorMessage = [
      '\n❌ === Gemini API KEY エラー詳細 ===',
      '',
      '🎯 問題: Gemini AIプロバイダーが選択されましたが、GEMINI_API_KEY が設定されていません',
      '',
      '📋 解決方法:',
      '1. GitHub リポジトリの Settings → Secrets and variables → Actions に移動',
      '2. "New repository secret" をクリック',
      '3. Name: GEMINI_API_KEY',
      '4. Secret: Gemini APIキーを貼り付け',
      '',
      '🔗 Gemini APIキー取得方法:',
      '   https://ai.google.dev/',
      '',
      `🔍 現在の検出状況:`,
      `   AIプロバイダー: ${this.aiProvider}`,
      `   Issue本文: "${this.issueBody}"`,
      '',
      '=== エラー詳細終了 ==='
    ].join('\n');
    
    console.error(errorMessage);
    throw new Error('GEMINI_API_KEY is required when using Gemini. Please check the diagnostic information above.');
  }
}

module.exports = { ConfigManager };