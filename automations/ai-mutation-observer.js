/**
 * @fileoverview AI統合MutationObserver監視システム
 * 
 * 【役割】
 * 全AI（Claude、ChatGPT、Gemini）のDOM変更をリアルタイム監視
 * テキスト入力 → 送信 → 停止ボタン消滅 → AI応答取得の完全フロー監視
 * 
 * 【主要機能】
 * - MutationObserverによるリアルタイム要素変更検出
 * - 各AIプラットフォーム対応の統一監視システム
 * - 詳細ログ記録とレポート機能
 * - ui-selectors.jsとの完全連携
 * 
 * 【使用方法】
 * const observer = new AIMutationObserver();
 * observer.startFullFlowMonitoring();
 */

(() => {
  "use strict";

  /**
   * AI統合MutationObserver監視システムクラス
   */
  class AIMutationObserver {
    constructor() {
      this.aiType = this.detectAI();
      this.observers = new Map();
      this.logs = [];
      this.isMonitoring = false;
      
      // 監視状態
      this.state = {
        inputDetected: false,
        inputContent: '',
        sendDetected: false,
        stopButtonPresent: false,
        responseComplete: false,
        finalResponse: ''
      };

      // 連続実行制御
      this.consecutiveExecutionInProgress = false;
      this.isDeepResearchMode = false;

      // タイムスタンプ記録
      this.timestamps = {
        monitoringStart: null,
        inputDetected: null,
        sendDetected: null,
        responseStart: null,
        responseComplete: null
      };

      this.log(`AI統合MutationObserver初期化完了 - 検出AI: ${this.aiType}`, 'INFO');
    }

    /**
     * AIタイプを自動検出
     */
    detectAI() {
      const hostname = window.location.hostname;
      if (hostname.includes('claude.ai')) return 'Claude';
      if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'ChatGPT';
      if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) return 'Gemini';
      return 'Unknown';
    }

    /**
     * UI_SELECTORSから対応するセレクタを取得
     */
    getSelectors(selectorType) {
      if (window.AIHandler && window.AIHandler.getSelectors) {
        return window.AIHandler.getSelectors(this.aiType, selectorType);
      }
      
      // フォールバック
      const fallbackSelectors = {
        'Claude': {
          'INPUT': ['.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]'],
          'SEND_BUTTON': ['button[aria-label="メッセージを送信"]', 'button[type="submit"]'],
          'STOP_BUTTON': ['button[aria-label="応答を停止"]', '[aria-label="応答を停止"]'],
          'RESPONSE': ['.grid-cols-1.grid', 'div[class*="grid-cols-1"][class*="grid"]']
        },
        'ChatGPT': {
          'INPUT': ['#prompt-textarea', '[contenteditable="true"]', '.ProseMirror'],
          'SEND_BUTTON': ['[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
          'STOP_BUTTON': ['[data-testid="stop-button"]', '[aria-label="ストリーミングの停止"]'],
          'RESPONSE': ['[data-message-author-role="assistant"]:last-child .markdown', '[data-message-author-role="assistant"]:last-child']
        },
        'Gemini': {
          'INPUT': ['.ql-editor[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]'],
          'SEND_BUTTON': ['button[aria-label="送信"]', 'button[mattooltip="送信"]'],
          'STOP_BUTTON': ['button[aria-label="回答を停止"]', '.blue-circle.stop-icon'],
          'RESPONSE': ['.conversation-turn.model-turn', '.model-response-text']
        }
      };
      
      return (fallbackSelectors[this.aiType] && fallbackSelectors[this.aiType][selectorType]) || [];
    }

    /**
     * ログ記録
     */
    log(message, type = 'INFO') {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        type,
        message,
        aiType: this.aiType
      };
      
      this.logs.push(logEntry);
      console.log(`🔍 [AIMutationObserver:${this.aiType}:${type}] ${message}`);
      
      // ログが多すぎる場合は古いログを削除（最新1000件を保持）
      if (this.logs.length > 1000) {
        this.logs = this.logs.slice(-1000);
      }
    }

    /**
     * 要素を検索
     */
    findElement(selectors) {
      if (!Array.isArray(selectors)) return null;
      
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          if (element && element.offsetParent !== null) {
            return element;
          }
        } catch (e) {
          // セレクタエラーは無視
        }
      }
      return null;
    }

    /**
     * 包括的セレクタ情報を取得（18種類の属性対応）
     */
    extractComprehensiveSelectors(element, selectorType) {
      if (!element) return null;

      const selectors = {
        type: selectorType,
        element: element.tagName.toLowerCase(),
        attributes: {},
        hierarchy: [],
        computed: {},
        timestamp: new Date().toISOString()
      };

      // 1. data-testid - 最も信頼性が高い
      if (element.getAttribute('data-testid')) {
        selectors.attributes['data-testid'] = element.getAttribute('data-testid');
      }

      // 2. id - 固有性が高い
      if (element.id) {
        selectors.attributes.id = element.id;
      }

      // 3. name - フォーム要素で重要
      if (element.name) {
        selectors.attributes.name = element.name;
      }

      // 4. カスタムdata属性
      Array.from(element.attributes).forEach(attr => {
        if (attr.name.startsWith('data-') && attr.name !== 'data-testid') {
          selectors.attributes[attr.name] = attr.value;
        }
      });

      // 5. role
      if (element.getAttribute('role')) {
        selectors.attributes.role = element.getAttribute('role');
      }

      // 6. type - input要素の種類
      if (element.type) {
        selectors.attributes.type = element.type;
      }

      // 7. ARIA属性
      Array.from(element.attributes).forEach(attr => {
        if (attr.name.startsWith('aria-')) {
          selectors.attributes[attr.name] = attr.value;
        }
      });

      // 8. value - 特定の値を持つ要素
      if (element.value !== undefined && element.value !== '') {
        selectors.attributes.value = element.value;
      }

      // 9. placeholder - 入力欄のヒント
      if (element.placeholder) {
        selectors.attributes.placeholder = element.placeholder;
      }

      // 10. title - ツールチップテキスト
      if (element.title) {
        selectors.attributes.title = element.title;
      }

      // 11. href - リンクのURL
      if (element.href) {
        selectors.attributes.href = element.href;
      }

      // 12. src/alt - 画像から特定
      if (element.src) {
        selectors.attributes.src = element.src;
      }
      if (element.alt) {
        selectors.attributes.alt = element.alt;
      }

      // 13. class - 変更されやすいが一般的
      if (element.className) {
        selectors.attributes.class = element.className;
      }

      // 14. 構造的位置関係（親子、兄弟要素）
      if (element.parentElement) {
        selectors.hierarchy.push({
          relation: 'parent',
          element: element.parentElement.tagName.toLowerCase(),
          class: element.parentElement.className || '',
          id: element.parentElement.id || ''
        });
      }

      const siblings = Array.from(element.parentElement?.children || []);
      const siblingIndex = siblings.indexOf(element);
      if (siblingIndex >= 0) {
        selectors.hierarchy.push({
          relation: 'position',
          index: siblingIndex,
          totalSiblings: siblings.length
        });
      }

      // 15. CSS疑似セレクター状態
      selectors.computed.enabled = !element.disabled;
      selectors.computed.checked = element.checked || false;
      selectors.computed.selected = element.selected || false;
      selectors.computed.visible = element.offsetParent !== null;

      // 16. 属性存在確認
      const booleanAttributes = ['disabled', 'selected', 'checked', 'readonly', 'required'];
      booleanAttributes.forEach(attr => {
        if (element.hasAttribute(attr)) {
          selectors.attributes[attr] = element.getAttribute(attr) || 'true';
        }
      });

      // 17. 複合属性組み合わせ
      selectors.combinations = [];
      if (selectors.attributes['data-testid'] && selectors.attributes.role) {
        selectors.combinations.push(`[data-testid="${selectors.attributes['data-testid']}"][role="${selectors.attributes.role}"]`);
      }
      if (selectors.attributes.id && selectors.attributes.class) {
        selectors.combinations.push(`#${selectors.attributes.id}.${selectors.attributes.class.split(' ')[0]}`);
      }

      // 18. テキスト内容 - 最後の手段
      const textContent = element.textContent?.trim();
      if (textContent && textContent.length < 100) {
        selectors.attributes.textContent = textContent;
      }

      return selectors;
    }

    /**
     * DeepResearch機能検出
     */
    detectDeepResearchCapability() {
      const deepResearchIndicators = {
        Claude: [
          'button[aria-label*="research"]',
          'button[data-testid*="research"]', 
          '[data-component*="research"]',
          '.research-button'
        ],
        ChatGPT: [
          'button[aria-label*="search"]',
          '[data-testid*="search-web"]',
          '.web-search-button'
        ],
        Gemini: [
          'button[aria-label*="search"]',
          '[data-feature*="search"]',
          '.search-web-toggle'
        ]
      };

      const indicators = deepResearchIndicators[this.aiType] || [];
      const availableFeatures = [];

      indicators.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const selectorInfo = this.extractComprehensiveSelectors(element, 'DEEP_RESEARCH');
            if (selectorInfo) {
              availableFeatures.push(selectorInfo);
            }
          });
        } catch (e) {
          // セレクタエラーは無視
        }
      });

      return availableFeatures;
    }

    /**
     * 全セレクタ情報を収集
     */
    collectAllSelectors() {
      const allSelectors = {
        aiType: this.aiType,
        timestamp: new Date().toISOString(),
        selectors: {}
      };

      const selectorTypes = ['INPUT', 'SEND_BUTTON', 'STOP_BUTTON', 'RESPONSE'];
      
      selectorTypes.forEach(type => {
        const selectors = this.getSelectors(type);
        const foundElements = [];

        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              const selectorInfo = this.extractComprehensiveSelectors(element, type);
              if (selectorInfo) {
                foundElements.push(selectorInfo);
              }
            });
          } catch (e) {
            // セレクタエラーは無視
          }
        });

        allSelectors.selectors[type] = foundElements;
      });

      // DeepResearch機能も追加
      allSelectors.selectors.DEEP_RESEARCH = this.detectDeepResearchCapability();

      return allSelectors;
    }

    /**
     * セレクタ情報をUI Controllerに送信
     */
    sendSelectorDataToUI() {
      try {
        const selectorData = this.collectAllSelectors();
        const formattedData = {
          [this.aiType.toLowerCase()]: {
            totalSelectors: this.getTotalSelectorCount(selectorData),
            inputElements: this.getElementCount(selectorData, 'INPUT'),
            buttonElements: this.getElementCount(selectorData, 'SEND_BUTTON') + this.getElementCount(selectorData, 'STOP_BUTTON'),
            selectors: this.formatSelectorsForUI(selectorData),
            deepResearch: selectorData.selectors.DEEP_RESEARCH || { available: false },
            timestamp: new Date().toISOString()
          }
        };

        // UI Controllerに送信（chrome.runtime.sendMessageまたはpostMessage）
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'selector-data',
            data: formattedData
          });
        }
        
        this.log(`🎯 セレクタ情報をUIに送信: ${JSON.stringify(formattedData).length}バイト`, 'INFO');
      } catch (error) {
        this.log(`セレクタ情報送信エラー: ${error.message}`, 'ERROR');
      }
    }

    /**
     * セレクタ数を計算
     */
    getTotalSelectorCount(selectorData) {
      let total = 0;
      Object.values(selectorData.selectors).forEach(selectorArray => {
        if (Array.isArray(selectorArray)) {
          total += selectorArray.length;
        }
      });
      return total;
    }

    /**
     * 特定タイプの要素数を計算
     */
    getElementCount(selectorData, type) {
      const selectors = selectorData.selectors[type];
      return Array.isArray(selectors) ? selectors.length : 0;
    }

    /**
     * UI表示用にセレクタをフォーマット
     */
    formatSelectorsForUI(selectorData) {
      const formatted = [];
      
      Object.entries(selectorData.selectors).forEach(([type, selectors]) => {
        if (Array.isArray(selectors)) {
          selectors.forEach(selector => {
            formatted.push({
              type: type,
              element: selector.element || 'unknown',
              selector: this.generateSelectorString(selector),
              attributes: Object.keys(selector.attributes || {}).length
            });
          });
        }
      });
      
      return formatted.slice(0, 20); // 上位20個まで
    }

    /**
     * セレクタ文字列を生成
     */
    generateSelectorString(selectorInfo) {
      if (!selectorInfo.attributes) return selectorInfo.element || '';
      
      const attrs = selectorInfo.attributes;
      if (attrs['data-testid']) return `[data-testid="${attrs['data-testid']}"]`;
      if (attrs.id) return `#${attrs.id}`;
      if (attrs.name) return `[name="${attrs.name}"]`;
      if (attrs.class) return `.${attrs.class.split(' ')[0]}`;
      
      return selectorInfo.element || 'unknown';
    }

    /**
     * 完全フロー自動実行開始
     */
    async startFullFlowMonitoring() {
      if (this.isMonitoring) {
        this.log('既に実行中です', 'WARNING');
        return false;
      }

      this.isMonitoring = true;
      this.timestamps.monitoringStart = Date.now();
      
      this.log('=== 完全自動実行フロー開始 ===', 'INFO');
      this.log(`対象AI: ${this.aiType}`, 'INFO');

      // 自動実行フローを開始
      await this.executeAutomatedFlow();
      
      return true;
    }

    /**
     * 自動実行フロー
     */
    async executeAutomatedFlow() {
      try {
        this.log('🚀 自動実行フロー開始', 'INFO');
        
        // 1. テキスト入力欄を探してセレクタ取得
        this.log('📝 ステップ1: テキスト入力欄を探す', 'INFO');
        const inputSelectors = await this.findAndCollectSelectors('INPUT');
        if (inputSelectors.length === 0) {
          this.log('❌ テキスト入力欄が見つかりません', 'ERROR');
          return;
        }
        this.log(`✅ ${inputSelectors.length}個の入力欄セレクタを取得`, 'SUCCESS');
        
        // 2. テキストを自動入力
        await this.delay(1000);
        this.log('✍️ ステップ2: テキストを自動入力', 'INFO');
        await this.autoFillPrompt("桃太郎の歴史を解説して");
        
        // 3. 送信ボタンを探してセレクタ取得
        await this.delay(1000);
        this.log('🔍 ステップ3: 送信ボタンを探す', 'INFO');
        const sendSelectors = await this.findAndCollectSelectors('SEND_BUTTON');
        if (sendSelectors.length === 0) {
          this.log('❌ 送信ボタンが見つかりません', 'ERROR');
          return;
        }
        this.log(`✅ ${sendSelectors.length}個の送信ボタンセレクタを取得`, 'SUCCESS');
        
        // 4. 送信ボタンをクリック
        await this.delay(500);
        this.log('📤 ステップ4: 送信ボタンをクリック', 'INFO');
        await this.clickSendButton();
        
        // 5. 停止ボタンを探してセレクタ取得
        await this.delay(2000);
        this.log('⏸️ ステップ5: 停止ボタンを探す', 'INFO');
        const stopSelectors = await this.findAndCollectSelectors('STOP_BUTTON');
        this.log(`✅ ${stopSelectors.length}個の停止ボタンセレクタを取得`, 'SUCCESS');
        
        // 6. 停止ボタンが消えるまで待機
        this.log('⏳ ステップ6: 応答完了を待機', 'INFO');
        await this.waitForResponseComplete();
        
        // 7. 回答を取得してセレクタ収集
        await this.delay(1000);
        this.log('📄 ステップ7: 回答とセレクタを取得', 'INFO');
        const responseSelectors = await this.findAndCollectSelectors('RESPONSE');
        const response = await this.extractResponse();
        if (response) {
          this.log(`✅ 回答取得完了: ${response.length}文字`, 'SUCCESS');
          this.log(`✅ ${responseSelectors.length}個の回答欄セレクタを取得`, 'SUCCESS');
        }
        
        // セレクタ情報をUIに送信
        this.sendSelectorDataToUI();
        
        // 8. 通常処理完了
        this.log('✅ 通常処理フロー完了', 'SUCCESS');
        
        // 9. ウィンドウを閉じる（通常処理の場合のみ）
        if (!this.isDeepResearchMode) {
          this.log('🔄 ステップ8: ウィンドウを閉じる', 'INFO');
          await this.delay(2000);
          
          // ウィンドウを閉じることをAI Orchestratorに通知
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'close-and-reopen-for-deepresearch',
              aiType: this.aiType,
              mode: 'deepresearch'
            });
          }
          
          // 現在のウィンドウを閉じる
          this.log('🚪 ウィンドウを閉じます', 'INFO');
          window.close();
          
          // ここで処理は終了（新しいウィンドウで再実行される）
          return;
        }
        
        // 10. DeepResearchモードの場合、Canvas機能のセレクタを取得
        if (this.isDeepResearchMode) {
          this.log('📝 ステップ10: Canvas機能のセレクタ取得', 'INFO');
          await this.collectCanvasSelectors();
        }
        
        this.log('🎉 全フロー完了', 'SUCCESS');
        
      } catch (error) {
        this.log(`自動実行エラー: ${error.message}`, 'ERROR');
      }
    }

    /**
     * セレクタを探して収集
     */
    async findAndCollectSelectors(selectorType) {
      const selectors = this.getSelectors(selectorType);
      const foundSelectors = [];
      
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const selectorInfo = this.extractComprehensiveSelectors(element, selectorType);
            if (selectorInfo) {
              foundSelectors.push(selectorInfo);
            }
          });
        } catch (e) {
          // セレクタエラーは無視
        }
      }
      
      return foundSelectors;
    }

    /**
     * テキストを自動入力
     */
    async autoFillPrompt(prompt) {
      const selectors = this.getSelectors('INPUT');
      const inputElement = this.findElement(selectors);
      
      if (!inputElement) {
        this.log('テキスト入力欄が見つかりません', 'ERROR');
        return false;
      }
      
      // セレクタ情報を収集
      const selectorInfo = this.extractComprehensiveSelectors(inputElement, 'INPUT');
      this.log(`入力欄セレクタ: ${JSON.stringify(selectorInfo.attributes)}`, 'INFO');
      
      // AIタイプ別の入力処理
      if (this.aiType === 'Claude' || this.aiType === 'ChatGPT') {
        // contenteditable要素の場合
        if (inputElement.getAttribute('contenteditable') === 'true') {
          inputElement.textContent = prompt;
          inputElement.innerHTML = prompt;
          
          // 入力イベントを発火
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new InputEvent('input', { 
            bubbles: true, 
            data: prompt,
            inputType: 'insertText'
          }));
        }
      } else if (this.aiType === 'Gemini') {
        // Geminiの特殊な入力処理
        if (inputElement.classList.contains('ql-editor')) {
          inputElement.innerHTML = `<p>${prompt}</p>`;
          inputElement.textContent = prompt;
          
          // Quillエディタのイベントを発火
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // 通常のinput/textarea
        if (inputElement.value !== undefined) {
          inputElement.value = prompt;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      
      this.log(`✅ テキスト入力完了: "${prompt}"`, 'SUCCESS');
      return true;
    }

    /**
     * 送信ボタンをクリック
     */
    async clickSendButton() {
      const selectors = this.getSelectors('SEND_BUTTON');
      const sendButton = this.findElement(selectors);
      
      if (!sendButton) {
        this.log('送信ボタンが見つかりません', 'ERROR');
        return false;
      }
      
      // セレクタ情報を収集
      const selectorInfo = this.extractComprehensiveSelectors(sendButton, 'SEND_BUTTON');
      this.log(`送信ボタンセレクタ: ${JSON.stringify(selectorInfo.attributes)}`, 'INFO');
      
      // クリック
      sendButton.click();
      this.log('✅ 送信ボタンクリック完了', 'SUCCESS');
      
      return true;
    }

    /**
     * 応答完了を待機
     */
    async waitForResponseComplete() {
      const maxWaitTime = 60000; // 最大60秒待機
      const checkInterval = 1000; // 1秒ごとにチェック
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        // 停止ボタンの存在確認
        const stopSelectors = this.getSelectors('STOP_BUTTON');
        const stopButton = this.findElement(stopSelectors);
        
        if (!stopButton) {
          // 停止ボタンが消えた = 応答完了
          this.log('✅ 応答完了を検出', 'SUCCESS');
          return true;
        }
        
        this.log('⏳ 応答中... 停止ボタン検出', 'INFO');
        await this.delay(checkInterval);
      }
      
      this.log('⚠️ 応答タイムアウト', 'WARNING');
      return false;
    }

    /**
     * 回答を抽出
     */
    async extractResponse() {
      const selectors = this.getSelectors('RESPONSE');
      let responseElement = null;
      
      // 最新の応答要素を探す
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            responseElement = elements[elements.length - 1];
            break;
          }
        } catch (e) {
          // セレクタエラーは無視
        }
      }
      
      if (!responseElement) {
        this.log('応答要素が見つかりません', 'ERROR');
        return null;
      }
      
      // セレクタ情報を収集
      const selectorInfo = this.extractComprehensiveSelectors(responseElement, 'RESPONSE');
      this.log(`応答欄セレクタ: ${JSON.stringify(selectorInfo.attributes)}`, 'INFO');
      
      // テキスト抽出
      let extractedText = responseElement.textContent?.trim() || '';
      
      // Claudeの思考プロセス除外
      if (this.aiType === 'Claude') {
        const cleanedElement = this.removeClaudeThinkingProcess(responseElement);
        extractedText = cleanedElement ? cleanedElement.textContent?.trim() : extractedText;
      }
      
      return extractedText;
    }

    /**
     * Claudeの思考プロセスを除外
     */
    removeClaudeThinkingProcess(element) {
      const clone = element.cloneNode(true);
      const thinkingButtons = clone.querySelectorAll('button');
      
      thinkingButtons.forEach(btn => {
        const text = btn.textContent || '';
        if (text.includes('思考プロセス') || text.includes('Analyzed') || btn.querySelector('.tabular-nums')) {
          let elementToRemove = btn;
          let parent = btn.parentElement;
          
          while (parent && parent.classList && (parent.classList.contains('rounded-lg') || parent.classList.contains('my-3'))) {
            elementToRemove = parent;
            parent = parent.parentElement;
          }
          
          elementToRemove.remove();
        }
      });
      
      return clone;
    }


    /**
     * Canvas機能のセレクタを収集
     */
    async collectCanvasSelectors() {
      if (this.aiType !== 'Claude') return;
      
      const canvasSelectors = [
        '.grid-cols-1.grid h1',
        '.grid-cols-1.grid',
        '.absolute.inset-0'
      ];
      
      const foundSelectors = [];
      
      for (const selector of canvasSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const selectorInfo = this.extractComprehensiveSelectors(element, 'CANVAS');
            if (selectorInfo) {
              foundSelectors.push(selectorInfo);
            }
          });
        } catch (e) {
          // セレクタエラーは無視
        }
      }
      
      if (foundSelectors.length > 0) {
        this.log(`✅ Canvas機能のセレクタ ${foundSelectors.length}個取得`, 'SUCCESS');
      } else {
        this.log('⚠️ Canvas機能のセレクタが見つかりません', 'WARNING');
      }
      
      return foundSelectors;
    }

    /**
     * 遅延処理
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 1. テキスト入力欄の監視
     */
    monitorInputField() {
      const selectors = this.getSelectors('INPUT');
      if (selectors.length === 0) {
        this.log('テキスト入力欄のセレクタが見つかりません', 'ERROR');
        return;
      }

      this.log(`テキスト入力欄監視開始: ${selectors.join(', ')}`, 'INFO');

      // MutationObserver作成
      const inputObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            this.checkInputContent();
          }
        }
      });

      // 監視対象要素を探して監視開始
      const checkAndStartInputMonitoring = () => {
        const inputElement = this.findElement(selectors);
        if (inputElement) {
          inputObserver.observe(inputElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['value']
          });
          
          this.log(`テキスト入力欄監視開始: ${inputElement.tagName}${inputElement.className ? '.' + inputElement.className.split(' ')[0] : ''}`, 'SUCCESS');
          
          // 直接のイベントリスナーも追加
          ['input', 'change', 'keyup', 'paste'].forEach(eventType => {
            inputElement.addEventListener(eventType, () => this.checkInputContent());
          });
          
          this.observers.set('input', inputObserver);
        } else {
          // 要素が見つからない場合は少し待って再試行
          setTimeout(checkAndStartInputMonitoring, 1000);
        }
      };

      checkAndStartInputMonitoring();
    }

    /**
     * テキスト入力内容をチェック
     */
    checkInputContent() {
      const selectors = this.getSelectors('INPUT');
      const inputElement = this.findElement(selectors);
      
      if (!inputElement) return;

      let content = '';
      if (inputElement.value !== undefined) {
        content = inputElement.value;
      } else if (inputElement.textContent) {
        content = inputElement.textContent.trim();
      } else if (inputElement.innerText) {
        content = inputElement.innerText.trim();
      }

      if (content && content.length > 0 && content !== this.state.inputContent) {
        this.state.inputContent = content;
        
        if (!this.state.inputDetected) {
          this.state.inputDetected = true;
          this.timestamps.inputDetected = Date.now();
          this.log(`✍️ テキスト入力検出: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`, 'SUCCESS');
        }
      }
    }

    /**
     * 2. 送信ボタンの監視
     */
    monitorSendButton() {
      const selectors = this.getSelectors('SEND_BUTTON');
      if (selectors.length === 0) {
        this.log('送信ボタンのセレクタが見つかりません', 'ERROR');
        return;
      }

      this.log(`送信ボタン監視開始: ${selectors.join(', ')}`, 'INFO');

      // MutationObserver作成
      const sendObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' || mutation.type === 'childList') {
            this.checkSendButtonClick();
          }
        }
      });

      // 送信ボタンの監視開始
      const checkAndStartSendMonitoring = () => {
        const sendButton = this.findElement(selectors);
        if (sendButton) {
          // ボタンクリックイベント監視
          sendButton.addEventListener('click', () => {
            this.handleSendButtonClick();
          });

          // 親要素も監視してボタンの状態変化を検出
          if (sendButton.parentElement) {
            sendObserver.observe(sendButton.parentElement, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['disabled', 'aria-disabled', 'class']
            });
          }

          this.log(`送信ボタン監視開始: ${sendButton.tagName}${sendButton.className ? '.' + sendButton.className.split(' ')[0] : ''}`, 'SUCCESS');
          this.observers.set('send', sendObserver);
        } else {
          setTimeout(checkAndStartSendMonitoring, 1000);
        }
      };

      checkAndStartSendMonitoring();
    }

    /**
     * 送信ボタンクリック処理
     */
    handleSendButtonClick() {
      if (!this.state.sendDetected) {
        this.state.sendDetected = true;
        this.timestamps.sendDetected = Date.now();
        this.log(`📤 送信ボタンクリック検出`, 'SUCCESS');
        
        const inputTime = this.timestamps.inputDetected;
        const sendTime = this.timestamps.sendDetected;
        if (inputTime && sendTime) {
          const timeDiff = sendTime - inputTime;
          this.log(`入力から送信まで: ${timeDiff}ms`, 'INFO');
        }
      }
    }

    /**
     * 送信ボタンクリック状態をチェック
     */
    checkSendButtonClick() {
      // ボタンの状態変化を監視（無効化されるなど）
      const selectors = this.getSelectors('SEND_BUTTON');
      const sendButton = this.findElement(selectors);
      
      if (sendButton && (sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true')) {
        if (this.state.inputDetected && !this.state.sendDetected) {
          this.handleSendButtonClick();
        }
      }
    }

    /**
     * 3. 回答停止ボタンの監視
     */
    monitorStopButton() {
      const selectors = this.getSelectors('STOP_BUTTON');
      if (selectors.length === 0) {
        this.log('停止ボタンのセレクタが見つかりません', 'ERROR');
        return;
      }

      this.log(`停止ボタン監視開始: ${selectors.join(', ')}`, 'INFO');

      // 停止ボタンの出現・消滅を監視
      const stopObserver = new MutationObserver((mutations) => {
        this.checkStopButtonState();
      });

      // ドキュメント全体を監視して停止ボタンの変化を検出
      stopObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });

      this.observers.set('stop', stopObserver);

      // 定期的なチェックも併用
      const stopButtonInterval = setInterval(() => {
        if (!this.isMonitoring) {
          clearInterval(stopButtonInterval);
          return;
        }
        this.checkStopButtonState();
      }, 500);
    }

    /**
     * 停止ボタンの状態をチェック
     */
    checkStopButtonState() {
      const selectors = this.getSelectors('STOP_BUTTON');
      const stopButton = this.findElement(selectors);
      
      const isPresent = !!stopButton;

      if (isPresent && !this.state.stopButtonPresent) {
        // 停止ボタンが出現（応答生成開始）
        this.state.stopButtonPresent = true;
        this.timestamps.responseStart = Date.now();
        this.log(`⏸️ 停止ボタン出現検出 - AI応答生成開始`, 'SUCCESS');
        
        const sendTime = this.timestamps.sendDetected;
        const responseStartTime = this.timestamps.responseStart;
        if (sendTime && responseStartTime) {
          const timeDiff = responseStartTime - sendTime;
          this.log(`送信から応答開始まで: ${timeDiff}ms`, 'INFO');
        }
        
      } else if (!isPresent && this.state.stopButtonPresent && !this.state.responseComplete) {
        // 停止ボタンが消滅（応答生成完了）
        this.state.responseComplete = true;
        this.timestamps.responseComplete = Date.now();
        this.log(`✅ 停止ボタン消滅検出 - AI応答生成完了`, 'SUCCESS');
        
        const responseStartTime = this.timestamps.responseStart;
        const responseCompleteTime = this.timestamps.responseComplete;
        if (responseStartTime && responseCompleteTime) {
          const timeDiff = responseCompleteTime - responseStartTime;
          this.log(`応答生成時間: ${timeDiff}ms`, 'INFO');
        }

        // 応答テキストの取得を開始
        setTimeout(() => this.extractFinalResponse(), 1000);
      }
    }

    /**
     * 4. AI応答の監視
     */
    monitorResponse() {
      const selectors = this.getSelectors('RESPONSE');
      if (selectors.length === 0) {
        this.log('AI応答のセレクタが見つかりません', 'ERROR');
        return;
      }

      this.log(`AI応答監視開始: ${selectors.join(', ')}`, 'INFO');

      // 応答エリアの変更を監視
      const responseObserver = new MutationObserver((mutations) => {
        if (this.state.responseComplete) {
          this.extractFinalResponse();
        }
      });

      // 応答エリア全体を監視
      responseObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });

      this.observers.set('response', responseObserver);
    }

    /**
     * 最終的なAI応答テキストを抽出
     */
    extractFinalResponse() {
      if (this.state.finalResponse) return; // 既に取得済み

      const selectors = this.getSelectors('RESPONSE');
      let responseElement = null;

      // 最新の応答要素を探す
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            responseElement = elements[elements.length - 1];
            break;
          }
        } catch (e) {
          // セレクタエラーは無視
        }
      }

      if (!responseElement) {
        this.log('AI応答要素が見つかりません', 'ERROR');
        return;
      }

      // AI別のテキスト抽出処理
      let extractedText = '';

      if (this.aiType === 'Claude') {
        // Claudeの思考プロセス除外処理
        if (window.AIHandler && window.AIHandler.utils && typeof window.AIHandler.utils.removeClaudeThinkingProcess === 'function') {
          const cleanedElement = window.AIHandler.utils.removeClaudeThinkingProcess(responseElement);
          extractedText = cleanedElement ? cleanedElement.textContent?.trim() : '';
        } else {
          // フォールバック処理
          const clone = responseElement.cloneNode(true);
          const thinkingButtons = clone.querySelectorAll('button');
          thinkingButtons.forEach(btn => {
            const text = btn.textContent || '';
            if (text.includes('思考プロセス') || text.includes('Analyzed') || btn.querySelector('.tabular-nums')) {
              let elementToRemove = btn;
              let parent = btn.parentElement;
              while (parent && parent.classList && (parent.classList.contains('rounded-lg') || parent.classList.contains('my-3'))) {
                elementToRemove = parent;
                parent = parent.parentElement;
              }
              elementToRemove.remove();
            }
          });
          extractedText = clone.textContent?.trim() || '';
        }
      } else {
        // その他のAI（ChatGPT、Gemini）
        extractedText = responseElement.textContent?.trim() || '';
      }

      if (extractedText) {
        this.state.finalResponse = extractedText;
        const charCount = extractedText.length;
        const lineCount = extractedText.split('\n').length;
        
        if (this.isDeepResearchMode) {
          this.log(`🔍 DeepResearch応答テキスト取得完了: ${charCount}文字、${lineCount}行`, 'SUCCESS');
          this.state.deepResearchResponse = extractedText;
        } else {
          this.log(`📄 通常応答テキスト取得完了: ${charCount}文字、${lineCount}行`, 'SUCCESS');
          this.state.normalResponse = extractedText;
        }
        
        this.log(`応答プレビュー: "${extractedText.substring(0, 200)}${extractedText.length > 200 ? '...' : ''}"`, 'INFO');
        
        // 完全フロー監視完了
        this.completeMonitoring();
      } else {
        this.log('AI応答テキストを抽出できませんでした', 'ERROR');
      }
    }

    /**
     * 監視完了処理
     */
    completeMonitoring() {
      const totalTime = Date.now() - this.timestamps.monitoringStart;
      
      if (this.isDeepResearchMode) {
        this.log('=== DeepResearch完了 ===', 'SUCCESS');
        this.log(`DeepResearch実行時間: ${totalTime}ms`, 'INFO');
        
        // DeepResearch完了時の処理
        this.finalizeBothResponses();
      } else {
        this.log('=== 通常処理完了 ===', 'SUCCESS');
        this.log(`通常処理実行時間: ${totalTime}ms`, 'INFO');
        
        // サマリーレポート生成
        this.generateSummaryReport();
        
        // 連続実行チェック: DeepResearchモードがあるかチェック
        this.checkAndExecuteConsecutiveProcessing();
      }
    }

    /**
     * 通常処理とDeepResearch両方完了時の最終処理
     */
    finalizeBothResponses() {
      this.log('🎯 連続実行完了 - 通常処理とDeepResearch両方完了', 'SUCCESS');
      
      // 両方の応答をまとめたサマリーレポート
      this.generateConsecutiveSummaryReport();
      
      // DeepResearchモードをリセット
      this.isDeepResearchMode = false;
    }

    /**
     * 連続実行時の包括的サマリーレポート生成
     */
    generateConsecutiveSummaryReport() {
      this.log('=== 連続実行完了レポート ===', 'SUCCESS');
      
      if (this.state.normalResponse) {
        const normalLength = this.state.normalResponse.length;
        this.log(`📄 通常応答: ${normalLength}文字`, 'INFO');
      }
      
      if (this.state.deepResearchResponse) {
        const deepLength = this.state.deepResearchResponse.length;
        this.log(`🔍 DeepResearch応答: ${deepLength}文字`, 'INFO');
      }
      
      // 応答比較
      if (this.state.normalResponse && this.state.deepResearchResponse) {
        const difference = this.state.deepResearchResponse.length - this.state.normalResponse.length;
        this.log(`📊 応答長比較: DeepResearchは通常より${difference > 0 ? '+' : ''}${difference}文字`, 'INFO');
      }
      
      // 元のサマリーレポートも生成
      this.generateSummaryReport();
    }

    /**
     * 連続実行処理: 通常処理完了後にDeepResearchを自動実行
     */
    async checkAndExecuteConsecutiveProcessing() {
      if (this.consecutiveExecutionInProgress) {
        this.log('連続実行は既に進行中です', 'INFO');
        return;
      }

      // DeepResearch機能の利用可能性をチェック
      const deepResearchInfo = this.detectDeepResearchCapability();
      
      if (!deepResearchInfo.available) {
        this.log('DeepResearch機能が利用できないため、連続実行をスキップします', 'INFO');
        return;
      }

      // 通常処理が完了した場合のみDeepResearchを実行
      if (!this.isDeepResearchMode && this.state.finalResponse) {
        this.log('🔍 通常処理完了 - DeepResearch連続実行を開始します', 'INFO');
        this.consecutiveExecutionInProgress = true;
        
        try {
          await this.executeDeepResearchConsecutive();
        } catch (error) {
          this.log(`DeepResearch連続実行エラー: ${error.message}`, 'ERROR');
        } finally {
          this.consecutiveExecutionInProgress = false;
        }
      }
    }

    /**
     * DeepResearch連続実行処理
     */
    async executeDeepResearchConsecutive() {
      const originalResponse = this.state.finalResponse;
      const deepResearchInfo = this.detectDeepResearchCapability();
      
      if (!deepResearchInfo.available || !deepResearchInfo.selector) {
        this.log('DeepResearch機能のセレクタが見つかりません', 'ERROR');
        return;
      }

      this.log('🚀 DeepResearch連続実行を開始...', 'INFO');
      
      // 現在の状態をリセット（DeepResearchモードに設定）
      this.isDeepResearchMode = true;
      this.state.responseComplete = false;
      this.state.finalResponse = '';
      
      try {
        // DeepResearchボタン/機能を実行
        const deepResearchElement = document.querySelector(deepResearchInfo.selector);
        if (!deepResearchElement) {
          this.log(`DeepResearch要素が見つかりません: ${deepResearchInfo.selector}`, 'ERROR');
          return;
        }

        this.log(`DeepResearch要素をクリック: ${deepResearchInfo.selector}`, 'INFO');
        
        // クリックイベントを発火
        deepResearchElement.click();
        
        // 少し待ってから応答監視を再開
        setTimeout(() => {
          this.log('DeepResearch応答監視を開始...', 'INFO');
          this.startMonitoring(); // 監視を再開
        }, 2000);
        
      } catch (error) {
        this.log(`DeepResearch実行エラー: ${error.message}`, 'ERROR');
        this.isDeepResearchMode = false;
      }
    }

    /**
     * 監視停止
     */
    stopMonitoring() {
      if (!this.isMonitoring) return false;

      this.isMonitoring = false;
      
      // 全ObServerを停止
      for (const [name, observer] of this.observers) {
        observer.disconnect();
        this.log(`${name}監視停止`, 'INFO');
      }
      
      this.observers.clear();
      
      // セレクタ情報送信の定期実行を停止
      if (this.selectorUpdateInterval) {
        clearInterval(this.selectorUpdateInterval);
        this.selectorUpdateInterval = null;
        this.log('セレクタ情報定期送信を停止', 'INFO');
      }
      
      this.log('=== 完全フロー監視停止 ===', 'WARNING');
      
      return true;
    }

    /**
     * サマリーレポート生成
     */
    generateSummaryReport() {
      const report = {
        aiType: this.aiType,
        monitoringDuration: this.timestamps.responseComplete - this.timestamps.monitoringStart,
        inputToSendTime: this.timestamps.sendDetected - this.timestamps.inputDetected,
        sendToResponseTime: this.timestamps.responseStart - this.timestamps.sendDetected,
        responseGenerationTime: this.timestamps.responseComplete - this.timestamps.responseStart,
        totalFlowTime: this.timestamps.responseComplete - this.timestamps.inputDetected,
        inputContent: this.state.inputContent,
        responseLength: this.state.finalResponse.length,
        responsePreview: this.state.finalResponse.substring(0, 300) + (this.state.finalResponse.length > 300 ? '...' : ''),
        logCount: this.logs.length,
        timestamps: this.timestamps,
        state: this.state
      };

      this.log('📊 === サマリーレポート ===', 'INFO');
      this.log(`AI: ${report.aiType}`, 'INFO');
      this.log(`総監視時間: ${report.monitoringDuration}ms`, 'INFO');
      this.log(`入力→送信: ${report.inputToSendTime}ms`, 'INFO');
      this.log(`送信→応答開始: ${report.sendToResponseTime}ms`, 'INFO');
      this.log(`応答生成: ${report.responseGenerationTime}ms`, 'INFO');
      this.log(`全体フロー: ${report.totalFlowTime}ms`, 'INFO');
      this.log(`応答文字数: ${report.responseLength}文字`, 'INFO');

      // グローバルに結果を保存
      window.AIMutationObserverResult = report;

      return report;
    }

    /**
     * ログ取得
     */
    getLogs() {
      return [...this.logs];
    }

    /**
     * 現在の状態取得
     */
    getState() {
      return { ...this.state };
    }

    /**
     * タイムスタンプ取得
     */
    getTimestamps() {
      return { ...this.timestamps };
    }
  }

  // グローバルに公開
  window.AIMutationObserver = AIMutationObserver;

  // 使用例とヘルパー関数
  window.startAIMutationMonitoring = () => {
    if (window.currentAIObserver) {
      window.currentAIObserver.stopMonitoring();
    }
    
    const observer = new AIMutationObserver();
    
    // AIタイプがUnknownの場合は警告を表示
    if (observer.aiType === 'Unknown') {
      console.warn('🚨 AIサイト（Claude、ChatGPT、Gemini）が検出されませんでした');
      console.warn('   適切なAIサイトを開いてから再試行してください');
      observer.log('AIサイトが検出されていません。Claude、ChatGPT、またはGeminiを開いてください。', 'WARNING');
    }
    
    const started = observer.startFullFlowMonitoring();
    
    if (started) {
      window.currentAIObserver = observer;
      return observer;
    }
    
    return null;
  };

  window.stopAIMutationMonitoring = () => {
    if (window.currentAIObserver) {
      const stopped = window.currentAIObserver.stopMonitoring();
      if (stopped) {
        window.currentAIObserver = null;
      }
      return stopped;
    }
    return false;
  };

  window.getAIMutationReport = () => {
    return window.AIMutationObserverResult || null;
  };

  console.log('🔍 AI統合MutationObserver監視システム準備完了');
  console.log('💡 使用方法:');
  console.log('  - 開始: startAIMutationMonitoring()');
  console.log('  - 停止: stopAIMutationMonitoring()');  
  console.log('  - 結果: getAIMutationReport()');

})();