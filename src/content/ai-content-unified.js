/**
 * @fileoverview 統合AIコンテンツスクリプト - 11.autoai版
 * 将来的な拡張性を考慮したモジュラー設計
 * ChatGPT/Claude/Gemini対応
 */

// ========================================
// 初期化とAI種別検出
// ========================================

// UI_SELECTORSの読み込み状態を管理
let UI_SELECTORS_LOADED = false;
let UI_SELECTORS_PROMISE = null;
let retryManager = null; // RetryManagerインスタンス
let autoFollowupHandler = null; // AutoFollowupHandlerインスタンス

// AutoFollowupHandlerの初期化（同期的）
function initializeAutoFollowupHandler() {
  if (autoFollowupHandler) return autoFollowupHandler;
  
  // AutoFollowupHandlerは既にmanifest.jsonのcontent_scriptsで読み込み済み
  if (typeof window.AutoFollowupHandler === 'function') {
    console.log('✅ [11.autoai] AutoFollowupHandlerを初期化しました');
    autoFollowupHandler = new window.AutoFollowupHandler({
      enabled: true,
      debug: true,
      maxFollowups: 3
    });
    return autoFollowupHandler;
  } else {
    console.warn('⚠️ [11.autoai] AutoFollowupHandlerクラスが見つかりません');
    return null;
  }
}

// RetryManagerの初期化（同期的）
function initializeRetryManager() {
  if (retryManager) return retryManager;
  
  // RetryManagerは既にmanifest.jsonのcontent_scriptsで読み込み済み
  if (typeof window.RetryManager === 'function') {
    console.log('✅ [11.autoai] RetryManagerを初期化しました');
    retryManager = new window.RetryManager({
      maxRetries: 3,
      retryDelay: 5000,
      debugMode: true
    });
    
    // executeTask関数を上書き
    retryManager.executeTask = async (taskConfig) => {
      return await executeTaskInternal(taskConfig);
    };
    
    return retryManager;
  } else {
    console.error('❌ [11.autoai] RetryManagerクラスが見つかりません');
    return null;
  }
}

// 内部タスク実行関数
async function executeTaskInternal(taskConfig) {
  const { taskId, prompt, aiType, enableDeepResearch, specialMode, timeout } = taskConfig;
  
  try {
    // プロンプト送信
    const sendResult = await sendPromptToAI(prompt, {
      model: null,
      specialOperation: specialMode,
      aiType: aiType || AI_TYPE,
      taskId
    });
    
    if (!sendResult || !sendResult.success) {
      return {
        success: false,
        error: 'SEND_FAILED',
        errorMessage: sendResult?.error || 'プロンプト送信失敗',
        needsRetry: true
      };
    }
    
    // 応答待機（改良版のwaitForResponseを使用）
    const waitResult = await waitForResponseEnhanced(enableDeepResearch, timeout);
    
    if (!waitResult.success) {
      return waitResult; // エラー情報をそのまま返す
    }
    
    // 応答取得
    const response = await getResponseWithCanvas();
    
    if (!response || response.trim().length === 0) {
      return {
        success: false,
        error: 'EMPTY_RESPONSE',
        errorMessage: '空のレスポンスを受信しました',
        needsRetry: true
      };
    }
    
    return {
      success: true,
      response: response,
      taskId: taskId,
      aiType: aiType || AI_TYPE
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      errorMessage: error.message,
      needsRetry: true
    };
  }
}

// 拡張された応答待機関数
async function waitForResponseEnhanced(enableDeepResearch = false, customTimeout = null) {
  const timeout = customTimeout || (enableDeepResearch ? 3600000 : 600000);
  
  // AIHandlerが利用可能な場合
  if (window.AIHandler && window.AIHandler.message && window.AIHandler.message.waitForResponse) {
    const result = await window.AIHandler.message.waitForResponse(null, {
      timeout: timeout,
      extendedTimeout: enableDeepResearch ? timeout : 30 * 60 * 1000,
      sendStartTime: Date.now()
    }, AI_TYPE);
    
    // 新しい形式の戻り値に対応
    if (typeof result === 'object' && result !== null) {
      return result;
    }
    
    // 旧形式（boolean）の場合は変換
    return {
      success: result === true,
      error: result ? null : 'TIMEOUT_NO_RESPONSE',
      errorMessage: result ? null : '応答待機がタイムアウトしました',
      needsRetry: !result
    };
  }
  
  // フォールバック処理
  const waitResult = await waitForResponseWithStopButton(enableDeepResearch);
  return {
    success: waitResult === true,
    error: waitResult ? null : 'TIMEOUT_NO_RESPONSE',
    errorMessage: waitResult ? null : '応答待機がタイムアウトしました',
    needsRetry: !waitResult
  };
}

// UI Selectors、タイムアウト設定とDeepResearch設定を読み込み
const loadUISelectors = () => {
  console.log("🔄 [11.autoai] UI Selectors読み込み開始");
  
  UI_SELECTORS_PROMISE = new Promise((resolve) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = chrome.runtime.getURL("src/config/ui-selectors.js");
    script.onload = () => {
      console.log("✅ [11.autoai] UI Selectorsを読み込みました");
      UI_SELECTORS_LOADED = true;
      resolve(true);
      loadTimeoutConfig();
    };
    script.onerror = (error) => {
      console.error("❌ [11.autoai] UI Selectors読み込みエラー:", error);
      console.log("🔄 [11.autoai] フォールバック: タイムアウト設定を直接読み込み");
      UI_SELECTORS_LOADED = false;
      resolve(false); // エラーでも続行
      loadTimeoutConfig();
    };
    document.head.appendChild(script);
  });
  
  return UI_SELECTORS_PROMISE;
};

// UI_SELECTORSの読み込み完了を待つ
async function waitForUISelectors() {
  if (UI_SELECTORS_LOADED) {
    console.log("✅ [11.autoai] UI_SELECTORSは既に読み込み済み");
    return true;
  }
  
  if (UI_SELECTORS_PROMISE) {
    console.log("⏳ [11.autoai] UI_SELECTORSの読み込みを待機中...");
    const result = await UI_SELECTORS_PROMISE;
    console.log(`✅ [11.autoai] UI_SELECTORS読み込み完了: ${result ? '成功' : 'エラー(フォールバック使用)'}`);
    return result;
  }
  
  console.warn("⚠️ [11.autoai] UI_SELECTORSの読み込みが開始されていません");
  return false;
}

const loadTimeoutConfig = () => {
  console.log("🔄 [11.autoai] タイムアウト設定読み込み開始");
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/config/timeout-config.js");
  script.onload = () => {
    console.log("✅ [11.autoai] タイムアウト設定を読み込みました");
    loadDeepResearchConfig();
  };
  script.onerror = (error) => {
    console.error("❌ [11.autoai] タイムアウト設定の読み込みエラー:", error);
    console.log(
      "🔄 [11.autoai] フォールバック: DeepResearch設定を直接読み込み",
    );
    // フォールバック: DeepResearch設定を直接読み込み
    loadDeepResearchConfig();
  };
  document.head.appendChild(script);
};

// DeepResearch設定を読み込み
const loadDeepResearchConfig = () => {
  console.log("🔄 [11.autoai] DeepResearchモジュール読み込み開始...");

  const script = document.createElement("script");
  script.type = "module";

  // エラーハンドリングを追加
  script.onerror = (error) => {
    console.error(
      "❌ [11.autoai] DeepResearchモジュール読み込みエラー:",
      error,
    );
  };

  script.onload = () => {
    console.log("📜 [11.autoai] DeepResearchスクリプトが読み込まれました");
  };

  const deepResearchConfigUrl = chrome.runtime.getURL(
    "src/config/deepresearch-config.js",
  );
  const activatorUrl = chrome.runtime.getURL(
    "src/modules/ai-deepresearch-activator.js",
  );

  console.log("🔗 [11.autoai] DeepResearch設定URL:", deepResearchConfigUrl);
  console.log("🔗 [11.autoai] Activator URL:", activatorUrl);

  // CSPエラーを回避するため、外部ファイルとして読み込む
  script.type = "module";
  script.src = chrome.runtime.getURL("src/modules/deepresearch-loader.js");

  // DeepResearchモジュールのURLをdata属性として渡す
  script.dataset.deepresearchConfigUrl = deepResearchConfigUrl;
  script.dataset.activatorUrl = activatorUrl;
  document.head.appendChild(script);
};

// AI種別の自動検出
const AI_TYPE = (() => {
  const hostname = window.location.hostname;
  if (hostname.includes("chatgpt.com") || hostname.includes("chat.openai.com"))
    return "ChatGPT";
  if (hostname.includes("claude.ai")) return "Claude";
  if (hostname.includes("gemini.google.com")) return "Gemini";
  return null;
})();

console.log(
  `🎯 [11.autoai] 統合AIコンテンツスクリプト起動 - ${AI_TYPE} モード`,
);

// コンテンツスクリプトの初期化開始ログ
console.log(`[11.autoai][${AI_TYPE}] コンテンツスクリプト初期化中...`);
// 注意: contentScriptReady通知は初期化完了後に送信されます（initializeContentScript内で実行）

// ========================================
// セレクタ設定は ui-selectors.js を使用
// ========================================


// ========================================
// DOM操作ユーティリティ（共通機能）
// ========================================

/**
 * 複数セレクタに対応した要素待機関数
 * @param {string|Array<string>} selectors - セレクタ文字列または配列
 * @param {number} timeout - タイムアウト時間（ミリ秒）
 * @param {Element} context - 検索コンテキスト
 * @returns {Promise<{element: Element, selector: string}>}
 */
const waitForAnyElement = async (
  selectors,
  timeout = 30000,
  context = document,
) => {
  if (typeof selectors === "string") selectors = [selectors];

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkElements = () => {
      for (const selector of selectors) {
        try {
          const element = context.querySelector(selector);
          if (element) {
            resolve({ element, selector });
            return;
          }
        } catch (error) {
          console.warn(`[11.autoai] セレクタエラー: ${selector}`, error);
        }
      }

      if (Date.now() - startTime > timeout) {
        reject(
          new Error(
            `[11.autoai] タイムアウト: 要素が見つかりません: ${selectors.join(", ")} (${timeout}ms)`,
          ),
        );
        return;
      }

      setTimeout(checkElements, 100);
    };

    checkElements();
  });
};

/**
 * エラーハンドリングの統一関数
 * @param {Error|string} error - エラーオブジェクトまたはメッセージ
 * @param {string} context - エラーのコンテキスト
 * @param {Object} details - 追加詳細情報
 * @returns {Object} エラー情報オブジェクト
 */
const handleError = (error, context = "", details = {}) => {
  const errorInfo = {
    message: error.message || error,
    context,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    aiType: AI_TYPE,
    ...details,
  };

  console.error(`[11.autoai][${AI_TYPE}] ${context}:`, errorInfo);

  // 将来的にはエラー収集サービスに送信
  // ErrorCollectionService.report(errorInfo);

  return errorInfo;
};

/**
 * 再試行処理の統一関数
 * @param {Function} fn - 実行する関数
 * @param {number} maxAttempts - 最大試行回数
 * @param {number} delay - 遅延時間（ミリ秒）
 * @returns {Promise<any>} 関数の実行結果
 */
const retryAsync = async (fn, maxAttempts = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.warn(
        `[11.autoai][${AI_TYPE}] Retry ${attempt}/${maxAttempts} failed:`,
        error.message,
      );
      await sleep(delay * attempt); // 指数バックオフ
    }
  }
};

/**
 * 待機関数
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * DeepResearchの現在の状態を確認
 * @returns {Promise<string>} 'enabled' | 'disabled' | 'unknown'
 */
async function checkDeepResearchState() {
  try {
    switch (AI_TYPE) {
      case "ChatGPT":
        // TODO: WEB_SEARCH_TOGGLEセレクタをui-selectors.jsに追加する必要あり
        // const toggle = document.querySelector(
        //   SELECTOR_CONFIG.ChatGPT.WEB_SEARCH_TOGGLE,
        // );
        // if (toggle) {
        //   const isChecked = toggle.getAttribute("aria-checked") === "true";
        //   return isChecked ? "enabled" : "disabled";
        // }
        break;

      case "Claude":
        // ClaudeのWeb検索状態を確認
        const searchToggle = document.querySelector(
          'button[aria-label*="search"]',
        );
        if (searchToggle) {
          const isActive =
            searchToggle.classList.contains("active") ||
            searchToggle.getAttribute("aria-pressed") === "true";
          return isActive ? "enabled" : "disabled";
        }
        break;

      case "Gemini":
        // GeminiのDeepResearch状態を確認
        let deepResearchBtn = null;

        // DEEP_RESEARCH_BUTTONセレクタを使用
        const deepResearchSelectors = window.AIHandler?.getSelectors('Gemini', 'DEEP_RESEARCH');
        if (deepResearchSelectors?.BUTTON) {
          for (const selector of deepResearchSelectors.BUTTON) {
            try {
              deepResearchBtn = document.querySelector(selector);
              if (deepResearchBtn) break;
            } catch (e) {
              // セレクタエラーをスキップ
              console.warn(
                `[11.autoai][Gemini] セレクタエラー: ${selector}`,
                e,
              );
            }
          }
        }

        // フォールバック
        if (!deepResearchBtn) {
          deepResearchBtn = document.querySelector(
            'button[aria-label*="Deep Research"]',
          );
        }

        // テキストで検索（最も確実）
        if (!deepResearchBtn) {
          const allButtons = document.querySelectorAll("button");
          for (const btn of allButtons) {
            if (btn.textContent && btn.textContent.trim() === "Deep Research") {
              deepResearchBtn = btn;
              break;
            }
          }
        }

        if (deepResearchBtn) {
          const isPressed =
            deepResearchBtn.getAttribute("aria-pressed") === "true";
          return isPressed ? "enabled" : "disabled";
        }
        break;
    }
    return "unknown";
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] DeepResearch状態確認エラー:`, error);
    return "unknown";
  }
}

/**
 * Deep Research有効化（3.auto-aiと同じシンプルな実装）
 * @returns {Promise<void>}
 */
async function enableDeepResearchSimple() {
  console.log(`[11.autoai][${AI_TYPE}] 🔬 DeepResearch有効化（シンプル版）`);

  try {
    // 現在の状態を確認
    const currentState = await checkDeepResearchState();
    console.log(
      `[11.autoai][${AI_TYPE}] 🔍 DeepResearch現在の状態: ${currentState}`,
    );

    switch (AI_TYPE) {
      case "ChatGPT":
        try {
          // 新しいアプローチ: ツールメニューを開いてWeb検索を有効化
          console.log(
            `[11.autoai][ChatGPT] 新しいツールメニューアプローチを試行`,
          );

          // ツールボタンを探す（テキストとクラスで判定）
          const toolButton = Array.from(
            document.querySelectorAll("button"),
          ).find(
            (btn) =>
              btn.textContent?.trim() === "ツール" &&
              btn.classList.contains("composer-btn"),
          );

          if (toolButton) {
            console.log(`[11.autoai][ChatGPT] ツールボタンを発見`);

            // focus + Enterキーが確実に動作する
            toolButton.focus();
            const keyEvent = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              bubbles: true,
            });
            toolButton.dispatchEvent(keyEvent);

            // メニューが開くまで待機
            await sleep(500);

            // menuitemradio要素を探す
            const menuItems = document.querySelectorAll(
              '[role="menuitemradio"]',
            );
            console.log(
              `[11.autoai][ChatGPT] メニューアイテム数: ${menuItems.length}`,
            );

            // Web検索ツールを探す
            const searchTool = Array.from(menuItems).find((item) => {
              const text = item.textContent?.toLowerCase() || "";
              return (
                text.includes("検索") ||
                text.includes("search") ||
                text.includes("web")
              );
            });

            if (searchTool) {
              const isSelected =
                searchTool.getAttribute("aria-checked") === "true" ||
                searchTool.getAttribute("data-state") === "checked";

              console.log(
                `[11.autoai][ChatGPT] Web検索ツール: ${isSelected ? "既にON" : "OFF → ON"}`,
              );

              if (!isSelected) {
                searchTool.click();
                console.log(
                  `[11.autoai][ChatGPT] ✅ Web検索ツールを有効化しました`,
                );
                await sleep(500);
              }
            } else {
              console.log(
                `[11.autoai][ChatGPT] ⚠️ メニュー内にWeb検索ツールが見つかりません`,
              );

              // フォールバック: 従来の方法を試す
              const allButtons = document.querySelectorAll("button");
              for (const btn of allButtons) {
                const text = btn.textContent || btn.innerText || "";
                const ariaLabel = btn.getAttribute("aria-label") || "";

                if (
                  (text.includes("検索") ||
                    text.includes("Search") ||
                    ariaLabel.includes("検索") ||
                    ariaLabel.includes("Search") ||
                    ariaLabel.includes("web")) &&
                  !btn.classList.contains("composer-btn")
                ) {
                  console.log(
                    `[11.autoai][ChatGPT] 検索ボタン候補発見: ${text || ariaLabel}`,
                  );
                  btn.click();
                  await sleep(500);
                  break;
                }
              }
            }

            // メニューを閉じる（ESCキー）
            document.body.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Escape",
                code: "Escape",
                keyCode: 27,
                bubbles: true,
              }),
            );
          } else {
            console.log(`[11.autoai][ChatGPT] ⚠️ ツールボタンが見つかりません`);
          }
        } catch (error) {
          console.error(
            `[11.autoai][ChatGPT] DeepResearch有効化エラー:`,
            error,
          );
        }
        break;

      case "Claude":
        // Claude: ツールメニュー → Web検索 → リサーチボタン（3ステップ）
        console.log(`[11.autoai][Claude] DeepResearch 3ステップ開始`);

        // ステップ1: ツールメニューを開く
        const toolsButton = document.querySelector(
          'button[id="input-tools-menu-trigger"]',
        );
        if (!toolsButton) {
          console.error(
            `[11.autoai][Claude] ツールメニューボタンが見つかりません`,
          );
          break;
        }

        // メニューが閉じている場合は開く
        if (toolsButton.getAttribute("aria-expanded") !== "true") {
          toolsButton.click();
          await sleep(800);
          console.log(
            `[11.autoai][Claude] ✅ ステップ1: ツールメニューを開きました`,
          );
        }

        // ステップ2: Web検索を有効化
        const webSearchButton = Array.from(
          document.querySelectorAll("button"),
        ).find((btn) => btn.textContent?.includes("ウェブ検索"));

        if (!webSearchButton) {
          console.error(`[11.autoai][Claude] ウェブ検索ボタンが見つかりません`);
          break;
        }

        if (!webSearchButton.classList.contains("text-primary-500")) {
          webSearchButton.click();
          await sleep(500);
          console.log(
            `[11.autoai][Claude] ✅ ステップ2: Web検索を有効化しました`,
          );
        }

        // ステップ3: リサーチボタンをクリック
        await sleep(500); // ボタン読み込み待機
        const researchButton = Array.from(
          document.querySelectorAll("button"),
        ).find((btn) => {
          const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
          const text = btn.querySelector("p");
          return svg && text && text.textContent === "リサーチ";
        });

        if (!researchButton) {
          console.error(`[11.autoai][Claude] リサーチボタンが見つかりません`);
          break;
        }

        const isPressed =
          researchButton.getAttribute("aria-pressed") === "true";
        if (!isPressed) {
          researchButton.click();
          await sleep(500);
          console.log(
            `[11.autoai][Claude] ✅ ステップ3: リサーチモードを有効化しました`,
          );
        }

        console.log(`[11.autoai][Claude] ✅ DeepResearch 3ステップ完了`);
        break;

      case "Gemini":
        // Gemini: 制御関数を優先的に使用してDeepResearchを有効化
        console.log(`[11.autoai][Gemini] DeepResearchを有効化しています...`);

        // 方法1: 制御関数を優先的に使用
        if (typeof window.enableGeminiDeepResearch === "function") {
          console.log(
            `[11.autoai][Gemini] 制御関数を使用してDeepResearchを有効化`,
          );
          try {
            const result = await window.enableGeminiDeepResearch();
            if (result) {
              console.log(
                `[11.autoai][Gemini] ✅ 制御関数でDeepResearchを有効化しました`,
              );
            } else {
              console.error(
                `[11.autoai][Gemini] ❌ 制御関数でのDeepResearch有効化に失敗`,
              );
            }
          } catch (error) {
            console.error(
              `[11.autoai][Gemini] ❌ enableGeminiDeepResearch関数エラー:`,
              error,
            );
          }
        } else {
          // 方法2: 制御関数が利用できない場合のみセレクタで探す
          console.log(
            `[11.autoai][Gemini] 制御関数が利用できないため、セレクタでボタンを探します`,
          );

          let deepResearchButton = null;

          // aria-labelセレクタで探す
          const deepResearchSelectors = window.AIHandler?.getSelectors('Gemini', 'DEEP_RESEARCH');
          if (deepResearchSelectors?.BUTTON) {
            for (const selector of deepResearchSelectors.BUTTON) {
              try {
                deepResearchButton = document.querySelector(selector);
                if (deepResearchButton) {
                  console.log(
                    `[11.autoai][Gemini] セレクタでボタンを発見: ${selector}`,
                  );
                  break;
                }
              } catch (e) {
                // セレクタエラーをスキップ
              }
            }
          }

          if (deepResearchButton) {
            const isPressed =
              deepResearchButton.getAttribute("aria-pressed") === "true";
            console.log(
              `[11.autoai][Gemini] Deep Researchボタン状態: ${isPressed}`,
            );
            if (!isPressed) {
              deepResearchButton.click();
              console.log(
                `[11.autoai][Gemini] ✅ Deep Researchを有効化しました`,
              );
              await sleep(500);
            } else {
              console.log(`[11.autoai][Gemini] Deep Researchは既に有効です`);
            }
          } else {
            console.error(
              `[11.autoai][Gemini] ❌ Deep Researchボタンが見つかりません`,
            );
          }
        }
        break;
    }

    // 有効化後の状態を確認
    await sleep(1000); // 状態が反映されるまで少し待つ
    const afterState = await checkDeepResearchState();
    console.log(
      `[11.autoai][${AI_TYPE}] ✅ DeepResearch有効化後の状態: ${afterState}`,
    );

    if (afterState !== "enabled") {
      console.warn(
        `[11.autoai][${AI_TYPE}] ⚠️ DeepResearchが有効化されていません！`,
      );
    }
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] DeepResearch有効化エラー:`, error);
  }
}

// ========================================
// 統合テストのcommon-ai-handlerを使用
// （AIInputクラス・ResponseCollectorクラスは削除）
// ========================================

/*
 * AIInput・ResponseCollectorクラスの代わりに、
 * 統合テストと同じcommon-ai-handler.jsの関数を直接使用：
 * 
 * - window.AIHandler.message.send() - プロンプト送信
 * - window.AIHandler.message.waitForResponse() - 応答待機
 * - window.AIHandler.message.getResponse() - 応答取得
 * 
 * 従来のAIInputは削除し、runAutomation()のみを使用
 */


// ========================================
// 応答収集クラス（AI別対応）
// ========================================


// ========================================
// メッセージ通信（Background Script連携）
// ========================================

/**
 * メッセージ処理のメインハンドラ
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(
    `[11.autoai][${AI_TYPE}] メッセージ受信:`,
    request.action,
    request,
  );

  // ChatGPTの場合、追加のデバッグ情報を出力
  if (AI_TYPE === "ChatGPT") {
    console.log(
      `[11.autoai][ChatGPT] デバッグ - action: ${request.action}, taskId: ${request.taskId}`,
    );
  }

  // 非同期処理のフラグ
  let isAsync = false;

  // Gemini専用メッセージ処理を統合
  if (AI_TYPE === "Gemini" && request.source === "ai-test-page") {
    isAsync = true;
    handleGeminiTestMessage(request, sendResponse);
    return isAsync;
  }

  switch (request.action) {
    // ===== AIタスク実行メッセージハンドラー =====
    // background.js経由でAITaskHandlerから送信される
    // プロンプト実行要求を処理
    // 処理フロー:
    // 1. sendPromptメッセージを受信
    // 2. AI画面にプロンプトを入力・送信
    // 3. 応答を待機
    // 4. 結果をbackground.jsに返却
    case "sendPrompt":
      isAsync = true;  // 非同期処理のため必須！
      console.log(`[11.autoai][${AI_TYPE}] sendPromptメッセージ受信 - 判定開始:`, {
        hasTaskId: !!request.taskId,
        taskId: request.taskId,
        promptLength: request.prompt?.length || 0,
        requestKeys: Object.keys(request)
      });
      
      // 既存のhandleSendPromptを使用、またはAITaskHandler用の処理を追加
      if (request.taskId) {
        // AITaskHandlerからの要求の場合
        console.log(`[11.autoai][${AI_TYPE}] ✓ AITaskHandler経由と判定 - handleAITaskPrompt呼び出し`);
        handleAITaskPrompt(request, sendResponse);
      } else {
        // 既存の処理
        console.log(`[11.autoai][${AI_TYPE}] ✓ 通常のプロンプト送信と判定 - handleSendPrompt呼び出し`);
        handleSendPrompt(request, sendResponse);
      }
      break;

    case "getResponse":
      isAsync = true;
      handleGetResponse(request, sendResponse);
      break;

    case "getTaskStatus":
      handleGetTaskStatus(request, sendResponse);
      break;

    case "checkReady":
      // UI_SELECTORSの読み込み状態も確認
      (async () => {
        const uiSelectorsLoaded = await waitForUISelectors();
        sendResponse({ 
          ready: true, 
          aiType: AI_TYPE,
          uiSelectorsLoaded: uiSelectorsLoaded
        });
      })();
      isAsync = true;
      break;

    case "getAIType":
      sendResponse({ aiType: AI_TYPE });
      break;

    case "executeTask":
      isAsync = true;
      handleExecuteTask(request, sendResponse);
      break;

    case "getAIStatus":
      // 現在のAIのステータスを返す
      isAsync = true;
      (async () => {
        try {
          let models = [];
          let functions = [];
          
          // ChatGPTの場合
          if (AI_TYPE === 'chatgpt' && window.chatgptAutomation) {
            models = await window.chatgptAutomation.getAvailableModels();
            functions = await window.chatgptAutomation.getAvailableFunctions();
          }
          // Claudeの場合
          else if (AI_TYPE === 'claude' && window.ClaudeAutomation) {
            models = await window.ClaudeAutomation.getAvailableModels();
            functions = await window.ClaudeAutomation.getAvailableFunctions();
          }
          // Geminiの場合
          else if (AI_TYPE === 'gemini' && window.GeminiAutomation) {
            models = await window.GeminiAutomation.collectAvailableModels();
            functions = await window.GeminiAutomation.collectAvailableFunctions();
          }
          
          sendResponse({
            success: true,
            aiType: AI_TYPE,
            models: models,
            functions: functions
          });
        } catch (error) {
          console.error(`[11.autoai] getAIStatusエラー:`, error);
          sendResponse({
            success: false,
            error: error.message,
            aiType: AI_TYPE
          });
        }
      })();
      break;

    case "detectAIChanges":
      // AI変更検出を実行してデータを返す
      isAsync = true;
      (async () => {
        try {
          let models = [];
          let functions = [];
          
          console.log(`[${AI_TYPE}] 変更検出を実行中...`);
          
          // ChatGPTの場合
          if (AI_TYPE === 'chatgpt' && window.chatgptAutomation) {
            console.log('[ChatGPT] モデルと機能を取得中...');
            models = await window.chatgptAutomation.getAvailableModels();
            functions = await window.chatgptAutomation.getAvailableFunctions();
            console.log(`[ChatGPT] モデル: ${models.length}個, 機能: ${functions.length}個`);
          }
          // Claudeの場合
          else if (AI_TYPE === 'claude' && window.ClaudeAutomation) {
            console.log('[Claude] モデルと機能を取得中...');
            models = await window.ClaudeAutomation.getAvailableModels();
            functions = await window.ClaudeAutomation.getAvailableFunctions();
            console.log(`[Claude] モデル: ${models.length}個, 機能: ${functions.length}個`);
          }
          // Geminiの場合
          else if (AI_TYPE === 'gemini' && window.GeminiAutomation) {
            console.log('[Gemini] モデルと機能を取得中...');
            models = await window.GeminiAutomation.collectAvailableModels();
            functions = await window.GeminiAutomation.collectAvailableFunctions();
            console.log(`[Gemini] モデル: ${models.length}個, 機能: ${functions.length}個`);
          }
          
          sendResponse({
            success: true,
            aiType: AI_TYPE,
            models: models,
            functions: functions,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error(`[${AI_TYPE}] 変更検出エラー:`, error);
          sendResponse({
            success: false,
            error: error.message,
            aiType: AI_TYPE
          });
        }
      })();
      break;

    case "START_MUTATION_OBSERVER":
      // MutationObserver開始
      isAsync = true;
      console.log(`[${AI_TYPE}] MutationObserver開始要求受信`);
      (async () => {
        try {
          // ai-mutation-observer.jsを動的読み込み
          if (!window.AIMutationObserver) {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('automations/ai-mutation-observer.js');
            script.onload = () => {
              console.log(`[${AI_TYPE}] ai-mutation-observer.js読み込み完了`);
              startMutationObserverInContent();
            };
            script.onerror = (error) => {
              console.error(`[${AI_TYPE}] ai-mutation-observer.js読み込み失敗:`, error);
              sendResponse({
                success: false,
                error: 'MutationObserverスクリプトの読み込みに失敗しました'
              });
            };
            document.head.appendChild(script);
          } else {
            startMutationObserverInContent();
          }
          
          function startMutationObserverInContent() {
            if (window.startAIMutationMonitoring) {
              const observer = window.startAIMutationMonitoring();
              if (observer) {
                console.log(`[${AI_TYPE}] MutationObserver開始成功`);
                sendResponse({
                  success: true,
                  aiType: AI_TYPE,
                  message: 'MutationObserver開始成功'
                });
              } else {
                console.error(`[${AI_TYPE}] MutationObserver開始失敗`);
                sendResponse({
                  success: false,
                  error: 'MutationObserverの開始に失敗しました'
                });
              }
            } else {
              console.error(`[${AI_TYPE}] startAIMutationMonitoring関数が見つかりません`);
              sendResponse({
                success: false,
                error: 'MutationObserver機能が利用できません'
              });
            }
          }
        } catch (error) {
          console.error(`[${AI_TYPE}] MutationObserver開始エラー:`, error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      break;

    case "STOP_MUTATION_OBSERVER":
      // MutationObserver停止
      isAsync = true;
      console.log(`[${AI_TYPE}] MutationObserver停止要求受信`);
      (async () => {
        try {
          if (window.stopAIMutationMonitoring) {
            const stopped = window.stopAIMutationMonitoring();
            if (stopped) {
              console.log(`[${AI_TYPE}] MutationObserver停止成功`);
              sendResponse({
                success: true,
                message: 'MutationObserver停止成功'
              });
            } else {
              sendResponse({
                success: false,
                error: 'MutationObserverの停止に失敗しました'
              });
            }
          } else {
            sendResponse({
              success: false,
              error: 'MutationObserver機能が見つかりません'
            });
          }
        } catch (error) {
          console.error(`[${AI_TYPE}] MutationObserver停止エラー:`, error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      break;

    case "GET_SELECTOR_DATA":
      // セレクタデータ取得
      isAsync = true;
      console.log(`[${AI_TYPE}] セレクタデータ取得要求受信`);
      (async () => {
        try {
          if (window.getAIMutationData) {
            const selectorData = window.getAIMutationData();
            if (selectorData) {
              console.log(`[${AI_TYPE}] セレクタデータ取得成功:`, selectorData);
              sendResponse({
                success: true,
                data: selectorData,
                aiType: AI_TYPE
              });
            } else {
              console.log(`[${AI_TYPE}] セレクタデータがまだ収集されていません`);
              sendResponse({
                success: false,
                error: 'セレクタデータがまだ収集されていません'
              });
            }
          } else {
            console.error(`[${AI_TYPE}] getAIMutationData関数が見つかりません`);
            sendResponse({
              success: false,
              error: 'セレクタデータ取得機能が利用できません'
            });
          }
        } catch (error) {
          console.error(`[${AI_TYPE}] セレクタデータ取得エラー:`, error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      break;

    case "GET_MUTATION_OBSERVER_RESULT":
      // MutationObserver結果取得
      isAsync = true;
      (async () => {
        try {
          if (window.getAIMutationReport) {
            const report = window.getAIMutationReport();
            if (report) {
              console.log(`[${AI_TYPE}] MutationObserver結果取得成功`);
              sendResponse({
                success: true,
                report: report
              });
            } else {
              // まだ完了していない場合
              sendResponse({
                success: true,
                report: null
              });
            }
          } else {
            sendResponse({
              success: false,
              error: 'MutationObserver結果取得機能が見つかりません'
            });
          }
        } catch (error) {
          console.error(`[${AI_TYPE}] MutationObserver結果取得エラー:`, error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      break;

    default:
      console.warn(`[11.autoai] 未知のアクション: ${request.action}`);
      sendResponse({ success: false, error: "Unknown action" });
  }

  return isAsync; // 非同期レスポンスの場合はtrueを返す
});


/**
 * 自動化スクリプトを動的に読み込む
 */
async function loadAutomationScript() {
  return new Promise((resolve) => {
    console.log(`[11.autoai][${AI_TYPE}] 🔄 自動化スクリプトを動的に読み込み中...`);
    
    const scriptMap = {
      'ChatGPT': 'automations/chatgpt-automation.js',
      'Claude': 'automations/claude-automation-dynamic.js',
      'Gemini': 'automations/gemini-dynamic-automation.js'
    };
    
    const scriptPath = scriptMap[AI_TYPE];
    if (!scriptPath) {
      console.error(`[11.autoai][${AI_TYPE}] ❌ 未対応のAI種別`);
      resolve(false);
      return;
    }
    
    // 共通ハンドラーを先に読み込む
    const commonScript = document.createElement('script');
    commonScript.src = chrome.runtime.getURL('automations/common-ai-handler.js');
    commonScript.onload = () => {
      console.log(`[11.autoai][${AI_TYPE}] ✅ 共通ハンドラー読み込み完了`);
      
      // AI固有のスクリプトを読み込む
      const aiScript = document.createElement('script');
      aiScript.src = chrome.runtime.getURL(scriptPath);
      aiScript.onload = () => {
        console.log(`[11.autoai][${AI_TYPE}] ✅ ${AI_TYPE}自動化スクリプト読み込み完了`);
        resolve(true);
      };
      aiScript.onerror = (error) => {
        console.error(`[11.autoai][${AI_TYPE}] ❌ ${AI_TYPE}自動化スクリプト読み込みエラー:`, error);
        resolve(false);
      };
      document.head.appendChild(aiScript);
    };
    commonScript.onerror = (error) => {
      console.error(`[11.autoai][${AI_TYPE}] ❌ 共通ハンドラー読み込みエラー:`, error);
      resolve(false);
    };
    document.head.appendChild(commonScript);
  });
}


/**
 * 現在のAI応答を取得
 * @returns {Promise<string|null>} 応答テキスト、またはnull
 */
async function getCurrentAIResponse() {
  try {
    console.log(`[11.autoai][${AI_TYPE}] getCurrentAIResponse: runAutomationで応答取得`);
    
    // 各AIのautomationオブジェクトを使用して応答を取得
    let automation = null;
    switch (AI_TYPE) {
      case "ChatGPT":
        automation = window.ChatGPTAutomation;
        break;
      case "Claude":
        automation = window.ClaudeAutomation;
        break;
      case "Gemini":
        automation = window.GeminiAutomation || window.Gemini;
        break;
    }
    
    if (!automation || !automation.runAutomation) {
      console.warn(`[11.autoai][${AI_TYPE}] Automationが利用できないため、従来の方法で応答取得`);
      // フォールバック: 従来の方法
      const isCompleted = await isResponseCompleted();
      if (!isCompleted) {
        return null;
      }
      const response = await getResponseWithCanvas();
      return response || null;
    }
    
    // runAutomationで応答のみ取得（waitResponse: false, getResponse: true）
    const config = {
      text: '',  // プロンプトは送信しない
      send: false,
      waitResponse: false,
      getResponse: true  // 応答取得のみ
    };
    
    const result = await automation.runAutomation(config);
    
    if (result && result.success && result.response) {
      console.log(`[11.autoai][${AI_TYPE}] runAutomationで応答取得成功`);
      return result.response;
    }
    
    // runAutomationで失敗した場合は従来の方法にフォールバック
    console.warn(`[11.autoai][${AI_TYPE}] runAutomation失敗、従来の方法で応答取得`);
    const isCompleted = await isResponseCompleted();
    if (!isCompleted) {
      return null;
    }
    const response = await getResponseWithCanvas();
    return response || null;
    
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] 応答取得エラー:`, error);
    return null;
  }
}

/**
 * 応答が完了したかチェック
 * @returns {Promise<boolean>} 完了している場合true
 */
async function isResponseCompleted() {
  // 統合テストページと同じロジック：停止ボタンの消滅のみで判定
  if (AI_TYPE === "Claude") {
    // Claude専用の応答完了判定
    const stopButton = document.querySelector('button[aria-label="応答を停止"]');
    
    // 停止ボタンが消滅した場合、応答完了（応答要素の存在チェックは不要）
    const isCompleted = !stopButton;
    
    if (isCompleted) {
      console.log(`[11.autoai][Claude] 応答完了検出: 停止ボタン消失`);
    }
    
    return isCompleted;
  } else {
    // 他のAI用の判定（ui-selectors.js使用）
    const stopButtonSelectors = window.AIHandler?.getSelectors(AI_TYPE, 'STOP_BUTTON') || ['button[aria-label*="stop" i]'];
    const stopButton = document.querySelector(stopButtonSelectors.join(', '));
    return !stopButton || stopButton.style.display === 'none' || stopButton.disabled;
  }
}

/**
 * AITaskHandler用のプロンプト処理
 * background.jsの中央制御に転送する軽量版
 * 統合エラーリカバリーシステムでラップされた版
 */
async function handleAITaskPrompt(request, sendResponse) {
  const { prompt, taskId, model, specialOperation, cellInfo } = request;
  
  // 統合エラーリカバリーシステムを初期化
  const errorRecovery = window.UnifiedErrorRecovery ? 
    new window.UnifiedErrorRecovery({
      aiType: AI_TYPE,
      enableLogging: true
    }) : null;
  
  // AI設定マネージャーを初期化
  const configManager = window.aiConfigManager || new (window.AIConfigManager || class {})();
  
  // 現在のタスクIDをグローバルに保存（エラーハンドラー用）
  window.currentTaskId = taskId;
  
  console.log(`[11.autoai][${AI_TYPE}] handleAITaskPrompt - background.jsに転送`, {
    taskId,
    model,
    specialOperation,
    promptLength: prompt?.length
  });
  
  // タスクデータを準備して正規化
  const taskData = configManager.normalizeConfig({
    aiType: AI_TYPE,
    model: model,
    function: specialOperation || 'none',
    prompt: prompt,
    taskId: taskId,
    cellInfo: cellInfo  // セル位置情報を追加
  }, AI_TYPE);
  
  // 設定を保存
  configManager.saveConfig(taskId, taskData, AI_TYPE);
  
  // エラーハンドリングをラップ
  try {
    // Port接続を使用した長時間処理対応の通信
    let port = null;
    let keepAliveInterval = null;
    let responseReceived = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
  
  // Port接続を確立する関数
  const establishPortConnection = () => {
    try {
      port = chrome.runtime.connect({ name: "ai-task-executor" });
      console.log(`[11.autoai][${AI_TYPE}] Port接続を確立しました`);
      
      // Port切断時のハンドリング
      port.onDisconnect.addListener(() => {
        console.log(`[11.autoai][${AI_TYPE}] Port接続が切断されました`);
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
        
        if (!responseReceived && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`[11.autoai][${AI_TYPE}] 再接続試行 ${reconnectAttempts}/${maxReconnectAttempts}`);
          setTimeout(() => {
            establishPortConnection();
            sendTaskRequest();
          }, 2000); // 2秒後に再接続
        } else if (!responseReceived) {
          console.error(`[11.autoai][${AI_TYPE}] 最大再接続回数に達しました`);
          sendResponse({
            success: false,
            response: '',
            error: 'Port connection lost after max reconnect attempts',
            aiType: AI_TYPE,
            model: getModelInfo(),
            taskId: taskId
          });
        }
      });
      
      return true;
    } catch (error) {
      console.error(`[11.autoai][${AI_TYPE}] Port接続エラー:`, error);
      return false;
    }
  };
  
  // 初回接続を確立
  if (!establishPortConnection()) {
    sendResponse({
      success: false,
      response: '',
      error: 'Failed to establish port connection',
      aiType: AI_TYPE,
      model: getModelInfo(),
      taskId: taskId
    });
    return;
  }
  
  // メッセージ受信リスナー
  port.onMessage.addListener((msg) => {
    if (msg.type === 'keep-alive-ack') {
      console.log(`[11.autoai][${AI_TYPE}] Keep-alive確認受信`);
      return;
    }
    
    if (msg.type === 'progress') {
      console.log(`[11.autoai][${AI_TYPE}] 進捗状況:`, msg.progress);
      return;
    }
    
    if (msg.type === 'task-response') {
      responseReceived = true;
      
      console.log(`[11.autoai][${AI_TYPE}] background.jsからの応答:`, {
        success: msg.response?.success,
        responseLength: msg.response?.response?.length,
        error: msg.response?.error
      });
      
      // Keep-aliveを停止
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      
      // モデル情報を取得して応答に含める
      const currentModel = getModelInfo();
      
      // 応答をそのまま返す
      sendResponse({
        success: msg.response?.success || false,
        response: msg.response?.response || '',
        error: msg.response?.error,
        aiType: AI_TYPE,
        model: currentModel,
        taskId: taskId
      });
      
      // Port接続を閉じる
      port.disconnect();
    }
  });
  
  // タスク実行要求を送信する関数
  const sendTaskRequest = () => {
    if (!port) {
      console.error(`[11.autoai][${AI_TYPE}] Port接続がありません`);
      return;
    }
    
    try {
      // Keep-aliveメッセージを30秒ごとに送信
      if (!keepAliveInterval) {
        keepAliveInterval = setInterval(() => {
          try {
            if (port) {
              port.postMessage({
                type: 'keep-alive',
                taskId: taskId,
                timestamp: Date.now()
              });
              console.log(`[11.autoai][${AI_TYPE}] Keep-aliveメッセージ送信`);
            }
          } catch (error) {
            console.error(`[11.autoai][${AI_TYPE}] Keep-alive送信エラー:`, error);
            if (keepAliveInterval) {
              clearInterval(keepAliveInterval);
              keepAliveInterval = null;
            }
          }
        }, 30000); // 30秒ごと
      }
      
      // タスク実行要求を送信
      port.postMessage({
        type: 'execute-task',
        action: "executeAITask",
        taskData: taskData
      });
      
      console.log(`[11.autoai][${AI_TYPE}] タスク実行要求を送信しました`);
    } catch (error) {
      console.error(`[11.autoai][${AI_TYPE}] タスク送信エラー:`, error);
    }
  };
  
  // 初回のタスク送信
  sendTaskRequest();
  
  } catch (error) {
    // エラーが発生した場合、統合エラーリカバリーで処理
    console.error(`[11.autoai][${AI_TYPE}] handleAITaskPrompt エラー:`, error);
    
    if (errorRecovery && errorRecovery.handleStepError) {
      // Step3（AI実行）のエラーとして処理
      const recoveryResult = await errorRecovery.handleStepError(3, error, {
        taskId,
        aiType: AI_TYPE,
        prompt,
        model,
        function: specialOperation,
        cellInfo,
        source: 'handleAITaskPrompt'
      });
      
      if (recoveryResult.success) {
        // リカバリー成功
        sendResponse(recoveryResult);
      } else {
        // リカバリー失敗
        sendResponse({
          success: false,
          response: '',
          error: recoveryResult.error || error.message,
          aiType: AI_TYPE,
          model: getModelInfo(),
          taskId: taskId
        });
      }
    } else {
      // 統合エラーリカバリーが利用できない場合
      sendResponse({
        success: false,
        response: '',
        error: error.message,
        aiType: AI_TYPE,
        model: getModelInfo(),
        taskId: taskId
      });
    }
  }
}


/**
 * 送信前の特殊モード設定処理（全AI対応）
 */
async function handlePreSendModeSetup(specialMode, enableDeepResearch) {
  console.log(`[11.autoai][${AI_TYPE}] 送信前モード設定開始: ${specialMode}`);

  try {
    switch (AI_TYPE) {
      case "Gemini":
        // Gemini用の処理（制御関数の利用可能性を確認）
        console.log(`[11.autoai][Gemini] 🔄 ${specialMode}モードを設定中...`);
        console.log(`[11.autoai][Gemini] 利用可能な制御関数:`, {
          enableGeminiDeepResearch: typeof window.enableGeminiDeepResearch,
          enableGeminiDeepThink: typeof window.enableGeminiDeepThink,
          enableGeminiCanvas: typeof window.enableGeminiCanvas,
          disableGeminiDeepResearch: typeof window.disableGeminiDeepResearch,
        });

        // 既存のモードを無効化
        try {
          if (window.disableGeminiDeepResearch)
            await window.disableGeminiDeepResearch();
          if (window.disableGeminiDeepThink)
            await window.disableGeminiDeepThink();
          if (window.disableGeminiCanvas) await window.disableGeminiCanvas();
        } catch (error) {
          console.warn(`[11.autoai][Gemini] モード無効化エラー:`, error);
        }

        // 指定されたモードを有効化
        switch (specialMode) {
          case "DeepResearch":
            console.log(`[11.autoai][Gemini] 🔬 送信前にDeepResearchを有効化`);
            if (window.enableGeminiDeepResearch) {
              try {
                const result = await window.enableGeminiDeepResearch();
                if (result) {
                  console.log(`[11.autoai][Gemini] ✅ DeepResearch有効化成功`);
                } else {
                  console.warn(`[11.autoai][Gemini] ⚠️ DeepResearch有効化失敗`);
                  // フォールバック処理
                  await handleLegacyDeepResearch();
                }
              } catch (error) {
                console.error(
                  `[11.autoai][Gemini] DeepResearch有効化エラー:`,
                  error,
                );
                await handleLegacyDeepResearch();
              }
            } else {
              console.warn(
                `[11.autoai][Gemini] ❌ enableGeminiDeepResearch関数が利用できません`,
              );
              await handleLegacyDeepResearch();
            }
            break;
          case "DeepThink":
            console.log(`[11.autoai][Gemini] 🧠 送信前にDeepThinkを有効化`);
            if (window.enableGeminiDeepThink) {
              try {
                const result = await window.enableGeminiDeepThink();
                console.log(
                  `[11.autoai][Gemini] ${result ? "✅" : "⚠️"} DeepThink有効化${result ? "成功" : "失敗"}`,
                );
              } catch (error) {
                console.error(
                  `[11.autoai][Gemini] DeepThink有効化エラー:`,
                  error,
                );
              }
            } else {
              console.warn(
                `[11.autoai][Gemini] ❌ enableGeminiDeepThink関数が利用できません`,
              );
            }
            break;
          case "Canvas":
            console.log(`[11.autoai][Gemini] 🎨 送信前にCanvasを有効化`);
            if (window.enableGeminiCanvas) {
              try {
                const result = await window.enableGeminiCanvas();
                console.log(
                  `[11.autoai][Gemini] ${result ? "✅" : "⚠️"} Canvas有効化${result ? "成功" : "失敗"}`,
                );
              } catch (error) {
                console.error(`[11.autoai][Gemini] Canvas有効化エラー:`, error);
              }
            } else {
              console.warn(
                `[11.autoai][Gemini] ❌ enableGeminiCanvas関数が利用できません`,
              );
            }
            break;
          default:
            // DeepResearchフラグがある場合は従来通り処理
            if (enableDeepResearch) {
              console.log(
                `[11.autoai][Gemini] 🔬 送信前にDeepResearch（従来）を有効化`,
              );
              if (window.enableGeminiDeepResearch) {
                try {
                  const result = await window.enableGeminiDeepResearch();
                  console.log(
                    `[11.autoai][Gemini] ${result ? "✅" : "⚠️"} DeepResearch（従来）有効化${result ? "成功" : "失敗"}`,
                  );
                } catch (error) {
                  console.error(
                    `[11.autoai][Gemini] DeepResearch（従来）有効化エラー:`,
                    error,
                  );
                  await handleLegacyDeepResearch();
                }
              } else {
                await handleLegacyDeepResearch();
              }
            } else {
              console.log(`[11.autoai][Gemini] ⚪ 標準モード - 特殊機能なし`);
            }
            break;
        }
        break;

      case "ChatGPT":
        // ChatGPT用のツールモード処理
        console.log(`[11.autoai][ChatGPT] 🔄 ${specialMode}モードを設定中...`);

        // ChatGPTツール制御モジュールをロード
        if (!window.chatGPTToolControl) {
          try {
            console.log(
              "[11.autoai][ChatGPT] ChatGPTToolControlモジュールを動的インポート中...",
            );

            // 動的インポートを使用
            const moduleUrl = chrome.runtime.getURL(
              "src/features/chatgpt/chatgpt-tool-control.js",
            );
            const module = await import(moduleUrl);

            // ChatGPTToolControlクラスをインスタンス化
            if (module.ChatGPTToolControl) {
              window.chatGPTToolControl = new module.ChatGPTToolControl();
              console.log(
                "[11.autoai][ChatGPT] ✅ ChatGPTToolControlを初期化しました",
              );
            } else {
              console.error(
                "[11.autoai][ChatGPT] ❌ ChatGPTToolControlクラスが見つかりません",
              );
            }
          } catch (error) {
            console.error(
              "[11.autoai][ChatGPT] ツール制御モジュール読み込みエラー:",
              error,
            );
          }
        }

        // ツールモード設定
        // URLパラメータまたはグローバル変数から選択されたツールを取得
        const urlParams = new URLSearchParams(window.location.search);
        const selectedTool =
          specialMode ||
          urlParams.get("chatgptTool") ||
          window.selectedChatGPTTool ||
          null;

        console.log(`[11.autoai][ChatGPT] 🔧 選択されたツール:`, {
          specialMode,
          urlParam: urlParams.get("chatgptTool"),
          globalVar: window.selectedChatGPTTool,
          selected: selectedTool,
        });

        if (
          window.chatGPTToolControl &&
          selectedTool &&
          selectedTool.startsWith("ChatGPT")
        ) {
          try {
            console.log(
              `[11.autoai][ChatGPT] 🎯 ツール「${selectedTool}」を選択中...`,
            );
            const result =
              await window.chatGPTToolControl.selectTool(selectedTool);

            if (result) {
              console.log(
                `[11.autoai][ChatGPT] ✅ ツール「${selectedTool}」の選択に成功`,
              );
            } else {
              console.warn(
                `[11.autoai][ChatGPT] ⚠️ ツール「${selectedTool}」の選択に失敗`,
              );
            }
          } catch (error) {
            console.error(
              `[11.autoai][ChatGPT] ツールモード設定エラー:`,
              error,
            );
          }
        } else if (!window.chatGPTToolControl) {
          console.warn(
            `[11.autoai][ChatGPT] ❌ ChatGPTToolControlが利用できません`,
          );
        }

        // 従来のモード制御も試行
        if (window.enableChatGPTMode) {
          await window.enableChatGPTMode(specialMode);
        } else if (specialMode === "DeepResearch" || enableDeepResearch) {
          // DeepResearch処理
          await handleLegacyDeepResearch();
        }
        break;

      case "Claude":
        // Claude用の新しい処理
        console.log(`[11.autoai][Claude] 🔄 ${specialMode}モードを設定中...`);

        // Claudeモード制御関数が利用可能かチェック（読み込み待機を延長）
        let retries = 0;
        const maxRetries = 20; // 10秒まで待機
        while (!window.enableClaudeMode && retries < maxRetries) {
          console.log(
            `[11.autoai][Claude] モード制御関数の読み込みを待機中... (${retries + 1}/${maxRetries})`,
          );
          await sleep(500);
          retries++;
        }

        if (window.enableClaudeMode) {
          try {
            console.log(
              `[11.autoai][Claude] 🎯 enableClaudeMode(${specialMode})を実行`,
            );
            await window.enableClaudeMode(specialMode);
            console.log(`[11.autoai][Claude] ✅ ${specialMode}モード設定完了`);
          } catch (error) {
            console.error(`[11.autoai][Claude] モード設定エラー:`, error);
            // フォールバック処理
            if (specialMode === "DeepResearch" || enableDeepResearch) {
              console.log(
                `[11.autoai][Claude] 🔄 フォールバック: DeepResearch処理`,
              );
              await handleLegacyDeepResearch();
            }
          }
        } else {
          console.warn(`[11.autoai][Claude] ❌ モード制御機能が利用できません`);
          console.log(`[11.autoai][Claude] 利用可能な関数:`, {
            enableClaudeMode: typeof window.enableClaudeMode,
            enableClaudeDeepResearch: typeof window.enableClaudeDeepResearch,
            enableClaudeProjects: typeof window.enableClaudeProjects,
          });

          // フォールバック: 既存のDeepResearch処理
          if (specialMode === "DeepResearch" || enableDeepResearch) {
            console.log(
              `[11.autoai][Claude] 🔄 フォールバック: DeepResearch処理`,
            );
            await handleLegacyDeepResearch();
          }
        }
        break;

      default:
        console.log(`[11.autoai][${AI_TYPE || "Unknown"}] ❌ 未対応のAI種別`);
        break;
    }

    // 設定後少し待機
    await sleep(500);
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] 送信前モード設定エラー:`, error);
  }
}

/**
 * 従来のDeepResearch処理（ChatGPT、Claude用）
 */
async function handleLegacyDeepResearch() {
  console.log(`[11.autoai][${AI_TYPE}] 🔬 DeepResearch有効化開始`);

  // 3.auto-aiの実装と同じ方法でDeepResearch有効化
  await enableDeepResearchSimple();

  // または、DeepResearchActivatorが利用可能な場合は使用
  if (window.createDeepResearchActivator) {
    console.log(`[11.autoai][${AI_TYPE}] ✅ DeepResearchActivator利用可能`);
    try {
      const activator = window.createDeepResearchActivator(AI_TYPE);
      console.log(`[11.autoai][${AI_TYPE}] 🚀 DeepResearch有効化実行中...`);
      const activateResult = await activator.activate(true);

      if (activateResult) {
        console.log(`[11.autoai][${AI_TYPE}] ✅ DeepResearch有効化成功`);
      } else {
        console.warn(`[11.autoai][${AI_TYPE}] ⚠️ DeepResearch有効化失敗`);
      }
    } catch (activatorError) {
      console.error(
        `[11.autoai][${AI_TYPE}] 💥 DeepResearch有効化エラー:`,
        activatorError,
      );
    }
  }
}

/**
 * プロンプト送信処理
 */
async function handleSendPrompt(request, sendResponse) {
  try {
    const {
      prompt,
      taskId,
      enableDeepResearch = false,
      enableSearchMode = false,
      specialMode = null,
    } = request;

    console.log(`[11.autoai][${AI_TYPE}] プロンプト送信開始: ${taskId}`, {
      enableDeepResearch,
      enableSearchMode,
      specialMode,
    });

    // 送信前の特殊モード設定（全AI対応）
    await handlePreSendModeSetup(specialMode, enableDeepResearch);

    // Claude検索モード有効化（送信前）
    if (enableSearchMode && AI_TYPE === "Claude") {
      console.log(`[11.autoai][${AI_TYPE}] 🔍 検索モード有効化開始`);

      try {
        // Step 1: ツールメニューを開く
        const menuButton = document.querySelector(
          "button#input-tools-menu-trigger",
        );
        if (menuButton && menuButton.getAttribute("aria-expanded") !== "true") {
          menuButton.click();
          await sleep(800);
        }

        // Step 2: ウェブ検索ボタンを探して状態確認・有効化
        const allButtons = document.querySelectorAll("button");
        let webSearchButton = null;

        for (const btn of allButtons) {
          if (btn.textContent?.includes("ウェブ検索")) {
            webSearchButton = btn;
            break;
          }
        }

        if (webSearchButton) {
          const isAlreadyOn =
            webSearchButton.classList.contains("text-primary-500");

          if (!isAlreadyOn) {
            console.log(`[11.autoai][${AI_TYPE}] 🔄 ウェブ検索を有効化中...`);
            webSearchButton.click();
            await sleep(500);
            console.log(`[11.autoai][${AI_TYPE}] ✅ 検索モード有効化完了`);
          } else {
            console.log(`[11.autoai][${AI_TYPE}] ℹ️ 検索モードは既に有効です`);
          }
        } else {
          console.warn(
            `[11.autoai][${AI_TYPE}] ⚠️ ウェブ検索ボタンが見つかりません`,
          );
        }
      } catch (error) {
        console.error(
          `[11.autoai][${AI_TYPE}] 💥 検索モード有効化エラー:`,
          error,
        );
      }
    }

    // 統合テストと同じrunAutomation方式を使用（AIInputクラスは削除済み）
    console.log(`[11.autoai][${AI_TYPE}] runAutomationを使用してプロンプト送信`);
    
    // プロンプト送信のみ（応答待機なし）
    const config = {
      text: prompt,
      send: true,
      waitResponse: false,
      getResponse: false
    };
    
    let result = null;
    switch (AI_TYPE) {
      case "Claude":
        if (window.ClaudeAutomation?.runAutomation) {
          result = await window.ClaudeAutomation.runAutomation(config);
        }
        break;
      case "ChatGPT":
        if (window.ChatGPTAutomation?.runAutomation) {
          result = await window.ChatGPTAutomation.runAutomation(config);
        }
        break;
      case "Gemini":
        if (window.Gemini?.runAutomation) {
          result = await window.Gemini.runAutomation(config);
        }
        break;
    }
    
    if (!result || !result.success) {
      throw new Error(`プロンプト送信失敗: ${result?.error || '不明なエラー'}`);
    }

    sendResponse({
      success: true,
      taskId,
      message: "プロンプト送信完了",
      aiType: AI_TYPE,
      deepResearchEnabled: enableDeepResearch,
    });
  } catch (error) {
    const errorInfo = handleError(error, "handleSendPrompt", {
      taskId: request.taskId,
    });
    sendResponse({
      success: false,
      error: errorInfo.message,
      errorDetails: errorInfo,
      aiType: AI_TYPE,
    });
  }
}

/**
 * 応答収集処理（3.autoaiと同じ実装）
 */
async function handleGetResponse(request, sendResponse) {
  try {
    const { taskId, timeout = 600000, enableDeepResearch = false, useRetry = true } = request;

    // DeepResearchモードの場合はタイムアウトを40分に調整
    const actualTimeout = enableDeepResearch ? 3600000 : timeout;

    console.log(`[11.autoai][${AI_TYPE}] 応答収集開始: ${taskId}`, {
      timeout: actualTimeout,
      enableDeepResearch: enableDeepResearch,
      useRetry: useRetry
    });

    // リトライマネージャーを使用する場合
    if (useRetry && retryManager) {
      const result = await retryManager.executeWithRetry({
        taskId,
        prompt: request.prompt || '',
        aiType: AI_TYPE,
        enableDeepResearch,
        specialMode: request.specialMode,
        timeout: actualTimeout
      }, {
        onRetry: (retryInfo) => {
          console.log(`[11.autoai][${AI_TYPE}] リトライ ${retryInfo.retryCount}/${retryInfo.maxRetries}`, retryInfo);
          // UIに通知を送信
          chrome.runtime.sendMessage({
            type: 'RETRY_NOTIFICATION',
            data: retryInfo
          });
        },
        onError: (errorInfo) => {
          console.error(`[11.autoai][${AI_TYPE}] タスク失敗:`, errorInfo);
        }
      });
      
      if (result.success) {
        sendResponse({
          success: true,
          response: result.response,
          chunks: 1,
          taskId,
          aiType: AI_TYPE,
          retryCount: result.retryCount
        });
      } else {
        sendResponse({
          success: false,
          error: result.errorMessage,
          errorDetails: result,
          taskId,
          aiType: AI_TYPE,
          retryCount: result.retryCount
        });
      }
      return;
    }

    // 従来の処理（リトライなし）
    console.log(`[11.autoai][${AI_TYPE}] 停止ボタン監視開始`);
    const waitResult = await waitForResponseEnhanced(enableDeepResearch, actualTimeout);

    if (!waitResult.success) {
      // エラー時にリトライが必要かチェック
      if (waitResult.needsRetry) {
        console.log(`[11.autoai][${AI_TYPE}] リトライが必要なエラー:`, waitResult);
        // 新規ウィンドウでリトライを要求
        chrome.runtime.sendMessage({
          type: 'RETRY_WITH_NEW_WINDOW',
          taskId: taskId,
          prompt: request.prompt || '',
          aiType: AI_TYPE,
          enableDeepResearch: enableDeepResearch,
          specialMode: request.specialMode,
          error: waitResult.error,
          errorMessage: waitResult.errorMessage
        });
      }
      throw new Error(waitResult.errorMessage || "応答待機タイムアウト");
    }

    // Canvas機能対応の回答取得（3.autoai準拠）
    console.log(`[11.autoai][${AI_TYPE}] Canvas機能対応の回答取得開始`);
    const response = await getResponseWithCanvas();

    if (!response || response.trim().length === 0) {
      throw new Error("空レスポンス");
    }

    console.log(`[11.autoai][${AI_TYPE}] 応答収集完了: ${taskId}`, {
      responseLength: response.length,
      preview: response.substring(0, 100),
    });

    sendResponse({
      success: true,
      response: response,
      chunks: 1,
      taskId,
      aiType: AI_TYPE,
    });
  } catch (error) {
    const errorInfo = handleError(error, "handleGetResponse", {
      taskId: request.taskId,
    });
    sendResponse({
      success: false,
      error: errorInfo.message,
      errorDetails: errorInfo,
      taskId: request.taskId,
      aiType: AI_TYPE,
    });
  }
}

/**
 * タスク状態取得処理
 */
function handleGetTaskStatus(request, sendResponse) {
  // タスク管理は将来的にStreamProcessorと連携
  sendResponse({
    success: true,
    status: "ready",
    aiType: AI_TYPE,
    capabilities: {
      sendPrompt: true,
      getResponse: true,
      streaming: true,
    },
  });
}

/**
 * AIモデル情報を取得（ModelInfoExtractor使用）
 * @returns {string} モデル名
 */
function getModelInfo() {
  try {
    // ModelInfoExtractorが利用可能かチェック
    if (typeof window.ModelInfoExtractor !== 'undefined') {
      // グローバルからModelInfoExtractorを使用
      const modelName = window.ModelInfoExtractor.extract(AI_TYPE);
      console.log(`[11.autoai][${AI_TYPE}] 🔧 ModelInfoExtractor使用: "${modelName || '取得失敗'}"`);
      return modelName;
    } 
    
    // フォールバック: 従来の直接取得方式
    console.warn(`[11.autoai][${AI_TYPE}] ⚠️ ModelInfoExtractorが利用できません。フォールバック方式を使用`);
    return getModelInfoFallback();
    
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] ❌ モデル情報取得エラー:`, error);
    // エラー時もフォールバックを試行
    return getModelInfoFallback();
  }
}

/**
 * フォールバック用モデル情報取得関数
 * ModelInfoExtractorが利用できない場合の従来方式
 */
function getModelInfoFallback() {
  let modelName = '';
  
  try {
    switch(AI_TYPE) {
      case 'ChatGPT':
      case 'chatgpt':
        const chatgptBtn = document.querySelector('button[data-testid="model-switcher-dropdown-button"]');
        if (chatgptBtn) {
          const divElement = chatgptBtn.querySelector('div');
          if (divElement) {
            const fullText = divElement.textContent.trim();
            modelName = fullText.replace(/^ChatGPT\s*/i, '').trim();
          }
        }
        break;
      
      case 'Claude':
      case 'claude':
        const claudeButton = document.querySelector('button[data-testid="model-selector-dropdown"]');
        if (claudeButton) {
          const claudeModel = claudeButton.querySelector('.whitespace-nowrap.tracking-tight.select-none');
          if (claudeModel) {
            modelName = claudeModel.textContent.trim();
          } else {
            const buttonText = claudeButton.textContent;
            const match = buttonText.match(/(?:Claude\s*)?((?:Opus|Sonnet|Haiku)\s*[\d.]+)/i);
            if (match) {
              modelName = match[1].trim();
            }
          }
        }
        break;
        
      case 'Gemini':
      case 'gemini':
        const geminiLabel = document.querySelector('.logo-pill-label-container span');
        if (geminiLabel) {
          modelName = geminiLabel.textContent.trim();
        }
        break;
    }
    
    console.log(`[11.autoai][${AI_TYPE}] 📋 フォールバック取得結果: "${modelName || '取得失敗'}"`);
    
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] ❌ フォールバック取得エラー:`, error);
  }
  
  return modelName;
}

/**
 * sendPromptToAI関数
 * 各AIのrunAutomationを直接使用してプロンプトを送信
 */
async function sendPromptToAI(prompt, options = {}) {
  const { model, specialOperation, aiType, taskId } = options;
  
  // 現在のモデル情報を取得
  const currentModel = getModelInfo();
  
  console.log(`[11.autoai][${AI_TYPE}] 🚀 sendPromptToAI実行開始:`, {
    aiType: aiType || AI_TYPE,
    requestedModel: model || '未指定',
    actualModel: currentModel || '取得失敗',
    specialOperation: specialOperation || 'なし',
    taskId: taskId || '未設定',
    promptLength: prompt?.length || 0
  });
  
  // 設定オブジェクトの作成（統合テストと同じ形式）
  const config = {
    text: prompt,
    model: model,
    function: specialOperation || 'none',
    send: true,
    waitResponse: false,  // プロンプト送信のみ
    getResponse: false
  };
  
  try {
    let automation = null;
    const targetAI = aiType || AI_TYPE;
    
    // 各AIのautomationオブジェクトを取得
    switch (targetAI) {
      case "ChatGPT":
      case "chatgpt":
        automation = window.ChatGPTAutomation;
        break;
      case "Claude":
      case "claude":
        automation = window.ClaudeAutomation;
        break;
      case "Gemini":
      case "gemini":
        automation = window.GeminiAutomation || window.Gemini;
        break;
    }
    
    if (!automation || !automation.runAutomation) {
      console.error(`[11.autoai][${AI_TYPE}] Automationが利用できません:`, targetAI);
      return { success: false, error: `${targetAI} automationが利用できません` };
    }
    
    console.log(`[11.autoai][${AI_TYPE}] runAutomationを実行:`, config);
    const result = await automation.runAutomation(config);
    
    console.log(`[11.autoai][${AI_TYPE}] 📤 runAutomation結果:`, {
      success: result?.success,
      responseLength: result?.response?.length || 0,
      error: result?.error,
      modelUsed: currentModel || '不明'
    });
    
    // 結果にモデル情報を追加
    if (result) {
      result.model = currentModel;
      if (result.success) {
        console.log(`[11.autoai][${AI_TYPE}] ✅ プロンプト送信成功 - モデル: ${currentModel || '不明'}`);
      } else {
        console.error(`[11.autoai][${AI_TYPE}] ❌ プロンプト送信失敗:`, result.error);
      }
    }
    
    return result;
    
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] sendPromptToAIエラー:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * 統合タスク実行処理（プロンプト送信＋応答収集）
 * 統合テストページと同じrunAutomation関数を使用
 */
async function handleExecuteTask(request, sendResponse) {
  try {
    const {
      prompt,
      taskId,
      timeout = 600000,
      enableDeepResearch = false,
      specialMode = null,
      model = null,
    } = request;

    // DeepResearchモードの場合はタイムアウトを40分に調整
    const actualTimeout = enableDeepResearch ? 3600000 : timeout;

    console.log(`[11.autoai][${AI_TYPE}] 統合タスク実行開始: ${taskId}`, {
      timeout: actualTimeout,
      enableDeepResearch: enableDeepResearch,
      specialMode: specialMode,
      model: model,
    });

    // 統合テストページと同じ形式のconfigを作成
    const config = {
      model: model,
      function: specialMode || (enableDeepResearch ? 'DeepResearch' : 'none'),
      text: prompt,
      send: true,
      waitResponse: true,
      getResponse: true,
      timeout: actualTimeout
    };

    console.log(`[11.autoai][${AI_TYPE}] runAutomation実行`, config);

    let result = null;

    // 各AIのautomation.runAutomationを使用（統合テストページと同じ）
    switch (AI_TYPE) {
      case "Claude":
        if (window.ClaudeAutomation?.runAutomation) {
          console.log(`[11.autoai][Claude] ClaudeAutomation.runAutomationを使用`);
          result = await window.ClaudeAutomation.runAutomation(config);
        } else {
          throw new Error("ClaudeAutomationが利用できません");
        }
        break;

      case "ChatGPT":
        if (window.ChatGPTAutomation?.runAutomation) {
          console.log(`[11.autoai][ChatGPT] ChatGPTAutomation.runAutomationを使用`);
          result = await window.ChatGPTAutomation.runAutomation(config);
        } else {
          throw new Error("ChatGPTAutomationが利用できません");
        }
        break;

      case "Gemini":
        // GeminiまたはGeminiAutomationを使用
        if (window.Gemini?.runAutomation) {
          console.log(`[11.autoai][Gemini] Gemini.runAutomationを使用`);
          result = await window.Gemini.runAutomation(config);
        } else if (window.GeminiAutomation?.runAutomation) {
          console.log(`[11.autoai][Gemini] GeminiAutomation.runAutomationを使用`);
          result = await window.GeminiAutomation.runAutomation(config);
        } else {
          throw new Error("Gemini/GeminiAutomationが利用できません");
        }
        break;

      default:
        throw new Error(`未対応のAI: ${AI_TYPE}`);
    }

    // 結果の処理
    if (result && result.success) {
      console.log(`[11.autoai][${AI_TYPE}] runAutomation成功`, {
        responseLength: result.response?.length || 0
      });

      sendResponse({
        success: true,
        taskId,
        prompt,
        response: result.response || "",
        chunks: 1,
        aiType: AI_TYPE,
        timestamp: new Date().toISOString(),
      });
    } else {
      throw new Error(result?.error || "runAutomation失敗");
    }
  } catch (error) {
    const errorInfo = handleError(error, "handleExecuteTask", {
      taskId: request.taskId,
    });
    sendResponse({
      success: false,
      error: errorInfo.message,
      errorDetails: errorInfo,
      taskId: request.taskId,
      aiType: AI_TYPE,
    });
  }
}

// ========================================
// 3.autoai準拠の応答待機・取得関数
// ========================================

// DeepResearchスクリプトの注入確認関数
async function ensureDeepResearchScripts() {
  console.log(`[11.autoai][${AI_TYPE}] DeepResearchスクリプトの読み込み確認中...`);
  
  const maxWait = 5000; // 最大5秒待機
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    // 必要なオブジェクトの存在確認
    const hasClaudeAutomation = window.ClaudeAutomation && 
                               typeof window.ClaudeAutomation.waitForClaudeDeepResearchResponse === 'function';
    const hasAIHandler = window.AIHandler && 
                        window.AIHandler.message && 
                        typeof window.AIHandler.message.waitForResponse === 'function';
    
    console.log(`[11.autoai][${AI_TYPE}] スクリプト読み込み状況:`, {
      ClaudeAutomation: hasClaudeAutomation,
      AIHandler: hasAIHandler,
      elapsed: Date.now() - startTime
    });
    
    // いずれかが利用可能であれば成功
    if (hasClaudeAutomation || hasAIHandler) {
      console.log(`[11.autoai][${AI_TYPE}] DeepResearchスクリプト読み込み完了`);
      return true;
    }
    
    // 100ms待機して再試行
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.warn(`[11.autoai][${AI_TYPE}] DeepResearchスクリプトの読み込みがタイムアウトしました`);
  return false;
}

// 停止ボタン監視による回答待機関数
async function waitForResponseWithStopButton(enableDeepResearch = false) {
  // DeepResearchモードの場合はタイムアウトを40分に調整
  const timeout = enableDeepResearch ? 3600000 : 600000; // DeepResearch: 60分、通常: 10分
  
  console.log(`[11.autoai][${AI_TYPE}] 応答待機開始`, {
    enableDeepResearch,
    timeout: `${timeout / 60000}分`
  });
  
  // ClaudeのDeepResearchの場合は専用の待機処理を使用（統合テストページと同じ）
  if (enableDeepResearch && AI_TYPE === "Claude") {
    console.log(`[11.autoai][Claude] DeepResearchモード - 専用待機処理を使用`);
    
    // 必要なスクリプトの注入と読み込み確認
    await ensureDeepResearchScripts();
    
    // ClaudeAutomationのwaitForClaudeDeepResearchResponseを使用
    if (window.ClaudeAutomation && window.ClaudeAutomation.waitForClaudeDeepResearchResponse) {
      console.log(`[11.autoai][Claude] ClaudeAutomation.waitForClaudeDeepResearchResponseを使用`);
      const result = await window.ClaudeAutomation.waitForClaudeDeepResearchResponse(timeout / 60000);
      if (result !== undefined) {
        console.log(`[11.autoai][Claude] ClaudeAutomation待機結果:`, result);
        return result;
      }
    }
    
    console.log(`[11.autoai][Claude] 統合テストと同じアプローチでrunAutomation内蔵機能を使用`);
  }
  
  // 統合テストページと同じcommon-ai-handler.jsの関数を使用
  if (window.AIHandler && window.AIHandler.message && window.AIHandler.message.waitForResponse) {
    console.log(`[11.autoai][${AI_TYPE}] AIHandler.waitForResponseを使用`);
    const result = await window.AIHandler.message.waitForResponse(null, {
      timeout: timeout,
      extendedTimeout: enableDeepResearch ? timeout : 30 * 60 * 1000, // DeepResearchの場合は延長
      sendStartTime: Date.now()
    }, AI_TYPE);
    
    console.log(`[11.autoai][${AI_TYPE}] AIHandler.waitForResponse結果:`, {
      result: result,
      type: typeof result,
      isSuccess: result === true || result?.success === true
    });
    
    return result;
  }
  
  // フォールバック: AIHandlerが使えない場合は停止ボタン消滅のみで判定
  console.warn(`[11.autoai][${AI_TYPE}] 警告: 統合テストのAIHandlerが利用できません - 独自監視を使用`);
  console.log(`[11.autoai][${AI_TYPE}] フォールバック処理開始:`, {
    timeout: `${timeout / 60000}分`,
    enableDeepResearch,
    selectors: window.AIHandler.getSelectors(AI_TYPE, 'STOP_BUTTON')
  });
  
  return new Promise((resolve) => {
    let checkCount = 0;
    const startTime = Date.now();
    
    const check = setInterval(() => {
      checkCount++;
      
      // AI種別に応じた停止ボタンセレクタ
      const stopBtnSelectors = window.AIHandler.getSelectors(AI_TYPE, 'STOP_BUTTON');
      const stopBtn = document.querySelector(stopBtnSelectors?.join(", "));

      // 10回に1回詳細ログを出力
      if (checkCount % 10 === 0) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`[11.autoai][${AI_TYPE}] レスポンス監視中 (${elapsed}秒経過)`, {
          hasStopButton: !!stopBtn,
          checkCount,
          enableDeepResearch
        });
      }

      // 停止ボタンが消滅した場合のみ完了
      if (!stopBtn) {
        clearInterval(check);
        const totalElapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`[11.autoai][${AI_TYPE}] ✅ 停止ボタン消失検出 - レスポンス生成完了 (${totalElapsed}秒)`);
        setTimeout(() => {
          console.log(`[11.autoai][${AI_TYPE}] ✅ タスク完了`);
          resolve(true);
        }, 1000);
      }
    }, 1000);

    // タイムアウト設定（DeepResearchモードに対応）
    setTimeout(() => {
      clearInterval(check);
      const totalElapsed = Math.floor((Date.now() - startTime) / 1000);
      console.warn(`[11.autoai][${AI_TYPE}] ⏰ レスポンス待機タイムアウト (${timeout / 60000}分 / ${totalElapsed}秒経過)`);
      resolve(false);
    }, timeout);
  });
}

// Canvas機能対応の回答取得関数
async function getResponseWithCanvas() {
  // UI_SELECTORSの読み込みを待つ
  await waitForUISelectors();
  
  // デバッグ: 利用可能な自動化スクリプトを確認
  console.log(`[${AI_TYPE}] 利用可能な自動化スクリプト:`, {
    ChatGPTAutomation: !!window.ChatGPTAutomation,
    ClaudeAutomation: !!window.ClaudeAutomation,
    GeminiAutomation: !!window.GeminiAutomation,
    Gemini: !!window.Gemini
  });
  
  let rawResponse = null;
  
  // 各AIの自動化スクリプトのgetResponse関数を使用
  switch (AI_TYPE) {
    case "ChatGPT":
      // ChatGPTAutomationのgetResponse関数を使用（テストで実証済み）
      if (window.ChatGPTAutomation?.getResponse) {
        console.log(`[ChatGPT] ChatGPTAutomation.getResponse()を使用`);
        rawResponse = await window.ChatGPTAutomation.getResponse();
        // ChatGPTは空文字列を返すことがあるので、nullに変換
        rawResponse = rawResponse || null;
      } else {
        // ChatGPTAutomationが利用できない場合はエラーをスロー
        console.error('[ChatGPT] ChatGPTAutomationが利用できません');
        throw new Error('ChatGPT: 自動化スクリプトが利用できません');
      }
      break;

    case "Claude":
      // ClaudeAutomationのgetResponse関数を使用（テストで実証済み）
      if (window.ClaudeAutomation?.getResponse) {
        console.log(`[Claude] ClaudeAutomation.getResponse()を使用`);
        rawResponse = await window.ClaudeAutomation.getResponse();
      } else {
        // ClaudeAutomationが利用できない場合はエラーをスロー
        console.error('[Claude] ClaudeAutomationが利用できません');
        throw new Error('Claude: 自動化スクリプトが利用できません');
      }
      break;

    case "Gemini":
      // GeminiAutomationまたはwindow.Geminiのget Response関数を使用
      console.log(`[Gemini] デバッグ詳細:`, {
        GeminiAutomation: !!window.GeminiAutomation,
        'GeminiAutomation.getResponse': typeof window.GeminiAutomation?.getResponse,
        Gemini: !!window.Gemini,
        'Gemini.getResponse': typeof window.Gemini?.getResponse
      });
      
      if (window.GeminiAutomation?.getResponse) {
        console.log(`[Gemini] GeminiAutomation.getResponse()を使用`);
        rawResponse = await window.GeminiAutomation.getResponse();
        rawResponse = rawResponse || null;
      } else if (window.Gemini?.getResponse) {
        console.log(`[Gemini] window.Gemini.getResponse()を使用`);
        rawResponse = await window.Gemini.getResponse();
        rawResponse = rawResponse || null;
      }
      
      // Gemini: Canvas機能対応（動作確認済み）
      if (!rawResponse) {
        const geminiCanvasContainer = document.querySelector(
          'div[contenteditable="true"].ProseMirror',
        );
        if (geminiCanvasContainer) {
          console.log(
            `[11.autoai][${AI_TYPE}] Canvas機能検出（ProseMirror方式）`,
          );
          const canvasText =
            geminiCanvasContainer.innerText || geminiCanvasContainer.textContent;
          if (canvasText && canvasText.trim().length > 0) {
            rawResponse = canvasText;
          }
        }
      }

      if (!rawResponse) {
        // GeminiAutomationが利用できない場合はエラーをスロー
        console.error('[Gemini] GeminiAutomationもwindow.Geminiも利用できません');
        throw new Error('Gemini: 自動化スクリプトが利用できません');
      }
      break;

    default:
      throw new Error(`サポートされていないAI種別: ${AI_TYPE}`);
  }
  
  // 自動追加質問機能を適用
  if (rawResponse && autoFollowupHandler) {
    try {
      console.log(`[${AI_TYPE}] 自動追加質問機能を適用中...`);
      const finalResponse = await autoFollowupHandler.processResponse(
        rawResponse,
        AI_TYPE,
        {
          taskId: window.currentAITaskInfo?.taskId,
          model: window.currentAITaskInfo?.model
        }
      );
      console.log(`[${AI_TYPE}] 自動追加質問完了`, {
        original: rawResponse.length,
        final: finalResponse.length,
        added: finalResponse.length - rawResponse.length
      });
      return finalResponse;
    } catch (error) {
      console.warn(`[${AI_TYPE}] 自動追加質問エラー:`, error);
      // エラーが発生しても元の応答を返す
      return rawResponse;
    }
  }
  
  return rawResponse;
}

// ========================================
// 初期化処理
// ========================================

/**
 * メイン初期化処理
 */
async function initializeContentScript() {
  // 既に初期化済みの場合はスキップ
  if (window._contentScriptInitialized) {
    console.log(`[11.autoai][${AI_TYPE}] 既に初期化済みのためスキップ`);
    return;
  }
  window._contentScriptInitialized = true;

  console.log(`[11.autoai][${AI_TYPE}] コンテンツスクリプト初期化開始`);
  
  // 注意: スクリプト読み込みはbackground.jsが担当
  // コンテンツスクリプトはメッセージ転送のみ


  // グローバル変数を設定
  window.AI_TYPE = AI_TYPE;
  // Note: SELECTOR_CONFIGとSelectorFactoryは削除済み - ui-selectors.jsを使用
  // Note: AIInputとResponseCollectorも削除済み - common-ai-handlerを使用
  window.waitForResponseWithStopButton = waitForResponseWithStopButton;
  window.getResponseWithCanvas = getResponseWithCanvas;
  window.enableDeepResearchSimple = enableDeepResearchSimple;
  
  // 統合テストと同じアプローチ: DeepResearch機能は各AI自動化オブジェクト内蔵機能を使用

  // AI別の制御関数は既にloadAIControlScripts()で読み込み済み
  console.log(`[11.autoai][${AI_TYPE}] 制御関数確認:`);
  if (AI_TYPE === "Gemini") {
    console.log(
      "  - enableGeminiDeepResearch:",
      typeof window.enableGeminiDeepResearch,
    );
    console.log(
      "  - disableGeminiDeepResearch:",
      typeof window.disableGeminiDeepResearch,
    );
    console.log(
      "  - enableGeminiDeepThink:",
      typeof window.enableGeminiDeepThink,
    );
    console.log(
      "  - disableGeminiDeepThink:",
      typeof window.disableGeminiDeepThink,
    );
    console.log("  - enableGeminiCanvas:", typeof window.enableGeminiCanvas);
    console.log("  - disableGeminiCanvas:", typeof window.disableGeminiCanvas);
  } else if (AI_TYPE === "ChatGPT") {
    console.log("  - enableChatGPTMode:", typeof window.enableChatGPTMode);
    console.log("  - enableChatGPTCanvas:", typeof window.enableChatGPTCanvas);
    console.log("  - enableChatGPTo1:", typeof window.enableChatGPTo1);
    console.log("  - enableChatGPTSearch:", typeof window.enableChatGPTSearch);
    console.log(
      "  - enableChatGPTDeepResearch:",
      typeof window.enableChatGPTDeepResearch,
    );
  } else if (AI_TYPE === "Claude") {
    console.log("  - enableClaudeMode:", typeof window.enableClaudeMode);
    console.log(
      "  - enableClaudeProjects:",
      typeof window.enableClaudeProjects,
    );
    console.log(
      "  - enableClaudeArtifacts:",
      typeof window.enableClaudeArtifacts,
    );
    console.log("  - enableClaudeSonnet:", typeof window.enableClaudeSonnet);
    console.log("  - enableClaudeHaiku:", typeof window.enableClaudeHaiku);
    console.log("  - enableClaudeOpus:", typeof window.enableClaudeOpus);
    console.log(
      "  - enableClaudeDeepResearch:",
      typeof window.enableClaudeDeepResearch,
    );
  }

  // Gemini専用メッセージハンドラー関数
  async function handleGeminiTestMessage(request, sendResponse) {
    console.log(
      "[11.autoai][Gemini] テストページからメッセージ受信:",
      request.type,
    );

    try {
      switch (request.type) {
          case "ENABLE_DEEPRESEARCH":
            console.log("[11.autoai][Gemini] DeepResearchを有効化します");
            if (window.enableGeminiDeepResearch) {
              await window.enableGeminiDeepResearch();
            } else {
              // フォールバック: 直接ボタンを探してクリック
              const button =
                document.querySelector(
                  'button[aria-describedby*="cdk-describedby-message"][fonticon="travel_explore"]',
                ) ||
                document.querySelector('button[aria-label*="Deep Research"]');
              if (button && button.getAttribute("aria-pressed") !== "true") {
                button.click();
                console.log(
                  "[11.autoai][Gemini] DeepResearchボタンをクリックしました",
                );
              }
            }
            break;

          case "DISABLE_DEEPRESEARCH":
            console.log("[11.autoai][Gemini] DeepResearchを無効化します");
            if (window.disableGeminiDeepResearch) {
              await window.disableGeminiDeepResearch();
            } else {
              // フォールバック: 直接ボタンを探してクリック
              const button =
                document.querySelector(
                  'button[aria-describedby*="cdk-describedby-message"][fonticon="travel_explore"]',
                ) ||
                document.querySelector('button[aria-label*="Deep Research"]');
              if (button && button.getAttribute("aria-pressed") === "true") {
                button.click();
                console.log(
                  "[11.autoai][Gemini] DeepResearchボタンをクリックして無効化しました",
                );
              }
            }
            break;

          case "ENABLE_DEEPTHINK":
            console.log("[11.autoai][Gemini] DeepThinkを有効化します");
            if (window.enableGeminiDeepThink) {
              await window.enableGeminiDeepThink();
            } else {
              // フォールバック: 直接ボタンを探してクリック
              const button =
                document.querySelector(
                  'button[aria-describedby*="cdk-describedby-message"][fonticon="mindfulness"]',
                ) || document.querySelector('button[aria-label*="Deep Think"]');
              if (button && button.getAttribute("aria-pressed") !== "true") {
                button.click();
                console.log(
                  "[11.autoai][Gemini] DeepThinkボタンをクリックしました",
                );
              }
            }
            break;

          case "DISABLE_DEEPTHINK":
            console.log("[11.autoai][Gemini] DeepThinkを無効化します");
            if (window.disableGeminiDeepThink) {
              await window.disableGeminiDeepThink();
            } else {
              // フォールバック: 直接ボタンを探してクリック
              const button =
                document.querySelector(
                  'button[aria-describedby*="cdk-describedby-message"][fonticon="mindfulness"]',
                ) || document.querySelector('button[aria-label*="Deep Think"]');
              if (button && button.getAttribute("aria-pressed") === "true") {
                button.click();
                console.log(
                  "[11.autoai][Gemini] DeepThinkボタンをクリックして無効化しました",
                );
              }
            }
            break;

          case "ENABLE_CANVAS":
            console.log("[11.autoai][Gemini] Canvasを有効化します");
            if (window.enableGeminiCanvas) {
              await window.enableGeminiCanvas();
            } else {
              // フォールバック: 直接ボタンを探してクリック
              const button =
                document.querySelector(
                  'button[aria-describedby*="cdk-describedby-message"][fonticon="note_stack_add"]',
                ) || document.querySelector('button[aria-label*="Canvas"]');
              if (button && button.getAttribute("aria-pressed") !== "true") {
                button.click();
                console.log(
                  "[11.autoai][Gemini] Canvasボタンをクリックしました",
                );
              }
            }
            break;

          case "DISABLE_CANVAS":
            console.log("[11.autoai][Gemini] Canvasを無効化します");
            if (window.disableGeminiCanvas) {
              await window.disableGeminiCanvas();
            } else {
              // フォールバック: 直接ボタンを探してクリック
              const button =
                document.querySelector(
                  'button[aria-describedby*="cdk-describedby-message"][fonticon="note_stack_add"]',
                ) || document.querySelector('button[aria-label*="Canvas"]');
              if (button && button.getAttribute("aria-pressed") === "true") {
                button.click();
                console.log(
                  "[11.autoai][Gemini] Canvasボタンをクリックして無効化しました",
                );
              }
            }
            break;

          case "ENABLE_IMAGE":
            console.log("[11.autoai][Gemini] 画像モードを有効化します");
            if (window.enableGeminiImage) {
              await window.enableGeminiImage();
            } else {
              console.warn(
                "[11.autoai][Gemini] enableGeminiImage関数が見つかりません",
              );
            }
            break;

          case "DISABLE_IMAGE":
            console.log("[11.autoai][Gemini] 画像モードを無効化します");
            if (window.disableGeminiImage) {
              await window.disableGeminiImage();
            } else {
              console.warn(
                "[11.autoai][Gemini] disableGeminiImage関数が見つかりません",
              );
            }
            break;

          case "ENABLE_VIDEO":
            console.log("[11.autoai][Gemini] 動画モードを有効化します");
            if (window.enableGeminiVideo) {
              await window.enableGeminiVideo();
            } else {
              console.warn(
                "[11.autoai][Gemini] enableGeminiVideo関数が見つかりません",
              );
            }
            break;

          case "DISABLE_VIDEO":
            console.log("[11.autoai][Gemini] 動画モードを無効化します");
            if (window.disableGeminiVideo) {
              await window.disableGeminiVideo();
            } else {
              console.warn(
                "[11.autoai][Gemini] disableGeminiVideo関数が見つかりません",
              );
            }
            break;

          default:
            console.warn(`[11.autoai][Gemini] 未知のタイプ: ${request.type}`);
            sendResponse({ success: false, error: "Unknown type" });
            return;
        }

        // 成功レスポンスを送信
        sendResponse({ success: true, type: request.type });
      } catch (error) {
        console.error(`[11.autoai][Gemini] エラー:`, error);
        sendResponse({ success: false, error: error.message });
      }
    }
  }

  // 初期化完了をbackground.jsに通知
  chrome.runtime
    .sendMessage({
      action: "contentScriptReady",
      aiType: AI_TYPE,
      timestamp: new Date().toISOString(),
      version: "11.autoai-v1.0.0",
    })
    .catch((error) => {
      console.warn("[11.autoai] Background script通知エラー:", error);
    });

/**
 * フォールバック初期化（設定読み込み失敗時）
 */
async function initializeWithDefaults() {
  console.warn("[11.autoai] デフォルト設定で初期化");

  // 最小限の設定を設定
  window.CONFIG = {
    DEBUG: false,
    TIMEOUT: {
      ELEMENT_DETECTION: 30000,
      SEND_BUTTON: 30000,
      RESPONSE_WAIT: 180000,
    },
  };

  await initializeContentScript();
}

// ========================================
// スクリプト開始
// ========================================

// AI種別が検出できた場合のみ初期化
if (AI_TYPE) {
  console.log(`🚀 [11.autoai] ${AI_TYPE} サイトでContent Script初期化開始`);

  // RetryManagerの初期化
  const manager = initializeRetryManager();
  if (manager) {
    console.log('[11.autoai] RetryManager初期化完了');
  }
  
  // AutoFollowupHandlerの初期化
  const followupHandler = initializeAutoFollowupHandler();
  if (followupHandler) {
    console.log('[11.autoai] AutoFollowupHandler初期化完了');
  }
  
  // UI Selectors読み込みから開始
  loadUISelectors();

  // フォールバック: 3秒後にDeepResearch設定が未読み込みなら強制実行
  setTimeout(() => {
    if (!window.deepResearchConfigLoaded) {
      console.log("⚠️ [11.autoai] DeepResearch設定が未読み込み - 強制実行");
      loadDeepResearchConfig();
    } else {
      console.log("✅ [11.autoai] DeepResearch設定は正常に読み込まれています");
    }
  }, 3000);
} else {
  console.log("[11.autoai] 対応外のサイトです:", window.location.hostname);
}

// 注意: loadAIControlScripts、getCurrentTabId、loadScript関数は削除
// background.jsの中央制御に移行したため不要

// 注意: injectControlFunctions と createProxyFunction は削除
// 統合テストと同じchrome.scripting.executeScript方式では不要

// 統合テストと同じアプローチ: DeepResearch機能は各AI自動化オブジェクトの内蔵機能を使用

// 注意: loadScript関数は削除 - 統合テストと同じchrome.scripting.executeScriptを使用

