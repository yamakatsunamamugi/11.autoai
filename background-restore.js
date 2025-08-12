// background.js - Service Worker (段階的復元版)
console.log("AutoAI Service Worker が起動しました");

// Step 1: グローバル変数
let isProcessing = false;

// Step 2: 基本的なサービスのみインポート（ESモジュールなし）
// 以下のインポートは段階的に追加してテスト

// Step 3: メッセージハンドラー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("メッセージ受信:", request);
  
  switch (request.action) {
    case "checkServiceWorkerStatus":
      console.log("[MessageHandler] Service Worker ステータスチェック");
      sendResponse({ 
        status: "ready", 
        message: "Service Worker is active" 
      });
      return false;
      
    case "getAuthStatus":
      // 認証ステータスの簡易版
      sendResponse({ isAuthenticated: false, message: "Auth service not loaded yet" });
      return true; // 非同期レスポンス
      
    case "loadSpreadsheet":
      // スプレッドシート読み込みの簡易版
      sendResponse({ success: false, error: "Spreadsheet service not loaded yet" });
      return true;
      
    default:
      console.warn("[MessageHandler] 未知のアクション:", request.action);
      sendResponse({ success: false, error: "Unknown action" });
      return false;
  }
});

// 拡張機能のインストール時
chrome.runtime.onInstalled.addListener(() => {
  console.log("拡張機能がインストール/更新されました");
});

// 起動時
chrome.runtime.onStartup.addListener(() => {
  console.log("Chromeが起動しました");
});

console.log("Service Worker 初期化完了");