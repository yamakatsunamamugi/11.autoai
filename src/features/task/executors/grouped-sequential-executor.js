/**
 * @fileoverview GroupedSequentialExecutor - 列ごと順次実行
 * 
 * 正しい処理フロー:
 * タスク1: C列の通常処理（全行）
 * タスク2: 3種類AI（EFGHI列、全行）
 * タスク3: レポート化（J列、全行）  
 * タスク4: K列の通常処理（全行）
 * 
 * 実行順序:
 * 1. アルファベット順で最も早いタスク（列グループ）から開始
 * 2. そのタスクの全行を完了
 * 3. 空白チェック実施
 * 4. 空白があれば再処理、なければ次のタスクへ
 * 5. プロンプトはセル位置から取得して使用
 */

import ColumnTaskManager from '../column-task-manager.js';
import logger from '../../../utils/logger.js';
import StreamProcessor from '../stream-processor.js';
import { TaskList } from '../models.js';

/**
 * 列ごと順次実行クラス
 * 列（または列グループ）単位でタスクを管理し、アルファベット順に実行する
 */
// BaseExecutorを継承せずに独立したクラスとして実装
class GroupedSequentialExecutor {
  constructor(dependencies = {}) {
    // 基本プロパティを直接初期化
    this.logger = dependencies.logger || logger;
    this.isTestMode = dependencies.isTestMode || false;
    this.activeWindows = new Map();
    this.completedTasks = new Set();
    
    // 列タスク管理専用の状態
    this.columnTaskManager = new ColumnTaskManager(this.logger);
    this.currentColumnTask = null;      // 現在処理中の列タスク
    this.maxConcurrentWindows = 1;      // 列ごと順次実行のため1つ
    this.currentTaskRows = [];          // 現在のタスクの行データ
    
    // 従来システムとの統合
    this.streamProcessor = new StreamProcessor();
    this.currentSpreadsheetData = null; // 現在のスプレッドシートデータを保持
    
    this.logger.info('GroupedSequentialExecutor', '列ごと順次実行システム初期化完了（従来システム統合版）');
  }
  
  /**
   * 列ごと順次実行でタスクストリームを処理
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    this.logger.info('GroupedSequentialExecutor', '列ごと順次実行処理開始（従来システム統合版）', {
      totalTasks: taskList.tasks.length,
      sheetName: spreadsheetData.sheetName
    });
    
    // スプレッドシートデータと元のタスクリストを保持（空白処理で使用）
    this.currentSpreadsheetData = spreadsheetData;
    this.originalTaskList = taskList;
    
    try {
      // 既存のtaskListから構造情報を抽出（二重解析を避ける）
      const structure = this.extractStructureFromTaskList(taskList, spreadsheetData);
      
      // 列タスクリストを生成
      const columnTasks = this.columnTaskManager.generateColumnTaskList(structure, spreadsheetData, options);
      
      this.logger.info('GroupedSequentialExecutor', '列ごと順次実行開始', {
        totalColumnTasks: columnTasks.length,
        tasks: columnTasks.map(t => `${t.taskNumber}. ${t.taskName}`)
      });
      
      // 列ごと順次実行開始
      await this.startColumnSequentialExecution(structure, spreadsheetData);
      
      return {
        success: true,
        executionPattern: 'column_sequential',
        processedColumnTasks: columnTasks.map(t => t.taskName),
        totalTasks: taskList.tasks.length,
        completedTasks: this.completedTasks.size
      };
      
    } catch (error) {
      this.logger.error('GroupedSequentialExecutor', 'processTaskStream エラー', error);
      throw error;
    } finally {
      this.logger.info('GroupedSequentialExecutor', 'クリーンアップ実行');
      // アクティブウィンドウがあれば閉じる
      if (this.activeWindows.size > 0) {
        this.logger.info('GroupedSequentialExecutor', `${this.activeWindows.size}個のウィンドウをクリーンアップ`);
        this.activeWindows.clear();
      }
    }
  }
  
  /**
   * スプレッドシート構造を解析
   */
  analyzeSpreadsheetStructure(spreadsheetData) {
    // 基本的な行を特定
    const rows = {
      menu: this.findRowByKeyword(spreadsheetData, "メニュー"),
      ai: this.findRowByKeyword(spreadsheetData, "AI"),
      model: this.findRowByKeyword(spreadsheetData, "モデル"),
      task: this.findRowByKeyword(spreadsheetData, "機能")
    };

    if (!rows.menu) {
      throw new Error("メニュー行が見つかりません");
    }

    // プロンプトグループを識別
    const promptGroups = this.identifyPromptGroups(rows.menu, rows.ai);
    
    // 制御情報を収集
    const controls = this.collectControls(spreadsheetData);
    
    // 作業行を取得
    const workRows = this.getWorkRows(spreadsheetData);

    return {
      rows,
      promptGroups,
      controls,
      workRows
    };
  }
  
  /**
   * 列ごと順次実行を開始（進行状況表示改善版）
   */
  async startColumnSequentialExecution(structure, spreadsheetData) {
    let progress = this.columnTaskManager.getProgress();
    
    this.logger.info('GroupedSequentialExecutor', '列タスク実行開始', {
      totalTasks: progress.totalTasks,
      currentTask: progress.currentTask,
      workRows: structure.workRows.length
    });
    
    // 実行開始時の全体状況をユーザーに表示
    this.displayExecutionPlan(progress);
    
    let loopCount = 0;
    const maxLoopCount = progress.totalTasks * 2; // 無限ループ防止
    
    // 全ての列タスクを順次実行
    while (!progress.allCompleted && loopCount < maxLoopCount) {
      const currentTask = this.columnTaskManager.getCurrentTask();
      if (!currentTask) {
        this.logger.warn('GroupedSequentialExecutor', '現在のタスクがnullです。実行を終了します。');
        break;
      }
      
      // 現在のタスク開始をユーザーに通知
      this.logger.info('GroupedSequentialExecutor', `🚀 タスク${currentTask.taskNumber}開始`, {
        taskName: currentTask.taskName,
        columns: currentTask.columns,
        progress: `${progress.currentTaskIndex + 1}/${progress.totalTasks}`
      });
      
      const taskStartTime = Date.now();
      
      try {
        await this.processColumnTask(currentTask, structure, spreadsheetData, this.originalTaskList);
        
        const taskDuration = Date.now() - taskStartTime;
        this.logger.info('GroupedSequentialExecutor', `✅ タスク${currentTask.taskNumber}完了`, {
          taskName: currentTask.taskName,
          duration: `${Math.round(taskDuration / 1000)}秒`,
          progress: `${progress.completedTasks + 1}/${progress.totalTasks}`
        });
        
      } catch (error) {
        this.logger.error('GroupedSequentialExecutor', `❌ タスク${currentTask.taskNumber}エラー`, {
          taskName: currentTask.taskName,
          error: error.message
        });
        
        // エラーがあっても次のタスクに進む（強制進行）
        this.columnTaskManager.moveToNextTask();
      }
      
      // 進捗更新と無限ループチェック
      const newProgress = this.columnTaskManager.getProgress();
      if (newProgress.currentTaskIndex === progress.currentTaskIndex) {
        this.logger.warn('GroupedSequentialExecutor', '進捗が更新されていません。無限ループを防止します。', {
          currentTaskIndex: progress.currentTaskIndex,
          taskName: currentTask.taskName
        });
        break;
      }
      
      progress = newProgress;
      loopCount++;
    }
    
    // 実行完了サマリー
    const finalProgress = this.columnTaskManager.getProgress();
    this.logger.info('GroupedSequentialExecutor', '🎉 全列タスク実行完了', {
      completedTasks: finalProgress.completedTasks,
      totalTasks: finalProgress.totalTasks,
      allCompleted: finalProgress.allCompleted,
      loopCount: loopCount
    });
  }
  
  /**
   * 実行計画をユーザーに表示
   * @param {Object} progress - 進行状況
   */
  displayExecutionPlan(progress) {
    this.logger.info('GroupedSequentialExecutor', '📋 実行計画', {
      message: `${progress.totalTasks}個の列タスクを順次実行します`,
      tasks: this.columnTaskManager.columnTasks.map(t => 
        `タスク${t.taskNumber}: ${t.taskName} (${t.columns.join(', ')}列)`
      )
    });
  }
  
  /**
   * 単一の列タスクを処理
   */
  async processColumnTask(columnTask, structure, spreadsheetData, originalTaskList = null) {
    this.currentColumnTask = columnTask;
    
    this.logger.log(`[GroupedSequentialExecutor] 列タスク開始: ${columnTask.taskName}`, {
      taskNumber: columnTask.taskNumber,
      taskType: columnTask.taskType,
      columns: columnTask.columns
    });
    
    let retryCount = 0;
    const maxRetries = 3;
    
    // 空白がなくなるまで繰り返し
    while (retryCount <= maxRetries) {
      // 1. このタスクの全行を実行
      await this.executeColumnTaskRows(columnTask, structure, spreadsheetData);
      
      // 2. 空白チェック実行
      const blankCheckResult = await this.columnTaskManager.checkTaskBlanks(
        columnTask,
        spreadsheetData,
        structure.workRows,
        structure.controls.row
      );
      
      // 3. 空白がなければ完了
      if (blankCheckResult.isComplete) {
        this.columnTaskManager.markTaskCompleted(columnTask);
        this.columnTaskManager.moveToNextTask();
        
        this.logger.info('GroupedSequentialExecutor', `✅ 列タスク完了: ${columnTask.taskName}`);
        break;
      } else {
        retryCount++;
        this.logger.warn('GroupedSequentialExecutor', `⚠️ 空白検出、従来システムで再処理 (${retryCount}/${maxRetries})`, {
          totalBlanks: blankCheckResult.totalBlanks,
          blankCells: blankCheckResult.blankCells.map(c => c.cell)
        });
        
        if (retryCount > maxRetries) {
          this.logger.error('GroupedSequentialExecutor', `❌ 最大試行回数到達: ${columnTask.taskName}`);
          this.columnTaskManager.moveToNextTask(); // 強制的に次へ
          break;
        }
        
        // 従来システムを使用して空白セルを再処理
        const retryResult = await this.processBlankCellsWithTraditionalSystem(blankCheckResult, originalTaskList);
        
        // 再処理結果の確認
        if (!retryResult.success) {
          this.logger.warn('GroupedSequentialExecutor', '空白セル再処理が完全に成功しませんでした', {
            reason: retryResult.reason,
            processedTasks: retryResult.processedTasks,
            expectedTasks: retryResult.expectedTasks
          });
          
          // 部分的な成功でも次に進む場合の判定
          if (retryResult.processedTasks > 0) {
            this.logger.info('GroupedSequentialExecutor', '部分的な処理成功のため継続します');
          }
        }
      }
    }
    
    this.currentColumnTask = null;
  }
  
  /**
   * 列タスクの全行を実行
   */
  async executeColumnTaskRows(columnTask, structure, spreadsheetData) {
    this.logger.log(`[GroupedSequentialExecutor] 列タスクの全行実行開始: ${columnTask.taskName}`);
    
    // 処理可能な行をフィルタリング
    const processableRows = structure.workRows.filter(row => 
      this.shouldProcessRow(row.number, structure.controls.row)
    );
    
    this.logger.log(`[GroupedSequentialExecutor] 処理対象行:`, {
      totalWorkRows: structure.workRows.length,
      processableRows: processableRows.length,
      rowNumbers: processableRows.map(r => r.number)
    });
    
    // 各行のタスクを生成して実行
    for (const workRow of processableRows) {
      const rowTasks = columnTask.getTasksForRows([workRow], spreadsheetData, structure);
      
      for (const task of rowTasks) {
        // プロンプトを動的に取得
        const prompt = this.buildPromptFromCells(task, spreadsheetData, workRow, columnTask);
        task.prompt = prompt;
        
        // タスク実行
        await this.processTask(task);
        
        // タスク間の待機
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    this.logger.log(`[GroupedSequentialExecutor] 列タスクの全行実行完了: ${columnTask.taskName}`);
  }
  
  /**
   * セルからプロンプトを構築
   */
  buildPromptFromCells(task, spreadsheetData, workRow, columnTask) {
    const prompts = [];
    
    // プロンプト列からテキストを取得
    for (const promptColumn of columnTask.promptColumns) {
      const colIndex = this.columnToIndex(promptColumn);
      const cellValue = this.getCellValue(spreadsheetData, workRow.index, colIndex);
      
      if (cellValue && cellValue.trim()) {
        prompts.push(cellValue.trim());
      }
    }
    
    const combinedPrompt = prompts.join('\n');
    
    this.logger.log(`[GroupedSequentialExecutor] プロンプト構築:`, {
      cell: `${task.column}${task.row}`,
      promptColumns: columnTask.promptColumns,
      promptLength: combinedPrompt.length,
      promptPreview: combinedPrompt.substring(0, 100) + (combinedPrompt.length > 100 ? '...' : '')
    });
    
    return combinedPrompt;
  }
  
  /**
   * 行を処理すべきか判定
   */
  shouldProcessRow(rowNumber, rowControls) {
    if (!rowControls || rowControls.length === 0) return true;

    // "この行のみ処理"が優先
    const onlyControls = rowControls.filter(c => c.type === "only");
    if (onlyControls.length > 0) {
      return onlyControls.some(c => c.row === rowNumber);
    }

    // "この行から処理"
    const fromControl = rowControls.find(c => c.type === "from");
    if (fromControl && rowNumber < fromControl.row) return false;

    // "この行で停止"
    const untilControl = rowControls.find(c => c.type === "until");
    if (untilControl && rowNumber > untilControl.row) return false;

    return true;
  }
  
  /**
   * タスク処理（BaseExecutorから継承してオーバーライド）
   */
  async processTask(task) {
    try {
      this.logger.log(`[GroupedSequentialExecutor] タスク処理開始`, {
        cell: `${task.column}${task.row}`,
        taskType: task.taskType,
        columnTaskNumber: task.columnTaskNumber,
        aiType: task.aiType
      });
      
      // テストモードの場合はシミュレート
      if (this.isTestMode) {
        this.logger.log(`[GroupedSequentialExecutor] テストモード: タスク処理をシミュレート`);
        this.completedTasks.add(task.id);
        return;
      }
      
      // 実際のウィンドウ処理
      await this.openWindowForTask(task);
      
      // タスク完了をマーク
      this.completedTasks.add(task.id);
      
      this.logger.log(`[GroupedSequentialExecutor] タスク処理完了`, {
        cell: `${task.column}${task.row}`,
        columnTaskNumber: task.columnTaskNumber
      });
      
    } catch (error) {
      this.logger.error(`[GroupedSequentialExecutor] タスク処理エラー`, {
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8),
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * タスク用のウィンドウを開く（シンプル版）
   */
  async openWindowForTask(task) {
    // テストモードの場合はウィンドウを開かない
    if (this.isTestMode) {
      this.logger.info('GroupedSequentialExecutor', 'テストモード: ウィンドウ開くスキップ', {
        cell: `${task.column}${task.row}`,
        aiType: task.aiType
      });
      return;
    }
    
    // 実際の環境では適切なウィンドウサービスを使用
    this.logger.info('GroupedSequentialExecutor', 'ウィンドウ作成（簡易版）', {
      cell: `${task.column}${task.row}`,
      aiType: task.aiType
    });
    
    // 簡易版の実装（実際のWindowServiceが利用できない場合）
    const windowInfo = {
      windowId: `window_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      column: task.column,
      row: task.row,
      aiType: task.aiType,
      taskId: task.id,
      createdAt: Date.now()
    };
    
    this.activeWindows.set(windowInfo.windowId, windowInfo);
  }
  
  /**
   * 現在の処理状況を取得
   */
  getProcessingStatus() {
    const progress = this.columnTaskManager.getProgress();
    return {
      currentColumnTask: progress.currentTask,
      currentTaskIndex: progress.currentTaskIndex,
      totalColumnTasks: progress.totalColumnTasks,
      completedTasks: this.completedTasks.size,
      totalWindows: this.activeWindows.size,
      columnTaskProgress: progress
    };
  }
  
  // ユーティリティメソッド群（TaskGeneratorから移植）
  
  findRowByKeyword(spreadsheetData, keyword) {
    const values = spreadsheetData.values || [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row && row[0] && row[0].toString().includes(keyword)) {
        return { index: i, data: row };
      }
    }
    return null;
  }
  
  identifyPromptGroups(menuRow, aiRow) {
    const groups = [];
    const processed = new Set();

    if (!menuRow || !menuRow.data) return groups;

    for (let i = 0; i < menuRow.data.length; i++) {
      if (processed.has(i)) continue;

      const cell = menuRow.data[i];
      if (cell === "ログ") {
        const nextIndex = i + 1;
        if (nextIndex < menuRow.data.length && menuRow.data[nextIndex] === "プロンプト") {
          const group = {
            startIndex: nextIndex,
            logColumn: this.indexToColumn(i),
            promptColumns: [nextIndex],
            answerColumns: [],
            aiType: null
          };
          
          processed.add(i);
          
          // 連続するプロンプト2〜5を探す
          let lastPromptIndex = nextIndex;
          for (let num = 2; num <= 5; num++) {
            const promptIndex = lastPromptIndex + 1;
            if (promptIndex < menuRow.data.length && 
                menuRow.data[promptIndex] === `プロンプト${num}`) {
              group.promptColumns.push(promptIndex);
              processed.add(promptIndex);
              lastPromptIndex = promptIndex;
            } else {
              break;
            }
          }

          // AIタイプを判定
          const aiValue = aiRow?.data?.[nextIndex] || "";
          group.aiType = this.determineAIType(aiValue);

          // 回答列を設定
          if (group.aiType === "3type") {
            const answerStart = lastPromptIndex + 1;
            group.answerColumns = [
              { index: answerStart, type: "chatgpt", column: this.indexToColumn(answerStart) },
              { index: answerStart + 1, type: "claude", column: this.indexToColumn(answerStart + 1) },
              { index: answerStart + 2, type: "gemini", column: this.indexToColumn(answerStart + 2) }
            ];
          } else {
            const answerIndex = lastPromptIndex + 1;
            const aiType = this.extractSingleAIType(aiValue);
            group.answerColumns = [
              { index: answerIndex, type: aiType, column: this.indexToColumn(answerIndex) }
            ];
          }

          // レポート化列をチェック
          const lastAnswerIndex = group.answerColumns[group.answerColumns.length - 1].index;
          if (lastAnswerIndex + 1 < menuRow.data.length) {
            const reportHeader = menuRow.data[lastAnswerIndex + 1];
            if (reportHeader && (reportHeader === "レポート化" || reportHeader.includes("レポート"))) {
              group.reportColumn = lastAnswerIndex + 1;
            }
          }

          groups.push(group);
          processed.add(nextIndex);
        }
      }
    }

    return groups;
  }
  
  determineAIType(aiValue) {
    if (aiValue.includes("3種類")) return "3type";
    return "single";
  }

  extractSingleAIType(aiValue) {
    if (aiValue.includes("Claude")) return "claude";
    if (aiValue.includes("Gemini")) return "gemini";
    return "chatgpt";
  }
  
  collectControls(spreadsheetData) {
    const controls = { row: [], column: [] };
    const values = spreadsheetData.values || [];

    // 行制御を収集（B列）
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!row) continue;

      const cellB = row[1];
      if (cellB && typeof cellB === 'string') {
        if (cellB.includes("この行から処理")) {
          controls.row.push({ type: "from", row: i + 1 });
        } else if (cellB.includes("この行の処理後に停止")) {
          controls.row.push({ type: "until", row: i + 1 });
        } else if (cellB.includes("この行のみ処理")) {
          controls.row.push({ type: "only", row: i + 1 });
        }
      }
    }

    // 列制御を収集（制御行1-10）
    for (let i = 0; i < Math.min(10, values.length); i++) {
      const row = values[i];
      if (!row) continue;

      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        if (cell && typeof cell === 'string') {
          const column = this.indexToColumn(j);
          
          if (cell.includes("この列から処理")) {
            controls.column.push({ type: "from", column, index: j });
          } else if (cell.includes("この列の処理後に停止")) {
            controls.column.push({ type: "until", column, index: j });
          } else if (cell.includes("この列のみ処理")) {
            controls.column.push({ type: "only", column, index: j });
          }
        }
      }
    }

    return controls;
  }
  
  getWorkRows(spreadsheetData) {
    const workRows = [];
    const values = spreadsheetData.values || [];
    
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row && row[0] && /^\d+$/.test(row[0].toString())) {
        workRows.push({
          index: i,
          number: i + 1,
          data: row
        });
      }
    }
    
    return workRows;
  }
  
  getCellValue(spreadsheetData, rowIndex, colIndex) {
    const values = spreadsheetData.values || [];
    if (rowIndex >= 0 && rowIndex < values.length) {
      const row = values[rowIndex];
      if (row && colIndex >= 0 && colIndex < row.length) {
        return row[colIndex];
      }
    }
    return null;
  }
  
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
  
  columnToIndex(columnName) {
    if (!columnName || typeof columnName !== 'string') {
      return null;
    }
    
    let result = 0;
    const upperColumn = columnName.toUpperCase();
    
    for (let i = 0; i < upperColumn.length; i++) {
      result = result * 26 + (upperColumn.charCodeAt(i) - 64);
    }
    
    return result - 1;
  }
  
  /**
   * 従来システムを使用して空白セルを再処理（エラーハンドリング強化版）
   * @param {Object} blankCheckResult - 空白チェック結果
   * @param {TaskList} originalTaskList - 元のタスクリスト
   */
  async processBlankCellsWithTraditionalSystem(blankCheckResult, originalTaskList) {
    this.logger.info('GroupedSequentialExecutor', '従来システムによる空白セル再処理開始', {
      totalBlanks: blankCheckResult.totalBlanks,
      blankCells: blankCheckResult.blankCells.map(c => c.cell),
      currentTask: this.currentColumnTask?.taskName
    });
    
    // 入力検証
    if (!blankCheckResult || !blankCheckResult.blankCells || blankCheckResult.blankCells.length === 0) {
      this.logger.warn('GroupedSequentialExecutor', '空白セルが見つかりません。再処理をスキップします。');
      return { success: true, processedTasks: 0 };
    }
    
    if (!originalTaskList || !originalTaskList.tasks) {
      this.logger.error('GroupedSequentialExecutor', '元のタスクリストが無効です');
      throw new Error('元のタスクリストが見つかりません');
    }
    
    try {
      // BlankCheckerを使用して空白セル専用のタスクリストを生成
      const retryTasks = this.columnTaskManager.blankChecker.generateRetryTasks(
        blankCheckResult, 
        originalTaskList
      );
      
      // 再処理タスクの生成確認
      if (!retryTasks || retryTasks.length === 0) {
        this.logger.warn('GroupedSequentialExecutor', '再処理タスクが生成されませんでした', {
          reason: '元のタスクリストに対応するタスクが見つからない可能性があります',
          blankCells: blankCheckResult.blankCells.map(c => c.cell),
          originalTaskCount: originalTaskList.tasks.length
        });
        return { success: false, processedTasks: 0, reason: 'no_retry_tasks_generated' };
      }
      
      // 再処理用のTaskListを作成
      const retryTaskList = new TaskList();
      let addedTasks = 0;
      
      retryTasks.forEach(task => {
        if (retryTaskList.add(task)) {
          addedTasks++;
        }
      });
      
      if (addedTasks === 0) {
        this.logger.error('GroupedSequentialExecutor', 'TaskListへのタスク追加に失敗');
        return { success: false, processedTasks: 0, reason: 'task_add_failed' };
      }
      
      this.logger.info('GroupedSequentialExecutor', '従来システムで空白セル処理実行', {
        retryTaskCount: addedTasks,
        cells: retryTasks.map(t => `${t.column}${t.row}`),
        taskListId: retryTaskList.id
      });
      
      // StreamProcessorの存在確認
      if (!this.streamProcessor) {
        throw new Error('StreamProcessorが初期化されていません');
      }
      
      // StreamProcessorを使用してタスクを処理（従来の方式）
      const result = await this.streamProcessor.processTaskStream(
        retryTaskList,
        this.currentSpreadsheetData,
        {
          isRetry: true,
          retryReason: 'blank_cell_detected',
          parentTask: this.currentColumnTask?.taskName
        }
      );
      
      // 結果の検証
      if (!result) {
        throw new Error('StreamProcessorから結果が返されませんでした');
      }
      
      const processedCount = result.totalTasks || result.processedTasks || addedTasks;
      
      this.logger.info('GroupedSequentialExecutor', '従来システムによる空白セル再処理完了', {
        success: result.success,
        processedTasks: processedCount,
        expectedTasks: addedTasks,
        allProcessed: processedCount >= addedTasks
      });
      
      return {
        success: result.success,
        processedTasks: processedCount,
        expectedTasks: addedTasks
      };
      
    } catch (error) {
      this.logger.error('GroupedSequentialExecutor', '従来システムによる空白セル再処理エラー', {
        error: error.message,
        stack: error.stack,
        blankCells: blankCheckResult.blankCells.map(c => c.cell),
        currentTask: this.currentColumnTask?.taskName
      });
      
      // エラーの種類に応じて適切な処理
      if (error.message.includes('StreamProcessor')) {
        throw new Error(`StreamProcessor処理エラー: ${error.message}`);
      } else if (error.message.includes('TaskList')) {
        throw new Error(`タスクリスト処理エラー: ${error.message}`);
      } else {
        throw new Error(`空白セル再処理エラー: ${error.message}`);
      }
    }
  }
  
  /**
   * 既存のTaskListから構造情報を抽出（二重解析回避・パフォーマンス最適化版）
   * @param {TaskList} taskList - 既存のタスクリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Object} 構造情報
   */
  extractStructureFromTaskList(taskList, spreadsheetData) {
    const startTime = Date.now();
    
    this.logger.info('GroupedSequentialExecutor', 'TaskListから構造抽出開始（高速化）', {
      totalTasks: taskList.tasks.length,
      hasSpreadsheetStructure: !!(spreadsheetData.menu || spreadsheetData.workRows)
    });
    
    // 既存の解析済みデータを優先使用（パフォーマンス向上）
    const structure = {
      rows: {
        menu: spreadsheetData.menu || null,
        ai: spreadsheetData.ai || null,
        model: spreadsheetData.model || null,
        task: spreadsheetData.task || null
      },
      promptGroups: this.reconstructPromptGroupsFromTasks(taskList.tasks),
      controls: taskList.controls || { row: [], column: [] },
      workRows: spreadsheetData.workRows || this.getWorkRows(spreadsheetData)
    };
    
    // 抽出結果の検証
    const hasValidStructure = structure.promptGroups.length > 0 && structure.workRows.length > 0;
    
    if (!hasValidStructure) {
      this.logger.warn('GroupedSequentialExecutor', '構造抽出で不完全なデータが検出されました', {
        promptGroups: structure.promptGroups.length,
        workRows: structure.workRows.length,
        fallbackRequired: !hasValidStructure
      });
      
      // フォールバック: 従来の解析を実行
      if (structure.promptGroups.length === 0) {
        this.logger.info('GroupedSequentialExecutor', 'プロンプトグループが空のため、フォールバック解析を実行');
        const fallbackStructure = this.analyzeSpreadsheetStructure(spreadsheetData);
        structure.promptGroups = fallbackStructure.promptGroups;
      }
    }
    
    const extractionTime = Date.now() - startTime;
    
    this.logger.info('GroupedSequentialExecutor', 'TaskListからの構造抽出完了', {
      promptGroups: structure.promptGroups.length,
      workRows: structure.workRows.length,
      extractionTime: `${extractionTime}ms`,
      usedFallback: !hasValidStructure
    });
    
    return structure;
  }
  
  /**
   * TaskListからプロンプトグループを再構成
   * @param {Array} tasks - タスク配列
   * @returns {Array} プロンプトグループ配列
   */
  reconstructPromptGroupsFromTasks(tasks) {
    const groupMap = new Map();
    
    // タスクからグループ情報を抽出
    for (const task of tasks) {
      if (!task.groupInfo) continue;
      
      const groupKey = task.groupInfo.type + '_' + (task.groupInfo.promptColumn || task.column);
      
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          aiType: task.groupInfo.type,
          promptColumns: task.promptColumns ? task.promptColumns.map(col => this.columnToIndex(col)) : [this.columnToIndex(task.promptColumn || task.column)],
          answerColumns: [],
          logColumn: task.logColumns?.[0] || null,
          startIndex: this.columnToIndex(task.promptColumn || task.column)
        });
      }
      
      const group = groupMap.get(groupKey);
      
      // 回答列を追加
      if (!group.answerColumns.find(a => a.column === task.column)) {
        group.answerColumns.push({
          column: task.column,
          index: this.columnToIndex(task.column),
          type: task.aiType
        });
      }
    }
    
    return Array.from(groupMap.values());
  }
}

export default GroupedSequentialExecutor;