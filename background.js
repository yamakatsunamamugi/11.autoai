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

// ConsoleLoggerインスタンスを作成（後でimportされるため、ここでは宣言のみ）
let logger;

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
import { ConsoleLogger } from './src/utils/console-logger.js';

// ConsoleLoggerインスタンスを初期化
logger = new ConsoleLogger('background');

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
import { googleServices } from './src/services/google-services.js';

// Step 2-6: [削除済み] ServiceRegistry

// Step 2-7: SpreadsheetLogger削除済み - SheetsClientに統合

// Step 2-5: その他のサービス
import { getAuthService } from './src/services/auth-service.js';
import { default as WindowService } from './src/services/window-service.js';
import SheetsClient from './src/features/spreadsheet/sheets-client.js';
import DocsClient from './src/features/spreadsheet/docs-client.js';
import { getStreamingServiceManager } from './src/core/streaming-service-manager.js';
import { AITaskExecutor } from './src/core/ai-task-executor.js';
import { AITaskHandler } from './src/handlers/ai-task-handler.js';
import SpreadsheetAutoSetup from './src/services/spreadsheet-auto-setup.js';
import StreamProcessorV2 from './src/features/task/stream-processor-v2.js';

logger.log('[Step 2-8: モジュールインポート完了] モジュールインポート完了');

// ===== Step 3: グローバル変数初期化 =====
// グローバル変数初期化（詳細ログは削除）

// Step 3-2: UI_SELECTORSをグローバルに保持
let UI_SELECTORS = {};

// Step 3-3: その他のグローバル変数
let isProcessing = false;
const USE_V2_MODE = true; // V2版StreamProcessorを使用

// Step 3-4: 後方互換性のため必要最小限のグローバル参照のみ設定
// Service Registry経由でアクセスするよう段階的に移行中
globalThis.logManager = logManager;
globalThis.StreamProcessorV2 = StreamProcessorV2;

// StreamProcessorV2の依存性設定（Service Registry経由、エラーハンドリング強化）
(async () => {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      console.log(`[Background] StreamProcessorV2依存性設定開始 (試行${retryCount + 1}/${maxRetries})`);

      // 直接依存性を作成
      const SheetsClientClass = (await import('./src/features/spreadsheet/sheets-client.js')).default;
      const sheetsClientFromRegistry = new SheetsClientClass();
      // SpreadsheetLogger削除済み - SheetsClientに統合

      console.log('[Background] 依存性取得成功:', {
        sheetsClient: !!sheetsClientFromRegistry
      });

      // StreamProcessorV2のシングルトンに依存性を設定
      const processor = StreamProcessorV2.getInstance();
      await processor.setDependencies({
        sheetsClient: sheetsClientFromRegistry
      });

      console.log('[Background] StreamProcessorV2依存性設定完了');
      break; // 成功したらループを抜ける

    } catch (e) {
      retryCount++;
      console.error(`[Background] 依存性設定失敗 (試行${retryCount}/${maxRetries}):`, e.message);

      if (retryCount < maxRetries) {
        console.log(`[Background] ${1000 * retryCount}ms後にリトライします`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      } else {
        console.error('[Background] 最大リトライ回数に達しました。依存性設定をスキップします。');
      }
    }
  }
})();

// AITaskExecutorとAITaskHandlerはService Registry経由でアクセス

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
    logger.log('[Step 4-13: Google Services初期化開始] Google Services初期化開始');
    await googleServices.initialize();
    logger.success('[Step 4-14: Google Services初期化完了] Google Services初期化完了');
  } catch (error) {
    logger.error('[Step 4-15: Google Services初期化エラー] Google Services初期化エラー', error);
  }
})();

logger.success('[Step 4-20: Service Worker初期化完了] Service Worker初期化完了');

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