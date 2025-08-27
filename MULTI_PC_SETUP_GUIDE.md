# 複数PC導入ガイド - AutoAI Extension

## 概要
WebアプリケーションタイプのOAuth 2.0を使用することで、Chrome拡張機能のIDに依存せず、複数のPCで同じ拡張機能を使用できます。

## 事前準備（1回だけ実施）

### Google Cloud Console設定
1. `GOOGLE_CLOUD_CONSOLE_SETUP.md`に従ってWebアプリケーションタイプのクライアントIDを作成
2. 作成したクライアントIDをメモ

### manifest.json更新
```json
"oauth2": {
  "client_id": "YOUR_NEW_WEBAPP_CLIENT_ID.apps.googleusercontent.com",
  // ... scopes
}
```

## 各PCでのセットアップ手順

### 方法1: Dropbox/Google Drive経由（推奨）

#### 初回PC（マスター）での準備:
1. **manifest.jsonを更新**
   - 新しいWebアプリケーションタイプのclient_idを設定

2. **Dropboxにフォルダを配置**
   ```
   /Users/[username]/Dropbox/11.autoai/
   ```

3. **Chrome拡張機能として読み込み**
   - chrome://extensions/ を開く
   - デベロッパーモードをON
   - 「パッケージ化されていない拡張機能を読み込む」
   - Dropbox内の`11.autoai`フォルダを選択

#### 他のPCでの設定:
1. **Dropboxを同期**
   - 同じDropboxアカウントでログイン
   - `11.autoai`フォルダが同期されるのを待つ

2. **Chrome拡張機能として読み込み**
   - 上記と同じ手順でChrome拡張機能を読み込む
   - **重要**: 同じフォルダパスから読み込む

### 方法2: USBメモリ/ファイル転送

1. **フォルダをコピー**
   ```bash
   # USBメモリにコピー
   cp -r /Users/[username]/Dropbox/11.autoai /Volumes/USB/
   ```

2. **新しいPCに転送**
   ```bash
   # ローカルにコピー
   cp -r /Volumes/USB/11.autoai ~/Documents/
   ```

3. **Chrome拡張機能として読み込み**
   - 同様の手順で拡張機能を読み込む

### 方法3: GitHub経由（バージョン管理付き）

1. **GitHubリポジトリにプッシュ**
   ```bash
   cd /Users/[username]/Dropbox/11.autoai
   git add .
   git commit -m "Update client ID for web application type"
   git push origin main
   ```

2. **他のPCでクローン**
   ```bash
   git clone https://github.com/yourusername/autoai-extension.git
   cd autoai-extension
   ```

3. **Chrome拡張機能として読み込み**

## 初回認証手順（各PCで必要）

1. **拡張機能アイコンをクリック**
   - Chromeツールバーの拡張機能アイコンをクリック

2. **Googleアカウントで認証**
   - 「認証」または「ログイン」ボタンをクリック
   - Googleアカウントでログイン
   - 必要な権限を許可

3. **スプレッドシートURLを設定**
   - 同じGoogle SpreadsheetのURLを入力
   - 設定を保存

## 同期される内容

### 自動同期（Dropbox/Google Drive使用時）:
- ソースコードの更新
- 設定ファイル
- manifest.jsonの変更

### 同期されない内容（PC固有）:
- Chrome拡張機能のID（各PCで異なる）
- ローカルストレージのデータ
- 認証トークン（各PCで再認証が必要）

## トラブルシューティング

### Q: 拡張機能IDが異なるがOAuthは動作するか？
**A:** はい。WebアプリケーションタイプのクライアントIDを使用しているため、拡張機能IDが異なっても認証可能です。

### Q: 認証エラーが発生する
**対処法:**
1. manifest.jsonのclient_idが正しいか確認
2. Google Cloud Consoleで以下が設定されているか確認:
   - 承認済みJavaScript生成元に `chrome-extension://*`
   - 承認済みリダイレクトURIに `chrome-extension://*/`
3. Chrome拡張機能を再読み込み
4. Chromeを再起動

### Q: スプレッドシートにアクセスできない
**対処法:**
1. Google Sheets APIが有効になっているか確認
2. 同じGoogleアカウントでログインしているか確認
3. スプレッドシートの共有設定を確認

### Q: 設定が同期されない
**対処法:**
- Dropbox: 同期が完了するまで待つ
- GitHub: 最新版をpull
- USB: ファイルを再コピー

## セキュリティベストプラクティス

1. **クライアントIDの管理**
   - client_idは公開されても問題ないが、client_secretは絶対に含めない

2. **アクセス制御**
   - 必要最小限のスコープのみ要求
   - 定期的に権限を見直し

3. **データ保護**
   - 機密データはローカルに保存しない
   - スプレッドシートの共有設定を適切に管理

## メンテナンス

### 更新の配布
1. **マスターPCで更新**
2. **Dropbox経由**: 自動同期
3. **GitHub経由**: git push → 各PCでgit pull
4. **手動**: 更新されたファイルを各PCにコピー

### バックアップ
```bash
# バックアップ作成
tar -czf autoai-backup-$(date +%Y%m%d).tar.gz 11.autoai/

# リストア
tar -xzf autoai-backup-20240101.tar.gz
```

## まとめ

WebアプリケーションタイプのOAuth 2.0クライアントIDを使用することで:
- ✅ 拡張機能IDに依存しない認証
- ✅ 複数PCで同じ設定を共有
- ✅ 簡単なセットアップと管理
- ✅ Dropbox/GitHub等での自動同期対応

これにより、どのPCでも同じ拡張機能を使用でき、設定や更新の管理も簡単になります。