/**
 * @fileoverview 統合AIコンテンツスクリプト - 11.autoai版
 * 将来的な拡張性を考慮したモジュラー設計
 * ChatGPT/Claude/Gemini対応
 */

// ========================================
// 初期化とAI種別検出
// ========================================

// タイムアウト設定とDeepResearch設定を読み込み
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

// コンテンツスクリプトの準備完了を通知
console.log(`[11.autoai][${AI_TYPE}] コンテンツスクリプト初期化中...`);
// Background scriptに準備完了を通知
if (AI_TYPE) {
  chrome.runtime.sendMessage({
    action: "contentScriptReady",
    aiType: AI_TYPE,
    url: window.location.href,
  });
}

// ========================================
// セレクタ設定（Factory Pattern）
// ========================================
const SELECTOR_CONFIG = {
  ChatGPT: {
    TEXTAREA: [
      "#prompt-textarea", // ProseMirrorエディタ（最優先）
      "textarea", // 実際の入力処理用の隠れたtextarea
      'textarea[placeholder*="Message"]',
      'textarea[data-id="chat-input"]',
    ],
    SEND_BUTTON: [
      "button#composer-submit-button", // 最優先
      'button[aria-label="プロンプトを送信する"]',
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]',
      'button[data-testid="composer-submit-btn"]',
      'button[aria-label*="送信"]',
    ],
    RESPONSE_ROOT: 'main div[role="list"], main',
    RESPONSE_MESSAGE: 'div[data-message-author-role="assistant"]:last-child',
    RESPONSE_CONTENT: [
      ".markdown.prose", // 最優先
      "div.markdown.prose",
    ],
    EXCLUDE_SELECTORS: ["button", ".copy-code-button", "button:has(svg)"],
    ERROR_ELEMENT: '.text-red-500, [role="alert"]',
    STOP_BUTTON: [
      'button[data-testid="stop-button"]',
      'button[aria-label="ストリーミングの停止"]',
      'button[aria-label*="Stop"]',
    ],
    // DeepResearch関連
    WEB_SEARCH_TOGGLE: [
      'button[data-testid="web-search-toggle"]',
      'button[aria-label*="検索"]',
      'button[aria-label*="Search"]',
      'button[aria-label*="web"]',
      "#radix-\\:r27\\: button", // 実際のIDパターン
    ],
    TOOLS_BUTTON: [
      "button#system-hint-button",
      'button[aria-label="ツール"]',
      "button.composer-btn",
    ],
  },

  Claude: {
    TEXTAREA: [
      '.ProseMirror[contenteditable="true"]', // 最優先
      'div.ProseMirror[contenteditable="true"]',
      ".ProseMirror",
      'div[contenteditable="true"]:not([aria-hidden="true"])',
    ],
    PROCESSING_DELAY: 2000, // Claude専用の処理遅延
    SEND_BUTTON: [
      'button[data-testid="send-button"]', // 最優先
      'button[aria-label*="Send"]',
      'button[aria-label*="送信"]',
      'button[aria-label="メッセージを送信"]',
      'button svg[class*="arrow"]', // 矢印アイコンを持つボタン
      "button:has(svg)", // SVGを含むボタン全般
    ],
    RESPONSE_ROOT: "main",
    RESPONSE_MESSAGE: [
      ".font-claude-message", // 最優先
      '[data-message-author-role="assistant"]:last-child',
      '[data-testid*="conversation"] [class*="assistant"]:last-child',
    ],
    RESPONSE_CONTENT:
      'div[class*="prose"], div[class*="markdown"], div[class*="content"]',
    EXCLUDE_SELECTORS: ["button", '[class*="copy"]', '[class*="feedback"]'],
    ERROR_ELEMENT: '[data-testid="error"], .error, [class*="error"]',
    STOP_BUTTON: [
      // React対応・優先順位順
      'button[data-testid*="stop"]', // 1. data-testid (最優先)
      'button[aria-label="応答を停止"]', // 2. aria-label (実際のClaude)
      'button[aria-label*="停止"]', // 2. aria-label (バリエーション)
      'button[data-state="closed"][aria-label*="停止"]', // 3,2. data-state + aria-label組み合わせ
      'button[type="button"][aria-label*="停止"]', // 7,2. type + aria-label組み合わせ
      'button[aria-label*="Stop"]', // 2. aria-label (英語)
      'button[aria-label*="stop"]', // 2. aria-label (小文字)
      'button:has(svg[viewBox="0 0 256 256"])', // SVGの特徴パターン
      'button.inline-flex:has(svg)', // 9,16. classパターン + 構造
      'button[class*="inline-flex"]:has(svg[fill="currentColor"])', // 9,16. より具体的なパターン
    ],
  },

  Gemini: {
    TEXTAREA: [
      'div[contenteditable="true"].ql-editor', // 最優先（より具体的）
      'div[contenteditable="true"]',
      "rich-textarea .ql-editor",
      ".ql-editor",
      "textarea",
      'div[role="textbox"]',
    ],
    SEND_BUTTON: [
      'button[aria-label*="プロンプトを送信"]', // 最優先（日本語）
      'button[aria-label*="送信"]',
      'button[aria-label*="Send"]',
      'button[mattooltip*="送信"]',
      'button mat-icon[fonticon="send"]',
      'button[data-testid="send-button"]',
      ".send-button",
    ],
    RESPONSE_ROOT: 'main, [role="main"], .conversation',
    RESPONSE_MESSAGE: [
      ".model-response-text",
      "[data-response-text]",
      ".response-container:last-child",
    ],
    RESPONSE_CONTENT: [
      "div[data-response-text]",
      ".response-text",
      ".markdown-content",
    ],
    EXCLUDE_SELECTORS: ["button", ".copy-button", ".action-button"],
    ERROR_ELEMENT: ".error-message, [data-error], .warning",
    // DeepResearchボタン用のセレクタ
    DEEP_RESEARCH_BUTTON: [
      'button[aria-label*="Deep Research"]',
      // 有効なセレクタのみを保持
      // テキストによる検索は動的に行う
    ],
  },
};

/**
 * SelectorFactory - AIセレクタ管理の統合クラス
 * 将来的な新AI追加に対応
 */
class SelectorFactory {
  /**
   * 指定したAI種別のセレクタ設定を取得
   * @param {string} aiType - AI種別 ('ChatGPT', 'Claude', 'Gemini')
   * @returns {Object|null} セレクタ設定オブジェクト
   */
  static getSelectors(aiType) {
    if (!aiType || !SELECTOR_CONFIG[aiType]) {
      console.warn(`[11.autoai] 未対応のAI種別: ${aiType}`);
      return null;
    }
    return SELECTOR_CONFIG[aiType];
  }

  /**
   * サポートされているAI種別の一覧を取得
   * @returns {Array<string>} AI種別の配列
   */
  static getSupportedAITypes() {
    return Object.keys(SELECTOR_CONFIG);
  }

  /**
   * 新しいAI種別のセレクタを追加（拡張性機能）
   * @param {string} aiType - 新しいAI種別
   * @param {Object} selectors - セレクタ設定
   */
  static addAISupport(aiType, selectors) {
    const requiredKeys = ["TEXTAREA", "SEND_BUTTON", "RESPONSE_MESSAGE"];
    const hasRequired = requiredKeys.every((key) =>
      selectors.hasOwnProperty(key),
    );

    if (!hasRequired) {
      throw new Error(
        `[11.autoai] セレクタ設定が不完全です。必須: ${requiredKeys.join(", ")}`,
      );
    }

    SELECTOR_CONFIG[aiType] = selectors;
    console.log(`✅ [11.autoai] 新しいAIサポート追加: ${aiType}`);
  }

  /**
   * セレクタ設定の妥当性検証
   * @param {Object} selectors - 検証するセレクタ設定
   * @returns {boolean} 妥当性
   */
  static validateSelectors(selectors) {
    const requiredKeys = ["TEXTAREA", "SEND_BUTTON", "RESPONSE_MESSAGE"];
    return requiredKeys.every((key) => selectors.hasOwnProperty(key));
  }
}

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
        const toggle = document.querySelector(
          SELECTOR_CONFIG.ChatGPT.WEB_SEARCH_TOGGLE,
        );
        if (toggle) {
          const isChecked = toggle.getAttribute("aria-checked") === "true";
          return isChecked ? "enabled" : "disabled";
        }
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

        // DEEP_RESEARCH_BUTTONが配列の場合は各セレクタを試す
        if (Array.isArray(SELECTOR_CONFIG.Gemini.DEEP_RESEARCH_BUTTON)) {
          for (const selector of SELECTOR_CONFIG.Gemini.DEEP_RESEARCH_BUTTON) {
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
          if (Array.isArray(SELECTOR_CONFIG.Gemini.DEEP_RESEARCH_BUTTON)) {
            for (const selector of SELECTOR_CONFIG.Gemini
              .DEEP_RESEARCH_BUTTON) {
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
// 入力処理クラス（AI別対応）
// ========================================

/**
 * AIInput - AI別の入力処理を統括
 */
class AIInput {
  constructor(aiType) {
    this.aiType = aiType;
    this.selectors = SelectorFactory.getSelectors(aiType);
    if (!this.selectors) {
      throw new Error(`[11.autoai] 未対応のAI種別: ${aiType}`);
    }
  }

  /**
   * プロンプトを入力
   * @param {string} prompt - 入力するプロンプト
   * @returns {Promise<Object>} 処理結果
   */
  async inputPrompt(prompt) {
    try {
      const { element } = await waitForAnyElement(
        this.selectors.TEXTAREA,
        window.CONFIG?.TIMEOUT?.ELEMENT_DETECTION || 30000,
      );

      // 要素情報をログ出力（デバッグ・メンテナンス用）
      this._logElementInfo("TEXTAREA", element);

      // AI種別に応じた入力処理
      if (this.aiType === "Claude") {
        return await this._inputToContentEditable(element, prompt);
      } else if (this.aiType === "ChatGPT") {
        // ChatGPTは要素タイプに応じて処理を分岐
        if (element.tagName.toLowerCase() === "textarea") {
          console.log(
            `[11.autoai][${this.aiType}] textarea要素を検出 -> _inputToTextarea使用`,
          );
          return await this._inputToTextarea(element, prompt);
        } else {
          console.log(
            `[11.autoai][${this.aiType}] contenteditable要素を検出 -> _inputToContentEditable使用`,
          );
          return await this._inputToContentEditable(element, prompt);
        }
      } else if (this.aiType === "Gemini") {
        return await this._inputToContentEditable(element, prompt);
      }

      throw new Error(`[11.autoai] 未実装の入力処理: ${this.aiType}`);
    } catch (error) {
      return {
        success: false,
        error: handleError(error, `inputPrompt[${this.aiType}]`, { prompt }),
      };
    }
  }

  /**
   * 要素情報をログ出力（デバッグ・メンテナンス用）
   * @private
   */
  _logElementInfo(elementType, element) {
    const info = {
      type: elementType,
      tagName: element.tagName.toLowerCase(),
      id: element.id || "(なし)",
      className: element.className || "(なし)",
      contentEditable: element.contentEditable || "(なし)",
      placeholder: element.placeholder || "(なし)",
      outerHTML: element.outerHTML.substring(0, 200) + "...",
    };

    console.log(`[11.autoai][${this.aiType}] 🔍 ${elementType}要素情報:`, info);
  }

  /**
   * textarea要素への入力
   * @private
   */
  async _inputToTextarea(element, prompt) {
    element.focus();
    element.value = prompt;

    // イベントを発火
    ["input", "change", "keyup"].forEach((eventType) => {
      element.dispatchEvent(new Event(eventType, { bubbles: true }));
    });

    return { success: true, element, method: "textarea" };
  }

  /**
   * contenteditable要素への入力
   * @private
   */
  async _inputToContentEditable(element, prompt) {
    element.focus();

    // ProseMirrorエディタの場合の特別処理
    if (
      element.classList.contains("ProseMirror") ||
      element.id === "prompt-textarea"
    ) {
      // ProseMirrorの内部構造に対応
      const pElement = element.querySelector("p");
      if (pElement) {
        pElement.textContent = prompt;
      } else {
        // TrustedHTMLエラーを回避するため、DOM操作で要素を作成
        const newP = document.createElement("p");
        newP.textContent = prompt;
        element.textContent = ""; // 既存コンテンツをクリア
        element.appendChild(newP);
      }
    } else {
      // 通常のcontenteditable要素
      element.textContent = prompt;
    }

    // 複数のイベントを発火してUIの更新を確実にする
    ["input", "compositionend", "keyup", "change"].forEach((eventType) => {
      element.dispatchEvent(new Event(eventType, { bubbles: true }));
    });

    // Geminiの場合は追加のイベントも発火
    if (this.aiType === "Gemini") {
      element.dispatchEvent(new Event("text-change", { bubbles: true }));
    }

    return { success: true, element, method: "contenteditable" };
  }

  /**
   * 送信ボタンをクリック
   * @returns {Promise<Object>} 処理結果
   */
  async clickSendButton(enableDeepResearch = false) {
    try {
      // DeepResearch状態を確認・設定（Geminiのみ）
      if (
        this.aiType === "Gemini" &&
        typeof enableDeepResearch !== "undefined"
      ) {
        await this._handleGeminiDeepResearch(enableDeepResearch);
      }

      const { element } = await waitForAnyElement(
        this.selectors.SEND_BUTTON,
        window.CONFIG?.TIMEOUT?.ELEMENT_DETECTION || 30000,
      );

      // 要素情報をログ出力（デバッグ・メンテナンス用）
      this._logElementInfo("SEND_BUTTON", element);

      // ボタンの有効化を待機
      await this._waitForButtonEnabled(element);

      // クリック実行
      console.log(`[11.autoai][${this.aiType}] 送信ボタンクリック実行`);
      element.click();

      return { success: true, element };
    } catch (error) {
      return {
        success: false,
        error: handleError(error, `clickSendButton[${this.aiType}]`),
      };
    }
  }

  /**
   * GeminiのDeepResearch状態をハンドリング
   * @private
   */
  async _handleGeminiDeepResearch(enableDeepResearch) {
    console.log(`[11.autoai][Gemini] DeepResearch設定: ${enableDeepResearch}`);

    try {
      // Gemini用のDeepResearch制御関数を使用
      if (window.enableGeminiDeepResearch && window.disableGeminiDeepResearch) {
        if (enableDeepResearch) {
          console.log(`[11.autoai][Gemini] 🔬 DeepResearchを有効化します`);
          await window.enableGeminiDeepResearch();
        } else {
          console.log(`[11.autoai][Gemini] 🛑 DeepResearchを無効化します`);
          await window.disableGeminiDeepResearch();
        }
      } else if (window.createDeepResearchActivator) {
        // Activatorモジュールを使用
        const activator = window.createDeepResearchActivator("Gemini");
        await activator.activate(enableDeepResearch);
      } else {
        // フォールバック: 直接ボタンを操作
        const button = await this._findGeminiDeepResearchButton();
        if (button) {
          const currentState = button.getAttribute("aria-pressed") === "true";
          if (currentState !== enableDeepResearch) {
            console.log(`[11.autoai][Gemini] DeepResearchボタンをクリック`);
            button.click();
            await sleep(500);
          }
        }
      }
    } catch (error) {
      console.error(`[11.autoai][Gemini] DeepResearch制御エラー:`, error);
    }
  }

  /**
   * GeminiのDeepResearchボタンを探す
   * @private
   */
  async _findGeminiDeepResearchButton() {
    const selectors = [
      'button[aria-describedby*="cdk-describedby-message"][fonticon="travel_explore"]',
      'button[aria-label*="Deep Research"]',
      "button:has(div.toolbox-drawer-button-label)",
      "button.toolbox-drawer-item-button",
    ];

    for (const selector of selectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          const icon = btn.querySelector('mat-icon[fonticon="travel_explore"]');
          const label = btn.querySelector(".toolbox-drawer-button-label");
          if (icon && label && label.textContent.includes("Deep Research")) {
            return btn;
          }
        }
      } catch (e) {
        // エラーを無視
      }
    }

    return null;
  }

  /**
   * 送信ボタンの有効化を待機
   * @private
   */
  async _waitForButtonEnabled(button) {
    const timeout = window.CONFIG?.TIMEOUT?.SEND_BUTTON || 30000;
    const startTime = Date.now();

    while (button.disabled && Date.now() - startTime < timeout) {
      await sleep(100);
    }

    if (button.disabled) {
      throw new Error(
        `[11.autoai] 送信ボタンが有効になりませんでした (${timeout}ms)`,
      );
    }
  }
}

// ========================================
// 応答収集クラス（AI別対応）
// ========================================

/**
 * ResponseCollector - AI応答の収集と監視
 */
class ResponseCollector {
  constructor(aiType) {
    this.aiType = aiType;
    this.selectors = SelectorFactory.getSelectors(aiType);
    this.isCollecting = false;
    this.observer = null;
    this.collectedChunks = [];
  }

  /**
   * 応答を収集
   * @param {number} timeout - タイムアウト時間
   * @returns {Promise<Object>} 収集結果
   */
  async collectResponse(timeout = 180000) {
    if (this.isCollecting) {
      throw new Error("[11.autoai] 既に応答収集中です");
    }

    this.isCollecting = true;
    this.collectedChunks = [];

    try {
      return await this._collectWithMutationObserver(timeout);
    } catch (error) {
      return {
        success: false,
        error: handleError(error, `collectResponse[${this.aiType}]`),
        aiType: this.aiType,
      };
    } finally {
      this.isCollecting = false;
      this._cleanup();
    }
  }

  /**
   * MutationObserverを使った応答収集
   * @private
   */
  async _collectWithMutationObserver(timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`[11.autoai] 応答収集タイムアウト (${timeout}ms)`));
      }, timeout);

      try {
        // 応答メッセージ要素を待機
        const { element: responseElement } = await waitForAnyElement(
          this.selectors.RESPONSE_MESSAGE,
        );

        // 要素情報をログ出力（デバッグ・メンテナンス用）
        this._logElementInfo("RESPONSE_MESSAGE", responseElement);

        // MutationObserverで変更を監視
        this.observer = new MutationObserver((mutations) => {
          this._processMutations(
            mutations,
            responseElement,
            resolve,
            timeoutId,
          );
        });

        this.observer.observe(responseElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        // 初期コンテンツをチェック
        this._checkResponseCompletion(responseElement, resolve, timeoutId);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * DOM変更を処理
   * @private
   */
  _processMutations(mutations, responseElement, resolve, timeoutId) {
    // AI種別に応じた変更検出ロジック
    const hasSignificantChange = mutations.some((mutation) => {
      return (
        mutation.type === "childList" ||
        (mutation.type === "characterData" &&
          mutation.target.textContent.trim())
      );
    });

    if (hasSignificantChange) {
      // 応答完了をチェック
      setTimeout(() => {
        this._checkResponseCompletion(responseElement, resolve, timeoutId);
      }, window.CONFIG?.AI_SPECIFIC?.[this.aiType]?.MUTATION_THROTTLE || 200);
    }
  }

  /**
   * 応答完了を判定
   * @private
   */
  _checkResponseCompletion(responseElement, resolve, timeoutId) {
    try {
      // コンテンツ要素を取得
      const contentElement =
        responseElement.querySelector(this.selectors.RESPONSE_CONTENT) ||
        responseElement;

      const responseText = this._extractText(contentElement);

      // 応答完了の判定（AI別ロジック）
      if (this._isResponseComplete(responseElement, responseText)) {
        clearTimeout(timeoutId);
        resolve({
          success: true,
          response: responseText.trim(),
          chunks: this.collectedChunks.length,
          element: responseElement,
          aiType: this.aiType,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: handleError(error, "_checkResponseCompletion"),
        aiType: this.aiType,
      });
    }
  }

  /**
   * テキストを抽出
   * @private
   */
  _extractText(element) {
    // 除外要素を除いてテキストを抽出
    const clone = element.cloneNode(true);

    // 除外セレクタの要素を削除
    if (this.selectors.EXCLUDE_SELECTORS) {
      this.selectors.EXCLUDE_SELECTORS.forEach((selector) => {
        const excludeElements = clone.querySelectorAll(selector);
        excludeElements.forEach((el) => el.remove());
      });
    }

    return clone.textContent || clone.innerText || "";
  }

  /**
   * 応答完了判定
   * @private
   */
  _isResponseComplete(element, text) {
    // 基本的な完了判定
    if (!text.trim()) {
      console.log(`[11.autoai][${this.aiType}] 応答完了判定: テキストが空`);
      return false;
    }

    // AI別の完了判定ロジック
    switch (this.aiType) {
      case "ChatGPT":
        // ChatGPTのローディングメッセージは完了とみなさない
        if (
          text.includes("お待ちください") ||
          text.includes("処理中") ||
          text.includes("Loading")
        ) {
          console.log(
            `[11.autoai][${this.aiType}] ローディングメッセージのため未完了と判定`,
          );
          return false;
        }

        // 停止ボタンの存在をチェック
        const hasStopButton =
          document.querySelector(this.selectors.STOP_BUTTON?.join(", ")) !==
          null;
        const isComplete = !hasStopButton && text.length > 10; // 10文字以上で完了とみなす

        console.log(`[11.autoai][${this.aiType}] 完了判定結果`, {
          停止ボタン有り: hasStopButton,
          テキスト長: text.length,
          完了判定: isComplete,
        });

        return isComplete;

      case "Claude":
        // Claudeのローディング表示チェック
        if (text.includes("Thinking")) {
          console.log(
            `[11.autoai][${this.aiType}] Thinking表示のため未完了と判定`,
          );
          return false;
        }

        // レスポンス要素の状態をチェック
        const isStreaming =
          element.classList.contains("streaming") ||
          element.querySelector('[data-streaming="true"]') !== null;
        const claudeComplete = !isStreaming && text.length > 0;

        console.log(`[11.autoai][${this.aiType}] 完了判定結果`, {
          streaming中: isStreaming,
          テキスト長: text.length,
          完了判定: claudeComplete,
        });

        return claudeComplete;

      case "Gemini":
        // Geminiのローディング表示チェック
        if (text.includes("生成中")) {
          console.log(
            `[11.autoai][${this.aiType}] 生成中表示のため未完了と判定`,
          );
          return false;
        }

        // ローディング状態をチェック
        const hasLoading =
          element.querySelector(".loading") !== null ||
          document.querySelector('[data-loading="true"]') !== null;
        const geminiComplete = !hasLoading && text.length > 0;

        console.log(`[11.autoai][${this.aiType}] 完了判定結果`, {
          loading中: hasLoading,
          テキスト長: text.length,
          完了判定: geminiComplete,
        });

        return geminiComplete;

      default:
        // デフォルトは2秒間変更がない場合を完了とみなす
        return true;
    }
  }

  /**
   * 要素情報をログ出力（デバッグ・メンテナンス用）
   * @private
   */
  _logElementInfo(elementType, element) {
    const info = {
      type: elementType,
      tagName: element.tagName.toLowerCase(),
      id: element.id || "(なし)",
      className: element.className || "(なし)",
      contentEditable: element.contentEditable || "(なし)",
      placeholder: element.placeholder || "(なし)",
      outerHTML: element.outerHTML.substring(0, 200) + "...",
    };

    console.log(`[11.autoai][${this.aiType}] 🔍 ${elementType}要素情報:`, info);
  }

  /**
   * クリーンアップ
   * @private
   */
  _cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

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
      isAsync = true;
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
      sendResponse({ ready: true, aiType: AI_TYPE });
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
 * プロンプトをAIに送信する共通処理
 * @param {string} prompt - 送信するプロンプト
 * @returns {Promise<Object>} 送信結果
 */
async function sendPromptToAI(prompt) {
  try {
    const aiInput = new AIInput(AI_TYPE);
    
    // プロンプト入力
    const inputResult = await aiInput.inputPrompt(prompt);
    if (!inputResult.success) {
      return { 
        success: false, 
        error: inputResult.error?.message || 'プロンプト入力失敗' 
      };
    }
    
    // 少し待機（入力処理の安定化）
    await sleep(500);
    
    // 送信ボタンクリック
    const clickResult = await aiInput.clickSendButton();
    if (!clickResult.success) {
      return { 
        success: false, 
        error: clickResult.error?.message || '送信ボタンクリック失敗' 
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] プロンプト送信エラー:`, error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * 現在のAI応答を取得
 * @returns {Promise<string|null>} 応答テキスト、またはnull
 */
async function getCurrentAIResponse() {
  try {
    // 停止ボタンの存在で応答完了を判定
    const isCompleted = await isResponseCompleted();
    if (!isCompleted) {
      return null;
    }
    
    // Canvas機能対応の応答取得
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
  if (AI_TYPE === "Claude") {
    // Claude専用の応答完了判定：停止ボタン消滅のみ
    const stopButton = document.querySelector('button[aria-label="応答を停止"]');
    
    // 停止ボタンが消滅した場合、応答完了
    const isCompleted = !stopButton;
    
    if (isCompleted) {
      console.log(`[11.autoai][Claude] 応答完了検出: 停止ボタン消失`);
    }
    
    return isCompleted;
  } else {
    // 他のAI用の従来の判定
    const stopButton = document.querySelector(SELECTOR_CONFIG[AI_TYPE]?.STOP_BUTTON || 'button[aria-label*="stop" i]');
    return !stopButton || stopButton.style.display === 'none' || stopButton.disabled;
  }
}

/**
 * AITaskHandler用のプロンプト処理
 * handleSendPromptの簡略版で、AITaskHandlerからの要求に特化
 */
async function handleAITaskPrompt(request, sendResponse) {
  const { prompt, taskId } = request;
  
  console.log(`[11.autoai][${AI_TYPE}] 🔥 handleAITaskPrompt関数が呼び出されました!`, {
    taskId,
    promptLength: prompt?.length || 0,
    AI_TYPE,
    hasPrompt: !!prompt
  });
  
  try {
    console.log(`[11.autoai][${AI_TYPE}] AIタスク実行開始: ${taskId}`);
    
    // プロンプトを送信
    const sendResult = await sendPromptToAI(prompt);
    
    if (!sendResult.success) {
      sendResponse({ 
        success: false, 
        error: sendResult.error || 'プロンプト送信失敗' 
      });
      return;
    }
    
    // 応答を待機してから成功を返す（同期処理）
    try {
      console.log(`[11.autoai][${AI_TYPE}] 応答待機開始: ${taskId}`);
      
      // 応答を待機（最大3分）
      const maxWaitTime = 180000;
      const startTime = Date.now();
      let response = null;
      
      while (Date.now() - startTime < maxWaitTime) {
        response = await getCurrentAIResponse();
        
        if (response && response.trim()) {
          console.log(`[11.autoai][${AI_TYPE}] 応答取得成功: ${taskId}`);
          sendResponse({ 
            success: true, 
            response: response,
            aiType: AI_TYPE 
          });
          return;
        }
        
        // Claude専用: より詳細なデバッグログ
        if (AI_TYPE === "Claude" && (Date.now() - startTime) % 3000 < 1000) {
          const stopButton = document.querySelector('button[aria-label="応答を停止"]');
          const sendButton = document.querySelector('button[aria-label="メッセージを送信"]');
          const isCompleted = await isResponseCompleted();
          const currentResponse = await getCurrentAIResponse();
          
          console.log(`[11.autoai][Claude] 応答待機詳細 (${Math.floor((Date.now() - startTime) / 1000)}s):`, {
            停止ボタン: !!stopButton,
            送信ボタン: !!sendButton,
            応答完了判定: isCompleted,
            応答テキスト長: currentResponse ? currentResponse.length : 0,
            応答プレビュー: currentResponse ? currentResponse.substring(0, 50) + '...' : 'なし'
          });
        }
        
        // 1秒待機
        await sleep(1000);
      }
      
      // タイムアウト
      console.log(`[11.autoai][${AI_TYPE}] 応答待機タイムアウト: ${taskId}`);
      sendResponse({ 
        success: false, 
        error: "応答待機タイムアウト" 
      });
      
    } catch (error) {
      console.error(`[11.autoai][${AI_TYPE}] 応答待機エラー: ${taskId}`, error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
    
  } catch (error) {
    console.error(`[11.autoai][${AI_TYPE}] AIタスク実行エラー:`, error);
    sendResponse({ 
      success: false, 
      error: error.message 
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

    const aiInput = new AIInput(AI_TYPE);

    // プロンプト入力
    const inputResult = await aiInput.inputPrompt(prompt);
    if (!inputResult.success) {
      throw new Error(`プロンプト入力失敗: ${inputResult.error.message}`);
    }

    // 少し待機（入力処理の安定化）
    await sleep(500);

    // 送信ボタンクリック
    const clickResult = await aiInput.clickSendButton();
    if (!clickResult.success) {
      throw new Error(`送信ボタンクリック失敗: ${clickResult.error.message}`);
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
    const { taskId, timeout = 180000, enableDeepResearch = false } = request;

    // DeepResearchモードの場合はタイムアウトを40分に調整
    const actualTimeout = enableDeepResearch ? 2400000 : timeout;

    console.log(`[11.autoai][${AI_TYPE}] 応答収集開始: ${taskId}`, {
      timeout: actualTimeout,
      enableDeepResearch: enableDeepResearch,
    });

    // 停止ボタン監視による回答待機（3.autoai準拠）
    console.log(`[11.autoai][${AI_TYPE}] 停止ボタン監視開始`);
    const waitResult = await waitForResponseWithStopButton();

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
 * 統合タスク実行処理（プロンプト送信＋応答収集）
 */
async function handleExecuteTask(request, sendResponse) {
  try {
    const {
      prompt,
      taskId,
      timeout = 180000,
      enableDeepResearch = false,
      specialMode = null,
    } = request;

    // DeepResearchモードの場合はタイムアウトを40分に調整
    const actualTimeout = enableDeepResearch ? 2400000 : timeout;

    console.log(`[11.autoai][${AI_TYPE}] 統合タスク実行開始: ${taskId}`, {
      timeout: actualTimeout,
      enableDeepResearch: enableDeepResearch,
      specialMode: specialMode,
    });

    // ChatGPT特有のデバッグ
    if (AI_TYPE === "ChatGPT") {
      console.log(
        `[11.autoai][ChatGPT] handleExecuteTask開始 - prompt: ${prompt.substring(0, 50)}...`,
      );
    }

    // プロンプト送信（特殊モード情報を追加）
    const sendPromptRequest = {
      ...request,
      enableDeepResearch,
      specialMode,
    };
    await new Promise((resolve, reject) => {
      handleSendPrompt(sendPromptRequest, (result) => {
        if (result.success) resolve(result);
        else reject(new Error(result.error));
      });
    });

    // 応答収集
    if (AI_TYPE === "ChatGPT") {
      console.log(`[11.autoai][ChatGPT] 応答収集開始...`);
    }

    const responseResult = await new Promise((resolve, reject) => {
      handleGetResponse(
        { taskId, timeout: actualTimeout, enableDeepResearch },
        (result) => {
          if (AI_TYPE === "ChatGPT") {
            console.log(`[11.autoai][ChatGPT] 応答収集結果:`, result);
          }
          if (result.success) resolve(result);
          else reject(new Error(result.error));
        },
      );
    });

    sendResponse({
      success: true,
      taskId,
      prompt,
      response: responseResult.response,
      chunks: responseResult.chunks,
      aiType: AI_TYPE,
      timestamp: new Date().toISOString(),
    });
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

// 停止ボタン監視による回答待機関数
async function waitForResponseWithStopButton() {
  return new Promise((resolve) => {
    let lastText = "";
    let stableCount = 0;

    const check = setInterval(() => {
      // AI種別に応じた停止ボタンセレクタ
      const stopBtn = document.querySelector(
        SelectorFactory.getSelectors(AI_TYPE).STOP_BUTTON?.join(", "),
      );

      // 現在のレスポンステキストを取得
      let currentText = "";
      try {
        switch (AI_TYPE) {
          case "ChatGPT":
            const chatResponse = document.querySelector(
              'div[data-message-author-role="assistant"]:last-child .markdown.prose',
            );
            currentText = chatResponse ? chatResponse.textContent : "";
            break;
          case "Claude":
            const allClaudeMessages = document.querySelectorAll(
              ".font-claude-message",
            );
            const claudeResponse =
              allClaudeMessages.length > 0
                ? allClaudeMessages[allClaudeMessages.length - 1]
                : null;
            // font-claude-messageの2番目の子要素（本文）を取得
            const contentDiv = claudeResponse
              ? claudeResponse.children[1]
              : null;
            currentText = contentDiv ? contentDiv.textContent : "";
            break;
          case "Gemini":
            const geminiResponse = document.querySelector(
              ".markdown-main-panel:last-child",
            );
            currentText = geminiResponse ? geminiResponse.textContent : "";
            break;
        }
      } catch (error) {
        console.error(`[11.autoai][${AI_TYPE}] テキスト取得エラー:`, error);
      }

      console.log(`[11.autoai][${AI_TYPE}] レスポンス監視中`, {
        hasStopButton: !!stopBtn,
        textLength: currentText.length,
        stableCount: stableCount,
      });

      // 停止ボタンがなく、テキストが安定している場合は完了
      if (!stopBtn && currentText.length > 0 && currentText === lastText) {
        stableCount++;
        if (stableCount >= 3) {
          clearInterval(check);
          console.log(`[11.autoai][${AI_TYPE}] レスポンス完了検出`);
          resolve(true);
        }
      } else {
        stableCount = 0;
      }
      lastText = currentText;
    }, 1000);

    // 5分でタイムアウト
    setTimeout(() => {
      clearInterval(check);
      console.log(`[11.autoai][${AI_TYPE}] レスポンス待機タイムアウト`);
      resolve(false);
    }, 300000);
  });
}

// Canvas機能対応の回答取得関数
async function getResponseWithCanvas() {
  switch (AI_TYPE) {
    case "ChatGPT":
      // ChatGPTの回答取得（複数のセレクタを試行）
      let chatResponse = null;
      
      // 複数のセレクタパターンを試行
      const selectors = [
        'div[data-message-author-role="assistant"]:last-child .markdown.prose',
        'div[data-message-author-role="assistant"]:last-child .markdown',
        'div[data-message-author-role="assistant"]:last-child',
        '[data-message-author-role="assistant"]:last-child .prose',
        '[data-message-author-role="assistant"]:last-child',
        '.markdown.prose:last-of-type',
        '.prose:last-of-type'
      ];
      
      for (const selector of selectors) {
        chatResponse = document.querySelector(selector);
        if (chatResponse && chatResponse.textContent?.trim()) {
          console.log(`[ChatGPT] 応答を取得 (セレクタ: ${selector})`);
          break;
        }
      }
      
      if (!chatResponse || !chatResponse.textContent?.trim()) {
        // デバッグ情報を出力
        const allAssistant = document.querySelectorAll('[data-message-author-role="assistant"]');
        console.log(`[ChatGPT] デバッグ: assistant要素数 = ${allAssistant.length}`);
        if (allAssistant.length > 0) {
          console.log(`[ChatGPT] 最後のassistant要素:`, allAssistant[allAssistant.length - 1]);
        }
        throw new Error("ChatGPT: 回答コンテナが見つかりません");
      }
      return chatResponse.textContent.trim();

    case "Claude":
      // Claude: 複数のセレクタで回答要素を探す
      const claudeSelectors = [
        'div[class*="grid-cols-1"]',  // 新しいClaude UI構造
        'p.whitespace-normal',        // 新しいClaude UI構造
        '.font-claude-message',       // 従来のセレクタ
        '[data-testid="conversation-turn-3"]',
        '[data-testid*="conversation-turn"]:last-child',
        '.prose',
        'div[class*="prose"]',
        '.markdown',
        'div[role="presentation"]:last-child'
      ];
      
      let claudeResponse = null;
      let usedSelector = '';
      
      for (const selector of claudeSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          claudeResponse = elements[elements.length - 1];
          usedSelector = selector;
          console.log(`[Claude] 応答要素を発見 (セレクタ: ${selector})`);
          break;
        }
      }
      
      if (!claudeResponse) {
        console.error('[Claude] 回答コンテナが見つかりません。利用可能な要素をデバッグ:');
        console.log('DOM構造:', document.body.innerHTML.substring(0, 1000));
        throw new Error("Claude: 回答コンテナが見つかりません");
      }

      // Canvas機能チェック
      const previewButton = document.querySelector(
        'button[aria-label="内容をプレビュー"]',
      );
      if (previewButton) {
        console.log(
          `[11.autoai][${AI_TYPE}] Canvas機能検出（プレビューボタン方式）`,
        );
        previewButton.click();
        await sleep(1000);
        const textContainer = document.querySelector(
          'div[class*="grid-cols-1"][class*="!gap-3.5"]',
        );
        if (textContainer) {
          const canvasText = textContainer.innerText;
          return canvasText;
        }
      }
      
      // 通常回答モード：複数の方法で回答テキストを取得
      let text = '';
      
      // 方法1: children[1]を試す
      if (claudeResponse.children && claudeResponse.children[1]) {
        text = claudeResponse.children[1].innerText?.replace(/\u00A0/g, " ") || "";
      }
      
      // 方法2: 直接innerTextを試す
      if (!text) {
        text = claudeResponse.innerText?.replace(/\u00A0/g, " ") || "";
      }
      
      // 方法3: textContentを試す
      if (!text) {
        text = claudeResponse.textContent?.replace(/\u00A0/g, " ") || "";
      }
      
      console.log(`[Claude] 応答取得: セレクタ=${usedSelector}, テキスト長=${text.length}`);
      return text;

    case "Gemini":
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

      // 通常回答モード
      const responses = document.querySelectorAll(".markdown-main-panel");
      if (responses.length > 0) {
        const latest = responses[responses.length - 1];
        const text = latest.textContent.replace(/\u00A0/g, " ") || "";
        return text;
      }

      throw new Error("Gemini: 回答コンテナが見つかりません");

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
  window.AI_SELECTORS = SELECTOR_CONFIG;
  window.SelectorFactory = SelectorFactory;
  window.AIInput = AIInput;
  window.ResponseCollector = ResponseCollector;
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

  // タイムアウト設定の読み込みから開始
  loadTimeoutConfig();

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

  const scriptMap = {
    Gemini: "gemini-deepresearch-control.js",
    ChatGPT: "chatgpt-mode-control.js",
    Claude: "claude-mode-control.js",
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
      script.src = chrome.runtime.getURL(scriptMap[AI_TYPE]);
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
              "  - enableClaudeMode:",
              typeof window.enableClaudeMode,
            );
            console.log(
              "  - enableClaudeDeepResearch:",
              typeof window.enableClaudeDeepResearch,
            );

            if (typeof window.enableClaudeDeepResearch !== "undefined") {
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
              "  - enableGeminiDeepResearch:",
              typeof window.enableGeminiDeepResearch,
            );
            console.log(
              "  - disableGeminiDeepResearch:",
              typeof window.disableGeminiDeepResearch,
            );

            if (typeof window.enableGeminiDeepResearch !== "undefined") {
              console.log(
                "[11.autoai][Gemini] ✅ 制御関数が利用可能になりました",
              );
              clearInterval(checkFunctions);
              resolve();
              return;
            }
          } else {
            // ChatGPTなど他のAIの場合
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
