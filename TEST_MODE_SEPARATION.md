# 統合AIテストと本番モードの分離実装

## 変更概要
統合AIテストがプルダウン選択値のみを使用し、スプレッドシートのデータを一切使用しないように修正しました。

## 主な変更点

### 1. test-runner-chrome.js の修正
**ファイル**: `/automations/test-runner-chrome.js`
**修正箇所**: `runAllAIs()` 関数（行549-610）

**変更内容**:
- プルダウンの選択値から `TaskAdapter.fromPrompts()` でタスクリストを生成
- `executeWithTaskList()` を使用して本番と同じ実行パスを通す
- スプレッドシートのデータは一切使用しない

### 2. ai-orchestrator.js の修正
**ファイル**: `/src/ai-execution/ai-orchestrator.js`
**修正箇所**: 実行ボタンのイベントリスナー（行795-868）

**変更内容**:
- タスクリストモード（本番）とテストモードを明確に分離
- テストモードではプルダウン選択値からタスクリストを生成
- `getUIConfig()` ヘルパー関数を追加

### 3. TaskAdapter.detectMode() の修正
**ファイル**: `/src/ai-execution/task-adapter.js`
**修正箇所**: `detectMode()` 関数（行295-344）

**変更内容**:
- テストモードの検出ロジックを追加
- `task_queue_for_test` の使用を廃止
- 本番用の `task_queue` のみを使用

## データフローの違い

### 本番モード（タスクリストモード）
```
スプレッドシート
    ↓
TaskGenerator
    ↓
Chrome Storage (task_queue)
    ↓
TaskAdapter.loadFromStorage()
    ↓
executeWithTaskList()
```

### テストモード（統合AIテスト）
```
プルダウン選択値（UI）
    ↓
getTestConfig() / getUIConfig()
    ↓
TaskAdapter.fromPrompts()
    ↓
executeWithTaskList()
```

## 実行方法

### 本番モード
1. コントロールパネルから「統合AIテスト開始」をクリック
2. スプレッドシートからタスクリストが読み込まれる
3. タスクが実行される

### テストモード
1. test-ai-automation-integrated.html を開く
2. プルダウンでモデル・機能・プロンプトを選択
3. 「テスト実行」ボタンをクリック
4. 選択値のみでタスクリストが生成され実行される

## 確認事項
- スプレッドシートのデータは統合AIテストで使用されません
- プルダウンの選択値のみが使用されます
- 本番とテストは同じ実行パス（executeWithTaskList）を通ります

## テスト方法
1. 統合AIテストページを開く
2. プルダウンで任意の値を選択
3. 実行してコンソールログを確認
   - 「🧪 テストモード」のログが表示される
   - スプレッドシート関連のログが表示されない
   - タスクリストがプルダウン選択値から生成される

## 注意事項
- TaskAdapterが利用できない場合のフォールバック処理も実装
- Chrome Storage の `task_queue_for_test` は使用しない
- テストモードの判定は複数の方法で行う（URLパラメータ、ページ要素など）