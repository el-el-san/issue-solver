const { FileAnalyzer } = require('../scripts/file-analyzer');
const fs = require('fs');

jest.mock('fs');

describe('FileAnalyzer', () => {
  let fileAnalyzer;

  beforeEach(() => {
    fileAnalyzer = new FileAnalyzer();
    jest.clearAllMocks();
  });

  describe('findRelevantFiles', () => {
    test('should find files mentioned directly in title and body', () => {
      const title = 'Fix bug in main.js';
      const body = 'The issue is in config.json and utils.ts';
      
      const result = fileAnalyzer.findRelevantFiles(title, body);
      
      expect(result).toContain('main.js');
      expect(result).toContain('config.json');
      expect(result).toContain('utils.ts');
    });

    test('should generate hello world TypeScript file for hello world requests', () => {
      const title = 'Create hello world in TypeScript';
      const body = 'Please create a simple hello world program';
      
      const result = fileAnalyzer.findRelevantFiles(title, body);
      
      expect(result).toContain('hello.ts');
    });

    test('should generate implementation files for language requests', () => {
      const title = 'Create JavaScript function';
      const body = 'Need a new feature in .js';
      
      const result = fileAnalyzer.findRelevantFiles(title, body);
      
      // New implementation generates files based on project structure
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(file => file.endsWith('.js'))).toBe(true);
    });

    test('should include common files when no specific language mentioned', () => {
      fs.existsSync.mockReturnValue(true);
      
      const title = 'General bug fix';
      const body = 'Something is broken';
      
      const result = fileAnalyzer.findRelevantFiles(title, body);
      
      expect(result).toContain('README.md');
    });
  });

  describe('readRelevantFiles', () => {
    test('should read existing files', () => {
      const filePaths = ['test.js', 'config.json'];
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1000, isDirectory: () => false });
      fs.readFileSync.mockImplementation((path) => `content of ${path}`);
      
      const result = fileAnalyzer.readRelevantFiles(filePaths);
      
      expect(result['test.js']).toBe('content of test.js');
      expect(result['config.json']).toBe('content of config.json');
    });

    test('should truncate large files', () => {
      const filePaths = ['large.js'];
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 25000, isDirectory: () => false });
      fs.readFileSync.mockReturnValue('x'.repeat(5000));
      
      const result = fileAnalyzer.readRelevantFiles(filePaths);
      
      expect(result['large.js']).toMatch(/\.\.\. \(truncated for brevity\)$/);
    });

    test('should handle file read errors', () => {
      const filePaths = ['error.js'];
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1000, isDirectory: () => false });
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      const result = fileAnalyzer.readRelevantFiles(filePaths);
      
      expect(result['error.js']).toContain('File read error');
    });
  });

  describe('extractErrorInfo', () => {
    test('should extract various error patterns', () => {
      const issueBody = `
        Error: Cannot find module 'test'
        TypeError: undefined is not a function
        SyntaxError: Unexpected token
        response.text is not a function
        Error: undefined is not a function
        Error: Unexpected token
      `;
      
      const result = fileAnalyzer.extractErrorInfo(issueBody);
      
      expect(result.errors).toHaveLength(6);
      expect(result.errors).toContain("Error: Cannot find module 'test'");
      expect(result.errors).toContain('TypeError: undefined is not a function');
      expect(result.errors).toContain('SyntaxError: Unexpected token');
      expect(result.hasErrorInfo).toBe(true);
    });

    test('should remove duplicate errors', () => {
      const issueBody = `
        Error: Same error
        Error: Same error
        Error: Different error
        TypeError: Different error
      `;
      
      const result = fileAnalyzer.extractErrorInfo(issueBody);
      
      expect(result.errors).toHaveLength(3);
      expect(result.hasErrorInfo).toBe(true);
    });
  });
});