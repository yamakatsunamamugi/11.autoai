/**
 * @fileoverview セレクタ統合管理データ構造
 * 各AI（ChatGPT、Claude、Gemini）のセレクタ使用順序を管理
 * 重複除外・初回使用のみを記録
 *
 * @version 1.0.0
 * @created 2024-12-XX
 */

// ========================================
// セレクタ分類定義
// ========================================
export const SELECTOR_CATEGORIES = {
  input: { name: "入力系", icon: "📝", color: "#4CAF50" },
  button: { name: "ボタン系", icon: "🔘", color: "#2196F3" },
  menu: { name: "メニュー系", icon: "📋", color: "#9C27B0" },
  model: { name: "モデル系", icon: "🤖", color: "#FF9800" },
  response: { name: "応答系", icon: "💬", color: "#795548" },
  feature: { name: "機能系", icon: "⚙️", color: "#607D8B" },
  wait: { name: "待機系", icon: "⏳", color: "#FFC107" },
};

// ========================================
// セレクタ統合管理オブジェクト（初回使用順序）
// ========================================
export const AI_SELECTORS_TIMELINE = {
  chatgpt: {
    name: "ChatGPT",
    icon: "🤖",
    color: "#10A37F",
    steps: [
      {
        stepNumber: "4-1-0",
        stepName: "ページ準備確認",
        description: "ページの初期化と基本要素の確認",
        selectors: {
          textInput: {
            name: "テキスト入力欄",
            category: "input",
            selectors: [
              'div[contenteditable="true"][data-id^="root"]',
              'div[contenteditable="true"][placeholder*="Message"]',
              'div[contenteditable="true"][translate="no"]',
              'div[role="textbox"][contenteditable="true"]',
              ".ProseMirror",
              "#prompt-textarea",
            ],
            purpose: "ページ準備確認・テキスト入力欄の存在確認",
            isFirstUse: true,
            isRequired: true,
          },
          modelButton: {
            name: "モデルボタン",
            category: "model",
            selectors: [
              '[data-testid="model-switcher-dropdown-button"]',
              'button[aria-label*="モデル セレクター"]',
              'button[aria-label*="モデル"][aria-haspopup="menu"]',
              'button.group.flex.cursor-pointer[aria-haspopup="menu"]',
            ],
            purpose: "ページ準備確認・モデルボタンの存在確認",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
      {
        stepNumber: "4-1-3",
        stepName: "モデル選択",
        description: "指定されたモデルの選択（条件付き実行）",
        conditional: true,
        selectors: {
          modelMenu: {
            name: "モデルメニュー",
            category: "menu",
            selectors: [
              '[role="menu"][data-radix-menu-content]',
              '[role="menu"][data-state="open"]',
              'div.z-50.max-w-xs.rounded-2xl.popover[role="menu"]',
              '[aria-labelledby*="radix"][role="menu"]',
            ],
            purpose: "モデル選択メニューの表示",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "4-1-4",
        stepName: "機能選択",
        description: "指定された機能の選択（条件付き実行）",
        conditional: true,
        selectors: {
          menuButton: {
            name: "機能メニューボタン",
            category: "feature",
            selectors: [
              'button[aria-haspopup="menu"]',
              'button[data-testid="composer-tools-button"]',
            ],
            purpose: "機能メニューの開閉",
            isFirstUse: true,
            isRequired: false,
          },
          mainMenu: {
            name: "メインメニュー",
            category: "menu",
            selectors: [
              '[role="menu"]',
              "div[data-radix-popper-content-wrapper]",
            ],
            purpose: "機能選択メニューの表示",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "4-1-5",
        stepName: "メッセージ送信",
        description: "入力されたメッセージの送信",
        selectors: {
          sendButton: {
            name: "送信ボタン",
            category: "button",
            selectors: [
              '[data-testid="send-button"]',
              "#composer-submit-button",
              'button[aria-label="プロンプトを送信する"]',
              "button.composer-submit-btn.composer-submit-button-color",
            ],
            purpose: "メッセージ送信の実行",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
      {
        stepNumber: "4-1-6",
        stepName: "応答待機",
        description: "AI応答の生成完了まで待機",
        selectors: {
          stopButton: {
            name: "停止ボタン",
            category: "wait",
            selectors: [
              'button[aria-label="停止"]',
              'button[data-testid="stop-button"]',
              "button.composer-submit-btn.stop",
            ],
            purpose: "応答生成状態の監視（出現・消失）",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
      {
        stepNumber: "4-1-7",
        stepName: "テキスト取得",
        description: "AI応答の取得と表示",
        selectors: {
          canvasText: {
            name: "Canvas応答",
            category: "response",
            selectors: [
              '[data-testid="canvas-content"]',
              ".canvas-response-text",
            ],
            purpose: "Canvas機能使用時の応答取得",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
    ],
  },

  claude: {
    name: "Claude",
    icon: "🧠",
    color: "#D97706",
    steps: [
      {
        stepNumber: "初期化",
        stepName: "ページ準備",
        description: "ページの初期化と入力欄確認",
        selectors: {
          INPUT: {
            name: "入力欄",
            category: "input",
            selectors: [
              '[aria-label="クロードにプロンプトを入力してください"]',
              ".ProseMirror",
              'div.ProseMirror[contenteditable="true"]',
              '[data-placeholder*="Message Claude"]',
              'div[contenteditable="true"][role="textbox"]',
            ],
            purpose: "テキスト入力と初期確認",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
      {
        stepNumber: "モデル選択",
        stepName: "モデル選択",
        description: "使用するClaudeモデルの選択（条件付き）",
        conditional: true,
        selectors: {
          MODEL_BUTTON: {
            name: "モデル選択ボタン",
            category: "model",
            selectors: [
              '[data-testid="model-selector-dropdown"]',
              'button[data-value*="claude"]',
              "button.cursor-pointer:has(span.font-medium)",
              'button[aria-label*="モデル"]',
            ],
            purpose: "モデル選択メニューの開閉",
            isFirstUse: true,
            isRequired: false,
          },
          MODEL_MENU_CONTAINER: {
            name: "モデルメニューコンテナ",
            category: "menu",
            selectors: ['[role="menu"][data-state="open"]'],
            purpose: "モデル選択メニューの表示",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "機能選択",
        stepName: "機能選択",
        description: "Claude機能の選択（条件付き）",
        conditional: true,
        selectors: {
          FEATURE_MENU_BUTTON: {
            name: "機能メニューボタン",
            category: "feature",
            selectors: [
              '[data-testid="input-menu-tools"]',
              '[aria-label="ツールメニューを開く"]',
              "#input-tools-menu-trigger",
              'button[aria-expanded][aria-haspopup="listbox"]',
            ],
            purpose: "機能メニューの開閉",
            isFirstUse: true,
            isRequired: false,
          },
          WEB_SEARCH_TOGGLE: {
            name: "Web検索トグル",
            category: "feature",
            selectors: [
              '[data-testid="web-search-toggle"]',
              'input[type="checkbox"][aria-label*="Web"]',
            ],
            purpose: "Web検索機能の有効/無効",
            isFirstUse: true,
            isRequired: false,
          },
          RESEARCH_BUTTON: {
            name: "Deep Researchボタン",
            category: "feature",
            selectors: [
              '[data-testid="deep-research-button"]',
              'button[aria-label*="Deep Research"]',
            ],
            purpose: "Deep Research機能の選択",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "送信",
        stepName: "メッセージ送信",
        description: "入力されたメッセージの送信",
        selectors: {
          SEND_BUTTON: {
            name: "送信ボタン",
            category: "button",
            selectors: [
              '[aria-label="メッセージを送信"]',
              'button[aria-label="メッセージを送信"]',
              '[data-state="closed"] button[type="button"]',
              "button.bg-accent-main-000",
            ],
            purpose: "メッセージ送信の実行",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
      {
        stepNumber: "応答待機",
        stepName: "応答待機",
        description: "Claude応答の生成完了まで待機",
        selectors: {
          STOP_BUTTON: {
            name: "停止ボタン",
            category: "wait",
            selectors: [
              '[aria-label="応答を停止"]',
              'button[aria-label="応答を停止"]',
              '[data-state="closed"][aria-label="応答を停止"]',
            ],
            purpose: "応答生成状態の監視",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
      {
        stepNumber: "応答取得",
        stepName: "応答取得",
        description: "Claude応答の取得と表示",
        selectors: {
          CANVAS_PREVIEW: {
            name: "Canvasプレビュー",
            category: "response",
            selectors: [
              'div[aria-label="内容をプレビュー"][role="button"]',
              '[aria-label="内容をプレビュー"]',
            ],
            purpose: "Canvas機能のプレビュー表示",
            isFirstUse: true,
            isRequired: false,
          },
          CANVAS_CONTENT: {
            name: "Canvasコンテンツ",
            category: "response",
            selectors: [
              '.grid-cols-1.grid[class*="!gap-3.5"]',
              "div.grid-cols-1.grid.gap-2\\.5:has(p.whitespace-pre-wrap)",
            ],
            purpose: "Canvas機能の実際のコンテンツ取得",
            isFirstUse: true,
            isRequired: false,
          },
          STANDARD_RESPONSE: {
            name: "標準応答",
            category: "response",
            selectors: [".markdown.prose", "div.markdown-content"],
            purpose: "通常応答の取得",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
    ],
  },

  gemini: {
    name: "Gemini",
    icon: "💎",
    color: "#4285F4",
    steps: [
      {
        stepNumber: "初期化",
        stepName: "ページ準備",
        description: "ページの初期化と入力欄確認",
        selectors: {
          canvas: {
            name: "Canvas入力欄",
            category: "input",
            selectors: [".ProseMirror"],
            purpose: "Canvas形式での入力",
            isFirstUse: true,
            isRequired: false,
          },
          normalInput: {
            name: "通常入力欄",
            category: "input",
            selectors: [".ql-editor"],
            purpose: "通常形式での入力",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "モデル選択",
        stepName: "モデル選択",
        description: "Geminiモデルの選択（条件付き）",
        conditional: true,
        selectors: {
          menuButton: {
            name: "モデルメニューボタン",
            category: "model",
            selectors: [
              ".gds-mode-switch-button.logo-pill-btn",
              'button[class*="logo-pill-btn"]',
              "button.gds-mode-switch-button",
            ],
            purpose: "モデル選択メニューの開閉",
            isFirstUse: true,
            isRequired: false,
          },
          menuContainer: {
            name: "メニューコンテナ",
            category: "menu",
            selectors: [
              ".cdk-overlay-pane .menu-inner-container",
              '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]',
              ".mat-mdc-menu-panel",
            ],
            purpose: "モデル選択メニューの表示",
            isFirstUse: true,
            isRequired: false,
          },
          modelButtons: {
            name: "モデル選択ボタン",
            category: "model",
            selectors: [
              "button.bard-mode-list-button[mat-menu-item]",
              'button[role="menuitemradio"]',
              "button[mat-menu-item]",
            ],
            purpose: "具体的なモデルの選択",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "機能選択",
        stepName: "機能選択",
        description: "Gemini機能の選択（条件付き）",
        conditional: true,
        selectors: {
          mainButtons: {
            name: "メイン機能ボタン",
            category: "feature",
            selectors: ["toolbox-drawer-item > button"],
            purpose: "主要機能の選択",
            isFirstUse: true,
            isRequired: false,
          },
          moreButton: {
            name: "その他ボタン",
            category: "feature",
            selectors: ['button[aria-label="その他"]'],
            purpose: "追加機能メニューの開閉",
            isFirstUse: true,
            isRequired: false,
          },
          featureMenuItems: {
            name: "機能メニュー項目",
            category: "feature",
            selectors: [".cdk-overlay-pane .toolbox-drawer-menu-item button"],
            purpose: "追加機能の選択",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "送信",
        stepName: "メッセージ送信",
        description: "入力されたメッセージの送信",
        selectors: {
          sendButton: {
            name: "送信ボタン",
            category: "button",
            selectors: ["button.send-button.submit:not(.stop)"],
            purpose: "メッセージ送信の実行",
            isFirstUse: true,
            isRequired: true,
          },
          sendButtonAlt: {
            name: "送信ボタン（代替）",
            category: "button",
            selectors: [
              'button[aria-label="送信"]:not([disabled])',
              'button[aria-label*="Send"]:not([disabled])',
              ".send-button:not([disabled])",
            ],
            purpose: "送信ボタンのフォールバック",
            isFirstUse: true,
            isRequired: false,
          },
        },
      },
      {
        stepNumber: "応答待機",
        stepName: "応答待機",
        description: "Gemini応答の生成完了まで待機",
        selectors: {
          stopButton: {
            name: "停止ボタン",
            category: "wait",
            selectors: ["button.send-button.stop"],
            purpose: "応答生成状態の監視",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
      {
        stepNumber: "応答取得",
        stepName: "応答取得",
        description: "Gemini応答の取得と表示",
        selectors: {
          canvasResponse: {
            name: "Canvas応答",
            category: "response",
            selectors: [".ProseMirror"],
            purpose: "Canvas形式での応答取得",
            isFirstUse: true,
            isRequired: false,
          },
          normalResponse: {
            name: "通常応答",
            category: "response",
            selectors: [".model-response-text .markdown"],
            purpose: "通常応答の取得",
            isFirstUse: true,
            isRequired: true,
          },
        },
      },
    ],
  },
};

// ========================================
// セレクタ使用統計（初期値）
// ========================================
export const SELECTOR_STATS = {
  chatgpt: {},
  claude: {},
  gemini: {},
};

// ========================================
// ヘルパー関数
// ========================================

/**
 * 指定されたAIのセレクタ統計を初期化
 */
export function initializeSelectorStats() {
  Object.keys(AI_SELECTORS_TIMELINE).forEach((aiName) => {
    SELECTOR_STATS[aiName] = {};

    AI_SELECTORS_TIMELINE[aiName].steps.forEach((step) => {
      Object.keys(step.selectors).forEach((selectorKey) => {
        SELECTOR_STATS[aiName][selectorKey] = {
          successRate: 0,
          lastUsed: null,
          hitCount: 0,
          failCount: 0,
          avgResponseTime: 0,
          hasError: false,
          lastError: null,
          lastErrorTime: null,
          errorCount: 0,
        };
      });
    });
  });
}

/**
 * セレクタの使用統計を更新
 */
export function updateSelectorStats(
  aiName,
  selectorKey,
  success,
  responseTime,
) {
  if (!SELECTOR_STATS[aiName] || !SELECTOR_STATS[aiName][selectorKey]) return;

  const stats = SELECTOR_STATS[aiName][selectorKey];

  if (success) {
    stats.hitCount++;
  } else {
    stats.failCount++;
  }

  stats.successRate = Math.round(
    (stats.hitCount / (stats.hitCount + stats.failCount)) * 100,
  );
  stats.lastUsed = new Date().toISOString();

  if (responseTime && success) {
    stats.avgResponseTime = Math.round(
      (stats.avgResponseTime + responseTime) / 2,
    );
  }
}

/**
 * 指定されたAIのセレクタ総数を取得
 */
export function getTotalSelectorsCount(aiName) {
  if (!AI_SELECTORS_TIMELINE[aiName]) return 0;

  let count = 0;
  AI_SELECTORS_TIMELINE[aiName].steps.forEach((step) => {
    count += Object.keys(step.selectors).length;
  });

  return count;
}

/**
 * 指定されたカテゴリのセレクタを取得
 */
export function getSelectorsByCategory(aiName, category) {
  if (!AI_SELECTORS_TIMELINE[aiName]) return [];

  const result = [];
  AI_SELECTORS_TIMELINE[aiName].steps.forEach((step) => {
    Object.entries(step.selectors).forEach(([key, selector]) => {
      if (selector.category === category) {
        result.push({
          key,
          ...selector,
          step: step.stepName,
          conditional: step.conditional || false,
        });
      }
    });
  });

  return result;
}

/**
 * セレクタエラー情報を追加
 */
export function addSelectorError(
  aiName,
  selectorKey,
  error,
  timestamp = new Date(),
) {
  if (!SELECTOR_STATS[aiName]) {
    SELECTOR_STATS[aiName] = {};
  }

  if (!SELECTOR_STATS[aiName][selectorKey]) {
    initializeSelectorStats();
  }

  const stats = SELECTOR_STATS[aiName][selectorKey];
  stats.hasError = true;
  stats.lastError = error;
  stats.lastErrorTime = timestamp.toISOString();
  stats.errorCount = (stats.errorCount || 0) + 1;
}

/**
 * セレクタエラー情報をクリア
 */
export function clearSelectorError(aiName, selectorKey) {
  if (SELECTOR_STATS[aiName] && SELECTOR_STATS[aiName][selectorKey]) {
    const stats = SELECTOR_STATS[aiName][selectorKey];
    stats.hasError = false;
    stats.lastError = null;
    stats.lastErrorTime = null;
  }
}

// 初期化実行
initializeSelectorStats();

