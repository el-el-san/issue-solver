const { GeminiResponseHelper } = require('../scripts/gemini-response-helper');

describe('GeminiResponseHelper', () => {
  describe('extractText', () => {
    test('should extract text from response.response.text format', () => {
      const response = {
        response: {
          text: 'Test response text'
        }
      };
      
      const result = GeminiResponseHelper.extractText(response);
      
      expect(result).toBe('Test response text');
    });

    test('should extract text from response.text format', () => {
      const response = {
        text: 'Test response text'
      };
      
      const result = GeminiResponseHelper.extractText(response);
      
      expect(result).toBe('Test response text');
    });

    test('should handle function-based text', () => {
      const response = {
        response: {
          text: () => 'Function response text'
        }
      };
      
      const result = GeminiResponseHelper.extractText(response);
      
      expect(result).toBe('Function response text');
    });

    test('should extract text from candidates format', () => {
      const response = {
        candidates: [{
          content: {
            parts: [{
              text: 'Candidates response text'
            }]
          }
        }]
      };
      
      const result = GeminiResponseHelper.extractText(response);
      
      expect(result).toBe('Candidates response text');
    });

    test('should handle direct string response', () => {
      const response = 'Direct string response';
      
      const result = GeminiResponseHelper.extractText(response);
      
      expect(result).toBe('Direct string response');
    });

    test('should throw error for null response', () => {
      expect(() => {
        GeminiResponseHelper.extractText(null);
      }).toThrow('Response is null or undefined');
    });

    test('should throw error for unknown format', () => {
      const response = {
        unknownProperty: 'value'
      };
      
      expect(() => {
        GeminiResponseHelper.extractText(response);
      }).toThrow('Unable to extract text from response');
    });
  });
});