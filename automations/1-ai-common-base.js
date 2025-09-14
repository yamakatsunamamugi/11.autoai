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

  // 2-1-1. sleep関数
  // 指定時間待機する基本関数
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
  // 現在のサイトがどのAIか判定
  function detectAI() {
    const url = window.location.href;
    const hostname = window.location.hostname;

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
  // 要素がクリック可能か確認
  function isElementInteractable(element) {
    if (!element) return false;

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
      const menuButton = findElement(this.selectors.modelButton);
      if (!menuButton) {
        throw new Error('モデル選択ボタンが見つかりません');
      }

      if (this.aiType === AI_TYPES.CHATGPT) {
        triggerReactEvent(menuButton, 'pointer');
      } else {
        menuButton.click();
      }

      await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);

      const menu = findElement(this.selectors.modelMenu);
      if (!menu) {
        throw new Error('モデルメニューが開きませんでした');
      }

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
      if (!modelName || modelName === 'default' || modelName === 'auto') {
        this.log('デフォルトモデルを使用', 'info');
        return;
      }

      try {
        const menu = await this.openModelMenu();

        // モデルを探して選択
        const modelItems = findElements(['[role="menuitem"]'], menu);
        let selected = false;

        for (const item of modelItems) {
          const itemText = getCleanText(item);
          if (itemText.toLowerCase().includes(modelName.toLowerCase())) {
            item.click();
            selected = true;
            this.log(`モデル選択: ${itemText}`, 'success');
            break;
          }
        }

        if (!selected) {
          this.log(`モデル "${modelName}" が見つかりません`, 'warning');
        }

        await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
      } catch (error) {
        this.log(`モデル選択エラー: ${error.message}`, 'error');
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
      const startTime = Date.now();

      // 初期待機
      this.log(`初期待機: ${AI_WAIT_CONFIG.INITIAL_WAIT / 1000}秒`, 'info');
      await sleep(AI_WAIT_CONFIG.INITIAL_WAIT);

      return new Promise((resolve, reject) => {
        let waitTime = 0;
        const maxWait = AI_WAIT_CONFIG.MAX_WAIT;

        const checker = setInterval(() => {
          const stopButton = findElement(this.selectors.stopButton);

          if (!stopButton) {
            clearInterval(checker);
            const elapsedTime = Date.now() - startTime;
            this.log(`応答完了（${Math.round(elapsedTime / 1000)}秒）`, 'success');
            resolve(`応答完了`);
            return;
          }

          if (waitTime >= maxWait) {
            clearInterval(checker);
            this.log(`タイムアウト（${maxWait / 1000}秒）`, 'warning');
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
      const startTime = Date.now();
      const MAX_WAIT = SPECIAL_MODE_CONFIG.DEEP_RESEARCH_WAIT;

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
  // 4. API公開
  // ========================================

  // 4-1. グローバルAPI設定
  // 各種機能をwindowオブジェクトに公開
  window.AICommonBase = {
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

    // 4-1-2. ユーティリティ
    utils: {
      // 基本関数
      sleep,
      log,
      detectAI,

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

    // 4-1-4. バージョン情報
    version: '1.0.0',
    lastUpdated: '2024-12-14'
  };

  // レガシー互換性（既存コードとの互換性維持）
  window.AI_WAIT_CONFIG = AI_WAIT_CONFIG;
  window.AIHandler = window.AIHandler || {};
  window.AIHandler.MenuHandler = MenuHandler;
  window.AIHandler.utils = window.AICommonBase.utils;

  log('AI共通基盤 v1.0.0 初期化完了', 'success');
  log(`検出されたAI: ${detectAI() || 'なし'}`, 'info');

  return window.AICommonBase;
})();