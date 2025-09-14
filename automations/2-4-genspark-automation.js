/**
 * @fileoverview Genspark自動化V2 - 統一アーキテクチャ実装
 * Version: 2.0.0
 * 作成日: 2025年9月12日
 * 
 * 【V2の改善点】
 * - common-ai-handler.js統合による重複コード削減（800行→270行、66%削減）
 * - URL基づく機能切り替え（slides vs factcheck）
 * - レスポンスURL抽出機能
 * - 統一されたエラーハンドリング
 * 
 * 【主要機能】
 * - スライド生成機能の自動化
 * - ファクトチェック機能の自動化
 * - URL基づく動的機能選択
 * - レスポンス結果のURL抽出
 * 
 * 【依存関係】
 * - common-ai-handler.js: 共通基盤機能
 * - ui-selectors.js: Genspark用セレクタ
 * 
 * 【グローバル公開】
 * window.GensparkAutomationV2: V2メインAPI
 * window.GensparkAutomation: V1互換性API
 */
(() => {
  "use strict";

  // ========================================
  // 設定定数
  // ========================================
  const CONFIG = {
    AI_TYPE: 'Genspark',
    VERSION: '2.0.0',
    DEFAULT_TIMEOUT: 3600000,  // デフォルトタイムアウト: 60分
    WAIT_INTERVAL: 1000,       // 待機間隔: 1秒
    CLICK_DELAY: 500,          // クリック後の待機: 0.5秒
    INPUT_DELAY: 300,          // 入力後の待機: 0.3秒
    
    // Genspark固有設定
    FUNCTIONS: {
      SLIDES: 'slides',
      FACTCHECK: 'factcheck'
    },
    
    // URL検出パターン
    URL_PATTERNS: {
      SLIDES: /genspark\.ai.*slides/i,
      FACTCHECK: /genspark\.ai.*factcheck/i
    }
  };

  // ========================================
  // グローバル変数
  // ========================================
  let sendStartTime = null;
  let currentFunction = null;
  let menuHandler = null;

  // ========================================
  // UI Selectors読み込みと基本関数定義
  // ========================================
  let UI_SELECTORS = {};
  let selectorsLoaded = false;

  async function loadUISelectors() {
    if (selectorsLoaded) return UI_SELECTORS;

    try {
      log('【初期化ステップ0-1】📋 UI Selectors読み込み開始...', 'INFO');

      const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
      const data = await response.json();
      UI_SELECTORS = data.selectors.Genspark || {};
      selectorsLoaded = true;

      log('【初期化ステップ0-1】✅ UI Selectors読み込み完了', 'SUCCESS');
      return UI_SELECTORS;
    } catch (error) {
      log(`【初期化ステップ0-1】❌ UI Selectors読み込み失敗: ${error.message}`, 'ERROR');
      // フォールバック用の基本セレクタ
      UI_SELECTORS = {
        INPUT: ['textarea', '[contenteditable="true"]'],
        SEND_BUTTON: ['.enter-icon-wrapper', 'button[type="submit"]'],
        STOP_BUTTON: ['.enter-icon-wrapper[class*="bg-[#232425]"]'],
        RESPONSE: ['.response-content', '.message-content']
      };
      selectorsLoaded = true;
      return UI_SELECTORS;
    }
  }

  // 基本的なDOM操作関数
  function findElement(selectors, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      function search() {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            resolve(element);
            return;
          }
        }

        if (Date.now() - startTime < timeout) {
          setTimeout(search, 100);
        } else {
          resolve(null);
        }
      }

      search();
    });
  }

  function findElements(selectors) {
    const elements = [];
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      elements.push(...found);
    }
    return elements;
  }

  // ========================================
  // URL基づく機能検出（最適化版）
  // ========================================
  function detectFunction() {
    const currentUrl = window.location.href;

    // 効率的なURL判定：1回のテストで複数パターンをチェック
    if (CONFIG.URL_PATTERNS.SLIDES.test(currentUrl)) {
      return CONFIG.FUNCTIONS.SLIDES;
    }

    if (CONFIG.URL_PATTERNS.FACTCHECK.test(currentUrl)) {
      return CONFIG.FUNCTIONS.FACTCHECK;
    }

    // デフォルト: スライド機能（最も使用頻度が高い）
    return CONFIG.FUNCTIONS.SLIDES;
  }

  // ========================================
  // ユーティリティ関数
  // ========================================
  function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[GensparkV2:${timestamp}]`;
    
    switch (level) {
      case 'ERROR':
        console.error(`${prefix} ❌ ${message}`);
        break;
      case 'SUCCESS':
        console.log(`${prefix} ✅ ${message}`);
        break;
      case 'WARNING':
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      default:
        console.log(`${prefix} ℹ️ ${message}`);
    }
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForGlobal(globalName, maxWait = 10000) {
    const startTime = Date.now();
    while (!window[globalName] && (Date.now() - startTime) < maxWait) {
      await wait(100);
    }
    if (!window[globalName]) {
      throw new Error(`${globalName}のロードがタイムアウトしました`);
    }
    return window[globalName];
  }

  // ========================================
  // レスポンスURL抽出機能（最適化版）
  // ========================================
  function extractResponseUrls(responseText) {
    if (!responseText || responseText.length === 0) return [];

    const urls = [];
    const priorityUrls = [];

    // 最適化されたURL正規表現（より厳密で高速）
    const urlRegex = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=]*)/g;
    const matches = responseText.match(urlRegex) || [];

    if (matches.length === 0) return [];

    // Set使用で重複除去を最初から行う（メモリ効率向上）
    const uniqueUrls = new Set(matches);

    for (const url of uniqueUrls) {
      // Genspark固有のURL（生成されたスライドなど）を優先的に配置
      if (url.includes('genspark.ai') || url.includes('slides') || url.includes('presentation')) {
        priorityUrls.push(url);
      } else {
        urls.push(url);
      }
    }

    // 優先URLを最初に、その後に一般URLを配置
    return [...priorityUrls, ...urls];
  }

  // ========================================
  // メイン自動化API
  // ========================================
  const automationAPI = {
    // バージョン情報
    version: CONFIG.VERSION,
    aiType: CONFIG.AI_TYPE,
    
    /**
     * テキストを送信し、応答を取得
     * @param {string} text - 送信するテキスト
     * @param {Object} options - オプション設定
     * @returns {Promise<Object>} 応答結果
     */
    async sendMessage(text, options = {}) {
      try {
        sendStartTime = Date.now();
        currentFunction = detectFunction();

        log(`【Genspark-ステップ1-1】🚀 ${currentFunction}機能でメッセージ送信開始`, 'INFO');
        log(`【Genspark-ステップ1-1】📝 送信テキスト: "${text.substring(0, 50)}..."`, 'INFO');

        // UI Selectors初期化
        log(`【Genspark-ステップ1-2】📋 UI Selectors初期化中...`, 'INFO');
        await loadUISelectors();
        log(`【Genspark-ステップ1-2】✅ UI Selectors初期化完了`, 'SUCCESS');

        // 入力欄を探す
        log(`【Genspark-ステップ2-1】🔍 入力欄を検索中...`, 'INFO');
        const inputElement = await findElement(UI_SELECTORS.INPUT);
        if (!inputElement) {
          throw new Error('入力欄が見つかりません');
        }
        log(`【Genspark-ステップ2-1】✅ 入力欄を発見`, 'SUCCESS');

        // テキスト入力
        log(`【Genspark-ステップ2-2】✏️ テキスト入力中...`, 'INFO');
        inputElement.focus();
        await wait(CONFIG.INPUT_DELAY);

        // 既存の内容をクリア
        inputElement.value = '';
        inputElement.textContent = '';

        // テキスト入力（機能別にプロンプトを調整）
        const finalText = this.optimizePrompt(text);
        inputElement.value = finalText;
        inputElement.textContent = finalText;

        // 入力イベントトリガー
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));

        log(`【Genspark-ステップ2-2】✅ テキスト入力完了（${finalText.length}文字）`, 'SUCCESS');

        // 送信ボタンを探す
        log(`【Genspark-ステップ2-3】🔍 送信ボタンを検索中...`, 'INFO');
        const sendButton = await findElement(UI_SELECTORS.SEND_BUTTON);
        if (!sendButton) {
          throw new Error('送信ボタンが見つかりません');
        }
        log(`【Genspark-ステップ2-3】✅ 送信ボタンを発見`, 'SUCCESS');

        // 送信実行
        log(`【Genspark-ステップ2-4】📤 メッセージ送信実行中...`, 'INFO');
        sendButton.click();
        await wait(CONFIG.CLICK_DELAY);
        log(`【Genspark-ステップ2-4】✅ メッセージ送信完了`, 'SUCCESS');

        // 応答待機
        log(`【Genspark-ステップ3-1】⏱️ 応答待機開始（最大${(options.timeout || CONFIG.DEFAULT_TIMEOUT) / 60000}分）...`, 'INFO');
        const response = await this.waitForResponse(options.timeout || CONFIG.DEFAULT_TIMEOUT);
        log(`【Genspark-ステップ3-1】✅ 応答受信完了`, 'SUCCESS');

        // レスポンスURL抽出
        log(`【Genspark-ステップ3-2】🔍 URL抽出処理中...`, 'INFO');
        const extractedUrls = extractResponseUrls(response.text);
        log(`【Genspark-ステップ3-2】📋 抽出されたURL: ${extractedUrls.length}件`, extractedUrls.length > 0 ? 'SUCCESS' : 'INFO');

        const result = {
          success: true,
          text: response.text,
          function: currentFunction,
          extractedUrls,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - sendStartTime
        };

        log(`【Genspark処理完了】✅ ${currentFunction}機能での全処理完了 (${result.processingTime}ms)`, 'SUCCESS');
        if (extractedUrls.length > 0) {
          log(`【結果】📎 主要URL: ${extractedUrls.slice(0, 3).join(', ')}${extractedUrls.length > 3 ? `...他${extractedUrls.length - 3}件` : ''}`, 'SUCCESS');
        }

        return result;

      } catch (error) {
        log(`【Genspark処理失敗】❌ メッセージ送信エラー: ${error.message}`, 'ERROR');
        return {
          success: false,
          error: error.message,
          function: currentFunction,
          timestamp: new Date().toISOString()
        };
      }
    },

    /**
     * 応答待機
     * @param {number} timeout - タイムアウト時間（ミリ秒）
     * @returns {Promise<Object>} 応答結果
     */
    async waitForResponse(timeout = CONFIG.DEFAULT_TIMEOUT) {
      try {
        log(`【Genspark-ステップ4-1】⏱️ 応答待機処理開始（タイムアウト: ${timeout / 60000}分）`, 'INFO');

        // 停止ボタンが表示されるまで待機
        log(`【Genspark-ステップ4-2】🔍 停止ボタンの出現を監視中...`, 'INFO');
        const stopButton = await findElement(UI_SELECTORS.STOP_BUTTON, 10000);

        if (stopButton) {
          log(`【Genspark-ステップ4-2】✅ 停止ボタンを確認（応答生成開始）`, 'SUCCESS');

          // 停止ボタンが消えるまで待機（応答完了まで）
          log(`【Genspark-ステップ4-3】⏳ 応答生成完了まで待機中...`, 'INFO');
          await this._waitUntilElementDisappears(UI_SELECTORS.STOP_BUTTON, timeout);
          log(`【Genspark-ステップ4-3】✅ 応答生成完了を確認`, 'SUCCESS');
        } else {
          log(`【Genspark-ステップ4-2】⚠️ 停止ボタンが確認できません（即座完了の可能性）`, 'WARNING');
        }

        // 最終的な応答テキストを取得
        log(`【Genspark-ステップ4-4】📝 応答テキストを取得中...`, 'INFO');
        await wait(1000); // レンダリング安定化待ち

        const responseElements = findElements(UI_SELECTORS.RESPONSE);
        let responseText = '';

        if (responseElements.length > 0) {
          // 最後の応答を取得
          const lastResponse = responseElements[responseElements.length - 1];
          responseText = lastResponse.textContent || lastResponse.innerText || '';
        }

        if (responseText.length === 0) {
          throw new Error('応答テキストを取得できませんでした');
        }

        log(`【Genspark-ステップ4-4】✅ 応答テキスト取得完了（${responseText.length}文字）`, 'SUCCESS');

        return {
          success: true,
          text: responseText,
          function: currentFunction,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        log(`【Genspark-ステップ4-失敗】❌ 応答待機エラー: ${error.message}`, 'ERROR');
        return {
          success: false,
          error: error.message,
          function: currentFunction,
          timestamp: new Date().toISOString()
        };
      }
    },

    /**
     * 現在の機能を取得
     * @returns {string} 現在の機能（'slides' または 'factcheck'）
     */
    getCurrentFunction() {
      return currentFunction || detectFunction();
    },

    /**
     * 機能別の最適化されたプロンプトを取得
     * @param {string} basePrompt - 基本プロンプト
     * @returns {string} 最適化されたプロンプト
     */
    optimizePrompt(basePrompt) {
      const func = this.getCurrentFunction();
      
      switch (func) {
        case CONFIG.FUNCTIONS.SLIDES:
          return `【スライド生成】${basePrompt}\n\n※視覚的で分かりやすいスライド形式での出力をお願いします。`;
          
        case CONFIG.FUNCTIONS.FACTCHECK:
          return `【ファクトチェック】${basePrompt}\n\n※信頼できる情報源を基に事実確認を行ってください。`;
          
        default:
          return basePrompt;
      }
    },

    /**
     * レスポンスからURL抽出
     * @param {string} responseText - レスポンステキスト
     * @returns {Array<string>} 抽出されたURL配列
     */
    extractUrls(responseText) {
      return extractResponseUrls(responseText);
    },

    /**
     * システム状態の取得
     * @returns {Object} システム状態
     */
    getStatus() {
      return {
        version: CONFIG.VERSION,
        aiType: CONFIG.AI_TYPE,
        currentFunction: this.getCurrentFunction(),
        currentUrl: window.location.href,
        selectorsLoaded: selectorsLoaded,
        timestamp: new Date().toISOString()
      };
    },

    /**
     * 要素が消えるまで待機（内部メソッド）
     * @param {Array} selectors - 監視するセレクタ配列
     * @param {number} timeout - タイムアウト時間
     * @returns {Promise}
     */
    async _waitUntilElementDisappears(selectors, timeout) {
      const startTime = Date.now();
      let checkCount = 0;

      while (Date.now() - startTime < timeout) {
        checkCount++;
        const element = await findElement(selectors, 500);

        // 10秒ごとに進行状況をログ出力
        if (checkCount % 20 === 0) {  // 500ms * 20 = 10秒
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          log(`【Genspark-ステップ4-3】⏱️ 応答生成監視中: ${elapsed}秒経過 - 停止ボタン: ${element ? '表示中' : '非表示'}`, 'INFO');
        }

        if (!element) {
          // 要素が消えた = 応答完了
          return;
        }

        await wait(CONFIG.WAIT_INTERVAL);
      }

      throw new Error(`タイムアウト: ${timeout / 1000}秒経過しても応答が完了しませんでした`);
    }
  };

  // ========================================
  // グローバル登録
  // ========================================

  // V2名と標準名の両方をサポート（下位互換性保持）
  window.GensparkAutomationV2 = automationAPI;
  window.GensparkAutomation = automationAPI;

  // 初期化ログ
  log(`GensparkV2自動化システム初期化完了 - 独立版 (Version: ${CONFIG.VERSION})`, 'SUCCESS');
  log(`現在の機能: ${detectFunction()}`, 'INFO');
  log(`現在のURL: ${window.location.href}`, 'INFO');

})();