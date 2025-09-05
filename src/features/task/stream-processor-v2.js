/**
 * @fileoverview StreamProcessor V2 - シンプル3行バッチ処理システム
 * 
 * 特徴:
 * - 3行ずつバッチで並列処理（F9,F10,F11を3ウィンドウで同時）
 * - 列ごと進行（F列完了→G列完了→H列完了）
 * - シンプルな1ファイル構成、外部Executor不使用
 */

import { AITaskExecutor } from '../../core/ai-task-executor.js';
import { WindowService } from '../../services/window-service.js';
import { aiUrlManager } from '../../core/ai-url-manager.js';
import TaskQueue from './queue.js';
import { RetryManager } from '../../utils/retry-manager.js';

// SpreadsheetLoggerをキャッシュ
let SpreadsheetLogger = null;

/**
 * SpreadsheetLoggerの動的取得
 * Service Worker環境では動的インポートが制限されるため、
 * グローバル空間に事前に登録されたクラスを使用
 */
async function getSpreadsheetLogger() {
  if (!SpreadsheetLogger) {
    try {
      if (globalThis.SpreadsheetLogger) {
        SpreadsheetLogger = globalThis.SpreadsheetLogger;
      } else if (globalThis.spreadsheetLogger) {
        SpreadsheetLogger = globalThis.spreadsheetLogger.constructor;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }
  return SpreadsheetLogger;
}

export default class StreamProcessorV2 {
  constructor(logger = console) {
    this.logger = logger;
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.retryManager = new RetryManager(logger);
    this.completedTasks = new Set();
    this.failedTasks = new Set();
    this.writtenCells = new Map();
    this.spreadsheetData = null;
    this.spreadsheetLogger = null;
    this.processedCells = new Set(); // セル単位で処理済みを追跡
    
    // 再実行管理状態
    this.failedTasksByColumn = new Map(); // column -> Set<task>
    this.retryCountByColumn = new Map(); // column -> retryCount
    this.maxRetryCount = 3; // 最大再実行回数
    this.retryDelays = [5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000]; // 5分, 30分, 1時間
    this.retryTimers = new Map(); // column -> timer
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      retriesByColumn: new Map() // column -> { attempts: number, successes: number }
    };
    
    // SpreadsheetLoggerは processTaskStream で初期化する
  }
  
  /**
   * SpreadsheetLoggerを非同期で初期化
   */
  async initializeSpreadsheetLogger() {
    try {
      const LoggerClass = await getSpreadsheetLogger();
      this.logger.log(`[StreamProcessorV2] SpreadsheetLogger初期化:`, {
        LoggerClassFound: !!LoggerClass,
        globalSpreadsheetLogger: !!globalThis.spreadsheetLogger,
        globalSpreadsheetLoggerType: typeof globalThis.spreadsheetLogger
      });
      
      if (LoggerClass) {
        this.spreadsheetLogger = globalThis.spreadsheetLogger || new LoggerClass(this.logger);
        if (!globalThis.spreadsheetLogger) {
          globalThis.spreadsheetLogger = this.spreadsheetLogger;
        }
        this.logger.log(`[StreamProcessorV2] SpreadsheetLogger初期化完了:`, {
          spreadsheetLoggerSet: !!this.spreadsheetLogger,
          hasWriteMethod: !!(this.spreadsheetLogger?.writeLogToSpreadsheet)
        });
      } else {
        this.logger.warn(`[StreamProcessorV2] SpreadsheetLoggerクラスが見つかりません`);
      }
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] SpreadsheetLogger初期化エラー:`, error);
    }
  }


  /**
   * タスクストリームを処理（3行バッチ並列処理）
   * @param {TaskList} taskList - タスクリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 実行結果
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    // タスクリストが空の場合は早期リターン
    if (!taskList || taskList.tasks.length === 0) {
      this.logger.log('[StreamProcessorV2] タスクリストが空です');
      return {
        success: true,
        total: 0,
        completed: 0,
        failed: 0,
        totalTime: '0秒'
      };
    }

    this.spreadsheetData = spreadsheetData;
    const isTestMode = options.testMode || false;
    const startTime = Date.now();
    
    // SpreadsheetLoggerを初期化
    this.logger.log('[StreamProcessorV2] SpreadsheetLogger初期化前:', {
      spreadsheetLogger: !!this.spreadsheetLogger,
      globalSpreadsheetLogger: !!globalThis.SpreadsheetLogger
    });
    
    await this.initializeSpreadsheetLogger();
    
    this.logger.log('[StreamProcessorV2] SpreadsheetLogger初期化後:', {
      spreadsheetLogger: !!this.spreadsheetLogger,
      hasWriteMethod: !!(this.spreadsheetLogger?.writeLogToSpreadsheet)
    });
    
    // テスト用: F列の最初の3タスクのみ処理
    let tasksToProcess = taskList.tasks;
    
    if (isTestMode) {
      // テストモードの場合のみF列のタスクを最初の3つに制限
      const fColumnTasks = taskList.tasks.filter(task => task.column === 'F').slice(0, 3);
      tasksToProcess = fColumnTasks.length > 0 ? fColumnTasks : taskList.tasks.slice(0, 3);
    }

    this.logger.log('[StreamProcessorV2] 🚀 3行バッチ処理開始', {
      元タスク数: taskList.tasks.length,
      処理タスク数: tasksToProcess.length,
      テストモード: isTestMode,
      制限適用: isTestMode ? 'テストモード制限' : 'なし'
    });

    try {
      // タスクを列ごとにグループ化
      const columnGroups = this.organizeTasksByColumn(tasksToProcess);
      
      // 各列を順次処理（列内は3行バッチ並列）
      for (const [column, tasks] of columnGroups) {
        await this.processColumn(column, tasks, isTestMode);
      }

      const endTime = Date.now();
      const totalTime = Math.round((endTime - startTime) / 1000);

      const result = {
        success: true,
        total: this.completedTasks.size + this.failedTasks.size,
        completed: this.completedTasks.size,
        failed: this.failedTasks.size,
        totalTime: `${totalTime}秒`
      };

      this.logger.log('[StreamProcessorV2] ✅ 全体処理完了', result);

      // タスクリストをクリア（Chrome Storageから削除）
      try {
        const taskQueue = new TaskQueue();
        await taskQueue.clearTaskList();
        this.logger.log('[StreamProcessorV2] ✅ タスクリストを削除しました');
      } catch (error) {
        this.logger.warn('[StreamProcessorV2] タスクリスト削除失敗:', error);
      }

      return result;

    } catch (error) {
      this.logger.error('[StreamProcessorV2] processTaskStream error:', error);
      throw error;
    }
  }

  /**
   * タスクを列ごとにグループ化
   */
  organizeTasksByColumn(tasks) {
    const columnGroups = new Map();
    
    tasks.forEach(task => {
      if (!columnGroups.has(task.column)) {
        columnGroups.set(task.column, []);
      }
      columnGroups.get(task.column).push(task);
    });
    
    // 各列のタスクを行順でソート
    columnGroups.forEach((tasks, column) => {
      tasks.sort((a, b) => a.row - b.row);
    });
    
    // 列をアルファベット順でソート
    return new Map([...columnGroups.entries()].sort());
  }

  /**
   * 列を3行バッチで処理
   */
  async processColumn(column, tasks, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 📋 ${column}列の処理開始`, {
      taskCount: tasks.length,
      aiType: tasks[0]?.aiType
    });

    // 3行ずつのバッチを作成
    const batches = this.createBatches(tasks, 3);
    
    // バッチごとに処理（各バッチは3つまで並列）
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      this.logger.log(`[StreamProcessorV2] 🔄 ${column}列 バッチ${batchIndex + 1}/${batches.length}処理開始`, {
        batchTasks: batch.map(t => `${t.column}${t.row}`).join(', '),
        batchSize: batch.length
      });
      
      // バッチ内のタスクを並列実行
      await this.processBatch(batch, isTestMode);
      
      this.logger.log(`[StreamProcessorV2] ✅ ${column}列 バッチ${batchIndex + 1}/${batches.length}処理完了`);
    }
    
    // 🔄 列完了時の自動再実行チェック
    await this.checkAndProcessFailedTasks(column);
    
    // 🔄 回答が空白のセルを再実行
    await this.checkAndRetryEmptyAnswers(column, tasks, isTestMode);
    
    this.logger.log(`[StreamProcessorV2] 🎉 ${column}列の処理完了`, {
      completedTasks: tasks.length
    });
    
    // 列完了時に再実行統計を表示
    this.logRetryStats();
  }

  /**
   * タスクを指定サイズのバッチに分割
   */
  createBatches(tasks, batchSize) {
    const batches = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * バッチ内のタスクを順次処理（フェーズ分け実行）
   * フェーズ1: 全ウィンドウを開いてテキスト入力
   * フェーズ2: モデルを順番に選択
   * フェーズ3: 機能を順番に選択  
   * フェーズ4: 5秒間隔で送信
   */
  async processBatch(batch, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🚀 バッチ順次処理開始（新フロー）`, {
      tasks: batch.map(t => `${t.column}${t.row}`).join(', '),
      taskCount: batch.length,
      mode: '順次実行（フェーズ分け）'
    });

    if (isTestMode) {
      // テストモードの処理
      for (const task of batch) {
        this.completedTasks.add(task.id);
        this.writtenCells.set(`${task.column}${task.row}`, true);
      }
      return;
    }

    const taskContexts = []; // 各タスクのコンテキスト（ウィンドウ情報など）を保持
    
    try {
      // ========================================
      // フェーズ1: 全ウィンドウを開いてテキスト入力
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 フェーズ1: ウィンドウ準備とテキスト入力`);
      
      for (let index = 0; index < batch.length; index++) {
        const task = batch[index];
        const position = index; // 0: 左上、1: 右上、2: 左下
        
        this.logger.log(`[StreamProcessorV2] ウィンドウ${index + 1}/${batch.length}を準備: ${task.column}${task.row}`);
        
        // ウィンドウを作成
        const tabId = await this.createWindowForTask(task, position);
        if (!tabId) {
          throw new Error(`Failed to create window for ${task.aiType}`);
        }
        
        // プロンプトを取得
        const prompt = await this.getPromptForTask(task);
        
        taskContexts.push({
          task: { ...task, prompt }, // プロンプトをタスクに追加
          tabId,
          position,
          cell: `${task.column}${task.row}`
        });
        
        // ウィンドウが開いたら、スクリプトを注入してからテキスト入力を実行
        await this.delay(3000); // ページ読み込み待機（少し長めに）
        
        // スクリプトを注入
        this.logger.log(`[StreamProcessorV2] スクリプト注入中: ${task.aiType}`);
        await this.injectScriptsForTab(tabId, task.aiType);
        
        this.logger.log(`[StreamProcessorV2] テキスト入力${index + 1}/${batch.length}: ${task.column}${task.row}`);
        const textResult = await this.executePhaseOnTab(tabId, { ...task, prompt }, 'text');
        
        if (!textResult || !textResult.success) {
          this.logger.error(`[StreamProcessorV2] テキスト入力失敗: ${task.column}${task.row}`, textResult?.error);
        }
        
        // 各ウィンドウ作成後に短い待機
        if (index < batch.length - 1) {
          await this.delay(1000);
        }
      }
      
      this.logger.log(`[StreamProcessorV2] ✅ フェーズ1完了: 全ウィンドウ準備済み`);
      await this.delay(2000); // フェーズ間の待機
      
      // ========================================
      // フェーズ2: モデルを順番に選択
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 フェーズ2: モデル選択（順番に）`);
      
      for (let index = 0; index < taskContexts.length; index++) {
        const context = taskContexts[index];
        this.logger.log(`[StreamProcessorV2] モデル選択${index + 1}/${taskContexts.length}: ${context.cell}`);
        
        // タブにフォーカスを移してモデル選択を実行
        const modelResult = await this.executePhaseOnTab(context.tabId, context.task, 'model');
        
        // 実際に選択されたモデルを保存
        if (modelResult && modelResult.success !== false && modelResult.displayedModel !== undefined) {
          context.task.displayedModel = modelResult.displayedModel;
          this.logger.log(`[StreamProcessorV2] 選択されたモデルを記録: ${context.task.model || 'Auto'} → ${modelResult.displayedModel || '(取得できず)'}`);
        }
        
        await this.delay(1000); // 各モデル選択後の待機
      }
      
      this.logger.log(`[StreamProcessorV2] ✅ フェーズ2完了: 全モデル選択済み`);
      await this.delay(2000);
      
      // ========================================
      // フェーズ3: 機能を順番に選択（リトライ機能付き）
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 フェーズ3: 機能選択（順番に）`);
      
      for (let index = 0; index < taskContexts.length; index++) {
        const context = taskContexts[index];
        this.logger.log(`[StreamProcessorV2] 機能選択${index + 1}/${taskContexts.length}: ${context.cell}`);
        
        // RetryManagerを使用して機能選択を実行
        const retryResult = await this.retryManager.executeWithWindowRetry({
          executePhase: async (tabId, task) => {
            return await this.executePhaseOnTab(tabId, task, 'function');
          },
          
          createWindow: async (task, position) => {
            return await this.createWindowForTask(task, position);
          },
          
          closeWindow: async (tabId) => {
            try {
              const tab = await chrome.tabs.get(tabId);
              if (tab && tab.windowId) {
                await chrome.windows.remove(tab.windowId);
                this.logger.log(`[StreamProcessorV2] ウィンドウを閉じました: WindowID ${tab.windowId}`);
              }
            } catch (e) {
              // エラーが発生しても処理は継続
            }
          },
          
          setupWindow: async (tabId, task) => {
            await this.delay(3000); // ページ読み込み待機
            
            // スクリプトを注入
            this.logger.log(`[StreamProcessorV2] スクリプト注入中: ${task.aiType}`);
            await this.injectScriptsForTab(tabId, task.aiType);
            
            // テキストを再入力
            this.logger.log(`[StreamProcessorV2] テキスト入力: ${context.cell}`);
            const textResult = await this.executePhaseOnTab(tabId, task, 'text');
            if (!textResult || !textResult.success) {
              this.logger.error(`[StreamProcessorV2] テキスト入力失敗: ${context.cell}`);
            }
            
            await this.delay(2000);
            
            // モデルを再選択
            this.logger.log(`[StreamProcessorV2] モデル選択: ${context.cell}`);
            const modelResult = await this.executePhaseOnTab(tabId, task, 'model');
            if (modelResult && modelResult.displayedModel !== undefined) {
              task.displayedModel = modelResult.displayedModel;
            }
            
            await this.delay(2000);
          },
          
          task: context.task,
          context: context,
          checkFunction: true,
          phaseName: '機能選択',
          maxRetries: 3
        });
        
        // 結果を処理
        if (retryResult.success && retryResult.result) {
          context.task.displayedFunction = retryResult.result.displayedFunction;
          this.logger.log(`[StreamProcessorV2] ✅ 選択された機能を記録: ${context.task.function || '通常'} → ${retryResult.result.displayedFunction || '通常'}`);
        } else {
          this.logger.error(`[StreamProcessorV2] ❌ 機能選択が失敗しました: ${context.cell}`);
          // 失敗タスクとして記録
          if (!this.failedTasksByColumn.has(context.task.column)) {
            this.failedTasksByColumn.set(context.task.column, new Set());
          }
          this.failedTasksByColumn.get(context.task.column).add(context.task);
        }
        
        await this.delay(1000); // 各機能選択後の待機
      }
      
      this.logger.log(`[StreamProcessorV2] ✅ フェーズ3完了: 全機能選択済み`);
      await this.delay(2000);
      
      // ========================================
      // フェーズ4: 送信と応答取得（並列処理、5秒間隔）
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 フェーズ4: 送信と応答取得（並列処理、5秒間隔）`);
      
      // 各ウィンドウの送信を並列で実行（開始タイミングを5秒ずつずらす）
      const sendPromises = taskContexts.map(async (context, index) => {
        // 各ウィンドウの開始を5秒ずつ遅らせる
        if (index > 0) {
          this.logger.log(`[StreamProcessorV2] ウィンドウ${index + 1}の送信を${index * 5}秒後に開始`);
          await this.delay(index * 5000);
        }
        
        this.logger.log(`[StreamProcessorV2] 送信開始 ${index + 1}/${taskContexts.length}: ${context.cell}`);
        
        // 送信時刻を記録
        if (this.spreadsheetLogger) {
          this.spreadsheetLogger.recordSendTime(context.task.id, {
            aiType: context.task.aiType,
            model: context.task.model
          });
          this.logger.log(`[StreamProcessorV2] 送信時刻記録: ${context.task.id}`);
        }
        
        // タブにフォーカスを移して送信を実行
        const result = await this.executePhaseOnTab(context.tabId, context.task, 'send');
        
        // 結果を処理
        if (result && result.response) {
          this.completedTasks.add(context.task.id);
          this.writtenCells.set(context.cell, result.response);
          
          // スプレッドシートに書き込み
          if (this.spreadsheetData) {
            const { spreadsheetId, gid } = this.spreadsheetData;
            const range = context.cell;
            
            await globalThis.sheetsClient?.updateCell(
              spreadsheetId,
              range,
              result.response,
              gid
            );
            
            this.logger.log(`[StreamProcessorV2] 📝 ${range}に応答を書き込みました`);
            
            // SpreadsheetLoggerでログを記録
            if (this.spreadsheetLogger && context.task.logColumns && context.task.logColumns.length > 0) {
              try {
                this.logger.log(`[StreamProcessorV2] ログ書き込み開始: ${context.task.logColumns[0]}${context.task.row}`);
                
                // 現在のURLを取得
                let currentUrl = 'N/A';
                try {
                  const tab = await chrome.tabs.get(context.tabId);
                  currentUrl = tab.url || 'N/A';
                } catch (e) {
                  // URLの取得に失敗しても処理は継続
                }
                
                // タスクにモデル情報を追加
                // displayedFunctionは既にフェーズ3で取得済み
                this.logger.log(`[StreamProcessorV2] SpreadsheetLogger用データ準備:`, {
                  'context.task.displayedFunction': context.task.displayedFunction,
                  'result.displayedFunction': result.displayedFunction,
                  'context.task.function': context.task.function
                });
                
                const taskWithModel = {
                  ...context.task,
                  model: context.task.model || 'Auto',
                  function: context.task.function || '通常',
                  displayedModel: result.displayedModel || context.task.displayedModel || context.task.model || 'Auto',
                  // displayedFunctionはPhase3で保存された値を最優先、次にsend結果、機能未指定の場合は'通常'
                  displayedFunction: context.task.displayedFunction || result.displayedFunction || '通常'
                };
                
                // ログセルを特定
                const logCellKey = `${context.task.logColumns[0]}_${context.task.row}`;
                const isFirstForThisCell = !this.processedCells.has(logCellKey);
                
                await this.spreadsheetLogger.writeLogToSpreadsheet(taskWithModel, {
                  url: currentUrl,
                  sheetsClient: globalThis.sheetsClient,
                  spreadsheetId,
                  gid,
                  isFirstTask: isFirstForThisCell,
                  enableWriteVerification: false
                });
                
                // このセルを処理済みとしてマーク
                this.processedCells.add(logCellKey);
                this.logger.log(`[StreamProcessorV2] ✅ ログを書き込み: ${context.task.logColumns[0]}${context.task.row}`);
                
              } catch (logError) {
                this.logger.warn(
                  `[StreamProcessorV2] ログ書き込みエラー（処理は続行）`,
                  logError.message
                );
              }
            }
          }
        } else {
          this.logger.error(`[StreamProcessorV2] ⚠️ ${context.cell}の応答が取得できませんでした`);
        }
        
        // ウィンドウを閉じる
        try {
          const tab = await chrome.tabs.get(context.tabId);
          if (tab && tab.windowId) {
            await chrome.windows.remove(tab.windowId);
            this.logger.log(`[StreamProcessorV2] 🔒 ウィンドウを閉じました: ${context.cell} - WindowID: ${tab.windowId}`);
          }
        } catch (error) {
          this.logger.warn(`[StreamProcessorV2] ウィンドウを閉じる際にエラー (${context.cell}):`, error);
        }
        
        this.logger.log(`[StreamProcessorV2] ✅ 送信完了: ${context.cell}`);
        return result;
      });
      
      // すべての送信が完了するまで待つ
      const results = await Promise.all(sendPromises);
      this.logger.log(`[StreamProcessorV2] ✅ バッチ内の全送信完了（${results.length}個）`);
      
      this.logger.log(`[StreamProcessorV2] ✅ フェーズ4完了: 全タスク送信済み`);
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] バッチ処理エラー:`, error);
      throw error;
    }
    
    this.logger.log(`[StreamProcessorV2] ✅ バッチ処理完了`, {
      完了: this.completedTasks.size,
      合計: batch.length
    });
  }

  /**
   * 指定時間待機
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * タブにスクリプトを注入
   * @param {number} tabId - タブID
   * @param {string} aiType - AIタイプ
   */
  async injectScriptsForTab(tabId, aiType) {
    try {
      const aiTypeLower = aiType.toLowerCase();
      
      // V2スクリプトマップ
      const v2ScriptMap = {
        'claude': 'automations/v2/claude-automation-v2.js',
        'chatgpt': 'automations/v2/chatgpt-automation-v2.js',
        'gemini': 'automations/v2/gemini-automation-v2.js'
      };
      
      // 共通スクリプト（model-info-loaderは既にページに存在する可能性があるため除外）
      const commonScripts = [
        'automations/feature-constants.js',
        'automations/common-ai-handler.js'
      ];
      
      // AI固有のスクリプト
      const aiScript = v2ScriptMap[aiTypeLower] || `automations/${aiTypeLower}-automation.js`;
      
      // スクリプトを順番に注入
      const scriptsToInject = [...commonScripts, aiScript];
      
      for (const scriptFile of scriptsToInject) {
        this.logger.log(`[StreamProcessorV2] 📝 スクリプト注入: ${scriptFile}`);
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [scriptFile]
        });
      }
      
      // スクリプトが完全に読み込まれるまで待機
      await this.delay(1000);
      
      // スクリプトが読み込まれたか確認
      const checkResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: (aiType) => {
          const automationMap = {
            'claude': ['ClaudeAutomationV2', 'ClaudeAutomation'],
            'chatgpt': ['ChatGPTAutomationV2', 'ChatGPTAutomation'],
            'gemini': ['GeminiAutomation']
          };
          
          const possibleNames = automationMap[aiType.toLowerCase()] || [];
          const found = possibleNames.find(name => window[name] !== undefined);
          return !!found;
        },
        args: [aiType]
      });
      
      if (!checkResult?.[0]?.result) {
        this.logger.warn(`[StreamProcessorV2] ⚠️ ${aiType}のAutomationオブジェクトが見つかりません`);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] スクリプト注入エラー:`, error);
      return false;
    }
  }
  
  /**
   * 特定のタブで指定フェーズを実行
   * @param {number} tabId - タブID
   * @param {Object} task - タスク情報
   * @param {string} phase - 実行フェーズ ('text', 'model', 'function', 'send')
   */
  async executePhaseOnTab(tabId, task, phase) {
    try {
      // タブにフォーカスを移す
      await chrome.tabs.update(tabId, { active: true });
      await this.delay(500); // フォーカス安定待機
      
      let result;
      
      // フェーズに応じた処理を実行
      switch(phase) {
        case 'text':
          // テキスト入力のみ実行
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (prompt) => {
              if (window.ChatGPTAutomationV2) {
                return await window.ChatGPTAutomationV2.inputTextOnly(prompt);
              }
              return { success: false, error: 'ChatGPTAutomationV2 not found' };
            },
            args: [task.prompt || task.text || '']
          });
          break;
          
        case 'model':
          // モデル選択のみ実行
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (model) => {
              if (window.ChatGPTAutomationV2) {
                return await window.ChatGPTAutomationV2.selectModelOnly(model);
              }
              return { success: false, error: 'ChatGPTAutomationV2 not found' };
            },
            args: [task.model]
          });
          break;
          
        case 'function':
          // 機能選択のみ実行
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (functionName) => {
              if (window.ChatGPTAutomationV2) {
                return await window.ChatGPTAutomationV2.selectFunctionOnly(functionName);
              }
              return { success: false, error: 'ChatGPTAutomationV2 not found' };
            },
            args: [task.function]
          });
          break;
          
        case 'send':
          // 送信と応答取得
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async () => {
              if (window.ChatGPTAutomationV2) {
                return await window.ChatGPTAutomationV2.sendAndGetResponse();
              }
              return { success: false, error: 'ChatGPTAutomationV2 not found' };
            },
            args: []
          });
          break;
          
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }
      
      // 結果を返す
      if (result && result[0]) {
        return result[0].result;
      }
      return { success: false, error: 'No result' };
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] フェーズ実行エラー (${phase}):`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * タスクからプロンプトを取得
   * @param {Object} task - タスクオブジェクト
   * @returns {Promise<string>} プロンプト文字列
   */
  async getPromptForTask(task) {
    try {
      // プロンプトがすでに設定されている場合
      if (task.prompt || task.text) {
        return task.prompt || task.text;
      }
      
      // スプレッドシートデータからプロンプトを取得
      if (this.spreadsheetData && task.promptColumns) {
        const prompts = [];
        // promptColumnsが配列の配列になっている場合の対処
        const columns = Array.isArray(task.promptColumns[0]) ? task.promptColumns[0] : task.promptColumns;
        
        for (const col of columns) {
          // colが文字列であることを確認
          if (typeof col === 'string' && col.length > 0) {
            const colIndex = col.charCodeAt(0) - 65; // A=0, B=1...
            const value = this.spreadsheetData.values?.[task.row - 1]?.[colIndex];
            if (value) {
              prompts.push(value);
            }
          } else if (typeof col === 'number') {
            // colが数値の場合（インデックス）
            const value = this.spreadsheetData.values?.[task.row - 1]?.[col];
            if (value) {
              prompts.push(value);
            }
          }
        }
        return prompts.join('\n');
      }
      
      // デフォルトプロンプト
      return `タスク ${task.column}${task.row} のプロンプト`;
    } catch (error) {
      this.logger.error('[StreamProcessorV2] プロンプト取得エラー:', error);
      return '';
    }
  }

  /**
   * 単一タスクを処理
   * @param {Object} task - タスクオブジェクト
   * @param {boolean} isTestMode - テストモード
   * @param {number} position - ウィンドウ位置（0:左上、1:右上、2:左下）
   */
  async processTask(task, isTestMode, position = 0) {
    try {
      // タスクの全プロパティを確認
      this.logger.log(`[StreamProcessorV2] タスク処理開始`, {
        cell: `${task.column}${task.row}`,
        aiType: task.aiType,
        taskId: task.id ? task.id.substring(0, 8) : 'ID未設定',
        model: task.model || '❌モデル未設定',
        function: task.function || '❌機能未設定',
        全プロパティ: Object.keys(task).join(', ')
      });
      
      // テストモードの場合は実際のウィンドウ作成をスキップ
      if (isTestMode) {
        this.logger.log(`[StreamProcessorV2] テストモード: タスク処理をシミュレート`);
        
        // シミュレーション: タスク完了
        this.completedTasks.add(task.id);
        this.writtenCells.set(`${task.column}${task.row}`, true);
        
        return;
      }
      
      // 実際のAI処理（ウィンドウ作成とAI実行）
      const tabId = await this.createWindowForTask(task, position);
      if (!tabId) {
        throw new Error(`Failed to create window for ${task.aiType}`);
      }
      
      // プロンプトを動的取得
      const prompt = await this.fetchPromptFromTask(task);
      if (!prompt) {
        throw new Error(`Empty prompt for ${task.column}${task.row}`);
      }
      
      // タスクリストの値をそのまま使用（promptだけ追加）
      const taskData = {
        ...task,  // タスクリストの全データをそのまま使用
        taskId: task.id,  // task.idをtaskIdとして明示的に設定
        prompt: prompt,  // プロンプトだけ上書き
        cellInfo: {
          column: task.column,
          row: task.row
        }
      };
      
      this.logger.log(`[StreamProcessorV2] AIタスク実行: ${task.column}${task.row}`, {
        aiType: task.aiType,
        taskId: task.id,
        model: task.model,
        function: task.function
      });
      
      // AIタスクを実行して結果を取得
      const result = await this.aiTaskExecutor.executeAITask(tabId, taskData);
      
      // 結果が成功の場合、スプレッドシートに書き込み
      if (result && result.success && result.response) {
        const { spreadsheetId, gid } = this.spreadsheetData;
        const range = `${task.column}${task.row}`;
        
        // スプレッドシートに応答を書き込む
        await globalThis.sheetsClient.updateCell(
          spreadsheetId,
          range,
          result.response,
          gid
        );
        
        this.logger.log(`[StreamProcessorV2] 📝 ${range}に応答を書き込みました`, {
          文字数: result.response.length,
          プレビュー: result.response.substring(0, 50) + '...'
        });
        
        // 再実行が成功した場合の統計更新
        const retryCount = this.retryCountByColumn.get(task.column) || 0;
        if (retryCount > 0) {
          this.retryStats.successfulRetries++;
          if (this.retryStats.retriesByColumn.has(task.column)) {
            this.retryStats.retriesByColumn.get(task.column).successes++;
          }
          this.logger.log(`[StreamProcessorV2] ✅ 再実行成功: ${task.column}${task.row}`);
        }
        
        // ログを書き込み（SpreadsheetLoggerを使用）
        
        if (this.spreadsheetLogger && task.logColumns && task.logColumns.length > 0) {
          try {
            this.logger.log(`[StreamProcessorV2] 📝 ログ書き込み準備`, {
              hasSpreadsheetLogger: !!this.spreadsheetLogger,
              hasWriteMethod: !!(this.spreadsheetLogger?.writeLogToSpreadsheet),
              taskId: task.id,
              row: task.row,
              logColumns: task.logColumns,
              groupId: task.groupId,
              groupType: task.groupType,
              groupPosition: task.groupPosition,
              multiAI: task.multiAI
            });
            
            // 現在のURLを取得
            let currentUrl = 'N/A';
            try {
              const tab = await chrome.tabs.get(tabId);
              currentUrl = tab.url || 'N/A';
            } catch (e) {
              // URLの取得に失敗しても処理は継続
            }
            
            // モデル情報を追加したタスクオブジェクトを作成（結果から表示値も追加）
            const taskWithModel = {
              ...task,
              model: task.model || 'Auto',
              function: task.function || '通常',
              displayedModel: result.displayedModel || task.model || 'Auto',
              displayedFunction: result.displayedFunction || task.function || '通常'
            };
            
            // 3種類AIグループかどうかを判定
            console.log(`[StreamProcessorV2] グループ判定デバッグ:`, {
              taskId: task.id,
              groupId: task.groupId,
              groupType: task.groupType,
              groupPosition: task.groupPosition,
              multiAI: task.multiAI
            });
            const isGroupTask = task.groupId && task.groupType === '3type';
            const isFirstInGroup = isGroupTask && task.groupPosition === 0;
            const isLastInGroup = isGroupTask && task.groupPosition === 2;
            
            // ログセルを特定（ログ列と行の組み合わせ）
            const logCellKey = `${task.logColumns[0]}_${task.row}`;
            const isFirstForThisCell = !this.processedCells.has(logCellKey);
            
            await this.spreadsheetLogger.writeLogToSpreadsheet(taskWithModel, {
              url: currentUrl,
              sheetsClient: globalThis.sheetsClient,
              spreadsheetId,
              gid,
              isFirstTask: false,  // 常に追加モード（上書きを防ぐ）
              isGroupTask: isGroupTask,
              isLastInGroup: isLastInGroup,
              enableWriteVerification: false // 書き込み確認は無効化（パフォーマンスのため）
            });
            
            // このセルを処理済みとしてマーク
            this.processedCells.add(logCellKey);
            this.logger.log(`[StreamProcessorV2] ✅ ログを書き込み: ${task.logColumns[0]}${task.row}`);
            
          } catch (logError) {
            // ログ書き込みエラーは警告として記録し、処理は続行
            this.logger.warn(
              `[StreamProcessorV2] ログ書き込みエラー（処理は続行）`,
              logError.message
            );
          }
        }
        
        // ウィンドウを閉じる
        try {
          // タブIDからウィンドウIDを取得
          const tab = await chrome.tabs.get(tabId);
          if (tab && tab.windowId) {
            await WindowService.closeWindow(tab.windowId);
            this.logger.log(`[StreamProcessorV2] 🔒 ウィンドウを閉じました - WindowID: ${tab.windowId}`);
          }
        } catch (error) {
          this.logger.warn(`[StreamProcessorV2] ウィンドウを閉じる際にエラー:`, error);
          // エラーが発生しても処理は継続
        }
      } else {
        this.logger.warn(`[StreamProcessorV2] ⚠️ ${task.column}${task.row}の応答が取得できませんでした`, result);
        
        // 失敗タスクを記録（再実行対象として）
        if (!this.failedTasksByColumn.has(task.column)) {
          this.failedTasksByColumn.set(task.column, new Set());
        }
        this.failedTasksByColumn.get(task.column).add(task);
        this.logger.log(`[StreamProcessorV2] 🔄 失敗タスクを記録: ${task.column}${task.row}`);
      }
      
      this.completedTasks.add(task.id);
      this.writtenCells.set(`${task.column}${task.row}`, true);
      
      this.logger.log(`[StreamProcessorV2] ✅ ${task.column}${task.row}処理完了`);
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] タスク処理エラー ${task.column}${task.row}:`, error);
      this.failedTasks.add(task.id);
      
      // 失敗タスクを記録（再実行対象として）
      if (!this.failedTasksByColumn.has(task.column)) {
        this.failedTasksByColumn.set(task.column, new Set());
      }
      this.failedTasksByColumn.get(task.column).add(task);
      this.logger.log(`[StreamProcessorV2] 🔄 失敗タスクを記録 (例外): ${task.column}${task.row}`);
      throw error;
    }
  }

  /**
   * 列の作業終了後、回答列を確認して回答がない場合は再実行
   */
  async verifyAndReprocessColumn(column, tasks, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🔍 ${column}列の回答確認と再実行開始`);
    
    const tasksToReprocess = [];
    
    for (const task of tasks) {
      try {
        // スプレッドシートから現在の回答を取得
        const currentAnswer = await this.getCurrentAnswer(task);
        
        if (!currentAnswer || currentAnswer.trim() === '') {
          this.logger.warn(`[StreamProcessorV2] 🔄 ${task.column}${task.row}: 回答がないため再実行対象に追加`);
          tasksToReprocess.push(task);
        } else {
          this.logger.log(`[StreamProcessorV2] ✅ ${task.column}${task.row}: 回答あり (${currentAnswer.length}文字)`);
        }
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] ${task.column}${task.row}の回答確認エラー:`, error);
        // エラーの場合も再実行対象に追加
        tasksToReprocess.push(task);
      }
    }
    
    if (tasksToReprocess.length > 0) {
      this.logger.log(`[StreamProcessorV2] 🔄 ${column}列: ${tasksToReprocess.length}個のタスクを再実行します`);
      
      // 再実行タスクをバッチ処理
      const reprocessBatches = this.createBatches(tasksToReprocess, 3);
      
      for (let batchIndex = 0; batchIndex < reprocessBatches.length; batchIndex++) {
        const batch = reprocessBatches[batchIndex];
        
        this.logger.log(`[StreamProcessorV2] 🔄 ${column}列 再実行バッチ${batchIndex + 1}/${reprocessBatches.length}開始`);
        
        await this.processBatch(batch, isTestMode);
        
        this.logger.log(`[StreamProcessorV2] ✅ ${column}列 再実行バッチ${batchIndex + 1}/${reprocessBatches.length}完了`);
      }
    } else {
      this.logger.log(`[StreamProcessorV2] ✅ ${column}列: すべてのタスクに回答があります`);
    }
  }
  
  /**
   * タスクの現在の回答をスプレッドシートから取得
   */
  async getCurrentAnswer(task) {
    try {
      const { spreadsheetId, gid } = this.spreadsheetData;
      const range = `${task.column}${task.row}`;
      
      const response = await globalThis.sheetsClient.getRange(
        spreadsheetId,
        range,
        gid
      );
      
      if (response && response.values && response.values.length > 0 && response.values[0].length > 0) {
        return response.values[0][0];
      }
      
      return '';
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ${task.column}${task.row}の回答取得エラー:`, error);
      return '';
    }
  }

  /**
   * タスク用のウィンドウを作成
   * @param {Object} task - タスクオブジェクト
   * @param {number} position - ウィンドウ位置（0:左上、1:右上、2:左下）
   */
  async createWindowForTask(task, position = 0) {
    try {
      // AIタイプを正規化（ChatGPT → chatgpt, Claude → claude, Gemini → gemini）
      const normalizedAIType = this.normalizeAIType(task.aiType);
      
      // AIタイプからURLを取得
      const url = aiUrlManager.getUrl(normalizedAIType);
      if (!url) {
        throw new Error(`Unsupported AI type: ${task.aiType} (normalized: ${normalizedAIType})`);
      }

      this.logger.log(`[StreamProcessorV2] ウィンドウ作成: ${task.aiType} (${normalizedAIType}) - ${url}`, {
        position: position,
        cell: `${task.column}${task.row}`
      });

      // ウィンドウを位置指定付きで作成（4分割レイアウト）
      const window = await WindowService.createWindowWithPosition(url, position, {
        type: 'popup',
        aiType: task.aiType
      });
      
      if (!window || !window.tabs || window.tabs.length === 0) {
        throw new Error(`Failed to create window for ${task.aiType}`);
      }

      const tabId = window.tabs[0].id;
      this.logger.log(`[StreamProcessorV2] ✅ ウィンドウ作成成功 - TabID: ${tabId} (位置: ${position})`);
      
      return tabId;
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ウィンドウ作成エラー:`, error);
      throw error;
    }
  }

  /**
   * AIタイプを正規化
   * @param {string} aiType - AIタイプ（ChatGPT, Claude, Gemini など）
   * @returns {string} 正規化されたAIタイプ（chatgpt, claude, gemini）
   */
  normalizeAIType(aiType) {
    // nullチェック追加
    if (!aiType) {
      this.logger.warn('[StreamProcessorV2] ⚠️ aiTypeが未定義です。デフォルトでchatgptを使用します');
      return 'chatgpt';
    }
    
    const normalizedType = aiType.toLowerCase();
    
    // 共通的な変換パターン
    if (normalizedType === 'chatgpt') return 'chatgpt';
    if (normalizedType === 'claude') return 'claude';  
    if (normalizedType === 'gemini') return 'gemini';
    
    // デフォルトでそのまま返す
    return normalizedType;
  }

  /**
   * タスクからプロンプトを取得
   */
  async fetchPromptFromTask(task) {
    try {
      // スプレッドシートからプロンプトを取得
      if (!this.spreadsheetData || !this.spreadsheetData.values) {
        throw new Error('Spreadsheet data not available');
      }

      // 行インデックスを計算（配列は0ベース、スプレッドシートの行番号は1ベース）
      const rowIndex = task.row - 1; // 行10 → index 9, 行11 → index 10
      
      // プロンプト列のインデックスを取得（3種類AIの場合はpromptColumnsから取得）
      let promptColumns = [];
      if (task.promptColumns && task.promptColumns.length > 0) {
        // タスクにpromptColumns情報がある場合は、全てのプロンプト列を使用
        promptColumns = task.promptColumns;
        this.logger.log(`[StreamProcessorV2] プロンプト列情報使用: ${promptColumns.length}列 (${promptColumns.map(i => this.indexToColumn(i)).join(', ')})`);
      } else {
        // フォールバック：task.columnを使用（通常のAI列の場合）
        const promptColIndex = this.columnToIndex(task.column);
        promptColumns = [promptColIndex];
        this.logger.log(`[StreamProcessorV2] タスク列使用: ${task.column} (index=${promptColIndex})`);
      }
      
      this.logger.log(`[StreamProcessorV2] プロンプト取得試行`, {
        タスク列: task.column,
        プロンプト列: promptColumns.map(i => this.indexToColumn(i)),
        行番号: task.row,
        インデックス: rowIndex,
        配列長: this.spreadsheetData.values.length
      });

      if (rowIndex < 0 || rowIndex >= this.spreadsheetData.values.length) {
        throw new Error(`Row ${task.row} not found in spreadsheet data (index: ${rowIndex}, array length: ${this.spreadsheetData.values.length})`);
      }

      const row = this.spreadsheetData.values[rowIndex];
      
      // 複数のプロンプト列から内容を取得して連結
      const prompts = [];
      const promptDetails = [];
      
      for (const promptColIndex of promptColumns) {
        const columnName = this.indexToColumn(promptColIndex);
        
        if (!row || promptColIndex >= row.length) {
          // セルが存在しない場合はスキップ
          this.logger.warn(`[StreamProcessorV2] Cell at ${columnName}${task.row} not found, skipping`);
          continue;
        }
        
        const value = row[promptColIndex];
        if (value && value.trim()) {
          const trimmedValue = value.trim();
          prompts.push(trimmedValue);
          promptDetails.push({
            column: columnName,
            length: trimmedValue.length,
            preview: trimmedValue.substring(0, 50)
          });
        }
      }
      
      if (prompts.length === 0) {
        // 全てのプロンプト列が空の場合
        this.logger.warn(`[StreamProcessorV2] All prompt columns empty at row ${task.row}`);
        return `テスト - ${task.column}${task.row}`;
      }
      
      // セル位置を特定（回答列を使用）
      const cellPosition = `${task.column}${task.row}`;
      
      // 「現在は〇〇のセルです。」を先頭に追加してプロンプトを連結
      const combinedPrompt = `現在は${cellPosition}のセルです。\n${prompts.join('\n')}`;
      
      this.logger.log(`[StreamProcessorV2] プロンプト連結成功: 回答セル ${cellPosition}`, {
        プロンプト数: prompts.length,
        総文字数: combinedPrompt.length,
        詳細: promptDetails
      });
      
      return combinedPrompt;
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] プロンプト取得エラー:`, error);
      // エラーをthrowせず、デフォルトのプロンプトを返す
      return `テスト - ${task.column}${task.row}`;
    }
  }

  /**
   * インデックスを列名に変換
   * @param {number} index - インデックス（0, 1, 2, ...）
   * @returns {string} 列名（A, B, C, ...）
   */
  indexToColumn(index) {
    let column = '';
    let temp = index;
    
    while (temp >= 0) {
      column = String.fromCharCode((temp % 26) + 65) + column;
      temp = Math.floor(temp / 26) - 1;
    }
    
    return column;
  }

  /**
   * 列名を数値インデックスに変換
   * @param {string} column - 列名（A, B, C, ...）
   * @returns {number} インデックス（0, 1, 2, ...）
   */
  columnToIndex(column) {
    let result = 0;
    for (let i = 0; i < column.length; i++) {
      result = result * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result - 1; // 0ベースのインデックスに変換
  }

  /**
   * 回答が空白のセルをチェックして再実行
   * @param {string} column - チェック対象の列
   * @param {Array} tasks - 該当列のタスク一覧
   * @param {boolean} isTestMode - テストモード
   */
  async checkAndRetryEmptyAnswers(column, tasks, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🔍 ${column}列の回答確認中...`);
    
    const emptyTasks = [];
    
    // 各タスクの回答をチェック
    for (const task of tasks) {
      try {
        const { spreadsheetId, gid } = this.spreadsheetData;
        const range = `${task.column}${task.row}`;
        
        // 現在のセルの値を取得
        const response = await globalThis.sheetsClient?.getRange(
          spreadsheetId,
          range,
          gid
        );
        
        const cellValue = response?.values?.[0]?.[0] || '';
        
        if (!cellValue || cellValue.trim() === '') {
          this.logger.warn(`[StreamProcessorV2] 📝 ${range}: 回答が空白です - 再実行対象に追加`);
          emptyTasks.push(task);
        } else {
          this.logger.log(`[StreamProcessorV2] ✅ ${range}: 回答あり (${cellValue.length}文字)`);
        }
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] ${task.column}${task.row}の回答確認エラー:`, error);
        // エラーの場合も再実行対象に追加
        emptyTasks.push(task);
      }
    }
    
    if (emptyTasks.length === 0) {
      this.logger.log(`[StreamProcessorV2] ✅ ${column}列: すべてのセルに回答があります`);
      return;
    }
    
    this.logger.log(`[StreamProcessorV2] 🔄 ${column}列: ${emptyTasks.length}個の空白セルを再実行します`);
    
    // 空白タスクを3つずつのバッチで再実行
    const retryBatches = this.createBatches(emptyTasks, 3);
    
    for (let batchIndex = 0; batchIndex < retryBatches.length; batchIndex++) {
      const batch = retryBatches[batchIndex];
      
      this.logger.log(`[StreamProcessorV2] 🔄 ${column}列 再実行バッチ${batchIndex + 1}/${retryBatches.length}`, {
        retryTasks: batch.map(t => `${t.column}${t.row}`).join(', ')
      });
      
      // バッチを再実行（モデル/機能選択失敗時はスキップ）
      await this.processBatchWithSkip(batch, isTestMode);
      
      this.logger.log(`[StreamProcessorV2] ✅ ${column}列 再実行バッチ${batchIndex + 1}/${retryBatches.length}完了`);
    }
  }

  /**
   * モデル/機能選択失敗時にスキップするバッチ処理
   * @param {Array} batch - バッチタスク
   * @param {boolean} isTestMode - テストモード
   */
  async processBatchWithSkip(batch, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🚀 バッチ処理開始（失敗時スキップモード）`, {
      tasks: batch.map(t => `${t.column}${t.row}`).join(', '),
      taskCount: batch.length
    });

    if (isTestMode) {
      for (const task of batch) {
        this.completedTasks.add(task.id);
        this.writtenCells.set(`${task.column}${task.row}`, true);
      }
      return;
    }

    const taskContexts = [];
    
    try {
      // フェーズ1: ウィンドウ準備とテキスト入力
      for (let index = 0; index < batch.length; index++) {
        const task = batch[index];
        const position = index;
        
        this.logger.log(`[StreamProcessorV2] ウィンドウ${index + 1}/${batch.length}を準備: ${task.column}${task.row}`);
        
        const tabId = await this.createWindowForTask(task, position);
        if (!tabId) {
          this.logger.error(`[StreamProcessorV2] ウィンドウ作成失敗: ${task.column}${task.row} - スキップ`);
          continue;
        }
        
        const prompt = await this.getPromptForTask(task);
        
        taskContexts.push({
          task: { ...task, prompt },
          tabId,
          position,
          cell: `${task.column}${task.row}`,
          skipped: false
        });
        
        await this.delay(3000);
        await this.injectScriptsForTab(tabId, task.aiType);
        
        const textResult = await this.executePhaseOnTab(tabId, { ...task, prompt }, 'text');
        if (!textResult || !textResult.success) {
          this.logger.error(`[StreamProcessorV2] テキスト入力失敗: ${task.column}${task.row}`);
        }
        
        if (index < batch.length - 1) {
          await this.delay(1000);
        }
      }
      
      await this.delay(2000);
      
      // フェーズ2: モデル選択（失敗時はスキップ）
      for (const context of taskContexts) {
        if (context.skipped) continue;
        
        this.logger.log(`[StreamProcessorV2] モデル選択: ${context.cell}`);
        const modelResult = await this.executePhaseOnTab(context.tabId, context.task, 'model');
        
        if (!modelResult || modelResult.success === false) {
          this.logger.warn(`[StreamProcessorV2] ⚠️ モデル選択失敗: ${context.cell} - このタスクをスキップします`);
          context.skipped = true;
          // ウィンドウを閉じる
          try {
            const tab = await chrome.tabs.get(context.tabId);
            if (tab && tab.windowId) {
              await chrome.windows.remove(tab.windowId);
            }
          } catch (e) {}
          continue;
        }
        
        if (modelResult.displayedModel !== undefined) {
          context.task.displayedModel = modelResult.displayedModel;
        }
        await this.delay(1000);
      }
      
      await this.delay(2000);
      
      // フェーズ3: 機能選択（失敗時はスキップ）
      for (const context of taskContexts) {
        if (context.skipped) continue;
        
        this.logger.log(`[StreamProcessorV2] 機能選択: ${context.cell}`);
        const functionResult = await this.executePhaseOnTab(context.tabId, context.task, 'function');
        
        const requestedFunction = context.task.function || '通常';
        const isSuccess = functionResult && 
                         functionResult.success !== false &&
                         functionResult.displayedFunction !== undefined &&
                         (requestedFunction === '通常' || functionResult.displayedFunction !== '');
        
        if (!isSuccess) {
          this.logger.warn(`[StreamProcessorV2] ⚠️ 機能選択失敗: ${context.cell} - このタスクをスキップします`);
          context.skipped = true;
          // ウィンドウを閉じる
          try {
            const tab = await chrome.tabs.get(context.tabId);
            if (tab && tab.windowId) {
              await chrome.windows.remove(tab.windowId);
            }
          } catch (e) {}
          continue;
        }
        
        if (functionResult.displayedFunction !== undefined) {
          context.task.displayedFunction = functionResult.displayedFunction;
        }
        await this.delay(1000);
      }
      
      await this.delay(2000);
      
      // フェーズ4: 送信（スキップされたタスクは除外）
      const activeContexts = taskContexts.filter(ctx => !ctx.skipped);
      
      if (activeContexts.length === 0) {
        this.logger.warn(`[StreamProcessorV2] すべてのタスクがスキップされました`);
        return;
      }
      
      const sendPromises = activeContexts.map(async (context, index) => {
        if (index > 0) {
          await this.delay(index * 5000);
        }
        
        this.logger.log(`[StreamProcessorV2] 送信開始: ${context.cell}`);
        const result = await this.executePhaseOnTab(context.tabId, context.task, 'send');
        
        if (result && result.response) {
          this.completedTasks.add(context.task.id);
          this.writtenCells.set(context.cell, result.response);
          
          // スプレッドシートに書き込み
          if (this.spreadsheetData) {
            const { spreadsheetId, gid } = this.spreadsheetData;
            await globalThis.sheetsClient?.updateCell(
              spreadsheetId,
              context.cell,
              result.response,
              gid
            );
            this.logger.log(`[StreamProcessorV2] 📝 ${context.cell}に応答を書き込みました`);
          }
        }
        
        // ウィンドウを閉じる
        try {
          const tab = await chrome.tabs.get(context.tabId);
          if (tab && tab.windowId) {
            await chrome.windows.remove(tab.windowId);
          }
        } catch (e) {}
        
        return result;
      });
      
      await Promise.all(sendPromises);
      this.logger.log(`[StreamProcessorV2] ✅ バッチ処理完了（スキップモード）`);
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] バッチ処理エラー:`, error);
      throw error;
    }
  }

  /**
   * 列完了時の失敗タスクチェックと自動再実行
   * @param {string} column - チェック対象の列
   */
  async checkAndProcessFailedTasks(column) {
    const failedTasks = this.failedTasksByColumn.get(column);
    
    if (!failedTasks || failedTasks.size === 0) {
      return; // 失敗タスクがない
    }
    
    const retryCount = this.retryCountByColumn.get(column) || 0;
    
    if (retryCount >= this.maxRetryCount) {
      this.logger.error(`[StreamProcessorV2] 🚫 ${column}列の再実行回数上限に達しました (${retryCount}/${this.maxRetryCount}回)`);
      this.logger.error(`[StreamProcessorV2] 🚫 失敗タスク一覧: ${Array.from(failedTasks).map(t => `${t.column}${t.row}`).join(', ')}`);
      return;
    }
    
    this.logger.log(`[StreamProcessorV2] 🔄 ${column}列の失敗タスク検出、自動再実行開始 (${retryCount + 1}/${this.maxRetryCount}回目)`);
    this.logger.log(`[StreamProcessorV2] 🔄 再実行対象: ${Array.from(failedTasks).map(t => `${t.column}${t.row}`).join(', ')}`);
    
    // 再実行統計を更新
    this.retryStats.totalRetries++;
    if (!this.retryStats.retriesByColumn.has(column)) {
      this.retryStats.retriesByColumn.set(column, { attempts: 0, successes: 0 });
    }
    this.retryStats.retriesByColumn.get(column).attempts++;
    
    // 再実行回数をインクリメント
    this.retryCountByColumn.set(column, retryCount + 1);
    
    // 失敗タスクを配列に変換
    const failedTasksArray = Array.from(failedTasks);
    
    // 失敗タスクリストをクリア
    this.failedTasksByColumn.set(column, new Set());
    
    // 再実行遅延時間を決定（回数に応じて段階的に増加）
    const delayIndex = retryCount; // 0: 5分, 1: 30分, 2: 1時間
    const delayMs = this.retryDelays[delayIndex] || this.retryDelays[this.retryDelays.length - 1];
    const delayMinutes = Math.round(delayMs / (1000 * 60));
    
    this.logger.log(`[StreamProcessorV2] ⏰ ${column}列の再実行を${delayMinutes}分後にスケジュール (${failedTasksArray.length}個のタスク)`);
    
    // 既存のタイマーがあればクリア
    if (this.retryTimers.has(column)) {
      clearTimeout(this.retryTimers.get(column));
    }
    
    // 指定時間後に再実行するタイマーを設定
    const timer = setTimeout(async () => {
      try {
        this.logger.log(`[StreamProcessorV2] 🔄 ${column}列の遅延再実行開始 (${delayMinutes}分後)`);
        await this.processColumn(column, failedTasksArray, false);
        
        // タイマーをクリア
        this.retryTimers.delete(column);
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] 遅延再実行エラー ${column}列:`, error);
        this.retryTimers.delete(column);
      }
    }, delayMs);
    
    // タイマーを保存
    this.retryTimers.set(column, timer);
  }

  /**
   * 再実行統計情報を表示
   */
  logRetryStats() {
    if (this.retryStats.totalRetries === 0 && this.retryTimers.size === 0) {
      return;
    }
    
    this.logger.log(`[StreamProcessorV2] 📊 再実行統計情報:`);
    this.logger.log(`  - 総再実行回数: ${this.retryStats.totalRetries}`);
    this.logger.log(`  - 成功: ${this.retryStats.successfulRetries}`);
    this.logger.log(`  - 失敗: ${this.retryStats.failedRetries}`);
    this.logger.log(`  - 成功率: ${this.retryStats.totalRetries > 0 ? Math.round((this.retryStats.successfulRetries / this.retryStats.totalRetries) * 100) : 0}%`);
    
    if (this.retryStats.retriesByColumn.size > 0) {
      this.logger.log(`  - 列別統計:`);
      for (const [column, stats] of this.retryStats.retriesByColumn) {
        const successRate = stats.attempts > 0 ? Math.round((stats.successes / stats.attempts) * 100) : 0;
        this.logger.log(`    ${column}列: ${stats.attempts}回実行, ${stats.successes}回成功 (${successRate}%)`);
      }
    }
    
    // スケジュール中の再実行を表示
    if (this.retryTimers.size > 0) {
      this.logger.log(`  - スケジュール中の再実行:`);
      for (const [column, timer] of this.retryTimers) {
        const retryCount = this.retryCountByColumn.get(column) || 0;
        const delayMinutes = Math.round(this.retryDelays[retryCount - 1] / (1000 * 60));
        this.logger.log(`    ${column}列: ${delayMinutes}分後に実行予定`);
      }
    }
  }

  /**
   * すべての再実行タイマーをキャンセル
   */
  cancelAllRetryTimers() {
    if (this.retryTimers.size === 0) {
      this.logger.log(`[StreamProcessorV2] キャンセルするタイマーがありません`);
      return;
    }
    
    this.logger.log(`[StreamProcessorV2] 🚫 ${this.retryTimers.size}個の再実行タイマーをキャンセルします`);
    
    for (const [column, timer] of this.retryTimers) {
      clearTimeout(timer);
      this.logger.log(`[StreamProcessorV2] ❌ ${column}列の再実行タイマーをキャンセル`);
    }
    
    this.retryTimers.clear();
  }

  /**
   * 特定列の再実行タイマーをキャンセル
   */
  cancelRetryTimer(column) {
    if (!this.retryTimers.has(column)) {
      this.logger.log(`[StreamProcessorV2] ${column}列の再実行タイマーは存在しません`);
      return;
    }
    
    clearTimeout(this.retryTimers.get(column));
    this.retryTimers.delete(column);
    this.logger.log(`[StreamProcessorV2] ❌ ${column}列の再実行タイマーをキャンセル`);
  }

}