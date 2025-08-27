# 拡張機能ID固定化セットアップガイド

## 概要
Dropboxで同期された`.pem`ファイル（秘密鍵）を使用して、すべてのPCで同じ拡張機能ID（`bbbfjffpkfleplpoabeehglgikblfkip`）を維持します。

## 重要ファイル
- **秘密鍵**: `/Users/[username]/Dropbox/11.autoai.pem`
- **拡張機能パッケージ**: `/Users/[username]/Dropbox/11.autoai.crx`
- **manifest.json**: 公開鍵が追加済み

## 設定完了内容

### 1. 公開鍵の追加（完了済み）
manifest.jsonに以下の"key"フィールドを追加しました：
```json
"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqlcVAIPsdqvZvFmnzK/+28XyWJrU4rxB0oMDvfGfiEGh2C6JEs9ueKY/tw0RckAhhrtMonTdfgDMdiOrKL3qIh/Z8oxD3jBfdhWmN5I6nPX882GpD5/AQTVUHY8a9qrqMLZsMtrIrYSM0KOhWCCDuph9ARrpXVso4pgGCg+bbXIMsnh8z4fO8AK88j98K1ymW5V/5Uc8GkCojzg4XreaGdPblOJvQ5U5sYQgTwegyMNbZmb3p/0f2qviMSqQ1CvUWtV8HlveHXzWTWjp2RyIwjVqLafvKxr/BnYL3YsFPEPPJ6E/bCkoDHSjqXZATHQ1ydvkhNcKFfzb9fxuH6kAnwIDAQAB"
```

この公開鍵により、どのPCでも同じ拡張機能ID: `bbbfjffpkfleplpoabeehglgikblfkip` が生成されます。

## 新しいPCでのセットアップ手順

### 1. Dropboxを同期
```bash
# Dropboxアプリをインストールして同期
# 11.autoaiフォルダと11.autoai.pemファイルが同期されることを確認
```

### 2. Chrome拡張機能を読み込み
1. Chromeを開く
2. `chrome://extensions/` にアクセス
3. 右上の「デベロッパーモード」をON
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. Dropbox内の`11.autoai`フォルダを選択

### 3. 拡張機能IDを確認
- 拡張機能のIDが `bbbfjffpkfleplpoabeehglgikblfkip` になっていることを確認
- これは全てのPCで同じIDになります

### 4. 認証
- 拡張機能のポップアップから「認証」をクリック
- Googleアカウントでログイン
- 必要な権限を許可

## なぜこれが動作するか

1. **秘密鍵（.pemファイル）の共有**
   - Dropboxで同じ秘密鍵を全PCで共有
   - 秘密鍵から生成される公開鍵も同じ

2. **manifest.jsonのkeyフィールド**
   - 公開鍵から拡張機能IDが決定的に生成される
   - 同じ公開鍵 = 同じ拡張機能ID

3. **Google Cloud Console設定**
   - 1つのChrome拡張機能タイプのクライアントID
   - 拡張機能ID: `bbbfjffpkfleplpoabeehglgikblfkip` に対応
   - 全PCで同じクライアントIDで認証可能

## トラブルシューティング

### 拡張機能IDが異なる場合
1. manifest.jsonに"key"フィールドが存在するか確認
2. Dropboxが最新状態に同期されているか確認
3. Chrome拡張機能を削除して再読み込み

### 認証エラーが発生する場合
1. Chrome拡張機能を再読み込み（更新ボタン）
2. Chromeを再起動
3. 拡張機能のデータをクリア:
   - 拡張機能を右クリック → 「拡張機能を管理」
   - 「サイトデータを消去」

### .pemファイルが見つからない場合
- Dropboxの同期が完了しているか確認
- `/Users/[username]/Dropbox/11.autoai.pem` に存在するか確認

## セキュリティ注意事項

⚠️ **重要**: `.pem`ファイルは秘密鍵です
- このファイルは絶対に公開しないでください
- GitHubなどのパブリックリポジトリにアップロードしないこと
- Dropboxの共有設定は自分のみアクセス可能に設定

## 利点

✅ **全PCで同じ拡張機能ID**
- 設定の一貫性
- 1つのGoogle Cloud Console設定で対応

✅ **Dropbox同期で自動更新**
- コード変更が全PCに自動反映
- 手動コピー不要

✅ **簡単なセットアップ**
- 新しいPCでもDropbox同期するだけ
- 追加の設定変更不要