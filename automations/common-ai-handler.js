/**
 * @fileoverview AI自動化統合ハンドラー
 * 
 * 【役割】
 * 全AI（ChatGPT、Claude、Gemini）の共通操作を統合管理するメインハンドラー
 * 
 * 【主要機能】
 * - ui-selectors.jsからセレクタを動的に読み込み
 * - メニュー操作（モデル選択、機能選択）の共通処理
 * - メッセージ送信・応答待機の共通処理
 * - AI別のクリック戦略の実装
 * 
 * 【ファイル間の関係】
 * ui-selectors.js（セレクタ定義）→ 当ファイル → 各AI個別ファイル
 * 
 * 【使用方法】
 * - window.AIHandler: 各AI個別ファイルから呼び出される
 * - menuHandler = new window.AIHandler.MenuHandler(aiType)
 * 
 * 【依存関係】
 * - src/config/ui-selectors.js: UIセレクタ定義
 * - 各AI個別ファイル: このハンドラーを使用
 */
(() => {
  "use strict";

  // ========================================
  // UI_SELECTORSを読み込み
  // ========================================
  let UI_SELECTORS = null;
  let loadingPromise = null;
  let loadAttempted = false;
  
  // セレクタの読み込みを試みる
  async function loadSelectors() {
    if (loadingPromise) {
      return loadingPromise;
    }
    
    if (loadAttempted && UI_SELECTORS) {
      return UI_SELECTORS;
    }
    
    loadingPromise = (async () => {
      try {
        loadAttempted = true;
        log('UI_SELECTORSの読み込み開始...', 'INFO');
        
        // Chrome拡張機能として動作している場合
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          const url = chrome.runtime.getURL('src/config/ui-selectors.js');
          const module = await import(url);
          UI_SELECTORS = module.UI_SELECTORS;
          log('UI_SELECTORSの読み込み成功', 'SUCCESS');
        } else {
          log('Chrome拡張機能環境ではありません', 'WARNING');
        }
      } catch (error) {
        log(`UI_SELECTORSの読み込み失敗: ${error.message}`, 'ERROR');
      } finally {
        loadingPromise = null;
      }
      return UI_SELECTORS;
    })();
    
    return loadingPromise;
  }

  // ========================================
  // セレクタ取得関数
  // ========================================
  async function getSelectorsSafe(aiName, selectorType) {
    // UI_SELECTORSが読み込まれていない場合は読み込みを試行
    if (!UI_SELECTORS && !loadAttempted) {
      await loadSelectors();
    }
    
    // UI_SELECTORSが読み込まれていれば使用
    if (UI_SELECTORS && UI_SELECTORS[aiName]) {
      const selectors = UI_SELECTORS[aiName][selectorType] || [];
      log(`セレクタ取得成功: ${aiName}.${selectorType} (${selectors.length}個)`, 'DEBUG');
      return selectors;
    }
    
    // フォールバック: 基本的なセレクタを返す
    const fallbackSelectors = getFallbackSelectors(aiName, selectorType);
    if (fallbackSelectors.length > 0) {
      log(`フォールバックセレクタを使用: ${aiName}.${selectorType} (${fallbackSelectors.length}個)`, 'WARNING');
      return fallbackSelectors;
    }
    
    // UI_SELECTORSが利用できない場合はエラー
    log(`UI_SELECTORSが読み込まれていません: ${aiName}.${selectorType}`, 'ERROR');
    return [];
  }
  
  // 同期版（互換性のため）
  function getSelectors(aiName, selectorType) {
    // UI_SELECTORSが読み込まれていれば使用
    if (UI_SELECTORS && UI_SELECTORS[aiName]) {
      const selectors = UI_SELECTORS[aiName][selectorType] || [];
      log(`セレクタ取得成功: ${aiName}.${selectorType} (${selectors.length}個)`, 'DEBUG');
      return selectors;
    }
    
    // フォールバック: 基本的なセレクタを返す
    const fallbackSelectors = getFallbackSelectors(aiName, selectorType);
    if (fallbackSelectors.length > 0) {
      log(`フォールバックセレクタを使用: ${aiName}.${selectorType} (${fallbackSelectors.length}個)`, 'WARNING');
      return fallbackSelectors;
    }
    
    // UI_SELECTORSが利用できない場合はエラー
    log(`UI_SELECTORSが読み込まれていません: ${aiName}.${selectorType}`, 'ERROR');
    return [];
  }
  
  // フォールバックセレクタ定義
  function getFallbackSelectors(aiName, selectorType) {
    const fallbacks = {
      'ChatGPT': {
        'MENU_ITEM': [
          '[role="option"]',
          '[role="menuitem"]',
          '[role="menuitemradio"]'  // Deep Research等のラジオボタン機能
        ],
        'FUNCTION_BUTTON': [
          '[data-testid="composer-plus-btn"]',
          '[data-testid="input-menu-trigger"]',
          '[aria-label="Add"]'
        ],
        'MODEL_BUTTON': [
          '[data-testid="model-switcher-dropdown-button"]',
          'button[aria-label*="モデル"]',
          'button[aria-haspopup="menu"]'
        ]
      },
      'Claude': {
        'MENU_ITEM': [
          '[role="option"]',
          '[role="menuitem"]',
          '[role="menuitemradio"]'
        ]
      },
      'Gemini': {
        'MENU_ITEM': [
          '[role="menuitemradio"]',
          '[role="menuitem"]',
          'button[mat-list-item]'
        ]
      }
    };
    
    return (fallbacks[aiName] && fallbacks[aiName][selectorType]) || [];
  }

  // ========================================
  // 共通設定
  // ========================================
  const CONFIG = {
    DELAYS: {
      elementSearch: 100,    // 要素検索の間隔
      click: 50,            // クリック後の待機
      textInput: 500,       // テキスト入力後の待機
      betweenActions: 1000, // アクション間の待機
      menuOpen: 2000,       // メニュー表示待機（1500→2000ms）
      menuClose: 1000,      // メニュー閉じる待機
      modelSwitch: 2000,    // モデル切替待機
      submenuOpen: 1000,    // サブメニュー表示待機
      submit: 1000,         // 送信後の待機
      responseCheck: 500    // 応答チェック間隔
    },
    TIMEOUTS: {
      elementSearch: 3000,  // 要素検索のタイムアウト
      menuWait: 8000,       // メニュー表示待機（5000→8000ms）
      responseWait: 60000   // 応答待機のデフォルト
    },
    claudeWaitTime: 500,    // Claude専用待機時間
    maxRetries: 3
  };

  // ========================================
  // ユーティリティ関数
  // ========================================
  const log = (message, type = 'INFO', aiName = 'AIHandler') => {
    const prefix = {
      'INFO': '📝',
      'SUCCESS': '✅',
      'ERROR': '❌',
      'WARNING': '⚠️',
      'DEBUG': '🔍',
      'MODEL': '🤖',
      'FEATURE': '🔧',
      'SEARCH': '🔎'
    }[type.toUpperCase()] || '📝';
    console.log(`${prefix} [${aiName}] ${message}`);
  };

  const debugLog = (message, aiName = 'AIHandler') => {
    if (window.DEBUG_MODE) {
      console.log(`🔍 [${aiName}:Debug] ${message}`);
    }
  };

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // AI種別を自動検出
  const detectAI = () => {
    const hostname = window.location.hostname;
    if (hostname.includes('claude.ai')) return 'Claude';
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'ChatGPT';
    if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) return 'Gemini';
    return 'Unknown';
  };

  // ========================================
  // 要素操作関数
  // ========================================
  const findElement = async (selectors, condition = null, maxWait = CONFIG.TIMEOUTS.elementSearch) => {
    if (!selectors || (Array.isArray(selectors) && selectors.length === 0)) {
      log('セレクタが指定されていません', 'ERROR');
      return null;
    }

    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    const startTime = Date.now();
    
    debugLog(`要素を検索中: ${selectorArray.join(', ')}`);
    
    while (Date.now() - startTime < maxWait) {
      for (const selector of selectorArray) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (element && element.offsetParent !== null) {
              if (!condition || condition(element)) {
                debugLog(`要素発見: ${selector}`);
                return element;
              }
            }
          }
        } catch (e) {
          debugLog(`セレクタエラー: ${selector} - ${e.message}`);
        }
      }
      await wait(CONFIG.DELAYS.elementSearch);
    }
    
    debugLog(`要素が見つかりませんでした (${maxWait}ms経過)`);
    return null;
  };

  const findElements = async (selectors, maxWait = CONFIG.TIMEOUTS.elementSearch) => {
    if (!selectors || (Array.isArray(selectors) && selectors.length === 0)) {
      log('セレクタが指定されていません', 'ERROR');
      return [];
    }

    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    const startTime = Date.now();
    const foundElements = [];
    
    while (Date.now() - startTime < maxWait && foundElements.length === 0) {
      for (const selector of selectorArray) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (element && element.offsetParent !== null) {
              foundElements.push(element);
            }
          }
        } catch (e) {}
      }
      
      if (foundElements.length === 0) {
        await wait(CONFIG.DELAYS.elementSearch);
      }
    }
    
    return foundElements;
  };

  const performClick = async (element) => {
    if (!element) {
      log('クリック対象の要素がnullです', 'ERROR');
      return false;
    }

    try {
      debugLog(`要素をクリック: ${element.tagName}${element.className ? '.' + element.className : ''}`);
      
      if (element.offsetParent === null) {
        log('要素が非表示です', 'WARNING');
        return false;
      }

      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1
      }));

      await wait(CONFIG.DELAYS.click);

      element.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1
      }));

      element.click();
      
      await wait(CONFIG.DELAYS.click);
      debugLog('クリック成功');
      return true;
      
    } catch (error) {
      log(`クリックエラー: ${error.message}`, 'ERROR');
      return false;
    }
  };

  const inputText = async (element, text) => {
    if (!element) {
      log('入力対象の要素がnullです', 'ERROR');
      return false;
    }

    if (!text) {
      log('入力するテキストが空です', 'WARNING');
      return false;
    }

    try {
      element.focus();
      await wait(CONFIG.DELAYS.textInput);

      if (element.contentEditable === 'true') {
        element.textContent = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog('contentEditableへの入力完了');
      }
      else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog('TEXTAREA/INPUTへの入力完了');
      }
      else if (element.classList?.contains('ProseMirror')) {
        element.innerHTML = `<p>${text}</p>`;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog('ProseMirrorへの入力完了');
      }
      else if (element.classList?.contains('ql-editor')) {
        element.innerHTML = `<p>${text}</p>`;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog('Quillエディタへの入力完了');
      }
      else {
        element.textContent = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog('その他要素への入力完了');
      }

      await wait(CONFIG.DELAYS.textInput);
      return true;

    } catch (error) {
      log(`テキスト入力エラー: ${error.message}`, 'ERROR');
      return false;
    }
  };

  // ========================================
  // メニュー操作
  // ========================================
  
  // メニューが開いているか確認する関数
  const isMenuOpen = () => {
    const selectors = [
      '[role="menu"]:not([style*="display: none"])',
      '[data-state="open"]',
      '[data-radix-menu-content]',
      '.mat-mdc-menu-panel',
      '[aria-expanded="true"]',
      '[data-radix-popper-content-wrapper]',
      '.cdk-overlay-pane'
    ];
    
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          debugLog(`メニュー検出: ${selector}`);
          return true;
        }
      } catch (e) {
        // セレクタエラーは無視
      }
    }
    return false;
  };
  
  // 複数のクリック方法を試す関数（成功例のクリック方法のみ使用）
  const tryMultipleClickMethods = async (element, checkFunction, aiType) => {
    if (!element) {
      log('クリック対象の要素がnullです', 'ERROR');
      return null;
    }
    
    // ChatGPTの場合はサイズチェックをスキップして直接クリック
    if (aiType === 'ChatGPT') {
      log('ChatGPT: 要素を直接クリックします', 'DEBUG');
    } else {
      // 他のAIの場合は従来通りサイズチェック
      const rect = element.getBoundingClientRect();
      const visible = element.offsetParent !== null;
      const inViewport = rect.width > 0 && rect.height > 0;
      
      log(`要素の状態: visible=${visible}, inViewport=${inViewport}, size=${rect.width}x${rect.height}, pos=${rect.x},${rect.y}`, 'DEBUG');
      
      if (rect.width === 0 || rect.height === 0) {
        log('要素のサイズが0のためクリックをスキップします', 'WARNING');
        return null;
      }
    }
    
    // 複数のクリック方法を定義
    const clickMethods = [
      {
        name: 'element.click()',
        execute: () => element.click()
      },
      {
        name: 'MouseEvent',
        execute: () => {
          element.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          }));
        }
      },
      {
        name: 'PointerEvent',
        execute: () => {
          element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          element.dispatchEvent(new PointerEvent('click', { bubbles: true }));
        }
      },
      {
        name: 'MouseEvent with coordinates',
        execute: () => {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          element.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          }));
        }
      },
      {
        name: 'Focus + Enter',
        execute: () => {
          element.focus();
          element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        }
      }
    ];
    
    // 各クリック方法を順番に試す
    for (const method of clickMethods) {
      try {
        log(`${aiType}: ${method.name}でクリックを試行中...`, 'INFO', aiType);
        await method.execute();
        await wait(500); // クリック後の待機を短縮
        
        if (await checkFunction()) {
          log(`✅ ${method.name}で成功！`, 'SUCCESS', aiType);
          return method.name;
        } else {
          log(`${method.name}では反応なし、次の方法を試します`, 'DEBUG', aiType);
        }
      } catch (error) {
        log(`${method.name}でエラー: ${error.message}`, 'DEBUG', aiType);
      }
    }
    
    log('全てのクリック方法が失敗しました', 'WARNING', aiType);
    return null;
  };
  
  const waitForMenu = async (menuSelectors = null, maxWait = CONFIG.TIMEOUTS.menuWait) => {
    const aiType = detectAI();
    
    // isMenuOpenと同じセレクタを使用
    const selectors = menuSelectors || [
      '[role="menu"]:not([style*="display: none"])',
      '[data-state="open"]',
      '[data-radix-menu-content]',
      '.mat-mdc-menu-panel',
      '[aria-expanded="true"]',
      '[data-radix-popper-content-wrapper]',
      '.cdk-overlay-pane',
      '[role="menu"]'
    ];
    
    debugLog(`waitForMenu: ${selectors.length}個のセレクタで検索中...`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      // isMenuOpenと同じロジックを使用
      if (isMenuOpen()) {
        // メニューが開いていることを確認したら、要素を探す
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
              log(`メニュー発見: ${selector}`, 'SUCCESS', aiType);
              return element;
            }
          } catch (e) {
            // セレクタエラーは無視
          }
        }
      }
      await wait(100);
    }
    
    log('メニューが見つかりませんでした', 'WARNING', aiType);
    return null;
  };

  const closeMenu = async () => {
    const aiType = detectAI();
    
    if (aiType === 'Claude') {
      // Claude専用のメニュークローズ処理
      document.body.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true
      }));
    } else {
      // 汎用的なメニュークローズ
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true
      }));
      document.body.click();
    }
    
    await wait(CONFIG.DELAYS.menuClose);
  };

  // ========================================
  // 要素の状態チェック
  // ========================================
  const isElementVisible = (element) => {
    if (!element) return false;
    return element.offsetParent !== null;
  };

  const isElementEnabled = (element) => {
    if (!element) return false;
    return !element.disabled && !element.hasAttribute('disabled');
  };

  const waitForElementToDisappear = async (selector, maxWait = 60000) => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const element = document.querySelector(selector);
      if (!element || !isElementVisible(element)) {
        return true;
      }
      await wait(1000);
    }
    
    return false;
  };

  // ========================================
  // メッセージ処理の共通関数
  // ========================================
  const sendMessageCommon = async (sendButtonSelectors, aiName = null) => {
    const ai = aiName || detectAI();
    const selectors = sendButtonSelectors || getSelectors(ai, 'SEND_BUTTON');
    
    if (!selectors || selectors.length === 0) {
      log(`${ai}の送信ボタンセレクタが取得できません`, 'ERROR', ai);
      return false;
    }

    log('メッセージを送信中...', 'INFO', ai);
    const sendButton = await findElement(selectors);
    
    if (!sendButton) {
      log('送信ボタンが見つかりません', 'ERROR', ai);
      return false;
    }

    await performClick(sendButton, ai);
    log('📤 メッセージを送信しました', 'SUCCESS', ai);
    await wait(CONFIG.DELAYS.submit);
    return true;
  };

  const waitForResponseCommon = async (stopButtonSelectors, options = {}, aiName = null) => {
    const ai = aiName || detectAI();
    const {
      timeout = CONFIG.TIMEOUTS.responseWait,
      extendedTimeout = 30 * 60 * 1000,  // 30分
      sendStartTime = null
    } = options;
    
    const selectors = stopButtonSelectors || getSelectors(ai, 'STOP_BUTTON');
    
    if (!selectors || selectors.length === 0) {
      log(`${ai}の停止ボタンセレクタが取得できません`, 'WARNING', ai);
      return false;
    }

    log('AI応答を待機中...', 'INFO', ai);
    const startTime = Date.now();
    let lastMinuteLogged = 0;

    // 基本待機時間（デフォルト60秒）
    while (Date.now() - startTime < timeout) {
      const elapsedMs = Date.now() - startTime;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      
      // 1分ごとにログを出力
      if (elapsedMinutes > lastMinuteLogged) {
        lastMinuteLogged = elapsedMinutes;
        log(`応答待機中... (${elapsedMinutes}分経過)`, 'INFO', ai);
      }
      
      // 停止ボタンの存在確認
      const stopButton = await findElement(selectors, null, 100);
      
      if (!stopButton) {
        // 停止ボタンがない = 応答完了
        await wait(1000); // 念のため1秒待つ
        
        // 経過時間を計算
        if (sendStartTime) {
          const elapsedTotal = Date.now() - sendStartTime;
          const minutes = Math.floor(elapsedTotal / 60000);
          const seconds = Math.floor((elapsedTotal % 60000) / 1000);
          log(`✅ 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'SUCCESS', ai);
        } else {
          log('✅ 応答生成完了', 'SUCCESS', ai);
        }
        return true;
      }
      
      await wait(500);
    }

    // タイムアウト後も停止ボタンがある場合は待機を継続
    let stopButton = null;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        stopButton = element;
        break;
      }
    }
    
    if (stopButton) {
      log(`応答待機タイムアウト (${timeout/1000}秒経過) - 停止ボタンがまだ表示されているため待機を継続`, 'WARNING', ai);
      
      // 停止ボタンが消えるまで追加で待機
      const extendedStartTime = Date.now();
      
      while (Date.now() - extendedStartTime < extendedTimeout) {
        stopButton = null;
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            stopButton = element;
            break;
          }
        }
        
        if (!stopButton) {
          log('✅ 停止ボタンが消滅 - 応答生成完了', 'SUCCESS', ai);
          return true;
        }
        
        // 1分ごとにログ
        const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
        if (elapsedMinutes > lastMinuteLogged) {
          lastMinuteLogged = elapsedMinutes;
          log(`延長待機中... (合計 ${elapsedMinutes}分経過)`, 'INFO', ai);
        }
        
        await wait(1000);
      }
    }

    log('応答待機がタイムアウトしました', 'WARNING', ai);
    return false;
  };

  const getResponseCommon = async (responseSelectors, textExtractor, aiName = null) => {
    const ai = aiName || detectAI();
    const selectors = responseSelectors || getSelectors(ai, 'RESPONSE');
    
    if (!selectors || selectors.length === 0) {
      log(`${ai}の応答要素セレクタが取得できません`, 'ERROR', ai);
      return null;
    }

    log('応答テキストを取得中...', 'INFO', ai);
    
    // すべてのセレクタで最新の応答要素を探す
    let latestResponseElement = null;
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        latestResponseElement = elements[elements.length - 1];
        break;
      }
    }

    if (!latestResponseElement) {
      log('AI応答要素が見つかりません', 'ERROR', ai);
      return null;
    }

    // テキスト抽出関数が提供されている場合はそれを使用
    if (textExtractor && typeof textExtractor === 'function') {
      return textExtractor(latestResponseElement);
    }

    // AI別のデフォルトテキスト抽出
    let extractedText = '';
    
    if (ai === 'Claude') {
      // Claudeの場合：grid-cols-1クラスを持つdivからテキストを取得
      let gridContainer = latestResponseElement.querySelector('div.grid-cols-1.grid');
      
      // latestResponseElement自体がgrid-cols-1の場合も考慮
      if (!gridContainer && latestResponseElement.classList?.contains('grid-cols-1')) {
        gridContainer = latestResponseElement;
        debugLog('latestResponseElement自体がgrid-cols-1です');
      }
      
      if (gridContainer) {
        // grid内のすべてのp, h2, ul, liタグからテキストを取得（セレクタを拡張）
        const textElements = gridContainer.querySelectorAll('p, h2, ul li, li');
        const texts = [];
        
        debugLog(`Claudeテキスト要素数: ${textElements.length}`);
        
        textElements.forEach(el => {
          // Artifactやコードブロックは除外
          if (!el.closest('.artifact-block-cell') && 
              !el.closest('pre') && 
              !el.closest('code')) {
            const text = el.textContent?.trim();
            if (text && text.length > 0) {
              // h2タグの場合は改行を追加
              if (el.tagName === 'H2') {
                texts.push('\n' + text);
              } else {
                texts.push(text);
              }
              debugLog(`要素取得: ${el.tagName} - ${text.substring(0, 50)}...`);
            }
          }
        });
        
        extractedText = texts.join('\n');
        debugLog(`Claude応答: ${texts.length}要素, 合計${extractedText.length}文字`);
      } else {
        // フォールバック: 従来の方法
        const textElements = latestResponseElement.querySelectorAll('p, div.whitespace-pre-wrap, .prose');
        const texts = [];
        
        textElements.forEach(el => {
          if (!el.closest('.artifact-block-cell') && 
              !el.closest('pre') && 
              !el.closest('code')) {
            const text = el.textContent?.trim();
            if (text && text.length > 0 && !texts.includes(text)) {
              texts.push(text);
            }
          }
        });
        
        extractedText = texts.length > 0 ? texts.join('\n\n') : latestResponseElement.textContent?.trim() || '';
      }
      
    } else if (ai === 'ChatGPT') {
      // ChatGPTの場合：markdownクラスを優先
      const markdownElement = latestResponseElement.querySelector('.markdown');
      if (markdownElement) {
        extractedText = markdownElement.textContent?.trim() || '';
      } else {
        extractedText = latestResponseElement.textContent?.trim() || '';
      }
      
    } else if (ai === 'Gemini') {
      // Geminiの場合：レスポンスコンテナ内のテキストを取得
      const messageContent = latestResponseElement.querySelector('.message-content, .model-response-text');
      if (messageContent) {
        extractedText = messageContent.textContent?.trim() || '';
      } else {
        extractedText = latestResponseElement.textContent?.trim() || '';
      }
      
    } else {
      // その他の場合：全体のテキストを取得
      extractedText = latestResponseElement.textContent?.trim() || '';
    }

    if (extractedText) {
      const charCount = extractedText.length;
      const lineCount = extractedText.split('\n').length;
      log(`応答テキストを取得しました（${charCount}文字、${lineCount}行）`, 'SUCCESS', ai);
      
      // 途切れている可能性をチェック
      const lastChars = extractedText.slice(-50);
      if (lastChars.endsWith('...') || lastChars.includes('省略') || lastChars.includes('続き')) {
        log('⚠️ 応答が途切れている可能性があります', 'WARNING', ai);
      }
      
      return extractedText;
    }

    log('応答テキストを抽出できませんでした', 'ERROR', ai);
    return null;
  };

  const stopGenerationCommon = async (stopButtonSelectors, aiName = null) => {
    const ai = aiName || detectAI();
    const selectors = stopButtonSelectors || getSelectors(ai, 'STOP_BUTTON');
    
    if (!selectors || selectors.length === 0) {
      log(`${ai}の停止ボタンセレクタが取得できません`, 'ERROR', ai);
      return false;
    }

    log('生成を停止中...', 'INFO', ai);
    const stopButton = await findElement(selectors);
    
    if (!stopButton) {
      log('停止ボタンが見つかりません（既に停止している可能性があります）', 'WARNING', ai);
      return false;
    }

    await performClick(stopButton, ai);
    log('⏹️ 生成を停止しました', 'SUCCESS', ai);
    await wait(CONFIG.DELAYS.betweenActions);
    return true;
  };

  // 続きを生成する機能
  const continueGenerationCommon = async (aiName = null) => {
    const ai = aiName || detectAI();
    log('続きを生成中...', 'INFO', ai);
    
    // AI別の続き生成方法
    if (ai === 'Claude') {
      // Claudeの場合：「続けて」と入力して送信
      const inputSelectors = getSelectors(ai, 'INPUT');
      const inputField = await findElement(inputSelectors);
      if (inputField) {
        await inputText(inputField, '続けて');
        await wait(500);
        return await sendMessageCommon(null, ai);
      }
      
    } else if (ai === 'ChatGPT') {
      // ChatGPTの場合：「Continue generating」ボタンを探す
      const continueButton = await findElement([
        'button:has-text("Continue generating")',
        'button:has-text("続ける")',
        '[data-testid="continue-button"]'
      ]);
      if (continueButton) {
        await performClick(continueButton, ai);
        return true;
      }
      // ボタンがない場合は「続けて」と入力
      const inputSelectors = getSelectors(ai, 'INPUT');
      const inputField = await findElement(inputSelectors);
      if (inputField) {
        await inputText(inputField, '続けて');
        await wait(500);
        return await sendMessageCommon(null, ai);
      }
      
    } else if (ai === 'Gemini') {
      // Geminiの場合：「続けて」と入力して送信
      const inputSelectors = getSelectors(ai, 'INPUT');
      const inputField = await findElement(inputSelectors);
      if (inputField) {
        await inputText(inputField, '続けて');
        await wait(500);
        return await sendMessageCommon(null, ai);
      }
    }
    
    log('続きを生成できませんでした', 'ERROR', ai);
    return false;
  };

  // 完全な応答を取得（途切れた場合は続きも取得）
  const getFullResponseCommon = async (responseSelectors, textExtractor, maxContinue = 3, aiName = null) => {
    const ai = aiName || detectAI();
    let fullText = '';
    let continueCount = 0;
    
    while (continueCount <= maxContinue) {
      // 現在の応答を取得
      const response = await getResponseCommon(responseSelectors, textExtractor, ai);
      
      if (!response) {
        if (fullText) {
          // 既に一部取得している場合はそれを返す
          break;
        }
        return null;
      }
      
      // 新しいテキストを追加
      if (continueCount === 0) {
        fullText = response;
      } else {
        // 続きの場合は結合
        fullText += '\n\n' + response;
      }
      
      // 途切れチェック
      const lastChars = response.slice(-100);
      const isTruncated = lastChars.endsWith('...') || 
                          lastChars.includes('省略') || 
                          lastChars.includes('続き') ||
                          response.length > 10000; // 長すぎる場合も途切れの可能性
      
      if (!isTruncated) {
        // 途切れていない場合は完了
        break;
      }
      
      if (continueCount < maxContinue) {
        log(`応答が途切れています。続きを生成します（${continueCount + 1}/${maxContinue}）`, 'WARNING', ai);
        
        // 続きを生成
        const continued = await continueGenerationCommon(ai);
        if (!continued) {
          break;
        }
        
        // 応答を待つ
        await waitForResponseCommon(null, 60000, ai);
        continueCount++;
      } else {
        log(`最大継続回数（${maxContinue}）に達しました`, 'WARNING', ai);
        break;
      }
    }
    
    const charCount = fullText.length;
    const lineCount = fullText.split('\n').length;
    log(`完全な応答を取得しました（${charCount}文字、${lineCount}行、継続${continueCount}回）`, 'SUCCESS', ai);
    
    return fullText;
  };

  // ========================================
  // メニューハンドラークラス（common-menu-handlerから移植）
  // ========================================
  class MenuHandler {
    constructor() {
      this.aiType = detectAI();
      this.models = [];
      this.features = [];
      log(`AIタイプ検出: ${this.aiType}`, 'INFO');
    }

    async openModelMenu() {
      log('モデルメニューを開いています...', 'MODEL');
      
      const selectors = getSelectors(this.aiType, 'MODEL_BUTTON');
      if (!selectors || selectors.length === 0) {
        log(`${this.aiType}のモデルメニューセレクタが取得できません`, 'ERROR');
        return null;
      }

      const button = await findElement(selectors, null, CONFIG.TIMEOUTS.menuWait);
      if (!button) {
        log('モデルメニューボタンが見つかりません', 'ERROR');
        return null;
      }

      const currentModel = button.textContent?.trim();
      log(`現在のモデル: ${currentModel || '不明'}`, 'INFO');

      // 改善: AI別のクリック戦略を使用
      const clickMethod = await tryMultipleClickMethods(button, isMenuOpen, this.aiType);
      
      if (!clickMethod) {
        log('モデルメニューを開けませんでした', 'ERROR');
        return null;
      }

      const menu = await waitForMenu();
      if (!menu) {
        log('モデルメニューを開けませんでした', 'ERROR');
        return null;
      }

      log('モデルメニューが開きました', 'SUCCESS');
      return menu;
    }

    async getCurrentModel() {
      // モデルボタンからテキストを取得
      const selectors = getSelectors(this.aiType, 'MODEL_BUTTON');
      if (!selectors || selectors.length === 0) {
        return '不明';
      }

      const button = await findElement(selectors, null, 1000);
      if (!button) {
        return '不明';
      }

      const buttonText = button.textContent?.trim();
      
      // AI別の処理
      if (this.aiType === 'ChatGPT') {
        // "ChatGPT 5" のような形式から "5" を抽出
        if (buttonText?.includes('ChatGPT')) {
          return buttonText.replace('ChatGPT', '').trim();
        }
        return buttonText || '不明';
      } else if (this.aiType === 'Claude') {
        // ClaudeのモデルボタンまたはUIから取得
        const modelSelector = document.querySelector('.font-claude-response');
        if (modelSelector) {
          return modelSelector.textContent?.trim() || buttonText || '不明';
        }
        return buttonText || '不明';
      } else if (this.aiType === 'Gemini') {
        // Geminiのモデル表示から取得
        const modelSpan = document.querySelector('span[_ngcontent-ng-c3031725912]');
        if (modelSpan) {
          return modelSpan.textContent?.trim() || buttonText || '不明';
        }
        return buttonText || '不明';
      }
      
      return buttonText || '不明';
    }

    async getCurrentModelDisplay() {
      // 現在表示されているモデル名を取得（UI表示用）
      if (this.aiType === 'Claude') {
        // Claudeのモデル表示要素から取得
        const modelDisplay = document.querySelector('div.font-claude-response');
        if (modelDisplay) {
          const modelText = modelDisplay.textContent?.trim();
          log(`現在のモデル表示: ${modelText}`, 'INFO');
          return modelText;
        }
      }
      // その他のAIまたはフォールバック
      return this.getCurrentModel();
    }

    async openFunctionMenu() {
      log('機能メニューを開いています...', 'FEATURE');
      
      const selectors = getSelectors(this.aiType, 'FUNCTION_BUTTON');
      if (!selectors || selectors.length === 0) {
        log(`${this.aiType}の機能メニューセレクタが取得できません`, 'ERROR');
        return null;
      }

      const button = await findElement(selectors, null, CONFIG.TIMEOUTS.menuWait);
      if (!button) {
        log('機能メニューボタンが見つかりません', 'ERROR');
        return null;
      }

      // 改善: AI別のクリック戦略を使用
      const clickMethod = await tryMultipleClickMethods(button, isMenuOpen, this.aiType);
      
      if (!clickMethod) {
        log('機能メニューを開けませんでした', 'ERROR');
        return null;
      }

      const menu = await waitForMenu();
      if (!menu) {
        log('機能メニューを開けませんでした', 'ERROR');
        return null;
      }

      log('機能メニューが開きました', 'SUCCESS');
      return menu;
    }

    async getMenuItems() {
      // セレクタを非同期で取得（UI_SELECTORS読み込み待機あり）
      const itemSelectors = await getSelectorsSafe(this.aiType, 'MENU_ITEM');
      
      // デバッグログ追加
      console.log(`[デバッグ] getMenuItems - aiType: ${this.aiType}`);
      console.log(`[デバッグ] 使用されたセレクタ: ${JSON.stringify(itemSelectors)}`);
      
      const items = [];
      const visitedMenus = new Set();
      
      // Step 1: 現在表示されているメインメニューの項目を取得
      await this._collectMenuItems(items, itemSelectors, visitedMenus);
      
      // Step 2: サブメニューを動的に探索（「さらに表示」など）
      await this._expandAndCollectSubmenus(items, itemSelectors, visitedMenus);
      
      console.log(`[デバッグ] メニューアイテム数: ${items.length}`);
      items.forEach((item, index) => {
        console.log(`[デバッグ] アイテム${index}: "${item.textContent?.trim()}" (role="${item.getAttribute('role')}")`);
      });
      
      return items;
    }

    async _collectMenuItems(items, itemSelectors, visitedMenus) {
      const menuContainers = document.querySelectorAll('[data-radix-popper-content-wrapper] [role="menu"], [role="menu"][data-state="open"]');
      
      for (const container of menuContainers) {
        const menuId = container.id || container.getAttribute('aria-labelledby') || 'unknown';
        if (visitedMenus.has(menuId)) continue;
        visitedMenus.add(menuId);
        
        for (const selector of itemSelectors) {
          try {
            const elements = container.querySelectorAll(selector);
            elements.forEach(el => {
              if (!items.some(existing => existing === el)) {
                items.push(el);
              }
            });
          } catch (e) {}
        }
      }
    }

    async _expandAndCollectSubmenus(items, itemSelectors, visitedMenus) {
      // サブメニュートリガーを探す（「さらに表示」、「その他のモデル」など）
      const submenuTriggers = document.querySelectorAll('[data-has-submenu=""], [aria-haspopup="menu"], [role="menuitem"]:has(svg[data-rtl-flip])');
      
      for (const trigger of submenuTriggers) {
        const text = trigger.textContent?.trim();
        if (!text) continue;
        
        // 一般的なサブメニュートリガーのテキストをチェック
        const isSubmenuTrigger = text.includes('さらに表示') || 
                                text.includes('その他') || 
                                text.includes('More') || 
                                text.includes('Show more') ||
                                trigger.hasAttribute('data-has-submenu') ||
                                trigger.getAttribute('aria-haspopup') === 'menu';
        
        if (!isSubmenuTrigger) continue;
        
        try {
          // サブメニューが既に開いているかチェック
          const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
          
          if (!isExpanded) {
            // サブメニューを開く
            console.log(`[デバッグ] サブメニュー「${text}」を展開中...`);
            await performClick(trigger);
            await wait(500); // サブメニューの展開を待機
          }
          
          // 新しく表示されたメニュー項目を収集
          await this._collectMenuItems(items, itemSelectors, visitedMenus);
          
        } catch (e) {
          console.log(`[デバッグ] サブメニュー展開エラー: ${e.message}`);
        }
      }
    }

    async getAvailableModels() {
      const menu = await this.openModelMenu();
      if (!menu) return [];

      const models = [];
      const items = await this.getMenuItems();

      for (const item of items) {
        const text = item.textContent?.trim();
        if (text) {
          let modelName = text;
          const descPatterns = ['情報を', '高性能', 'スマート', '最適な', '高速な', '軽量な'];
          for (const pattern of descPatterns) {
            const index = text.indexOf(pattern);
            if (index > 0) {
              modelName = text.substring(0, index).trim();
              break;
            }
          }
          
          const isSelected = item.getAttribute('aria-selected') === 'true' ||
                           item.getAttribute('aria-checked') === 'true' ||
                           item.classList.contains('selected');

          models.push({
            name: modelName,
            element: item,
            selected: isSelected
          });
        }
      }

      await closeMenu();
      return models;
    }

    async getAvailableFunctions() {
      const menu = await this.openFunctionMenu();
      if (!menu) return [];

      const functions = [];
      const items = await this.getMenuItems();

      for (const item of items) {
        const text = item.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
          const toggleInput = item.querySelector('input[type="checkbox"][role="switch"]');
          const hasToggle = toggleInput !== null;
          const isActive = hasToggle ? toggleInput.checked : false;

          functions.push({
            name: text,
            element: item,
            hasToggle: hasToggle,
            isActive: isActive
          });
        }
      }

      await closeMenu();
      return functions;
    }

    async selectModel(modelName) {
      // モデル名が指定されていない場合は何もしない
      if (!modelName || modelName.trim() === '') {
        log('モデル名が指定されていません', 'WARNING');
        return false;
      }

      // 現在のモデルを記録
      const currentModel = await this.getCurrentModel();
      log(`現在のモデル: ${currentModel}`, 'INFO');

      const menu = await this.openModelMenu();
      if (!menu) return false;

      // ChatGPT用の特別な処理
      if (this.aiType === 'ChatGPT') {
        // ChatGPTの新しいモデル用のdata-testidを使用
        const testIdMap = {
          'Auto': 'model-switcher-gpt-5',
          'Fast': 'model-switcher-gpt-5-instant',
          'Thinking': 'model-switcher-gpt-5-thinking',
          'Pro': 'model-switcher-gpt-5-pro',
          'GPT-5': 'model-switcher-gpt-5',
          'GPT-5 Auto': 'model-switcher-gpt-5',
          'GPT-5 Fast': 'model-switcher-gpt-5-instant',
          'GPT-5 Thinking': 'model-switcher-gpt-5-thinking',
          'GPT-5 Pro': 'model-switcher-gpt-5-pro'
        };
        
        const testId = testIdMap[modelName];
        if (testId) {
          const targetItem = document.querySelector(`[data-testid="${testId}"]`);
          if (targetItem) {
            const clickMethod = await tryMultipleClickMethods(targetItem, () => true, this.aiType);
            if (clickMethod) {
              log(`ChatGPTモデル「${modelName}」を選択しました`, 'SUCCESS');
            }
            await wait(CONFIG.DELAYS.modelSwitch);
            
            // モデル変更を確認
            await wait(1000);
            const newModel = await this.getCurrentModel();
            if (newModel !== currentModel) {
              log(`モデルが「${currentModel}」から「${newModel}」に変更されました`, 'SUCCESS');
              await closeMenu();
              return true;
            } else {
              log(`モデル変更が確認できませんでした`, 'WARNING');
            }
          }
        }
      }

      // Claude用の特別な処理
      if (this.aiType === 'Claude') {
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        for (const item of menuItems) {
          const text = item.textContent?.trim();
          // Claude Opus 4.1, Claude Sonnet 4 などの形式に対応
          if (text?.includes(modelName) || 
              text?.includes(`Claude ${modelName}`) ||
              (modelName.includes('Opus') && text?.includes('Opus')) ||
              (modelName.includes('Sonnet') && text?.includes('Sonnet'))) {
            await performClick(item, this.aiType);
            log(`Claudeモデル「${modelName}」を選択しました`, 'SUCCESS');
            await wait(CONFIG.DELAYS.modelSwitch);
            
            // モデル変更を確認
            await wait(1000);
            const newModel = await this.getCurrentModel();
            if (newModel !== currentModel) {
              log(`モデルが「${currentModel}」から「${newModel}」に変更されました`, 'SUCCESS');
              await closeMenu();
              return true;
            }
          }
        }
      }

      // Gemini用の特別な処理
      if (this.aiType === 'Gemini') {
        const menuItems = document.querySelectorAll('.mat-mdc-menu-item, [role="menuitem"]');
        for (const item of menuItems) {
          const text = item.textContent?.trim();
          // 2.5 Flash, 2.5 Pro などの形式に対応
          if (text?.includes(modelName) || 
              (modelName.includes('Flash') && text?.includes('Flash')) ||
              (modelName.includes('Pro') && text?.includes('Pro'))) {
            await performClick(item, this.aiType);
            log(`Geminiモデル「${modelName}」を選択しました`, 'SUCCESS');
            await wait(CONFIG.DELAYS.modelSwitch);
            
            // モデル変更を確認
            await wait(1000);
            const newModel = await this.getCurrentModel();
            if (newModel !== currentModel) {
              log(`モデルが「${currentModel}」から「${newModel}」に変更されました`, 'SUCCESS');
              await closeMenu();
              return true;
            }
          }
        }
      }

      const items = await this.getMenuItems();
      let targetItem = null;

      // 完全一致を優先
      for (const item of items) {
        const text = item.textContent?.trim();
        // Geminiの場合、説明文が含まれることがあるので最初の行だけチェック
        const firstLine = text?.split('\n')[0]?.trim();
        
        // 通常の完全一致
        if (text === modelName || 
            text === `Claude ${modelName}` || 
            text === `GPT-${modelName}` || 
            text === `Gemini ${modelName}` ||
            firstLine === modelName ||
            firstLine === `Gemini ${modelName}`) {
          targetItem = item;
          break;
        }
        
        // Geminiの特殊ケース: バージョン番号の柔軟な一致
        if (this.aiType === 'Gemini') {
          // "2.5 Pro" -> "2.0 Flash Thinking" のような変換
          // または "Flash" -> "2.0 Flash" のような部分一致
          const normalizedSearch = modelName.toLowerCase().replace(/\s+/g, ' ').trim();
          const normalizedText = firstLine?.toLowerCase().replace(/\s+/g, ' ').trim();
          
          if (normalizedText?.includes(normalizedSearch) ||
              normalizedSearch.split(' ').every(part => normalizedText?.includes(part))) {
            targetItem = item;
            break;
          }
        }
      }

      // 部分一致
      if (!targetItem) {
        for (const item of items) {
          const text = item.textContent?.trim();
          if (text && text.includes(modelName)) {
            targetItem = item;
            break;
          }
        }
      }

      if (targetItem) {
        await performClick(targetItem, this.aiType);
        log(`モデル「${modelName}」を選択しました`, 'SUCCESS');
        await wait(CONFIG.DELAYS.modelSwitch);
        
        // モデル変更を確認
        await wait(1000);
        const newModel = await this.getCurrentModel();
        if (currentModel && newModel !== currentModel) {
          log(`モデルが「${currentModel}」から「${newModel}」に変更されました`, 'SUCCESS');
        } else if (!currentModel) {
          log(`モデルが「${newModel}」に設定されました`, 'SUCCESS');
        } else {
          log(`モデル変更の確認をスキップしました`, 'INFO');
        }
        
        // メニューが自動的に閉じない場合のために明示的に閉じる
        await closeMenu();
        return true;
      }

      log(`モデル「${modelName}」が見つかりません`, 'ERROR');
      await closeMenu();
      return false;
    }

    async selectFunction(functionName, enable = true) {
      // 機能名が指定されていない場合は何もしない
      if (!functionName || functionName.trim() === '') {
        log('機能名が指定されていません', 'WARNING');
        return false;
      }
      
      console.log(`[デバッグ] selectFunctionを実行: functionName="${functionName}", enable=${enable}, AI=${this.aiType}`);

      const menu = await this.openFunctionMenu();
      if (!menu) return false;

      const items = await this.getMenuItems();
      let targetItem = null;
      
      // より詳細なデバッグ情報（非同期版を使用）
      const itemSelectors = await getSelectorsSafe(this.aiType, 'MENU_ITEM');
      console.log(`[デバッグ] 使用されたセレクタ: ${JSON.stringify(itemSelectors)}`);
      console.log(`[デバッグ] メニューアイテム数: ${items.length}`);
      console.log(`[デバッグ] 検索対象の機能名: "${functionName}"`);

      for (const item of items) {
        const text = item.textContent?.trim();
        const role = item.getAttribute('role');
        const ariaChecked = item.getAttribute('aria-checked');
        console.log(`[デバッグ] メニューアイテム: "${text}" (role="${role}", aria-checked="${ariaChecked}")`);
        
        if (text === functionName) {
          console.log(`[デバッグ] 完全一致: "${text}" === "${functionName}"`);
          targetItem = item;
          break;
        } else if (text.includes(functionName)) {
          console.log(`[デバッグ] 部分一致: "${text}" includes "${functionName}"`);
          targetItem = item;
          break;
        }
      }

      if (targetItem) {
        console.log(`[デバッグ] ターゲットアイテムが見つかりました`);
        const toggleInput = targetItem.querySelector('input[type="checkbox"][role="switch"]');
        if (toggleInput) {
          const isCurrentlyActive = toggleInput.checked;
          console.log(`[デバッグ] トグル状態: ${isCurrentlyActive ? 'ON' : 'OFF'}`);
          if ((enable && !isCurrentlyActive) || (!enable && isCurrentlyActive)) {
            // 改善: AI別のクリック戦略を使用（非表示要素クリック問題を解決）
            const clickMethod = await tryMultipleClickMethods(targetItem, () => true, this.aiType);
            await closeMenu();
            if (clickMethod) {
              log(`機能「${functionName}」を${enable ? 'ON' : 'OFF'}にしました`, 'SUCCESS');
              return true;
            } else {
              log(`機能「${functionName}」のクリックに失敗しました`, 'ERROR');
              return false;
            }
          } else {
            log(`機能「${functionName}」は既に${isCurrentlyActive ? 'ON' : 'OFF'}です`, 'INFO');
            await closeMenu();
            return true;
          }
        } else {
          // 全AIで複数のクリック方法を試す
          log(`機能「${functionName}」を選択中...`, 'INFO');
          
          // クリック成功をチェックする関数
          const checkClickSuccess = async () => {
            // aria-checkedの変更を確認
            const ariaChecked = targetItem.getAttribute('aria-checked');
            if (ariaChecked === 'true') {
              return true;
            }
            
            // メニューが閉じたかを確認（クリック成功の別の指標）
            const menu = document.querySelector('[role="menu"]:not([style*="display: none"])');
            if (!menu) {
              return true;
            }
            
            return false;
          };
          
          // tryMultipleClickMethodsで複数の方法を試す
          const clickMethod = await tryMultipleClickMethods(targetItem, checkClickSuccess, this.aiType);
          
          // 結果を確認
          const finalAriaChecked = targetItem.getAttribute('aria-checked');
          await closeMenu();
          
          if (clickMethod || finalAriaChecked === 'true') {
            log(`機能「${functionName}」をクリックしました（${clickMethod || 'unknown method'}）`, 'SUCCESS');
            return true;
          } else {
            log(`機能「${functionName}」のクリックに失敗しました`, 'ERROR');
            return false;
          }
        }
      }

      console.log(`[デバッグ] ターゲットアイテムが見つかりませんでした: "${functionName}"`);
      log(`機能「${functionName}」が見つかりません`, 'ERROR');
      await closeMenu();
      return false;
    }

    async toggleFunction(functionName) {
      const menu = await this.openFunctionMenu();
      if (!menu) return false;

      const items = await this.getMenuItems();
      
      for (const item of items) {
        const text = item.textContent?.trim();
        if (text === functionName || text.includes(functionName)) {
          const toggleInput = item.querySelector('input[type="checkbox"][role="switch"]');
          if (toggleInput) {
            const wasActive = toggleInput.checked;
            await performClick(item, this.aiType);
            log(`機能「${functionName}」を${wasActive ? 'OFF' : 'ON'}に切り替えました`, 'SUCCESS');
            await closeMenu();
            return true;
          }
        }
      }

      log(`機能「${functionName}」が見つかりません`, 'ERROR');
      await closeMenu();
      return false;
    }

    // サブメニューを開く（「他のモデル」など）
    async openSubmenu(menuText) {
      log(`サブメニュー「${menuText}」を開いています...`, 'INFO');

      const menuItems = await this.getMenuItems();
      const submenuItem = menuItems.find(item => {
        const text = item.textContent?.trim();
        return text && text.includes(menuText);
      });

      if (!submenuItem) {
        log(`サブメニュー項目「${menuText}」が見つかりません`, 'WARNING');
        return null;
      }

      await performClick(submenuItem, this.aiType);
      await wait(CONFIG.DELAYS.submenuOpen);

      // サブメニューが開いたか確認（新しいメニュー項目が表示される）
      const newMenuItems = await this.getMenuItems();
      if (newMenuItems.length > menuItems.length) {
        log(`サブメニュー「${menuText}」が開きました`, 'SUCCESS');
        return true;
      }

      return false;
    }
  }

  // ========================================
  // 使用状況追跡
  // ========================================
  const usageTracker = {
    functionCalls: {},
    fallbackCalls: {},
    
    track(funcName, source = 'unknown') {
      if (!this.functionCalls[funcName]) {
        this.functionCalls[funcName] = { count: 0, sources: [] };
      }
      this.functionCalls[funcName].count++;
      if (!this.functionCalls[funcName].sources.includes(source)) {
        this.functionCalls[funcName].sources.push(source);
      }
      console.log(`📊 [Usage] ${funcName} called from ${source} (total: ${this.functionCalls[funcName].count})`);
    },
    
    trackFallback(funcName, source = 'unknown') {
      if (!this.fallbackCalls[funcName]) {
        this.fallbackCalls[funcName] = { count: 0, sources: [] };
      }
      this.fallbackCalls[funcName].count++;
      if (!this.fallbackCalls[funcName].sources.includes(source)) {
        this.fallbackCalls[funcName].sources.push(source);
      }
      console.log(`⚠️ [Fallback] ${funcName} using legacy code from ${source} (total: ${this.fallbackCalls[funcName].count})`);
    },
    
    getReport() {
      return {
        functionCalls: this.functionCalls,
        fallbackCalls: this.fallbackCalls,
        summary: {
          totalCalls: Object.values(this.functionCalls).reduce((sum, f) => sum + f.count, 0),
          totalFallbacks: Object.values(this.fallbackCalls).reduce((sum, f) => sum + f.count, 0),
          uniqueFunctions: Object.keys(this.functionCalls).length,
          uniqueFallbacks: Object.keys(this.fallbackCalls).length
        }
      };
    },
    
    printReport() {
      const report = this.getReport();
      console.log('📈 === 使用状況レポート ===');
      console.log('✅ 新ハンドラー使用:', report.summary.totalCalls, '回');
      console.log('⚠️ フォールバック使用:', report.summary.totalFallbacks, '回');
      console.log('関数別詳細:', report.functionCalls);
      if (report.summary.totalFallbacks > 0) {
        console.log('フォールバック詳細:', report.fallbackCalls);
      }
      return report;
    }
  };

  // ========================================
  // ラッパー関数でトラッキングを追加
  // ========================================
  const wrapWithTracking = (func, funcName) => {
    return function(...args) {
      const caller = new Error().stack?.split('\n')[2]?.trim() || 'unknown';
      usageTracker.track(funcName, caller);
      return func.apply(this, args);
    };
  };

  // ========================================
  // グローバル公開
  // ========================================
  window.AIHandler = {
    // 設定
    CONFIG,
    
    // UI_SELECTORSアクセス
    loadSelectors,
    getSelectors,
    getSelectorsSafe,
    
    // AI検出
    detectAI: wrapWithTracking(detectAI, 'detectAI'),
    
    // 基本ユーティリティ（トラッキング付き）
    utils: {
      log: wrapWithTracking(log, 'log'),
      debugLog: wrapWithTracking(debugLog, 'debugLog'),
      wait: wrapWithTracking(wait, 'wait'),
      findElement: wrapWithTracking(findElement, 'findElement'),
      findElements: wrapWithTracking(findElements, 'findElements'),
      performClick: wrapWithTracking(performClick, 'performClick'),
      inputText: wrapWithTracking(inputText, 'inputText'),
      waitForMenu: wrapWithTracking(waitForMenu, 'waitForMenu'),
      closeMenu: wrapWithTracking(closeMenu, 'closeMenu'),
      isElementVisible: wrapWithTracking(isElementVisible, 'isElementVisible'),
      isElementEnabled: wrapWithTracking(isElementEnabled, 'isElementEnabled'),
      waitForElementToDisappear: wrapWithTracking(waitForElementToDisappear, 'waitForElementToDisappear')
    },
    
    // メッセージ処理（トラッキング付き）
    message: {
      send: wrapWithTracking(sendMessageCommon, 'sendMessage'),
      waitForResponse: wrapWithTracking(waitForResponseCommon, 'waitForResponse'),
      getResponse: wrapWithTracking(getResponseCommon, 'getResponse'),
      getFullResponse: wrapWithTracking(getFullResponseCommon, 'getFullResponse'),
      continueGeneration: wrapWithTracking(continueGenerationCommon, 'continueGeneration'),
      stopGeneration: wrapWithTracking(stopGenerationCommon, 'stopGeneration')
    },
    
    // メニューハンドラー
    MenuHandler,
    
    // メニューハンドラーインスタンス（自動作成）
    menuHandler: new MenuHandler(),
    
    // 使用状況トラッカー
    usageTracker
  };

  // 後方互換性のための公開（既存スクリプトが動作するように）
  window.AICommonUtils = new Proxy(window.AIHandler.utils, {
    get(target, prop) {
      console.log(`⚠️ [Legacy] AICommonUtils.${prop} accessed - 新しいAIHandler.utilsを使用してください`);
      usageTracker.trackFallback(`AICommonUtils.${prop}`, 'legacy-utils');
      return target[prop];
    }
  });
  
  window.CommonMenuHandler = new Proxy(MenuHandler, {
    construct(target, args) {
      console.log('⚠️ [Legacy] CommonMenuHandler constructed - 新しいAIHandler.MenuHandlerを使用してください');
      usageTracker.trackFallback('CommonMenuHandler.constructor', 'legacy-menu');
      return new target(...args);
    }
  });
  
  window.menuHandler = new Proxy(window.AIHandler.menuHandler, {
    get(target, prop) {
      console.log(`⚠️ [Legacy] menuHandler.${prop} accessed - 新しいAIHandler.menuHandlerを使用してください`);
      usageTracker.trackFallback(`menuHandler.${prop}`, 'legacy-menu-instance');
      return target[prop];
    }
  });

  // UI_SELECTORSを自動読み込み
  loadSelectors().then(() => {
    log('✅ AI統合ハンドラーが利用可能になりました', 'SUCCESS');
    log('検出されたAI: ' + detectAI(), 'INFO');
  });
  
  // 使用状況確認用のグローバルコマンド
  window.AIUsageReport = () => usageTracker.printReport();
  console.log('💡 使用状況を確認: AIUsageReport() を実行してください');
  
  return window.AIHandler;
})();