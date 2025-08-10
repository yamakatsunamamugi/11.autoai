// テストランナー（Chrome拡張機能版）
// 各AIサイトのタブと通信して自動化を実行

(() => {
  "use strict";

  // ログ出力
  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
      // タイプに応じて絵文字を追加
      let icon = '';
      switch(type) {
        case 'success': icon = '✅ '; break;
        case 'error': icon = '❌ '; break;
        case 'warning': icon = '⚠️ '; break;
        case 'model': icon = '🔄 '; break;
        case 'function': icon = '⚙️ '; break;
        case 'send': icon = '📤 '; break;
        case 'complete': icon = '✅ '; break;
        default: icon = '';
      }
      const logEntry = `[${timestamp}] ${icon}${message}\n`;
      logContainer.textContent += logEntry;
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    console.log(`[TestRunner] ${message}`);
  }

  // ステータス更新
  function updateStatus(text, status = 'ready') {
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.querySelector('.status-indicator');
    
    if (statusText) statusText.textContent = text;
    if (statusIndicator) {
      statusIndicator.className = `status-indicator status-${status}`;
    }
  }

  // テスト設定を取得
  function getTestConfig() {
    // プロンプトをテキストボックスから直接取得
    const getPrompt = (aiName) => {
      const inputElement = document.getElementById(`${aiName}-prompt`);
      return inputElement?.value || '';
    };
    
    return {
      claude: {
        enabled: document.getElementById('enable-claude')?.checked,
        model: document.getElementById('claude-model')?.value,
        function: document.getElementById('claude-feature')?.value,
        prompt: getPrompt('claude'),
      },
      chatgpt: {
        enabled: document.getElementById('enable-chatgpt')?.checked,
        model: document.getElementById('chatgpt-model')?.value,
        function: document.getElementById('chatgpt-feature')?.value,
        prompt: getPrompt('chatgpt'),
      },
      gemini: {
        enabled: document.getElementById('enable-gemini')?.checked,
        model: document.getElementById('gemini-model')?.value,
        function: document.getElementById('gemini-feature')?.value,
        prompt: getPrompt('gemini'),
      },
      genspark: {
        enabled: document.getElementById('enable-genspark')?.checked,
        model: document.getElementById('genspark-model')?.value,
        function: document.getElementById('genspark-feature')?.value,
        prompt: getPrompt('genspark'),
      },
    };
  }

  // AIサイトのウィンドウを作成
  async function createAIWindow(aiName, position) {
    const urls = {
      'claude': 'https://claude.ai',
      'chatgpt': 'https://chatgpt.com', 
      'gemini': 'https://gemini.google.com',
      'genspark': 'https://www.genspark.ai/agents?type=slides_agent'
    };

    const url = urls[aiName.toLowerCase()];
    if (!url) return null;

    // プライマリモニターのサイズを取得
    const screenInfo = await new Promise((resolve) => {
      chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
        resolve(primaryDisplay);
      });
    });
    
    const screenWidth = screenInfo.bounds.width;
    const screenHeight = screenInfo.bounds.height;
    const windowWidth = Math.floor(screenWidth / 2);
    const windowHeight = Math.floor(screenHeight / 2);

    // 4分割の位置計算
    const positions = {
      0: { left: 0, top: 0 }, // 左上 (ChatGPT)
      1: { left: windowWidth, top: 0 }, // 右上 (Claude)  
      2: { left: 0, top: windowHeight }, // 左下 (Gemini)
      3: { left: windowWidth, top: windowHeight } // 右下 (Genspark)
    };

    const pos = positions[position] || { left: 0, top: 0 };

    return new Promise((resolve) => {
      chrome.windows.create({
        url: url,
        type: 'normal',
        width: windowWidth,
        height: windowHeight,
        left: pos.left,
        top: pos.top
      }, (window) => {
        if (window && window.tabs && window.tabs[0]) {
          log(`${aiName}ウィンドウを作成: ${url}`);
          resolve(window.tabs[0]);
        } else {
          resolve(null);
        }
      });
    });
  }

  // テキスト入力欄が出現するまで待機
  async function waitForInputField(tabId, aiName, maxWait = 30000) {
    const startTime = Date.now();
    log(`${aiName}の入力欄を待機中...`);
    
    // 各AIの入力欄セレクタを定義
    const inputSelectors = {
      'ChatGPT': [
        '#prompt-textarea',
        '[contenteditable="true"]',
        '.ProseMirror',
        'textarea[data-testid="conversation-textarea"]',
        'textarea[placeholder*="メッセージ"]'
      ],
      'Claude': [
        '.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        '[aria-label*="プロンプト"]',
        'div[contenteditable="true"]',
        'textarea[placeholder*="メッセージ"]'
      ],
      'Gemini': [
        '.ql-editor.new-input-ui[contenteditable="true"]',
        'rich-textarea .ql-editor[contenteditable="true"]',
        '.ql-editor[role="textbox"]',
        '.ql-editor[contenteditable="true"]',
        '[aria-label*="プロンプト"][contenteditable="true"]'
      ],
      'Genspark': [
        'textarea[placeholder*="スライド"]',
        'textarea[placeholder*="プレゼン"]',
        'textarea[placeholder*="入力"]',
        'textarea',
        'input[type="text"]'
      ]
    };
    
    while (Date.now() - startTime < maxWait) {
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (aiName, selectors) => {
            // 入力欄を探す
            for (const selector of selectors) {
              try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                  if (element && element.offsetParent !== null) {
                    // 要素が表示されていて、編集可能な状態か確認
                    const isEditable = element.contentEditable === 'true' || 
                                      element.tagName === 'TEXTAREA' || 
                                      element.tagName === 'INPUT';
                    if (isEditable) {
                      console.log(`[${aiName}] 入力欄発見: ${selector}`);
                      return { found: true, selector: selector };
                    }
                  }
                }
              } catch (e) {
                // セレクタエラーは無視
              }
            }
            return { found: false };
          },
          args: [aiName, inputSelectors[aiName] || []]
        });
        
        if (result && result[0] && result[0].result && result[0].result.found) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          log(`${aiName}の入力欄を確認（${elapsed}秒）`);
          return true;
        }
      } catch (e) {
        // エラーは無視して次の試行へ
      }
      
      // 0.5秒待機して再試行
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    log(`❌ ${aiName}の入力欄が見つかりませんでした（タイムアウト）`, 'warning');
    return false;
  }

  // タブでスクリプトを実行
  async function executeInTab(tabId, aiName, config) {
    return new Promise((resolve) => {
      log(`${aiName}スクリプト注入開始`);
      
      // まず自動化スクリプトを注入
      const scriptFileMap = {
        'claude': 'automations/claude-automation-dynamic.js',
        'chatgpt': 'automations/chatgpt-automation.js', 
        'gemini': 'automations/gemini-dynamic-automation.js',
        'genspark': 'automations/genspark-automation.js'
      };
      
      const scriptFile = scriptFileMap[aiName.toLowerCase()] || `automations/${aiName.toLowerCase()}-automation.js`;
      
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [scriptFile]
      }, () => {
        if (chrome.runtime.lastError) {
          log(`❌ ${aiName}スクリプト注入エラー: ${chrome.runtime.lastError.message}`, 'error');
          resolve({ success: false, error: `スクリプト注入失敗: ${chrome.runtime.lastError.message}` });
          return;
        }
        
        log(`${aiName}スクリプト注入完了、初期化待機中...`);
        
        // スクリプト初期化を待つ（1秒）
        setTimeout(() => {
          // 次に実行コマンドを送信
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: async (aiName, config) => {
              try {
                // AI名に基づいて適切な自動化オブジェクトを検索
                const automationMap = {
                  'Claude': ['ClaudeAutomation', 'Claude'],
                  'ChatGPT': ['ChatGPTAutomation', 'ChatGPT'], 
                  'Gemini': ['Gemini', 'GeminiAutomation'],
                  'Genspark': ['GensparkAutomation', 'Genspark']
                };
                
                const possibleNames = automationMap[aiName] || [`${aiName}Automation`];
                let automation = null;
                let foundName = null;
                
                for (const name of possibleNames) {
                  if (window[name]) {
                    automation = window[name];
                    foundName = name;
                    break;
                  }
                }
                
                console.log(`[TestRunner] ${aiName}の自動化オブジェクトを探しています...`);
                console.log(`[TestRunner] 利用可能な候補: ${possibleNames.join(', ')}`);
                
                if (!automation) {
                  const availableKeys = Object.keys(window).filter(key => 
                    key.includes('Automation') || key.includes(aiName)
                  );
                  console.error(`[TestRunner] ${aiName}の自動化オブジェクトが見つかりません`);
                  console.log(`[TestRunner] ウィンドウで利用可能: ${availableKeys.join(', ')}`);
                  return { success: false, error: `${aiName}の自動化オブジェクトが見つかりません` };
                }
                
                console.log(`[TestRunner] ${foundName}を発見、実行開始`);
                
                // 実行方法を自動化オブジェクトの構造に応じて調整
                if (typeof automation.runAutomation === 'function') {
                  return await automation.runAutomation({
                    model: config.model,
                    function: config.function,
                    text: config.text,
                    send: config.send,
                    waitResponse: config.waitResponse,
                    getResponse: config.getResponse,
                  });
                } else if (typeof automation.testNormal === 'function' && aiName === 'Gemini') {
                  // Gemini専用の実行方法
                  console.log(`[TestRunner] Gemini動的テストを実行`);
                  
                  // モデル選択
                  if (config.model) {
                    await automation.model(config.model);
                  }
                  
                  // 機能選択
                  if (config.function && config.function !== 'none') {
                    await automation.func(config.function);
                  }
                  
                  // テキスト入力と送信
                  if (config.text) {
                    const result = await automation.testNormal(config.text, config.model);
                    return result;
                  }
                  
                  return { success: true };
                } else {
                  return { success: false, error: `${foundName}に適切な実行方法が見つかりません` };
                }
                
              } catch (error) {
                console.error(`[TestRunner] 実行エラー:`, error);
                return { success: false, error: error.message };
              }
            },
            args: [aiName, config]
          }, (results) => {
            if (chrome.runtime.lastError) {
              log(`❌ ${aiName}実行エラー: ${chrome.runtime.lastError.message}`, 'error');
              resolve({ success: false, error: chrome.runtime.lastError.message });
              return;
            }
            
            if (results && results[0]) {
              resolve(results[0].result);
            } else {
              resolve({ success: false, error: 'スクリプト実行エラー' });
            }
          });
        }, 1000); // 1秒待機
      });
    });
  }

  // 個別AI実行
  async function runAI(aiName, config, position) {
    log(`${aiName}の自動化を開始`);
    
    // AIの設定を取得
    const aiConfig = config[aiName.toLowerCase()];
    
    // モデルと機能の詳細ログ
    if (aiConfig && aiConfig.model) {
      log(`${aiName}: モデルを「${aiConfig.model}」に変更`, 'model');
    }
    if (aiConfig && aiConfig.function && aiConfig.function !== 'none') {
      log(`${aiName}: 機能を「${aiConfig.function}」に変更`, 'function');
    }
    
    try {
      // AIウィンドウを作成
      const tab = await createAIWindow(aiName, position);
      if (!tab) {
        log(`❌ ${aiName}のウィンドウ作成に失敗しました`, 'error');
        return { success: false, error: 'ウィンドウ作成失敗' };
      }

      // 入力欄が出現するまで待機
      const inputReady = await waitForInputField(tab.id, aiName);
      if (!inputReady) {
        log(`⚠️ ${aiName}の入力欄が見つからないため、追加で3秒待機します`, 'warning');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // スクリプトを実行（既に上で取得済み）
      
      // メッセージ送信ログ
      log(`${aiName}: メッセージを送信しました`, 'send');
      const sendTime = Date.now(); // 送信時刻を記録
      
      const result = await executeInTab(tab.id, aiName, {
        model: aiConfig.model,
        function: aiConfig.function,
        text: aiConfig.prompt,
        send: true,
        waitResponse: true,
        getResponse: true,
      });

      if (result.success) {
        // 経過時間を計算
        const elapsedMs = Date.now() - sendTime;
        const minutes = Math.floor(elapsedMs / 60000);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);
        
        log(`${aiName}: 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'complete');
        
        if (result.response) {
          log(`${aiName}の回答: ${result.response.substring(0, 100)}...`);
        }
      } else {
        log(`❌ ${aiName}でエラー: ${result.error}`, 'error');
      }

      return result;
    } catch (error) {
      log(`❌ ${aiName}で例外エラー: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // 全AI実行
  async function runAllAIs() {
    updateStatus('ウィンドウ作成中...', 'running');
    log('統合テスト開始');
    
    const config = getTestConfig();
    const results = {};
    
    // 有効なAIのみ実行（順序：ChatGPT→Claude→Gemini→Genspark）
    const aiOrder = ['ChatGPT', 'Claude', 'Gemini', 'Genspark'];
    const enabledAIs = [];
    
    aiOrder.forEach((ai, index) => {
      const aiKey = ai.toLowerCase();
      if (config[aiKey] && config[aiKey].enabled) {
        enabledAIs.push({ name: ai, position: index });
      }
    });
    
    if (enabledAIs.length === 0) {
      log('❌ 実行対象のAIが選択されていません', 'error');
      updateStatus('実行対象なし', 'error');
      return {};
    }
    
    log(`実行対象: ${enabledAIs.map(ai => ai.name).join(', ')}`);
    log('4分割ウィンドウを作成中...');
    
    // 全ウィンドウを並列作成
    const windowPromises = enabledAIs.map(async (ai) => {
      const result = await runAI(ai.name, config, ai.position);
      return { name: ai.name, result };
    });
    
    updateStatus('自動化実行中...', 'running');
    
    // 全て実行完了を待機
    const allResults = await Promise.all(windowPromises);
    
    // 結果をオブジェクトに変換
    allResults.forEach(({ name, result }) => {
      results[name] = result;
    });
    
    // 結果サマリー
    const successCount = Object.values(results).filter(r => r.success).length;
    const totalCount = Object.keys(results).length;
    
    log(`\n===== 実行結果 =====`);
    log(`成功: ${successCount}/${totalCount}`);
    
    if (successCount === totalCount) {
      updateStatus('全て成功', 'ready');
    } else {
      updateStatus(`${successCount}/${totalCount} 成功`, 'error');
    }
    
    return results;
  }

  // イベントリスナー設定
  function setupEventListeners() {
    // 全AI実行ボタン
    const btnRunAll = document.getElementById('btn-run-all');
    if (btnRunAll) {
      btnRunAll.addEventListener('click', runAllAIs);
    }

  }

  // 初期化
  function initialize() {
    log('テストランナー初期化完了（Chrome拡張機能版）');
    setupEventListeners();
    updateStatus('準備完了', 'ready');
    
    // Chrome拡張機能APIが利用可能か確認
    if (!chrome.tabs || !chrome.scripting) {
      log('⚠️ Chrome拡張機能のコンテキストで実行してください', 'warning');
      log('拡張機能のポップアップから「統合AIテストを開く」ボタンを使用してください', 'warning');
    }
  }

  // DOMContentLoaded待ち
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // グローバル公開
  window.TestRunner = {
    runAI,
    runAllAIs,
    getTestConfig,
    log,
    updateStatus,
    createAIWindow
  };

  console.log("✅ テストランナー（Chrome拡張機能版）が利用可能になりました");
})();