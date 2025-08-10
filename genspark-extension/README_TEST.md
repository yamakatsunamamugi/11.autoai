# 🎯 Genspark統合テストツール

## 📋 概要
Genspark Chrome拡張機能の統合テストツール v3.0

## ✨ 特徴
- **完全動的検索**: ハードコードなし、UIの変更に自動適応
- **ファジー検索対応**: セレクタが変更されても自動で検出
- **学習機能**: UIから新しいセレクタを自動学習
- **キャッシュ機能**: 高速動作のためのセレクタキャッシュ
- **拡張機能連携**: Chrome拡張機能の検出と統合テスト

## 🚀 使い方

### 1. テストツールの読み込み

Gensparkのページ（https://www.genspark.ai）を開いて、開発者ツールのコンソールで以下を実行：

```javascript
// テストツールを読み込み
const script = document.createElement('script');
script.src = chrome.runtime.getURL('test/genspark-integration-test.js');
document.head.appendChild(script);
```

または、コンソールに直接コードを貼り付けて実行。

### 2. 基本的なテスト実行

```javascript
// 拡張機能の確認
await GensparkTest.checkExtension()

// 基本動作テスト
await GensparkTest.test()

// カスタムクエリでテスト
await GensparkTest.test("AIについて教えて")

// 統合テスト（全機能テスト）
await GensparkTest.runFullTest()
```

### 3. 機能別テスト

```javascript
// スライド生成機能
await GensparkTest.testFunction('slides')

// 要約機能
await GensparkTest.testFunction('summarize', 'この文章を要約して')

// 分析機能
await GensparkTest.testFunction('analyze')
```

### 4. セレクタ学習機能

UIが変更された場合、新しいセレクタを自動学習：

```javascript
// UIから自動学習
await GensparkTest.learn()

// 学習結果を保存（ローカルストレージ）
GensparkTest.saveSelectors()

// 保存したセレクタを読み込み
GensparkTest.loadSelectors()
```

## 🔧 高度な使い方

### デバッグモード

```javascript
// デバッグモードON（詳細ログ表示）
GensparkTest.setDebug(true)

// デバッグモードOFF
GensparkTest.setDebug(false)
```

### キャッシュ管理

```javascript
// キャッシュをクリア
GensparkTest.clearCache()
```

### テスト結果の取得

```javascript
// 実行したテストの結果を取得
const results = GensparkTest.getResults()
console.log(results)
```

### DOM操作（個別実行）

```javascript
// 要素を検索
const element = await GensparkTest.findElement('textInput')

// テキスト入力
await GensparkTest.inputText('テストテキスト')

// 要素をクリック
await GensparkTest.clickElement(element)

// 応答を待機
await GensparkTest.waitForResponse()
```

## 📊 テスト結果の見方

テスト実行後、以下の情報が表示されます：

```
🎯 Genspark基本動作テスト開始
============================================================
ステップ1: ページチェック
ステップ2: テキスト入力
入力完了: "桃太郎についてスライド4枚で解説して"
ステップ3: 送信ボタンをクリック
送信完了
ステップ4: 応答待機
処理中... (5秒)
処理完了を確認
ステップ5: 結果確認
============================================================
✅ テスト完了
最終URL: https://www.genspark.ai/spark/xxxxx
実行時間: 0分15秒
```

## 🔍 トラブルシューティング

### セレクタが見つからない場合

1. UIが変更された可能性があります
2. `await GensparkTest.learn()` で新しいセレクタを学習
3. `GensparkTest.saveSelectors()` で保存

### テストがタイムアウトする場合

```javascript
// タイムアウト時間を延長（デフォルト60秒）
await GensparkTest.waitForResponse(120) // 120秒待機
```

### 拡張機能が検出されない場合

1. 拡張機能が有効になっているか確認
2. ページをリロード
3. 拡張機能を再インストール

## 📝 セレクタ定義

デフォルトで以下のセレクタを検索します（動的に追加可能）：

### テキスト入力欄
- `textarea[name="query"]`
- `.search-input`
- `.j-search-input`
- `textarea.search-input.j-search-input`
- その他多数（自動検出）

### 送信ボタン
- `.enter-icon.active`
- `.enter-icon-wrapper.active`
- その他（動的検出）

### 停止ボタン
- `.stop-icon`
- `[aria-label*="停止"]`
- その他（動的検出）

## 🎓 学習機能の仕組み

1. **自動検出**: ページ内の要素を分析
2. **パターンマッチング**: 要素の特徴から用途を推定
3. **セレクタ生成**: 最適なセレクタを自動生成
4. **キャッシュ**: 成功したセレクタを記憶

## 📌 API リファレンス

```javascript
window.GensparkTest = {
  // テスト実行
  test: Function,           // 基本テスト
  testFunction: Function,   // 機能別テスト
  runFullTest: Function,    // 統合テスト
  
  // ユーティリティ
  checkExtension: Function, // 拡張機能検出
  waitForResponse: Function,// 応答待機
  
  // DOM操作
  findElement: Function,    // 要素検索
  clickElement: Function,   // クリック
  inputText: Function,      // テキスト入力
  
  // セレクタ学習
  learn: Function,          // 自動学習
  saveSelectors: Function,  // 保存
  loadSelectors: Function,  // 読み込み
  
  // 設定
  setDebug: Function,       // デバッグモード
  clearCache: Function,     // キャッシュクリア
  getResults: Function,     // 結果取得
  
  // ヘルプ
  help: Function           // ヘルプ表示
}
```

## 💡 Tips

- テストは並列実行しないでください
- UIが更新されたら必ず学習機能を実行
- キャッシュは5分間有効
- デバッグモードで詳細な動作を確認可能

## 🔄 更新履歴

- **v3.0.0** (2025/08/10)
  - 完全動的検索実装
  - ファジー検索対応
  - 学習機能追加
  - キャッシュ機能実装
  - 拡張機能連携強化

## 📧 サポート

問題が発生した場合は、以下の情報と共に報告してください：

1. エラーメッセージ
2. `GensparkTest.getResults()` の出力
3. ブラウザのバージョン
4. 拡張機能のバージョン