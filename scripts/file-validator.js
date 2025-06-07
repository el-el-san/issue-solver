const path = require('path');
const fs = require('fs');
const vm = require('vm');

class FileValidator {
  constructor() {
    // 許可されたファイル拡張子
    this.ALLOWED_EXTENSIONS = [
      '.js', '.jsx', '.ts', '.tsx',
      '.json', '.md', '.txt', '.yml', '.yaml',
      '.css', '.scss', '.html', '.xml',
      '.py', '.rb', '.go', '.java', '.cpp', '.c'
    ];
    
    // 保護されたパスとファイル
    this.PROTECTED_PATHS = [
      '.git/',
      'node_modules',
      '.env',
      '.env.local',
      '.env.production',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '.gitignore',
      '.npmrc'
    ];
    
    // 危険なパターン
    this.DANGEROUS_PATTERNS = [
      /process\.env\.[\w_]+\s*=/, // 環境変数の書き換え
      /require\(['"]child_process['"]\)/, // 子プロセスの実行
      /fs\.\w+Sync\(['"]\//, // ルートディレクトリへのファイル操作
      /eval\s*\(/, // eval関数の使用
      /new\s+Function\s*\(/, // 動的関数生成
      /__dirname\s*\+\s*['"]\.\./, // ディレクトリトラバーサル
    ];
  }

  /**
   * ファイルパスが安全かどうかを検証
   */
  isPathSafe(filePath) {
    try {
      // パスを正規化
      const normalized = path.normalize(filePath);
      const resolved = path.resolve(filePath);
      const projectRoot = process.cwd();
      
      // プロジェクトディレクトリ外へのアクセスを防止
      if (!resolved.startsWith(projectRoot)) {
        return { valid: false, reason: 'Path is outside project directory' };
      }
      
      // 親ディレクトリへの参照を防止
      if (normalized.includes('..')) {
        return { valid: false, reason: 'Path contains parent directory reference' };
      }
      
      // 保護されたパスへのアクセスを防止
      for (const protectedPath of this.PROTECTED_PATHS) {
        if (normalized.includes(protectedPath) || resolved.includes(protectedPath)) {
          return { valid: false, reason: `Access to protected path: ${protectedPath}` };
        }
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: `Path validation error: ${error.message}` };
    }
  }

  /**
   * ファイルタイプが許可されているかを検証
   */
  isAllowedFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (!ext) {
      return { valid: false, reason: 'File must have an extension' };
    }
    
    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, reason: `File type ${ext} is not allowed` };
    }
    
    return { valid: true };
  }

  /**
   * ファイルコンテンツが安全かを検証
   */
  isContentSafe(content, filePath) {
    // 危険なパターンをチェック
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        return { valid: false, reason: `Dangerous pattern detected: ${pattern}` };
      }
    }
    
    // ファイルパスが未定義の場合はスキップ
    if (!filePath) {
      return { valid: true };
    }
    
    // ファイルタイプ別の検証
    const ext = path.extname(filePath).toLowerCase();
    
    // JavaScriptファイルの構文チェック
    if (['.js', '.jsx'].includes(ext)) {
      try {
        new vm.Script(content);
      } catch (error) {
        return { valid: false, reason: `JavaScript syntax error: ${error.message}` };
      }
    }
    
    // JSONファイルの構文チェック
    if (ext === '.json') {
      try {
        // If content is already an object, stringify then parse to validate
        const jsonString = typeof content === 'object' ? JSON.stringify(content) : content;
        JSON.parse(jsonString);
      } catch (error) {
        return { valid: false, reason: `JSON syntax error: ${error.message}` };
      }
    }
    
    return { valid: true };
  }

  /**
   * ファイル操作を検証
   */
  validateFileOperation(operation) {
    const { path: filePath, action, content } = operation;
    
    // パスの安全性を検証
    const pathValidation = this.isPathSafe(filePath);
    if (!pathValidation.valid) {
      return pathValidation;
    }
    
    // ファイルタイプを検証
    const typeValidation = this.isAllowedFileType(filePath);
    if (!typeValidation.valid) {
      return typeValidation;
    }
    
    // 削除操作の場合、重要なファイルでないかチェック
    if (action === 'delete') {
      const fileName = path.basename(filePath);
      if (['package.json', 'README.md', 'LICENSE'].includes(fileName)) {
        return { valid: false, reason: `Cannot delete critical file: ${fileName}` };
      }
    }
    
    // 作成・更新操作の場合、コンテンツを検証
    if ((action === 'create' || action === 'modify') && content) {
      const contentValidation = this.isContentSafe(content, filePath);
      if (!contentValidation.valid) {
        return contentValidation;
      }
    }
    
    return { valid: true };
  }

  /**
   * バックアップファイルを作成
   */
  createBackup(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const backupDir = path.join(process.cwd(), '.gemini-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.backup`);
    
    try {
      fs.copyFileSync(filePath, backupPath);
      return backupPath;
    } catch (error) {
      console.error(`Backup creation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * バックアップから復元
   */
  restoreFromBackup(backupPath, originalPath) {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }
      
      fs.copyFileSync(backupPath, originalPath);
      return true;
    } catch (error) {
      console.error(`Restore failed: ${error.message}`);
      return false;
    }
  }
}

module.exports = { FileValidator };