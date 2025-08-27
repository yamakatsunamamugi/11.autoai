# 拡張機能ID固定化 - テスト確認手順

## 設定完了内容の確認

### ✅ 完了した設定:
1. **公開鍵をmanifest.jsonに追加** 
   - "key"フィールドが追加されました
   
2. **クライアントIDを元に戻しました**
   - `262291163420-fj2jfie1cmb63md9nnu4ofdkr9ku1u3o.apps.googleusercontent.com`

3. **必要なファイルの確認**
   - `/Dropbox/11.autoai.pem` (秘密鍵) ✅
   - `/Dropbox/11.autoai.crx` (パッケージ) ✅
   - `/Dropbox/11.autoai/manifest.json` (公開鍵追加済み) ✅

## テスト手順

### 1. Chrome拡張機能の再読み込み
1. `chrome://extensions/` を開く
2. AutoAI拡張機能を見つける
3. 「更新」ボタンをクリック、または拡張機能を削除して再インストール

### 2. 拡張機能IDの確認
- 拡張機能のIDが `bbbfjffpkfleplpoabeehglgikblfkip` であることを確認
- このIDは公開鍵から決定的に生成されるため、どのPCでも同じになります

### 3. 認証テスト
1. 拡張機能のアイコンをクリック
2. ポップアップが表示されることを確認
3. スプレッドシートの読み込みをテスト

### 4. コンソールでエラー確認
1. 拡張機能のポップアップで右クリック → 「検証」
2. Consoleタブでエラーがないか確認
3. 特に以下のエラーがないことを確認:
   - `bad client id` エラー
   - `OAuth2 request failed` エラー

## 期待される結果

✅ **成功の場合:**
- 拡張機能ID: `bbbfjffpkfleplpoabeehglgikblfkip`
- 認証が正常に完了
- スプレッドシートが読み込める
- エラーメッセージなし

❌ **失敗の場合の対処:**
1. Chrome拡張機能を完全に削除
2. Chromeを再起動
3. 拡張機能を新規インストール
4. 認証データをクリア（拡張機能の管理 → サイトデータを消去）

## 他のPCでのテスト

### Dropbox同期後の手順:
1. Dropboxで`11.autoai`フォルダが同期されるのを待つ
2. Chrome拡張機能として読み込む
3. 拡張機能IDが同じ `bbbfjffpkfleplpoabeehglgikblfkip` になることを確認
4. 同じGoogleアカウントで認証
5. スプレッドシートにアクセスできることを確認

## チェックリスト

- [ ] manifest.jsonに"key"フィールドが存在する
- [ ] クライアントIDが正しい（262291163420-fj2jfie1cmb63md9nnu4ofdkr9ku1u3o）
- [ ] 拡張機能IDが固定されている（bbbfjffpkfleplpoabeehglgikblfkip）
- [ ] 認証エラーが発生しない
- [ ] スプレッドシートが読み込める
- [ ] 他のPCでも同じIDになる

## 成功確認メッセージ

コンソールに以下のようなメッセージが表示されれば成功:
```
✅ サービス初期化完了
  - authService: 利用可能
  - sheetsClient: 利用可能
AuthService Auth token obtained successfully
```

## 問題が続く場合

Google Cloud Consoleで以下を確認:
1. クライアントID `262291163420-fj2jfie1cmb63md9nnu4ofdkr9ku1u3o.apps.googleusercontent.com` の設定
2. アプリケーションタイプ: Chrome拡張機能
3. アプリケーションID: `bbbfjffpkfleplpoabeehglgikblfkip`