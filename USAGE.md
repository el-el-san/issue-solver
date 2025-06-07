# GitHub Action として Gemini Issue Solver を使用する方法

## 基本的な使用方法

### 1. GitHub Action として他のリポジトリで使用

```yaml
# .github/workflows/gemini-solver.yml
name: Gemini Issue Solver
on:
  issues:
    types: [opened, edited]
  issue_comment:
    types: [created]

jobs:
  solve-issue:
    runs-on: ubuntu-latest
    if: contains(github.event.issue.body, '@gemini') || contains(github.event.comment.body, '@gemini')
    steps:
      - uses: actions/checkout@v4
      
      - name: Solve Issue with Gemini
        uses: el-el-san/issue-solver-dev@v1
        with:
          issue-number: ${{ github.event.issue.number }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 2. 詳細設定付きの使用例

```yaml
- name: Solve Issue with Gemini (Advanced)
  uses: el-el-san/issue-solver-dev@v1
  with:
    issue-number: ${{ github.event.issue.number }}
    gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    safety-mode: 'safe'                    # safe, normal, fast
    dry-run: 'false'                       # true で変更なし確認のみ
    gemini-model: 'gemini-2.5-pro-preview-06-05'
    enable-review: 'true'                  # 実装前のレビューフェーズ
    run-tests: 'true'                      # テスト実行
    run-linter: 'false'                    # リンター実行
    strict-mode: 'false'                   # 厳密モード
    target-files: 'src/**,tests/**'       # 対象ファイル限定
    force-implementation: 'false'          # 低信頼度でも強制実装
```

## セットアップ手順

### 1. シークレットの設定

Repository Settings → Secrets and Variables → Actions で以下を設定：

- `GEMINI_API_KEY`: [Google AI Studio](https://makersuite.google.com/app/apikey) で取得
- `GITHUB_TOKEN`: 自動で利用可能（手動設定不要）

### 2. 権限の設定

Repository Settings → Actions → General → Workflow permissions で以下を有効化：

- Read and write permissions
- Allow GitHub Actions to create and approve pull requests

### 3. ワークフローファイルの作成

上記のYAMLファイルを `.github/workflows/gemini-solver.yml` として保存

## 使用例

### Issue作成時の自動実行

```markdown
@gemini

ログイン機能を追加してください。以下の要件で実装をお願いします：

- ユーザー名とパスワードによる認証
- セッション管理
- ログアウト機能
- TypeScriptで実装
```

### コメントでの実行

```markdown
@gemini model: flash

このバグを修正してください：
ボタンクリック時にエラーが発生します
```

## 出力の確認

### Action の出力

```yaml
- name: Check Results
  run: |
    echo "Success: ${{ steps.gemini-solver.outputs.success }}"
    echo "PR URL: ${{ steps.gemini-solver.outputs.pr-url }}"
    echo "Files Changed: ${{ steps.gemini-solver.outputs.files-changed }}"
    echo "Confidence: ${{ steps.gemini-solver.outputs.confidence-score }}"
```

### 条件付き実行

```yaml
- name: Notify on Success
  if: steps.gemini-solver.outputs.success == 'true'
  run: echo "Issue was successfully solved!"

- name: Handle Failure
  if: steps.gemini-solver.outputs.success == 'false'
  run: echo "Issue solving failed or was partial"
```

## プロジェクト固有の設定

### Node.js プロジェクト

```yaml
env:
  RUN_TESTS: 'true'
  TEST_COMMAND: 'npm test'
  RUN_LINTER: 'true'
  LINT_COMMAND: 'npm run lint'
```

### Python プロジェクト

```yaml
env:
  RUN_TESTS: 'true'  
  TEST_COMMAND: 'pytest'
  RUN_LINTER: 'true'
  LINT_COMMAND: 'flake8'
```

### 複数言語プロジェクト

```yaml
- name: Setup for Multi-Language
  uses: el-el-san/issue-solver-dev@v1
  with:
    target-files: 'src/**/*.{js,ts,py}'
    run-tests: 'true'
```

## トラブルシューティング

### よくある問題

1. **API キーエラー**
   - `GEMINI_API_KEY` の設定を確認
   - APIキーの有効性を確認

2. **権限エラー**
   - Repository permissions の設定を確認
   - `GITHUB_TOKEN` の権限を確認

3. **トリガーが動作しない**
   - Issue本文やコメントに `@gemini` が含まれているか確認
   - ワークフローファイルの条件式を確認

### デバッグ方法

```yaml
- name: Debug Mode
  uses: el-el-san/issue-solver-dev@v1
  with:
    dry-run: 'true'
    strict-mode: 'false'
  env:
    RUNNER_DEBUG: 1
```

## バージョン管理

### 特定バージョンの使用

```yaml
uses: el-el-san/issue-solver-dev@v1.2.3  # 特定バージョン
uses: el-el-san/issue-solver-dev@main      # 最新版（開発中）
```

### アップデート確認

定期的に最新バージョンをチェックし、新機能やバグ修正を適用してください。