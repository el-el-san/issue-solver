#　工事中
#　一応動きますがなんだか動作が変です。。

# Issue Solver 
AIを使用してGitHub Issueを自動的に分析・解決する**ワークフローシステム**です。
Claude Code Actions ライクな動作を目指しています

## 🚀 機能概要

### 基本機能
- **自動Issue分析**: Issue内容とコードベースを分析
- **AI解決策生成**: AIが適切な解決策を提案
- **安全なコード実装**: 検証済みファイルの作成・修正を実行
- **PR自動作成**: 解決策をプルリクエストとして提出

## ⚡ クイックスタート

### バージョン管理について

このプロジェクトでは異なる用途に応じてバージョンを使い分けできます：

- **安定版（推奨）**: `v1.0.9` - 本番環境やエンドユーザー向け
- **開発版**: `@main` - 最新機能のテスト・開発用

### エンドユーザー向け設定（安定版）

```yaml
# .github/workflows/issue-solver.yml
name: Issue Solver - Production

on:
  issues:
    types: [opened, labeled]
  issue_comment:
    types: [created]

jobs:
  solve-issue:
    if: |
      (github.event_name == 'issues' && (
        contains(github.event.issue.labels.*.name, 'solve') ||
        contains(github.event.issue.body, '@gemini') ||
        contains(github.event.issue.body, '@gpt') ||
        contains(github.event.issue.body, '@gpt-o3')
      )) ||
      (github.event_name == 'issue_comment' && (
        contains(github.event.comment.body, '@gemini') ||
        contains(github.event.comment.body, '@gpt') ||
        contains(github.event.comment.body, '@gpt-o3')
      ))
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      issues: write
      pull-requests: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Solve Issue with AI
        uses: el-el-san/issue-solver@v1.0.9  # 安定版
        with:
          issue-number: ${{ github.event.issue.number || github.event.comment.issue.number }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
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
      (github.event_name == 'issues' && (
        contains(github.event.issue.labels.*.name, 'test-solve') ||
        contains(github.event.issue.body, '@gemini') ||
        contains(github.event.issue.body, '@gemini-pro') ||
        contains(github.event.issue.body, '@gemini-flash') ||
        contains(github.event.issue.body, '@gpt') ||
        contains(github.event.issue.body, '@gpt-o3') ||
        contains(github.event.issue.body, '@GPT') ||
        contains(github.event.issue.body, '@GEMINI')
      )) ||
      (github.event_name == 'issue_comment' && (
        contains(github.event.comment.body, '@gemini') ||
        contains(github.event.comment.body, '@gemini-pro') ||
        contains(github.event.comment.body, '@gemini-flash') ||
        contains(github.event.comment.body, '@gpt') ||
        contains(github.event.comment.body, '@gpt-o3') ||
        contains(github.event.comment.body, '@GPT') ||
        contains(github.event.comment.body, '@GEMINI')
      ))
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      issues: write
      pull-requests: write
      actions: write
    
    steps:
      - name: Debug Event Information
        run: |
          echo "Event name: ${{ github.event_name }}"
          echo "Event action: ${{ github.event.action }}"
          if [ "${{ github.event_name }}" = "issue_comment" ]; then
            echo "Issue number: ${{ github.event.comment.issue.number }}"
            echo "Comment body: ${{ github.event.comment.body }}"
            echo "Comment author: ${{ github.event.comment.user.login }}"
          elif [ "${{ github.event_name }}" = "issues" ]; then
            echo "Issue number: ${{ github.event.issue.number }}"
            echo "Issue body: ${{ github.event.issue.body }}"
          fi
          echo "Repository: ${{ github.repository }}"
          echo "Actor: ${{ github.actor }}"
          
          # Validate issue number is available for issue-related events
          if [ "${{ github.event_name }}" = "issue_comment" ] || [ "${{ github.event_name }}" = "issues" ]; then
            ISSUE_NUM="${{ github.event_name == 'issue_comment' && github.event.comment.issue.number || github.event.issue.number }}"
            if [ -z "$ISSUE_NUM" ]; then
              echo "ERROR: No issue number found for this event"
              exit 1
            fi
            echo "Using issue number: $ISSUE_NUM"
          else
            echo "Non-issue event - using test issue number: ${{ github.run_number }}"
          fi
    
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Test Issue Solver with Latest Version
        uses: el-el-san/issue-solver@main  # 最新開発版
        with:
          issue-number: ${{ (github.event_name == 'issue_comment' && github.event.comment.issue.number) || (github.event_name == 'issues' && github.event.issue.number) || github.run_number }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
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
- `OPENAI_API_KEY`: OpenAI APIキー ([取得方法](https://platform.openai.com/api-keys))

###  AIモデルの切り替え

#### モデル切り替え方法

1. **Issue コメントで指定**:
   ```
   @gemini
   この問題を解決してください
   ```
   または
   ```
   @gpt
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
   - `gemini-2.5-flash-preview-05-20` - 高速処理モデル（デフォルト）
   - `gemini-2.5-pro-preview-06-05` - 高精度モデル
#### モデル切り替えトリガー
- `@gemini` - Flash モデルを使用
- `@gpt` - codex モデルを使用
- `@gpt-o3` - o3モデルを使用

## 📋 使用方法

### 🔐 Gemini Issue Solver - `@gemini`

#### 自動実行
以下の方法でワークフローが自動実行されます：

- **Issue作成時**: Issue本文に `@gemini` を含める
- **コメント実行**: Issue内のコメントに `@gemini` を含める
- **ラベル付与**: `solve` ラベルを付ける
- **AIプロバイダー切り替え**: `@gpt` でOpenAI GPT使用

```
@gemini

ハローワールドを .tsファイルで実装してください
```


### 🔧 OpenAI GPT Issue Solver - `@gpt`

#### OpenAIモデル切り替え

**デフォルトモデル**: `codex-mini-latest` - コスト効率重視の高性能モデル

#### OpenAIモデル切り替え方法

1. **Issue コメント・本文で指定**:
   ```
   @gpt-o3
   複雑な問題を解決してください
   ```
   
2. **利用可能なOpenAIモデル**:
   - `codex-mini-latest` - デフォルト、コスト効率重視
   - `o3-2025-04-16` - 最新の高性能推論モデル（`@gpt-o3`で指定）
   - `gpt-4o` - 汎用高性能モデル
   - `gpt-4o-mini` - 軽量版
   - `o3-mini` - 推論特化軽量版

#### OpenAIモデル切り替えトリガー
- `@gpt-o3` - O3モデル（o3-2025-04-16）を使用
- `@gpt` - デフォルトモデル（codex-mini-latest）を使用


#### 使用例
```
@gpt-o3
数学的推論が必要な複雑なアルゴリズムを実装してください
```

```
@gpt
シンプルなハローワールドアプリケーションを作成してください
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

#### 必要なシークレット設定

Repository Settings > Secrets and variables > Actions で以下を設定:

- `GEMINI_API_KEY`: Google Gemini APIキー ([取得方法](https://ai.google.dev/))
- `OPENAI_API_KEY`: OpenAI APIキー ([取得方法](https://platform.openai.com/api-keys))

#### 使用方法

1. 上記のworkflowファイルをリポジトリに追加
2. 必要なAPIキーをシークレットに設定
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

*Last updated: 2025/6/11*
