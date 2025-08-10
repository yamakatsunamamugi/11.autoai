/**
 * コンテンツスクリプト
 * Gensparkのページで実行される
 */

import { GensparkAutomation } from '../core/genspark.js';
import { DataAdapterFactory } from '../adapters/spreadsheet.js';
import { sendMessage, ExecutionHistory } from '../core/utils.js';

let automation = null;

/**
 * 初期化
 */
async function initialize() {
  console.log('[Genspark Extension] コンテンツスクリプト初期化');
  
  // バックグラウンドからのメッセージを待機
  chrome.runtime.onMessage.addListener(handleMessage);
}

/**
 * メッセージハンドラ
 */
async function handleMessage(request, sender, sendResponse) {
  console.log('[Genspark Extension] メッセージ受信:', request.action);
  
  switch (request.action) {
    case 'start':
      handleStart(request, sendResponse);
      return true; // 非同期レスポンスを示す
      
    case 'stop':
      handleStop(sendResponse);
      break;
      
    case 'getStatus':
      handleGetStatus(sendResponse);
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
}

/**
 * 自動化開始
 */
async function handleStart(request, sendResponse) {
  try {
    // アダプターを作成
    const adapterType = request.adapterType || 'manual';
    const adapterConfig = request.adapterConfig || {};
    const adapter = await DataAdapterFactory.create(adapterType, adapterConfig);
    
    // 自動化インスタンスを作成
    automation = new GensparkAutomation(adapter);
    
    // 実行
    const result = await automation.execute();
    
    // 履歴に追加
    await ExecutionHistory.add(result);
    
    // 結果を返す
    sendResponse({
      success: true,
      result: result
    });
    
  } catch (error) {
    console.error('[Genspark Extension] エラー:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 自動化停止
 */
function handleStop(sendResponse) {
  if (automation) {
    // 停止処理（将来実装）
    automation = null;
    sendResponse({ success: true });
  } else {
    sendResponse({ success: false, error: 'No automation running' });
  }
}

/**
 * ステータス取得
 */
function handleGetStatus(sendResponse) {
  sendResponse({
    success: true,
    running: automation !== null,
    url: window.location.href
  });
}

// 初期化実行
initialize();