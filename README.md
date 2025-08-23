# AutoAI Minimal - 段階的実装

シンプルな構造から始めて、段階的に機能を追加していくChrome拡張機能です。

## ファイル構成

```
11.autoai/
├── manifest.json          # Chrome拡張機能の設定ファイル
├── popup.html             # ポップアップ（ウィンドウを開くためのトリガー）
├── popup.js               # ポップアップのスクリプト
├── background.js          # Service Workerエントリーポイント（モジュール読み込み）
├── icon.png              # 拡張機能のアイコン
└── src/                  # ソースコード（機能別に整理）
    ├── core/             # コア機能
    │   ├── main.js       # メインコントローラー（処理の中心）
    │   └── message-handler.js  # メッセージ処理
    ├── features/         # 機能モジュール
    │   ├── auth/         # 認証機能
    │   │   └── google-auth.js  # Google OAuth2認証
    │   ├── spreadsheet/  # スプレッドシート機能
    │   │   ├── config.js       # データ構造定義
    │   │   ├── reader.js       # 読み込み処理
    │   │   └── url-parser.js   # URL解析
    │   ├── task/         # タスク管理（Phase 2で実装予定）
    │   └── ai/           # AI操作（Phase 3で実装予定）
    └── ui/               # ユーザーインターフェース
        ├── ui.html       # メインUI画面
        ├── ui.css        # UIスタイル
        └── ui-controller.js  # UI制御ロジック
```

## 主な機能

### 現在実装済み（Phase 1-4 完了）
- ✅ ウィンドウ版UI（850x700px）
- ✅ Google OAuth2認証（自動認証、3.auto-aiと同様）
- ✅ スプレッドシートURL入力（動的に追加可能、gid対応）
- ✅ Google Sheets API統合
- ✅ 3.auto-aiデータ構造対応の読み込み処理
- ✅ 処理開始/停止ボタン
- ✅ ログクリア、回答削除ボタン
- ✅ ステータス表示（アニメーション付き）
- ✅ URL自動保存機能

### 実装済み（Phase 2-4）
- ✅ タスク生成・管理機能（TaskQueueManager）
- ✅ AI操作（ChatGPT, Claude, Gemini）
- ✅ 3種類AI並列処理システム（StreamProcessor）
- ✅ 4分割ウィンドウ管理（WindowService）
- ✅ Google Sheetsへの結果書き込み（SpreadsheetLogger）
- ✅ ストリーミング処理とリアルタイム結果反映

### 最新の追加機能
- ✅ **3種類AIグループ内空きポジション処理**
  - F13/G13/H13の一部に既存回答がある場合の処理改善
  - AIタイプ固定ポジション（ChatGPT=0, Claude=1, Gemini=2）
  - グループ内でどのAIが空白でも残りは正常処理

### 今後の実装予定
- 🔜 Phase 5: エラーハンドリングと停止制御強化
- 🔜 デバッグモニタリング機能の拡充

## インストール方法

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `11.autoai` フォルダを選択

## 使用方法

1. 拡張機能アイコンをクリックすると、コントロールパネルウィンドウが開きます
2. スプレッドシートURLを入力（複数可、gid付きURLも対応）
   例: `https://docs.google.com/spreadsheets/d/xxxxx/edit#gid=12345`
3. 「スプレッドシートを読み込む」をクリック
4. 「処理を開始」をクリックして実行
   - 初回実行時は自動的にGoogle認証画面が表示されます
   - 一度認証すれば、次回からは自動的に認証されます

## データ構造

スプレッドシートは3.auto-aiと同じ構造を想定：
- A列「メニュー」行：列の種類を定義（ログ、プロンプト、回答など）
- A列「行の処理」行：処理制御を定義
- A列「使うAI」行：使用するAIサービスを指定
- A列が数字の行：作業行として認識

## 開発メモ

### アーキテクチャ
- **popup.js**: 単純にUIウィンドウを開くだけ
- **background.js**: Service Workerのエントリーポイント（必要なモジュールを読み込み）
- **src/core/main.js**: メイン処理ロジック（スプレッドシート処理の制御）
- **src/core/message-handler.js**: UIからのメッセージを適切な処理に振り分け
- **src/ui/ui-controller.js**: すべてのUI制御とイベント処理

### 主要コンポーネント
- **StreamProcessor**: AI並列処理の中核システム
  - 3種類AI（ChatGPT/Claude/Gemini）の同時実行
  - 4分割ウィンドウ管理とポジション制御
  - ストリーミング処理とリアルタイム結果取得
- **WindowService**: ウィンドウ管理の統一サービス
  - 4分割レイアウト（position 0-3）
  - AI URL管理と画面情報取得
  - ウィンドウ作成・クリーンアップの一元化
- **TaskQueueManager**: タスク生成・キュー管理
- **SpreadsheetLogger**: Google Sheetsへの結果書き込み

### コードの特徴
- 関数ごとにコメントを追加
- セクションごとに区切りを設定
- エラーハンドリングを各イベントリスナーに実装
- 状態管理をシンプルに保つ

### メッセージ通信
UIとbackground.js間でやり取りされるアクション：
- `loadSpreadsheets`: URL設定とスプレッドシートデータ読み込み
- `start`: 処理開始（読み込み済みデータを使用）
- `stop`: 処理停止
- `clearLog`: ログクリア
- `deleteAnswers`: 回答削除
- `getStatus`: 現在の状態取得

### Phase 1で実装した機能
- Google OAuth2自動認証（拡張機能インストール時・Chrome起動時）
- スプレッドシートURL解析（gid対応）
- Google Sheets APIを使用したデータ読み込み
- 3.auto-aiのデータ構造に対応した解析処理
- **機能別のファイル構成に整理**（初心者にも分かりやすい構造）
- **スプレッドシート読み込みタイミングの分離**
  - 「スプレッドシートを読み込む」ボタン押下時にデータ読み込み
  - 「処理を開始」ボタン押下時は読み込み済みデータを使用
  - 読み込み結果の詳細表示（成功/失敗件数）

### なぜこの構造？
- `background.js`という名前は初心者には分かりにくいため、機能別に分割
- 各ファイルが何をするか一目で分かる（`reader.js`は読み込み、`google-auth.js`は認証など）
- 将来の拡張が簡単（新機能は新しいフォルダに追加するだけ）
- 3.auto-aiからの機能移植が容易

## 修正履歴

### 2024年12月 - 3種類AIグループ空きポジション処理修正
- **問題**: F13/G13タスクが処理されない問題
- **原因**: H13に既存回答がある場合、start3TypeBatchメソッドが不完全なグループを処理できない
- **解決**: AIタイプ固定ポジション割り当て（chatgpt=0, claude=1, gemini=2）
- **効果**: どのAIが空白でも残りのAIは正常に処理される

### ウィンドウポジション管理システム
4分割レイアウトでの固定ポジション管理：
- **Position 0**: 左上 (ChatGPT)
- **Position 1**: 右上 (Claude) 
- **Position 2**: 左下 (Gemini)
- **Position 3**: 右下 (通常処理用)