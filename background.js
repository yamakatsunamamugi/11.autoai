/**
 * @fileoverview background.js - Service Worker
 * Chrome拡張機能のメインエントリーポイント
 */

// ===== Step 1: 初期化とエラーハンドリング =====
console.log('[ServiceWorker] 起動開始');

self.addEventListener('error', (event) => {
  console.error('[ServiceWorker] Error:', event);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[ServiceWorker] Unhandled Rejection:', event);
});

// ===== Step 2: グローバル変数初期化 =====
let UI_SELECTORS = {};
let isProcessing = false;
const USE_V2_MODE = true;

// ===== Step 3: 基本的なメッセージハンドラー =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[MessageHandler] Received:', request.action || request.type);

  switch (request.action || request.type) {
    case 'KEEP_ALIVE_PING':
      console.log(`📡 Keep-Alive ping: ${new Date(request.timestamp).toLocaleTimeString()}`);
      sendResponse({ success: true });
      return false;

    default:
      console.warn('[MessageHandler] Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

// ===== Step 4: 拡張機能のインストール/更新時の処理 =====
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ServiceWorker] Installed/Updated:', details.reason);

  if (details.reason === 'install') {
    console.log('Initial installation - initializing settings');
    chrome.storage.local.set({
      installDate: new Date().toISOString(),
      version: chrome.runtime.getManifest().version
    });
  }

  if (details.reason === 'update') {
    console.log('Extension updated from version:', details.previousVersion);
  }
});

// ===== Step 5: Keep-Alive機能 =====
const KEEP_ALIVE_INTERVAL = 30000; // 30秒

setInterval(() => {
  console.log('[Keep-Alive] ping', new Date().toLocaleTimeString());

  chrome.runtime.sendMessage({
    type: 'KEEP_ALIVE_PING',
    timestamp: Date.now()
  }).catch((error) => {
    if (error?.message && !error.message.includes('receiving end does not exist')) {
      console.debug('[Keep-Alive] Non-critical error:', error.message);
    }
  });
}, KEEP_ALIVE_INTERVAL);

console.log('[ServiceWorker] 🚀 準備完了（インポートなしの基本版）');

// TODO: 以下のインポートを段階的に有効化する
/*
import { loadSelectors } from './src/config/ui-selectors-loader.js';
import "./src/features/task/generator.js";
import TaskGenerator from "./src/features/task/generator.js";
import ProcessorFactory from "./src/core/processor-factory.js";
import { logManager } from './src/core/log-manager.js';
import {
  processSpreadsheetData,
  taskGroupCache,
  getColumnName,
  columnToIndex
} from './src/core/task-group-processor.js';
import { setupMessageHandler } from './src/handlers/message-handler.js';
import { getGlobalContainer, getService } from './src/core/service-registry.js';
import { default as WindowService } from './src/services/window-service.js';
import { getStreamingServiceManager } from './src/core/streaming-service-manager.js';
import { AITaskExecutor } from './src/core/ai-task-executor.js';
import { AITaskHandler } from './src/handlers/ai-task-handler.js';
import SpreadsheetAutoSetup from './src/services/spreadsheet-auto-setup.js';
import StreamProcessorV2 from './src/features/task/stream-processor-v2.js';
import { parseSpreadsheetUrl } from './src/utils/spreadsheet-utils.js';
*/