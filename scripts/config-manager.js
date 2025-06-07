const { EnhancedIssueFetcher } = require('./enhanced-issue-fetcher');

class ConfigManager {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
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
      
      // 最新の@geminiコメントがあれば、それを優先
      if (this.completeIssueData.latestGeminiComment) {
        this.commentBody = this.completeIssueData.latestGeminiComment.body;
        console.log(`🎯 最新の@geminiコメントを検出: ${this.completeIssueData.latestGeminiComment.author}`);
      }
      
      // モデル選択を再実行（コメント情報が更新されたため）
      this.geminiModel = this.selectGeminiModel();
      
      console.log('✅ Issue情報の完全取得完了');
      console.log(`📋 Issue: "${this.issueTitle}"`);
      console.log(`💬 コメント: ${this.completeIssueData.totalComments}件`);
      console.log(`🎯 @geminiトリガー: ${this.completeIssueData.geminiTriggerComments.length}件`);
      
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
        latestRequest: this.completeIssueData.analysisContext.primaryRequest,
        comments: this.completeIssueData.comments,
        errorInfo: this.completeIssueData.analysisContext.errorInfo,
        technicalContext: this.completeIssueData.analysisContext.technicalContext
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
}

module.exports = { ConfigManager };