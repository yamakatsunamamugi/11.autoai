# クライアントID更新手順

## 新しいクライアントIDで manifest.json を更新

1. Google Cloud Consoleで取得した新しいクライアントIDをコピー
2. `manifest.json` の24行目を更新：

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

## 例
変更前：
```json
"client_id": "81824736218-31g4te8sugagitou68bn2bceoukv5jlu.apps.googleusercontent.com",
```

変更後（例）：
```json
"client_id": "123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
```

## 更新後の手順

1. manifest.jsonを保存
2. Chrome拡張機能ページ（chrome://extensions/）を開く
3. AutoAI Minimalの「更新」ボタンをクリック
4. レポート化ボタンを再度テスト

## トラブルシューティング

もし「invalid_client」エラーが続く場合：

1. 拡張機能を一度削除して再インストール
2. Chromeを再起動
3. Google Cloud Consoleで以下を確認：
   - APIが有効になっているか
   - OAuth同意画面が設定されているか
   - クライアントIDの拡張機能IDが正しいか（bbbfjffpkfleplpoabeehglgikblfkip）