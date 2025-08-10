/**
 * Genspark自動化関数 実装
 * Version: 1.0.0
 * 作成日: 2025年8月10日
 */

(() => {
  "use strict";

  // ========================================
  // グローバル変数
  // ========================================
  let sendStartTime = null;  // 送信開始時刻を記録

  // ========================================
  // ユーティリティ関数
  // ========================================
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const log = (message, type = 'info') => {
    const prefix = '[Genspark]';
    const styles = {
      info: 'color: #2196F3',
      success: 'color: #4CAF50',
      warning: 'color: #FF9800',
      error: 'color: #F44336'
    };
    console.log(`%c${prefix} ${message}`, styles[type] || styles.info);
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
      await wait(200);
      element.click();
      await wait(500);
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
        await wait(500);
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
    const modelButtons = document.querySelectorAll('[data-model], .model-selector, select[name="model"]');
    
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
   * Gensparkはスライド生成専用なので、URLチェックのみ
   */
  const selectFunction = async (functionId) => {
    log(`機能選択: ${functionId}`);
    
    // Gensparkはスライド生成のみサポート
    if (functionId !== 'slides') {
      log('Gensparkはスライド生成機能のみサポートしています', 'warning');
      functionId = 'slides';
    }
    
    log(`✅ 機能を「スライド生成」に設定しました`, 'success');
    
    // スライド生成のURLを確認
    const slidesUrl = 'https://www.genspark.ai/agents?type=slides_agent';
    
    if (!window.location.href.includes('genspark.ai')) {
      log(`Gensparkのページを開いてください: ${slidesUrl}`, 'info');
      window.location.href = slidesUrl;
      return 'page_reload_required';
    }
    
    // 既に正しいページにいる場合
    if (window.location.href.includes('slides_agent') || window.location.href.includes('agents')) {
      log('スライド生成ページにいます', 'success');
      return true;
    }
    
    // URLを変更
    log(`スライド生成ページに移動します: ${slidesUrl}`, 'info');
    window.location.href = slidesUrl;
    return 'page_reload_required';
  };

  /**
   * 3. テキスト入力
   */
  const inputText = async (text) => {
    log('テキスト入力開始');
    
    try {
      if (!text) {
        throw new Error('入力するテキストがありません');
      }
      
      log('テキスト入力を開始: ' + text.substring(0, 50) + '...', 'info');
      
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
              log('入力欄発見: ' + selector, 'success');
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
      await wait(300);
      
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
      
      await wait(500);
      log('テキストを入力しました: ' + text.length + '文字', 'success');
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
    log('送信ボタンを探しています');
    
    const sendButton = findElement(SELECTORS.submitButton, '送信ボタン');
    
    if (!sendButton) {
      log('送信ボタンが見つかりません', 'error');
      return false;
    }
    
    // ボタンが無効化されているかチェック
    if (sendButton.disabled || sendButton.classList.contains('disabled')) {
      log('送信ボタンが無効化されています', 'warning');
      await wait(1000);
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
  const waitForResponse = async (timeout = 60000) => {
    log('応答待機開始');
    
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
      const stopButton = document.querySelector('.enter-icon-wrapper[class*="bg-[#232425]"]');
      return stopButton && stopButton.offsetParent !== null;
    };
    
    const startTime = Date.now();
    
    // 1. 停止ボタンが出現するまで待つ（最大30秒）
    log('停止ボタンの出現を待機中...');
    let waitCount = 0;
    while (!findStopButton() && waitCount < 30) {
      await wait(1000);
      waitCount++;
    }
    
    if (!findStopButton()) {
      log('停止ボタンが出現しませんでした', 'warning');
      return false;
    }
    
    log('停止ボタンを検出 - 生成中', 'info');
    
    // 2. 停止ボタンが消えるまで待つ（最大タイムアウトまで）
    let lastMinuteLogged = 0;
    while (findStopButton() && (Date.now() - startTime < timeout)) {
      await wait(1000);
      
      // 1分ごとにログ
      const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
      if (elapsedMinutes > lastMinuteLogged) {
        lastMinuteLogged = elapsedMinutes;
        log(`生成中... (${elapsedMinutes}分経過)`, 'info');
      }
    }
    
    if (findStopButton()) {
      log(`応答待機タイムアウト (${timeout/1000}秒経過)`, 'warning');
      return false;
    }
    
    // 経過時間を計算（送信時刻から）
    if (sendStartTime) {
      const elapsedTotal = Date.now() - sendStartTime;
      const minutes = Math.floor(elapsedTotal / 60000);
      const seconds = Math.floor((elapsedTotal % 60000) / 1000);
      log(`✅ 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'success');
    } else {
      // 待機開始時刻からの計算（フォールバック）
      const elapsedTotal = Date.now() - startTime;
      const minutes = Math.floor(elapsedTotal / 60000);
      const seconds = Math.floor((elapsedTotal % 60000) / 1000);
      log(`✅ 応答完了（${minutes}分${seconds}秒経過）`, 'success');
    }
    
    await wait(1000);  // 念のため1秒待つ
    return true;
  };

  /**
   * 6. 応答取得
   */
  const getResponse = async () => {
    log('応答テキスト取得開始');
    
    // 複数のセレクタで応答コンテナを探す
    const responseContainer = findElement(SELECTORS.responseContainer, '応答コンテナ');
    
    if (!responseContainer) {
      // 代替方法: 最後のメッセージを探す
      const allMessages = document.querySelectorAll('[class*="message"], [class*="response"], div[role="article"]');
      
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        const text = lastMessage.textContent?.trim();
        if (text) {
          log(`応答取得成功 (代替方法): ${text.substring(0, 100)}...`, 'success');
          return text;
        }
      }
    }
    
    if (responseContainer) {
      const text = responseContainer.textContent?.trim();
      if (text) {
        log(`応答取得成功: ${text.substring(0, 100)}...`, 'success');
        return text;
      }
    }
    
    log('応答テキストが見つかりません', 'warning');
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
    log('自動化実行開始', 'info');
    console.log('設定:', finalConfig);
    
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
      
      await wait(1000);
      
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
        const waitResult = await waitForResponse(finalConfig.timeout || 60000);
        if (!waitResult) {
          log('応答待機がタイムアウトしました', 'warning');
        }
      }
      
      // 6. 応答取得
      if (finalConfig.getResponse) {
        const response = await getResponse();
        result.response = response;
      }
      
      result.success = true;
      log('自動化実行完了', 'success');
      
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
      const buttons = document.querySelectorAll('button, [role="button"]');
      console.log(`ボタン数: ${buttons.length}`);
      buttons.forEach((btn, i) => {
        console.log(`${i}: ${btn.textContent?.trim().substring(0, 50)}`);
      });
      return buttons;
    },
    
    // すべての入力欄を表示
    showAllInputs: () => {
      const inputs = document.querySelectorAll('textarea, input, [contenteditable="true"]');
      console.log(`入力欄数: ${inputs.length}`);
      inputs.forEach((input, i) => {
        console.log(`${i}: ${input.tagName} - ${input.placeholder || input.name || 'no-id'}`);
      });
      return inputs;
    },
    
    // 特定のテキストを含む要素を検索
    findByText: (text) => {
      const allElements = document.querySelectorAll('*');
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