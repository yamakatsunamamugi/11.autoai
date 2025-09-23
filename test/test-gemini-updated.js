/**
 * 更新された4-3-gemini-automation.jsのテスト
 *
 * 使用方法:
 * 1. Chrome拡張機能をリロード (chrome://extensions/)
 * 2. Gemini (https://gemini.google.com) を再読み込み
 * 3. DevToolsのコンソールで実行
 */

// 簡易テストコード
(async () => {
  console.log("🧪 更新された Gemini Automation テスト");
  console.log("=".repeat(50));

  // 1. スクリプトの読み込み確認
  if (typeof window.GeminiAutomation === "undefined") {
    console.error("❌ GeminiAutomation が読み込まれていません");
    console.log("Chrome拡張機能をリロードしてページを再読み込みしてください");
    return;
  }

  console.log("✅ GeminiAutomation が読み込まれています");

  // 2. 機能とモデルの探索
  console.log("\n📋 機能とモデルを探索中...");
  try {
    const features = await window.GeminiAutomation.discoverModelsAndFeatures();
    console.log("検出された機能:", features);

    if (features.models && features.models.length > 0) {
      console.log("✅ モデル:", features.models);
    } else {
      console.log("⚠️ モデルが検出されませんでした");
    }

    if (features.features && features.features.length > 0) {
      console.log("✅ 機能:", features.features);
    } else {
      console.log("⚠️ 機能が検出されませんでした");
    }
  } catch (error) {
    console.error("❌ 探索エラー:", error);
  }

  // 3. 基本的な動作テスト
  const runBasicTest = confirm("基本的な動作テストを実行しますか？");

  if (runBasicTest) {
    console.log("\n🔄 基本テスト実行中...");

    try {
      const result = await window.GeminiAutomation.executeTask({
        prompt: "Hello, this is a test message. Please respond briefly.",
        model: null,
        function: null,
      });

      if (result.success) {
        console.log("✅ テスト成功!");
        console.log(
          "応答（最初の100文字）:",
          result.content.substring(0, 100) + "...",
        );
      } else {
        console.log("❌ テスト失敗:", result.error);
      }
    } catch (error) {
      console.error("❌ 実行エラー:", error);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🧪 テスト完了");

  // 手動テスト用の関数を公開
  window.testGeminiTask = async (prompt = "テストメッセージです") => {
    console.log(`\n📝 タスク実行: "${prompt}"`);
    try {
      const result = await window.GeminiAutomation.executeTask({
        prompt: prompt,
        model: null,
        function: null,
      });
      console.log(result.success ? "✅ 成功" : "❌ 失敗");
      return result;
    } catch (error) {
      console.error("❌ エラー:", error);
      throw error;
    }
  };

  console.log("\n💡 手動テスト用:");
  console.log("  testGeminiTask('あなたの質問') - 任意のプロンプトでテスト");
})();
