# Dropboxログレポートアップロード機能 設定ガイド

## 概要

このドキュメントでは、AutoAI Chrome拡張機能でDropboxにログレポートを自動アップロードする機能の設定方法を説明します。

## 事前準備

### 1. Dropbox Appの作成

1. [Dropbox App Console](https://www.dropbox.com/developers/apps) にアクセス
2. 「Create app」をクリック
3. 以下の設定を選択：
   - **API**: Dropbox API
   - **Type of access**: App folder (推奨) または Full Dropbox
   - **App name**: 任意の名前（例：AutoAI-Logger）

### 2. App設定の確認

作成したアプリの設定画面で以下を確認：

- **App key (Client ID)**: 後で拡張機能に設定します
- **Permissions**: `files.content.write` が有効になっていることを確認

### 3. OAuth 2.0 リダイレクトURI設定

App設定画面の「OAuth 2」セクションで：

1. 「Add」をクリック
2. リダイレクトURIを追加：
   ```
   https://<extension-id>.chromiumapp.org/
   ```

   > 注意: `<extension-id>`は実際の拡張機能IDに置き換えてください

## 拡張機能での設定

### 1. Client IDの設定

Chrome拡張機能のポップアップまたは設定画面で：

1. Dropbox設定セクションに移動
2. 「Dropbox App Client ID」フィールドに、作成したアプリのApp keyを入力
3. 「保存」をクリック

### 2. Dropbox認証

1. 「Dropboxで認証」ボタンをクリック
2. Dropboxの認証画面で拡張機能へのアクセスを許可
3. 認証完了後、自動的に拡張機能に戻ります

### 3. アップロード設定

認証完了後、以下の設定が可能です：

- **自動アップロード**: ログファイル保存時に自動でDropboxにアップロード
- **アップロードパス**: Dropbox内のアップロード先フォルダ（デフォルト: `/autoai-logs`）
- **保持期間**: 古いログファイルの自動削除期間（デフォルト: 30日）
- **圧縮設定**: アップロード時のファイル圧縮有無

## 使用方法

### 自動アップロード

自動アップロードを有効にすると：

- ログファイルの保存時に自動的にDropboxにアップロード
- 日付別フォルダに整理して保存（例：`/autoai-logs/2024-01-15/claude-log-2024-01-15_14-30-25.json`）
- エラーやログファイルも同様にアップロード

### 手動アップロード

特定のファイルを手動でアップロードする場合：

```javascript
// 拡張機能内から呼び出し
chrome.runtime.sendMessage({
  action: 'uploadToDropbox',
  data: {
    fileName: 'manual-log.json',
    content: JSON.stringify(logData, null, 2),
    options: {
      overwrite: true
    }
  }
}, (response) => {
  if (response.success) {
    console.log('アップロード完了:', response.result.filePath);
  }
});
```

## ファイル構造

Dropbox内のファイル構造：

```
/autoai-logs/
├── 2024-01-15/
│   ├── claude-log-2024-01-15_14-30-25.json
│   ├── gemini-log-2024-01-15_15-45-10.json
│   └── chatgpt-log-2024-01-15_16-20-33.json
├── 2024-01-16/
│   └── claude-log-2024-01-16_09-15-42.json
└── errors/
    └── error-2024-01-15_14-31-01.json
```

## トラブルシューティング

### 認証エラー

- Client IDが正しく設定されているか確認
- Dropbox App設定のリダイレクトURIが正しいか確認
- 拡張機能を再読み込みして再試行

### アップロードエラー

- インターネット接続を確認
- Dropbox APIの制限に達していないか確認
- ファイルサイズが制限内か確認（単一ファイル150MB以下推奨）

### 権限エラー

- Dropbox Appの権限設定を確認
- 必要に応じて`files.content.write`権限を追加

## API制限について

Dropbox APIには以下の制限があります：

- **レート制限**: 1時間あたり最大1,000リクエスト
- **ファイルサイズ**: 単一ファイル最大350GB（通常アップロードは150MB推奨）
- **ストレージ容量**: Dropboxアカウントの容量に依存

## セキュリティ

- アクセストークンはChrome Storageに暗号化されて保存
- Client Secretは拡張機能では使用せず、安全性を確保
- OAuth 2.0による安全な認証フロー

## サポート

問題が発生した場合：

1. 拡張機能のコンソールログを確認
2. Dropbox App Consoleでアプリ設定を再確認
3. 必要に応じてアプリを再作成して再設定

---

このガイドに従って設定することで、AutoAI拡張機能のログレポートを自動的にDropboxにバックアップできます。