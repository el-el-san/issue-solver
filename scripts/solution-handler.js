const fs = require('fs');
const { StatusCommentManager } = require('./status-comment-manager');

async function handleSolution(github, context, core) {
  let statusManager = null;
  
  try {
    // ステータスマネージャーの初期化
    statusManager = global.statusManager || new StatusCommentManager(github, context);
    
    // statusManagerがglobalから取得されていない場合、既存コメントを探す
    if (!global.statusManager) {
      const existingCommentId = await statusManager.findExistingGeminiComment(context.payload.issue?.number);
      if (!existingCommentId) {
        console.log('コメントIDが設定されていません。初期コメントを作成します。');
        await statusManager.createInitialComment(context.payload.issue?.number);
      }
    }
    
    // ソリューションレポートの確認
    if (!fs.existsSync('issue_solution_report.json')) {
      console.log('No solution report found');
      return;
    }

    const report = JSON.parse(fs.readFileSync('issue_solution_report.json', 'utf8'));
    
    // 変更の確認
    const { execSync } = require('child_process');
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    
    if (!gitStatus.trim()) {
      console.log('No changes to commit');
      if (statusManager) {
        await statusManager.updateStatus('completed', {
          hasChanges: false,
          prUrl: null,
          report: report
        });
      }
      return;
    }

    // Git設定確認とコミット前の設定
    try {
      execSync('git config user.name', { encoding: 'utf8' });
      execSync('git config user.email', { encoding: 'utf8' });
    } catch (configError) {
      console.log('Git設定が見つからないため、デフォルト設定を適用');
      execSync('git config user.email "action@github.com"');
      execSync('git config user.name "GitHub Action"');
    }

    // ブランチ作成とコミット
    const branchName = `gemini-issue-${report.issueNumber}-${Date.now()}`;
    execSync(`git checkout -b ${branchName}`);
    
    // 意味のあるファイルのみをコミット (package.json、レポートファイルは除外)
    const meaningfulFiles = gitStatus
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.slice(3))
      .filter(file => 
        (file.match(/\.(md|txt|py|js|ts|html|css|yml|yaml|sh)$/) ||
         file.includes('ISSUE_')) &&
        !file.includes('package.json') &&
        !file.includes('package-lock.json') &&
        !file.includes('issue_solution_report.json') &&
        !file.match(/error_report_\d+\.json$/)
      );

    if (meaningfulFiles.length === 0) {
      console.log('No meaningful files to commit');
      if (statusManager) {
        await statusManager.updateStatus('completed', {
          hasChanges: false,
          prUrl: null,
          report: report
        });
      }
      return;
    }

    // ファイルを追加してコミット
    meaningfulFiles.forEach(file => {
      execSync(`git add "${file}"`);
    });

    const commitMessage = `fix: resolve issue #${report.issueNumber} - ${report.analysis.title.substring(0, 50)}`;
    execSync(`git commit -m "${commitMessage}"`);
    execSync(`git push origin ${branchName}`);

    // Pull Request作成
    const prBody = generatePRDescription(report);
    const pr = await github.rest.pulls.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: `Fix #${report.issueNumber}: ${report.analysis.title.substring(0, 50)}`,
      head: branchName,
      base: 'main',
      body: prBody
    });

    console.log('Pull request created:', pr.data.html_url);
    if (statusManager) {
      await statusManager.updateStatus('completed', {
        hasChanges: true,
        prUrl: pr.data.html_url,
        report: report
      });
    }

  } catch (error) {
    console.error('Error handling solution:', error);
    if (statusManager) {
      await statusManager.updateStatus('error', {
        error: error.message
      });
    } else {
      // フォールバック: 従来のエラーコメント
      await postErrorComment(github, context, error);
    }
  }
}

function generatePRDescription(report) {
  return `# 🤖 Gemini Issue 解決策

Issue #${report.issueNumber} に対して自動生成されたソリューション

## 📊 Issue 分析
**タイトル:** ${report.analysis.title}
**タイプ:** ${report.solution.type || 'fix'}
**信頼度:** ${report.solution.confidence || 'medium'}

## 🔍 根本原因
${report.solution.root_cause || '分析中'}

## 📝 実装計画
${report.solution.planning ? report.solution.planning.map((step, i) => `${i+1}. ${step}`).join('\n') : '計画の詳細は Issue レポートを参照'}

## 🔧 ソリューション
${report.solution.analysis || report.solution.description}

## 📋 修正されたファイル
${(report.solution.files || []).map(f => `- ${f.action}: \`${f.path}\` - ${f.changes}`).join('\n')}

## 🧪 テスト推奨事項
${report.solution.tests || '手動検証を推奨'}

## 📄 実装レポート
${report.solution.report || '実装が正常に完了しました。'}

---
Closes #${report.issueNumber}
*Gemini Issue Solver により自動生成*`;
}

// 非推奨: StatusCommentManagerを使用してください
async function postIssueComment(github, context, report, hasChanges, prUrl = null) {
  let commentBody = '**🤖 Gemini AI 分析完了**\n\n';
  
  if (hasChanges && prUrl) {
    commentBody += `Issue を分析し、解決策を作成しました！

**📊 解決策サマリー:**
- **タイプ:** ${report.solution.type || 'fix'}
- **信頼度:** ${report.solution.confidence || 'medium'}
- **影響ファイル数:** ${report.solution.files ? report.solution.files.length : 0}

**🔍 根本原因:** ${report.solution.root_cause || 'PR内の分析を参照'}

**📝 実装計画:**
${report.solution.planning ? report.solution.planning.map((step, i) => `${i+1}. ${step}`).join('\n') : '1. PR内の変更を確認\n2. 提案された解決策をテスト\n3. 問題が解決された場合はマージ'}

**✅ 次のステップ:**
1. [作成したプルリクエスト](${prUrl})を確認
2. 提案された解決策をテスト
3. 修正が正しく動作する場合はマージ

*この解決策で Issue が完全に解決されない場合、詳細情報を追加するか \`@gemini\` で追加のコンテキストを提供してください。*`;
  } else {
    commentBody += `Issue を分析しましたが、コードの変更は生成されませんでした。

**📊 分析結果:**
- **Issue タイプ:** ${report.solution.type || 'analysis'}
- **信頼度:** ${report.solution.confidence || 'medium'}

**💡 推奨事項:**
${report.solution.description || '期待される動作、再現手順、エラーメッセージについてより具体的な詳細を提供してください。'}

*追加のコンテキストで \`@gemini\` にコメントして、より対象を絞った分析を試すことができます。*`;
  }

  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: report.issueNumber,
    body: commentBody
  });
}

// 非推奨: StatusCommentManagerを使用してください  
async function postErrorComment(github, context, error) {
  const commentBody = `**❌ 分析失敗**

この問題の分析中に Issue が発生しました: ${error.message}

以下を試すことができます：
- \`@gemini\` で分析を再実行
- より具体的なエラー詳細を提供
- \`gemini-auto\` ラベルを追加して自動分析をトリガー`;

  try {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.issue.number,
      body: commentBody
    });
  } catch (commentError) {
    console.error('Failed to post error comment:', commentError);
  }
}

module.exports = { handleSolution };