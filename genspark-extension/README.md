# Genspark Automation Chrome Extension

## 📋 概要
GensparkのAIスライド生成を自動化するChrome拡張機能です。

## ✅ 現在の状態
**統合テスト準備完了** - CSP対応版で実装済み

## 🚀 インストール方法

1. **Chromeの拡張機能管理ページを開く**
   - `chrome://extensions/` にアクセス
   - または、Chrome設定 → 拡張機能

2. **デベロッパーモードをON**
   - 右上のトグルスイッチを有効化

3. **拡張機能を読み込む**
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `genspark-extension` フォルダを選択

## 🎯 使い方

### テストモード（デフォルト）
1. 拡張機能アイコンをクリック
2. プロンプトが自動入力される（「桃太郎についてスライド4枚で解説して」）
3. 「実行」ボタンをクリック

### 本番モード
1. 右下の🔄ボタンで環境を切り替え
2. プロンプトを手動入力
3. 「実行」ボタンをクリック

## 🔧 機能

- **環境切り替え**: テスト/本番環境の切り替え
- **データソース選択**: 
  - 手動入力（実装済み）
  - スプレッドシート連携（将来実装）
- **実行履歴**: 過去の実行結果を保存・確認
- **エラーハンドリング**: UI変更時の自動検出とエラー通知

## 📁 ファイル構成

```
genspark-extension/
├── manifest.json               # 拡張機能設定
├── config/
│   ├── environments.js        # 環境設定
│   └── selectors.js          # UIセレクタ定義
├── src/
│   ├── core/                 # コアロジック
│   ├── adapters/             # データアダプター
│   ├── content/
│   │   └── content-bundle.js # コンテンツスクリプト（バンドル版）
│   └── background/
│       └── service-worker.js # バックグラウンド処理
└── popup/                     # ポップアップUI
    ├── popup.html
    ├── popup.js
    └── popup.css
```

## ⚙️ 技術仕様

- **Manifest Version**: V3
- **対応ブラウザ**: Chrome/Edge (Chromium系)
- **権限**: storage, activeTab, scripting
- **対象サイト**: https://www.genspark.ai/*

## 🔍 トラブルシューティング

### 拡張機能が動作しない場合
1. Gensparkのページ（https://www.genspark.ai/agents?type=slides_agent）を開く
2. ページを再読み込み
3. 拡張機能のポップアップから実行

### エラーが発生する場合
- Chromeのデベロッパーツール（F12）でコンソールログを確認
- `[Genspark]` プレフィックスのログを確認

## 📝 注意事項

- UIが変更された場合、セレクタの更新が必要
- エラー時は指定のスプレッドシートURLで設定更新可能
- テスト環境では自動的にデフォルトプロンプトが使用される