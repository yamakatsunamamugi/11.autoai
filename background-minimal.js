/**
 * 最小限のService Worker
 * エラーの原因を特定するためのテストファイル
 */

console.log('[ServiceWorker] Minimal version starting...');

// 最小限のメッセージハンドラー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  sendResponse({ success: true, message: 'Minimal service worker is running' });
  return true;
});

// インストール時の処理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ServiceWorker] Installed:', details.reason);
});

console.log('[ServiceWorker] Minimal version ready');