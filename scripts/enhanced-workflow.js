const { SafeFileManager } = require('./safe-file-manager');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class EnhancedWorkflow {
  constructor(config, solver) {
    this.config = config;
    this.solver = solver;
    this.fileManager = new SafeFileManager();
    this.checkpoints = [];
  }

  /**
   * 改善されたIssue解決ワークフロー
   */
  async execute() {
    console.log('🚀 Enhanced Issue Solver ワークフロー開始\n');
    
    try {
      // 1. 分析フェーズ
      await this.executePhase('analysis', async () => {
        await this.solver.analyzeIssue();
      });
      
      // 2. 計画フェーズ（AI解決策の生成）
      await this.executePhase('planning', async () => {
        await this.solver.generateSolution();
        
        // 解決策の妥当性チェック
        this.validateSolution(this.solver.solution);
      });
      
      // 3. レビューフェーズ（オプション）
      if (process.env.ENABLE_REVIEW === 'true') {
        await this.executePhase('review', async () => {
          await this.reviewSolution();
        });
      }
      
      // 4. 実装フェーズ（安全なファイル変更）
      await this.executePhase('implementation', async () => {
        await this.implementSolution();
      });
      
      // 5. 検証フェーズ（テストとリンター）
      await this.executePhase('verification', async () => {
        await this.verifySolution();
      });
      
      // 6. レポートフェーズ
      await this.executePhase('reporting', async () => {
        await this.generateReport();
      });
      
      console.log('\n✅ すべてのフェーズが正常に完了しました！');
      return { success: true, checkpoints: this.checkpoints };
      
    } catch (error) {
      console.error('\n❌ ワークフローエラー:', error.message);
      
      // エラー時の自動ロールバック
      await this.handleError(error);
      
      throw error;
    }
  }

  /**
   * フェーズを実行し、チェックポイントを作成
   */
  async executePhase(phaseName, phaseFunction) {
    console.log(`\n📊 ${phaseName.toUpperCase()}フェーズ開始...`);
    const startTime = Date.now();
    
    try {
      await phaseFunction();
      
      const checkpoint = {
        phase: phaseName,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'completed'
      };
      
      this.checkpoints.push(checkpoint);
      console.log(`✅ ${phaseName}フェーズ完了 (${checkpoint.duration}ms)`);
      
    } catch (error) {
      const checkpoint = {
        phase: phaseName,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
      
      this.checkpoints.push(checkpoint);
      throw new Error(`${phaseName}フェーズでエラー: ${error.message}`);
    }
  }

  /**
   * 解決策の妥当性をチェック
   */
  validateSolution(solution) {
    const issues = [];
    
    // ファイル操作の検証
    if (solution.files && solution.files.length > 0) {
      // 大量のファイル変更を警告
      if (solution.files.length > 50) {
        issues.push(`大量のファイル変更 (${solution.files.length}ファイル)`);
      }
      
      // システムファイルへの変更をチェック
      const systemFiles = solution.files.filter(f => 
        f.path.includes('node_modules') || 
        f.path.includes('.git') ||
        f.path.startsWith('/')
      );
      
      if (systemFiles.length > 0) {
        issues.push('システムファイルへの変更が含まれています');
      }
    }
    
    // 信頼度チェック（強制実装モードでない場合）
    if (solution.confidence === 'low' && !this.config.forceImplementation) {
      issues.push('AIの信頼度が低い');
    }
    
    if (issues.length > 0) {
      console.warn('⚠️  解決策の潜在的な問題:');
      issues.forEach(issue => console.warn(`   - ${issue}`));
      
      if (process.env.STRICT_MODE === 'true') {
        throw new Error('解決策の検証に失敗しました');
      }
    }
  }

  /**
   * 解決策のレビュー（人間による確認）
   */
  async reviewSolution() {
    console.log('\n👀 解決策のレビュー:');
    console.log('タイプ:', this.solver.solution.type);
    console.log('信頼度:', this.solver.solution.confidence);
    console.log('変更予定ファイル数:', this.solver.solution.files?.length || 0);
    
    // ドライランモードで変更内容を表示
    if (this.solver.solution.files) {
      await this.fileManager.safeExecute(this.solver.solution.files);
    }
    
    // インタラクティブモードの場合は確認を求める
    if (process.env.INTERACTIVE === 'true') {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('続行しますか？ (y/n): ', resolve);
      });
      
      readline.close();
      
      if (answer.toLowerCase() !== 'y') {
        throw new Error('ユーザーによってキャンセルされました');
      }
    }
  }

  /**
   * 解決策を実装
   */
  async implementSolution() {
    if (!this.solver.solution.files || this.solver.solution.files.length === 0) {
      console.log('ℹ️  ファイル変更はありません');
      return;
    }
    
    // 安全なファイルマネージャーを使用
    const results = await this.fileManager.safeExecute(this.solver.solution.files);
    
    console.log(`\n📝 ${results.length}個のファイル操作を完了しました`);
  }

  /**
   * 解決策を検証
   */
  async verifySolution() {
    const verificationSteps = [];
    
    // 1. 構文チェック（言語別）
    if (await this.hasJavaScriptFiles()) {
      verificationSteps.push(this.runJavaScriptChecks());
    }
    
    if (await this.hasPythonFiles()) {
      verificationSteps.push(this.runPythonChecks());
    }
    
    // 2. テストの実行
    if (this.config.runTests) {
      verificationSteps.push(this.runTests());
    }
    
    // 3. リンターの実行
    if (process.env.RUN_LINTER === 'true') {
      verificationSteps.push(this.runLinter());
    }
    
    // すべての検証を並列実行
    const results = await Promise.allSettled(verificationSteps);
    
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error('\n❌ 検証エラー:');
      failures.forEach(f => console.error(`   - ${f.reason}`));
      
      if (process.env.STRICT_VERIFICATION === 'true') {
        throw new Error('検証に失敗しました');
      }
    }
  }

  /**
   * JavaScriptファイルの存在チェック
   */
  async hasJavaScriptFiles() {
    try {
      const { stdout } = await execAsync('find . -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" | head -1');
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Pythonファイルの存在チェック
   */
  async hasPythonFiles() {
    try {
      const { stdout } = await execAsync('find . -name "*.py" | head -1');
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * JavaScript関連のチェック
   */
  async runJavaScriptChecks() {
    console.log('\n🔍 JavaScript構文チェック...');
    
    // package.jsonの存在確認
    try {
      await execAsync('test -f package.json');
      
      // ESLintが利用可能か確認
      try {
        await execAsync('npx eslint --version');
        const { stdout, stderr } = await execAsync('npx eslint . --max-warnings 0');
        console.log('✅ ESLintチェック完了');
      } catch (error) {
        console.warn('⚠️  ESLintチェックをスキップ（ESLintが設定されていません）');
      }
    } catch {
      console.log('ℹ️  Node.jsプロジェクトではありません');
    }
  }

  /**
   * Python関連のチェック
   */
  async runPythonChecks() {
    console.log('\n🔍 Python構文チェック...');
    
    try {
      // flake8が利用可能か確認
      await execAsync('flake8 --version');
      const { stdout, stderr } = await execAsync('flake8 .');
      console.log('✅ Flake8チェック完了');
    } catch (error) {
      console.warn('⚠️  Pythonチェックをスキップ');
    }
  }

  /**
   * テストを実行（リトライ機能付き）
   */
  async runTests() {
    console.log('\n🧪 テスト実行中...');
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.config.testMaxRetries; attempt++) {
      try {
        console.log(`テスト実行 (試行 ${attempt}/${this.config.testMaxRetries})...`);
        
        const { stdout, stderr } = await execAsync(this.config.testCommand, {
          timeout: 300000 // 5分のタイムアウト
        });
        
        console.log('✅ すべてのテストが成功しました');
        return { success: true, output: stdout };
        
      } catch (error) {
        lastError = error;
        console.error(`❌ テストが失敗しました (試行 ${attempt}/${this.config.testMaxRetries}):`, error.message);
        
        if (attempt < this.config.testMaxRetries) {
          console.log('\n🔄 テスト失敗のため、再度分析・実装を実行します...');
          
          // 再分析・再実装
          await this.executePhase('re-analysis', async () => {
            await this.solver.analyzeIssue();
          });
          
          await this.executePhase('re-planning', async () => {
            await this.solver.generateSolution();
            this.validateSolution(this.solver.solution);
          });
          
          await this.executePhase('re-implementation', async () => {
            await this.implementSolution();
          });
          
          console.log('\n🧪 再実装後のテストを実行します...');
        }
      }
    }
    
    throw new Error(`テストが${this.config.testMaxRetries}回失敗しました: ${lastError?.message}`);
  }

  /**
   * リンターを実行
   */
  async runLinter() {
    console.log('\n📏 リンター実行中...');
    
    const lintCommand = process.env.LINT_COMMAND || 'npm run lint';
    
    try {
      const { stdout } = await execAsync(lintCommand, {
        timeout: 60000 // 1分のタイムアウト
      });
      
      console.log('✅ リントチェック完了');
      return { success: true };
    } catch (error) {
      throw new Error(`リントエラー: ${error.message}`);
    }
  }

  /**
   * レポートを生成
   */
  async generateReport() {
    const report = {
      issueNumber: this.config.issueNumber,
      issueTitle: this.config.issueTitle,
      solution: {
        type: this.solver.solution.type,
        confidence: this.solver.solution.confidence,
        filesChanged: this.solver.solution.files?.length || 0
      },
      checkpoints: this.checkpoints,
      timestamp: new Date().toISOString()
    };
    
    // レポートファイルを生成
    if (this.config.generateReport) {
      const reportPath = `issue_${this.config.issueNumber}_report.json`;
      require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📋 レポート生成: ${reportPath}`);
    }
    
    return report;
  }

  /**
   * エラーハンドリング
   */
  async handleError(error) {
    console.error('\n🔧 エラー処理中...');
    
    // ファイル変更のロールバック
    try {
      await this.fileManager.rollback();
      console.log('✅ ファイル変更をロールバックしました');
    } catch (rollbackError) {
      console.error('❌ ロールバックに失敗:', rollbackError.message);
    }
    
    // エラーレポートの生成
    const errorReport = {
      issueNumber: this.config.issueNumber,
      error: error.message,
      stack: error.stack,
      checkpoints: this.checkpoints,
      timestamp: new Date().toISOString()
    };
    
    const errorPath = `error_${this.config.issueNumber}_${Date.now()}.json`;
    require('fs').writeFileSync(errorPath, JSON.stringify(errorReport, null, 2));
    console.log(`\n📋 エラーレポート: ${errorPath}`);
  }
}

module.exports = { EnhancedWorkflow };