// generator.js - シンプルなタスクジェネレーター

import { Task, TaskList, TaskFactory } from "./models.js";
import { AnswerFilter } from "./filters/index.js";
import SimpleColumnControl from "./column-control-simple.js";
import {
  AI_TYPE_MAP,
  extractFromMap,
  SPECIAL_MODEL_MAP,
  SPECIAL_OPERATION_MAP,
} from "./extraction-maps.js";
import StreamProcessor from "./stream-processor.js";

class TaskGenerator {
  constructor() {
    this.answerFilter = new AnswerFilter();
    this.streamProcessor = new StreamProcessor();
  }

  /**
   * タスクを生成
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {TaskList} タスクリスト
   */
  generateTasks(spreadsheetData) {
    console.log("[TaskGenerator] タスク生成開始");
    console.log("[TaskGenerator] 受信したデータ:", {
      aiColumns: spreadsheetData.aiColumns,
      aiColumnsCount: spreadsheetData.aiColumns ? Object.keys(spreadsheetData.aiColumns).length : 0,
      workRowsCount: spreadsheetData.workRows?.length || 0,
      valuesCount: spreadsheetData.values?.length || 0
    });

    const taskList = new TaskList();

    // 列制御と行制御を収集
    const controls = SimpleColumnControl.collectControls(spreadsheetData);
    console.log("[TaskGenerator] 列制御:", controls.columnControls);
    console.log("[TaskGenerator] 行制御:", controls.rowControls);

    // AI列をアルファベット順にソート
    const sortedAIColumns = Object.entries(
      spreadsheetData.aiColumns || {},
    ).sort(([a], [b]) => a.localeCompare(b));
    
    console.log("[TaskGenerator] ソート済みAI列:", sortedAIColumns);

    // 処理済みの最大列を追跡（グローバル制御用）
    let maxProcessedColumn = null;
    // 処理開始の最小列を追跡（グローバル制御用）
    let minProcessingColumn = this.findMinProcessingColumn(
      controls.columnControls,
      spreadsheetData,
    );

    // 各AI列を処理
    console.log(`[TaskGenerator] AI列処理開始: ${sortedAIColumns.length}列`);
    for (const [promptColumn, aiInfo] of sortedAIColumns) {
      console.log(
        `[TaskGenerator] 処理中: ${promptColumn}列, AI: ${aiInfo ? aiInfo.type : 'undefined'}`,
      );

      // グローバル制御チェック：この列をスキップすべきか
      if (
        this.shouldSkipColumnGlobally(
          promptColumn,
          maxProcessedColumn,
          minProcessingColumn,
        )
      ) {
        console.log(
          `[TaskGenerator] ${promptColumn}列はグローバル制御によりスキップ`,
        );
        continue;
      }

      // 列グループを取得
      console.log(`[TaskGenerator] 列グループ取得前: ${promptColumn}列, AI: ${aiInfo.type}`);
      const columnGroup = SimpleColumnControl.getColumnGroup(
        promptColumn,
        aiInfo.type,
        this.hasAIInstructionColumn(promptColumn, spreadsheetData),
        spreadsheetData  // メニュー行からレポート化列を検出するためにデータを渡す
      );
      console.log(`[TaskGenerator] 列グループ取得後:`, columnGroup);

      // デバッグ情報
      SimpleColumnControl.debugPrint(columnGroup, controls.columnControls);

      // タスクを生成
      const tasks = this.generateTasksForGroup(
        columnGroup,
        controls.columnControls,
        controls.rowControls,
        spreadsheetData,
      );

      taskList.addBatch(tasks);

      // グローバル制御の更新：この列グループの処理後に停止すべきか
      const stopAfterThis = this.shouldStopAfterGroup(
        columnGroup,
        controls.columnControls,
      );
      if (stopAfterThis) {
        maxProcessedColumn =
          columnGroup.columns[columnGroup.columns.length - 1];
        console.log(
          `[TaskGenerator] ${promptColumn}列グループの処理後に停止（最終列: ${maxProcessedColumn}）`,
        );
      }
    }

    // 統計情報をログ出力
    this.logTaskStatistics(taskList);

    // taskListと制御情報を含むオブジェクトを返す
    taskList.controls = controls;
    return taskList;
  }

  /**
   * タスクを生成して実行（ストリーミング処理）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 実行結果
   */
  async generateAndExecuteTasks(spreadsheetData, options = {}) {
    console.log("[TaskGenerator] タスク生成・実行開始（ストリーミング）");

    // タスクを生成
    const taskList = this.generateTasks(spreadsheetData);

    if (taskList.tasks.length === 0) {
      console.log("[TaskGenerator] 実行可能なタスクがありません");
      return {
        success: true,
        totalTasks: 0,
        processedColumns: [],
        message: "実行可能なタスクがありません",
      };
    }

    // ストリーミング処理で実行
    try {
      const result = await this.streamProcessor.processTaskStream(
        taskList,
        spreadsheetData,
      );

      console.log("[TaskGenerator] ストリーミング処理完了", result);

      return {
        success: result.success,
        totalTasks: taskList.tasks.length,
        processedColumns: result.processedColumns,
        totalWindows: result.totalWindows,
      };
    } catch (error) {
      console.error("[TaskGenerator] ストリーミング処理エラー", error);

      // エラー時は全ウィンドウを閉じる
      await this.streamProcessor.closeAllWindows();

      throw error;
    }
  }

  /**
   * 列グループに対してタスクを生成
   * @param {Object} columnGroup - 列グループ情報
   * @param {Array} controls - 列制御情報
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Array} タスクの配列
   */
  generateTasksForGroup(
    columnGroup,
    columnControls,
    rowControls,
    spreadsheetData,
  ) {
    const tasks = [];
    // workRowsがない場合はvaluesから作業行を生成
    let workRows = spreadsheetData.workRows || [];
    if (workRows.length === 0 && spreadsheetData.values) {
      console.warn('[TaskGenerator] workRowsが空のため、valuesから生成を試みます');
      // valuesから作業行を生成（ヘッダー行以降で数字で始まる行）
      for (let i = 1; i < spreadsheetData.values.length; i++) {
        const row = spreadsheetData.values[i];
        if (row && row[0] && /^\d+$/.test(row[0].toString())) {
          workRows.push({
            index: i,
            number: i + 1,  // 行番号（1ベース）
            data: row,
            control: row[1] || null
          });
        }
      }
      console.log(`[TaskGenerator] valuesから${workRows.length}個の作業行を生成`);
    }
    
    const skippedRows = []; // スキップされた行を記録
    
    console.log(`[TaskGenerator] generateTasksForGroup開始:`, {
      columnGroupType: columnGroup.type,
      promptColumn: columnGroup.promptColumn,
      workRowsCount: workRows.length,
      hasReportColumn: !!columnGroup.reportColumn
    });

    // 作業行ごとに処理
    for (const workRow of workRows) {
      // 行制御チェック
      if (!SimpleColumnControl.shouldProcessRow(workRow.number, rowControls)) {
        // 行制御スキップは後でまとめてログ出力
        skippedRows.push(workRow.number);
        continue;
      }

      // メインプロンプトを取得
      const promptText = this.getCellValue(
        spreadsheetData,
        columnGroup.promptColumn,
        workRow.number,
      );

      // プロンプトがない場合はスキップ
      if (!promptText || promptText.trim().length === 0) {
        continue;
      }

      // プロンプト2~5を順番に収集して連結
      const allPrompts = [promptText];
      const additionalPromptsFound = [];
      
      for (let i = 2; i <= 5; i++) {
        const additionalPromptColumn = String.fromCharCode(
          columnGroup.promptColumn.charCodeAt(0) + i - 1
        );
        const additionalPrompt = this.getCellValue(
          spreadsheetData,
          additionalPromptColumn,
          workRow.number,
        );
        if (additionalPrompt && additionalPrompt.trim().length > 0) {
          allPrompts.push(additionalPrompt);
          additionalPromptsFound.push(`プロンプト${i}(${additionalPromptColumn}列)`);
        }
      }

      // 追加プロンプトがある場合はログ出力
      if (additionalPromptsFound.length > 0) {
        console.log(
          `[TaskGenerator] 行${workRow.number}: 追加プロンプトを検出: ${additionalPromptsFound.join(', ')}`
        );
      }

      // すべてのプロンプトを改行で連結
      const combinedPrompt = allPrompts.join('\n');

      // 回答列ごとにタスクを生成（aiMappingから直接取得）
      const aiAnswerColumns = Object.keys(columnGroup.aiMapping || {});
      
      console.log(`[TaskGenerator] 回答列計算:`, {
        行: workRow.number,
        プロンプト列: columnGroup.promptColumn,
        'columnGroup.columns': columnGroup.columns,
        'aiMapping': columnGroup.aiMapping,
        aiAnswerColumns,
        追加プロンプト: additionalPromptsFound
      });

      for (const answerColumn of aiAnswerColumns) {
        // この列を処理すべきかチェック
        if (
          !SimpleColumnControl.shouldProcessColumn(
            answerColumn,
            columnGroup,
            columnControls,
          )
        ) {
          console.log(`[TaskGenerator] ${answerColumn}列はスキップ`);
          continue;
        }

        // 既に回答がある場合はスキップ
        const existingAnswer = this.getCellValue(
          spreadsheetData,
          answerColumn,
          workRow.number,
        );

        if (this.answerFilter.hasAnswer(existingAnswer)) {
          console.log(
            `[TaskGenerator] ${answerColumn}${workRow.number}は回答済み`,
          );
          continue;
        }

        // AIタスクを作成（連結されたプロンプトを使用）
        const aiType = columnGroup.aiMapping[answerColumn];
        const task = this.createTask(
          columnGroup.promptColumn,
          answerColumn,
          workRow.number,
          combinedPrompt,  // 連結されたプロンプトを使用
          aiType,
          columnGroup,
          spreadsheetData,
          additionalPromptsFound  // 追加プロンプト情報を渡す
        );

        tasks.push(task);
      }

      // レポート化タスクを生成（レポート化列がある場合）
      if (columnGroup.reportColumn) {
        console.log(`[TaskGenerator] レポート化列あり: ${columnGroup.reportColumn}, 行${workRow.number}`);
        
        // 最初の回答列のみからレポート生成（重複を防ぐため）
        const firstAnswerColumn = aiAnswerColumns[0];
        if (firstAnswerColumn) {
          console.log(`[TaskGenerator] レポートタスク候補: ${firstAnswerColumn}列`);
          
          // 回答がない場合はレポートタスクもスキップ
          const answerText = this.getCellValue(
            spreadsheetData,
            firstAnswerColumn,
            workRow.number,
          );
          
          console.log(`[TaskGenerator] ${firstAnswerColumn}${workRow.number}の回答確認: "${answerText?.substring(0, 50) || '(なし)'}"`);
          
          if (answerText && answerText.trim()) {
            // この列を処理すべきかチェック
            if (
              SimpleColumnControl.shouldProcessColumn(
                firstAnswerColumn,
                columnGroup,
                columnControls,
              )
            ) {
              // レポート化タスクを作成
              const reportTask = this.createReportTask(
                firstAnswerColumn,  // ソース列（AI回答列）
                columnGroup.reportColumn,  // レポート化列
                workRow.number,
                columnGroup.aiMapping[firstAnswerColumn],  // AIタイプ
                columnGroup,
                spreadsheetData,
              );

              if (reportTask) {
                console.log(`[TaskGenerator] レポートタスク作成成功: ${columnGroup.reportColumn}${workRow.number}`);
                tasks.push(reportTask);
              } else {
                console.log(`[TaskGenerator] レポートタスク作成スキップ: ${columnGroup.reportColumn}${workRow.number}`);
              }
            } else {
              console.log(`[TaskGenerator] ${firstAnswerColumn}列はスキップ（列制御）`);
            }
          } else {
            console.log(`[TaskGenerator] ${firstAnswerColumn}${workRow.number}に回答なし、レポートタスクスキップ`);
          }
        }
      } else {
        console.log(`[TaskGenerator] レポート化列なし（columnGroup.type: ${columnGroup.type}）`);
      }
    }

    // スキップされた行をまとめてログ出力
    if (skippedRows.length > 0) {
      console.groupCollapsed(
        `[TaskGenerator] 行制御により${skippedRows.length}行をスキップ`,
      );
      console.log(`スキップされた行: ${skippedRows.join(", ")}`);
      console.groupEnd();
    }

    return tasks;
  }

  /**
   * タスクを作成
   */
  createTask(
    promptColumn,
    answerColumn,
    rowNumber,
    promptText,
    aiType,
    columnGroup,
    spreadsheetData,
  ) {
    // A列の内容を読み取る
    const aColumnValue =
      this.getCellValue(spreadsheetData, "A", rowNumber) || "";

    // モデル・機能を抽出
    const extractedModel = extractFromMap(aColumnValue, SPECIAL_MODEL_MAP);
    const extractedOperation = extractFromMap(
      aColumnValue,
      SPECIAL_OPERATION_MAP,
    );

    const taskData = {
      id: this.generateTaskId(answerColumn, rowNumber),
      column: answerColumn,
      row: rowNumber,
      aiType: aiType,
      taskType: "ai",  // タスクタイプを"ai"に設定
      prompt: promptText,
      promptColumn: promptColumn,

      // グループID（必須）
      groupId: `group_row${rowNumber}_${columnGroup.type}_${promptColumn}`,

      // ログ列情報（シンプルに）
      logColumns: {
        log: columnGroup.columns[0], // 最初の列がログ列
        layout: columnGroup.type,
      },

      // グループ情報
      groupInfo: {
        type: columnGroup.type,
        columns: columnGroup.columns.slice(2), // 回答列のみ
        promptColumn: promptColumn,
      },

      multiAI: columnGroup.type === "3type",

      // モデル・機能（nullの場合は未定義にする）
      ...(extractedModel && { model: extractedModel }),
      ...(extractedOperation && { specialOperation: extractedOperation }),
    };

    // 3種類AIの場合の追加情報
    if (columnGroup.type === "3type") {
      taskData.logColumns.aiColumns = columnGroup.aiMapping;
    }

    return new Task(TaskFactory.createTask(taskData));
  }

  /**
   * レポート化タスクを作成
   */
  createReportTask(
    sourceColumn,
    reportColumn,
    rowNumber,
    aiType,
    columnGroup,
    spreadsheetData,
  ) {
    // 既にレポートが作成されている場合はスキップ
    const existingReport = this.getCellValue(
      spreadsheetData,
      reportColumn,
      rowNumber,
    );

    if (existingReport && existingReport.trim().length > 0) {
      console.log(
        `[TaskGenerator] ${reportColumn}${rowNumber}はレポート作成済み`,
      );
      return null;
    }

    const taskData = {
      id: this.generateTaskId(reportColumn, rowNumber),
      column: reportColumn,
      row: rowNumber,
      aiType: aiType || "report",  // aiTypeがない場合は"report"を設定
      taskType: "report",  // タスクタイプを"report"に設定
      sourceColumn: sourceColumn,  // AI回答を取得する列
      reportColumn: reportColumn,  // レポートURLを書き込む列
      promptColumn: columnGroup.promptColumn || "",  // プロンプト列（参照用）
      prompt: "レポート生成タスク",  // レポートタスクの場合は説明的なテキストを設定
      
      // グループID（必須）
      groupId: `group_row${rowNumber}_report_${reportColumn}`,

      // グループ情報
      groupInfo: {
        type: "report",
        sourceColumn: sourceColumn,
        reportColumn: reportColumn,
      },
    };
    
    // デバッグログ
    console.log(`[TaskGenerator] レポートタスク作成:`, {
      id: taskData.id,
      row: rowNumber,
      sourceColumn,
      reportColumn,
      aiType: taskData.aiType,
      prompt: taskData.prompt
    });

    return new Task(TaskFactory.createTask(taskData));
  }

  /**
   * タスクIDを生成
   */
  generateTaskId(column, row) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `${column}${row}_${timestamp}_${random}`;
  }

  /**
   * セル値を取得
   */
  getCellValue(spreadsheetData, column, row) {
    // まずworkRowsから探す
    if (spreadsheetData.workRows) {
      const workRow = spreadsheetData.workRows.find(wr => wr.number === row);
      if (workRow && workRow.data) {
        const columnIndex = column.charCodeAt(0) - 65;
        return workRow.data[columnIndex] || null;
      }
    }
    
    // workRowsがない場合はvaluesから取得
    if (!spreadsheetData.values) return null;

    const rowData = spreadsheetData.values[row - 1];
    if (!rowData) return null;

    const columnIndex = column.charCodeAt(0) - 65;
    return rowData[columnIndex] || null;
  }

  /**
   * AI指示列があるかチェック
   */
  hasAIInstructionColumn(promptColumn, spreadsheetData) {
    const nextColumn = String.fromCharCode(promptColumn.charCodeAt(0) + 1);
    const nextColumnMapping = spreadsheetData.columnMapping?.[nextColumn];
    return nextColumnMapping?.aiType === "3種類";
  }

  /**
   * グローバル制御により列をスキップすべきかチェック
   */
  shouldSkipColumnGlobally(column, maxProcessedColumn, minProcessingColumn) {
    // 最小処理列より前の場合はスキップ
    if (minProcessingColumn) {
      const columnIndex = column.charCodeAt(0);
      const minIndex = minProcessingColumn.charCodeAt(0);
      if (columnIndex < minIndex) {
        return true;
      }
    }

    // 最大処理列より後の場合はスキップ
    if (maxProcessedColumn) {
      const columnIndex = column.charCodeAt(0);
      const maxIndex = maxProcessedColumn.charCodeAt(0);
      if (columnIndex > maxIndex) {
        return true;
      }
    }

    return false;
  }

  /**
   * このグループの処理後に停止すべきかチェック
   */
  shouldStopAfterGroup(columnGroup, controls) {
    // 制御情報から「until」タイプを探す
    for (const control of controls) {
      if (control.type === "until") {
        // 制御列がこのグループに含まれているかチェック
        if (columnGroup.columns.includes(control.column)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 処理開始の最小列を見つける（from制御用）
   */
  findMinProcessingColumn(controls, spreadsheetData) {
    let minColumn = null;

    for (const control of controls) {
      if (control.type === "from") {
        // 制御列が属するグループのプロンプト列を見つける
        const promptColumn = this.findPromptColumnForControl(
          control.column,
          spreadsheetData,
        );
        if (promptColumn) {
          if (
            !minColumn ||
            promptColumn.charCodeAt(0) < minColumn.charCodeAt(0)
          ) {
            minColumn = promptColumn;
          }
        }
      }
    }

    return minColumn;
  }

  /**
   * 制御列に対応するプロンプト列を見つける
   */
  findPromptColumnForControl(controlColumn, spreadsheetData) {
    // まず、制御列自体がプロンプト列かチェック
    if (spreadsheetData.aiColumns?.[controlColumn]) {
      return controlColumn;
    }

    // 制御列が回答列の場合、対応するプロンプト列を探す
    for (const [promptCol, aiInfo] of Object.entries(
      spreadsheetData.aiColumns || {},
    )) {
      const columnGroup = SimpleColumnControl.getColumnGroup(
        promptCol,
        aiInfo.type,
        this.hasAIInstructionColumn(promptCol, spreadsheetData),
        spreadsheetData  // メニュー行からレポート化列を検出するためにデータを渡す
      );

      if (columnGroup.columns.includes(controlColumn)) {
        return promptCol;
      }
    }

    return null;
  }

  /**
   * タスク統計情報をログ出力
   */
  logTaskStatistics(taskList) {
    const stats = taskList.getStatistics();

    console.log("[TaskGenerator] === タスク生成完了 ===");
    console.log(`全タスク数: ${taskList.tasks.length}`);
    console.log(`実行可能: ${taskList.getExecutableTasks().length}`);
    console.log(
      `AI別: ChatGPT=${stats.byAI.chatgpt}, Claude=${stats.byAI.claude}, Gemini=${stats.byAI.gemini}`,
    );

    // 列ごとのタスク情報
    const tasksByColumn = {};
    taskList.tasks.forEach((task) => {
      const key = task.promptColumn;
      if (!tasksByColumn[key]) {
        tasksByColumn[key] = [];
      }
      tasksByColumn[key].push(task);
    });

    // すべてのタスク情報を1つの折りたたみグループで表示
    console.groupCollapsed("[TaskGenerator] 作成したタスクリスト");

    Object.keys(tasksByColumn)
      .sort()
      .forEach((column) => {
        const columnTasks = tasksByColumn[column];
        const aiTypes = {};
        columnTasks.forEach((task) => {
          aiTypes[task.aiType] = (aiTypes[task.aiType] || 0) + 1;
        });

        console.log(
          `\n【プロンプト列 ${column}】タスク数: ${columnTasks.length}`,
        );
        console.log(`  AI種別:`, aiTypes);

        // 回答列を表示
        const answerColumns = [
          ...new Set(columnTasks.map((t) => t.column)),
        ].sort();
        console.log(`  回答列: ${answerColumns.join(", ")}`);

        // 各タスクの詳細
        console.log(`  タスク詳細:`);
        columnTasks.forEach((task, index) => {
          console.log(
            `    ${index + 1}. ${task.column}${task.row} (${task.aiType})`,
          );
          console.log(`       ID: ${task.id}`);
          console.log(`       プロンプト列: ${task.promptColumn}`);
          console.log(`       回答列: ${task.column}`);
          // promptが存在しない場合（レポートタスクなど）の対応
          const promptText = task.prompt || "";
          if (promptText) {
            console.log(
              `       プロンプト: ${promptText.substring(0, 50)}${promptText.length > 50 ? "..." : ""}`,
            );
          } else {
            console.log(`       プロンプト: (なし - ${task.taskType || "ai"}タスク)`);
          }

          // モデル
          if (task.model) {
            console.log(`       モデル: ${task.model}`);
          }

          // 機能
          if (task.specialOperation) {
            console.log(`       機能: ${task.specialOperation}`);
          }

          // グループ情報
          if (task.groupInfo) {
            console.log(
              `       グループ: ${task.groupInfo.type} (${task.groupInfo.columns.join(", ")})`,
            );
          }

          // 3種類AIの場合の追加情報
          if (task.multiAI && task.logColumns?.aiColumns) {
            console.log(
              `       3種類AI列マッピング:`,
              task.logColumns.aiColumns,
            );
          }

          // その他の設定
          if (task.specialSettings) {
            console.log(`       特殊設定:`, task.specialSettings);
          }

          if (task.skipReason) {
            console.log(`       スキップ理由: ${task.skipReason}`);
          }
        });
      });

    console.groupEnd();
  }

  /**
   * StreamProcessorの状態を取得
   * @returns {Object} 処理状態
   */
  getStreamingStatus() {
    return this.streamProcessor.getStatus();
  }

  /**
   * ストリーミング処理を停止
   * @returns {Promise<void>}
   */
  async stopStreaming() {
    console.log("[TaskGenerator] ストリーミング処理を停止");
    await this.streamProcessor.closeAllWindows();
  }
}

export default TaskGenerator;
