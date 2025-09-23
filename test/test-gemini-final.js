/**
 * Gemini Automation 更新版テストコード
 * セレクタを冒頭に定義し、UI通信機能を追加
 */

console.log("🧪 Gemini Automation 最終テスト");
console.log("="repeat(50));

// スクリプトの読み込み確認
if (typeof window.GeminiAutomation === "undefined") {
  console.error("❌ GeminiAutomation が読み込まれていません");
  console.log("Chrome拡張機能をリロードしてページを再読み込みしてください");
} else {
  console.log("✅ GeminiAutomation が読み込まれています");
  
  // 機能とモデルの探索テスト
  (async () => {
    console.log("\n📋 機能とモデルを探索中...");
    try {
      const features = await window.GeminiAutomation.discoverModelsAndFeatures();
      console.log("検出結果:", features);
      
      if (features.models && features.models.length > 0) {
        console.log("✅ モデル数:", features.models.length);
        console.log("  ", features.models);
      }
      
      if (features.features && features.features.length > 0) {
        console.log("✅ 機能数:", features.features.length);
        console.log("  ", features.features);
      }
      
      console.log("\n💡 UI更新メッセージが送信されました（Chrome拡張環境の場合）");
    } catch (error) {
      console.error("❌ 探索エラー:", error);
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("テスト完了");
    console.log("\n手動テスト用関数:");
    console.log("  window.GeminiAutomation.executeTask({prompt: 'テストメッセージ'})");
  })();
}
