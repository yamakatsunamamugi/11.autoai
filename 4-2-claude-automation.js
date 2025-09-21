/**
 * @fileoverview Claude Automation V4 - シンプル改良版
 *
 * 【改良版ステップ構成】
 * ステップ1: 動作確認済みセレクタ定義
 * ステップ2: 高度な要素検索関数（複数戦略・リトライ付き）
 * ステップ3: React対応イベント処理（完全なイベントシーケンス）
 * ステップ4: モデル選択ロジック（動的メニュー待機・包括的検索）
 * ステップ5: 機能選択ロジック（トグル操作・状態確認強化）
 * ステップ6: 動的待機戦略（条件待機・並行検索）
 * ステップ7: デバッグ機能（DOM状態キャプチャ・ステップトレース）
 *
 * @version 4.0.0
 * @updated 2024-12-25 動作確認済みテストコードパターン統合、シンプル化完了
 */
(function () {
  "use strict";

  const scriptLoadTime = Date.now();
  console.log(
    `🚀 Claude Automation V4 (シンプル版) - ロード開始: ${new Date().toLocaleString("ja-JP")}`,
  );

  // 初期化フラグと重複実行防止
  if (window.CLAUDE_SCRIPT_LOADED) {
    console.log(
      "⚠️ Claude Automationは既に読み込まれています。重複実行をスキップ。",
    );
    return;
  }

  // 基本的な環境チェック
  const shouldInitialize =
    window.location.href.includes("claude.ai") &&
    document.readyState !== "loading";

  if (!shouldInitialize) {
    console.log("⚠️ Claude.aiでないか、ページ読み込み中のため初期化をスキップ");
    return;
  }

  // ========================================
  // ステップ7: デバッグ機能（DOM状態キャプチャ・ステップトレース）
  // ========================================

  const captureDOMState = (description = "DOM状態") => {
    try {
      return {
        timestamp: new Date().toISOString(),
        description,
        buttons: document.querySelectorAll("button").length,
        menus: document.querySelectorAll('[role="menu"], [role="menuitem"]')
          .length,
        toggles: document.querySelectorAll('input[role="switch"]').length,
        claudeElements: {
          sendButtons: document.querySelectorAll(
            '[aria-label*="送信"], [aria-label*="Send"]',
          ).length,
          modelButtons: document.querySelectorAll('[data-testid*="model"]')
            .length,
        },
      };
    } catch (error) {
      return { error: error.message, timestamp: new Date().toISOString() };
    }
  };

  // 簡素化されたログシステム
  window.claudeLogManager = {
    logs: [],
    addLog(entry) {
      this.logs.push({ timestamp: new Date().toISOString(), ...entry });
      console.log(`📝 [Claude-Log] ${entry.type}: ${entry.message}`);
    },
    logStep(step, message, data = {}) {
      this.addLog({ type: "step", step, message, data });
    },
    logError(step, error, context = {}) {
      this.addLog({ type: "error", step, error: error.message, context });
    },
  };

  // ========================================
  // ステップ1: 動作確認済みセレクタ定義
  // ========================================

  const CLAUDE_SELECTORS = {
    // テキスト入力欄
    INPUT: [
      '.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      '[aria-label*="プロンプト"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="メッセージ"]',
    ],

    // 送信ボタン（動作確認済み）
    SEND_BUTTON: [
      'button[aria-label="メッセージを送信"]',
      '[aria-label="メッセージを送信"]',
      'button[type="submit"]',
      'button[aria-label*="送信"]',
      "button:has(svg)",
    ],

    // 停止ボタン（動作確認済み）
    STOP_BUTTON: [
      'button[aria-label="応答を停止"]',
      '[aria-label="応答を停止"]',
      '[aria-label="Stop generating"]',
      'button[aria-label*="stop"]',
    ],

    // モデル選択（動作確認済み包括的セレクタ）
    MODEL_BUTTON: [
      '[data-testid="model-selector-dropdown"]',
      'button[data-value*="claude"]',
      "button.cursor-pointer:has(span.font-medium)",
      'button[aria-label*="モデル"]',
      'button[aria-haspopup="menu"]',
      'button[role="button"]:has(span:contains("Claude"))',
      'div[role="button"]:has(span:contains("Claude"))',
      'button:has(div:contains("Claude"))',
      'button:contains("Claude")',
    ],

    // 機能メニュー（動作確認済み包括的セレクタ）
    FUNCTION_MENU_BUTTON: [
      '[data-testid="input-menu-tools"]',
      "#input-tools-menu-trigger",
      '[aria-label="ツールメニューを開く"]',
      'button:has(svg[viewBox="0 0 24 24"])',
      '[role="button"]:has(svg)',
      'button:contains("機能")',
      'button:contains("ツール")',
    ],

    // 機能トグル（動作確認済み）
    TOGGLES: {
      WEB_SEARCH: [
        'button:contains("ウェブ検索")',
        'button:contains("Web search")',
        'button:has(p:contains("ウェブ検索"))',
      ],
      THINKING: [
        'button:contains("じっくり考える")',
        'button:contains("Think deeply")',
        'button:has(p:contains("じっくり考える"))',
      ],
      GENERAL: [
        'button:has(input[role="switch"])',
        '[role="switch"]',
        "button:has(p.font-base)",
      ],
    },

    // 応答メッセージ（動作確認済み）
    RESPONSE: [
      ".grid-cols-1.grid",
      'div[class*="grid-cols-1"][class*="grid"]',
      '[data-is-streaming="false"]',
      ".font-claude-message",
    ],

    // メニュー関連
    MENU: {
      CONTAINER: '[role="menu"][data-state="open"], [role="menu"]',
      ITEM: '[role="option"], [role="menuitem"]',
    },
  };

  // ========================================
  // ステップ6: 動的待機戦略（条件待機・並行検索）
  // ========================================

  const wait = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForCondition = async (conditionFn, options = {}) => {
    const {
      maxWait = 10000,
      checkInterval = 200,
      description = "条件",
    } = options;

    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      try {
        const result = await conditionFn();
        if (result) return result;
      } catch (error) {
        console.log(`⚠️ ${description}チェック中エラー: ${error.message}`);
      }
      await wait(checkInterval);
    }
    return false;
  };

  const isElementVisible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  };

  const isElementInteractable = (element) => {
    if (!element) return false;
    if (element.disabled || element.readOnly) return false;
    const style = window.getComputedStyle(element);
    return style.pointerEvents !== "none";
  };

  // ========================================
  // ステップ2: 高度な要素検索関数（複数戦略・リトライ付き）
  // ========================================

  const findElementByMultipleSelectors = async (
    selectors,
    description,
    options = {},
  ) => {
    const {
      maxRetries = 3,
      waitBetweenRetries = 500,
      includeTextSearch = true,
      requireVisible = true,
      requireInteractable = true,
    } = options;

    console.log(`🔍 [${description}] 要素検索開始`);

    // セレクタ配列の正規化
    const normalizedSelectors = Array.isArray(selectors)
      ? selectors
      : [selectors];

    // 戦略1: 基本CSS検索（リトライ付き）
    for (let retry = 0; retry < maxRetries; retry++) {
      for (const selector of normalizedSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (requireVisible && !isElementVisible(element)) continue;
            if (requireInteractable && !isElementInteractable(element))
              continue;
            console.log(`✅ 発見: ${selector}`);
            return element;
          }
        } catch (error) {
          console.log(`❌ エラー: ${error.message}`);
        }
      }
      if (retry < maxRetries - 1) {
        await wait(waitBetweenRetries);
      }
    }

    // 戦略2: テキストベース検索
    if (includeTextSearch) {
      const textPatterns = [
        /Claude|モデル|Model/i,
        /機能|ツール|Tools/i,
        /ウェブ検索|Web search/i,
      ];
      for (const pattern of textPatterns) {
        const clickableElements = document.querySelectorAll(
          'button, [role="button"], [role="menuitem"]',
        );
        for (const element of clickableElements) {
          if (pattern.test(element.textContent) && isElementVisible(element)) {
            console.log(
              `✅ テキスト検索成功: "${element.textContent.slice(0, 30)}..."`,
            );
            return element;
          }
        }
      }
    }

    console.log(`❌ [${description}] 要素が見つかりませんでした`);
    return null;
  };

  // ========================================
  // ステップ3: React対応イベント処理（完全なイベントシーケンス）
  // ========================================

  const getReactProps = (element) => {
    const reactKey = Object.keys(element).find(
      (key) =>
        key.startsWith("__reactProps") ||
        key.startsWith("__reactInternalInstance"),
    );
    return reactKey ? element[reactKey] : null;
  };

  const triggerReactEvent = async (
    element,
    eventType = "click",
    options = {},
  ) => {
    const {
      waitBetweenEvents = 10,
      includeFocus = true,
      forceNativeClick = false,
    } = options;

    try {
      const reactProps = getReactProps(element);
      console.log(
        `🎯 [イベント] ${reactProps ? "React" : "Native"}要素: ${element.tagName}`,
      );

      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      if (includeFocus && element.focus) {
        element.focus();
        await wait(50);
      }

      if (eventType === "click") {
        // 完全なマウスイベントシーケンス
        const events = [
          new PointerEvent("pointerover", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
          new MouseEvent("mouseover", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
          new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
          new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        ];

        for (const event of events) {
          element.dispatchEvent(event);
          await wait(waitBetweenEvents);
        }

        if (forceNativeClick || !reactProps) {
          element.click();
        }

        console.log(`✅ クリックイベント完了: ${element.tagName}`);
      }
    } catch (error) {
      console.log(`⚠️ イベント処理エラー: ${error.message}`);
    }
  };

  // ========================================
  // ステップ4: モデル選択ロジック（動的メニュー待機・包括的検索）
  // ========================================

  const selectModel = async (modelName) => {
    if (!modelName || modelName === "設定なし") {
      console.log("✅ モデル設定なし、スキップ");
      return { success: true, skipped: true };
    }

    console.log(`🎯 モデル選択開始: "${modelName}"`);

    try {
      // モデル選択ボタンを検索
      const menuButton = await findElementByMultipleSelectors(
        CLAUDE_SELECTORS.MODEL_BUTTON,
        "モデル選択ボタン",
        { maxRetries: 5, waitBetweenRetries: 1000 },
      );

      if (!menuButton) {
        throw new Error("モデル選択ボタンが見つかりません");
      }

      // ボタンをクリック
      await triggerReactEvent(menuButton, "click", { forceNativeClick: true });

      // メニュー表示を動的に待機
      const menuVisible = await waitForCondition(
        () => {
          const menuItems = document.querySelectorAll(
            '[role="menuitem"], [role="option"]',
          );
          return menuItems.length > 0 ? menuItems : null;
        },
        { maxWait: 5000, description: "メニュー表示" },
      );

      if (!menuVisible) {
        throw new Error("メニューが表示されませんでした");
      }

      // モデル名の正規化
      const targetVariations = [
        modelName,
        modelName.startsWith("Claude") ? modelName : `Claude ${modelName}`,
        modelName.replace(/^Claude\s+/, ""),
      ];

      // メニュー項目から検索
      for (const variant of targetVariations) {
        const menuItems = document.querySelectorAll(
          '[role="menuitem"], [role="option"]',
        );
        for (const item of menuItems) {
          if (item.textContent?.includes(variant)) {
            console.log(`✅ モデル発見: "${item.textContent.trim()}"`);
            await triggerReactEvent(item, "click", { forceNativeClick: true });
            await wait(1000);
            return { success: true, selected: item.textContent.trim() };
          }
        }
      }

      throw new Error(`モデル "${modelName}" が見つかりません`);
    } catch (error) {
      console.error(`❌ モデル選択エラー: ${error.message}`);
      return { success: false, error: error.message };
    }
  };

  // ========================================
  // ステップ5: 機能選択ロジック（トグル操作・状態確認強化）
  // ========================================

  const setToggleState = (toggleButton, targetState) => {
    try {
      const inputElement = toggleButton.querySelector('input[role="switch"]');
      const currentState =
        inputElement?.checked ||
        inputElement?.getAttribute("aria-checked") === "true";

      if (currentState !== targetState) {
        toggleButton.click();
        console.log(`🔄 トグル状態変更: ${currentState} → ${targetState}`);
      }
    } catch (error) {
      console.log(`⚠️ トグル操作エラー: ${error.message}`);
    }
  };

  const selectFunction = async (featureName) => {
    if (!featureName || featureName === "設定なし") {
      console.log("✅ 機能設定なし、スキップ");
      return { success: true, skipped: true };
    }

    console.log(`🎯 機能選択開始: "${featureName}"`);

    try {
      // 機能メニューボタンを検索
      const featureMenuBtn = await findElementByMultipleSelectors(
        CLAUDE_SELECTORS.FUNCTION_MENU_BUTTON,
        "機能メニューボタン",
        { maxRetries: 5, waitBetweenRetries: 1000 },
      );

      if (!featureMenuBtn) {
        throw new Error("機能メニューボタンが見つかりません");
      }

      // ボタンをクリック
      await triggerReactEvent(featureMenuBtn, "click", {
        forceNativeClick: true,
      });

      // メニュー表示を動的に待機
      const menuVisible = await waitForCondition(
        () => {
          const toggles = document.querySelectorAll(
            'button:has(input[role="switch"])',
          );
          return toggles.length > 0 ? toggles : null;
        },
        { maxWait: 5000, description: "機能メニュー表示" },
      );

      if (!menuVisible) {
        throw new Error("機能メニューが表示されませんでした");
      }

      // 全トグルをオフに設定
      const allToggles = document.querySelectorAll(
        'button:has(input[role="switch"])',
      );
      for (const toggle of allToggles) {
        setToggleState(toggle, false);
        await wait(100);
      }

      // 指定機能を検索・有効化
      const targetVariations = [
        featureName,
        "ウェブ検索",
        "Web search",
        "じっくり考える",
        "Think deeply",
      ];

      for (const variant of targetVariations) {
        const toggles = document.querySelectorAll(
          'button:has(input[role="switch"])',
        );
        for (const toggle of toggles) {
          const textContent = toggle.textContent || "";
          if (textContent.includes(variant)) {
            console.log(`✅ 機能発見: "${textContent.trim()}"`);
            setToggleState(toggle, true);
            await wait(1000);
            return { success: true, selected: variant };
          }
        }
      }

      console.log(
        `⚠️ 機能 "${featureName}" が見つかりません - スキップして続行`,
      );
      return { success: true, selected: featureName, skipped: true };
    } catch (error) {
      console.error(`❌ 機能選択エラー: ${error.message}`);
      return { success: false, error: error.message };
    }
  };

  // ========================================
  // メイン実行関数
  // ========================================

  const executeTask = async (taskData) => {
    console.log("🚀 Claude自動化タスク開始", taskData);
    window.claudeLogManager.logStep("task-start", "タスク実行開始", taskData);

    try {
      // Step 1: テキスト入力
      if (taskData.prompt) {
        console.log("📝 テキスト入力開始");
        const inputElement = await findElementByMultipleSelectors(
          CLAUDE_SELECTORS.INPUT,
          "テキスト入力欄",
        );

        if (inputElement) {
          inputElement.focus();
          inputElement.textContent = taskData.prompt;
          await triggerReactEvent(inputElement, "input");
          console.log("✅ テキスト入力完了");
        }
      }

      // Step 2: モデル選択
      if (taskData.model) {
        const modelResult = await selectModel(taskData.model);
        if (!modelResult.success && !modelResult.skipped) {
          throw new Error(`モデル選択失敗: ${modelResult.error}`);
        }
      }

      // Step 3: 機能選択
      if (taskData.function) {
        const functionResult = await selectFunction(taskData.function);
        if (!functionResult.success && !functionResult.skipped) {
          throw new Error(`機能選択失敗: ${functionResult.error}`);
        }
      }

      // Step 4: メッセージ送信
      console.log("📤 メッセージ送信開始");
      const sendButton = await findElementByMultipleSelectors(
        CLAUDE_SELECTORS.SEND_BUTTON,
        "送信ボタン",
      );

      if (sendButton) {
        await triggerReactEvent(sendButton, "click", {
          forceNativeClick: true,
        });
        console.log("✅ メッセージ送信完了");
      }

      // Step 5: 応答待機
      console.log("⏳ 応答待機開始");
      const response = await waitForCondition(
        () => {
          const responseElements = document.querySelectorAll(
            CLAUDE_SELECTORS.RESPONSE.join(", "),
          );
          const lastResponse = responseElements[responseElements.length - 1];

          // ストリーミング中でないことを確認
          if (
            lastResponse &&
            !document.querySelector(
              '[aria-label*="停止"], [aria-label*="Stop"]',
            )
          ) {
            return lastResponse.textContent;
          }
          return null;
        },
        { maxWait: 30000, description: "Claude応答" },
      );

      if (response) {
        console.log("✅ 応答取得完了");
        window.claudeLogManager.logStep("task-complete", "タスク完了");
        return {
          success: true,
          response: response,
          timestamp: new Date().toISOString(),
        };
      } else {
        throw new Error("応答の取得に失敗しました");
      }
    } catch (error) {
      console.error("❌ タスク実行エラー:", error);
      window.claudeLogManager.logError("task-error", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  };

  // ========================================
  // 初期化とグローバル関数公開
  // ========================================

  // グローバル関数として公開
  window.executeTask = executeTask;
  window.findClaudeElement = findElementByMultipleSelectors;
  window.inputText = async (text) => {
    const input = await findElementByMultipleSelectors(
      CLAUDE_SELECTORS.INPUT,
      "入力欄",
    );
    if (input) {
      input.textContent = text;
      await triggerReactEvent(input, "input");
    }
  };
  window.runAutomation = executeTask; // 互換性のため

  // 初期化完了マーカー
  window.CLAUDE_SCRIPT_LOADED = true;
  window.CLAUDE_SCRIPT_INIT_TIME = scriptLoadTime;

  console.log("✅ Claude Automation V4 (シンプル版) 初期化完了");
  console.log(
    `📊 公開関数: executeTask, findClaudeElement, inputText, runAutomation`,
  );
})();
