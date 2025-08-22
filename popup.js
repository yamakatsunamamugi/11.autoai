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
    
    // 右下の位置を計算（画面を4分割）
    const halfWidth = Math.floor(screenInfo.width / 2);
    const halfHeight = Math.floor(screenInfo.height / 2);
    
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("src/ui/ui.html"),
        type: "popup",
        width: halfWidth,
        height: halfHeight,
        left: screenInfo.left + halfWidth,  // 右側
        top: screenInfo.top + halfHeight,    // 下側
      },
      () => {
        // ウィンドウが開いたらポップアップを閉じる
        window.close();
      },
    );
  } catch (error) {
    console.error("Failed to position extension window:", error);
    // フォールバック: 位置指定なしで開く
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("src/ui/ui.html"),
        type: "popup",
        width: 850,
        height: 700,
      },
      () => {
        window.close();
      },
    );
  }
});