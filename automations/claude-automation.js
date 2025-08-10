// Claude自動化関数 - 完全実装版
(() => {
  "use strict";

  // ============================================
  // 設定
  // ============================================
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
    globalState: {
      modelCache: null,
      modelCacheTime: null,
      functionCache: null,
      functionCacheTime: null,
      CACHE_DURATION: 5 * 60 * 1000,
      currentModel: null,
      activeFunctions: new Set(),
      deepResearchMode: false,
      hasAutoReplied: false,
      debugMode: false,
      sendStartTime: null,
      deepResearch: {
        maxWaitMinutes: 40,
        gracePeriodMinutes: 5,
        autoReplyKeyword: '調査して'
      }
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
    },
    TOGGLE_FUNCTIONS: ['じっくり考える', 'ウェブ検索', 'Drive検索', 'Gmail検索', 'カレンダー検索'],
    MAIN_MENU_MODELS: ['Opus 4.1', 'Sonnet 4']
  };

  // ============================================
  // ユーティリティ関数
  // ============================================
  const UTILS = {
    log: function(message, type = 'INFO') {
      const prefix = {
        'INFO': '📝',
        'SUCCESS': '✅',
        'ERROR': '❌',
        'WARNING': '⚠️',
        'DEBUG': '🔍',
        'SEARCH': '🔎'
      }[type] || '📝';
      console.log(prefix + ' [' + new Date().toLocaleTimeString() + '] ' + message);
    },
    
    debugLog: function(message) {
      if (CONFIG.globalState.debugMode) {
        UTILS.log(message, 'DEBUG');
      }
    },
    
    wait: async function(ms) {
      await new Promise(resolve => setTimeout(resolve, ms));
    },
    
    findElement: async function(selectors, condition = null, maxWait = 3000) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWait) {
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (!condition || condition(element)) {
                UTILS.debugLog('要素を発見: ' + selector);
                return element;
              }
            }
          } catch (e) {}
        }
        await UTILS.wait(CONFIG.DELAYS.elementSearch);
      }
      UTILS.debugLog('要素が見つかりませんでした');
      return null;
    },
    
    performClick: async function(element) {
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
        
        await UTILS.wait(CONFIG.DELAYS.click);
        
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
        UTILS.debugLog('クリックエラー: ' + e.message);
        return false;
      }
    },
    
    waitForMenu: async function(maxWait = 3000) {
      const menuSelectors = [
        '[role="menu"][data-state="open"]',
        '[role="menu"]',
        '.relative.w-full.will-change-transform',
        '[class*="will-change-transform"]',
        '.flex.flex-col.min-h-0.w-full',
        '.p-1\\.5.flex.flex-col',
        'div[style*="max-height"]'
      ];
      return await UTILS.findElement(menuSelectors, null, maxWait);
    }
  };

  // ============================================
  // 操作関数
  // ============================================
  const OPERATIONS = {
    // モデル切り替え
    changeModel: async function(modelName) {
      try {
        const normalizedModel = CONFIG.MODEL_ALIASES[modelName.toLowerCase()] || modelName;
        
        // キャッシュチェック
        const now = Date.now();
        if (CONFIG.globalState.modelCache === normalizedModel &&
            CONFIG.globalState.modelCacheTime &&
            (now - CONFIG.globalState.modelCacheTime) < CONFIG.globalState.CACHE_DURATION) {
          UTILS.log('モデルはキャッシュから確認済み: ' + normalizedModel, 'SUCCESS');
          return { success: true, model: normalizedModel };
        }
        
        // モデル選択ボタンを探す（優先順位付き複数検索）
        const modelButtonSelectors = [
          // 最新UI（最優先）
          'button[data-testid="model-selector-dropdown"]',
          // Claudeロゴを含むボタン
          'button:has(.claude-logo-model-selector)',
          // モデル名テキストを含むボタン
          'button:has(.font-claude-response)',
          // aria-haspopupを持つボタン
          'button[aria-haspopup="menu"]:has(svg)',
          // 旧セレクタ（後方互換性）
          'button[data-testid="model-selector"]',
          'button[class*="model-selector"]',
          // フォールバック
          'button[type="button"][aria-expanded]'
        ];
        
        let modelButton = null;
        for (const selector of modelButtonSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (element && element.offsetParent !== null) {
                const text = element.textContent || '';
                // Claudeのモデル名を含むか確認
                if (text.includes('Claude') || text.includes('Opus') || 
                    text.includes('Sonnet') || text.includes('Haiku')) {
                  modelButton = element;
                  UTILS.debugLog('モデルボタン発見: ' + selector);
                  break;
                }
              }
            }
            if (modelButton) break;
          } catch (e) {
            // セレクタエラーは無視
          }
        }
        
        if (!modelButton) {
          throw new Error('モデル選択ボタンが見つかりません');
        }
        
        // 現在のモデルを確認
        const currentModelText = modelButton.textContent;
        if (currentModelText.includes(normalizedModel)) {
          UTILS.log('既に ' + normalizedModel + ' が選択されています', 'SUCCESS');
          CONFIG.globalState.currentModel = normalizedModel;
          CONFIG.globalState.modelCache = normalizedModel;
          CONFIG.globalState.modelCacheTime = now;
          return { success: true, model: normalizedModel };
        }
        
        // モデルメニューを開く
        await UTILS.performClick(modelButton);
        await UTILS.wait(CONFIG.DELAYS.menuOpen);
        
        // メニューから目的のモデルを選択
        const modelOption = await UTILS.findElement([
          'div[role="menuitem"]',
          'button[role="menuitem"]',
          '[data-testid*="model-option"]'
        ], (el) => el.textContent && el.textContent.includes(normalizedModel));
        
        if (!modelOption) {
          throw new Error('モデル ' + normalizedModel + ' が見つかりません');
        }
        
        await UTILS.performClick(modelOption);
        await UTILS.wait(CONFIG.DELAYS.modelSwitch);
        
        CONFIG.globalState.currentModel = normalizedModel;
        CONFIG.globalState.modelCache = normalizedModel;
        CONFIG.globalState.modelCacheTime = now;
        
        UTILS.log('✅ モデルを「' + normalizedModel + '」に変更しました', 'SUCCESS');
        return { success: true, model: normalizedModel };
        
      } catch (error) {
        UTILS.log('モデル切り替えエラー: ' + error.message, 'ERROR');
        return { success: false, error: error.message };
      }
    },
    
    // 機能の有効化/無効化
    toggleFunction: async function(functionName, enable = true) {
      try {
        const normalizedFunction = CONFIG.FUNCTION_ALIASES[functionName.toLowerCase()] || functionName;
        
        // DeepResearchモードの特別処理
        if (normalizedFunction === 'リサーチ') {
          CONFIG.globalState.deepResearchMode = enable;
          UTILS.log('DeepResearchモード: ' + (enable ? '有効' : '無効'), 'SUCCESS');
        }
        
        // キャッシュチェック
        const now = Date.now();
        const isActive = CONFIG.globalState.activeFunctions.has(normalizedFunction);
        if (isActive === enable &&
            CONFIG.globalState.functionCacheTime &&
            (now - CONFIG.globalState.functionCacheTime) < CONFIG.globalState.CACHE_DURATION) {
          UTILS.log('機能 ' + normalizedFunction + ' は既に' + (enable ? '有効' : '無効') + 'です', 'SUCCESS');
          return { success: true, function: normalizedFunction, enabled: enable };
        }
        
        // 機能メニューボタンを探す（優先順位付き複数検索）
        const functionButtonSelectors = [
          // 最新UI（最優先）
          'button[aria-label*="機能"]',
          'button[data-testid="functions-button"]',
          // クラス名による検索
          'button[class*="functions"]',
          'button[class*="feature"]',
          // アイコンを含むボタン
          'button:has(svg[class*="feature"])',
          'button:has(svg[class*="function"])',
          // フォールバック
          'button[type="button"]:has(svg)'
        ];
        
        let functionButton = null;
        for (const selector of functionButtonSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (element && element.offsetParent !== null) {
                // 機能関連のテキストやアイコンを含むか確認
                const text = element.textContent || '';
                const ariaLabel = element.getAttribute('aria-label') || '';
                if (text.includes('機能') || ariaLabel.includes('機能') || 
                    text.includes('Function') || ariaLabel.includes('Function')) {
                  functionButton = element;
                  UTILS.debugLog('機能ボタン発見: ' + selector);
                  break;
                }
              }
            }
            if (functionButton) break;
          } catch (e) {
            // セレクタエラーは無視
          }
        }
        
        if (!functionButton) {
          throw new Error('機能メニューボタンが見つかりません');
        }
        
        // メニューを開く
        await UTILS.performClick(functionButton);
        await UTILS.wait(CONFIG.DELAYS.menuOpen);
        
        // 目的の機能を探す
        const functionOption = await UTILS.findElement([
          'div[role="menuitemcheckbox"]',
          'button[role="menuitemcheckbox"]',
          '[data-testid*="function-option"]'
        ], (el) => el.textContent && el.textContent.includes(normalizedFunction));
        
        if (!functionOption) {
          // メニューを閉じる
          document.body.click();
          throw new Error('機能 ' + normalizedFunction + ' が見つかりません');
        }
        
        // 現在の状態を確認
        const isChecked = functionOption.getAttribute('aria-checked') === 'true';
        
        // 必要に応じて切り替え
        if (isChecked !== enable) {
          await UTILS.performClick(functionOption);
          await UTILS.wait(500);
          
          if (enable) {
            CONFIG.globalState.activeFunctions.add(normalizedFunction);
            UTILS.log('✅ 機能を「' + normalizedFunction + '」に変更しました', 'SUCCESS');
          } else {
            CONFIG.globalState.activeFunctions.delete(normalizedFunction);
            UTILS.log('✅ 機能「' + normalizedFunction + '」を無効化しました', 'SUCCESS');
          }
        }
        
        // メニューを閉じる
        document.body.click();
        await UTILS.wait(CONFIG.DELAYS.menuClose);
        
        CONFIG.globalState.functionCacheTime = now;
        UTILS.log('機能 ' + normalizedFunction + ' を' + (enable ? '有効' : '無効') + 'にしました', 'SUCCESS');
        return { success: true, function: normalizedFunction, enabled: enable };
        
      } catch (error) {
        UTILS.log('機能切り替えエラー: ' + error.message, 'ERROR');
        return { success: false, error: error.message };
      }
    },
    
    // テキスト入力
    inputText: async function(text) {
      try {
        if (!text) {
          throw new Error('入力するテキストがありません');
        }
        
        UTILS.log('テキスト入力を開始: ' + text.substring(0, 50) + '...', 'INFO');
        
        // 優先順位付きセレクタで検索
        const selectors = [
          '.ProseMirror[contenteditable="true"]',           // 最新UI
          'div[contenteditable="true"][role="textbox"]',    // 現在のHTML構造  
          '[aria-label*="プロンプト"]',                       // 日本語UI対応
          'div[contenteditable="true"]',                    // 汎用
          'textarea[placeholder*="メッセージ"]',             // フォールバック
          '[data-testid="message-input"]'                   // 旧セレクタ
        ];
        
        let inputField = null;
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (element && element.offsetParent !== null) {
                inputField = element;
                UTILS.debugLog('入力欄発見: ' + selector);
                break;
              }
            }
            if (inputField) break;
          } catch (e) {
            // セレクタエラーは無視
          }
        }
        
        if (!inputField) {
          throw new Error('入力フィールドが見つかりません');
        }
        
        // フォーカス
        inputField.focus();
        await UTILS.wait(200);
        
        // テキストを設定
        if (inputField.tagName === 'TEXTAREA') {
          inputField.value = text;
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
          inputField.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          inputField.textContent = text;
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
          
          // ProseMirrorの場合の追加処理
          if (inputField.classList.contains('ProseMirror')) {
            inputField.innerHTML = '<p>' + text + '</p>';
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        
        await UTILS.wait(500);
        UTILS.log('テキストを入力しました: ' + text.length + '文字', 'SUCCESS');
        return { success: true };
        
      } catch (error) {
        UTILS.log('テキスト入力エラー: ' + error.message, 'ERROR');
        return { success: false, error: error.message };
      }
    },
    
    // 送信
    sendMessage: async function() {
      try {
        // 優先順位付きセレクタで送信ボタンを検索
        const sendButtonSelectors = [
          // 最新UI（最優先）
          'button[aria-label="メッセージを送信"]',
          // 英語版
          'button[aria-label="Send Message"]',
          'button[aria-label="Send message"]',
          // data-testid
          'button[data-testid="send-button"]',
          'button[data-testid="composer-send-button"]',
          // 送信アイコン（上矢印）を含むボタン
          'button:has(svg path[d*="M208.49,120.49"])',
          // アクセントカラーのボタン
          'button.bg-accent-main-000',
          // submitボタン
          'button[type="submit"]',
          'button[type="button"]:has(svg)'
        ];
        
        let sendButton = null;
        for (const selector of sendButtonSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              if (element && element.offsetParent !== null && !element.disabled) {
                // サイズが適切か確認（小さすぎるボタンを除外）
                const rect = element.getBoundingClientRect();
                if (rect.width >= 20 && rect.height >= 20) {
                  sendButton = element;
                  UTILS.debugLog('送信ボタン発見: ' + selector);
                  break;
                }
              }
            }
            if (sendButton) break;
          } catch (e) {
            // セレクタエラーは無視
          }
        }
        
        if (!sendButton) {
          throw new Error('送信ボタンが見つかりません');
        }
        
        await UTILS.performClick(sendButton);
        await UTILS.wait(CONFIG.DELAYS.submit);
        
        CONFIG.globalState.hasAutoReplied = false;
        CONFIG.globalState.sendStartTime = Date.now();  // 送信時刻を記録
        UTILS.log('📤 メッセージを送信しました', 'SUCCESS');
        return { success: true };
        
      } catch (error) {
        UTILS.log('送信エラー: ' + error.message, 'ERROR');
        return { success: false, error: error.message };
      }
    },
    
    // 応答待機
    waitForResponse: async function(maxWaitMinutes = 5) {
      try {
        const maxWaitMs = maxWaitMinutes * 60 * 1000;
        const startTime = Date.now();
        let lastMinuteLogged = 0;
        
        // DeepResearchモードの場合は待機時間を延長
        const actualMaxWait = CONFIG.globalState.deepResearchMode ? 
          CONFIG.globalState.deepResearch.maxWaitMinutes * 60 * 1000 : maxWaitMs;
        
        UTILS.log('応答を待機中... (最大' + (actualMaxWait / 60000) + '分)', 'INFO');
        
        while (Date.now() - startTime < actualMaxWait) {
          const elapsedMs = Date.now() - startTime;
          const elapsedMinutes = Math.floor(elapsedMs / 60000);
          
          // 1分ごとにログを出力
          if (elapsedMinutes > lastMinuteLogged) {
            lastMinuteLogged = elapsedMinutes;
            UTILS.log('応答待機中... (' + elapsedMinutes + '分経過)', 'INFO');
          }
          
          // 停止ボタンの存在確認（生成中の判定）
          const stopButton = document.querySelector('button[aria-label="応答を停止"]');
          
          // 送信ボタンの存在確認（完了の判定）
          const sendButton = document.querySelector('button[aria-label="メッセージを送信"]');
          
          if (stopButton && stopButton.offsetParent !== null) {
            // 停止ボタンが表示されている = まだ生成中
            if (elapsedMs % 10000 < 1000) {
              UTILS.debugLog('停止ボタン確認 - 生成継続中');
            }
          } else if (!stopButton && sendButton && sendButton.offsetParent !== null) {
            // 停止ボタンがなく、送信ボタンが存在する = 生成完了
            // Claudeの仕様：送信ボタンは応答完了後もdisabledのまま（入力欄が空の場合）
            
            // 経過時間を計算
            if (CONFIG.globalState.sendStartTime) {
              const elapsedTotal = Date.now() - CONFIG.globalState.sendStartTime;
              const minutes = Math.floor(elapsedTotal / 60000);
              const seconds = Math.floor((elapsedTotal % 60000) / 1000);
              UTILS.log('✅ 応答完了（送信から ' + minutes + '分' + seconds + '秒経過）', 'SUCCESS');
            } else {
              UTILS.log('✅ 応答完了', 'SUCCESS');
            }
            return { success: true };
          }
          
          // ローディングインジケータも確認（補助的な判定）
          const loadingIndicator = document.querySelector('[data-testid="loading-indicator"]');
          if (!loadingIndicator && !stopButton) {
            // ローディングも停止ボタンもない場合
            await UTILS.wait(2000); // 念のため2秒待機
            
            // 再度送信ボタンを確認
            const sendButtonRecheck = document.querySelector('button[aria-label="メッセージを送信"]');
            if (sendButtonRecheck && !sendButtonRecheck.disabled && sendButtonRecheck.offsetParent !== null) {
              UTILS.log('応答完了を確認（再チェック）', 'SUCCESS');
              return { success: true };
            }
          }
          
          await UTILS.wait(CONFIG.DELAYS.responseCheck);
        }
        
        throw new Error('応答待機タイムアウト (' + (actualMaxWait / 60000) + '分経過)');
        
      } catch (error) {
        UTILS.log('応答待機エラー: ' + error.message, 'ERROR');
        return { success: false, error: error.message };
      }
    },
    
    // 応答テキスト取得
    getResponse: async function() {
      try {
        let responseText = '';
        
        // Canvas/アーティファクトの確認
        const artifactContainer = await UTILS.findElement([
          '[data-testid="artifact-container"]',
          '[class*="artifact"]',
          'div[class*="canvas"]'
        ], null, 1000);
        
        if (artifactContainer) {
          // Canvas内のコンテンツを取得
          const codeBlocks = artifactContainer.querySelectorAll('pre, code');
          if (codeBlocks.length > 0) {
            responseText = Array.from(codeBlocks)
              .map(block => block.textContent)
              .join('\n\n');
            UTILS.log('Canvasからコンテンツを取得しました', 'SUCCESS');
          }
        }
        
        // 通常の応答を取得（Claude専用セレクタ）
        if (!responseText) {
          // Claudeの最後のメッセージを取得
          const claudeMessages = document.querySelectorAll('.font-claude-message');
          if (claudeMessages.length > 0) {
            const lastMessage = claudeMessages[claudeMessages.length - 1];
            
            // メッセージをクローンして思考プロセスを除外
            const messageClone = lastMessage.cloneNode(true);
            
            // 思考プロセスボタンを含む要素を削除
            const allButtons = messageClone.querySelectorAll('button');
            let removedCount = 0;
            
            allButtons.forEach(btn => {
              const text = btn.textContent || '';
              
              // 思考プロセスを示すテキストパターン
              const isThinkingButton = 
                text.includes('思考プロセス') ||
                text.includes('Analyzed') ||
                text.includes('Pondered') ||
                text.includes('Thought') ||
                text.includes('Considered') ||
                text.includes('Evaluated') ||
                text.includes('Reviewed') ||
                // タイマーアイコン（時計のSVG）を含むボタンも思考プロセス
                btn.querySelector('svg path[d*="M10.3857 2.50977"]') !== null ||
                // tabular-numsクラス（時間表示）を含むボタン
                btn.querySelector('.tabular-nums') !== null;
              
              if (isThinkingButton) {
                // ボタンの最も外側の親要素を探す
                let elementToRemove = btn;
                let parent = btn.parentElement;
                
                // rounded-lg, border-0.5, transition-all等のクラスを持つ親要素まで遡る
                while (parent) {
                  if (parent.classList && (
                    parent.classList.contains('rounded-lg') ||
                    parent.classList.contains('border-0.5') ||
                    parent.classList.contains('transition-all') ||
                    parent.classList.contains('my-3')
                  )) {
                    elementToRemove = parent;
                    parent = parent.parentElement;
                  } else {
                    break;
                  }
                }
                
                UTILS.debugLog('思考プロセス要素を削除: ' + text.substring(0, 50));
                elementToRemove.remove();
                removedCount++;
              }
            });
            
            if (removedCount > 0) {
              UTILS.debugLog('削除した思考プロセス要素数: ' + removedCount);
            }
            
            responseText = messageClone.textContent?.trim();
            if (responseText) {
              UTILS.log('Claude応答を取得しました（思考プロセス除外）', 'SUCCESS');
            }
          }
        }
        
        if (!responseText) {
          throw new Error('応答テキストが見つかりません');
        }
        
        return { success: true, text: responseText.trim() };
        
      } catch (error) {
        UTILS.log('応答取得エラー: ' + error.message, 'ERROR');
        return { success: false, error: error.message };
      }
    }
  };

  // ============================================
  // 統合処理関数
  // ============================================
  async function processSpreadsheetData(model, functions, text, options = {}) {
    const result = {
      success: false,
      model: null,
      functions: [],
      responseText: null,
      errors: [],
      executionTime: 0
    };
    
    const startTime = Date.now();
    
    try {
      // オプション設定
      const {
        maxRetries = 3,
        waitForResponse = true,
        responseWaitMinutes = 5,
        disableAllFunctionsFirst = false
      } = options;
      
      UTILS.log('=== スプレッドシート統合処理開始 ===', 'INFO');
      
      // 1. モデルの切り替え
      UTILS.log('ステップ1: モデル切り替え', 'INFO');
      let modelResult = null;
      for (let retry = 0; retry < maxRetries; retry++) {
        modelResult = await OPERATIONS.changeModel(model);
        if (modelResult.success) {
          result.model = modelResult.model;
          break;
        }
        if (retry < maxRetries - 1) {
          UTILS.log('リトライ中... (' + (retry + 1) + '/' + maxRetries + ')', 'WARNING');
          await UTILS.wait(2000);
        }
      }
      
      if (!modelResult || !modelResult.success) {
        result.errors.push('モデル切り替え失敗: ' + (modelResult ? modelResult.error : '不明なエラー'));
        throw new Error('モデル切り替えに失敗しました');
      }
      
      // 2. 全機能を一旦無効化（オプション）
      if (disableAllFunctionsFirst) {
        UTILS.log('全機能を無効化中...', 'INFO');
        const allFunctions = Object.values(CONFIG.FUNCTION_ALIASES);
        const uniqueFunctions = [...new Set(allFunctions)];
        
        for (const func of uniqueFunctions) {
          if (CONFIG.TOGGLE_FUNCTIONS.includes(func)) {
            await OPERATIONS.toggleFunction(func, false);
            await UTILS.wait(500);
          }
        }
      }
      
      // 3. 機能の有効化
      if (functions && functions.length > 0) {
        UTILS.log('ステップ2: 機能の有効化', 'INFO');
        for (const func of functions) {
          const funcResult = await OPERATIONS.toggleFunction(func, true);
          if (funcResult.success) {
            result.functions.push(funcResult.function);
          } else {
            result.errors.push('機能有効化失敗 (' + func + '): ' + funcResult.error);
          }
          await UTILS.wait(500); // 各機能切り替え間に待機
        }
      }
      
      // 4. テキスト入力
      UTILS.log('ステップ3: テキスト入力', 'INFO');
      const inputResult = await OPERATIONS.inputText(text);
      if (!inputResult.success) {
        result.errors.push('テキスト入力失敗: ' + inputResult.error);
        throw new Error('テキスト入力に失敗しました');
      }
      
      // 5. 送信
      UTILS.log('ステップ4: メッセージ送信', 'INFO');
      const sendResult = await OPERATIONS.sendMessage();
      if (!sendResult.success) {
        result.errors.push('送信失敗: ' + sendResult.error);
        throw new Error('送信に失敗しました');
      }
      
      // 6. 応答待機（オプション）
      if (waitForResponse) {
        UTILS.log('ステップ5: 応答待機', 'INFO');
        const waitResult = await OPERATIONS.waitForResponse(responseWaitMinutes);
        if (!waitResult.success) {
          result.errors.push('応答待機タイムアウト: ' + waitResult.error);
        } else {
          // 7. 応答取得
          UTILS.log('ステップ6: 応答取得', 'INFO');
          const responseResult = await OPERATIONS.getResponse();
          if (responseResult.success) {
            result.responseText = responseResult.text;
          } else {
            result.errors.push('応答取得失敗: ' + responseResult.error);
          }
        }
      }
      
      result.success = result.errors.length === 0;
      result.executionTime = Date.now() - startTime;
      
      UTILS.log('=== 処理完了 (実行時間: ' + (result.executionTime / 1000) + '秒) ===', 
                 result.success ? 'SUCCESS' : 'WARNING');
      
    } catch (error) {
      result.errors.push('予期しないエラー: ' + error.message);
      result.executionTime = Date.now() - startTime;
      UTILS.log('=== 処理失敗 ===', 'ERROR');
    }
    
    return result;
  }

  // ============================================
  // 統合実行関数（他のAIと同じ形式）
  // ============================================
  async function runAutomation(config) {
    UTILS.log('自動化実行開始', 'INFO');
    console.log('[Claude] 受信した設定:', config);
    
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
        const modelResult = await OPERATIONS.changeModel(config.model);
        result.model = modelResult.success ? config.model : null;
        if (!modelResult.success) {
          throw new Error('モデル選択失敗: ' + modelResult.error);
        }
      }
      
      // 機能選択
      if (config.function && config.function !== 'none') {
        const functionResult = await OPERATIONS.toggleFunction(config.function, true);
        result.function = functionResult.success ? config.function : null;
        if (!functionResult.success) {
          UTILS.log('機能選択失敗（続行）: ' + functionResult.error, 'WARNING');
        }
      }
      
      // テキスト入力
      if (config.text) {
        const inputResult = await OPERATIONS.inputText(config.text);
        if (!inputResult.success) {
          throw new Error('テキスト入力失敗: ' + inputResult.error);
        }
        result.text = config.text;
      }
      
      // 送信
      if (config.send) {
        const sendResult = await OPERATIONS.sendMessage();
        if (!sendResult.success) {
          throw new Error('送信失敗: ' + sendResult.error);
        }
      }
      
      // 応答待機
      if (config.waitResponse) {
        const waitTimeMinutes = config.timeout ? Math.ceil(config.timeout / 60000) : 5;
        const waitResult = await OPERATIONS.waitForResponse(waitTimeMinutes);
        if (!waitResult.success) {
          UTILS.log('応答待機タイムアウト（続行）', 'WARNING');
        }
      }
      
      // 応答取得
      if (config.getResponse) {
        const responseResult = await OPERATIONS.getResponse();
        if (responseResult.success) {
          result.response = responseResult.text;
        }
      }
      
      result.success = true;
      UTILS.log('自動化実行完了', 'SUCCESS');
      
    } catch (error) {
      result.success = false;
      result.error = error.message;
      UTILS.log('自動化実行エラー: ' + error.message, 'ERROR');
    }
    
    return result;
  }
  
  // ============================================
  // グローバル公開
  // ============================================
  window.ClaudeAutomation = {
    // 個別操作関数
    selectModel: OPERATIONS.changeModel,
    selectFunction: OPERATIONS.toggleFunction,
    inputText: OPERATIONS.inputText,
    sendMessage: OPERATIONS.sendMessage,
    waitForResponse: OPERATIONS.waitForResponse,
    getResponse: OPERATIONS.getResponse,
    
    // 統合処理関数（互換性のため両方を公開）
    runAutomation: runAutomation,        // 他のAIと同じ形式
    processSpreadsheetData: processSpreadsheetData,  // 従来の形式
    
    // 設定アクセス
    setDebugMode: (enabled) => {
      CONFIG.globalState.debugMode = enabled;
      UTILS.log('デバッグモード: ' + (enabled ? 'ON' : 'OFF'), 'INFO');
    },
    
    getConfig: () => CONFIG,
    getState: () => CONFIG.globalState,
    
    // ユーティリティ
    utils: UTILS
  };

  // エイリアス
  window.Claude = window.ClaudeAutomation;
  window.C = window.ClaudeAutomation;

  console.log("✅ Claude自動化関数が利用可能になりました");
  console.log("使用例: ClaudeAutomation.runAutomation('opus 4.1', ['じっくり考える'], 'こんにちは')");
})();