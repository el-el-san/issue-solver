/**
 * GitHub Action Entry Point
 * Wraps the enhanced-main.js for GitHub Actions execution
 */

const core = require('@actions/core');
const github = require('@actions/github');
const { enhancedMain } = require('./scripts/enhanced-main');

async function run() {
  try {
    // GitHub Actionsの入力を環境変数に設定
    const inputs = {
      issueNumber: core.getInput('issue-number'),
      geminiApiKey: core.getInput('gemini-api-key'),
      githubToken: core.getInput('github-token'),
      safetyMode: core.getInput('safety-mode') || 'normal',
      dryRun: core.getInput('dry-run') === 'true',
      geminiModel: core.getInput('gemini-model') || 'gemini-2.5-pro-preview-06-05',
      enableReview: core.getInput('enable-review') === 'true',
      runTests: core.getInput('run-tests') !== 'false',
      runLinter: core.getInput('run-linter') === 'true',
      strictMode: core.getInput('strict-mode') === 'true',
      targetFiles: core.getInput('target-files'),
      forceImplementation: core.getInput('force-implementation') === 'true'
    };

    // 必須パラメータの検証
    if (!inputs.issueNumber) {
      throw new Error('issue-number is required');
    }
    if (!inputs.geminiApiKey) {
      throw new Error('gemini-api-key is required');
    }

    // 環境変数を設定（既存のコードとの互換性のため）
    process.env.ISSUE_NUMBER = inputs.issueNumber;
    process.env.GEMINI_API_KEY = inputs.geminiApiKey;
    process.env.GITHUB_TOKEN = inputs.githubToken;
    process.env.SAFETY_MODE = inputs.safetyMode;
    process.env.DRY_RUN = inputs.dryRun.toString();
    process.env.GEMINI_MODEL = inputs.geminiModel;
    process.env.ENABLE_REVIEW = inputs.enableReview.toString();
    process.env.RUN_TESTS = inputs.runTests.toString();
    process.env.RUN_LINTER = inputs.runLinter.toString();
    process.env.STRICT_MODE = inputs.strictMode.toString();
    process.env.FORCE_IMPLEMENTATION_MODE = inputs.forceImplementation.toString();
    
    if (inputs.targetFiles) {
      process.env.TARGET_FILES = inputs.targetFiles;
    }

    // GitHub コンテキストを設定
    const octokit = github.getOctokit(inputs.githubToken);
    const context = github.context;

    // Issue番号をcontextに設定（existing codeとの互換性）
    if (!context.payload.issue) {
      context.payload.issue = { number: parseInt(inputs.issueNumber) };
    }

    console.log(`🚀 GitHub Action実行開始`);
    console.log(`Issue番号: ${inputs.issueNumber}`);
    console.log(`安全モード: ${inputs.safetyMode}`);
    console.log(`ドライラン: ${inputs.dryRun}`);
    console.log(`モデル: ${inputs.geminiModel}`);

    // メイン処理を実行
    const result = await enhancedMain(octokit, context);

    // 出力を設定
    if (result) {
      core.setOutput('success', result.success || false);
      core.setOutput('pr-number', result.prNumber || '');
      core.setOutput('pr-url', result.prUrl || '');
      core.setOutput('report-path', result.reportPath || '');
      core.setOutput('files-changed', result.filesChanged || 0);
      core.setOutput('confidence-score', result.confidenceScore || 0);

      if (result.success) {
        console.log('✅ Issue解決が完了しました');
        if (result.prUrl) {
          console.log(`📋 作成されたPR: ${result.prUrl}`);
        }
      } else {
        console.log('⚠️ Issue解決が部分的に完了しました');
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    core.setOutput('success', false);
    core.setFailed(error.message);
  }
}

// GitHub Actionsとして実行
if (require.main === module) {
  run();
}

module.exports = { run };