const fs = require('fs');
const path = require('path');

class FileAnalyzer {
  findRelevantFiles(title, body, repositoryContext = {}) {
    let files = [];
    const text = (title + ' ' + body).toLowerCase();
    
    // 1. 直接言及されたファイル名を検索
    const fileMatches = text.match(/[a-zA-Z0-9_/-]+\.(?:js|ts|tsx|jsx|py|java|cpp|c|go|rs|php|md|json|yml|yaml|html|css|vue|svelte)\b/g);
    if (fileMatches) {
      files.push(...fileMatches);
    }
    
    // 2. プロジェクト構造に基づく関連ファイル検索
    files.push(...this.findProjectStructureFiles(text, repositoryContext));
    
    // 3. 実装要求に基づくファイル候補生成
    files.push(...this.generateImplementationFiles(text, repositoryContext));
    
    // 4. エラー・バグ修正関連ファイルの検索
    files.push(...this.findErrorRelatedFiles(text, body));
    
    // 5. 既存ファイルの実際の検索
    files.push(...this.searchExistingFiles(text));
    
    // 重複除去と優先順位付け
    const prioritizedFiles = this.prioritizeFiles([...new Set(files)], text, repositoryContext);
    return prioritizedFiles.slice(0, 50); // 制限を50ファイルに拡張
  }
  
  // プロジェクト構造に基づくファイル検索
  findProjectStructureFiles(text, repoContext) {
    const files = [];
    
    // フレームワーク固有のファイル
    if (repoContext.framework === 'React') {
      if (text.includes('component')) {
        files.push('src/components/', 'components/');
      }
      if (text.includes('hook')) {
        files.push('src/hooks/', 'hooks/');
      }
    }
    
    if (repoContext.framework === 'Vue') {
      files.push('src/components/', 'components/');
    }
    
    // 設定ファイル
    if (text.includes('config') || text.includes('setting')) {
      files.push('config/', '.env', 'tsconfig.json', 'webpack.config.js');
    }
    
    // テスト関連
    if (text.includes('test') || text.includes('テスト')) {
      files.push('tests/', 'test/', '__tests__/', 'spec/', '*.test.js', '*.spec.js');
    }
    
    return files;
  }
  
  // 実装要求に基づくファイル生成
  generateImplementationFiles(text, repoContext) {
    const files = [];
    
    // 技術スタック検出
    const isTypeScript = text.includes('.ts') || text.includes('typescript') || repoContext.hasTypeScript;
    const isJavaScript = text.includes('.js') || text.includes('javascript');
    const isPython = text.includes('.py') || text.includes('python');
    
    // 特定の実装要求
    if (text.includes('ハローワールド') || text.includes('hello world')) {
      const ext = isTypeScript ? '.ts' : isJavaScript ? '.js' : isPython ? '.py' : '.js';
      files.push(`hello${ext}`, `src/hello${ext}`);
    }
    
    // JavaScriptファイル生成要求の処理
    if (text.includes('javascript function') || text.includes('new feature in .js')) {
      // プロジェクト構造に基づいてJavaScriptファイルを生成
      const projectFiles = this.searchExistingFiles('javascript');
      if (projectFiles.length > 0) {
        files.push(...projectFiles.filter(f => f.endsWith('.js')));
      } else {
        // 既存のJSファイルが見つからない場合、標準的な場所を提案
        files.push('src/index.js', 'main.js', 'app.js');
      }
    }
    
    // API関連
    if (text.includes('api') || text.includes('endpoint')) {
      const ext = isTypeScript ? '.ts' : '.js';
      files.push(`src/api/`, `api/`, `routes/`, `controllers/`, `src/routes${ext}`);
    }
    
    // データベース関連
    if (text.includes('database') || text.includes('db') || text.includes('model')) {
      files.push('models/', 'src/models/', 'database/', 'migrations/');
    }
    
    // ユーティリティ関数
    if (text.includes('util') || text.includes('helper')) {
      const ext = isTypeScript ? '.ts' : '.js';
      files.push(`src/utils/`, `utils/`, `src/helpers/`, `helpers/`);
    }
    
    return files;
  }
  
  // エラー関連ファイルの検索
  findErrorRelatedFiles(text, body) {
    const files = [];
    
    // bodyが存在することを確認
    if (!body || typeof body !== 'string') {
      return files;
    }
    
    // スタックトレースからファイル名を抽出
    const stackTraceMatches = body.match(/\s+at\s+[^\(]*\(([^:]+):\d+:\d+\)/g);
    if (stackTraceMatches) {
      stackTraceMatches.forEach(match => {
        const fileMatch = match.match(/\(([^:]+):/);
        if (fileMatch && fileMatch[1]) {
          files.push(fileMatch[1]);
        }
      });
    }
    
    // ファイルパスの言及
    const pathMatches = body.match(/(?:src\/|lib\/|dist\/)[a-zA-Z0-9\/_-]+\.[a-z]+/g);
    if (pathMatches) {
      files.push(...pathMatches);
    }
    
    return files;
  }
  
  // 既存ファイルの実際の検索
  searchExistingFiles(text) {
    const files = [];
    
    try {
      // キーワードベースの検索
      const keywords = this.extractKeywords(text);
      
      // よく使われるディレクトリを検索
      const searchDirs = ['src/', 'lib/', 'app/', 'components/', 'utils/', 'services/', 'api/', 'models/'];
      
      searchDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          const dirFiles = this.searchInDirectory(dir, keywords);
          files.push(...dirFiles);
        }
      });
      
      // ルートディレクトリの重要ファイル
      const rootFiles = ['package.json', 'tsconfig.json', 'README.md', 'index.js', 'index.ts', 'main.py'];
      rootFiles.forEach(file => {
        if (fs.existsSync(file)) {
          files.push(file);
        }
      });
      
    } catch (error) {
      console.log('ファイル検索エラー:', error.message);
    }
    
    return files;
  }
  
  // ディレクトリ内検索
  searchInDirectory(dir, keywords, maxDepth = 2, currentDepth = 0) {
    const files = [];
    
    if (currentDepth >= maxDepth) return files;
    
    try {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = `${dir}${item}`;
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...this.searchInDirectory(fullPath + '/', keywords, maxDepth, currentDepth + 1));
        } else if (stats.isFile()) {
          // ファイル名にキーワードが含まれるかチェック
          const hasKeyword = keywords.some(keyword => 
            item.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if (hasKeyword || this.isImportantFile(fullPath)) {
            files.push(fullPath);
          }
        }
      });
    } catch (error) {
      // アクセス権限エラーなどは無視
    }
    
    return files;
  }
  
  // キーワード抽出
  extractKeywords(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }
    const words = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
    const stopWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'had', 'but', 'で', 'は', 'を', 'に', 'が', 'の', 'と'];
    return [...new Set(words.filter(word => !stopWords.includes(word.toLowerCase())))];
  }
  
  // 重要ファイルの判定
  isImportantFile(filePath) {
    const importantPatterns = [
      /\.(js|ts|tsx|jsx|py|java|cpp|go|rs)$/,
      /package\.json$/,
      /README\.md$/,
      /config/,
      /test/,
      /spec/
    ];
    
    return importantPatterns.some(pattern => pattern.test(filePath));
  }
  
  // ファイル優先順位付け
  prioritizeFiles(files, text, repoContext) {
    return files.sort((a, b) => {
      let scoreA = this.calculateFileScore(a, text, repoContext);
      let scoreB = this.calculateFileScore(b, text, repoContext);
      return scoreB - scoreA; // 降順
    });
  }
  
  // ファイルスコア計算
  calculateFileScore(filePath, text, repoContext) {
    let score = 0;
    
    // 直接言及されたファイル
    if (text.includes(filePath)) score += 10;
    
    // 重要な設定ファイル
    if (['package.json', 'tsconfig.json', 'README.md'].includes(filePath)) score += 5;
    
    // 実装要求とファイルタイプの一致
    if (text.includes('typescript') && filePath.endsWith('.ts')) score += 8;
    if (text.includes('javascript') && filePath.endsWith('.js')) score += 8;
    if (text.includes('python') && filePath.endsWith('.py')) score += 8;
    
    // テスト関連
    if ((text.includes('test') || text.includes('テスト')) && 
        (filePath.includes('test') || filePath.includes('spec'))) score += 7;
    
    // 既存ファイルへのボーナス
    if (fs.existsSync(filePath)) score += 3;
    
    return score;
  }
  
  readRelevantFiles(filePaths) {
    const contents = {};
    let processedCount = 0;
    const maxFiles = 30; // 処理するファイル数を制限
    
    filePaths.slice(0, maxFiles).forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          
          if (stats.isDirectory()) {
            // ディレクトリの場合は主要ファイルをリスト
            const dirContents = this.getDirectoryContents(filePath);
            if (dirContents) {
              contents[filePath] = dirContents;
            }
          } else if (stats.size > 20000) { // 20KB以上のファイルは切り詰め
            const content = fs.readFileSync(filePath, 'utf8');
            contents[filePath] = content.substring(0, 3000) + '\n... (truncated for brevity)';
          } else {
            contents[filePath] = fs.readFileSync(filePath, 'utf8');
          }
          
          processedCount++;
        } else {
          // 存在しないファイルは新規作成候補として記録
          contents[filePath] = '(File does not exist - candidate for creation)';
        }
      } catch (error) {
        contents[filePath] = `File read error: ${error.message}`;
      }
    });
    
    console.log(`📁 Processed ${processedCount} files for context`);
    return contents;
  }
  
  // ディレクトリ内容の取得
  getDirectoryContents(dirPath) {
    try {
      const items = fs.readdirSync(dirPath).slice(0, 10); // 最大10項目
      return `Directory contents:\n${items.map(item => `- ${item}`).join('\n')}`;
    } catch (error) {
      return null;
    }
  }

  extractErrorInfo(issueBody) {
    const errorPatterns = [
      /Error: .+/g,
      /Exception: .+/g,
      /TypeError: .+/g,
      /ReferenceError: .+/g,
      /SyntaxError: .+/g,
      /ModuleNotFoundError: .+/g,
      /ImportError: .+/g,
      /response\.text is not a function/g,
      /Cannot read properties of undefined \(reading '[^']+'\)/g,
      /Cannot read property '[^']+' of undefined/g,
      /\w+Error: .+/g,
      /Failed to .+/g
    ];
    
    let errors = [];
    let stackTraces = [];
    
    // issueBodyが存在することを確認
    if (!issueBody || typeof issueBody !== 'string') {
      return {
        errors: [],
        stackTraces: [],
        hasErrorInfo: false
      };
    }
    
    // エラーメッセージの抽出
    errorPatterns.forEach(pattern => {
      const matches = issueBody.match(pattern);
      if (matches) {
        errors.push(...matches);
      }
    });
    
    // スタックトレースの抽出
    const stackTracePattern = /\s+at\s+.+/g;
    const stackMatches = issueBody.match(stackTracePattern);
    if (stackMatches) {
      stackTraces.push(...stackMatches.slice(0, 10)); // 最大10行
    }
    
    // ログレベルの情報も抽出
    const logPatterns = [
      /\[ERROR\] .+/g,
      /\[WARN\] .+/g,
      /\[FATAL\] .+/g,
      /console\.error\(.+\)/g
    ];
    
    logPatterns.forEach(pattern => {
      const matches = issueBody.match(pattern);
      if (matches) {
        errors.push(...matches);
      }
    });
    
    return {
      errors: [...new Set(errors)],
      stackTraces: [...new Set(stackTraces)],
      hasErrorInfo: errors.length > 0 || stackTraces.length > 0
    };
  }
}

module.exports = { FileAnalyzer };