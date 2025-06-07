const { GeminiIssueSolver } = require('./gemini-solver');
const { ConfigManager } = require('./config-manager');
const { ReportGenerator } = require('./report-generator');
const { StatusCommentManager } = require('./status-comment-manager');
const { execSync } = require('child_process');

async function main(github = null, context = null) {
  let statusManager = null;
  
  try {
    console.log('🚀 Gemini Issue Solver 開始');
    
    // 設定の初期化
    const config = new ConfigManager();
    await config.validate();
    
    console.log('Issue #' + config.issueNumber + ':', config.issueTitle);
    console.log('='.repeat(60));
    
    // ステータスコメントマネージャーの初期化（github と context が利用可能な場合のみ）
    if (github && context) {
      statusManager = new StatusCommentManager(github, context);
      
      // 既存のGeminiコメントを探すか、新しいコメントを作成
      const existingCommentId = await statusManager.findExistingGeminiComment(config.issueNumber);
      if (!existingCommentId) {
        console.log('既存のGeminiコメントが見つかりません。初期コメントを作成します。');
        await statusManager.createInitialComment(config.issueNumber);
      } else {
        console.log(`既存のGeminiコメントを再利用: ${existingCommentId}`);
      }
      
      // 初期ステータス更新（開始状態に設定）
      await statusManager.updateStatus('starting', {
        phase: 'initialization',
        message: 'Gemini AIによる Issue 分析を開始しています...'
      });
    }
    
    // ソルバーの初期化
    const solver = new GeminiIssueSolver(config.geminiApiKey, config);
    
    // 分析フェーズ
    console.log('📊 分析フェーズ開始...');
    if (statusManager) {
      await statusManager.updateStatus('analyzing', {
        message: 'Issue内容とコードベースを分析しています...'
      });
    }
    await solver.analyzeIssue();
    
    // 計画フェーズ
    console.log('📝 計画フェーズ開始...');
    if (statusManager) {
      await statusManager.updateStatus('planning', {
        message: '分析結果をもとに解決策を計画しています...'
      });
    }
    await solver.generateSolution();
    
    // 修正フェーズ
    console.log('🔧 修正フェーズ開始...');
    if (statusManager) {
      await statusManager.updateStatus('implementing', {
        message: '計画に基づいてコードを実装しています...'
      });
    }
    await solver.implementSolution();
    
    // テストフェーズ（設定で有効な場合）
    if (config.runTests) {
      console.log('🧪 テストフェーズ開始...');
      if (statusManager) {
        await statusManager.updateStatus('testing', {
          message: 'テストを実行しています...'
        });
      }
      
      const testPassed = await runTestsWithRetry(config, solver, statusManager);
      
      if (!testPassed) {
        throw new Error('テストが失敗しました（最大リトライ回数に達しました）');
      }
    }
    
    // レポート生成
    console.log('📋 レポートフェーズ開始...');
    if (statusManager) {
      await statusManager.updateStatus('reporting', {
        message: '実装結果のレポートを生成しています...'
      });
    }
    const reportGenerator = new ReportGenerator(solver, config);
    await reportGenerator.generateReport();
    
    console.log('\n✅ Issue 解決完了！');
    console.log('ソリューションタイプ:', solver.solution.type || 'fix');
    console.log('信頼度:', solver.solution.confidence || 'medium');
    
    // ステータスマネージャーに完了を通知
    if (statusManager) {
      // ここでは一旦reporting状態を維持し、solution-handlerで最終完了状態に更新
      global.statusManager = statusManager;
    }
    
  } catch (error) {
    console.error('❌ Issue 解決に失敗:', error.message);
    console.error('エラー詳細:', error.stack);
    
    // ステータスマネージャーでエラーを報告
    if (statusManager) {
      await statusManager.updateStatus('error', {
        error: error.message
      });
    }
    
    // エラーレポートを作成
    const errorReporter = new ReportGenerator();
    await errorReporter.generateErrorReport(error);
    
    process.exit(1);
  }
}

async function runTestsWithRetry(config, solver, statusManager) {
  let testAttempt = 0;
  let lastError = null;
  
  while (testAttempt < config.testMaxRetries) {
    testAttempt++;
    console.log(`\n🧪 テスト実行中... (試行 ${testAttempt}/${config.testMaxRetries})`);
    
    try {
      // テストコマンドを実行
      execSync(config.testCommand, { 
        stdio: 'inherit',
        encoding: 'utf8'
      });
      
      console.log('✅ テストが成功しました！');
      return true;
      
    } catch (error) {
      lastError = error;
      console.error(`❌ テストが失敗しました (試行 ${testAttempt}/${config.testMaxRetries}):`, error.message);
      
      if (testAttempt < config.testMaxRetries) {
        console.log('\n🔄 テスト失敗のため、再度プラン・実装・テストのサイクルを実行します...');
        
        if (statusManager) {
          await statusManager.updateStatus('retrying', {
            message: `テスト失敗のため再試行中... (${testAttempt}/${config.testMaxRetries})`,
            testAttempt: testAttempt
          });
        }
        
        try {
          // 再度分析・計画・実装を実行
          console.log('\n📊 再分析フェーズ...');
          await solver.analyzeIssue();
          
          console.log('\n📝 再計画フェーズ...');
          await solver.generateSolution();
          
          console.log('\n🔧 再実装フェーズ...');
          await solver.implementSolution();
          
        } catch (retryError) {
          console.error('再試行中にエラーが発生:', retryError.message);
          lastError = retryError;
        }
      }
    }
  }
  
  // すべての試行が失敗
  console.error(`\n❌ テストが${config.testMaxRetries}回失敗しました`);
  return false;
}

if (require.main === module) {
  main();
}

module.exports = { main };