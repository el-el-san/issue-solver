const { FileManager } = require('../scripts/file-manager');
const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('path');

describe('FileManager', () => {
  let fileManager;

  beforeEach(() => {
    fileManager = new FileManager();
    jest.clearAllMocks();
  });

  describe('processFileAction', () => {
    test('should create file when action is create', async () => {
      const fileAction = {
        path: 'test.js',
        action: 'create',
        changes: '// New file\nconsole.log("created");'
      };
      const solution = { implementation: 'console.log("test code");' };
      const issueAnalysis = { title: 'Test', body: 'Test body' };

      path.dirname.mockReturnValue('.');
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {});

      await fileManager.processFileAction(fileAction, solution, issueAnalysis);

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should modify file when action is modify', async () => {
      const fileAction = {
        path: 'test.js',
        action: 'modify',
        changes: '// Update content\nconsole.log("updated");'
      };
      const solution = { implementation: 'console.log("test code");' };
      const issueAnalysis = { title: 'Test', body: 'Test body' };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('// existing content\nconsole.log("existing");');
      fs.writeFileSync.mockImplementation(() => {});
      path.extname.mockReturnValue('.js');

      await fileManager.processFileAction(fileAction, solution, issueAnalysis);

      expect(fs.readFileSync).toHaveBeenCalledWith('test.js', 'utf8');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should delete file when action is delete', async () => {
      const fileAction = {
        path: 'test.js',
        action: 'delete',
        changes: '// Remove file'
      };

      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {});

      await fileManager.processFileAction(fileAction, {}, {});

      expect(fs.unlinkSync).toHaveBeenCalledWith('test.js');
    });
  });

  describe('generateTypeScriptContent', () => {
    test('should generate hello world content for hello world requests', () => {
      const issueAnalysis = {
        title: 'Create Hello World',
        body: 'ハローワールドを作成してください'
      };

      const result = fileManager.generateTypeScriptContent(issueAnalysis, 'custom content');

      expect(result).toContain('Hello, World!');
      expect(result).toContain('function sayHello()');
      expect(result).toContain('class HelloWorld');
    });

    test('should generate generic TypeScript content for other requests', () => {
      const issueAnalysis = {
        title: 'Create utility function',
        body: 'Need a new utility'
      };

      const result = fileManager.generateTypeScriptContent(issueAnalysis, 'utility code');

      expect(result).toContain('// TypeScript implementation');
      expect(result).toContain('utility code');
      expect(result).toContain('// CommonJS module exports (if needed)');
    });
  });

  describe('isHelloWorldRequest', () => {
    test('should return true for hello world in Japanese', () => {
      const issueAnalysis = {
        title: 'ハローワールドを作成',
        body: 'プログラムを作ってください'
      };

      const result = fileManager.isHelloWorldRequest(issueAnalysis);

      expect(result).toBe(true);
    });

    test('should return true for hello world in English', () => {
      const issueAnalysis = {
        title: 'Create hello world program',
        body: 'Simple program needed'
      };

      const result = fileManager.isHelloWorldRequest(issueAnalysis);

      expect(result).toBe(true);
    });

    test('should return false for other requests', () => {
      const issueAnalysis = {
        title: 'Fix bug in application',
        body: 'There is an issue'
      };

      const result = fileManager.isHelloWorldRequest(issueAnalysis);

      expect(result).toBe(false);
    });
  });

  describe('createDocumentation', () => {
    test('should skip documentation by default', async () => {
      const solution = {
        type: 'feature',
        confidence: 'high',
        analysis: 'Test analysis'
      };

      const issueAnalysis = {
        title: 'Test Issue'
      };

      const config = {
        issueNumber: '123'
      };

      fs.writeFileSync.mockImplementation(() => {});

      await fileManager.createDocumentation(solution, issueAnalysis, config);

      // Should not create documentation by default
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('should create minimal documentation when in detailed mode', async () => {
      const solution = {
        type: 'feature',
        analysis: 'Test analysis'
      };

      const issueAnalysis = {
        title: 'Test Issue'
      };

      const config = {
        issueNumber: '123',
        executionMode: 'detailed'
      };

      fs.writeFileSync.mockImplementation(() => {});

      await fileManager.createDocumentation(solution, issueAnalysis, config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'ISSUE_123_SOLUTION.md',
        expect.stringContaining('# Issue #123 Solution')
      );
    });
  });
});