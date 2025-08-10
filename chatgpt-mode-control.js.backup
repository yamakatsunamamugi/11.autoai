// ChatGPT モード制御機能
// ChatGPTの各種特殊モード（Canvas、o1、検索など）を制御

(() => {
  "use strict";

  console.log("[11.autoai][ChatGPT] モード制御機能を読み込み中...");

  // ===== ユーティリティ関数 =====

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkElement = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`要素が見つかりません: ${selector}`));
        } else {
          setTimeout(checkElement, 100);
        }
      };
      checkElement();
    });
  }

  // ===== ChatGPT Canvas機能制御 =====

  async function enableChatGPTCanvas() {
    console.log("[11.autoai][ChatGPT] 🎨 Canvasモードを有効化中...");

    try {
      // 1. モデル選択ボタンを探す
      const modelButton = document.querySelector(
        'button[aria-haspopup="true"], button[data-testid*="model"], button[aria-expanded]',
      );
      if (!modelButton) {
        console.warn(
          "[11.autoai][ChatGPT] ❌ モデル選択ボタンが見つかりません",
        );
        return false;
      }

      // 2. ドロップダウンを開く
      console.log("[11.autoai][ChatGPT] モデル選択メニューを開きます");
      modelButton.click();
      await sleep(500);

      // 3. Canvasオプションを探す
      const canvasOption = Array.from(
        document.querySelectorAll('[role="menuitem"], [role="option"]'),
      ).find(
        (item) =>
          item.textContent?.includes("Canvas") ||
          item.textContent?.includes("canvas"),
      );

      if (canvasOption) {
        console.log("[11.autoai][ChatGPT] 🎨 Canvasオプションを選択");
        canvasOption.click();
        await sleep(500);
        console.log("[11.autoai][ChatGPT] ✅ Canvasモードが有効になりました");
        return true;
      } else {
        console.warn(
          "[11.autoai][ChatGPT] ❌ Canvasオプションが見つかりません",
        );
        // メニューを閉じる
        document.body.click();
        return false;
      }
    } catch (error) {
      console.error("[11.autoai][ChatGPT] ❌ Canvas有効化エラー:", error);
      return false;
    }
  }

  async function disableChatGPTCanvas() {
    console.log("[11.autoai][ChatGPT] 🎨 Canvasモードを無効化中...");

    try {
      // GPT-4o など標準モデルに戻す
      const modelButton = document.querySelector(
        'button[aria-haspopup="true"], button[data-testid*="model"]',
      );
      if (!modelButton) return false;

      modelButton.click();
      await sleep(500);

      const standardOption = Array.from(
        document.querySelectorAll('[role="menuitem"], [role="option"]'),
      ).find(
        (item) =>
          item.textContent?.includes("GPT-4o") &&
          !item.textContent?.includes("Canvas"),
      );

      if (standardOption) {
        standardOption.click();
        await sleep(500);
        console.log("[11.autoai][ChatGPT] ✅ 標準モードに戻しました");
        return true;
      }
      return false;
    } catch (error) {
      console.error("[11.autoai][ChatGPT] Canvas無効化エラー:", error);
      return false;
    }
  }

  // ===== ChatGPT o1モデル制御 =====

  async function enableChatGPTo1() {
    console.log("[11.autoai][ChatGPT] 🧠 o1モデルを有効化中...");

    try {
      const modelButton = document.querySelector(
        'button[aria-haspopup="true"], button[data-testid*="model"]',
      );
      if (!modelButton) return false;

      modelButton.click();
      await sleep(500);

      const o1Option = Array.from(
        document.querySelectorAll('[role="menuitem"], [role="option"]'),
      ).find((item) => item.textContent?.includes("o1"));

      if (o1Option) {
        console.log("[11.autoai][ChatGPT] 🧠 o1モデルを選択");
        o1Option.click();
        await sleep(500);
        console.log("[11.autoai][ChatGPT] ✅ o1モデルが有効になりました");
        return true;
      } else {
        console.warn("[11.autoai][ChatGPT] ❌ o1モデルが見つかりません");
        document.body.click();
        return false;
      }
    } catch (error) {
      console.error("[11.autoai][ChatGPT] o1有効化エラー:", error);
      return false;
    }
  }

  async function disableChatGPTo1() {
    console.log("[11.autoai][ChatGPT] 🧠 o1モードを無効化中...");
    return await disableChatGPTCanvas(); // 標準モードに戻す処理は同じ
  }

  // ===== ChatGPT 検索機能制御 =====

  async function enableChatGPTSearch() {
    console.log("[11.autoai][ChatGPT] 🔍 検索機能を有効化中...");

    try {
      // 検索機能のトグル/ボタンを探す
      const searchToggle = document.querySelector(
        'button[aria-label*="search"], button[aria-label*="web"], [data-testid*="search"]',
      );
      if (searchToggle) {
        console.log("[11.autoai][ChatGPT] 🔍 検索機能を有効化");
        searchToggle.click();
        await sleep(500);
        console.log("[11.autoai][ChatGPT] ✅ 検索機能が有効になりました");
        return true;
      }

      console.warn("[11.autoai][ChatGPT] ❌ 検索機能ボタンが見つかりません");
      return false;
    } catch (error) {
      console.error("[11.autoai][ChatGPT] 検索有効化エラー:", error);
      return false;
    }
  }

  async function disableChatGPTSearch() {
    console.log("[11.autoai][ChatGPT] 🔍 検索機能を無効化中...");

    try {
      const searchToggle = document.querySelector(
        'button[aria-label*="search"][aria-pressed="true"], [data-testid*="search"][aria-pressed="true"]',
      );
      if (searchToggle) {
        searchToggle.click();
        await sleep(500);
        console.log("[11.autoai][ChatGPT] ✅ 検索機能を無効化しました");
        return true;
      }
      return false;
    } catch (error) {
      console.error("[11.autoai][ChatGPT] 検索無効化エラー:", error);
      return false;
    }
  }

  // ===== ChatGPT DeepResearch制御（既存機能との統合） =====

  async function enableChatGPTDeepResearch() {
    console.log("[11.autoai][ChatGPT] 🔬 DeepResearch機能を有効化中...");

    // 既存のDeepResearch実装を利用
    if (window.enableDeepResearch) {
      return await window.enableDeepResearch();
    }

    console.warn("[11.autoai][ChatGPT] ❌ DeepResearch機能が利用できません");
    return false;
  }

  async function disableChatGPTDeepResearch() {
    console.log("[11.autoai][ChatGPT] 🔬 DeepResearch機能を無効化中...");

    if (window.disableDeepResearch) {
      return await window.disableDeepResearch();
    }

    return false;
  }

  // ===== 統合制御関数 =====

  /**
   * 全ての特殊機能を無効化
   */
  async function disableAllChatGPTModes() {
    console.log("[11.autoai][ChatGPT] 🔄 全モードを無効化中...");

    const results = await Promise.allSettled([
      disableChatGPTCanvas(),
      disableChatGPTo1(),
      disableChatGPTSearch(),
      disableChatGPTDeepResearch(),
    ]);

    console.log("[11.autoai][ChatGPT] ✅ 全モード無効化完了");
    return results.every(
      (result) => result.status === "fulfilled" && result.value,
    );
  }

  /**
   * 指定されたモードを有効化
   */
  async function enableChatGPTMode(mode) {
    console.log(`[11.autoai][ChatGPT] 🔄 ${mode}モードを有効化中...`);

    // まず全モードを無効化
    await disableAllChatGPTModes();
    await sleep(500);

    switch (mode) {
      case "Canvas":
        return await enableChatGPTCanvas();
      case "o1":
      case "O1":
        return await enableChatGPTo1();
      case "Search":
        return await enableChatGPTSearch();
      case "DeepResearch":
        return await enableChatGPTDeepResearch();
      default:
        console.log(`[11.autoai][ChatGPT] ✅ 標準モードに設定`);
        return true;
    }
  }

  // ===== グローバル関数として公開 =====

  window.enableChatGPTCanvas = enableChatGPTCanvas;
  window.disableChatGPTCanvas = disableChatGPTCanvas;
  window.enableChatGPTo1 = enableChatGPTo1;
  window.disableChatGPTo1 = disableChatGPTo1;
  window.enableChatGPTSearch = enableChatGPTSearch;
  window.disableChatGPTSearch = disableChatGPTSearch;
  window.enableChatGPTDeepResearch = enableChatGPTDeepResearch;
  window.disableChatGPTDeepResearch = disableChatGPTDeepResearch;
  window.disableAllChatGPTModes = disableAllChatGPTModes;
  window.enableChatGPTMode = enableChatGPTMode;

  console.log("[11.autoai][ChatGPT] ✅ モード制御機能が利用可能になりました");
  console.log("[11.autoai][ChatGPT] 利用可能な関数:");
  console.log("  - enableChatGPTCanvas()");
  console.log("  - enableChatGPTo1()");
  console.log("  - enableChatGPTSearch()");
  console.log("  - enableChatGPTDeepResearch()");
  console.log("  - enableChatGPTMode('Canvas'|'o1'|'Search'|'DeepResearch')");
  console.log("  - disableAllChatGPTModes()");
})();
