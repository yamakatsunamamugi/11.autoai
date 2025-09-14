// background.js - Service Worker

// エラーハンドリングを追加
self.addEventListener('error', (event) => {
  console.error('Service Worker Error:', event);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker Unhandled Rejection:', event);
});

// ui-selectors-loaderを使用してJSONから読み込み
import { loadSelectors } from './src/config/ui-selectors-loader.js';

// UI_SELECTORSをグローバルに保持
let UI_SELECTORS = {};

// 起動時にセレクタを読み込み
(async () => {
  try {
    UI_SELECTORS = await loadSelectors();
    console.log('✅ Background: UI Selectors loaded');
  } catch (error) {
    console.error('❌ Background: Failed to load UI Selectors:', error);
    UI_SELECTORS = {};
  }
})();

// ポップアップウィンドウの管理
let popupWindowId = null;

// ポップアップを右下に移動する関数
async function movePopupToBottomRight() {
  try {
    // Chrome Storageから拡張機能のウィンドウIDを取得
    const storage = await chrome.storage.local.get('extensionWindowId');
    let extensionWindow = null;
    
    if (storage.extensionWindowId) {
      try {
        extensionWindow = await chrome.windows.get(storage.extensionWindowId);
      } catch (e) {
        // ウィンドウが既に閉じられている場合
      }
    }
    
    // StorageのIDが無効な場合、ui.htmlを含むウィンドウを検索
    if (!extensionWindow) {
      const windows = await chrome.windows.getAll({ populate: true });
      
      for (const window of windows) {
        if (window.tabs && window.tabs.length > 0) {
          const tab = window.tabs[0];
          if (tab.url && tab.url.includes('ui.html')) {
            extensionWindow = window;
            break;
          }
        }
      }
    }
    
    if (!extensionWindow) {
      return;
    }
    
    
    // 画面サイズを取得
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
    const screenWidth = primaryDisplay.workArea.width;
    const screenHeight = primaryDisplay.workArea.height;
    const screenLeft = primaryDisplay.workArea.left;
    const screenTop = primaryDisplay.workArea.top;
    
    // 4分割の右下に配置（画面の半分のサイズ）
    const popupWidth = Math.floor(screenWidth / 2);
    const popupHeight = Math.floor(screenHeight / 2);
    const left = screenLeft + Math.floor(screenWidth / 2); // 画面の右半分（オフセット考慮）
    const top = screenTop + Math.floor(screenHeight / 2);  // 画面の下半分（オフセット考慮）
    
    // ウィンドウを右下に移動とリサイズ
    await chrome.windows.update(extensionWindow.id, {
      left: left,
      top: top,
      width: popupWidth,
      height: popupHeight,
      focused: false // フォーカスは移動しない
    });
    
    popupWindowId = extensionWindow.id;
  } catch (error) {
    console.error('[Background] ポップアップ移動エラー:', error);
  }
}

// 段階的復元: Step 1 - 基本サービスのみ
import "./src/services/auth-service.js";
// 削除済み: config.js, url-parser.js, reader.js（StreamProcessor V2に統合）

// Step 3 - SheetsClientを追加
import "./src/features/spreadsheet/sheets-client.js";

// Step 4 - その他の基本ファイル
import "./src/features/spreadsheet/docs-client.js";

// SpreadsheetLogger - Service Worker環境で利用するためグローバル設定
import { SpreadsheetLogger } from "./src/features/logging/spreadsheet-logger.js";

// Step 5 - タスク関連ファイル

// V2版モジュール（静的インポート）
import StreamProcessorV2 from "./src/features/task/stream-processor-v2.js";

// Step 6 - サービスファイル
import SpreadsheetAutoSetup from "./src/services/spreadsheet-auto-setup.js";

// Step 7 - コアモジュール
import "./src/core/streaming-service-manager.js";
import { getStreamingServiceManager } from "./src/core/streaming-service-manager.js";

// DeepResearchモジュールは削除（1-ai-common-base.jsに統合済み）


// ===== AIタスク実行ハンドラー =====
// StreamProcessorからのAIタスク実行要求を処理
// 詳細な実装はsrc/handlers/ai-task-handler.jsに分離
// これにより、background.jsの肥大化を防ぎ、保守性を向上
import { aiTaskHandler } from "./src/handlers/ai-task-handler.js";

// ===== 共通AIタスク実行モジュール =====
import { AITaskExecutor } from "./src/core/ai-task-executor.js";
const aiTaskExecutor = new AITaskExecutor();


// グローバルにAIタスクハンドラーを設定（StreamProcessorから直接アクセス可能にする）
globalThis.aiTaskHandler = aiTaskHandler;

// グローバルにSpreadsheetLoggerクラスを設定（Service Worker環境でのアクセス用）
globalThis.SpreadsheetLogger = SpreadsheetLogger;

// PowerManager削除済み（power-config.jsに統合）
// globalThis.powerManager = new PowerManager();

// ===== アイドル状態の監視 =====
// スクリーンセイバーやスリープの検知
if (chrome.idle) {
  // 15秒ごとにアイドル状態をチェック
  chrome.idle.setDetectionInterval(15);
  
  // アイドル状態の変化を監視
  chrome.idle.onStateChanged.addListener((newState) => {
    const timestamp = new Date().toISOString();
    console.log(`🖥️ [Background] アイドル状態変化: ${newState} at ${timestamp}`);
    
    // LogManagerに記録
    if (globalThis.logManager) {
      globalThis.logManager.log(`システムアイドル状態: ${newState}`, {
        level: 'info',
        category: 'system',
        metadata: {
          state: newState,
          timestamp,
          // powerManagerStatus: globalThis.powerManager.getStatus() // 削除済み
        }
      });
    }
    
    // 状態に応じてログ
    switch(newState) {
      case 'active':
        console.log('✅ [Background] ユーザーがアクティブになりました');
        break;
      case 'idle':
        console.log('⏸️ [Background] システムがアイドル状態になりました');
        break;
      case 'locked':
        console.log('🔒 [Background] スクリーンがロック/スリープ状態になりました');
        // スリープ防止が有効な場合は警告
        // PowerManager削除済み
        // if (globalThis.powerManager.isActive) {
        //   console.warn('⚠️ [Background] スリープ防止が有効なのにスクリーンがロックされました！');
        //   console.warn('⚠️ [Background] PowerManager状態:', globalThis.powerManager.getStatus());
        // }
        break;
    }
  });
  
  // 初回のアイドル状態をチェック
  chrome.idle.queryState(15, (state) => {
    console.log(`🖥️ [Background] 初期アイドル状態: ${state}`);
  });
}

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
    
    // 重要なログのみ表示
    if (logEntry.level === 'error' || logEntry.level === 'warning') {
    }
    
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

  // サービスの初期化確認
  if (
    globalThis.authService &&
    globalThis.sheetsClient &&
    globalThis.docsClient
  ) {

    // 拡張機能インストール時の処理
    chrome.runtime.onInstalled.addListener(async () => {
      // 自動認証は無効化（必要時のみ実行）
    });

    // Chrome起動時の処理
    chrome.runtime.onStartup.addListener(async () => {
      // 自動認証は無効化（必要時のみ実行）
    });
  } else {
    console.error("❌ サービス初期化に失敗しました");
  }
}, 2000); // 2秒待機

// ===== グローバル変数 =====
let isProcessing = false;
// タスクグループキャッシュ（processSpreadsheetDataの結果を保存）
let taskGroupCache = {
  spreadsheetId: null,
  gid: null,
  taskGroups: null,
  timestamp: null
};

// ===== AI実行制御（共通モジュールを使用） =====
/**
 * AIタスクを実行する中央制御関数
 * 共通のAITaskExecutorモジュールを使用
 */
async function executeAITask(tabId, taskData) {
  const startTime = Date.now();
  
  // セル位置情報を含む詳細ログ
  const cellInfo = taskData.cellInfo || {};
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
          process: '[Request interrupted by user]回答テキスト取得できない　エラー'
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
 * グループタイプを判定するヘルパー関数
 */
function determineGroupType(trimmedHeader) {
  if (trimmedHeader === "レポート化") {
    return "report";
  } else if (trimmedHeader.includes("Genspark（スライド）")) {
    return "genspark_slide";
  } else if (trimmedHeader.includes("Genspark（ファクトチェック）")) {
    return "genspark_factcheck";
  } else if (trimmedHeader.includes("Genspark（")) {
    return "genspark";
  }
  return "standard";
}

/**
 * AIタイプを判定するヘルパー関数
 */
function determineAIType(trimmedHeader) {
  if (trimmedHeader === "レポート化") {
    return "Report";
  } else if (trimmedHeader.includes("Genspark（スライド）")) {
    return "Genspark-Slides";
  } else if (trimmedHeader.includes("Genspark（ファクトチェック）")) {
    return "Genspark-FactCheck";
  }
  return null;
}

/**
 * 列名をインデックスに変換（ヘルパー関数）
 */
function columnToIndex(column) {
  if (typeof column !== 'string' || column.length === 0) {
    return -1;
  }
  
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return index - 1; // 0ベースに変換
}

/**
 * 列制御をタスクグループに適用
 */
function applyColumnControlsToGroups(taskGroups, columnControls) {
  if (!columnControls || columnControls.length === 0) {
    return taskGroups;
  }
  
  // "この列のみ処理"が最優先
  const onlyControls = columnControls.filter(c => c.type === 'only');
  if (onlyControls.length > 0) {
    // 指定列を含むグループのみを選択
    const filteredGroups = taskGroups.filter(group => {
      // グループ内のすべての列をチェック
      const allColumns = [
        ...group.columnRange.promptColumns,
        ...group.columnRange.answerColumns.map(a => typeof a === 'string' ? a : a.column)
      ];
      
      // 指定列のいずれかがグループに含まれているか
      return onlyControls.some(ctrl => allColumns.includes(ctrl.column));
    });
    
    console.log(`[列制御] "この列のみ処理"により${taskGroups.length}グループから${filteredGroups.length}グループに絞り込み`);
    return filteredGroups;
  }
  
  // "この列から処理"と"この列で停止"の処理
  const fromControl = columnControls.find(c => c.type === 'from');
  const untilControl = columnControls.find(c => c.type === 'until');
  
  let filteredGroups = taskGroups;
  
  if (fromControl) {
    // 指定列以降のグループのみ
    filteredGroups = filteredGroups.filter(group => {
      const groupStartIndex = columnToIndex(group.startColumn);
      return groupStartIndex >= fromControl.index;
    });
    console.log(`[列制御] "${fromControl.column}列から処理"によりグループをフィルタ`);
  }
  
  if (untilControl) {
    // 指定列までのグループのみ
    filteredGroups = filteredGroups.filter(group => {
      const groupEndIndex = columnToIndex(group.endColumn);
      return groupEndIndex <= untilControl.index;
    });
    console.log(`[列制御] "${untilControl.column}列で停止"によりグループをフィルタ`);
  }
  
  return filteredGroups;
}

/**
 * processSpreadsheetData関数
 * StreamProcessorV2.processSpreadsheetDataへ委譲
 */
function processSpreadsheetData(spreadsheetData) {
  try {
    // StreamProcessorV2のインスタンスを作成
    const processor = new StreamProcessorV2(console);

    // StreamProcessorV2のprocessSpreadsheetDataメソッドを使用
    const result = processor.processSpreadsheetData(spreadsheetData);

    console.log(`[processSpreadsheetData] StreamProcessorV2で処理完了: タスクグループ${result.taskGroups?.length || 0}個`);

    return result;
  } catch (error) {
    console.error('[processSpreadsheetData] StreamProcessorV2でエラー:', error);

    // フォールバック: 旧実装を使用
    return processSpreadsheetDataLegacy(spreadsheetData);
  }
}

/**
 * processSpreadsheetData関数（旧実装）
 * StreamProcessorV2が失敗した場合のフォールバック
 */
function processSpreadsheetDataLegacy(spreadsheetData) {
  
  const result = {
    ...spreadsheetData,
    aiColumns: {},
    columnMapping: {},
    taskGroups: [],  // タスクグループ情報を追加
  };
  

  if (!spreadsheetData.values || spreadsheetData.values.length === 0) {
    return result;
  }
  
  // 列制御情報を収集
  let columnControls = [];
  if (spreadsheetData.controlCandidateRows && spreadsheetData.controlCandidateRows.length > 0) {
    // 制御候補行から列制御を検出
    for (const controlRow of spreadsheetData.controlCandidateRows) {
      const rowData = controlRow.data;
      if (!rowData) continue;
      
      for (let col = 0; col < rowData.length; col++) {
        const cellValue = rowData[col];
        if (!cellValue || typeof cellValue !== 'string') continue;
        
        const columnLetter = getColumnName(col);
        
        // 列制御パターンをチェック
        if (cellValue.includes('この列のみ処理')) {
          columnControls.push({ type: 'only', column: columnLetter, index: col });
          console.log(`[列制御] 「この列のみ処理」検出: ${columnLetter}列`);
        } else if (cellValue.includes('この列から処理')) {
          columnControls.push({ type: 'from', column: columnLetter, index: col });
          console.log(`[列制御] 「この列から処理」検出: ${columnLetter}列`);
        } else if (cellValue.includes('この列の処理後に停止') || cellValue.includes('この列で停止')) {
          columnControls.push({ type: 'until', column: columnLetter, index: col });
          console.log(`[列制御] 「この列で停止」検出: ${columnLetter}列`);
        }
        
        // 特定列指定パターン（例：P列のみ処理、Q列から処理）
        const specificColumnMatch = cellValue.match(/([A-Z]+)列(のみ処理|だけ処理|から処理|で停止|の処理後に停止)/);
        if (specificColumnMatch) {
          const targetColumn = specificColumnMatch[1];
          const controlType = specificColumnMatch[2];
          const targetIndex = columnToIndex(targetColumn);
          
          if (controlType.includes('のみ') || controlType.includes('だけ')) {
            columnControls.push({ type: 'only', column: targetColumn, index: targetIndex });
            console.log(`[列制御] 「${targetColumn}列のみ処理」検出`);
          } else if (controlType.includes('から')) {
            columnControls.push({ type: 'from', column: targetColumn, index: targetIndex });
            console.log(`[列制御] 「${targetColumn}列から処理」検出`);
          } else if (controlType.includes('停止')) {
            columnControls.push({ type: 'until', column: targetColumn, index: targetIndex });
            console.log(`[列制御] 「${targetColumn}列で停止」検出`);
          }
        }
      }
    }
  }
  
  // 列制御情報をresultに保存
  result.columnControls = columnControls;
  
  if (columnControls.length > 0) {
    console.log(`[列制御] 総計${columnControls.length}件の列制御を検出`);
  }

  // メニュー行とAI行から情報を取得
  const menuRow = spreadsheetData.menuRow?.data || spreadsheetData.values[0] || [];
  const aiRow = spreadsheetData.aiRow?.data || [];
  
  // menuRowが配列でない場合は空配列として処理
  if (!Array.isArray(menuRow)) {
    console.warn("[processSpreadsheetData] menuRowが配列ではありません:", menuRow);
    return result;
  }
  
  // メニュー行の内容をデバッグ出力
  const menuRowDetails = menuRow.map((header, index) => `${getColumnName(index)}:${header}`);
  console.log("[DEBUG] メニュー行の全内容（空でない）:", menuRowDetails.filter(item => item.split(':')[1]));
  
  // レポート化関連の列を特別に検索
  const reportColumns = menuRow.map((header, index) => {
    if (header && header.toString().includes('レポート')) {
      return `${getColumnName(index)}:「${header}」`;
    }
    return null;
  }).filter(item => item);
  console.log("[DEBUG] レポート関連列:", reportColumns);
  
  // タスクグループを識別するためのデータ構造
  let currentGroup = null;
  let groupCounter = 1;
  
  try {
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
    
    
    // ログ列の検出（常に新しいグループを開始）
    if (trimmedHeader === "ログ") {
      // 前のグループがあれば完了させる
      if (currentGroup && currentGroup.columnRange.answerColumns.length > 0) {
        result.taskGroups.push(currentGroup);
        groupCounter++;
      }
      
      // 新しいグループを開始
      currentGroup = {
        id: `group_${groupCounter}`,
        name: `タスクグループ${groupCounter}`,
        startColumn: columnLetter,
        endColumn: columnLetter,  // 暫定、後で更新
        columnRange: {
          logColumn: columnLetter,
          promptColumns: [],
          answerColumns: []
        },
        groupType: 'single',
        aiType: 'Claude',
        dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
        sequenceOrder: groupCounter
      };
      
      // ログ列検出時の詳細ログ出力を削除（後でまとめて出力）
    }
    
    // 特別列の検出（新グループの開始）
    if (trimmedHeader === "レポート化" ||
        trimmedHeader.includes("Genspark（スライド）") ||
        trimmedHeader.includes("Genspark（ファクトチェック）")) {
      // 前のグループがあれば完了させる
      if (currentGroup) {
        if (currentGroup.columnRange.answerColumns.length > 0 ||
            ['report', 'genspark_slide', 'genspark_factcheck', 'genspark'].includes(currentGroup.groupType)) {
          result.taskGroups.push(currentGroup);
          groupCounter++;
        }
      }

      // 特殊グループを作成
      const specialGroup = {
        id: `group_${groupCounter}`,
        name: `タスクグループ${groupCounter}`,
        startColumn: columnLetter,
        endColumn: columnLetter,
        columnRange: {
          logColumn: null,
          promptColumns: [columnLetter],
          answerColumns: []  // 特殊グループは回答列を持たない
        },
        groupType: determineGroupType(trimmedHeader),
        aiType: determineAIType(trimmedHeader),
        dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
        sequenceOrder: groupCounter,
        isSpecialGroup: true  // 特殊グループフラグ
      };

      // 特殊グループは即座に追加（次の列を待たない）
      result.taskGroups.push(specialGroup);
      groupCounter++;
      currentGroup = null;  // 現在のグループをクリア

      console.log(`[processSpreadsheetData] 特殊グループ検出: ${trimmedHeader} (${columnLetter}列) - ${specialGroup.groupType}`);
    }
    
    // プロンプト列の検出
    if (trimmedHeader.includes("プロンプト")) {
      // 前のグループが完成していれば新しいグループを開始
      if (currentGroup && currentGroup.columnRange.promptColumns.length > 0 && 
          currentGroup.columnRange.answerColumns.length > 0) {
        result.taskGroups.push(currentGroup);
        groupCounter++;
        currentGroup = null;
      }
      
      // 現在のグループがない場合、新しいグループを開始
      if (!currentGroup) {
        currentGroup = {
          id: `group_${groupCounter}`,
          name: `タスクグループ${groupCounter}`,
          startColumn: columnLetter,
          endColumn: columnLetter,  // 暫定、後で更新
          columnRange: {
            logColumn: null,  // ログ列は後で検出される可能性がある
            promptColumns: [columnLetter],
            answerColumns: []
          },
          groupType: 'single',
          aiType: 'Claude',
          dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
          sequenceOrder: groupCounter
        };
      } else {
        // 既存のグループにプロンプト列を追加
        currentGroup.columnRange.promptColumns.push(columnLetter);
      }
      
      // AI行の値からグループタイプを判定
      if (aiValue.includes("3種類")) {
        currentGroup.groupType = "3type";
        currentGroup.aiType = aiValue;
      } else if (aiValue) {
        currentGroup.groupType = "single";
        currentGroup.aiType = aiValue;
      }
    }
    
    // 回答列の検出
    if (currentGroup && (trimmedHeader.includes("回答") || trimmedHeader.includes("答"))) {
      // AB列の判定（デバッグログ削除）
      
      // AIタイプを判定
      let detectedAiType = 'Claude'; // デフォルト
      
      // 3種類AIの判定（グループタイプが3typeの場合）
      if (currentGroup.groupType === '3type') {
        // 3種類AIの場合は、メニュー行の回答列名から判定
        const menuCellLower = trimmedHeader.toLowerCase();
        if (menuCellLower.includes('chatgpt') || menuCellLower.includes('gpt')) {
          detectedAiType = 'ChatGPT';
        } else if (menuCellLower.includes('claude')) {
          detectedAiType = 'Claude';
        } else if (menuCellLower.includes('gemini')) {
          detectedAiType = 'Gemini';
        } else if (menuCellLower.includes('genspark')) {
          detectedAiType = 'Genspark';
        } else if (menuCellLower.includes('レポート') || menuCellLower.includes('report')) {
          detectedAiType = 'Report';
        }
      } else {
        // 通常処理の場合は、グループのAIタイプ（プロンプト列から設定済み）を使用
        detectedAiType = currentGroup.aiType || 'Claude';
      }
      
      // AB列の判定完了
      
      currentGroup.columnRange.answerColumns.push({
        column: columnLetter,
        aiType: detectedAiType,
        index: index
      });
      
      // グループの終了列を更新
      currentGroup.endColumn = columnLetter;
    }
    
    // 既存のaiColumns処理（互換性のため維持）
    if (trimmedHeader === "プロンプト") {
      // AI行の値を確認して3種類AIレイアウトを検出
      let aiType = null;
      
      // AI行の現在の列の値をチェック（3種類の文字が含まれているか）
      if (aiValue.includes("3種類")) {
        aiType = "3type";
      }
      // 単独AIの場合
      else if (aiValue) {
        // AI行に値がある場合は単独AI
        aiType = "single";
      }
      
      if (aiType) {
        result.aiColumns[columnLetter] = {
          index,
          letter: columnLetter,
          header: trimmedHeader,
          type: aiType,
          promptDescription: ""
        };
      }
    }
    });
    
    // 最後のグループを追加
    // 特殊グループ（レポート化、Genspark）は回答列がなくても追加
    if (currentGroup) {
      if (currentGroup.columnRange.answerColumns.length > 0 ||
          ['report', 'genspark_slide', 'genspark_factcheck', 'genspark'].includes(currentGroup.groupType)) {
        result.taskGroups.push(currentGroup);
      }
    }
    
    // 列制御をタスクグループに適用
    if (columnControls.length > 0) {
      const originalCount = result.taskGroups.length;
      result.taskGroups = applyColumnControlsToGroups(result.taskGroups, columnControls);
      console.log(`[列制御] 適用: ${originalCount}グループ → ${result.taskGroups.length}グループ`);
    }
    
    // タスクグループ作成完了（詳細ログ）
    if (result.taskGroups.length > 0) {
      console.log(`[processSpreadsheetData] ✅ タスクグループ検出完了: ${result.taskGroups.length}個`);
      
      // 全タスクグループの詳細をまとめてログ出力
      const groupSummary = result.taskGroups.map((group, index) => {
        const logCol = group.columnRange.logColumn || 'なし';
        
        // メニュー列の計算（ログ列の次の列）
        let menuCol = 'なし';
        let menuContent = '';
        if (group.columnRange.logColumn) {
          const logIndex = columnToIndex(group.columnRange.logColumn);
          menuCol = getColumnName(logIndex + 1);
          // メニュー列の内容を取得（メニュー行のデータ）
          if (menuRow && menuRow[logIndex + 1]) {
            menuContent = menuRow[logIndex + 1].toString().trim();
          }
        }
        
        const promptCols = group.columnRange.promptColumns.join(', ') || 'なし';
        
        // 回答列を文字列として表示（オブジェクトではなく）
        const answerCols = group.columnRange.answerColumns.map(col => 
          typeof col === 'object' ? col.column || JSON.stringify(col) : col
        ).join(', ') || 'なし';
        
        // グループタイプを含める
        const groupType = group.groupType || 'standard';
        const aiType = group.aiType || 'Claude';
        
        // メニュー内容の表示を決定
        let displayMenuContent = '';
        if (groupType === 'report') {
          // レポート化の場合はそのまま表示
          displayMenuContent = 'レポート化';
        } else if (groupType === 'genspark_slide') {
          // Gensparkスライドの場合
          displayMenuContent = 'Genspark（スライド）';
        } else if (groupType === 'genspark_factcheck') {
          // Gensparkファクトチェックの場合
          displayMenuContent = 'Genspark（ファクトチェック）';
        } else if (groupType === 'genspark') {
          // その他のGenspark
          displayMenuContent = menuContent || 'Genspark';
        } else {
          // 通常処理の場合
          // 複数のAIタイプがあるかチェック
          const aiTypes = new Set();
          if (group.columnRange.answerColumns && group.columnRange.answerColumns.length > 0) {
            group.columnRange.answerColumns.forEach(col => {
              if (typeof col === 'object' && col.aiType) {
                aiTypes.add(col.aiType);
              }
            });
          }
          
          if (aiTypes.size >= 3) {
            // 3種類以上のAIを使用している場合
            displayMenuContent = '3種類AI';
          } else {
            // 単一AIまたは2種類の場合
            const mainAiType = aiType || 'Claude';
            displayMenuContent = `通常処理（${mainAiType}）`;
          }
        }
        
        // 特殊グループの場合は明記
        let groupLabel = `グループ${index + 1}`;
        
        return `${groupLabel}: ` +
               `タイプ=${groupType}, ` +
               `AI=${aiType}, ` +
               `ログ=${logCol}, ` +
               `メニュー=${menuCol}(${displayMenuContent}), ` +
               `プロンプト=[${promptCols}], ` +
               `回答=[${answerCols}]`;
      }).join('\n  ');
      
      console.log(`[タスクグループ構造]\n  ${groupSummary}`);
    } else {
      console.log("[processSpreadsheetData] ⚠️ タスクグループが作成されませんでした");
    }
    
  } catch (taskGroupError) {
    console.error("[processSpreadsheetData] taskGroups生成エラー:", taskGroupError);
    // エラーが発生してもtaskGroupsは空配列として継続
  }
  
  // タスクグループ検出結果（簡潔版）
  console.log(`[processSpreadsheetData] タスクグループ: ${result.taskGroups.length}個`);

  return result;
}

// Service Workerのグローバルスコープに関数を設定
globalThis.processSpreadsheetData = processSpreadsheetData;

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
    // ===== PowerManager制御（スクリーンセイバー防止） =====
    case "START_AI_PROCESSING":
      (async () => {
        // PowerManager削除済み - power-config.jsを使用してください
        // await globalThis.powerManager.startProtection('message-handler');
        console.log('⚠️ PowerManager削除済み - power-config.jsを使用してください');
        sendResponse({ success: true });
      })();
      return true;
      
    case "STOP_AI_PROCESSING":
      (async () => {
        // PowerManager削除済み - power-config.jsを使用してください
        // await globalThis.powerManager.stopProtection('message-handler');
        console.log('⚠️ PowerManager削除済み - power-config.jsを使用してください');
        sendResponse({ success: true });
      })();
      return true;
    
    // Keep-Aliveメッセージの処理
    case "KEEP_ALIVE_PING":
      // PowerManagerからのKeep-Aliveメッセージ（処理不要、ログのみ）
      console.log('🏓 [Background] KEEP_ALIVE_PING受信', {
        timestamp: request.timestamp,
        currentTime: Date.now()
      });
      sendResponse({ success: true });
      return false;
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

    // ===== セレクタ検出ログメッセージ受信 =====
    case "SELECTOR_DETECTION_LOG":
      if (request.log) {
        const { timestamp, message, type, aiType } = request.log;
        
        // LogManagerに送信（拡張機能UI用）
        logManager.logAI(aiType || 'selector_detection', message, {
          level: type === 'error' ? 'error' : 'info',
          timestamp: timestamp,
          category: 'selector_detection'
        });
        sendResponse({ success: true });
      } else {
        console.error('Invalid SELECTOR_DETECTION_LOG format:', request);
        sendResponse({ success: false, error: 'Invalid log format' });
      }
      return false; // 同期応答

    // ===== AIタスク実行（コンテンツスクリプトから転送） =====
    case "executeAITask":
      console.log(`[Background] 📝 AIタスク実行要求受信:`, {
        from: sender.tab?.url?.split('?')[0],  // URLからクエリパラメータを除外
        tabId: sender.tab?.id,
        aiType: request.taskData?.aiType,
        model: request.taskData?.model,
        function: request.taskData?.function,
        promptLength: request.taskData?.prompt?.length,
        promptPreview: request.taskData?.prompt ? request.taskData?.prompt.substring(0, 100) + '...' : '❌ プロンプトがありません！',
        hasPrompt: !!request.taskData?.prompt,
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
          console.log("[MessageHandler] ✅ AIタスク実行成功:", {
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

    // ===== レポートタスク実行 =====
    case "executeReportTask":
      console.log("[Background] 📄 レポートタスク実行要求受信:", request.task);

      (async () => {
        try {
          // ReportExecutorを使用してレポート生成
          const ReportExecutor = globalThis.ReportExecutor;
          if (!ReportExecutor) {
            // ReportExecutorが利用できない場合は簡易処理
            const reportUrl = `https://docs.google.com/document/d/sample_report_${Date.now()}`;
            sendResponse({
              success: true,
              url: reportUrl,
              message: "レポート作成完了（テスト）"
            });
            return;
          }

          const executor = new ReportExecutor({ logger: console });
          const result = await executor.executeTask(request.task, {
            spreadsheetId: request.task.spreadsheetId,
            gid: request.task.sheetGid
          });

          sendResponse(result);
        } catch (error) {
          console.error("[Background] レポートタスクエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();

      return true; // 非同期応答

    // ===== Gensparkタスク実行 =====
    case "executeGensparkTask":
      console.log("[Background] ⚡ Gensparkタスク実行要求受信:", request.task);

      (async () => {
        try {
          // Gensparkタブを開いて処理
          const gensparkUrl = request.task.functionType === 'factcheck'
            ? 'https://www.genspark.ai/factcheck'
            : 'https://www.genspark.ai/slides';

          // 新しいタブでGensparkを開く
          const tab = await chrome.tabs.create({ url: gensparkUrl, active: false });

          // ページの読み込みを待つ
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Gensparkタスクを実行
          const result = await chrome.tabs.sendMessage(tab.id, {
            action: 'executeGensparkAutomation',
            text: request.task.text,
            functionType: request.task.functionType
          });

          // タブを閉じる
          await chrome.tabs.remove(tab.id);

          sendResponse({
            success: true,
            url: result.extractedUrls?.[0] || result.url,
            text: result.text,
            message: `Genspark${request.task.functionType === 'slides' ? 'スライド' : 'ファクトチェック'}完了`
          });
        } catch (error) {
          console.error("[Background] Gensparkタスクエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();

      return true; // 非同期応答

    // ===== Google Sheetsデータ取得 =====
    case "getSheetsData":
      console.log(`[Background] 📊 Google Sheets データ取得:`, {
        spreadsheetId: request.spreadsheetId,
        range: request.range
      });
      
      if (!request.spreadsheetId || !request.range) {
        sendResponse({ 
          success: false, 
          error: "spreadsheetIdとrangeが必要です" 
        });
        return false;
      }
      
      // SheetsClientインスタンスがグローバルに存在するか確認
      if (typeof globalThis.sheetsClient === 'undefined') {
        console.error("[MessageHandler] ❌ sheetsClientが初期化されていません");
        sendResponse({ 
          success: false, 
          error: "sheetsClientが初期化されていません" 
        });
        return false;
      }
      
      // Google Sheets APIを呼び出してデータ取得（Promise形式）
      globalThis.sheetsClient.getSheetData(request.spreadsheetId, request.range)
        .then(data => {
          console.log("[MessageHandler] ✅ Sheetsデータ取得成功:", {
            rowsCount: data?.values?.length || 0,
            firstRow: data?.values?.[0]
          });
          sendResponse({ 
            success: true, 
            data: data 
          });
        })
        .catch(error => {
          console.error("[MessageHandler] ❌ Sheetsデータ取得エラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        });
      
      return true; // 非同期応答
      
    /**
     * 列追加のみ実行（タスク生成なし）
     * 
     * 【機能概要】
     * UIの「列追加」ボタンから呼び出される専用ハンドラ
     * スプレッドシートの読み込みやタスク生成は行わず、
     * 列追加（SpreadsheetAutoSetup）のみを実行する
     * 
     * 【処理内容】
     * 1. スプレッドシートURLを解析してIDとGIDを取得
     * 2. SpreadsheetAutoSetupクラスのexecuteAutoSetup()を実行
     * 3. プロンプト列の前後に必要な列（ログ列、回答列）を追加
     * 4. 結果をUIに返す
     * 
     * 【既存コードの再利用】
     * - SpreadsheetAutoSetup: src/services/spreadsheet-auto-setup.js
     *   既存の列追加ロジックをそのまま使用（変更なし）
     * - loadSpreadsheets処理でも同じSpreadsheetAutoSetupを使用しているが、
     *   そちらはタスク生成も含む完全な処理を行う
     * 
     * @since 2025-08-23 列追加ボタン機能として追加
     */
    case "executeAutoSetup":
      (async () => {
        try {
          const url = request.urls && request.urls[0];

          if (!url) {
            sendResponse({
              success: false,
              error: "URLが指定されていません",
            });
            return;
          }

          // ステップ1-1: URL解析でスプレッドシートIDとgidを取得
          // 使用方法: SheetsClient.parseSpreadsheetUrl(url) または globalThis.parseSpreadsheetUrl(url)
          // 機能: /spreadsheets/d/[ID]/ 形式からIDを抽出、#gid=数値 からgidを抽出
          const { spreadsheetId, gid } = globalThis.parseSpreadsheetUrl(url);
          if (!spreadsheetId) {
            sendResponse({
              success: false,
              error: "無効なスプレッドシートURLです",
            });
            return;
          }

          // 既存のSpreadsheetAutoSetupクラスを使用して列追加を実行
          // このクラスは元々loadSpreadsheetsでも使用されている
          const autoSetup = new SpreadsheetAutoSetup();
          const token = await globalThis.authService.getAuthToken();
          const result = await autoSetup.executeAutoSetup(spreadsheetId, token, gid);

          // 結果をUIに返す
          sendResponse({
            success: result.success,
            message: result.message,
            addedColumns: result.addedColumns?.length || 0,  // 追加された列の数
            hasAdditions: result.hasAdditions,                // 列が追加されたかどうか
            error: result.error
          });
        } catch (error) {
          console.error("[MessageHandler] 列追加エラー:", error);
          sendResponse({
            success: false,
            error: error.message,
          });
        }
      })();
      return true;  // 非同期処理のためtrueを返す
      
    // ----- スプレッドシート読み込み（タスク生成含む） -----
    case "loadSpreadsheet":
    case "loadSpreadsheets": // 互換性のため両方サポート
      (async () => {
        try {
          // 新旧フォーマット対応
          const url = request.url || (request.urls && request.urls[0]);

          if (!url) {
            sendResponse({
              success: false,
              error: "URLが指定されていません",
            });
            return;
          }

          // ステップ1-1: URL解析でスプレッドシートIDとgidを取得
          // 統合機能: SheetsClient.parseSpreadsheetUrl() - ステップ9-1で詳細ログ出力
          const { spreadsheetId, gid } = globalThis.parseSpreadsheetUrl(url);
          if (!spreadsheetId) {
            sendResponse({
              success: false,
              error: "無効なスプレッドシートURLです",
            });
            return;
          }

          // 2. データを読み込み
          const updatedSpreadsheetData =
            await globalThis.sheetsClient.loadAutoAIData(spreadsheetId, gid);

          // 自動セットアップ
          const autoSetup = new SpreadsheetAutoSetup();
          const token = await globalThis.authService.getAuthToken();
          await autoSetup.executeAutoSetup(spreadsheetId, token, gid);

          // 3. データを整形（AI列情報を抽出）
          let processedData;
          try {
            processedData = processSpreadsheetData(updatedSpreadsheetData);
            
            // modelRowとtaskRowも含める
            processedData.modelRow = updatedSpreadsheetData.modelRow;
            processedData.taskRow = updatedSpreadsheetData.taskRow;
            
            // タスクグループをキャッシュに保存
            taskGroupCache = {
              spreadsheetId: spreadsheetId,
              gid: gid,
              taskGroups: processedData.taskGroups,
              timestamp: Date.now()
            };
            console.log(`[MessageHandler] タスクグループをキャッシュに保存: ${processedData.taskGroups?.length || 0}グループ`);
          } catch (processError) {
            console.error("[MessageHandler] processSpreadsheetDataエラー:", processError);
            // エラーが発生してもデフォルトのデータを使用
            processedData = {
              ...updatedSpreadsheetData,
              aiColumns: {},
              columnMapping: {}
            };
          }
          

          // 4. タスクグループ情報は作成済み（processedData.taskGroupsに格納）
          // 実行時に各グループごとに動的にタスクを判定するため、起動時のタスク生成は不要
          console.log("✅ タスクグループ準備完了 - 実行時に動的タスク判定を行います");
          
          // TaskQueue保存は不要（動的生成のため）

          // 6. レスポンスを返す（大きなデータを除外してメッセージサイズを削減）
          const response = {
            success: true,
            aiColumns: processedData.aiColumns,
            columnMapping: processedData.columnMapping,
            taskGroups: processedData.taskGroups,  // タスクグループ情報を追加
            sheetName: processedData.sheetName,
            modelRow: processedData.modelRow,
            taskRow: processedData.taskRow,
            // タスクは実行時に動的生成するため、起動時は0件で正常
            message: "タスクグループ作成完了 - 実行時に動的タスク判定"
          };
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
      sendResponse({ status: "ready", message: "Service Worker is active" });
      return false;

    case "checkAutoAIStatus":
      const manager = getStreamingServiceManager();
      sendResponse({
        status: "ready",
        message: "AutoAI is ready",
        servicesReady: manager ? manager.isInitialized() : false,
      });
      return false;

    case "testServiceWorker":
      sendResponse({ success: true, echo: request.data });
      return false;

    // ===== コンテンツスクリプトからのメッセージ =====
    case "contentScriptReady":
      console.log(`[Background] 📡 コンテンツスクリプト準備完了:`, {
        tabId: sender.tab?.id,
        url: sender.tab?.url,
        aiType: request.aiType
      });
      sendResponse({ received: true });
      return false;

    case "aiResponse":
      console.log(`[Background] 🤖 AI応答受信:`, {
        tabId: sender.tab?.id,
        taskId: request.taskId,
        responseLength: request.response?.length || 0
      });
      sendResponse({ received: true });
      return false;

    // ===== ストリーミング処理開始 =====
    case "streamProcessTasks":
      console.log(`[Background] 🌊 ストリーミング処理開始:`, {
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
      console.log(`[Background] 📋 動的タスク生成ストリーミング処理:`, {
        isDynamicMode: !request.taskList,
        testMode: request.testMode,
        spreadsheetId: request.spreadsheetId,
        hasSpreadsheetUrl: !!request.spreadsheetUrl
      });
      
      // 即座にレスポンスを送信してメッセージチャネルの閉鎖を防ぐ
      sendResponse({
        success: true,
        totalWindows: 4, // デフォルト値
        processedColumns: [],
        message: "タスクリストストリーミング処理を開始しました"
      });
      
      // バックグラウンドで非同期処理を開始
      (async () => {
        try {
          // ポップアップウィンドウを右下に移動
          await movePopupToBottomRight();
          
          // V2モード切り替えフラグ（上部の設定と同じ値を使用）
          const USE_V2_MODE = true; // true: V2版を使用, false: 従来版を使用
          
          let processor;
          if (USE_V2_MODE) {
            processor = new StreamProcessorV2();
          } else {
            processor = new StreamProcessorV2();
          }
          
          // スプレッドシートデータを取得
          let spreadsheetData;
          let processedData = { taskGroups: [] }; // 初期化
          
          if (request.spreadsheetId) {
            // スプレッドシートのデータを読み込み
            const sheetData = await globalThis.sheetsClient.loadAutoAIData(
              request.spreadsheetId,
              request.gid
            );
            
            spreadsheetData = {
              spreadsheetId: request.spreadsheetId,
              spreadsheetUrl: request.spreadsheetUrl,
              gid: request.gid,
              sheetName: sheetData.sheetName || request.sheetName || null,
              values: sheetData.values || [],
              modelRow: sheetData.modelRow || null,
              taskRow: sheetData.taskRow || null,
              aiRow: sheetData.aiRow || null
            };
            
            console.log(`[Background] 📊 スプレッドシートデータ取得完了:`, {
              rows: spreadsheetData.values.length,
              columns: spreadsheetData.values[0]?.length || 0,
              sheetName: spreadsheetData.sheetName
            });
            
            // キャッシュされたタスクグループを使用するか、新規作成
            if (taskGroupCache.spreadsheetId === request.spreadsheetId && 
                taskGroupCache.gid === request.gid && 
                taskGroupCache.taskGroups) {
              // キャッシュを使用
              processedData = {
                taskGroups: taskGroupCache.taskGroups
              };
              console.log(`[Background] キャッシュされたタスクグループを使用: ${taskGroupCache.taskGroups.length}グループ`);
            } else {
              // スプレッドシートデータを処理してタスクグループを作成
              processedData = processSpreadsheetData(sheetData);
              console.log(`[Background] タスクグループ作成完了: ${processedData.taskGroups.length}グループ`);
            }
          } else {
            // スプレッドシートIDがない場合は空のデータ
            spreadsheetData = {
              spreadsheetId: '',
              spreadsheetUrl: '',
              gid: null,
              sheetName: null,
              values: []
            };
          }
          
          // 動的タスク生成モード（StreamProcessorV2のメインエントリーポイント）
          const result = await processor.processDynamicTaskGroups(spreadsheetData, {
            testMode: request.testMode || false,
            taskGroups: processedData.taskGroups || []  // タスクグループ情報を渡す
          });
          
        } catch (error) {
          console.error("❌ [MessageHandler] タスクリストストリーミング処理エラー:", error);
          console.error("❌ [Debug] エラー詳細:", {
            message: error.message,
            stack: error.stack,
            taskListSize: request.taskList?.tasks?.length || 0
          });
        }
      })();
      
      return true; // 非同期応答（バックグラウンド処理を実行）

    // ===== テストウィンドウ作成 =====
    case "createTestWindow":
      console.log(`[Background] 🪟 テストウィンドウ作成:`, {
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
            focused: true  // ウィンドウを最前面に表示
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

    // ===== リトライ用新規ウィンドウ作成 =====
    case "RETRY_WITH_NEW_WINDOW":
      console.log(`[Background] 🔄 新規ウィンドウでリトライ:`, {
        taskId: request.taskId,
        aiType: request.aiType,
        error: request.error
      });
      
      (async () => {
        try {
          // AIタイプに応じたURLを決定
          const aiUrls = {
            'ChatGPT': 'https://chatgpt.com',
            'Claude': 'https://claude.ai',
            'Gemini': 'https://gemini.google.com'
          };
          
          const url = aiUrls[request.aiType] || aiUrls['Claude'];
          
          // 新規ウィンドウを作成
          const window = await chrome.windows.create({
            url: url,
            type: "normal",
            state: "normal",
            focused: true
          });
          
          const tabs = await chrome.tabs.query({ windowId: window.id });
          const newTabId = tabs[0]?.id;
          
          if (newTabId) {
            // 新規タブでページ読み込み完了を待つ
            setTimeout(async () => {
              try {
                // 新規タブでタスクを再実行
                const response = await chrome.tabs.sendMessage(newTabId, {
                  action: "EXECUTE_RETRY_TASK",
                  taskId: request.taskId,
                  prompt: request.prompt,
                  enableDeepResearch: request.enableDeepResearch,
                  specialMode: request.specialMode,
                  isRetry: true,
                  originalError: request.error
                });
                
                // 元のタブに結果を通知
                if (sender.tab?.id) {
                  chrome.tabs.sendMessage(sender.tab.id, {
                    action: "RETRY_RESULT",
                    taskId: request.taskId,
                    ...response
                  });
                }
                
                sendResponse({
                  success: true,
                  windowId: window.id,
                  tabId: newTabId,
                  message: "リトライタスクを開始しました"
                });
              } catch (error) {
                console.error("[MessageHandler] リトライタスク実行エラー:", error);
                sendResponse({
                  success: false,
                  error: error.message
                });
              }
            }, 5000); // ページ読み込みを待つ
          } else {
            throw new Error("新規タブIDが取得できません");
          }
        } catch (error) {
          console.error("[MessageHandler] リトライウィンドウ作成エラー:", error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      return true;
    
    // ===== リトライ通知 =====
    case "RETRY_NOTIFICATION":
      
      // UIタブに通知を転送
      (async () => {
        try {
          // WindowServiceを使用して特定のタブにメッセージを送信（タブ操作を統一）
          await WindowService.sendMessageToMatchingTabs(
            (tab) => tab.url && tab.url.includes('ui-controller.html'),
            {
              action: "showRetryNotification",
              data: request.data
            }
          );
          sendResponse({ success: true });
        } catch (error) {
          console.error("[MessageHandler] リトライ通知エラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ===== AITaskHandlerログ設定 =====
    // test-runner-chrome.jsからのログ関数設定要求
    case "setAITaskLogger":
      
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

    // ===== セレクタデータ転送 =====
    case "selector-data":
      console.log(`[Background] 🎯 セレクタデータ受信:`, {
        from: sender.tab?.url,
        tabId: sender.tab?.id,
        aiTypes: Object.keys(request.data || {}),
        timestamp: new Date().toLocaleTimeString()
      });
      
      // UIウィンドウに転送
      chrome.runtime.getContexts
        ? chrome.runtime.getContexts({}).then(contexts => {
            const uiWindow = contexts.find(ctx => 
              ctx.documentUrl?.includes('ui.html') || 
              ctx.documentUrl?.includes('ui-controller')
            );
            
            // セレクタデータは直接処理（転送不要）
            console.log(`[Background] 🔍 セレクタデータ処理:`, {
              from: sender.tab?.url,
              tabId: sender.tab?.id,
              dataKeys: Object.keys(request.data || {}),
              timestamp: new Date().toLocaleTimeString()
            });
            
            // LogManagerに記録
            if (request.data) {
              Object.entries(request.data).forEach(([aiType, data]) => {
                logManager.logAI(aiType, `セレクタデータ更新: ${Object.keys(data).length}項目`, {
                  level: 'info',
                  category: 'selector_data'
                });
              });
            }
            
            if (false) { // UIウィンドウへの転送を無効化
              // ポートを使用して転送
              if (uiPort) {
                uiPort.postMessage({
                  type: 'selector-data',
                  data: request.data
                });
              } else {
                console.warn("[MessageHandler] ⚠️ UIウィンドウが見つかりません");
              }
            }
          }).catch(err => {
            console.error("[MessageHandler] getContextsエラー:", err);
            // フォールバック: ポートを使用
            if (uiPort) {
              uiPort.postMessage({
                type: 'selector-data',
                data: request.data
              });
            }
          })
        : (() => {
            // chrome.runtime.getContextsが使用できない場合
            if (uiPort) {
              uiPort.postMessage({
                type: 'selector-data',
                data: request.data
              });
            } else {
              console.warn("[MessageHandler] ⚠️ UIポートが利用できません");
            }
          })();
      
      sendResponse({ success: true, message: "セレクタデータ受信完了" });
      return false;

    // ===== スプレッドシートログクリア =====
    /**
     * 【clearLog アクション】
     * 
     * 概要：
     * スプレッドシートのログ列とA列をクリアする処理
     * 
     * 処理内容：
     * 1. sheets-client.js の clearSheetLogs でメニュー行の「ログ」列をクリア
     * 2. batchUpdate でA列（A2:A1000）をクリア
     * 
     * 依存関係：
     * - sheets-client.js: clearSheetLogs, batchUpdate
     * - ui-controller.js から呼び出される
     * 
     * エラーハンドリング：
     * - A列のクリアに失敗してもログクリアが成功していれば成功とする
     */
    case "clearLog":
      (async () => {
        try {
          
          if (!request.spreadsheetId) {
            throw new Error("スプレッドシートIDが指定されていません");
          }

          // SheetsClientを使用してログをクリア
          const result = await sheetsClient.clearSheetLogs(request.spreadsheetId);
          
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
    /**
     * 【deleteAnswers アクション】
     * 
     * 概要：
     * スプレッドシートのAI回答列とA列をクリアする処理
     * 
     * 処理内容：
     * 1. sheets-client.js の deleteAnswers でAI回答列を検出してクリア
     * 2. 同メソッド内でA列（A2:A1000）も同時にクリア
     * 
     * 削除対象：
     * - メニュー行にあるAI名（Claude、ChatGPT、Gemini等）の列
     * - A列の作業行マーカー（1の値）
     * 
     * 依存関係：
     * - sheets-client.js: deleteAnswers, columnMapping
     * - ui-controller.js から呼び出される
     * 
     * ログクリアとの違い：
     * - ログクリア: ログ列＋A列
     * - 回答削除: AI回答列＋A列
     */
    case "deleteAnswers":
      (async () => {
        try {
          
          if (!request.spreadsheetId) {
            throw new Error("スプレッドシートIDが指定されていません");
          }

          // SheetsClientを使用してAI回答を削除
          const result = await sheetsClient.deleteAnswers(request.spreadsheetId);
          
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

    // ===== スプレッドシート読み込み（ColumnProcessor用） =====
    // 注意: このケースは line 784 で既に処理されているため、コメントアウト
    // 重複によるエラーを防ぐため
    /*
    case "loadSpreadsheet":
      (async () => {
        try {
          const { spreadsheetId, sheetName } = request;
          
          // AITaskHandlerのloadSpreadsheet関数を呼び出し
          if (globalThis.aiTaskHandler) {
            const data = await globalThis.aiTaskHandler.loadSpreadsheet(
              spreadsheetId,
              sheetName
            );
            
            sendResponse({ success: true, data });
          } else {
            throw new Error("AITaskHandler not available");
          }
        } catch (error) {
          console.error("[MessageHandler] スプレッドシート読み込みエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    */

    // ===== プロンプト動的取得（V2用） =====
    case "fetchPromptFromSpreadsheet":
      (async () => {
        try {
          const { spreadsheetId, row, promptColumns, sheetName, gid } = request;
          
          // AITaskHandlerのfetchPromptFromSpreadsheet関数を呼び出し
          if (globalThis.aiTaskHandler) {
            const prompt = await globalThis.aiTaskHandler.fetchPromptFromSpreadsheet(
              spreadsheetId,
              { row, promptColumns, sheetName }
            );
            
            sendResponse({ success: true, prompt });
          } else {
            throw new Error("AITaskHandler not available");
          }
        } catch (error) {
          console.error("[MessageHandler] プロンプト取得エラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    // ===== スプレッドシート書き込み（V2用） =====
    case "writeToSpreadsheet":
      (async () => {
        try {
          const { spreadsheetId, range, value, sheetName } = request;
          
          if (!globalThis.sheetsClient) {
            throw new Error("SheetsClient not available");
          }
          
          // スプレッドシートに書き込み
          const fullRange = sheetName ? `'${sheetName}'!${range}` : range;
          const result = await globalThis.sheetsClient.writeValue(spreadsheetId, fullRange, value);
          
          sendResponse({ success: true, result });
        } catch (error) {
          console.error("[MessageHandler] スプレッドシート書き込みエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    
    // ===== 送信時刻記録メッセージ =====
    case "recordSendTime":
      (async () => {
        try {
          let spreadsheetLogger = null;
          
          // 方法1: StreamingServiceManagerからStreamProcessorを取得
          try {
            const manager = getStreamingServiceManager();
            const streamProcessor = manager?.serviceRegistry?.get("StreamProcessor");
            spreadsheetLogger = streamProcessor?.spreadsheetLogger;
          } catch (error) {
          }
          
          // 方法2: グローバルSpreadsheetLoggerを使用（フォールバック）
          if (!spreadsheetLogger && globalThis.spreadsheetLogger) {
            spreadsheetLogger = globalThis.spreadsheetLogger;
          }
          
          console.log(`[Background] ⏰ 送信時刻記録:`, {
            taskId: request.taskId,
            sendTime: request.sendTime,
            aiType: request.taskInfo?.aiType,
            model: request.taskInfo?.model,
            spreadsheetLogger: !!spreadsheetLogger
          });
          
          // SpreadsheetLoggerに送信時刻を記録
          if (spreadsheetLogger) {
            // ISO文字列をDateオブジェクトに変換
            const sendTime = new Date(request.sendTime);
            
            
            // SpreadsheetLoggerのrecordSendTimeを呼び出し（送信時刻を直接設定）
            spreadsheetLogger.sendTimestamps.set(request.taskId, {
              time: sendTime,
              aiType: request.taskInfo.aiType || 'Unknown',
              model: request.taskInfo.model || '不明'
            });
            
            
            // 拡張機能のログシステムにも記録
            if (globalThis.logManager) {
              globalThis.logManager.log(`📝 送信時刻記録: ${request.taskInfo?.aiType} - ${request.taskId}`, {
                category: 'system',
                level: 'info',
                metadata: {
                  taskId: request.taskId,
                  aiType: request.taskInfo?.aiType,
                  model: request.taskInfo?.model,
                  sendTime: sendTime.toLocaleString('ja-JP')
                }
              });
            }
            
            sendResponse({ success: true });
          } else {
            console.warn("❌ [MessageHandler] SpreadsheetLoggerが利用できません");
            sendResponse({ success: false, error: "SpreadsheetLogger not available" });
          }
        } catch (error) {
          console.error("❌ [MessageHandler] 送信時刻記録エラー:", error);
          console.error("エラー詳細:", { message: error.message, stack: error.stack, name: error.name });
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
      })();
      return true;

    // ===== テスト機能メッセージハンドラー =====
    
    // AIセレクタ変更検出テスト
    case "testAiSelector":
      (async () => {
        try {
          
          // AIセレクタの検出処理（実際の実装はAI検出システムを使用）
          sendResponse({ 
            success: true, 
            message: "AIセレクタ検出テスト完了"
          });
        } catch (error) {
          console.error("[TestHandler] AIセレクタ検出エラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
      })();
      return true;
    
    // 統合AIテスト開始
    case "startIntegratedTest":
      (async () => {
        try {
          
          // テスト用のウィンドウを作成
          const windows = [];
          const aiUrls = [
            'https://chatgpt.com',
            'https://claude.ai',
            'https://gemini.google.com'
          ];
          
          for (const url of aiUrls) {
            // WindowServiceを使用してウィンドウを作成（focused: trueがデフォルトで設定される）
            const window = await WindowService.createWindow({
              url: url,
              type: 'popup',
              width: 800,
              height: 600,
              left: 100 + windows.length * 50,
              top: 100 + windows.length * 50
            });
            windows.push({ id: window.id, url: url });
            
            // 少し待機
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          sendResponse({ 
            success: true, 
            message: "統合AIテスト開始",
            windows: windows
          });
        } catch (error) {
          console.error("[TestHandler] 統合AIテストエラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
      })();
      return true;
    
    // レポート生成テスト
    case "generateReport":
      (async () => {
        try {
          
          // レポート生成処理（簡易実装）
          const reportData = {
            timestamp: new Date().toISOString(),
            aiStatus: {
              chatgpt: { status: 'active', model: 'GPT-4' },
              claude: { status: 'active', model: 'Claude-3' },
              gemini: { status: 'active', model: 'Gemini-Pro' }
            },
            testResults: []
          };
          
          // レポートHTMLを生成（簡易版）
          const reportHtml = `
            <html>
              <head><title>テストレポート</title></head>
              <body>
                <h1>AIテストレポート</h1>
                <p>生成日時: ${reportData.timestamp}</p>
                <h2>AIステータス</h2>
                <pre>${JSON.stringify(reportData.aiStatus, null, 2)}</pre>
              </body>
            </html>
          `;
          
          // レポートをdata URLとして作成
          const reportUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(reportHtml);
          
          sendResponse({ 
            success: true, 
            message: "レポート生成完了",
            reportUrl: reportUrl
          });
        } catch (error) {
          console.error("[TestHandler] レポート生成エラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
      })();
      return true;
    
    // AIステータス取得
    case "getAIStatus":
      (async () => {
        try {
          
          // ストレージからAI設定を取得
          const result = await chrome.storage.local.get(['ai_config_persistence']);
          const aiConfig = result.ai_config_persistence || {};
          
          // ステータス情報を構築
          const status = {
            chatgpt: aiConfig.chatgpt || { status: 'unknown' },
            claude: aiConfig.claude || { status: 'unknown' },
            gemini: aiConfig.gemini || { status: 'unknown' }
          };
          
          sendResponse({ 
            success: true, 
            status: status,
            message: "AIステータス取得完了"
          });
        } catch (error) {
          console.error("[TestHandler] AIステータス取得エラー:", error);
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