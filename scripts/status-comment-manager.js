class StatusCommentManager {
  constructor(github, context) {
    this.github = github;
    this.context = context;
    this.commentId = null;
    this.issueNumber = context.payload.issue?.number;
  }

  // 初期ステータスコメントを作成
  async createInitialComment(issueNumber = null) {
    const targetIssueNumber = issueNumber || this.issueNumber;
    if (!targetIssueNumber) {
      throw new Error('Issue number is required');
    }

    const initialBody = this.generateStatusComment('starting', {
      phase: 'initialization',
      message: 'Gemini AIによる Issue 分析を開始しています...'
    });

    try {
      const comment = await this.github.rest.issues.createComment({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: targetIssueNumber,
        body: initialBody
      });

      this.commentId = comment.data.id;
      console.log(`初期ステータスコメント作成: ${this.commentId}`);
      return this.commentId;
    } catch (error) {
      console.error('初期コメント作成エラー:', error);
      throw error;
    }
  }

  // 既存コメントを更新
  async updateStatus(status, data = {}) {
    if (!this.commentId) {
      console.warn('コメントIDが設定されていません。初期コメントを作成します。');
      try {
        await this.createInitialComment();
        if (!this.commentId) {
          console.error('初期コメント作成に失敗しました。更新をスキップします。');
          return;
        }
      } catch (error) {
        console.error('初期コメント作成エラー:', error);
        return;
      }
    }

    const body = this.generateStatusComment(status, data);

    try {
      await this.github.rest.issues.updateComment({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        comment_id: this.commentId,
        body: body
      });

      console.log(`ステータス更新: ${status}`);
    } catch (error) {
      console.error('コメント更新エラー:', error);
      // エラーが発生した場合は新しいコメントを作成してフォールバック
      await this.createFallbackComment(status, data, error);
    }
  }

  // フォールバック用の新しいコメント作成
  async createFallbackComment(status, data, originalError) {
    const body = this.generateStatusComment(status, data) + 
      `\n\n*注: 前のコメント更新に失敗したため、新しいコメントを作成しました。エラー: ${originalError.message}*`;

    try {
      const comment = await this.github.rest.issues.createComment({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.issueNumber,
        body: body
      });

      this.commentId = comment.data.id;
      console.log(`フォールバックコメント作成: ${this.commentId}`);
    } catch (fallbackError) {
      console.error('フォールバックコメント作成エラー:', fallbackError);
    }
  }

  // ステータスに応じたコメント内容を生成
  generateStatusComment(status, data = {}) {
    const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const spinner = '<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />';

    switch (status) {
      case 'starting':
        return `**Gemini AI 分析開始** ${spinner}

**フェーズ:** ${data.phase || '初期化'}
**ステータス:** ${data.message || '処理を開始しています...'}

**進捗:**
- [ ] Issue 分析
- [ ] 解決策計画
- [ ] コード実装
- [ ] レポート生成

*最終更新: ${timestamp}*`;

      case 'analyzing':
        return `**Gemini AI 分析中** ${spinner}

**フェーズ:** Issue 分析
**ステータス:** ${data.message || 'Issue内容とコードベースを分析しています...'}

**進捗:**
- [x] Issue 分析 (実行中)
- [ ] 解決策計画
- [ ] コード実装
- [ ] レポート生成

*最終更新: ${timestamp}*`;

      case 'planning':
        return `**Gemini AI 計画中** ${spinner}

**フェーズ:** 解決策計画
**ステータス:** ${data.message || '解決策を計画しています...'}

**進捗:**
- [x] Issue 分析
- [x] 解決策計画 (実行中)
- [ ] コード実装
- [ ] レポート生成

*最終更新: ${timestamp}*`;

      case 'implementing':
        return `**Gemini AI 実装中** ${spinner}

**フェーズ:** コード実装
**ステータス:** ${data.message || '解決策を実装しています...'}

**進捗:**
- [x] Issue 分析
- [x] 解決策計画
- [x] コード実装 (実行中)
- [ ] テスト実行
- [ ] レポート生成

*最終更新: ${timestamp}*`;

      case 'testing':
        return `**Gemini AI テスト中** ${spinner}

**フェーズ:** テスト実行
**ステータス:** ${data.message || 'テストを実行しています...'}

**進捗:**
- [x] Issue 分析
- [x] 解決策計画
- [x] コード実装
- [x] テスト実行 (実行中)
- [ ] レポート生成

*最終更新: ${timestamp}*`;

      case 'retrying':
        return `**Gemini AI 再試行中** ${spinner}

**フェーズ:** テスト失敗による再試行
**ステータス:** ${data.message || 'テスト失敗のため再実装しています...'}
**試行回数:** ${data.testAttempt || 1}

**進捗:**
- [x] Issue 分析
- [x] 解決策計画
- [x] コード実装
- [ ] テスト実行 (再試行中)
- [ ] レポート生成

*最終更新: ${timestamp}*`;

      case 'reporting':
        return `**Gemini AI レポート生成中** ${spinner}

**フェーズ:** レポート生成
**ステータス:** ${data.message || '実装結果のレポートを生成しています...'}

**進捗:**
- [x] Issue 分析
- [x] 解決策計画
- [x] コード実装
- [x] テスト実行
- [x] レポート生成 (実行中)

*最終更新: ${timestamp}*`;

      case 'completed':
        return this.generateCompletedComment(data, timestamp);

      case 'error':
        return `**❌ 分析失敗**

エラーが発生しました: ${data.error || '不明なエラー'}

以下を試すことができます：
- \`@gemini\` で分析を再実行
- より具体的なエラー詳細を提供
- \`gemini-auto\` ラベルを追加して自動分析をトリガー

*最終更新: ${timestamp}*`;

      default:
        return `**Gemini AI 処理中** ${spinner}

**ステータス:** ${data.message || '処理中...'}

*最終更新: ${timestamp}*`;
    }
  }

  // 完了時のコメント内容を生成
  generateCompletedComment(data, timestamp) {
    const { hasChanges, prUrl, report } = data;

    if (hasChanges && prUrl) {
      return `**Gemini AI 分析完了**

Issue を分析し、解決策を作成しました！

**📊 解決策サマリー:**
- **タイプ:** ${report?.solution?.type || 'fix'}
- **信頼度:** ${report?.solution?.confidence || 'medium'}
- **影響ファイル数:** ${report?.solution?.files ? report.solution.files.length : 0}

**🔍 根本原因:** ${report?.solution?.root_cause || 'PR内の分析を参照'}

**📝 実装計画:**
${report?.solution?.planning ? report.solution.planning.map((step, i) => `${i+1}. ${step}`).join('\n') : '1. PR内の変更を確認\n2. 提案された解決策をテスト\n3. 問題が解決された場合はマージ'}

**✅ 次のステップ:**
1. [作成したプルリクエスト](${prUrl})を確認
2. 提案された解決策をテスト
3. 修正が正しく動作する場合はマージ

**進捗:**
- [x] Issue 分析
- [x] 解決策計画
- [x] コード実装
- [x] テスト実行
- [x] レポート生成

*この解決策で Issue が完全に解決されない場合、詳細情報を追加するか \`@gemini\` で追加のコンテキストを提供してください。*

*最終更新: ${timestamp}*`;
    } else {
      return `**Gemini AI 分析完了**

Issue を分析しましたが、コードの変更は生成されませんでした。

**📊 分析結果:**
- **Issue タイプ:** ${report?.solution?.type || 'analysis'}
- **信頼度:** ${report?.solution?.confidence || 'medium'}

**💡 推奨事項:**
${report?.solution?.description || '期待される動作、再現手順、エラーメッセージについてより具体的な詳細を提供してください。'}

**進捗:**
- [x] Issue 分析
- [x] 解決策計画
- [x] コード実装
- [x] テスト実行
- [x] レポート生成

*追加のコンテキストで \`@gemini\` にコメントして、より対象を絞った分析を試すことができます。*

*最終更新: ${timestamp}*`;
    }
  }

  // 既存のGeminiコメントを検索して再利用
  async findExistingGeminiComment(issueNumber) {
    try {
      const comments = await this.github.rest.issues.listComments({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: issueNumber
      });

      // 最新のGeminiコメントを検索 (「Gemini AI」で始まるコメント)
      const geminiComments = comments.data
        .filter(comment => comment.body.includes('Gemini AI'))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (geminiComments.length > 0) {
        this.commentId = geminiComments[0].id;
        console.log(`既存のGeminiコメントを発見: ${this.commentId}`);
        return this.commentId;
      }

      return null;
    } catch (error) {
      console.error('既存コメント検索エラー:', error);
      return null;
    }
  }
}

module.exports = { StatusCommentManager };