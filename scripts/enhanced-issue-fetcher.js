/**
 * Enhanced Issue Information Fetcher
 * GitHub APIからIssue情報（本文 + 全コメント）を完全に取得
 */

class EnhancedIssueFetcher {
  constructor(github, context) {
    this.github = github;
    this.context = context;
  }

  /**
   * Issue情報とすべてのコメントを取得
   */
  async fetchCompleteIssueData(issueNumber) {
    try {
      console.log(`🔍 Issue #${issueNumber} の完全な情報を取得中...`);

      // 1. Issue本体の情報を取得
      const issueResponse = await this.github.rest.issues.get({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: issueNumber
      });

      const issue = issueResponse.data;
      console.log(`📋 Issue本体を取得: "${issue.title}"`);

      // 2. すべてのコメントを取得（ページネーション対応）
      const comments = await this.getAllComments(issueNumber);
      console.log(`💬 コメント ${comments.length}件を取得`);

      // 3. @geminiトリガーコメントを特定
      const geminiTriggerComments = this.findGeminiTriggerComments(comments);
      console.log(`🎯 @geminiトリガーコメント ${geminiTriggerComments.length}件を発見`);

      // 4. 最新の@geminiコメントを特定
      const latestGeminiComment = geminiTriggerComments.length > 0 
        ? geminiTriggerComments[geminiTriggerComments.length - 1]
        : null;

      // 5. 完全なIssue情報を構築
      const completeIssueData = {
        // 基本情報
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state,
        labels: issue.labels.map(l => l.name),
        author: issue.user.login,
        created_at: issue.created_at,
        updated_at: issue.updated_at,

        // コメント情報
        comments: comments,
        totalComments: comments.length,
        
        // @gemini関連
        geminiTriggerComments: geminiTriggerComments,
        latestGeminiComment: latestGeminiComment,
        hasGeminiTrigger: geminiTriggerComments.length > 0,

        // 分析用の統合テキスト
        fullContent: this.buildFullContent(issue, comments, latestGeminiComment),
        analysisContext: this.buildAnalysisContext(issue, comments, latestGeminiComment)
      };

      console.log(`✅ Issue情報の取得完了`);
      console.log(`   - 本文長さ: ${issue.body?.length || 0}文字`);
      console.log(`   - コメント数: ${comments.length}件`);
      console.log(`   - @geminiトリガー: ${geminiTriggerComments.length}件`);
      
      return completeIssueData;

    } catch (error) {
      console.error(`❌ Issue情報取得エラー:`, error.message);
      throw new Error(`Failed to fetch complete issue data: ${error.message}`);
    }
  }

  /**
   * すべてのコメントを取得（ページネーション対応）
   */
  async getAllComments(issueNumber) {
    const allComments = [];
    let page = 1;
    const perPage = 100; // GitHub APIの最大値

    while (true) {
      try {
        const response = await this.github.rest.issues.listComments({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          issue_number: issueNumber,
          page: page,
          per_page: perPage,
          sort: 'created', // 作成日時順
          direction: 'asc' // 昇順（古い順）
        });

        const comments = response.data;
        console.log(`📄 ページ ${page}: ${comments.length}件のコメントを取得`);

        if (comments.length === 0) {
          break; // 最後のページに到達
        }

        allComments.push(...comments);
        
        // 次のページがあるかチェック
        if (comments.length < perPage) {
          break; // これが最後のページ
        }

        page++;
      } catch (error) {
        console.error(`コメント取得エラー (ページ ${page}):`, error.message);
        break;
      }
    }

    return allComments;
  }

  /**
   * @geminiトリガーコメントを検索
   */
  findGeminiTriggerComments(comments) {
    const geminiTriggerPatterns = [
      /@gemini/i,
      /@ai/i,
      /gemini/i,
      /solve this/i,
      /fix this/i,
      /help with this/i
    ];

    return comments.filter(comment => {
      const body = comment.body || '';
      return geminiTriggerPatterns.some(pattern => pattern.test(body));
    }).map(comment => ({
      id: comment.id,
      author: comment.user.login,
      body: comment.body,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      html_url: comment.html_url
    }));
  }

  /**
   * 分析用の完全なコンテンツを構築
   */
  buildFullContent(issue, comments, latestGeminiComment) {
    let content = '';

    // Issue本文
    content += `# Issue: ${issue.title}\n\n`;
    content += `## Description\n${issue.body || 'No description provided.'}\n\n`;

    // ラベル情報
    if (issue.labels && issue.labels.length > 0) {
      content += `## Labels\n${issue.labels.map(l => l.name).join(', ')}\n\n`;
    }

    // 最新の@geminiコメントを優先表示
    if (latestGeminiComment) {
      content += `## Latest @gemini Request (${latestGeminiComment.created_at})\n`;
      content += `Author: ${latestGeminiComment.author}\n`;
      content += `${latestGeminiComment.body}\n\n`;
    }

    // 全コメント履歴（最新10件のみ、長さ制限付き）
    const recentComments = comments.slice(-10);
    if (recentComments.length > 0) {
      content += `## Recent Comments\n`;
      recentComments.forEach((comment, index) => {
        const body = comment.body.length > 500 
          ? comment.body.substring(0, 500) + '...'
          : comment.body;
        content += `### Comment ${index + 1} (${comment.user.login})\n${body}\n\n`;
      });
    }

    return content;
  }

  /**
   * AI分析用のコンテキストを構築
   */
  buildAnalysisContext(issue, comments, latestGeminiComment) {
    return {
      // 基本情報
      issueTitle: issue.title,
      issueBody: issue.body || '',
      
      // 最重要：最新の@geminiコメント
      primaryRequest: latestGeminiComment ? latestGeminiComment.body : issue.body,
      requestAuthor: latestGeminiComment ? latestGeminiComment.author : issue.user.login,
      requestDate: latestGeminiComment ? latestGeminiComment.created_at : issue.created_at,
      
      // 追加のコンテキスト
      labels: issue.labels.map(l => l.name),
      commentCount: comments.length,
      hasMultipleRequests: comments.filter(c => 
        c.body && (c.body.includes('@gemini') || c.body.includes('@ai'))
      ).length > 1,
      
      // エラー情報（全コメントから抽出）
      errorInfo: this.extractErrorsFromAllContent([issue.body, ...comments.map(c => c.body)]),
      
      // 議論の流れ
      conversationFlow: this.summarizeConversationFlow(comments),
      
      // 技術的なコンテキスト
      technicalContext: this.extractTechnicalContext([issue.body, ...comments.map(c => c.body)])
    };
  }

  /**
   * 全コンテンツからエラー情報を抽出
   */
  extractErrorsFromAllContent(contents) {
    const errorPatterns = [
      /Error: .+/gi,
      /Exception: .+/gi,
      /TypeError: .+/gi,
      /ReferenceError: .+/gi,
      /SyntaxError: .+/gi,
      /\w+Error: .+/gi,
      /Failed to .+/gi,
      /Cannot .+/gi
    ];

    const errors = [];
    contents.forEach(content => {
      if (!content) return;
      errorPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          errors.push(...matches);
        }
      });
    });

    return [...new Set(errors)]; // 重複除去
  }

  /**
   * 会話の流れを要約
   */
  summarizeConversationFlow(comments) {
    if (comments.length === 0) return 'No conversation';
    
    const flow = [];
    comments.forEach((comment, index) => {
      const isGeminiTrigger = /@gemini|@ai|gemini/i.test(comment.body);
      flow.push({
        index: index + 1,
        author: comment.user.login,
        isGeminiTrigger,
        summary: comment.body.substring(0, 100) + (comment.body.length > 100 ? '...' : ''),
        timestamp: comment.created_at
      });
    });

    return flow;
  }

  /**
   * 技術的コンテキストを抽出
   */
  extractTechnicalContext(contents) {
    const allText = contents.join(' ').toLowerCase();
    
    const technologies = [];
    const techPatterns = {
      'JavaScript': /\bjavascript\b|\bjs\b|\.js\b/,
      'TypeScript': /\btypescript\b|\bts\b|\.ts\b/,
      'Python': /\bpython\b|\.py\b/,
      'React': /\breact\b/,
      'Node.js': /\bnode\.?js\b|\bnpm\b/,
      'Vue': /\bvue\.?js\b|\bvue\b/,
      'Angular': /\bangular\b/,
      'HTML': /\bhtml\b|\.html\b/,
      'CSS': /\bcss\b|\.css\b/
    };

    Object.entries(techPatterns).forEach(([tech, pattern]) => {
      if (pattern.test(allText)) {
        technologies.push(tech);
      }
    });

    return {
      technologies,
      hasCodeBlocks: /```/.test(contents.join('')),
      hasStackTrace: /\s+at\s+/.test(contents.join('')),
      hasFileReferences: /\.[a-z]{2,4}\b/.test(contents.join(''))
    };
  }
}

module.exports = { EnhancedIssueFetcher };