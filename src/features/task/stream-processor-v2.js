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
import TaskGeneratorV2 from './generator-v2.js';
import { DynamicTaskQueue } from './dynamic-task-queue.js';

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
    this.taskGenerator = new TaskGeneratorV2(logger); // タスクジェネレータを追加
    this.windowService = WindowService; // WindowServiceへの参照を保持
    this.completedTasks = new Set();
    this.failedTasks = new Set();
    this.writtenCells = new Map();
    this.spreadsheetData = null;
    this.spreadsheetLogger = null;
    this.processedCells = new Set(); // セル単位で処理済みを追跡
    this.dynamicQueue = new DynamicTaskQueue(logger); // 動的タスクキューを追加
    
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

    // スリープ防止を開始
    if (globalThis.powerManager) {
      this.logger.log('[StreamProcessorV2] 🛡️ スリープ防止を開始');
      await globalThis.powerManager.startProtection('stream-processor-v2');
    } else {
      this.logger.warn('[StreamProcessorV2] ⚠️ PowerManagerが見つかりません');
    }

    try {
      // プロンプトグループごとにタスクを生成して処理
      await this.processColumnsSequentially(taskList, spreadsheetData, isTestMode);

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
    } finally {
      // スリープ防止を解除
      if (globalThis.powerManager) {
        this.logger.log('[StreamProcessorV2] 🔓 スリープ防止を解除');
        await globalThis.powerManager.stopProtection('stream-processor-v2');
      }
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
    
    // 🔄 回答が空白のセルを再実行（既存メソッドを使用、失敗時スキップモード）
    await this.verifyAndReprocessColumn(column, tasks, isTestMode);
    
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
    const skippedCells = []; // スキップされたセルを収集
    
    try {
      // ========================================
      // フェーズ1: 全ウィンドウを開いてテキスト入力
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 フェーズ1: ウィンドウ準備とテキスト入力`);
      
      // バッチ内のすべての既存回答を一度にチェック（APIコールをまとめる）
      const answerCheckPromises = batch.map(task => 
        this.getCurrentAnswer(task).then(answer => ({ task, answer }))
      );
      
      // 1秒間隔で実行してAPIレート制限を回避
      const answerResults = [];
      for (const promise of answerCheckPromises) {
        answerResults.push(await promise);
        await this.delay(1000); // APIコール間に1秒待機
      }
      
      for (let index = 0; index < batch.length; index++) {
        const task = batch[index];
        const position = index; // 0: 左上、1: 右上、2: 左下
        
        // 既存回答チェック（事前に取得済みの結果を使用）
        const existingAnswer = answerResults[index].answer;
        if (existingAnswer && existingAnswer.trim() !== '') {
          skippedCells.push(`${task.column}${task.row}`);
          // タスクを完了扱いにして次へ
          this.completedTasks.add(task.id);
          this.writtenCells.set(`${task.column}${task.row}`, existingAnswer);
          continue;
        }
        
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
        
        // スクリプト注入をリトライ付きで実行（ウィンドウ再作成含む）
        let injectionSuccess = false;
        let currentTabId = tabId;
        
        for (let retryCount = 0; retryCount < 3; retryCount++) {
          if (retryCount > 0) {
            this.logger.log(`[StreamProcessorV2] 🔄 ウィンドウ再作成試行 ${retryCount}/3`);
            
            // 既存ウィンドウを閉じる
            try {
              const WindowService = await import('../../services/window-service.js').then(m => m.default);
              await WindowService.closeWindow(currentTabId);
              WindowService.releasePosition(position);
              await this.delay(1000); // ウィンドウクリーンアップ待機
            } catch (cleanupError) {
              this.logger.error(`[StreamProcessorV2] ウィンドウクリーンアップエラー:`, cleanupError);
            }
            
            // 新しいウィンドウを作成
            try {
              currentTabId = await this.createWindowForTask(task, position);
              if (!currentTabId) {
                this.logger.error(`[StreamProcessorV2] ウィンドウ再作成失敗`);
                continue;
              }
              
              // タスクコンテキストを更新
              taskContexts[taskContexts.length - 1].tabId = currentTabId;
            } catch (error) {
              this.logger.error(`[StreamProcessorV2] ウィンドウ再作成エラー:`, error);
              continue;
            }
          }
          
          // 追加の待機時間（ページ読み込み用）
          await this.delay(2000);
          
          // スクリプト注入試行
          this.logger.log(`[StreamProcessorV2] スクリプト注入中: ${task.aiType} (試行 ${retryCount + 1}/3)`);
          const injectionResult = await this.injectScriptsForTab(currentTabId, task.aiType);
          
          if (injectionResult) {
            injectionSuccess = true;
            this.logger.log(`[StreamProcessorV2] ✅ スクリプト注入成功`);
            break;
          }
          
          this.logger.error(`[StreamProcessorV2] ❌ スクリプト注入失敗 (試行 ${retryCount + 1}/3)`);
        }
        
        if (!injectionSuccess) {
          this.logger.error(`[StreamProcessorV2] ❌ 最終的にスクリプト注入失敗: ${task.column}${task.row}`);
          
          // 最終クリーンアップ
          try {
            const WindowService = await import('../../services/window-service.js').then(m => m.default);
            await WindowService.closeWindow(currentTabId);
            WindowService.releasePosition(position);
          } catch (cleanupError) {
            this.logger.error(`[StreamProcessorV2] 最終クリーンアップエラー:`, cleanupError);
          }
          
          // このタスクをコンテキストから削除
          taskContexts.pop();
          continue;
        }
        
        this.logger.log(`[StreamProcessorV2] テキスト入力${index + 1}/${batch.length}: ${task.column}${task.row}`);
        
        // テキスト入力をリトライ付きで実行
        let textSuccess = false;
        let textRetryCount = 0;
        const maxTextRetries = 3;
        
        while (!textSuccess && textRetryCount < maxTextRetries) {
          const textResult = await this.executePhaseOnTab(currentTabId, { ...task, prompt }, 'text');
          
          if (textResult && textResult.success) {
            textSuccess = true;
            this.logger.log(`[StreamProcessorV2] ✅ テキスト入力成功: ${task.column}${task.row}`);
          } else {
            textRetryCount++;
            this.logger.error(`[StreamProcessorV2] ❌ テキスト入力失敗 (試行 ${textRetryCount}/${maxTextRetries}): ${task.column}${task.row}`, textResult?.error);
            
            if (textRetryCount < maxTextRetries) {
              await this.delay(3000); // リトライ前に待機
            }
          }
        }
        
        if (!textSuccess) {
          this.logger.error(`[StreamProcessorV2] ❌ 最終的にテキスト入力失敗: ${task.column}${task.row}`);
          
          // テキスト入力が最終的に失敗した場合、ウィンドウを閉じて再作成
          try {
            const WindowService = await import('../../services/window-service.js').then(m => m.default);
            await WindowService.closeWindow(currentTabId);
            WindowService.releasePosition(position);
            
            await this.delay(2000);
            
            // 新しいウィンドウを作成してリトライ
            const newTabId = await this.createWindowForTask(task, position);
            if (newTabId) {
              currentTabId = newTabId;
              taskContexts[taskContexts.length - 1].tabId = newTabId;
              
              await this.delay(2000);
              await this.injectScriptsForTab(newTabId, task.aiType);
              
              // 最後の試行
              const finalResult = await this.executePhaseOnTab(newTabId, { ...task, prompt }, 'text');
              if (finalResult && finalResult.success) {
                this.logger.log(`[StreamProcessorV2] ✅ ウィンドウ再作成後のテキスト入力成功`);
              } else {
                this.logger.error(`[StreamProcessorV2] ❌ ウィンドウ再作成後もテキスト入力失敗 - タスクをスキップ`);
                taskContexts.pop(); // 失敗したタスクを削除
                continue;
              }
            } else {
              this.logger.error(`[StreamProcessorV2] ❌ ウィンドウ再作成失敗 - タスクをスキップ`);
              taskContexts.pop();
              continue;
            }
          } catch (error) {
            this.logger.error(`[StreamProcessorV2] ウィンドウ再作成エラー:`, error);
            taskContexts.pop();
            continue;
          }
        }
        
        // 各ウィンドウ作成後に短い待機
        if (index < batch.length - 1) {
          await this.delay(1000);
        }
      }
      
      // スキップされたセルをまとめてログ出力
      if (skippedCells.length > 0) {
        const ranges = this.formatCellRanges(skippedCells);
        this.logger.log(`[StreamProcessorV2] 📊 既存回答ありでスキップ: ${ranges} (計${skippedCells.length}セル)`);
      }
      
      this.logger.log(`[StreamProcessorV2] ✅ フェーズ1完了: 全ウィンドウ準備済み`);
      await this.delay(2000); // フェーズ間の待機
      
      // ========================================
      // フェーズ2: モデルを順番に選択（リトライ機能付き）
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 フェーズ2: モデル選択（順番に）`);
      
      for (let index = 0; index < taskContexts.length; index++) {
        const context = taskContexts[index];
        this.logger.log(`[StreamProcessorV2] モデル選択${index + 1}/${taskContexts.length}: ${context.cell}`);
        
        let modelSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!modelSuccess && retryCount < maxRetries) {
          try {
            // モデル選択を実行
            const modelResult = await this.executePhaseOnTab(context.tabId, context.task, 'model');
            
            if (modelResult && modelResult.success !== false && modelResult.displayedModel !== undefined) {
              context.task.displayedModel = modelResult.displayedModel;
              this.logger.log(`[StreamProcessorV2] ✅ モデル選択成功: ${context.task.model || 'Auto'} → ${modelResult.displayedModel || '(取得できず)'}`);
              modelSuccess = true;
            } else {
              throw new Error(`モデル選択失敗: ${context.cell}`);
            }
          } catch (error) {
            retryCount++;
            this.logger.error(`[StreamProcessorV2] ❌ モデル選択失敗 (試行 ${retryCount}/${maxRetries}): ${context.cell}`, error);
            
            if (retryCount < maxRetries) {
              // ウィンドウを閉じて再作成
              this.logger.log(`[StreamProcessorV2] 🔄 ウィンドウを再作成してリトライします`);
              
              try {
                // 既存ウィンドウを閉じる
                const tab = await chrome.tabs.get(context.tabId);
                if (tab && tab.windowId) {
                  await chrome.windows.remove(tab.windowId);
                }
                // WindowServiceの動的importを避け、直接window-serviceのインスタンスを使用
                // ポジション管理は必要に応じて別途実装
                if (this.windowService) {
                  this.windowService.releasePosition(context.position);
                }
              } catch (closeError) {
                this.logger.error(`[StreamProcessorV2] ウィンドウクローズエラー:`, closeError);
              }
              
              await this.delay(2000);
              
              // 新しいウィンドウを作成
              const newTabId = await this.createWindowForTask(context.task, context.position);
              if (newTabId) {
                context.tabId = newTabId;
                await this.delay(2000);
                
                // スクリプトを注入
                await this.injectScriptsForTab(newTabId, context.task.aiType);
                
                // テキストを再入力
                this.logger.log(`[StreamProcessorV2] テキスト再入力: ${context.cell}`);
                const textResult = await this.executePhaseOnTab(newTabId, context.task, 'text');
                if (!textResult || !textResult.success) {
                  this.logger.error(`[StreamProcessorV2] テキスト再入力失敗: ${context.cell}`);
                }
                
                await this.delay(2000);
              } else {
                this.logger.error(`[StreamProcessorV2] ウィンドウ再作成失敗`);
              }
            }
          }
        }
        
        if (!modelSuccess) {
          this.logger.error(`[StreamProcessorV2] ❌ 最終的にモデル選択失敗: ${context.cell} - このタスクをスキップします`);
          context.failed = true;
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
        
        // Canvas等の特殊機能かどうかを判定
        const specialFunctions = ['Canvas', 'Deep Research', 'DeepResearch', 'DeepReserch'];
        const isSpecialFunction = specialFunctions.some(f => 
          context.task.function && context.task.function.includes(f)
        );
        
        // 特殊機能の場合はdisplayedFunctionのチェックをスキップ
        if (isSpecialFunction) {
          this.logger.log(`[StreamProcessorV2] 🎨 特殊機能「${context.task.function}」を選択中 - 成功判定を調整`);
        }
        
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
          checkFunction: !isSpecialFunction,  // 特殊機能の場合はチェックを無効化
          phaseName: '機能選択',
          maxRetries: 3
        });
        
        // 結果を処理
        if (retryResult.success && retryResult.result) {
          context.task.displayedFunction = retryResult.result.displayedFunction;
          this.logger.log(`[StreamProcessorV2] ✅ 選択された機能を記録: ${context.task.function || '通常'} → ${retryResult.result.displayedFunction || '通常'}`);
          
          // 特殊機能の場合の追加ログ
          if (isSpecialFunction) {
            this.logger.log(`[StreamProcessorV2] 🎨 特殊機能「${context.task.function}」の選択完了 - 送信フェーズへ進みます`);
          }
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
        try {
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
          
          // Canvas機能使用時の応答チェック
          if (context.task.function === 'Canvas' || context.task.displayedFunction === 'Canvas') {
            this.logger.log(`[StreamProcessorV2] 🎨 Canvas応答を検出: ${result.response.substring(0, 200)}...`);
          }
          
          // スプレッドシートに書き込み
          if (this.spreadsheetData) {
            const { spreadsheetId, gid } = this.spreadsheetData;
            const range = context.cell;
            
            // 応答内容を確認
            this.logger.log(`[StreamProcessorV2] 📝 書き込み準備: ${range}`, {
              responseLength: result.response.length,
              responsePreview: result.response.substring(0, 100),
              isCanvas: context.task.function === 'Canvas'
            });
            
            try {
              const writeResult = await globalThis.sheetsClient?.updateCell(
                spreadsheetId,
                range,
                result.response,
                gid
              );
              
              if (writeResult) {
                this.logger.log(`[StreamProcessorV2] ✅ ${range}に応答を書き込み成功`);
              } else {
                this.logger.error(`[StreamProcessorV2] ❌ ${range}への書き込み結果が不明`);
              }
            } catch (writeError) {
              this.logger.error(`[StreamProcessorV2] ❌ ${range}への書き込みエラー:`, writeError);
              // エラーでも処理は継続
            }
            
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
                
                const logResult = await this.spreadsheetLogger.writeLogToSpreadsheet(taskWithModel, {
                  url: currentUrl,
                  sheetsClient: globalThis.sheetsClient,
                  spreadsheetId,
                  gid,
                  isFirstTask: isFirstForThisCell,
                  enableWriteVerification: true  // 書き込み確認を有効化
                });
                
                // 書き込み結果を確認
                if (logResult && logResult.success) {
                  // このセルを処理済みとしてマーク
                  this.processedCells.add(logCellKey);
                  this.logger.log(`[StreamProcessorV2] ✅ ログを書き込み: ${context.task.logColumns[0]}${context.task.row} (検証済み: ${logResult.verified})`);
                } else {
                  this.logger.error(`[StreamProcessorV2] ❌ ログ書き込み失敗: ${context.task.logColumns[0]}${context.task.row}`);
                }
                
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
        
        // ログ書き込みが完全に終わるまで少し待機
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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
          return { status: 'fulfilled', value: result, cell: context.cell };
          
        } catch (error) {
          this.logger.error(`[StreamProcessorV2] ❌ ${context.cell}の送信エラー:`, error);
          
          // エラー時もウィンドウを閉じる
          try {
            const tab = await chrome.tabs.get(context.tabId);
            if (tab && tab.windowId) {
              await chrome.windows.remove(tab.windowId);
              this.logger.log(`[StreamProcessorV2] 🔒 エラー後にウィンドウを閉じました: ${context.cell}`);
            }
          } catch (closeError) {
            this.logger.warn(`[StreamProcessorV2] ウィンドウクローズエラー:`, closeError);
          }
          
          return { status: 'rejected', reason: error, cell: context.cell };
        }
      });
      
      // Promise.allSettledを使用して、一部のタスクが失敗しても他のタスクは継続
      const results = await Promise.allSettled(sendPromises);
      
      // 結果の集計
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      
      this.logger.log(`[StreamProcessorV2] ✅ バッチ内の送信結果: 成功=${successCount}, 失敗=${failureCount}`);
      
      // 失敗したタスクの詳細をログ出力
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(`[StreamProcessorV2] タスク失敗詳細: ${result.cell || `タスク${index + 1}`}`, result.reason);
        }
      });
      
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
   * タブにスクリプトを注入（タイムアウト・リトライ付き）
   * @param {number} tabId - タブID
   * @param {string} aiType - AIタイプ
   * @param {number} maxRetries - 最大リトライ回数
   */
  async injectScriptsForTab(tabId, aiType, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`[StreamProcessorV2] 🔄 スクリプト注入試行 ${attempt}/${maxRetries}`);
        
        // タイムアウト付きで実行（60秒）
        const result = await Promise.race([
          this._injectScriptsCore(tabId, aiType),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Script injection timeout (60s)')), 60000)
          )
        ]);
        
        if (result) {
          this.logger.log(`[StreamProcessorV2] ✅ スクリプト注入成功 (試行 ${attempt})`);
          return true;
        }
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] ❌ スクリプト注入失敗 (試行 ${attempt}/${maxRetries}):`, error);
        
        if (attempt === maxRetries) {
          this.logger.error(`[StreamProcessorV2] ❌ 最大リトライ回数に達しました`);
          return false;
        }
        
        // リトライ前に待機（段階的に増やす）
        const waitTime = 2000 * attempt;
        this.logger.log(`[StreamProcessorV2] ⏳ ${waitTime}ms待機してリトライ...`);
        await this.delay(waitTime);
      }
    }
    return false;
  }
  
  /**
   * ページの基本要素が存在するか検証
   * @param {number} tabId - タブID
   * @param {string} aiType - AIタイプ
   * @returns {Promise<boolean>} 検証成功したらtrue
   */
  async validatePageElements(tabId, aiType) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (aiType) => {
          // 基本的なDOM要素の存在確認
          const aiTypeLower = aiType.toLowerCase();
          
          // AI別の要素チェック
          if (aiTypeLower === 'claude') {
            // Claudeの入力フィールドを探す
            const hasTextarea = document.querySelector('div[contenteditable="true"]') !== null ||
                               document.querySelector('textarea') !== null ||
                               document.querySelector('[role="textbox"]') !== null;
            return hasTextarea;
          } else if (aiTypeLower === 'chatgpt') {
            // ChatGPTの入力フィールドを探す
            const hasTextarea = document.querySelector('textarea') !== null ||
                               document.querySelector('[contenteditable="true"]') !== null;
            return hasTextarea;
          } else if (aiTypeLower === 'gemini') {
            // Geminiの入力フィールドを探す
            const hasTextarea = document.querySelector('[contenteditable="true"]') !== null ||
                               document.querySelector('textarea') !== null ||
                               document.querySelector('.ql-editor') !== null;
            return hasTextarea;
          }
          
          // デフォルト：bodyが存在すればOK
          return document.body !== null;
        },
        args: [aiType]
      });
      
      const isValid = result?.[0]?.result || false;
      if (isValid) {
        this.logger.log(`[StreamProcessorV2] ✅ ページ要素検証成功: ${aiType}`);
      } else {
        this.logger.warn(`[StreamProcessorV2] ⚠️ ページ要素が見つかりません: ${aiType}`);
      }
      
      return isValid;
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ページ要素検証エラー:`, error);
      return false;
    }
  }

  /**
   * スクリプト注入のコア処理
   * @private
   */
  async _injectScriptsCore(tabId, aiType) {
    const startTime = Date.now();
    
    try {
      // ページ要素の検証
      const pageValid = await this.validatePageElements(tabId, aiType);
      if (!pageValid) {
        throw new Error(`ページ要素が正しく読み込まれていません: ${aiType}`);
      }
      
      const aiTypeLower = aiType.toLowerCase();
      
      // V2スクリプトマップ
      const v2ScriptMap = {
        'claude': 'automations/v2/claude-automation-v2.js',
        'chatgpt': 'automations/v2/chatgpt-automation-v2.js',
        'gemini': 'automations/v2/gemini-automation-v2.js'
      };
      
      // 共通スクリプト（ai-wait-configを最初に読み込む）
      const commonScripts = [
        'automations/v2/ai-wait-config.js',
        'automations/feature-constants.js',
        'automations/common-ai-handler.js'
      ];
      
      // AI固有のスクリプト
      const aiScript = v2ScriptMap[aiTypeLower] || `automations/${aiTypeLower}-automation.js`;
      
      // スクリプトを順番に注入
      const scriptsToInject = [...commonScripts, aiScript];
      
      for (const scriptFile of scriptsToInject) {
        this.logger.log(`[StreamProcessorV2] 📝 スクリプト注入: ${scriptFile}`);
        
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: [scriptFile]
          });
        } catch (scriptError) {
          this.logger.error(`[StreamProcessorV2] ❌ スクリプト ${scriptFile} の注入失敗:`, scriptError);
          throw new Error(`Failed to inject ${scriptFile}: ${scriptError.message}`);
        }
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
        const errorMsg = `${aiType}のAutomationオブジェクトが見つかりません`;
        this.logger.error(`[StreamProcessorV2] ❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      const elapsedTime = Date.now() - startTime;
      this.logger.log(`[StreamProcessorV2] ✅ スクリプト注入完了 (${elapsedTime}ms)`);
      return true;
      
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      this.logger.error(`[StreamProcessorV2] スクリプト注入エラー (${elapsedTime}ms):`, error);
      throw error;
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
      
      // AIタイプを取得
      const aiType = task.aiType || 'chatgpt';
      
      // フェーズに応じた処理を実行
      switch(phase) {
        case 'text':
          // テキスト入力のみ実行
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (prompt, aiType, cellInfo) => {
              // AIタイプに応じたAutomationオブジェクトを取得
              const automationMap = {
                'claude': ['ClaudeAutomationV2', 'ClaudeAutomation'],
                'chatgpt': ['ChatGPTAutomationV2', 'ChatGPTAutomation'],
                'gemini': ['GeminiAutomation']
              };
              
              const possibleNames = automationMap[aiType.toLowerCase()] || [];
              const automationName = possibleNames.find(name => window[name] !== undefined);
              const automation = automationName ? window[automationName] : null;
              
              if (automation && automation.inputTextOnly) {
                // ClaudeV2とGeminiV2用にconfigオブジェクトを渡す
                const config = { cellInfo: cellInfo };
                return await automation.inputTextOnly(prompt, config);
              }
              return { success: false, error: `${aiType} automation not found or inputTextOnly not supported` };
            },
            args: [task.prompt || task.text || '', aiType, task.cellInfo || { column: task.column, row: task.row }]
          });
          break;
          
        case 'model':
          // モデル選択のみ実行
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (model, aiType) => {
              // AIタイプに応じたAutomationオブジェクトを取得
              const automationMap = {
                'claude': ['ClaudeAutomationV2', 'ClaudeAutomation'],
                'chatgpt': ['ChatGPTAutomationV2', 'ChatGPTAutomation'],
                'gemini': ['GeminiAutomation']
              };
              
              const possibleNames = automationMap[aiType.toLowerCase()] || [];
              const automationName = possibleNames.find(name => window[name] !== undefined);
              const automation = automationName ? window[automationName] : null;
              
              if (automation && automation.selectModelOnly) {
                return await automation.selectModelOnly(model);
              }
              return { success: false, error: `${aiType} automation not found or selectModelOnly not supported` };
            },
            args: [task.model, aiType]
          });
          break;
          
        case 'function':
          // 機能選択のみ実行
          console.log(`🔍 [DEBUG] 機能選択実行開始 - タブ: ${tabId}, 機能: ${task.function}, AI: ${aiType}`);
          
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (functionName, aiType) => {
              console.log(`🔍 [DEBUG] タブ内実行開始 - 機能: "${functionName}", AI: ${aiType}`);
              
              // AIタイプに応じたAutomationオブジェクトを取得
              const automationMap = {
                'claude': ['ClaudeAutomationV2', 'ClaudeAutomation'],
                'chatgpt': ['ChatGPTAutomationV2', 'ChatGPTAutomation'],
                'gemini': ['GeminiAutomation']
              };
              
              const possibleNames = automationMap[aiType.toLowerCase()] || [];
              console.log(`🔍 [DEBUG] 探索対象: ${possibleNames.join(', ')}`);
              
              const automationName = possibleNames.find(name => {
                const exists = window[name] !== undefined;
                console.log(`🔍 [DEBUG] ${name} 存在確認: ${exists}`);
                return exists;
              });
              
              const automation = automationName ? window[automationName] : null;
              console.log(`🔍 [DEBUG] 使用するAutomation: ${automationName || 'なし'}`);
              
              if (automation && automation.selectFunctionOnly) {
                console.log(`🔍 [DEBUG] selectFunctionOnly実行開始`);
                try {
                  const result = await automation.selectFunctionOnly(functionName);
                  console.log(`🔍 [DEBUG] selectFunctionOnly実行完了 - 結果:`, result);
                  
                  // Geminiの場合、成功判定を調整（Canvasなど特殊な機能名でも成功とする）
                  if (aiType.toLowerCase() === 'gemini' && functionName) {
                    // Canvas機能などの特別処理
                    const specialFunctions = ['Canvas', 'Deep Research', 'DeepResearch', 'DeepReserch'];
                    if (specialFunctions.some(f => functionName.includes(f))) {
                      console.log(`🔍 [DEBUG] Gemini特殊機能「${functionName}」の処理 - 成功として扱う`);
                      // resultがfalseでも強制的に成功とする（機能選択自体は実行されたため）
                      if (!result.success) {
                        console.log(`⚠️ [DEBUG] 機能選択は実行されたが確認できなかった - 成功として続行`);
                        return { success: true, warning: '機能選択状態の確認ができませんでしたが、処理を続行します' };
                      }
                    }
                  }
                  
                  return result;
                } catch (error) {
                  console.error(`❌ [DEBUG] selectFunctionOnly実行エラー:`, error);
                  return { success: false, error: error.message || 'Function selection failed' };
                }
              }
              
              const errorResult = { success: false, error: `${aiType} automation not found or selectFunctionOnly not supported` };
              console.log(`🔍 [DEBUG] エラー終了:`, errorResult);
              return errorResult;
            },
            args: [task.function, aiType]
          });
          
          console.log(`🔍 [DEBUG] chrome.scripting.executeScript完了 - 結果:`, result);
          break;
          
        case 'send':
          // 送信と応答取得
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (aiType, taskData) => {
              // AIタイプに応じたAutomationオブジェクトを取得
              const automationMap = {
                'claude': ['ClaudeAutomationV2', 'ClaudeAutomation'],
                'chatgpt': ['ChatGPTAutomationV2', 'ChatGPTAutomation'],
                'gemini': ['GeminiAutomation']
              };
              
              const possibleNames = automationMap[aiType.toLowerCase()] || [];
              const automationName = possibleNames.find(name => window[name] !== undefined);
              const automation = automationName ? window[automationName] : null;
              
              if (automation && automation.sendAndGetResponse) {
                // Geminiの場合はtaskDataを渡す（Canvas判定のため）
                if (aiType.toLowerCase() === 'gemini') {
                  return await automation.sendAndGetResponse(taskData);
                } else {
                  // 他のAIは既存の処理（引数なし）
                  return await automation.sendAndGetResponse();
                }
              }
              return { success: false, error: `${aiType} automation not found or sendAndGetResponse not supported` };
            },
            args: [aiType, { function: task.function, displayedFunction: task.displayedFunction }]
          });
          break;
          
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }
      
      // 結果を返す
      console.log(`🔍 [DEBUG] 結果処理開始 - result:`, result);
      console.log(`🔍 [DEBUG] result配列長:`, result?.length);
      
      if (result && result[0]) {
        const finalResult = result[0].result;
        console.log(`🔍 [DEBUG] 最終結果 - result[0].result:`, finalResult);
        console.log(`🔍 [DEBUG] 最終結果の型:`, typeof finalResult);
        console.log(`🔍 [DEBUG] 成功フラグ:`, finalResult?.success);
        
        if (finalResult && typeof finalResult === 'object' && finalResult.hasOwnProperty('success')) {
          console.log(`🔍 [DEBUG] 正常な結果オブジェクトを返却:`, finalResult);
          return finalResult;
        } else {
          console.log(`❌ [DEBUG] 不正な結果形式 - デフォルト失敗を返却`);
          return { success: false, error: 'Invalid result format', rawResult: finalResult };
        }
      }
      
      const noResultError = { success: false, error: 'No result' };
      console.log(`❌ [DEBUG] 結果なし - エラーを返却:`, noResultError);
      return noResultError;
      
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
    const skippedCells = [];
    
    // APIレート制限対策: 各タスクの確認間に遅延を追加
    for (const task of tasks) {
      try {
        // スプレッドシートから現在の回答を取得
        const currentAnswer = await this.getCurrentAnswer(task);
        
        if (!currentAnswer || currentAnswer.trim() === '') {
          tasksToReprocess.push(task);
        } else {
          skippedCells.push(`${task.column}${task.row}`);
        }
        
        // APIコール間に1秒待機してレート制限を回避
        await this.delay(1000);
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] ${task.column}${task.row}の回答確認エラー:`, error);
        // エラーの場合も再実行対象に追加
        tasksToReprocess.push(task);
        // エラー時も待機
        await this.delay(1000);
      }
    }
    
    // スキップされたセルをまとめてログ出力
    if (skippedCells.length > 0) {
      const ranges = this.formatCellRanges(skippedCells);
      this.logger.log(`[StreamProcessorV2] ✅ 既存回答ありでスキップ: ${ranges} (計${skippedCells.length}セル)`);
    }
    
    if (tasksToReprocess.length > 0) {
      const reprocessCells = tasksToReprocess.map(t => `${t.column}${t.row}`);
      const reprocessRanges = this.formatCellRanges(reprocessCells);
      this.logger.log(`[StreamProcessorV2] 🔄 ${column}列: 再実行対象 ${reprocessRanges} (計${tasksToReprocess.length}セル)`);
      
      // 再実行タスクをバッチ処理
      const reprocessBatches = this.createBatches(tasksToReprocess, 3);
      
      for (let batchIndex = 0; batchIndex < reprocessBatches.length; batchIndex++) {
        const batch = reprocessBatches[batchIndex];
        
        this.logger.log(`[StreamProcessorV2] 🔄 ${column}列 再実行バッチ${batchIndex + 1}/${reprocessBatches.length}開始`);
        
        // 失敗時スキップモードで再実行（モデル/機能選択が失敗してもスキップして続行）
        await this.processBatchWithSkip(batch, isTestMode);
        
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
      
      // getSheetDataを使用（getRangeは存在しない）
      const response = await globalThis.sheetsClient.getSheetData(
        spreadsheetId,
        range,
        gid
      );
      
      // getSheetDataは配列を直接返す（response.valuesではない）
      if (response && response.length > 0 && response[0].length > 0) {
        const value = response[0][0];
        this.logger.log(`[StreamProcessorV2] 📊 ${task.column}${task.row}の既存回答: "${value?.substring(0, 50)}..."`);
        return value;
      }
      
      this.logger.log(`[StreamProcessorV2] 📊 ${task.column}${task.row}: 回答なし`);
      return '';
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ${task.column}${task.row}の回答取得エラー:`, error);
      return '';
    }
  }

  /**
   * ページの読み込み完了を待つ
   * @param {number} tabId - タブID
   * @param {number} timeout - タイムアウト時間（ミリ秒）
   * @returns {Promise<boolean>} 読み込み完了したらtrue
   */
  /**
   * 指定された時間だけ待機
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForPageLoad(tabId, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      // タブの状態を監視
      const checkTabStatus = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          
          if (tab.status === 'complete') {
            this.logger.log(`[StreamProcessorV2] ✅ ページ読み込み完了: TabID ${tabId}`);
            resolve(true);
            return;
          }
          
          // タイムアウトチェック
          if (Date.now() - startTime > timeout) {
            this.logger.warn(`[StreamProcessorV2] ⚠️ ページ読み込みタイムアウト: TabID ${tabId}`);
            resolve(false);
            return;
          }
          
          // 再チェック
          setTimeout(checkTabStatus, 500);
        } catch (error) {
          // タブが存在しない場合
          this.logger.error(`[StreamProcessorV2] タブ状態取得エラー: TabID ${tabId}`, error);
          resolve(false);
        }
      };
      
      checkTabStatus();
    });
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
      
      // ページの読み込み完了を待つ
      const pageLoaded = await this.waitForPageLoad(tabId, 30000);
      if (!pageLoaded) {
        this.logger.warn(`[StreamProcessorV2] ⚠️ ページ読み込みが完了しませんでした: TabID ${tabId}`);
      }
      
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
   * セルのリストを連続する範囲にまとめてフォーマット
   * 例: ["H9", "H10", "H11", "H13", "H14"] -> "H9-H11, H13-H14"
   */
  formatCellRanges(cells) {
    if (!cells || cells.length === 0) return '';
    
    // セルを列ごとにグループ化
    const columnGroups = {};
    cells.forEach(cell => {
      const match = cell.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const [, column, row] = match;
        if (!columnGroups[column]) {
          columnGroups[column] = [];
        }
        columnGroups[column].push(parseInt(row));
      }
    });
    
    // 各列の連続範囲をフォーマット
    const ranges = [];
    Object.keys(columnGroups).sort().forEach(column => {
      const rows = columnGroups[column].sort((a, b) => a - b);
      let rangeStart = rows[0];
      let rangeEnd = rows[0];
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] === rangeEnd + 1) {
          rangeEnd = rows[i];
        } else {
          // 範囲を追加
          if (rangeStart === rangeEnd) {
            ranges.push(`${column}${rangeStart}`);
          } else if (rangeEnd - rangeStart === 1) {
            ranges.push(`${column}${rangeStart}, ${column}${rangeEnd}`);
          } else {
            ranges.push(`${column}${rangeStart}-${column}${rangeEnd}`);
          }
          rangeStart = rows[i];
          rangeEnd = rows[i];
        }
      }
      
      // 最後の範囲を追加
      if (rangeStart === rangeEnd) {
        ranges.push(`${column}${rangeStart}`);
      } else if (rangeEnd - rangeStart === 1) {
        ranges.push(`${column}${rangeStart}, ${column}${rangeEnd}`);
      } else {
        ranges.push(`${column}${rangeStart}-${column}${rangeEnd}`);
      }
    });
    
    return ranges.join(', ');
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
    const skippedCells = []; // スキップされたセルを収集
    
    try {
      // フェーズ1: ウィンドウ準備とテキスト入力
      for (let index = 0; index < batch.length; index++) {
        const task = batch[index];
        const position = index;
        
        // 既存回答チェック
        const existingAnswer = await this.getCurrentAnswer(task);
        if (existingAnswer && existingAnswer.trim() !== '') {
          skippedCells.push(`${task.column}${task.row}`);
          // タスクを完了扱いにして次へ
          this.completedTasks.add(task.id);
          this.writtenCells.set(`${task.column}${task.row}`, existingAnswer);
          continue;
        }
        
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
        
        // スクリプト注入（失敗時はウィンドウをクリーンアップ）
        const injectionResult = await this.injectScriptsForTab(tabId, task.aiType);
        if (!injectionResult) {
          this.logger.error(`[StreamProcessorV2] ❌ スクリプト注入失敗: ${task.column}${task.row} - ウィンドウをクリーンアップしてスキップ`);
          
          // ウィンドウを閉じてポジションを解放
          try {
            const WindowService = await import('../../services/window-service.js').then(m => m.default);
            await WindowService.closeWindow(tabId);
            WindowService.releasePosition(position);
            this.logger.log(`[StreamProcessorV2] 🧹 ウィンドウ${tabId}をクリーンアップしました`);
          } catch (cleanupError) {
            this.logger.error(`[StreamProcessorV2] ウィンドウクリーンアップエラー:`, cleanupError);
          }
          
          // このタスクをコンテキストから削除
          taskContexts.pop();
          continue;
        }
        
        const textResult = await this.executePhaseOnTab(tabId, { ...task, prompt }, 'text');
        if (!textResult || !textResult.success) {
          this.logger.error(`[StreamProcessorV2] テキスト入力失敗: ${task.column}${task.row}`);
        }
        
        if (index < batch.length - 1) {
          await this.delay(1000);
        }
      }
      
      // スキップされたセルをまとめてログ出力
      if (skippedCells.length > 0) {
        const ranges = this.formatCellRanges(skippedCells);
        this.logger.log(`[StreamProcessorV2] 📊 既存回答ありでスキップ: ${ranges} (計${skippedCells.length}セル)`);
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

  /**
   * プロンプトグループごとに順次タスクを生成して処理
   * 
   * 処理の流れ：
   * 1. プロンプトグループ1（D,E→F）のタスクを生成して並列処理
   * 2. グループ1完了後、プロンプトグループ2（D,E→F,G,H）のタスクを生成して並列処理
   * 3. グループ2完了後、プロンプトグループ3（J→K）のタスクを生成して並列処理
   * 
   * 各グループ内では従来通り並列処理（3ウィンドウで3タスクずつ）
   * 
   * @param {TaskList} initialTaskList - 初期タスクリスト（未使用、互換性のため残す）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {boolean} isTestMode - テストモード
   */
  /**
   * V3: シンプルなグループ順次処理（列制御・行制御・3種類AI対応）
   * 動的にグループ構造を再解析して次のタスクを生成
   */
  async processGroupsSequentiallyV3(spreadsheetData, isTestMode) {
    this.logger.log('[StreamProcessorV2] 🚀 V3グループ順次処理開始（動的タスク生成モード）');
    
    let totalProcessed = 0;
    let totalFailed = 0;
    
    // 処理済みグループを追跡（重複処理防止）
    const processedGroupKeys = new Set();
    let groupIndex = 0;
    
    // 無限ループ防止のため最大グループ数を設定
    const MAX_GROUPS = 50;
    
    while (groupIndex < MAX_GROUPS) {
      // 毎回構造を再解析（動的にグループを発見）
      this.logger.log(`[StreamProcessorV2] 📊 構造を再解析中（イテレーション${groupIndex + 1}）...`);
      const structure = this.taskGenerator.analyzeStructure(spreadsheetData);
      const { promptGroups, controls, workRows } = structure;
      
      // 初回のみ構造情報をログ出力
      if (groupIndex === 0) {
        this.logger.log(`[StreamProcessorV2] 📊 初期構造解析完了:`, {
          グループ数: promptGroups.length,
          作業行数: workRows ? workRows.length : 0,
          行制御: controls.row.length,
          列制御: controls.column.length
        });
      }
      
      // 処理可能なグループがなければ終了
      if (groupIndex >= promptGroups.length) {
        this.logger.log(`[StreamProcessorV2] ✅ すべてのグループ処理完了（合計${groupIndex}グループ）`);
        break;
      }
      
      const promptGroup = promptGroups[groupIndex];
      
      // taskGroups情報から依存関係を確認
      let canProcessGroup = true;
      let taskGroupInfo = null;
      
      if (spreadsheetData.taskGroups && spreadsheetData.taskGroups.length > groupIndex) {
        taskGroupInfo = spreadsheetData.taskGroups[groupIndex];
        
        // 依存関係のチェック
        if (taskGroupInfo.dependencies && taskGroupInfo.dependencies.length > 0) {
          for (const dependencyId of taskGroupInfo.dependencies) {
            if (!processedGroupKeys.has(dependencyId)) {
              this.logger.log(`[StreamProcessorV2] ⏳ グループ${groupIndex + 1}(${taskGroupInfo.id})は依存関係待ち: ${dependencyId}が未完了`);
              canProcessGroup = false;
              break;
            }
          }
        }
        
        if (canProcessGroup) {
          this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}(${taskGroupInfo.id})の依存関係クリア`);
        }
      }
      
      // 依存関係が満たされていない場合は次のイテレーションで再試行
      if (!canProcessGroup) {
        // 他のグループが処理可能か確認するため、groupIndexを進めずに次のループへ
        await this.wait(5000); // 5秒待機
        continue;
      }
      
      // グループのキーを生成（重複処理防止）
      const groupKey = taskGroupInfo ? taskGroupInfo.id : promptGroup.promptColumns.join(',');
      if (processedGroupKeys.has(groupKey)) {
        this.logger.log(`[StreamProcessorV2] ⚠️ グループ${groupIndex + 1}は既に処理済み、スキップ`);
        groupIndex++;
        continue;
      }
      
      // 列制御をチェック（「この列で停止」があるか確認）
      let shouldStopAfterColumn = null;
      if (controls.column && controls.column.length > 0) {
        const untilControl = controls.column.find(c => c.type === 'until');
        if (untilControl) {
          shouldStopAfterColumn = untilControl.index;
          if (groupIndex === 0) {
            this.logger.log(`[StreamProcessorV2] ⚠️ 列制御: ${this.indexToColumn(untilControl.index)}列で停止`);
          }
        }
      }
      
      // 「この列で停止」制御のチェック
      if (shouldStopAfterColumn !== null) {
        const groupStart = Math.min(...promptGroup.promptColumns);
        if (groupStart > shouldStopAfterColumn) {
          this.logger.log(`[StreamProcessorV2] 🛑 グループ${groupIndex + 1}は列制御により処理をスキップ`);
          break; // 以降のグループも処理しない
        }
      }
      
      this.logger.log(`[StreamProcessorV2] \n${'='.repeat(50)}`);
      this.logger.log(`[StreamProcessorV2] 📋 グループ${groupIndex + 1}/${promptGroups.length}の処理開始`, {
        プロンプト列: promptGroup.promptColumns.map(i => this.indexToColumn(i)),
        回答列: promptGroup.answerColumns.map(col => col.column),
        AIタイプ: promptGroup.aiType
      });
      
      // このグループのタスクを生成（列制御・行制御を適用）
      const groupTaskList = await this.taskGenerator.generateTasksForPromptGroup(
        spreadsheetData,
        groupIndex
      );
      
      if (!groupTaskList || groupTaskList.tasks.length === 0) {
        this.logger.log(`[StreamProcessorV2] グループ${groupIndex + 1}にタスクなし（すべて回答済みまたは列制御でスキップ）`);
        // 処理済みとしてマーク
        processedGroupKeys.add(groupKey);
        groupIndex++;
        continue;
      }
      
      this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}のタスク生成完了: ${groupTaskList.tasks.length}個`);
      
      // 3種類AIかどうかを判定
      const is3TypeAI = promptGroup.aiType && 
        (promptGroup.aiType.includes('3種類') || promptGroup.aiType.includes('３種類'));
      
      if (is3TypeAI) {
        // 3種類AI: 列ごとにグループ化して特別処理
        this.logger.log(`[StreamProcessorV2] 🎯 3種類AIモードで処理`);
        const columnGroups = this.organizeTasksByColumn(groupTaskList.tasks);
        await this.process3TypeAIGroup(columnGroups, isTestMode);
        totalProcessed += groupTaskList.tasks.length;
      } else {
        // 通常AI: 3個ずつバッチ処理
        this.logger.log(`[StreamProcessorV2] 🎯 通常モードで処理（3個ずつバッチ）`);
        const tasks = groupTaskList.tasks;
        
        for (let i = 0; i < tasks.length; i += 3) {
          const batch = tasks.slice(i, i + 3);
          this.logger.log(`[StreamProcessorV2] バッチ${Math.floor(i/3) + 1}: ${batch.map(t => `${t.column}${t.row}`).join(', ')}`);
          
          try {
            await this.processBatch(batch, isTestMode);
            totalProcessed += batch.length;
          } catch (error) {
            this.logger.error(`[StreamProcessorV2] バッチ処理エラー:`, error);
            totalFailed += batch.length;
          }
        }
      }
      
      // このグループを処理済みとしてマーク
      processedGroupKeys.add(groupKey);
      
      this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}の処理完了`);
      this.logger.log(`[StreamProcessorV2] ${'='.repeat(50)}\n`);
      
      // スプレッドシートを再読み込み（次のグループのタスクを動的に発見するため）
      // sheetsClientが存在しない場合は、spreadsheetDataからSheetsClientを取得
      let sheetsClient = this.sheetsClient;
      if (!sheetsClient && this.spreadsheetLogger?.sheetsClient) {
        sheetsClient = this.spreadsheetLogger.sheetsClient;
      }
      
      if (sheetsClient && spreadsheetData.spreadsheetId && spreadsheetData.gid !== undefined) {
        try {
          this.logger.log('[StreamProcessorV2] 📊 次のグループのためにスプレッドシートを再読み込み中...');
          const updatedData = await sheetsClient.loadAutoAIData(
            spreadsheetData.spreadsheetId,
            spreadsheetData.gid
          );
          if (updatedData) {
            // 全体のデータ構造を更新
            Object.assign(spreadsheetData, updatedData);
            
            // taskGroups情報も再生成（プロンプトが更新されている可能性があるため）
            if (globalThis.processSpreadsheetData) {
              const reprocessedData = globalThis.processSpreadsheetData(spreadsheetData);
              if (reprocessedData.taskGroups) {
                spreadsheetData.taskGroups = reprocessedData.taskGroups;
                this.logger.log('[StreamProcessorV2] 📊 taskGroups情報も更新されました:', {
                  グループ数: spreadsheetData.taskGroups.length
                });
              }
            }
            
            this.logger.log('[StreamProcessorV2] ✅ スプレッドシート再読み込み完了（taskGroups更新含む）');
          }
        } catch (error) {
          this.logger.error('[StreamProcessorV2] ❌ スプレッドシート再読み込みエラー:', error);
          // エラーが発生しても処理は継続
        }
      } else {
        this.logger.log('[StreamProcessorV2] ⚠️ スプレッドシート再読み込みスキップ（SheetsClientまたは必要な情報が不足）');
      }
      
      // 次のグループへ
      groupIndex++;
    }
    
    this.logger.log('[StreamProcessorV2] 🎉 V3グループ順次処理完了（動的タスク生成）', {
      処理済み: totalProcessed,
      失敗: totalFailed,
      処理グループ数: processedGroupKeys.size
    });
    
    return {
      success: true,
      total: totalProcessed + totalFailed,
      completed: totalProcessed,
      failed: totalFailed
    };
  }

  /**
   * 動的タスクキューを使用した新しい処理方式
   */
  async processWithDynamicQueue(spreadsheetData, isTestMode) {
    this.logger.log('[StreamProcessorV2] 🚀 動的タスクキュー処理開始');
    
    // SheetsClientを取得（spreadsheetDataから）
    const sheetsClient = spreadsheetData?.sheetsClient || this.spreadsheetLogger?.sheetsClient || null;
    
    // 動的キューを初期化
    this.dynamicQueue.initialize({
      sheetsClient: sheetsClient,
      taskGenerator: this.taskGenerator,
      spreadsheetData: spreadsheetData,
      onTaskCompleted: async (batch) => {
        // バッチ処理を実行
        return await this.processBatchForQueue(batch, isTestMode);
      }
    });
    
    // 初期タスクを生成
    const initialTasks = await this.generateInitialTasks(spreadsheetData);
    if (initialTasks.length === 0) {
      this.logger.log('[StreamProcessorV2] 初期タスクがありません');
      return { success: true, total: 0, completed: 0 };
    }
    
    // キューに初期タスクを追加
    this.dynamicQueue.enqueue(initialTasks);
    this.logger.log(`[StreamProcessorV2] 初期タスク${initialTasks.length}個をキューに追加`);
    
    // 処理を実行
    const result = await this.dynamicQueue.processAll();
    
    this.logger.log('[StreamProcessorV2] 🎉 動的タスクキュー処理完了', result);
    return {
      success: true,
      total: result.processed,
      completed: result.processed,
      iterations: result.iterations
    };
  }
  
  /**
   * 初期タスクを生成（最初に処理可能なグループから）
   */
  async generateInitialTasks(spreadsheetData) {
    const structure = this.taskGenerator.analyzeStructure(spreadsheetData);
    const promptGroups = structure.promptGroups || [];
    
    if (promptGroups.length === 0) {
      return [];
    }
    
    // 最初に処理可能なグループを探す
    for (let i = 0; i < promptGroups.length; i++) {
      const promptGroup = promptGroups[i];
      
      // グループが処理可能かチェック（最初のグループまたはプロンプト列にデータがあるグループ）
      const isFirstGroup = i === 0;
      const hasPromptData = this.checkPromptColumnsHaveData(promptGroup, spreadsheetData);
      
      if (isFirstGroup || hasPromptData) {
        const groupTaskList = await this.taskGenerator.generateTasksForPromptGroup(
          spreadsheetData,
          i
        );
        
        if (groupTaskList && groupTaskList.tasks.length > 0) {
          this.logger.log(`[StreamProcessorV2] グループ${i + 1}から初期タスク生成: ${groupTaskList.tasks.length}個`);
          return groupTaskList.tasks;
        }
      }
    }
    
    return [];
  }
  
  /**
   * プロンプト列にデータがあるかチェック
   */
  checkPromptColumnsHaveData(promptGroup, spreadsheetData) {
    if (!spreadsheetData || !spreadsheetData.values) {
      return false;
    }
    
    const values = spreadsheetData.values;
    
    // プロンプト列にデータがあるかチェック
    for (const promptColIndex of promptGroup.promptColumns) {
      for (let rowIndex = 8; rowIndex < values.length; rowIndex++) {
        const row = values[rowIndex];
        if (row && row[promptColIndex] && String(row[promptColIndex]).trim()) {
          return true; // データあり
        }
      }
    }
    
    return false; // データなし
  }
  
  /**
   * 動的キュー用のバッチ処理
   */
  async processBatchForQueue(batch, isTestMode) {
    const results = [];
    
    try {
      // 既存のprocessBatchメソッドを活用
      await this.processBatch(batch, isTestMode);
      
      // 各タスクの結果を収集
      for (const task of batch) {
        const cellKey = `${task.column}${task.row}`;
        const value = this.writtenCells.get(cellKey);
        
        results.push({
          task: task,
          success: true,
          value: value || ''
        });
      }
    } catch (error) {
      this.logger.error('[StreamProcessorV2] バッチ処理エラー:', error);
      
      // エラー時も結果を返す
      for (const task of batch) {
        results.push({
          task: task,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async processColumnsSequentially(initialTaskList, spreadsheetData, isTestMode) {
    this.logger.log('[StreamProcessorV2] 🚀 プロンプトグループごとの順次処理開始');
    
    // V3モードを使用するかチェック
    const useV3Mode = true;  // V3モードを使用
    const useDynamicQueue = false; // フラグで切り替え可能
    
    if (useV3Mode) {
      return await this.processGroupsSequentiallyV3(spreadsheetData, isTestMode);
    } else if (useDynamicQueue) {
      return await this.processWithDynamicQueue(spreadsheetData, isTestMode);
    }
    
    // 以下は既存のコード（フォールバック用）
    // 再チェックループの最大回数
    const MAX_ITERATIONS = 10;
    let iteration = 0;
    let hasNewTasks = true;
    let totalTasksProcessed = 0;
    
    // 新しいタスクがなくなるまでループ
    while (hasNewTasks && iteration < MAX_ITERATIONS) {
      iteration++;
      hasNewTasks = false;
      let iterationTaskCount = 0;
      
      this.logger.log(`[StreamProcessorV2] 🔄 処理ループ ${iteration}回目開始`);
      
      // ループごとにスプレッドシートデータを再読み込み（2回目以降）
      if (iteration > 1 && this.sheetsClient) {
        try {
          this.logger.log('[StreamProcessorV2] 📊 スプレッドシートデータを再読み込み中...');
          const updatedData = await this.sheetsClient.loadAutoAIData(
            spreadsheetData.spreadsheetId,
            spreadsheetData.gid
          );
          if (updatedData) {
            // 全体のデータ構造を更新
            Object.assign(spreadsheetData, updatedData);
            this.logger.log('[StreamProcessorV2] ✅ スプレッドシートデータ再読み込み完了');
          }
        } catch (error) {
          this.logger.error('[StreamProcessorV2] ❌ スプレッドシート再読み込みエラー:', error);
        }
      }
      
      // スプレッドシートからプロンプトグループ情報を再取得（構造も再解析）
      const promptGroups = this.getPromptGroups(spreadsheetData);
      this.logger.log(`[StreamProcessorV2] 📊 プロンプトグループ数: ${promptGroups.length}`);
      
      // taskGroups情報のデバッグ出力
      if (spreadsheetData.taskGroups) {
        this.logger.log(`[StreamProcessorV2] 📊 taskGroups情報:`, {
          totalGroups: spreadsheetData.taskGroups.length,
          groups: spreadsheetData.taskGroups.map(group => ({
            id: group.id,
            name: group.name,
            sequenceOrder: group.sequenceOrder,
            dependencies: group.dependencies
          }))
        });
      }
      
      // workRowsを取得（デバッグログ付き）
      this.logger.log(`[StreamProcessorV2] 🔍 workRows取得前...`);
      const workRows = this.getWorkRows(spreadsheetData);
      this.logger.log(`[StreamProcessorV2] 🔍 workRows取得後: ${workRows ? workRows.length : 'undefined'}件`);
      
      // 各プロンプトグループを順番に処理
      for (let groupIndex = 0; groupIndex < promptGroups.length; groupIndex++) {
        const promptGroup = promptGroups[groupIndex];
        
        this.logger.log(`[StreamProcessorV2] \n${'='.repeat(50)}`);
        this.logger.log(`[StreamProcessorV2] 📋 プロンプトグループ${groupIndex + 1}/${promptGroups.length}の処理開始（ループ${iteration}）`, {
          プロンプト列: promptGroup.promptColumns.map(i => this.indexToColumn(i)),
          回答列: promptGroup.answerColumns.map(col => col.column),
          AIタイプ: promptGroup.aiType
        });
        
        // このプロンプトグループのタスクを生成
        const groupTaskList = await this.taskGenerator.generateTasksForPromptGroup(
          spreadsheetData,
          groupIndex
        );
        
        if (!groupTaskList || groupTaskList.tasks.length === 0) {
          this.logger.log(`[StreamProcessorV2] グループ${groupIndex + 1}にタスクなし（すべて回答済み）`);
          continue;
        }
        
        // 新しいタスクが見つかった
        hasNewTasks = true;
        iterationTaskCount += groupTaskList.tasks.length;
        totalTasksProcessed += groupTaskList.tasks.length;
        
        this.logger.log(`[StreamProcessorV2] ✅ グループ${groupIndex + 1}のタスク生成完了: ${groupTaskList.tasks.length}個`);
        
        // スキップされたタスクの推定（デバッグログ付き）
        this.logger.log(`[StreamProcessorV2] 🔍 デバッグ: workRows=${workRows ? `${workRows.length}件` : 'undefined'}, answerColumns=${promptGroup.answerColumns ? promptGroup.answerColumns.length : 'undefined'}`);
        
        if (!workRows) {
          this.logger.error(`[StreamProcessorV2] ❌ エラー: workRowsが未定義です`);
          continue;
        }
        
        const expectedTasks = workRows.length * promptGroup.answerColumns.length;
        const actualTasks = groupTaskList.tasks.length;
        const skippedCount = expectedTasks - actualTasks;
        
        if (skippedCount > 0) {
          this.logger.log(`[StreamProcessorV2] 📊 グループ${groupIndex + 1}: ${skippedCount}個のセルは既存回答ありのためスキップされました`);
        }
        
        // タスクを列ごとにグループ化
        const columnGroups = this.organizeTasksByColumn(groupTaskList.tasks);
        
        // 3種類AIグループの場合は特別な処理
        const is3TypeAI = promptGroup.aiType.includes('3種類') || promptGroup.aiType.includes('３種類');
        
        if (is3TypeAI) {
          // 3種類AI: F,G,H列を3ウィンドウで同時処理
          await this.process3TypeAIGroup(columnGroups, isTestMode);
        } else {
          // 通常AI: 各列を順次処理（列内は3行バッチ並列）
          for (const [column, tasks] of columnGroups) {
            await this.processColumn(column, tasks, isTestMode);
          }
        }
        
        this.logger.log(`[StreamProcessorV2] ✅ プロンプトグループ${groupIndex + 1}の処理完了`);
        this.logger.log(`[StreamProcessorV2] ${'='.repeat(50)}\n`);
      }
      
      if (hasNewTasks) {
        this.logger.log(`[StreamProcessorV2] 🔄 ループ${iteration}完了、${iterationTaskCount}個のタスクを処理`);
        this.logger.log(`[StreamProcessorV2] 📊 累計処理タスク数: ${totalTasksProcessed}`);
        this.logger.log(`[StreamProcessorV2] 🔍 新しいタスクをチェックするため再ループします`);
      } else {
        this.logger.log(`[StreamProcessorV2] ✅ 新しいタスクがないため処理を終了します`);
        this.logger.log(`[StreamProcessorV2] 📊 総処理タスク数: ${totalTasksProcessed}`);
      }
    }
    
    if (iteration >= MAX_ITERATIONS) {
      this.logger.warn(`[StreamProcessorV2] ⚠️ 最大ループ回数（${MAX_ITERATIONS}回）に達しました`);
    }
    
    this.logger.log('[StreamProcessorV2] 🎉 全プロンプトグループの処理完了');
    this.logger.log(`[StreamProcessorV2] 📊 最終統計: ループ回数=${iteration}, 総タスク数=${totalTasksProcessed}`);
  }

  /**
   * 3種類AIグループを処理（F,G,H列を同時に3ウィンドウで処理）
   * @param {string} column - 対象列
   * @param {Object} promptGroup - プロンプトグループ情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Array} タスクの配列
   */
  async process3TypeAIGroup(columnGroups, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🎯 3種類AIグループの処理開始`);
    
    // F,G,H列のタスクを行ごとにまとめる
    const rowBatches = new Map();
    
    for (const [column, tasks] of columnGroups) {
      for (const task of tasks) {
        if (!rowBatches.has(task.row)) {
          rowBatches.set(task.row, []);
        }
        rowBatches.get(task.row).push(task);
      }
    }
    
    // 行番号順にソート
    const sortedRows = Array.from(rowBatches.keys()).sort((a, b) => a - b);
    
    // 各行のF,G,H列を3ウィンドウで同時処理
    for (const row of sortedRows) {
      const rowTasks = rowBatches.get(row);
      this.logger.log(`[StreamProcessorV2] 行${row}の3種類AI処理: ${rowTasks.map(t => t.column + t.row).join(', ')}`);
      
      // この行のタスクを並列処理（最大3ウィンドウ）
      await this.processBatch(rowTasks, isTestMode);
    }
    
    this.logger.log(`[StreamProcessorV2] ✅ 3種類AIグループの処理完了`);
  }


  /**
   * プロンプトグループ情報を取得
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Array} プロンプトグループの配列
   */
  getPromptGroups(spreadsheetData) {
    // TaskGeneratorV2の構造解析機能を利用
    const structure = this.taskGenerator.analyzeStructure(spreadsheetData);
    return structure.promptGroups || [];
  }

  /**
   * 作業行を取得
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Array} 作業行の配列
   */
  getWorkRows(spreadsheetData) {
    this.logger.log(`[StreamProcessorV2] 🔍 getWorkRows開始`);
    
    if (!this.taskGenerator) {
      this.logger.error(`[StreamProcessorV2] ❌ taskGeneratorが未定義です`);
      return [];
    }
    
    const structure = this.taskGenerator.analyzeStructure(spreadsheetData);
    
    if (!structure) {
      this.logger.error(`[StreamProcessorV2] ❌ analyzeStructureがnullを返しました`);
      return [];
    }
    
    const workRows = structure.workRows || [];
    this.logger.log(`[StreamProcessorV2] 🔍 getWorkRows完了: ${workRows.length}件`);
    
    return workRows;
  }

  /**
   * セル値を取得
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {number} rowIndex - 行インデックス（0-indexed）
   * @param {number} colIndex - 列インデックス（0-indexed）
   * @returns {string} セル値
   */
  getCellValue(spreadsheetData, rowIndex, colIndex) {
    if (!spreadsheetData?.values?.[rowIndex]) return '';
    return spreadsheetData.values[rowIndex][colIndex] || '';
  }

  /**
   * モデル情報を取得
   */
  getModel(spreadsheetData, answerCol, promptColumns) {
    return this.taskGenerator.getModel(spreadsheetData, answerCol, promptColumns);
  }

  /**
   * 機能情報を取得
   */
  getFunction(spreadsheetData, answerCol, promptColumns) {
    return this.taskGenerator.getFunction(spreadsheetData, answerCol, promptColumns);
  }

  /**
   * 列名からAIタイプを推定
   */
  getAITypeFromColumn(column) {
    // この実装は簡易版。実際のマッピングロジックに応じて調整必要
    if (column.includes('ChatGPT')) return 'chatgpt';
    if (column.includes('Claude')) return 'claude';
    if (column.includes('Gemini')) return 'gemini';
    return 'chatgpt'; // デフォルト
  }

  /**
   * タスクIDを生成
   */
  generateTaskId(column, row) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${column}${row}_${timestamp}_${random}`;
  }

  /**
   * 列名をインデックスに変換
   */
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 65) + 1;
    }
    return index - 1;
  }
}