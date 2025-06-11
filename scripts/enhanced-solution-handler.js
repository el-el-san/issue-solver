const fs = require('fs');
const { execSync } = require('child_process');
const { StatusCommentManager } = require('./status-comment-manager');

class EnhancedSolutionHandler {
  constructor(github, context, config) {
    this.github = github;
    this.context = context;
    this.config = config;
    this.statusManager = null;
  }

  /**
   * ソリューション処理のメインフロー
   */
  async handle(solution, report) {
    try {
      // ステータスマネージャーの初期化
      this.statusManager = new StatusCommentManager(this.github, this.context);
      
      // 既存のGeminiコメントを探すか、新しいコメントを作成
      const existingCommentId = await this.statusManager.findExistingGeminiComment(this.config.issueNumber);
      if (!existingCommentId) {
        await this.statusManager.createInitialComment(this.config.issueNumber);
      }

      // Gitリポジトリの初期化確認
      try {
        execSync('git rev-parse --git-dir', { encoding: 'utf8' });
      } catch (error) {
        console.log('📁 Gitリポジトリを初期化中...');
        execSync('git init', { encoding: 'utf8' });
        execSync('git config user.email "action@github.com"', { encoding: 'utf8' });
        execSync('git config user.name "GitHub Action"', { encoding: 'utf8' });
      }

      // 変更の確認
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
      
      if (!gitStatus.trim()) {
        console.log('No changes to commit');
        await this.completeWithoutChanges(report);
        return { hasChanges: false };
      }

      // 意味のあるファイルが存在するかチェック
      const meaningfulFiles = this.filterMeaningfulFiles(gitStatus);
      console.log(`🔍 Git status: ${gitStatus.trim()}`);
      console.log(`🔍 Meaningful files after filtering: ${meaningfulFiles.join(', ')}`);
      
      if (meaningfulFiles.length === 0) {
        console.log('No meaningful files to commit (only temporary/report files)');
        await this.completeWithoutChanges(report);
        return { hasChanges: false };
      }

      // DRY_RUNモードの場合はここで終了
      if (process.env.DRY_RUN === 'true') {
        console.log('🔍 DRY_RUN mode - skipping commit and PR creation');
        await this.statusManager.updateStatus('completed', {
          hasChanges: true,
          dryRun: true,
          report: report
        });
        return { hasChanges: true, dryRun: true };
      }

      // ブランチ作成とコミット
      const branchName = await this.createBranchAndCommit(report, meaningfulFiles);
      
      // Pull Request作成
      const pr = await this.createPullRequest(branchName, report);
      
      // 完了ステータスの更新（コメントも含む）
      await this.statusManager.updateStatus('completed', {
        hasChanges: true,
        prUrl: pr.data.html_url,
        report: report
      });

      return { 
        hasChanges: true, 
        prUrl: pr.data.html_url,
        branchName: branchName 
      };

    } catch (error) {
      console.error('Error in solution handler:', error);
      
      if (this.statusManager) {
        await this.statusManager.updateStatus('error', {
          error: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * 変更なしで完了
   */
  async completeWithoutChanges(report) {
    // 完了ステータスの更新（コメントも含む）
    await this.statusManager.updateStatus('completed', {
      hasChanges: false,
      report: report
    });
  }

  /**
   * ブランチ作成とコミット
   */
  async createBranchAndCommit(report, meaningfulFiles) {
    // Git設定確認・設定
    try {
      const userName = execSync('git config user.name', { encoding: 'utf8' }).trim();
      const userEmail = execSync('git config user.email', { encoding: 'utf8' }).trim();
      console.log(`✅ Git設定確認済み: ${userName} <${userEmail}>`);
    } catch (configError) {
      console.log('⚙️  GitHub Actions環境のため、Git設定を自動適用中...');
      execSync('git config user.email "gemini-bot@github-actions.local"');
      execSync('git config user.name "Gemini Issue Solver"');
      console.log('✅ Git設定完了: Gemini Issue Solver <gemini-bot@github-actions.local>');
    }

    // ブランチ作成
    const branchName = `gemini-issue-${report.issueNumber}-${Date.now()}`;
    execSync(`git checkout -b ${branchName}`);
    
    // ファイルを追加（既にフィルタリング済み）
    meaningfulFiles.forEach(file => {
      execSync(`git add "${file}"`);
    });

    // コミット
    const commitMessage = this.generateCommitMessage(report);
    execSync(`git commit -m "${commitMessage}"`);
    
    // プッシュ
    execSync(`git push origin ${branchName}`);

    return branchName;
  }

  /**
   * 意味のあるファイルをフィルタリング
   */
  filterMeaningfulFiles(gitStatus) {
    return gitStatus
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.slice(3))
      .filter(file => {
        if (!file || typeof file !== 'string') return false;
        return (
          // ソースコードとドキュメントファイル
          (file.match(/\.(md|txt|py|js|ts|jsx|tsx|html|css|scss|yml|yaml|sh|json)$/) ||
           file.includes('ISSUE_')) &&
          // 除外するファイル（package.jsonとpackage-lock.jsonは含める）
          !file.includes('issue_solution_report.json') &&
          !file.includes('issue_') &&  // レポートファイル除外
          !file.match(/error_report_\d+\.json$/) &&
          !file.match(/error_\d+_\d+\.json$/)
        );
      });
  }

  /**
   * コミットメッセージ生成
   */
  generateCommitMessage(report) {
    const issueTitle = report.issueTitle || report.analysis?.title || 'Issue';
    const truncatedTitle = issueTitle.substring(0, 50);
    return `fix: resolve issue #${report.issueNumber} - ${truncatedTitle}

Solution type: ${report.solution?.type || 'fix'}
Confidence: ${report.solution?.confidence || 'medium'}
Files changed: ${report.solution?.filesChanged || 0}

Generated by Gemini Issue Solver`;
  }

  /**
   * Pull Request作成
   */
  async createPullRequest(branchName, report) {
    const prBody = this.generatePRDescription(report);
    
    const pr = await this.github.rest.pulls.create({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      title: this.generatePRTitle(report),
      head: branchName,
      base: 'main',
      body: prBody
    });

    console.log('Pull request created:', pr.data.html_url);
    return pr;
  }

  /**
   * PRタイトル生成
   */
  generatePRTitle(report) {
    const issueTitle = report.issueTitle || report.analysis?.title || 'Issue';
    const truncatedTitle = issueTitle.substring(0, 50);
    return `Fix #${report.issueNumber}: ${truncatedTitle}`;
  }

  /**
   * PR説明文生成
   */
  generatePRDescription(report) {
    const solution = report.solution || {};
    
    return `# Gemini Issue 解決策

Issue #${report.issueNumber} に対して自動生成されたソリューション

## 📊 Issue 分析
**タイトル:** ${report.issueTitle || 'N/A'}
**タイプ:** ${solution.type || 'fix'}
**信頼度:** ${solution.confidence || 'medium'}

## 🔍 根本原因
${solution.root_cause || solution.analysis || '分析中'}

## 📝 実装計画
${solution.planning ? solution.planning.map((step, i) => `${i+1}. ${step}`).join('\n') : '計画の詳細は Issue レポートを参照'}

## 🔧 ソリューション
${solution.description || solution.analysis || '実装の詳細は変更ファイルを参照'}

## 📋 修正されたファイル
${(solution.files || []).map(f => `- ${f.action}: \`${f.path}\` ${f.changes ? `- ${f.changes}` : ''}`).join('\n') || 'ファイルの変更を参照'}

## 🧪 テスト推奨事項
${solution.tests || '手動検証を推奨'}

## ✅ 検証済み項目
${report.checkpoints ? report.checkpoints.filter(c => c.status === 'completed').map(c => `- ${c.phase}: ✅ (${c.duration}ms)`).join('\n') : '- 自動検証完了'}

---
Closes #${report.issueNumber}
*Gemini Issue Solver により自動生成*`;
  }
}

module.exports = { EnhancedSolutionHandler };