/**
 * Enhanced Main Entry Point for GitHub Actions
 * Integrates safety features with existing workflow
 */

const { EnhancedWorkflow } = require('./enhanced-workflow');
const { ConfigManager } = require('./config-manager');
const { GeminiIssueSolver } = require('./gemini-solver');
const { OpenAIIssueSolver } = require('./openai-solver');
const { StatusCommentManager } = require('./status-comment-manager');
const { EnhancedSolutionHandler } = require('./enhanced-solution-handler');
const { ReportGenerator } = require('./report-generator');

/**
 * GitHub Actions対応のメイン関数
 */
async function enhancedMain(github, context) {
  let config;
  let statusManager;
  
  try {
    console.log('🚀 Enhanced Gemini Issue Solver 開始');
    console.log(`実行モード: ${process.env.EXECUTION_MODE || 'enhanced'}`);
    console.log(`安全モード: ${process.env.DRY_RUN === 'true' ? 'DRY_RUN' : 'LIVE'}`);
    
    // 設定を初期化
    config = new ConfigManager();
    await config.validate();
    
    // フォールバック後のプロバイダーを確認
    console.log(`📌 最終的なAIプロバイダー: ${config.aiProvider}`);
    
    // GitHub APIからIssueの完全な情報を取得
    await config.loadCompleteIssueData(github, context);
    
    // ステータスコメントマネージャーを初期化
    statusManager = new StatusCommentManager(github, context);
    
    // 初期ステータスコメントを作成
    await statusManager.createInitialComment();
    await statusManager.updateStatus('starting', {
      mode: process.env.EXECUTION_MODE || 'enhanced',
      safety: process.env.DRY_RUN === 'true' ? 'dry-run' : 'live',
      provider: config.aiProvider,
      model: config.aiProvider === 'openai' ? config.openaiModel : config.geminiModel
    });
    
    // AIプロバイダーに応じてsolverを初期化
    let solver;
    if (config.aiProvider === 'openai') {
      console.log('🤖 OpenAI GPTを使用してIssueを解決します');
      solver = new OpenAIIssueSolver(config.openaiApiKey, config);
    } else {
      console.log('🤖 Google Geminiを使用してIssueを解決します');
      solver = new GeminiIssueSolver(config.geminiApiKey, config);
    }
    
    // Enhanced workflowを実行
    const workflow = new EnhancedWorkflow(config, solver);
    
    // ワークフローの実行
    await statusManager.updateStatus('executing');
    const result = await workflow.execute();
    
    // レポート生成
    const reportGenerator = new ReportGenerator(solver, config);
    await reportGenerator.generateReport();
    
    // ソリューションハンドラーでPR作成とコメント投稿
    const solutionHandler = new EnhancedSolutionHandler(github, context, config);
    const solutionResult = await solutionHandler.handle(solver.solution, {
      issueNumber: config.issueNumber,
      issueTitle: config.issueTitle,
      solution: solver.solution,
      checkpoints: result.checkpoints,
      analysis: solver.issueAnalysis
    });
    
    console.log('✅ Enhanced workflow completed successfully');
    return { ...result, ...solutionResult };
    
  } catch (error) {
    console.error('❌ Enhanced workflow failed:', error.message);
    
    // エラー時のステータス更新
    if (statusManager) {
      await statusManager.updateStatus('error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // GitHub Actionsの場合は詳細なエラー情報を出力
    if (process.env.GITHUB_ACTIONS) {
      console.log('::error::Enhanced workflow failed: ' + error.message);
      
      // エラーの詳細をアノテーションとして追加
      if (error.stack) {
        console.log('::debug::' + error.stack);
      }
    }
    
    throw error;
  }
}

/**
 * 後方互換性のためのレガシーメイン関数
 * 既存のmain.jsと同じインターフェース
 */
async function legacyMain(github, context) {
  console.log('🔄 Legacy mode - using original workflow');
  
  // 既存のmain.jsをインポートして実行
  const { main: originalMain } = require('./main');
  return await originalMain(github, context);
}

/**
 * 統合されたメイン関数
 * 環境変数に応じてenhanced/legacyモードを選択
 */
async function main(github, context) {
  const executionMode = process.env.EXECUTION_MODE;
  
  // Enhanced modeが明示的に指定された場合
  if (executionMode === 'enhanced') {
    return await enhancedMain(github, context);
  }
  
  // Legacy modeが指定された場合
  if (executionMode === 'legacy') {
    return await legacyMain(github, context);
  }
  
  // デフォルト: 安全性を考慮してenhanced modeを使用
  // ただし、ENABLE_ENHANCED=falseの場合はlegacy mode
  if (process.env.ENABLE_ENHANCED === 'false') {
    console.log('🔄 Enhanced mode disabled, using legacy workflow');
    return await legacyMain(github, context);
  }
  
  return await enhancedMain(github, context);
}

module.exports = { 
  main, 
  enhancedMain, 
  legacyMain 
};