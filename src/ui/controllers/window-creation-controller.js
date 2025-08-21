/**
 * @fileoverview ウィンドウ作成テスト コントローラー
 * 
 * ウィンドウ作成テストページを開く機能を管理します。
 */

/**
 * ウィンドウ作成テストを実行
 * @param {Function} updateStatus - ステータス更新関数
 */
export function runWindowCreationTest(updateStatus) {
  console.log("ウィンドウ作成テストボタンが押されました");
  
  try {
    // すぐにテストページを開く
    const testUrl = chrome.runtime.getURL("tests/test-window-creation.html");
    console.log("テストページURL:", testUrl);
    
    // Chrome拡張のタブとして開く
    chrome.tabs.create({
      url: testUrl,
      active: true
    }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("タブ作成エラー:", chrome.runtime.lastError);
        // フォールバック: window.openで開く
        openTestWindowFallback(testUrl, updateStatus);
      } else {
        console.log("✅ ウィンドウ作成テストツールをタブとして開きました");
        updateStatus("ウィンドウ作成テストツールを開きました", "success");
      }
    });
  } catch (error) {
    console.error("❌ ウィンドウ作成テスト実行エラー:", error);
    updateStatus("テスト実行エラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
  }
}

/**
 * フォールバック: window.openでテストページを開く
 * @private
 */
function openTestWindowFallback(testUrl, updateStatus) {
  try {
    const windowFeatures = `
      width=1400,
      height=900,
      left=${(screen.width - 1400) / 2},
      top=${(screen.height - 900) / 2},
      scrollbars=yes,
      resizable=yes,
      status=no,
      toolbar=no,
      menubar=no,
      location=no
    `.replace(/\\s+/g, "");
    
    const testWindow = window.open(
      testUrl,
      `window_creation_test_${Date.now()}`,
      windowFeatures
    );
    
    if (testWindow) {
      console.log("フォールバックでテストページを開きました");
      updateStatus("ウィンドウ作成テストツールを開きました", "success");
    } else {
      alert("テストページを開けませんでした。\\nポップアップブロッカーを確認してください。");
    }
  } catch (fallbackError) {
    console.error("フォールバックも失敗:", fallbackError);
    alert(`テストページを開けませんでした: ${fallbackError.message}`);
  }
}