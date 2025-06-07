async function getIssueInfo(github, context) {
  let issue;
  
  if (context.eventName === 'workflow_dispatch') {
    // 手動実行の場合、指定されたIssue番号から情報を取得
    const issueNumber = parseInt(context.payload.inputs.issue_number);
    const response = await github.rest.issues.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber
    });
    issue = response.data;
  } else {
    // 自動実行の場合、イベントから情報を取得
    issue = context.payload.issue;
  }
  
  console.log(`Processing Issue #${issue.number}: ${issue.title}`);
  
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body || '',
    labels: issue.labels.map(l => l.name).join(','),
    state: issue.state
  };
}

module.exports = { getIssueInfo };