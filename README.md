# AutoAI - AI自動化Chrome拡張機能

AIタスクを自動化し、スプレッドシートと連携して複数のAIサービス（ChatGPT、Claude、Gemini）を並列処理するChrome拡張機能です。

## 🚀 主な機能

- **複数AI並列処理**: ChatGPT、Claude、Geminiを同時に実行
- **スプレッドシート連携**: Google Sheetsとの完全統合
- **タスクグループ管理**: 複雑なタスクを効率的に処理
- **排他制御機能**: 複数PCでの同時実行を制御
- **自動ログ記録**: 実行結果を自動的にスプレッドシートに記録
- **DIコンテナ**: 依存性注入による柔軟なアーキテクチャ

## 📋 必要要件

- Google Chrome ブラウザ
- Google アカウント（Sheets API利用のため）
- Node.js 18以上（開発時のみ）

## 🛠️ インストール方法

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/11.autoai.git
cd 11.autoai
```

### 2. 依存関係のインストール（開発時）

```bash
npm install
```

### 3. Chrome拡張機能として読み込み

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. プロジェクトのルートディレクトリを選択

## 📁 プロジェクト構造

```
11.autoai/
├── manifest.json             # Chrome拡張機能マニフェスト
├── background.js             # Service Worker
├── popup.html/js            # 拡張機能ポップアップ
├── src/
│   ├── core/                # コア機能
│   │   ├── di-container.js  # 依存性注入コンテナ
│   │   ├── service-registry.js # サービス登録
│   │   ├── error-service.js # エラーハンドリング
│   │   └── interfaces/      # インターフェース定義
│   ├── services/            # ビジネスサービス
│   │   ├── auth-service.js  # 認証サービス
│   │   └── window-service.js # ウィンドウ管理
│   ├── features/            # 機能モジュール
│   │   ├── spreadsheet/     # スプレッドシート機能
│   │   │   ├── sheets-client.js # Sheets API クライアント
│   │   │   └── docs-client.js   # Docs API クライアント
│   │   ├── logging/         # ログ機能
│   │   │   └── spreadsheet-logger.js # ログ記録
│   │   └── task/           # タスク処理
│   │       └── stream-processor-v2.js # ストリーム処理
│   ├── handlers/           # イベントハンドラー
│   │   ├── message-handler.js # メッセージ処理
│   │   └── ai-task-handler.js # AIタスク処理
│   └── ui/                 # ユーザーインターフェース
│       ├── ui.html         # メインUI
│       ├── ui.css          # スタイルシート
│       └── ui-controller.js # UI制御
├── test/                   # テストコード
│   └── test-di-container.js # DIコンテナテスト
├── docs/                   # ドキュメント
│   └── DI_CONTAINER_GUIDE.md # DIコンテナガイド
└── backup_files/           # バックアップファイル

```

## 🔧 開発者向けガイド

### DIコンテナの使用

```javascript
import { getGlobalContainer } from './src/core/service-registry.js';

async function example() {
  const container = await getGlobalContainer();
  const authService = await container.get('authService');
  const token = await authService.getAuthToken();
}
```

### 新しいサービスの追加

1. サービスクラスを作成
2. `service-registry.js`に登録
3. 必要な場所でDIコンテナから取得

詳細は[DIコンテナガイド](docs/DI_CONTAINER_GUIDE.md)を参照してください。

### テストの実行

```bash
# DIコンテナのテスト
node test/test-di-container.js

# すべてのテスト（今後追加予定）
npm test
```

## 📊 設定

### スプレッドシートの準備

1. Google Sheetsで新しいスプレッドシートを作成
2. 以下の列構造を作成：
   - A列: ログ
   - B列: プロンプト
   - C-E列: AI回答（ChatGPT, Claude, Gemini）

### 拡張機能の設定

1. 拡張機能のアイコンをクリック
2. 「Open AutoAI」をクリック
3. スプレッドシートURLを入力
4. 「処理開始」をクリック

## 🚦 使用方法

### 基本的な使い方

1. **認証**: 初回起動時にGoogleアカウントでログイン
2. **スプレッドシート設定**: URLを入力して接続
3. **タスク実行**: 処理開始ボタンでタスク実行
4. **結果確認**: スプレッドシートで結果を確認

### 高度な機能

- **排他制御**: 複数PCでの同時実行を防ぐ
- **グループ処理**: タスクをグループ化して効率的に処理
- **並列実行**: 複数AIを同時に実行

## 🐛 トラブルシューティング

### よくある問題

**Q: 認証エラーが発生する**
A: Chrome拡張機能の権限を確認し、再度ログインしてください。

**Q: スプレッドシートに接続できない**
A: URLが正しいか、アクセス権限があるか確認してください。

**Q: タスクが実行されない**
A: コンソールログを確認し、エラーメッセージを確認してください。

## 📝 ライセンス

MIT License

## 🤝 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 📧 サポート

問題が発生した場合は、GitHubのissueを作成してください。

## 🔄 更新履歴

### v1.0.0 (2025-09-15)
- DIコンテナシステムの導入
- コード構造の大幅な改善（23%のコード削減）
- エラーハンドリングの統一
- 重複コードの削除
- ドキュメントの充実

### v0.9.0 (以前)
- 初期実装
- 基本的なAI連携機能
- スプレッドシート統合

## 🎯 今後の予定

- [ ] TypeScript導入
- [ ] 単体テストの充実
- [ ] CI/CDパイプラインの構築
- [ ] UIの改善
- [ ] パフォーマンス最適化
- [ ] 多言語対応