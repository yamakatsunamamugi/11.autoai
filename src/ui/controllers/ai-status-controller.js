/**
 * @fileoverview AIステータス表示 コントローラー
 * 
 * AIステータス表示ページを開く機能を管理します。
 */

/**
 * AIステータス表示を実行
 * @param {Function} updateStatus - ステータス更新関数
 */
export function showAIStatus(updateStatus) {
  console.log("AIステータス表示を開きます...");
  updateStatus("AIステータス表示を開いています...", "running");
  
  chrome.tabs.create({
    url: chrome.runtime.getURL("src/ui/ai-status-display.html"),
  }, (tab) => {
    if (tab) {
      console.log("✅ AIステータス表示ページが開かれました");
      updateStatus("AIステータス表示を開きました", "success");
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      console.error("❌ AIステータス表示を開けませんでした");
      updateStatus("AIステータス表示を開けませんでした", "error");
    }
  });
}