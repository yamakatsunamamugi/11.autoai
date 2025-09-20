# 開発者ガイド

## 🎯 開発環境のセットアップ

### 必要なツール

- Node.js 18.0.0以上
- npm 8.0.0以上
- Google Chrome 最新版
- Git
- VS Code（推奨）

### 初期設定

1. **リポジトリのクローン**
```bash
git clone https://github.com/yamakatsunamamugi/11.autoai.git
cd 11.autoai
```

2. **依存関係のインストール**
```bash
npm install
```

3. **環境変数の設定**
```bash
cp .env.example .env
# .envファイルを編集してAPIキーを設定
```

4. **Google Cloud Console設定**
- [Google Cloud Console](https://console.cloud.google.com)にアクセス
- 新しいプロジェクトを作成
- Google Sheets API、Google Docs API、Google Identity APIを有効化
- OAuth 2.0クライアントIDを作成
- 認証情報をmanifest.jsonに追加

## 🏗️ アーキテクチャ詳細

### レイヤー構造

```
┌─────────────────────────────────────┐
│         Presentation Layer          │
│    (popup.html, ui-controller.js)  │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│         Service Worker              │
│        (background.js)              │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│         Business Logic              │
│   (handlers/, features/, core/)    │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│         Service Layer               │
│    (services/, DI Container)       │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│         External APIs               │
│  (Google APIs, AI Services)        │
└─────────────────────────────────────┘
```

### 依存性注入（DI）システム

```javascript
// DIコンテナの使用例
import { getGlobalContainer } from './src/core/service-registry.js';

const container = await getGlobalContainer();
const authService = await container.get('authService');
const sheetsClient = await container.get('sheetsClient');
```

### サービス登録

```javascript
// 新しいサービスの登録
container.register('myService', async (container) => {
  const dependency = await container.get('otherService');
  return new MyService(dependency);
}, {
  lifecycle: 'singleton',  // singleton | factory | prototype
  lazy: true               // 遅延初期化
});
```

## 💻 開発ワークフロー

### ブランチ戦略

```
main
  ├── develop
  │     ├── feature/feature-name
  │     ├── fix/bug-fix-name
  │     └── refactor/refactor-name
  └── release/v1.0.0
```

### コミット規約

Conventional Commitsに従います：

- `feat:` 新機能
- `fix:` バグ修正
- `docs:` ドキュメント
- `style:` フォーマット変更
- `refactor:` リファクタリング
- `perf:` パフォーマンス改善
- `test:` テスト追加・修正
- `chore:` ビルドプロセスや補助ツールの変更

例：
```bash
git commit -m "feat: スプレッドシート自動保存機能を追加"
git commit -m "fix: メモリリークを修正"
```

### 開発サーバー

```bash
# 開発モードで起動（ファイル監視）
npm run dev

# ビルド
npm run build

# リント実行
npm run lint

# テスト実行
npm test
```

## 🧪 テスト戦略

### テストの種類

1. **ユニットテスト**
   - 個別のサービス、ユーティリティ関数
   - `tests/unit/`ディレクトリ

2. **統合テスト**
   - サービス間の連携
   - `tests/integration/`ディレクトリ

3. **E2Eテスト**
   - 実際のChrome拡張機能として動作確認
   - `tests/e2e/`ディレクトリ

### テストの実行

```bash
# すべてのテスト
npm test

# ユニットテストのみ
npm run test:unit

# E2Eテストのみ
npm run test:e2e

# カバレッジレポート
npm run test:coverage

# ウォッチモード
npm run test:watch
```

### モックの作成

```javascript
// Chrome APIのモック例
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
};
```

## 🔍 デバッグ

### Chrome DevTools

1. `chrome://extensions/`を開く
2. 拡張機能の「Service Worker」リンクをクリック
3. DevToolsでデバッグ

### ログレベル

```javascript
import { logger } from './src/core/enhanced-logger.js';

// ログレベル設定
logger.setLevel(LogLevel.DEBUG);

// 各種ログ
logger.debug('デバッグ情報');
logger.info('一般情報');
logger.warn('警告');
logger.error('エラー', error);
```

### パフォーマンス計測

```javascript
// パフォーマンス計測
logger.startPerformance('operation-name');
// ... 処理 ...
const duration = logger.endPerformance('operation-name');
```

## 📦 ビルドとデプロイ

### 開発ビルド

```bash
npm run build:dev
```

### 本番ビルド

```bash
npm run build:prod
```

### Chrome Web Storeへの公開

1. ビルドを作成
```bash
npm run build:prod
npm run package
```

2. `dist/extension.zip`が作成される

3. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)にアップロード

## 🔧 設定ファイル

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "11.autoai",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "identity",
    "tabs"
  ],
  "host_permissions": [
    "https://docs.google.com/*",
    "https://chat.openai.com/*"
  ]
}
```

### 環境変数 (.env)

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# API Keys (optional)
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

## 🐛 トラブルシューティング

### よくある問題

#### 1. 認証エラー
```javascript
// 認証トークンをクリア
chrome.identity.removeCachedAuthToken({ token }, () => {
  // 再認証
});
```

#### 2. メモリリーク
```javascript
// メモリマネージャーで監視
import { memoryManager } from './src/core/memory-manager.js';
memoryManager.startMonitoring();
```

#### 3. Service Worker停止
```javascript
// Keep-Alive実装
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' });
}, 20000);
```

## 📚 追加リソース

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [Google APIs Documentation](https://developers.google.com/apis-explorer)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ESLint Rules](https://eslint.org/docs/rules/)

## 🤝 コントリビューション

1. Issueを作成して議論
2. Forkしてfeatureブランチを作成
3. テストを書いて実装
4. すべてのテストがパスすることを確認
5. Pull Requestを作成

### コードレビューチェックリスト

- [ ] テストが追加されている
- [ ] ドキュメントが更新されている
- [ ] リントエラーがない
- [ ] パフォーマンスへの影響を考慮
- [ ] セキュリティを考慮
- [ ] 後方互換性を維持

## 📄 ライセンス

MIT License - 詳細は[LICENSE](../LICENSE)を参照

---

🤖 Generated with [Claude Code](https://claude.ai/code)