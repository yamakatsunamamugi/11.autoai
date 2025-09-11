/**
 * @fileoverview テストランナー（Chrome拡張機能版）
 * 
 * 【概要】
 * Chrome拡張機能のコンテンツスクリプトとして動作し、
 * 各AIサイトのタブと通信して自動化テストを実行します。
 * 
 * 【主要機能】
 * 1. テスト設定の管理
 *    - 各AIの有効/無効状態
 *    - モデル選択
 *    - 機能選択
 *    - プロンプト管理
 * 
 * 2. AIウィンドウ管理
 *    - 4分割ウィンドウの作成と配置
 *    - タブとの通信確立
 *    - ウィンドウ状態の監視
 * 
 * 3. AI操作の実行
 *    - プロンプト送信
 *    - 応答待機
 *    - 結果の取得と記録
 * 
 * 【依存関係】
 * 外部モジュール:
 *   - /automations/common-ai-handler.js - AI共通処理（window.AIHandler）
 *   - /src/config/ui-selectors.js - UIセレクタ定義
 *   - /tests/integration/test-log-toggle-manager.js - ログ管理（window.LogToggleManager）
 * 
 * Chrome API:
 *   - chrome.runtime - メッセージ通信
 *   - chrome.tabs - タブ操作
 *   - chrome.windows - ウィンドウ管理
 * 
 * 【グローバル公開オブジェクト】
 *   - window.TestRunner - テストランナーのメインオブジェクト
 *     - getTestConfig() - テスト設定を取得
 *     - createAIWindow() - AIウィンドウを作成
 *     - sendPromptToAI() - AIにプロンプトを送信
 *     - waitForResponse() - AI応答を待機
 * 
 * 【メッセージプロトコル】
 * 送信メッセージ:
 *   - type: 'SEND_PROMPT' - プロンプト送信
 *   - type: 'SELECT_MODEL' - モデル選択
 *   - type: 'SELECT_FUNCTION' - 機能選択
 * 
 * 受信メッセージ:
 *   - type: 'RESPONSE_COMPLETE' - 応答完了
 *   - type: 'ERROR' - エラー通知
 * 
 * @author AutoAI Development Team
 * @version 1.0.0
 */

(() => {
  "use strict";

  // ログ出力
  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logContainer = document.getElementById('log-container');
    
    // 新しいログ管理システムを使用
    if (window.logTestEvent) {
      // LogToggleManagerを使用（利用可能な場合）
      window.logTestEvent(message, type);
    } else if (logContainer) {
      // フォールバック: 従来の方法（ただし改行を適切に処理）
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
      
      // 新しいログエントリをdiv要素として作成
      const logDiv = document.createElement('div');
      logDiv.style.cssText = 'margin-bottom: 2px; padding: 2px 0; font-family: monospace; font-size: 13px;';
      logDiv.textContent = `[${timestamp}] ${icon}${message}`;
      logContainer.appendChild(logDiv);
      
      // 自動スクロール
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    console.log(`[TestRunner] ${message}`);
  }

  // ステータス更新
  function updateStatus(text, status = 'ready') {
    const statusText = document.getElementById('status-text');
    const statusSelectors = window.AIHandler?.getSelectors?.('TEST', 'STATUS_INDICATOR') || ['.status-indicator'];
    let statusIndicator = null;
    for (const selector of statusSelectors) {
      statusIndicator = document.querySelector(selector);
      if (statusIndicator) break;
    }
    
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
  async function createAIWindow(aiName, position, functionType = null) {
    const urls = {
      'claude': 'https://claude.ai',
      'chatgpt': 'https://chatgpt.com', 
      'gemini': 'https://gemini.google.com',
      'genspark': 'https://www.genspark.ai/agents?type=slides_agent'  // デフォルト
    };
    
    // Gensparkの場合、機能に応じてURLを変更
    if (aiName.toLowerCase() === 'genspark' && functionType) {
      if (functionType === 'factcheck' || functionType === 'fact-check' || 
          functionType.toLowerCase().includes('fact') || functionType.toLowerCase().includes('check')) {
        urls['genspark'] = 'https://www.genspark.ai/agents?type=agentic_cross_check';
        log('Genspark: ファクトチェックモードで起動');
      } else {
        log('Genspark: スライド生成モードで起動');
      }
    }

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
        type: 'popup',  // ブックマークバー・URLバーを非表示
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
      
      // 統合ハンドラーとDeepResearchハンドラーを先に注入
      const commonScripts = [
        'automations/feature-constants.js',
        'automations/common-ai-handler.js',
        'automations/deepresearch-handler.js',
        'automations/claude-deepresearch-selector.js'
      ];
      
      // AI固有のスクリプト
      const scriptFileMap = {
        'claude': 'automations/claude-automation.js',
        'chatgpt': 'automations/chatgpt-automation.js', 
        'gemini': 'automations/gemini-automation.js',
        'genspark': 'automations/genspark-automation.js'
      };
      
      const aiScript = scriptFileMap[aiName.toLowerCase()] || `automations/${aiName.toLowerCase()}-automation.js`;
      
      // 共通スクリプトを順番に注入
      let scriptsToInject = [...commonScripts, aiScript];
      
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: scriptsToInject
      }, () => {
        if (chrome.runtime.lastError) {
          log(`❌ ${aiName}スクリプト注入エラー: ${chrome.runtime.lastError.message}`, 'error');
          resolve({ success: false, error: `スクリプト注入失敗: ${chrome.runtime.lastError.message}` });
          return;
        }
        
        log(`${aiName}スクリプト注入完了、初期化待機中...`);
        
        // スクリプト初期化を待つ（2秒 - Geminiの初期化に時間がかかるため）
        setTimeout(() => {
          // 次に実行コマンドを送信
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: async (aiName, config) => {
              try {
                // 機能名は変換せずにそのまま使用
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
                console.log(`[デバッグ] 選択された機能: "${config.function}"`);
                
                // 実行方法を自動化オブジェクトの構造に応じて調整
                if (typeof automation.runAutomation === 'function') {
                  // DeepResearchの場合は長時間待機（最大60分）
                  const isDeepResearch = window.FeatureConstants ? 
                    window.FeatureConstants.isDeepResearch(config.function) :
                    (config.function && config.function.toLowerCase().includes('research'));
                  
                  // Gensparkは処理に時間がかかるため特別扱い
                  const isGenspark = aiName.toLowerCase() === 'genspark';
                  const timeout = isDeepResearch ? 60 * 60 * 1000 : 
                                isGenspark ? 60 * 60 * 1000 :  // Genspark: 60分
                                60000;  // その他: 1分
                  
                  if (isDeepResearch) {
                    console.log(`[TestRunner] ${aiName} DeepResearchモード - 最大60分待機`);
                  } else if (isGenspark) {
                    console.log(`[TestRunner] ${aiName} スライド生成モード - 最大60分待機`);
                  }
                  
                  console.log(`[デバッグ] runAutomationに渡す機能名: "${config.function}"`);
                  return await automation.runAutomation({
                    model: config.model,
                    function: config.function,
                    text: config.text,
                    send: config.send,
                    waitResponse: config.waitResponse,
                    getResponse: config.getResponse,
                    timeout: timeout
                  });
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
        }, 2000); // 2秒待機（Gemini対応）
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
    
    // プロンプトのログを追加
    if (aiConfig && aiConfig.prompt) {
      log(`${aiName}: プロンプト「${aiConfig.prompt}」を送信`, 'send');
    } else {
      log(`⚠️ ${aiName}: プロンプトが設定されていません`, 'warning');
    }
    
    try {
      // AIウィンドウを作成（Gensparkの場合は機能タイプも渡す）
      const tab = await createAIWindow(aiName, position, aiConfig?.function);
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
      
      // DeepResearchモードかどうか判定
      const isDeepResearch = window.FeatureConstants ? 
        window.FeatureConstants.isDeepResearch(aiConfig.function) :
        (aiConfig.function && aiConfig.function.toLowerCase().includes('research'));
      
      if (isDeepResearch) {
        log(`${aiName}: DeepResearchモード - 停止ボタン消滅まで待機します`, 'function');
      }
      
      // メッセージ送信ログ
      log(`${aiName}: 処理を開始しました`, 'send');
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
        
        if (isDeepResearch) {
          log(`${aiName}: DeepResearch完了（${minutes}分${seconds}秒経過）`, 'complete');
        } else {
          log(`${aiName}: 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'complete');
        }
        
        if (result.response) {
          // 30文字のプレビューを表示し、クリックで全文表示
          const preview = result.response.length > 30 
            ? result.response.substring(0, 30) + '...' 
            : result.response;
          
          const logContainer = document.getElementById('log-container');
          if (logContainer) {
            const timestamp = new Date().toLocaleTimeString();
            const responseId = `response-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // 展開可能なログエントリを作成
            const logEntry = document.createElement('div');
            logEntry.innerHTML = `[${timestamp}] ${aiName}の回答: <span id="${responseId}" style="cursor: pointer; color: #0066cc; text-decoration: underline;" data-expanded="false" data-full-text="${result.response.replace(/"/g, '&quot;')}">${preview}</span>\n`;
            
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
            
            // クリックイベントを追加
            document.getElementById(responseId).addEventListener('click', function() {
              const isExpanded = this.getAttribute('data-expanded') === 'true';
              const fullText = this.getAttribute('data-full-text').replace(/&quot;/g, '"');
              
              if (isExpanded) {
                // 折りたたみ
                this.textContent = preview;
                this.setAttribute('data-expanded', 'false');
              } else {
                // 展開
                this.textContent = fullText;
                this.setAttribute('data-expanded', 'true');
              }
            });
          } else {
            // フォールバック: logContainer が見つからない場合は通常のログ出力
            log(`${aiName}の回答: ${preview}`);
          }
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
    
    // デバッグ: 取得した設定を詳細にログ出力
    console.log('📋 取得したテスト設定:', config);
    ['chatgpt', 'claude', 'gemini', 'genspark'].forEach(aiType => {
      if (config[aiType] && config[aiType].enabled) {
        log(`${aiType.toUpperCase()} 設定:`, 'info');
        log(`  - モデル: ${config[aiType].model}`, 'info');
        log(`  - 機能: ${config[aiType].function}`, 'info');
        log(`  - プロンプト: "${config[aiType].prompt}"`, 'info');
      }
    });
    
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
      btnRunAll.addEventListener('click', async () => {
        // 3連続テストモードかチェック（複数形のconsecutiveTestStatesを確認）
        let hasConsecutiveTest = false;
        let targetAiType = null;
        
        console.log('🔍 3連続テスト検出チェック開始');
        console.log('window.consecutiveTestStates:', window.consecutiveTestStates);
        
        if (window.consecutiveTestStates) {
          console.log('consecutiveTestStates存在確認 ✓');
          // 有効な3連続テストを探す
          for (const [id, state] of Object.entries(window.consecutiveTestStates)) {
            console.log(`  ${id}: enabled=${state.enabled}, hasData=${!!state.testData}`);
            if (state.enabled && state.testData) {
              hasConsecutiveTest = true;
              targetAiType = id.replace('-prompt', '');
              console.log(`3連続テスト検出: ${targetAiType}`);
              break;
            }
          }
        } else {
          console.log('❌ window.consecutiveTestStates が存在しません');
        }
        
        if (hasConsecutiveTest) {
          console.log(`3連続テストモードで実行: ${targetAiType}`);
          // 3連続テストを実行
          if (window.executeConsecutiveTest) {
            await window.executeConsecutiveTest(targetAiType);
          } else {
            console.error('executeConsecutiveTest関数が見つかりません');
          }
        } else {
          // 通常のテスト実行
          await runAllAIs();
        }
      });
    }

  }

  // 初期化
  function initialize() {
    log('テストランナー初期化完了（Chrome拡張機能版）');
    setupEventListeners();
    updateStatus('準備完了', 'ready');
    
    // background.jsからのログメッセージを受信
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "extensionLog") {
          log(request.message, request.type || 'info');
        }
      });
    }
    
    // AITaskHandlerにログ関数を設定（background.jsと連携）
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: "setAITaskLogger",
        logFunction: "test-runner-log"
      });
    }
    
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