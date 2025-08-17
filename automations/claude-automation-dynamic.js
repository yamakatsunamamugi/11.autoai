// Claude自動化関数 - 動的検索対応版
(() => {
  "use strict";

  // 共通メニューハンドラーを使用（利用可能な場合）
  const useCommonMenuHandler = window.CommonMenuHandler && window.menuHandler;
  
  // ========================================
  // グローバル変数
  // ========================================
  let sendStartTime = null;  // 送信開始時刻を記録
  let menuHandler = null;  // 共通メニューハンドラーのインスタンス

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

  // ========================================
  // 動的検索関数
  // ========================================
  async function collectMenuFunctions() {
    log('メニューから機能を収集中...', 'SEARCH');

    const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                          document.querySelector('[aria-label="ツールメニューを開く"]');

    if (!featureButton) {
      log('機能メニューボタンが見つかりません', 'ERROR');
      return [];
    }

    await performClick(featureButton);
    await wait(CONFIG.DELAYS.menuOpen);

    const menu = await waitForMenu();
    if (!menu) {
      log('メニューが開きませんでした', 'ERROR');
      return [];
    }

    const functions = [];
    const buttons = menu.querySelectorAll('button');

    buttons.forEach((button, index) => {
      const text = button.textContent?.trim();
      if (!text || text.length === 0 || text.length > 50) return;
      if (text.includes('コネクタ')) return;

      const toggleInput = button.querySelector('input[type="checkbox"][role="switch"]');
      const hasToggle = toggleInput !== null;
      const isActive = hasToggle ? toggleInput.checked : false;
      const hasAriaPressed = button.hasAttribute('aria-pressed');

      functions.push({
        text: text,
        element: button,
        index: index,
        hasToggle: hasToggle,
        toggleInput: toggleInput,
        isActive: isActive,
        hasAriaPressed: hasAriaPressed,
        ariaPressed: button.getAttribute('aria-pressed')
      });

      log(`発見: ${text} (トグル:${hasToggle}, 状態:${isActive})`, 'DEBUG');
    });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { 
      key: 'Escape', 
      code: 'Escape',
      bubbles: true 
    }));
    await wait(CONFIG.DELAYS.menuClose);

    log(`合計 ${functions.length} 個の機能を発見`, 'SUCCESS');
    return functions;
  }

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
    
    // 共通メニューハンドラーが利用可能な場合は使用
    if (useCommonMenuHandler && menuHandler) {
      try {
        // エイリアスを解決
        const normalizedInput = functionName.toLowerCase().replace(/\s+/g, '');
        const targetFunction = CONFIG.FUNCTION_ALIASES[normalizedInput] || functionName;
        const result = await menuHandler.selectFunction(targetFunction, enable);
        if (result) {
          log(`✅ 共通ハンドラーで機能「${targetFunction}」を${enable ? '有効' : '無効'}にしました`, 'SUCCESS');
          return true;
        }
      } catch (error) {
        log(`共通ハンドラーエラー、フォールバックに切り替えます: ${error.message}`, 'WARNING');
      }
    }

    const normalizedInput = functionName.toLowerCase().replace(/\s+/g, '');
    const targetAlias = CONFIG.FUNCTION_ALIASES[normalizedInput];

    if (targetAlias === 'リサーチ') {
      log('DeepResearchモードを有効化します', 'INFO');
      log('⚠️ DeepResearchは最大40分かかる場合があります', 'WARNING');

      const searchEnabled = await selectFunction('ウェブ検索', true);
      if (!searchEnabled) {
        log('ウェブ検索の有効化に失敗しました', 'ERROR');
        return false;
      }

      return await clickResearchButton();
    }

    const functions = await collectMenuFunctions();
    if (functions.length === 0) {
      log('機能が見つかりませんでした', 'ERROR');
      return false;
    }

    const targetFunc = findFunctionByName(functions, functionName);

    if (!targetFunc) {
      log(`機能「${functionName}」が見つかりません`, 'ERROR');
      log('利用可能な機能:', 'INFO');
      functions.forEach(f => log(`  • ${f.text}`, 'INFO'));
      return false;
    }

    log(`機能「${targetFunc.text}」を選択します`, 'INFO');

    const featureButton = document.querySelector('[data-testid="input-menu-tools"]');
    if (!featureButton) {
      log('機能メニューボタンが見つかりません', 'ERROR');
      return false;
    }

    await performClick(featureButton);
    await wait(CONFIG.DELAYS.menuOpen);

    const menu = await waitForMenu();
    if (!menu) {
      log('メニューが開きませんでした', 'ERROR');
      return false;
    }

    const buttons = menu.querySelectorAll('button');
    const targetButton = buttons[targetFunc.index];

    if (!targetButton) {
      log('ボタンの再取得に失敗しました', 'ERROR');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { 
        key: 'Escape', 
        code: 'Escape',
        bubbles: true 
      }));
      return false;
    }

    if (targetFunc.hasToggle) {
      const toggleInput = targetButton.querySelector('input[type="checkbox"][role="switch"]');
      if (toggleInput) {
        const isCurrentlyActive = toggleInput.checked;

        if (enable && !isCurrentlyActive) {
          log(`「${targetFunc.text}」をONにします`, 'INFO');
          await performClick(targetButton);
          await wait(500);
          log(`「${targetFunc.text}」がONになりました`, 'SUCCESS');
        } else if (!enable && isCurrentlyActive) {
          log(`「${targetFunc.text}」をOFFにします`, 'INFO');
          await performClick(targetButton);
          await wait(500);
          log(`「${targetFunc.text}」がOFFになりました`, 'SUCCESS');
        } else {
          log(`「${targetFunc.text}」は既に${isCurrentlyActive ? 'ON' : 'OFF'}です`, 'SUCCESS');
        }
      }
    } else {
      await performClick(targetButton);
      await wait(500);
      log(`「${targetFunc.text}」をクリックしました`, 'SUCCESS');
    }

    document.body.dispatchEvent(new KeyboardEvent('keydown', { 
      key: 'Escape', 
      code: 'Escape',
      bubbles: true 
    }));
    await wait(CONFIG.DELAYS.menuClose);

    return true;
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
    
    // 共通メニューハンドラーが利用可能な場合は使用
    if (useCommonMenuHandler && menuHandler) {
      try {
        // エイリアスを解決
        const targetModel = CONFIG.MODEL_ALIASES[identifier.toLowerCase()] || identifier;
        const result = await menuHandler.selectModel(targetModel);
        if (result) {
          log(`✅ 共通ハンドラーでモデル「${targetModel}」を選択しました`, 'SUCCESS');
          return true;
        }
      } catch (error) {
        log(`共通ハンドラーエラー、フォールバックに切り替えます: ${error.message}`, 'WARNING');
      }
    }

    try {
      // モデル名マッピングを拡張・改善
      const modelMappings = {
        // Opus 4.1
        'opus4.1': ['Opus 4.1', 'Claude Opus 4.1', 'Opus'],
        'opus 4.1': ['Opus 4.1', 'Claude Opus 4.1', 'Opus'],
        'opus41': ['Opus 4.1', 'Claude Opus 4.1', 'Opus'],
        'opus': ['Opus 4.1', 'Claude Opus 4.1', 'Opus'],
        'claude opus 4.1': ['Opus 4.1', 'Claude Opus 4.1', 'Opus'],
        // Sonnet 4
        'sonnet4': ['Sonnet 4', 'Claude Sonnet 4', 'Sonnet'],
        'sonnet 4': ['Sonnet 4', 'Claude Sonnet 4', 'Sonnet'],
        'sonnet': ['Sonnet 4', 'Claude Sonnet 4', 'Sonnet'],
        'claude sonnet 4': ['Sonnet 4', 'Claude Sonnet 4', 'Sonnet'],
        '4': ['Sonnet 4', 'Claude Sonnet 4', 'Sonnet'],
        // Opus 4
        'opus4': ['Opus 4', 'Claude Opus 4', 'Opus'],
        'opus 4': ['Opus 4', 'Claude Opus 4', 'Opus'],
        // Sonnet 3.7
        'sonnet3.7': ['Sonnet 3.7', 'Claude Sonnet 3.7', '3.7'],
        'sonnet 3.7': ['Sonnet 3.7', 'Claude Sonnet 3.7', '3.7'],
        '3.7': ['Sonnet 3.7', 'Claude Sonnet 3.7', '3.7'],
        // Haiku 3.5
        'haiku3.5': ['Haiku 3.5', 'Claude Haiku 3.5', 'Haiku'],
        'haiku 3.5': ['Haiku 3.5', 'Claude Haiku 3.5', 'Haiku'],
        'haiku': ['Haiku 3.5', 'Claude Haiku 3.5', 'Haiku'],
        'claude haiku': ['Haiku 3.5', 'Claude Haiku 3.5', 'Haiku'],
        '3.5': ['Haiku 3.5', 'Claude Haiku 3.5', 'Haiku']
      };

      const possibleNames = modelMappings[identifier.toLowerCase()] || [identifier];
      log(`検索パターン: ${possibleNames.join(', ')}`, 'INFO');

      // モデル選択ボタンを探す（セレクタを拡張）
      const modelButtonSelectors = [
        '[data-testid="model-selector-dropdown"]',  // 優先順位高
        '[aria-label="モデルを選択"]',
        '[data-testid="model-selector"]',
        'button[aria-haspopup="menu"]',
        'button[aria-label*="モデル"]',
        // 現在のモデル名を含むボタンを探す
        'button:has-text("Opus")',
        'button:has-text("Sonnet")',
        'button:has-text("Haiku")'
      ];

      let modelButton = null;
      let retries = 3;
      
      // リトライ処理を追加
      while (!modelButton && retries > 0) {
        modelButton = await findElement(modelButtonSelectors, null, 5000);
        
        if (!modelButton) {
          // フォールバック: textContentで現在のモデル名を含むボタンを探す
          const allButtons = document.querySelectorAll('button');
          for (const btn of allButtons) {
            const text = btn.textContent?.trim() || '';
            if ((text.includes('Opus') || text.includes('Sonnet') || text.includes('Haiku')) &&
                (btn.hasAttribute('aria-haspopup') || btn.hasAttribute('data-testid'))) {
              modelButton = btn;
              log('フォールバック方式でモデルボタンを発見', 'INFO');
              break;
            }
          }
        }
        
        if (!modelButton) {
          log(`モデルボタン検索リトライ... (残り${retries - 1}回)`, 'WARNING');
          await wait(1000);
          retries--;
        }
      }

      if (!modelButton) {
        log('モデル選択ボタンが見つかりません', 'ERROR');
        return false;
      }

      // 現在のモデルを記録
      const currentModelText = modelButton.textContent?.trim();
      log(`現在のモデル: ${currentModelText || '不明'}`, 'INFO');

      // メニューを開く
      await performClick(modelButton);
      await wait(CONFIG.DELAYS.menuOpen);

      // メニューが開いたか確認
      let modelMenu = await waitForMenu(5000);
      if (!modelMenu) {
        // メニューが開かない場合、再度クリック
        log('メニューが開かないため、再度クリックします', 'WARNING');
        await performClick(modelButton);
        await wait(CONFIG.DELAYS.menuOpen);
        modelMenu = await waitForMenu(3000);
      }

      if (!modelMenu) {
        log('モデルメニューが開きませんでした', 'ERROR');
        return false;
      }

      // メニューからモデルを動的検索
      const modelOptions = document.querySelectorAll('[role="option"], [role="menuitem"]');
      let allModels = [];
      let targetOption = null;

      for (const option of modelOptions) {
        const text = option.textContent?.trim();
        if (text) {
          allModels.push(text);
          log(`発見モデル: "${text}"`, 'DEBUG');
          
          // 完全一致を優先
          for (const name of possibleNames) {
            if (text === name || text === `Claude ${name}`) {
              targetOption = option;
              log(`🎯 完全一致: "${text}"`, 'SUCCESS');
              break;
            }
          }
          
          // 部分一致（完全一致が見つからない場合）
          if (!targetOption) {
            for (const name of possibleNames) {
              if (text.includes(name)) {
                targetOption = option;
                log(`🎯 部分一致: "${text}" ← "${name}"`, 'SUCCESS');
                break;
              }
            }
          }
          
          if (targetOption) break;
        }
      }

      if (targetOption) {
        await performClick(targetOption);
        log(`✅ モデル「${targetOption.textContent?.trim()}」を選択しました`, 'SUCCESS');
        await wait(CONFIG.DELAYS.modelSwitch);
        
        // 選択確認
        await wait(1000);
        const newModelButton = await findElement(modelButtonSelectors, null, 3000);
        if (newModelButton) {
          const newModelText = newModelButton.textContent?.trim();
          if (newModelText && newModelText !== currentModelText) {
            log(`✅ モデル変更確認: ${currentModelText} → ${newModelText}`, 'SUCCESS');
          }
        }
        
        return true;
      } else {
        log(`❌ モデル「${identifier}」が見つかりません`, 'ERROR');
        log('利用可能なモデル:', 'INFO');
        allModels.forEach(model => log(`  • ${model}`, 'INFO'));
        
        // メニューを閉じる
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(CONFIG.DELAYS.menuClose);
        return false;
      }
      
    } catch (error) {
      log(`モデル選択エラー: ${error.message}`, 'ERROR');
      // エラー時もメニューを閉じる
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return false;
    }
  }

  // ========================================
  // 利用可能なモデル一覧取得
  // ========================================
  async function getAvailableModels() {
    log('📋 利用可能なモデルを取得中...', 'INFO');

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

  async function getResponse() {
    log('応答テキストを取得中...', 'INFO');

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

    // Artifactレポートの確認
    const artifactButton = latestResponseBlock.querySelector('button[aria-label*="プレビュー"], button[aria-label*="内容"]');
    let reportText = '';

    if (artifactButton) {
      const previewDiv = artifactButton.querySelector('.artifact-block-cell-preview > div');
      if (previewDiv) {
        reportText = previewDiv.textContent?.trim() || '';
      }
    }

    // 通常の応答テキスト
    const summaryParagraphs = latestResponseBlock.querySelectorAll('p.whitespace-normal.break-words');
    const summaryTexts = [];

    summaryParagraphs.forEach(p => {
      const text = p.textContent?.trim();
      if (text && text.length > 20 && 
          !p.closest('.artifact-block-cell') &&
          !p.closest('[tabindex="-1"]') &&
          !text.includes('The user is asking me')) {
        summaryTexts.push(text);
      }
    });

    const summaryText = summaryTexts.join('\n\n');
    let fullText = '';

    if (reportText) {
      fullText = '【レポート】\n' + reportText;
    }

    if (summaryText) {
      if (fullText) {
        fullText += '\n\n【通常応答】\n' + summaryText;
      } else {
        fullText = summaryText;
      }
    }

    if (fullText) {
      log(`✅ 応答テキストを取得（${fullText.length}文字）`, 'SUCCESS');
      return fullText;
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

      // 機能選択
      if (config.function !== undefined) {
        const functionResult = await selectFunction(config.function);
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
    // 共通メニューハンドラーの初期化
    if (useCommonMenuHandler) {
      menuHandler = window.menuHandler || new window.CommonMenuHandler();
      log('✅ 共通メニューハンドラーを初期化しました', 'SUCCESS');
    } else {
      log('共通メニューハンドラーが利用できません、従来の方法を使用します', 'INFO');
    }
  }
  
  // 初期化実行
  initialize();
  
  log('Claude動的検索自動化関数が利用可能になりました', 'SUCCESS');
  return window.ClaudeAutomation;
})();