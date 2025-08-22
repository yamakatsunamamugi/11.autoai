// popup.js - ポップアップからウィンドウを開く

// ポップアップがクリックされたらメインUIウィンドウを開く
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 画面情報を取得
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];
    
    const screenInfo = {
      width: primaryDisplay.workArea.width,
      height: primaryDisplay.workArea.height,
      left: primaryDisplay.workArea.left,
      top: primaryDisplay.workArea.top,
    };
    
    // 初期は全画面で表示
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("src/ui/ui.html"),
        type: "popup",
        width: screenInfo.width,
        height: screenInfo.height,
        left: screenInfo.left,
        top: screenInfo.top,
      },
      (window) => {
        if (chrome.runtime.lastError) {
          console.error("Window creation error:", chrome.runtime.lastError);
          return;
        }
        if (window && window.id) {
          // ウィンドウIDを保存（処理開始時に移動するため）
          chrome.storage.local.set({ extensionWindowId: window.id });
        }
        // ポップアップを閉じる
        if (typeof window !== 'undefined' && window.close) {
          window.close();
        } else {
          self.close();
        }
      },
    );
  } catch (error) {
    console.error("Failed to create extension window:", error);
    // フォールバック: デフォルトサイズで開く
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("src/ui/ui.html"),
        type: "popup",
        width: 1200,
        height: 800,
      },
      (window) => {
        if (chrome.runtime.lastError) {
          console.error("Fallback window creation error:", chrome.runtime.lastError);
          return;
        }
        if (window && window.id) {
          chrome.storage.local.set({ extensionWindowId: window.id });
        }
        // ポップアップを閉じる
        if (typeof window !== 'undefined' && window.close) {
          window.close();
        } else {
          self.close();
        }
      },
    );
  }
});