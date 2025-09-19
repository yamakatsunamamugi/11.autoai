/**
 * @fileoverview ColumnTaskManager - 列ごとのタスク管理
 * 
 * 正しい認識:
 * タスク1: C列の通常処理（全行）
 * タスク2: 3種類AI（EFGHI列、全行） 
 * タスク3: レポート化（J列、全行）
 * タスク4: K列の通常処理（全行）
 * 
 * 処理フロー:
 * 1. アルファベット順で最も早いタスクから開始
 * 2. そのタスクの全行を完了
 * 3. 空白チェック実施
 * 4. 空白があれば再処理、なければ次のタスクへ
 */

import BlankChecker from './blank-checker.js';

/**
 * 列タスク定義
 */
class ColumnTask {
  constructor(data) {
    this.taskNumber = data.taskNumber;           // タスク番号 (1, 2, 3, 4...)
    this.taskName = data.taskName;               // タスク名 ("C列の通常処理")
    this.taskType = data.taskType;               // タスク種別 ('single', '3type', 'report')
    this.columns = data.columns;                 // 対象列 ['C'] or ['E','F','G'] など
    this.promptColumns = data.promptColumns;     // プロンプト列 ['B'] or ['D'] など
    this.logColumns = data.logColumns;           // ログ列 ['A'] or ['C'] など
    this.priority = data.priority;               // 優先度（アルファベット順）
    this.aiTypes = data.aiTypes;                 // AI種別 ['chatgpt'] or ['chatgpt','claude','gemini']
    this.isCompleted = false;                    // 完了フラグ
    this.blankCheckResult = null;                // 空白チェック結果
    this.startColumn = data.startColumn;         // 開始列（アルファベット順の基準）
  }
  
  /**
   * タスクの対象行データを取得
   */
  getTasksForRows(workRows, spreadsheetData, structure) {
    const tasks = [];
    
    for (const workRow of workRows) {
      // このタスクタイプに応じてタスクを生成
      if (this.taskType === '3type') {
        // 3種類AI: ChatGPT, Claude, Gemini の3つのタスク
        const aiTypes = ['chatgpt', 'claude', 'gemini'];
        for (let i = 0; i < this.columns.length && i < aiTypes.length; i++) {
          tasks.push({
            id: `${this.columns[i]}${workRow.number}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            column: this.columns[i],
            row: workRow.number,
            aiType: aiTypes[i],
            taskType: 'ai',
            promptColumns: this.promptColumns,
            logColumns: this.logColumns,
            columnTaskNumber: this.taskNumber,
            columnTaskType: this.taskType
          });
        }
      } else {
        // 通常処理・レポート化: 1つのタスク
        const aiType = this.taskType === 'report' ? 'chatgpt' : (this.aiTypes?.[0] || 'chatgpt');
        tasks.push({
          id: `${this.columns[0]}${workRow.number}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          column: this.columns[0],
          row: workRow.number,
          aiType: aiType,
          taskType: this.taskType === 'report' ? 'report' : 'ai',
          promptColumns: this.promptColumns,
          logColumns: this.logColumns,
          columnTaskNumber: this.taskNumber,
          columnTaskType: this.taskType
        });
      }
    }
    
    return tasks;
  }
}

/**
 * 列ごとのタスク管理クラス
 */
export class ColumnTaskManager {
  constructor(logger = console) {
    this.logger = logger;
    this.blankChecker = new BlankChecker(logger);
    this.columnTasks = [];                       // ColumnTask配列
    this.currentTaskIndex = 0;                   // 現在処理中のタスクインデックス
  }
  
  /**
   * スプレッドシート構造からタスクリストを生成
   */
  generateColumnTaskList(structure, spreadsheetData, options = {}) {
    this.logger.info('ColumnTaskManager', '列タスクリスト生成開始');
    
    const { promptGroups, controls } = structure;
    
    // 列制御でフィルタリング
    const processableGroups = this.filterGroupsByColumnControl(promptGroups, controls.column);
    
    this.logger.info('ColumnTaskManager', '処理可能グループ', {
      totalGroups: promptGroups.length,
      processableGroups: processableGroups.length,
      groups: processableGroups.map(g => ({
        logColumn: g.logColumn,
        promptColumns: g.promptColumns.map(i => this.indexToColumn(i)),
        answerColumns: g.answerColumns.map(a => a.column),
        aiType: g.aiType
      }))
    });
    
    // 各グループから列タスクを作成
    let taskNumber = 1;
    const columnTasks = [];
    
    for (const group of processableGroups) {
      const columnTask = this.createColumnTaskFromGroup(group, taskNumber);
      columnTasks.push(columnTask);
      taskNumber++;
    }
    
    // 優先度順（アルファベット順）にソート
    columnTasks.sort((a, b) => a.priority - b.priority);
    
    // タスク番号を振り直し
    columnTasks.forEach((task, index) => {
      task.taskNumber = index + 1;
    });
    
    this.columnTasks = columnTasks;
    this.currentTaskIndex = 0;
    
    this.logger.info('ColumnTaskManager', '列タスクリスト生成完了', {
      totalTasks: this.columnTasks.length,
      tasks: this.columnTasks.map(t => ({
        taskNumber: t.taskNumber,
        taskName: t.taskName,
        taskType: t.taskType,
        columns: t.columns,
        startColumn: t.startColumn
      }))
    });
    
    return this.columnTasks;
  }
  
  /**
   * グループから列タスクを作成
   */
  createColumnTaskFromGroup(group, taskNumber) {
    const startColumn = group.logColumn || this.indexToColumn(group.promptColumns[0]);
    const priority = this.calculateColumnPriority(startColumn);
    
    let taskName, taskType, columns, aiTypes;
    
    if (group.aiType === '3type') {
      // 3種類AI
      taskName = `3種類AI（${group.answerColumns.map(a => a.column).join('')}列）`;
      taskType = '3type';
      columns = group.answerColumns.map(a => a.column);
      aiTypes = ['chatgpt', 'claude', 'gemini'];
    } else if (group.reportColumn !== undefined) {
      // レポート化
      const reportColumn = this.indexToColumn(group.reportColumn);
      taskName = `レポート化（${reportColumn}列）`;
      taskType = 'report';
      columns = [reportColumn];
      aiTypes = ['chatgpt'];
    } else {
      // 通常処理
      const answerColumn = group.answerColumns[0]?.column;
      taskName = `${answerColumn}列の通常処理`;
      taskType = 'single';
      columns = [answerColumn];
      aiTypes = [group.answerColumns[0]?.type || 'chatgpt'];
    }
    
    return new ColumnTask({
      taskNumber: taskNumber,
      taskName: taskName,
      taskType: taskType,
      columns: columns,
      promptColumns: group.promptColumns.map(i => this.indexToColumn(i)),
      logColumns: group.logColumn ? [group.logColumn] : [],
      priority: priority,
      aiTypes: aiTypes,
      startColumn: startColumn
    });
  }
  
  /**
   * 現在のタスクを取得
   */
  getCurrentTask() {
    if (this.currentTaskIndex >= this.columnTasks.length) {
      return null; // 全タスク完了
    }
    return this.columnTasks[this.currentTaskIndex];
  }
  
  /**
   * 次のタスクに進む
   */
  moveToNextTask() {
    this.currentTaskIndex++;
    this.logger.info('ColumnTaskManager', '次のタスクに進行', {
      currentIndex: this.currentTaskIndex,
      totalTasks: this.columnTasks.length
    });
  }
  
  /**
   * タスクの空白をチェック
   */
  async checkTaskBlanks(columnTask, spreadsheetData, workRows, rowControls) {
    this.logger.info('ColumnTaskManager', 'タスク空白チェック開始', { taskName: columnTask.taskName });
    
    // 列タスク用のプロンプトグループ形式に変換
    const promptGroup = {
      groupId: `column_task_${columnTask.taskNumber}`,
      aiType: columnTask.taskType,
      answerColumns: columnTask.columns.map(col => ({
        column: col,
        index: this.columnToIndex(col),
        type: columnTask.taskType
      })),
      reportColumn: columnTask.taskType === 'report' ? this.columnToIndex(columnTask.columns[0]) : undefined
    };
    
    const result = this.blankChecker.checkGroupBlanks(
      spreadsheetData,
      promptGroup,
      rowControls,
      workRows
    );
    
    columnTask.blankCheckResult = result;
    
    this.logger.info('ColumnTaskManager', 'タスク空白チェック完了', {
      taskName: columnTask.taskName,
      totalBlanks: result.totalBlanks,
      isComplete: result.isComplete,
      blankCells: result.blankCells.map(c => c.cell)
    });
    
    return result;
  }
  
  /**
   * タスク完了をマーク
   */
  markTaskCompleted(columnTask) {
    columnTask.isCompleted = true;
    this.logger.info('ColumnTaskManager', 'タスク完了', { taskName: columnTask.taskName });
  }
  
  /**
   * 全体の進捗を取得
   */
  getProgress() {
    const completedTasks = this.columnTasks.filter(t => t.isCompleted).length;
    return {
      currentTaskIndex: this.currentTaskIndex,
      totalTasks: this.columnTasks.length,
      completedTasks: completedTasks,
      currentTask: this.getCurrentTask()?.taskName,
      allCompleted: completedTasks === this.columnTasks.length
    };
  }
  
  /**
   * 列制御でグループをフィルタリング（TaskGeneratorから移植）
   */
  filterGroupsByColumnControl(groups, columnControls) {
    if (!columnControls || columnControls.length === 0) {
      return groups;
    }

    // "この列のみ処理"が優先（他の制御を無視）
    const onlyControls = columnControls.filter(c => c.type === "only");
    if (onlyControls.length > 0) {
      return groups.filter(group => {
        const logColumnIndex = this.columnToIndex(group.logColumn);
        const logMatch = logColumnIndex !== null && onlyControls.some(ctrl => ctrl.index === logColumnIndex);
        
        const promptMatch = group.promptColumns.some(colIndex => 
          onlyControls.some(ctrl => ctrl.index === colIndex)
        );
        
        const answerMatch = group.answerColumns.some(answerCol => 
          onlyControls.some(ctrl => ctrl.index === answerCol.index)
        );
        
        return logMatch || promptMatch || answerMatch;
      });
    }

    // "この列から処理"と"この列で停止"の組み合わせ
    const fromControl = columnControls.find(c => c.type === "from");
    const untilControl = columnControls.find(c => c.type === "until");

    return groups.filter(group => {
      const logColumnIndex = this.columnToIndex(group.logColumn);
      const groupStart = logColumnIndex !== null ? logColumnIndex : group.promptColumns[0];

      let shouldProcess = true;

      if (fromControl) {
        const groupColumns = [];
        if (logColumnIndex !== null) groupColumns.push(logColumnIndex);
        groupColumns.push(...group.promptColumns);
        groupColumns.push(...group.answerColumns.map(a => a.index));
        
        const hasColumnAtOrAfterFrom = groupColumns.some(colIndex => colIndex >= fromControl.index);
        if (!hasColumnAtOrAfterFrom) {
          shouldProcess = false;
        }
      }

      if (untilControl) {
        const groupColumns = [];
        if (logColumnIndex !== null) groupColumns.push(logColumnIndex);
        groupColumns.push(...group.promptColumns);
        groupColumns.push(...group.answerColumns.map(a => a.index));
        
        const hasColumnAtOrBeforeUntil = groupColumns.some(colIndex => colIndex <= untilControl.index);
        if (!hasColumnAtOrBeforeUntil) {
          shouldProcess = false;
        }
      }

      return shouldProcess;
    });
  }
  
  /**
   * 列優先度を計算（アルファベット順）
   */
  calculateColumnPriority(columnName) {
    if (!columnName) return 999;
    
    let priority = 0;
    for (let i = 0; i < columnName.length; i++) {
      priority = priority * 26 + (columnName.charCodeAt(i) - 64);
    }
    
    return priority;
  }
  
  /**
   * インデックスを列名に変換
   */
  indexToColumn(index) {
    let column = '';
    let num = index;
    
    while (num >= 0) {
      column = String.fromCharCode(65 + (num % 26)) + column;
      num = Math.floor(num / 26) - 1;
      if (num < 0) break;
    }
    
    return column;
  }
  
  /**
   * 列名をインデックスに変換
   */
  columnToIndex(columnName) {
    if (!columnName || typeof columnName !== 'string') {
      return null;
    }
    
    let result = 0;
    const upperColumn = columnName.toUpperCase();
    
    for (let i = 0; i < upperColumn.length; i++) {
      result = result * 26 + (upperColumn.charCodeAt(i) - 64);
    }
    
    return result - 1; // 0-based index
  }
}

export default ColumnTaskManager;