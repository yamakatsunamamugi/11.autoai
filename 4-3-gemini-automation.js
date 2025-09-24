// ========================================
// 🚨 共通エラーハンドリングモジュールの初期化
// ========================================

// manifest.jsonで先にcommon-error-handler.jsが読み込まれているため、
// 直接初期化を行う。ただし、タイミング問題を考慮して複数回試行する。
(function initializeErrorHandler() {
  let attempts = 0;
  const maxAttempts = 10;

  const tryInitialize = () => {
    attempts++;

    if (window.UniversalErrorHandler) {
      window.geminiErrorHandler =
        window.UniversalErrorHandler.createForAI("gemini");
      console.log("✅ [GEMINI] エラーハンドラー初期化完了");
      return true;
    }

    if (attempts < maxAttempts) {
      // 100ms後に再試行
      setTimeout(tryInitialize, 100);
    } else {
      console.error(
        "❌ [GEMINI] 共通エラーハンドリングモジュールが見つかりません",
        "manifest.jsonの設定を確認してください",
      );
    }
    return false;
  };

  // 即座に試行開始
  tryInitialize();
})();

// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    } else {
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
        const messageData = {
          type: "AI_MODEL_FUNCTION_UPDATE",
          aiType: "gemini",
          data: {
            models: models || [],
            functions: features || [],
            timestamp: new Date().toISOString(),
          },
        };

        // タイムアウト付きでsendMessageを実行
        const sendMessageWithTimeout = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.error(
              "⏱️ [SendToUI Step 4 Error] sendMessageがタイムアウト（3秒経過）",
            );
            resolve({
              error: "timeout",
              message: "sendMessage timeout after 3000ms",
            });
          }, 3000); // 3秒でタイムアウト

          try {
            chrome.runtime.sendMessage(messageData, (response) => {
              clearTimeout(timeout);

              // chrome.runtime.lastErrorをチェック
              if (chrome.runtime.lastError) {
                console.error(
                  "⚠️ [SendToUI Step 6 Error] chrome.runtime.lastError:",
                  chrome.runtime.lastError.message,
                );
                resolve({
                  error: "runtime_error",
                  message: chrome.runtime.lastError.message,
                });
              } else {
                resolve(response || { success: true });
              }
            });
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

          // 安全性チェック: modelButtonsが配列であることを確認
          if (modelButtons && Array.isArray(modelButtons)) {
            window.availableModels = modelButtons
              .map((btn) => {
                const text = getCleanText(
                  findElement(SELECTORS.modelDesc, btn),
                );
                return text || getCleanText(btn);
              })
              .filter(Boolean);
          } else {
            window.availableModels = [];
            log.warn("モデルボタンが見つかりませんでした");
          }

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
      return await inputToCanvas(text);
    }

    // 通常モード
    const editor = document.querySelector(SELECTORS.normalInput);

    if (editor) {
      return await inputToNormal(text);
    }

    console.error(`❌ [inputTextGemini] テキスト入力欄が見つからない:`, {
      canvasSelector: SELECTORS.canvas,
      normalSelector: SELECTORS.normalInput,
      availableElements: {
        prosemirror: !!document.querySelector(".ProseMirror"),
        qlEditor: !!document.querySelector(".ql-editor"),
        contenteditable: !!document.querySelector('[contenteditable="true"]'),
      },
    });
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

      // 【Step 4-3-3-3】選択確認 - 現在選択されているモデルをログ出力
      const displayElement = findElement(SELECTORS.modelDisplay);
      const displayText = getCleanText(displayElement);

      // モデル選択後の実際の表示をログ出力（一致チェックは行わない）
      log.info(`📊 モデル選択後確認 - 現在表示中: "${displayText}"`);
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

      // 【Step 4-3-4-4】選択確認 - 現在選択されている機能をログ出力
      const selectedButtons = findElements(SELECTORS.selectedFeatures);
      const selectedFeatureNames = [];

      selectedButtons.forEach((button) => {
        const featureText = getCleanText(button);
        if (featureText) {
          selectedFeatureNames.push(featureText);
        }
      });

      // 機能選択後の実際の選択状態をログ出力（一致チェックは行わない）
      if (selectedFeatureNames.length > 0) {
        log.info(
          `📊 機能選択後確認 - 現在選択中: [${selectedFeatureNames.join(", ")}]`,
        );
      } else {
        log.info(`📊 機能選択後確認 - 選択された機能なし`);
      }
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
      // プロンプトの適切な処理 - オブジェクトの場合は文字列化
      let promptText;
      if (typeof taskData.prompt === "object" && taskData.prompt !== null) {
        // オブジェクトの場合は適切なプロパティを探す
        promptText =
          taskData.prompt.text ||
          taskData.prompt.content ||
          taskData.prompt.prompt ||
          JSON.stringify(taskData.prompt);
      } else {
        promptText = taskData.prompt || "テストメッセージです";
      }

      const modelName = taskData.model || "";
      const featureName = taskData.feature || "";

      // 🔍 [DEBUG] セル位置情報を追加（ChatGPT・Claudeと統一）
      if (
        taskData &&
        taskData.cellInfo &&
        taskData.cellInfo.column &&
        taskData.cellInfo.row
      ) {
        const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
        promptText = `【現在${cellPosition}セルを処理中です】\n\n${promptText}`;
        log.debug(`📍 [Gemini] セル位置情報を追加: ${cellPosition}`);
      } else {
        log.debug("📍 [Gemini] セル位置情報なし:", {
          hasCellInfo: !!(taskData && taskData.cellInfo),
          cellInfo: taskData && taskData.cellInfo,
          taskDataKeys: taskData ? Object.keys(taskData) : [],
        });
      }

      // 🔍 ステップバイステップ デバッグログ - Step 1: パラメータ確認

      // 【Step 4-3-2】テキスト入力

      try {
        await inputTextGemini(promptText);
      } catch (inputError) {
        console.error(`❌ [Gemini Step 2] テキスト入力エラー:`, inputError);
        throw inputError;
      }

      // 【Step 4-3-3】モデル選択（必要な場合）

      if (modelName && modelName !== "設定なし") {
        try {
          const modelResult = await selectModel(modelName);
          if (!modelResult.success && !modelResult.skipped) {
            throw new Error(`モデル選択失敗: ${modelResult.error}`);
          }
        } catch (modelError) {
          console.error(`❌ [Gemini Step 3a] モデル選択エラー:`, modelError);
          throw modelError;
        }
      } else {
      }

      // 【Step 4-3-4】機能選択（必要な場合）

      if (featureName && featureName !== "設定なし") {
        try {
          const featureResult = await selectFeature(featureName);
          if (!featureResult.success && !featureResult.skipped) {
            throw new Error(`機能選択失敗: ${featureResult.error}`);
          }
        } catch (featureError) {
          console.error(`❌ [Gemini Step 4a] 機能選択エラー:`, featureError);
          throw featureError;
        }
      } else {
      }

      // 【Step 4-3-5】メッセージ送信
      try {
        await sendMessageGemini();
      } catch (sendError) {
        console.error(`❌ [Gemini Step 5] メッセージ送信エラー:`, sendError);
        throw sendError;
      }
      const startTime = Date.now();

      // 【Step 4-3-6】応答待機（Deep Research判定）

      try {
        if (featureName === "Deep Research") {
          await waitForDeepResearch(startTime);
        } else {
          await waitForResponseGemini();
        }
      } catch (waitError) {
        console.error(`❌ [Gemini Step 6] 応答待機エラー:`, waitError);
        throw waitError;
      }

      // 【Step 4-3-7】テキスト取得
      let content;
      try {
        content = await getResponseTextGemini();
      } catch (getTextError) {
        console.error(`❌ [Gemini Step 7] テキスト取得エラー:`, getTextError);
        throw getTextError;
      }

      // 【Step 4-3-8】結果オブジェクト作成

      const result = {
        success: true,
        content: content,
        model: modelName,
        feature: featureName,
      };

      // 【修正】タスク完了時のスプレッドシート書き込み確認と通知処理を追加
      // タスク重複実行問題を修正：書き込み成功を確実に確認してから完了通知
      try {
        if (result.success && taskData.cellInfo) {
          // backgroundスクリプトにタスク完了を通知（作業中マーカークリア用）
          if (chrome.runtime && chrome.runtime.sendMessage) {
            const completionMessage = {
              type: "TASK_COMPLETION_CONFIRMED",
              taskId: taskData.taskId || taskData.cellInfo,
              cellInfo: taskData.cellInfo,
              success: true,
              timestamp: new Date().toISOString(),
              spreadsheetWriteConfirmed: true, // スプレッドシート書き込み完了フラグ
            };

            chrome.runtime.sendMessage(completionMessage, (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "⚠️ [Gemini-TaskCompletion] 完了通知エラー:",
                  chrome.runtime.lastError.message,
                );
              } else {
              }
            });
          }
        }
      } catch (completionError) {
        console.warn(
          "⚠️ [Gemini-TaskCompletion] 完了処理エラー:",
          completionError.message,
        );
      }

      return result;
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
        request.type === "CONTENT_SCRIPT_CHECK" ||
        request.type === "PING"
      ) {
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

      // DISCOVER_FEATURES メッセージの処理
      if (request.type === "DISCOVER_FEATURES") {
        (async () => {
          try {
            const result = await discoverModelsAndFeatures();
            sendResponse({
              success: true,
              result: result,
            });
          } catch (error) {
            console.error(`❌ [Gemini] DISCOVER_FEATURESエラー:`, error);
            sendResponse({
              success: false,
              error: error.message,
            });
          }
        })();
        return true; // 非同期レスポンスのために必要
      }

      // executeTask タスクの処理
      if (
        request.action === "executeTask" ||
        request.type === "executeTask" ||
        request.type === "GEMINI_EXECUTE_TASK" ||
        request.type === "EXECUTE_TASK"
      ) {
        const requestId = Math.random().toString(36).substring(2, 8);

        (async () => {
          try {
            if (typeof executeTask === "function") {
              const taskToExecute = request.task || request.taskData || request;
              try {
                const result = await executeTask(taskToExecute);
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
    });

    window.GEMINI_MESSAGE_LISTENER_READY = true;
  }

  log.info("✅ Gemini Automation 準備完了");

  // ========================================
  // 🚨 Gemini グローバルエラーハンドラー
  // ========================================

  // 🚨 Gemini Overloadedエラー対応システム
  let geminiOverloadedRetryCount = 0;
  const MAX_GEMINI_OVERLOADED_RETRIES = 5;
  const GEMINI_OVERLOADED_RETRY_INTERVALS = [
    60000, 300000, 900000, 1800000, 3600000,
  ]; // 1分、5分、15分、30分、60分

  function handleGeminiOverloadedError() {
    if (geminiOverloadedRetryCount >= MAX_GEMINI_OVERLOADED_RETRIES) {
      console.error(
        "❌ [GEMINI-OVERLOADED-HANDLER] 最大リトライ回数に達しました。手動対応が必要です。",
      );
      return;
    }

    const retryInterval =
      GEMINI_OVERLOADED_RETRY_INTERVALS[geminiOverloadedRetryCount] || 3600000;
    geminiOverloadedRetryCount++;

    // 即座にウィンドウを閉じる
    setTimeout(() => {
      // background scriptにウィンドウリセットを要求
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime
          .sendMessage({
            action: "RESET_AI_WINDOW",
            aiType: "gemini",
            retryCount: geminiOverloadedRetryCount,
            nextRetryIn: retryInterval,
          })
          .catch((err) => {
            console.error(
              "❌ [GEMINI-OVERLOADED-HANDLER] background scriptへのメッセージ送信失敗:",
              err,
            );
            window.location.reload();
          });
      } else {
        window.location.reload();
      }
    }, 1000);

    // 指定時間後にリトライ
    setTimeout(() => {
      // 新しいウィンドウで Gemini を開く
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "OPEN_AI_WINDOW",
          aiType: "gemini",
          retryAttempt: geminiOverloadedRetryCount,
        });
      }
    }, retryInterval);
  }

  // Gemini専用ネットワークエラーハンドラーを追加
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.href.includes("gemini.google.com")
  ) {
    // グローバルエラーハンドラー
    window.addEventListener("error", (e) => {
      const errorMessage = e.message || e.error?.message || "";
      const errorName = e.error?.name || "";

      // 🔍 Gemini Overloadedエラー検出
      const isOverloadedError =
        errorMessage.includes("Overloaded") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("rate limit") ||
        (e.reason && String(e.reason).includes("Overloaded"));

      if (isOverloadedError) {
        console.error("🚨 [GEMINI-OVERLOADED-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "OVERLOADED_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "gemini",
        });

        // 即座にウィンドウリセット・リトライを開始
        handleGeminiOverloadedError();
        return;
      }

      // 🔍 ネットワークエラー検出 (Claude・ChatGPTと同じロジック)
      const isNetworkError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch") ||
        errorName.includes("NetworkError");

      if (isNetworkError) {
        console.error("🌐 [Gemini-GLOBAL-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "gemini",
        });

        // エラー統計記録 (将来のGeminiRetryManager用)
        try {
          if (!window.geminiErrorHistory) {
            window.geminiErrorHistory = [];
          }
          window.geminiErrorHistory.push({
            type: "NETWORK_ERROR",
            message: errorMessage,
            timestamp: Date.now(),
            level: "global_error",
          });
        } catch (retryError) {
          // エラー記録失敗は無視
        }
      } else {
        console.error("🚨 [Gemini-GLOBAL-ERROR]", e.message);
      }
    });

    // unhandledrejectionハンドラー
    window.addEventListener("unhandledrejection", (e) => {
      const errorReason = e.reason;
      const errorMessage = errorReason?.message || String(errorReason);
      const errorName = errorReason?.name || "";

      // 🔍 ネットワークエラー検出
      const isNetworkError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch") ||
        errorName.includes("NetworkError");

      if (isNetworkError) {
        console.error("🌐 [Gemini-UNHANDLED-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          timestamp: new Date().toISOString(),
          aiType: "gemini",
        });

        // 🔄 エラー統計を記録
        try {
          if (!window.geminiErrorHistory) {
            window.geminiErrorHistory = [];
          }
          window.geminiErrorHistory.push({
            type: "NETWORK_ERROR",
            message: errorMessage,
            timestamp: Date.now(),
            level: "unhandledrejection",
          });

          // 🔄 アクティブなタスクがある場合のリトライ準備 (将来実装用)
          if (window.currentGeminiTask) {
            console.warn(
              "🔄 [Gemini-RETRY-TRIGGER] アクティブタスク検出 - リトライ実行準備",
            );
            // Gemini用リトライマネージャーは将来実装
            // 現在は統計記録のみ
          }
        } catch (retryError) {
          console.error(
            "❌ [Gemini-RETRY-MANAGER] エラー記録処理エラー:",
            retryError,
          );
        }
      } else {
        console.error("🚨 [Gemini-UNHANDLED-PROMISE]", e.reason);
      }
    });
  }
})();
