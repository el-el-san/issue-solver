const { GeminiIssueSolver } = require('../scripts/gemini-solver');

describe('GeminiIssueSolver', () => {
  let solver;
  let mockConfig;
  let mockAi;

  beforeEach(() => {
    // Mock config
    mockConfig = {
      issueTitle: 'Test Issue',
      issueBody: 'Test issue body',
      issueLabels: '',
      geminiModel: 'test-model',
      executionMode: 'auto',
      getTargetFiles: jest.fn().mockReturnValue([]),
      geminiMaxRetries: 3,
      geminiRetryDelay: 100,
      geminiTimeout: 5000
    };
    
    // Mock Google AI
    mockAi = {
      models: {
        generateContent: jest.fn()
      }
    };
    
    solver = new GeminiIssueSolver('test-api-key', mockConfig);
    solver.ai = mockAi;
  });

  describe('constructor', () => {
    test('should create instance with config', () => {
      expect(solver).toBeInstanceOf(GeminiIssueSolver);
      expect(solver.config).toBeDefined();
      expect(solver.fileAnalyzer).toBeDefined();
      expect(solver.repositoryAnalyzer).toBeDefined();
      expect(solver.fileManager).toBeDefined();
    });
  });

  describe('createFallbackSolution', () => {
    beforeEach(() => {
      solver.issueAnalysis = {
        title: 'General Enhancement',
        body: 'This is a general enhancement request'
      };
    });
    
    test('should create fallback solution with correct structure', () => {
      const responseText = 'Test response';
      const solution = solver.createFallbackSolution(responseText);

      expect(solution.type).toBeDefined();
      expect(solution).toHaveProperty('confidence', 'medium');
      expect(solution).toHaveProperty('analysis');
      expect(solution).toHaveProperty('planning');
      expect(solution).toHaveProperty('description', responseText);
      expect(solution).toHaveProperty('files');
      expect(solution).toHaveProperty('implementation', responseText);
      expect(solution).toHaveProperty('tests');
      expect(solution).toHaveProperty('report');
    });

    test('should handle empty response text', () => {
      const solution = solver.createFallbackSolution('');
      
      expect(solution.description).toBe('');
      expect(solution.implementation).toBe('');
      expect(solution.type).toBeDefined();
    });

    test('should handle null or undefined response text', () => {
      const solution1 = solver.createFallbackSolution(null);
      const solution2 = solver.createFallbackSolution(undefined);
      
      expect(solution1.description).toBe('');
      expect(solution1.implementation).toBe('');
      expect(solution2.description).toBe('');
      expect(solution2.implementation).toBe('');
      expect(solution1.type).toBeDefined();
      expect(solution2.type).toBeDefined();
    });
  });

  describe('getPromptTemplate', () => {
    test('should return template string', () => {
      solver.issueAnalysis = {
        title: 'Test Issue',
        body: 'Test issue body'
      };
      const template = solver.getPromptTemplate();
      
      expect(typeof template).toBe('string');
      expect(template).toContain('JSON format');
      expect(template).toContain('analysis');
      expect(template).toContain('planning');
    });

    test('should include test-specific instructions for test requests', () => {
      // Create solver with test-related issue
      const testConfig = {
        ...mockConfig,
        issueTitle: 'テストケース追加',
        issueBody: 'テストを追加してください'
      };
      
      const testSolver = new GeminiIssueSolver('test-api-key', testConfig);
      testSolver.issueAnalysis = {
        title: testConfig.issueTitle,
        body: testConfig.issueBody
      };
      const template = testSolver.getPromptTemplate();
      
      expect(template).toContain('TEST IMPLEMENTATION');
      expect(template).toContain('type: "test"');
    });

    test('should detect test requests in English', () => {
      const testConfig = {
        ...mockConfig,
        issueTitle: 'Add test cases',
        issueBody: 'Please add tests for this feature'
      };
      
      const testSolver = new GeminiIssueSolver('test-api-key', testConfig);
      testSolver.issueAnalysis = {
        title: testConfig.issueTitle,
        body: testConfig.issueBody
      };
      const template = testSolver.getPromptTemplate();
      
      expect(template).toContain('TEST IMPLEMENTATION');
    });
  });

  describe('buildSolutionPrompt', () => {
    beforeEach(() => {
      solver.issueAnalysis = {
        title: 'Test Issue',
        body: 'Test issue body',
        labels: [],
        relevantFiles: ['test.js'],
        fileContents: {},
        errorInfo: []
      };
    });

    test('should build complete prompt with all sections', () => {
      const prompt = solver.buildSolutionPrompt();
      
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('expert software developer');
      expect(prompt).toContain('Test Issue');
      expect(prompt).toContain('Test issue body');
    });

    test('should include error information when available', () => {
      solver.issueAnalysis.errorInfo = ['Error 1', 'Error 2'];
      const prompt = solver.buildSolutionPrompt();
      
      expect(prompt).toContain('ERROR INFORMATION:');
      expect(prompt).toContain('Error 1');
      expect(prompt).toContain('Error 2');
    });

    test('should include file contents when available', () => {
      solver.issueAnalysis.fileContents = {
        'test.js': 'console.log("test");'
      };
      const prompt = solver.buildSolutionPrompt();
      
      expect(prompt).toContain('EXISTING CODE CONTEXT:');
      expect(prompt).toContain('test.js');
      expect(prompt).toContain('console.log("test");');
    });

    test('should include relevant files list', () => {
      solver.issueAnalysis.relevantFiles = ['file1.js', 'file2.js'];
      const prompt = solver.buildSolutionPrompt();
      
      expect(prompt).toContain('RELEVANT FILES: file1.js, file2.js');
    });
  });

  describe('generateSolution with retry', () => {
    beforeEach(() => {
      solver.issueAnalysis = {
        title: 'Test Issue',
        body: 'Test issue body',
        labels: [],
        relevantFiles: [],
        fileContents: {},
        errorInfo: []
      };
    });

    test('should succeed on first attempt', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                type: 'bug_fix',
                confidence: 'high',
                analysis: 'test analysis'
              })
            }]
          }
        }]
      };

      mockAi.models.generateContent.mockResolvedValue(mockResponse);

      const result = await solver.generateSolution();

      expect(mockAi.models.generateContent).toHaveBeenCalledTimes(1);
      expect(result.type).toBe('bug_fix');
      expect(result.confidence).toBe('high');
    });

    test('should retry on failure and succeed', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                type: 'bug_fix',
                confidence: 'high',
                analysis: 'test analysis'
              })
            }]
          }
        }]
      };

      // First two attempts fail, third succeeds
      mockAi.models.generateContent
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(mockResponse);

      const result = await solver.generateSolution();

      expect(mockAi.models.generateContent).toHaveBeenCalledTimes(3);
      expect(result.type).toBe('bug_fix');
    });

    test('should fail after max retries', async () => {
      mockAi.models.generateContent.mockRejectedValue(new Error('Network error'));

      await expect(solver.generateSolution()).rejects.toThrow(
        'ソリューション生成に失敗 (3回試行): Network error'
      );

      expect(mockAi.models.generateContent).toHaveBeenCalledTimes(3);
    });

    test('should handle timeout', async () => {
      solver.config.geminiTimeout = 100; // 100ms timeout

      // Simulate a long-running request
      mockAi.models.generateContent.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({}), 200); // Takes longer than timeout
        });
      });

      await expect(solver.generateSolution()).rejects.toThrow(/タイムアウト/);
    });
  });
});