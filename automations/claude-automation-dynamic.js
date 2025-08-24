/**
 * @fileoverview Claude自動化関数 - 動的検索対応版
 * 
 * 【役割】
 * Claude専用の自動化処理を提供
 * 
 * 【主要機能】
 * - Claude固有のモデル選択（Opus 4.1、Sonnet 4、Haiku 3.5など）
 * - Claude固有の機能選択（じっくり考える、ウェブ検索、Drive検索など）
 * - モデル名・機能名のエイリアス対応（略称やタイポに対応）
 * - Canvas機能のテキスト取得
 * 
 * 【依存関係】
 * - common-ai-handler.js: window.AIHandlerを使用
 * - ui-selectors.js: Claude用セレクタを使用
 * - claude-deepresearch-selector.js: DeepResearch選択ロジック
 * 
 * 【グローバル公開】
 * window.ClaudeAutomation: コンソールから直接呼び出し可能
 */
(() => {
  "use strict";

  // common-ai-handler.jsのAIHandlerを使用
  const useAIHandler = window.AIHandler;  // common-ai-handler.jsによって提供される
  
  // ========================================
  // グローバル変数
  // ========================================
  let sendStartTime = null;  // 送信開始時刻を記録
  let menuHandler = null;  // common-ai-handler.jsのMenuHandlerインスタンス

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

  // ========================================
  // 拡張ログシステム
  // ========================================
  const LogLevel = {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
    FATAL: 5
  };

  let logConfig = {
    level: LogLevel.INFO,
    enableConsole: true,
    enableStorage: true,
    maxStorageEntries: 1000,
    includeStackTrace: false,
    includeTimestamp: true,
    includePerformance: true
  };

  let logStorage = [];
  let sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  let operationContext = null;
  let performanceMetrics = new Map();

  const logTypeConfig = {
    'TRACE': { level: LogLevel.TRACE, prefix: '🔬', color: '#888' },
    'DEBUG': { level: LogLevel.DEBUG, prefix: '🔍', color: '#007ACC' },
    'INFO': { level: LogLevel.INFO, prefix: '📝', color: '#0078D4' },
    'SUCCESS': { level: LogLevel.INFO, prefix: '✅', color: '#107C10' },
    'WARN': { level: LogLevel.WARN, prefix: '⚠️', color: '#FF8C00' },
    'WARNING': { level: LogLevel.WARN, prefix: '⚠️', color: '#FF8C00' },
    'ERROR': { level: LogLevel.ERROR, prefix: '❌', color: '#D13438' },
    'FATAL': { level: LogLevel.FATAL, prefix: '💀', color: '#8B0000' },
    'SEARCH': { level: LogLevel.INFO, prefix: '🔎', color: '#0078D4' },
    'PERFORMANCE': { level: LogLevel.INFO, prefix: '⚡', color: '#FF6B35' },
    'NETWORK': { level: LogLevel.DEBUG, prefix: '🌐', color: '#6264A7' },
    'DOM': { level: LogLevel.DEBUG, prefix: '🏗️', color: '#5C2D91' },
    'USER_ACTION': { level: LogLevel.INFO, prefix: '👤', color: '#8764B8' },
    'AUTOMATION': { level: LogLevel.INFO, prefix: '🤖', color: '#00BCF2' }
  };

  function formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substr(0, 23);
  }

  function formatDuration(startTime) {
    const duration = Date.now() - startTime;
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(2)}s`;
    return `${(duration / 60000).toFixed(2)}m`;
  }

  function getStackTrace() {
    if (!logConfig.includeStackTrace) return null;
    const stack = new Error().stack;
    return stack ? stack.split('\n').slice(3, 8).join('\n') : null;
  }

  function createLogEntry(message, type, context = {}) {
    const typeInfo = logTypeConfig[type] || logTypeConfig['INFO'];
    
    const entry = {
      timestamp: Date.now(),
      sessionId,
      level: typeInfo.level,
      type,
      message,
      context: {
        operation: operationContext,
        ...context
      }
    };

    if (logConfig.includeTimestamp) {
      entry.formattedTime = formatTimestamp();
    }

    if (logConfig.includeStackTrace && typeInfo.level >= LogLevel.WARN) {
      entry.stackTrace = getStackTrace();
    }

    return entry;
  }

  function shouldLog(type) {
    const typeInfo = logTypeConfig[type] || logTypeConfig['INFO'];
    return typeInfo.level >= logConfig.level;
  }

  function storeLogEntry(entry) {
    if (!logConfig.enableStorage) return;
    
    logStorage.push(entry);
    
    if (logStorage.length > logConfig.maxStorageEntries) {
      logStorage = logStorage.slice(-logConfig.maxStorageEntries);
    }
  }

  function log(message, type = 'INFO', context = {}) {
    if (!shouldLog(type)) return;

    const typeInfo = logTypeConfig[type] || logTypeConfig['INFO'];
    const entry = createLogEntry(message, type, context);
    
    storeLogEntry(entry);

    // 拡張機能のログシステムに送信
    const logData = {
      source: 'Claude',
      level: type,
      message: message,
      timestamp: new Date().toISOString(),
      context: context,
      operation: operationContext
    };

    // 拡張機能のLogManagerに送信（正しい形式で）
    if (window.chrome && window.chrome.runtime) {
      try {
        window.chrome.runtime.sendMessage({
          action: 'LOG_AI_MESSAGE',
          aiType: 'Claude',
          message: message,
          options: {
            level: type.toLowerCase(),
            metadata: {
              operation: operationContext,
              ...context
            }
          }
        }).catch(() => {
          // エラーを無視（拡張機能が無効な場合）
        });
      } catch (e) {
        // chrome.runtime が利用できない場合は無視
      }
    }

    // 拡張機能専用のログハンドラーがある場合は使用
    if (logConfig.extensionLogger && typeof logConfig.extensionLogger === 'function') {
      try {
        logConfig.extensionLogger('Claude', type, message, context);
      } catch (e) {
        // 拡張機能ログハンドラーのエラーは無視
      }
    }

    if (logConfig.enableConsole) {
      const timeStr = logConfig.includeTimestamp ? `[${formatTimestamp()}] ` : '';
      const contextStr = operationContext ? `[${operationContext}] ` : '';
      
      // コンテキストオブジェクトを文字列として適切に表示
      let contextInfo = '';
      if (context && typeof context === 'object' && Object.keys(context).length > 0) {
        try {
          contextInfo = ` ${JSON.stringify(context)}`;
        } catch (e) {
          contextInfo = ` [Context Object]`;
        }
      }
      
      const fullMessage = `${typeInfo.prefix} ${timeStr}[Claude] ${contextStr}${message}${contextInfo}`;
      
      if (typeInfo.level >= LogLevel.ERROR) {
        console.error(fullMessage);
        if (entry.stackTrace) console.error(entry.stackTrace);
      } else if (typeInfo.level >= LogLevel.WARN) {
        console.warn(fullMessage);
      } else {
        console.log(fullMessage);
      }
    }
  }

  function startOperation(operationName, details = {}) {
    operationContext = operationName;
    const startTime = Date.now();
    performanceMetrics.set(operationName, { startTime, details });
    
    log(`開始: ${operationName}`, 'AUTOMATION', details);
    return startTime;
  }

  function endOperation(operationName, result = {}) {
    const metrics = performanceMetrics.get(operationName);
    if (metrics) {
      const duration = Date.now() - metrics.startTime;
      const context = {
        duration: formatDuration(metrics.startTime),
        durationMs: duration,
        ...metrics.details,
        result
      };
      
      log(`完了: ${operationName} (${formatDuration(metrics.startTime)})`, 'PERFORMANCE', context);
      performanceMetrics.delete(operationName);
    }
    
    if (operationContext === operationName) {
      operationContext = null;
    }
  }

  function logPerformance(operationName, startTime, details = {}) {
    const duration = Date.now() - startTime;
    const context = {
      duration: formatDuration(startTime),
      durationMs: duration,
      ...details
    };
    log(`パフォーマンス: ${operationName}`, 'PERFORMANCE', context);
  }

  function logError(error, context = {}) {
    const errorContext = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...context
    };
    log(`エラー発生: ${error.message}`, 'ERROR', errorContext);
  }

  function logUserAction(action, target, details = {}) {
    const context = {
      action,
      target,
      ...details
    };
    log(`ユーザーアクション: ${action} -> ${target}`, 'USER_ACTION', context);
  }

  function logDOMOperation(operation, selector, result, details = {}) {
    const context = {
      operation,
      selector,
      result,
      ...details
    };
    log(`DOM操作: ${operation} (${selector})`, 'DOM', context);
  }

  function logNetworkOperation(operation, url, result, details = {}) {
    const context = {
      operation,
      url,
      result,
      ...details
    };
    log(`ネットワーク: ${operation} (${url})`, 'NETWORK', context);
  }

  const findElement = async (selectors, condition = null, maxWait = 3000) => {
    const startTime = Date.now();
    const operationId = `findElement_${Date.now()}`;
    
    log(`要素検索開始: ${JSON.stringify(selectors)}`, 'DOM', {
      selectors,
      maxWait,
      hasCondition: !!condition
    });

    while (Date.now() - startTime < maxWait) {
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          logDOMOperation('querySelectorAll', selector, `${elements.length}個の要素`, {
            elementsFound: elements.length
          });

          for (const element of elements) {
            if (!condition || condition(element)) {
              const duration = Date.now() - startTime;
              log(`要素検索成功: ${selector}`, 'SUCCESS', {
                selector,
                duration: `${duration}ms`,
                elementTag: element.tagName,
                elementId: element.id,
                elementClass: element.className
              });
              return element;
            }
          }
        } catch (e) {
          logError(e, { selector, operation: 'findElement' });
        }
      }
      await wait(CONFIG.DELAYS.elementSearch);
    }

    const totalDuration = Date.now() - startTime;
    log(`要素検索失敗: タイムアウト`, 'ERROR', {
      selectors,
      duration: `${totalDuration}ms`,
      maxWait
    });
    return null;
  };

  const performClick = async (element) => {
    if (!element) {
      log('クリック失敗: 要素がnull', 'ERROR');
      return false;
    }

    const startTime = Date.now();
    const elementInfo = {
      tag: element.tagName,
      id: element.id,
      class: element.className,
      text: element.textContent?.substring(0, 100)
    };

    log('要素クリック開始', 'USER_ACTION', elementInfo);

    try {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      logUserAction('pointerdown', `${elementInfo.tag}#${elementInfo.id}`, {
        coordinates: { x, y },
        elementRect: rect
      });

      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1
      }));

      await wait(CONFIG.DELAYS.click);

      logUserAction('pointerup', `${elementInfo.tag}#${elementInfo.id}`, {
        coordinates: { x, y },
        delay: CONFIG.DELAYS.click
      });

      element.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1
      }));

      element.click();
      
      logPerformance('performClick', startTime, elementInfo);
      log('要素クリック成功', 'SUCCESS', {
        ...elementInfo,
        duration: `${Date.now() - startTime}ms`
      });
      
      return true;
    } catch (e) {
      logError(e, { 
        operation: 'performClick',
        element: elementInfo,
        duration: `${Date.now() - startTime}ms`
      });
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
    const operationName = 'selectFunction';
    const startTime = startOperation(operationName, {
      functionName,
      enable,
      timestamp: new Date().toISOString()
    });

    // 「なし（通常モード）」の処理を追加
    if (functionName === 'なし（通常モード）' || 
        functionName === 'なし' || 
        functionName === 'none' || 
        !functionName) {
      log('機能を無効化します（通常モード）', 'INFO');
      endOperation(operationName, { success: true, action: 'disabled' });
      return true;
    }

    // レポート化は機能メニューではないのでスキップ
    if (functionName === 'レポート化' || functionName === 'レポート' || 
        functionName === 'report' || functionName === 'reporting') {
      log('「レポート化」はClaudeの機能メニューではありません。スキップします', 'INFO');
      endOperation(operationName, { success: true, action: 'skipped', reason: 'not_a_claude_feature' });
      return true;
    }

    log(`機能を動的検索: ${functionName}`, 'SEARCH', { functionName, enable });
    
    // AIHandlerを使用
    if (!useAIHandler || !menuHandler) {
      const error = 'AIHandlerが利用できません';
      log(error, 'ERROR');
      endOperation(operationName, { success: false, error });
      return false;
    }

    try {
      // エイリアスを解決
      const normalizedInput = functionName.toLowerCase().replace(/\s+/g, '');
      const targetFunction = CONFIG.FUNCTION_ALIASES[normalizedInput] || functionName;
      
      log('エイリアス解決完了', 'DEBUG', {
        original: functionName,
        normalized: normalizedInput,
        resolved: targetFunction
      });
      
      // DeepResearch特別処理
      const isDeepResearch = window.FeatureConstants ? 
        window.FeatureConstants.isDeepResearch(functionName) :
        (normalizedInput === 'deepresearch' || functionName === 'DeepResearch' || CONFIG.FUNCTION_ALIASES[normalizedInput] === 'リサーチ');
      
      if (isDeepResearch) {
        log('DeepResearchモードを有効化します', 'INFO');
        // DeepResearch専用の特別なログフォーマット
        const deepResearchMessage = 'DeepResearchは最大40分の処理時間がかかる場合があります。長時間お待ちください。';
        const deepResearchDetails = '深層調査モード - 推定時間: 最大40分';
        log(`${deepResearchMessage} (${deepResearchDetails})`, 'INFO');
        
        // 共有モジュールを使用してDeepResearchを選択
        if (window.ClaudeDeepResearchSelector && window.ClaudeDeepResearchSelector.select) {
          log('ClaudeDeepResearchSelectorを使用', 'DEBUG');
          const result = await window.ClaudeDeepResearchSelector.select();
          
          if (result.success) {
            if (result.alreadyEnabled) {
              log('DeepResearchは既に有効です', 'INFO');
              endOperation(operationName, { success: true, alreadyEnabled: true });
            } else {
              log('DeepResearchボタンをクリックしました', 'SUCCESS');
              endOperation(operationName, { success: true, action: 'enabled' });
            }
            return true;
          } else {
            const error = 'DeepResearchボタンが見つかりません';
            log(error, 'ERROR');
            endOperation(operationName, { success: false, error });
            return false;
          }
        } else {
          const error = 'ClaudeDeepResearchSelectorモジュールが見つかりません';
          log(error, 'ERROR');
          endOperation(operationName, { success: false, error });
          return false;
        }
      }
      
      log('共通ハンドラーで機能選択実行', 'DEBUG', { targetFunction, enable });
      
      const result = await menuHandler.selectFunction(targetFunction, enable);
      
      if (result) {
        const message = `共通ハンドラーで機能「${targetFunction}」を${enable ? '有効' : '無効'}にしました`;
        log(message, 'SUCCESS');
        endOperation(operationName, { 
          success: true, 
          targetFunction, 
          enable,
          method: 'menuHandler'
        });
        return true;
      } else {
        // 詳細な失敗理由を取得
        const failureReason = menuHandler.getLastFailureReason ? menuHandler.getLastFailureReason() : '不明';
        const error = `共通ハンドラーでの機能選択に失敗: ${failureReason}`;
        log(error, 'WARNING', { 
          targetFunction, 
          enable,
          failureReason,
          functionName: targetFunction // オブジェクト表示を避けるため明示的に追加
        });
        log('機能選択失敗を無視して処理を継続します', 'INFO');
        endOperation(operationName, { success: true, error, targetFunction, enable, failureReason });
        return true;
      }
    } catch (error) {
      logError(error, { 
        operation: 'selectFunction',
        functionName,
        enable
      });
      endOperation(operationName, { success: false, error: error.message });
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
    const operationName = 'selectModel';
    const startTime = startOperation(operationName, {
      identifier,
      timestamp: new Date().toISOString()
    });

    if (!identifier) {
      const error = 'モデル識別子が指定されていません';
      log(error, 'ERROR');
      endOperation(operationName, { success: false, error });
      return false;
    }

    log(`モデルを動的検索: ${identifier}`, 'SEARCH', { identifier });
    
    // AIHandlerを使用
    if (!useAIHandler || !menuHandler) {
      const error = 'AIHandlerが利用できません';
      log(error, 'ERROR');
      endOperation(operationName, { success: false, error });
      return false;
    }

    try {
      // "first"の場合は一番上のモデルを選択
      if (identifier === 'first') {
        // モデル選択ボタンを探す
        const modelButtonSelectors = window.AIHandler?.getSelectors?.('Claude', 'MODEL_BUTTON') || 
          ['[data-testid="model-selector-button"]', 'button[aria-label*="モデル"]'];
        
        const modelButton = await findElement(modelButtonSelectors);
        if (!modelButton) {
          const error = 'モデル選択ボタンが見つかりません';
          log(error, 'ERROR');
          endOperation(operationName, { success: false, error });
          return false;
        }
        
        // メニューを開く
        modelButton.click();
        await wait(500); // 500msの固定待機時間
        
        // メニュー項目を取得
        const menuItemSelectors = window.AIHandler?.getSelectors?.('Claude', 'MENU_ITEM') || 
          ['[role="option"]', '[role="menuitem"]', '[role="menuitemradio"]'];
        let menuItems = [];
        for (const selector of menuItemSelectors) {
          menuItems.push(...document.querySelectorAll(selector));
        }
        
        if (menuItems.length > 0) {
          // 一番最初のメニュー項目を選択
          const firstItem = menuItems[0];
          log(`一番上のモデルを選択: ${firstItem.textContent?.trim()}`, 'INFO');
          firstItem.click();
          await wait(500); // 500msの固定待機時間
          
          log(`一番上のモデル選択成功: ${firstItem.textContent?.trim()}`, 'SUCCESS');
          endOperation(operationName, { success: true, model: firstItem.textContent?.trim() });
          return true;
        }
        
        log('一番上のモデルが見つかりません', 'ERROR');
        endOperation(operationName, { success: false, error: '一番上のモデルが見つかりません' });
        return false;
      }
      
      // エイリアスを解決
      const targetModel = CONFIG.MODEL_ALIASES[identifier.toLowerCase()] || identifier;
      
      log('モデルエイリアス解決完了', 'DEBUG', {
        original: identifier,
        resolved: targetModel
      });

      log('共通ハンドラーでモデル選択実行', 'DEBUG', { targetModel });
      const result = await menuHandler.selectModel(targetModel);
      
      if (result) {
        const message = `共通ハンドラーでモデル「${targetModel}」を選択しました`;
        log(message, 'SUCCESS');
        endOperation(operationName, { 
          success: true, 
          targetModel,
          originalIdentifier: identifier
        });
        return true;
      } else {
        const error = '共通ハンドラーでのモデル選択に失敗';
        log(error, 'ERROR', { targetModel });
        endOperation(operationName, { success: false, error, targetModel });
        return false;
      }
    } catch (error) {
      logError(error, { 
        operation: 'selectModel',
        identifier
      });
      endOperation(operationName, { success: false, error: error.message });
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
      const menuItemSelectors = window.AIHandler?.getSelectors?.('Claude', 'MENU_ITEM') || ['[role="option"]', '[role="menuitem"]'];
      let modelOptions = [];
      for (const selector of menuItemSelectors) {
        modelOptions.push(...document.querySelectorAll(selector));
      }
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

    const submitButtonSelectors = window.AIHandler?.getSelectors?.('Claude', 'SEND_BUTTON');
    
    if (!submitButtonSelectors || submitButtonSelectors.length === 0) {
      log('送信ボタンセレクタが取得できません', 'ERROR');
      return false;
    }

    const submitButton = await findElement(submitButtonSelectors);

    if (!submitButton) {
      log('送信ボタンが見つかりません', 'ERROR');
      return false;
    }

    await performClick(submitButton);
    sendStartTime = Date.now();  // 送信時刻を記録
    log('📤 メッセージを送信しました', 'SUCCESS');
    
    // 送信時刻を記録（SpreadsheetLogger用）
    log(`🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`, 'INFO');
    if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
        try {
            log(`📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`, 'INFO');
            await window.AIHandler.recordSendTimestamp('Claude');
            log(`✅ 送信時刻記録成功`, 'SUCCESS');
        } catch (error) {
            log(`❌ 送信時刻記録エラー: ${error.message}`, 'ERROR');
            log(`エラー詳細: ${JSON.stringify({ stack: error.stack, name: error.name })}`, 'ERROR');
        }
    } else {
        log(`⚠️ 送信時刻記録スキップ - AIHandler利用不可`, 'WARNING');
    }
    
    await wait(CONFIG.DELAYS.submit);
    return true;
  }

  async function waitForResponse(maxWaitTime = 60000) {
    const operationName = 'waitForResponse';
    const startTime = startOperation(operationName, {
      maxWaitTime,
      sendStartTime: sendStartTime ? new Date(sendStartTime).toISOString() : null,
      timestamp: new Date().toISOString()
    });

    log(`応答待機開始 (最大待機時間: ${maxWaitTime/1000}秒)`, 'INFO', { maxWaitTime });

    try {
      // 共通ハンドラーを使用
      if (!useAIHandler || !window.AIHandler?.message?.waitForResponse) {
        const error = 'AIHandler.message.waitForResponseが利用できません';
        log(error, 'ERROR');
        endOperation(operationName, { success: false, error });
        return false;
      }

      const result = await window.AIHandler.message.waitForResponse(null, {
        timeout: maxWaitTime,
        sendStartTime: sendStartTime
      }, 'Claude');

      if (result) {
        log('応答待機完了', 'SUCCESS', { 
          duration: formatDuration(startTime),
          result: 'success'
        });
        endOperation(operationName, { success: true, duration: Date.now() - startTime });
        return true;
      } else {
        log('応答待機タイムアウト', 'WARNING', {
          duration: formatDuration(startTime),
          maxWaitTime
        });
        endOperation(operationName, { success: false, error: 'timeout', duration: Date.now() - startTime });
        return false;
      }
    } catch (error) {
      logError(error, { 
        operation: 'waitForResponse',
        maxWaitTime,
        sendStartTime
      });
      endOperation(operationName, { success: false, error: error.message });
      return false;
    }
  }

  // Canvas（アーティファクト）コンテンツを取得 - DeepResearch対応強化版
  async function getCanvasContent(expandIfNeeded = true) {
    log('Canvas/Artifacts取得開始', 'DEBUG', { expandIfNeeded });
    
    // ui-selectors.jsからセレクタを取得
    const canvasSelectors = window.AIHandler?.getSelectors ? 
      await window.AIHandler.getSelectors('Claude', 'CANVAS') : 
      {
        CONTAINER: [
          '.grid-cols-1.grid:has(h1)',
          '.grid-cols-1.grid',
          '[class*="grid-cols-1"][class*="grid"]',
          'div:has(> h1.text-2xl)',
          '.overflow-y-auto:has(h1)'
        ],
        PREVIEW_BUTTON: [
          'button[aria-label="内容をプレビュー"]',
          'button[aria-label*="プレビュー"]',
          'button[aria-label*="preview"]'
        ]
      };
    
    const containerSelectors = canvasSelectors.CONTAINER || [];
    let canvas = null;
    
    // 既に展開されているCanvasを探す
    for (const selector of containerSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          // h1があり、テキストが十分長い場合のみCanvasとして認識
          const h1 = element.querySelector('h1');
          const textLength = element.textContent?.length || 0;
          if (h1 && textLength > 500) {  // DeepResearchは通常長いテキスト
            canvas = element;
            log('Canvas発見（展開済み）', 'DEBUG', { 
              selector, 
              title: h1.textContent?.substring(0, 50),
              textLength 
            });
            break;
          }
        }
        if (canvas) break;
      } catch (e) {
        log(`セレクタエラー: ${selector}`, 'DEBUG', { error: e.message });
      }
    }
    
    // Canvasが見つからない場合、プレビューボタンをクリックして展開
    if (!canvas && expandIfNeeded) {
      const previewButtonSelectors = canvasSelectors.PREVIEW_BUTTON || 
        ['button[aria-label="内容をプレビュー"]'];
      
      let previewButton = null;
      for (const selector of previewButtonSelectors) {
        previewButton = document.querySelector(selector);
        if (previewButton) {
          log('プレビューボタン発見', 'DEBUG', { selector });
          break;
        }
      }
      
      if (previewButton) {
        log('Canvasを展開中...', 'INFO');
        previewButton.click();
        await wait(1500);  // 展開アニメーションを待つ
        
        // 再度Canvasを探す
        for (const selector of containerSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const h1 = element.querySelector('h1');
              const textLength = element.textContent?.length || 0;
              if (h1 && textLength > 500) {
                canvas = element;
                log('Canvas発見（展開後）', 'DEBUG', { 
                  selector,
                  title: h1.textContent?.substring(0, 50),
                  textLength 
                });
                break;
              }
            }
            if (canvas) break;
          } catch (e) {
            log(`セレクタエラー: ${selector}`, 'DEBUG', { error: e.message });
          }
        }
      }
    }
    
    // Canvas内容を解析
    if (canvas) {
      const h1 = canvas.querySelector('h1');
      const h2s = canvas.querySelectorAll('h2');
      const ps = canvas.querySelectorAll('p.whitespace-normal, p[class*="whitespace"]');
      const text = canvas.textContent?.trim();
      
      const result = {
        success: true,
        text: text,
        title: h1?.textContent?.trim(),
        sections: h2s.length,
        paragraphs: ps.length,
        isCanvas: true,
        isDeepResearch: h2s.length > 3 && text?.length > 2000  // DeepResearchの特徴
      };
      
      log('Canvas内容取得成功', 'SUCCESS', {
        title: result.title,
        sections: result.sections,
        paragraphs: result.paragraphs,
        textLength: text?.length,
        isDeepResearch: result.isDeepResearch
      });
      
      return result;
    }
    
    // プレビューテキストから取得（フォールバック）
    const previewSelectors = canvasSelectors.PREVIEW_TEXT || ['.absolute.inset-0'];
    for (const selector of previewSelectors) {
      const previewElement = document.querySelector(selector);
      if (previewElement) {
        const text = previewElement.textContent?.trim();
        if (text && text.length > 100) {
          log('プレビューテキストから取得', 'INFO', { textLength: text.length });
          return {
            success: true,
            text: text,
            isPreview: true
          };
        }
      }
    }
    
    log('Canvas/Artifacts取得失敗', 'DEBUG');
    return { success: false };
  }

  // 統合テストと同じロジックを使用したgetResponse関数（Canvas/Artifacts優先）
  async function getResponse() {
    const operationName = 'getResponse';
    const startTime = startOperation(operationName, {
      aiType: 'Claude',
      timestamp: new Date().toISOString()
    });

    log('Claude応答テキストを取得中...', 'INFO');

    try {
      // ========================================
      // 1. まずCanvas/Artifactsをチェック（DeepResearch等）
      // ========================================
      log('Canvas/Artifactsの確認を開始', 'DEBUG');
      const canvasResult = await getCanvasContent(true);  // expandIfNeeded=true
      
      if (canvasResult?.success && canvasResult?.text) {
        const responseLength = canvasResult.text.length;
        const previewText = canvasResult.text.substring(0, 100);
        
        log('Canvas/Artifactsから応答取得成功', 'SUCCESS', {
          method: 'canvas',
          isCanvas: canvasResult.isCanvas,
          isDeepResearch: canvasResult.isDeepResearch,
          isPreview: canvasResult.isPreview,
          title: canvasResult.title,
          sections: canvasResult.sections,
          paragraphs: canvasResult.paragraphs,
          responseLength,
          previewText: previewText + (responseLength > 100 ? '...' : '')
        });
        
        endOperation(operationName, { 
          success: true, 
          responseLength,
          method: 'canvas-artifacts',
          isDeepResearch: canvasResult.isDeepResearch
        });
        
        return canvasResult.text;
      }
      
      log('Canvas/Artifactsが見つからない、通常メッセージを確認', 'DEBUG');
      
      // ========================================
      // 2. 通常のClaude応答を取得（既存のロジック）
      // ========================================
      // ui-selectors.js の定義を使用してClaude応答を取得
      const responseSelectors = await window.AIHandler.getSelectors('Claude', 'RESPONSE');
      log(`ui-selectors.js から取得した応答セレクタ: ${responseSelectors.join(', ')}`, 'DEBUG');
      
      let finalMessages = null;
      let usedSelector = null;
      
      // ui-selectors.js定義の全セレクタを順番に試行
      for (const selector of responseSelectors) {
        try {
          const messages = document.querySelectorAll(selector);
          log(`セレクタ "${selector}": ${messages.length}個`, 'DEBUG');
          
          if (messages.length > 0) {
            finalMessages = messages;
            usedSelector = selector;
            log(`✅ 使用セレクタ: "${selector}" (${messages.length}個のメッセージ)`, 'DEBUG');
            break;
          }
        } catch (e) {
          log(`セレクタ "${selector}" でエラー: ${e.message}`, 'WARNING');
        }
      }
      
      if (!finalMessages || finalMessages.length === 0) {
        const error = 'ui-selectors.js の全セレクタでClaude メッセージが見つかりません';
        log(error, 'ERROR');
        log('使用可能セレクタ:', 'ERROR', { selectors: responseSelectors });
        endOperation(operationName, { success: false, error });
        return null;
      }
      
      // 最後のメッセージを取得（統合テスト同等処理）
      const lastMessage = finalMessages[finalMessages.length - 1];
      const clone = lastMessage.cloneNode(true);
      
      log(`最終的に使用: ${finalMessages.length}個のメッセージから最新を取得`, 'DEBUG');
      
      log(`最新メッセージを処理中...`, 'DEBUG');
      
      // 思考プロセス削除: ui-selectors.js のヘルパー関数を使用 
      // ※ Chrome拡張機能環境では ui-selectors.js をimportできないため、同じロジックを直接実装
      log('思考プロセス要素の削除開始...', 'DEBUG');
      
      const allButtons = clone.querySelectorAll('button');
      let removedCount = 0;
      
      // ui-selectors.js の THINKING_PROCESS 定義を動的取得
      const thinkingProcessSelectors = await window.AIHandler.getSelectors('Claude', 'THINKING_PROCESS');
      const thinkingPatterns = thinkingProcessSelectors?.TEXT_PATTERNS || ['思考プロセス', 'Analyzed', 'Pondered', 'Thought', 'Considered', 'Evaluated', 'Reviewed'];
      const parentClasses = thinkingProcessSelectors?.PARENT_CLASSES || ['rounded-lg', 'border-0.5', 'transition-all', 'my-3'];
      
      log(`ui-selectors.js から思考プロセスパターンを取得: ${thinkingPatterns.length}個`, 'DEBUG');
      
      allButtons.forEach(btn => {
        const text = btn.textContent || '';
        
        // ui-selectors.js と同じ思考プロセス判定ロジック
        const isThinkingButton = 
          thinkingPatterns.some(pattern => text.includes(pattern)) ||
          // タイマーアイコン（時計のSVG）を含むボタンも思考プロセス
          btn.querySelector('svg path[d*="M10.3857 2.50977"]') !== null ||
          // tabular-numsクラス（時間表示）を含むボタン
          btn.querySelector('.tabular-nums') !== null;
        
        if (isThinkingButton) {
          // ボタンの最も外側の親要素を探す
          let elementToRemove = btn;
          let parent = btn.parentElement;
          
          // ui-selectors.js と同じ親要素探索ロジック
          while (parent) {
            if (parent.classList && parentClasses.some(cls => parent.classList.contains(cls))) {
              elementToRemove = parent;
              parent = parent.parentElement;
            } else {
              break;
            }
          }
          
          log(`削除: 思考プロセス要素 "${text.substring(0, 30)}..."`, 'DEBUG');
          elementToRemove.remove();
          removedCount++;
        }
      });
      
      log(`削除した思考プロセス要素: ${removedCount}個`, 'DEBUG');
      
      const responseText = clone.textContent?.trim();
      
      if (responseText && responseText.length > 0) {
        const responseLength = responseText.length;
        const previewText = responseText.substring(0, 100);
        
        log(`応答取得成功: ${responseLength}文字`, 'SUCCESS', {
          responseLength,
          previewText: previewText + (responseLength > 100 ? '...' : ''),
          method: 'direct-font-claude-message',
          removedThinkingElements: removedCount
        });
        
        endOperation(operationName, { 
          success: true, 
          responseLength,
          method: 'direct-claude-extraction',
          removedThinkingElements: removedCount
        });
        
        return responseText;
      } else {
        const error = '処理後のテキストが空です';
        log(error, 'ERROR', { responseText });
        endOperation(operationName, { success: false, error, responseText });
        return null;
      }
    } catch (error) {
      logError(error, { 
        operation: 'getResponse',
        aiType: 'Claude'
      });
      endOperation(operationName, { success: false, error: error.message });
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
        const stopButtonSelectors = window.AIHandler?.getSelectors?.('Claude', 'STOP_BUTTON') || ['[aria-label="応答を停止"]'];
        let stopButton = null;
        for (const selector of stopButtonSelectors) {
          stopButton = document.querySelector(selector);
          if (stopButton) break;
        }
        if (!stopButton) {
          await wait(3000);
          let finalStopCheck = null;
          for (const selector of stopButtonSelectors) {
            finalStopCheck = document.querySelector(selector);
            if (finalStopCheck) break;
          }
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
    const operationName = 'runAutomation';
    const fullStartTime = startOperation(operationName, {
      config,
      sessionId,
      timestamp: new Date().toISOString()
    });

    log('(Claude) 自動化実行開始', 'AUTOMATION', config);
    
    // セル位置情報を含む詳細ログ
    const cellInfo = config.cellInfo || {};
    const cellPosition = cellInfo.column && cellInfo.row 
      ? `${cellInfo.column}${cellInfo.row}` 
      : (cellInfo.column === "TEST" && cellInfo.row === "検出" ? "TEST検出" : "タスク実行中");
    
    log(`📊 (Claude) Step1: スプレッドシート読み込み開始 [${cellPosition}セル]`, 'INFO', {
      cellPosition,
      column: cellInfo.column,
      row: cellInfo.row,
      step: 1,
      process: 'スプレッドシート読み込み',
      model: config.model,
      function: config.function,
      promptLength: config.text?.length
    });

    const result = {
      success: false,
      model: null,
      function: null,
      text: null,
      response: null,
      error: null,
      timings: {}
    };

    try {
      // Step 2: タスクリスト作成
      log(`📋 (Claude) Step2: タスクリスト作成開始 [${cellPosition}セル]`, 'INFO', {
        cellPosition,
        step: 2,
        process: 'タスクリスト作成',
        model: config.model,
        function: config.function
      });
      
      // モデル選択
      if (config.model) {
        const modelStepStart = Date.now();
        log(`モデル選択ステップ開始: ${config.model}`, 'DEBUG');
        
        const modelResult = await selectModel(config.model);
        result.model = modelResult ? config.model : null;
        result.timings.modelSelection = Date.now() - modelStepStart;
        
        log(`モデル選択ステップ完了: ${modelResult ? '成功' : '失敗'}`, 
            modelResult ? 'SUCCESS' : 'ERROR', {
          model: config.model,
          success: modelResult,
          duration: `${result.timings.modelSelection}ms`
        });
        
        await wait(1000);
      }

      // タスクリスト作成完了のログ
      log(`✅ (Claude) Step2: タスクリスト作成完了 [${cellPosition}セル]`, 'SUCCESS', {
        cellPosition,
        step: 2,
        process: 'タスクリスト作成完了'
      });
      
      // Step 3: AI実行開始（経過時間計測開始）
      const step3StartTime = Date.now();
      log(`🤖 (Claude) Step3: AI実行開始 [${cellPosition}セル]`, 'INFO', {
        cellPosition,
        step: 3,
        process: 'AI実行',
        model: config.model,
        function: config.function,
        startTime: step3StartTime
      });
      
      // 機能選択（空文字やnullの場合はスキップ）
      if (config.function && config.function !== 'none' && config.function !== '') {
        const functionStepStart = Date.now();
        log(`機能選択ステップ開始: ${config.function}`, 'DEBUG');
        
        const functionResult = await selectFunction(config.function);
        result.function = functionResult ? config.function : null;
        result.timings.functionSelection = Date.now() - functionStepStart;
        
        log(`機能選択ステップ完了: ${functionResult ? '成功' : '失敗'}`, 
            functionResult ? 'SUCCESS' : 'ERROR', {
          function: config.function,
          success: functionResult,
          duration: `${result.timings.functionSelection}ms`
        });
        
        await wait(1000);
      } else if (!config.function || config.function === 'none' || config.function === '') {
        // 通常処理モード（Web検索無効化処理は削除）
        log('通常処理モード: 機能設定なし', 'INFO');
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
        
        const step3Duration = Date.now() - step3StartTime;
        log(`✅ (Claude) Step3: AI実行完了（送信） [${cellPosition}セル] (${step3Duration}ms)`, 'SUCCESS', {
          cellPosition,
          step: 3,
          process: 'AI実行完了',
          promptLength: config.text?.length,
          duration: step3Duration,
          elapsedTime: `${step3Duration}ms`
        });
      }

      // Step 4: 応答停止ボタン消滅まで待機
      if (config.waitResponse) {
        const step4Duration = Date.now() - step3StartTime;
        const currentCellInfo = config.cellInfo || {};
        const currentCellPosition = currentCellInfo.column && currentCellInfo.row ? `${currentCellInfo.column}${currentCellInfo.row}` : '不明';
        log(`⏳ (Claude) Step4: 応答停止ボタン消滅まで待機 [${currentCellPosition}セル] (${step4Duration}ms経過)`, 'INFO', {
          cellPosition: currentCellPosition,
          step: 4,
          process: '応答完了待機',
          elapsedFromStep3: step4Duration,
          elapsedTime: `${step4Duration}ms`
        });
        
        const isDeepResearch = window.FeatureConstants ? 
          window.FeatureConstants.isDeepResearch(config.function) :
          (config.function === 'DeepResearch' || config.function === 'Deep Research');
        
        if (isDeepResearch) {
          log('(Claude) DeepResearch モードで待機', 'INFO');
          const waitResult = await waitForClaudeDeepResearchResponse(60);
          if (!waitResult) {
            log('(Claude) DeepResearch待機がタイムアウトしましたが、続行します', 'WARNING');
          }
        } else {
          const waitResult = await waitForResponse(config.timeout || 60000);
          if (!waitResult) {
            log('(Claude) 応答待機がタイムアウトしましたが、続行します', 'WARNING');
          }
        }
        
        const step4EndDuration = Date.now() - step3StartTime;
        const step4CellInfo = config.cellInfo || {};
        const step4CellPosition = step4CellInfo.column && step4CellInfo.row ? `${step4CellInfo.column}${step4CellInfo.row}` : '不明';
        log(`✅ (Claude) Step4: 応答完了検出 [${step4CellPosition}セル] (${step4EndDuration}ms経過)`, 'SUCCESS', {
          cellPosition: step4CellPosition,
          step: 4,
          process: '応答完了検出',
          elapsedFromStep3: step4EndDuration,
          elapsedTime: `${step4EndDuration}ms`
        });
      }

      // Step 5: 応答取得
      if (config.getResponse) {
        const step5Duration = Date.now() - step3StartTime;
        const step5CellInfo = config.cellInfo || {};
        const step5CellPosition = step5CellInfo.column && step5CellInfo.row ? `${step5CellInfo.column}${step5CellInfo.row}` : '不明';
        log(`📤 (Claude) Step5: 応答取得開始 [${step5CellPosition}セル] (${step5Duration}ms経過)`, 'INFO', {
          cellPosition: step5CellPosition,
          step: 5,
          process: '応答取得',
          elapsedFromStep3: step5Duration,
          elapsedTime: `${step5Duration}ms`
        });
        
        const response = await getResponse();
        result.response = response;
        
        if (response) {
          const step5EndDuration = Date.now() - step3StartTime;
          const responsePreview = response.substring(0, 30);
          const hasMore = response.length > 30;
          log(`✅ (Claude) Step5: 応答取得完了 [${step5CellPosition}セル] (${response.length}文字, ${step5EndDuration}ms経過)`, 'SUCCESS', {
            cellPosition: step5CellPosition,
            step: 5,
            process: '応答取得完了',
            responseLength: response.length,
            responsePreview: responsePreview + (hasMore ? '...' : ''),
            responsePreview30: responsePreview,
            hasMoreContent: hasMore,
            fullResponse: response,
            elapsedFromStep3: step5EndDuration,
            elapsedTime: `${step5EndDuration}ms`
          });
        } else {
          log(`❌ (Claude) Step5: 応答取得失敗 [${step5CellPosition}セル]`, 'ERROR', {
            cellPosition: step5CellPosition,
            step: 5,
            process: '応答取得失敗'
          });
          
          // 応答取得失敗を明示的に返す
          result.success = false;
          result.error = 'RESPONSE_FETCH_ERROR';
          result.errorMessage = 'AI応答の取得に失敗しました';
          result.needsRetry = true;
          result.errorType = 'AIResponseFetchError';
        }
      }

      result.success = true;
      log('(Claude) 自動化実行完了', 'SUCCESS');

    } catch (error) {
      result.success = false;
      result.error = error.message;
      log(`(Claude) 自動化実行エラー: ${error.message}`, 'ERROR');
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
    waitForClaudeDeepResearchResponse,  // DeepResearch専用待機関数を追加
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
    // 拡張ログシステムAPI
    logging: {
      setLevel: (level) => {
        if (Object.values(LogLevel).includes(level)) {
          logConfig.level = level;
          log(`ログレベルを変更: ${Object.keys(LogLevel).find(k => LogLevel[k] === level)}`, 'INFO');
        }
      },
      getConfig: () => ({ ...logConfig }),
      setConfig: (newConfig) => {
        logConfig = { ...logConfig, ...newConfig };
        log('ログ設定を更新', 'INFO', newConfig);
      },
      getLogs: (filter = {}) => {
        let filteredLogs = [...logStorage];
        
        if (filter.level !== undefined) {
          filteredLogs = filteredLogs.filter(entry => entry.level >= filter.level);
        }
        
        if (filter.type) {
          filteredLogs = filteredLogs.filter(entry => entry.type === filter.type);
        }
        
        if (filter.operation) {
          filteredLogs = filteredLogs.filter(entry => 
            entry.context?.operation?.includes(filter.operation)
          );
        }
        
        if (filter.since) {
          const sinceTime = typeof filter.since === 'number' ? filter.since : Date.parse(filter.since);
          filteredLogs = filteredLogs.filter(entry => entry.timestamp >= sinceTime);
        }
        
        return filteredLogs;
      },
      clearLogs: () => {
        const count = logStorage.length;
        logStorage = [];
        log(`${count}件のログをクリア`, 'INFO');
      },
      exportLogs: (format = 'json') => {
        const logs = logStorage;
        if (format === 'csv') {
          const headers = ['timestamp', 'level', 'type', 'message', 'operation'];
          const csvData = [
            headers.join(','),
            ...logs.map(entry => [
              entry.timestamp,
              entry.level,
              entry.type,
              `"${entry.message.replace(/"/g, '""')}"`,
              entry.context?.operation || ''
            ].join(','))
          ].join('\n');
          return csvData;
        }
        return JSON.stringify(logs, null, 2);
      },
      getSessionInfo: () => ({
        sessionId,
        startTime: sessionId.split('-')[0],
        currentOperations: Array.from(performanceMetrics.keys()),
        totalLogs: logStorage.length
      }),
      // タスクリスト関連のログ
      logTaskList: (tasks, action = 'update') => {
        const context = {
          action,
          taskCount: tasks.length,
          completedTasks: tasks.filter(t => t.status === 'completed').length,
          pendingTasks: tasks.filter(t => t.status === 'pending').length,
          inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
          tasks: tasks.map(t => ({
            id: t.id,
            content: t.content.substring(0, 50) + (t.content.length > 50 ? '...' : ''),
            status: t.status
          }))
        };
        log(`タスクリスト${action === 'create' ? '作成' : action === 'update' ? '更新' : action}: ${tasks.length}件`, 'AUTOMATION', context);
        
        // 個別のタスクもログに記録
        tasks.forEach(task => {
          const taskContext = {
            taskId: task.id,
            status: task.status,
            content: task.content
          };
          log(`タスク ${task.status === 'completed' ? '完了' : task.status === 'in_progress' ? '進行中' : '待機中'}: ${task.content}`, 'DEBUG', taskContext);
        });
      },
      logTaskStatusChange: (taskId, oldStatus, newStatus, content) => {
        const context = {
          taskId,
          oldStatus,
          newStatus,
          content: content.substring(0, 100) + (content.length > 100 ? '...' : '')
        };
        log(`タスクステータス変更: ${content} (${oldStatus} -> ${newStatus})`, 'AUTOMATION', context);
      }
    },
    utils: {
      wait,
      performClick,
      findElement,
      log,
      logError,
      logUserAction,
      logDOMOperation,
      logNetworkOperation,
      startOperation,
      endOperation,
      logPerformance
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
  
  // 拡張機能ログシステム統合の確認
  function setupExtensionLogIntegration() {
    // 拡張機能のログシステムを検索
    if (window.chrome && window.chrome.runtime) {
      log('Chrome拡張機能環境を検出', 'DEBUG');
    }

    // 既存のログハンドラーがあるか確認
    if (window.logToExtension) {
      log('拡張機能ログハンドラーを発見', 'DEBUG');
      // 既存のログハンドラーをラップ
      const originalLogToExtension = window.logToExtension;
      logConfig.extensionLogger = originalLogToExtension;
    }

    // カスタムログインテグレーション関数を設定
    window.setupClaudeLogIntegration = (logHandler) => {
      if (typeof logHandler === 'function') {
        logConfig.extensionLogger = logHandler;
        log('Claude専用ログハンドラーを設定', 'SUCCESS');
      }
    };
  }

  // 初期化実行
  initialize();
  setupExtensionLogIntegration();
  
  // 拡張機能ログ統合テスト
  log('Claude自動化スクリプト初期化開始', 'AUTOMATION', {
    version: '2.0',
    sessionId: sessionId,
    logSystemEnabled: true,
    extensionIntegration: !!(window.chrome && window.chrome.runtime)
  });
  
  log('Claude動的検索自動化関数が利用可能になりました', 'SUCCESS');
  
  // テスト用の詳細ログ
  log('詳細ログシステム動作確認', 'DEBUG', {
    logLevels: Object.keys(LogLevel),
    logTypes: Object.keys(logTypeConfig),
    storageEnabled: logConfig.enableStorage,
    consoleEnabled: logConfig.enableConsole
  });
  return window.ClaudeAutomation;
})();