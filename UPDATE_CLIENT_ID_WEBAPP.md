# クライアントID更新手順

## 重要な変更点
Google Cloud ConsoleでWebアプリケーションタイプのOAuth 2.0クライアントIDを作成することで、Chrome拡張機能のID依存を解消します。

## manifest.json更新箇所

現在の設定:
```json
"oauth2": {
  "client_id": "262291163420-fj2jfie1cmb63md9nnu4ofdkr9ku1u3o.apps.googleusercontent.com",
  "scopes": [...]
}
```

新しい設定（Webアプリケーションタイプ）:
```json
"oauth2": {
  "client_id": "YOUR_NEW_WEBAPP_CLIENT_ID.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

## 更新手順

1. **Google Cloud Consoleで新しいクライアントIDを作成**
   - `GOOGLE_CLOUD_CONSOLE_SETUP.md`の手順に従って作成
   - アプリケーションタイプは必ず「ウェブ アプリケーション」を選択

2. **manifest.jsonを編集**
   ```bash
   # manifest.jsonを開く
   # "client_id"の値を新しいものに変更
   ```

3. **Chrome拡張機能を再読み込み**
   - chrome://extensions/ にアクセス
   - 「更新」ボタンをクリック、または拡張機能を無効化→有効化

4. **認証をテスト**
   - 拡張機能のポップアップを開く
   - Googleアカウントで再認証
   - スプレッドシートへのアクセスを確認

## メリット

### Webアプリケーションタイプを使用する利点:
1. **拡張機能ID非依存**: どのPCでも同じclient_idで動作
2. **開発が簡単**: 拡張機能を再インストールしてもIDが変わっても問題なし
3. **複数環境対応**: localhost、本番環境など複数のURIを登録可能
4. **柔軟な認証**: chrome-extension://*/のワイルドカードが使用可能

## 注意事項

- 既存の認証情報はクリアされるため、再認証が必要
- すべての利用PCで同じclient_idに更新する必要がある
- Google Cloud Consoleの設定は1回だけ行えばOK