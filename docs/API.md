# API リファレンス

## 📚 目次

1. [Service Worker API](#service-worker-api)
2. [Content Script API](#content-script-api)
3. [Service APIs](#service-apis)
4. [Utility Functions](#utility-functions)
5. [Event Messages](#event-messages)

## Service Worker API

### メッセージハンドラー

Service Workerは以下のメッセージタイプを処理します：

#### EXECUTE_TASK
タスクを実行します。

```javascript
chrome.runtime.sendMessage({
  type: 'EXECUTE_TASK',
  task: {
    prompt: 'AIへの質問',
    aiType: 'ChatGPT', // 'ChatGPT' | 'Claude' | 'Gemini'
    column: 'B',
    row: 2,
    spreadsheetId: 'xxx',
    sheetName: 'Sheet1'
  }
}, (response) => {
  console.log(response);
  // { success: true, taskId: 'task_123', result: '...' }
});
```

#### GET_SPREADSHEET_DATA
スプレッドシートデータを取得します。

```javascript
chrome.runtime.sendMessage({
  type: 'GET_SPREADSHEET_DATA',
  spreadsheetId: 'xxx',
  range: 'A1:Z100'
}, (response) => {
  console.log(response.values);
  // [['Header1', 'Header2'], ['Value1', 'Value2']]
});
```

#### WRITE_TO_CELL
セルに値を書き込みます。

```javascript
chrome.runtime.sendMessage({
  type: 'WRITE_TO_CELL',
  spreadsheetId: 'xxx',
  range: 'A1',
  value: '新しい値'
}, (response) => {
  console.log(response);
  // { success: true, updatedCells: 1 }
});
```

## Content Script API

### AIHandler クラス

各AIサイトで使用可能な共通インターフェース：

```javascript
class AIHandler {
  /**
   * プロンプトを送信
   * @param {string} prompt - 送信するプロンプト
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 応答結果
   */
  async sendPrompt(prompt, options = {}) {
    // 実装
  }

  /**
   * 応答を待機
   * @param {number} timeout - タイムアウト時間（ms）
   * @returns {Promise<string>} 応答テキスト
   */
  async waitForResponse(timeout = 60000) {
    // 実装
  }

  /**
   * モデルを選択
   * @param {string} model - モデル名
   * @returns {Promise<boolean>} 成功/失敗
   */
  async selectModel(model) {
    // 実装
  }
}
```

## Service APIs

### AuthService

認証管理サービス

```javascript
import { getService } from './src/core/service-registry.js';

const authService = await getService('authService');

// 認証トークンを取得
const token = await authService.getAuthToken();

// トークンをリフレッシュ
await authService.refreshToken();

// トークンをクリア
await authService.clearToken();
```

### SheetsClient

Google Sheets API クライアント

```javascript
const sheetsClient = await getService('sheetsClient');

// データを取得
const data = await sheetsClient.getSpreadsheetData(
  spreadsheetId,
  range
);

// セルに書き込み
await sheetsClient.writeToCell(
  spreadsheetId,
  range,
  value
);

// バッチ更新
await sheetsClient.batchUpdate(spreadsheetId, [
  { range: 'A1', values: [['Value1']] },
  { range: 'B1', values: [['Value2']] }
]);

// 範囲をクリア
await sheetsClient.clearRange(spreadsheetId, range);
```

### DocsClient

Google Docs API クライアント

```javascript
const docsClient = await getService('docsClient');

// ドキュメントを作成
const doc = await docsClient.createDocument('タイトル');

// テキストを挿入
await docsClient.insertText(
  documentId,
  'テキスト内容',
  index // 挿入位置
);

// タイトルを更新
await docsClient.updateTitle(documentId, '新しいタイトル');
```

### SpreadsheetLogger

ログ記録サービス

```javascript
const logger = await getService('spreadsheetLogger');

// ログを記録
await logger.logToSpreadsheet({
  timestamp: new Date(),
  level: 'INFO',
  message: 'タスク完了',
  data: { taskId: '123' }
});

// エラーログ
await logger.logError(error, context);

// バッチログ
await logger.batchLog([
  { level: 'INFO', message: 'メッセージ1' },
  { level: 'WARN', message: 'メッセージ2' }
]);
```

## Utility Functions

### parseSpreadsheetUrl

スプレッドシートURLを解析

```javascript
import { parseSpreadsheetUrl } from './src/utils/spreadsheet-utils.js';

const result = parseSpreadsheetUrl(
  'https://docs.google.com/spreadsheets/d/xxx/edit#gid=0'
);
// {
//   spreadsheetId: 'xxx',
//   sheetId: '0',
//   sheetName: null
// }
```

### debounce

関数のデバウンス処理

```javascript
import { debounce } from './src/utils/performance-utils.js';

const debouncedFn = debounce((value) => {
  console.log('実行:', value);
}, 500);

// 連続呼び出しでも最後の1回だけ実行
debouncedFn('a');
debouncedFn('b');
debouncedFn('c'); // これだけ実行される
```

### escapeHtml

HTMLエスケープ処理

```javascript
import { escapeHtml } from './src/utils/dom-utils.js';

const safe = escapeHtml('<script>alert("XSS")</script>');
// &lt;script&gt;alert("XSS")&lt;/script&gt;
```

## Event Messages

### タスク関連イベント

```javascript
// タスク開始
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TASK_STARTED') {
    console.log('タスク開始:', message.taskId);
  }
});

// タスク完了
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TASK_COMPLETED') {
    console.log('タスク完了:', message.result);
  }
});

// タスクエラー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TASK_ERROR') {
    console.error('タスクエラー:', message.error);
  }
});
```

### システムイベント

```javascript
// システムアラート
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYSTEM_ALERT') {
    console.warn('アラート:', message.alert);
  }
});

// メモリ警告
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MEMORY_WARNING') {
    console.warn('メモリ使用量:', message.percentage);
  }
});
```

## エラーハンドリング

### ErrorRecoverySystem

```javascript
import { errorRecoverySystem, ErrorType } from './src/core/error-recovery.js';

// エラーリカバリー付き関数実行
try {
  const result = await errorRecoverySystem.recover(
    error,
    ErrorType.NETWORK,
    {
      maxRetries: 3,
      retryDelay: 1000
    }
  );
} catch (finalError) {
  console.error('リカバリー失敗:', finalError);
}

// エラー統計
const stats = errorRecoverySystem.getErrorStatistics();
console.log('エラー統計:', stats);
```

### withErrorRecovery デコレーター

```javascript
import { withErrorRecovery, ErrorType } from './src/core/error-recovery.js';

// エラーリカバリー付き関数
const safeFetch = withErrorRecovery(
  async (url) => {
    const response = await fetch(url);
    return response.json();
  },
  ErrorType.NETWORK
);

// 自動リトライ付きで実行
const data = await safeFetch('https://api.example.com/data');
```

## メモリ管理

### MemoryManager

```javascript
import { memoryManager } from './src/core/memory-manager.js';

// キャッシュを作成
const cache = memoryManager.createCache('api-cache', {
  maxSize: 10 * 1024 * 1024, // 10MB
  ttl: 3600000 // 1時間
});

// キャッシュに保存
cache.set('key', data);

// キャッシュから取得
const cached = cache.get('key');

// メモリ監視開始
memoryManager.startMonitoring();

// 統計情報
const stats = memoryManager.getStatistics();
console.log('メモリ統計:', stats);
```

### オブジェクトプール

```javascript
// オブジェクトプールを作成
const pool = memoryManager.createObjectPool(
  'TaskWorker',
  () => new TaskWorker(),
  { maxSize: 10 }
);

// オブジェクトを借用
const worker = memoryManager.borrowObject('TaskWorker');

// 使用後に返却
memoryManager.returnObject('TaskWorker', worker);
```

## ログシステム

### EnhancedLogger

```javascript
import { logger, LogLevel, LogCategory } from './src/core/enhanced-logger.js';

// ログレベル設定
logger.setLevel(LogLevel.DEBUG);

// カテゴリー別ログ
logger.info('API呼び出し', { url, method }, LogCategory.API);
logger.warn('メモリ使用量高', { usage }, LogCategory.PERFORMANCE);
logger.error('認証失敗', error, {}, LogCategory.AUTH);

// パフォーマンス計測
logger.startPerformance('api-call');
const response = await fetch(url);
const duration = logger.endPerformance('api-call');

// ログ検索
const apiLogs = logger.search({
  category: LogCategory.API,
  level: LogLevel.ERROR,
  startTime: Date.now() - 3600000
});

// エクスポート
const exportData = logger.export('json');
```

## モニタリング

### SystemMonitor

```javascript
import { systemMonitor } from './src/monitoring/system-monitor.js';

// 監視開始
systemMonitor.start();

// 現在のメトリクス
const metrics = systemMonitor.getCurrentMetrics();
console.log('システムメトリクス:', metrics);

// 健全性スコア
const summary = systemMonitor.getSummary();
console.log('健全性:', summary.health);

// アラート追加
systemMonitor.addAlert('warning', 'メモリ使用量が高い', {
  usage: 80
});

// データエクスポート
const exportData = systemMonitor.export();
```

---

## 📝 注意事項

- すべてのAPIは非同期処理（Promise）を返します
- エラーハンドリングは必須です
- Chrome拡張機能のコンテキストでのみ動作します
- 適切な権限がmanifest.jsonに設定されている必要があります

## 🔗 関連ドキュメント

- [開発者ガイド](DEVELOPER.md)
- [アーキテクチャ](ARCHITECTURE.md)
- [トラブルシューティング](TROUBLESHOOTING.md)

---

🤖 Generated with [Claude Code](https://claude.ai/code)