/**
 * @fileoverview AIテストメッセージハンドラー注入スクリプト
 *
 * 各AIのContent Scriptにai-test-message-handler.jsを注入する
 * manifest.jsonから呼び出される
 *
 * @version 1.0.0
 * @updated 2025-09-23
 */

(function () {
  "use strict";

  // 現在のURLをチェック
  const currentURL = window.location.href;
  const shouldInject =
    currentURL.includes("chatgpt.com") ||
    currentURL.includes("chat.openai.com") ||
    currentURL.includes("claude.ai") ||
    currentURL.includes("gemini.google.com");

  if (!shouldInject) {
    return;
  }

  console.log(
    `🧪 [AI Test Injector] Injecting message handler for ${currentURL}`,
  );

  // ai-test-message-handler.jsを動的に読み込み
  (async () => {
    try {
      const response = await fetch(
        chrome.runtime.getURL("aitest/ai-test-message-handler.js"),
      );
      const code = await response.text();

      // スクリプトを実行
      eval(code);

      console.log(
        `✅ [AI Test Injector] Message handler injected successfully`,
      );
    } catch (error) {
      console.error(
        `❌ [AI Test Injector] Failed to inject message handler:`,
        error,
      );
    }
  })();
})();
