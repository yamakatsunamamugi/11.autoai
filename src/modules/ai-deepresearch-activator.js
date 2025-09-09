/**
 * @fileoverview AI別DeepResearch有効化モジュール
 * 各AI固有のDeepResearchボタン/トグルを操作
 */

// Sleep utility function (inline implementation)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// DeepResearch config access helper
function getDeepResearchConfig() {
  if (typeof window !== 'undefined' && window.deepResearchConfig) {
    return window.deepResearchConfig;
  }
  // Fallback minimal config
  return {
    getConfigForAI: (aiType) => ({
      specific: {
        SELECTORS: {},
        ACTIVATION: {}
      }
    }),
    log: console.log
  };
}

/**
 * AI別DeepResearch有効化クラス
 */
class AIDeepResearchActivator {
  constructor(aiType) {
    this.aiType = aiType;
    this.deepResearchConfig = getDeepResearchConfig();
    this.config = this.deepResearchConfig.getConfigForAI(aiType);
    this.selectors = this.config.specific.SELECTORS;
    this.activation = this.config.specific.ACTIVATION;
  }

  /**
   * DeepResearchを有効化
   * @param {boolean} enable - 有効にする場合true
   * @returns {Promise<boolean>} 成功した場合true
   */
  async activate(enable = true) {
    try {
      this.this.deepResearchConfig.log(
        `${this.aiType} DeepResearch ${enable ? "有効化" : "無効化"}開始`,
      );

      switch (this.aiType.toLowerCase()) {
        case "chatgpt":
          return await this._activateChatGPT(enable);
        case "claude":
          return await this._activateClaude(enable);
        case "gemini":
          return await this._activateGemini(enable);
        default:
          this.deepResearchConfig.log(`未対応AI: ${this.aiType}`);
          return false;
      }
    } catch (error) {
      this.deepResearchConfig.log(
        `DeepResearch有効化エラー: ${error.message}`,
        error,
      );
      return false;
    }
  }

  /**
   * ChatGPTのDeepResearch有効化
   * @private
   */
  async _activateChatGPT(enable) {
    // 方法1: Web検索トグルを使用（優先）
    if (await this._tryWebSearchToggle(enable)) {
      return true;
    }

    // 方法2: ツールメニューを使用（フォールバック）
    if (await this._tryToolsMenu(enable)) {
      return true;
    }

    this.deepResearchConfig.log("ChatGPT DeepResearch有効化に失敗");
    return false;
  }

  /**
   * Web検索トグルでの有効化を試行
   * @private
   */
  async _tryWebSearchToggle(enable) {
    try {
      console.log(
        `🔍 [DeepResearch] Web検索トグル検索開始 - セレクタ: ${this.selectors.WEB_SEARCH_TOGGLE}`,
      );

      const toggle = await this._waitForElement(
        this.selectors.WEB_SEARCH_TOGGLE,
        3000,
      );
      if (!toggle) {
        console.log(`❌ [DeepResearch] Web検索トグルが見つからない`);
        this.deepResearchConfig.log("Web検索トグルが見つからない");
        return false;
      }

      console.log(`✅ [DeepResearch] Web検索トグル発見:`, toggle);

      const currentState = toggle.getAttribute("aria-checked") === "true";
      console.log(
        `📊 [DeepResearch] 現在の状態: ${currentState}, 目標: ${enable}`,
      );

      if (currentState === enable) {
        console.log(
          `ℹ️ [DeepResearch] Web検索は既に${enable ? "有効" : "無効"}です`,
        );
        this.deepResearchConfig.log(`Web検索は既に${enable ? "有効" : "無効"}です`);
        return true;
      }

      // トグルをクリック
      console.log(`🖱️ [DeepResearch] Web検索トグルをクリック実行中...`);
      toggle.click();
      await sleep(this.activation.WAIT_AFTER_CLICK);

      // 状態確認
      const newState = toggle.getAttribute("aria-checked") === "true";
      const success = newState === enable;

      console.log(
        `📊 [DeepResearch] クリック後の状態: ${newState}, 成功: ${success}`,
      );

      this.deepResearchConfig.log(
        `Web検索トグル${success ? "成功" : "失敗"}: ${currentState} → ${newState}`,
      );
      return success;
    } catch (error) {
      this.deepResearchConfig.log("Web検索トグルエラー:", error);
      return false;
    }
  }

  /**
   * ツールメニューでの有効化を試行
   * @private
   */
  async _tryToolsMenu(enable) {
    try {
      console.log(
        `🔍 [DeepResearch] ツールボタン検索開始 - セレクタ: ${this.selectors.TOOLS_BUTTON}`,
      );

      // ツールボタンを探す
      const toolButton = await this._waitForElement(
        this.selectors.TOOLS_BUTTON,
        3000,
      );
      if (!toolButton) {
        console.log(`❌ [DeepResearch] ツールボタンが見つからない`);
        this.deepResearchConfig.log("ツールボタンが見つからない");
        return false;
      }

      console.log(`✅ [DeepResearch] ツールボタン発見:`, toolButton);

      // メニューを開く
      if (toolButton.getAttribute("data-state") !== "open") {
        console.log(`🔓 [DeepResearch] ツールメニューを開く`);
        this.deepResearchConfig.log("ツールメニューを開く");

        // PointerEventでクリック（より確実）
        const pointerDown = new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 1,
        });
        const pointerUp = new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 1,
        });

        toolButton.dispatchEvent(pointerDown);
        await sleep(50);
        toolButton.dispatchEvent(pointerUp);
        await sleep(500);
      }

      // Deep Research項目を探す
      const menuItems = document.querySelectorAll(this.selectors.MENU_ITEM);
      let deepResearchItem = null;

      for (const item of menuItems) {
        const text = item.textContent || "";
        if (text.includes("Deep Research") || text.includes("Search the web")) {
          deepResearchItem = item;
          this.deepResearchConfig.log("Deep Research項目発見");
          break;
        }
      }

      if (!deepResearchItem) {
        this.deepResearchConfig.log("Deep Research項目が見つからない");
        return false;
      }

      // 現在の状態を確認
      const currentState =
        deepResearchItem.getAttribute("aria-checked") === "true";

      if (currentState === enable) {
        this.deepResearchConfig.log(
          `Deep Researchは既に${enable ? "有効" : "無効"}です`,
        );
        return true;
      }

      // 状態を切り替え
      deepResearchItem.click();
      await sleep(this.activation.WAIT_AFTER_CLICK);

      // 状態変更を確認
      const newState = deepResearchItem.getAttribute("aria-checked") === "true";
      const success = newState === enable;

      this.deepResearchConfig.log(
        `ツールメニュー${success ? "成功" : "失敗"}: ${currentState} → ${newState}`,
      );
      return success;
    } catch (error) {
      this.deepResearchConfig.log("ツールメニューエラー:", error);
      return false;
    }
  }

  /**
   * ClaudeのDeepResearch有効化
   * @private
   */
  async _activateClaude(enable) {
    try {
      console.log(
        `🔍 [DeepResearch] Claude リサーチボタン検索開始 - セレクタ: ${this.selectors.RESEARCH_BUTTON}`,
      );

      // リサーチボタンを探す
      const researchButton = await this._waitForElement(
        this.selectors.RESEARCH_BUTTON,
        3000,
      );
      if (!researchButton) {
        console.log(`❌ [DeepResearch] Claude リサーチボタンが見つからない`);
        this.deepResearchConfig.log("Claude リサーチボタンが見つからない");
        return false;
      }

      console.log(
        `✅ [DeepResearch] Claude リサーチボタン発見:`,
        researchButton,
      );

      // 現在の状態をチェック
      const currentState =
        researchButton.getAttribute("aria-checked") === "true";
      console.log(
        `📊 [DeepResearch] Claude 現在の状態: ${currentState}, 目標: ${enable}`,
      );

      if (currentState === enable) {
        console.log(
          `ℹ️ [DeepResearch] Claude リサーチは既に${enable ? "有効" : "無効"}です`,
        );
        return true;
      }

      // ボタンをクリック
      console.log(`🖱️ [DeepResearch] Claude リサーチボタンをクリック実行中...`);
      researchButton.click();
      await sleep(this.activation.WAIT_AFTER_CLICK);

      // 状態確認
      const newState = researchButton.getAttribute("aria-checked") === "true";
      const success = newState === enable;
      console.log(
        `📊 [DeepResearch] Claude クリック後の状態: ${newState}, 成功: ${success}`,
      );

      this.deepResearchConfig.log("Claude DeepResearch有効化完了");
      return success;
    } catch (error) {
      console.error(`💥 [DeepResearch] Claude DeepResearchエラー:`, error);
      this.deepResearchConfig.log("Claude DeepResearchエラー:", error);
      return false;
    }
  }

  /**
   * GeminiのDeepResearch有効化
   * @private
   */
  async _activateGemini(enable) {
    try {
      console.log(`🔍 [DeepResearch] Gemini DeepResearchボタン検索開始`);

      // DeepResearchボタンを探す
      const deepResearchButton = await this._findGeminiDeepResearchButton();
      if (!deepResearchButton) {
        console.log(
          `❌ [DeepResearch] Gemini DeepResearchボタンが見つからない`,
        );
        this.deepResearchConfig.log("Gemini DeepResearchボタンが見つからない");
        return false;
      }

      console.log(
        `✅ [DeepResearch] Gemini DeepResearchボタン発見:`,
        deepResearchButton,
      );

      // 現在の状態を確認（動作確認済みの状態チェック）
      const currentState =
        deepResearchButton.classList.contains("is-selected") ||
        deepResearchButton.getAttribute("aria-pressed") === "true";
      console.log(
        `📊 [DeepResearch] Gemini 現在の状態: ${currentState}, 目標: ${enable}`,
      );

      if (currentState === enable) {
        console.log(
          `ℹ️ [DeepResearch] Gemini DeepResearchは既に${enable ? "有効" : "無効"}です`,
        );
        this.deepResearchConfig.log(
          `Gemini DeepResearchは既に${enable ? "有効" : "無効"}です`,
        );
        return true;
      }

      // ボタンをクリック
      console.log(
        `🖱️ [DeepResearch] Gemini DeepResearchボタンをクリック実行中...`,
      );
      deepResearchButton.click();
      await sleep(this.activation.WAIT_AFTER_CLICK);

      // 状態確認（動作確認済みの状態チェック）
      const newState =
        deepResearchButton.classList.contains("is-selected") ||
        deepResearchButton.getAttribute("aria-pressed") === "true";
      const success = newState === enable;
      console.log(
        `📊 [DeepResearch] Gemini クリック後の状態: ${newState}, 成功: ${success}`,
      );

      this.deepResearchConfig.log(
        `Gemini DeepResearch${success ? "成功" : "失敗"}: ${currentState} → ${newState}`,
      );
      return success;
    } catch (error) {
      console.error(`💥 [DeepResearch] Gemini DeepResearchエラー:`, error);
      this.deepResearchConfig.log("Gemini DeepResearchエラー:", error);
      return false;
    }
  }

  /**
   * DeepResearch状態を取得
   * @returns {Promise<boolean|null>} 有効な場合true、無効な場合false、不明な場合null
   */
  async getStatus() {
    try {
      switch (this.aiType.toLowerCase()) {
        case "chatgpt":
          return await this._getChatGPTStatus();
        case "claude":
          return await this._getClaudeStatus();
        case "gemini":
          return await this._getGeminiStatus();
        default:
          return null;
      }
    } catch (error) {
      this.deepResearchConfig.log(`状態取得エラー: ${error.message}`);
      return null;
    }
  }

  /**
   * ChatGPTの状態取得
   * @private
   */
  async _getChatGPTStatus() {
    const toggle = document.querySelector(this.selectors.WEB_SEARCH_TOGGLE);
    if (toggle) {
      return toggle.getAttribute("aria-checked") === "true";
    }
    return null;
  }

  /**
   * Claudeの状態取得
   * @private
   */
  async _getClaudeStatus() {
    const indicator = document.querySelector(this.selectors.RESEARCH_INDICATOR);
    if (indicator) {
      return indicator.classList.contains("research-enabled");
    }
    return null;
  }

  /**
   * Geminiの状態取得
   * @private
   */
  async _getGeminiStatus() {
    // DeepResearchボタンを探す
    const deepResearchButton = await this._findGeminiDeepResearchButton();
    if (deepResearchButton) {
      // 動作確認済みの状態チェック
      const isSelected =
        deepResearchButton.classList.contains("is-selected") ||
        deepResearchButton.getAttribute("aria-pressed") === "true";

      // 追加のUI確認
      const hasDeepResearchUI =
        document.querySelector(".deep-research-container") !== null;
      const hasDeepResearchIndicator =
        document.querySelector('[aria-label*="Deep Research mode"]') !== null;

      console.log("🔬 [DeepResearch] Gemini状態確認:", {
        "is-selected": deepResearchButton.classList.contains("is-selected"),
        "aria-pressed": deepResearchButton.getAttribute("aria-pressed"),
        有効: isSelected,
        "DeepResearch UIが表示されているか": hasDeepResearchUI,
        DeepResearchインジケータがあるか: hasDeepResearchIndicator,
      });

      return isSelected;
    }
    return null;
  }

  /**
   * 要素を待機
   * @private
   */
  async _waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await sleep(100);
    }

    return null;
  }

  /**
   * GeminiのDeepResearchボタンを探す（動作確認済みコード）
   * @private
   */
  async _findGeminiDeepResearchButton() {
    // 方法1: toolbox-drawer-button-labelのテキストで検索（最も確実）
    const labels = document.querySelectorAll(".toolbox-drawer-button-label");
    for (const label of labels) {
      if (label.textContent.trim() === "Deep Research") {
        const button = label.closest("button");
        if (button) {
          console.log(
            "✅ [DeepResearch] Gemini DeepResearchボタン発見（ラベル検索）",
          );
          return button;
        }
      }
    }

    // 方法2: ボタン全体から検索
    const buttons = document.querySelectorAll(
      "button.toolbox-drawer-item-button",
    );
    for (const btn of buttons) {
      const labelDiv = btn.querySelector(".toolbox-drawer-button-label");
      if (labelDiv && labelDiv.textContent.trim() === "Deep Research") {
        console.log(
          "✅ [DeepResearch] Gemini DeepResearchボタン発見（ボタン検索）",
        );
        return btn;
      }
    }

    // 方法3: フォールバック - より広範な検索
    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
      if (btn.textContent && btn.textContent.includes("Deep Research")) {
        console.log(
          "✅ [DeepResearch] Gemini DeepResearchボタン発見（フォールバック）",
        );
        return btn;
      }
    }

    console.log("❌ [DeepResearch] Gemini DeepResearchボタンが見つかりません");
    return null;
  }

}

// AI別のファクトリー関数
function createDeepResearchActivator(aiType) {
  return new AIDeepResearchActivator(aiType);
}

// グローバル変数として公開
if (typeof window !== 'undefined') {
  window.AIDeepResearchActivator = AIDeepResearchActivator;
  window.createDeepResearchActivator = createDeepResearchActivator;
}
