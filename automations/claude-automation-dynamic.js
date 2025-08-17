// Claude自動化関数 - 動的検索対応版
(() => {
  "use strict";

  // AIHandlerを使用
  const useAIHandler = window.AIHandler;
  
  // ========================================
  // グローバル変数
  // ========================================
  let sendStartTime = null;  // 送信開始時刻を記録
  let menuHandler = null;  // AIHandlerのメニューハンドラーインスタンス

  // ========================================
  // 設定
  // ========================================
  const CONFIG = {
    DELAYS: {
      click: 50,
      menuOpen: 1500,
      menuClose: 1000,
      modelSwitch: 2000,
      submit: 5000,
      responseCheck: 5000,
      elementSearch: 500
    },
    MODEL_ALIASES: {
      'opus 4.1': 'Opus 4.1',
      'opus4.1': 'Opus 4.1',
      'opus41': 'Opus 4.1',
      'opus 41': 'Opus 4.1',
      'opas 4.1': 'Opus 4.1',
      'opas4.1': 'Opus 4.1',
      'opus 4,1': 'Opus 4.1',
      'opus4,1': 'Opus 4.1',
      '4.1': 'Opus 4.1',
      '41': 'Opus 4.1',
      '4,1': 'Opus 4.1',
      'opus': 'Opus 4.1',
      'opas': 'Opus 4.1',
      'sonnet 4': 'Sonnet 4',
      'sonnet4': 'Sonnet 4',
      'sonet 4': 'Sonnet 4',
      'sonet4': 'Sonnet 4',
      'sonnett 4': 'Sonnet 4',
      'sonnett4': 'Sonnet 4',
      'sonett 4': 'Sonnet 4',
      'sonnet': 'Sonnet 4',
      'sonet': 'Sonnet 4',
      '4': 'Sonnet 4',
      'opus 4': 'Opus 4',
      'opus4': 'Opus 4',
      'opas 4': 'Opus 4',
      'opas4': 'Opus 4',
      'sonnet 3.7': 'Sonnet 3.7',
      'sonnet3.7': 'Sonnet 3.7',
      'sonnet37': 'Sonnet 3.7',
      'sonnet 37': 'Sonnet 3.7',
      'sonet 3.7': 'Sonnet 3.7',
      'sonet3.7': 'Sonnet 3.7',
      'sonnet 3,7': 'Sonnet 3.7',
      'sonnet3,7': 'Sonnet 3.7',
      '3.7': 'Sonnet 3.7',
      '37': 'Sonnet 3.7',
      '3,7': 'Sonnet 3.7',
      'haiku 3.5': 'Haiku 3.5',
      'haiku3.5': 'Haiku 3.5',
      'haiku35': 'Haiku 3.5',
      'haiku 35': 'Haiku 3.5',
      'haiku 3,5': 'Haiku 3.5',
      'haiku3,5': 'Haiku 3.5',
      'haiku': 'Haiku 3.5',
      'haikuu': 'Haiku 3.5',
      '3.5': 'Haiku 3.5',
      '35': 'Haiku 3.5',
      '3,5': 'Haiku 3.5'
    },
    FUNCTION_ALIASES: {
      'じっくり考える': 'じっくり考える',
      'じっくり': 'じっくり考える',
      '思考': 'じっくり考える',
      '思考モード': 'じっくり考える',
      'thinking': 'じっくり考える',
      'think': 'じっくり考える',
      'ウェブ検索': 'ウェブ検索',
      'web検索': 'ウェブ検索',
      '検索': 'ウェブ検索',
      '検索モード': 'ウェブ検索',
      'search': 'ウェブ検索',
      'web': 'ウェブ検索',
      'drive検索': 'Drive検索',
      'drive': 'Drive検索',
      'ドライブ': 'Drive検索',
      'googledrive': 'Drive検索',
      'gmail検索': 'Gmail検索',
      'gmail': 'Gmail検索',
      'メール': 'Gmail検索',
      'mail': 'Gmail検索',
      'カレンダー検索': 'カレンダー検索',
      'カレンダー': 'カレンダー検索',
      'calendar': 'カレンダー検索',
      'cal': 'カレンダー検索',
      'リサーチ': 'リサーチ',
      'research': 'リサーチ',
      'deep': 'リサーチ',
      'deepresearch': 'リサーチ',
      'deepreserch': 'リサーチ',
      'ディープ': 'リサーチ',
      'ディープリサーチ': 'リサーチ',
      'でぃーぷ': 'リサーチ',
      'deepresarch': 'リサーチ',
      'deepserch': 'リサーチ',
      'deepsearch': 'リサーチ',
      '調査': 'リサーチ',
      '詳細調査': 'リサーチ',
      '詳しく調査': 'リサーチ'
    }
  };

  const EXCLUDE_FROM_GENERAL_SEARCH = ['Gmail検索', 'Drive検索', 'カレンダー検索'];

  // ========================================
  // ユーティリティ関数
  // ========================================
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const log = (message, type = 'INFO') => {
    const prefix = {
      'INFO': '📝',
      'SUCCESS': '✅',
      'ERROR': '❌',
      'WARNING': '⚠️',
      'DEBUG': '🔍',
      'SEARCH': '🔎'
    }[type] || '📝';
    console.log(`${prefix} [Claude] ${message}`);
  };

  const findElement = async (selectors, condition = null, maxWait = 3000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (!condition || condition(element)) {
              return element;
            }
          }
        } catch (e) {}
      }
      await wait(CONFIG.DELAYS.elementSearch);
    }
    return null;
  };

  const performClick = async (element) => {
    if (!element) return false;
    try {
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
      return true;
    } catch (e) {
      return false;
    }
  };

  const waitForMenu = async (maxWait = 3000) => {
    const menuSelectors = [
      '[role="menu"][data-state="open"]',
      '[role="menu"]',
      '.relative.w-full.will-change-transform',
      '[class*="will-change-transform"]',
      '.flex.flex-col.min-h-0.w-full',
      '.p-1\\.5.flex.flex-col',
      'div[style*="max-height"]'
    ];
    return await findElement(menuSelectors, null, maxWait);
  };


  function findFunctionByName(functions, searchTerm) {
    if (!searchTerm) return null;

    const normalized = searchTerm.toLowerCase().replace(/\s+/g, '');
    const targetFromAlias = CONFIG.FUNCTION_ALIASES[normalized];

    if (normalized === '検索' || normalized === 'search') {
      for (const func of functions) {
        if (func.text === 'ウェブ検索') {
          log('「検索」→「ウェブ検索」として処理', 'INFO');
          return func;
        }
      }
    }

    if (targetFromAlias) {
      for (const func of functions) {
        if (func.text === targetFromAlias) {
          return func;
        }
      }
    }

    for (const func of functions) {
      const funcNormalized = func.text.toLowerCase().replace(/\s+/g, '');
      if (funcNormalized === normalized) {
        return func;
      }
    }

    for (const func of functions) {
      if (EXCLUDE_FROM_GENERAL_SEARCH.includes(func.text)) {
        continue;
      }

      const funcNormalized = func.text.toLowerCase().replace(/\s+/g, '');
      if (funcNormalized.includes(normalized) || normalized.includes(funcNormalized)) {
        return func;
      }
    }

    return null;
  }

  // ========================================
  // 動的機能選択
  // ========================================
  async function selectFunction(functionName, enable = true) {
    if (functionName === 'none' || !functionName) {
      log('🔄 機能を無効化します', 'INFO');
      return true;
    }

    log(`🔍 機能を動的検索: ${functionName}`, 'INFO');
    
    // AIHandlerを使用
    if (!useAIHandler || !menuHandler) {
      log('AIHandlerが利用できません', 'ERROR');
      return false;
    }

    try {
      // エイリアスを解決
      const normalizedInput = functionName.toLowerCase().replace(/\s+/g, '');
      const targetFunction = CONFIG.FUNCTION_ALIASES[normalizedInput] || functionName;
      
      // DeepResearch特別処理
      if (normalizedInput === 'deepresearch' || functionName === 'DeepResearch' || CONFIG.FUNCTION_ALIASES[normalizedInput] === 'リサーチ') {
        log('DeepResearchモードを有効化します', 'INFO');
        log('⚠️ DeepResearchは最大40分かかる場合があります', 'WARNING');
        
        // 共有モジュールを使用してDeepResearchを選択
        if (window.ClaudeDeepResearchSelector && window.ClaudeDeepResearchSelector.select) {
          const result = await window.ClaudeDeepResearchSelector.select();
          
          if (result.success) {
            if (result.alreadyEnabled) {
              log('DeepResearchは既に有効です', 'INFO');
            } else {
              log('✅ DeepResearchボタンをクリックしました', 'SUCCESS');
            }
            return true;
          } else {
            log('❌ DeepResearchボタンが見つかりません', 'ERROR');
            return false;
          }
        } else {
          log('❌ ClaudeDeepResearchSelectorモジュールが見つかりません', 'ERROR');
          return false;
        }
      }
      
      const result = await menuHandler.selectFunction(targetFunction, enable);
      if (result) {
        log(`✅ 共通ハンドラーで機能「${targetFunction}」を${enable ? '有効' : '無効'}にしました`, 'SUCCESS');
        return true;
      }
      return false;
    } catch (error) {
      log(`機能選択エラー: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async function clickResearchButton() {
    log('リサーチボタンを探しています（メニュー外）...', 'SEARCH');

    const allButtons = document.querySelectorAll('button');
    let researchButton = null;

    for (const button of allButtons) {
      const text = button.textContent?.trim();
      const hasAriaPressed = button.hasAttribute('aria-pressed');

      if (text && text.includes('リサーチ') && hasAriaPressed) {
        const hasSvg = button.querySelector('svg');
        if (hasSvg) {
          researchButton = button;
          log('リサーチボタンを発見', 'SUCCESS');
          break;
        }
      }
    }

    if (researchButton) {
      const isPressed = researchButton.getAttribute('aria-pressed') === 'true';

      if (isPressed) {
        log('リサーチボタンは既にONです', 'SUCCESS');
      } else {
        log('リサーチボタンをONにします', 'INFO');
        await performClick(researchButton);
        await wait(500);

        const newState = researchButton.getAttribute('aria-pressed') === 'true';
        if (newState) {
          log('DeepResearchモードが有効になりました', 'SUCCESS');
        } else {
          log('リサーチボタンのON化に失敗した可能性があります', 'WARNING');
        }
      }

      return true;
    }

    log('リサーチボタンが見つかりません', 'ERROR');
    return false;
  }

  // ========================================
  // 動的モデル選択（改善版）
  // ========================================
  async function selectModel(identifier) {
    if (!identifier) {
      log('モデル識別子が指定されていません', 'ERROR');
      return false;
    }

    log(`🔍 モデルを動的検索: ${identifier}`, 'INFO');
    
    // AIHandlerを使用
    if (!useAIHandler || !menuHandler) {
      log('AIHandlerが利用できません', 'ERROR');
      return false;
    }

    try {
      // エイリアスを解決
      const targetModel = CONFIG.MODEL_ALIASES[identifier.toLowerCase()] || identifier;
      const result = await menuHandler.selectModel(targetModel);
      if (result) {
        log(`✅ 共通ハンドラーでモデル「${targetModel}」を選択しました`, 'SUCCESS');
        return true;
      }
      return false;
    } catch (error) {
      log(`モデル選択エラー: ${error.message}`, 'ERROR');
      return false;
    }
  }

  // ========================================
  // ストレージ保存機能
  // ========================================
  async function saveToStorage(data) {
    try {
      if (chrome?.storage?.local) {
        // 既存の設定を取得
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(['ai_config_persistence'], (result) => {
            resolve(result.ai_config_persistence || {});
          });
        });
        
        // Claudeの設定を更新
        result.claude = data;
        
        // ストレージに保存
        await new Promise((resolve) => {
          chrome.storage.local.set({ ai_config_persistence: result }, resolve);
        });
        
        log('💾 設定をストレージに保存しました', 'SUCCESS');
      }
    } catch (error) {
      log(`ストレージ保存エラー: ${error.message}`, 'ERROR');
    }
  }

  // ========================================
  // 利用可能なモデル一覧取得
  // ========================================
  async function getAvailableModels() {
    log('📋 利用可能なモデルを取得中...', 'INFO');
    
    // AIHandlerが利用可能な場合は使用
    if (useAIHandler && menuHandler) {
      try {
        const models = await menuHandler.getAvailableModels();
        if (models && models.length > 0) {
          log(`✅ 共通ハンドラーで${models.length}個のモデルを取得しました`, 'SUCCESS');
          return models;
        }
      } catch (error) {
        log(`共通ハンドラーエラー、フォールバックに切り替えます: ${error.message}`, 'WARNING');
      }
    }

    try {
      // モデル選択ボタンを探す
      const modelButtonSelectors = [
        '[aria-label="モデルを選択"]',
        '[data-testid="model-selector"]',
        'button[aria-haspopup="menu"]'
      ];

      const modelButton = await findElement(modelButtonSelectors);

      if (!modelButton) {
        log('❌ モデル選択ボタンが見つかりません', 'ERROR');
        return [];
      }

      // 現在のモデルを記録
      const currentModelText = modelButton.textContent?.trim();
      log(`現在のモデル: ${currentModelText}`, 'INFO');

      // メニューを開く
      await performClick(modelButton);
      await wait(CONFIG.DELAYS.menuOpen);

      // モデルメニューが開いたか確認
      const modelOptions = document.querySelectorAll('[role="option"], [role="menuitem"]');
      const models = [];

      for (const option of modelOptions) {
        const fullText = option.textContent?.trim();
        if (fullText) {
          // モデル名のみを抽出（最初の行、または説明文の前まで）
          let modelName = fullText;
          
          // Claudeの場合、モデル名は通常最初の部分に含まれる
          // 例: "Claude Opus 4.1情報を..." → "Claude Opus 4.1"
          // 説明文の開始パターンを探す
          const descriptionPatterns = [
            '情報を', '高性能', 'スマート', '最適な', '高速な', '軽量な', '大規模', '小規模'
          ];
          
          for (const pattern of descriptionPatterns) {
            const index = fullText.indexOf(pattern);
            if (index > 0) {
              modelName = fullText.substring(0, index).trim();
              break;
            }
          }
          
          // それでも長すぎる場合は、最初の20文字程度に制限
          if (modelName.length > 20 && modelName.includes(' ')) {
            // スペースで区切って最初の3つの単語まで
            const words = modelName.split(' ');
            if (words.length > 3) {
              modelName = words.slice(0, 3).join(' ');
            }
          }
          
          // 選択状態を確認（aria-selected、class、チェックマークなど）
          const isSelected = option.getAttribute('aria-selected') === 'true' ||
                           option.classList.contains('selected') ||
                           option.querySelector('svg') !== null ||
                           modelName === currentModelText;

          models.push({
            name: modelName,
            element: option,
            selected: isSelected
          });
        }
      }

      // メニューを閉じる
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(CONFIG.DELAYS.menuClose);

      // 結果を表示
      log(`✅ ${models.length}個のモデルを発見`, 'SUCCESS');
      console.log('\n===== 利用可能なモデル =====');
      models.forEach((model, index) => {
        const status = model.selected ? ' [選択中]' : '';
        console.log(`${index + 1}. ${model.name}${status}`);
      });
      console.log('========================\n');

      return models;

    } catch (error) {
      log(`モデル一覧取得エラー: ${error.message}`, 'ERROR');
      return [];
    }
  }

  // ========================================
  // 利用可能な機能一覧表示
  // ========================================
  async function getAvailableFunctions() {
    // AIHandlerが利用可能な場合は使用
    if (useAIHandler && menuHandler) {
      try {
        const functions = await menuHandler.getAvailableFunctions();
        if (functions && functions.length > 0) {
          log(`✅ 共通ハンドラーで${functions.length}個の機能を取得しました`, 'SUCCESS');
          return functions;
        }
      } catch (error) {
        log(`共通ハンドラーエラー、フォールバックに切り替えます: ${error.message}`, 'WARNING');
      }
    }
    
    const functions = await collectMenuFunctions();

    if (functions.length === 0) {
      log('利用可能な機能が見つかりません', 'WARNING');
      return [];
    }

    console.log('\n===== 利用可能な機能 =====');
    functions.forEach((func, index) => {
      const status = func.hasToggle ? (func.isActive ? 'ON' : 'OFF') : 'アクション';
      console.log(`${index + 1}. ${func.text} [${status}]`);
    });
    console.log('========================\n');

    return functions;
  }

  // ========================================
  // テキスト送信・応答待機・応答取得
  // ========================================
  async function inputText(text) {
    if (!text) {
      log('入力するテキストがありません', 'ERROR');
      return false;
    }

    log('テキストを入力中...', 'INFO');

    const inputSelectors = [
      '[contenteditable="true"][role="textbox"]',
      '.ProseMirror',
      'div[contenteditable="true"]',
      'textarea[placeholder*="メッセージ"]'
    ];

    const inputField = await findElement(inputSelectors);

    if (!inputField) {
      log('テキスト入力欄が見つかりません', 'ERROR');
      return false;
    }

    inputField.focus();
    inputField.innerHTML = `<p>${text}</p>`;
    inputField.dispatchEvent(new Event('input', { bubbles: true }));

    await wait(1000);
    log(`${text.length} 文字を入力しました`, 'SUCCESS');
    return true;
  }

  async function sendMessage() {
    log('メッセージを送信中...', 'INFO');

    const submitButtonSelectors = [
      '[aria-label="メッセージを送信"]:not([disabled])',
      'button[type="submit"]:not([disabled])',
      '.send-button:not([disabled])'
    ];

    const submitButton = await findElement(submitButtonSelectors);

    if (!submitButton) {
      log('送信ボタンが見つかりません', 'ERROR');
      return false;
    }

    await performClick(submitButton);
    sendStartTime = Date.now();  // 送信時刻を記録
    log('📤 メッセージを送信しました', 'SUCCESS');
    await wait(CONFIG.DELAYS.submit);
    return true;
  }

  async function waitForResponse(maxWaitTime = 60000) {
    log('AI応答を待機中...', 'INFO');

    const startTime = Date.now();
    let lastProgressTime = startTime;

    while (Date.now() - startTime < maxWaitTime) {
      const stopButton = document.querySelector('[aria-label="応答を停止"]');

      if (!stopButton) {
        // 経過時間を計算（送信時刻から）
        if (sendStartTime) {
          const elapsedTotal = Date.now() - sendStartTime;
          const minutes = Math.floor(elapsedTotal / 60000);
          const seconds = Math.floor((elapsedTotal % 60000) / 1000);
          log(`✅ 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'SUCCESS');
        } else {
          log('AI応答が完了しました', 'SUCCESS');
        }
        return true;
      }

      if (Date.now() - lastProgressTime > 10000) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        log(`応答待機中... (${elapsedSec}秒経過)`, 'INFO');
        lastProgressTime = Date.now();
      }

      await wait(1000);
    }

    log('応答待機がタイムアウトしました', 'WARNING');
    return false;
  }

  // Canvas（アーティファクト）コンテンツを取得
  async function getCanvasContent(expandIfNeeded = true) {
    // 既に展開されているCanvasを探す
    let canvas = document.querySelector('.grid-cols-1.grid h1')?.closest('.grid-cols-1.grid');
    
    if (!canvas && expandIfNeeded) {
      // プレビューボタンを探して展開
      const previewButton = document.querySelector('button[aria-label="内容をプレビュー"]');
      
      if (previewButton) {
        log('Canvasを展開中...', 'INFO');
        previewButton.click();
        await wait(1000);
        canvas = document.querySelector('.grid-cols-1.grid h1')?.closest('.grid-cols-1.grid');
      }
    }
    
    if (canvas) {
      const h1 = canvas.querySelector('h1');
      const h2s = canvas.querySelectorAll('h2');
      const ps = canvas.querySelectorAll('p.whitespace-normal');
      
      return {
        success: true,
        text: canvas.textContent?.trim(),
        title: h1?.textContent?.trim(),
        sections: h2s.length,
        paragraphs: ps.length
      };
    }
    
    // プレビューテキストから取得（フォールバック）
    const previewElement = document.querySelector('.absolute.inset-0');
    if (previewElement) {
      const text = previewElement.textContent?.trim();
      if (text && text.length > 100) {
        return {
          success: true,
          text: text,
          isPreview: true
        };
      }
    }
    
    return { success: false };
  }

  async function getResponse() {
    log('応答テキストを取得中...', 'INFO');

    const result = {
      normalText: '',
      canvasText: '',
      fullText: '',
      hasCanvas: false
    };

    const responseSelectors = [
      '[data-is-streaming="false"]',
      '.font-claude-message',
      'div[class*="font-claude-message"]',
      '.group.relative.-tracking-\\[0\\.015em\\]'
    ];

    let latestResponseBlock = null;

    for (const selector of responseSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        latestResponseBlock = elements[elements.length - 1];
        break;
      }
    }

    if (!latestResponseBlock) {
      log('AI応答ブロックが見つかりません', 'ERROR');
      return null;
    }

    // 通常の応答テキストを取得（Canvas要素を除外）
    const clonedBlock = latestResponseBlock.cloneNode(true);
    
    // Canvas関連要素を削除
    clonedBlock.querySelectorAll('.grid-cols-1.grid').forEach(elem => elem.remove());
    clonedBlock.querySelectorAll('[class*="artifact-block"]').forEach(elem => elem.remove());
    
    // 通常テキストを抽出
    const paragraphs = clonedBlock.querySelectorAll('p.whitespace-normal.break-words');
    const normalTexts = [];
    
    paragraphs.forEach(p => {
      const text = p.textContent?.trim();
      if (text && text.length > 20 && 
          !text.includes('The user is asking me')) {
        normalTexts.push(text);
      }
    });
    
    result.normalText = normalTexts.join('\n\n');

    // Canvas（アーティファクト）を取得
    const canvas = await getCanvasContent(true);
    if (canvas.success) {
      result.hasCanvas = true;
      result.canvasText = canvas.text;
      
      if (canvas.title) {
        log(`✅ Canvas取得: "${canvas.title}" (${canvas.sections}セクション, ${canvas.paragraphs}段落)`, 'SUCCESS');
      } else if (canvas.isPreview) {
        log('✅ Canvasプレビューから取得', 'SUCCESS');
      }
    }

    // 完全なテキストを結合
    if (result.normalText && result.canvasText) {
      result.fullText = result.normalText + '\n\n--- Canvas Content ---\n\n' + result.canvasText;
    } else if (result.canvasText) {
      result.fullText = result.canvasText;
    } else {
      result.fullText = result.normalText;
    }

    if (result.fullText) {
      log(`✅ 応答取得完了: 通常=${result.normalText.length}文字, Canvas=${result.canvasText.length}文字`, 'SUCCESS');
      return result.fullText;
    } else {
      log('応答テキストが見つかりません', 'WARNING');
      return null;
    }
  }

  // DeepResearch専用の待機・応答関数
  const waitForClaudeDeepResearchResponse = async (maxWaitMinutes = 60) => {
    // DeepResearchハンドラーが利用可能か確認
    if (window.DeepResearchHandler) {
      log('DeepResearchハンドラーを使用します', 'INFO');
      return await window.DeepResearchHandler.handle('Claude', maxWaitMinutes);
    }
    
    // フォールバック：従来の実装（互換性のため残す）
    log('Claude DeepResearch応答を待機中（レガシーモード）...', 'WARNING');
    const startTime = Date.now();
    
    // 停止ボタンの消失を待つシンプルな実装
    while (Date.now() - startTime < maxWaitMinutes * 60 * 1000) {
      try {
        const stopButton = document.querySelector('[aria-label="応答を停止"]');
        if (!stopButton) {
          await wait(3000);
          const finalStopCheck = document.querySelector('[aria-label="応答を停止"]');
          if (!finalStopCheck) {
            log('Claude DeepResearch完了を検出', 'SUCCESS');
            return true;
          }
        }
        await wait(5000);
      } catch (error) {
        log(`DeepResearch完了待機エラー: ${error.message}`, 'WARNING');
      }
    }
    
    log('Claude DeepResearch待機タイムアウト', 'WARNING');
    return false;
  };

  // ========================================
  // 統合実行関数
  // ========================================
  async function runAutomation(config) {
    log('Claude自動化実行開始', 'INFO');
    console.log('[Claude] 設定:', config);

    const result = {
      success: false,
      model: null,
      function: null,
      text: null,
      response: null,
      error: null
    };

    try {
      // モデル選択
      if (config.model) {
        const modelResult = await selectModel(config.model);
        result.model = modelResult ? config.model : null;
        await wait(1000);
      }

      // 機能選択（空文字やnullの場合はスキップ）
      if (config.function && config.function !== 'none' && config.function !== '') {
        console.log(`[デバッグ] Claude機能選択: "${config.function}"`);
        const functionResult = await selectFunction(config.function);
        if (!functionResult) {
          console.log(`[デバッグ] Claude機能選択失敗: "${config.function}"`);
        }
        result.function = functionResult ? config.function : null;
        await wait(1000);
      }

      // テキスト入力
      if (config.text) {
        const inputResult = await inputText(config.text);
        if (!inputResult) {
          throw new Error('テキスト入力に失敗しました');
        }
        result.text = config.text;
      }

      // 送信
      if (config.send) {
        const sendResult = await sendMessage();
        if (!sendResult) {
          throw new Error('送信に失敗しました');
        }
      }

      // 応答待機（DeepResearchの場合は専用の待機関数を使用）
      if (config.waitResponse) {
        if (config.function && config.function.includes('リサーチ')) {
          log('Claude DeepResearch モードで待機', 'INFO');
          const waitResult = await waitForClaudeDeepResearchResponse(60);
          if (!waitResult) {
            log('Claude DeepResearch待機がタイムアウトしましたが、続行します', 'WARNING');
          }
        } else {
          const waitResult = await waitForResponse(config.timeout || 60000);
          if (!waitResult) {
            log('応答待機がタイムアウトしましたが、続行します', 'WARNING');
          }
        }
      }

      // 応答取得
      if (config.getResponse) {
        const response = await getResponse();
        result.response = response;
      }

      result.success = true;
      log('Claude自動化実行完了', 'SUCCESS');

    } catch (error) {
      result.success = false;
      result.error = error.message;
      log(`Claude自動化実行エラー: ${error.message}`, 'ERROR');
    }

    return result;
  }

  // ========================================
  // 自動変更検出システム
  // ========================================
  let changeDetectionState = {
    enabled: false,
    lastModelsHash: null,
    lastFunctionsHash: null,
    observer: null,
    checkInterval: null,
    callbacks: {
      onModelChange: [],
      onFunctionChange: []
    }
  };

  // ハッシュ生成関数
  function generateHash(data) {
    return JSON.stringify(data).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
  }

  // モデル変更検出
  async function detectModelChanges() {
    try {
      const currentModels = await getAvailableModels();
      const currentHash = generateHash(currentModels.map(m => m.name));
      
      if (changeDetectionState.lastModelsHash !== null && 
          changeDetectionState.lastModelsHash !== currentHash) {
        
        log('🔄 モデル変更を検出しました', 'WARNING');
        
        // コールバック実行
        changeDetectionState.callbacks.onModelChange.forEach(callback => {
          try {
            callback(currentModels);
          } catch (error) {
            log(`モデル変更コールバックエラー: ${error.message}`, 'ERROR');
          }
        });
        
        // イベント発火
        window.dispatchEvent(new CustomEvent('claude-models-changed', {
          detail: { models: currentModels }
        }));
      }
      
      changeDetectionState.lastModelsHash = currentHash;
    } catch (error) {
      log(`モデル変更検出エラー: ${error.message}`, 'DEBUG');
    }
  }

  // 機能変更検出
  async function detectFunctionChanges() {
    try {
      const currentFunctions = await getAvailableFunctions();
      const currentHash = generateHash(currentFunctions.map(f => f.text));
      
      if (changeDetectionState.lastFunctionsHash !== null && 
          changeDetectionState.lastFunctionsHash !== currentHash) {
        
        log('🔄 機能変更を検出しました', 'WARNING');
        
        // コールバック実行
        changeDetectionState.callbacks.onFunctionChange.forEach(callback => {
          try {
            callback(currentFunctions);
          } catch (error) {
            log(`機能変更コールバックエラー: ${error.message}`, 'ERROR');
          }
        });
        
        // イベント発火
        window.dispatchEvent(new CustomEvent('claude-functions-changed', {
          detail: { functions: currentFunctions }
        }));
      }
      
      changeDetectionState.lastFunctionsHash = currentHash;
    } catch (error) {
      log(`機能変更検出エラー: ${error.message}`, 'DEBUG');
    }
  }

  // 定期チェック関数
  async function periodicCheck() {
    await detectModelChanges();
    await detectFunctionChanges();
  }

  // DOM変更監視
  function setupDOMObserver() {
    if (changeDetectionState.observer) {
      changeDetectionState.observer.disconnect();
    }

    changeDetectionState.observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      mutations.forEach(mutation => {
        // Claude特有のセレクタ監視
        if (mutation.target.matches && (
          mutation.target.matches('[aria-label*="モデル"]') ||
          mutation.target.matches('[data-testid*="model"]') ||
          mutation.target.matches('[data-testid*="input-menu"]') ||
          mutation.target.matches('[role="menu"]') ||
          mutation.target.matches('[role="option"]') ||
          mutation.target.matches('[role="menuitem"]')
        )) {
          shouldCheck = true;
        }
        
        // 追加/削除されたノードをチェック
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.querySelector && (
              node.querySelector('[aria-label*="モデル"]') ||
              node.querySelector('[data-testid*="model"]') ||
              node.querySelector('[data-testid*="input-menu"]') ||
              node.querySelector('[role="menu"]')
            )) {
              shouldCheck = true;
            }
          }
        });
      });
      
      if (shouldCheck) {
        // デバウンス処理（500ms後に実行）
        clearTimeout(changeDetectionState.debounceTimer);
        changeDetectionState.debounceTimer = setTimeout(() => {
          periodicCheck();
        }, 500);
      }
    });

    // body要素全体を監視
    changeDetectionState.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-testid', 'role', 'aria-expanded', 'aria-selected']
    });
  }

  // 変更検出開始
  function startChangeDetection(options = {}) {
    const {
      enableDOMObserver = true,
      enablePeriodicCheck = true,
      checkInterval = 30000 // 30秒
    } = options;

    if (changeDetectionState.enabled) {
      log('変更検出は既に有効です', 'WARNING');
      return;
    }

    log('🔍 Claude変更検出システムを開始します', 'INFO');
    
    changeDetectionState.enabled = true;
    
    // 初期状態を記録
    periodicCheck();
    
    // DOM監視開始
    if (enableDOMObserver) {
      setupDOMObserver();
      log('DOM変更監視を開始しました', 'INFO');
    }
    
    // 定期チェック開始
    if (enablePeriodicCheck) {
      changeDetectionState.checkInterval = setInterval(periodicCheck, checkInterval);
      log(`定期チェックを開始しました (${checkInterval/1000}秒間隔)`, 'INFO');
    }
  }

  // 変更検出停止
  function stopChangeDetection() {
    if (!changeDetectionState.enabled) {
      log('変更検出は無効です', 'WARNING');
      return;
    }

    log('🛑 Claude変更検出システムを停止します', 'INFO');
    
    changeDetectionState.enabled = false;
    
    // DOM監視停止
    if (changeDetectionState.observer) {
      changeDetectionState.observer.disconnect();
      changeDetectionState.observer = null;
    }
    
    // 定期チェック停止
    if (changeDetectionState.checkInterval) {
      clearInterval(changeDetectionState.checkInterval);
      changeDetectionState.checkInterval = null;
    }
    
    // デバウンスタイマークリア
    if (changeDetectionState.debounceTimer) {
      clearTimeout(changeDetectionState.debounceTimer);
      changeDetectionState.debounceTimer = null;
    }
  }

  // コールバック登録
  function onModelChange(callback) {
    if (typeof callback === 'function') {
      changeDetectionState.callbacks.onModelChange.push(callback);
      log('モデル変更コールバックを登録しました', 'INFO');
    }
  }

  function onFunctionChange(callback) {
    if (typeof callback === 'function') {
      changeDetectionState.callbacks.onFunctionChange.push(callback);
      log('機能変更コールバックを登録しました', 'INFO');
    }
  }

  // 強制チェック実行
  async function forceCheck() {
    log('🔍 強制チェックを実行中...', 'INFO');
    await periodicCheck();
    log('✅ 強制チェック完了', 'SUCCESS');
  }

  // ========================================
  // グローバル公開
  // ========================================
  window.ClaudeAutomation = {
    selectModel,
    selectFunction,
    inputText,
    sendMessage,
    waitForResponse,
    getResponse,
    runAutomation,
    getAvailableModels,
    getAvailableFunctions,
    // 変更検出API
    startChangeDetection,
    stopChangeDetection,
    forceCheck,
    onModelChange,
    onFunctionChange,
    getChangeDetectionState: () => ({
      enabled: changeDetectionState.enabled,
      lastModelsHash: changeDetectionState.lastModelsHash,
      lastFunctionsHash: changeDetectionState.lastFunctionsHash,
      callbackCounts: {
        models: changeDetectionState.callbacks.onModelChange.length,
        functions: changeDetectionState.callbacks.onFunctionChange.length
      }
    }),
    utils: {
      wait,
      performClick,
      findElement
    }
  };

  // ========================================
  // 初期化
  // ========================================
  function initialize() {
    // AIHandlerの初期化
    if (useAIHandler) {
      menuHandler = window.AIHandler.menuHandler || new window.AIHandler.MenuHandler();
      log('✅ AIHandlerを初期化しました', 'SUCCESS');
    } else {
      log('AIHandlerが利用できません、従来の方法を使用します', 'INFO');
    }
  }
  
  // 初期化実行
  initialize();
  
  log('Claude動的検索自動化関数が利用可能になりました', 'SUCCESS');
  return window.ClaudeAutomation;
})();