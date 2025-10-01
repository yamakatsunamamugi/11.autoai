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
let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // デフォルト値（簡潔な動作確認用）

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
  // AI待機設定（デフォルト値）
  // ========================================
  let AI_WAIT_CONFIG = {
    MAX_WAIT: 600000, // 10分（通常処理） - 全AI統一
    DEEP_RESEARCH_WAIT: 2400000, // 40分（Deep Research）
    AGENT_MODE_WAIT: 2400000, // 40分（エージェントモード）
    CHECK_INTERVAL: 10000, // 10秒（停止ボタン消滅継続時間）
    SHORT_WAIT: 1000,
    MEDIUM_WAIT: 2000,
  };

  // Chrome Storageから設定を読み込む
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(
      ["responseWaitConfig", "batchProcessingConfig"],
      (result) => {
        if (result.responseWaitConfig) {
          // 回答待機時間設定を適用
          AI_WAIT_CONFIG.MAX_WAIT =
            result.responseWaitConfig.MAX_RESPONSE_WAIT_TIME ||
            AI_WAIT_CONFIG.MAX_WAIT;
          AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT =
            result.responseWaitConfig.MAX_RESPONSE_WAIT_TIME_DEEP ||
            AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT;
          AI_WAIT_CONFIG.AGENT_MODE_WAIT =
            result.responseWaitConfig.MAX_RESPONSE_WAIT_TIME_AGENT ||
            AI_WAIT_CONFIG.AGENT_MODE_WAIT;
          AI_WAIT_CONFIG.CHECK_INTERVAL =
            result.responseWaitConfig.STOP_CHECK_INTERVAL ||
            AI_WAIT_CONFIG.CHECK_INTERVAL;

          log.info("⏱️ [Gemini] 回答待機時間設定を適用:", {
            通常モード: AI_WAIT_CONFIG.MAX_WAIT / 60000 + "分",
            DeepResearch: AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 60000 + "分",
            エージェント: AI_WAIT_CONFIG.AGENT_MODE_WAIT / 60000 + "分",
            Stop確認間隔: AI_WAIT_CONFIG.CHECK_INTERVAL / 1000 + "秒",
          });
        }

        if (result.batchProcessingConfig) {
          // バッチ処理設定から回答待機時間設定も読み込み（互換性のため）
          if (!result.responseWaitConfig) {
            AI_WAIT_CONFIG.MAX_WAIT =
              result.batchProcessingConfig.MAX_RESPONSE_WAIT_TIME ||
              AI_WAIT_CONFIG.MAX_WAIT;
            AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT =
              result.batchProcessingConfig.MAX_RESPONSE_WAIT_TIME_DEEP ||
              AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT;
            AI_WAIT_CONFIG.AGENT_MODE_WAIT =
              result.batchProcessingConfig.MAX_RESPONSE_WAIT_TIME_AGENT ||
              AI_WAIT_CONFIG.AGENT_MODE_WAIT;
            AI_WAIT_CONFIG.CHECK_INTERVAL =
              result.batchProcessingConfig.STOP_CHECK_INTERVAL ||
              AI_WAIT_CONFIG.CHECK_INTERVAL;
          }
        }
      },
    );
  }

  // windowレベルでも公開（後方互換性）
  window.AI_WAIT_CONFIG = AI_WAIT_CONFIG;

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

    // 機能ボタン（修正版）
    toolboxButton: 'button[aria-label="ツール"] mat-icon[fonticon="page_info"]',
    toolboxButtonParent: 'button[aria-label="ツール"]',
    featureMenuItems: "toolbox-drawer-item > button",
    featureLabel: ".label, .gds-label-l",
    mainButtons: "toolbox-drawer-item > button",
    moreButton: 'button[aria-label="その他"]',
    selectedFeatures: [
      ".toolbox-drawer-item-button button.is-selected",
      ".toolbox-drawer-button.has-selected-item",
    ],

    // Canvas関連
    canvasEditor: ["immersive-editor", ".immersive-editor"],

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
    stopButton: [
      "button.send-button.stop",
      'button[aria-label="停止"]',
      'button[aria-label*="Stop"]',
      ".send-button.stop",
    ],

    // Deep Research
    deepResearchButton: 'button[data-test-id="confirm-button"]',

    // レスポンス
    canvasResponse: "immersive-editor .ProseMirror", // Canvas応答は immersive-editor 内
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

    // 【Step 4-3-1-4】機能探索（修正版）
    try {
      const featureNames = new Set();

      // ツールボタンを見つける
      const toolboxButton = findElement(SELECTORS.toolboxButtonParent);
      if (toolboxButton) {
        log.info("ツールボタン発見、クリック実行");
        toolboxButton.click();
        await wait(1500);

        // メニューが開いたらアイテムを取得
        const menuItems = findElements(SELECTORS.featureMenuItems);
        log.info(`メニューアイテム数: ${menuItems.length}`);

        menuItems.forEach((item) => {
          const text = getCleanText(item);
          log.info(`機能候補: ${text}`);
          if (text && text !== "その他") {
            featureNames.add(text);
          }
        });

        // メニューを閉じる
        const overlay = document.querySelector(SELECTORS.overlay);
        if (overlay) overlay.click();
        await wait(500);
      } else {
        log.warn("ツールボタンが見つかりませんでした");
      }

      window.availableFeatures = Array.from(featureNames).filter(Boolean);
      log.info(
        `機能探索完了: ${window.availableFeatures.length}個の機能を発見`,
      );
      log.info(`発見した機能: ${window.availableFeatures.join(", ")}`);
    } catch (e) {
      log.error("機能探索エラー: " + e.message);
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
    const maxWaitTime = AI_WAIT_CONFIG.MAX_WAIT; // 設定から取得

    log.debug("応答待機を開始します...");

    // 最初は通常モードとして処理を開始
    let elapsedTime = 0;
    const checkInterval = 1000;
    let hasPartialContent = false;
    let isCanvasMode = false;

    // 通常モードの監視を開始
    log.debug("停止ボタン監視を開始...");

    while (elapsedTime < maxWaitTime) {
      await wait(checkInterval);
      elapsedTime += checkInterval;

      // Canvas（immersive-editor）が出現したかチェック
      if (!isCanvasMode) {
        const canvasResponse = document.querySelector(SELECTORS.canvasResponse);
        if (canvasResponse) {
          // Canvasモードに切り替え
          isCanvasMode = true;
          log.debug("🎨 Canvasモード検出！テキスト監視に切り替えます");

          // Canvasモードの処理を開始
          return await waitForCanvasResponse(elapsedTime, maxWaitTime);
        }
      }

      // 通常モード: 停止ボタンの確認
      const stopButton = findElement(SELECTORS.stopButton);

      // 部分的な結果があるかチェック
      const responseElements = document.querySelectorAll(
        SELECTORS.normalResponse,
      );
      if (responseElements.length > 0) {
        const latestResponse = responseElements[responseElements.length - 1];
        if (latestResponse && latestResponse.textContent.trim()) {
          hasPartialContent = true;
        }
      }

      if (!stopButton) {
        log.debug("応答が完了しました（停止ボタンが消えました）");
        return { success: true, partial: false, timeout: false };
      }

      if (elapsedTime % 10000 === 0) {
        log.debug(`応答待機中... (${elapsedTime / 1000}秒経過)`);
      }
    }

    // タイムアウト時の処理
    if (hasPartialContent) {
      log.warn(
        `タイムアウトしましたが、部分的な結果を保存します（${maxWaitTime / 60000}分経過）`,
      );
      return { success: true, partial: true, timeout: true };
    } else {
      throw new Error(
        `Geminiの応答がタイムアウトしました（${maxWaitTime / 60000}分）`,
      );
    }
  }

  // Canvasモード専用の待機処理
  async function waitForCanvasResponse(initialElapsedTime, maxWaitTime) {
    log.debug("Canvasモード: 初期待機15秒...");
    await wait(15000); // Canvas表示を待つ

    log.debug("Canvasモード: テキスト生成の監視を開始します");

    let lastLength = -1;
    let lastChangeTime = Date.now();
    let elapsedTime = initialElapsedTime + 15000; // 既に経過した時間 + 初期待機
    let hasPartialContent = false;

    return new Promise((resolve, reject) => {
      const monitor = setInterval(() => {
        elapsedTime += 2000;

        // Canvas応答を immersive-editor 内から探す
        const currentEditor = document.querySelector(SELECTORS.canvasResponse);
        if (!currentEditor) {
          // まだテキストが生成されていない場合は続行
          log.debug("[Canvas監視] テキスト生成待機中...");

          // タイムアウトチェック
          if (elapsedTime >= maxWaitTime) {
            clearInterval(monitor);
            reject(
              new Error(
                `Geminiの応答がタイムアウトしました（${maxWaitTime / 60000}分）`,
              ),
            );
          }
          return;
        }

        const currentLength = currentEditor.textContent.length;
        log.debug(`[Canvas監視] 現在の文字数: ${currentLength}`);

        // 部分的な結果があるかチェック
        if (currentLength > 0) {
          hasPartialContent = true;
        }

        if (currentLength > lastLength) {
          lastLength = currentLength;
          lastChangeTime = Date.now();
        }

        // タイムアウトチェック
        if (elapsedTime >= maxWaitTime) {
          clearInterval(monitor);

          // 部分的な結果がある場合は成功として返す
          if (hasPartialContent) {
            log.warn(
              `タイムアウトしましたが、部分的な結果を保存します（${maxWaitTime / 60000}分経過、${currentLength}文字取得済み）`,
            );
            resolve({ success: true, partial: true, timeout: true });
          } else {
            reject(
              new Error(
                `Geminiの応答がタイムアウトしました（${maxWaitTime / 60000}分）`,
              ),
            );
          }
          return;
        }

        // UI設定秒数間変化がなければ完了とみなす
        if (Date.now() - lastChangeTime > AI_WAIT_CONFIG.CHECK_INTERVAL) {
          clearInterval(monitor);
          log.debug(
            `${AI_WAIT_CONFIG.CHECK_INTERVAL / 1000}秒間テキストの更新がなかったため、応答完了と判断`,
          );
          resolve({ success: true, partial: false, timeout: false });
        }
      }, 2000); // 2秒ごとに監視
    });
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

      // Canvasモードの特別処理
      if (featureName === "Canvas") {
        // Canvas選択はボタンクリックで完了
        // 編集画面はメッセージ送信後に表示されるため、ここでは確認不要
        log.info(`📊 機能選択後確認 - Canvasモードが選択されました`);
        return { success: true, selected: featureName };
      }

      // 通常の機能ボタンの確認
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
        // Canvas以外で選択が確認できない場合
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

    const MAX_WAIT = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT; // 設定から取得
    const logDr = (message) => {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      log.info(`[経過: ${elapsedTime}秒] ${message}`);
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Deep Researchが${MAX_WAIT / 60000}分以内に完了しませんでした`,
          ),
        );
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
        const initialWaitTime = AI_WAIT_CONFIG.MAX_WAIT; // 通常モードの待機時間を使用
        while (findElement([SELECTORS.stopButton])) {
          if (Date.now() - startTime > initialWaitTime) {
            throw new Error(
              `${initialWaitTime / 60000}分以内に初期応答が完了しませんでした`,
            );
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
            if (Date.now() - lastSeenTime > AI_WAIT_CONFIG.CHECK_INTERVAL) {
              logDr(
                `停止ボタンが${AI_WAIT_CONFIG.CHECK_INTERVAL / 1000}秒間表示されません。応答完了とみなします`,
              );
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

    // taskIdを最初に定義（スコープ全体で利用可能にする）
    const taskId = taskData.taskId || taskData.id || "UNKNOWN_TASK_ID";
    const MAX_RETRIES = 3; // 最大リトライ回数
    let lastError = null;
    let partialResult = null;

    // リトライループ
    for (let retryCount = 0; retryCount < MAX_RETRIES; retryCount++) {
      if (retryCount > 0) {
        log.info(
          `🔄 [Gemini] リトライ ${retryCount}/${MAX_RETRIES - 1} を実行中`,
        );
        await wait(5000); // リトライ前に5秒待機
      }

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
        const featureName = taskData.function || ""; // feature → function に修正

        // 🔍 [DEBUG] タスクデータの詳細確認
        log.debug("📋 [Gemini Debug] TaskData詳細:", {
          model: modelName,
          feature: featureName,
          hasModel: !!modelName,
          hasFeature: !!featureName,
          modelType: typeof modelName,
          featureType: typeof featureName,
          taskDataKeys: taskData ? Object.keys(taskData) : [],
        });

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
        }

        // 【Step 4-3-5】メッセージ送信
        try {
          await sendMessageGemini();

          // 送信時刻を記録
          const sendTime = new Date();

          // モデルと機能を取得
          const modelName_current = modelName || "不明";
          const featureName_var = featureName || "通常";

          // background.jsに送信時刻を記録
          if (chrome.runtime && chrome.runtime.sendMessage) {
            const messageToSend = {
              type: "recordSendTime",
              taskId: taskId,
              sendTime: sendTime.toISOString(),
              taskInfo: {
                aiType: "Gemini",
                model: modelName_current,
                function: featureName_var,
                // URLは応答完了時に取得するため、ここでは記録しない（Claudeと同じ）
                cellInfo: taskData.cellInfo,
              },
              logCell: taskData.logCell,
            };

            // Promise化してタイムアウト処理を追加
            const sendMessageWithTimeout = () => {
              return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                  console.warn("⚠️ [Gemini] 送信時刻記録タイムアウト");
                  resolve(null);
                }, 5000); // 5秒でタイムアウト

                try {
                  // 拡張機能のコンテキストが有効か確認
                  if (!chrome.runtime?.id) {
                    console.warn(
                      "⚠️ [Gemini] 拡張機能のコンテキストが無効です",
                    );
                    clearTimeout(timeout);
                    resolve(null);
                    return;
                  }

                  chrome.runtime.sendMessage(messageToSend, (response) => {
                    clearTimeout(timeout);
                    // エラーチェックを先に行う
                    if (chrome.runtime.lastError) {
                      // ポートが閉じられたエラーは警告レベルに留める
                      if (
                        chrome.runtime.lastError.message.includes("port closed")
                      ) {
                        console.warn(
                          "⚠️ [Gemini] メッセージポートが閉じられました（送信は成功している可能性があります）",
                        );
                      } else {
                        console.warn(
                          "⚠️ [Gemini] 送信時刻記録エラー:",
                          chrome.runtime.lastError.message,
                        );
                      }
                      resolve(null);
                    } else if (response) {
                      console.log("✅ [Gemini] 送信時刻記録成功", response);
                      resolve(response);
                    } else {
                      // レスポンスがnullの場合
                      console.warn("⚠️ [Gemini] 送信時刻記録: レスポンスなし");
                      resolve(null);
                    }
                  });
                } catch (error) {
                  clearTimeout(timeout);
                  console.error("❌ [Gemini] 送信時刻記録失敗:", error);
                  resolve(null);
                }
              });
            };

            // 非同期で実行（ブロックしない）
            sendMessageWithTimeout();
          }
        } catch (sendError) {
          console.error(`❌ [Gemini Step 5] メッセージ送信エラー:`, sendError);
          throw sendError;
        }
        const startTime = Date.now();

        // 【Step 4-3-6】応答待機（Deep Research判定）
        let responseResult;
        let isPartialResult = false;

        try {
          if (featureName === "Deep Research") {
            responseResult = await waitForDeepResearch(startTime);
          } else {
            responseResult = await waitForResponseGemini();
          }

          // 結果の形式を確認
          if (responseResult && typeof responseResult === "object") {
            isPartialResult = responseResult.partial || false;
            if (responseResult.timeout && responseResult.partial) {
              log.warn(
                `⚠️ [Gemini] タイムアウトしましたが、部分的な結果を処理します`,
              );
            }
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
          // 部分的な結果の場合はエラーを許容
          if (isPartialResult) {
            console.warn(
              `⚠️ [Gemini Step 7] 部分的な結果の取得を試みます:`,
              getTextError,
            );
            content = "[タイムアウトによる部分的な応答]";
          } else {
            console.error(
              `❌ [Gemini Step 7] テキスト取得エラー:`,
              getTextError,
            );
            throw getTextError;
          }
        }

        // 【Step 4-3-8】結果オブジェクト作成

        const result = {
          success: true,
          content: content,
          model: modelName,
          feature: featureName,
          partial: isPartialResult,
        };

        // ✅ タスク完了時刻をスプレッドシートに記録（Claude/ChatGPTと統一）
        try {
          // 会話URLの取得を待つ（GeminiではURLが変化する場合がある）
          let conversationUrl = window.location.href;

          // GeminiでもURLが更新されるまで少し待つ
          // 例： /app から /app/xxx への変更を待つ
          const startUrl = conversationUrl;
          let attempts = 0;
          const maxAttempts = 10; // 最大5秒待つ（500ms x 10）

          while (attempts < maxAttempts) {
            await wait(500);
            conversationUrl = window.location.href;

            // URLが変更されたら終了
            if (conversationUrl !== startUrl) {
              log.debug(`🔗 [Gemini] URLが更新されました: ${conversationUrl}`);
              break;
            }

            attempts++;
          }

          // URLが変更されなくても現在のURLを使用
          if (attempts === maxAttempts) {
            log.debug(
              `ℹ️ [Gemini] URL変更なし、現在のURLを使用: ${conversationUrl}`,
            );
          }

          // Promise化してエラーハンドリングを改善
          const sendCompletionMessage = () => {
            return new Promise((resolve) => {
              const timeout = setTimeout(() => {
                log.warn("⚠️ recordCompletionTime送信タイムアウト");
                resolve(null);
              }, 5000);

              chrome.runtime.sendMessage(
                {
                  type: "recordCompletionTime",
                  taskId: taskId,
                  completionTime: new Date().toISOString(),
                  taskInfo: {
                    aiType: "Gemini",
                    model: modelName,
                    function: featureName,
                    url: conversationUrl, // 取得した会話URLを使用
                  },
                },
                (response) => {
                  clearTimeout(timeout);
                  if (!chrome.runtime.lastError) {
                    log.debug(
                      "✅ recordCompletionTime送信完了:",
                      taskId,
                      "URL:",
                      conversationUrl,
                    );
                  }
                  resolve(response);
                },
              );
            });
          };

          await sendCompletionMessage();
        } catch (error) {
          log.warn("⚠️ recordCompletionTime送信エラー:", error);
        }

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
        lastError = error;
        log.error(
          `❌ タスク実行エラー (リトライ ${retryCount}/${MAX_RETRIES - 1}):`,
          error,
        );

        // 部分的な結果を保存
        try {
          const tempContent = await getResponseTextGemini();
          if (tempContent && tempContent.trim()) {
            partialResult = tempContent;
            log.info("💾 [Gemini] 部分的な結果を保存しました");
          }
        } catch (e) {
          // 部分的な結果の取得に失敗
        }

        // リトライ可能なエラーか判定
        if (retryCount === MAX_RETRIES - 1 || !isRetryableError(error)) {
          // 部分的な結果がある場合はそれを返す
          if (partialResult) {
            log.warn(
              "⚠️ [Gemini] エラーが発生しましたが、部分的な結果を返します",
            );
            return {
              success: true,
              content: partialResult,
              partial: true,
              error: error.message,
            };
          }

          return {
            success: false,
            error: error.message,
          };
        }
      }
    }

    // すべてのリトライが失敗した場合
    if (partialResult) {
      log.warn(
        "⚠️ [Gemini] すべてのリトライが失敗しましたが、部分的な結果を返します",
      );
      return {
        success: true,
        content: partialResult,
        partial: true,
        error: lastError ? lastError.message : "リトライ失敗",
      };
    }

    return {
      success: false,
      error: lastError ? lastError.message : "すべてのリトライが失敗しました",
    };
  }

  // リトライ可能なエラーか判定
  function isRetryableError(error) {
    const retryableErrors = [
      "タイムアウト",
      "timeout",
      "ネットワーク",
      "network",
      "一時的",
      "temporary",
      "停止ボタン",
      "応答待機",
    ];

    const errorMessage = (error.message || "").toLowerCase();
    return retryableErrors.some((keyword) => errorMessage.includes(keyword));
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
