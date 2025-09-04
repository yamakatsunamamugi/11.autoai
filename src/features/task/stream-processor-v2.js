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
        console.log('[StreamProcessorV2] グローバルからSpreadsheetLoggerを取得');
      } else if (globalThis.spreadsheetLogger) {
        SpreadsheetLogger = globalThis.spreadsheetLogger.constructor;
        console.log('[StreamProcessorV2] グローバルインスタンスからSpreadsheetLoggerクラスを取得');
      } else {
        console.warn('[StreamProcessorV2] SpreadsheetLoggerがグローバルに見つかりません');
        return null;
      }
    } catch (error) {
      console.warn('[StreamProcessorV2] SpreadsheetLoggerの取得に失敗', error);
      return null;
    }
  }
  return SpreadsheetLogger;
}

export default class StreamProcessorV2 {
  constructor(logger = console) {
    this.logger = logger;
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.completedTasks = new Set();
    this.failedTasks = new Set();
    this.writtenCells = new Map();
    this.spreadsheetData = null;
    this.spreadsheetLogger = null;
    this.isFirstTaskProcessed = false;
    
    // SpreadsheetLoggerを非同期で初期化
    this.initializeSpreadsheetLogger();
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
        this.logger.log('[StreamProcessorV2] SpreadsheetLoggerを初期化しました');
      }
    } catch (error) {
      this.logger.warn('[StreamProcessorV2] SpreadsheetLogger初期化エラー:', error.message);
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
    
    // テスト用: F列の最初の3タスクのみ処理
    let tasksToProcess = taskList.tasks;
    
    if (isTestMode || taskList.tasks.length > 30) {
      // F列のタスクのみ抽出して最初の3つに制限
      const fColumnTasks = taskList.tasks.filter(task => task.column === 'F').slice(0, 3);
      tasksToProcess = fColumnTasks.length > 0 ? fColumnTasks : taskList.tasks.slice(0, 3);
    }

    this.logger.log('[StreamProcessorV2] 🚀 3行バッチ処理開始', {
      元タスク数: taskList.tasks.length,
      処理タスク数: tasksToProcess.length,
      テストモード: isTestMode,
      制限適用: taskList.tasks.length > 30 ? 'あり' : 'なし'
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
   * バッチ内のタスクを並列処理（5秒間隔で開始）
   */
  async processBatch(batch, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🚀 バッチ並列処理開始`, {
      tasks: batch.map(t => `${t.column}${t.row}`).join(', '),
      taskCount: batch.length,
      interval: '5秒間隔で開始'
    });

    const taskPromises = [];
    
    // バッチ内のタスクを5秒間隔で開始（並列実行）
    for (let index = 0; index < batch.length; index++) {
      const task = batch[index];
      
      try {
        this.logger.log(`[StreamProcessorV2] タスク${index + 1}/${batch.length}開始: ${task.column}${task.row}`);
        
        // ウィンドウ位置を設定（3つのウィンドウを4分割で配置）
        const position = index; // 0: 左上、1: 右上、2: 左下
        
        // タスクを開始（awaitしない - 並列実行）
        const taskPromise = this.processTask(task, isTestMode, position)
          .then(() => {
            this.logger.log(`[StreamProcessorV2] ✅ タスク完了: ${task.column}${task.row}`);
          })
          .catch(error => {
            this.logger.error(`[StreamProcessorV2] ❌ タスクエラー: ${task.column}${task.row}`, error);
          });
        
        taskPromises.push(taskPromise);
        
        // 最後のタスクでない場合は5秒待機してから次のタスクを開始
        if (index < batch.length - 1) {
          this.logger.log(`[StreamProcessorV2] 次のタスク開始まで5秒待機...`);
          await this.delay(5000);
        }
        
      } catch (error) {
        this.logger.error(`[StreamProcessorV2] タスク${index + 1}開始エラー:`, error);
        // エラーが発生しても次のタスクを継続
      }
    }
    
    // すべてのタスクの完了を待つ
    this.logger.log(`[StreamProcessorV2] 全タスクの完了を待機中...`);
    const results = await Promise.allSettled(taskPromises);
    
    // 結果をログ出力
    const completed = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    this.logger.log(`[StreamProcessorV2] ✅ バッチ処理完了`, {
      完了: completed,
      失敗: failed,
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
        
        // ログを書き込み（SpreadsheetLoggerを使用）
        // デバッグ: ログ書き込み条件チェック
        console.log(`🔍 [ログ書き込み条件チェック]`, {
          hasSpreadsheetLogger: !!this.spreadsheetLogger,
          hasLogColumns: !!(task.logColumns),
          logColumnsLength: task.logColumns?.length,
          logColumns値: task.logColumns,
          条件成立: !!(this.spreadsheetLogger && task.logColumns && task.logColumns.length > 0)
        });
        
        if (this.spreadsheetLogger && task.logColumns && task.logColumns.length > 0) {
          try {
            this.logger.log(`[StreamProcessorV2] 📝 ログ書き込み準備`, {
              hasSpreadsheetLogger: !!this.spreadsheetLogger,
              hasWriteMethod: !!(this.spreadsheetLogger?.writeLogToSpreadsheet),
              taskId: task.id,
              row: task.row,
              logColumns: task.logColumns
            });
            
            // 現在のURLを取得
            let currentUrl = 'N/A';
            try {
              const tab = await chrome.tabs.get(tabId);
              currentUrl = tab.url || 'N/A';
            } catch (e) {
              // URLの取得に失敗しても処理は継続
            }
            
            // モデル情報を追加したタスクオブジェクトを作成
            const taskWithModel = {
              ...task,
              model: task.model || 'Auto',
              function: task.function || '通常'
            };
            
            // 3種類AIグループかどうかを判定
            const isGroupTask = task.groupId && task.groupType === '3type';
            const isFirstInGroup = isGroupTask && task.groupPosition === 0;
            const isLastInGroup = isGroupTask && task.groupPosition === 2;
            
            await this.spreadsheetLogger.writeLogToSpreadsheet(taskWithModel, {
              url: currentUrl,
              sheetsClient: globalThis.sheetsClient,
              spreadsheetId,
              gid,
              isFirstTask: !this.isFirstTaskProcessed || isFirstInGroup,
              isGroupTask: isGroupTask,
              isLastInGroup: isLastInGroup,
              enableWriteVerification: false // 書き込み確認は無効化（パフォーマンスのため）
            });
            
            this.isFirstTaskProcessed = true;
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
      }
      
      this.completedTasks.add(task.id);
      this.writtenCells.set(`${task.column}${task.row}`, true);
      
      this.logger.log(`[StreamProcessorV2] ✅ ${task.column}${task.row}処理完了`);
      
    } catch (error) {
      this.logger.error(`[StreamProcessorV2] タスク処理エラー ${task.column}${task.row}:`, error);
      this.failedTasks.add(task.id);
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

}