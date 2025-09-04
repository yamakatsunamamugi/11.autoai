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

export default class StreamProcessorV2 {
  constructor(logger = console) {
    this.logger = logger;
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.completedTasks = new Set();
    this.failedTasks = new Set();
    this.writtenCells = new Map();
    this.spreadsheetData = null;
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
   * バッチ内のタスクを並列処理
   */
  async processBatch(batch, isTestMode) {
    this.logger.log(`[StreamProcessorV2] 🚀 バッチ並列処理開始`, {
      tasks: batch.map(t => `${t.column}${t.row}`).join(', '),
      concurrency: batch.length
    });

    // バッチ内の全タスクを並列実行（位置指定付き）
    const promises = batch.map((task, index) => {
      // 3つのウィンドウを4分割で配置（左上、右上、左下）
      const position = index; // 0: 左上、1: 右上、2: 左下
      return this.processTask(task, isTestMode, position);
    });
    await Promise.all(promises);
    
    this.logger.log(`[StreamProcessorV2] ✅ バッチ並列処理完了`);
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
      
      await this.aiTaskExecutor.executeAITask(tabId, taskData);
      
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
      let promptColIndex;
      if (task.promptColumns && task.promptColumns.length > 0) {
        // タスクにpromptColumns情報がある場合は、最初のプロンプト列を使用
        promptColIndex = task.promptColumns[0];
        this.logger.log(`[StreamProcessorV2] プロンプト列情報使用: index=${promptColIndex}`);
      } else {
        // フォールバック：task.columnを使用（通常のAI列の場合）
        promptColIndex = this.columnToIndex(task.column);
        this.logger.log(`[StreamProcessorV2] タスク列使用: ${task.column} (index=${promptColIndex})`);
      }
      
      this.logger.log(`[StreamProcessorV2] プロンプト取得試行`, {
        タスク列: task.column,
        プロンプト列: this.indexToColumn(promptColIndex),
        行番号: task.row,
        インデックス: rowIndex,
        配列長: this.spreadsheetData.values.length
      });

      if (rowIndex < 0 || rowIndex >= this.spreadsheetData.values.length) {
        throw new Error(`Row ${task.row} not found in spreadsheet data (index: ${rowIndex}, array length: ${this.spreadsheetData.values.length})`);
      }

      const row = this.spreadsheetData.values[rowIndex];
      
      if (!row || promptColIndex >= row.length) {
        // セルが存在しない場合は空文字列として扱う
        this.logger.warn(`[StreamProcessorV2] Cell at column index ${promptColIndex} row ${task.row} not found, treating as empty`);
        return '';
      }

      const prompt = row[promptColIndex];
      if (!prompt || prompt.trim() === '') {
        // 空のプロンプトの場合はデバッグ情報を出力
        this.logger.warn(`[StreamProcessorV2] Empty prompt at column index ${promptColIndex} row ${task.row}`, {
          rowData: row.slice(Math.max(0, promptColIndex - 1), promptColIndex + 2) // 前後の列も確認
        });
        // エラーにせず、デフォルトのプロンプトを返す
        return `テスト - ${this.indexToColumn(promptColIndex)}${task.row}`;
      }

      this.logger.log(`[StreamProcessorV2] プロンプト取得成功: ${this.indexToColumn(promptColIndex)}${task.row}`, {
        プロンプト長: prompt.length,
        プレビュー: prompt.substring(0, 50)
      });
      return prompt.trim();
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