// popup.js - ポップアップからウィンドウを開く

/**
 * プライマリディスプレイ情報を取得する共通関数
 * @returns {Promise<Object>} プライマリディスプレイ情報
 */
async function getPrimaryDisplayInfo() {
  try {
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];

    // log.debug("[Popup] ディスプレイ情報:", {
    //   total: displays.length,
    //   primary: {
    //     id: primaryDisplay.id,
    //     isPrimary: primaryDisplay.isPrimary,
    //     bounds: primaryDisplay.bounds,
    //     workArea: primaryDisplay.workArea,
    //   },
    // });

    return primaryDisplay;
  } catch (error) {
    console.error("[Popup] ディスプレイ情報取得エラー:", error);
    // フォールバック値
    return {
      workArea: { left: 0, top: 0, width: 1440, height: 900 },
      bounds: { left: 0, top: 0, width: 1440, height: 900 },
      isPrimary: true,
    };
  }
}

/**
 * プライマリディスプレイの中央に配置するウィンドウ位置を計算
 * @param {Object} primaryDisplay - プライマリディスプレイ情報
 * @param {number} width - ウィンドウ幅
 * @param {number} height - ウィンドウ高さ
 * @returns {Object} ウィンドウ位置情報
 */
function calculatePrimaryDisplayPosition(primaryDisplay, width, height) {
  const workArea = primaryDisplay.workArea;

  const position = {
    left: workArea.left + Math.floor((workArea.width - width) / 2),
    top: workArea.top + Math.floor((workArea.height - height) / 2),
    width: width,
    height: height,
  };

  // log.debug("[Popup] ウィンドウ位置計算:", {
  //   workArea: workArea,
  //   calculated: position,
  // });

  return position;
}

// ポップアップがクリックされたらUIウィンドウを開く
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // log.debug(
    //   "[Popup] UIウィンドウをプライマリディスプレイに開いています..."
    // );

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

    // プライマリディスプレイ情報を取得
    const primaryDisplay = await getPrimaryDisplayInfo();

    // ウィンドウサイズを計算
    const windowWidth = Math.min(1200, primaryDisplay.workArea.width);
    const windowHeight = Math.min(800, primaryDisplay.workArea.height);

    // プライマリディスプレイの中央位置を計算
    const position = calculatePrimaryDisplayPosition(
      primaryDisplay,
      windowWidth,
      windowHeight,
    );

    // プライマリディスプレイに強制配置してウィンドウ作成
    const createdWindow = await chrome.windows.create({
      url: uiUrl,
      type: "popup",
      left: position.left,
      top: position.top,
      width: position.width,
      height: position.height,
      focused: true,
    });

    if (createdWindow && createdWindow.id) {
      // log.debug(
        "[Popup] UIウィンドウをプライマリディスプレイに作成しました (ID:",
        createdWindow.id,
        ")",
      );

      // 作成されたウィンドウの実際の位置を確認
      const actualWindow = await chrome.windows.get(createdWindow.id);
      // log.debug("[Popup] 実際のウィンドウ位置:", {
      //   expected: position,
      //   actual: {
      //     left: actualWindow.left,
      //     top: actualWindow.top,
      //     width: actualWindow.width,
      //     height: actualWindow.height,
      //   },
      // });

      // ウィンドウIDを保存
      chrome.storage.local.set({ extensionWindowId: createdWindow.id });
    }

    // ポップアップを閉じる
    window.close();
  } catch (error) {
    console.error("[Popup] UIウィンドウ作成エラー:", error);

    // フォールバック: プライマリディスプレイのデフォルトサイズで開く
    try {
      // log.debug("[Popup] フォールバック処理開始...");

      // プライマリディスプレイ情報を再取得
      const fallbackDisplay = await getPrimaryDisplayInfo();
      const fallbackPosition = calculatePrimaryDisplayPosition(
        fallbackDisplay,
        800,
        600,
      );

      const fallbackWindow = await chrome.windows.create({
        url: chrome.runtime.getURL("ui.html"),
        type: "popup",
        left: fallbackPosition.left,
        top: fallbackPosition.top,
        width: 800,
        height: 600,
        focused: true,
      });

      if (fallbackWindow && fallbackWindow.id) {
        // log.debug(
          "[Popup] フォールバックでUIウィンドウをプライマリディスプレイに作成しました (ID:",
          fallbackWindow.id,
          ")",
        );
        chrome.storage.local.set({ extensionWindowId: fallbackWindow.id });
      }
    } catch (fallbackError) {
      console.error("[Popup] フォールバック失敗:", fallbackError);

      // 最後の手段: 位置指定なしでウィンドウ作成
      try {
        const lastResortWindow = await chrome.windows.create({
          url: chrome.runtime.getURL("ui.html"),
          type: "popup",
          width: 800,
          height: 600,
          focused: true,
        });

        if (lastResortWindow && lastResortWindow.id) {
          // log.debug(
            "[Popup] 最終フォールバックでUIウィンドウを作成しました (ID:",
            lastResortWindow.id,
            ")",
          );
          chrome.storage.local.set({ extensionWindowId: lastResortWindow.id });
        }
      } catch (finalError) {
        console.error("[Popup] 最終フォールバック失敗:", finalError);
      }
    }

    window.close();
  }
});
