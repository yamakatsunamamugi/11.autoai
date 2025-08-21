/**
 * @fileoverview スプレッドシート読み込みテスト コントローラー
 * 
 * スプレッドシート読み込みテストページを開く機能を管理します。
 */

/**
 * スプレッドシート読み込みテストを実行
 * @param {Function} updateStatus - ステータス更新関数
 */
export function runSpreadsheetTest(updateStatus) {
  console.log("スプレッドシート読み込みテストボタンが押されました");
  
  try {
    // 新しいスプレッドシート読み込みテストツールを開く
    const testUrl = chrome.runtime.getURL("tests/test-spreadsheet.html");
    
    // ウィンドウ設定
    const windowFeatures = `
      width=1200,
      height=800,
      left=${(screen.width - 1200) / 2},
      top=${(screen.height - 800) / 2},
      scrollbars=yes,
      resizable=yes,
      status=no,
      toolbar=no,
      menubar=no,
      location=no
    `.replace(/\\s+/g, "");

    // 新しいウィンドウでテストツールを開く
    const testWindow = window.open(
      testUrl,
      `spreadsheet_test_${Date.now()}`,
      windowFeatures
    );

    if (testWindow) {
      console.log("✅ スプレッドシート読み込みテストツールを開きました");
      updateStatus("スプレッドシート読み込みテストツールを開きました", "success");
    } else {
      console.error("❌ スプレッドシート読み込みテストツールを開けませんでした");
      updateStatus("テストツールを開けませんでした", "error");
      alert("テストページを開けませんでした。\\nポップアップブロッカーを確認してください。");
    }
  } catch (error) {
    console.error("スプレッドシート読み込みテストエラー:", error);
    updateStatus("スプレッドシート読み込みテストエラー", "error");
    alert(`テストページを開けませんでした: ${error.message}`);
  }
}