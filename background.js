// background.js - Service Worker 
console.log("AutoAI Service Worker が起動しました");

// 段階的復元: Step 1 - 基本サービスのみ（問題のあるファイルを除外）
import "./src/services/auth-service.js";
import "./src/features/spreadsheet/config.js";
import "./src/features/spreadsheet/url-parser.js";

// Step 3 - SheetsClientを追加
import "./src/features/spreadsheet/sheets-client.js";

// Step 4 - その他の基本ファイル
import "./src/features/spreadsheet/docs-client.js";
import "./src/features/spreadsheet/reader.js";

// Step 5 - タスク関連ファイル
import "./src/features/task/generator.js";
import TaskGenerator from "./src/features/task/generator.js";
import TaskQueue from "./src/features/task/queue.js";
import StreamProcessor from "./src/features/task/stream-processor.js";

// Step 6 - サービスファイル
import SpreadsheetAutoSetup from "./src/services/spreadsheet-auto-setup.js";
import SpreadsheetColumnRemover from "./src/services/spreadsheet-column-remover.js";

// Step 7 - コアモジュール
import "./src/core/streaming-service-manager.js";
import { getStreamingServiceManager } from "./src/core/streaming-service-manager.js";

// DeepResearchモジュール
import { deepResearchHandler } from "./src/modules/deep-research-handler.js";

// ===== AIタスク実行ハンドラー =====
// StreamProcessorからのAIタスク実行要求を処理
// 詳細な実装はsrc/handlers/ai-task-handler.jsに分離
// これにより、background.jsの肥大化を防ぎ、保守性を向上
import { aiTaskHandler } from "./src/handlers/ai-task-handler.js";

// ===== 共通AIタスク実行モジュール =====
import { AITaskExecutor } from "./src/core/ai-task-executor.js";
const aiTaskExecutor = new AITaskExecutor();

// ===== ウィンドウマネージャー =====
import { TestWindowManager } from "./src/ui/test-window-manager.js";

// グローバルにウィンドウマネージャーを設定
globalThis.aiWindowManager = new TestWindowManager();

// グローバルにAIタスクハンドラーを設定（StreamProcessorから直接アクセス可能にする）
globalThis.aiTaskHandler = aiTaskHandler;

// ===== ログマネージャー =====
class LogManager {
  constructor() {
    this.logs = [];
    this.maxLogs = 10000;
    this.connections = new Map(); // port connections
    this.categories = {
      AI: {
        CHATGPT: 'chatgpt',
        CLAUDE: 'claude',
        GEMINI: 'gemini',
        GENSPARK: 'genspark'
      },
      SYSTEM: 'system',
      ERROR: 'error'
    };
  }
  
  /**
   * ログを追加
   */
  log(message, options = {}) {
    const logEntry = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      timestamp: new Date().toISOString(),
      message: typeof message === 'string' ? message : JSON.stringify(message),
      category: options.category || 'system',
      level: options.level || 'info',
      ai: options.ai || null,
      metadata: options.metadata || {},
      source: options.source || 'background'
    };
    
    // ログを保存
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // 古いログを削除
    }
    
    // 接続中のビューアーに送信
    this.broadcast({ type: 'log', data: logEntry });
    
    // コンソールにも出力（開発用）
    const icon = {
      debug: '🔍',
      info: '📝',
      warning: '⚠️',
      error: '❌',
      success: '✅'
    }[logEntry.level] || '📝';
    
    console.log(`${icon} [LogManager] ${logEntry.message}`, options.metadata || '');
    
    return logEntry;
  }
  
  /**
   * AI別ログ
   */
  logAI(aiType, message, options = {}) {
    return this.log(message, {
      ...options,
      ai: aiType,
      category: aiType.toLowerCase()
    });
  }
  
  /**
   * エラーログ
   */
  error(message, error = null) {
    return this.log(message, {
      level: 'error',
      category: 'error',
      metadata: error ? { 
        message: error.message,
        stack: error.stack,
        name: error.name
      } : {}
    });
  }
  
  /**
   * 成功ログ
   */
  success(message, metadata = {}) {
    return this.log(message, {
      level: 'success',
      metadata
    });
  }
  
  /**
   * デバッグログ
   */
  debug(message, metadata = {}) {
    return this.log(message, {
      level: 'debug',
      metadata
    });
  }
  
  /**
   * 全接続にブロードキャスト
   */
  broadcast(message) {
    this.connections.forEach((port) => {
      try {
        port.postMessage(message);
      } catch (e) {
        // 接続が切れている場合は削除
        this.connections.delete(port);
      }
    });
  }
  
  /**
   * ログビューアー接続を追加
   */
  addConnection(port) {
    this.connections.set(port, port);
    
    // 接続時に既存のログを送信
    port.postMessage({
      type: 'logs-batch',
      data: this.logs
    });
    
    // 切断時の処理
    port.onDisconnect.addListener(() => {
      this.connections.delete(port);
    });
    
    // メッセージ受信
    port.onMessage.addListener((msg) => {
      if (msg.type === 'get-logs') {
        port.postMessage({
          type: 'logs-batch',
          data: this.logs
        });
      } else if (msg.type === 'clear') {
        this.clear(msg.category);
      }
    });
  }
  
  /**
   * ログをクリア
   */
  clear(category = null) {
    if (!category) {
      this.logs = [];
    } else {
      this.logs = this.logs.filter(log => {
        if (category === 'error') {
          return log.level !== 'error';
        } else if (category === 'system') {
          return log.category !== 'system';
        } else {
          return log.ai !== category;
        }
      });
    }
    
    this.broadcast({ type: 'clear', category });
  }
  
  /**
   * ログを取得
   */
  getLogs(filter = {}) {
    return this.logs.filter(log => {
      if (filter.category && log.category !== filter.category) return false;
      if (filter.level && log.level !== filter.level) return false;
      if (filter.ai && log.ai !== filter.ai) return false;
      return true;
    });
  }
}

// グローバルLogManagerインスタンス
const logManager = new LogManager();
globalThis.logManager = logManager;

// ===== 初期化完了後の処理 =====
// モジュール読み込み完了を待ってから初期化処理を実行
setTimeout(() => {
  console.log("モジュール読み込み完了、拡張機能初期化中...");

  // サービスの初期化確認
  if (
    globalThis.authService &&
    globalThis.sheetsClient &&
    globalThis.docsClient
  ) {
    console.log("✅ サービス初期化完了");
    console.log("  - authService: 利用可能");
    console.log("  - sheetsClient: 利用可能");
    console.log("  - docsClient: 利用可能");
    console.log("  - aiWindowManager: 利用可能");

    // 拡張機能インストール時の処理
    chrome.runtime.onInstalled.addListener(async () => {
      console.log("拡張機能がインストール/更新されました");
      // 自動認証は無効化（必要時のみ実行）
    });

    // Chrome起動時の処理
    chrome.runtime.onStartup.addListener(async () => {
      console.log("Chromeが起動しました");
      // 自動認証は無効化（必要時のみ実行）
    });
  } else {
    console.error("❌ サービス初期化に失敗しました");
    console.log("authService:", typeof globalThis.authService);
    console.log("sheetsClient:", typeof globalThis.sheetsClient);
    console.log("docsClient:", typeof globalThis.docsClient);
  }
}, 2000); // 2秒待機

// ===== グローバル変数 =====
let isProcessing = false;

// ===== AI実行制御（共通モジュールを使用） =====
/**
 * AIタスクを実行する中央制御関数
 * 共通のAITaskExecutorモジュールを使用
 */
async function executeAITask(tabId, taskData) {
  const startTime = Date.now();
  
  // セル位置情報を含む詳細ログ
  const cellInfo = taskData.cellInfo || {};
  console.log('[Background] cellInfo受信:', cellInfo, 'taskData:', taskData);
  const cellPosition = cellInfo.column && cellInfo.row ? `${cellInfo.column}${cellInfo.row}` : '不明';
  
  logManager.logAI(taskData.aiType, `📊 (${taskData.aiType}) Step1: スプレッドシート処理開始 [${cellPosition}セル]`, {
    level: 'info',
    metadata: {
      tabId,
      taskId: taskData.taskId,
      cellPosition,
      column: cellInfo.column,
      row: cellInfo.row,
      step: 1,
      process: 'スプレッドシート読み込み',
      model: taskData.model,
      function: taskData.function,
      promptLength: taskData.prompt?.length
    }
  });

  try {
    // 共通モジュールを使用してAIタスクを実行
    const result = await aiTaskExecutor.executeAITask(tabId, taskData);
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (result.success) {
      logManager.logAI(taskData.aiType, `✅ 全プロセス完了 [${cellPosition}セル] (${totalTime}秒)`, {
        level: 'success',
        metadata: {
          taskId: taskData.taskId,
          cellPosition,
          column: cellInfo.column,
          row: cellInfo.row,
          totalTime: `${totalTime}秒`,
          responseLength: result.response?.length || 0,
          allStepsCompleted: true,
          finalStep: 5,
          process: '回答取得完了'
        }
      });
    } else {
      logManager.logAI(taskData.aiType, `❌ 処理失敗 [${cellPosition}セル]: ${result.error}`, {
        level: 'error',
        metadata: {
          taskId: taskData.taskId,
          cellPosition,
          column: cellInfo.column,
          row: cellInfo.row,
          totalTime: `${totalTime}秒`,
          error: result.error,
          failedProcess: result.failedStep || '不明'
        }
      });
    }
    
    return result;
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logManager.error(`[${taskData.aiType}] AIタスク実行エラー: ${error.message}`, error);
    return { success: false, error: error.message };
  }
}


// ===== ヘルパー関数 =====
/**
 * 列名生成関数（A, B, ..., Z, AA, AB, ...）
 */
function getColumnName(index) {
  if (index < 0) return null;
  
  let columnName = '';
  let num = index;
  
  while (num >= 0) {
    columnName = String.fromCharCode(65 + (num % 26)) + columnName;
    num = Math.floor(num / 26) - 1;
    if (num < 0) break;
  }
  
  return columnName;
}

// ===== メッセージハンドラー =====
/**
 * processSpreadsheetData関数
 */
function processSpreadsheetData(spreadsheetData) {
  const result = {
    ...spreadsheetData,
    aiColumns: {},
    columnMapping: {},
  };

  if (!spreadsheetData.values || spreadsheetData.values.length === 0) {
    return result;
  }

  // メニュー行とAI行から情報を取得
  const menuRow = spreadsheetData.menuRow?.data || spreadsheetData.values[0];
  const aiRow = spreadsheetData.aiRow?.data || [];
  
  console.log("[Background] processSpreadsheetData - メニュー行:", menuRow);
  console.log("[Background] processSpreadsheetData - AI行:", aiRow);
  
  // 各列を解析
  menuRow.forEach((header, index) => {
    const columnLetter = getColumnName(index);
    const trimmedHeader = header ? header.trim() : "";
    const aiValue = aiRow[index] ? aiRow[index].trim() : "";
    
    // 列マッピングを作成
    result.columnMapping[columnLetter] = {
      index,
      header: trimmedHeader,
    };
    
    // デバッグログ
    if (index < 20) {
      console.log(`[Background] 列${columnLetter}: メニュー="${trimmedHeader}", AI="${aiValue}"`);
    }
    
    // プロンプト列の検出（プロンプト2等は除外）
    if (trimmedHeader === "プロンプト") {
      // AI行の値を確認して3種類AIレイアウトを検出
      let aiType = null;
      
      // AI行の現在の列の値をチェック（3種類の文字が含まれているか）
      if (aiValue.includes("3種類")) {
        aiType = "3type";
        console.log(`[Background] 3種類AIレイアウト検出（AI行から）: ${columnLetter}列, AI値="${aiValue}"`);
      }
      // 単独AIの場合
      else if (aiValue) {
        // AI行に値がある場合は単独AI
        aiType = "single";
        console.log(`[Background] 単独AIプロンプト列として検出: ${columnLetter}列, AI値="${aiValue}"`);
      }
      
      if (aiType) {
        result.aiColumns[columnLetter] = {
          index,
          letter: columnLetter,
          header: trimmedHeader,
          type: aiType,
          promptDescription: ""
        };
        console.log(`[Background] AI列として登録: ${columnLetter}列 (${aiType})`);
      }
    }
  });
  
  console.log("[Background] 処理後のaiColumns:", result.aiColumns);

  return result;
}

// ポート接続リスナー（ログビューアー用）
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'log-viewer') {
    logManager.addConnection(port);
    logManager.log('ログビューアー接続', { level: 'info' });
  }
});

/**
 * ポップアップ/ウィンドウからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action || request.type) {
    // ===== AI詳細ログメッセージ受信 =====
    case "LOG_AI_MESSAGE":
      if (request.aiType && request.message) {
        logManager.logAI(request.aiType, request.message, request.options || {});
        sendResponse({ success: true });
      } else {
        console.error('Invalid LOG_AI_MESSAGE format:', request);
        sendResponse({ success: false, error: 'Invalid message format' });
      }
      return false; // 同期応答

    // ===== AIタスク実行（コンテンツスクリプトから転送） =====
    case "executeAITask":
      console.log("[MessageHandler] 📨 AIタスク実行要求受信:", {
        from: sender.tab?.url?.split('?')[0],  // URLからクエリパラメータを除外
        tabId: sender.tab?.id,
        aiType: request.taskData?.aiType,
        model: request.taskData?.model,
        function: request.taskData?.function,
        promptPreview: request.taskData?.prompt?.substring(0, 50) + '...',
        cellInfo: request.taskData?.cellInfo,
        timestamp: new Date().toLocaleTimeString()
      });
      
      if (!sender.tab?.id) {
        sendResponse({ success: false, error: "タブIDが取得できません" });
        return false;
      }
      
      // 非同期でAIタスクを実行
      executeAITask(sender.tab.id, request.taskData)
        .then(result => {
          console.log("[MessageHandler] ✅ AIタスク応答送信:", {
            aiType: request.taskData?.aiType,
            taskId: request.taskData?.taskId,
            success: result.success,
            hasResponse: !!result.response,
            responseLength: result.response?.length || 0
          });
          sendResponse(result);
        })
        .catch(error => {
          console.error("[MessageHandler] ❌ AIタスク実行エラー:", {
            aiType: request.taskData?.aiType,
            taskId: request.taskData?.taskId,
            error: error.message
          });
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // 非同期応答のため true を返す
      
    // ----- スプレッドシート読み込み（タスク生成含む） -----
    case "loadSpreadsheet":
    case "loadSpreadsheets": // 互換性のため両方サポート
      (async () => {
        try {
          // 新旧フォーマット対応
          const url = request.url || (request.urls && request.urls[0]);
          console.log("[MessageHandler] スプレッドシート読み込み:", url);

          if (!url) {
            sendResponse({
              success: false,
              error: "URLが指定されていません",
            });
            return;
          }

          // 1. URLを解析
          const { spreadsheetId, gid } = globalThis.parseSpreadsheetUrl(url);
          if (!spreadsheetId) {
            sendResponse({
              success: false,
              error: "無効なスプレッドシートURLです",
            });
            return;
          }

          // 2. データを読み込み
          console.log("シートデータ読み込み中...");
          const updatedSpreadsheetData =
            await globalThis.sheetsClient.loadAutoAIData(spreadsheetId, gid);

          // 自動セットアップ
          const autoSetup = new SpreadsheetAutoSetup();
          const token = await globalThis.authService.getAuthToken();
          await autoSetup.executeAutoSetup(spreadsheetId, token, gid);

          // 3. データを整形（AI列情報を抽出）
          const processedData = processSpreadsheetData(updatedSpreadsheetData);
          
          // modelRowとtaskRowも含める
          processedData.modelRow = updatedSpreadsheetData.modelRow;
          processedData.taskRow = updatedSpreadsheetData.taskRow;
          
          console.log("[Background] 処理されたデータ:", {
            aiColumns: processedData.aiColumns,
            columnCount: Object.keys(processedData.columnMapping || {}).length,
            valueRows: updatedSpreadsheetData.values?.length || 0,
            modelRow: !!processedData.modelRow,
            taskRow: !!processedData.taskRow
          });

          // 4. タスクを生成
          console.log("タスク生成中...");
          const taskGenerator = new TaskGenerator();
          const taskList = await taskGenerator.generateTasks(processedData);  // awaitを追加
          
          // taskListとtasksの存在を確認
          if (!taskList || !taskList.tasks) {
            console.error("タスク生成失敗 - taskList:", taskList);
            throw new Error("タスク生成に失敗しました: タスクリストが空です");
          }
          
          console.log("[Background] 生成されたタスク:", {
            totalTasks: taskList.tasks.length,
            statistics: taskList.getStatistics(),
          });
          
          // タスクリストの詳細をログ出力
          console.log("[Background] 📋 タスクリスト詳細:");
          taskList.tasks.forEach((task, index) => {
            console.log(`  [${index + 1}] ${task.column}${task.row}:`, {
              id: task.id.substring(0, 8) + '...',
              aiType: task.aiType,
              model: task.model,
              function: task.function,
              multiAI: task.multiAI || false,
              groupId: task.groupId || null,
              promptPreview: task.prompt ? task.prompt.substring(0, 50) + '...' : ''
            });
          });
          
          // 列ごとのタスク数を集計
          const tasksByColumn = {};
          taskList.tasks.forEach(task => {
            if (!tasksByColumn[task.column]) {
              tasksByColumn[task.column] = 0;
            }
            tasksByColumn[task.column]++;
          });
          console.log("[Background] 📊 列ごとのタスク数:", tasksByColumn);

          // 5. タスクを保存
          console.log("タスク保存中...");
          const taskQueue = new TaskQueue();
          const saveResult = await taskQueue.saveTaskList(taskList);

          // 6. レスポンスを返す
          const response = {
            success: true,
            ...processedData,
            taskCount: taskList.tasks ? taskList.tasks.length : 0,
            taskQueueStatus: saveResult,
          };
          console.log("[MessageHandler] レスポンス:", response);
          sendResponse(response);
        } catch (error) {
          console.error("[MessageHandler] エラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 非同期レスポンスを有効化

    // ----- 認証関連 -----
    case "getAuthStatus":
      (async () => {
        try {
          const status = await globalThis.authService.checkAuthStatus();
          sendResponse(status);
        } catch (error) {
          sendResponse({ isAuthenticated: false, error: error.message });
        }
      })();
      return true;

    case "authenticate":
      (async () => {
        try {
          const token = await globalThis.authService.getAuthToken();
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ----- 自動テスト関連 -----
    case "checkServiceWorkerStatus":
      console.log("[MessageHandler] Service Worker ステータスチェック");
      sendResponse({ status: "ready", message: "Service Worker is active" });
      return false;

    case "checkAutoAIStatus":
      console.log("[MessageHandler] AutoAI ステータスチェック");
      const manager = getStreamingServiceManager();
      sendResponse({
        status: "ready",
        message: "AutoAI is ready",
        servicesReady: manager ? manager.isInitialized() : false,
      });
      return false;

    case "testServiceWorker":
      console.log("[MessageHandler] テストメッセージ受信:", request);
      sendResponse({ success: true, echo: request.data });
      return false;

    // ===== AIタスク実行 =====
    // StreamProcessorからのタスク実行要求を処理
    case "executeAITask":
      console.log("[MessageHandler] AIタスク実行要求:", {
        taskId: request.taskId,
        tabId: request.tabId,
        promptLength: request.prompt?.length || 0,
        waitResponse: request.waitResponse,
        getResponse: request.getResponse
      });
      
      // AITaskHandlerに処理を委譲（非同期処理）
      // waitResponse/getResponseの判定はAITaskHandler内で行う
      (async () => {
        try {
          const result = await aiTaskHandler.handleExecuteAITask(request, sender);
          sendResponse(result);
        } catch (error) {
          console.error("[MessageHandler] AIタスク実行エラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message,
            taskId: request.taskId 
          });
        }
      })();
      return true; // 非同期応答のため true を返す

    // ===== コンテンツスクリプトからのメッセージ =====
    case "contentScriptReady":
      console.log("[MessageHandler] コンテンツスクリプト準備完了:", {
        tabId: sender.tab?.id,
        url: sender.tab?.url,
        aiType: request.aiType
      });
      sendResponse({ received: true });
      return false;

    case "aiResponse":
      console.log("[MessageHandler] AI応答受信:", {
        tabId: sender.tab?.id,
        taskId: request.taskId,
        responseLength: request.response?.length || 0
      });
      sendResponse({ received: true });
      return false;

    // ===== ストリーミング処理開始 =====
    case "streamProcessTasks":
      console.log("[MessageHandler] ストリーミング処理開始要求:", {
        spreadsheetId: request.spreadsheetId,
        taskCount: request.tasks?.length || 0,
        testMode: request.testMode
      });
      
      (async () => {
        try {
          // StreamingServiceManagerを取得
          const manager = getStreamingServiceManager();
          
          if (!manager) {
            throw new Error("StreamingServiceManagerが取得できません");
          }
          
          // 初期化完了を待つ
          await manager.waitForInitialization();
          
          // ストリーミング処理を開始
          const result = await manager.startStreaming({
            spreadsheetId: request.spreadsheetId,
            spreadsheetUrl: request.spreadsheetUrl,
            gid: request.gid,
            tasks: request.tasks,
            columnMapping: request.columnMapping,
            testMode: request.testMode || false
          });
          
          sendResponse({
            success: true,
            totalWindows: result.totalWindows || 4,
            message: "ストリーミング処理を開始しました"
          });
        } catch (error) {
          console.error("[MessageHandler] ストリーミング処理開始エラー:", error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      return true; // 非同期応答のため true を返す
      
    // ===== タスクリストストリーミング処理（AI Orchestratorから） =====
    case "streamProcessTaskList":
      console.log("[MessageHandler] タスクリストストリーミング処理要求:", {
        taskListSize: request.taskList?.tasks?.length || 0,
        testMode: request.testMode
      });
      
      (async () => {
        try {
          // StreamProcessorは既に静的インポート済み
          const processor = new StreamProcessor();
          
          // スプレッドシートデータを準備
          const spreadsheetData = {
            spreadsheetId: request.spreadsheetId,
            spreadsheetUrl: request.spreadsheetUrl,
            gid: request.gid
          };
          
          // タスクリストを処理
          const result = await processor.processTaskStream(request.taskList, spreadsheetData, {
            testMode: request.testMode || false,
            taskListMode: true
          });
          
          console.log("[MessageHandler] StreamProcessor実行結果:", result);
          
          sendResponse({
            success: true,
            totalWindows: result.totalWindows || 0,
            processedColumns: result.processedColumns || [],
            message: "タスクリストストリーミング処理を開始しました"
          });
        } catch (error) {
          console.error("[MessageHandler] タスクリストストリーミング処理エラー:", error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      return true; // 非同期応答のため true を返す

    // ===== テストウィンドウ作成 =====
    case "createTestWindow":
      console.log("[MessageHandler] テストウィンドウ作成要求:", {
        aiType: request.aiType,
        url: request.url
      });
      
      (async () => {
        try {
          const window = await chrome.windows.create({
            url: request.url,
            type: "normal",
            state: "normal",
            left: request.left,
            top: request.top,
            width: request.width,
            height: request.height,
            focused: false
          });
          
          const tabs = await chrome.tabs.query({ windowId: window.id });
          
          sendResponse({
            success: true,
            windowId: window.id,
            tabId: tabs[0]?.id
          });
        } catch (error) {
          console.error("[MessageHandler] ウィンドウ作成エラー:", error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      return true;

    // ===== 画面情報取得 =====
    case "getScreenInfo":
      console.log("[MessageHandler] 画面情報取得要求");
      
      (async () => {
        try {
          const displays = await chrome.system.display.getInfo();
          const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
          
          sendResponse({
            screenWidth: primaryDisplay.bounds.width,
            screenHeight: primaryDisplay.bounds.height,
            availWidth: primaryDisplay.workArea.width,
            availHeight: primaryDisplay.workArea.height
          });
        } catch (error) {
          // system.display APIが使えない場合のフォールバック
          sendResponse({
            screenWidth: 1920,
            screenHeight: 1080,
            availWidth: 1920,
            availHeight: 1080
          });
        }
      })();
      return true;
    
    // ===== テストウィンドウ閉じる =====
    case "closeTestWindow":
      console.log("[MessageHandler] ウィンドウクローズ要求:", request.data);
      
      (async () => {
        try {
          if (request.data?.windowId) {
            await chrome.windows.remove(request.data.windowId);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: "windowId not provided" });
          }
        } catch (error) {
          console.error("[MessageHandler] ウィンドウクローズエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ===== AITaskHandlerログ設定 =====
    // test-runner-chrome.jsからのログ関数設定要求
    case "setAITaskLogger":
      console.log("[MessageHandler] AITaskHandlerログ設定要求");
      
      // 拡張機能のログ関数を設定
      const extensionLogFunction = (message, type = 'info') => {
        // 全ての拡張機能タブにログを送信
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.url && tab.url.includes('test-ai-automation-integrated.html')) {
              chrome.tabs.sendMessage(tab.id, {
                action: "extensionLog",
                message: message,
                type: type
              }).catch(() => {
                // エラーは無視（タブが閉じられている場合など）
              });
            }
          });
        });
      };
      
      aiTaskHandler.setExtensionLogger(extensionLogFunction);
      
      sendResponse({ 
        success: true, 
        message: "AITaskHandlerログ設定完了" 
      });
      return false;

    // ===== スプレッドシートログクリア =====
    case "clearLog":
      (async () => {
        try {
          console.log("[MessageHandler] ログクリア要求:", request.spreadsheetId);
          
          if (!request.spreadsheetId) {
            throw new Error("スプレッドシートIDが指定されていません");
          }

          // SheetsClientを使用してログをクリア
          const result = await sheetsClient.clearSheetLogs(request.spreadsheetId);
          
          console.log("[MessageHandler] ログクリア完了:", result);
          sendResponse({ 
            success: true, 
            clearedCount: result.clearedCount || 0,
            message: "ログをクリアしました"
          });
        } catch (error) {
          console.error("[MessageHandler] ログクリアエラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
      })();
      return true;

    // ===== AI回答削除 =====
    case "deleteAnswers":
      (async () => {
        try {
          console.log("[MessageHandler] 回答削除要求:", request.spreadsheetId);
          
          if (!request.spreadsheetId) {
            throw new Error("スプレッドシートIDが指定されていません");
          }

          // SheetsClientを使用してAI回答を削除
          const result = await sheetsClient.deleteAnswers(request.spreadsheetId);
          
          console.log("[MessageHandler] 回答削除完了:", result);
          sendResponse({ 
            success: true, 
            deletedCount: result.deletedCount || 0,
            message: "AI回答を削除しました"
          });
        } catch (error) {
          console.error("[MessageHandler] 回答削除エラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
      })();
      return true;

    default:
      console.warn("[MessageHandler] 未知のアクション:", request.action);
      sendResponse({ success: false, error: "Unknown action" });
      return false;
  }
});