// AI自動化統合ハンドラー
// common-utils.js と common-menu-handler.js を統合し、メッセージ処理も追加
// 全AI（ChatGPT、Claude、Gemini）で共通の操作を提供
(() => {
  "use strict";

  // ========================================
  // 共通設定
  // ========================================
  const CONFIG = {
    DELAYS: {
      elementSearch: 100,    // 要素検索の間隔
      click: 50,            // クリック後の待機
      textInput: 500,       // テキスト入力後の待機
      betweenActions: 1000, // アクション間の待機
      menuOpen: 1500,       // メニュー表示待機
      menuClose: 1000,      // メニュー閉じる待機
      modelSwitch: 2000,    // モデル切替待機
      submenuOpen: 1000,    // サブメニュー表示待機
      submit: 1000,         // 送信後の待機
      responseCheck: 500    // 応答チェック間隔
    },
    TIMEOUTS: {
      elementSearch: 3000,  // 要素検索のタイムアウト
      menuWait: 5000,       // メニュー表示待機
      responseWait: 60000   // 応答待機のデフォルト
    },
    claudeWaitTime: 500,    // Claude専用待機時間
    maxRetries: 3
  };

  // ========================================
  // AI固有セレクタ定義
  // ========================================
  const AI_SELECTORS = {
    Claude: {
      input: [
        '[contenteditable="true"][role="textbox"]',
        '.ProseMirror',
        'div[contenteditable="true"]',
        'textarea[placeholder*="メッセージ"]'
      ],
      send: [
        '[aria-label="メッセージを送信"]:not([disabled])',
        'button[type="submit"]:not([disabled])',
        '.send-button:not([disabled])'
      ],
      stop: [
        '[aria-label="応答を停止"]'
      ],
      response: [
        '[data-is-streaming="false"]',
        '.font-claude-message',
        'div[class*="font-claude-message"]',
        '.group.relative.-tracking-\\[0\\.015em\\]'
      ],
      modelButton: [
        '[data-testid="model-selector-dropdown"]',
        '[aria-label="モデルを選択"]',
        '[data-testid="model-selector"]',
        'button[aria-haspopup="menu"]',
        'button[aria-label*="モデル"]'
      ],
      functionButton: [
        '[data-testid="input-menu-tools"]',
        '[aria-label="ツールメニューを開く"]',
        'button[aria-label*="ツール"]',
        'button:has(svg[class*="grid"])'
      ],
      menu: [
        '[role="menu"][data-state="open"]',
        '[role="menu"]'
      ],
      menuItem: [
        '[role="menuitem"]',
        '[role="option"]'
      ]
    },
    
    ChatGPT: {
      input: [
        '#prompt-textarea',
        '[contenteditable="true"]',
        '.ProseMirror',
        'div[contenteditable="true"]',
        'textarea[data-testid="conversation-textarea"]',
        'textarea[placeholder*="メッセージ"]',
        'textarea'
      ],
      send: [
        '[data-testid="send-button"]',
        '#composer-submit-button',
        '[aria-label="プロンプトを送信する"]',
        '[aria-label*="送信"]',
        'button[data-testid="composer-send-button"]',
        'button[class*="send"]'
      ],
      stop: [
        '[data-testid="stop-button"]',
        '[aria-label="Stop generating"]'
      ],
      response: [
        '[data-message-author-role="assistant"]',
        '.text-message[data-message-author-role="assistant"]',
        'div[data-message-author-role="assistant"]'
      ],
      modelButton: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-label*="モデル セレクター"]',
        'button[aria-label*="モデル"]',
        'button[aria-label*="Model"]',
        'button[id^="radix-"][aria-haspopup="menu"]'
      ],
      functionButton: [
        '[data-testid="composer-plus-btn"]',
        'button[aria-label*="一時的なチャット"]',
        'button[aria-label*="GPT"]',
        'button[id*="radix"]',
        'button[data-testid*="gpt"]'
      ],
      menu: [
        '[role="menu"]',
        'div[data-state="open"][role="menu"]',
        '.popover[role="menu"]',
        '[aria-orientation="vertical"][role="menu"]'
      ],
      menuItem: [
        '[role="menuitem"]',
        '[role="menuitemradio"]'
      ]
    },
    
    Gemini: {
      input: [
        '.ql-editor',
        '[contenteditable="true"]',
        '[role="textbox"]'
      ],
      send: [
        '[aria-label="プロンプトを送信"]',
        '.send-button:not(.stop)',
        'button[type="submit"]',
        '[data-testid="send-button"]'
      ],
      stop: [
        '[aria-label="回答を停止"]'
      ],
      response: [
        '.response-container',
        '.conversation-turn',
        '.message-container',
        '.markdown'
      ],
      modelButton: [
        'button.model-selector',
        '.model-dropdown',
        'button[aria-label*="モデル"]',
        'button:has-text("Gemini")',
        'button:has-text("Flash")'
      ],
      functionButton: [
        'button[aria-label="その他"]',
        'button.feature-selector',
        'button[aria-label*="機能"]',
        '.feature-menu-button'
      ],
      menu: [
        '[role="menuitemradio"]',
        '[role="menuitem"]'
      ],
      menuItem: [
        '[role="menuitemradio"]',
        '[role="menuitem"]',
        'button[mat-list-item]',
        '.toolbox-drawer-item-list-button'
      ]
    }
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
  const waitForMenu = async (menuSelectors = null, maxWait = CONFIG.TIMEOUTS.menuWait) => {
    const aiType = detectAI();
    const selectors = menuSelectors || AI_SELECTORS[aiType]?.menu || [
      '[role="menu"][data-state="open"]',
      '[role="menu"]',
      '.menu-container',
      '[class*="menu"]',
      '[class*="dropdown"]'
    ];
    
    return await findElement(selectors, null, maxWait);
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
    const selectors = sendButtonSelectors || AI_SELECTORS[ai]?.send;
    
    if (!selectors) {
      log(`${ai}の送信ボタンセレクタが定義されていません`, 'ERROR', ai);
      return false;
    }

    log('メッセージを送信中...', 'INFO', ai);
    const sendButton = await findElement(selectors);
    
    if (!sendButton) {
      log('送信ボタンが見つかりません', 'ERROR', ai);
      return false;
    }

    await performClick(sendButton);
    log('📤 メッセージを送信しました', 'SUCCESS', ai);
    await wait(CONFIG.DELAYS.submit);
    return true;
  };

  const waitForResponseCommon = async (stopButtonSelectors, maxWait = CONFIG.TIMEOUTS.responseWait, aiName = null) => {
    const ai = aiName || detectAI();
    const selectors = stopButtonSelectors || AI_SELECTORS[ai]?.stop;
    
    if (!selectors) {
      log(`${ai}の停止ボタンセレクタが定義されていません`, 'WARNING', ai);
      return false;
    }

    log('AI応答を待機中...', 'INFO', ai);
    const startTime = Date.now();
    let lastProgressTime = startTime;

    while (Date.now() - startTime < maxWait) {
      const stopButton = await findElement(selectors, null, CONFIG.DELAYS.responseCheck);
      
      if (!stopButton) {
        const elapsedTotal = Date.now() - startTime;
        const minutes = Math.floor(elapsedTotal / 60000);
        const seconds = Math.floor((elapsedTotal % 60000) / 1000);
        log(`✅ 応答完了（${minutes}分${seconds}秒経過）`, 'SUCCESS', ai);
        return true;
      }

      if (Date.now() - lastProgressTime > 10000) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        log(`応答待機中... (${elapsedSec}秒経過)`, 'INFO', ai);
        lastProgressTime = Date.now();
      }

      await wait(CONFIG.DELAYS.responseCheck);
    }

    log('応答待機がタイムアウトしました', 'WARNING', ai);
    return false;
  };

  const getResponseCommon = async (responseSelectors, textExtractor, aiName = null) => {
    const ai = aiName || detectAI();
    const selectors = responseSelectors || AI_SELECTORS[ai]?.response;
    
    if (!selectors) {
      log(`${ai}の応答要素セレクタが定義されていません`, 'ERROR', ai);
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
      // Claudeの場合：すべてのテキスト要素を収集
      const textElements = latestResponseElement.querySelectorAll('p, div.whitespace-pre-wrap, .prose');
      const texts = [];
      
      textElements.forEach(el => {
        // Artifactやコードブロックは除外
        if (!el.closest('.artifact-block-cell') && 
            !el.closest('pre') && 
            !el.closest('code')) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && !texts.includes(text)) {
            texts.push(text);
          }
        }
      });
      
      // 要素が見つからない場合は全体のテキストを取得
      if (texts.length === 0) {
        extractedText = latestResponseElement.textContent?.trim() || '';
      } else {
        extractedText = texts.join('\n\n');
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
    const selectors = stopButtonSelectors || AI_SELECTORS[ai]?.stop;
    
    if (!selectors) {
      log(`${ai}の停止ボタンセレクタが定義されていません`, 'ERROR', ai);
      return false;
    }

    log('生成を停止中...', 'INFO', ai);
    const stopButton = await findElement(selectors);
    
    if (!stopButton) {
      log('停止ボタンが見つかりません（既に停止している可能性があります）', 'WARNING', ai);
      return false;
    }

    await performClick(stopButton);
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
      const inputSelectors = AI_SELECTORS[ai].input;
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
        await performClick(continueButton);
        return true;
      }
      // ボタンがない場合は「続けて」と入力
      const inputSelectors = AI_SELECTORS[ai].input;
      const inputField = await findElement(inputSelectors);
      if (inputField) {
        await inputText(inputField, '続けて');
        await wait(500);
        return await sendMessageCommon(null, ai);
      }
      
    } else if (ai === 'Gemini') {
      // Geminiの場合：「続けて」と入力して送信
      const inputSelectors = AI_SELECTORS[ai].input;
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
      
      const selectors = AI_SELECTORS[this.aiType]?.modelButton;
      if (!selectors) {
        log(`${this.aiType}のモデルメニューセレクタが定義されていません`, 'ERROR');
        return null;
      }

      const button = await findElement(selectors, null, CONFIG.TIMEOUTS.menuWait);
      if (!button) {
        log('モデルメニューボタンが見つかりません', 'ERROR');
        return null;
      }

      const currentModel = button.textContent?.trim();
      log(`現在のモデル: ${currentModel || '不明'}`, 'INFO');

      await performClick(button);
      await wait(CONFIG.DELAYS.menuOpen);

      const menu = await waitForMenu();
      if (!menu) {
        log('モデルメニューを開けませんでした', 'ERROR');
        return null;
      }

      log('モデルメニューが開きました', 'SUCCESS');
      return menu;
    }

    async openFunctionMenu() {
      log('機能メニューを開いています...', 'FEATURE');
      
      const selectors = AI_SELECTORS[this.aiType]?.functionButton;
      if (!selectors) {
        log(`${this.aiType}の機能メニューセレクタが定義されていません`, 'ERROR');
        return null;
      }

      const button = await findElement(selectors, null, CONFIG.TIMEOUTS.menuWait);
      if (!button) {
        log('機能メニューボタンが見つかりません', 'ERROR');
        return null;
      }

      await performClick(button);
      await wait(CONFIG.DELAYS.menuOpen);

      const menu = await waitForMenu();
      if (!menu) {
        log('機能メニューを開けませんでした', 'ERROR');
        return null;
      }

      log('機能メニューが開きました', 'SUCCESS');
      return menu;
    }

    async getMenuItems() {
      const itemSelectors = AI_SELECTORS[this.aiType]?.menuItem || [
        '[role="menuitem"]',
        '[role="option"]',
        '[role="menuitemradio"]'
      ];
      
      const items = [];
      for (const selector of itemSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (!items.includes(el)) {
              items.push(el);
            }
          });
        } catch (e) {}
      }
      
      return items;
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
      const menu = await this.openModelMenu();
      if (!menu) return false;

      const items = await this.getMenuItems();
      let targetItem = null;

      // 完全一致を優先
      for (const item of items) {
        const text = item.textContent?.trim();
        if (text === modelName || text === `Claude ${modelName}` || 
            text === `GPT-${modelName}` || text === `Gemini ${modelName}`) {
          targetItem = item;
          break;
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
        await performClick(targetItem);
        log(`モデル「${modelName}」を選択しました`, 'SUCCESS');
        await wait(CONFIG.DELAYS.modelSwitch);
        return true;
      }

      log(`モデル「${modelName}」が見つかりません`, 'ERROR');
      await closeMenu();
      return false;
    }

    async selectFunction(functionName, enable = true) {
      const menu = await this.openFunctionMenu();
      if (!menu) return false;

      const items = await this.getMenuItems();
      let targetItem = null;

      for (const item of items) {
        const text = item.textContent?.trim();
        if (text === functionName || text.includes(functionName)) {
          targetItem = item;
          break;
        }
      }

      if (targetItem) {
        const toggleInput = targetItem.querySelector('input[type="checkbox"][role="switch"]');
        if (toggleInput) {
          const isCurrentlyActive = toggleInput.checked;
          if ((enable && !isCurrentlyActive) || (!enable && isCurrentlyActive)) {
            await performClick(targetItem);
            log(`機能「${functionName}」を${enable ? 'ON' : 'OFF'}にしました`, 'SUCCESS');
          } else {
            log(`機能「${functionName}」は既に${isCurrentlyActive ? 'ON' : 'OFF'}です`, 'INFO');
          }
        } else {
          await performClick(targetItem);
          log(`機能「${functionName}」をクリックしました`, 'SUCCESS');
        }
        
        await closeMenu();
        return true;
      }

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
            await performClick(item);
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
    
    // セレクタ定義
    selectors: AI_SELECTORS,
    
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

  log('✅ AI統合ハンドラーが利用可能になりました', 'SUCCESS');
  log('検出されたAI: ' + detectAI(), 'INFO');
  
  // 使用状況確認用のグローバルコマンド
  window.AIUsageReport = () => usageTracker.printReport();
  console.log('💡 使用状況を確認: AIUsageReport() を実行してください');
  
  return window.AIHandler;
})();