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

// タイムアウト設定は削除済み - デフォルト値を使用
import { RetryManager } from '../utils/retry-manager.js';
import { ConsoleLogger } from '../utils/console-logger.js';

export class AITaskExecutor {
  constructor(logger = console) {
    // ConsoleLoggerインスタンスを作成（互換性を保持）
    this.logger = logger instanceof ConsoleLogger ? logger : new ConsoleLogger('ai-task-executor', logger);
    // RetryManagerを初期化
    this.retryManager = new RetryManager(this.logger);
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
      this.logger.error('[Step 1-1: aiType未定義] aiTypeが未定義です。デフォルトでChatGPTを使用します', {
        セル: cellPosition,
        taskId: taskData.taskId,
        全プロパティ: Object.keys(taskData).join(', ')
      });
      taskData.aiType = 'ChatGPT'; // デフォルト値を設定
    }
    
    this.logger.log(`[Step 1: タスク実行開始] 🚀 AIタスク実行開始 [${cellPosition}セル] [${taskData.aiType}]`, {
      セル: cellPosition,
      tabId,
      taskId: taskData.taskId,
      model: taskData.model,
      function: taskData.function,
      promptLength: taskData.prompt?.length,
      promptPreview: taskData.prompt ? taskData.prompt.substring(0, 100) + '...' : '❌ プロンプトが空！',
      hasPrompt: !!taskData.prompt,
      spreadsheetId: taskData.spreadsheetId,  // デバッグ: spreadsheetId確認
      gid: taskData.gid,  // デバッグ: gid確認
      timestamp: new Date().toLocaleTimeString()
    });

    try {
      // V2ファイルマップを定義（共通で使用）
      const scriptMap = {
        'claude': 'automations/claude-automation.js',
        'chatgpt': 'automations/chatgpt-automation.js',
        'gemini': 'automations/gemini-automation.js'
      };
      
      // すべてのAIタイプで共通の処理を使用
      // V2ファイルマップはすでに上で定義済み（Geminiも含む）
      
      // aiTypeの再チェック（念のため）
      if (!taskData.aiType) {
        taskData.aiType = 'ChatGPT';
      }
      
      const aiTypeLower = taskData.aiType.toLowerCase();
      
      // AI固有のスクリプトマップ
      const scriptFileMap = {
        'claude': scriptMap['claude'],
        'chatgpt': scriptMap['chatgpt'],
        'gemini': scriptMap['gemini'],
        'genspark': 'automations/genspark-automation.js'
      };

      // AI固有のスクリプトを追加
      const aiScript = scriptFileMap[aiTypeLower] ||
                       `automations/${aiTypeLower}-automation.js`;

      // 共通スクリプトを順番に注入（現在はAI固有のスクリプトのみ）
      let scriptsToInject = [aiScript];

      const injectionStartTime = performance.now();
      this.logger.log(`[Step 2: スクリプト注入] 📝 [${taskData.aiType}] スクリプト注入開始`, {
        scripts: scriptsToInject.map(s => s.split('/').pop()),
        count: scriptsToInject.length
      });

      // スクリプトを注入（統合テストと同じ方式）
      for (const scriptFile of scriptsToInject) {
        this.logger.log(`[Step 2-1: スクリプト注入中] 📝 注入中: ${scriptFile}`);
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [scriptFile]
        });
      }

      const injectionTime = (performance.now() - injectionStartTime).toFixed(0);
      this.logger.log(`[Step 2-2: スクリプト注入完了] ✅ [${taskData.aiType}] スクリプト注入完了 (${injectionTime}ms)、初期化確認中...`);

      // スクリプト実行完了を待つ（初期化完了のため延長）
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒に延長
      
      // ページが真っ暗かどうかチェック
      try {
        const [pageCheck] = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            // bodyの背景色をチェック
            const bodyStyle = window.getComputedStyle(document.body);
            const bgColor = bodyStyle.backgroundColor;
            const isDark = bgColor === 'rgb(0, 0, 0)' || bgColor === 'black';
            
            // 主要な要素が存在するかチェック
            const hasContent = document.body.children.length > 0;
            const hasVisibleContent = Array.from(document.body.children).some(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            });
            
            return {
              isDark,
              hasContent,
              hasVisibleContent,
              bodyChildrenCount: document.body.children.length
            };
          }
        });
        
        if (pageCheck?.result?.isDark && !pageCheck?.result?.hasVisibleContent) {
          this.logger.warn(`[AITaskExecutor] ⚠️ ページが真っ暗な可能性があります。リロードを試みます...`);
          
          // ページをリロード
          await chrome.tabs.reload(tabId);
          await new Promise(resolve => setTimeout(resolve, 5000)); // リロード後5秒待機
        }
      } catch (e) {
        this.logger.warn(`[AITaskExecutor] ページチェックエラー:`, e);
      }

      // V2版の存在を確認（リトライ機能付き）
      let v2CheckSuccess = false;
      let v2CheckAttempts = 0;
      const maxV2CheckAttempts = 5; // 5秒間リトライ

      // Claudeの場合はV2チェックをスキップ（メッセージ通信を使用）
      if (taskData.aiType.toLowerCase() === 'claude') {
        v2CheckSuccess = true;
        this.logger.log(`[Step 3: V2チェック] ✅ Claudeはメッセージ通信を使用するためV2チェックをスキップ`);
      } else {
        while (!v2CheckSuccess && v2CheckAttempts < maxV2CheckAttempts) {
          v2CheckAttempts++;
          this.logger.log(`[Step 3: V2チェック] V2チェック試行 ${v2CheckAttempts}/${maxV2CheckAttempts}`);

          try {
          const [v2Check] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (aiType, attempt) => {
              console.log(`[V2チェック] ${aiType}のV2スクリプト確認開始（試行${attempt}）`);

              // 全てのAutomation関連オブジェクトをリスト
              const allAutomations = Object.keys(window).filter(key => key.includes('Automation'));
              console.log(`[V2チェック] 全Automationオブジェクト:`, allAutomations);

              // ChatGPT固有のチェック
              console.log(`[V2チェック] window.ChatGPTAutomationV2:`, window.ChatGPTAutomationV2);
              console.log(`[V2チェック] window.ChatGPTAutomation:`, window.ChatGPTAutomation);
              console.log(`[V2チェック] typeof ChatGPTAutomationV2:`, typeof window.ChatGPTAutomationV2);
              console.log(`[V2チェック] typeof ChatGPTAutomation:`, typeof window.ChatGPTAutomation);

              // スクリプト読み込み状況確認
              const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src).filter(src => src.includes('chatgpt'));
              console.log(`[V2チェック] ChatGPT関連スクリプト:`, scripts);

              // スクリプトマーカー確認
              console.log(`[V2チェック] CHATGPT_SCRIPT_LOADED:`, window.CHATGPT_SCRIPT_LOADED);
              console.log(`[V2チェック] CHATGPT_SCRIPT_INIT_TIME:`, window.CHATGPT_SCRIPT_INIT_TIME);

              // より詳細な情報
              if (window.CHATGPT_SCRIPT_LOADED) {
                const elapsed = Date.now() - (window.CHATGPT_SCRIPT_INIT_TIME || 0);
                console.log(`[V2チェック] スクリプト初期化から経過時間:`, elapsed + 'ms');
                console.log(`[V2チェック] 現在時刻:`, new Date().toLocaleTimeString());
              }

              // 初期化マーカーの確認ロジック
              const initMarkers = {
                'chatgpt': { marker: 'CHATGPT_SCRIPT_LOADED', time: 'CHATGPT_SCRIPT_INIT_TIME' },
                'claude': { marker: 'CLAUDE_SCRIPT_LOADED', time: 'CLAUDE_SCRIPT_INIT_TIME' },
                'gemini': { marker: 'GEMINI_SCRIPT_LOADED', time: 'GEMINI_SCRIPT_INIT_TIME' }
              };

              const currentMarker = initMarkers[aiType.toLowerCase()];
              const markerExists = currentMarker && window[currentMarker.marker];
              const initTime = currentMarker && window[currentMarker.time];

              console.log(`[V2チェック] ${currentMarker?.marker}:`, markerExists);
              if (initTime) {
                console.log(`[V2チェック] 初期化時刻:`, new Date(initTime).toLocaleTimeString());
              }

              const v2Names = {
                'chatgpt': 'ChatGPTAutomationV2',
                'gemini': 'GeminiAutomation'  // GeminiはV2でも同じ名前
              };
              const v2Name = v2Names[aiType.toLowerCase()];
              const v2ObjectExists = v2Name && typeof window[v2Name] !== 'undefined';

              // 初期化マーカーとV2オブジェクトの両方が存在する場合のみ成功とする
              const exists = v2ObjectExists && (markerExists || aiType.toLowerCase() === 'gemini');

              if (v2ObjectExists) {
                console.log(`[V2チェック] ${v2Name}のメソッド:`, Object.keys(window[v2Name]));
              }

              console.log(`[V2チェック] 総合判定: V2Object=${v2ObjectExists}, InitMarker=${markerExists}, 最終結果=${exists}`);

              return {
                exists,
                v2Name,
                allAutomations,
                hasV2: typeof window.ChatGPTAutomationV2 !== 'undefined',
                hasV1: typeof window.ChatGPTAutomation !== 'undefined',
                markerExists,
                v2ObjectExists,
                initTime
              };
            },
            args: [taskData.aiType, v2CheckAttempts]
          });

          this.logger.log(`[Step 3-1: V2チェック結果] 📋 V2チェック結果（試行${v2CheckAttempts}）:`, v2Check?.result);

          if (v2Check?.result?.exists) {
            v2CheckSuccess = true;
            this.logger.log(`[Step 3-2: V2チェック成功] ✅ V2スクリプト確認成功（${v2CheckAttempts}回目）`);
          } else {
            if (v2CheckAttempts < maxV2CheckAttempts) {
              this.logger.warn(`[AITaskExecutor] ⚠️ V2スクリプト未確認、1秒後にリトライ...（${v2CheckAttempts}/${maxV2CheckAttempts}）`);
              this.logger.warn(`[AITaskExecutor] 状況: V2Object=${v2Check?.result?.v2ObjectExists}, InitMarker=${v2Check?.result?.markerExists}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              this.logger.warn(`[AITaskExecutor] ⚠️ ${taskData.aiType}のV2スクリプト初期化が完了していませんが、処理を継続します`);
              this.logger.warn(`[AITaskExecutor] 詳細分析:`);
              this.logger.warn(`  - 全Automationオブジェクト: ${v2Check?.result?.allAutomations?.join(', ') || 'なし'}`);
              this.logger.warn(`  - ${taskData.aiType}V2オブジェクト存在: ${v2Check?.result?.v2ObjectExists || false}`);
              this.logger.warn(`  - 初期化マーカー存在: ${v2Check?.result?.markerExists || false}`);
              this.logger.warn(`  - 初期化時刻: ${v2Check?.result?.initTime ? new Date(v2Check?.result?.initTime).toLocaleString() : '不明'}`);
              this.logger.warn(`  - 経過時間: ${v2Check?.result?.initTime ? Math.round((Date.now() - v2Check?.result?.initTime) / 1000) + '秒' : '不明'}`);
              this.logger.warn(`[AITaskExecutor] 推奨対応: スクリプトの読み込み完了を確認してください`);
            }
          }
          } catch (e) {
            this.logger.error(`[AITaskExecutor] V2チェックエラー（試行${v2CheckAttempts}）:`, e);
            if (v2CheckAttempts < maxV2CheckAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      }

      // タブの状態を確認（RetryManagerを使用）
      const tabReadyResult = await this.retryManager.executeSimpleRetry({
        action: async () => {
          const tab = await chrome.tabs.get(tabId);
          this.logger.log(`[AITaskExecutor] タブ状態確認: status=${tab.status}, url=${tab.url}`);

          // タブがcompleteで、URLが正しく読み込まれているか確認
          if (tab.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
            this.logger.log(`[AITaskExecutor] ✅ タブ準備完了: ${tab.url}`);
            return true;
          }
          return null; // まだ準備ができていない
        },
        isSuccess: (result) => result === true,
        maxRetries: 10,
        interval: 1000,
        actionName: 'タブ状態確認',
        context: { tabId, aiType: taskData.aiType }
      });

      if (!tabReadyResult.success) {
        this.logger.warn(`[AITaskExecutor] ⚠️ タブが完全に読み込まれていない可能性があります`);
      }
      
      // ページ読み込み完了を待つ（ネット環境を考慮して延長）
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機

      // スクリプト初期化を動的に確認（最大15秒、100ms間隔でポーリング）
      const initStartTime = performance.now();
      const maxWaitTime = 15000; // 15秒に増やす
      const checkInterval = 100; // 100msに変更
      let isReady = false;

      // Claudeの場合はメッセージ通信で準備状態を確認
      if (taskData.aiType.toLowerCase() === 'claude') {
        while (!isReady && (performance.now() - initStartTime) < maxWaitTime) {
          try {
            const response = await chrome.tabs.sendMessage(tabId, {
              type: 'CLAUDE_CHECK_READY'
            });

            if (response?.ready) {
              isReady = true;
              const initTime = (performance.now() - initStartTime).toFixed(0);
              this.logger.log(`[Step 3-3: スクリプト初期化完了] 🎯 [Claude] スクリプト初期化完了（メッセージ通信） (${initTime}ms)`);
            } else {
              await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
          } catch (e) {
            // エラー時は少し待って続行
            await new Promise(resolve => setTimeout(resolve, checkInterval));
          }
        }
      } else {
        // Claude以外は従来のグローバルオブジェクトチェック
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
              this.logger.log(`[Step 3-3: スクリプト初期化完了] 🎯 [${taskData.aiType}] スクリプト初期化完了 (${initTime}ms)`);
            } else {
              await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
          } catch (e) {
            // エラー時は少し待って続行
            await new Promise(resolve => setTimeout(resolve, checkInterval));
          }
        }
      }
      
      if (!isReady) {
        // タイムアウトした場合でも続行（フォールバック）
        this.logger.warn(`[AITaskExecutor] ⚠️ [${taskData.aiType}] スクリプト初期化確認タイムアウト、続行します`);
      }

      this.logger.log(`[Step 4: タスク実行] 🔄 [${taskData.aiType}] タスク実行開始...`);
      
      // タスクを実行
      let result;
      try {
        // Claudeの場合はメッセージベースの通信を使用
        if (taskData.aiType.toLowerCase() === 'claude') {
          // Chrome tabs.sendMessageを使用してContent Scriptと通信
          result = await chrome.tabs.sendMessage(tabId, {
            type: 'CLAUDE_EXECUTE_TASK',
            taskData: taskData
          });

          this.logger.log('[Step 5: タスク実行結果] 🎉 Claudeメッセージ通信結果:', result);

          if (result && result.success) {
            return {
              success: true,
              response: result.result?.response || '',
              status: result.result?.status || 'success',
              model: taskData.model,
              function: taskData.function,
              url: result.result?.url || 'N/A',
              executionTime: Date.now() - startTime
            };
          } else {
            // エラーメッセージを安全に処理
            let errorMessage = 'Claudeメッセージ通信エラー';

            // result.errorの型を確認して安全に処理
            if (result && result.error) {
              if (typeof result.error === 'string') {
                errorMessage = result.error;
              } else if (typeof result.error === 'object' && result.error.message) {
                errorMessage = result.error.message;
              }
            }

            throw new Error(errorMessage);
          }
        }

        // Claude以外はV2グローバルオブジェクト方式を使用
        result = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (taskData) => {
          console.log('[ExecuteAITask] タスクデータ受信（同期版）:', taskData);

          try {
            // 統合テストと同じAI自動化オブジェクト検索方式（V2版を優先）
            const automationMap = {
              'ChatGPT': ['ChatGPTAutomationV2', 'ChatGPTAutomation', 'ChatGPT'],
              'chatgpt': ['ChatGPTAutomationV2', 'ChatGPTAutomation', 'ChatGPT'],
              'Gemini': ['GeminiAutomation', 'Gemini'],
              'gemini': ['GeminiAutomation', 'Gemini'],
              'Genspark': ['GensparkAutomationV2', 'GensparkAutomation', 'Genspark'],
              'genspark': ['GensparkAutomationV2', 'GensparkAutomation', 'Genspark']
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

            // 初期化マーカーの詳細確認
            const initMarkers = {
              'chatgpt': 'CHATGPT_SCRIPT_LOADED',
              'claude': 'CLAUDE_SCRIPT_LOADED',
              'gemini': 'GEMINI_SCRIPT_LOADED'
            };
            const currentMarker = initMarkers[taskData.aiType.toLowerCase()];
            console.log(`[ExecuteAITask] 🔍 初期化マーカー確認:`, {
              marker: currentMarker,
              exists: currentMarker ? window[currentMarker] : 'N/A',
              windowKeys: Object.keys(window).filter(k => k.includes('SCRIPT_LOADED'))
            });

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
              console.error(`[ExecuteAITask] ❌ V2スクリプトの初期化に失敗しています - フォールバックは無効化されています`);
              console.log(`[ExecuteAITask] 📋 ウィンドウで利用可能: ${availableKeys.join(', ')}`);

              // フォールバック無効化 - エラーで停止
              throw new Error(`${taskData.aiType}の自動化オブジェクトが見つかりません。V2スクリプトの初期化を確認してください。`);
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
              function: taskData.function || '通常',
              aiType: taskData.aiType
            };
            console.log(`[ExecuteAITask] 📝 タスク情報をグローバル変数に設定:`, window.currentAITaskInfo);

            // window.AIHandlerオブジェクトを設定（存在しない場合のみ）
            if (!window.AIHandler) {
              window.AIHandler = {
                /**
                 * 送信時刻を記録
                 * @param {string} aiType - AI種別 (ChatGPT/Claude/Gemini)
                 * @returns {Promise<void>}
                 */
                recordSendTimestamp: async function(aiType) {
                  try {
                    const taskInfo = window.currentAITaskInfo;
                    if (!taskInfo) {
                      console.warn('[AIHandler] currentAITaskInfoが設定されていません');
                      return;
                    }

                    // Chrome拡張機能のメッセージ送信で記録
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                      await chrome.runtime.sendMessage({
                        type: 'RECORD_SEND_TIMESTAMP',
                        data: {
                          taskId: taskInfo.taskId,
                          aiType: aiType,
                          model: taskInfo.model,
                          function: taskInfo.function || '通常',
                          timestamp: new Date().toISOString()
                        }
                      });
                      console.log(`✅ [AIHandler] 送信時刻記録成功: ${taskInfo.taskId}`);
                    } else {
                      console.warn('[AIHandler] Chrome runtime APIが利用できません');
                    }
                  } catch (error) {
                    console.error('[AIHandler] recordSendTimestampエラー:', error);
                  }
                },

                /**
                 * 現在のタスク情報を取得
                 * @returns {Object|null} タスク情報
                 */
                getCurrentTaskInfo: function() {
                  return window.currentAITaskInfo || null;
                },

                /**
                 * 現在のタスク情報を設定
                 * @param {Object} taskInfo - タスク情報
                 */
                setCurrentTaskInfo: function(taskInfo) {
                  window.currentAITaskInfo = taskInfo;
                  console.log('[AIHandler] タスク情報設定:', taskInfo);
                },

                /**
                 * 現在のタスク情報をクリア
                 */
                clearCurrentTaskInfo: function() {
                  window.currentAITaskInfo = null;
                  console.log('[AIHandler] タスク情報クリア');
                }
              };
              console.log(`[ExecuteAITask] 📝 window.AIHandlerを初期化しました`);
            }

            // 設定オブジェクト（統合テストと同じ形式）
            const config = {
              model: taskData.model,
              function: taskData.function,
              text: taskData.prompt,  // プロンプトをそのまま使用（実際の追加はautomations/*.jsで行われる）
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
              
              // V2版のexecuteTaskを直接実行し、その結果を待つ
              // CSP回避のため、Promiseを作成してthenで処理
              const executePromise = automation.executeTask(taskData);
              
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
        
        this.logger.log(`[Step 4-1: executeScript完了] 📊 executeScript完了、結果確認中...`);
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
          this.logger.log(`[Step 4-2: タスク実行開始] 📝 [${taskData.aiType}] タスク実行開始、完了待機中 [${cellPosition}セル]`);
          
          // V2/V1実行の完了を待つ（デフォルトタイムアウト値を使用）
          const isV2 = resultData.v2Executing;
          const isDeepResearchOrAgent = taskData.function && (
            taskData.function.toLowerCase().includes('deep research') ||
            taskData.function.toLowerCase().includes('deepresearch') ||
            taskData.function.toLowerCase().includes('エージェント') ||
            taskData.function.toLowerCase().includes('agent')
          );

          // デフォルトタイムアウト値を使用（Service Worker対応）
          const globalCtx = (typeof globalThis !== 'undefined' ? globalThis :
                            typeof self !== 'undefined' ? self :
                            typeof window !== 'undefined' ? window : {});
          const aiConfig = globalCtx.getAIConfig ? globalCtx.getAIConfig(taskData.aiType) : null;
          const defaultTimeout = 600000; // デフォルト10分
          const deepTimeout = 2400000; // デフォルト40分
          
          let maxWaitTime;
          if (isDeepResearchOrAgent) {
            // DeepResearch/エージェントモードの場合
            maxWaitTime = aiConfig?.DEEP_RESEARCH_TIMEOUT || deepTimeout;
          } else {
            // 通常モードの場合
            maxWaitTime = aiConfig?.RESPONSE_TIMEOUT || defaultTimeout;
          }
          
          this.logger.log(`[Step 4-3: タイムアウト設定] タイムアウト設定: ${maxWaitTime / 1000}秒 (${isDeepResearchOrAgent ? 'DeepResearch/Agent' : '通常'})`);
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
              this.logger.log(`[Step 5: タスク完了] ✅ [${taskData.aiType}] 実行完了`, execResult);
              
              if (execResult?.success) {
                // タブのURLを取得（詳細エラーログ付き）
                let tabUrl = 'N/A';
                try {
                  console.log(`[URL取得] タブID ${tabId} のURL取得を試行中...`);
                  const tab = await chrome.tabs.get(tabId);

                  console.log(`[URL取得] タブ情報:`, {
                    id: tab.id,
                    status: tab.status,
                    url: tab.url,
                    title: tab.title?.substring(0, 50) + '...'
                  });

                  if (tab.url && tab.url !== 'chrome://newtab/' && !tab.url.startsWith('chrome://')) {
                    tabUrl = tab.url;
                    console.log(`[URL取得] ✅ URL取得成功: ${tabUrl}`);
                  } else {
                    console.warn(`[URL取得] ⚠️ 無効なURL: ${tab.url}`);
                    tabUrl = tab.url || 'N/A';
                  }
                } catch (e) {
                  console.error(`[URL取得] ❌ エラー詳細:`, {
                    message: e.message,
                    tabId: tabId,
                    chromeLastError: chrome.runtime.lastError
                  });
                  this.logger.error(`タブURL取得失敗: ${e.message}`);
                }

                console.log(`[URL取得] 最終結果: ${tabUrl}`);

                return {
                  success: true,
                  message: 'Task completed successfully',
                  response: execResult.response || '',
                  url: tabUrl
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
        
        // タスク完了後、グローバル変数をクリア
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            window.currentAITaskInfo = null;
            console.log('[ExecuteAITask] 🗑️ タスク情報をクリアしました');
          }
        });

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
      
      // エラー時もグローバル変数をクリア
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            window.currentAITaskInfo = null;
            console.log('[ExecuteAITask] 🗑️ エラー後、タスク情報をクリアしました');
          }
        });
      } catch (clearError) {
        // クリアエラーは無視
      }

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

  /**
   * AI検出専用のタスク実行メソッド
   *
   * AI検出システム用に最適化されたメソッドです。
   * 通常のexecuteAITaskとは異なり、検出モードで実行します。
   *
   * @param {number} tabId - 実行対象のタブID
   * @param {Object} detectionConfig - 検出設定
   * @param {string} detectionConfig.aiType - AI種別 (claude, chatgpt, gemini)
   * @param {string} detectionConfig.aiName - AI表示名
   * @returns {Promise<Object>} 検出結果
   */
  async executeDetectionTask(tabId, detectionConfig) {
    const startTime = Date.now();
    const { aiType, aiName } = detectionConfig;

    this.logger.log(`[AITaskExecutor] 🔍 AI検出タスク開始 [${aiName}]:`, {
      tabId,
      aiType,
      aiName,
      timestamp: new Date().toLocaleTimeString()
    });

    try {
      // 検出用タスクデータの作成
      const detectionTaskData = {
        aiType: aiType,
        taskId: `detection_${aiName.toLowerCase()}_${Date.now()}`,
        prompt: 'AI_DETECTION_MODE', // 特殊フラグで検出モードを指示
        isDetectionMode: true,
        model: 'auto', // 自動検出
        function: 'auto', // 自動検出
        cellInfo: { column: 'DETECT', row: 1 } // 検出用の仮想セル情報
      };

      // 本番のexecuteAITaskを検出モードで実行
      const result = await this.executeAITask(tabId, detectionTaskData);

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.success) {
        this.logger.log(`[AITaskExecutor] ✅ [${aiName}] 検出成功:`, {
          aiName,
          totalTime: `${totalTime}秒`,
          hasData: !!(result.detectionData || result.saveData)
        });

        return {
          success: true,
          aiName: aiName,
          saveData: result.detectionData || result.saveData || {},
          detectionResult: result
        };
      } else {
        this.logger.error(`[AITaskExecutor] ❌ [${aiName}] 検出失敗:`, {
          aiName,
          error: result.error,
          totalTime: `${totalTime}秒`
        });

        return {
          success: false,
          aiName: aiName,
          error: result.error || '検出処理が失敗しました'
        };
      }

    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

      this.logger.error(`[AITaskExecutor] ❌ [${aiName}] 検出エラー:`, {
        aiName,
        error: error.message,
        stack: error.stack,
        totalTime: `${totalTime}秒`
      });

      return {
        success: false,
        aiName: aiName,
        error: error.message
      };
    }
  }
}

// デフォルトインスタンスをエクスポート
export const aiTaskExecutor = new AITaskExecutor();