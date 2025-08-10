/**
 * DeepResearchモジュールローダー
 * CSPエラーを回避するため、外部ファイルとしてモジュールをロード
 */

console.log("📦 [11.autoai] DeepResearchモジュールインポート開始...");

// スクリプトタグからURLを取得
const scriptElement =
  document.currentScript ||
  document.querySelector('script[src*="deepresearch-loader.js"]');

if (!scriptElement) {
  console.error(
    "❌ [11.autoai] DeepResearchモジュール: スクリプト要素が見つかりません",
  );
  window.deepResearchConfigLoaded = false;
} else {
  (async () => {
    const deepResearchConfigUrl = scriptElement.dataset.deepresearchConfigUrl;
    const activatorUrl = scriptElement.dataset.activatorUrl;
    try {
      // モジュールを動的インポート
      const { deepResearchConfig } = await import(deepResearchConfigUrl);
      const { createDeepResearchActivator } = await import(activatorUrl);

      console.log("📦 [11.autoai] インポート成功、グローバル公開中...");

      // グローバルに公開
      window.deepResearchConfig = deepResearchConfig;
      window.createDeepResearchActivator = createDeepResearchActivator;

      // 初期化完了を通知
      window.deepResearchConfigLoaded = true;

      console.log("✅ [11.autoai] DeepResearch設定を読み込みました");
      console.log(
        "🔍 [11.autoai] window.deepResearchConfig:",
        !!window.deepResearchConfig,
      );
      console.log(
        "🔍 [11.autoai] window.createDeepResearchActivator:",
        !!window.createDeepResearchActivator,
      );

      // AI別の制御スクリプトを読み込む
      const AI_TYPE = (() => {
        const hostname = window.location.hostname;
        if (
          hostname.includes("chatgpt.com") ||
          hostname.includes("chat.openai.com")
        )
          return "ChatGPT";
        if (hostname.includes("claude.ai")) return "Claude";
        if (hostname.includes("gemini.google.com")) return "Gemini";
        return null;
      })();

      if (AI_TYPE && typeof window.loadAIControlScripts === "function") {
        console.log(
          `[11.autoai][${AI_TYPE}] 制御スクリプトの読み込みを開始...`,
        );
        await window.loadAIControlScripts();
      }

      // Content Script初期化を続行
      if (typeof window.initializeContentScript === "function") {
        console.log("✅ [11.autoai] Content Script初期化開始");
        await window.initializeContentScript();
      } else {
        console.log(
          "⚠️ [11.autoai] initializeContentScript関数が見つかりません（スキップ）",
        );
      }
    } catch (importError) {
      console.error(
        "❌ [11.autoai] DeepResearchモジュールインポートエラー:",
        importError,
      );
      window.deepResearchConfigLoaded = false;
    }
  })();
}
