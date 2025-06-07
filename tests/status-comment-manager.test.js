const { StatusCommentManager } = require('../scripts/status-comment-manager');

describe('StatusCommentManager', () => {
  let mockGithub;
  let mockContext;
  let statusManager;

  beforeEach(() => {
    mockGithub = {
      rest: {
        issues: {
          createComment: jest.fn(),
          updateComment: jest.fn(),
          listComments: jest.fn()
        }
      }
    };

    mockContext = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo'
      },
      payload: {
        issue: {
          number: 123
        }
      }
    };

    statusManager = new StatusCommentManager(mockGithub, mockContext);
  });

  describe('createInitialComment', () => {
    it('初期コメントを作成する', async () => {
      const mockResponse = {
        data: { id: 456 }
      };
      mockGithub.rest.issues.createComment.mockResolvedValue(mockResponse);

      const commentId = await statusManager.createInitialComment();

      expect(commentId).toBe(456);
      expect(statusManager.commentId).toBe(456);
      expect(mockGithub.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('🤖 Gemini AI 分析開始')
      });
    });

    it('カスタムIssue番号で初期コメントを作成する', async () => {
      const mockResponse = {
        data: { id: 789 }
      };
      mockGithub.rest.issues.createComment.mockResolvedValue(mockResponse);

      const commentId = await statusManager.createInitialComment(999);

      expect(commentId).toBe(789);
      expect(mockGithub.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 999,
        body: expect.stringContaining('🤖 Gemini AI 分析開始')
      });
    });

    it('Issue番号が無い場合はエラーを投げる', async () => {
      statusManager.issueNumber = null;
      
      await expect(statusManager.createInitialComment()).rejects.toThrow('Issue number is required');
    });
  });

  describe('updateStatus', () => {
    beforeEach(() => {
      statusManager.commentId = 456;
    });

    it('ステータスを更新する', async () => {
      mockGithub.rest.issues.updateComment.mockResolvedValue({});

      await statusManager.updateStatus('analyzing', {
        message: 'テスト分析中...'
      });

      expect(mockGithub.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 456,
        body: expect.stringContaining('🤖 Gemini AI 分析中')
      });
    });

    it('コメントIDが無い場合は警告を出す', async () => {
      statusManager.commentId = null;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockGithub.rest.issues.createComment.mockResolvedValue({ data: { id: 999 } });
      mockGithub.rest.issues.updateComment.mockResolvedValue({});

      await statusManager.updateStatus('analyzing');

      expect(consoleSpy).toHaveBeenCalledWith('コメントIDが設定されていません。初期コメントを作成します。');
      expect(mockGithub.rest.issues.createComment).toHaveBeenCalled();
      expect(mockGithub.rest.issues.updateComment).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('更新エラー時にフォールバックコメントを作成する', async () => {
      const updateError = new Error('Update failed');
      mockGithub.rest.issues.updateComment.mockRejectedValue(updateError);
      mockGithub.rest.issues.createComment.mockResolvedValue({
        data: { id: 789 }
      });

      await statusManager.updateStatus('analyzing');

      expect(mockGithub.rest.issues.updateComment).toHaveBeenCalled();
      expect(mockGithub.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('前のコメント更新に失敗したため、新しいコメントを作成しました')
      });
      expect(statusManager.commentId).toBe(789);
    });
  });

  describe('findExistingGeminiComment', () => {
    it('既存のGeminiコメントを見つける', async () => {
      const mockComments = {
        data: [
          {
            id: 100,
            body: 'Regular comment',
            created_at: '2025-01-01T00:00:00Z'
          },
          {
            id: 200,
            body: '🤖 Gemini AI 分析開始',
            created_at: '2025-01-02T00:00:00Z'
          },
          {
            id: 300,
            body: '🤖 Gemini AI 分析完了',
            created_at: '2025-01-03T00:00:00Z'
          }
        ]
      };
      mockGithub.rest.issues.listComments.mockResolvedValue(mockComments);

      const commentId = await statusManager.findExistingGeminiComment(123);

      expect(commentId).toBe(300); // 最新のGeminiコメント
      expect(statusManager.commentId).toBe(300);
    });

    it('Geminiコメントが見つからない場合はnullを返す', async () => {
      const mockComments = {
        data: [
          {
            id: 100,
            body: 'Regular comment',
            created_at: '2025-01-01T00:00:00Z'
          }
        ]
      };
      mockGithub.rest.issues.listComments.mockResolvedValue(mockComments);

      const commentId = await statusManager.findExistingGeminiComment(123);

      expect(commentId).toBeNull();
      expect(statusManager.commentId).toBeNull();
    });
  });

  describe('generateStatusComment', () => {
    it('各ステータスの適切なコメントを生成する', () => {
      const testCases = [
        {
          status: 'starting',
          expected: '🤖 Gemini AI 分析開始'
        },
        {
          status: 'analyzing',
          expected: '🤖 Gemini AI 分析中'
        },
        {
          status: 'planning',
          expected: '🤖 Gemini AI 計画中'
        },
        {
          status: 'implementing',
          expected: '🤖 Gemini AI 実装中'
        },
        {
          status: 'testing',
          expected: '🤖 Gemini AI テスト中'
        },
        {
          status: 'retrying',
          expected: '🤖 Gemini AI 再試行中'
        },
        {
          status: 'reporting',
          expected: '🤖 Gemini AI レポート生成中'
        },
        {
          status: 'error',
          expected: '❌ 分析失敗'
        }
      ];

      testCases.forEach(({ status, expected }) => {
        const comment = statusManager.generateStatusComment(status);
        expect(comment).toContain(expected);
      });
    });

    it('完了ステータスで変更ありの場合の適切なコメントを生成する', () => {
      const data = {
        hasChanges: true,
        prUrl: 'https://github.com/test/repo/pull/1',
        report: {
          solution: {
            type: 'fix',
            confidence: 'high',
            files: [{ path: 'test.js' }]
          }
        }
      };

      const comment = statusManager.generateStatusComment('completed', data);
      
      expect(comment).toContain('🤖 Gemini AI 分析完了');
      expect(comment).toContain('作成したプルリクエスト');
      expect(comment).toContain(data.prUrl);
      expect(comment).toContain('**信頼度:** high');
    });

    it('完了ステータスで変更なしの場合の適切なコメントを生成する', () => {
      const data = {
        hasChanges: false,
        prUrl: null,
        report: {
          solution: {
            type: 'analysis',
            confidence: 'medium'
          }
        }
      };

      const comment = statusManager.generateStatusComment('completed', data);
      
      expect(comment).toContain('🤖 Gemini AI 分析完了');
      expect(comment).toContain('コードの変更は生成されませんでした');
      expect(comment).not.toContain('プルリクエスト');
    });
  });
});