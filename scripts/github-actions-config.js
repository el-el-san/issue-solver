/**
 * GitHub Actions specific configuration and utilities
 */

class GitHubActionsConfig {
  constructor() {
    this.isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
    this.runner = process.env.RUNNER_OS;
    this.workspace = process.env.GITHUB_WORKSPACE;
    this.repository = process.env.GITHUB_REPOSITORY;
    this.actor = process.env.GITHUB_ACTOR;
    this.eventName = process.env.GITHUB_EVENT_NAME;
  }

  /**
   * GitHub Actions環境に適応した設定を適用
   */
  adaptForGitHubActions(config) {
    if (!this.isGitHubActions) {
      return config;
    }

    console.log('🔧 GitHub Actions環境を検出、設定を調整中...');

    // GitHub Actions特有の制約に対応
    const adaptedConfig = { ...config };

    // タイムアウトをGitHub Actionsの制限に合わせる
    adaptedConfig.geminiTimeout = Math.min(
      adaptedConfig.geminiTimeout, 
      330000 // 5.5分（GitHub Actionsの6分制限を考慮）
    );

    // 並列処理を制限（リソース使用量を考慮）
    adaptedConfig.maxConcurrentOperations = 3;

    // ログレベルを調整
    adaptedConfig.logLevel = process.env.RUNNER_DEBUG ? 'debug' : 'info';

    // セキュリティ設定を強化（外部コントリビューターの場合）
    if (this.isExternalContributor()) {
      console.log('⚠️ 外部コントリビューターを検出、セキュリティを強化');
      adaptedConfig.strictMode = true;
      adaptedConfig.dryRun = true;
      adaptedConfig.enableReview = true;
    }

    // プルリクエストイベントの場合は追加の安全性
    if (this.eventName === 'pull_request' || this.eventName === 'pull_request_target') {
      console.log('🔒 プルリクエストイベント、安全性を向上');
      adaptedConfig.strictMode = true;
      adaptedConfig.keepBackups = true;
    }

    return adaptedConfig;
  }

  /**
   * 外部コントリビューターかどうかを判定
   */
  isExternalContributor() {
    if (!this.repository || !this.actor) {
      return true; // 安全側に倒す
    }

    const [owner] = this.repository.split('/');
    return owner !== this.actor;
  }

  /**
   * GitHub Actionsの出力を設定
   */
  setOutput(name, value) {
    if (this.isGitHubActions) {
      console.log(`::set-output name=${name}::${value}`);
    }
  }

  /**
   * GitHub Actionsの警告を出力
   */
  warning(message, file = null, line = null) {
    if (this.isGitHubActions) {
      let output = `::warning`;
      if (file) output += ` file=${file}`;
      if (line) output += `,line=${line}`;
      output += `::${message}`;
      console.log(output);
    } else {
      console.warn('⚠️', message);
    }
  }

  /**
   * GitHub Actionsのエラーを出力
   */
  error(message, file = null, line = null) {
    if (this.isGitHubActions) {
      let output = `::error`;
      if (file) output += ` file=${file}`;
      if (line) output += `,line=${line}`;
      output += `::${message}`;
      console.log(output);
    } else {
      console.error('❌', message);
    }
  }

  /**
   * GitHub Actionsのデバッグメッセージを出力
   */
  debug(message) {
    if (this.isGitHubActions) {
      console.log(`::debug::${message}`);
    } else if (process.env.DEBUG) {
      console.log('🐛', message);
    }
  }

  /**
   * GitHub Actionsのグループを開始
   */
  startGroup(name) {
    if (this.isGitHubActions) {
      console.log(`::group::${name}`);
    } else {
      console.log(`\n📋 ${name}`);
    }
  }

  /**
   * GitHub Actionsのグループを終了
   */
  endGroup() {
    if (this.isGitHubActions) {
      console.log('::endgroup::');
    }
  }

  /**
   * GitHub Actionsのマスクを設定（秘密情報を隠す）
   */
  mask(value) {
    if (this.isGitHubActions) {
      console.log(`::add-mask::${value}`);
    }
  }

  /**
   * ワークフローの進行状況をサマリーに追加
   */
  addSummary(content) {
    if (this.isGitHubActions && process.env.GITHUB_STEP_SUMMARY) {
      const fs = require('fs');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, content + '\n');
    }
  }

  /**
   * アーティファクトのパスを生成
   */
  getArtifactPath(filename) {
    if (this.workspace) {
      return require('path').join(this.workspace, filename);
    }
    return filename;
  }

  /**
   * リソース使用量の監視
   */
  monitorResources() {
    if (!this.isGitHubActions) return;

    const usage = process.memoryUsage();
    const memoryMB = Math.round(usage.heapUsed / 1024 / 1024);
    
    this.debug(`Memory usage: ${memoryMB}MB`);
    
    // メモリ使用量が多い場合は警告
    if (memoryMB > 1000) {
      this.warning(`High memory usage detected: ${memoryMB}MB`);
    }
  }

  /**
   * 実行時間の監視
   */
  createTimer(name) {
    const startTime = Date.now();
    
    return {
      end: () => {
        const duration = Date.now() - startTime;
        this.debug(`${name} completed in ${duration}ms`);
        
        // GitHub Actions job制限時間の警告
        if (duration > 300000) { // 5分
          this.warning(`${name} took longer than 5 minutes (${Math.round(duration/1000)}s)`);
        }
        
        return duration;
      }
    };
  }

  /**
   * セキュリティチェック
   */
  performSecurityCheck() {
    this.startGroup('Security Check');
    
    try {
      // 環境変数の機密情報チェック
      const sensitiveEnvVars = Object.keys(process.env).filter(key => 
        key.toLowerCase().includes('key') || 
        key.toLowerCase().includes('token') || 
        key.toLowerCase().includes('secret')
      );
      
      sensitiveEnvVars.forEach(key => {
        if (process.env[key]) {
          this.mask(process.env[key]);
          this.debug(`Masked sensitive environment variable: ${key}`);
        }
      });
      
      // リポジトリの権限チェック
      if (this.isExternalContributor()) {
        this.warning('External contributor detected - enhanced security measures active');
      }
      
      // 危険なファイルパターンのチェック
      const fs = require('fs');
      const path = require('path');
      
      const dangerousFiles = ['.env', '.env.local', '.env.production'];
      dangerousFiles.forEach(file => {
        if (fs.existsSync(file)) {
          this.warning(`Potentially sensitive file detected: ${file}`);
        }
      });
      
      console.log('✅ Security check completed');
      
    } catch (error) {
      this.error(`Security check failed: ${error.message}`);
    } finally {
      this.endGroup();
    }
  }
}

module.exports = { GitHubActionsConfig };