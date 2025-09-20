// popup.js - ポップアップからウィンドウを開く

// ポップアップがクリックされたらUIウィンドウを開く
document.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("[Popup] UIウィンドウを開いています...");

    // UIファイルを優先順位で試す（トップページを優先）
    const uiPaths = ["ui.html", "unused/src/ui/ui.html", "unused/ui.html"];

    let uiUrl = null;
    for (const path of uiPaths) {
      try {
        const testUrl = chrome.runtime.getURL(path);
        // URLが有効かテスト（簡易チェック）
        uiUrl = testUrl;
        break;
      } catch (error) {
        continue;
      }
    }

    if (!uiUrl) {
      throw new Error("利用可能なUIファイルが見つかりません");
    }

    // 画面情報を取得
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];

    // シンプルなウィンドウ作成
    const createdWindow = await chrome.windows.create({
      url: uiUrl,
      type: "popup",
      width: Math.min(1200, primaryDisplay.workArea.width),
      height: Math.min(800, primaryDisplay.workArea.height),
      focused: true,
    });

    if (createdWindow && createdWindow.id) {
      console.log(
        "[Popup] UIウィンドウを作成しました (ID:",
        createdWindow.id,
        ")",
      );
      // ウィンドウIDを保存
      chrome.storage.local.set({ extensionWindowId: createdWindow.id });
    }

    // ポップアップを閉じる
    window.close();
  } catch (error) {
    console.error("[Popup] UIウィンドウ作成エラー:", error);

    // フォールバック: デフォルトサイズで開く
    try {
      const fallbackWindow = await chrome.windows.create({
        url: chrome.runtime.getURL("ui.html"),
        type: "popup",
        width: 800,
        height: 600,
        focused: true,
      });

      if (fallbackWindow && fallbackWindow.id) {
        chrome.storage.local.set({ extensionWindowId: fallbackWindow.id });
      }
    } catch (fallbackError) {
      console.error("[Popup] フォールバック失敗:", fallbackError);
    }

    window.close();
  }
});
