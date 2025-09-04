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
      
      // Geminiタスクは統合版で実行（V2版を優先）
      if (taskData.aiType.toLowerCase() === 'gemini') {
        this.logger.log(`[AITaskExecutor] 🎯 Gemini統合版実行`);
        
        // V2版があれば使用、なければ既存版
        const geminiScript = v2ScriptMap['gemini'] || 'src/platforms/gemini-automation.js';
        
        // 統合版スクリプトを注入
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [geminiScript]
        });
        
        this.logger.log(`[AITaskExecutor] ✅ Gemini Automationスクリプト注入完了`);
        
        // 初期化待機を動的に（最大1秒）
        const geminiInitStart = performance.now();
        let geminiReady = false;
        const maxGeminiWait = 1000;
        
        while (!geminiReady && (performance.now() - geminiInitStart) < maxGeminiWait) {
          try {
            const [checkResult] = await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => window.GeminiAutomation !== undefined
            });
            
            if (checkResult?.result) {
              geminiReady = true;
              const waitTime = (performance.now() - geminiInitStart).toFixed(0);
              this.logger.log(`[AITaskExecutor] ✅ Gemini初期化完了 (${waitTime}ms)`);
            } else {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        this.logger.log(`[AITaskExecutor] executeTask実行を開始します...`);
        
        // executeTaskを直接実行
        let result;
        try {
          result = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: async (taskData) => {
              try {
                console.log('%c🚀 [Gemini] タスク実行開始', 'color: #4285f4; font-weight: bold; font-size: 16px');
                console.log('[Gemini] タスクデータ:', {
                  model: taskData.model,
                  function: taskData.function,
                  hasText: !!taskData.prompt,
                  textLength: taskData.prompt?.length
                });
                
                // GeminiAutomation.executeTaskを実行
                if (!window.GeminiAutomation || !window.GeminiAutomation.executeTask) {
                  throw new Error('GeminiAutomation.executeTask関数が見つかりません');
                }
                
                const result = await window.GeminiAutomation.executeTask({
                  model: taskData.model,
                  function: taskData.function,
                  text: taskData.prompt,
                  prompt: taskData.prompt  // promptプロパティも追加
                });
                
                console.log('[Gemini] タスク実行結果:', result);
                return result;
                
              } catch (error) {
                console.error('❌ [Gemini] 実行エラー:', error);
                return { success: false, error: error.message };
              }
            },
            args: [taskData]
          });
        } catch (scriptError) {
          this.logger.error(`[AITaskExecutor] ❌ スクリプト実行エラー:`, scriptError);
          throw scriptError;
        }
        
        // 結果を返す
        if (result && result[0] && result[0].result) {
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
          const resultData = result[0].result;
          
          if (resultData.success) {
            this.logger.log(`[AITaskExecutor] ✅ Geminiタスク完了 [${cellPosition}セル]:`, {
              セル: cellPosition,
              taskId: taskData.taskId,
              totalTime: `${totalTime}秒`
            });
          } else {
            this.logger.log(`[AITaskExecutor] ⚠️ Geminiタスク失敗 [${cellPosition}セル]:`, {
              セル: cellPosition,
              taskId: taskData.taskId,
              error: resultData.error,
              totalTime: `${totalTime}秒`
            });
          }
          
          return resultData;
        } else {
          throw new Error('実行結果が不正です');
        }
      }
      
      // Gemini以外は従来の処理
      // V2ファイルマップはすでに上で定義済み
      
      const aiTypeLower = taskData.aiType.toLowerCase();
      const hasV2 = v2ScriptMap.hasOwnProperty(aiTypeLower);
      const isV2Available = hasV2;
      
      // AI固有のスクリプトマップ（V2版を優先）
      const scriptFileMap = {
        'claude': hasV2 ? v2ScriptMap['claude'] : 'automations/claude-automation-dynamic.js',
        'chatgpt': hasV2 ? v2ScriptMap['chatgpt'] : 'automations/chatgpt-automation.js',
        'gemini': hasV2 ? v2ScriptMap['gemini'] : 'src/platforms/gemini-automation.js',
        'genspark': 'automations/genspark-automation.js'
      };

      // V2版の場合は共通スクリプトを読み込まない（V2は独立して動作）
      const commonScripts = isV2Available ? [] : [
        'automations/feature-constants.js',
        'automations/common-ai-handler.js',
        'automations/deepresearch-handler.js',
        'automations/claude-deepresearch-selector.js'
      ];

      // AI固有のスクリプトを追加（統合テストと同じ方式）
      const aiScript = scriptFileMap[taskData.aiType.toLowerCase()] || 
                       `automations/${taskData.aiType.toLowerCase()}-automation.js`;
      
      // 共通スクリプトを順番に注入
      let scriptsToInject = [...commonScripts, aiScript];

      const injectionStartTime = performance.now();
      this.logger.log(`[AITaskExecutor] 📝 [${taskData.aiType}] スクリプト注入開始:`, {
        scripts: scriptsToInject.map(s => s.split('/').pop()),
        count: scriptsToInject.length
      });

      // スクリプトを注入（統合テストと同じ方式）
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: scriptsToInject
      });

      const injectionTime = (performance.now() - injectionStartTime).toFixed(0);
      this.logger.log(`[AITaskExecutor] ✅ [${taskData.aiType}] スクリプト注入完了 (${injectionTime}ms)、初期化確認中...`);

      // V2版の場合、ChatGPTAutomationV2の存在を確認
      if (taskData.aiType.toLowerCase() === 'chatgpt' && isV2Available) {
        try {
          const [v2Check] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const exists = typeof window.ChatGPTAutomationV2 !== 'undefined';
              console.log(`[V2チェック] ChatGPTAutomationV2存在確認: ${exists}`);
              if (exists) {
                console.log('[V2チェック] ChatGPTAutomationV2のメソッド:', Object.keys(window.ChatGPTAutomationV2));
              }
              return exists;
            }
          });
          this.logger.log(`[AITaskExecutor] 📋 ChatGPTAutomationV2存在確認: ${v2Check?.result}`);
        } catch (e) {
          this.logger.error(`[AITaskExecutor] V2チェックエラー:`, e);
        }
      }

      // スクリプト初期化を動的に確認（最大2秒、50ms間隔でポーリング）
      const initStartTime = performance.now();
      const maxWaitTime = 2000;
      const checkInterval = 50;
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
          
          // V2/V1実行の完了を待つ（最大60秒）
          const isV2 = resultData.v2Executing;
          const maxWaitTime = 60000;
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