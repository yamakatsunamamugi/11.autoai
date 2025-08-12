# OAuth2セットアップガイド

## 現在のエラー
```
OAuth2 request failed: Service responded with error: 'bad client id: 81824736218-31g4te8sugagitou68bn2bceoukv5jlu.apps.googleusercontent.com'
```

## 拡張機能情報
- **拡張機能ID**: `bbbfjffpkfleplpoabeehglgikblfkip`
- **拡張機能URL**: `chrome-extension://bbbfjffpkfleplpoabeehglgikblfkip/`

## 解決手順

### 1. ✅ 拡張機能IDの確認（完了）
- ID: `bbbfjffpkfleplpoabeehglgikblfkip`

### 2. Google Cloud Consoleでの設定

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトを選択または新規作成
3. 「APIとサービス」→「認証情報」へ移動

### 3. OAuth2クライアントIDの作成

1. 「認証情報を作成」→「OAuth クライアント ID」
2. アプリケーションの種類：**Chrome拡張機能**
3. 名前：`AutoAI Minimal`
4. アプリケーションID：（手順1で確認した拡張機能ID）
5. 「作成」をクリック

### 4. 必要なAPIの有効化

以下のAPIを有効化してください：
- Google Sheets API
- Google Docs API
- Google Drive API

「APIとサービス」→「ライブラリ」から検索して有効化

### 5. manifest.jsonの更新

新しいクライアントIDで`manifest.json`を更新：

```json
"oauth2": {
  "client_id": "新しいクライアントID.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

### 6. 拡張機能の再読み込み

1. `chrome://extensions/` を開く
2. AutoAI Minimalの「更新」ボタンをクリック
3. 拡張機能を再度テスト

## トラブルシューティング

### エラーが続く場合

1. **ブラウザのキャッシュをクリア**
   - Chrome設定 → プライバシーとセキュリティ → 閲覧履歴データの削除

2. **拡張機能の再インストール**
   - 拡張機能を削除して再度追加

3. **OAuth同意画面の設定確認**
   - Google Cloud Console → APIとサービス → OAuth同意画面
   - 必要な情報が設定されているか確認

## 参考リンク

- [Chrome Extension OAuth2 Documentation](https://developer.chrome.com/docs/extensions/mv3/tut_oauth/)
- [Google APIs OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)