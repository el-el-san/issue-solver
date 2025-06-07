/**
 * Geminiのソリューションレスポンスを検証し、安全性を確保
 */
class SolutionValidator {
  /**
   * ソリューション全体を検証
   */
  validateSolution(solution) {
    const errors = [];
    const warnings = [];

    // 基本構造の検証
    if (!solution || typeof solution !== 'object') {
      errors.push('ソリューションはオブジェクトである必要があります');
      return { valid: false, errors, warnings };
    }

    // ファイル操作の検証
    if (solution.files && Array.isArray(solution.files)) {
      solution.files.forEach((file, index) => {
        const fileValidation = this.validateFileAction(file, index);
        errors.push(...fileValidation.errors);
        warnings.push(...fileValidation.warnings);
      });
    }

    // implementation フィールドの警告
    if (solution.implementation && typeof solution.implementation === 'string' && solution.implementation.length > 50) {
      warnings.push('solution.implementation は非推奨です。files配列で具体的なファイル操作を指定してください');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 個別のファイルアクションを検証
   */
  validateFileAction(fileAction, index) {
    const errors = [];
    const warnings = [];
    const prefix = `files[${index}]`;

    // 必須フィールドの確認
    if (!fileAction.path) {
      errors.push(`${prefix}: pathフィールドは必須です`);
    }

    if (!fileAction.action) {
      errors.push(`${prefix}: actionフィールドは必須です`);
    } else if (!['create', 'modify', 'delete'].includes(fileAction.action)) {
      errors.push(`${prefix}: actionは create/modify/delete のいずれかである必要があります`);
    }

    // modifyアクションの検証
    if (fileAction.action === 'modify') {
      if (!fileAction.content && !fileAction.changes) {
        errors.push(`${prefix}: modifyアクションにはcontentまたはchangesが必要です`);
      }

      if (fileAction.content) {
        const contentValidation = this.validateModifyContent(fileAction.content);
        if (!contentValidation.valid) {
          errors.push(`${prefix}: ${contentValidation.error}`);
        }
      }
    }

    // createアクションの検証
    if (fileAction.action === 'create') {
      if (!fileAction.content) {
        errors.push(`${prefix}: createアクションにはcontentが必要です`);
      }
    }

    return { errors, warnings };
  }

  /**
   * modifyアクションのcontentを検証
   */
  validateModifyContent(content) {
    // 文字列の場合はエラー（全置換を防ぐ）
    if (typeof content === 'string') {
      return {
        valid: false,
        error: 'modifyアクションでは文字列contentは許可されません。{type: "append/prepend/replace", ...} 形式を使用してください'
      };
    }

    // オブジェクトの場合は型を検証
    if (typeof content === 'object' && content !== null) {
      if (!content.type) {
        return {
          valid: false,
          error: 'content.typeは必須です (append/prepend/replace)'
        };
      }

      if (!['append', 'prepend', 'replace'].includes(content.type)) {
        return {
          valid: false,
          error: 'content.typeは append/prepend/replace のいずれかである必要があります'
        };
      }

      // 各タイプ固有の検証
      switch (content.type) {
        case 'append':
        case 'prepend':
          if (typeof content.content !== 'string') {
            return {
              valid: false,
              error: `${content.type}操作にはcontent.contentが文字列として必要です`
            };
          }
          break;

        case 'replace':
          if (typeof content.from !== 'string' || typeof content.to !== 'string') {
            return {
              valid: false,
              error: 'replace操作にはcontent.fromとcontent.toが文字列として必要です'
            };
          }
          break;
      }

      return { valid: true };
    }

    return {
      valid: false,
      error: 'modifyアクションのcontentは適切なオブジェクト形式である必要があります'
    };
  }

  /**
   * ソリューションを安全に変換（レガシー互換性のため）
   */
  transformLegacySolution(solution) {
    const transformed = { ...solution };

    // implementationフィールドがある場合、files配列に変換
    if (solution.implementation && typeof solution.implementation === 'string') {
      console.warn('⚠️  solution.implementationを検出。より安全なfiles形式に変換します');
      
      // 既存のfilesがない場合は初期化
      if (!transformed.files) {
        transformed.files = [];
      }

      // implementationの内容から適切なファイル操作を推測
      // これは簡易的な変換で、実際の使用には注意が必要
      transformed.files.push({
        path: 'implementation.md',
        action: 'create',
        changes: 'Gemini実装の保存',
        content: solution.implementation
      });

      // 元のimplementationフィールドは削除
      delete transformed.implementation;
    }

    return transformed;
  }
}

module.exports = { SolutionValidator };