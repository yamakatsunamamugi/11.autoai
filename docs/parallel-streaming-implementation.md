# 並列ストリーミング処理実装

## 概要
タスク実行時の並列ストリーミング処理を実装しました。「処理を開始」ボタンを押すと、AIウィンドウを開いて波のように処理が広がっていきます。

## 実装の特徴

### 1. 並列ストリーミング処理の動作
- 最初の列の最初の行から開始
- タスクが完了したら：
  - 同じ列の次の行へ進む（同じウィンドウを使い回す）
  - 完了した行の隣の列も開始する
- 波のように処理が広がっていく

### 2. ウィンドウ管理
- 最大4つのウィンドウを使用
- 列ごとに同じウィンドウを使い回す（効率的な処理）
- 4分割レイアウト：左上→右上→左下→右下
- 列の処理が完了したらウィンドウを閉じる

### 3. 回答フィルタリング
- 既に回答がある場合は自動的にスキップ
- 空白、TODO、PENDING、エラーなどは未回答として扱う
- 効率的にタスクを処理

### 4. AI種別対応
- Claude: https://claude.ai/new
- Gemini: https://gemini.google.com/app
- ChatGPT: https://chatgpt.com/?model=gpt-4o
- モデル（o3、o3-pro）にも対応

## 実装ファイル

### コアファイル
- `/src/features/task/stream-processor.js` - 並列ストリーミング処理の中核
- `/src/features/task/generator.js` - StreamProcessorと統合

### 主要メソッド

#### StreamProcessor
```javascript
// タスクリストをストリーミング処理で実行
async processTaskStream(taskList, spreadsheetData)

// 列の処理を開始
async startColumnProcessing(column)

// タスク完了時の処理（波の伝播）
async onTaskCompleted(task, windowId)

// 全ウィンドウを閉じる
async closeAllWindows()
```

#### TaskGenerator
```javascript
// タスクを生成して実行（ストリーミング処理）
async generateAndExecuteTasks(spreadsheetData, options)

// StreamProcessorの状態を取得
getStreamingStatus()

// ストリーミング処理を停止
async stopStreaming()
```

## テストファイル
- `/tests/test-stream-processor.html` - StreamProcessor単体テスト
- `/tests/test-integration-preview.html` - 統合テスト（実際の処理を開始ボタンの動作をシミュレート）

## 使用例
```javascript
// TaskGeneratorを使用してストリーミング処理を開始
const generator = new TaskGenerator();
const result = await generator.generateAndExecuteTasks(spreadsheetData);

// 処理状態を確認
const status = generator.getStreamingStatus();
console.log(status);

// 処理を停止
await generator.stopStreaming();
```

## 今後の統合作業
1. background.jsへのStreamProcessor統合
2. 実際の「処理を開始」ボタンとの連携
3. コンテンツスクリプトとの通信実装