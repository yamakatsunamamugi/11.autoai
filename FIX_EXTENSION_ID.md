# 拡張機能IDを固定する緊急対処

## 問題
- manifest.jsonにkeyフィールドがあるのに、拡張機能IDが変わってしまう
- 現在のID: `fdociflnaoebbchbikdibadkooeehlmj` (間違い)
- 正しいID: `bbbfjffpkfleplpoabeehglgikblfkip`

## 解決方法

### 方法A: 拡張機能を再パック化（推奨）

1. **Chromeで拡張機能をパック化**
   - chrome://extensions/ を開く
   - 「拡張機能をパック」をクリック
   - 拡張機能のルートディレクトリ: `/Users/[username]/Dropbox/11.autoai`
   - 秘密鍵ファイル: `/Users/[username]/Dropbox/11.autoai.pem`
   - 「拡張機能をパック」をクリック

2. **生成された.crxファイルを確認**
   - 新しい`11.autoai.crx`ファイルが生成される
   - このファイルには正しいIDが埋め込まれている

3. **CRXファイルをインストール**
   - 生成された.crxファイルをChromeにドラッグ&ドロップ
   - または、chrome://extensions/ で「パッケージ化されていない拡張機能を読み込む」から11.autoaiフォルダを選択

### 方法B: manifest.jsonのkeyフィールドを再確認

1. **一時的にkeyフィールドを削除してテスト**
   ```json
   // この行を一時的にコメントアウトまたは削除
   // "key": "MIIBIjANBgkq...",
   ```

2. **拡張機能を再読み込み**
   - 新しいランダムなIDが生成される

3. **keyフィールドを戻す**
   - コメントアウトを解除または追加し直す

4. **再度読み込み**
   - 正しいIDになるはずです

### 方法C: 両方のIDに対応する（一時的な解決策）

Google Cloud Consoleで両方のIDのクライアントIDを作成：

1. **ID `bbbfjffpkfleplpoabeehglgikblfkip` 用**
   - クライアントID: `262291163420-cfp8h5f7qqaljs2e9b0b1vje1pvpeeq1.apps.googleusercontent.com`

2. **ID `fdociflnaoebbchbikdibadkooeehlmj` 用**
   - 新しいクライアントIDを作成

そして、auth-service.jsでIDに応じて切り替える処理を追加。

## 根本的な解決

### コマンドラインでパック化（最も確実）

```bash
# 1. 古いcrxファイルを削除
rm /Users/[username]/Dropbox/11.autoai.crx

# 2. Chromeのパック化ツールを使用
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --pack-extension=/Users/[username]/Dropbox/11.autoai \
  --pack-extension-key=/Users/[username]/Dropbox/11.autoai.pem

# 3. 生成されたcrxファイルを確認
ls -la /Users/[username]/Dropbox/11.autoai.crx
```

## 確認事項

1. manifest.jsonの"key"フィールドが正しく設定されているか
2. .pemファイルが正しい場所にあるか
3. Chromeのキャッシュが影響していないか

## 他のPCでの対応

1. 同じ.pemファイルを使用
2. manifest.jsonに同じkeyフィールドがある
3. これで同じIDになるはずです

もしまだ問題が続く場合は、.pemファイルから新しく公開鍵を生成し直す必要があるかもしれません。