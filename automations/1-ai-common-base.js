/**
 * @fileoverview AI自動化共通基盤
 *
 * 【ファイル構成】
 * 1. 基本設定
 *   1-1. 待機時間設定
 *   1-2. 機能定数
 *   1-3. セレクタ定義
 *
 * 2. ユーティリティ関数
 *   2-1. 基本関数
 *   2-2. DOM操作
 *   2-3. テキスト処理
 *   2-4. イベント処理
 *
 * 3. 共通ハンドラー
 *   3-1. MenuHandler（メニュー操作）
 *   3-2. ResponseHandler（応答待機）
 *   3-3. DOMObserver（DOM監視）
 *
 * 4. API公開
 *   4-1. グローバルAPI設定
 *
 * @version 1.0.0
 * @date 2024-12-14
 */

(() => {
  'use strict';

  // ========================================
  // 1. 基本設定
  // ========================================

  // ----------------------------------------
  // 1-1. 待機時間設定
  // すべてのAIで共通使用する待機時間を定義
  // ----------------------------------------

  // 1-1-1. 基本待機時間
  // ページ読み込みや基本的な操作の待機時間
  const AI_WAIT_CONFIG = {
    // ページ読み込み待機時間
    INITIAL_PAGE_LOAD_WAIT: 5000,   // ページ初期読み込み: 5秒（ネット環境を考慮）
    DOM_READY_WAIT: 1000,            // DOM完全読み込み後の追加待機: 1秒

    // 基本待機時間
    INITIAL_WAIT: 30000,        // 初期待機: 30秒（送信後の初期待機）
    MAX_WAIT: 300000,           // 最大待機: 5分（通常応答の最大待機時間）
    CHECK_INTERVAL: 2000,       // チェック間隔: 2秒（状態確認の間隔）

    // UI操作用の短い待機時間
    MICRO_WAIT: 100,            // 極小待機: 100ms（イベント間の最小待機）
    TINY_WAIT: 500,             // 微小待機: 500ms（クリック後など）
    SHORT_WAIT: 1000,           // 短待機: 1秒（UI更新待ち）
    MEDIUM_WAIT: 2000,          // 中待機: 2秒（メニュー表示など）
    LONG_WAIT: 3000,            // 長待機: 3秒（ページ遷移など）

    // 要素検索・メニュー待機
    ELEMENT_SEARCH_WAIT: 5000,  // 要素検索: 5秒
    MENU_WAIT: 8000,            // メニュー待機: 8秒

    // デバッグ用
    LOG_INTERVAL: 10000,        // ログ出力間隔: 10秒
  };

  // 1-1-2. 特殊モード用待機時間
  // Deep ResearchやCanvas等の特殊処理用
  const SPECIAL_MODE_CONFIG = {
    // 特殊モード用の待機時間
    DEEP_RESEARCH_WAIT: 2400000,    // Deep Research: 40分
    CANVAS_MAX_WAIT: 300000,        // Canvas: 5分（Gemini/ChatGPT）

    // 安定性チェック用
    STABILITY_DURATION: 10000,      // 安定判定: 10秒（テキストが変化しない時間）
    CANVAS_NOT_FOUND_MAX: 5,        // Canvas要素が見つからない最大回数

    // 停止ボタン関連
    STOP_BUTTON_INITIAL_WAIT: 30000,     // 停止ボタン出現待機: 30秒
    STOP_BUTTON_DISAPPEAR_WAIT: 300000,  // 停止ボタン消滅待機: 5分
    STOP_BUTTON_CONSECUTIVE_CHECK: 10000, // 停止ボタン連続消滅確認: 10秒
  };

  // ----------------------------------------
  // 1-2. 機能定数
  // 各AIの機能名やモード定義
  // ----------------------------------------

  // 1-2-1. 機能名定義
  // 各AIで使用される機能名の定数
  const FEATURE_CONSTANTS = {
    // ChatGPT機能
    CHATGPT: {
      CANVAS: 'canvas',
      CODE_INTERPRETER: 'code-interpreter',
      BROWSING: 'browsing',
      DALL_E: 'dall-e',
      GPT_STORE: 'gpt-store'
    },

    // Claude機能
    CLAUDE: {
      DEEP_RESEARCH: 'Deep Research',
      WEB_SEARCH: 'ウェブ検索',
      ARTIFACTS: 'Artifacts'
    },

    // Gemini機能
    GEMINI: {
      CANVAS: 'Canvas',
      DEEP_RESEARCH: 'Deep Research',
      DEEP_RESERCH: 'DeepReserch', // スペルミス版（互換性のため）
      YOUTUBE: 'YouTube',
      GOOGLE_FLIGHTS: 'Google Flights',
      GOOGLE_HOTELS: 'Hotels'
    },

    // 共通
    NONE: '通常',
    DEFAULT: 'default',
    AUTO: 'auto'
  };

  // 1-2-2. AIタイプ定義
  // サポートされているAIの種類
  const AI_TYPES = {
    CHATGPT: 'chatgpt',
    CLAUDE: 'claude',
    GEMINI: 'gemini',
    GENSPARK: 'genspark'
  };

  // ----------------------------------------
  // 1-3. セレクタ定義
  // 各AIのDOM要素セレクタ
  // ----------------------------------------

  // 1-3-1. ChatGPTセレクタ
  const CHATGPT_SELECTORS = {
    // モデル関連
    modelButton: [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[aria-label*="モデル セレクター"]',
      'button[aria-label*="モデル"][aria-haspopup="menu"]'
    ],
    modelMenu: [
      '[role="menu"][data-radix-menu-content]',
      '[role="menu"][data-state="open"]',
      'div.z-50.max-w-xs.rounded-2xl.popover[role="menu"]'
    ],

    // 機能関連
    menuButton: [
      '[data-testid="composer-plus-btn"]',
      'button[aria-haspopup="menu"]'
    ],

    // 入力・送信関連
    textInput: [
      '.ProseMirror',
      '#prompt-textarea',
      '[contenteditable="true"][translate="no"]'
    ],
    sendButton: [
      '[data-testid="send-button"]',
      '#composer-submit-button',
      'button[aria-label="プロンプトを送信する"]'
    ],
    stopButton: [
      '[data-testid="stop-button"]',
      '#composer-submit-button[aria-label="ストリーミングの停止"]'
    ]
  };

  // 1-3-2. Claudeセレクタ
  const CLAUDE_SELECTORS = {
    // モデル関連
    modelButton: [
      'button[data-testid*="model-selector"]',
      'button[aria-label*="モデル"]',
      'div.font-medium button'
    ],
    modelMenu: [
      '[role="menu"][data-state="open"]',
      'div[data-radix-menu-content]'
    ],

    // 機能関連
    featureButtons: [
      'button[data-value]',
      'button[aria-label*="機能"]'
    ],

    // 入力・送信関連
    textInput: [
      'div[contenteditable="true"]',
      'div.ProseMirror',
      'fieldset div[contenteditable="true"]'
    ],
    sendButton: [
      'button[aria-label*="メッセージを送信"]',
      'button[data-testid="send-button"]'
    ],
    stopButton: [
      'button[aria-label*="停止"]',
      'button[data-testid="stop-button"]'
    ]
  };

  // 1-3-3. Geminiセレクタ
  const GEMINI_SELECTORS = {
    // モデル関連
    modelButton: [
      '.gds-mode-switch-button.logo-pill-btn',
      'button[class*="logo-pill-btn"]',
      'button.gds-mode-switch-button'
    ],
    modelMenu: [
      '.cdk-overlay-pane .menu-inner-container',
      '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]'
    ],

    // 機能関連
    featureButtons: [
      'toolbox-drawer-item > button',
      '.toolbox-drawer-item-button button'
    ],
    moreButton: [
      'button[aria-label="その他"]'
    ],

    // 入力・送信関連
    textInput: [
      '.ql-editor',
      'div[contenteditable="true"]'
    ],
    sendButton: [
      'button.send-button.submit:not(.stop)',
      'button[aria-label="プロンプトを送信する"]'
    ],
    stopButton: [
      'button.send-button.stop',
      'button[aria-label="ストリーミングを停止"]'
    ]
  };

  // ========================================
  // 2. ユーティリティ関数
  // ========================================

  // ----------------------------------------
  // 2-1. 基本関数
  // ----------------------------------------

  // 2-1-1. sleep関数群（Step 1: sleep-utils.jsから統合）
  // 指定時間待機する基本関数
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // デバッグログ付きスリープ関数
  async function sleepWithLog(ms, context = 'sleep', logger = console.log, options = {}) {
    const {
      forceLog = false,
      logThreshold = 1000
    } = options;

    const shouldLog = forceLog || (ms >= logThreshold);

    if (shouldLog) {
      const duration = ms >= 1000 ? `${ms / 1000}秒` : `${ms}ミリ秒`;
      logger(`[${context}] ${duration}待機開始`);
    }

    await sleep(ms);

    if (shouldLog) {
      const duration = ms >= 1000 ? `${ms / 1000}秒` : `${ms}ミリ秒`;
      logger(`[${context}] ${duration}待機完了`);
    }
  }

  // ランダム待機時間生成
  function randomWaitTime(min = 5, max = 15) {
    return Math.floor(Math.random() * ((max - min) * 1000 + 1)) + (min * 1000);
  }

  // ランダム待機実行
  async function randomSleep(min = 5, max = 15, context = 'randomSleep', logger = console.log) {
    const waitTime = randomWaitTime(min, max);
    await sleepWithLog(waitTime, context, logger);
  }

  // AI待機設定に基づく待機
  async function aiWait(type = 'SHORT_WAIT', context = 'aiWait', logger = console.log) {
    const config = {...AI_WAIT_CONFIG, ...SPECIAL_MODE_CONFIG};
    const waitTime = config[type] || config.SHORT_WAIT;
    await sleepWithLog(waitTime, `${context}(${type})`, logger);
  }

  // 条件付き待機
  async function waitForCondition(
    condition,
    interval = 1000,
    maxWait = 30000,
    context = 'waitForCondition',
    logger = console.log
  ) {
    const startTime = Date.now();
    let lastLogTime = startTime;

    while (Date.now() - startTime < maxWait) {
      try {
        if (await condition()) {
          const elapsedTime = Date.now() - startTime;
          if (elapsedTime > 1000) {
            logger(`[${context}] 条件満了 (${Math.round(elapsedTime / 1000)}秒)`);
          }
          return true;
        }
      } catch (error) {
        logger(`[${context}] 条件チェックエラー:`, error);
      }

      const currentTime = Date.now();
      if (currentTime - lastLogTime >= 10000) {
        const elapsedSeconds = Math.round((currentTime - startTime) / 1000);
        const maxSeconds = Math.round(maxWait / 1000);
        logger(`[${context}] 条件待機中... (${elapsedSeconds}秒 / 最大${maxSeconds}秒)`);
        lastLogTime = currentTime;
      }

      await sleep(interval);
    }

    logger(`[${context}] タイムアウト (${Math.round(maxWait / 1000)}秒)`);
    return false;
  }

  // 指数バックオフ待機
  async function exponentialBackoffSleep(
    baseDelay = 1000,
    attempt = 0,
    maxDelay = 30000,
    context = 'exponentialBackoff',
    logger = console.log
  ) {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    await sleepWithLog(delay, `${context}(試行${attempt + 1}回目)`, logger);
  }

  // プリセット待機時間を取得
  function getPRESET_WAITS() {
    return {
      // UI操作用
      MICRO: AI_WAIT_CONFIG.MICRO_WAIT || 100,
      TINY: AI_WAIT_CONFIG.TINY_WAIT || 500,
      SHORT: AI_WAIT_CONFIG.SHORT_WAIT || 1000,
      MEDIUM: AI_WAIT_CONFIG.MEDIUM_WAIT || 2000,
      LONG: AI_WAIT_CONFIG.LONG_WAIT || 3000,

      // 要素待機用
      ELEMENT_SEARCH: AI_WAIT_CONFIG.ELEMENT_SEARCH_WAIT || 5000,
      MENU: AI_WAIT_CONFIG.MENU_WAIT || 8000,

      // AI応答待機用
      INITIAL: AI_WAIT_CONFIG.INITIAL_WAIT || 30000,
      MAX_RESPONSE: AI_WAIT_CONFIG.MAX_WAIT || 300000,
      DEEP_RESEARCH: SPECIAL_MODE_CONFIG.DEEP_RESEARCH_WAIT || 2400000,
      CANVAS: SPECIAL_MODE_CONFIG.CANVAS_MAX_WAIT || 300000
    };
  }

  const PRESET_WAITS = getPRESET_WAITS();

  // プリセット待機の実行
  async function presetSleep(preset, context = 'presetSleep', logger = console.log) {
    const waitTime = PRESET_WAITS[preset] || PRESET_WAITS.SHORT;
    await sleepWithLog(waitTime, `${context}(${preset})`, logger);
  }

  // よく使用される待機パターンのヘルパー関数
  async function waitForUI(context = 'UI操作', logger = console.log) {
    await aiWait('SHORT_WAIT', context, logger);
  }

  async function waitForMenu(context = 'メニュー表示', logger = console.log) {
    await aiWait('MENU_WAIT', context, logger);
  }

  async function waitForResponse(context = 'AI応答', logger = console.log) {
    await aiWait('INITIAL_WAIT', context, logger);
  }

  async function waitForDeepResearch(context = 'Deep Research', logger = console.log) {
    await aiWait('DEEP_RESEARCH_WAIT', context, logger);
  }

  // 機能別待機時間取得
  function getWaitTimeForFunction(functionName) {
    const normalized = functionName?.toLowerCase().replace(/\s+/g, '') || 'default';
    const functionMapping = {
      'deepresearch': PRESET_WAITS.DEEP_RESEARCH,
      'ディープリサーチ': PRESET_WAITS.DEEP_RESEARCH,
      'deep research': PRESET_WAITS.DEEP_RESEARCH,
      'エージェント': PRESET_WAITS.DEEP_RESEARCH,
      'エージェントモード': PRESET_WAITS.DEEP_RESEARCH,
      'agent': PRESET_WAITS.DEEP_RESEARCH,
      'canvas': PRESET_WAITS.CANVAS,
      'キャンバス': PRESET_WAITS.CANVAS,
      'ウェブ検索': PRESET_WAITS.ELEMENT_SEARCH,
      'websearch': PRESET_WAITS.ELEMENT_SEARCH,
      'web search': PRESET_WAITS.ELEMENT_SEARCH,
      '通常': PRESET_WAITS.MAX_RESPONSE,
      'normal': PRESET_WAITS.MAX_RESPONSE,
      'default': PRESET_WAITS.MAX_RESPONSE
    };
    return functionMapping[normalized] || PRESET_WAITS.MAX_RESPONSE;
  }

  // 機能に基づく待機実行
  async function waitForFunction(functionName, context = 'functionWait', logger = console.log) {
    const waitTime = getWaitTimeForFunction(functionName);
    await sleepWithLog(waitTime, `${context}(${functionName})`, logger);
  }

  // 2-1-2. ログ出力
  // 統一されたログ出力関数
  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ja-JP', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const prefix = `[${timestamp}]`;

    const styles = {
      info: 'color: #03A9F4;',
      success: 'color: #4CAF50; font-weight: bold;',
      warning: 'color: #FFC107;',
      error: 'color: #F44336; font-weight: bold;',
      step: 'color: #9C27B0; font-weight: bold; font-size: 1.1em;'
    };

    console.log(`%c${prefix} ${message}`, styles[type] || '');

    if (type === 'error') {
      console.trace(message);
    }
  }

  // 2-1-3. AI判定
  // 現在のサイトがどのAIか判定（Service Worker対応）
  function detectAI() {
    // Step 2-1-3-1: Web Page環境での従来の判定
    if (typeof window !== 'undefined' && window.location) {
      const url = window.location.href;

      if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
        return AI_TYPES.CHATGPT;
      } else if (url.includes('claude.ai')) {
        return AI_TYPES.CLAUDE;
      } else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
        return AI_TYPES.GEMINI;
      } else if (url.includes('genspark.ai')) {
        return AI_TYPES.GENSPARK;
      }

      return null;
    }

    // Step 2-1-3-2: Service Worker環境では既に保存された結果を返す
    if (typeof globalThis !== 'undefined' && globalThis._detectedAI) {
      return globalThis._detectedAI;
    }

    // Step 2-1-3-3: Chrome Extension APIでアクティブタブから判定（非同期）
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      // 非同期でAI検出を実行し、結果をglobalThisに保存
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
          const url = tabs[0].url;
          let detectedAI = null;

          if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
            detectedAI = AI_TYPES.CHATGPT;
          } else if (url.includes('claude.ai')) {
            detectedAI = AI_TYPES.CLAUDE;
          } else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
            detectedAI = AI_TYPES.GEMINI;
          } else if (url.includes('genspark.ai')) {
            detectedAI = AI_TYPES.GENSPARK;
          }

          if (detectedAI) {
            globalThis._detectedAI = detectedAI;
            log(`Service Worker AI検出: ${detectedAI}`, 'info');
          }
        }
      });
    }

    return null; // 初回は null、次回から保存された値を返す
  }

  // ----------------------------------------
  // 2-2. DOM操作
  // ----------------------------------------

  // 2-2-1. 要素検索
  // 複数セレクタから要素を検索
  function findElement(selectors, parent = document) {
    if (!selectors || !Array.isArray(selectors)) {
      return null;
    }

    for (const selector of selectors) {
      try {
        const element = parent.querySelector(selector);
        if (element && isElementInteractable(element)) {
          return element;
        }
      } catch (e) {
        // セレクタエラーを無視
      }
    }

    return null;
  }

  // 2-2-2. 複数要素検索
  // 複数セレクタから全要素を検索
  function findElements(selectors, parent = document) {
    if (!selectors || !Array.isArray(selectors)) {
      return [];
    }

    for (const selector of selectors) {
      try {
        const elements = parent.querySelectorAll(selector);
        if (elements.length > 0) {
          return Array.from(elements);
        }
      } catch (e) {
        // セレクタエラーを無視
      }
    }

    return [];
  }

  // 2-2-3. 要素の可視性チェック
  // 要素がクリック可能か確認（Service Worker対応）
  function isElementInteractable(element) {
    if (!element) return false;
    // Service Worker環境では DOM操作不可
    if (typeof window === 'undefined') return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return rect.width > 0 &&
           rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }

  // 2-2-4. テキストで要素を検索
  // 指定テキストを含む要素を検索
  function findElementByText(selector, text, parent = document) {
    const elements = parent.querySelectorAll(selector);
    for (const el of elements) {
      if (el.textContent && el.textContent.includes(text)) {
        return el;
      }
    }
    return null;
  }

  // ----------------------------------------
  // 2-3. テキスト処理
  // ----------------------------------------

  // 2-3-1. テキストクリーンアップ
  // 装飾要素を除外してテキスト取得
  function getCleanText(element) {
    if (!element) return '';

    try {
      const clone = element.cloneNode(true);

      // 装飾要素を削除
      const decorativeSelectors = [
        'mat-icon',
        'mat-ripple',
        'svg',
        '.icon',
        '.ripple',
        '.mat-ripple',
        '.mat-mdc-button-persistent-ripple',
        '.mat-focus-indicator',
        '.mat-mdc-button-touch-target',
        '.cdk-visually-hidden'
      ];

      decorativeSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
      });

      return clone.textContent?.trim().replace(/\s+/g, ' ') || '';
    } catch (e) {
      return element.textContent?.trim().replace(/\s+/g, ' ') || '';
    }
  }

  // 2-3-2. プロンプト整形
  // セル位置情報を追加してプロンプトを整形
  function formatPromptWithCellInfo(prompt, cellInfo) {
    if (!cellInfo || !cellInfo.column || !cellInfo.row) {
      return prompt;
    }

    const cellPosition = `${cellInfo.column}${cellInfo.row}`;
    return `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
  }

  // ----------------------------------------
  // 2-4. イベント処理
  // ----------------------------------------

  // 2-4-1. Reactイベント発火
  // React/Vue対応のイベント発火
  function triggerReactEvent(element, eventType, eventData = {}) {
    if (!element) return false;

    try {
      if (eventType === 'click') {
        element.click();
        return true;
      } else if (eventType === 'pointer') {
        const pointerDown = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          view: window,
          ...eventData
        });
        const pointerUp = new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          view: window,
          ...eventData
        });
        element.dispatchEvent(pointerDown);
        element.dispatchEvent(pointerUp);
        return true;
      } else if (eventType === 'input') {
        const inputEvent = new Event('input', { bubbles: true });
        const changeEvent = new Event('change', { bubbles: true });
        element.dispatchEvent(inputEvent);
        element.dispatchEvent(changeEvent);
        return true;
      }
      return false;
    } catch (error) {
      log(`イベントトリガー失敗: ${error.message}`, 'error');
      return false;
    }
  }

  // 2-4-2. キーボードイベント発火
  // Escapeキーなどのキーボードイベント
  function triggerKeyboardEvent(key, code = null) {
    const keyboardEvent = new KeyboardEvent('keydown', {
      key: key,
      code: code || key,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(keyboardEvent);
  }

  // ========================================
  // 3. 共通ハンドラー
  // ========================================

  // ----------------------------------------
  // 3-1. MenuHandler
  // モデル・機能選択の共通処理
  // ----------------------------------------

  // 3-1-1. MenuHandlerクラス
  class MenuHandler {
    // 3-1-1-1. コンストラクタ
    // AIタイプに応じた初期化
    constructor(aiType) {
      this.aiType = aiType || detectAI();
      this.selectors = this.getSelectors();
      this.log = log; // ログ関数を保持
    }

    // 3-1-1-2. セレクタ取得
    // AIタイプに応じたセレクタを取得
    getSelectors() {
      switch (this.aiType) {
        case AI_TYPES.CHATGPT:
          return CHATGPT_SELECTORS;
        case AI_TYPES.CLAUDE:
          return CLAUDE_SELECTORS;
        case AI_TYPES.GEMINI:
          return GEMINI_SELECTORS;
        default:
          return {};
      }
    }

    // 3-1-1-3. メニューを開く
    // モデル選択メニューを開く
    async openModelMenu() {
      this.log(`ステップ1: ${this.aiType}モデル選択ボタンを検索中...`, 'info');
      const menuButton = findElement(this.selectors.modelButton);
      if (!menuButton) {
        this.log('❌ ステップ1失敗: モデル選択ボタンが見つかりません', 'error');
        throw new Error('モデル選択ボタンが見つかりません');
      }
      this.log('✅ ステップ1完了: モデル選択ボタンを発見', 'success');

      this.log('ステップ2: メニューを開く操作を実行中...', 'info');
      if (this.aiType === AI_TYPES.CHATGPT) {
        triggerReactEvent(menuButton, 'pointer');
        this.log('📱 ChatGPT用Reactイベントトリガーを実行', 'info');
      } else {
        menuButton.click();
        this.log('🖱️ 標準クリックを実行', 'info');
      }

      this.log(`ステップ3: メニュー表示待機中（${AI_WAIT_CONFIG.MEDIUM_WAIT}ms）...`, 'info');
      await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);

      this.log('ステップ4: モデルメニューの表示確認中...', 'info');
      const menu = findElement(this.selectors.modelMenu);
      if (!menu) {
        this.log('❌ ステップ4失敗: モデルメニューが開きませんでした', 'error');
        throw new Error('モデルメニューが開きませんでした');
      }
      this.log('✅ ステップ4完了: モデルメニューが正常に表示されました', 'success');

      return menu;
    }

    // 3-1-1-4. メニューを閉じる
    // 開いているメニューを閉じる
    async closeMenu() {
      // Escapeキーで閉じる
      triggerKeyboardEvent('Escape');
      await sleep(AI_WAIT_CONFIG.TINY_WAIT);

      // オーバーレイクリックでも閉じる
      const overlay = document.querySelector('.cdk-overlay-backdrop, [data-radix-portal]');
      if (overlay) {
        overlay.click();
        await sleep(AI_WAIT_CONFIG.TINY_WAIT);
      }
    }

    // 3-1-1-5. 現在のモデルを取得
    // 現在選択されているモデル名を取得
    async getCurrentModel() {
      const modelButton = findElement(this.selectors.modelButton);
      if (!modelButton) {
        return null;
      }

      return getCleanText(modelButton);
    }

    // 3-1-1-6. モデル選択
    // 指定されたモデルを選択
    async selectModel(modelName) {
      this.log(`🎯 モデル選択開始: ${modelName || 'デフォルト'}`, 'info');

      if (!modelName || modelName === 'default' || modelName === 'auto') {
        this.log('✅ デフォルトモデルを使用（選択操作をスキップ）', 'success');
        return;
      }

      try {
        this.log('ステップ1: モデル選択メニューを開く...', 'info');
        const menu = await this.openModelMenu();

        this.log('ステップ2: メニュー項目を検索中...', 'info');
        const modelItems = findElements(['[role="menuitem"]'], menu);
        this.log(`📋 検索対象: ${modelItems.length}個のメニュー項目`, 'info');

        let selected = false;
        for (let i = 0; i < modelItems.length; i++) {
          const item = modelItems[i];
          const itemText = getCleanText(item);
          this.log(`検査中[${i+1}/${modelItems.length}]: "${itemText}"`, 'info');

          if (itemText.toLowerCase().includes(modelName.toLowerCase())) {
            this.log(`✅ ステップ3: 対象モデル発見 - "${itemText}"`, 'success');
            this.log('ステップ4: モデル選択クリックを実行...', 'info');
            item.click();
            selected = true;
            this.log(`✅ モデル選択完了: ${itemText}`, 'success');
            break;
          }
        }

        if (!selected) {
          this.log(`❌ ステップ3失敗: モデル "${modelName}" が見つかりません`, 'error');
        }

        this.log(`ステップ5: 操作完了待機中（${AI_WAIT_CONFIG.MEDIUM_WAIT}ms）...`, 'info');
        await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
        this.log('✅ モデル選択処理完了', 'success');
      } catch (error) {
        this.log(`❌ モデル選択エラー: ${error.message}`, 'error');
      }
    }

    // 3-1-1-7. 機能選択
    // 指定された機能を選択
    async selectFeature(featureName) {
      if (!featureName || featureName === 'none' || featureName === '通常') {
        this.log('機能選択なし', 'info');
        return;
      }

      // AI別の機能選択処理
      // 各AIの具体的な実装は個別ファイルで行う
      this.log(`機能選択: ${featureName}`, 'info');
    }
  }

  // ----------------------------------------
  // 3-2. ResponseHandler
  // 応答待機の共通処理
  // ----------------------------------------

  // 3-2-1. ResponseHandlerクラス
  class ResponseHandler {
    constructor(aiType) {
      this.aiType = aiType || detectAI();
      this.selectors = this.getSelectors();
      this.log = log;
    }

    // 3-2-1-1. セレクタ取得
    getSelectors() {
      switch (this.aiType) {
        case AI_TYPES.CHATGPT:
          return CHATGPT_SELECTORS;
        case AI_TYPES.CLAUDE:
          return CLAUDE_SELECTORS;
        case AI_TYPES.GEMINI:
          return GEMINI_SELECTORS;
        default:
          return {};
      }
    }

    // 3-2-1-2. 通常モード待機
    // 通常の応答完了を待機
    async waitNormalResponse() {
      this.log(`🔄 ${this.aiType} 応答待機開始`, 'info');
      const startTime = Date.now();

      // 初期待機
      this.log(`ステップ1: 初期待機中（${AI_WAIT_CONFIG.INITIAL_WAIT / 1000}秒）...`, 'info');
      await sleep(AI_WAIT_CONFIG.INITIAL_WAIT);

      return new Promise((resolve, reject) => {
        let waitTime = 0;
        const maxWait = AI_WAIT_CONFIG.MAX_WAIT;
        let checkCount = 0;

        this.log(`ステップ2: 応答完了監視開始（最大${maxWait / 1000}秒）`, 'info');

        const checker = setInterval(() => {
          checkCount++;
          const stopButton = findElement(this.selectors.stopButton);

          // 10秒ごとに進行状況をログ出力
          if (checkCount % (10000 / AI_WAIT_CONFIG.CHECK_INTERVAL) === 0) {
            this.log(`⏱️ 経過時間: ${Math.round(waitTime / 1000)}秒 - 停止ボタン: ${stopButton ? '表示中' : '非表示'}`, 'info');
          }

          if (!stopButton) {
            clearInterval(checker);
            const elapsedTime = Date.now() - startTime;
            this.log(`✅ ステップ3完了: 応答完了を検出（${Math.round(elapsedTime / 1000)}秒）`, 'success');
            resolve(`応答完了`);
            return;
          }

          if (waitTime >= maxWait) {
            clearInterval(checker);
            this.log(`❌ ステップ3失敗: タイムアウト（${maxWait / 1000}秒）`, 'warning');
            resolve(`タイムアウト`);
            return;
          }

          if (waitTime % AI_WAIT_CONFIG.LOG_INTERVAL === 0) {
            this.log(`[待機中] ${waitTime / 1000}秒 / 最大${maxWait / 1000}秒`, 'info');
          }

          waitTime += AI_WAIT_CONFIG.CHECK_INTERVAL;
        }, AI_WAIT_CONFIG.CHECK_INTERVAL);
      });
    }

    // 3-2-1-3. Canvasモード待機
    // Canvas機能の応答完了を待機
    async waitCanvasResponse() {
      const startTime = Date.now();

      // 初期待機
      this.log(`Canvas初期待機: ${AI_WAIT_CONFIG.INITIAL_WAIT / 1000}秒`, 'info');
      await sleep(AI_WAIT_CONFIG.INITIAL_WAIT);

      return new Promise((resolve, reject) => {
        let lastLength = -1;
        let lastChangeTime = Date.now();

        const monitor = setInterval(() => {
          const canvasElement = findElement(['.ProseMirror', '.canvas-content']);
          if (!canvasElement) return;

          const currentLength = canvasElement.textContent.length;

          if (currentLength > lastLength) {
            lastLength = currentLength;
            lastChangeTime = Date.now();
            this.log(`[Canvas監視中] 文字数: ${currentLength}`, 'info');
          }

          // 安定判定
          if (Date.now() - lastChangeTime > SPECIAL_MODE_CONFIG.STABILITY_DURATION) {
            clearInterval(monitor);
            const elapsedTime = Date.now() - startTime;
            this.log(`Canvas応答安定（${Math.round(elapsedTime / 1000)}秒）`, 'success');
            resolve('Canvas応答完了');
          }
        }, AI_WAIT_CONFIG.CHECK_INTERVAL);

        // タイムアウト設定
        setTimeout(() => {
          clearInterval(monitor);
          reject(new Error('Canvasタイムアウト'));
        }, SPECIAL_MODE_CONFIG.CANVAS_MAX_WAIT);
      });
    }

    // 3-2-1-4. Deep Researchモード待機
    // Deep Research機能の応答完了を待機（Claude専用）
    async waitDeepResearchResponse() {
      this.log(`🔬 ${this.aiType} Deep Research応答待機開始`, 'info');
      const startTime = Date.now();
      const MAX_WAIT = SPECIAL_MODE_CONFIG.DEEP_RESEARCH_WAIT;
      this.log(`⏰ Deep Research最大待機時間: ${MAX_WAIT / 60000}分`, 'info');

      this.log('Deep Researchモードで応答を監視します', 'info');

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Deep Researchタイムアウト（${MAX_WAIT / 60000}分）`));
        }, MAX_WAIT);

        // Deep Research固有の処理
        // 詳細な実装は2-2-claude-automation.jsで行う

        // 仮実装
        setTimeout(() => {
          clearTimeout(timeoutId);
          resolve('Deep Research完了');
        }, 5000);
      });
    }
  }

  // ----------------------------------------
  // 3-3. DOMObserver
  // DOM変更監視の共通処理
  // ----------------------------------------

  // 3-3-1. DOM監視クラス
  class DOMObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.observer = null;
      this.options = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        characterData: true,
        ...options
      };
    }

    // 3-3-1-1. 監視開始
    start(targetNode = document.body) {
      if (this.observer) {
        this.stop();
      }

      this.observer = new MutationObserver(this.callback);
      this.observer.observe(targetNode, this.options);
      log('DOM監視開始', 'info');
    }

    // 3-3-1-2. 監視停止
    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
        log('DOM監視停止', 'info');
      }
    }

    // 3-3-1-3. 一時停止と再開
    pause() {
      if (this.observer) {
        this.observer.disconnect();
        log('DOM監視一時停止', 'info');
      }
    }

    resume(targetNode = document.body) {
      if (this.observer) {
        this.observer.observe(targetNode, this.options);
        log('DOM監視再開', 'info');
      }
    }
  }

  // ========================================
  // 3-4. RetryManager - 失敗時の自動リトライ処理（統合）
  // ========================================

  function createRetryManager(logger = console) {
    return {
      logger: logger,
      pcId: 'AI-Common-Base',
      maxGroupRetryCount: 10,
      groupRetryDelays: [30000, 60000, 300000, 600000, 1200000, 2400000, 3600000, 5400000, 7200000, 9000000],
      waitingTextPatterns: ['お待ちください...', '現在操作中です'],
      groupFailedTasks: new Map(),
      groupEmptyTasks: new Map(),
      groupResponseFailures: new Map(),
      groupRetryCount: new Map(),
      groupRetryStats: new Map(),
      groupRetryTimers: new Map(),

      recordFailedTask(groupId, task) {
        if (!this.groupFailedTasks.has(groupId)) {
          this.groupFailedTasks.set(groupId, new Map());
        }
        const columnMap = this.groupFailedTasks.get(groupId);
        if (!columnMap.has(task.column)) {
          columnMap.set(task.column, new Set());
        }
        columnMap.get(task.column).add(task);
        this.logger.log(`【AI共通基盤-RetryManager】失敗タスクを記録: グループ${groupId} - ${task.column}${task.row}`);
      },

      recordEmptyTask(groupId, task) {
        if (!this.groupEmptyTasks.has(groupId)) {
          this.groupEmptyTasks.set(groupId, new Map());
        }
        const columnMap = this.groupEmptyTasks.get(groupId);
        if (!columnMap.has(task.column)) {
          columnMap.set(task.column, new Set());
        }
        columnMap.get(task.column).add(task);
        this.logger.log(`【AI共通基盤-RetryManager】空白セルを記録: グループ${groupId} - ${task.column}${task.row}`);
      },

      isWaitingText(text) {
        if (!text) return false;
        if (text === '処理完了') return true;
        if (text.startsWith('現在操作中です_')) return true;
        return this.waitingTextPatterns.some(pattern => text === pattern);
      },

      async executeWithRetry(config) {
        const { action, isSuccess = (result) => result && result.success !== false, maxRetries = 3, retryDelay = 2000, actionName = '処理', context = {} } = config;
        let retryCount = 0;
        let lastResult = null;
        let lastError = null;

        while (retryCount < maxRetries) {
          try {
            if (retryCount > 0) {
              this.logger.log(`【AI共通基盤-RetryManager】${actionName} 再試行 ${retryCount}/${maxRetries}`, context);
            }
            lastResult = await action();
            if (isSuccess(lastResult)) {
              if (retryCount > 0) {
                this.logger.log(`【AI共通基盤-RetryManager】✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
              }
              return { success: true, result: lastResult, retryCount };
            }
          } catch (error) {
            lastError = error;
            this.logger.error(`【AI共通基盤-RetryManager】${actionName} エラー`, { ...context, attempt: retryCount + 1, error: error.message });
          }
          retryCount++;
          if (retryCount >= maxRetries) {
            return { success: false, result: lastResult, error: lastError, retryCount };
          }
          if (retryDelay > 0) {
            await sleep(retryDelay);
          }
        }
        return { success: false, result: lastResult, error: lastError, retryCount };
      },

      async delay(ms) {
        return sleep(ms);
      },

      // WindowService用のシンプルなリトライメソッド
      async executeSimpleRetry({ action, isSuccess, maxRetries = 10, interval = 500, actionName = '', context = {} }) {
        let retryCount = 0;
        let lastResult = null;
        let lastError = null;

        while (retryCount < maxRetries) {
          try {
            if (retryCount > 0) {
              this.logger.log(`【AI共通基盤-RetryManager】${actionName} 再試行 ${retryCount}/${maxRetries}`, context);
            }
            lastResult = await action();
            if (isSuccess(lastResult)) {
              if (retryCount > 0) {
                this.logger.log(`【AI共通基盤-RetryManager】✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
              }
              return { success: true, result: lastResult, retryCount };
            }
          } catch (error) {
            lastError = error;
            this.logger.error(`【AI共通基盤-RetryManager】${actionName} エラー`, { ...context, attempt: retryCount + 1, error: error.message });
          }
          retryCount++;
          if (retryCount >= maxRetries) {
            return { success: false, result: lastResult, error: lastError, retryCount };
          }
          if (interval > 0) {
            await sleep(interval);
          }
        }
        return { success: false, result: lastResult, error: lastError, retryCount };
      }
    };
  }

  // ========================================
  // 4. API公開
  // ========================================

  // 4-1. グローバルAPI設定
  // Service Worker対応: windowまたはglobalThisに公開
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  globalScope.AICommonBase = {
    // 4-1-1. 設定
    config: {
      wait: AI_WAIT_CONFIG,
      specialMode: SPECIAL_MODE_CONFIG,
      features: FEATURE_CONSTANTS,
      aiTypes: AI_TYPES,
      selectors: {
        chatgpt: CHATGPT_SELECTORS,
        claude: CLAUDE_SELECTORS,
        gemini: GEMINI_SELECTORS
      }
    },

    // 4-1-2. ユーティリティ（Step 1: sleep-utils関数群を追加）
    utils: {
      // 基本関数
      sleep,
      log,
      detectAI,

      // sleep-utils統合関数群
      sleepWithLog,
      randomWaitTime,
      randomSleep,
      aiWait,
      waitForCondition,
      exponentialBackoffSleep,
      presetSleep,
      waitForUI,
      waitForMenu,
      waitForResponse,
      waitForDeepResearch,
      getWaitTimeForFunction,
      waitForFunction,

      // DOM操作
      findElement,
      findElements,
      isElementInteractable,
      findElementByText,

      // テキスト処理
      getCleanText,
      formatPromptWithCellInfo,

      // イベント処理
      triggerReactEvent,
      triggerKeyboardEvent
    },

    // 4-1-3. ハンドラー
    handlers: {
      MenuHandler,
      ResponseHandler,
      DOMObserver
    },

    // 4-1-4. RetryManager - 失敗時の自動リトライ処理（統合）
    RetryManager: createRetryManager(),

    // 4-1-5. バージョン情報
    version: '1.0.0',
    lastUpdated: '2024-12-14'
  };

  // レガシー互換性（Service Worker対応）
  if (typeof window !== 'undefined') {
    window.AI_WAIT_CONFIG = AI_WAIT_CONFIG;
    window.AIHandler = window.AIHandler || {};
    window.AIHandler.MenuHandler = MenuHandler;
    window.AIHandler.utils = globalScope.AICommonBase.utils;
  }

  log('AI共通基盤 v1.0.0 初期化完了', 'success');
  log(`検出されたAI: ${detectAI() || 'なし'}`, 'info');

  return globalScope.AICommonBase;
})();

// グローバル関数として公開（コンテンツスクリプト互換）
// ES6モジュールのexportはコンテンツスクリプトでは使用できないため
// globalScopeを再定義してアクセス
const globalScope2 = typeof window !== 'undefined' ? window : globalThis;
globalScope2.getGlobalAICommonBase = function() {
  // グローバル変数から取得
  if (typeof window !== 'undefined' && window.AICommonBase) {
    return window.AICommonBase;
  }
  // Service Worker環境の場合
  if (typeof globalThis !== 'undefined' && globalThis.AICommonBase) {
    return globalThis.AICommonBase;
  }
  // Step 2: フォールバック削除 - 該当環境がない場合はnullを返す
  return null;
};