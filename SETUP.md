# セットアップガイド

このChrome拡張機能を複数のパソコンで使用するための設定手順です。

## 🚀 クイックスタート（超簡単！）

### 1. リポジトリをクローンまたは更新

```bash
# 新規の場合
git clone https://github.com/yamakatsunamamugi/11.autoai.git
cd 11.autoai

# 既存の場合
cd 11.autoai
git pull origin main
```

### 2. 自分のパソコン用のセットアップを実行

#### 🖥️ パソコン1の場合（拡張機能ID: bbbfjffpkfleplpoabeehglgikblfkip）
```bash
./setup-pc1.sh
```

#### 💻 パソコン2の場合（拡張機能ID: fphilbjcpglgablmlkffchdphbndehlg）
```bash
./setup-pc2.sh
```

**どちらのパソコンか分からない場合**：
1. `chrome://extensions/` で拡張機能IDを確認
2. 上記のIDと比較して、対応するスクリプトを実行

### 3. Chrome拡張機能を読み込む（初回のみ）

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `11.autoai`フォルダを選択

**既に拡張機能を読み込み済みの場合**：
- 「更新」ボタンをクリックするだけでOK

## 日常の使用方法

### 最新のコードに更新する場合

```bash
# 1. 最新コードを取得
git pull origin main

# 2. 自分のPCのセットアップスクリプトを実行（念のため）
./setup-pc1.sh  # または ./setup-pc2.sh

# 3. Chrome拡張機能を再読み込み
# chrome://extensions/ で「更新」ボタンをクリック
```

### コードを編集・共有する場合

どちらのPCでも自由に編集できます：

```bash
# コード編集後
git add -A        # manifest.jsonは自動的に除外される
git commit -m "機能追加"
git push origin main

# 別のPCで
git pull origin main
./setup-pc1.sh   # または ./setup-pc2.sh（念のため）
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
├── manifest.json          # ローカル設定（Gitで管理しない、スクリプトが生成）
├── manifest-pc1.json      # PC1用の設定（Gitで管理）
├── manifest-pc2.json      # PC2用の設定（Gitで管理）
├── setup-pc1.sh          # PC1用セットアップスクリプト
├── setup-pc2.sh          # PC2用セットアップスクリプト
├── .gitignore            # manifest.jsonを除外
└── その他のファイル...     # すべて共通コード
```

## なぜこの方法が良いのか

✅ **ミスが起きない** - スクリプト実行だけで設定完了  
✅ **覚える必要なし** - どのclient_idか考える必要なし  
✅ **安全** - `git add -A`を使っても問題なし  
✅ **簡単** - `./setup-pc1.sh`または`./setup-pc2.sh`を実行するだけ  

## トラブルシューティング

### どちらのPCか分からない場合
```bash
# Chrome拡張機能のIDを確認
# chrome://extensions/ でAutoAI MinimalのIDを見る
# bbbfjffpkfleplpoabeehglgikblfkip → PC1 → ./setup-pc1.sh
# fphilbjcpglgablmlkffchdphbndehlg → PC2 → ./setup-pc2.sh
```

### スクリプトが実行できない場合（Windows）
```bash
# bashがない場合は手動でコピー
copy manifest-pc1.json manifest.json  # PC1の場合
copy manifest-pc2.json manifest.json  # PC2の場合
```