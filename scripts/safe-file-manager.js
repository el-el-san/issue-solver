const fs = require('fs');
const path = require('path');
const { FileValidator } = require('./file-validator');

class SafeFileManager {
  constructor() {
    this.validator = new FileValidator();
    this.pendingOperations = [];
    this.backups = new Map();
    this.dryRun = process.env.DRY_RUN === 'true';
  }

  /**
   * ファイル操作を安全に実行
   */
  async safeExecute(fileOperations) {
    // ドライランモード
    if (this.dryRun) {
      console.log('🔍 ドライランモード: 実際のファイル変更は行いません');
      return this.simulateOperations(fileOperations);
    }

    // 全ての操作を事前検証
    const validationResults = this.validateAllOperations(fileOperations);
    if (!validationResults.valid) {
      throw new Error(`ファイル操作の検証に失敗: ${validationResults.errors.join(', ')}`);
    }

    // バックアップを作成
    const backupResults = await this.createBackups(fileOperations);
    
    try {
      // 操作を実行
      const results = await this.executeOperations(fileOperations);
      
      // 成功した場合、バックアップをクリーンアップ（オプション）
      if (process.env.KEEP_BACKUPS !== 'true') {
        this.cleanupBackups();
      }
      
      return results;
    } catch (error) {
      console.error('❌ ファイル操作中にエラーが発生しました:', error.message);
      
      // エラー時はロールバック
      await this.rollback();
      throw error;
    }
  }

  /**
   * 全ての操作を事前検証
   */
  validateAllOperations(operations) {
    const errors = [];
    
    for (const operation of operations) {
      // GitHub Actionsワークフローファイルのチェック
      if (this.isWorkflowFile(operation.path)) {
        errors.push(`${operation.path}: GitHub App workflow files require 'workflows' permission`);
        continue;
      }
      
      const validation = this.validator.validateFileOperation(operation);
      if (!validation.valid) {
        errors.push(`${operation.path}: ${validation.reason}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * GitHub Actionsワークフローファイルかどうかを判定
   */
  isWorkflowFile(filePath) {
    return filePath.includes('.github/workflows/') && 
           (filePath.endsWith('.yml') || filePath.endsWith('.yaml'));
  }

  /**
   * バックアップを作成
   */
  async createBackups(operations) {
    console.log('📦 バックアップを作成中...');
    
    for (const operation of operations) {
      if (operation.action === 'modify' || operation.action === 'delete') {
        const backupPath = this.validator.createBackup(operation.path);
        if (backupPath) {
          this.backups.set(operation.path, backupPath);
          console.log(`  ✓ ${operation.path} → ${path.basename(backupPath)}`);
        }
      }
    }
    
    return this.backups;
  }

  /**
   * 操作を実行
   */
  async executeOperations(operations) {
    const results = [];
    
    for (const operation of operations) {
      try {
        const result = await this.executeSingleOperation(operation);
        results.push(result);
        this.pendingOperations.push(operation);
      } catch (error) {
        throw new Error(`操作失敗 (${operation.path}): ${error.message}`);
      }
    }
    
    return results;
  }

  /**
   * 単一の操作を実行
   */
  async executeSingleOperation(operation) {
    const { path: filePath, content, changes } = operation;
    let { action } = operation;
    
    // 自動的にアクションを調整：既存ファイルなら modify、存在しなければ create
    if (action === 'create' && fs.existsSync(filePath)) {
      action = 'modify';
      console.log(`📝 ファイルが既に存在するため、アクションを create → modify に変更: ${filePath}`);
    } else if (action === 'modify' && !fs.existsSync(filePath)) {
      action = 'create';
      console.log(`📝 ファイルが存在しないため、アクションを modify → create に変更: ${filePath}`);
    }
    
    console.log(`🔧 ${action}: ${filePath}`);
    
    switch (action) {
      case 'create':
        return this.createFile(filePath, content);
        
      case 'modify':
        return this.modifyFile(filePath, content || changes);
        
      case 'delete':
        return this.deleteFile(filePath);
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * ファイルを作成
   */
  createFile(filePath, content) {
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 既存ファイルがある場合の処理
    if (fs.existsSync(filePath)) {
      // Hello World や簡単なファイルの場合は自動的に上書きを許可
      const isSimpleFile = this.isSimpleFileCreation(filePath, content);
      
      if (process.env.FORCE_OVERWRITE !== 'true' && !isSimpleFile) {
        throw new Error('File already exists. Use modify action or set FORCE_OVERWRITE=true');
      }
      
      // 既存ファイルの内容と比較
      const existingContent = fs.readFileSync(filePath, 'utf8');
      const newContent = content || '';
      
      // 内容が同じ場合でも変更を確実にするため、タイムスタンプコメントを追加
      if (existingContent === newContent) {
        const timestamp = new Date().toISOString();
        const fileExt = path.extname(filePath);
        let timestampComment;
        
        if (fileExt === '.ts' || fileExt === '.js') {
          timestampComment = `// Updated: ${timestamp}\n`;
        } else if (fileExt === '.py') {
          timestampComment = `# Updated: ${timestamp}\n`;
        } else {
          timestampComment = `<!-- Updated: ${timestamp} -->\n`;
        }
        
        fs.writeFileSync(filePath, timestampComment + newContent);
        console.log(`📝 ファイル内容が同一のため、タイムスタンプを追加して更新: ${filePath}`);
      } else {
        fs.writeFileSync(filePath, newContent);
      }
    } else {
      fs.writeFileSync(filePath, content || '');
    }
    
    return { action: 'created', path: filePath };
  }

  /**
   * 簡単なファイル作成かどうかを判定
   */
  isSimpleFileCreation(filePath, content) {
    const fileName = path.basename(filePath).toLowerCase();
    const contentLower = (content || '').toLowerCase();
    
    // Hello World 関連のファイル
    if (fileName.includes('hello') || contentLower.includes('hello world') || contentLower.includes('hello, world')) {
      return true;
    }
    
    // 小さなファイル（100行未満）
    if (content && content.split('\n').length < 100) {
      return true;
    }
    
    // テストファイルやサンプルファイル
    if (fileName.includes('test') || fileName.includes('sample') || fileName.includes('example')) {
      return true;
    }
    
    return false;
  }

  /**
   * ファイルを修正（柔軟な安全性モード）
   */
  modifyFile(filePath, changes) {
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist. Use create action instead.');
    }
    
    const currentContent = fs.readFileSync(filePath, 'utf8');
    let newContent;
    
    // 安全モードの設定を確認
    const safetyMode = process.env.SAFETY_MODE || 'normal';
    const isSimpleImplementation = this.isSimpleImplementationRequest(changes);
    
    // 変更内容のタイプに応じて処理
    if (typeof changes === 'string') {
      // 文字列の場合の処理
      if (safetyMode === 'safe' && !isSimpleImplementation) {
        console.error('❌ エラー: modifyアクションで文字列が指定されました。');
        console.error('❌ safeモードではオブジェクト形式が必須です。');
        throw new Error('Unsafe modify operation: string content not allowed in safe mode.');
      }
      
      if (isSimpleImplementation || safetyMode === 'fast') {
        // シンプルな実装や高速モードでは許可
        console.log('📝 シンプル実装モード: 文字列コンテンツを許可');
        newContent = changes;
      } else {
        // ノーマルモードでは追記として処理
        console.log('⚠️  文字列コンテンツを追記モードで処理します');
        newContent = currentContent + '\n\n' + changes;
      }
    } else if (changes && changes.type === 'append') {
      newContent = currentContent + '\n' + changes.content;
    } else if (changes && changes.type === 'prepend') {
      newContent = changes.content + '\n' + currentContent;
    } else if (changes && changes.type === 'replace') {
      newContent = currentContent.replace(changes.from, changes.to);
    } else if (changes && changes.type === 'full-replace') {
      // 明示的な全置換
      console.log('🔄 全置換モード: ファイル全体を置換');
      newContent = changes.content;
    } else {
      throw new Error('Invalid changes format. Expected object with type property or string for simple implementations.');
    }
    
    fs.writeFileSync(filePath, newContent);
    return { action: 'modified', path: filePath };
  }

  /**
   * ファイルを削除
   */
  deleteFile(filePath) {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  File not found: ${filePath}`);
      return { action: 'skipped', path: filePath };
    }
    
    fs.unlinkSync(filePath);
    return { action: 'deleted', path: filePath };
  }

  /**
   * ロールバック
   */
  async rollback() {
    console.log('🔄 変更をロールバック中...');
    
    // 逆順で操作を取り消し
    for (let i = this.pendingOperations.length - 1; i >= 0; i--) {
      const operation = this.pendingOperations[i];
      
      try {
        switch (operation.action) {
          case 'create':
            // 作成したファイルを削除
            if (fs.existsSync(operation.path)) {
              fs.unlinkSync(operation.path);
              console.log(`  ✓ 削除: ${operation.path}`);
            }
            break;
            
          case 'modify':
          case 'delete':
            // バックアップから復元
            const backupPath = this.backups.get(operation.path);
            if (backupPath) {
              this.validator.restoreFromBackup(backupPath, operation.path);
              console.log(`  ✓ 復元: ${operation.path}`);
            }
            break;
        }
      } catch (error) {
        console.error(`  ❌ ロールバック失敗 (${operation.path}): ${error.message}`);
      }
    }
    
    this.pendingOperations = [];
  }

  /**
   * ドライラン（シミュレーション）
   */
  simulateOperations(operations) {
    console.log('\n📋 予定されているファイル操作:');
    
    for (const operation of operations) {
      const validation = this.validator.validateFileOperation(operation);
      const status = validation.valid ? '✅' : '❌';
      console.log(`${status} ${operation.action}: ${operation.path}`);
      
      if (!validation.valid) {
        console.log(`   理由: ${validation.reason}`);
      }
      
      if (operation.action === 'modify' && fs.existsSync(operation.path)) {
        const size = fs.statSync(operation.path).size;
        console.log(`   現在のファイルサイズ: ${size} bytes`);
      }
    }
    
    return { dryRun: true, operations };
  }

  /**
   * シンプルな実装要求かどうかを判定
   */
  isSimpleImplementationRequest(changes) {
    if (typeof changes !== 'string') return false;
    
    // コードの特徴をチェック
    const codePatterns = [
      /function\s+\w+/,
      /const\s+\w+\s*=/,
      /class\s+\w+/,
      /import\s+/,
      /export\s+/,
      /console\.log/,
      /Hello[\s\w]*World/i,
      /<\w+[^>]*>/  // HTMLタグ
    ];
    
    const hasCodePattern = codePatterns.some(pattern => pattern.test(changes));
    const isShort = changes.length < 500; // 500文字以下
    
    return hasCodePattern && isShort;
  }
  
  /**
   * ファイルサイズに基づく安全性チェック
   */
  isSafeToFullReplace(filePath, newContent) {
    if (!fs.existsSync(filePath)) return true;
    
    const currentSize = fs.statSync(filePath).size;
    const newSize = Buffer.from(newContent).length;
    
    // 既存ファイルが小さい、または新しいコンテンツが十分に大きい場合は安全
    return currentSize < 1000 || newSize > currentSize * 0.8;
  }
  
  /**
   * バックアップをクリーンアップ
   */
  cleanupBackups() {
    for (const [originalPath, backupPath] of this.backups) {
      try {
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
      } catch (error) {
        console.warn(`バックアップの削除に失敗: ${backupPath}`);
      }
    }
    this.backups.clear();
  }
}

module.exports = { SafeFileManager };