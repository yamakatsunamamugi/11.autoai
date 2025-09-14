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
  // 共通ハンドラーの初期化
  // ========================================
  async function initializeHandler() {
    if (menuHandler) return menuHandler;
    
    try {
      // common-ai-handler.jsの読み込み待機
      if (!window.AIHandler) {
        await waitForGlobal('AIHandler');
      }
      
      menuHandler = new window.AIHandler.MenuHandler(CONFIG.AI_TYPE);
      await menuHandler.initialize();
      
      log('GensparkV2ハンドラー初期化完了', 'SUCCESS');
      return menuHandler;
    } catch (error) {
      log(`GensparkV2ハンドラー初期化失敗: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  // ========================================
  // URL基づく機能検出
  // ========================================
  function detectFunction() {
    const currentUrl = window.location.href;
    
    if (CONFIG.URL_PATTERNS.SLIDES.test(currentUrl)) {
      return CONFIG.FUNCTIONS.SLIDES;
    } else if (CONFIG.URL_PATTERNS.FACTCHECK.test(currentUrl)) {
      return CONFIG.FUNCTIONS.FACTCHECK;
    }
    
    // デフォルト: URLから推測できない場合はスライド機能
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
  // レスポンスURL抽出機能
  // ========================================
  function extractResponseUrls(responseText) {
    if (!responseText) return [];
    
    const urls = [];
    const urlRegex = /https?:\/\/[^\s<>"]{2,}/g;
    const matches = responseText.match(urlRegex) || [];
    
    matches.forEach(url => {
      // Genspark固有のURL（生成されたスライドなど）を優先
      if (url.includes('genspark.ai') || url.includes('slides') || url.includes('presentation')) {
        urls.unshift(url);
      } else {
        urls.push(url);
      }
    });
    
    return [...new Set(urls)]; // 重複除去
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
        
        log(`${currentFunction}機能でメッセージ送信開始: "${text.substring(0, 50)}..."`, 'INFO');
        
        // ハンドラー初期化
        const handler = await initializeHandler();
        
        // メッセージ送信
        await handler.sendMessage(text, {
          timeout: options.timeout || CONFIG.DEFAULT_TIMEOUT,
          waitForResponse: options.waitForResponse !== false,
          ...options
        });
        
        // 応答待機
        const response = await this.waitForResponse(options.timeout || CONFIG.DEFAULT_TIMEOUT);
        
        // レスポンスURL抽出
        const extractedUrls = extractResponseUrls(response.text);
        
        const result = {
          success: true,
          text: response.text,
          function: currentFunction,
          extractedUrls,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - sendStartTime
        };
        
        log(`${currentFunction}機能での応答取得完了 (${result.processingTime}ms)`, 'SUCCESS');
        if (extractedUrls.length > 0) {
          log(`抽出されたURL: ${extractedUrls.slice(0, 3).join(', ')}${extractedUrls.length > 3 ? '...' : ''}`, 'INFO');
        }
        
        return result;
        
      } catch (error) {
        log(`メッセージ送信エラー: ${error.message}`, 'ERROR');
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
        const handler = await initializeHandler();
        const response = await handler.waitForResponse(timeout);
        
        return {
          success: true,
          text: response,
          function: currentFunction,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        log(`応答待機エラー: ${error.message}`, 'ERROR');
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
        handlerInitialized: !!menuHandler,
        timestamp: new Date().toISOString()
      };
    }
  };

  // ========================================
  // グローバル登録
  // ========================================
  
  // V2名と標準名の両方をサポート（下位互換性保持）
  window.GensparkAutomationV2 = automationAPI;
  window.GensparkAutomation = automationAPI;

  // 初期化ログ
  log(`GensparkV2自動化システム初期化完了 (Version: ${CONFIG.VERSION})`, 'SUCCESS');
  log(`現在の機能: ${detectFunction()}`, 'INFO');
  log(`現在のURL: ${window.location.href}`, 'INFO');

})();