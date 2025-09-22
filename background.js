// background.js - Service Worker for Chrome Extension (Manifest V3)
// log.debug("🚀 Background Service Worker started");

// Extension初回インストール時の処理
chrome.runtime.onInstalled.addListener(() => {
  // log.debug("✅ Extension installed/updated");
});

// タブ更新時の処理を削除 - step4-tasklist.jsで統一管理
// Content Script注入はタスク実行時にのみ行う

// Extension間メッセージの中継
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // log.debug("📨 Message received in background:", {
  //   type: request.type,
  //   from: sender.tab ? `Tab ${sender.tab.id}` : "Extension",
  // });

  // Content Script初期化確認
  if (request.type === "content_script_ready") {
    // log.debug("✅ Content Script initialized on tab:", sender.tab?.id);
    sendResponse({ success: true, message: "Background acknowledged" });
  }

  return true; // 非同期レスポンスを許可
});

// エラーハンドリング
self.addEventListener("unhandledrejection", (event) => {
  console.error("❌ Unhandled promise rejection:", event.reason);
});

// log.debug("✅ Background Service Worker ready");
