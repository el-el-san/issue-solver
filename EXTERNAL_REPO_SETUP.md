# 別リポジトリでIssue Solverを使用する方法

## 1. 必要な準備

### API キーの取得
- **Gemini API Key**: [Google AI Studio](https://makersuite.google.com/app/apikey)から取得
- **OpenAI API Key**: [OpenAI Platform](https://platform.openai.com/api-keys)から取得（OpenAIを使用する場合）

### リポジトリのSecretsに登録
1. GitHubリポジトリの Settings → Secrets and variables → Actions に移動
2. 「New repository secret」をクリック
3. 以下のシークレットを追加：
   - `GEMINI_API_KEY`: Gemini APIキー（Geminiを使用する場合）
   - `OPENAI_API_KEY`: OpenAI APIキー（OpenAIを使用する場合）

## 2. ワークフローファイルの設置

1. リポジトリに `.github/workflows/` ディレクトリを作成
2. `issue-solver.yml` ファイルを作成（名前は任意）
3. 以下の基本設定をコピー：

```yaml
name: Issue Solver

on:
  issues:
    types: [opened, labeled]
  issue_comment:
    types: [created]

jobs:
  solve-issue:
    if: |
      (github.event_name == 'issues' && (
        contains(github.event.issue.labels.*.name, 'test-solve') ||
        contains(github.event.issue.body, '@gemini') ||
        contains(github.event.issue.body, '@gpt')
      )) ||
      (github.event_name == 'issue_comment' && (
        contains(github.event.comment.body, '@gemini') ||
        contains(github.event.comment.body, '@gpt')
      ))
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      issues: write
      pull-requests: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Run Issue Solver
        uses: el-el-san/issue-solver@main
        with:
          issue-number: ${{ github.event.issue.number || github.event.issue.number }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## 3. トリガー方法

### 方法1: Issueにラベルを付ける
- `test-solve` ラベルをIssueに追加

### 方法2: メンションを使用
- Issue本文またはコメントに以下のいずれかを記載：
  - `@gemini` - Gemini AIを使用
  - `@gpt` - OpenAI GPTを使用

## 4. カスタマイズオプション

### 安全性の設定
```yaml
safety-mode: 'strict'   # より安全（制限的）
safety-mode: 'normal'   # バランス型（デフォルト）
safety-mode: 'relaxed'  # より柔軟
```

### 実行モードの設定
```yaml
dry-run: 'true'         # ファイルを変更せずに動作確認
enable-review: 'true'   # 変更前に確認を要求
```

### テストとリンターの設定
```yaml
run-tests: 'true'       # テストを実行
run-linter: 'true'      # リンターを実行
test-command: 'npm test' # カスタムテストコマンド
```

### AIモデルの指定
```yaml
# Geminiモデルの指定
gemini-model: 'gemini-2.5-flash-preview-05-20'

# OpenAIモデルの指定
openai-model: 'gpt-4o-mini'
```

## 5. 注意事項

1. **権限設定**: ワークフローには適切な権限（contents: write）が必要です
2. **APIキーの管理**: APIキーは必ずSecretsに保存し、直接ワークフローファイルに記載しないでください
3. **コスト管理**: API使用量に応じて料金が発生する場合があります
4. **ブランチ保護**: mainブランチなど重要なブランチには保護ルールを設定することを推奨

## 6. トラブルシューティング

### エラー: "No issue number found"
- `issue-number` パラメータが正しく設定されているか確認
- イベントタイプ（issues, issue_comment）に応じた適切な参照を使用

### エラー: "API key not found"
- Secretsに正しくAPIキーが登録されているか確認
- Secret名のタイポがないか確認

### エラー: "Permission denied"
- ワークフローの`permissions`セクションを確認
- リポジトリの設定でActions権限が適切に設定されているか確認