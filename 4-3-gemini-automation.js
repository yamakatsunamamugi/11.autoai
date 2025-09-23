// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
      console.log(
        `📋 ログレベル設定: ${["", "ERROR", "WARN", "INFO", "DEBUG"][CURRENT_LOG_LEVEL]} (${CURRENT_LOG_LEVEL})`,
      );
    } else {
      console.log("📋 ログレベル: デフォルト (INFO)");
    }
  });
}

// ログユーティリティ（CURRENT_LOG_LEVELを動的に参照）
const log = {
  error: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) console.error(...args);
  },
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) console.warn(...args);
  },
  info: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) console.log(...args);
  },
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) console.log(...args);
  },
};

/**
 * @fileoverview Gemini Automation V3 - 統合版（UI通信機能追加）
 * @version 3.2.0
 * @updated 2025-09-23 UI通信機能とセレクタ集約
 */

(async function () {
  "use strict";

  console.log(`🚀 Gemini Automation V3 初期化`);

  // 初期化マーカー設定
  window.GEMINI_SCRIPT_LOADED = true;
  window.GEMINI_SCRIPT_INIT_TIME = Date.now();

  // ========================================
  // セレクタ定義（冒頭に集約）
  // ========================================
  const SELECTORS = {
    // モデル選択メニュー
    menuButton: [
      ".gds-mode-switch-button.logo-pill-btn",
      'button[class*="logo-pill-btn"]',
      "button.gds-mode-switch-button",
      "button.logo-pill-btn",
    ],
    menuContainer: [
      ".cdk-overlay-pane .menu-inner-container",
      '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]',
      ".mat-mdc-menu-panel",
    ],
    modelButtons: [
      "button.bard-mode-list-button[mat-menu-item]",
      'button[role="menuitemradio"]',
      "button[mat-menu-item]",
    ],
    modelDesc: [".mode-desc", ".gds-label-m-alt", ".title-and-description"],
    modelDisplay: [
      ".logo-pill-label-container",
      ".gds-mode-switch-button .mdc-button__label div",
    ],

    // 機能ボタン
    mainButtons: "toolbox-drawer-item > button",
    moreButton: 'button[aria-label="その他"]',
    featureMenuItems: ".cdk-overlay-pane .toolbox-drawer-menu-item button",
    featureLabel: ".label",
    selectedFeatures: [
      ".toolbox-drawer-item-button button.is-selected",
      ".toolbox-drawer-button.has-selected-item",
    ],

    // 入力欄
    canvas: ".ProseMirror",
    normalInput: ".ql-editor",

    // 送信ボタン
    sendButton: "button.send-button.submit:not(.stop)",
    sendButtonAlt: [
      'button[aria-label="送信"]:not([disabled])',
      'button[aria-label*="Send"]:not([disabled])',
      ".send-button:not([disabled])",
    ],
    stopButton: "button.send-button.stop",

    // Deep Research
    deepResearchButton: 'button[data-test-id="confirm-button"]',

    // レスポンス
    canvasResponse: ".ProseMirror",
    normalResponse: ".model-response-text .markdown",
    responseAlt: [
      "[data-response-index]:last-child",
      ".model-response:last-child",
      '[role="presentation"]:last-child',
    ],

    // オーバーレイ
    overlay: ".cdk-overlay-backdrop",
  };

  // ========================================
  // ユーティリティ関数（最初に定義）
  // ========================================
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const findElement = (selectorArray, parent = document) => {
    const selectors = Array.isArray(selectorArray)
      ? selectorArray
      : [selectorArray];
    for (const selector of selectors) {
      const element = parent.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const findElements = (selectorArray, parent = document) => {
    const selectors = Array.isArray(selectorArray)
      ? selectorArray
      : [selectorArray];
    for (const selector of selectors) {
      const elements = parent.querySelectorAll(selector);
      if (elements.length > 0) return Array.from(elements);
    }
    return [];
  };

  const getCleanText = (element) => {
    if (!element) return "";
    try {
      const clone = element.cloneNode(true);
      clone
        .querySelectorAll(
          "mat-icon, .mat-ripple, .mat-mdc-button-persistent-ripple, .mat-focus-indicator, .mat-mdc-button-touch-target, .cdk-visually-hidden",
        )
        .forEach((el) => el.remove());
      return clone.textContent.trim().replace(/\s+/g, " ");
    } catch (e) {
      return element.textContent.trim().replace(/\s+/g, " ");
    }
  };

  // ========================================
  // モデルと機能の初期化
  // ========================================
  window.availableModels = [];
  window.availableFeatures = [];

  // ========================================
  // UI通信機能
  // ========================================
  async function sendToUI(models, features) {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.sendMessage
      ) {
        log.debug("📡 [Gemini] UI通信開始", {
          modelsCount: models?.length || 0,
          featuresCount: features?.length || 0,
          timestamp: new Date().toISOString(),
        });

        // タイムアウト付きでsendMessageを実行
        const sendMessageWithTimeout = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            log.warn("⏱️ [Gemini] sendMessageがタイムアウト（3秒経過）");
            resolve({
              error: "timeout",
              message: "sendMessage timeout after 3000ms",
            });
          }, 3000); // 3秒でタイムアウト

          try {
            chrome.runtime.sendMessage(
              {
                type: "AI_MODEL_FUNCTION_UPDATE",
                aiType: "gemini",
                data: {
                  models: models || [],
                  features: features || [],
                  timestamp: new Date().toISOString(),
                },
              },
              (response) => {
                clearTimeout(timeout);

                // chrome.runtime.lastErrorをチェック
                if (chrome.runtime.lastError) {
                  log.warn(
                    "⚠️ [Gemini] chrome.runtime.lastError:",
                    chrome.runtime.lastError.message,
                  );
                  resolve({
                    error: "runtime_error",
                    message: chrome.runtime.lastError.message,
                  });
                } else {
                  log.debug("📨 [Gemini] sendMessage応答受信:", response);
                  resolve(response || { success: true });
                }
              },
            );
          } catch (error) {
            clearTimeout(timeout);
            log.warn("❌ [Gemini] sendMessage実行エラー:", error.message);
            resolve({
              error: "execution_error",
              message: error.message,
            });
          }
        });

        const result = await sendMessageWithTimeout;

        if (result.error) {
          log.warn("⚠️ [Gemini] UI通信失敗:", result);
        } else {
          log.info("✅ [Gemini] UI更新メッセージを送信しました");
        }

        return result;
      }
    } catch (error) {
      log.debug(
        "UI通信エラー（拡張機能コンテキスト外の可能性）:",
        error.message,
      );
    }
  }

  // ========================================
  // モデルと機能の探索
  // ========================================
  async function discoverModelsAndFeatures() {
    log.info("【Step 4-3-1-1】モデルと機能の探索");

    // 【Step 4-3-1-2】選択済み機能の解除
    await deselectAllFeatures();

    // 【Step 4-3-1-3】モデル探索
    try {
      const menuButton = findElement(SELECTORS.menuButton);

      if (menuButton) {
        menuButton.click();
        await wait(1500);

        const menuContainer = findElement(SELECTORS.menuContainer);

        if (menuContainer) {
          const modelButtons = findElements(
            SELECTORS.modelButtons,
            menuContainer,
          );

          window.availableModels = modelButtons
            .map((btn) => {
              const text = getCleanText(findElement(SELECTORS.modelDesc, btn));
              return text || getCleanText(btn);
            })
            .filter(Boolean);

          log.info(
            `モデル探索完了: ${window.availableModels.length}個のモデルを発見`,
          );
        }
      }
    } catch (e) {
      log.error("モデル探索エラー: " + e.message);
    } finally {
      // メニューを閉じる
      const overlay = document.querySelector(SELECTORS.overlay);
      if (overlay) overlay.click();
      await wait(500);
    }

    // 【Step 4-3-1-4】機能探索
    try {
      const featureNames = new Set();

      const mainButtons = findElements(SELECTORS.mainButtons);
      mainButtons.forEach((btn) => {
        const labelEl = findElement(SELECTORS.featureLabel, btn);
        if (labelEl) {
          const text = getCleanText(labelEl);
          if (text && text !== "その他") {
            featureNames.add(text);
          }
        }
      });

      const moreButton = findElement(SELECTORS.moreButton);
      if (moreButton) {
        moreButton.click();
        await wait(1500);

        const menuItems = findElements(SELECTORS.featureMenuItems);
        menuItems.forEach((item) => {
          const labelEl = findElement(SELECTORS.featureLabel, item);
          if (labelEl) {
            const text = getCleanText(labelEl);
            if (text) {
              featureNames.add(text);
            }
          }
        });
      }

      window.availableFeatures = Array.from(featureNames).filter(Boolean);
      log.info(
        `機能探索完了: ${window.availableFeatures.length}個の機能を発見`,
      );
    } catch (e) {
      log.error("機能探索エラー: " + e.message);
    } finally {
      const overlay = document.querySelector(SELECTORS.overlay);
      if (overlay) overlay.click();
      await wait(500);
    }

    // 【Step 4-3-1-5】UI更新
    await sendToUI(window.availableModels, window.availableFeatures);

    return {
      models: window.availableModels,
      features: window.availableFeatures,
    };
  }

  // ========================================
  // テキスト入力（Canvas/通常モード自動判定）
  // ========================================
  async function inputTextGemini(text) {
    // Canvasモードチェック
    const canvas = document.querySelector(SELECTORS.canvas);
    if (canvas && canvas.isContentEditable) {
      log.debug("Canvas mode detected");
      return await inputToCanvas(text);
    }

    // 通常モード
    const editor = document.querySelector(SELECTORS.normalInput);
    if (editor) {
      log.debug("Normal mode detected");
      return await inputToNormal(text);
    }

    throw new Error("テキスト入力欄が見つかりません");
  }

  async function inputToCanvas(text) {
    const canvas = document.querySelector(SELECTORS.canvas);
    if (!canvas) {
      throw new Error("Canvas (.ProseMirror) が見つかりません");
    }

    canvas.focus();
    await wait(100);

    // Clear existing content
    canvas.innerHTML = "<p></p>";

    // Set new content
    const paragraph = canvas.querySelector("p");
    if (paragraph) {
      paragraph.textContent = text;
    } else {
      canvas.innerHTML = `<p>${text}</p>`;
    }

    // Dispatch events
    canvas.dispatchEvent(new Event("input", { bubbles: true }));
    canvas.dispatchEvent(new Event("change", { bubbles: true }));

    await wait(500);
    return canvas;
  }

  async function inputToNormal(text) {
    const editor = document.querySelector(SELECTORS.normalInput);
    if (!editor) {
      throw new Error("テキスト入力欄 (.ql-editor) が見つかりません");
    }

    editor.textContent = text;
    if (editor.classList.contains("ql-blank")) {
      editor.classList.remove("ql-blank");
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(500);

    return editor;
  }

  // ========================================
  // メッセージ送信
  // ========================================
  async function sendMessageGemini() {
    let sendButton = document.querySelector(SELECTORS.sendButton);

    if (!sendButton) {
      sendButton = findElement(SELECTORS.sendButtonAlt);
    }

    if (!sendButton) throw new Error("送信ボタンが見つかりません");

    sendButton.click();
    await wait(1000);

    return true;
  }

  // ========================================
  // 応答待機
  // ========================================
  async function waitForResponseGemini() {
    const maxWaitTime = 300000; // 5分
    const checkInterval = 1000;
    let elapsedTime = 0;

    log.debug("応答待機を開始します...");

    while (elapsedTime < maxWaitTime) {
      await wait(checkInterval);
      elapsedTime += checkInterval;

      const stopButton = document.querySelector(SELECTORS.stopButton);

      if (!stopButton) {
        log.debug("応答が完了しました（停止ボタンが消えました）");
        return true;
      }

      if (elapsedTime % 10000 === 0) {
        log.debug(`応答待機中... (${elapsedTime / 1000}秒経過)`);
      }
    }

    throw new Error("Geminiの応答がタイムアウトしました（5分）");
  }

  // ========================================
  // テキスト取得
  // ========================================
  async function getResponseTextGemini() {
    // Canvas
    const canvasEditor = document.querySelector(SELECTORS.canvasResponse);
    if (canvasEditor && canvasEditor.textContent.trim()) {
      return canvasEditor.textContent.trim();
    }

    // 通常応答
    const responseElements = document.querySelectorAll(
      SELECTORS.normalResponse,
    );
    if (responseElements.length > 0) {
      const latestResponse = responseElements[responseElements.length - 1];
      if (latestResponse) {
        return latestResponse.textContent.trim();
      }
    }

    // フォールバック
    for (const selector of SELECTORS.responseAlt) {
      const element = document.querySelector(selector);
      if (element) {
        return element.textContent.trim();
      }
    }

    throw new Error("Geminiの回答が見つかりません");
  }

  // ========================================
  // 選択済み機能の解除
  // ========================================
  async function deselectAllFeatures() {
    log.debug("【Step 4-3-2-0】選択されている機能をすべて解除");
    try {
      const selectedButtons = findElements(SELECTORS.selectedFeatures);
      let count = 0;
      for (const btn of selectedButtons) {
        btn.click();
        await wait(2000);
        count++;
      }
      if (count > 0) {
        log.info(`解除した機能の数: ${count}`);
      }
      return count;
    } catch (error) {
      log.error("機能解除エラー:", error);
      return 0;
    }
  }

  // ========================================
  // モデル選択機能
  // ========================================
  async function selectModel(modelName) {
    log.debug("【Step 4-3-3】モデル選択", modelName);

    if (!modelName || modelName === "" || modelName === "設定なし") {
      log.debug("モデル選択をスキップ");
      return { success: true, skipped: true };
    }

    try {
      // 【Step 4-3-3-1】メニューボタンをクリック
      const menuButton = findElement(SELECTORS.menuButton);
      if (!menuButton) {
        throw new Error("モデル選択メニューボタンが見つかりません");
      }
      menuButton.click();
      await wait(1500);

      // 【Step 4-3-3-2】メニュー内でモデルを探して選択
      const menuContainer = findElement(SELECTORS.menuContainer);
      if (!menuContainer) {
        throw new Error("モデル選択メニューが見つかりません");
      }

      const modelButtons = findElements(SELECTORS.modelButtons, menuContainer);
      const targetButton = Array.from(modelButtons).find((btn) => {
        const text = getCleanText(btn);
        return text && text.includes(modelName);
      });

      if (!targetButton) {
        throw new Error(`モデル "${modelName}" が見つかりません`);
      }

      targetButton.click();
      await wait(2000);

      // 【Step 4-3-3-3】選択確認
      const displayElement = findElement(SELECTORS.modelDisplay);
      const displayText = getCleanText(displayElement);

      if (!displayText.includes(modelName.replace("2.5 ", ""))) {
        log.warn(`モデル選択確認: 期待値=${modelName}, 実際=${displayText}`);
      }

      log.info(`モデル「${displayText}」を選択しました`);
      return { success: true, selected: displayText };
    } catch (error) {
      log.error("モデル選択エラー:", error);
      return { success: false, error: error.message };
    }
  }

  // ========================================
  // 機能選択機能
  // ========================================
  async function selectFeature(featureName) {
    log.debug("【Step 4-3-4】機能選択", featureName);

    if (!featureName || featureName === "" || featureName === "設定なし") {
      log.debug("機能選択をスキップ");
      return { success: true, skipped: true };
    }

    try {
      // 【Step 4-3-4-1】まずメインボタンから探す
      let featureButton = null;
      const allButtons = findElements(SELECTORS.mainButtons);
      featureButton = Array.from(allButtons).find(
        (btn) =>
          getCleanText(findElement(SELECTORS.featureLabel, btn)) ===
          featureName,
      );

      // 【Step 4-3-4-2】見つからなければ「その他」メニューを開く
      if (!featureButton) {
        const moreButton = findElement(SELECTORS.moreButton);
        if (!moreButton) {
          throw new Error("「その他」ボタンが見つかりません");
        }
        moreButton.click();
        await wait(1500);

        const menuButtons = findElements(SELECTORS.featureMenuItems);
        featureButton = Array.from(menuButtons).find(
          (btn) =>
            getCleanText(findElement(SELECTORS.featureLabel, btn)) ===
            featureName,
        );
      }

      if (!featureButton) {
        throw new Error(`機能「${featureName}」が見つかりません`);
      }

      // 【Step 4-3-4-3】機能をクリック
      featureButton.click();
      await wait(2000);

      // 【Step 4-3-4-4】選択確認
      const selectedButton = findElement(SELECTORS.selectedFeatures);
      if (!selectedButton) {
        log.warn(`機能「${featureName}」の選択状態を確認できません`);
      }

      log.info(`機能「${featureName}」を選択しました`);
      return { success: true, selected: featureName };
    } catch (error) {
      log.error("機能選択エラー:", error);
      return { success: false, error: error.message };
    }
  }

  // ========================================
  // Deep Research待機処理
  // ========================================
  async function waitForDeepResearch(startTime) {
    log.debug("【Step 4-3-6-DR】Deep Research専用待機処理");

    const MAX_WAIT = 40 * 60 * 1000; // 40分
    const logDr = (message) => {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      log.info(`[経過: ${elapsedTime}秒] ${message}`);
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Deep Researchが40分以内に完了しませんでした`));
      }, MAX_WAIT);

      let loggingInterval, checkInterval;

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (loggingInterval) clearInterval(loggingInterval);
        if (checkInterval) clearInterval(checkInterval);
      };

      const deepResearchFlow = async () => {
        // 【Step DR-1】初期応答の停止ボタン出現を待機
        logDr("初期応答の停止ボタン出現を待機中...");
        while (!findElement([SELECTORS.stopButton])) {
          if (Date.now() - startTime > 30000) {
            throw new Error("30秒以内に初期応答が開始されませんでした");
          }
          await wait(1000);
        }
        logDr("初期応答の停止ボタンが出現しました");

        // 【Step DR-2】初期応答完了を待ち、リサーチ開始ボタンをクリック
        logDr("初期応答の完了を待機中...");
        while (findElement([SELECTORS.stopButton])) {
          if (Date.now() - startTime > 5 * 60 * 1000) {
            throw new Error("5分以内に初期応答が完了しませんでした");
          }
          await wait(1000);
        }

        const researchButton = findElement([SELECTORS.deepResearchButton]);
        if (!researchButton) {
          throw new Error("「リサーチを開始」ボタンが見つかりませんでした");
        }

        researchButton.click();
        logDr("「リサーチを開始」ボタンをクリックしました");
        await wait(2000);

        // 【Step DR-3】本応答の完了を待つ
        logDr("本応答の完了を待機中...");

        loggingInterval = setInterval(() => {
          const btn = findElement([SELECTORS.stopButton]);
          logDr(`[定期チェック] 停止ボタン: ${btn ? "存在" : "消滅"}`);
        }, 10000);

        // 本応答の停止ボタン出現を待つ
        while (!findElement([SELECTORS.stopButton])) {
          await wait(1000);
        }
        logDr("本応答の停止ボタンが出現しました");

        let lastSeenTime = Date.now();

        checkInterval = setInterval(() => {
          if (findElement([SELECTORS.stopButton])) {
            lastSeenTime = Date.now();
          } else {
            if (Date.now() - lastSeenTime > 10000) {
              logDr("停止ボタンが10秒間表示されません。応答完了とみなします");
              cleanup();
              resolve("Deep Researchの応答が完了しました");
            }
          }
        }, 2000);
      };

      deepResearchFlow().catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  // ========================================
  // タスク実行（拡張版）
  // ========================================
  async function executeTask(taskData) {
    log.info("🚀 【Step 4-3】Gemini タスク実行開始", taskData);

    try {
      const promptText = taskData.prompt || "テストメッセージです";
      const modelName = taskData.model || "";
      const featureName = taskData.function || "";

      // 【Step 4-3-2】テキスト入力
      log.debug("【Step 4-3-2】テキスト入力");
      await inputTextGemini(promptText);

      // 【Step 4-3-3】モデル選択（必要な場合）
      if (modelName && modelName !== "設定なし") {
        const modelResult = await selectModel(modelName);
        if (!modelResult.success && !modelResult.skipped) {
          throw new Error(`モデル選択失敗: ${modelResult.error}`);
        }
      }

      // 【Step 4-3-4】機能選択（必要な場合）
      if (featureName && featureName !== "設定なし") {
        const featureResult = await selectFeature(featureName);
        if (!featureResult.success && !featureResult.skipped) {
          throw new Error(`機能選択失敗: ${featureResult.error}`);
        }
      }

      // 【Step 4-3-5】メッセージ送信
      log.debug("【Step 4-3-5】メッセージ送信");
      await sendMessageGemini();
      const startTime = Date.now();

      // 【Step 4-3-6】応答待機（Deep Research判定）
      log.debug("【Step 4-3-6】応答待機");
      if (featureName === "Deep Research") {
        await waitForDeepResearch(startTime);
      } else {
        await waitForResponseGemini();
      }

      // 【Step 4-3-7】テキスト取得
      log.debug("【Step 4-3-7】テキスト取得");
      const content = await getResponseTextGemini();

      return {
        success: true,
        content: content,
        model: modelName,
        feature: featureName,
      };
    } catch (error) {
      log.error("❌ タスク実行エラー:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ========================================
  // グローバル公開
  // ========================================
  window.GeminiAutomation = {
    executeTask,
    discoverModelsAndFeatures,
    deselectAllFeatures,
    selectModel,
    selectFeature,
    waitForDeepResearch,
    inputTextGemini,
    sendMessageGemini,
    waitForResponseGemini,
    getResponseTextGemini,
    inputToCanvas,
    inputToNormal,
    utils: {
      log,
      wait,
      findElement,
      findElements,
      getCleanText,
    },
  };

  // ========================================
  // Chrome Runtime メッセージリスナー
  // ========================================
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.onMessage
  ) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // ping/pong メッセージへの即座応答（最優先）
      if (
        request.action === "ping" ||
        request.type === "CONTENT_SCRIPT_CHECK"
      ) {
        console.log("🏓 [Gemini] Ping受信、即座にPong応答");
        sendResponse({
          action: "pong",
          status: "ready",
          timestamp: Date.now(),
          scriptLoaded: true,
        });
        return true;
      }

      // テキスト入力欄の存在チェック
      if (request.action === "CHECK_INPUT_FIELD") {
        console.log("🔍 [Gemini] テキスト入力欄の存在チェック開始");
        const selectors = request.selectors || [
          ".ProseMirror",
          ".ql-editor",
          'div[contenteditable="true"]',
          "textarea",
        ];
        let found = false;
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            console.log(`✅ [Gemini] テキスト入力欄を発見: ${selector}`);
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(`⚠️ [Gemini] テキスト入力欄が見つかりません`);
        }
        sendResponse({ found: found });
        return true;
      }

      // executeTask タスクの処理
      if (
        request.action === "executeTask" ||
        request.type === "executeTask" ||
        request.type === "GEMINI_EXECUTE_TASK"
      ) {
        const requestId = Math.random().toString(36).substring(2, 8);
        console.log(`📬 [Gemini] executeTask実行開始 [ID:${requestId}]:`, {
          action: request.action,
          type: request.type,
          automationName: request.automationName,
          hasTask: !!request.task,
          hasTaskData: !!request.taskData,
          taskId: request?.task?.id || request?.taskData?.id,
        });

        (async () => {
          try {
            if (typeof executeTask === "function") {
              console.log(
                `✅ [Gemini] executeTask関数が利用可能 [ID:${requestId}]`,
              );
              const taskToExecute = request.task || request.taskData || request;
              console.log(
                `🚀 [Gemini] executeTask呼び出し前 [ID:${requestId}]:`,
                {
                  taskId: taskToExecute?.id,
                  taskKeys: Object.keys(taskToExecute || {}),
                },
              );
              try {
                const result = await executeTask(taskToExecute);
                console.log(`✅ [Gemini] executeTask完了 [ID:${requestId}]:`, {
                  success: result?.success,
                  hasResult: !!result,
                  resultKeys: result ? Object.keys(result) : [],
                });
                sendResponse({ success: true, result });
              } catch (taskError) {
                console.error(
                  `❌ [Gemini] executeTaskエラー [ID:${requestId}]:`,
                  taskError,
                );
                sendResponse({
                  success: false,
                  error: taskError.message || "executeTask failed",
                  stack: taskError.stack,
                });
              }
            } else {
              console.error(
                `❌ [Gemini] executeTask関数が未定義 [ID:${requestId}]`,
                {
                  requestId: requestId,
                  availableFunctions: {
                    executeTask: typeof executeTask,
                    findElement: typeof findElement,
                    inputTextGemini: typeof inputTextGemini,
                  },
                  timestamp: new Date().toISOString(),
                },
              );
              sendResponse({
                success: false,
                error: "executeTask not available",
                timestamp: new Date().toISOString(),
              });
            }
          } catch (error) {
            console.error(`❌ [Gemini] エラー [ID:${requestId}]:`, error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true; // 非同期レスポンスのために必要
      }

      // その他のメッセージタイプは無視
      console.log(
        `ℹ️ [Gemini] 未対応のメッセージタイプ:`,
        request?.type || request?.action,
      );
    });

    console.log("✅ [Gemini] メッセージリスナー登録完了");
    window.GEMINI_MESSAGE_LISTENER_READY = true;
  }

  log.info("✅ Gemini Automation 準備完了");
})();
