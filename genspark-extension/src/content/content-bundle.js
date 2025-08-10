/**
 * コンテンツスクリプト（バンドル版）
 * Chrome拡張機能用にES6モジュールをバンドル
 */

(function() {
  'use strict';

  // ======== ユーティリティクラス ========
  class Logger {
    constructor() {
      this.level = 'info';
      this.prefix = '[Genspark]';
    }

    setLevel(level) {
      this.level = level;
    }

    log(message) {
      if (this.level === 'verbose' || this.level === 'info') {
        console.log(`${this.prefix} ${message}`);
      }
    }

    error(message) {
      console.error(`${this.prefix} [ERROR] ${message}`);
    }

    debug(message) {
      if (this.level === 'verbose') {
        console.debug(`${this.prefix} [DEBUG] ${message}`);
      }
    }
  }

  // ======== 環境設定 ========
  const environments = {
    test: {
      name: 'test',
      baseUrl: 'https://www.genspark.ai/agents?type=slides_agent',
      defaultPrompt: '桃太郎についてスライド4枚で解説して',
      waitTimes: {
        pageLoad: 5,
        afterInput: 5,
        afterSubmit: 5,
        checkInterval: 0.5,
        finalWait: 5
      },
      debugMode: true,
      logLevel: 'verbose'
    },
    production: {
      name: 'production',
      baseUrl: 'https://www.genspark.ai/agents?type=slides_agent',
      defaultPrompt: '',
      waitTimes: {
        pageLoad: 3,
        afterInput: 2,
        afterSubmit: 3,
        checkInterval: 0.5,
        finalWait: 3
      },
      debugMode: false,
      logLevel: 'error'
    }
  };

  async function getCurrentEnvironment() {
    const storage = await chrome.storage.local.get(['environment']);
    const envName = storage.environment || 'test';
    return environments[envName];
  }

  // ======== セレクタ設定 ========
  const selectors = {
    textInput: [
      'textarea[name="query"]',
      '.search-input',
      '.j-search-input',
      'textarea.search-input.j-search-input',
      '.prompt-input-wrapper-upper textarea',
      '.textarea-wrapper textarea',
      'textarea[placeholder*="スライドのリクエスト"]'
    ],
    submitButton: [
      '.enter-icon.active',
      '.enter-icon-wrapper.active',
      '.enter-icon-wrapper[class*="bg-[#262626]"]',
      '.enter-icon.cursor-pointer.active',
      'div[class*="enter-icon"][class*="active"]',
      '.enter-icon-wrapper[class*="text-white"]',
      '.input-icon .enter-icon'
    ],
    stopButton: [
      '.stop-icon',
      '.enter-icon-wrapper[class*="bg-[#232425]"]',
      'svg.stop-icon',
      '.input-icon .enter-icon-wrapper[class*="bg-[#232425]"]',
      '.enter-icon-wrapper[class*="text-[#fff]"]',
      'div[class*="enter-icon-wrapper"][class*="bg-[#232425]"]'
    ],
    errorPage: 'https://docs.google.com/spreadsheets/d/1QfOFEUWtlR0wwaN5BRyVdenFPxCRJmsf4SPo87O_ZnY/edit?gid=2134602748#gid=2134602748'
  };

  async function getSelectors() {
    const storage = await chrome.storage.local.get(['customSelectors']);
    return storage.customSelectors || selectors;
  }

  // ======== データアダプター ========
  class IDataAdapter {
    async getData() {
      throw new Error('getData() must be implemented by subclass');
    }

    async validate() {
      return true;
    }

    async configure(config) {
      this.config = config;
    }
  }

  class ManualDataAdapter extends IDataAdapter {
    constructor() {
      super();
      this.storageKey = 'manualInput';
    }

    async getData() {
      const storage = await chrome.storage.local.get([this.storageKey]);
      const data = storage[this.storageKey];
      
      if (!data || !data.prompt) {
        const env = await chrome.storage.local.get(['environment']);
        if (env.environment === 'test') {
          return {
            prompt: '桃太郎についてスライド4枚で解説して',
            options: {}
          };
        }
        
        throw new Error('入力データがありません。ポップアップから入力してください。');
      }
      
      return {
        prompt: data.prompt,
        options: data.options || {}
      };
    }
  }

  class SpreadsheetDataAdapter extends IDataAdapter {
    constructor() {
      super();
      this.spreadsheetId = null;
      this.range = null;
      this.apiKey = null;
    }

    async configure(config) {
      super.configure(config);
      this.spreadsheetId = config.spreadsheetId;
      this.range = config.range || 'A1:B100';
      this.apiKey = config.apiKey;
    }

    async getData() {
      if (!this.spreadsheetId) {
        throw new Error('スプレッドシートIDが設定されていません');
      }

      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.range}`;
        const params = new URLSearchParams({
          key: this.apiKey,
          majorDimension: 'ROWS'
        });

        const response = await fetch(`${url}?${params}`);
        
        if (!response.ok) {
          throw new Error(`API エラー: ${response.status}`);
        }

        const data = await response.json();
        const rows = data.values || [];
        
        for (const row of rows) {
          if (row[0] && !row[2]) {
            return {
              prompt: row[0],
              options: {
                rowIndex: rows.indexOf(row),
                metadata: row[1] || ''
              }
            };
          }
        }

        throw new Error('処理可能なデータが見つかりません');
        
      } catch (error) {
        console.error('スプレッドシート取得エラー:', error);
        throw error;
      }
    }
  }

  // ======== メインクラス: GensparkAutomation ========
  class GensparkAutomation {
    constructor(dataAdapter) {
      this.dataAdapter = dataAdapter;
      this.logger = new Logger();
      this.startTime = Date.now();
      this.environment = null;
      this.selectors = null;
    }

    async initialize() {
      this.environment = await getCurrentEnvironment();
      this.selectors = await getSelectors();
      this.logger.setLevel(this.environment.logLevel);
      this.logger.log('Genspark Automation 初期化完了');
    }

    getElapsedTime() {
      const elapsed = Date.now() - this.startTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      return `${minutes}分${seconds}秒`;
    }

    findElement(selectors, elementName) {
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            this.logger.log(`${elementName}を発見: ${selector}`);
            return element;
          }
        } catch (e) {
          // セレクタエラーは無視
        }
      }

      const errorMessage = `${elementName}の要素が変更されています。UIが変更された可能性があります。\n設定ページ: ${this.selectors.errorPage}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    wait(seconds) {
      return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async execute() {
      try {
        await this.initialize();
        
        this.logger.log('=== Genspark Automation 開始 ===');
        this.logger.log(`環境: ${this.environment.name}`);
        this.logger.log(`開始時刻: ${new Date().toLocaleString()}`);

        await this.checkAndNavigate();
        await this.inputText();
        await this.submitForm();
        await this.waitForCompletion();
        const result = await this.getResult();
        
        this.logger.log('=== 実行完了 ===');
        this.logger.log(`総実行時間: ${this.getElapsedTime()}`);
        
        return {
          success: true,
          url: result.url,
          executionTime: this.getElapsedTime(),
          environment: this.environment.name
        };
        
      } catch (error) {
        this.logger.error(`エラー発生: ${error.message}`);
        return {
          success: false,
          error: error.message,
          executionTime: this.getElapsedTime(),
          environment: this.environment.name
        };
      }
    }

    async checkAndNavigate() {
      this.logger.log('ステップ1: ページチェック');
      
      if (window.location.href !== this.environment.baseUrl) {
        this.logger.log(`URLを開いています: ${this.environment.baseUrl}`);
        window.location.href = this.environment.baseUrl;
        throw new Error('ページが変更されました。拡張機能を再実行してください。');
      }
      
      this.logger.log('ページが正常に読み込まれました');
      await this.wait(this.environment.waitTimes.pageLoad);
    }

    async inputText() {
      this.logger.log('ステップ2: テキスト入力');
      
      const textInput = this.findElement(this.selectors.textInput, 'テキスト入力欄');
      const inputData = await this.dataAdapter.getData();
      
      textInput.value = inputData.prompt;
      textInput.focus();
      
      const inputEvent = new Event('input', { bubbles: true });
      textInput.dispatchEvent(inputEvent);
      
      this.logger.log(`テキストを入力: "${inputData.prompt}"`);
      await this.wait(this.environment.waitTimes.afterInput);
    }

    async submitForm() {
      this.logger.log('ステップ3: 送信');
      
      const submitButton = this.findElement(this.selectors.submitButton, '送信ボタン');
      submitButton.click();
      
      this.logger.log('送信ボタンをクリックしました');
      await this.wait(this.environment.waitTimes.afterSubmit);
    }

    async waitForCompletion() {
      this.logger.log('ステップ4: 処理完了待機');
      
      let stopButton = null;
      let attempts = 0;
      const maxAttempts = 30;
      
      while (!stopButton && attempts < maxAttempts) {
        for (const selector of this.selectors.stopButton) {
          try {
            stopButton = document.querySelector(selector);
            if (stopButton) {
              this.logger.log('処理中インジケータを検出');
              break;
            }
          } catch (e) {
            // セレクタエラーは無視
          }
        }
        
        if (!stopButton) {
          attempts++;
          await this.wait(1);
        }
      }
      
      if (!stopButton) {
        this.logger.log('処理中インジケータが見つかりませんでした。処理を続行します。');
        return;
      }
      
      this.logger.log('処理完了を待機中...');
      
      let disappeared = false;
      let disappearanceTime = null;
      
      while (!disappeared) {
        let currentStopButton = null;
        
        for (const selector of this.selectors.stopButton) {
          try {
            currentStopButton = document.querySelector(selector);
            if (currentStopButton) break;
          } catch (e) {
            // セレクタエラーは無視
          }
        }
        
        if (!currentStopButton) {
          if (!disappearanceTime) {
            disappearanceTime = Date.now();
            this.logger.log('処理が完了しました。確認待機中...');
          }
          
          if (Date.now() - disappearanceTime >= 5000) {
            disappeared = true;
            this.logger.log('処理完了を確認しました');
          }
        } else {
          if (disappearanceTime) {
            this.logger.log('処理が再開されました。待機を続行...');
            disappearanceTime = null;
          }
        }
        
        await this.wait(this.environment.waitTimes.checkInterval);
      }
      
      await this.wait(this.environment.waitTimes.finalWait);
    }

    async getResult() {
      this.logger.log('ステップ5: 結果取得');
      
      const finalUrl = window.location.href;
      this.logger.log(`最終URL: ${finalUrl}`);
      
      return {
        url: finalUrl,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ======== コンテンツスクリプトのメイン処理 ========
  let automation = null;

  async function initialize() {
    console.log('[Genspark Extension] コンテンツスクリプト初期化');
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  async function handleMessage(request, sender, sendResponse) {
    console.log('[Genspark Extension] メッセージ受信:', request.action);
    
    switch (request.action) {
      case 'start':
        handleStart(request, sendResponse);
        return true;
        
      case 'stop':
        handleStop(sendResponse);
        break;
        
      case 'getStatus':
        handleGetStatus(sendResponse);
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  }

  async function handleStart(request, sendResponse) {
    try {
      // アダプターを作成
      let adapter;
      if (request.adapterType === 'spreadsheet') {
        adapter = new SpreadsheetDataAdapter();
        await adapter.configure(request.adapterConfig || {});
      } else {
        adapter = new ManualDataAdapter();
      }
      
      // 自動化インスタンスを作成
      automation = new GensparkAutomation(adapter);
      
      // 実行
      const result = await automation.execute();
      
      // 履歴に追加
      const history = await chrome.storage.local.get(['history']);
      const historyArray = history.history || [];
      historyArray.push({
        ...result,
        timestamp: new Date().toISOString()
      });
      
      if (historyArray.length > 50) {
        historyArray.shift();
      }
      
      await chrome.storage.local.set({ history: historyArray });
      
      // 結果を返す
      sendResponse({
        success: true,
        result: result
      });
      
    } catch (error) {
      console.error('[Genspark Extension] エラー:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  function handleStop(sendResponse) {
    if (automation) {
      automation = null;
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No automation running' });
    }
  }

  function handleGetStatus(sendResponse) {
    sendResponse({
      success: true,
      running: automation !== null,
      url: window.location.href
    });
  }

  // 初期化実行
  initialize();
})();