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
    this.dataProcessor = null; // SpreadsheetDataProcessorのインスタンス
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
    this.initializeDataProcessor();
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
      // フェーズ1: 全ウィンドウを開いてテキスト入力
      // ========================================
      this.logger.log(`[StreamProcessorV2] 📋 フェーズ1: ウィンドウ準備とテキスト入力`);
      
      // バッチ内のすべての既存回答を同期チェック（高速化）
      const answerResults = batch.map(task => ({ 
        task, 
        answer: this.getCurrentAnswer(task) 
      }));
      
      for (let index = 0; index < batch.length; index++) {
        const task = batch[index];
        const position = index; // 0: 左上、1: 右上、2: 左下
        
        // 既存回答チェック（事前に取得済みの結果を使用）
        const existingAnswer = answerResults[index].answer;
        if (existingAnswer && existingAnswer.trim() !== '') {
          // 「現在操作中です」マーカーがある場合は他PCが作業中
          if (existingAnswer === '現在操作中です') {
            skippedCells.push(`${task.column}${task.row}`);
            this.logger.log(`[StreamProcessorV2] 🔒 ${task.column}${task.row}: 他PCが作業中のためスキップ`);
            continue;
          }
          // 既に完成した回答がある場合
          skippedCells.push(`${task.column}${task.row}`);
          // タスクを完了扱いにして次へ
          this.completedTasks.add(task.id);
          this.writtenCells.set(`${task.column}${task.row}`, existingAnswer);
          continue;
        }
        
        // 回答がない場合、排他制御マーカーを設定
        try {
          const { spreadsheetId, gid } = this.spreadsheetData || {};
          if (spreadsheetId && globalThis.sheetsClient) {
            await globalThis.sheetsClient.updateCell(
              spreadsheetId,
              `${task.column}${task.row}`,
              '現在操作中です',
              gid
            );
            this.logger.log(`[StreamProcessorV2] 🔒 ${task.column}${task.row}: 排他制御マーカー設定`);
          }
        } catch (lockError) {
          this.logger.error(`[StreamProcessorV2] ❌ ${task.column}${task.row}: マーカー設定失敗`, lockError);
          // マーカー設定に失敗しても処理は継続（リトライ機能があるため）
        }
        
        this.logger.log(`[StreamProcessorV2] ウィンドウ${index + 1}/${batch.length}を準備: ${task.column}${task.row}`);
        
        // AI/モデル/機能を動的に取得（ウィンドウ作成前に）
        // 常に最新データを取得（キャッシュは使用しない）
        const { model, function: func, ai } = await this.fetchModelAndFunctionFromTask(task);
        task.model = model;
        task.function = func;
        task.aiType = ai;
        
        this.logger.log(`[StreamProcessorV2] 📊 動的取得（ウィンドウ作成前）:`, {
          cell: `${task.column}${task.row}`,
          AI: ai,
          モデル: model,
          機能: func
        });
        
        // ウィンドウを作成
        const tabId = await this.createWindowForTask(task, position);
        if (!tabId) {
          throw new Error(`Failed to create window for ${task.aiType}`);
        }
        
        // プロンプトを取得（個別セルから直接取得）
        const prompt = await this.fetchPromptFromTask(task);
        
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
              // Service Worker環境では動的インポートが禁止されているため、既存のwindowServiceを使用
              if (this.windowService) {
                await this.windowService.closeWindow(currentTabId);
                this.windowService.releasePosition(position);
              } else {
                console.warn('[StreamProcessorV2] WindowServiceが利用できません - ウィンドウクリーンアップをスキップ');
              }
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
        
        // プロンプト取得状況をログ出力（詳細なプロンプト内容は表示しない）
        this.logger.log(`[StreamProcessorV2] プロンプト取得完了: ${task.column}${task.row}`, {
          プロンプト長: prompt ? prompt.length : 0,
          有効性: !!prompt
        });
        
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
            // WindowServiceは既にimportされているため、直接使用
            await this.windowService.closeWindow(currentTabId);
            this.windowService.releasePosition(position);
            
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
                // エラー時のクリーンアップ: 「現在操作中です」マーカーを削除
                try {
                  await globalThis.sheetsClient?.updateCell(
                    spreadsheetId,
                    `${task.column}${task.row}`,
                    '',  // マーカーをクリア
                    gid
                  );
                  this.logger.log(`[StreamProcessorV2] 🧹 エラークリーンアップ: ${task.column}${task.row}のマーカーを削除`);
                } catch (cleanupError) {
                  this.logger.error(`[StreamProcessorV2] クリーンアップエラー:`, cleanupError);
                }
                taskContexts.pop(); // 失敗したタスクを削除
                continue;
              }
            } else {
              this.logger.error(`[StreamProcessorV2] ❌ ウィンドウ再作成失敗 - タスクをスキップ`);
              // エラー時のクリーンアップ: 「現在操作中です」マーカーを削除
              try {
                await globalThis.sheetsClient?.updateCell(
                  spreadsheetId,
                  `${task.column}${task.row}`,
                  '',  // マーカーをクリア
                  gid
                );
                this.logger.log(`[StreamProcessorV2] 🧹 エラークリーンアップ: ${task.column}${task.row}のマーカーを削除`);
              } catch (cleanupError) {
                this.logger.error(`[StreamProcessorV2] クリーンアップエラー:`, cleanupError);
              }
              taskContexts.pop();
              continue;
            }
          } catch (error) {
            this.logger.error(`[StreamProcessorV2] ウィンドウ再作成エラー:`, error);
            // エラー時のクリーンアップ: 「現在操作中です」マーカーを削除
            try {
              await globalThis.sheetsClient?.updateCell(
                spreadsheetId,
                `${task.column}${task.row}`,
                '',  // マーカーをクリア
                gid
              );
              this.logger.log(`[StreamProcessorV2] 🧹 エラークリーンアップ: ${task.column}${task.row}のマーカーを削除`);
            } catch (cleanupError) {
              this.logger.error(`[StreamProcessorV2] クリーンアップエラー:`, cleanupError);
            }
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
        
        // モデル、機能、AIを動的に取得（常に最新データ）
        const { model, function: func, ai } = await this.fetchModelAndFunctionFromTask(context.task);
        context.task.model = model;
        context.task.function = func;
        context.task.aiType = ai;
        
        // スプレッドシートから取得したデータを詳細ログ出力
        this.logger.log(`[StreamProcessorV2] 📊 スプレッドシートから取得:`, {
          cell: context.cell,
          AI: ai,
          モデル: model,
          機能: func,
          promptColumns: context.task.promptColumns,
          '元のtask.aiType': context.task.aiType,
          'aiTypeの変更': context.task.aiType !== ai ? `${context.task.aiType} → ${ai}` : '変更なし'
        });
        
        let modelSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!modelSuccess && retryCount < maxRetries) {
          try {
            // モデル選択を実行
            const modelResult = await this.executePhaseOnTab(context.tabId, context.task, 'model');
            
            if (modelResult && modelResult.success !== false) {
              // displayedModelを必ず設定（値がない場合はモデル名またはデフォルト値を使用）
              context.task.displayedModel = modelResult.displayedModel || context.task.model || 'デフォルト';
              this.logger.log(`[StreamProcessorV2] ✅ モデル選択成功: "${context.task.model}" (空文字: ${context.task.model === ''}) → "${context.task.displayedModel}"`);
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
          // displayedFunctionを必ず設定（値がない場合は機能名またはデフォルト値を使用）
          context.task.displayedFunction = retryResult.result.displayedFunction || context.task.function || '通常';
          this.logger.log(`[StreamProcessorV2] ✅ 選択された機能を記録: "${context.task.function}" (空文字: ${context.task.function === ''}) → "${context.task.displayedFunction}"`);
          
          // 特殊機能の場合の追加ログ
          if (isSpecialFunction) {
            this.logger.log(`[StreamProcessorV2] 🎨 特殊機能「${context.task.function}」の選択完了 - 送信フェーズへ進みます`);
          }
        } else {
          // 失敗しても機能名を設定
          context.task.displayedFunction = context.task.function || '通常';
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
              // 「現在操作中です」マーカーを削除して実際の回答を書き込み
              const writeResult = await globalThis.sheetsClient?.updateCell(
                spreadsheetId,
                range,
                result.response,
                gid
              );
              
              if (writeResult) {
                this.logger.log(`[StreamProcessorV2] ✅ ${range}に応答を書き込み成功（排他制御解除）`);
              } else {
                this.logger.error(`[StreamProcessorV2] ❌ ${range}への書き込み結果が不明`);
              }
            } catch (writeError) {
              this.logger.error(`[StreamProcessorV2] ❌ ${range}への書き込みエラー:`, writeError);
              // エラー時も排他制御をクリア
              try {
                await globalThis.sheetsClient?.updateCell(
                  spreadsheetId,
                  range,
                  '',  // 空文字でマーカーをクリア
                  gid
                );
                this.logger.log(`[StreamProcessorV2] 🔓 ${range}: エラー時の排他制御クリア`);
              } catch (clearError) {
                this.logger.error(`[StreamProcessorV2] ❌ ${range}: 排他制御クリア失敗`, clearError);
              }
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
                  spreadsheetData: this.spreadsheetData, // スプレッドシートデータを追加
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
          // 応答取得失敗時は排他制御をクリア
          try {
            const { spreadsheetId, gid } = this.spreadsheetData || {};
            if (spreadsheetId && globalThis.sheetsClient) {
              await globalThis.sheetsClient.updateCell(
                spreadsheetId,
                context.cell,
                '',  // 空文字でマーカーをクリア
                gid
              );
              this.logger.log(`[StreamProcessorV2] 🔓 ${context.cell}: 失敗時の排他制御クリア`);
            }
          } catch (clearError) {
            this.logger.error(`[StreamProcessorV2] ❌ ${context.cell}: 排他制御クリア失敗`, clearError);
          }
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
      
      // AI固有のスクリプト（aiTypeが空の場合はデフォルトでchatgptを使用）
      const finalAiType = aiTypeLower || 'chatgpt';
      const aiScript = v2ScriptMap[finalAiType] || `automations/${finalAiType}-automation.js`;
      
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
      this.logger.log(`[StreamProcessorV2] ✅ スクリプト注入完了 (${elapsedTime}ms)`, {
        aiType: aiType,
        注入したスクリプト数: scriptsToInject.length,
        スクリプト: scriptsToInject
      });
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
                  
                  // Geminiの場合、成功判定を調整（Canvasなど特殊な機能名でも成功とする）
                  if (aiType.toLowerCase() === 'gemini' && functionName) {
                    const specialFunctions = ['Canvas', 'Deep Research', 'DeepResearch', 'DeepReserch'];
                    if (specialFunctions.some(f => functionName.includes(f))) {
                      if (!result.success) {
                        return { success: true, warning: '機能選択状態の確認ができませんでしたが、処理を続行します' };
                      }
                    }
                  }
                  
                  return result;
                } catch (error) {
                  console.error(`Function selection error:`, error);
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
              spreadsheetData: this.spreadsheetData, // スプレッドシートデータを追加
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
        const currentAnswer = this.getCurrentAnswer(task);
        
        if (!currentAnswer || currentAnswer.trim() === '') {
          tasksToReprocess.push(task);
        } else {
          skippedCells.push(`${task.column}${task.row}`);
        }
        
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
   * タスクの現在の回答を既取得データから取得（高速化）
   */
  getCurrentAnswer(task) {
    try {
      if (!this.spreadsheetData?.values) {
        this.logger.warn(`[StreamProcessorV2] スプレッドシートデータが無効です`);
        return '';
      }
      
      const rowIndex = task.row - 1; // 0ベースに変換
      const columnIndex = task.columnIndex || this.columnToIndex(task.column);
      
      // 配列の範囲チェック
      if (rowIndex < 0 || rowIndex >= this.spreadsheetData.values.length) {
        this.logger.log(`[StreamProcessorV2] 📊 ${task.column}${task.row}: 行範囲外`);
        return '';
      }
      
      const row = this.spreadsheetData.values[rowIndex];
      if (!row || columnIndex >= row.length) {
        this.logger.log(`[StreamProcessorV2] 📊 ${task.column}${task.row}: 回答なし`);
        return '';
      }
      
      const value = row[columnIndex];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        this.logger.log(`[StreamProcessorV2] 📊 ${task.column}${task.row}の既存回答: "${value.substring(0, 50)}..."`);
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
   * @param {number} retryCount - リトライ回数（デフォルト: 0）
   */
  async createWindowForTask(task, position = 0, retryCount = 0) {
    const maxRetries = 2; // 最大リトライ回数
    
    try {
      // デバッグ：タスクのAI情報を詳細出力
      this.logger.log(`[DEBUG] createWindowForTask - タスクAI情報:`, {
        'task.aiType': task.aiType,
        'task.column': task.column,
        'task.row': task.row,
        'task.multiAI': task.multiAI,
        'task.groupType': task.groupType,
        'タスク生成時aiType': task.originalAiType || '未記録'
      });
      
      // AIタイプを正規化（ChatGPT → chatgpt, Claude → claude, Gemini → gemini）
      const normalizedAIType = this.normalizeAIType(task.aiType);
      
      this.logger.log(`[DEBUG] AI正規化結果:`, {
        'input': task.aiType,
        'normalized': normalizedAIType
      });
      
      // AIタイプからURLを取得
      const url = aiUrlManager.getUrl(normalizedAIType);
      if (!url) {
        throw new Error(`Unsupported AI type: ${task.aiType} (normalized: ${normalizedAIType})`);
      }

      const retryText = retryCount > 0 ? ` (リトライ ${retryCount}/${maxRetries})` : '';
      this.logger.log(`[StreamProcessorV2] ウィンドウ作成: ${task.aiType} (${normalizedAIType}) - ${url}${retryText}`, {
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
      this.logger.log(`[StreamProcessorV2] ✅ ウィンドウ作成成功 - TabID: ${tabId} (位置: ${position})${retryText}`);
      
      // ページの読み込み完了を待つ
      const pageLoaded = await this.waitForPageLoad(tabId, 30000);
      if (!pageLoaded) {
        this.logger.warn(`[StreamProcessorV2] ⚠️ ページ読み込みが完了しませんでした: TabID ${tabId}${retryText}`);
        
        // タイムアウト時の処理：ウィンドウを閉じて再試行
        if (retryCount < maxRetries) {
          this.logger.log(`[StreamProcessorV2] 🔄 ウィンドウを閉じて再作成します (${retryCount + 1}/${maxRetries})`);
          
          try {
            // 失敗したタブ/ウィンドウを閉じる
            await chrome.tabs.remove(tabId);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
          } catch (closeError) {
            this.logger.warn(`[StreamProcessorV2] タブ閉じるエラー: ${closeError.message}`);
          }
          
          // 再帰的にリトライ
          return await this.createWindowForTask(task, position, retryCount + 1);
        } else {
          this.logger.error(`[StreamProcessorV2] ❌ 最大リトライ回数に達しました。ウィンドウ作成を諦めます: TabID ${tabId}`);
          // 失敗したタブを閉じる
          try {
            await chrome.tabs.remove(tabId);
          } catch (closeError) {
            this.logger.warn(`[StreamProcessorV2] タブ閉じるエラー: ${closeError.message}`);
          }
          throw new Error(`Page load timeout after ${maxRetries} retries`);
        }
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
   * タスクからモデル、機能、AIを動的に取得
   * @param {Object} task - タスクオブジェクト
   */
  async fetchModelAndFunctionFromTask(task) {
    try {
      // 常にスプレッドシートから最新データを取得
      if (!this.spreadsheetData || !this.spreadsheetData.values) {
        throw new Error('Spreadsheet data not available');
      }

      // モデル行、機能行、AI行を探す
      const modelRow = this.spreadsheetData.values.find(row => row[0] === 'モデル');
      const functionRow = this.spreadsheetData.values.find(row => row[0] === '機能');
      const aiRow = this.spreadsheetData.values.find(row => row[0] === 'AI');
      
      // デバッグログ：スプレッドシートデータの構造確認
      this.logger.log(`[StreamProcessorV2] 🔍 スプレッドシートデータ構造確認:`, {
        totalRows: this.spreadsheetData.values.length,
        modelRowFound: !!modelRow,
        functionRowFound: !!functionRow,
        aiRowFound: !!aiRow,
        firstColumnValues: this.spreadsheetData.values.map((row, idx) => `${idx}: "${row[0] || '空'}"`)
      });
      
      if (!modelRow || !functionRow) {
        this.logger.warn('[StreamProcessorV2] モデル行または機能行が見つかりません');
        return { model: '', function: '', ai: '' };
      }

      // プロンプト列のインデックスを取得
      let promptIndex = null;
      if (task.promptColumns && task.promptColumns.length > 0) {
        const firstPromptCol = task.promptColumns[0];
        // 文字列の場合はcolumnToIndex、数値の場合はそのまま使用
        promptIndex = typeof firstPromptCol === 'string' ? 
                     this.columnToIndex(firstPromptCol) : 
                     firstPromptCol;
      }
      
      // デバッグログ：タスクとプロンプト列の情報
      this.logger.log(`[直接取得] スプレッドシートから取得:`, {
        taskColumn: task.column,
        promptColumns: task.promptColumns,
        promptIndex,
        promptIndexType: typeof promptIndex
      });
      
      if (!promptIndex) {
        this.logger.warn('[StreamProcessorV2] プロンプト列が見つかりません');
        return { model: '', function: '', ai: '' };
      }
      
      // プロンプト列の機能値で通常処理かどうか判定
      const promptFunctionValue = functionRow[promptIndex] || '';
      
      // デバッグログ：各行の値確認
      this.logger.log(`[StreamProcessorV2] 🔍 行の値確認:`, {
        promptIndex,
        promptColumn: this.indexToColumn(promptIndex),
        promptFunctionValue,
        promptModelValue: modelRow[promptIndex] || '',
        promptAiValue: aiRow ? (aiRow[promptIndex] || '') : 'AI行なし'
      });
      
      let model = '';
      let func = '';
      let ai = '';
      
      // 判定理由をログ出力
      const isMultiAI = task.multiAI === true;
      const is3TypeGroup = task.groupType === '3type';
      const judgmentReason = isMultiAI ? 'task.multiAI=true' : is3TypeGroup ? 'groupType=3type' : 'デフォルト（通常処理）';
      
      this.logger.log(`[StreamProcessorV2] 🔍 処理タイプ判定:`, {
        multiAI: task.multiAI,
        groupType: task.groupType,
        promptFunctionValue,
        判定結果: (isMultiAI || is3TypeGroup) ? '3種類AI' : '通常処理',
        判定理由: judgmentReason
      });
      
      if (isMultiAI || is3TypeGroup) {
        // 3種類AI：回答列から取得
        const answerColumnIndex = this.columnToIndex(task.column);
        model = modelRow[answerColumnIndex] || '';
        func = functionRow[answerColumnIndex] || '';
        ai = aiRow ? (aiRow[answerColumnIndex] || '') : '';
        this.logger.log(`[StreamProcessorV2] 3種類AI: 回答列(${task.column})から取得 - AI: "${ai}", モデル: "${model}", 機能: "${func}"`);
      } else {
        // 通常処理：プロンプト列から取得（機能値に関係なく）
        model = modelRow[promptIndex] || '';
        func = functionRow[promptIndex] || '';
        ai = aiRow ? (aiRow[promptIndex] || '') : '';
        this.logger.log(`[StreamProcessorV2] 通常処理: プロンプト列(${this.indexToColumn(promptIndex)})から取得 - AI: "${ai}", モデル: "${model}", 機能: "${func}"`);
      }
      
      return { model, function: func, ai };
    } catch (error) {
      this.logger.error('[StreamProcessorV2] モデル/機能/AI取得エラー:', error);
      return { model: '', function: '', ai: '' };
    }
  }

  /**
   * タスクからプロンプトを取得
   */
  async fetchPromptFromTask(task) {
    try {
      // スプレッドシートIDとシート名を取得
      const spreadsheetId = this.spreadsheetUrl ? this.extractSpreadsheetId(this.spreadsheetUrl) : null;
      const sheetName = this.spreadsheetData?.sheetName || '1.メルマガ';
      
      if (!spreadsheetId) {
        throw new Error('Spreadsheet ID not available');
      }

      // SheetsClientのインスタンスを取得（Service Worker環境ではglobalThisから取得）
      if (!globalThis.sheetsClient) {
        throw new Error('SheetsClient not available in Service Worker environment');
      }
      const sheetsClient = globalThis.sheetsClient;
      
      // プロンプト列を取得
      let promptCells = [];
      if (task.promptColumns && task.promptColumns.length > 0) {
        // タスクにpromptColumns情報がある場合は、全てのプロンプト列を使用
        for (const col of task.promptColumns) {
          const columnName = typeof col === 'string' ? col : this.indexToColumn(col);
          promptCells.push(`${columnName}${task.row}`);
        }
        this.logger.log(`[StreamProcessorV2] プロンプト列情報使用: ${promptCells.length}セル (${promptCells.join(', ')})`);
      } else {
        // フォールバック：プロンプト列を推測（回答列の左隣）
        const answerColIndex = this.columnToIndex(task.column);
        const promptColIndex = answerColIndex - 1;
        const promptColName = this.indexToColumn(promptColIndex);
        promptCells = [`${promptColName}${task.row}`];
        this.logger.log(`[StreamProcessorV2] プロンプト列推測: ${promptCells[0]}`);
      }
      
      this.logger.log(`[StreamProcessorV2] プロンプト取得試行`, {
        タスク列: task.column,
        プロンプトセル: promptCells,
        行番号: task.row,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName
      });

      // 複数セルの値を一括取得
      const cellValues = await sheetsClient.getBatchCellValues(spreadsheetId, sheetName, promptCells);
      
      // セル値取得結果の確認（詳細なログは表示しない）
      this.logger.log(`[StreamProcessorV2] セル値取得完了: ${promptCells.length}セル`);
      
      // 複数のプロンプト列から内容を取得して連結
      const prompts = [];
      const promptDetails = [];
      
      for (const cell of promptCells) {
        const value = cellValues[cell];
        
        if (value && value.trim()) {
          const trimmedValue = value.trim();
          prompts.push(trimmedValue);
          const columnName = cell.replace(/\d+$/, ''); // 数字を除去して列名を取得
          promptDetails.push({
            column: columnName,
            length: trimmedValue.length,
            preview: trimmedValue.substring(0, 50)
          });
        }
      }
      
      if (prompts.length === 0) {
        // 全てのプロンプト列が空の場合はエラーをthrow
        const errorMsg = `All prompt columns empty for task ${task.column}${task.row}. Checked cells: ${promptCells.join(', ')}`;
        this.logger.error(`[StreamProcessorV2] ${errorMsg}`);
        throw new Error(errorMsg);
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
      // エラー時は適切にthrow（フォールバックは削除）
      throw new Error(`Failed to fetch prompt for ${task.column}${task.row}: ${error.message}`);
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
        const existingAnswer = this.getCurrentAnswer(task);
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
        
        const prompt = await this.fetchPromptFromTask(task);
        
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
            // Service Worker環境では動的インポートが禁止されているため、既存のwindowServiceを使用
            if (this.windowService) {
              await this.windowService.closeWindow(tabId);
              this.windowService.releasePosition(position);
              this.logger.log(`[StreamProcessorV2] 🧹 ウィンドウ${tabId}をクリーンアップしました`);
            } else {
              console.warn('[StreamProcessorV2] WindowServiceが利用できません - ウィンドウクリーンアップをスキップ');
            }
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
      
      // 動的タスク生成：プロンプト有り×回答無しをスキャン（API呼び出し0回）
      const promptCols = promptGroup.promptColumns;
      const answerCols = promptGroup.answerColumns.map(col => col.index);
      const tasks = await this.scanGroupTasks(spreadsheetData, promptCols, answerCols);
      
      // TaskListオブジェクト形式に変換（互換性維持）
      const groupTaskList = {
        tasks: tasks.map(task => ({
          ...task,
          aiType: promptGroup.aiType,
          spreadsheetId: spreadsheetData.spreadsheetId,
          gid: spreadsheetData.gid
        }))
      };
      
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
        // 通常AI: 各列を順次処理（列内は3行バッチ並列）
        this.logger.log(`[StreamProcessorV2] 🎯 通常モードで処理（列ごと順次処理）`);
        const columnGroups = this.organizeTasksByColumn(groupTaskList.tasks);
        
        for (const [column, tasks] of columnGroups) {
          try {
            await this.processColumn(column, tasks, isTestMode);
            totalProcessed += tasks.length;
          } catch (error) {
            this.logger.error(`[StreamProcessorV2] ${column}列処理エラー:`, error);
            totalFailed += tasks.length;
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
        // 動的タスク生成：プロンプト有り×回答無しをスキャン
        const promptCols = promptGroup.promptColumns;
        const answerCols = promptGroup.answerColumns.map(col => col.index);
        const tasks = await this.scanGroupTasks(spreadsheetData, promptCols, answerCols);
        
        const groupTaskList = {
          tasks: tasks.map(task => ({
            ...task,
            aiType: promptGroup.aiType,
            spreadsheetId: spreadsheetData.spreadsheetId,
            gid: spreadsheetData.gid
          }))
        };
        
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

  // ===== 新規実装: グループベース最適化処理 =====
  
  /**
   * 未完了グループをフィルタリング（95%時短のキー機能）
   */
  async filterIncompleteGroups(taskGroups) {
    const incompleteGroups = [];
    
    this.logger.log(`[StreamProcessorV2] 🔍 ${taskGroups.length}グループの完了状況をチェック中...`);
    
    for (const group of taskGroups) {
      // グループ内の全回答列をチェック
      const hasIncompleteAnswers = await this.hasIncompleteAnswers(group);
      
      if (hasIncompleteAnswers) {
        incompleteGroups.push(group);
        this.logger.log(`[StreamProcessorV2] 📝 グループ${group.id}: 未完了`);
      } else {
        this.logger.log(`[StreamProcessorV2] ✅ グループ${group.id}: 完了済み`);
      }
    }
    
    this.logger.log(`[StreamProcessorV2] 📊 完了状況: 完了=${taskGroups.length - incompleteGroups.length}, 未完了=${incompleteGroups.length}`);
    
    return incompleteGroups;
  }

  /**
   * グループ内に未完了回答があるかチェック
   */
  async hasIncompleteAnswers(group) {
    // 回答列×作業行数の完了状況を一括チェック
    for (const answerCol of group.columnRange.answerColumns) {
      const emptyCells = await this.countEmptyCells(answerCol.column, this.getWorkRowRange());
      if (emptyCells > 0) {
        this.logger.log(`[StreamProcessorV2] 📊 ${answerCol.column}列: ${emptyCells}個の空セル発見`);
        return true;
      }
    }
    return false;
  }

  /**
   * 指定列の空セル数をカウント
   */
  async countEmptyCells(columnLetter, rowRange) {
    try {
      // SheetsClientを使用してセル範囲を取得
      const range = `${columnLetter}${rowRange.start}:${columnLetter}${rowRange.end}`;
      const data = await this.sheetsClient.readRange(range);
      
      if (!data || !data.values) return rowRange.end - rowRange.start + 1;
      
      let emptyCells = 0;
      for (let i = 0; i < data.values.length; i++) {
        const cellValue = data.values[i] && data.values[i][0];
        if (!cellValue || cellValue.trim() === '') {
          emptyCells++;
        }
      }
      
      return emptyCells;
    } catch (error) {
      this.logger.warn(`[StreamProcessorV2] セルカウントエラー (${columnLetter}):`, error);
      return 1; // エラー時は未完了として扱う
    }
  }

  /**
   * 作業行範囲を取得
   */
  getWorkRowRange() {
    // スプレッドシートの構造に基づいて作業行範囲を計算
    const startRow = 9;  // データが始まる行
    const endRow = this.spreadsheetData?.values?.length || 600;
    return { start: startRow, end: endRow };
  }

  /**
   * グループの並列処理（依存関係考慮）
   */
  async processGroupsInParallel(groups, spreadsheetData) {
    this.logger.log(`[StreamProcessorV2] 🚀 ${groups.length}グループの並列処理開始`);
    
    let processedGroups = [];
    let remainingGroups = [...groups];
    
    while (remainingGroups.length > 0) {
      // 依存関係のないグループを並列実行
      const readyGroups = remainingGroups.filter(g => this.canProcessNow(g, processedGroups));
      const pendingGroups = remainingGroups.filter(g => !this.canProcessNow(g, processedGroups));
      
      if (readyGroups.length === 0) {
        this.logger.warn('[StreamProcessorV2] ⚠️ 循環依存の可能性 - 残りグループを強制処理');
        readyGroups.push(...pendingGroups);
        remainingGroups = [];
      } else {
        remainingGroups = pendingGroups;
      }
      
      this.logger.log(`[StreamProcessorV2] 📋 並列実行: ${readyGroups.length}グループ, 待機: ${remainingGroups.length}グループ`);
      
      // 並列実行
      const results = await Promise.allSettled(
        readyGroups.map(group => this.processGroup(group, spreadsheetData))
      );
      
      // 完了グループを記録
      readyGroups.forEach((group, index) => {
        if (results[index].status === 'fulfilled') {
          processedGroups.push(group.id);
          this.logger.log(`[StreamProcessorV2] ✅ グループ${group.id}完了`);
        } else {
          this.logger.error(`[StreamProcessorV2] ❌ グループ${group.id}失敗:`, results[index].reason);
        }
      });
    }
    
    this.logger.log('[StreamProcessorV2] 🎉 全グループ並列処理完了');
    return { success: true, processedGroups: processedGroups.length };
  }

  /**
   * グループが処理可能かチェック（依存関係）
   */
  canProcessNow(group, completedGroups) {
    if (!group.dependencies || group.dependencies.length === 0) {
      return true;
    }
    
    return group.dependencies.every(depId => completedGroups.includes(depId));
  }

  /**
   * 単一グループの処理
   */
  async processGroup(group, spreadsheetData) {
    this.logger.log(`[StreamProcessorV2] 🎯 グループ${group.id}の処理開始 (タイプ: ${group.groupType || 'normal'})`);
    
    // 特別グループの専用処理
    if (group.groupType === 'report') {
      return await this.processReportGroup(group, spreadsheetData);
    } else if (group.groupType === 'genspark') {
      return await this.processGensparkGroup(group, spreadsheetData);
    }
    
    // 通常のAIグループ処理
    const taskGenerator = new TaskGeneratorV2(this.logger);
    const tasks = await taskGenerator.generateTasksForGroup(group, spreadsheetData);
    
    if (tasks.length === 0) {
      this.logger.log(`[StreamProcessorV2] ✅ グループ${group.id}: タスクなし（完了済み）`);
      return;
    }
    
    // グループ内タスクを実行
    const results = await this.executeGroupTasks(tasks);
    
    this.logger.log(`[StreamProcessorV2] ✅ グループ${group.id}完了: ${results.completed}/${results.total}タスク`);
    
    return results;
  }

  /**
   * グループ内タスクの実行
   */
  async executeGroupTasks(tasks) {
    // 既存のバッチ処理ロジックを活用
    const results = { total: tasks.length, completed: 0, failed: 0 };
    
    for (const task of tasks) {
      try {
        await this.executeTask(task);
        results.completed++;
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] タスク実行エラー:`, error);
        results.failed++;
      }
    }
    
    return results;
  }

  /**
   * 前の列の文字を取得（例：D→C、AA→Z）
   */
  getPreviousColumnLetter(columnLetter) {
    // A1形式の列文字を数値に変換
    let columnNumber = 0;
    for (let i = 0; i < columnLetter.length; i++) {
      columnNumber = columnNumber * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    
    // 前の列番号を計算
    columnNumber -= 1;
    
    if (columnNumber <= 0) {
      return 'A'; // A列より前はない
    }
    
    // 数値を列文字に変換
    let result = '';
    while (columnNumber > 0) {
      columnNumber -= 1;
      result = String.fromCharCode('A'.charCodeAt(0) + (columnNumber % 26)) + result;
      columnNumber = Math.floor(columnNumber / 26);
    }
    
    return result;
  }

  /**
   * スプレッドシートからセル値を取得
   */
  async getCellValue(spreadsheetData, columnLetter, rowIndex) {
    try {
      if (spreadsheetData.values && spreadsheetData.values[rowIndex - 1]) {
        const columnIndex = this.columnLetterToIndex(columnLetter);
        return spreadsheetData.values[rowIndex - 1][columnIndex] || '';
      }
      return '';
    } catch (error) {
      this.logger.warn(`[StreamProcessorV2] セル取得エラー (${columnLetter}${rowIndex}):`, error);
      return '';
    }
  }

  /**
   * スプレッドシートにセル値を書き込み
   */
  async writeCellValue(spreadsheetData, columnLetter, rowIndex, value) {
    try {
      // SheetsClientを使用してセルに書き込み
      if (this.sheetsClient && this.sheetsClient.updateCell) {
        const range = `${columnLetter}${rowIndex}`;
        await this.sheetsClient.updateCell(range, value);
      }
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] セル書き込みエラー (${columnLetter}${rowIndex}):`, error);
    }
  }

  /**
   * 列文字を数値インデックスに変換
   */
  columnLetterToIndex(columnLetter) {
    let columnNumber = 0;
    for (let i = 0; i < columnLetter.length; i++) {
      columnNumber = columnNumber * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return columnNumber - 1; // 0ベースのインデックス
  }

  /**
   * レポートグループの専用処理
   */
  async processReportGroup(group, spreadsheetData) {
    this.logger.log(`[StreamProcessorV2] 📄 レポートグループ${group.id}の処理開始`);
    
    try {
      // レポート専用タスク生成
      // Service Worker環境では動的インポートが禁止されているため、グローバル変数を使用
      const ReportExecutor = globalThis.ReportExecutor || null;
      if (!ReportExecutor) {
        this.logger.warn('[StreamProcessorV2] ReportExecutorが利用できません');
        return;
      }
      const reportExecutor = new ReportExecutor({ logger: this.logger });
      
      // レポートタスクの実行
      // TODO: レポート専用のタスク生成とデータ取得ロジックを実装
      
      this.logger.log(`[StreamProcessorV2] ✅ レポートグループ${group.id}完了`);
      return { success: true, type: 'report' };
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ❌ レポートグループ${group.id}エラー:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gensparkグループの専用処理
   */
  async processGensparkGroup(group, spreadsheetData) {
    this.logger.log(`[StreamProcessorV2] ⚡ Gensparkグループ${group.id}の処理開始 (AIタイプ: ${group.aiType})`);
    
    try {
      // Gensparkの種別に応じた機能設定
      let functionType = 'slides'; // デフォルト
      
      if (group.aiType === 'Genspark-Slides') {
        functionType = 'slides';
        this.logger.log(`[StreamProcessorV2] 🎨 スライド生成モードで処理`);
      } else if (group.aiType === 'Genspark-FactCheck') {
        functionType = 'factcheck';
        this.logger.log(`[StreamProcessorV2] ✅ ファクトチェックモードで処理`);
      }
      
      // Gensparkグループの各行を処理
      const workRowRange = this.getWorkRowRange();
      const results = { total: 0, completed: 0, failed: 0 };
      
      for (let rowIndex = workRowRange.start; rowIndex <= workRowRange.end; rowIndex++) {
        try {
          // 左隣のセル（AI回答列）からテキストを取得
          const leftColumnLetter = this.getPreviousColumnLetter(group.columnRange.promptColumns[0]);
          const aiAnswerText = await this.getCellValue(spreadsheetData, leftColumnLetter, rowIndex);
          
          if (!aiAnswerText || aiAnswerText.trim() === '') {
            continue; // 空のセルはスキップ
          }
          
          results.total++;
          
          // Genspark自動化実行
          if (typeof window !== 'undefined' && window.GensparkAutomation) {
            const automationResult = await window.GensparkAutomation.runAutomation({
              function: functionType,
              text: aiAnswerText.trim(),
              send: true,
              waitResponse: true,
              getResponse: true
            });
            
            if (automationResult.success) {
              // 結果をスプレッドシートに書き戻し
              await this.writeCellValue(spreadsheetData, group.columnRange.promptColumns[0], rowIndex, automationResult.response || automationResult.responseUrl || 'Genspark処理完了');
              results.completed++;
              this.logger.log(`[StreamProcessorV2] 📝 行${rowIndex}: Genspark処理完了`);
            } else {
              results.failed++;
              this.logger.error(`[StreamProcessorV2] ❌ 行${rowIndex}: Genspark処理失敗 - ${automationResult.error}`);
            }
          }
          
        } catch (rowError) {
          results.failed++;
          this.logger.error(`[StreamProcessorV2] ❌ 行${rowIndex}処理エラー:`, rowError);
        }
      }
      
      this.logger.log(`[StreamProcessorV2] ✅ Gensparkグループ${group.id}完了: ${results.completed}/${results.total}行`);
      return { success: true, type: 'genspark', functionType: functionType, results: results };
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] ❌ Gensparkグループ${group.id}エラー:`, error);
      return { success: false, error: error.message };
    }
  }

  async processColumnsSequentially(initialTaskList, spreadsheetData, isTestMode) {
    this.logger.log('[StreamProcessorV2] 🚀 プロンプトグループごとの順次処理開始');
    
    // 1. タスクグループの完了状況を事前チェック
    if (spreadsheetData.taskGroups && spreadsheetData.taskGroups.length > 0) {
      this.logger.log('[StreamProcessorV2] 📊 タスクグループベース処理を開始');
      const incompleteGroups = await this.filterIncompleteGroups(spreadsheetData.taskGroups);
      
      if (incompleteGroups.length === 0) {
        this.logger.log('[StreamProcessorV2] ✅ 全グループ完了済み - 処理終了');
        return { success: true, message: '全タスク完了済み' };
      }
      
      this.logger.log(`[StreamProcessorV2] 📋 未完了グループ数: ${incompleteGroups.length}/${spreadsheetData.taskGroups.length}`);
      // 2. 未完了グループのみ並列処理
      return this.processGroupsInParallel(incompleteGroups, spreadsheetData);
    }
    
    // フォールバック: 従来のV3モード処理
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
        
        // 動的タスク生成：プロンプト有り×回答無しをスキャン
        const promptCols = promptGroup.promptColumns;
        const answerCols = promptGroup.answerColumns.map(col => col.index);
        const tasks = await this.scanGroupTasks(spreadsheetData, promptCols, answerCols);
        
        const groupTaskList = {
          tasks: tasks.map(task => ({
            ...task,
            aiType: promptGroup.aiType,
            spreadsheetId: spreadsheetData.spreadsheetId,
            gid: spreadsheetData.gid
          }))
        };
        
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
   * 3種類AIグループを処理（F,G,H列を同時に3ウィンドウで処理）
   * @param {Map} columnGroups - 列ごとのタスクグループ
   * @param {boolean} isTestMode - テストモード
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
   * 列を3行バッチで処理
   * @param {string} column - 列名
   * @param {Array} tasks - タスク配列
   * @param {boolean} isTestMode - テストモード
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

    this.logger.log(`[StreamProcessorV2] ✅ ${column}列の処理完了`);
  }

  /**
   * タスク配列をバッチに分割
   * @param {Array} tasks - タスク配列
   * @param {number} batchSize - バッチサイズ
   * @returns {Array} バッチの配列
   */
  createBatches(tasks, batchSize = 3) {
    const batches = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }
    return batches;
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

  /**
   * インデックスを列名に変換
   */
  indexToColumn(index) {
    let column = '';
    while (index >= 0) {
      column = String.fromCharCode((index % 26) + 65) + column;
      index = Math.floor(index / 26) - 1;
    }
    return column;
  }

  /**
   * 行制御をチェック（generator.jsと同じロジック）
   */
  shouldProcessRow(rowNumber, rowControls) {
    if (!rowControls || rowControls.length === 0) {
      return true;
    }
    
    // "この行のみ処理"が優先
    const onlyControls = rowControls.filter(c => c.type === 'only');
    if (onlyControls.length > 0) {
      return onlyControls.some(c => c.row === rowNumber);
    }
    
    // "この行から処理"
    const fromControl = rowControls.find(c => c.type === 'from');
    if (fromControl) {
      if (rowNumber < fromControl.row) {
        return false;
      }
    }
    
    // "この行で停止"
    const untilControl = rowControls.find(c => c.type === 'until');
    if (untilControl) {
      if (rowNumber > untilControl.row) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 列制御をチェック（generator.jsと同じロジック）
   */
  shouldProcessColumn(promptGroup, columnControls) {
    if (!columnControls || columnControls.length === 0) {
      return true;
    }
    
    // "この列のみ処理"が優先
    const onlyControls = columnControls.filter(c => c.type === 'only');
    if (onlyControls.length > 0) {
      // グループ内のプロンプト列または回答列がマッチするか
      const promptMatch = promptGroup.promptColumns.some(colIndex => 
        onlyControls.some(ctrl => ctrl.index === colIndex)
      );
      const answerMatch = promptGroup.answerColumns.some(answerCol => {
        const idx = typeof answerCol === 'number' ? answerCol : answerCol.index;
        return onlyControls.some(ctrl => ctrl.index === idx);
      });
      
      return promptMatch || answerMatch;
    }
    
    // "この列から処理"と"この列で停止"
    const fromControl = columnControls.find(c => c.type === 'from');
    const untilControl = columnControls.find(c => c.type === 'until');
    
    // グループの範囲を判定
    const groupStart = Math.min(...promptGroup.promptColumns);
    const answerIndices = promptGroup.answerColumns.map(a => typeof a === 'number' ? a : a.index);
    const groupEnd = Math.max(...answerIndices);
    
    let shouldProcess = true;
    
    if (fromControl && groupEnd < fromControl.index) {
      shouldProcess = false;
    }
    
    // "この列で停止" - 制御列を含むグループまでは処理する
    if (untilControl && groupStart > untilControl.index) {
      shouldProcess = false;
      this.logger.log(`[StreamProcessorV2] 列制御「${untilControl.column}列で停止」により、グループ(開始:${this.indexToColumn(groupStart)})をスキップ`);
    }
    
    return shouldProcess;
  }

  /**
   * 行制御情報を取得（generator.jsと同じ形式）
   */
  getRowControl(data) {
    const controls = [];
    
    // B列で制御文字列を探す（generator.jsと同じ）
    for (let i = 0; i < data.values.length; i++) {
      const row = data.values[i];
      if (!row) continue;
      
      const cellB = row[1]; // B列
      if (cellB && typeof cellB === 'string') {
        if (cellB.includes('この行から処理')) {
          controls.push({ type: 'from', row: i + 1 });
        } else if (cellB.includes('この行で停止') || cellB.includes('この行の処理後に停止')) {
          controls.push({ type: 'until', row: i + 1 });
        } else if (cellB.includes('この行のみ処理')) {
          controls.push({ type: 'only', row: i + 1 });
        }
      }
    }
    
    return controls;
  }

  /**
   * 列制御情報を取得（generator.jsと同じ形式）
   */
  getColumnControl(data) {
    const controls = [];
    
    // 制御行1-10で制御文字列を探す（generator.jsと同じ）
    for (let i = 0; i < Math.min(10, data.values.length); i++) {
      const row = data.values[i];
      if (!row) continue;
      
      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        if (cell && typeof cell === 'string') {
          const column = this.indexToColumn(j);
          
          if (cell.includes('この列から処理')) {
            controls.push({ type: 'from', column, index: j });
          } else if (cell.includes('この列で停止') || cell.includes('この列の処理後に停止')) {
            controls.push({ type: 'until', column, index: j });
          } else if (cell.includes('この列のみ処理')) {
            controls.push({ type: 'only', column, index: j });
          }
        }
      }
    }
    
    return controls;
  }

  /**
   * 動的タスク生成：プロンプト有り×回答無しのセルを特定
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} promptCols - プロンプト列インデックス配列
   * @param {Array} answerCols - 回答列インデックス配列  
   * @returns {Array} タスクリスト
   */
  async scanGroupTasks(spreadsheetData, promptCols, answerCols) {
    const tasks = [];
    
    this.logger.log(`[StreamProcessorV2] 📊 scanGroupTasks開始:`, {
      spreadsheetData: spreadsheetData ? 'あり' : 'なし',
      values: spreadsheetData?.values ? `${spreadsheetData.values.length}行` : 'なし',
      promptCols: promptCols || 'なし',
      answerCols: answerCols || 'なし'
    });
    
    if (!spreadsheetData?.values || !Array.isArray(spreadsheetData.values)) {
      this.logger.warn('[StreamProcessorV2] scanGroupTasks: 無効なスプレッドシートデータ');
      return tasks;
    }
    
    if (!promptCols || !Array.isArray(promptCols) || promptCols.length === 0) {
      this.logger.warn('[StreamProcessorV2] scanGroupTasks: 無効なプロンプト列データ');
      return tasks;
    }
    
    if (!answerCols || !Array.isArray(answerCols) || answerCols.length === 0) {
      this.logger.warn('[StreamProcessorV2] scanGroupTasks: 無効な回答列データ');
      return tasks;
    }
    
    // 制御情報を取得
    let rowControls = this.getRowControl(spreadsheetData);
    const columnControls = this.getColumnControl(spreadsheetData);
    
    // 現在のグループ情報を作成（列制御チェック用）
    const promptGroup = {
      promptColumns: promptCols,
      answerColumns: answerCols
    };
    
    // 列制御チェック（グループ全体）
    if (!this.shouldProcessColumn(promptGroup, columnControls)) {
      this.logger.log(`[StreamProcessorV2] このグループは列制御によりスキップ`);
      return tasks;
    }
    
    // ========== 重要：プロンプト列を最後まで読み込む ==========
    this.logger.log(`[StreamProcessorV2] 📊 プロンプト列を最後まで読み込み開始...`);
    
    // scanPromptRowsを使ってプロンプトがある行を全て検出
    const promptRows = await this.scanPromptRows(promptCols);
    
    if (!promptRows || promptRows.length === 0) {
      this.logger.log(`[StreamProcessorV2] プロンプトが見つかりません`);
      return tasks;
    }
    
    // プロンプトがある最大行を特定
    const maxPromptRow = Math.max(...promptRows);
    this.logger.log(`[StreamProcessorV2] プロンプト発見: ${promptRows.length}行、最大行: ${maxPromptRow + 1}`);
    
    // 現在のデータが不足している場合、追加読み込み
    if (maxPromptRow >= spreadsheetData.values.length) {
      this.logger.log(`[StreamProcessorV2] 📥 追加データ読み込み: 現在${spreadsheetData.values.length}行 → ${maxPromptRow + 1}行まで`);
      await this.loadAdditionalRows(maxPromptRow);
      
      // 重要：追加データ読み込み後に行制御を再取得
      this.logger.log(`[StreamProcessorV2] 📊 行制御を再取得（全${spreadsheetData.values.length}行から）`);
      rowControls = this.getRowControl(spreadsheetData);
      if (rowControls.length > 0) {
        this.logger.log(`[StreamProcessorV2] 行制御発見:`, rowControls.map(c => `${c.type}:${c.row}行`));
      }
    }
    
    // 作業行範囲を更新
    const startRow = 8; // 0ベース（9行目）
    let endRow = Math.min(maxPromptRow + 1, spreadsheetData.values.length)
    
    // カウンタ
    let totalRowsChecked = 0;
    let rowSkippedByControl = 0;
    let promptFoundCount = 0;
    let answerExistCount = 0;
    let skippedCompleted = 0;
    
    this.logger.log(`[StreamProcessorV2] 📊 タスク生成開始:`, {
      プロンプト列: promptCols.map(idx => this.indexToColumn(idx)),
      回答列: answerCols.map(idx => this.indexToColumn(idx)), 
      対象行: `${startRow + 1}～${endRow}行目`,
      プロンプト行数: promptRows.length
    });
    
    // デバッグ：制御情報の状態
    if (rowControls.length > 0 || columnControls.length > 0) {
      this.logger.log(`[StreamProcessorV2] 制御適用: 行制御${rowControls.length}件、列制御${columnControls.length}件`);
    }
    
    // プロンプトがある行のみを処理（promptRowsを使用）
    let debugCount = 0;
    for (const rowIndex of promptRows) {
      // 範囲外チェック
      if (rowIndex < startRow || rowIndex >= endRow) continue;
      
      totalRowsChecked++;
      const row = spreadsheetData.values[rowIndex];
      if (!row) {
        this.logger.warn(`[StreamProcessorV2] ⚠️ 行${rowIndex + 1}のデータなし`);
        continue;
      }
      
      // 行制御チェック
      if (!this.shouldProcessRow(rowIndex + 1, rowControls)) {
        rowSkippedByControl++;
        continue;
      }
      
      promptFoundCount++;
      
      // 対応する回答列をチェック
      for (const answerColIndex of answerCols) {
        const answerValue = row[answerColIndex];
        const hasAnswer = answerValue && typeof answerValue === 'string' && answerValue.trim().length > 0;
        
        // デバッグ：最初の5行と問題のある行（40-42行目）の回答状態を確認
        if (debugCount < 5 || (rowIndex >= 39 && rowIndex <= 42)) {
          this.logger.log(`[DEBUG] 行${rowIndex + 1} 回答列${this.indexToColumn(answerColIndex)}[${answerColIndex}]: "${answerValue ? answerValue.substring(0, 50) : '(空)'}" → ${hasAnswer ? '回答済み' : '未回答'}`);
          
          // 41行目の詳細デバッグ
          if (rowIndex === 40) { // 0ベースなので40が41行目
            this.logger.log(`[DEBUG] ⚠️ 41行目詳細:`, {
              row長: row.length,
              B列: row[1] || '(空)',
              H列: row[7] || '(空)', 
              I列: row[8] || '(空)',
              I列型: typeof row[8],
              制御チェック: this.shouldProcessRow(41, rowControls) ? '処理対象' : 'スキップ'
            });
          }
          debugCount++;
        }
        
        if (hasAnswer) {
          // 回答済み - スキップ
          answerExistCount++;
          skippedCompleted++;
        } else {
          // プロンプトあり＆回答なし = タスク対象
          tasks.push({
            row: rowIndex + 1, // 1ベース行番号
            column: this.indexToColumn(answerColIndex),
            columnIndex: answerColIndex
          });
        }
      }
    }
    
    // ログを簡略化
    this.logger.log(`[StreamProcessorV2] ✅ タスク生成完了: プロンプト${promptFoundCount}個、回答済み${skippedCompleted}個、処理対象${tasks.length}個`);
    
    // タスクがある場合のみ詳細表示
    if (tasks.length > 0) {
      const taskRanges = this.formatCellRanges(tasks.map(t => `${t.column}${t.row}`));
      this.logger.log(`[StreamProcessorV2] 📝 処理対象: ${taskRanges}`);
    }
  
    return tasks;
  }

  /**
   * タスクグループの処理前にデータをバッチ取得
   * （現在は使用していないが、将来的な最適化のために保持）
   * @param {Object} group - タスクグループ
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} バッチ取得したデータ
   */
  async preprocessTaskGroup(group, spreadsheetData) {
    this.logger.log(`[preprocessTaskGroup] グループ ${group.name} のデータを事前取得開始`);
    
    // 必要な範囲を収集
    const requiredRanges = [];
    const rangeMap = {}; // 範囲とその用途をマッピング
    
    // モデル行と機能行の位置を取得
    const modelRowIndex = spreadsheetData.modelRow?.index;
    const functionRowIndex = spreadsheetData.taskRow?.index; // taskRowが機能行
    
    if (modelRowIndex == null || functionRowIndex == null) {
      this.logger.warn(`[preprocessTaskGroup] モデル行または機能行が見つかりません`);
      return {};
    }
    
    // プロンプト列と回答列のインデックスを取得
    const promptColIndices = group.columnRange.promptColumns.map(col => 
      typeof col === 'string' ? this.columnToIndex(col) : col
    );
    const answerColIndices = group.columnRange.answerColumns.map(answerCol => {
      const col = typeof answerCol === 'string' ? answerCol : answerCol.column;
      return this.columnToIndex(col);
    });
    
    // 1. モデル行の必要な列
    for (const colIndex of promptColIndices) {
      const colLetter = this.indexToColumn(colIndex);
      const range = `${colLetter}${modelRowIndex + 1}`;
      requiredRanges.push(range);
      rangeMap[range] = { type: 'model', column: colLetter, rowIndex: modelRowIndex };
    }
    
    // 2. 機能行の必要な列
    for (const colIndex of promptColIndices) {
      const colLetter = this.indexToColumn(colIndex);
      const range = `${colLetter}${functionRowIndex + 1}`;
      requiredRanges.push(range);
      rangeMap[range] = { type: 'function', column: colLetter, rowIndex: functionRowIndex };
    }
    
    // 3. 作業行のスキャン（プロンプトがある行を特定）
    const startRow = 8; // 0ベース（9行目）
    const endRow = Math.min(spreadsheetData.values?.length || 0, 1000); // 最大1000行まで
    const workRows = [];
    
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const row = spreadsheetData.values[rowIndex];
      if (!row) continue;
      
      // プロンプト列にデータがあるかチェック
      const hasPrompt = promptColIndices.some(colIndex => {
        const cellValue = row[colIndex];
        return cellValue && typeof cellValue === 'string' && cellValue.trim().length > 0;
      });
      
      if (hasPrompt) {
        workRows.push(rowIndex);
        
        // この行のプロンプト列データを取得対象に追加
        for (const colIndex of promptColIndices) {
          const colLetter = this.indexToColumn(colIndex);
          const range = `${colLetter}${rowIndex + 1}`;
          requiredRanges.push(range);
          rangeMap[range] = { type: 'prompt', column: colLetter, rowIndex: rowIndex };
        }
        
        // B列（制御情報）も追加
        const bRange = `B${rowIndex + 1}`;
        requiredRanges.push(bRange);
        rangeMap[bRange] = { type: 'control', column: 'B', rowIndex: rowIndex };
      }
    }
    
    this.logger.log(`[preprocessTaskGroup] バッチ取得対象:`, {
      グループ: group.name,
      範囲数: requiredRanges.length,
      作業行数: workRows.length,
      プロンプト列: promptColIndices.map(idx => this.indexToColumn(idx)),
      回答列: answerColIndices.map(idx => this.indexToColumn(idx))
    });
    
    // バッチでデータを取得
    if (requiredRanges.length > 0) {
      try {
        const batchData = await globalThis.sheetsClient.batchGetSheetData(
          spreadsheetData.spreadsheetId,
          requiredRanges,
          spreadsheetData.gid
        );
        
        // 取得したデータを整理
        const organizedData = {
          modelData: {},
          functionData: {},
          promptData: {},
          controlData: {},
          workRows: workRows
        };
        
        for (const [range, value] of Object.entries(batchData)) {
          const rangeInfo = rangeMap[range];
          if (!rangeInfo) continue;
          
          switch (rangeInfo.type) {
            case 'model':
              organizedData.modelData[rangeInfo.column] = value;
              break;
            case 'function':
              organizedData.functionData[rangeInfo.column] = value;
              break;
            case 'prompt':
              if (!organizedData.promptData[rangeInfo.rowIndex]) {
                organizedData.promptData[rangeInfo.rowIndex] = {};
              }
              organizedData.promptData[rangeInfo.rowIndex][rangeInfo.column] = value;
              break;
            case 'control':
              organizedData.controlData[rangeInfo.rowIndex] = value;
              break;
          }
        }
        
        
        return organizedData;
      } catch (error) {
        this.logger.error(`[preprocessTaskGroup] バッチ取得エラー:`, error);
        return {};
      }
    }
    
    return {};
  }
  
  /**
   * グループに処理すべきタスクがあるかチェック（軽量版）
   * @param {Object} group - タスクグループ
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {boolean} タスクがあるかどうか
   */
  hasTasksInGroup(group, spreadsheetData) {
    try {
      if (!spreadsheetData?.values || !group?.columnRange) {
        return false;
      }

      const { promptColumns, answerColumns } = group.columnRange;
      if (!promptColumns?.length || !answerColumns?.length) {
        return false;
      }

      // プロンプト列のインデックスを取得
      const promptColIndices = promptColumns.map(col => this.columnToIndex(col));
      
      // 作業行範囲（9行目以降）をチェック - 全データをチェック
      for (let rowIndex = 8; rowIndex < spreadsheetData.values.length; rowIndex++) {
        const rowData = spreadsheetData.values[rowIndex] || [];
        
        // A列の番号チェック（作業行かどうか）
        const aValue = rowData[0];
        if (aValue && /^\d+$/.test(String(aValue).trim())) {
          // プロンプト列にデータがあるかチェック
          const hasPrompt = promptColIndices.some(colIndex => {
            const cellValue = rowData[colIndex];
            return cellValue && typeof cellValue === 'string' && cellValue.trim().length > 0;
          });
          
          if (hasPrompt) {
            this.logger.log(`[hasTasksInGroup] ${group.name}: 行${rowIndex + 1}にプロンプト発見`);
            return true;
          }
        }
      }
      
      this.logger.log(`[hasTasksInGroup] ${group.name}: プロンプトなし、スキップ`);
      return false; // プロンプトが見つからない
    } catch (error) {
      this.logger.warn(`[hasTasksInGroup] エラー: ${error.message}`);
      return true; // エラー時は安全のため処理ありとして扱う
    }
  }

  /**
   * 動的タスクグループ処理
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 実行結果
   */
  async processDynamicTaskGroups(spreadsheetData, options = {}) {
    const startTime = Date.now();
    let totalCompleted = 0;
    let totalFailed = 0;
    
    // spreadsheetDataをインスタンス変数に保存（動的取得メソッドで使用）
    this.spreadsheetData = spreadsheetData;
    this.spreadsheetUrl = spreadsheetData?.spreadsheetUrl; // spreadsheetUrlを保存
    
    // spreadsheetData構造確認（簡潔版）
    this.logger.log('[DEBUG] スプレッドシートデータ確認完了');
    
    // SpreadsheetLoggerを初期化
    await this.initializeSpreadsheetLogger();
    
    // タスクグループ情報を取得（optionsから渡されたものを使用）
    const taskGroups = options.taskGroups || [];
    
    if (!taskGroups || taskGroups.length === 0) {
      this.logger.warn('[StreamProcessorV2] タスクグループが見つかりません');
      return {
        success: false,
        total: 0,
        completed: 0,
        failed: 0,
        totalTime: '0秒',
        error: 'タスクグループが見つかりません'
      };
    }
    
    this.logger.log(`[StreamProcessorV2] 🚀 動的タスクグループ処理開始: ${taskGroups.length}グループ`);
    
    // 各タスクグループを順番に処理
    for (const group of taskGroups) {
      // 事前チェック：このグループに処理すべきタスクがあるか？
      if (!this.hasTasksInGroup(group, spreadsheetData)) {
        this.logger.log(`[StreamProcessorV2] ⏭️ ${group.name}: 作業なし、スキップ`);
        continue; // 次のグループへ
      }
      
      // 作業がある場合のみ重い処理を実行
      this.logger.log(`[StreamProcessorV2] 📋 グループ処理開始: ${group.name} (${group.startColumn}-${group.endColumn}列)`);
      
      // グループ処理開始前に全ウィンドウを閉じる
      try {
        await WindowService.closeAllWindows();
      } catch (error) {
        this.logger.warn(`ウィンドウクローズエラー:`, error);
      }
      
      // 少し待機してからグループ処理を開始
      await this.delay(2000); // 5秒 → 2秒に短縮
      
      
      // グループの列情報からインデックス配列を作成
      const promptColIndices = group.columnRange.promptColumns.map(col => this.columnToIndex(col));
      const answerColIndices = group.columnRange.answerColumns.map(answerCol => {
        // answerColumnsはオブジェクト配列の場合がある
        const col = typeof answerCol === 'string' ? answerCol : answerCol.column;
        return this.columnToIndex(col);
      });
      
      this.logger.log(`[StreamProcessorV2] 列情報:`, {
        プロンプト列: group.columnRange.promptColumns,
        回答列: group.columnRange.answerColumns.map(a => typeof a === 'string' ? a : a.column),
        プロンプトインデックス: promptColIndices,
        回答インデックス: answerColIndices
      });
      
      // タスクを処理（実行時にタスクを動的生成）
      this.logger.log(`[StreamProcessorV2] 🔄 ${group.name}: タスクを動的生成して実行`);
      
      // ========================================
      // 実行時にタスクを動的生成
      // ========================================
      const tasks = await this.scanGroupTasks(
        spreadsheetData,
        promptColIndices,
        answerColIndices
      );
      
      this.logger.log(`[StreamProcessorV2] 📊 実行時スキャン結果:`, {
        tasks: tasks ? `${tasks.length}個` : 'undefined',
        tasksType: typeof tasks,
        isArray: Array.isArray(tasks)
      });
      
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        this.logger.log(`[StreamProcessorV2] ⏭️ ${group.name}: 実行時チェックでタスクなし、スキップ`);
        continue;
      }
      
      // ========================================
      // タスクをTaskオブジェクト形式に変換
      // ========================================
      const taskObjects = [];
      for (const taskInfo of tasks) {
        // AIタイプを取得（グループから）

        const answerCol = group.columnRange.answerColumns.find(col => {
          const colStr = typeof col === 'string' ? col : col.column;
          const colIndex = this.columnToIndex(colStr);
          
          return colIndex === taskInfo.columnIndex;
        });
        // AIタイプは設定しない（実行時にfetchModelAndFunctionFromTaskで取得）
        
        
        // タスクオブジェクトを作成（AI/モデル/機能は実行時に動的取得）
        const task = {
          groupId: group.id, // グループIDを追加（キャッシュデータ参照用）
          id: `${taskInfo.column}${taskInfo.row}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          column: taskInfo.column,
          row: taskInfo.row,
          aiType: group.aiType || '',  // グループのAIタイプを設定
          // promptは削除（fetchPromptFromTaskで動的取得）
          promptColumn: this.indexToColumn(promptColIndices[0]),
          promptColumns: promptColIndices.map(idx => this.indexToColumn(idx)),  // 文字列の配列に変換
          sheetName: spreadsheetData.sheetName || '不明',
          model: '',  // 実行時に動的取得
          function: '',  // 実行時に動的取得
          createdAt: Date.now(),
          // ログ列：タスクリストで指定されたものをそのまま使用（なければ空配列）
          logColumns: group.columnRange.logColumn ? [group.columnRange.logColumn] : []
        };
        
        taskObjects.push(task);
      }
      
      // ========================================
      // 3つずつのバッチに分割して処理
      // ========================================
      const batchSize = 3;
      for (let i = 0; i < taskObjects.length; i += batchSize) {
        const batch = taskObjects.slice(i, Math.min(i + batchSize, taskObjects.length));
        
        this.logger.log(`[StreamProcessorV2] 📦 バッチ${Math.floor(i/batchSize) + 1}/${Math.ceil(taskObjects.length/batchSize)}を処理`, {
          タスク: batch.map(t => `${t.column}${t.row}`).join(', '),
          グループ: group.name
        });
        
        // 現在処理中のグループを設定（キャッシュデータ参照用）
        this.currentProcessingGroup = group;
        
        try {
          // 既存のprocessBatchメソッドを使用（並列処理＋フェーズ分け）
          await this.processBatch(batch, false);
          totalCompleted += batch.length;
        } catch (error) {
          this.logger.error(`[StreamProcessorV2] バッチ処理エラー:`, error);
          totalFailed += batch.length;
        } finally {
          // 処理後にクリア
          this.currentProcessingGroup = null;
        }
      }
    }
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    
    return {
      success: true,
      total: totalCompleted + totalFailed,
      completed: totalCompleted,
      failed: totalFailed,
      totalTime: `${totalTime}秒`
    };
  }
  
  /**
   * メニュー行からタスクグループ情報を抽出
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Array} タスクグループ配列
   */
  extractTaskGroups(spreadsheetData) {
    if (!spreadsheetData?.values || !Array.isArray(spreadsheetData.values)) {
      return [];
    }
    
    // メニュー行を探す（A列が"メニュー"の行）
    let menuRowIndex = -1;
    for (let i = 0; i < spreadsheetData.values.length; i++) {
      const row = spreadsheetData.values[i];
      if (row && row[0] === 'メニュー') {
        menuRowIndex = i;
        break;
      }
    }
    
    if (menuRowIndex === -1) {
      this.logger.warn('[StreamProcessorV2] メニュー行が見つかりません');
      return [];
    }
    
    const menuRow = spreadsheetData.values[menuRowIndex];
    const groups = [];
    
    // デバッグ：メニュー行の内容を確認
    this.logger.log('[StreamProcessorV2] メニュー行の内容:', menuRow.slice(0, 50));
    
    // AI列（3列セット）を検出してグループ化
    for (let i = 1; i < menuRow.length; i++) {
      const cellValue = menuRow[i];
      if (cellValue && cellValue.includes('-')) {
        this.logger.log(`[StreamProcessorV2] メニュー行[${i}]: "${cellValue}"`);
        // "G-I", "J-L"のような形式を想定
        const columns = cellValue.split('-').map(c => c.trim());
        if (columns.length === 2) {
          const startCol = columns[0];
          const endCol = columns[1];
          const startIdx = this.columnToIndex(startCol);
          
          // 3列セット（プロンプト、回答、ログ）として扱う
          groups.push({
            columns: [startCol, String.fromCharCode(startCol.charCodeAt(0) + 1), endCol],
            promptColIndices: [startIdx],
            answerColIndices: [startIdx + 1],
            logColIndices: [startIdx + 2]
          });
        }
      }
    }
    
    this.logger.log(`[StreamProcessorV2] タスクグループ検出: ${groups.length}グループ`);
    return groups;
  }

  /**
   * プロンプト列をスキャンしてプロンプトがある行を特定
   * @param {Array} promptCols - プロンプト列のインデックス配列
   * @returns {Array} プロンプトがある行のインデックス配列（0ベース）
   */
  async scanPromptRows(promptCols) {
    const promptRows = [];
    
    try {
      const spreadsheetId = this.spreadsheetUrl ? this.extractSpreadsheetId(this.spreadsheetUrl) : null;
      const sheetName = this.spreadsheetData?.sheetName || '1.メルマガ';
      
      this.logger.log(`[StreamProcessorV2] 🔍 プロンプトスキャン開始:`, {
        spreadsheetId: spreadsheetId ? 'あり' : 'なし',
        sheetName,
        sheetsClient: globalThis.sheetsClient ? 'あり' : 'なし',
        promptCols
      });
      
      if (!spreadsheetId || !globalThis.sheetsClient) {
        this.logger.warn('[StreamProcessorV2] プロンプトスキャンに必要なデータが不足');
        return [];
      }
      
      // 各プロンプト列をスキャン
      for (const colIndex of promptCols) {
        const columnName = this.indexToColumn(colIndex);
        this.logger.log(`[StreamProcessorV2] プロンプト列スキャン開始: ${columnName} (インデックス: ${colIndex})`);
        
        // 列全体を取得（9行目以降の範囲で確認）
        const startRow = 9; // 1ベース
        const endRow = 500; // 最大500行まで確認
        const range = `${columnName}${startRow}:${columnName}${endRow}`;
        
        this.logger.log(`[StreamProcessorV2] 🔍 API呼び出し準備:`, {
          range,
          spreadsheetId,
          sheetName,
          fullUrl: `${columnName}${startRow}から${columnName}${endRow}まで`
        });
        
        const cellValues = await globalThis.sheetsClient.getCellValues(spreadsheetId, sheetName, range);
        
        this.logger.log(`[StreamProcessorV2] 📊 API応答:`, {
          columnName,
          取得セル数: cellValues?.length || 0,
          データサンプル: cellValues?.slice(0, 5) || []
        });
        
        // プロンプトがある行を特定（効率化：連続する空行で終了）
        let emptyRowCount = 0;
        const maxEmptyRows = 20; // 連続する20個の空行で終了
        
        for (let i = 0; i < cellValues.length; i++) {
          const rowIndex = startRow - 1 + i; // 0ベースに変換
          const value = cellValues[i];
          
          if (value && value.trim() && value.trim() !== '') {
            if (!promptRows.includes(rowIndex)) {
              promptRows.push(rowIndex);
            }
            emptyRowCount = 0; // 値があればカウントリセット
          } else {
            emptyRowCount++;
            // 連続する空行が多い場合は終了
            if (emptyRowCount >= maxEmptyRows) {
              this.logger.log(`[StreamProcessorV2] ${columnName}列: ${maxEmptyRows}個の連続空行で検索終了（行${rowIndex + 1}）`);
              break;
            }
          }
        }
      }
      
      promptRows.sort((a, b) => a - b);
      this.logger.log(`[StreamProcessorV2] プロンプト有り行を発見: ${promptRows.map(r => r + 1).join(', ')}`);
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] プロンプトスキャンエラー:`, error);
      return []; // エラー時は空配列を返す
    }
    
    return promptRows || []; // 念のため空配列保証
  }
  
  /**
   * 追加行データを読み込み
   * @param {number} maxRowIndex - 必要な最大行インデックス（0ベース）
   */
  async loadAdditionalRows(maxRowIndex) {
    try {
      const spreadsheetId = this.spreadsheetUrl ? this.extractSpreadsheetId(this.spreadsheetUrl) : null;
      const sheetName = this.spreadsheetData?.sheetName || '1.メルマガ';
      
      if (!spreadsheetId || !globalThis.sheetsClient) {
        return;
      }
      
      const currentRows = this.spreadsheetData.values.length;
      const additionalRowsNeeded = maxRowIndex + 1 - currentRows;
      
      if (additionalRowsNeeded <= 0) {
        return;
      }
      
      // 追加行を読み込み（全列を取得）
      const startRow = currentRows + 1; // 1ベース
      const endRow = maxRowIndex + 1; // 1ベース
      
      this.logger.log(`[StreamProcessorV2] 追加データ取得中: 行${startRow}〜${endRow}`);
      
      // SheetsClientのbatchGetSheetDataを使用して全列データを取得
      const ranges = [];
      for (let row = startRow; row <= endRow; row++) {
        ranges.push(`A${row}:CZ${row}`);
      }
      
      // バッチで取得（最大100行ずつ）
      const batchSize = 100;
      const additionalData = [];
      
      for (let i = 0; i < ranges.length; i += batchSize) {
        const batchRanges = ranges.slice(i, i + batchSize);
        const batchResult = await globalThis.sheetsClient.batchGetSheetData(
          spreadsheetId,
          batchRanges,
          this.spreadsheetData.gid
        );
        
        // 結果を行データに変換
        for (const range of batchRanges) {
          const rowData = batchResult[range] || [];
          additionalData.push(Array.isArray(rowData) ? rowData : []);
        }
      }
      
      // デバッグ：取得したデータを確認
      this.logger.log(`[DEBUG] 追加データ取得結果: ${additionalData.length}行 x ${additionalData[0]?.length || 0}列`);
      
      // 特定行のデバッグ（40-42行目）
      for (let i = 39; i <= 41; i++) {
        const dataIndex = i - currentRows;  // additionalDataのインデックス
        if (dataIndex >= 0 && dataIndex < additionalData.length) {
          const row = additionalData[dataIndex];
          this.logger.log(`[DEBUG] 行${i + 1}のデータ (index=${dataIndex}): B列="${row[1] || ''}", I列="${row[8] || ''}", 列数=${row.length}`);
        }
      }
      
      // spreadsheetData.valuesに追加
      if (additionalData && Array.isArray(additionalData)) {
        // 各行を既存データと同じ幅にパディング
        const maxColumns = Math.max(...this.spreadsheetData.values.map(row => row.length));
        const paddedData = additionalData.map(row => {
          const paddedRow = [...row];
          while (paddedRow.length < maxColumns) {
            paddedRow.push('');
          }
          return paddedRow;
        });
        
        this.spreadsheetData.values.push(...paddedData);
        this.logger.log(`[StreamProcessorV2] 追加行読み込み完了: ${additionalData.length}行追加（全${maxColumns}列）`);
      }
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] 追加行読み込みエラー:`, error);
    }
  }

  /**
   * スプレッドシートURLからIDを抽出
   */
  extractSpreadsheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }
}