// background.js - Service Worker for Chrome Extension (Manifest V3)
// log.debug("🚀 Background Service Worker started");

// Extension初回インストール時の処理
chrome.runtime.onInstalled.addListener(() => {
  // log.debug("✅ Extension installed/updated");
});

// タブ更新時のContent Script注入確認と手動注入
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    if (tab.url?.includes("claude.ai")) {
      // log.debug("🔍 Claude AI page detected:", tab.url);

      // Content Script注入状態を確認（遅延実行）
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { type: "ping" }, (response) => {
          if (chrome.runtime.lastError) {
            // log.debug(
              "⚠️ Content Script not responding, injecting manually...",
              chrome.runtime.lastError.message,
            );

            // 手動でContent Script注入
            chrome.scripting.executeScript(
              {
                target: { tabId: tabId },
                files: ["4-2-claude-automation.js"],
              },
              () => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "❌ Failed to inject script:",
                    chrome.runtime.lastError,
                  );
                } else {
                  // log.debug("✅ Content Script manually injected");
                }
              },
            );
          } else {
            // log.debug("✅ Content Script is responding:", response);
          }
        });
      }, 2000); // 2秒待機してからチェック
    }
  }
});

// Extension間メッセージの中継
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // log.debug("📨 Message received in background:", {
    type: request.type,
    from: sender.tab ? `Tab ${sender.tab.id}` : "Extension",
  });

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
