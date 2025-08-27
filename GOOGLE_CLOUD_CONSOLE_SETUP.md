# Google Cloud Console OAuth 2.0 設定ガイド

## 概要
Chrome拡張機能のIDに依存しないOAuth認証を実現するため、Google Cloud ConsoleでWebアプリケーションタイプのOAuth 2.0クライアントIDを設定します。

## 前提条件
- Google Cloud Consoleへのアクセス権限
- Google Cloud プロジェクト（既存または新規）

## 手順

### 1. Google Cloud Consoleにアクセス
1. https://console.cloud.google.com/ にアクセス
2. Googleアカウントでログイン

### 2. プロジェクトの選択または作成
1. 画面上部のプロジェクトセレクターをクリック
2. 既存のプロジェクトを選択、または「新しいプロジェクト」をクリック
   - プロジェクト名: `AutoAI-Extension` (任意)
   - プロジェクトID: 自動生成されたものを使用

### 3. APIとサービスを有効化
1. 左側メニューから「APIとサービス」→「有効なAPI」を選択
2. 「+ APIとサービスの有効化」をクリック
3. 以下のAPIを検索して有効化:
   - Google Sheets API
   - Google Docs API  
   - Google Drive API

### 4. OAuth同意画面の設定
1. 左側メニューから「APIとサービス」→「OAuth同意画面」を選択
2. ユーザータイプ:
   - 個人利用の場合: 「内部」を選択（G Suiteアカウントの場合）
   - 一般利用の場合: 「外部」を選択
3. 「作成」をクリック

#### アプリ情報の入力:
- **アプリ名**: AutoAI Extension
- **ユーザーサポートメール**: あなたのメールアドレス
- **アプリのロゴ**: (オプション)
- **アプリケーションのホームページ**: (オプション)
- **アプリケーションのプライバシーポリシー**: (オプション)
- **アプリケーションの利用規約**: (オプション)
- **承認済みドメイン**: 
  - `sheets.googleapis.com`
  - `docs.google.com`
- **デベロッパーの連絡先情報**: あなたのメールアドレス

4. 「保存して次へ」をクリック

#### スコープの設定:
1. 「スコープを追加または削除」をクリック
2. 以下のスコープを追加:
   - `.../auth/spreadsheets`
   - `.../auth/documents`
   - `.../auth/drive.file`
   - `.../auth/userinfo.email`
3. 「更新」をクリック
4. 「保存して次へ」をクリック

#### テストユーザー（外部の場合のみ）:
1. 「+ ADD USERS」をクリック
2. テストに使用するGoogleアカウントのメールアドレスを追加
3. 「保存して次へ」をクリック

### 5. OAuth 2.0クライアントIDの作成（Webアプリケーション）
1. 左側メニューから「APIとサービス」→「認証情報」を選択
2. 「+ 認証情報を作成」→「OAuth クライアント ID」を選択
3. **アプリケーションの種類**: 「ウェブ アプリケーション」を選択
4. **名前**: `AutoAI Web Client`

#### 承認済みのJavaScript生成元:
以下のURIを追加（「+ URIを追加」をクリック）:
```
https://sheets.googleapis.com
https://docs.google.com
https://www.googleapis.com
chrome-extension://*
http://localhost
```

#### 承認済みのリダイレクトURI:
以下のURIを追加:
```
https://sheets.googleapis.com/
https://docs.google.com/
chrome-extension://mjoemaognjppjfhfhfepoiajjpoocaaa/
chrome-extension://*/
http://localhost/oauth2callback
```

> 注意: `chrome-extension://*/` により、どの拡張機能IDでも動作します

5. 「作成」をクリック

### 6. クライアントIDとシークレットの取得
作成完了後、以下の情報が表示されます:
- **クライアントID**: `XXXXXX.apps.googleusercontent.com`
- **クライアントシークレット**: `XXXXX`

**クライアントID**をコピーして保存してください。

## manifest.jsonの更新

取得したクライアントIDを`manifest.json`に設定:

```json
"oauth2": {
  "client_id": "YOUR_NEW_CLIENT_ID.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents", 
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

## トラブルシューティング

### エラー: "Error 400: redirect_uri_mismatch"
- Google Cloud Consoleで承認済みのリダイレクトURIに拡張機能のIDが含まれているか確認
- `chrome-extension://*/` が追加されているか確認

### エラー: "このアプリはGoogleで確認されていません"
- OAuth同意画面でテストユーザーとして自分のアカウントを追加
- または「詳細」→「安全でないページに移動」を選択（開発中のみ）

### 認証が失敗する
1. Chrome拡張機能を再読み込み
2. Chromeを再起動
3. Google Cloud ConsoleでAPIが有効になっているか確認

## セキュリティ上の注意
- クライアントシークレットは拡張機能には含めない（Webアプリケーションタイプでも不要）
- 本番環境では適切なドメイン制限を設定
- 不要なスコープは削除する