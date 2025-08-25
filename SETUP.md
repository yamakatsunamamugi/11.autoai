# セットアップガイド

このChrome拡張機能を複数のパソコンで使用するための設定手順です。

## 初回セットアップ（各パソコンで1回だけ）

### 1. リポジトリをクローンまたは更新

```bash
# 新規の場合
git clone https://github.com/yamakatsunamamugi/11.autoai.git
cd 11.autoai

# 既存の場合
cd 11.autoai
git pull origin main
```

### 2. manifest.jsonを作成

```bash
# テンプレートからmanifest.jsonを作成
cp manifest.template.json manifest.json
```

### 3. manifest.jsonのclient_idを編集

お使いのテキストエディタで`manifest.json`を開き、`oauth2`セクションの`client_id`を以下のいずれかに変更してください：

#### パソコン1（拡張機能ID: bbbfjffpkfleplpoabeehglgikblfkip）
```json
"oauth2": {
  "client_id": "262291163420-fj2jfie1cmb63md9nnu4ofdkr9ku1u3o.apps.googleusercontent.com",
  ...
}
```

#### パソコン2（拡張機能ID: fphilbjcpglgablmlkffchdphbndehlg）
```json
"oauth2": {
  "client_id": "262291163420-kdnveh0r0b2q6o0sepv9j2ikbt04b1ig.apps.googleusercontent.com",
  ...
}
```

### 4. Chrome拡張機能を読み込む

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `11.autoai`フォルダを選択

### 5. 拡張機能IDを確認

読み込んだ拡張機能のIDを確認し、上記のどちらのIDと一致するか確認してください。
もし異なるIDの場合は、新しいOAuthクライアントIDの作成が必要です（下記参照）。

## 日常の使用方法

### コードを更新する場合

```bash
# 最新のコードを取得
git pull origin main

# manifest.jsonは.gitignoreに含まれているため変更されません
# Chrome拡張機能を再読み込み（chrome://extensions/ で「更新」ボタンをクリック）
```

## 新しいパソコンを追加する場合

新しいパソコンで拡張機能IDが異なる場合：

1. **拡張機能IDを確認**
   - `chrome://extensions/` で確認

2. **Google Cloud ConsoleでOAuthクライアントIDを作成**
   - [Google Cloud Console](https://console.cloud.google.com/)にアクセス
   - 「APIとサービス」→「認証情報」
   - 「+ 認証情報を作成」→「OAuth クライアント ID」
   - アプリケーションの種類：「Chrome拡張機能」
   - アプリケーションID：新しい拡張機能IDを入力
   - 作成

3. **manifest.jsonを編集**
   - 新しいクライアントIDを設定

## トラブルシューティング

### OAuth認証エラーが出る場合

1. manifest.jsonのclient_idが正しいか確認
2. 拡張機能IDが想定通りか確認（chrome://extensions/）
3. Google Cloud ConsoleでAPIが有効になっているか確認：
   - Google Sheets API
   - Google Drive API
   - Google Docs API

### 拡張機能が読み込めない場合

1. manifest.jsonが正しくコピーされているか確認
2. manifest.jsonのJSON構文が正しいか確認

## ファイル構成

```
11.autoai/
├── manifest.json          # ローカル設定（Gitで管理しない）
├── manifest.template.json # テンプレート（Gitで管理）
├── .gitignore            # manifest.jsonを除外
└── その他のファイル...     # すべて共通
```

## 重要な注意点

- **manifest.jsonは各パソコンで個別に管理**されます
- **コード変更時もmanifest.jsonは変更されません**
- **新しい権限を追加する場合はmanifest.template.jsonを更新**してください