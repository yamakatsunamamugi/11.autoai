/**
 * @fileoverview AIタスク実行共通モジュール
 * 
 * 概要:
 * 統合テストと本番環境の両方で使用される共通のAIタスク実行ロジック。
 * background.jsのexecuteAITask関数を独立モジュール化したもの。
 * 
 * 特徴:
 * - スクリプト注入処理
 * - 自動化オブジェクトの検索と実行
 * - DeepResearch/Genspark対応のタイムアウト制御
 * - エラーハンドリング
 * 
 * @module AITaskExecutor
 */

// タイムアウト設定をインポート
import '../config/timeout-config.js';

export class AITaskExecutor {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * AIタスクを実行する中央制御関数
   * @param {number} tabId - 実行対象のタブID
   * @param {Object} taskData - タスクデータ
   * @param {string} taskData.aiType - AI種別 (claude, chatgpt, gemini, genspark)
   * @param {string} taskData.taskId - タスクID
   * @param {string} taskData.model - モデル名
   * @param {string} taskData.function - 機能名
   * @param {string} taskData.prompt - プロンプトテキスト
   * @returns {Promise<Object>} 実行結果
   */
  async executeAITask(tabId, taskData) {
    const startTime = Date.now();
    const cellPosition = taskData.cellInfo?.column && taskData.cellInfo?.row 
      ? `${taskData.cellInfo.column}${taskData.cellInfo.row}` 
      : '不明';
    
    // aiTypeのnullチェック追加
    if (!taskData.aiType) {
      this.logger.error(`[AITaskExecutor] ❌ aiTypeが未定義です。デフォルトでChatGPTを使用します`, {
        セル: cellPosition,
        taskId: taskData.taskId,
        全プロパティ: Object.keys(taskData).join(', ')
      });
      taskData.aiType = 'ChatGPT'; // デフォルト値を設定
    }
    
    this.logger.log(`[AITaskExecutor] 🚀 AIタスク実行開始 [${cellPosition}セル] [${taskData.aiType}]:`, {
      セル: cellPosition,
      tabId,
      taskId: taskData.taskId,
      model: taskData.model,
      function: taskData.function,
      promptLength: taskData.prompt?.length,
      promptPreview: taskData.prompt ? taskData.prompt.substring(0, 100) + '...' : '❌ プロンプトが空！',
      hasPrompt: !!taskData.prompt,
      timestamp: new Date().toLocaleTimeString()
    });

    try {
      // V2ファイルマップを定義（共通で使用）
      const v2ScriptMap = {
        'claude': 'automations/v2/claude-automation-v2.js',
        'chatgpt': 'automations/v2/chatgpt-automation-v2.js',
        'gemini': 'automations/v2/gemini-automation-v2.js'
      };
      
      // すべてのAIタイプで共通の処理を使用
      // V2ファイルマップはすでに上で定義済み（Geminiも含む）
      
      // aiTypeの再チェック（念のため）
      if (!taskData.aiType) {
        taskData.aiType = 'ChatGPT';
      }
      
      const aiTypeLower = taskData.aiType.toLowerCase();
      const hasV2 = v2ScriptMap.hasOwnProperty(aiTypeLower);
      const isV2Available = hasV2;
      
      // AI固有のスクリプトマップ（V2版を常に使用）
      const scriptFileMap = {
        'claude': v2ScriptMap['claude'],
        'chatgpt': v2ScriptMap['chatgpt'],
        'gemini': v2ScriptMap['gemini'],
        'genspark': 'automations/genspark-automation.js'
      };

      // V2版でも基本的な共通スクリプトは必要
      const commonScripts = [
        'automations/feature-constants.js',
        'automations/common-ai-handler.js'
      ];

      // AI固有のスクリプトを追加（V2版を優先）
      const aiScript = scriptFileMap[aiTypeLower] || 
                       `automations/${aiTypeLower}-automation.js`;
      
      // 共通スクリプトを順番に注入
      let scriptsToInject = [...commonScripts, aiScript];

      const injectionStartTime = performance.now();
      this.logger.log(`[AITaskExecutor] 📝 [${taskData.aiType}] スクリプト注入開始:`, {
        scripts: scriptsToInject.map(s => s.split('/').pop()),
        count: scriptsToInject.length
      });

      // スクリプトを注入（統合テストと同じ方式）
      for (const scriptFile of scriptsToInject) {
        this.logger.log(`[AITaskExecutor] 📝 注入中: ${scriptFile}`);
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [scriptFile]
        });
      }

      const injectionTime = (performance.now() - injectionStartTime).toFixed(0);
      this.logger.log(`[AITaskExecutor] ✅ [${taskData.aiType}] スクリプト注入完了 (${injectionTime}ms)、初期化確認中...`);

      // スクリプト実行完了を待つ
      await new Promise(resolve => setTimeout(resolve, 500));

      // V2版の存在を確認（全AIタイプ）
      try {
        const [v2Check] = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (aiType) => {
            const v2Names = {
              'chatgpt': 'ChatGPTAutomationV2',
              'claude': 'ClaudeAutomationV2', 
              'gemini': 'GeminiAutomation'  // GeminiはV2でも同じ名前
            };
            const v2Name = v2Names[aiType.toLowerCase()];
            const exists = v2Name && typeof window[v2Name] !== 'undefined';
            console.log(`[V2チェック] ${v2Name}存在確認: ${exists}`);
            console.log(`[V2チェック] window.ChatGPTAutomationV2:`, window.ChatGPTAutomationV2);
            console.log(`[V2チェック] typeof window.ChatGPTAutomationV2:`, typeof window.ChatGPTAutomationV2);
            if (exists) {
              console.log(`[V2チェック] ${v2Name}のメソッド:`, Object.keys(window[v2Name]));
            }
            return { exists, v2Name };
          },
          args: [taskData.aiType]
        });
        this.logger.log(`[AITaskExecutor] 📋 ${v2Check?.result?.v2Name}存在確認: ${v2Check?.result?.exists}`);
        
        // V2が読み込まれていない場合はエラー
        if (!v2Check?.result?.exists) {
          this.logger.error(`[AITaskExecutor] ❌ ${taskData.aiType}のV2スクリプトが読み込まれていません`);
        }
      } catch (e) {
        this.logger.error(`[AITaskExecutor] V2チェックエラー:`, e);
      }

      // ページ読み込み完了を待つ
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機
      
      // スクリプト初期化を動的に確認（最大15秒、100ms間隔でポーリング）
      const initStartTime = performance.now();
      const maxWaitTime = 15000; // 15秒に増やす
      const checkInterval = 100; // 100msに変更
      let isReady = false;
      
      while (!isReady && (performance.now() - initStartTime) < maxWaitTime) {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (aiType) => {
              // V2版を優先的にチェック
              const possibleNames = [
                `${aiType}AutomationV2`,
                `${aiType}Automation`,
                aiType,
                'ClaudeAutomationV2', 'ClaudeAutomation',
                'ChatGPTAutomationV2', 'ChatGPTAutomation',
                'GeminiAutomation'
              ];
              
              // デバッグ: 利用可能なAutomationオブジェクトをログ出力
              const availableAutomations = Object.keys(window).filter(key => 
                key.includes('Automation')
              );
              console.log('[スクリプト初期化チェック] 利用可能なAutomation:', availableAutomations);
              console.log('[スクリプト初期化チェック] 探索対象:', possibleNames);
              
              const found = possibleNames.find(name => window[name] !== undefined);
              if (found) {
                console.log('[スクリプト初期化チェック] 発見:', found);
              }
              
              return possibleNames.some(name => window[name] !== undefined);
            },
            args: [taskData.aiType]
          });
          
          if (result?.result) {
            isReady = true;
            const initTime = (performance.now() - initStartTime).toFixed(0);
            this.logger.log(`[AITaskExecutor] 🎯 [${taskData.aiType}] スクリプト初期化完了 (${initTime}ms)`);
          } else {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
          }
        } catch (e) {
          // エラー時は少し待って続行
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
      }
      
      if (!isReady) {
        // タイムアウトした場合でも続行（フォールバック）
        this.logger.warn(`[AITaskExecutor] ⚠️ [${taskData.aiType}] スクリプト初期化確認タイムアウト、続行します`);
      }

      this.logger.log(`[AITaskExecutor] 🔄 [${taskData.aiType}] タスク実行開始...`);
      
      // タスクを実行
      let result;
      try {
        // まずシンプルな同期関数でテスト
        result = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (taskData) => {
          console.log('[ExecuteAITask] タスクデータ受信（同期版）:', taskData);
          
          try {
            // 統合テストと同じAI自動化オブジェクト検索方式（V2版を優先）
            const automationMap = {
              'Claude': ['ClaudeAutomationV2', 'ClaudeAutomation', 'Claude'],
              'ChatGPT': ['ChatGPTAutomationV2', 'ChatGPTAutomation', 'ChatGPT'],
              'Gemini': ['GeminiAutomation', 'Gemini'],
              'Genspark': ['GensparkAutomation', 'Genspark']
            };

            const possibleNames = automationMap[taskData.aiType] || [`${taskData.aiType}Automation`];
            let automation = null;
            let foundName = null;

            for (const name of possibleNames) {
              if (window[name]) {
                automation = window[name];
                foundName = name;
                break;
              }
            }

            console.log(`[ExecuteAITask] 🔍 ${taskData.aiType}の自動化オブジェクトを探しています...`);
            console.log(`[ExecuteAITask] 📋 利用可能な候補: ${possibleNames.join(', ')}`);
            console.log(`[ExecuteAITask] 📝 プロンプト確認:`, {
              hasPrompt: !!taskData.prompt,
              promptLength: taskData.prompt?.length || 0,
              promptPreview: taskData.prompt ? taskData.prompt.substring(0, 100) + '...' : '❌ プロンプトなし'
            });

            if (!automation) {
              const availableKeys = Object.keys(window).filter(key =>
                key.includes('Automation') || key.includes(taskData.aiType)
              );
              console.error(`[ExecuteAITask] ❌ ${taskData.aiType}の自動化オブジェクトが見つかりません`);
              console.log(`[ExecuteAITask] 📋 ウィンドウで利用可能: ${availableKeys.join(', ')}`);
              return { success: false, error: `${taskData.aiType}の自動化オブジェクトが見つかりません` };
            }

            console.log(`[ExecuteAITask] ✅ ${foundName}を発見、実行開始`);

            // DeepResearchの判定（統合テストと同じ）
            const isDeepResearch = window.FeatureConstants ?
              window.FeatureConstants.isDeepResearch(taskData.function) :
              (taskData.function && taskData.function.toLowerCase().includes('research'));

            // タイムアウト設定（統合テストと同じ）
            const isGenspark = taskData.aiType.toLowerCase() === 'genspark';
            const timeout = isDeepResearch ? 60 * 60 * 1000 :
                           isGenspark ? 60 * 60 * 1000 :
                           60000;

            if (isDeepResearch) {
              console.log(`[ExecuteAITask] 🔬 ${taskData.aiType} DeepResearchモード - 最大60分待機`);
            } else if (isGenspark) {
              console.log(`[ExecuteAITask] 📊 ${taskData.aiType} スライド生成モード - 最大60分待機`);
            } else {
              console.log(`[ExecuteAITask] ⚡ ${taskData.aiType} 通常モード - 最大1分待機`);
            }

            // グローバル変数に現在のタスク情報を設定（SpreadsheetLogger用）
            console.log(`[ExecuteAITask] 🔍 taskData詳細:`, {
              taskId: taskData.taskId,
              model: taskData.model,
              aiType: taskData.aiType,
              fullTaskData: taskData
            });
            
            window.currentAITaskInfo = {
              taskId: taskData.taskId,
              model: taskData.model,
              aiType: taskData.aiType
            };
            console.log(`[ExecuteAITask] 📝 タスク情報をグローバル変数に設定:`, window.currentAITaskInfo);

            // 設定オブジェクト（統合テストと同じ形式）
            const config = {
              model: taskData.model,
              function: taskData.function,
              text: taskData.prompt,
              send: true,
              waitResponse: true,
              getResponse: true,
              timeout: timeout,
              cellInfo: taskData.cellInfo  // セル位置情報を追加
            };
            
            // 🔍 DEBUG: config.textの詳細確認
            console.log(`[ExecuteAITask] 🔍 DEBUG: config設定内容:`, {
              hasText: !!config.text,
              textType: typeof config.text,
              textLength: config.text?.length || 0,
              textPreview: config.text ? config.text.substring(0, 100) + '...' : '❌ config.textが空！',
              fullConfig: config
            });

            // V2版はexecuteTaskを優先、従来版はrunAutomationを使用
            if (typeof automation.executeTask === 'function') {
              console.log(`[ExecuteAITask] 🎯 ${foundName}.executeTask（V2）を実行中...`);
              const execStartTime = Date.now();
              
              // V2版のexecuteTaskを直接実行し、その結果を待つ
              // CSP回避のため、Promiseを作成してthenで処理
              const executePromise = automation.executeTask({
                model: taskData.model,
                function: taskData.function,
                prompt: taskData.prompt,
                text: taskData.prompt
              });
              
              // Promiseの結果を同期的に取得するため、グローバル変数を使用
              window.__v2_execution_result = null;
              window.__v2_execution_complete = false;
              
              executePromise.then(result => {
                console.log(`[ExecuteAITask] V2実行完了:`, result);
                window.__v2_execution_result = result;
                window.__v2_execution_complete = true;
              }).catch(error => {
                console.error(`[ExecuteAITask] V2実行エラー:`, error);
                window.__v2_execution_result = { success: false, error: error.message };
                window.__v2_execution_complete = true;
              });
              
              console.log(`[ExecuteAITask] V2実行を開始しました、完了を待機中...`);
              
              // 完了フラグを返す（バックグラウンドで待機処理を行う）
              return { 
                success: true, 
                message: 'V2 execution started',
                v2Executing: true,
                waitForCompletion: true
              };
            } else if (typeof automation.runAutomation === 'function') {
              console.log(`[ExecuteAITask] 🎯 ${foundName}.runAutomationを実行中...`);
              
              // 従来版も同様に処理
              const executePromise = automation.runAutomation(config);
              
              window.__v1_execution_result = null;
              window.__v1_execution_complete = false;
              
              executePromise.then(result => {
                console.log(`[ExecuteAITask] V1実行完了:`, result);
                window.__v1_execution_result = result;
                window.__v1_execution_complete = true;
              }).catch(error => {
                console.error(`[ExecuteAITask] V1実行エラー:`, error);
                window.__v1_execution_result = { success: false, error: error.message };
                window.__v1_execution_complete = true;
              });
              
              console.log(`[ExecuteAITask] V1実行を開始しました、完了を待機中...`);
              
              return { 
                success: true, 
                message: 'V1 execution started',
                v1Executing: true,
                waitForCompletion: true
              };
            } else {
              return { success: false, error: `${foundName}に適切な実行方法が見つかりません` };
            }

          } catch (error) {
            console.error(`[ExecuteAITask] 実行エラー:`, error);
            return { success: false, error: error.message };
          }
        },
        args: [taskData]
        });
        
        this.logger.log(`[AITaskExecutor] 📊 executeScript完了、結果確認中...`);
      } catch (scriptError) {
        this.logger.error(`[AITaskExecutor] ❌ executeScript実行エラー:`, scriptError);
        throw scriptError;
      }

      // 結果を返す
      if (result && result[0] && result[0].result) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const resultData = result[0].result;
        const cellPosition = taskData.cellInfo?.column && taskData.cellInfo?.row 
          ? `${taskData.cellInfo.column}${taskData.cellInfo.row}` 
          : '不明';
        
        if (resultData.waitForCompletion) {
          this.logger.log(`[AITaskExecutor] 📝 [${taskData.aiType}] タスク実行開始、完了待機中 [${cellPosition}セル]`);
          
          // V2/V1実行の完了を待つ（timeout-config.jsから設定を取得）
          const isV2 = resultData.v2Executing;
          const isDeepResearchOrAgent = taskData.function && (
            taskData.function.toLowerCase().includes('deep research') ||
            taskData.function.toLowerCase().includes('deepresearch') ||
            taskData.function.toLowerCase().includes('エージェント') ||
            taskData.function.toLowerCase().includes('agent')
          );
          
          // timeout-config.jsから適切なタイムアウト値を取得（Service Worker対応）
          const globalCtx = (typeof globalThis !== 'undefined' ? globalThis : 
                            typeof self !== 'undefined' ? self : 
                            typeof window !== 'undefined' ? window : {});
          const aiConfig = globalCtx.getAIConfig ? globalCtx.getAIConfig(taskData.aiType) : null;
          const defaultTimeout = globalCtx.CONFIG?.TIMEOUT?.RESPONSE_WAIT || 300000; // デフォルト5分
          const deepTimeout = globalCtx.CONFIG?.TIMEOUT?.DEEP_RESEARCH || 2400000; // デフォルト40分
          
          let maxWaitTime;
          if (isDeepResearchOrAgent) {
            // DeepResearch/エージェントモードの場合
            maxWaitTime = aiConfig?.DEEP_RESEARCH_TIMEOUT || deepTimeout;
          } else {
            // 通常モードの場合
            maxWaitTime = aiConfig?.RESPONSE_TIMEOUT || defaultTimeout;
          }
          
          this.logger.log(`[AITaskExecutor] タイムアウト設定: ${maxWaitTime / 1000}秒 (${isDeepResearchOrAgent ? 'DeepResearch/Agent' : '通常'})`);
          const checkInterval = 500;
          const waitStartTime = Date.now();
          
          while ((Date.now() - waitStartTime) < maxWaitTime) {
            const [checkResult] = await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: (isV2) => {
                const completeFlag = isV2 ? '__v2_execution_complete' : '__v1_execution_complete';
                const resultFlag = isV2 ? '__v2_execution_result' : '__v1_execution_result';
                return {
                  complete: window[completeFlag] || false,
                  result: window[resultFlag] || null
                };
              },
              args: [isV2]
            });
            
            if (checkResult?.result?.complete) {
              const execResult = checkResult.result.result;
              this.logger.log(`[AITaskExecutor] ✅ [${taskData.aiType}] 実行完了:`, execResult);
              
              if (execResult?.success) {
                return {
                  success: true,
                  message: 'Task completed successfully',
                  response: execResult.response || ''
                };
              } else {
                return {
                  success: false,
                  error: execResult?.error || 'Unknown error during execution'
                };
              }
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
          }
          
          // タイムアウト
          this.logger.warn(`[AITaskExecutor] ⚠️ [${taskData.aiType}] 実行タイムアウト`);
          return {
            success: false,
            error: 'Execution timeout'
          };
        } else if (resultData.taskStarted) {
          // 旧方式（互換性のため残す）
          this.logger.log(`[AITaskExecutor] 📝 [${taskData.aiType}] タスク開始 [${cellPosition}セル]:`, {
            セル: cellPosition,
            taskId: taskData.taskId,
            message: resultData.message,
            totalTime: `${totalTime}秒`
          });
          
          return {
            success: true,
            message: 'Task execution started',
            response: ''
          };
        } else if (resultData.success) {
          this.logger.log(`[AITaskExecutor] ✅ [${taskData.aiType}] タスク完了 [${cellPosition}セル]:`, {
            セル: cellPosition,
            taskId: taskData.taskId,
            success: true,
            responseLength: resultData.response?.length || 0,
            totalTime: `${totalTime}秒`
          });
        } else {
          this.logger.log(`[AITaskExecutor] ⚠️ [${taskData.aiType}] タスク失敗 [${cellPosition}セル]:`, {
            セル: cellPosition,
            taskId: taskData.taskId,
            error: resultData.error,
            totalTime: `${totalTime}秒`
          });
        }
        
        return resultData;
      } else {
        throw new Error('スクリプト実行結果が不正です');
      }

    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const cellPosition = taskData.cellInfo?.column && taskData.cellInfo?.row 
        ? `${taskData.cellInfo.column}${taskData.cellInfo.row}` 
        : '不明';
      
      this.logger.error(`[AITaskExecutor] ❌ [${taskData.aiType}] 実行エラー [${cellPosition}セル]:`, {
        セル: cellPosition,
        taskId: taskData.taskId,
        error: error.message,
        stack: error.stack,
        totalTime: `${totalTime}秒`
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 複数のAIタスクを並列実行
   * @param {Array<Object>} tasks - タスクの配列
   * @param {number} maxConcurrent - 最大同時実行数
   * @returns {Promise<Array<Object>>} 実行結果の配列
   */
  async executeMultipleTasks(tasks, maxConcurrent = 4) {
    const results = [];
    const executing = [];
    
    for (const task of tasks) {
      const promise = this.executeAITask(task.tabId, task).then(result => {
        return { taskId: task.taskId, result };
      });
      
      results.push(promise);
      
      if (tasks.length >= maxConcurrent) {
        executing.push(promise);
        
        if (executing.length >= maxConcurrent) {
          await Promise.race(executing);
          executing.splice(executing.findIndex(p => p.isResolved), 1);
        }
      }
    }
    
    return Promise.all(results);
  }
}

// デフォルトインスタンスをエクスポート
export const aiTaskExecutor = new AITaskExecutor();