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

### 1. 設定
```bash
# 1. GEMINI_API_KEYをSecretsに設定
#    Repository Settings → Secrets and Variables → Actions
#    Name: GEMINI_API_KEY
#    Value: [Google AI Studioで取得したAPIキー]

# 2. ワークフローファイルを確認
.github/workflows/enhanced-gemini-solver.yml
```

### 2. 初回実行（推奨）
```bash
# GitHub ActionsのWorkflowタブで手動実行
Actions → Enhanced Gemini Issue Solver → Run workflow

# パラメーター設定:
Issue Number: [解決したいIssue番号]
Gemini Model: gemini-2.5-pro-preview-06-05 (デフォルト)
Safety Mode: safe
Dry Run: true ✅
```

### 3. 実際の実行
初回確認後、`Dry Run: false` で実際のファイル変更を実行

###  AIモデルの切り替え

#### デフォルトモデル
- **gemini-2.5-pro-preview-06-05**: 高精度・高品質な実装（デフォルト）

#### モデル切り替え方法

1. **Issue コメントで指定**:
   ```
   @gemini-flash
   この問題を解決してください
   ```
   または
   ```
   @gemini model: flash
   この問題を解決してください
   ```

2. **ワークフロー実行時に指定**:
   - Actions → Run workflow → Gemini Model で選択

3. **利用可能なモデル**:
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
- **コメント**: `@gemini` をコメントに含める  
- **ラベル付与**: `gemini-auto` または `ai-assistance` ラベルを付ける

```
@gemini

ハローワールドを .tsファイルで実装してください
```

## ⚙️ 設定要件

### 必要なシークレット
- `GEMINI_API_KEY`: [Google AI Studio](https://makersuite.google.com/app/apikey)で取得
- `GITHUB_TOKEN`: 自動設定（手動設定不要）

### 必要な権限
- `contents: write` - ファイルの読み書き
- `pull-requests: write` - プルリクエストの作成  
- `issues: write` - Issueへのコメント
- `actions: write` - GitHub Actionsワークフローファイルの作成

### 🔧 設定オプション

環境変数で動作をカスタマイズ可能：

```bash
# セキュリティ設定
DRY_RUN=false                    # ドライランモード
STRICT_MODE=false               # 厳密モード（エラー時即停止）
STRICT_VERIFICATION=true        # テスト/リント失敗時の停止
KEEP_BACKUPS=true              # バックアップファイル保持

# ワークフロー設定  
ENABLE_REVIEW=false             # 実装前レビューフェーズ
RUN_TESTS=true                 # 自動テスト実行
RUN_LINTER=false               # リンター実行
GENERATE_REPORT=true           # レポートファイル生成

# モード設定
EXECUTION_MODE=enhanced        # enhanced, legacy, auto
ENABLE_ENHANCED=true           # Enhanced機能の有効化
```

## 🔄 ワークフロー処理（7段階プロセス）

1. **🔒 Security Check**: セキュリティ検証とリスク評価
2. **📊 Analysis**: Issue内容とリポジトリコンテキストを分析
3. **📝 Planning**: Gemini AIが解決策を生成・検証
4. **👀 Review** (オプション): 解決策の事前レビュー
5. **🔧 Implementation**: 安全なファイル変更の実行
6. **🧪 Verification**: テスト・リント・構文チェック（失敗時は再分析・再実装）
7. **📋 Reporting**: レポート生成、PR作成、Issueコメント投稿

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
        uses: el-el-san/issue-solver@v1
        with:
          issue-number: ${{ github.event.issue.number }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          safety-mode: 'normal'
          dry-run: 'false'
          run-tests: 'true'
          # 必要に応じて以下のオプションも設定可能:
          # gemini-model: 'gemini-2.5-pro-preview-06-05'
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
3. Issue本文またはコメントに `@gemini` を含めて投稿
4. 自動的にIssue解決が開始されます

### 2. Git Submodule

```bash
# issue-solverをサブモジュールとして追加
git submodule add https://github.com/el-el-san/issue-solver.git .github/gemini-solver
cd .github/gemini-solver && npm install

# ワークフローをコピー
cp .github/gemini-solver/.github/workflows/enhanced-gemini-solver.yml .github/workflows/
```

### 3. GitHub Template

このリポジトリを「Use this template」でテンプレート化

### 4. カスタマイズ例

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

### 🔧 高度なデバッグ方法

#### 詳細ログの有効化
```bash
# GitHub Actions詳細ログ
RUNNER_DEBUG=1

# アプリケーションレベル
DEBUG=true

# ファイル操作の確認
ls -la .gemini-backups/    # バックアップファイル確認
cat issue_*_report.json    # 実行レポート確認
```

#### ステップ別デバッグ
```yaml
# ワークフロー設定でデバッグ有効化
env:
  RUNNER_DEBUG: 1
  GITHUB_ACTIONS_STEP_DEBUG: true
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true
```

#### エラー別対処法
| エラーメッセージ | 原因 | 解決方法 |
|---|---|---|
| `Too many files changed (100+)` | 大量ファイル変更検出 | `TARGET_FILES="src/**"`で対象限定 |
| `Tests failed repeatedly (3/3)` | テスト失敗リトライ上限 | `STRICT_VERIFICATION=false`で継続 |
| `Dangerous pattern detected` | セキュリティスキャン検出 | `SAFETY_MODE=fast`で緩和 |
| `No meaningful files to commit` | レポートファイルのみ生成 | 正常動作（分析のみ完了） |
| `File already exists` | ファイル上書き保護 | `FORCE_OVERWRITE=true`で許可 |

### リカバリ手順

1. **バックアップからの復元**: 自動生成されたバックアップブランチから復元
2. **アーティファクト確認**: GitHub Actionsのアーティファクトからエラーレポートをダウンロード
3. **段階的実行**: `dry_run: true` で事前確認後に実行

## 📊 パフォーマンス & 制限

### Enhanced Mode パフォーマンス

- **実行時間**: 2-10分（Issue複雑度・安全モードによる）
- **メモリ使用量**: 通常 < 500MB
- **API呼び出し**: 1-5回（リトライ含む）
- **同時実行**: 最大3つのファイル操作
- **テスト実行**: 各フェーズ最大5分タイムアウト
- **ファイル処理**: 100ファイル未満で最適化

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

各依存関係の詳細なライセンス情報は、`node_modules` 内の各パッケージディレクトリに含まれています。

---

*Last updated: 2025/6/5 - 品質改善・デバッグ強化・実装詳細化完了*
