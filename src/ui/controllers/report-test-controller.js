/**
 * @fileoverview レポート化テスト コントローラー
 * 
 * レポート生成テストページを開く機能を管理します。
 */

/**
 * レポート化テストを実行
 * @param {Function} updateStatus - ステータス更新関数
 */
export function runReportTest(updateStatus) {
  console.log("レポート生成テストボタンが押されました");
  
  try {
    // レポート化テストページを新しいウィンドウで開く
    const testUrl = chrome.runtime.getURL("tests/test-report-generation.html");
    
    // ウィンドウ設定
    const windowFeatures = `
      width=1400,
      height=800,
      left=${(screen.width - 1400) / 2},
      top=${(screen.height - 800) / 2},
      scrollbars=yes,
      resizable=yes,
      status=no,
      toolbar=no,
      menubar=no,
      location=no
    `.replace(/\\s+/g, "");

    // 新しいウィンドウでテストページを開く
    const testWindow = window.open(
      testUrl,
      `report_generation_test_${Date.now()}`,
      windowFeatures
    );
    
    if (testWindow) {
      console.log("✅ レポート化テストページが開かれました");
      updateStatus("レポート化テストページを開きました", "success");
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      console.error("❌ テストページを開けませんでした");
      updateStatus("テストページを開けませんでした", "error");
      alert("ポップアップブロッカーを無効にしてください");
    }
  } catch (error) {
    console.error("❌ レポート化テスト実行エラー:", error);
    updateStatus("テスト実行エラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
  }
}