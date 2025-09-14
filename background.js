/**
 * @fileoverview background.js - Service Worker
 * Chrome拡張機能のメインエントリーポイント
 *
 * 【ステップ構成】
 * Step 1: 初期化とエラーハンドリング
 * Step 2: モジュールインポート
 * Step 3: グローバル初期化
 * Step 4: Service Worker起動
 * Step 5: メッセージハンドラー設定
 */

// ===== Step 1: 初期化とエラーハンドリング =====
console.log('[Step 1-1] Service Worker起動開始');

// Step 1-2: エラーハンドリングを追加
self.addEventListener('error', (event) => {
  console.error('[Step 1-3] Service Worker Error:', event);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[Step 1-4] Service Worker Unhandled Rejection:', event);
});

// ===== Step 2: モジュールインポート =====
console.log('[Step 2-1] モジュールインポート開始');

// Step 2-2: 設定とユーティリティ
import { loadSelectors } from './src/config/ui-selectors-loader.js';

// Step 2-3: 分離したコアモジュール
import { logManager } from './src/core/log-manager.js';
import {
  processSpreadsheetData,
  taskGroupCache,
  getColumnName,
  columnToIndex
} from './src/core/task-group-processor.js';
import { setupMessageHandler } from './src/handlers/message-handler.js';

// Step 2-4: Google Services統合モジュール
import {
  googleServices,
  authService,
  sheetsClient,
  docsClient,
  spreadsheetLogger
} from './src/services/google-services.js';

// Step 2-5: その他のサービス
import './src/services/auth-service.js';
import './src/services/window-service.js';
import './src/features/spreadsheet/sheets-client.js';
import './src/services/docs-client.js';
import './src/features/spreadsheet/spreadsheet-auto-setup.js';
import './src/features/logging/spreadsheet-logger.js';
import { getStreamingServiceManager } from './src/core/streaming-service-manager.js';
import { AITaskExecutor } from './src/core/ai-task-executor.js';
import { AITaskHandler } from './src/handlers/ai-task-handler.js';
import { ReportExecutor } from './automations/2-5-report-automation.js';
import { GensparkAutomation } from './automations/2-4-genspark-automation.js';
import SpreadsheetAutoSetup from './src/services/spreadsheet-auto-setup.js';
import StreamProcessorV2 from './src/features/task/stream-processor-v2.js';

console.log('[Step 2-6] モジュールインポート完了');

// ===== Step 3: グローバル変数初期化 =====
console.log('[Step 3-1] グローバル変数初期化開始');

// Step 3-2: UI_SELECTORSをグローバルに保持
let UI_SELECTORS = {};

// Step 3-3: その他のグローバル変数
let isProcessing = false;
const USE_V2_MODE = true; // V2版StreamProcessorを使用

// Step 3-4: グローバル参照の設定
globalThis.logManager = logManager;
globalThis.googleServices = googleServices;
globalThis.authService = authService;
globalThis.sheetsClient = sheetsClient;
globalThis.docsClient = docsClient;
globalThis.spreadsheetLogger = spreadsheetLogger;
globalThis.processSpreadsheetData = processSpreadsheetData;
globalThis.taskGroupCache = taskGroupCache;
globalThis.getColumnName = getColumnName;
globalThis.columnToIndex = columnToIndex;
globalThis.ReportExecutor = ReportExecutor;
globalThis.GensparkAutomation = GensparkAutomation;
globalThis.SpreadsheetAutoSetup = SpreadsheetAutoSetup;
globalThis.StreamProcessorV2 = StreamProcessorV2;
globalThis.aiTaskExecutor = new AITaskExecutor();
globalThis.aiTaskHandler = new AITaskHandler();

// Step 3-5: parseSpreadsheetUrl関数
globalThis.parseSpreadsheetUrl = (url) => {
  console.log('[Step 3-5-1] parseSpreadsheetUrl実行:', url);

  if (!url || typeof url !== 'string') {
    console.warn('[Step 3-5-2] 無効なURL:', url);
    return { spreadsheetId: null, gid: null };
  }

  const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = spreadsheetMatch ? spreadsheetMatch[1] : null;

  const gidMatch = url.match(/[#&]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : null;

  console.log('[Step 3-5-3] URL解析結果:', { spreadsheetId, gid });
  return { spreadsheetId, gid };
};

console.log('[Step 3-6] グローバル変数初期化完了');

// ===== Step 4: Service Worker起動時の初期化 =====
console.log('[Step 4-1] Service Worker初期化開始');

// Step 4-2: 起動時にセレクタを読み込み
(async () => {
  try {
    console.log('[Step 4-3] UI Selectors読み込み開始');
    UI_SELECTORS = await loadSelectors();
    globalThis.UI_SELECTORS = UI_SELECTORS;
    console.log('[Step 4-4] ✅ UI Selectors loaded');
  } catch (error) {
    console.error('[Step 4-5] ❌ Failed to load UI Selectors:', error);
    UI_SELECTORS = {};
    globalThis.UI_SELECTORS = {};
  }
})();

// Step 4-6: 拡張機能のインストール/更新時の処理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Step 4-7] 拡張機能インストール/更新:', details.reason);

  // Step 4-8: 初回インストール時の処理
  if (details.reason === 'install') {
    console.log('[Step 4-9] 初回インストール - 設定を初期化');
    chrome.storage.local.set({
      installDate: new Date().toISOString(),
      version: chrome.runtime.getManifest().version
    });
  }

  // Step 4-10: 更新時の処理
  if (details.reason === 'update') {
    console.log('[Step 4-11] 拡張機能更新 - 既存のバージョン:', details.previousVersion);
  }
});

// Step 4-12: Service Worker起動時のGoogle Services初期化
(async () => {
  try {
    console.log('[Step 4-13] Google Services初期化開始');
    await googleServices.initialize();
    console.log('[Step 4-14] ✅ Google Services初期化完了');
  } catch (error) {
    console.error('[Step 4-15] ❌ Google Services初期化エラー:', error);
  }
})();

// Step 4-16: StreamingServiceManager初期化
(async () => {
  try {
    console.log('[Step 4-17] StreamingServiceManager初期化開始');
    const manager = getStreamingServiceManager();
    if (manager) {
      await manager.waitForInitialization();
      console.log('[Step 4-18] ✅ StreamingServiceManager初期化完了');
    }
  } catch (error) {
    console.error('[Step 4-19] ❌ StreamingServiceManager初期化エラー:', error);
  }
})();

console.log('[Step 4-20] Service Worker初期化完了');

// ===== Step 5: メッセージハンドラー設定 =====
console.log('[Step 5-1] メッセージハンドラー設定開始');

// Step 5-2: メッセージハンドラーを設定
setupMessageHandler();

console.log('[Step 5-3] メッセージハンドラー設定完了');

// ===== Step 6: ログビューアー接続管理 =====
chrome.runtime.onConnect.addListener((port) => {
  console.log('[Step 6-1] ポート接続:', port.name);

  if (port.name === 'log-viewer') {
    // Step 6-2: ログビューアーからの接続
    console.log('[Step 6-3] ログビューアー接続確立');
    logManager.addConnection(port);
  }
});

// ===== Step 7: コンテンツスクリプト自動実行 =====
// ChatGPT、Claude、Geminiのページが開かれたときに自動でコンテンツスクリプトを注入
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Step 7-1: 対象URLかチェック
    const targetUrls = [
      'https://chatgpt.com',
      'https://claude.ai',
      'https://gemini.google.com',
      'https://www.genspark.ai'
    ];

    const isTargetUrl = targetUrls.some(url => tab.url.includes(url));

    if (isTargetUrl) {
      console.log(`[Step 7-2] コンテンツスクリプト自動注入: ${tab.url}`);

      // Step 7-3: コンテンツスクリプトを注入
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['src/content/content-script-consolidated.js']
      }).then(() => {
        console.log(`[Step 7-4] ✅ コンテンツスクリプト注入成功: Tab ${tabId}`);
      }).catch(error => {
        // Step 7-5: 既に注入済みの場合はエラーを無視
        if (!error.message.includes('already exists')) {
          console.error(`[Step 7-6] ❌ コンテンツスクリプト注入エラー:`, error);
        }
      });
    }
  }
});

// ===== Step 8: Keep-Alive機能 =====
// Service Workerがアイドル状態で終了されないようにする
const KEEP_ALIVE_INTERVAL = 20000; // 20秒ごと

setInterval(() => {
  console.log('[Step 8-1] Keep-Alive ping', new Date().toLocaleTimeString());

  // Step 8-2: 自身にメッセージを送ってアクティブ状態を維持
  chrome.runtime.sendMessage({
    type: 'KEEP_ALIVE_PING',
    timestamp: Date.now()
  }).catch(() => {
    // Step 8-3: エラーは無視（正常動作）
  });
}, KEEP_ALIVE_INTERVAL);

// ===== Step 9: Service Worker終了処理 =====
self.addEventListener('deactivate', (event) => {
  console.log('[Step 9-1] Service Worker停止処理開始');

  event.waitUntil((async () => {
    try {
      // Step 9-2: Google Servicesのクリーンアップ
      await googleServices.cleanup();
      console.log('[Step 9-3] ✅ クリーンアップ完了');
    } catch (error) {
      console.error('[Step 9-4] ❌ クリーンアップエラー:', error);
    }
  })());
});

console.log('[Step 10] 🚀 11.autoai Service Worker準備完了');