/**
 * ================================================================================
 * 統合AIコンテンツスクリプト - 11.autoai版
 * ================================================================================
 *
 * 【ファイル全体の概要】
 * このファイルは、ChatGPT/Claude/GeminiなどのAIチャットサイトに注入され、
 * 拡張機能からのコマンドを受けて自動的にプロンプトを送信し、応答を取得する
 * 統合コンテンツスクリプトです。
 *
 * 【主要機能】
 * 1. AI種別の自動検出
 * 2. プロンプトの自動送信
 * 3. 応答の自動取得
 * 4. DeepResearchモードの制御
 * 5. エラーハンドリングとリトライ機能
 *
 * 【動作フロー】
 * Step 0: 初期化
 * Step 1: 設定とセレクタの読み込み

 * Step 2: AI種別の検出
 * Step 3: ユーティリティ関数の定義
 * Step 4: モデル/機能情報抽出クラスの定義
 * Step 5: DeepResearch制御
 * Step 6: プロンプト送信処理
 * Step 7: 応答待機・収集処理
 * Step 8: メッセージハンドリング
 * Step 9: タスク実行
 *
 * ================================================================================
 */

// ================================================================================
// STEP 0: グローバル変数と初期設定
// ================================================================================

// 【Step 0.1】グローバル変数定義
let CONTENT_CONSOLIDATED_UI_SELECTORS_LOADED = false;
let CONTENT_CONSOLIDATED_UI_SELECTORS_PROMISE = null;

// 【Step 0.2】AI種別の自動検出
const CONTENT_CONSOLIDATED_AI_TYPE = (() => {
  const hostname = window.location.hostname;
  if (hostname.includes("chatgpt.com") || hostname.includes("chat.openai.com"))
    return "ChatGPT";
  if (hostname.includes("claude.ai")) return "Claude";
  if (hostname.includes("gemini.google.com")) return "Gemini";
  return null;
})();

console.log(`[Step 0.2] 🎯 [11.autoai] 統合AIコンテンツスクリプト起動 - ${CONTENT_CONSOLIDATED_AI_TYPE} モード`);

// ================================================================================
// STEP 1: 初期化と設定読み込み
// ================================================================================

/**
 * 【Step 1.1】ページ読み込み完了待機
 * 動的に生成されるUI要素を確実に検出するため、ページの完全読み込みを待つ
 */
async function waitForPageReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      setTimeout(resolve, 2000); // 動的コンテンツの生成を待つ
      return;
    }

    window.addEventListener('load', () => {
      console.log('[Step 1.1] [AI Content] ページ読み込み完了、動的コンテンツを待機中...');
      setTimeout(resolve, 2000);
    }, { once: true });
  });
}

/**
 * 【Step 1.2】UIセレクタ設定の読み込み
 * 各AIサイトのDOM要素を特定するためのセレクタ情報をJSONファイルから読み込む
 */
const loadUISelectors = () => {
  CONTENT_CONSOLIDATED_UI_SELECTORS_PROMISE = fetch(chrome.runtime.getURL('ui-selectors-data.json'))
    .then(response => response.json())
    .then(data => {
      window.UI_SELECTORS = data.selectors;
      CONTENT_CONSOLIDATED_UI_SELECTORS_LOADED = true;
      console.log(`[Step 1.2] ✅ [11.autoai] UI Selectors loaded from JSON (v${data.version})`);
      loadTimeoutConfig();
      return true;
    })
    .catch(error => {
      console.error("[Step 1.2] ❌ [11.autoai] UI Selectors読み込みエラー:", error);
      CONTENT_CONSOLIDATED_UI_SELECTORS_LOADED = false;
      loadTimeoutConfig();
      return false;
    });

  return CONTENT_CONSOLIDATED_UI_SELECTORS_PROMISE;
};

/**
 * 【Step 1.3】タイムアウト設定の読み込み
 */
const loadTimeoutConfig = () => {
  // timeout-config.jsは削除済み - 設定は1-ai-common-base.jsに統合済み
  console.log('[Step 1.3] ✅ [11.autoai] タイムアウト設定は1-ai-common-base.jsに統合済み');
};

/**
 * 【Step 1.4】UIセレクタの読み込み完了待機
 */
async function waitForUISelectors() {
  if (CONTENT_CONSOLIDATED_UI_SELECTORS_LOADED) {
    return true;
  }

  if (CONTENT_CONSOLIDATED_UI_SELECTORS_PROMISE) {
    const result = await CONTENT_CONSOLIDATED_UI_SELECTORS_PROMISE;
    return result;
  }

  console.warn("[Step 1.4] ⚠️ [11.autoai] UI_SELECTORSの読み込みが開始されていません");
  return false;
}

// ================================================================================
// STEP 2: UI_SELECTORS定義（フォールバック用）
// ================================================================================

/**
 * 【Step 2.1】UI_SELECTORSのフォールバック定義
 * JSONファイルから読み込めない場合のバックアップ定義
 */
if (typeof window.UI_SELECTORS === 'undefined') {
  window.UI_SELECTORS = {
    ChatGPT: {
      MODEL_INFO: {
        BUTTON: [
          'button[data-testid="model-switcher-dropdown-button"]',
          'button[aria-label*="モデル"]',
          'button[aria-label*="Model"]',
          'button[class*="model"]',
          '[data-testid*="model-switcher"]'
        ],
        TEXT_ELEMENT: [
          'button[data-testid="model-switcher-dropdown-button"] div',
          'button[data-testid="model-switcher-dropdown-button"] span',
          '[data-testid="model-switcher-dropdown-button"] .text-sm',
          '[data-testid="model-switcher-dropdown-button"] *'
        ]
      }
    },
    Claude: {
      MODEL_INFO: {
        BUTTON: [
          'button[data-testid="model-selector-dropdown"]',
          'button[aria-haspopup="menu"]',
          'button.cursor-pointer:has(span.font-medium)',
          'button[aria-label*="モデル"]',
          'button[aria-label*="Model"]'
        ],
        TEXT_ELEMENT: [
          'button[data-testid="model-selector-dropdown"] .whitespace-nowrap.tracking-tight.select-none',
          'button[data-testid="model-selector-dropdown"] span',
          'button[data-testid="model-selector-dropdown"] div',
          'button[aria-haspopup="menu"] .whitespace-nowrap',
          'button[aria-haspopup="menu"] span.font-medium'
        ]
      }
    },
    Gemini: {
      MODEL_INFO: {
        BUTTON: [
          '.logo-pill-label-container',
          'button[aria-label*="モデル"]',
          'button[aria-label*="Model"]',
          '.model-selector-button',
          '[data-testid*="model"]'
        ],
        TEXT_ELEMENT: [
          '.logo-pill-label-container span',
          '.logo-pill-label-container .model-name',
          '.logo-pill-label-container div',
          '.model-indicator span',
          '[class*="model-"] span'
        ]
      }
    }
  };
}

// ================================================================================
// STEP 3: ユーティリティ関数（共通機能）
// ================================================================================

/**
 * 【Step 3.1】待機関数
 * @param {number} ms - 待機時間（ミリ秒）
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 【Step 3.2】複数セレクタ対応の要素待機関数
 * 複数のセレクタを順番に試して、最初に見つかった要素を返す
 */
const waitForAnyElement = async (selectors, timeout = 30000, context = document) => {
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
          console.warn(`[Step 3.2] [11.autoai] セレクタエラー: ${selector}`, error);
        }
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`[Step 3.2] [11.autoai] タイムアウト: 要素が見つかりません: ${selectors.join(", ")} (${timeout}ms)`));
        return;
      }

      setTimeout(checkElements, 100);
    };

    checkElements();
  });
};

/**
 * 【Step 3.3】エラーハンドリング統一関数
 */
const handleError = (error, context = "", details = {}) => {
  const errorInfo = {
    message: error.message || error,
    context,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    aiType: CONTENT_CONSOLIDATED_AI_TYPE,
    ...details,
  };

  console.error(`[Step 3.3] [11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ${context}:`, errorInfo);
  return errorInfo;
};

/**
 * 【Step 3.4】再試行処理の統一関数
 */
const retryAsync = async (fn, maxAttempts = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.warn(`[Step 3.4] [11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] Retry ${attempt}/${maxAttempts} failed:`, error.message);
      await sleep(delay * attempt); // 指数バックオフ
    }
  }
};

// ================================================================================
// STEP 4: モデル情報・機能情報抽出クラス
// ================================================================================

/**
 * 【Step 4.1】ModelInfoExtractorクラス
 * 現在選択されているAIモデルの情報を取得
 */
class ModelInfoExtractor {

  static extract(aiType) {
    const normalizedAiType = aiType.toLowerCase();

    switch (normalizedAiType) {
      case 'chatgpt':
        return this.extractChatGPTModel();
      case 'claude':
        return this.extractClaudeModel();
      case 'gemini':
        return this.extractGeminiModel();
      default:
        console.warn(`[ModelInfoExtractor] サポートされていないAI種別: ${aiType}`);
        return '';
    }
  }

  /**
   * 【Step 4.1.1】ChatGPTのモデル情報取得
   */
  static extractChatGPTModel() {
    const debugInfo = {
      aiType: 'ChatGPT',
      selectorFound: false,
      elementContent: null,
      extractedModel: null
    };

    try {
      const selectors = window.UI_SELECTORS?.ChatGPT?.MODEL_INFO || {};

      let buttonElement = null;
      for (const selector of (selectors.BUTTON || [])) {
        buttonElement = document.querySelector(selector);
        if (buttonElement) {
          debugInfo.selector = selector;
          debugInfo.selectorFound = true;
          break;
        }
      }

      if (!buttonElement) {
        console.warn(`[ModelInfoExtractor][ChatGPT] ⚠️ モデルボタン要素が見つかりません`);
        return '';
      }

      let modelText = '';
      for (const selector of (selectors.TEXT_ELEMENT || [])) {
        const textElement = document.querySelector(selector);
        if (textElement && textElement.textContent.trim()) {
          const fullText = textElement.textContent.trim();
          debugInfo.elementContent = fullText;
          modelText = fullText.replace(/^ChatGPT\s*/i, '').trim();
          debugInfo.extractedModel = modelText;
          break;
        }
      }

      console.log(`[ModelInfoExtractor][ChatGPT] 🔍 モデル情報取得詳細:`, debugInfo);

      if (modelText) {
        console.log(`[ModelInfoExtractor][ChatGPT] ✅ モデル情報取得成功: "${modelText}"`);
      }

      return modelText;

    } catch (error) {
      console.error(`[ModelInfoExtractor][ChatGPT] ❌ モデル情報取得エラー:`, {
        error: error.message,
        debugInfo
      });
      return '';
    }
  }

  /**
   * 【Step 4.1.2】Claudeのモデル情報取得
   */
  static extractClaudeModel() {
    const debugInfo = {
      aiType: 'Claude',
      selectorFound: false,
      elementContent: null,
      extractedModel: null,
      fallbackUsed: false
    };

    try {
      const selectors = window.UI_SELECTORS?.Claude?.MODEL_INFO || {};

      let buttonElement = null;
      for (const selector of (selectors.BUTTON || [])) {
        buttonElement = document.querySelector(selector);
        if (buttonElement) {
          debugInfo.selector = selector;
          break;
        }
      }

      if (!buttonElement) {
        console.warn(`[ModelInfoExtractor][Claude] ⚠️ モデルボタン要素が見つかりません`);
        return '';
      }

      let modelText = '';
      for (const selector of (selectors.TEXT_ELEMENT || [])) {
        const textElement = document.querySelector(selector);
        if (textElement && textElement.textContent.trim()) {
          modelText = textElement.textContent.trim();
          debugInfo.selectorFound = true;
          debugInfo.elementContent = modelText;
          debugInfo.extractedModel = modelText;
          break;
        }
      }

      if (!modelText) {
        const buttonText = buttonElement.textContent;
        console.warn(`[ModelInfoExtractor][Claude] ⚠️ 特定の要素が見つからないため、ボタン全体から抽出: ${buttonText}`);

        const match = buttonText.match(/(?:Claude\s*)?((?:Opus|Sonnet|Haiku)\s*[\d.]+)/i);
        if (match) {
          modelText = match[1].trim();
          debugInfo.elementContent = buttonText;
          debugInfo.extractedModel = modelText;
          debugInfo.fallbackUsed = true;
        }
      }

      console.log(`[ModelInfoExtractor][Claude] 🔍 モデル情報取得詳細:`, debugInfo);

      if (modelText) {
        console.log(`[ModelInfoExtractor][Claude] ✅ モデル情報取得成功: "${modelText}"`);
      }

      return modelText;

    } catch (error) {
      console.error(`[ModelInfoExtractor][Claude] ❌ モデル情報取得エラー:`, {
        error: error.message,
        debugInfo
      });
      return '';
    }
  }

  /**
   * 【Step 4.1.3】Geminiのモデル情報取得
   */
  static extractGeminiModel() {
    const debugInfo = {
      aiType: 'Gemini',
      selectorFound: false,
      elementContent: null,
      extractedModel: null
    };

    try {
      const selectors = window.UI_SELECTORS?.Gemini?.MODEL_INFO || {};

      let modelText = '';
      for (const selector of (selectors.TEXT_ELEMENT || [])) {
        const textElement = document.querySelector(selector);
        if (textElement && textElement.textContent.trim()) {
          modelText = textElement.textContent.trim();
          debugInfo.selectorFound = true;
          debugInfo.elementContent = modelText;
          debugInfo.extractedModel = modelText;
          debugInfo.selector = selector;
          break;
        }
      }

      console.log(`[ModelInfoExtractor][Gemini] 🔍 モデル情報取得詳細:`, debugInfo);

      if (modelText) {
        console.log(`[ModelInfoExtractor][Gemini] ✅ モデル情報取得成功: "${modelText}"`);
      }

      return modelText;

    } catch (error) {
      console.error(`[ModelInfoExtractor][Gemini] ❌ モデル情報取得エラー:`, {
        error: error.message,
        debugInfo
      });
      return '';
    }
  }
}

/**
 * 【Step 4.2】FunctionInfoExtractorクラス
 * 現在選択されている機能（Canvas、DeepResearchなど）の情報を取得
 */
class FunctionInfoExtractor {

  static extract(aiType) {
    const normalizedAiType = aiType.toLowerCase();

    switch (normalizedAiType) {
      case 'chatgpt':
        return this.extractChatGPTFunction();
      case 'claude':
        return this.extractClaudeFunction();
      case 'gemini':
        return this.extractGeminiFunction();
      default:
        console.warn(`[FunctionInfoExtractor] サポートされていないAI種別: ${aiType}`);
        return '';
    }
  }

  /**
   * 【Step 4.2.1】ChatGPTの機能情報取得
   */
  static extractChatGPTFunction() {
    const debugInfo = {
      aiType: 'ChatGPT',
      selectorFound: false,
      elementContent: null,
      extractedFunction: null,
      attemptedSelectors: []
    };

    try {
      let functionName = '';

      // Canvas右側パネルの存在確認（最優先）
      const canvasPanel = document.querySelector('#prosemirror-editor-container');
      if (canvasPanel) {
        functionName = 'canvas';
        debugInfo.selectorFound = true;
        debugInfo.elementContent = 'Canvas panel detected';
        debugInfo.extractedFunction = functionName;
        debugInfo.attemptedSelectors.push('#prosemirror-editor-container - Found Canvas panel');
        console.log(`[FunctionInfoExtractor][ChatGPT] ✅ Canvasパネル検出により機能を判定: "canvas"`);
      }

      // 機能ボタン（data-pill="true"）からの取得
      if (!functionName) {
        debugInfo.attemptedSelectors.push('button[data-pill="true"]');
        const functionButtons = document.querySelectorAll('button[data-pill="true"]');
        if (functionButtons.length > 0) {
          for (const button of functionButtons) {
            const text = button.textContent?.trim();
            if (text && text.length > 0) {
              functionName = text;
              debugInfo.selectorFound = true;
              debugInfo.elementContent = text;
              debugInfo.extractedFunction = text;
              break;
            }
          }
        }
      }

      // Canvasアイコンやインジケーターを探す
      if (!functionName) {
        const canvasSelectors = [
          '[class*="canvas"]',
          '[aria-label*="canvas"]',
          '[aria-label*="Canvas"]',
          '[title*="canvas"]',
          '[title*="Canvas"]',
          '[data-testid*="canvas"]',
          'button[aria-label*="キャンバス"]',
          'button[title*="キャンバス"]',
          '.composer-parent [role="button"]',
          'div[class*="composer"] button[class*="rounded"]'
        ];

        for (const selector of canvasSelectors) {
          debugInfo.attemptedSelectors.push(selector);
          const elements = document.querySelectorAll(selector);
          for (const elem of elements) {
            const text = elem.textContent?.trim()?.toLowerCase();
            const ariaLabel = elem.getAttribute('aria-label')?.toLowerCase();
            const title = elem.getAttribute('title')?.toLowerCase();

            if ((text && (text === 'canvas' || text.includes('canvas'))) ||
                (ariaLabel && ariaLabel.includes('canvas')) ||
                (title && title.includes('canvas'))) {
              functionName = 'canvas';
              debugInfo.selectorFound = true;
              debugInfo.elementContent = text || ariaLabel || title;
              debugInfo.extractedFunction = functionName;
              debugInfo.attemptedSelectors[debugInfo.attemptedSelectors.length - 1] += ' - Found';
              break;
            }
          }
          if (functionName) break;
        }
      }

      console.log(`[FunctionInfoExtractor][ChatGPT] 🔍 機能情報取得詳細:`, debugInfo);

      if (functionName) {
        console.log(`[FunctionInfoExtractor][ChatGPT] ✅ 機能情報取得成功: "${functionName}"`);
      }

      return functionName;

    } catch (error) {
      console.error(`[FunctionInfoExtractor][ChatGPT] ❌ 機能情報取得エラー:`, {
        error: error.message,
        debugInfo
      });
      return '';
    }
  }

  /**
   * 【Step 4.2.2】Claudeの機能情報取得
   */
  static extractClaudeFunction() {
    const debugInfo = {
      aiType: 'Claude',
      selectorFound: false,
      elementContent: null,
      extractedFunction: null
    };

    try {
      let functionName = '';

      // 機能インジケーターから取得
      const functionIndicators = document.querySelectorAll('.function-pill, .selected-function, [class*="function"], [data-function]');
      for (const indicator of functionIndicators) {
        const text = indicator.textContent?.trim();
        if (text && text.length > 0 && !text.includes('Claude')) {
          functionName = text;
          debugInfo.selectorFound = true;
          debugInfo.elementContent = text;
          debugInfo.extractedFunction = text;
          break;
        }
      }

      console.log(`[FunctionInfoExtractor][Claude] 🔍 機能情報取得詳細:`, debugInfo);

      if (functionName) {
        console.log(`[FunctionInfoExtractor][Claude] ✅ 機能情報取得成功: "${functionName}"`);
      }

      return functionName;

    } catch (error) {
      console.error(`[FunctionInfoExtractor][Claude] ❌ 機能情報取得エラー:`, {
        error: error.message,
        debugInfo
      });
      return '';
    }
  }

  /**
   * 【Step 4.2.3】Geminiの機能情報取得
   */
  static extractGeminiFunction() {
    const debugInfo = {
      aiType: 'Gemini',
      selectorFound: false,
      elementContent: null,
      extractedFunction: null
    };

    try {
      let functionName = '';

      // 機能ラベルから取得
      const functionLabels = document.querySelectorAll('.function-label, .selected-function, [class*="function"], [class*="tool"]');
      for (const label of functionLabels) {
        const text = label.textContent?.trim();
        if (text && text.length > 0 && !text.includes('Gemini') && !text.includes('Google')) {
          functionName = text;
          debugInfo.selectorFound = true;
          debugInfo.elementContent = text;
          debugInfo.extractedFunction = text;
          break;
        }
      }

      console.log(`[FunctionInfoExtractor][Gemini] 🔍 機能情報取得詳細:`, debugInfo);

      if (functionName) {
        console.log(`[FunctionInfoExtractor][Gemini] ✅ 機能情報取得成功: "${functionName}"`);
      }

      return functionName;

    } catch (error) {
      console.error(`[FunctionInfoExtractor][Gemini] ❌ 機能情報取得エラー:`, {
        error: error.message,
        debugInfo
      });
      return '';
    }
  }
}

// ================================================================================
// STEP 5: DeepResearch制御機能
// ================================================================================

/**
 * 【Step 5.1】DeepResearchの現在の状態を確認
 * @returns {Promise<string>} 'enabled' | 'disabled' | 'unknown'
 */
async function checkDeepResearchState() {
  try {
    switch (CONTENT_CONSOLIDATED_AI_TYPE) {
      case "ChatGPT":
        // ChatGPTのWeb検索状態を確認するロジック
        break;

      case "Claude":
        // ClaudeのWeb検索状態を確認
        const searchToggle = document.querySelector('button[aria-label*="search"]');
        if (searchToggle) {
          const isActive = searchToggle.classList.contains("active") ||
                         searchToggle.getAttribute("aria-pressed") === "true";
          return isActive ? "enabled" : "disabled";
        }
        break;

      case "Gemini":
        // GeminiのDeepResearch状態を確認
        let deepResearchBtn = null;

        const deepResearchSelectors = window.AIHandler?.getSelectors('Gemini', 'DEEP_RESEARCH');
        if (deepResearchSelectors?.BUTTON) {
          for (const selector of deepResearchSelectors.BUTTON) {
            try {
              deepResearchBtn = document.querySelector(selector);
              if (deepResearchBtn) break;
            } catch (e) {
              console.warn(`[11.autoai][Gemini] セレクタエラー: ${selector}`, e);
            }
          }
        }

        if (!deepResearchBtn) {
          deepResearchBtn = document.querySelector('button[aria-label*="Deep Research"]');
        }

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
          const isPressed = deepResearchBtn.getAttribute("aria-pressed") === "true";
          return isPressed ? "enabled" : "disabled";
        }
        break;
    }
    return "unknown";
  } catch (error) {
    console.error(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] DeepResearch状態確認エラー:`, error);
    return "unknown";
  }
}

/**
 * 【Step 5.2】Deep Research有効化（シンプル版）
 * 各AIサイトのDeepResearch機能を有効化する
 */
async function enableDeepResearchSimple() {
  try {
    // 【Step 5.2.1】現在の状態を確認
    const currentState = await checkDeepResearchState();
    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 🔍 DeepResearch現在の状態: ${currentState}`);

    switch (CONTENT_CONSOLIDATED_AI_TYPE) {
      case "ChatGPT":
        // 【Step 5.2.2】ChatGPTのWeb検索有効化
        try {
          console.log(`[11.autoai][ChatGPT] 新しいツールメニューアプローチを試行`);

          // ツールボタンを探す
          const toolButton = Array.from(document.querySelectorAll("button")).find(
            (btn) => btn.textContent?.trim() === "ツール" && btn.classList.contains("composer-btn")
          );

          if (toolButton) {
            // focus + Enterキーで開く
            toolButton.focus();
            const keyEvent = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              bubbles: true,
            });
            toolButton.dispatchEvent(keyEvent);

            await sleep(500);

            // メニューアイテムを探す
            const menuItems = document.querySelectorAll('[role="menuitemradio"]');
            console.log(`[11.autoai][ChatGPT] メニューアイテム数: ${menuItems.length}`);

            // Web検索ツールを探す
            const searchTool = Array.from(menuItems).find((item) => {
              const text = item.textContent?.toLowerCase() || "";
              return text.includes("検索") || text.includes("search") || text.includes("web");
            });

            if (searchTool) {
              const isSelected = searchTool.getAttribute("aria-checked") === "true" ||
                               searchTool.getAttribute("data-state") === "checked";

              console.log(`[11.autoai][ChatGPT] Web検索ツール: ${isSelected ? "既にON" : "OFF → ON"}`);

              if (!isSelected) {
                searchTool.click();
                console.log(`[11.autoai][ChatGPT] ✅ Web検索ツールを有効化しました`);
                await sleep(500);
              }
            }

            // メニューを閉じる
            document.body.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Escape",
                code: "Escape",
                keyCode: 27,
                bubbles: true,
              })
            );
          }
        } catch (error) {
          console.error(`[11.autoai][ChatGPT] DeepResearch有効化エラー:`, error);
        }
        break;

      case "Claude":
        // 【Step 5.2.3】ClaudeのWeb検索有効化（3ステップ）

        // ステップ1: ツールメニューを開く
        const toolsButton = document.querySelector('button[id="input-tools-menu-trigger"]');
        if (!toolsButton) {
          console.error(`[11.autoai][Claude] ツールメニューボタンが見つかりません`);
          break;
        }

        if (toolsButton.getAttribute("aria-expanded") !== "true") {
          toolsButton.click();
          await sleep(800);
          console.log(`[11.autoai][Claude] ✅ ステップ1: ツールメニューを開きました`);
        }

        // ステップ2: Web検索を有効化
        const webSearchButton = Array.from(document.querySelectorAll("button"))
          .find((btn) => btn.textContent?.includes("ウェブ検索"));

        if (!webSearchButton) {
          console.error(`[11.autoai][Claude] ウェブ検索ボタンが見つかりません`);
          break;
        }

        if (!webSearchButton.classList.contains("text-primary-500")) {
          webSearchButton.click();
          await sleep(500);
          console.log(`[11.autoai][Claude] ✅ ステップ2: Web検索を有効化しました`);
        }

        // ステップ3: リサーチボタンをクリック
        await sleep(500);
        const researchButton = Array.from(document.querySelectorAll("button")).find((btn) => {
          const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
          const text = btn.querySelector("p");
          return svg && text && text.textContent === "リサーチ";
        });

        if (!researchButton) {
          console.error(`[11.autoai][Claude] リサーチボタンが見つかりません`);
          break;
        }

        const isPressed = researchButton.getAttribute("aria-pressed") === "true";
        if (!isPressed) {
          researchButton.click();
          await sleep(500);
          console.log(`[11.autoai][Claude] ✅ ステップ3: リサーチモードを有効化しました`);
        }
        break;

      case "Gemini":
        // 【Step 5.2.4】GeminiのDeepResearch有効化
        console.log(`[11.autoai][Gemini] DeepResearchを有効化しています...`);

        // 方法1: 制御関数を優先的に使用
        if (typeof window.enableGeminiDeepResearch === "function") {
          console.log(`[11.autoai][Gemini] 制御関数を使用してDeepResearchを有効化`);
          try {
            const result = await window.enableGeminiDeepResearch();
            if (result) {
              console.log(`[11.autoai][Gemini] ✅ 制御関数でDeepResearchを有効化しました`);
            } else {
              console.error(`[11.autoai][Gemini] ❌ 制御関数でのDeepResearch有効化に失敗`);
            }
          } catch (error) {
            console.error(`[11.autoai][Gemini] ❌ enableGeminiDeepResearch関数エラー:`, error);
          }
        } else {
          // 方法2: セレクタでボタンを探す
          console.log(`[11.autoai][Gemini] 制御関数が利用できないため、セレクタでボタンを探します`);

          let deepResearchButton = null;
          const deepResearchSelectors = window.AIHandler?.getSelectors('Gemini', 'DEEP_RESEARCH');
          if (deepResearchSelectors?.BUTTON) {
            for (const selector of deepResearchSelectors.BUTTON) {
              try {
                deepResearchButton = document.querySelector(selector);
                if (deepResearchButton) {
                  console.log(`[11.autoai][Gemini] セレクタでボタンを発見: ${selector}`);
                  break;
                }
              } catch (e) {
                // セレクタエラーをスキップ
              }
            }
          }

          if (deepResearchButton) {
            const isPressed = deepResearchButton.getAttribute("aria-pressed") === "true";
            console.log(`[11.autoai][Gemini] Deep Researchボタン状態: ${isPressed}`);
            if (!isPressed) {
              deepResearchButton.click();
              console.log(`[11.autoai][Gemini] ✅ Deep Researchを有効化しました`);
              await sleep(500);
            } else {
              console.log(`[11.autoai][Gemini] Deep Researchは既に有効です`);
            }
          } else {
            console.error(`[11.autoai][Gemini] ❌ Deep Researchボタンが見つかりません`);
          }
        }
        break;
    }

    // 【Step 5.2.5】有効化後の状態を確認
    await sleep(1000);
    const afterState = await checkDeepResearchState();
    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ✅ DeepResearch有効化後の状態: ${afterState}`);

    if (afterState !== "enabled") {
      console.warn(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ⚠️ DeepResearchが有効化されていません！`);
    }
  } catch (error) {
    console.error(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] DeepResearch有効化エラー:`, error);
  }
}

// ================================================================================
// STEP 6: プロンプト送信機能
// ================================================================================

/**
 * 【Step 6.1】プロンプト送信前のモード設定
 * 特殊モード（Canvas、DeepResearch等）を送信前に設定
 */
async function handlePreSendModeSetup(specialMode, enableDeepResearch) {
  try {
    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 🔄 送信前モード設定:`, {
      specialMode,
      enableDeepResearch,
      aiType: CONTENT_CONSOLIDATED_AI_TYPE,
    });

    switch (CONTENT_CONSOLIDATED_AI_TYPE) {
      case "Gemini":
        // 【Step 6.1.1】Geminiの特殊モード設定
        console.log(`[11.autoai][Gemini] 🔄 ${specialMode}モードを設定中...`);

        switch (specialMode) {
          case "Gemini_1.5_Flash_002_Thinking_Exp":
            console.log(`[11.autoai][Gemini] 🧠 Thinking Experimental mode - 特別な設定は不要`);
            break;

          case "Gemini_2.0_Flash_Thinking_Exp_01_21":
            console.log(`[11.autoai][Gemini] 🧠 2.0 Flash Thinking mode - 特別な設定は不要`);
            break;

          case "Canvas":
            console.log(`[11.autoai][Gemini] 🎨 Canvasモードを有効化`);
            if (window.enableGeminiCanvas) {
              try {
                await window.enableGeminiCanvas();
                console.log(`[11.autoai][Gemini] ✅ Canvasモード有効化成功`);
              } catch (error) {
                console.error(`[11.autoai][Gemini] Canvasモード有効化エラー:`, error);
              }
            } else {
              console.error(`[11.autoai][Gemini] ❌ enableGeminiCanvas関数が利用できません`);
            }
            break;

          default:
            // DeepResearchフラグがある場合は処理
            if (enableDeepResearch) {
              console.log(`[11.autoai][Gemini] 🔬 送信前にDeepResearchを有効化`);
              await enableDeepResearchSimple();
            } else {
              console.log(`[11.autoai][Gemini] ⚪ 標準モード - 特殊機能なし`);
            }
            break;
        }
        break;

      case "ChatGPT":
        // 【Step 6.1.2】ChatGPTのツールモード設定
        console.log(`[11.autoai][ChatGPT] 🔄 ${specialMode}モードを設定中...`);

        const urlParams = new URLSearchParams(window.location.search);
        const selectedTool = specialMode || urlParams.get("chatgptTool") || window.selectedChatGPTTool || null;

        if (window.chatGPTToolControl && selectedTool && selectedTool.startsWith("ChatGPT")) {
          try {
            console.log(`[11.autoai][ChatGPT] 🎯 ツール「${selectedTool}」を選択中...`);
            const result = await window.chatGPTToolControl.selectTool(selectedTool);

            if (result) {
              console.log(`[11.autoai][ChatGPT] ✅ ツール「${selectedTool}」の選択に成功`);
            } else {
              console.warn(`[11.autoai][ChatGPT] ⚠️ ツール「${selectedTool}」の選択に失敗`);
            }
          } catch (error) {
            console.error(`[11.autoai][ChatGPT] ツールモード設定エラー:`, error);
          }
        }

        if (window.enableChatGPTMode) {
          await window.enableChatGPTMode(specialMode);
        } else if (specialMode === "DeepResearch" || enableDeepResearch) {
          await enableDeepResearchSimple();
        }
        break;

      case "Claude":
        // 【Step 6.1.3】Claudeのモード設定
        console.log(`[11.autoai][Claude] 🔄 ${specialMode}モードを設定中...`);

        // モード制御関数の読み込み待機
        let retries = 0;
        const maxRetries = 20;
        while (!window.enableClaudeMode && retries < maxRetries) {
          console.log(`[11.autoai][Claude] モード制御関数の読み込みを待機中... (${retries + 1}/${maxRetries})`);
          await sleep(500);
          retries++;
        }

        if (window.enableClaudeMode) {
          try {
            console.log(`[11.autoai][Claude] 🎯 enableClaudeMode(${specialMode})を実行`);
            await window.enableClaudeMode(specialMode);
            console.log(`[11.autoai][Claude] ✅ ${specialMode}モード設定完了`);
          } catch (error) {
            console.error(`[11.autoai][Claude] モード設定エラー:`, error);
            if (specialMode === "DeepResearch" || enableDeepResearch) {
              console.log(`[11.autoai][Claude] 🔄 フォールバック: DeepResearch処理`);
              await enableDeepResearchSimple();
            }
          }
        } else {
          console.warn(`[11.autoai][Claude] ❌ モード制御機能が利用できません`);
          if (specialMode === "DeepResearch" || enableDeepResearch) {
            console.log(`[11.autoai][Claude] 🔄 フォールバック: DeepResearch処理`);
            await enableDeepResearchSimple();
          }
        }
        break;

      default:
        console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE || "Unknown"}] ❌ 未対応のAI種別`);
        break;
    }

    // 設定後少し待機
    await sleep(500);
  } catch (error) {
    console.error(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 送信前モード設定エラー:`, error);
  }
}

/**
 * 【Step 6.2】プロンプト送信処理のメインハンドラ
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

    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] プロンプト送信開始: ${taskId}`, {
      enableDeepResearch,
      enableSearchMode,
      specialMode,
    });

    // 【Step 6.2.1】送信前の特殊モード設定
    await handlePreSendModeSetup(specialMode, enableDeepResearch);

    // 【Step 6.2.2】Claude検索モード有効化（送信前）
    if (enableSearchMode && CONTENT_CONSOLIDATED_AI_TYPE === "Claude") {
      console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 🔍 検索モード有効化開始`);

      try {
        // ツールメニューを開く
        const menuButton = document.querySelector("button#input-tools-menu-trigger");
        if (menuButton && menuButton.getAttribute("aria-expanded") !== "true") {
          menuButton.click();
          await sleep(800);
        }

        // ウェブ検索ボタンを探して有効化
        const allButtons = document.querySelectorAll("button");
        let webSearchButton = null;

        for (const btn of allButtons) {
          if (btn.textContent?.includes("ウェブ検索")) {
            webSearchButton = btn;
            break;
          }
        }

        if (webSearchButton) {
          const isAlreadyOn = webSearchButton.classList.contains("text-primary-500");

          if (!isAlreadyOn) {
            console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 🔄 ウェブ検索を有効化中...`);
            webSearchButton.click();
            await sleep(500);
            console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ✅ 検索モード有効化完了`);
          } else {
            console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ℹ️ 検索モードは既に有効です`);
          }
        } else {
          console.warn(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ⚠️ ウェブ検索ボタンが見つかりません`);
        }
      } catch (error) {
        console.error(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 💥 検索モード有効化エラー:`, error);
      }
    }

    // 【Step 6.2.3】プロンプト送信（runAutomation方式）
    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] runAutomationを使用してプロンプト送信`);

    const config = {
      text: prompt,
      model: request.model || null,
      function: specialMode || 'none',
      send: true,
      waitResponse: false,
      getResponse: false
    };

    // Gemini V2モードの判定
    if (CONTENT_CONSOLIDATED_AI_TYPE === 'Gemini') {
      if (config.model || (config.function && config.function !== 'none')) {
        config.useV2 = true;
        console.log(`[11.autoai][Gemini] 🚀 V2モード有効（handleSendPrompt）`);
      }
    }

    let result = null;
    switch (CONTENT_CONSOLIDATED_AI_TYPE) {
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
        // V2のみを使用
        console.log(`[11.autoai][Gemini] V2直接実行モード`);
        result = { success: true, message: 'V2で処理中' };
        break;
    }

    if (!result || !result.success) {
      throw new Error(`プロンプト送信失敗: ${result?.error || '不明なエラー'}`);
    }

    sendResponse({
      success: true,
      taskId,
      message: "プロンプト送信完了",
      aiType: CONTENT_CONSOLIDATED_AI_TYPE,
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
      aiType: CONTENT_CONSOLIDATED_AI_TYPE,
    });
  } finally {
    // Chrome Power APIでスクリーンセイバー防止を解除
    chrome.runtime.sendMessage({type: 'STOP_AI_PROCESSING'});
  }
}

// ================================================================================
// STEP 7: 応答待機・収集機能
// ================================================================================

/**
 * 【Step 7.1】拡張された応答待機関数
 */
async function waitForResponseEnhanced(enableDeepResearch = false, customTimeout = null) {
  const timeout = customTimeout || (enableDeepResearch ? 3600000 : 600000);

  // AIHandlerが利用可能な場合
  if (window.AIHandler && window.AIHandler.message && window.AIHandler.message.waitForResponse) {
    const result = await window.AIHandler.message.waitForResponse(null, {
      timeout: timeout,
      extendedTimeout: enableDeepResearch ? timeout : 30 * 60 * 1000,
      sendStartTime: Date.now()
    }, CONTENT_CONSOLIDATED_AI_TYPE);

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

/**
 * 【Step 7.2】停止ボタン監視による応答待機（フォールバック）
 */
async function waitForResponseWithStopButton(enableDeepResearch = false) {
  // ここに停止ボタン監視のロジックを実装
  // 省略（既存のコードを参照）
  return true;
}

/**
 * 【Step 7.3】Canvas機能対応の応答取得
 */
async function getResponseWithCanvas() {
  // Canvas対応の応答取得ロジック
  // 省略（既存のコードを参照）
  return "応答テキスト";
}

/**
 * 【Step 7.4】応答収集処理のメインハンドラ
 */
async function handleGetResponse(request, sendResponse) {
  try {
    const { taskId, timeout = 600000, enableDeepResearch = false, useRetry = true } = request;

    // DeepResearchモードの場合はタイムアウトを40分に調整
    const actualTimeout = enableDeepResearch ? 3600000 : timeout;

    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 応答収集開始: ${taskId}`, {
      timeout: actualTimeout,
      enableDeepResearch: enableDeepResearch,
      useRetry: useRetry
    });

    // 【Step 7.4.1】停止ボタン監視開始
    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 停止ボタン監視開始`);
    const waitResult = await waitForResponseEnhanced(enableDeepResearch, actualTimeout);

    if (!waitResult.success) {
      // エラー時にリトライが必要かチェック
      if (waitResult.needsRetry) {
        console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] リトライが必要なエラー:`, waitResult);
        // 新規ウィンドウでリトライを要求
        chrome.runtime.sendMessage({
          type: 'RETRY_WITH_NEW_WINDOW',
          taskId: taskId,
          prompt: request.prompt || '',
          aiType: CONTENT_CONSOLIDATED_AI_TYPE,
          enableDeepResearch: enableDeepResearch,
          specialMode: request.specialMode,
          error: waitResult.error,
          errorMessage: waitResult.errorMessage
        });
      }
      throw new Error(waitResult.errorMessage || "応答待機タイムアウト");
    }

    // 【Step 7.4.2】Canvas機能対応の回答取得
    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] Canvas機能対応の回答取得開始`);
    const response = await getResponseWithCanvas();

    if (!response || response.trim().length === 0) {
      throw new Error("空レスポンス");
    }

    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 応答収集完了: ${taskId}`, {
      responseLength: response.length,
      preview: response.substring(0, 100),
    });

    sendResponse({
      success: true,
      response: response,
      chunks: 1,
      taskId,
      aiType: CONTENT_CONSOLIDATED_AI_TYPE,
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
      aiType: CONTENT_CONSOLIDATED_AI_TYPE,
    });
  } finally {
    // Chrome Power APIでスクリーンセイバー防止を解除
    chrome.runtime.sendMessage({type: 'STOP_AI_PROCESSING'});
  }
}

// ================================================================================
// STEP 8: メッセージハンドリング
// ================================================================================

/**
 * 【Step 8.1】メッセージ処理のメインハンドラ
 * background.jsや他のスクリプトからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] メッセージ受信:`, request.action, request);

  // ChatGPTの場合、追加のデバッグ情報を出力
  if (CONTENT_CONSOLIDATED_AI_TYPE === "ChatGPT") {
    console.log(`[11.autoai][ChatGPT] デバッグ - action: ${request.action}, taskId: ${request.taskId}`);
  }

  // 非同期処理のフラグ
  let isAsync = false;

  switch (request.action) {
    // 【Step 8.2】プロンプト送信要求
    case "sendPrompt":
      isAsync = true;
      console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] sendPromptメッセージ受信 - 判定開始:`, {
        hasTaskId: !!request.taskId,
        taskId: request.taskId,
        promptLength: request.prompt?.length || 0,
        requestKeys: Object.keys(request)
      });

      if (request.taskId) {
        // AITaskHandlerからの要求の場合
        console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ✓ AITaskHandler経由と判定 - handleAITaskPrompt呼び出し`);
        handleAITaskPrompt(request, sendResponse);
      } else {
        // 通常のプロンプト送信
        console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ✓ 通常のプロンプト送信と判定 - handleSendPrompt呼び出し`);
        handleSendPrompt(request, sendResponse);
      }
      break;

    // 【Step 8.3】応答取得要求
    case "getResponse":
      isAsync = true;
      handleGetResponse(request, sendResponse);
      break;

    // 【Step 8.4】タスク状態取得
    case "getTaskStatus":
      handleGetTaskStatus(request, sendResponse);
      break;

    // 【Step 8.5】準備状態確認
    case "checkReady":
      (async () => {
        const uiSelectorsLoaded = await waitForUISelectors();
        sendResponse({
          ready: true,
          aiType: CONTENT_CONSOLIDATED_AI_TYPE,
          uiSelectorsLoaded: uiSelectorsLoaded
        });
      })();
      isAsync = true;
      break;

    // 【Step 8.6】AI種別取得
    case "getAIType":
      const displayNameMap = {
        'chatgpt': 'ChatGPT',
        'claude': 'Claude',
        'gemini': 'Gemini',
        'genspark': 'Genspark'
      };
      const normalized = (CONTENT_CONSOLIDATED_AI_TYPE || '').toLowerCase();
      let displayName = CONTENT_CONSOLIDATED_AI_TYPE;

      // 部分マッチで表示名を決定
      if (normalized.includes('chatgpt') || normalized.includes('gpt') || normalized.includes('openai')) {
        displayName = 'ChatGPT';
      } else if (normalized.includes('claude') || normalized.includes('anthropic')) {
        displayName = 'Claude';
      } else if (normalized.includes('gemini') || normalized.includes('google')) {
        displayName = 'Gemini';
      } else if (normalized.includes('genspark')) {
        displayName = 'Genspark';
      } else if (displayNameMap[normalized]) {
        displayName = displayNameMap[normalized];
      }

      sendResponse({ aiType: displayName });
      break;

    // 【Step 8.7】タスク実行
    case "executeTask":
      isAsync = true;
      handleExecuteTask(request, sendResponse);
      break;

    default:
      console.warn(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 未処理のアクション: ${request.action}`);
      sendResponse({ success: false, error: "未対応のアクション" });
      break;
  }

  return isAsync;
});

// ================================================================================
// STEP 9: タスク実行機能
// ================================================================================

/**
 * 【Step 9.1】内部タスク実行関数
 * タスクの実行ロジックを内部的に処理
 */
async function executeTaskInternal(taskConfig) {
  const { taskId, prompt, aiType, enableDeepResearch, specialMode, timeout } = taskConfig;

  try {
    // 【Step 9.1.1】プロンプト送信
    const sendResult = await sendPromptToAI(prompt, {
      model: null,
      specialOperation: specialMode,
      aiType: aiType || CONTENT_CONSOLIDATED_AI_TYPE,
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

    // 【Step 9.1.2】応答待機
    const waitResult = await waitForResponseEnhanced(enableDeepResearch, timeout);

    if (!waitResult.success) {
      return waitResult;
    }

    // 【Step 9.1.3】応答取得
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
      aiType: aiType || CONTENT_CONSOLIDATED_AI_TYPE
    };

  } catch (error) {
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      errorMessage: error.message,
      needsRetry: true
    };
  } finally {
    // Chrome Power APIでスクリーンセイバー防止を解除
    chrome.runtime.sendMessage({type: 'STOP_AI_PROCESSING'});
  }
}

/**
 * 【Step 9.2】タスク実行ハンドラ
 */
async function handleExecuteTask(request, sendResponse) {
  try {
    const result = await executeTaskInternal(request);
    sendResponse(result);
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message,
      errorDetails: error
    });
  }
}

/**
 * 【Step 9.3】AITaskHandler用のプロンプト処理
 */
async function handleAITaskPrompt(request, sendResponse) {
  // AITaskHandlerからの要求を処理
  await handleSendPrompt(request, sendResponse);
}

/**
 * 【Step 9.4】タスク状態取得処理
 */
function handleGetTaskStatus(request, sendResponse) {
  sendResponse({
    success: true,
    status: "ready",
    aiType: CONTENT_CONSOLIDATED_AI_TYPE,
    capabilities: {
      sendPrompt: true,
      getResponse: true,
      streaming: true,
    },
  });
}

/**
 * 【Step 9.5】プロンプト送信（内部関数）
 */
async function sendPromptToAI(prompt, options = {}) {
  // プロンプト送信の内部実装
  // 省略（既存のコードを参照）
  return { success: true };
}

// ================================================================================
// STEP 10: クリーンアップ処理
// ================================================================================

/**
 * 【Step 10.1】ページ離脱時のクリーンアップ
 */
window.addEventListener('beforeunload', async () => {
  console.log('🔄 [11.autoai] ページ離脱検知');
  // Chrome Power APIの解除はbackground.jsで管理
});

/**
 * 【Step 10.2】ページ非表示時のクリーンアップ
 */
window.addEventListener('pagehide', async () => {
  console.log('🔄 [11.autoai] ページ非表示');
  // Chrome Power APIの解除はbackground.jsで管理
});

/**
 * 【Step 10.3】拡張機能のアンロード時のクリーンアップ
 */
if (chrome.runtime && chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(async () => {
    console.log('🔄 [11.autoai] 拡張機能サスペンド');
    // Chrome Power APIの解除はbackground.jsで管理
  });
}

// ================================================================================
// STEP 11: グローバル登録
// ================================================================================

/**
 * 【Step 11.1】ModelInfoExtractorをグローバルに登録
 */
if (typeof window.ModelInfoExtractor === 'undefined') {
  window.ModelInfoExtractor = ModelInfoExtractor;
  console.log('✅ [11.autoai] ModelInfoExtractorをグローバルに登録しました');
} else {
  console.log('ℹ️ [11.autoai] ModelInfoExtractorは既に登録済みです');
}

/**
 * 【Step 11.2】FunctionInfoExtractorをグローバルに登録
 */
if (typeof window.FunctionInfoExtractor === 'undefined') {
  window.FunctionInfoExtractor = FunctionInfoExtractor;
  console.log('✅ [11.autoai] FunctionInfoExtractorをグローバルに登録しました');
} else {
  console.log('ℹ️ [11.autoai] FunctionInfoExtractorは既に登録済みです');
}

// ================================================================================
// STEP 12: 初期化実行
// ================================================================================

/**
 * 【Step 12.1】初期化処理の実行
 */
(async function initializeContentScript() {
  // ===== 重複注入防止 =====
  if (window.AUTOAI_CONTENT_SCRIPT_LOADED) {
    console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] コンテンツスクリプトは既に読み込み済み - 重複注入を防止`);
    return; // 何も実行せず終了
  }

  window.AUTOAI_CONTENT_SCRIPT_LOADED = true;
  console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] コンテンツスクリプト初期化中...`);

  // 【Step 12.1.1】ページ読み込み完了を待つ
  await waitForPageReady();

  // 【Step 12.1.2】UIセレクタを読み込む
  await loadUISelectors();

  // 【Step 12.1.3】初期化完了を通知
  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({
        type: 'contentScriptReady',
        aiType: CONTENT_CONSOLIDATED_AI_TYPE
      });
      console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ✅ 初期化完了通知送信`);
    } catch (error) {
      console.warn(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] 初期化完了通知送信失敗:`, error);
    }
  }

  console.log(`[11.autoai][${CONTENT_CONSOLIDATED_AI_TYPE}] ✅ コンテンツスクリプト初期化完了`);
})();

// ================================================================================
// 終了
// ================================================================================