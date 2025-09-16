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
console.log('[ServiceWorker] 起動開始');

// Step 1-2: エラーハンドリングを追加
self.addEventListener('error', (event) => {
  console.error('[Step 1-3] Service Worker Error:', event);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[Step 1-4] Service Worker Unhandled Rejection:', event);
});

// ===== Step 2: モジュールインポート =====
console.log('[ServiceWorker] モジュールインポート開始');

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

// Step 2-6: ServiceRegistryをimport
import { getService } from './src/core/service-registry.js';

// Step 2-7: SpreadsheetLoggerクラスをimport
import SpreadsheetLogger from './src/features/logging/spreadsheet-logger.js';

// Step 2-5: その他のサービス
import './src/services/auth-service.js';
import { default as WindowService } from './src/services/window-service.js';
import './src/features/spreadsheet/sheets-client.js';
import './src/features/logging/spreadsheet-logger.js';
import { getStreamingServiceManager } from './src/core/streaming-service-manager.js';
import { AITaskExecutor } from './src/core/ai-task-executor.js';
import { AITaskHandler } from './src/handlers/ai-task-handler.js';
// automationファイルはコンテンツスクリプト用なので削除
// import { ReportExecutor } from './automations/2-5-report-automation.js';
// import { GensparkAutomation } from './automations/2-4-genspark-automation.js';
import SpreadsheetAutoSetup from './src/services/spreadsheet-auto-setup.js';
import StreamProcessorV2 from './src/features/task/stream-processor-v2.js';

console.log('[ServiceWorker] モジュールインポート完了');

// ===== Step 3: グローバル変数初期化 =====
// グローバル変数初期化（詳細ログは削除）

// Step 3-2: UI_SELECTORSをグローバルに保持
let UI_SELECTORS = {};

// Step 3-3: その他のグローバル変数
let isProcessing = false;
const USE_V2_MODE = true; // V2版StreamProcessorを使用

// Step 3-4: グローバル参照の設定
globalThis.logManager = logManager;
globalThis.googleServices = googleServices;
globalThis.authService = authService;
// globalThis.sheetsClient = sheetsClient;  // SheetsReaderで上書きしないようにコメントアウト（sheets-client.jsの正しいインスタンスを使用）
globalThis.docsClient = docsClient;
globalThis.spreadsheetLogger = spreadsheetLogger;
globalThis.processSpreadsheetData = processSpreadsheetData;
globalThis.taskGroupCache = taskGroupCache;
globalThis.getColumnName = getColumnName;
globalThis.columnToIndex = columnToIndex;
// automationファイルはコンテンツスクリプト用なので削除
// globalThis.ReportExecutor = ReportExecutor;
// globalThis.GensparkAutomation = GensparkAutomation;
globalThis.SpreadsheetAutoSetup = SpreadsheetAutoSetup;
globalThis.StreamProcessorV2 = StreamProcessorV2;

// StreamProcessorV2のインスタンスを早期作成してSPREADSHEET_CONFIGを初期化
console.log('[Background] StreamProcessorV2インスタンスを早期初期化');
globalThis.streamProcessorV2Instance = new StreamProcessorV2();

// 依存性を事前に設定（ServiceRegistryを使用）
(async () => {
  try {
    // Google Servicesが初期化されるまで待機
    await new Promise(resolve => {
      if (globalThis.sheetsClient) {
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (globalThis.sheetsClient) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      }
    });

    // ServiceRegistryから依存性を取得（static importを使用）
    const sheetsClientFromRegistry = await getService('sheetsClient');
    const SpreadsheetLoggerClass = SpreadsheetLogger;

    // 依存性を設定
    const processor = StreamProcessorV2.getInstance();
    await processor.setDependencies({
      sheetsClient: sheetsClientFromRegistry,
      SpreadsheetLogger: SpreadsheetLoggerClass
    });
    console.log('[Background] StreamProcessorV2依存性設定完了');
  } catch (e) {
    console.error('[Background] 依存性設定失敗:', e.message);
  }
})();

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

// グローバル変数初期化完了

// ===== Step 4: Service Worker起動時の初期化 =====
console.log('[ServiceWorker] 初期化開始');

// Step 4-2: 起動時にセレクタを読み込み
(async () => {
  try {
    // UI Selectors読み込み開始
    UI_SELECTORS = await loadSelectors();
    globalThis.UI_SELECTORS = UI_SELECTORS;
    console.log('[ServiceWorker] ✅ UI Selectors loaded');
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
// 現在、初期化に問題があるため一時的に無効化
// TODO: ConfigManager, EventBus, ErrorHandlerの実装後に有効化
/*
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
*/
console.log('[Step 4-17] StreamingServiceManager初期化をスキップ（一時的）');


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
// 注意: コンテンツスクリプトはmanifest.jsonで自動注入される
// 手動注入は重複エラーの原因となるため削除
console.log('[Step 7] コンテンツスクリプトはmanifest.jsonで自動注入されます');

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

console.log('[ServiceWorker] 🚀 11.autoai 準備完了');