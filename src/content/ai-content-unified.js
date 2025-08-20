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
 * handleSendPromptの簡略版で、AITaskHandlerからの要求に特化
 */
async function handleAITaskPrompt(request, sendResponse) {
  const { prompt, taskId, model, specialOperation, aiType } = request;
  
  console.log(`[11.autoai][${AI_TYPE}] handleAITaskPrompt実行 - 統合テストのrunAutomationを使用`, {
    taskId,
    model,
    specialOperation,
    promptLength: prompt?.length
  });
  
  // common-ai-handler.jsが読み込まれているか確認
  if (!window.AIHandler || !window.AIHandler.message || !window.AIHandler.message.waitForResponse) {
    console.warn(`[11.autoai][${AI_TYPE}] AIHandlerが未初期化。common-ai-handler.jsを読み込み中...`);
    await loadCommonAIHandler();
    
    // 再度確認
    if (!window.AIHandler || !window.AIHandler.message || !window.AIHandler.message.waitForResponse) {
      console.error(`[11.autoai][${AI_TYPE}] AIHandlerの読み込みに失敗しました`);
    } else {
      console.log(`[11.autoai][${AI_TYPE}] AIHandlerの読み込み完了`);
    }
  }
  
  // 統合テストと完全に同じconfig形式
  const config = {
    model: model,
    function: specialOperation || 'none',
    text: prompt,
    send: true,
    waitResponse: true,
    getResponse: true,
    timeout: 180000  // デフォルト3分
  };
  
  // DeepResearchの判定（統合テストと同じ）
  const isDeepResearch = window.FeatureConstants ? 
    window.FeatureConstants.isDeepResearch(config.function) :
    (config.function && (
      config.function.toLowerCase().includes('research') ||
      config.function === 'DeepResearch' ||
      config.function === 'Deep Research'
    ));
    
  if (isDeepResearch) {
    config.timeout = 3600000;  // 60分
    console.log(`[11.autoai][${AI_TYPE}] DeepResearchモード検出 - タイムアウトを60分に延長`);
  }
  
  try {
    let result = null;
    
    // 各AIのrunAutomationを直接呼び出す（統合テストと同じ）
    switch (AI_TYPE) {
      case "ChatGPT":
        if (!window.ChatGPTAutomation) {
          throw new Error("ChatGPTAutomationが利用できません");
        }
        console.log(`[11.autoai][ChatGPT] ChatGPTAutomation.runAutomationを実行`, {
          config: config,
          hasWaitForResponse: !!window.AIHandler?.message?.waitForResponse
        });
        result = await window.ChatGPTAutomation.runAutomation(config);
        console.log(`[11.autoai][ChatGPT] runAutomation完了`, {
          success: result?.success,
          hasResponse: !!result?.response,
          responseLength: result?.response?.length
        });
        break;
        
      case "Claude":
        if (!window.ClaudeAutomation) {
          throw new Error("ClaudeAutomationが利用できません");
        }
        console.log(`[11.autoai][Claude] ClaudeAutomation.runAutomationを実行`, {
          config: config,
          hasWaitForResponse: !!window.AIHandler?.message?.waitForResponse
        });
        result = await window.ClaudeAutomation.runAutomation(config);
        console.log(`[11.autoai][Claude] runAutomation完了`, {
          success: result?.success,
          hasResponse: !!result?.response,
          responseLength: result?.response?.length
        });
        break;
        
      case "Gemini":
        const geminiAutomation = window.GeminiAutomation || window.Gemini;
        if (!geminiAutomation) {
          throw new Error("Gemini/GeminiAutomationが利用できません");
        }
        console.log(`[11.autoai][Gemini] Gemini.runAutomationを実行`, {
          config: config,
          hasWaitForResponse: !!window.AIHandler?.message?.waitForResponse
        });
        result = await geminiAutomation.runAutomation(config);
        console.log(`[11.autoai][Gemini] runAutomation完了`, {
          success: result?.success,
          hasResponse: !!result?.response,
          responseLength: result?.response?.length
        });
        break;
        
      default:
        throw new Error(`未対応のAI: ${AI_TYPE}`);
    }
    
    // 結果をそのまま返す
    console.log(`[11.autoai][${AI_TYPE}] runAutomation完了`, {
      success: result?.success,
      responseLength: result?.response?.length,
      error: result?.error
    });
    
    sendResponse({
      success: result?.success || false,
      response: result?.response || '',
      error: result?.error,
      aiType: AI_TYPE,
      taskId: taskId
    });
    
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] handleAITaskPromptエラー:`, error);
    sendResponse({
      success: false,
      error: error.message,
      aiType: AI_TYPE,
      taskId: taskId
    });
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
    const { taskId, timeout = 600000, enableDeepResearch = false } = request;

    // DeepResearchモードの場合はタイムアウトを40分に調整
    const actualTimeout = enableDeepResearch ? 3600000 : timeout;

    console.log(`[11.autoai][${AI_TYPE}] 応答収集開始: ${taskId}`, {
      timeout: actualTimeout,
      enableDeepResearch: enableDeepResearch,
    });

    // 停止ボタン監視による回答待機（3.autoai準拠）
    console.log(`[11.autoai][${AI_TYPE}] 停止ボタン監視開始`);
    const waitResult = await waitForResponseWithStopButton(enableDeepResearch);

    if (!waitResult) {
      throw new Error("応答待機タイムアウト");
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
      chunks: 1, // 3.autoaiでは分割していない
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
 * sendPromptToAI関数
 * 各AIのrunAutomationを直接使用してプロンプトを送信
 */
async function sendPromptToAI(prompt, options = {}) {
  const { model, specialOperation, aiType, taskId } = options;
  
  console.log(`[11.autoai][${AI_TYPE}] sendPromptToAI実行:`, {
    aiType: aiType || AI_TYPE,
    model,
    specialOperation,
    taskId
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
    
    console.log(`[11.autoai][${AI_TYPE}] runAutomation結果:`, result);
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
    const hasDeepResearchHandler = window.DeepResearchHandler &&
                                  typeof window.DeepResearchHandler.handle === 'function';
    const hasAIHandler = window.AIHandler && 
                        window.AIHandler.message && 
                        typeof window.AIHandler.message.waitForResponse === 'function';
    
    console.log(`[11.autoai][${AI_TYPE}] スクリプト読み込み状況:`, {
      ClaudeAutomation: hasClaudeAutomation,
      DeepResearchHandler: hasDeepResearchHandler,
      AIHandler: hasAIHandler,
      elapsed: Date.now() - startTime
    });
    
    // いずれかが利用可能であれば成功
    if (hasClaudeAutomation || hasDeepResearchHandler || hasAIHandler) {
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
    
    // DeepResearchHandlerが使える場合
    if (window.DeepResearchHandler) {
      console.log(`[11.autoai][Claude] DeepResearchHandlerを使用`);
      const result = await window.DeepResearchHandler.handle('Claude', timeout / 60000);
      if (result !== undefined) {
        console.log(`[11.autoai][Claude] DeepResearchHandler待機結果:`, result);
        return result;
      }
    }
    
    console.warn(`[11.autoai][Claude] 警告: DeepResearchハンドラーが利用できません`);
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
  
  // 各AIの自動化スクリプトのgetResponse関数を使用
  switch (AI_TYPE) {
    case "ChatGPT":
      // ChatGPTAutomationのgetResponse関数を使用（テストで実証済み）
      if (window.ChatGPTAutomation?.getResponse) {
        console.log(`[ChatGPT] ChatGPTAutomation.getResponse()を使用`);
        const response = await window.ChatGPTAutomation.getResponse();
        // ChatGPTは空文字列を返すことがあるので、nullに変換
        return response || null;
      }
      
      // ChatGPTAutomationが利用できない場合はエラーをスロー
      console.error('[ChatGPT] ChatGPTAutomationが利用できません');
      throw new Error('ChatGPT: 自動化スクリプトが利用できません');

    case "Claude":
      // ClaudeAutomationのgetResponse関数を使用（テストで実証済み）
      if (window.ClaudeAutomation?.getResponse) {
        console.log(`[Claude] ClaudeAutomation.getResponse()を使用`);
        const response = await window.ClaudeAutomation.getResponse();
        return response;
      }
      
      // ClaudeAutomationが利用できない場合はエラーをスロー
      console.error('[Claude] ClaudeAutomationが利用できません');
      throw new Error('Claude: 自動化スクリプトが利用できません');

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
        const response = await window.GeminiAutomation.getResponse();
        return response || null;
      } else if (window.Gemini?.getResponse) {
        console.log(`[Gemini] window.Gemini.getResponse()を使用`);
        const response = await window.Gemini.getResponse();
        return response || null;
      }
      
      // Gemini: Canvas機能対応（動作確認済み）
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
          return canvasText;
        }
      }

      // GeminiAutomationが利用できない場合はエラーをスロー
      console.error('[Gemini] GeminiAutomationもwindow.Geminiも利用できません');
      throw new Error('Gemini: 自動化スクリプトが利用できません');

    default:
      throw new Error(`サポートされていないAI種別: ${AI_TYPE}`);
  }
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

  // 先にAI別の制御スクリプトを読み込む（同期的に待機）
  console.log(`[11.autoai][${AI_TYPE}] 制御スクリプトを読み込み中...`);
  await loadAIControlScripts();
  console.log(`[11.autoai][${AI_TYPE}] 制御スクリプト読み込み完了`);

  // DeepResearch設定確認
  console.log(`[11.autoai][${AI_TYPE}] DeepResearch設定確認:`);
  console.log(
    `  - deepResearchConfigLoaded: ${window.deepResearchConfigLoaded}`,
  );
  console.log(`  - deepResearchConfig: ${typeof window.deepResearchConfig}`);
  console.log(
    `  - createDeepResearchActivator: ${typeof window.createDeepResearchActivator}`,
  );

  // グローバル変数を設定
  window.AI_TYPE = AI_TYPE;
  // Note: SELECTOR_CONFIGとSelectorFactoryは削除済み - ui-selectors.jsを使用
  // Note: AIInputとResponseCollectorも削除済み - common-ai-handlerを使用
  window.waitForResponseWithStopButton = waitForResponseWithStopButton;
  window.getResponseWithCanvas = getResponseWithCanvas;
  window.enableDeepResearchSimple = enableDeepResearchSimple;

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

// AI別の制御スクリプトを読み込む関数
async function loadAIControlScripts() {
  console.log(`[11.autoai][${AI_TYPE}] 制御スクリプトを読み込み中...`);

  // まず共通のDeepResearchハンドラーを読み込む
  await loadDeepResearchHandler();

  const scriptMap = {
    Gemini: "gemini-dynamic-automation.js",
    ChatGPT: "chatgpt-automation.js",
    Claude: "claude-automation-dynamic.js",
  };

  if (scriptMap[AI_TYPE]) {
    // 既に読み込まれているか確認
    const existingScript = document.querySelector(
      `script[src*="${scriptMap[AI_TYPE]}"]`,
    );
    if (existingScript) {
      console.log(
        `[11.autoai][${AI_TYPE}] 制御スクリプトは既に読み込まれています`,
      );
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(`automations/${scriptMap[AI_TYPE]}`);
      script.dataset.extensionScript = "true";

      script.onload = () => {
        console.log(`[11.autoai][${AI_TYPE}] 制御スクリプト読み込み完了`);

        // 即座にinjectControlFunctionsを呼び出す
        injectControlFunctions();

        // 関数が利用可能になるまで待機
        let retryCount = 0;
        const maxRetries = 10;
        const checkInterval = 100;

        const checkFunctions = setInterval(() => {
          retryCount++;

          if (AI_TYPE === "Claude") {
            console.log(
              `[11.autoai][Claude] 制御関数確認 (試行 ${retryCount}/${maxRetries}):`,
            );
            console.log(
              "  - ClaudeAutomation:",
              typeof window.ClaudeAutomation,
            );
            console.log(
              "  - enableClaudeMode:",
              typeof window.enableClaudeMode,
            );
            console.log(
              "  - enableClaudeDeepResearch:",
              typeof window.enableClaudeDeepResearch,
            );

            if (typeof window.ClaudeAutomation !== "undefined" || typeof window.enableClaudeDeepResearch !== "undefined") {
              console.log(
                "[11.autoai][Claude] ✅ 制御関数が利用可能になりました",
              );
              clearInterval(checkFunctions);
              resolve();
              return;
            }
          } else if (AI_TYPE === "Gemini") {
            console.log(
              `[11.autoai][Gemini] 制御関数確認 (試行 ${retryCount}/${maxRetries}):`,
            );
            console.log(
              "  - GeminiAutomation:",
              typeof window.GeminiAutomation,
            );
            console.log(
              "  - Gemini:",
              typeof window.Gemini,
            );
            console.log(
              "  - enableGeminiDeepResearch:",
              typeof window.enableGeminiDeepResearch,
            );
            console.log(
              "  - disableGeminiDeepResearch:",
              typeof window.disableGeminiDeepResearch,
            );

            if (typeof window.GeminiAutomation !== "undefined" || typeof window.Gemini !== "undefined" || typeof window.enableGeminiDeepResearch !== "undefined") {
              console.log(
                "[11.autoai][Gemini] ✅ 制御関数が利用可能になりました",
              );
              clearInterval(checkFunctions);
              resolve();
              return;
            }
          } else if (AI_TYPE === "ChatGPT") {
            console.log(
              `[11.autoai][ChatGPT] 制御関数確認 (試行 ${retryCount}/${maxRetries}):`,
            );
            console.log(
              "  - ChatGPTAutomation:",
              typeof window.ChatGPTAutomation,
            );
            
            if (typeof window.ChatGPTAutomation !== "undefined") {
              console.log(
                "[11.autoai][ChatGPT] ✅ 制御関数が利用可能になりました",
              );
              clearInterval(checkFunctions);
              resolve();
              return;
            }
          } else {
            // その他のAIの場合
            clearInterval(checkFunctions);
            resolve();
            return;
          }

          if (retryCount >= maxRetries) {
            console.error(
              `[11.autoai][${AI_TYPE}] ❌ 制御関数が見つかりません（タイムアウト）`,
            );
            clearInterval(checkFunctions);
            resolve();
          }
        }, checkInterval);
      };

      script.onerror = (error) => {
        console.error(
          `[11.autoai][${AI_TYPE}] 制御スクリプト読み込みエラー:`,
          error,
        );
        console.error(`[11.autoai][${AI_TYPE}] 失敗したURL: ${script.src}`);
        console.error(`[11.autoai][${AI_TYPE}] エラー詳細:`, {
          message: error.message,
          type: error.type,
          target: error.target?.src,
        });

        // エラーでも続行
        resolve();
      };

      document.head.appendChild(script);
    });
  }
  return Promise.resolve();
}

// 制御関数をコンテンツスクリプトのコンテキストに注入
function injectControlFunctions() {
  console.log(`[11.autoai][${AI_TYPE}] 制御関数を注入中...`);

  // ページスクリプトとコンテンツスクリプト間の通信を設定
  const script = document.createElement("script");
  script.textContent = `
    (() => {
      // メッセージハンドラーを設定
      window.addEventListener('message', async (event) => {
        if (event.data.type === 'AUTOAI_CONTROL_FUNCTION') {
          const { functionName, args } = event.data;
          console.log('[11.autoai] 制御関数呼び出し:', functionName, args);
          
          try {
            if (typeof window[functionName] === 'function') {
              const result = await window[functionName](...(args || []));
              window.postMessage({
                type: 'AUTOAI_CONTROL_RESULT',
                id: event.data.id,
                success: true,
                result: result
              }, '*');
            } else {
              window.postMessage({
                type: 'AUTOAI_CONTROL_RESULT',
                id: event.data.id,
                success: false,
                error: '関数が見つかりません: ' + functionName
              }, '*');
            }
          } catch (error) {
            window.postMessage({
              type: 'AUTOAI_CONTROL_RESULT',
              id: event.data.id,
              success: false,
              error: error.message
            }, '*');
          }
        }
      });
      
      // 利用可能な関数を通知
      const availableFunctions = [];
      if (typeof window.enableClaudeDeepResearch !== 'undefined') {
        availableFunctions.push('enableClaudeDeepResearch');
      }
      if (typeof window.enableClaudeMode !== 'undefined') {
        availableFunctions.push('enableClaudeMode');
      }
      if (typeof window.disableClaudeDeepResearch !== 'undefined') {
        availableFunctions.push('disableClaudeDeepResearch');
      }
      if (typeof window.enableClaudeProjects !== 'undefined') {
        availableFunctions.push('enableClaudeProjects');
      }
      if (typeof window.enableClaudeArtifacts !== 'undefined') {
        availableFunctions.push('enableClaudeArtifacts');
      }
      if (typeof window.enableGeminiDeepResearch !== 'undefined') {
        availableFunctions.push('enableGeminiDeepResearch');
      }
      if (typeof window.disableGeminiDeepResearch !== 'undefined') {
        availableFunctions.push('disableGeminiDeepResearch');
      }
      if (typeof window.enableGeminiDeepThink !== 'undefined') {
        availableFunctions.push('enableGeminiDeepThink');
      }
      if (typeof window.disableGeminiDeepThink !== 'undefined') {
        availableFunctions.push('disableGeminiDeepThink');
      }
      if (typeof window.enableGeminiCanvas !== 'undefined') {
        availableFunctions.push('enableGeminiCanvas');
      }
      if (typeof window.disableGeminiCanvas !== 'undefined') {
        availableFunctions.push('disableGeminiCanvas');
      }
      if (typeof window.enableChatGPTDeepResearch !== 'undefined') {
        availableFunctions.push('enableChatGPTDeepResearch');
      }
      if (typeof window.disableChatGPTDeepResearch !== 'undefined') {
        availableFunctions.push('disableChatGPTDeepResearch');
      }
      if (typeof window.enableChatGPTCanvas !== 'undefined') {
        availableFunctions.push('enableChatGPTCanvas');
      }
      if (typeof window.enableChatGPTo1 !== 'undefined') {
        availableFunctions.push('enableChatGPTo1');
      }
      
      console.log('[11.autoai] 利用可能な関数:', availableFunctions);
      
      window.postMessage({
        type: 'AUTOAI_FUNCTIONS_AVAILABLE',
        functions: availableFunctions
      }, '*');
    })();
  `;
  document.head.appendChild(script);
  script.remove();

  // メッセージリスナーを設定
  window.addEventListener("message", (event) => {
    if (event.data.type === "AUTOAI_FUNCTIONS_AVAILABLE") {
      console.log(
        `[11.autoai][${AI_TYPE}] 利用可能な制御関数:`,
        event.data.functions,
      );

      // グローバル関数として公開
      event.data.functions.forEach((funcName) => {
        window[funcName] = createProxyFunction(funcName);
        console.log(`[11.autoai][${AI_TYPE}] プロキシ関数を作成: ${funcName}`);
      });

      // 関数が正しく設定されたか確認
      console.log(`[11.autoai][${AI_TYPE}] 関数設定後の確認:`, {
        enableClaudeDeepResearch: typeof window.enableClaudeDeepResearch,
        enableGeminiDeepResearch: typeof window.enableGeminiDeepResearch,
        enableChatGPTDeepResearch: typeof window.enableChatGPTDeepResearch,
      });
    }
  });
}

// プロキシ関数を作成
function createProxyFunction(functionName) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substr(2, 9);

      const handler = (event) => {
        if (
          event.data.type === "AUTOAI_CONTROL_RESULT" &&
          event.data.id === id
        ) {
          window.removeEventListener("message", handler);
          if (event.data.success) {
            resolve(event.data.result);
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      window.addEventListener("message", handler);

      window.postMessage(
        {
          type: "AUTOAI_CONTROL_FUNCTION",
          id: id,
          functionName: functionName,
          args: args,
        },
        "*",
      );
    });
  };
}

// DeepResearchハンドラーを読み込む関数
async function loadDeepResearchHandler() {
  console.log(`[11.autoai] DeepResearchハンドラーを読み込み中...`);
  
  // 既に読み込まれているか確認
  if (window.DeepResearchHandler) {
    console.log(`[11.autoai] DeepResearchハンドラーは既に読み込まれています`);
    return Promise.resolve();
  }

  const existingScript = document.querySelector('script[src*="deepresearch-handler.js"]');
  if (existingScript) {
    console.log(`[11.autoai] DeepResearchハンドラースクリプトは既に読み込まれています`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("automations/deepresearch-handler.js");
    script.dataset.extensionScript = "true";

    script.onload = () => {
      console.log(`[11.autoai] ✅ DeepResearchハンドラー読み込み完了`);
      // DeepResearchHandlerが利用可能になるまで少し待機
      setTimeout(() => {
        if (window.DeepResearchHandler) {
          console.log(`[11.autoai] ✅ DeepResearchHandlerが利用可能です`);
        } else {
          console.warn(`[11.autoai] ⚠️ DeepResearchHandlerが見つかりません`);
        }
        resolve();
      }, 100);
    };

    script.onerror = (error) => {
      console.error(`[11.autoai] ❌ DeepResearchハンドラー読み込み失敗:`, {
        type: error.type,
        target: error.target?.src,
      });
      // エラーでも続行
      resolve();
    };

    document.head.appendChild(script);
  });
}

