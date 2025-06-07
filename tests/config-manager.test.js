const { ConfigManager } = require('../scripts/config-manager');

describe('ConfigManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // 環境変数を完全にリセット（重要な修正点）
    process.env = {};
    // 必要最小限の環境変数のみ復元
    process.env.NODE_ENV = originalEnv.NODE_ENV || 'test';
    process.env.PATH = originalEnv.PATH;
    process.env.HOME = originalEnv.HOME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    test('should initialize with environment variables', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.ISSUE_NUMBER = '123';
      process.env.ISSUE_TITLE = 'Test Issue';
      
      const config = new ConfigManager();
      
      expect(config.geminiApiKey).toBe('test-key');
      expect(config.issueNumber).toBe('123');
      expect(config.issueTitle).toBe('Test Issue');
    });

    test('should use default values for optional parameters', () => {
      // 環境変数がクリアされた状態でテスト
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-pro-preview-06-05');
      expect(config.forceImplementation).toBe(false);
      expect(config.executionMode).toBe('auto');
      expect(config.generateReport).toBe(false); // GitHub Actionsの影響を受けない
    });
  });

  describe('validate', () => {
    test('should throw error when GEMINI_API_KEY is missing', async () => {
      // 環境変数がクリアされた状態でテスト
      const config = new ConfigManager();
      
      await expect(config.validate()).rejects.toThrow('GEMINI_API_KEY is required');
    });

    test('should throw error when ISSUE_NUMBER is missing', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      // ISSUE_NUMBERは設定しない
      
      const config = new ConfigManager();
      
      await expect(config.validate()).rejects.toThrow('ISSUE_NUMBER is required');
    });

    test('should pass validation with required parameters', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.ISSUE_NUMBER = '123';
      
      const config = new ConfigManager();
      
      await expect(config.validate()).resolves.toBeUndefined();
    });
  });

  describe('getTargetFiles', () => {
    test('should return empty array when no target files', () => {
      const config = new ConfigManager();
      
      expect(config.getTargetFiles()).toEqual([]);
    });

    test('should parse comma-separated target files', () => {
      process.env.TARGET_FILES = 'file1.js, file2.ts, file3.py';
      
      const config = new ConfigManager();
      
      expect(config.getTargetFiles()).toEqual(['file1.js', 'file2.ts', 'file3.py']);
    });
  });

  describe('generateReport option', () => {
    test('should default to false when GENERATE_REPORT is not set', () => {
      // 環境変数がクリアされた状態でテスト
      const config = new ConfigManager();
      
      expect(config.generateReport).toBe(false);
    });

    test('should be true when GENERATE_REPORT is set to "true"', () => {
      process.env.GENERATE_REPORT = 'true';
      
      const config = new ConfigManager();
      
      expect(config.generateReport).toBe(true);
    });

    test('should be false when GENERATE_REPORT is set to "false"', () => {
      process.env.GENERATE_REPORT = 'false';
      
      const config = new ConfigManager();
      
      expect(config.generateReport).toBe(false);
    });

    test('should be false when GENERATE_REPORT is set to any other value', () => {
      process.env.GENERATE_REPORT = 'maybe';
      
      const config = new ConfigManager();
      
      expect(config.generateReport).toBe(false);
    });
  });

  describe('Model Selection', () => {
    test('should use environment variable GEMINI_MODEL when set', () => {
      process.env.GEMINI_MODEL = 'gemini-1.5-pro';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-1.5-pro');
    });

    test('should detect flash model from comment body @gemini-flash', () => {
      process.env.COMMENT_BODY = 'Please analyze this issue @gemini-flash';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-flash-preview-05-20');
    });

    test('should detect pro model from comment body @gemini-pro', () => {
      process.env.COMMENT_BODY = 'Please analyze this issue @gemini-pro';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-pro-preview-06-05');
    });

    test('should detect flash model from comment body "model: flash"', () => {
      process.env.COMMENT_BODY = 'Please analyze this issue model: flash';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-flash-preview-05-20');
    });

    test('should detect pro model from comment body "model: pro"', () => {
      process.env.COMMENT_BODY = 'Please analyze this issue model: pro';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-pro-preview-06-05');
    });

    test('should detect flash model from comment body "use flash"', () => {
      process.env.COMMENT_BODY = 'Please use flash model';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-flash-preview-05-20');
    });

    test('should detect pro model from comment body "use pro"', () => {
      process.env.COMMENT_BODY = 'Please use pro model';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-pro-preview-06-05');
    });

    test('should detect model from issue body when no comment', () => {
      process.env.ISSUE_BODY = 'This is a bug @gemini-flash';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-flash-preview-05-20');
    });

    test('should prefer comment body over issue body', () => {
      process.env.ISSUE_BODY = 'This is a bug @gemini-flash';
      process.env.COMMENT_BODY = 'Fix this @gemini-pro';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-pro-preview-06-05');
    });

    test('should use default pro model when no specification found', () => {
      process.env.ISSUE_BODY = 'This is a normal bug';
      process.env.COMMENT_BODY = 'Please fix this';
      
      const config = new ConfigManager();
      
      expect(config.geminiModel).toBe('gemini-2.5-pro-preview-06-05');
    });
  });
});
