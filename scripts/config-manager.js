class ConfigManager {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.githubToken = process.env.GITHUB_TOKEN;
    this.issueTitle = process.env.ISSUE_TITLE;
    this.issueBody = process.env.ISSUE_BODY;
    this.issueNumber = process.env.ISSUE_NUMBER;
    this.issueLabels = process.env.ISSUE_LABELS;
    this.commentBody = process.env.COMMENT_BODY;
    // モデル選択ロジック
    this.geminiModel = this.selectGeminiModel();
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
  }

  async validate() {
    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    
    if (!this.issueNumber) {
      throw new Error('ISSUE_NUMBER is required');
    }
    
    console.log('✅ Configuration validated');
    console.log('実行モード:', this.executionMode);
    console.log('使用モデル:', this.geminiModel);
  }

  getTargetFiles() {
    return this.targetFiles ? this.targetFiles.split(',').map(f => f.trim()) : [];
  }

  selectGeminiModel() {
    // 1. 環境変数から明示的に指定されている場合
    if (process.env.GEMINI_MODEL) {
      console.log('🤖 環境変数からモデルを使用:', process.env.GEMINI_MODEL);
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
}

module.exports = { ConfigManager };