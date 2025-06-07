const fs = require('fs');

class ReportGenerator {
  constructor(solver = null, config = null) {
    this.solver = solver;
    this.config = config;
  }

  async generateReport() {
    const report = {
      issueNumber: process.env.ISSUE_NUMBER,
      issueTitle: process.env.ISSUE_TITLE,
      analysis: this.solver.issueAnalysis,
      solution: this.solver.solution,
      timestamp: new Date().toISOString(),
      phases: {
        analysis: '✅ 完了',
        planning: '✅ 完了', 
        fixes: '✅ 完了',
        report: '✅ 完了'
      }
    };
    
    if (this.config && this.config.generateReport) {
      fs.writeFileSync('issue_solution_report.json', JSON.stringify(report, null, 2));
      console.log('📋 レポートファイル生成: issue_solution_report.json');
    } else {
      console.log('📋 レポートファイル生成: スキップされました');
    }
    
    console.log('\n✅ Issue 解決完了！');
    console.log('📊 分析フェーズ: 完了');
    console.log('📝 計画フェーズ: 完了');
    console.log('🔧 修正フェーズ: 完了');
    console.log('📋 レポートフェーズ: 完了');
  }

  async generateErrorReport(error) {
    const errorReport = {
      issueNumber: process.env.ISSUE_NUMBER,
      issueTitle: process.env.ISSUE_TITLE,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      analysis: this.solver ? this.solver.issueAnalysis : null
    };
    
    fs.writeFileSync('error_report_' + process.env.ISSUE_NUMBER + '.json', JSON.stringify(errorReport, null, 2));
    console.log('Error report generated');
  }

  generateCommitMessage(solution, issueAnalysis) {
    const type = solution.type || 'fix';
    const issueNum = process.env.ISSUE_NUMBER;
    
    let prefix = 'fix';
    if (type.includes('feature')) prefix = 'feat';
    else if (type.includes('doc')) prefix = 'docs';
    else if (type.includes('enhance')) prefix = 'improve';
    
    return prefix + ': resolve issue #' + issueNum + ' - ' + issueAnalysis.title.substring(0, 50);
  }

  generatePRDescription(solution, issueAnalysis) {
    return '# 🤖 Gemini Issue 解決策\n\n' +
      'このPRは Issue #' + process.env.ISSUE_NUMBER + ' に対応します\n\n' +
      '## 📊 Issue サマリー\n' +
      '**タイトル:** ' + issueAnalysis.title + '\n' +
      '**タイプ:** ' + (solution.type || 'fix') + '\n' +
      '**信頼度:** ' + (solution.confidence || 'medium') + '\n\n' +
      '## 🔍 分析結果\n' +
      (solution.analysis || solution.description) + '\n\n' +
      '## 📝 実装計画\n' +
      (solution.planning ? solution.planning.map((step, i) => (i+1) + ". " + step).join('\n') : '計画の詳細は Issue レポートを参照') + '\n\n' +
      '## 🔧 実装された変更\n' +
      (solution.files || []).map(f => '- ' + f.action + ': `' + f.path + '` - ' + f.changes).join('\n') + '\n\n' +
      '## 🧪 テスト\n' +
      (solution.tests || '手動検証を推奨') + '\n\n' +
      '## 📋 レポート\n' +
      (solution.report || '実装が正常に完了しました。') + '\n\n' +
      '---\n' +
      'Closes #' + process.env.ISSUE_NUMBER + '\n' +
      '*Gemini Issue Solver により自動生成*';
  }
}

module.exports = { ReportGenerator };