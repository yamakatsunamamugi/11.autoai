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
import { RetryManager } from '../../utils/retry-manager.js';
import TaskGeneratorV2 from './generator-v2.js';
import { GroupCompletionChecker } from './group-completion-checker.js';
import { TaskWaitManager } from './task-wait-manager.js';
import { TaskGroupScanner } from './task-group-scanner.js';
import { ExclusiveControlManager } from '../../utils/exclusive-control-manager.js';
import { ExclusiveControlLoggerHelper } from '../../utils/exclusive-control-logger-helper.js';
import { sleep } from '../../utils/sleep-utils.js';
import EXCLUSIVE_CONTROL_CONFIG, { 
  getTimeoutForFunction, 
  getRetryIntervalForFunction 
} from '../../config/exclusive-control-config.js';
import { pcIdentifier } from '../../utils/pc-identifier.js';

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
  constructor(logger = console, config = {}) {
    this.logger = logger;
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.retryManager = new RetryManager(logger);
    this.taskGenerator = new TaskGeneratorV2(logger); // タスクジェネレータを追加
    this.completionChecker = new GroupCompletionChecker(this.retryManager, logger);
    this.waitManager = new TaskWaitManager(logger);
    this.windowService = WindowService; // WindowServiceへの参照を保持
    this.completedTasks = new Set();
    
    // 排他制御マネージャーを初期化
    this.exclusiveManager = new ExclusiveControlManager({
      controlConfig: {
        timeouts: EXCLUSIVE_CONTROL_CONFIG.timeouts,
        markerFormat: EXCLUSIVE_CONTROL_CONFIG.markerFormat,
        ...config.exclusiveControl
      },
      logger: this.logger
    });
    
    // 排他制御ログヘルパーを初期化
    this.exclusiveLoggerHelper = new ExclusiveControlLoggerHelper({
      logger: this.logger
    });
    
    // 設定を保存
    this.config = {
      exclusiveControl: EXCLUSIVE_CONTROL_CONFIG,
      ...config
    };
    this.failedTasks = new Set();
    this.writtenCells = new Map();
    this.spreadsheetData = null;
    this.spreadsheetLogger = null;
    this.dataProcessor = null; // SpreadsheetDataProcessorのインスタンス
    this.processedCells = new Set(); // セル単位で処理済みを追跡
    this.processedAnswerCells = new Set(); // 回答済みセルを追跡（重複処理防止）
    
    // 現在処理中のグループID
    this.currentGroupId = null;
    
    // 再実行管理状態（RetryManagerに移行済み）
    this.failedTasksByColumn = new Map(); // column -> Set<task> - 互換性のため残す
    this.retryCountByColumn = new Map(); // column -> retryCount
    this.retryTimers = new Map(); // column -> timer
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      retriesByColumn: new Map() // column -> { attempts: 0, successes: 0 }
    };
    
    // SpreadsheetLoggerは processTaskStream で初期化する
    this.initializeDataProcessor();
    
    // 排他制御のイベントフックを設定
    this.setupExclusiveControlHooks();
    
    // タスクスキャナーは簡易初期化（メソッドは使用時に渡す）
    this.taskScanner = new TaskGroupScanner({
      logger: this.logger,
      exclusiveManager: this.exclusiveManager,
      waitManager: this.waitManager,
      processedAnswerCells: this.processedAnswerCells
    });
  }

  /**
   * SpreadsheetDataProcessorを初期化
   */
  initializeDataProcessor() {
    try {
      // ブラウザ環境でのみSpreadsheetDataProcessorをロード
      if (typeof window !== 'undefined') {
        // ブラウザ環境：SpreadsheetDataProcessorをスクリプトとして動的ロード
        if (!window.SpreadsheetDataProcessor) {
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('src/features/spreadsheet/data-processor.js');
          document.head.appendChild(script);
          
          script.onload = () => {
            this.dataProcessor = new window.SpreadsheetDataProcessor(this.logger);
          };
        } else {
          this.dataProcessor = new window.SpreadsheetDataProcessor(this.logger);
        }
      } else {
        // Node.js環境（background.js）：フォールバック機能を提供
        this.dataProcessor = null; // 後で必要に応じて初期化
      }
    } catch (error) {
      this.logger.error('[StreamProcessorV2] DataProcessor初期化エラー:', error);
      this.dataProcessor = null;
    }
  }
  
  /**
   * SpreadsheetLoggerを非同期で初期化
   */
  async initializeSpreadsheetLogger() {
    try {
      const LoggerClass = await getSpreadsheetLogger();
      if (LoggerClass) {
        this.spreadsheetLogger = globalThis.spreadsheetLogger || new LoggerClass(this.logger);
        if (!globalThis.spreadsheetLogger) {
          globalThis.spreadsheetLogger = this.spreadsheetLogger;
        }
        
        // ヘルパーの設定を更新
        this.exclusiveLoggerHelper.updateConfig({
          spreadsheetLogger: this.spreadsheetLogger,
          spreadsheetData: this.spreadsheetData,
          sheetsClient: globalThis.sheetsClient
        });
      }
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] SpreadsheetLogger初期化エラー:`, error);
    }
  }

  /**
   * 排他制御のイベントフックを設定
   */
  setupExclusiveControlHooks() {
    // ロック取得時にSpreadsheetLoggerに記録
    this.exclusiveManager.on('afterAcquire', async (eventData) => {
      try {
        await this.exclusiveLoggerHelper.logLockAcquired(eventData);
      } catch (error) {
        this.logger.error('[StreamProcessorV2] 排他制御ログ記録エラー:', error);
      }
    });

    // 排他制御ログは無効化 - StreamProcessorV2で統一管理
    // this.exclusiveManager.on('afterRelease', async (eventData) => {
    //   try {
    //     await this.exclusiveLoggerHelper.logLockReleased(eventData);
    //   } catch (error) {
    //     this.logger.error('[StreamProcessorV2] 排他制御ログ記録エラー:', error);
    //   }
    // });

    // タイムアウト時にSpreadsheetLoggerに記録
    this.exclusiveManager.on('timeout', async (eventData) => {
      try {
        await this.exclusiveLoggerHelper.logTimeout(eventData);
      } catch (error) {
        this.logger.error('[StreamProcessorV2] 排他制御タイムアウトログ記録エラー:', error);
      }
    });
    
    // ロック取得拒否時にSpreadsheetLoggerに記録
    this.exclusiveManager.on('lockDenied', async (eventData) => {
      try {
        await this.exclusiveLoggerHelper.logLockDenied(eventData);
      } catch (error) {
        this.logger.error('[StreamProcessorV2] 排他制御拒否ログ記録エラー:', error);
      }
    });
    
    // エラー時にSpreadsheetLoggerに記録
    this.exclusiveManager.on('acquireError', async (eventData) => {
      try {
        await this.exclusiveLoggerHelper.logError(eventData);
      } catch (error) {
        this.logger.error('[StreamProcessorV2] 排他制御エラーログ記録エラー:', error);
      }
    });

    // 排他制御マネージャーにSpreadsheetLogger参照を設定
    this.exclusiveManager.spreadsheetLogger = this.spreadsheetLogger;
  }

  /**
   * タスクストリームを処理（3行バッチ並列処理）
   * @param {TaskList} taskList - タスクリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 実行結果
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    this.spreadsheetData = spreadsheetData;
    this.spreadsheetUrl = spreadsheetData?.spreadsheetUrl; // spreadsheetUrlを保存
    
    // 動的モードの場合はタスクグループから処理
    if (options.dynamicMode && !taskList) {
      this.logger.log('[StreamProcessorV2] 動的モードでタスクグループ処理を開始');
      return await this.processDynamicTaskGroups(spreadsheetData, options);
    }
    
    
    // 通常モード：タスクリストが空の場合は早期リターン
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
    const isTestMode = options.testMode || false;
    const startTime = Date.now();
    
    // SpreadsheetLoggerを初期化
    await this.initializeSpreadsheetLogger();
    
    // SpreadsheetLogger初期化後に排他制御マネージャーを更新
    this.exclusiveManager.spreadsheetLogger = this.spreadsheetLogger;
    
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
      await globalThis.powerManager.startProtection('stream-processor-v2');
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

      return result;

    } catch (error) {
      this.logger.error('[StreamProcessorV2] processTaskStream error:', error);
      throw error;
    } finally {
      // スリープ防止を解除
      if (globalThis.powerManager) {
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
    
    // リトライ処理は削除（グループ完了時に移動）
    // 列処理完了をログ
    this.logger.log(`[StreamProcessorV2] 🎉 ${column}列の処理完了`, {
      completedTasks: tasks.length
    });
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
   * バッチ処理を実行（最大3つのタスクを並列処理）
   * 
   * 【処理フロー】
   * 1. フェーズ1: ウィンドウ準備とテキスト入力
   *    - 3つのウィンドウを同時に開く（左、中央、右の位置）
   *    - 各ウィンドウにプロンプトを入力
   * 
   * 2. フェーズ2: モデル選択（並列実行）
   *    - 全ウィンドウで同時にモデル選択を実行
   *    - Promise.allSettledで並列処理
   * 
   * 3. フェーズ3: 機能選択（並列実行）
   *    - 全ウィンドウで同時に機能選択を実行
   *    - Promise.allSettledで並列処理
   * 
   * 4. フェーズ4: 5秒間隔で順次送信
   *    - タスク1送信 → 5秒待機
   *    - タスク2送信 → 5秒待機
   *    - タスク3送信
   * 
   * @param {Array} batch - 処理するタスク配列（最大3つ）
   * @param {boolean} isTestMode - テストモードフラグ
   * @returns {Promise<void>}
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
      // 並列パイプライン: ウィンドウ作成→モデル選択→機能選択を同時実行
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 並列パイプライン開始: ウィンドウ作成→モデル→機能選択（完全並列）`);


      // 各タスクの完全パイプライン関数を定義
      const setupCompleteTask = async (task, index) => {
        const position = index; // 0: 左上、1: 右上、2: 左下
        let currentTabId = null;
        
        try {
          
          // AI/モデル/機能を動的に取得
          const { model, function: func, ai } = await this.fetchModelAndFunctionFromTask(task);
          task.model = model;
          task.function = func;
          task.aiType = ai;
          
          this.logger.log(`[StreamProcessorV2] パイプライン ${index + 1}/${batch.length} 開始: ${task.column}${task.row} (${ai})`);
          
          // 排他制御ロック取得
          const lockResult = await this.exclusiveManager.acquireLock(
            task,
            globalThis.sheetsClient,
            {
              spreadsheetId: this.spreadsheetData?.spreadsheetId,
              gid: this.spreadsheetData?.gid,
              strategy: 'smart'
            }
          );
          
          if (!lockResult.success) {
            skippedCells.push(`${task.column}${task.row}`);
            return { success: false, reason: lockResult.reason, index };
          }
          
          // ステップ1: ウィンドウ作成
          currentTabId = await this.createWindowForTask(task, position);
          if (!currentTabId) {
            return { success: false, error: 'ウィンドウ作成失敗', index };
          }
          
          // ステップ2: スクリプト注入
          await this.delay(2000); // ページ読み込み待機
          
          const injectionResult = await this.injectScriptsForTab(currentTabId, task.aiType);
          if (!injectionResult) {
            throw new Error('スクリプト注入失敗');
          }
          
          await this.delay(1000);
          
          // ステップ3: モデル選択
          this.logger.log(`[StreamProcessorV2] モデル選択: ${task.column}${task.row} - ${model}`);
          const modelResult = await this.executePhaseOnTab(currentTabId, task, 'model');
          if (!modelResult || modelResult.success === false) {
            throw new Error('モデル選択失敗');
          }
          
          task.displayedModel = modelResult.displayedModel || model || 'デフォルト';
          await this.delay(1000);
          
          // ステップ4: 機能選択
          this.logger.log(`[StreamProcessorV2] 機能選択: ${task.column}${task.row} - ${func}`);
          
          const functionResult = await this.executePhaseOnTab(currentTabId, task, 'function');
          if (!functionResult || functionResult.success === false) {
            throw new Error('機能選択失敗');
          }
          
          task.displayedFunction = functionResult.displayedFunction || func || '通常';
          await this.delay(1000);
          
          // ステップ5: テキスト入力
          this.logger.log(`[StreamProcessorV2] テキスト入力: ${task.column}${task.row}`);
          const prompt = await this.fetchPromptFromTask(task);
          if (!prompt || prompt.trim() === '') {
            throw new Error('プロンプト取得失敗');
          }
          
          const textResult = await this.executePhaseOnTab(currentTabId, { ...task, prompt }, 'text');
          if (!textResult || !textResult.success) {
            throw new Error('テキスト入力失敗');
          }
          await this.delay(1000);
          
          // ステップ6: 送信と応答取得（非同期で開始）
          this.logger.log(`[StreamProcessorV2] 送信開始: ${task.column}${task.row}`);
          
          // 送信時刻を記録
          if (this.spreadsheetLogger) {
            this.spreadsheetLogger.recordSendTime(task.id, {
              aiType: task.aiType,
              model: task.model
            });
          }
          
          // 送信実行（応答待機は非同期で継続）
          const sendPromise = this.executePhaseOnTab(currentTabId, { ...task, prompt }, 'send').then(async sendResult => {
            if (!sendResult || !sendResult.success) {
              throw new Error('送信失敗');
            }
            
            // 応答取得処理（sendResultに含まれている）
            this.logger.log(`[StreamProcessorV2] 応答取得完了: ${task.column}${task.row}`);
            
            if (sendResult && sendResult.response) {
              this.completedTasks.add(task.id);
              this.writtenCells.set(`${task.column}${task.row}`, sendResult.response);
              
              // スプレッドシートに書き込み
              if (this.spreadsheetData) {
                const { spreadsheetId, gid } = this.spreadsheetData;
                const range = `${task.column}${task.row}`;
                
                try {
                  const releaseResult = await this.exclusiveManager.releaseLock(
                    task,
                    sendResult.response,
                    globalThis.sheetsClient,
                    {
                      spreadsheetId: spreadsheetId,
                      gid: gid
                    }
                  );
                  
                  if (releaseResult.success) {
                    this.logger.log(`[StreamProcessorV2] ✅ ${range}に応答を書き込み成功`);
                    this.processedAnswerCells.add(range);
                  }
                } catch (writeError) {
                  this.logger.error(`[StreamProcessorV2] ❌ ${range}への書き込みエラー:`, writeError);
                }
              }
            }
            
            return sendResult;
          }).catch(error => {
            this.logger.error(`[StreamProcessorV2] 送信/応答エラー: ${task.column}${task.row}`, error);
            return { success: false, error: error.message };
          });
          
          // 送信を開始したらすぐに次のタスクへ（応答待機は並列で継続）
          this.logger.log(`[StreamProcessorV2] ✅ パイプライン完了（応答待機は継続）: ${task.column}${task.row}`);
          
          return {
            success: true,
            task: { ...task, prompt },
            tabId: currentTabId,
            position: index,
            cell: `${task.column}${task.row}`,
            index,
            responsePromise: sendPromise
          };
          
        } catch (error) {
          this.logger.error(`[StreamProcessorV2] ❌ パイプラインエラー: ${task.column}${task.row}`, error);
          
          // クリーンアップ
          if (currentTabId) {
            try {
              await this.windowService.closeWindow(currentTabId);
            } catch (cleanupError) {
              this.logger.error(`[StreamProcessorV2] クリーンアップエラー:`, cleanupError);
            }
          }
          
          return { success: false, error: error.message, index };
        }
      };
      
      // 全パイプラインを順次実行
      this.logger.log(`[StreamProcessorV2] 🚀 ${batch.length}個のパイプラインを順次実行中...`);
      const pipelineResults = [];
      const responsePromises = [];
      
      for (let index = 0; index < batch.length; index++) {
        const result = await setupCompleteTask(batch[index], index);
        pipelineResults.push({ status: 'fulfilled', value: result });
        
        // 応答待機Promiseを保存（後で並列待機）
        if (result.success && result.responsePromise) {
          responsePromises.push(result.responsePromise);
        }
      }
      
      // パイプライン結果の処理
      const successfulTasks = [];
      const failedTasks = [];
      
      pipelineResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          const taskContext = result.value;
          taskContexts.push(taskContext);
          successfulTasks.push(taskContext.cell);
          this.logger.log(`[StreamProcessorV2] ✅ パイプライン成功: ${taskContext.cell}`);
        } else {
          const task = batch[index];
          const error = result.status === 'fulfilled' ? result.value.error || result.value.reason : result.reason;
          failedTasks.push(`${task.column}${task.row}`);
          this.logger.log(`[StreamProcessorV2] スキップ: ${task.column}${task.row} - ${error}`);
        }
      });
      
      // スキップされたセルをまとめてログ出力
      if (skippedCells.length > 0) {
        const ranges = this.formatCellRanges(skippedCells);
        this.logger.log(`[StreamProcessorV2] 📊 既存回答ありでスキップ: ${ranges} (計${skippedCells.length}セル)`);
      }
      
      this.logger.log(`[StreamProcessorV2] 📊 順次パイプライン完了: 成功 ${successfulTasks.length}件, 失敗 ${failedTasks.length}件`);
      
      // ========================================
      // 応答待機（並列処理）
      // ========================================
      if (responsePromises.length > 0) {
        this.logger.log(`[StreamProcessorV2] 📋 ${responsePromises.length}個の応答を並列待機中...`);
        await Promise.allSettled(responsePromises);
        this.logger.log(`[StreamProcessorV2] ✅ 全応答処理完了`);
      }
      
      // 送信処理はsetupCompleteTask内で実行済み
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
    return sleep(ms);
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
          throw new Error(`Script injection failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // リトライ前に待機
        await this.delay(3000);
      }
    }
    return false;
  }

  /**
   * スクリプト注入のコア処理
   * @private
   */
  async _injectScriptsCore(tabId, aiType) {
    const startTime = Date.now();
    
    this.logger.log(`[StreamProcessorV2] 📦 ${aiType}用スクリプト注入開始 (タブ: ${tabId})`);
    
    // AIタイプの判定
    const aiTypeLower = aiType ? aiType.toLowerCase() : 'chatgpt';
    
    // 注入するスクリプトをAIタイプに応じて決定
    let scriptPaths = [];
    
    if (aiTypeLower === 'claude') {
      scriptPaths = [
        'src/config/ui-selectors.js',
        'automations/common-ai-handler.js',
        'automations/claude-automation.js'
      ];
    } else if (aiTypeLower === 'chatgpt') {
      scriptPaths = [
        'src/config/ui-selectors.js',
        'automations/common-ai-handler.js',
        'automations/chatgpt-automation.js'
      ];
    } else if (aiTypeLower === 'gemini') {
      scriptPaths = [
        'src/config/ui-selectors.js',
        'automations/common-ai-handler.js',
        'automations/gemini-automation.js'
      ];
    } else {
      throw new Error(`Unsupported AI type: ${aiType}`);
    }
    
    // スクリプトを順番に注入
    for (const scriptPath of scriptPaths) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [scriptPath],
          world: 'MAIN'
        });
        this.logger.log(`[StreamProcessorV2] ✅ スクリプト注入成功: ${scriptPath}`);
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] ❌ スクリプト注入失敗: ${scriptPath}`, error);
        throw error;
      }
    }
    
    const elapsed = Date.now() - startTime;
    this.logger.log(`[StreamProcessorV2] ✨ 全スクリプト注入完了 (${elapsed}ms)`);
    
    return { success: true };
  }

  /**
   * ページ要素の検証
   */
  async validatePageElements(tabId, aiType) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (aiType) => {
          // 基本的なDOM要素の存在確認
          const aiTypeLower = aiType.toLowerCase();
          
          if (aiTypeLower === 'claude') {
            return {
              hasTextarea: !!document.querySelector('div[contenteditable="true"]'),
              hasInterface: !!document.querySelector('main')
            };
          } else if (aiTypeLower === 'chatgpt') {
            return {
              hasTextarea: !!document.querySelector('textarea'),
              hasInterface: !!document.querySelector('main')
            };
          } else if (aiTypeLower === 'gemini') {
            return {
              hasTextarea: !!document.querySelector('rich-textarea'),
              hasInterface: !!document.querySelector('main')
            };
          }
          
          return { hasTextarea: false, hasInterface: false };
        },
        args: [aiType]
      });
      
      if (result && result[0] && result[0].result) {
        const validation = result[0].result;
        this.logger.log(`[StreamProcessorV2] ページ要素検証:`, validation);
        return validation.hasTextarea && validation.hasInterface;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ページ要素検証エラー:`, error);
      return false;
    }
  }

  /**
   * createWindowForTask
   */
  async createWindowForTask(task, positionIndex) {
    try {
      const aiType = task.aiType || 'chatgpt';
      const url = this.getAIUrl(aiType);
      
      // ウィンドウ位置を決定
      const positions = [
        { left: 0, top: 0, width: 960, height: 540 },     // 左上
        { left: 960, top: 0, width: 960, height: 540 },   // 右上
        { left: 0, top: 540, width: 960, height: 540 }    // 左下
      ];
      
      const position = positions[positionIndex] || positions[0];
      
      // ウィンドウを作成
      const window = await chrome.windows.create({
        url: url,
        type: 'normal',
        state: 'normal',
        ...position
      });
      
      if (window && window.tabs && window.tabs[0]) {
        const tabId = window.tabs[0].id;
        this.logger.log(`[StreamProcessorV2] ✅ ウィンドウ作成成功: ${task.column}${task.row} (TabID: ${tabId})`);
        return tabId;
      }
      
      throw new Error('ウィンドウ作成失敗');
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ❌ ウィンドウ作成エラー:`, error);
      return null;
    }
  }
  
  /**
   * AIタイプに応じたURLを取得
   */
  getAIUrl(aiType) {
    const urls = {
      'claude': 'https://claude.ai/new',
      'chatgpt': 'https://chatgpt.com/',
      'gemini': 'https://gemini.google.com/app'
    };
    return urls[aiType.toLowerCase()] || urls['chatgpt'];
  }
  
  /**
   * タスクからモデルと機能を取得
   */
  async fetchModelAndFunctionFromTask(task) {
    // タスクから直接取得するか、デフォルト値を返す
    return {
      model: task.model || 'Auto',
      function: task.function || '通常',
      ai: task.aiType || 'chatgpt'
    };
  }
  
  /**
   * タスクからプロンプトを取得
   */
  async fetchPromptFromTask(task) {
    return task.prompt || task.text || '';
  }
  
  /**
   * executePhaseOnTab
   * @param {number} tabId - タブID
   * @param {Object} task - タスクオブジェクト
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
                try {
                  const result = await automation.selectModelOnly(model);
                  return result;
                } catch (error) {
                  console.error(`❌ Model selection error:`, error);
                  return { success: false, error: error.message || 'Model selection failed' };
                }
              }
              
              return { success: false, error: `${aiType} automation not found or selectModelOnly not supported` };
            },
            args: [task.model, aiType]
          });
          break;
          
        case 'function':
          // 機能選択のみ実行
          result = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (functionName, aiType) => {
              // AIタイプに応じたAutomationオブジェクトを取得
              const automationMap = {
                'claude': ['ClaudeAutomationV2', 'ClaudeAutomation'],
                'chatgpt': ['ChatGPTAutomationV2', 'ChatGPTAutomation'],
                'gemini': ['GeminiAutomation']
              };
              
              const possibleNames = automationMap[aiType.toLowerCase()] || [];
              const automationName = possibleNames.find(name => window[name] !== undefined);
              const automation = automationName ? window[automationName] : null;
              
              if (automation && automation.selectFunctionOnly) {
                try {
                  const result = await automation.selectFunctionOnly(functionName);
                  return result;
                } catch (error) {
                  console.error(`❌ Function selection error:`, error);
                  return { success: false, error: error.message || 'Function selection failed' };
                }
              }
              
              return { success: false, error: `${aiType} automation not found or selectFunctionOnly not supported` };
            },
            args: [task.function, aiType]
          });
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
      if (result && result[0]) {
        const finalResult = result[0].result;
        if (finalResult && typeof finalResult === 'object' && finalResult.hasOwnProperty('success')) {
          return finalResult;
        } else {
          return { success: false, error: 'Invalid result format', rawResult: finalResult };
        }
      }
      
      return { success: false, error: 'No result returned' };
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] executePhaseOnTab error (${phase}):`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 列を順次処理
   */
  async processColumnsSequentially(taskList, spreadsheetData, isTestMode) {
    const columnGroups = this.organizeTasksByColumn(taskList.tasks);
    
    // 列ごとに順次処理
    for (const [column, tasks] of columnGroups) {
      await this.processColumn(column, tasks, isTestMode);
    }
    
    return {
      success: true
    };
  }

  /**
   * 列インデックスを列名に変換
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
   * 列名を列インデックスに変換
   */
  columnToIndex(column) {
    if (typeof column !== 'string' || column.length === 0) {
      return 0;
    }
    
    let index = 0;
    const upperColumn = column.toUpperCase();
    
    for (let i = 0; i < upperColumn.length; i++) {
      index = index * 26 + (upperColumn.charCodeAt(i) - 64);
    }
    
    return index - 1;
  }

  /**
   * formatCellRanges
   */
  formatCellRanges(cells) {
    // セルを列ごとにグループ化
    const columnMap = {};
    cells.forEach(cell => {
      const match = cell.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const [, column, row] = match;
        if (!columnMap[column]) {
          columnMap[column] = [];
        }
        columnMap[column].push(parseInt(row));
      }
    });
    
    // 各列の行を範囲にまとめる
    const ranges = [];
    Object.keys(columnMap).sort().forEach(column => {
      const rows = columnMap[column].sort((a, b) => a - b);
      let start = rows[0];
      let end = rows[0];
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] === end + 1) {
          end = rows[i];
        } else {
          ranges.push(start === end ? `${column}${start}` : `${column}${start}:${column}${end}`);
          start = rows[i];
          end = rows[i];
        }
      }
      ranges.push(start === end ? `${column}${start}` : `${column}${start}:${column}${end}`);
    });
    
    return ranges.join(', ');
  }
}