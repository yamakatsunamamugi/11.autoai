/**
 * @fileoverview 11.autoai DeepResearch設定モジュール
 * AI固有のDeepResearchボタン/トグル設定を統合管理
 */

// タイムアウト設定をインポート（存在する場合のみ使用）
const getDeepResearchTimeout = () => {
  if (typeof window !== 'undefined' && window.CONFIG?.TIMEOUT?.DEEP_RESEARCH) {
    return window.CONFIG.TIMEOUT.DEEP_RESEARCH;
  }
  return 2400000; // デフォルト40分
};

// 共通設定
export const DEEPRESEARCH_COMMON_CONFIG = {
  // 検出パターン（言語対応）
  DETECTION_PATTERNS: [
    "DeepResearch",
    "深度調査",
    "徹底調査",
    "リサーチ",
    "Deep Research",
  ],

  // タイムアウト設定
  TIMEOUTS: {
    ELEMENT_DETECTION: 5000,
    TOGGLE_ACTIVATION: 2000,
    RESPONSE_TIMEOUT: getDeepResearchTimeout(), // timeout-config.jsから取得、なければ40分
  },

  // 共通動作設定
  BEHAVIOR: {
    AUTO_ENABLE: true,
    FALLBACK_MODE: "standard",
    RETRY_COUNT: 3,
  },

  DEBUG: {
    ENABLED: true,
    LOG_LEVEL: "info",
  },
};

// ChatGPT DeepResearch設定
export const CHATGPT_DEEPRESEARCH_CONFIG = {
  SELECTORS: {
    // Web検索トグル（主要）
    WEB_SEARCH_TOGGLE: 'button[data-testid="web-search-toggle"]',
    // ツールメニュー方式
    TOOLS_BUTTON: "button#system-hint-button",
    MENU_ITEM: 'div[role="menuitemradio"]',
    // 状態確認
    STATUS_INDICATOR: 'button[data-testid="web-search-toggle"][aria-checked]',
    TOGGLE_CONTAINER: ".web-search-toggle-container",
  },

  ACTIVATION: {
    PRIMARY_METHOD: "web_search_toggle", // Web検索トグル優先
    FALLBACK_METHOD: "tools_menu", // ツールメニューフォールバック
    VERIFICATION: "aria-checked",
    WAIT_AFTER_CLICK: 500,
  },

  STATE_DETECTION: {
    ENABLED_ATTRIBUTE: "aria-checked",
    ENABLED_VALUE: "true",
    PROGRESS_SELECTORS: [
      ".web-search-progress",
      '[data-testid="search-progress"]',
      'text:contains("Searching the web")',
      'text:contains("ウェブを検索中")',
    ],
  },

  RESPONSE: {
    TIMEOUT_OVERRIDE: 2400000, // 40分
    CHECK_INTERVAL: 1000,
    STABILITY_WINDOW: 5000,
  },
};

// Claude DeepResearch設定
export const CLAUDE_DEEPRESEARCH_CONFIG = {
  SELECTORS: {
    // Claude固有のリサーチボタン
    RESEARCH_BUTTON: 'button:contains("リサーチ")',
    SEARCH_TOGGLE: 'button[aria-label*="search"]',
    RESEARCH_INDICATOR: ".research-mode-indicator",
    // 追加可能性
    ADVANCED_OPTIONS: 'button[aria-label*="advanced"]',
    WEB_SEARCH_OPTION: '[role="menuitem"]:contains("Web")',
  },

  ACTIVATION: {
    PRIMARY_METHOD: "research_button",
    FALLBACK_METHOD: "menu_navigation",
    VERIFICATION: "class_presence",
    WAIT_AFTER_CLICK: 1000,
  },

  STATE_DETECTION: {
    ENABLED_CLASS: "research-enabled",
    PROGRESS_SELECTORS: [
      ".research-progress",
      ".search-status",
      'text:contains("Researching")',
      'text:contains("調査中")',
    ],
  },

  RESPONSE: {
    TIMEOUT_OVERRIDE: 2400000, // 40分
    CHECK_INTERVAL: 1500,
    STABILITY_WINDOW: 7000,
  },
};

// Gemini DeepResearch設定
export const GEMINI_DEEPRESEARCH_CONFIG = {
  SELECTORS: {
    // Gemini固有のDeep Researchボタン
    DEEPRESEARCH_BUTTON: 'button[aria-label*="Deep Research"]',
    TOOLBOX_BUTTON: "button:has(div.toolbox-drawer-button-label)",
    DRAWER_BUTTON: "button.toolbox-drawer-item-button",
    MAT_BUTTON: "button[matripple].toolbox-drawer-item-button",
    TOOLTIP_BUTTON: "button.mat-mdc-tooltip-trigger",
    // フォールバック用の古いセレクタ
    GROUNDING_TOGGLE: 'button[aria-label*="grounding"]',
    WEB_SEARCH_TOGGLE: 'button[aria-label*="search"]',
    SEARCH_BUTTON: ".search-toggle-button",
    STATUS_ELEMENT: ".search-status",
    SEARCH_ICON: 'button svg[data-icon="search"]',
  },

  ACTIVATION: {
    PRIMARY_METHOD: "grounding_toggle",
    FALLBACK_METHOD: "search_icon",
    VERIFICATION: "aria_state",
    WAIT_AFTER_CLICK: 750,
  },

  STATE_DETECTION: {
    ENABLED_ATTRIBUTE: "aria-pressed",
    ENABLED_VALUE: "true",
    PROGRESS_SELECTORS: [
      ".gemini-search-progress",
      ".grounding-status",
      'text:contains("Searching")',
      'text:contains("検索中")',
    ],
  },

  RESPONSE: {
    TIMEOUT_OVERRIDE: 2400000, // 40分
    CHECK_INTERVAL: 1200,
    STABILITY_WINDOW: 6000,
  },
};

// DeepResearch設定アダプター
export class DeepResearchConfigAdapter {
  constructor() {
    this.configs = {
      chatgpt: CHATGPT_DEEPRESEARCH_CONFIG,
      claude: CLAUDE_DEEPRESEARCH_CONFIG,
      gemini: GEMINI_DEEPRESEARCH_CONFIG,
    };

    this.debug = DEEPRESEARCH_COMMON_CONFIG.DEBUG.ENABLED;
  }

  /**
   * AI固有設定を取得
   * @param {string} aiType - AI種類
   * @returns {Object} 統合設定
   */
  getConfigForAI(aiType) {
    const normalizedType = aiType.toLowerCase();

    if (!this.configs[normalizedType]) {
      this.log(`Unknown AI type: ${aiType}, falling back to ChatGPT config`);
      return {
        common: DEEPRESEARCH_COMMON_CONFIG,
        specific: this.configs.chatgpt,
        aiType: "chatgpt",
      };
    }

    return {
      common: DEEPRESEARCH_COMMON_CONFIG,
      specific: this.configs[normalizedType],
      aiType: normalizedType,
    };
  }

  /**
   * AI固有のセレクタを取得
   * @param {string} aiType - AI種類
   * @param {string} selectorType - セレクタの種類
   * @returns {string|Array} セレクタ
   */
  getSelector(aiType, selectorType) {
    const config = this.getConfigForAI(aiType);
    return config.specific.SELECTORS[selectorType];
  }

  /**
   * タイムアウト設定を取得
   * @param {string} aiType - AI種類
   * @returns {number} タイムアウト値（ミリ秒）
   */
  getTimeout(aiType) {
    const config = this.getConfigForAI(aiType);
    return (
      config.specific.RESPONSE.TIMEOUT_OVERRIDE ||
      DEEPRESEARCH_COMMON_CONFIG.TIMEOUTS.RESPONSE_TIMEOUT
    );
  }

  /**
   * デバッグログ出力
   * @param {string} message - ログメッセージ
   * @param {Object} data - 追加データ
   */
  log(message, data = {}) {
    if (this.debug) {
      console.log(`[11.autoai][DeepResearch] ${message}`, data);
    }
  }
}

// シングルトンインスタンス
export const deepResearchConfig = new DeepResearchConfigAdapter();
