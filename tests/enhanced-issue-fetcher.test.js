const { EnhancedIssueFetcher } = require('../scripts/enhanced-issue-fetcher');

// Mock GitHub API response
const mockGithubAPI = {
  rest: {
    issues: {
      get: jest.fn(),
      listComments: jest.fn()
    }
  }
};

const mockContext = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  }
};

describe('EnhancedIssueFetcher', () => {
  let fetcher;

  beforeEach(() => {
    fetcher = new EnhancedIssueFetcher(mockGithubAPI, mockContext);
    jest.clearAllMocks();
  });

  describe('fetchCompleteIssueData', () => {
    it('should fetch issue and comments successfully', async () => {
      // Mock issue response
      const mockIssue = {
        number: 123,
        title: 'Test Issue',
        body: 'This is a test issue',
        state: 'open',
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
        user: { login: 'test-user' },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z'
      };

      // Mock comments response
      const mockComments = [
        {
          id: 1,
          body: 'This is a regular comment',
          user: { login: 'user1' },
          created_at: '2023-01-01T01:00:00Z',
          updated_at: '2023-01-01T01:00:00Z',
          html_url: 'https://github.com/test/test/issues/123#issuecomment-1'
        },
        {
          id: 2,
          body: '@gemini please help fix this issue',
          user: { login: 'user2' },
          created_at: '2023-01-01T02:00:00Z',
          updated_at: '2023-01-01T02:00:00Z',
          html_url: 'https://github.com/test/test/issues/123#issuecomment-2'
        }
      ];

      mockGithubAPI.rest.issues.get.mockResolvedValue({ data: mockIssue });
      mockGithubAPI.rest.issues.listComments.mockResolvedValue({ data: mockComments });

      const result = await fetcher.fetchCompleteIssueData(123);

      expect(result).toHaveProperty('number', 123);
      expect(result).toHaveProperty('title', 'Test Issue');
      expect(result).toHaveProperty('comments');
      expect(result.comments).toHaveLength(2);
      expect(result).toHaveProperty('geminiTriggerComments');
      expect(result.geminiTriggerComments).toHaveLength(1);
      expect(result).toHaveProperty('hasGeminiTrigger', true);
      expect(result.latestGeminiComment.body).toBe('@gemini please help fix this issue');
    });

    it('should handle pagination for comments', async () => {
      const mockIssue = {
        number: 456,
        title: 'Test Issue with Many Comments',
        body: 'This issue has many comments',
        state: 'open',
        labels: [],
        user: { login: 'test-user' },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z'
      };

      // Mock multiple pages of comments
      const page1Comments = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        body: `Comment ${i + 1}`,
        user: { login: 'user1' },
        created_at: '2023-01-01T01:00:00Z',
        updated_at: '2023-01-01T01:00:00Z',
        html_url: `https://github.com/test/test/issues/456#issuecomment-${i + 1}`
      }));

      const page2Comments = [
        {
          id: 101,
          body: '@gemini help with this',
          user: { login: 'user2' },
          created_at: '2023-01-01T02:00:00Z',
          updated_at: '2023-01-01T02:00:00Z',
          html_url: 'https://github.com/test/test/issues/456#issuecomment-101'
        }
      ];

      mockGithubAPI.rest.issues.get.mockResolvedValue({ data: mockIssue });
      mockGithubAPI.rest.issues.listComments
        .mockResolvedValueOnce({ data: page1Comments })
        .mockResolvedValueOnce({ data: page2Comments });

      const result = await fetcher.fetchCompleteIssueData(456);

      expect(result.comments).toHaveLength(101);
      expect(result.geminiTriggerComments).toHaveLength(1);
      expect(mockGithubAPI.rest.issues.listComments).toHaveBeenCalledTimes(2);
    });
  });

  describe('findGeminiTriggerComments', () => {
    it('should identify @gemini trigger comments', () => {
      const comments = [
        { id: 1, body: 'Regular comment', user: { login: 'user1' } },
        { id: 2, body: '@gemini please help', user: { login: 'user2' } },
        { id: 3, body: 'Another regular comment', user: { login: 'user3' } },
        { id: 4, body: 'gemini fix this', user: { login: 'user4' } },
        { id: 5, body: '@ai assist with this', user: { login: 'user5' } }
      ];

      const triggers = fetcher.findGeminiTriggerComments(comments);

      expect(triggers).toHaveLength(3);
      expect(triggers[0].body).toBe('@gemini please help');
      expect(triggers[1].body).toBe('gemini fix this');
      expect(triggers[2].body).toBe('@ai assist with this');
    });
  });

  describe('extractErrorsFromAllContent', () => {
    it('should extract various error patterns', () => {
      const contents = [
        'This is a TypeError: Cannot read property "x" of undefined',
        'Error: Failed to fetch data from API',
        'SyntaxError: Unexpected token',
        'ReferenceError: variable is not defined',
        'Regular content without errors'
      ];

      const errors = fetcher.extractErrorsFromAllContent(contents);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('TypeError: Cannot read property "x" of undefined');
      expect(errors).toContain('Error: Failed to fetch data from API');
      expect(errors).toContain('SyntaxError: Unexpected token');
      expect(errors).toContain('ReferenceError: variable is not defined');
    });
  });

  describe('extractTechnicalContext', () => {
    it('should detect technologies from content', () => {
      const contents = [
        'This is a JavaScript function in main.js',
        'We need to fix the React component',
        'The Python script in app.py is failing',
        'TypeScript types are not working'
      ];

      const context = fetcher.extractTechnicalContext(contents);

      expect(context.technologies).toContain('JavaScript');
      expect(context.technologies).toContain('React');
      expect(context.technologies).toContain('Python');
      expect(context.technologies).toContain('TypeScript');
    });

    it('should detect code blocks and stack traces', () => {
      const contents = [
        'Here is some code:\n```javascript\nfunction test() {}\n```',
        'Stack trace:\n    at Object.func (file.js:10:5)\n    at main (app.js:20:10)'
      ];

      const context = fetcher.extractTechnicalContext(contents);

      expect(context.hasCodeBlocks).toBe(true);
      expect(context.hasStackTrace).toBe(true);
    });
  });
});