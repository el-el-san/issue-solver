# 工事中 - openai API 対応と環境切り替え機能追加中

# Gemini Issue Solver 
Gemini AIを使用してGitHub Issueを自動的に分析・解決する**ワークフローシステム**です。
Claude Code Actions ライクな動作を目指しています

## 🚀 機能概要

### 基本機能
- **自動Issue分析**: Issue内容とコードベースを分析
- **AI解決策生成**: Gemini AIが適切な解決策を提案
- **安全なコード実装**: 検証済みファイルの作成・修正を実行
- **PR自動作成**: 解決策をプルリクエストとして提出

## ⚡ クイックスタート

### バージョン管理について

このプロジェクトでは異なる用途に応じてバージョンを使い分けできます：

- **安定版（推奨）**: `v1.0.8` - 本番環境やエンドユーザー向け
- **開発版**: `@main` - 最新機能のテスト・開発用

### エンドユーザー向け設定（安定版）

```yaml
# .github/workflows/gemini-solver.yml
name: Issue Solver - Production

on:
  issues:
    types: [opened, labeled]

jobs:
  solve-issue:
    if: contains(github.event.issue.labels.*.name, 'solve')
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      issues: write
      pull-requests: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Solve Issue with Gemini
        uses: el-el-san/issue-solver@v1.0.8  # 安定版
        with:
          issue-number: ${{ github.event.issue.number }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          safety-mode: 'normal'
          dry-run: 'false'
          enable-review: 'true'
          run-tests: 'true'
          strict-mode: 'true'
```

### 開発者向け設定（最新版）

```yaml
# .github/workflows/gemini-solver-dev.yml
name: Issue Solver - Development

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  issues:
    types: [opened, labeled]
  issue_comment:
    types: [created]

jobs:
  test-issue-solver:
    if: |
      (github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'test-solve')) ||
      (github.event_name == 'issue_comment' && (contains(github.event.comment.body, '@gemini') || contains(github.event.comment.body, '@gpt') || contains(github.event.comment.body, '@GPT') || contains(github.event.comment.body, '@GEMINI'))) ||
      (github.event_name == 'push') ||
      (github.event_name == 'pull_request')
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      issues: write
      pull-requests: write
      actions: write
    
    steps:
      - name: Test Issue Solver with Latest Version
        uses: el-el-san/issue-solver@main  # 最新開発版
        with:
          issue-number: ${{ github.event.issue.number || github.event.issue.number || '1' }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          safety-mode: 'normal'
          dry-run: 'false'  # 開発時もファイル生成を確認
          enable-review: 'false'
          run-tests: 'true'
          run-linter: 'true'
          strict-mode: 'false'
          force-implementation: 'true'
```

### 必要なシークレット設定

Repository Settings > Secrets and variables > Actions で以下を設定:

- `GEMINI_API_KEY`: Google Gemini APIキー ([取得方法](https://ai.google.dev/))

###  AIモデルの切り替え

#### デフォルトモデル
- **gemini-2.5-pro-preview-06-05**: 高精度モデル（デフォルト）

#### モデル切り替え方法

1. **Issue コメントで指定**:
   ```
   @gemini-pro
   この問題を解決してください
   ```
   または
   ```
   @gemini model: pro
   この問題を解決してください
   ```

2. **ワークフロー実行時に指定**:
   - Actions → Run workflow → Gemini Model で選択

3. **環境変数で指定**:
   ```yaml
   # .github/workflows/gemini-solver.yml
   env:
     GEMINI_MODEL: 'gemini-2.5-pro-preview-06-05'
   ```

4. **利用可能なモデル**:
   - `gemini-2.5-pro-preview-06-05` - 高精度モデル（デフォルト）
   - `gemini-2.5-flash-preview-05-20` - 高速処理モデル

#### モデル切り替えトリガー
- `@gemini-flash` - Flash モデルを使用
- `@gemini-pro` - Pro モデルを使用
- `model: flash` - Flash モデルを使用
- `model: pro` - Pro モデルを使用
- `use flash` - Flash モデルを使用
- `use pro` - Pro モデルを使用

## 📋 使用方法

### 🔐 Gemini Issue Solver - `@gemini`

#### 手動実行
GitHub Actionsの「Enhanced Gemini Issue Solver」から：

1. **Actions** タブ → **Enhanced Gemini Issue Solver** → **Run workflow**
2. パラメーター設定：
   - **Issue番号** (必須)
   - **安全モード**: `normal`（デフォルト）, `safe`（最高セキュリティ）, `fast`（高速）
   - **ドライラン**: `true`（安全確認） / `false`（実行）
   - **レビュー有効化**: 実装前の確認フェーズ
   - **テスト実行**: 自動テスト実行の有無
   - **強制実装モード**: 低信頼度でも実装を強制

#### 自動実行
以下の方法でワークフローが自動実行されます：

- **Issue作成時**: Issue本文に `@gemini` を含める
- **コメント実行**: Issue内のコメントに `@gemini` を含める
- **ラベル付与**: `solve` ラベルを付ける
- **AIプロバイダー切り替え**: `@gpt` または `@GPT` でOpenAI GPT使用

```
@gemini

ハローワールドを .tsファイルで実装してください
```

## 📁 対応ファイル

### プログラミング言語
- **JavaScript/TypeScript**: `.js`, `.ts`, `.jsx`, `.tsx` - 構文チェック、ESLint統合
- **Python**: `.py` - Flake8対応、構文検証  
- **システム言語**: `.java`, `.cpp`, `.c`, `.go`, `.rs` - 基本ファイル操作
- **Web技術**: `.html`, `.css`, `.scss` - 構文検証対応

### 設定・ドキュメント
- **プロジェクト設定**: `package.json`, `tsconfig.json`, `requirements.txt`
- **CI/CD設定**: `.yml`, `.yaml`, `.json`
- **ドキュメント**: `.md`, `.txt`
- **シェルスクリプト**: `.sh`, `.bash`

### 自動生成される設定ファイル
- **Node.js**: `package.json`, `tsconfig.json`, `.eslintrc`
- **Python**: `requirements.txt`, `.flake8`
- **Docker**: `Dockerfile`, `docker-compose.yml`
- **GitHub Actions**: ワークフローファイル

## 🏗️ アーキテクチャ

### モジュラー設計

```
scripts/
├── enhanced-main.js         # エントリーポイント
├── enhanced-workflow.js     # セキュリティ強化ワークフロー
├── enhanced-solution-handler.js # PR作成・コメント投稿
├── safe-file-manager.js     # 安全なファイル操作
├── file-validator.js        # ファイル安全性検証
├── solution-validator.js    # Geminiレスポンス検証
├── github-actions-config.js # GitHub Actions統合
├── main.js                  # 後方互換用エントリーポイント
├── config-manager.js        # 設定管理
├── gemini-solver.js         # AI処理
├── file-analyzer.js         # ファイル分析
├── file-manager.js          # ファイル操作（後方互換）
├── report-generator.js      # レポート生成
├── repository-analyzer.js   # リポジトリ分析
├── solution-handler.js      # ソリューション処理（後方互換）
└── status-comment-manager.js # ステータスコメント管理

.github/workflows/
└── enhanced-gemini-solver.yml   # 統合ワークフロー

tests/                       # 95%+ テストカバレッジ
└── [各モジュールのユニット・統合テスト]
```

### 開発環境

```bash
# 依存関係インストール
npm install

# テスト実行
npm run test:coverage

# コード品質チェック
npm run lint
```

## 🔧 他プロジェクトでの利用

### 1. GitHub Action として使用（推奨）

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
    # Issueまたはコメントに@geminiが含まれている場合のみ実行
    if: contains(github.event.issue.body, '@gemini') || contains(github.event.comment.body, '@gemini')
    
    permissions:
      contents: write
      issues: write
      pull-requests: write
      actions: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Solve Issue with Gemini
        uses: el-el-san/issue-solver@v1.0.8
        with:
          issue-number: ${{ github.event.issue.number }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          safety-mode: 'normal'
          dry-run: 'false'
          run-tests: 'true'
          # 必要に応じて以下のオプションも設定可能:
          # gemini-model: 'gemini-2.5-pro-preview-06-05'  # 高精度モデルを使用
          # enable-review: 'false'
          # run-linter: 'false'
          # strict-mode: 'false'
          # target-files: 'src/**/*.{js,ts,py}'
          # force-implementation: 'false'
```

#### 必要なシークレット設定

Repository Settings > Secrets and variables > Actions で以下を設定:

- `GEMINI_API_KEY`: Google Gemini APIキー ([取得方法](https://ai.google.dev/))

#### 使用方法

1. 上記のworkflowファイルをリポジトリに追加
2. Gemini APIキーをシークレットに設定
3. 以下の方法で実行：
   - **Issue作成時**: Issue本文に `@gemini` を含める
   - **コメント実行**: Issue内のコメントに `@gemini` を含める
   - **モデル指定**: `@gemini-pro` や `@gemini-flash` でモデル選択
4. 自動的にIssue解決が開始されます

#### コメント実行の例
```markdown
@gemini
このログイン機能にバグがあります。修正してください。

@gemini-pro
高精度モデルでユーザー認証機能を実装してください。

@gpt
GPT-4を使ってこの問題を解決してください。

@GPT
大文字でもGPT-4を使用できます。
```



### カスタマイズ例

#### プロジェクト固有の設定
```yaml
# .github/workflows/enhanced-gemini-solver.yml
env:
  SAFETY_MODE: normal        # プロジェクトの要件に応じて
  RUN_TESTS: true           # テストの有無
  TARGET_FILES: "src/**,tests/**"  # 対象ディレクトリ限定
  TEST_COMMAND: "npm run test:unit"  # カスタムテストコマンド
```

#### 言語別プロジェクト設定
```yaml
# Python プロジェクト
env:
  LANGUAGE: python
  TEST_COMMAND: "pytest"
  LINT_COMMAND: "flake8"

# Java プロジェクト  
env:
  LANGUAGE: java
  TEST_COMMAND: "mvn test"
  BUILD_COMMAND: "mvn compile"

# TypeScript プロジェクト
env:
  LANGUAGE: typescript
  TEST_COMMAND: "npm run test"
  BUILD_COMMAND: "npm run build"
```

## 🛠️ トラブルシューティング

### 共通の問題

- **APIキーエラー**: `GEMINI_API_KEY` の設定を確認
- **権限エラー**: Repository Settings → Actions → Permissions を確認
- **解析失敗**: Issueの内容をより具体的に記述

### Enhanced Mode 特有の問題

#### "External contributor detected" 警告
- **原因**: フォークからのプルリクエストまたは外部ユーザー
- **解決**: 自動的にセキュリティが強化されます（正常動作）

#### "Dangerous pattern detected" エラー  
- **原因**: セキュリティスキャンで危険なコードを検出
- **解決**: 
  1. Issue内容を確認・修正
  2. 必要に応じて `STRICT_MODE=false` で実行
  3. `safety_mode: normal` または `fast` に変更

#### "Tests failed" エラー
- **原因**: コード変更がテストを破壊
- **解決**:
  1. `STRICT_VERIFICATION=false` で継続実行
  2. `RUN_TESTS=false` でテストをスキップ
  3. 手動でテストを修正

#### "Too many files changed" 警告
- **原因**: 100ファイル以上の変更を検出
- **解決**:
  1. `TARGET_FILES` で対象ファイルを限定
  2. Issue内容を具体化して変更範囲を絞る

## 📊 パフォーマンス & 制限

### Enhanced Mode パフォーマンス

- **実行時間**: 2-10分（Issue複雑度・安全モードによる）
- **メモリ使用量**: 通常 < 500MB
- **API呼び出し**: 1-5回（リトライ含む）
- **同時実行**: 最大3つのファイル操作
- **テスト実行**: 各フェーズ最大5分タイムアウト
- **ファイル処理**: 100ファイル未満で最適化

## 🔄 バージョン管理とリリース

### リリースプロセス

1. **安定版リリース**: Gitタグ（`v1.0.8`）を作成すると自動リリース
2. **自動ビルド**: GitHub Actionsで自動テスト・ビルド実行
3. **配布**: GitHub MarketplaceとReleasesで公開

### 使用例ファイル

- [`example-user-workflow.yml`](./example-user-workflow.yml) - エンドユーザー向け設定例
- [`example-dev-workflow.yml`](./example-dev-workflow.yml) - 開発者向け設定例
- [`.github/workflows/release.yml`](./.github/workflows/release.yml) - 自動リリース設定

### バージョン戦略

- **安定版**: タグベース（`@v1.0.8`）- 本番環境推奨
- **開発版**: ブランチベース（`@main`）- 最新機能テスト用
- **後方互換性**: `@v1`でも最新の1.x系を取得可能

## 📚 関連ドキュメント

- [`tests/`](./tests/) - テストコードとカバレッジ

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下でライセンスされています。詳細は [LICENSE](./LICENSE) ファイルを参照してください。

### サードパーティライセンス

このプロジェクトは以下のオープンソースソフトウェアを使用しています：

- **@google/genai** - Apache License 2.0
  - Copyright (c) Google LLC
  - https://www.apache.org/licenses/LICENSE-2.0
  
- **mime** - MIT License
- **jest** - MIT License  
- **eslint** - MIT License
- **@eslint/js** - MIT License

---

*Last updated: 2025/6/7*
