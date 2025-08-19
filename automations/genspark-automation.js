/**
 * @fileoverview Genspark自動化関数 実装
 * Version: 1.0.0
 * 作成日: 2025年8月10日
 * 
 * 【役割】
 * Genspark専用の自動化処理を提供（スライド生成特化）
 * 
 * 【主要機能】
 * - スライド生成機能の自動化
 * - テキスト入力と送信
 * - 応答待機（停止ボタンの状態監視）
 * - 応答テキストの取得
 * 
 * 【依存関係】
 * - ui-selectors.js: Genspark用セレクタを使用（window.AIHandler経由）
 * 
 * 【特記事項】
 * - Gensparkはモデル選択機能がない
 * - スライド生成専用のAI
 * - common-ai-handler.jsは使用していない（独立実装）
 * 
 * 【グローバル公開】
 * window.GensparkAutomation: コンソールから直接呼び出し可能
 */

(() => {
  "use strict";

  // ========================================
  // 設定定数
  // ========================================
  const CONFIG = {
    DEFAULT_TIMEOUT: 3600000,  // デフォルトタイムアウト: 60分
    WAIT_INTERVAL: 1000,       // 待機間隔: 1秒
    CLICK_DELAY: 500,          // クリック後の待機: 0.5秒
    INPUT_DELAY: 300,          // 入力後の待機: 0.3秒
    SCROLL_DELAY: 200,         // スクロール後の待機: 0.2秒
    MINUTE_MS: 60000,          // 1分 = 60000ミリ秒
    SECOND_MS: 1000            // 1秒 = 1000ミリ秒
  };

  // ========================================
  // グローバル変数
  // ========================================
  let sendStartTime = null;  // 送信開始時刻を記録

  // ========================================
  // ユーティリティ関数
  // ========================================
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const log = (message, type = 'info', consoleOnly = false) => {
    const prefix = '[Genspark]';
    const styles = {
      info: 'color: #2196F3',
      success: 'color: #4CAF50',
      warning: 'color: #FF9800',
      error: 'color: #F44336'
    };
    
    // コンソールには常に出力
    console.log(`%c${prefix} ${message}`, styles[type] || styles.info);
    
    // 拡張機能へのログ送信（consoleOnlyがfalseの場合のみ）
    if (!consoleOnly && window.chrome?.runtime?.sendMessage) {
      try {
        window.chrome.runtime.sendMessage({
          action: 'extensionLog',
          message: `Genspark: ${message}`,
          type: type
        });
      } catch (e) {
        // 拡張機能との通信エラーは無視
      }
    }
  };

  // ========================================
  // セレクタ定義
  // ========================================
  const SELECTORS = {
    textInput: [
      'textarea[name="query"]',
      '.search-input',
      '.j-search-input',
      'textarea.search-input.j-search-input',
      '.prompt-input-wrapper-upper textarea',
      '.textarea-wrapper textarea',
      'textarea[placeholder*="スライド"]',
      'textarea[placeholder*="質問"]',
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]'
    ],
    submitButton: [
      // 最新UI（最優先） - アクティブな送信ボタン
      '.enter-icon.active',
      '.enter-icon-wrapper.active',
      '.enter-icon.cursor-pointer.active',
      // 背景色による判定（黒系 = 送信可能）
      '.enter-icon-wrapper[class*="bg-[#262626]"]',
      '.enter-icon-wrapper[class*="bg-black"]',
      '.enter-icon-wrapper[class*="text-white"]',
      // 通常の送信ボタン
      'div[class*="enter-icon"][class*="active"]',
      '.input-icon .enter-icon:not([class*="bg-[#f4f4f4]"])',
      // フォールバック
      'button[type="submit"]:not(:disabled)',
      '.submit-button',
      'button:has(svg)',
      '[role="button"]'
    ],
    stopButton: [
      // 最新UI（最優先） - 戻る矢印アイコンを含むボタン
      '.enter-icon-wrapper:has(svg path[d*="M20.0001 5C20.0001"])',
      '.enter-icon-wrapper:has(svg path[fill-rule="evenodd"][clip-rule="evenodd"])',
      // 背景色による判定
      '.enter-icon-wrapper.bg-\\[\\#f4f4f4\\]',
      '.enter-icon-wrapper[class*="bg-[#f4f4f4]"]',
      '.enter-icon-wrapper[class*="text-[#909499]"]',
      // 旧セレクタ
      '.stop-icon',
      '.enter-icon-wrapper[class*="bg-[#232425]"]',
      'svg.stop-icon',
      '.input-icon .enter-icon-wrapper[class*="bg-[#232425]"]',
      // aria-labelフォールバック
      '[aria-label*="停止"]',
      '[aria-label*="stop"]',
      '[aria-label*="Stop"]'
    ],
    responseContainer: [
      '.response-container',
      '.answer-container',
      '.result-container',
      '.spark-content',
      '.message-content',
      '[class*="response"]',
      '[class*="answer"]',
      '.ai-response',
      '.generated-content'
    ],
    functionButtons: [
      '[data-agent-type]',
      '.agent-type-button',
      '.function-selector button',
      '.tab-button',
      '[role="tab"]',
      '.navigation-item'
    ]
  };

  // ========================================
  // DOM操作ヘルパー
  // ========================================
  const findElement = (selectors, description = 'element', checkVisible = true) => {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (element) {
            // 可視性チェック
            if (checkVisible && element.offsetParent === null) {
              continue; // 非表示の要素はスキップ
            }
            log(`${description}を発見: ${selector}`, 'success');
            return element;
          }
        }
      } catch (e) {
        // セレクタエラーは無視
      }
    }
    log(`${description}が見つかりません`, 'warning');
    return null;
  };

  const findAllElements = (selectors) => {
    const elements = [];
    for (const selector of selectors) {
      try {
        const found = document.querySelectorAll(selector);
        elements.push(...found);
      } catch (e) {
        // セレクタエラーは無視
      }
    }
    return elements;
  };

  const clickElement = async (element) => {
    if (!element) return false;
    
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(CONFIG.SCROLL_DELAY);
      element.click();
      await wait(CONFIG.CLICK_DELAY);
      return true;
    } catch (e) {
      // MouseEventで再試行
      try {
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        element.dispatchEvent(event);
        await wait(CONFIG.CLICK_DELAY);
        return true;
      } catch (e2) {
        log(`クリック失敗: ${e2.message}`, 'error');
        return false;
      }
    }
  };

  // ========================================
  // 実装関数
  // ========================================
  
  /**
   * 1. モデル選択
   * Gensparkにモデル選択がない場合は空実装
   */
  const selectModel = async (modelId) => {
    log(`モデル選択: ${modelId}`);
    
    // Gensparkにモデル選択機能があるか確認
    const modelSelectors = window.AIHandler?.getSelectors?.('Genspark', 'MODEL_BUTTON') || ['[data-model]', '.model-selector', 'select[name="model"]'];
    let modelButtons = [];
    for (const selector of modelSelectors) {
      modelButtons.push(...document.querySelectorAll(selector));
    }
    
    if (modelButtons.length > 0) {
      for (const button of modelButtons) {
        if (button.textContent?.toLowerCase().includes(modelId.toLowerCase())) {
          await clickElement(button);
          log(`✅ モデルを「${modelId}」に変更しました`, 'success');
          return true;
        }
      }
    }
    
    // モデル選択機能がない場合
    log('Gensparkにモデル選択機能はありません', 'info');
    return true;
  };

  /**
   * 2. 機能選択
   * Gensparkのスライド生成とファクトチェックに対応
   */
  const selectFunction = async (functionId) => {
    log(`⚙️ 機能選択: ${functionId}`);
    
    // 機能URLマッピング
    const functionUrls = {
      'slides': 'https://www.genspark.ai/agents?type=slides_agent',
      'factcheck': 'https://www.genspark.ai/agents?type=agentic_cross_check',
      'fact-check': 'https://www.genspark.ai/agents?type=agentic_cross_check',
      'cross-check': 'https://www.genspark.ai/agents?type=agentic_cross_check'
    };
    
    // 機能名の正規化
    const normalizedFunction = functionId.toLowerCase().replace(/[\s_-]/g, '');
    let targetUrl = null;
    let functionName = '';
    
    if (normalizedFunction.includes('slide')) {
      targetUrl = functionUrls['slides'];
      functionName = 'スライド生成';
    } else if (normalizedFunction.includes('fact') || normalizedFunction.includes('check') || normalizedFunction.includes('cross')) {
      targetUrl = functionUrls['factcheck'];
      functionName = 'ファクトチェック';
    } else {
      // デフォルトはスライド生成
      log(`不明な機能「${functionId}」。スライド生成を使用します`, 'warning');
      targetUrl = functionUrls['slides'];
      functionName = 'スライド生成';
    }
    
    log(`✅ 機能を「${functionName}」に設定しました`, 'success');
    
    if (!window.location.href.includes('genspark.ai')) {
      log(`Gensparkのページを開いてください: ${targetUrl}`, 'info');
      window.location.href = targetUrl;
      return 'page_reload_required';
    }
    
    // 既に正しいページにいる場合
    const currentUrl = window.location.href;
    if (currentUrl.includes('slides_agent') && functionName === 'スライド生成') {
      log('スライド生成ページにいます', 'success');
      return true;
    } else if (currentUrl.includes('agentic_cross_check') && functionName === 'ファクトチェック') {
      log('ファクトチェックページにいます', 'success');
      return true;
    }
    
    // URLを変更
    log(`${functionName}ページに移動します: ${targetUrl}`, 'info');
    window.location.href = targetUrl;
    return 'page_reload_required';
  };

  /**
   * 3. テキスト入力
   */
  const inputText = async (text) => {
    log('📝 テキスト入力開始');
    
    try {
      if (!text) {
        throw new Error('入力するテキストがありません');
      }
      
      log('テキスト入力を開始: ' + text.substring(0, 50) + '...', 'info', true);  // コンソールのみ
      
      // 優先順位付きセレクタで検索
      const selectors = [
        'textarea[name="query"].search-input',              // 最具体的
        'textarea.search-input.j-search-input',            // クラス組み合わせ  
        'textarea[name="query"]',                          // name属性
        '.j-search-input',                                 // 特定クラス
        'textarea[placeholder*="スライド"]',                 // フォールバック
        '.search-input',                                   // 旧セレクタ
        'textarea'                                         // 最終フォールバック
      ];
      
      let inputField = null;
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (element && element.offsetParent !== null) {
              inputField = element;
              log('入力欄発見: ' + selector, 'success', true);  // コンソールのみ
              break;
            }
          }
          if (inputField) break;
        } catch (e) {
          // セレクタエラーは無視
        }
      }
      
      if (!inputField) {
        throw new Error('入力欄が見つかりません');
      }
      
      // フォーカス
      inputField.focus();
      await wait(CONFIG.INPUT_DELAY);
      
      // 既存のテキストをクリア
      if (inputField.tagName === 'TEXTAREA' || inputField.tagName === 'INPUT') {
        inputField.value = '';
        inputField.value = text;
      } else if (inputField.contentEditable === 'true') {
        inputField.textContent = '';
        inputField.textContent = text;
      } else {
        inputField.value = text;
      }
      
      // イベント発火
      const events = ['input', 'change', 'keyup', 'keydown'];
      for (const eventType of events) {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        inputField.dispatchEvent(event);
      }
      
      // React用の追加処理
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ||
                                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputField, text);
        const ev = new Event('input', { bubbles: true });
        inputField.dispatchEvent(ev);
      }
      
      await wait(CONFIG.CLICK_DELAY);
      log('✅ テキストを入力しました: ' + text.length + '文字', 'success');
      return true;
      
    } catch (error) {
      log('テキスト入力エラー: ' + error.message, 'error');
      return false;
    }
  };

  /**
   * 4. メッセージ送信
   */
  const sendMessage = async () => {
    log('送信ボタンを探しています', 'info', true);  // コンソールのみ
    
    const sendButton = findElement(SELECTORS.submitButton, '送信ボタン');
    
    if (!sendButton) {
      log('送信ボタンが見つかりません', 'error');
      return false;
    }
    
    // ボタンが無効化されているかチェック
    if (sendButton.disabled || sendButton.classList.contains('disabled')) {
      log('送信ボタンが無効化されています', 'warning', true);  // コンソールのみ
      await wait(CONFIG.WAIT_INTERVAL);
    }
    
    await clickElement(sendButton);
    sendStartTime = Date.now();  // 送信時刻を記録
    log('📤 メッセージを送信しました', 'success');
    await wait(1000);
    
    return true;
  };

  /**
   * 5. 応答待機
   */
  const waitForResponse = async (timeout = CONFIG.DEFAULT_TIMEOUT) => {
    log('⏳ 応答待機開始');
    log(`タイムアウト設定: ${timeout}ms (${timeout/1000}秒)`, 'info', true);  // コンソールのみ
    
    // 停止ボタンを検出する関数
    const findStopButton = () => {
      // IMPORTANT: このセレクタはコンソールテストで動作確認済み (2025/08/10)
      // - 回答中: bg-[#232425] (ダークグレー) の停止ボタンが表示
      // - 完了後: bg-[#f4f4f4] (ライトグレー) の戻るボタンに変化
      // 
      // 以下のセレクタは動作しなかった:
      // - svg.stop-icon: 要素は存在するが背景色での判定の方が確実
      // - .stop-icon: 同上
      // - :has() セレクタ: ブラウザサポートが不安定
      // - 複雑な複合セレクタ: セレクタエラーが発生
      const stopSelectors = window.AIHandler?.getSelectors?.('Genspark', 'STOP_BUTTON') || ['.enter-icon-wrapper[class*="bg-[#232425]"]'];
      let stopButton = null;
      for (const selector of stopSelectors) {
        stopButton = document.querySelector(selector);
        if (stopButton) break;
      }
      return stopButton && stopButton.offsetParent !== null;
    };
    
    const startTime = Date.now();
    
    // 1. 停止ボタンが出現するまで待つ（制限なし）
    log('停止ボタンの出現を待機中...', 'info', true);  // コンソールのみ
    let waitCount = 0;
    while (!findStopButton()) {
      await wait(CONFIG.WAIT_INTERVAL);
      waitCount++;
      // 詳細ログはコンソールのみ
      if (waitCount % 5 === 0) {  // 5秒ごとにコンソールに出力
        log(`[${waitCount}秒] 停止ボタン待機中...`, 'info', true);
      }
    }
    
    log('🔴 停止ボタンを検出 - 生成中', 'info');  // 拡張機能にも送信
    
    // 2. 停止ボタンが消えるまで待つ（最大タイムアウトまで）
    let lastMinuteLogged = 0;
    let stopWaitCount = 0;
    while (findStopButton() && (Date.now() - startTime < timeout)) {
      await wait(CONFIG.WAIT_INTERVAL);
      stopWaitCount++;
      
      // 詳細ログはコンソールのみ（10秒ごと）
      if (stopWaitCount % 10 === 0) {
        log(`[${stopWaitCount}秒] 停止ボタン状態: ${findStopButton() ? '🔴 あり(回答中)' : '✅ なし(完了)'}`, 'info', true);
      }
      
      // 1分ごとに拡張機能にもログ
      const elapsedMinutes = Math.floor((Date.now() - startTime) / CONFIG.MINUTE_MS);
      if (elapsedMinutes > lastMinuteLogged) {
        lastMinuteLogged = elapsedMinutes;
        log(`⏳ 生成中... (${elapsedMinutes}分経過)`, 'info');  // 拡張機能にも送信
      }
    }
    
    if (findStopButton()) {
      log(`応答待機タイムアウト (${timeout/CONFIG.SECOND_MS}秒経過)`, 'warning');
      return false;
    }
    
    // 経過時間を計算（送信時刻から）
    if (sendStartTime) {
      const elapsedTotal = Date.now() - sendStartTime;
      const minutes = Math.floor(elapsedTotal / CONFIG.MINUTE_MS);
      const seconds = Math.floor((elapsedTotal % CONFIG.MINUTE_MS) / CONFIG.SECOND_MS);
      log(`✅ 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'success');
    } else {
      // 待機開始時刻からの計算（フォールバック）
      const elapsedTotal = Date.now() - startTime;
      const minutes = Math.floor(elapsedTotal / CONFIG.MINUTE_MS);
      const seconds = Math.floor((elapsedTotal % CONFIG.MINUTE_MS) / CONFIG.SECOND_MS);
      log(`✅ 応答完了（${minutes}分${seconds}秒経過）`, 'success');
    }
    
    await wait(1000);  // 念のため1秒待つ
    return true;
  };

  /**
   * 6. 応答取得
   */
  const getResponse = async () => {
    log('📋 応答テキスト取得開始');
    
    // 複数のセレクタで応答コンテナを探す
    const responseContainer = findElement(SELECTORS.responseContainer, '応答コンテナ');
    
    if (!responseContainer) {
      // 代替方法: 最後のメッセージを探す
      const messageSelectors = window.AIHandler?.getSelectors?.('Genspark', 'MESSAGE') || ['[class*="message"]', '[class*="response"]', 'div[role="article"]'];
      let allMessages = [];
      for (const selector of messageSelectors) {
        allMessages.push(...document.querySelectorAll(selector));
      }
      
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        const text = lastMessage.textContent?.trim();
        if (text) {
          log(`✅ 応答取得成功 (代替方法): ${text.substring(0, 100)}...`, 'success');
          return text;
        }
      }
    }
    
    if (responseContainer) {
      const text = responseContainer.textContent?.trim();
      if (text) {
        log(`✅ 応答取得成功: ${text.substring(0, 100)}...`, 'success');
        return text;
      }
    }
    
    log('応答テキストが見つかりません', 'warning');
    return null;
  };
  
  /**
   * 6.5. 応答URL取得
   * 生成完了後のURLを取得（スライドやファクトチェック結果のURL）
   */
  const getResponseUrl = async () => {
    log('🔗 応答URL取得開始');
    
    // 現在のURLを取得
    const currentUrl = window.location.href;
    
    // URLパラメータを確認（結果が含まれている可能性）
    const urlParams = new URLSearchParams(window.location.search);
    const resultId = urlParams.get('result') || urlParams.get('id');
    
    if (resultId) {
      log(`✅ 結果ID取得: ${resultId}`, 'success');
      log(`✅ 応答URL: ${currentUrl}`, 'success');
      return currentUrl;
    }
    
    // リンク要素を探す（生成完了後にリンクが表示される場合）
    const linkSelectors = [
      'a[href*="/result"]',
      'a[href*="/share"]',
      'a[href*="/slides"]',
      'a[href*="/check"]',
      '.result-link',
      '.share-link'
    ];
    
    for (const selector of linkSelectors) {
      const links = document.querySelectorAll(selector);
      if (links.length > 0) {
        const resultUrl = links[0].href;
        log(`✅ 結果リンク発見: ${resultUrl}`, 'success');
        return resultUrl;
      }
    }
    
    // URLが変更されている場合（リダイレクト後）
    if (currentUrl !== window.location.origin + '/agents') {
      log(`✅ 現在のURL（結果ページ）: ${currentUrl}`, 'success');
      return currentUrl;
    }
    
    log('応答URLが見つかりません', 'warning');
    return null;
  };

  /**
   * 7. 自動化実行
   */
  const runAutomation = async (config = {}) => {
    const defaultConfig = {
      model: 'default',
      function: 'slides',
      text: '桃太郎についてスライド4枚で解説して',
      send: true,
      waitResponse: true,
      getResponse: true
    };
    
    const finalConfig = { ...defaultConfig, ...config };
    log('🚀 自動化実行開始', 'info');
    log(`設定: ${JSON.stringify(finalConfig)}`, 'info', true);  // 詳細はコンソールのみ
    
    const result = {
      success: false,
      model: null,
      function: null,
      text: null,
      response: null,
      error: null
    };
    
    try {
      // 1. モデル選択（必要な場合）
      if (finalConfig.model && finalConfig.model !== 'default') {
        await selectModel(finalConfig.model);
        result.model = finalConfig.model;
      }
      
      // 2. 機能選択
      if (finalConfig.function) {
        const functionResult = await selectFunction(finalConfig.function);
        if (functionResult === 'page_reload_required') {
          log('ページリロードが必要です。再実行してください。', 'warning');
          return result;
        }
        result.function = finalConfig.function;
      }
      
      await wait(CONFIG.WAIT_INTERVAL);
      
      // 3. テキスト入力
      if (finalConfig.text) {
        const inputResult = await inputText(finalConfig.text);
        if (!inputResult) {
          throw new Error('テキスト入力に失敗しました');
        }
        result.text = finalConfig.text;
      }
      
      // 4. 送信
      if (finalConfig.send) {
        const sendResult = await sendMessage();
        if (!sendResult) {
          throw new Error('送信に失敗しました');
        }
      }
      
      // 5. 応答待機
      if (finalConfig.waitResponse) {
        // タイムアウトを明示的に設定（デフォルト: 60分）
        const timeoutMs = finalConfig.timeout || 3600000; // 60分
        log(`応答待機タイムアウト: ${timeoutMs}ms (${timeoutMs/1000}秒)`, 'info', true);  // コンソールのみ
        const waitResult = await waitForResponse(timeoutMs);
        if (!waitResult) {
          throw new Error('応答待機がタイムアウトしました');
        }
      }
      
      // 6. 応答取得
      if (finalConfig.getResponse) {
        const response = await getResponse();
        result.response = response;
      }
      
      // 7. 応答URL取得（デフォルトで有効）
      if (finalConfig.getResponseUrl !== false) {  // 明示的にfalseでない限り実行
        const responseUrl = await getResponseUrl();
        result.responseUrl = responseUrl;
        if (responseUrl) {
          log(`🔗 結果URL: ${responseUrl}`, 'success');
        }
      }
      
      result.success = true;
      log('✅ 自動化実行完了', 'success');
      
    } catch (error) {
      log(`エラー発生: ${error.message}`, 'error');
      result.error = error.message;
    }
    
    return result;
  };

  // ========================================
  // デバッグ用ヘルパー関数
  // ========================================
  const debug = {
    // すべてのボタンを表示
    showAllButtons: () => {
      const buttonSelectors = window.AIHandler?.getSelectors?.('Genspark', 'ALL_BUTTONS') || ['button', '[role="button"]'];
      let buttons = [];
      for (const selector of buttonSelectors) {
        buttons.push(...document.querySelectorAll(selector));
      }
      console.log(`ボタン数: ${buttons.length}`);
      buttons.forEach((btn, i) => {
        console.log(`${i}: ${btn.textContent?.trim().substring(0, 50)}`);
      });
      return buttons;
    },
    
    // すべての入力欄を表示
    showAllInputs: () => {
      const inputSelectors = window.AIHandler?.getSelectors?.('Genspark', 'INPUT') || ['textarea', 'input', '[contenteditable="true"]'];
      let inputs = [];
      for (const selector of inputSelectors) {
        inputs.push(...document.querySelectorAll(selector));
      }
      console.log(`入力欄数: ${inputs.length}`);
      inputs.forEach((input, i) => {
        console.log(`${i}: ${input.tagName} - ${input.placeholder || input.name || 'no-id'}`);
      });
      return inputs;
    },
    
    // 特定のテキストを含む要素を検索
    findByText: (text) => {
      const elementSelectors = window.AIHandler?.getSelectors?.('Genspark', 'ALL_ELEMENTS') || ['*'];
      let allElements = [];
      for (const selector of elementSelectors) {
        allElements.push(...document.querySelectorAll(selector));
      }
      const found = [];
      allElements.forEach(el => {
        if (el.textContent?.includes(text) && el.children.length === 0) {
          found.push(el);
        }
      });
      console.log(`"${text}"を含む要素: ${found.length}個`);
      return found;
    }
  };

  // ========================================
  // グローバル公開
  // ========================================
  window.GensparkAutomation = {
    // メイン関数
    selectModel,
    selectFunction,
    inputText,
    sendMessage,
    waitForResponse,
    getResponse,
    runAutomation,
    
    // ユーティリティ
    wait,
    findElement,
    clickElement,
    
    // デバッグ
    debug,
    
    // 設定
    SELECTORS,
    CONFIG,
    
    // ヘルプ
    help: () => {
      console.log('%c🚀 Genspark Automation API', 'color: #4CAF50; font-size: 16px; font-weight: bold');
      console.log('━'.repeat(50));
      console.log('\n📌 基本的な使い方:');
      console.log('');
      console.log('// テキスト入力と送信');
      console.log('await GensparkAutomation.inputText("こんにちは");');
      console.log('await GensparkAutomation.sendMessage();');
      console.log('');
      console.log('// 応答を待って取得');
      console.log('await GensparkAutomation.waitForResponse();');
      console.log('const response = await GensparkAutomation.getResponse();');
      console.log('');
      console.log('// スライド生成自動実行');
      console.log('await GensparkAutomation.runAutomation({');
      console.log('  text: "AIについてのスライドを作成",');
      console.log('  send: true,');
      console.log('  waitResponse: true,');
      console.log('  getResponse: true');
      console.log('});');
      console.log('');
      console.log('📊 デバッグ:');
      console.log('GensparkAutomation.debug.showAllButtons(); // 全ボタン表示');
      console.log('GensparkAutomation.debug.showAllInputs();  // 全入力欄表示');
      console.log('GensparkAutomation.debug.findByText("送信"); // テキスト検索');
    }
  };

  // 初期化完了メッセージ
  console.log('%c✅ Genspark自動化関数が利用可能になりました', 'color: #4CAF50; font-weight: bold');
  console.log('ヘルプ: GensparkAutomation.help()');
})();