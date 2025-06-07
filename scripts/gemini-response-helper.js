class GeminiResponseHelper {
  static extractText(response, debugInfo = '') {
    console.log('🔍 Extracting text from response for:', debugInfo);
    console.log('Response type:', typeof response);
    console.log('Response keys:', response ? Object.keys(response) : 'null/undefined');
    
    if (!response) {
      throw new Error('Response is null or undefined');
    }
    
    // ケース1: response.response.text (新しい形式)
    if (response.response && response.response.text) {
      console.log('✅ Using response.response.text format');
      const text = response.response.text;
      return typeof text === 'function' ? text() : text;
    }
    
    // ケース2: response.text (従来の形式)  
    if (response.text) {
      console.log('✅ Using response.text format');
      const text = response.text;
      return typeof text === 'function' ? text() : text;
    }
    
    // ケース3: response.candidates (低レベルアクセス)
    if (response.candidates && response.candidates.length > 0) {
      console.log('✅ Using response.candidates format');
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        return candidate.content.parts[0].text;
      }
    }
    
    // ケース4: 直接テキストが含まれている場合
    if (typeof response === 'string') {
      console.log('✅ Direct string response');
      return response;
    }
    
    // エラー時の詳細デバッグ
    console.log('❌ Unknown response format');
    console.log('Full response structure:', JSON.stringify(response, null, 2));
    throw new Error(`Unable to extract text from response. Available keys: ${Object.keys(response).join(', ')}`);
  }
}

module.exports = { GeminiResponseHelper };