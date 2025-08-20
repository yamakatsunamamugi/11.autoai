/**
 * @fileoverview タスクファクトリー
 * 
 * 概要:
 * 統合テストと本番環境の両方で使用されるタスクリスト作成の共通インターフェース。
 * データソースに応じて適切な方法でタスクリストを生成します。
 * 
 * 特徴:
 * - スプレッドシートからのタスク生成（本番）
 * - 手動作成タスクリストの注入（テスト）
 * - 統一されたTaskListオブジェクトの返却
 * 
 * @module TaskFactory
 */

import TaskGenerator from './generator.js';

export class TaskFactory {
  constructor(logger = console) {
    this.logger = logger;
    this.taskGenerator = new TaskGenerator();
  }

  /**
   * タスクリストを作成
   * @param {Object} options - 作成オプション
   * @param {string} options.source - データソース ('spreadsheet' | 'manual')
   * @param {Object} options.spreadsheetData - スプレッドシートデータ（source='spreadsheet'の場合）
   * @param {Object} options.taskList - 手動作成のタスクリスト（source='manual'の場合）
   * @returns {Promise<Object>} TaskListオブジェクト
   */
  async createTaskList(options) {
    const { source = 'spreadsheet' } = options;
    
    this.logger.log(`[TaskFactory] タスクリスト作成開始:`, {
      source,
      hasSpreadsheetData: !!options.spreadsheetData,
      hasTaskList: !!options.taskList
    });

    try {
      if (source === 'spreadsheet') {
        // 本番モード：TaskGeneratorを使用してスプレッドシートから生成
        if (!options.spreadsheetData) {
          throw new Error('spreadsheetDataが必要です');
        }
        
        const result = this.taskGenerator.generateTasks(options.spreadsheetData);
        
        this.logger.log(`[TaskFactory] スプレッドシートからタスク生成完了:`, {
          totalTasks: result.tasks.length,
          columns: [...new Set(result.tasks.map(t => t.column))].sort()
        });
        
        return result;
        
      } else if (source === 'manual') {
        // テストモード：手動作成のタスクリストをそのまま返却
        if (!options.taskList) {
          throw new Error('taskListが必要です');
        }
        
        // TaskListオブジェクトの形式を検証
        this.validateTaskList(options.taskList);
        
        this.logger.log(`[TaskFactory] 手動タスクリスト使用:`, {
          totalTasks: options.taskList.tasks.length,
          columns: [...new Set(options.taskList.tasks.map(t => t.column))].sort()
        });
        
        return options.taskList;
        
      } else {
        throw new Error(`不明なソース: ${source}`);
      }
      
    } catch (error) {
      this.logger.error(`[TaskFactory] タスクリスト作成エラー:`, error);
      throw error;
    }
  }

  /**
   * タスクリストの形式を検証
   * @param {Object} taskList - 検証対象のタスクリスト
   * @throws {Error} 形式が不正な場合
   */
  validateTaskList(taskList) {
    if (!taskList || typeof taskList !== 'object') {
      throw new Error('taskListはオブジェクトである必要があります');
    }
    
    if (!Array.isArray(taskList.tasks)) {
      throw new Error('taskList.tasksは配列である必要があります');
    }
    
    // 各タスクの必須フィールドを検証
    taskList.tasks.forEach((task, index) => {
      const requiredFields = ['id', 'aiType', 'column', 'row', 'prompt'];
      const missingFields = requiredFields.filter(field => !(field in task));
      
      if (missingFields.length > 0) {
        throw new Error(`タスク[${index}]に必須フィールドがありません: ${missingFields.join(', ')}`);
      }
    });
    
    // getStatisticsメソッドが存在しない場合は追加
    if (typeof taskList.getStatistics !== 'function') {
      taskList.getStatistics = () => {
        const byAI = {};
        const aiTypes = [...new Set(taskList.tasks.map(t => t.aiType))];
        
        aiTypes.forEach(aiType => {
          byAI[aiType] = taskList.tasks.filter(t => t.aiType === aiType).length;
        });
        
        return {
          total: taskList.tasks.length,
          byAI: byAI,
          byColumn: this.getColumnStatistics(taskList.tasks)
        };
      };
    }
  }

  /**
   * 列ごとのタスク統計を取得
   * @param {Array<Object>} tasks - タスクの配列
   * @returns {Object} 列ごとのタスク数
   */
  getColumnStatistics(tasks) {
    const byColumn = {};
    const columns = [...new Set(tasks.map(t => t.column))].sort();
    
    columns.forEach(column => {
      byColumn[column] = tasks.filter(t => t.column === column).length;
    });
    
    return byColumn;
  }

  /**
   * テスト用のダミータスクリストを作成
   * @param {Object} config - 設定
   * @param {Array<string>} config.aiTypes - AI種別の配列
   * @param {Array<string>} config.columns - 列の配列
   * @param {Array<number>} config.rows - 行番号の配列
   * @param {string} config.prompt - プロンプトテキスト
   * @returns {Object} TaskListオブジェクト
   */
  createTestTaskList(config) {
    const { aiTypes = ['chatgpt'], columns = ['D'], rows = [9], prompt = 'テストプロンプト' } = config;
    const tasks = [];
    let taskId = 1;
    
    columns.forEach(column => {
      rows.forEach(row => {
        aiTypes.forEach(aiType => {
          tasks.push({
            id: `test-${taskId++}`,
            aiType: aiType.toLowerCase(),
            column: column,
            row: row,
            prompt: prompt,
            model: 'default',
            specialOperation: null,
            waitResponse: true,
            getResponse: true,
            taskType: 'ai'
          });
        });
      });
    });
    
    const taskList = {
      tasks,
      getStatistics: () => {
        const byAI = {};
        aiTypes.forEach(aiType => {
          byAI[aiType] = tasks.filter(t => t.aiType === aiType).length;
        });
        
        return {
          total: tasks.length,
          byAI,
          byColumn: this.getColumnStatistics(tasks)
        };
      }
    };
    
    this.logger.log(`[TaskFactory] テストタスクリスト作成:`, taskList.getStatistics());
    
    return taskList;
  }
}

// デフォルトインスタンスをエクスポート
export const taskFactory = new TaskFactory();