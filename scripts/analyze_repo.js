const { RepositoryAnalyzer } = require('./repository-analyzer');
const { FileAnalyzer } = require('./file-analyzer');
const fs = require('fs');
const path = require('path');

class RepoAnalyzer {
  constructor() {
    this.repositoryAnalyzer = new RepositoryAnalyzer();
    this.fileAnalyzer = new FileAnalyzer();
  }

  /**
   * リポジトリの包括的な分析を実行
   */
  async analyzeRepository() {
    console.log('🔍 リポジトリ分析を開始...');
    
    try {
      // 基本的なリポジトリコンテキストの取得
      const context = await this.repositoryAnalyzer.getRepositoryContext();
      
      // ファイル分析の実行
      const files = this.getRelevantFiles();
      const fileAnalysis = await this.analyzeFiles(files);
      
      // 分析結果のまとめ
      const analysis = {
        repository: context,
        files: fileAnalysis,
        summary: this.generateSummary(context, fileAnalysis),
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ リポジトリ分析が完了しました');
      return analysis;
    } catch (error) {
      console.error('❌ リポジトリ分析でエラーが発生:', error.message);
      throw error;
    }
  }

  /**
   * 関連ファイルを取得
   */
  getRelevantFiles() {
    const relevantExtensions = ['.js', '.json', '.md', '.ts', '.jsx', '.tsx'];
    const files = [];
    
    const scanDirectory = (dir) => {
      if (!fs.existsSync(dir) || dir.includes('node_modules')) return;
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (relevantExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };
    
    scanDirectory('./');
    return files.slice(0, 20); // 最大20ファイルに制限
  }

  /**
   * ファイルの分析を実行
   */
  async analyzeFiles(filePaths) {
    const analysis = [];
    
    for (const filePath of filePaths) {
      try {
        const result = await this.fileAnalyzer.analyzeFile(filePath);
        analysis.push({
          path: filePath,
          ...result
        });
      } catch (error) {
        console.warn(`Warning: ${filePath}の分析をスキップ: ${error.message}`);
      }
    }
    
    return analysis;
  }

  /**
   * 分析結果のサマリーを生成
   */
  generateSummary(context, fileAnalysis) {
    const totalFiles = fileAnalysis.length;
    const fileTypes = {};
    const complexityLevels = { low: 0, medium: 0, high: 0 };
    
    fileAnalysis.forEach(file => {
      const ext = path.extname(file.path);
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      
      if (file.complexity) {
        complexityLevels[file.complexity]++;
      }
    });
    
    return {
      projectType: context.framework || context.language || 'Unknown',
      totalFiles,
      fileTypes,
      complexity: complexityLevels,
      hasTests: context.hasTestDir,
      dependencies: Object.keys(context.mainDependencies || {}).length
    };
  }
}

module.exports = { RepoAnalyzer };