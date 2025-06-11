const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class RepositoryAnalyzer {
  async getRepositoryContext() {
    console.log('📋 リポジトリコンテキストを分析中...');
    
    try {
      const context = {
        // 基本情報
        packageInfo: this.getPackageInfo(),
        hasReadme: fs.existsSync('README.md'),
        hasSourceDir: fs.existsSync('src/'),
        hasTestDir: fs.existsSync('tests/') || fs.existsSync('test/'),
        
        // 技術スタック
        framework: this.detectFramework(),
        language: this.detectPrimaryLanguage(),
        hasTypeScript: this.hasTypeScript(),
        
        // 依存関係
        mainDependencies: this.getMainDependencies(),
        devDependencies: this.getDevDependencies(),
        
        // プロジェクト構造
        directoryStructure: this.getDirectoryStructure(),
        fileCount: this.getFileCount(),
        
        // Git情報
        recentCommits: this.getRecentCommits(),
        currentBranch: this.getCurrentBranch(),
        
        // 設定ファイル
        configFiles: this.getConfigFiles(),
        
        // プロジェクトメタデータ
        projectSize: this.assessProjectSize(),
        codeQuality: this.assessCodeQuality()
      };
      
      console.log(`✅ コンテキスト分析完了: ${context.framework || 'Unknown'} プロジェクト`);
      return context;
      
    } catch (error) {
      console.log('⚠️  リポジトリコンテキストの収集に失敗:', error.message);
      return this.getMinimalContext();
    }
  }
  
  getPackageInfo() {
    try {
      if (fs.existsSync('package.json')) {
        const packageData = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        // モジュールタイプを検出して追加
        packageData.moduleType = packageData.type === 'module' ? 'ES6' : 'CommonJS';
        return packageData;
      }
    } catch (error) {
      console.log('package.jsonの読み取りに失敗');
    }
    return null;
  }
  
  detectFramework() {
    const packageInfo = this.getPackageInfo();
    if (!packageInfo) return null;
    
    const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies };
    
    if (deps.react) return 'React';
    if (deps.vue) return 'Vue';
    if (deps.angular || deps['@angular/core']) return 'Angular';
    if (deps.express) return 'Express';
    if (deps.next) return 'Next.js';
    if (deps.nuxt) return 'Nuxt.js';
    if (deps.svelte) return 'Svelte';
    if (deps.fastapi || fs.existsSync('requirements.txt')) return 'FastAPI/Python';
    if (deps.flask) return 'Flask';
    if (deps.django) return 'Django';
    
    return null;
  }
  
  detectPrimaryLanguage() {
    const extensions = { js: 0, ts: 0, py: 0, java: 0, cpp: 0, go: 0 };
    
    try {
      const output = execSync(
        'find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.java" -o -name "*.cpp" -o -name "*.go" \\) | grep -v node_modules | grep -v .git',
        { encoding: 'utf8', timeout: 5000 }
      );
      
      output.split('\n').forEach(file => {
        const ext = file.split('.').pop();
        if (extensions.hasOwnProperty(ext)) {
          extensions[ext]++;
        }
      });
      
      const primary = Object.keys(extensions).reduce((a, b) => 
        extensions[a] > extensions[b] ? a : b
      );
      
      return extensions[primary] > 0 ? primary : null;
    } catch (error) {
      return null;
    }
  }
  
  hasTypeScript() {
    return fs.existsSync('tsconfig.json') || 
           (this.getPackageInfo()?.devDependencies?.typescript) ||
           (this.getPackageInfo()?.dependencies?.typescript);
  }
  
  getMainDependencies() {
    const packageInfo = this.getPackageInfo();
    if (!packageInfo?.dependencies) return [];
    
    return Object.keys(packageInfo.dependencies).slice(0, 10);
  }
  
  getDevDependencies() {
    const packageInfo = this.getPackageInfo();
    if (!packageInfo?.devDependencies) return [];
    
    return Object.keys(packageInfo.devDependencies).slice(0, 10);
  }
  
  getDirectoryStructure() {
    try {
      const output = execSync(
        'find . -maxdepth 3 -type d | grep -v node_modules | grep -v .git | head -20',
        { encoding: 'utf8', timeout: 3000 }
      );
      return output.trim().split('\n').filter(d => d && d !== '.');
    } catch (error) {
      return [];
    }
  }
  
  getFileCount() {
    try {
      const counts = {};
      const extensions = ['js', 'ts', 'py', 'md', 'json', 'yml', 'yaml'];
      
      extensions.forEach(ext => {
        try {
          const output = execSync(
            `find . -name "*.${ext}" | grep -v node_modules | grep -v .git | wc -l`,
            { encoding: 'utf8', timeout: 2000 }
          );
          counts[ext] = parseInt(output.trim()) || 0;
        } catch (e) {
          counts[ext] = 0;
        }
      });
      
      return counts;
    } catch (error) {
      return {};
    }
  }
  
  getRecentCommits() {
    try {
      return execSync('git log --oneline -5', { 
        encoding: 'utf8', 
        timeout: 3000 
      }).trim();
    } catch (error) {
      return 'Gitヒストリーが利用できません';
    }
  }
  
  getCurrentBranch() {
    try {
      return execSync('git branch --show-current', { 
        encoding: 'utf8', 
        timeout: 2000 
      }).trim();
    } catch (error) {
      return 'unknown';
    }
  }
  
  getConfigFiles() {
    const configFiles = [];
    const commonConfigs = [
      'tsconfig.json', 'webpack.config.js', '.eslintrc.js', '.eslintrc.json',
      'babel.config.js', 'jest.config.js', '.env', '.env.example',
      'docker-compose.yml', 'Dockerfile', 'requirements.txt', 'pyproject.toml'
    ];
    
    commonConfigs.forEach(file => {
      if (fs.existsSync(file)) {
        configFiles.push(file);
      }
    });
    
    return configFiles;
  }
  
  assessProjectSize() {
    const fileCount = this.getFileCount();
    const totalFiles = Object.values(fileCount).reduce((a, b) => a + b, 0);
    
    if (totalFiles < 10) return 'small';
    if (totalFiles < 50) return 'medium';
    if (totalFiles < 200) return 'large';
    return 'very-large';
  }
  
  assessCodeQuality() {
    const hasLinter = fs.existsSync('.eslintrc.js') || fs.existsSync('.eslintrc.json');
    const hasTests = fs.existsSync('tests/') || fs.existsSync('test/') || fs.existsSync('__tests__/');
    const hasTypeScript = this.hasTypeScript();
    const hasCI = fs.existsSync('.github/workflows/');
    
    let score = 0;
    if (hasLinter) score += 25;
    if (hasTests) score += 25;
    if (hasTypeScript) score += 25;
    if (hasCI) score += 25;
    
    if (score >= 75) return 'excellent';
    if (score >= 50) return 'good';
    if (score >= 25) return 'fair';
    return 'needs-improvement';
  }
  
  getMinimalContext() {
    return {
      packageInfo: null,
      hasReadme: fs.existsSync('README.md'),
      hasSourceDir: fs.existsSync('src/'),
      hasTestDir: false,
      framework: null,
      language: null,
      hasTypeScript: false,
      mainDependencies: [],
      devDependencies: [],
      directoryStructure: [],
      fileCount: {},
      recentCommits: 'Gitヒストリーが利用できません',
      currentBranch: 'unknown',
      configFiles: [],
      projectSize: 'unknown',
      codeQuality: 'unknown'
    };
  }
}

module.exports = { RepositoryAnalyzer };