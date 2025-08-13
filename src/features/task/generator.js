// generator.js - シンプルなタスクジェネレーター

import { Task, TaskList, TaskFactory } from "./models.js";
import { AnswerFilter } from "./filters/index.js";
import SimpleColumnControl from "./column-control-simple.js";
import StreamProcessor from "./stream-processor.js";
import ReportTaskFactory from "../report/report-task-factory.js";

class TaskGenerator {
  constructor() {
    this.answerFilter = new AnswerFilter();
    this.streamProcessor = new StreamProcessor();
    this.reportTaskFactory = new ReportTaskFactory();
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
   * @param {Array} columnControls - 列制御情報
   * @param {Array} rowControls - 行制御情報
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
    
    // AIタスクの生成
    const aiTasks = this.generateAITasksForGroup(
      columnGroup,
      columnControls,
      rowControls,
      spreadsheetData
    );
    tasks.push(...aiTasks);
    
    // レポートタスクの生成（レポート化列がある場合）
    if (columnGroup.reportColumn) {
      const reportTasks = this.generateReportTasksForGroup(
        columnGroup,
        columnControls,
        rowControls,
        spreadsheetData,
        aiTasks  // AIタスクを参照してdependsOnを設定
      );
      tasks.push(...reportTasks);
    }
    
    return tasks;
  }

  /**
   * AIタスクを生成
   * @private
   */
  generateAITasksForGroup(
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

      // 追加プロンプトは使用しない（column-control-simple.jsで削除済み）
      const allPrompts = [promptText];
      const additionalPromptsFound = [];

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
    // モデル行からモデルを取得（AIタイプに応じて列を選択）
    let extractedModel = null;
    if (spreadsheetData.modelRow) {
      const modelRowIndex = spreadsheetData.modelRow.index;
      let modelColumnIndex;
      
      // 3種類AIの場合は回答列、通常処理はプロンプト列からモデルを取得
      if (columnGroup.type === "3type") {
        // 3種類AI：回答列からモデルを取得
        modelColumnIndex = this.getColumnIndex(answerColumn);
        console.log(`[TaskGenerator] 3種類AI - モデル取得試行: ${answerColumn}列(index=${modelColumnIndex}), モデル行${modelRowIndex + 1}`);
      } else {
        // 通常処理：プロンプト列からモデルを取得
        modelColumnIndex = this.getColumnIndex(promptColumn);
        console.log(`[TaskGenerator] 通常処理 - モデル取得試行: ${promptColumn}列(index=${modelColumnIndex}), モデル行${modelRowIndex + 1}`);
      }
      
      if (spreadsheetData.values && spreadsheetData.values[modelRowIndex]) {
        const modelValue = spreadsheetData.values[modelRowIndex][modelColumnIndex];
        console.log(`[TaskGenerator] モデル行の値: "${modelValue}" (type: ${typeof modelValue})`);
        
        if (modelValue && modelValue.trim()) {
          extractedModel = modelValue.trim();
          console.log(`[TaskGenerator] モデル行から取得: "${extractedModel}"`);
        } else {
          console.log(`[TaskGenerator] モデル値は空またはnull`);
        }
      } else {
        console.log(`[TaskGenerator] モデル行データが見つからない: index=${modelRowIndex}`);
      }
    } else {
      console.log(`[TaskGenerator] モデル行がスプレッドシートデータに含まれていない`);
    }
    
    // 機能行から機能を取得（AIタイプに応じて列を選択）
    let extractedOperation = null;
    if (spreadsheetData.taskRow) {
      const taskRowIndex = spreadsheetData.taskRow.index;
      let operationColumnIndex;
      
      // 3種類AIの場合は回答列、通常処理はプロンプト列から機能を取得
      if (columnGroup.type === "3type") {
        // 3種類AI：回答列から機能を取得
        operationColumnIndex = this.getColumnIndex(answerColumn);
        console.log(`[TaskGenerator] 3種類AI - 機能取得試行: ${answerColumn}列(index=${operationColumnIndex}), 機能行${taskRowIndex + 1}`);
      } else {
        // 通常処理：プロンプト列から機能を取得
        operationColumnIndex = this.getColumnIndex(promptColumn);
        console.log(`[TaskGenerator] 通常処理 - 機能取得試行: ${promptColumn}列(index=${operationColumnIndex}), 機能行${taskRowIndex + 1}`);
      }
      
      if (spreadsheetData.values && spreadsheetData.values[taskRowIndex]) {
        const taskValue = spreadsheetData.values[taskRowIndex][operationColumnIndex];
        console.log(`[TaskGenerator] 機能行の値: "${taskValue}" (type: ${typeof taskValue})`);
        
        if (taskValue && taskValue.trim()) {
          extractedOperation = taskValue.trim();
          console.log(`[TaskGenerator] 機能行から取得: "${extractedOperation}"`);
        } else {
          console.log(`[TaskGenerator] 機能値は空またはnull`);
        }
      } else {
        console.log(`[TaskGenerator] 機能行データが見つからない: index=${taskRowIndex}`);
      }
    } else {
      console.log(`[TaskGenerator] 機能行がスプレッドシートデータに含まれていない`);
    }
    
    // aiTypeを正規化（singleや3typeの場合は実際のAIタイプに変換）
    let normalizedAiType = aiType;
    if (aiType === "single" || aiType === "3type") {
      // columnGroup.aiMappingから実際のAIタイプを取得
      normalizedAiType = columnGroup.aiMapping?.[answerColumn] || "chatgpt";
    }

    const taskData = {
      id: this.generateTaskId(answerColumn, rowNumber),
      column: answerColumn,
      row: rowNumber,
      aiType: normalizedAiType,
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
   * レポートタスクを生成
   * @private
   */
  generateReportTasksForGroup(
    columnGroup,
    columnControls,
    rowControls,
    spreadsheetData,
    aiTasks
  ) {
    const tasks = [];
    
    if (!columnGroup.reportColumn) {
      return tasks;
    }
    
    console.log(`[TaskGenerator] レポートタスク生成開始:`, {
      reportColumn: columnGroup.reportColumn,
      aiTasksCount: aiTasks.length
    });
    
    // AIタスクごとにレポートタスクを生成
    for (const aiTask of aiTasks) {
      // レポート化列に既存の値があるかチェック
      const existingReport = this.getCellValue(
        spreadsheetData,
        columnGroup.reportColumn,
        aiTask.row
      );
      
      if (existingReport && existingReport.trim()) {
        console.log(
          `[TaskGenerator] ${columnGroup.reportColumn}${aiTask.row}は既にレポート済み`
        );
        continue;
      }
      
      // ReportTaskFactoryを使用してレポートタスクを作成
      const reportTask = this.reportTaskFactory.createTask({
        sourceColumn: aiTask.column,  // AI回答列
        reportColumn: columnGroup.reportColumn,
        rowNumber: aiTask.row,
        aiType: aiTask.aiType,
        columnGroup: columnGroup
      }, spreadsheetData);
      
      // 依存関係を設定（AIタスクが完了してから実行）
      reportTask.dependsOn = aiTask.id;
      
      console.log(`[TaskGenerator] レポートタスク作成:`, {
        id: reportTask.id,
        row: reportTask.row,
        dependsOn: reportTask.dependsOn
      });
      
      tasks.push(reportTask);
    }
    
    console.log(`[TaskGenerator] レポートタスク生成完了: ${tasks.length}件`);
    return tasks;
  }

  /**
   * レポート化タスクを作成（廃止予定）
   * @deprecated ReportTaskFactoryを使用してください
   */
  createReportTask(
    sourceColumn,
    reportColumn,
    rowNumber,
    aiType,
    columnGroup,
    spreadsheetData,
  ) {
    // 既存レポートのチェックは呼び出し元で実施済みのため削除

    // aiTypeを正規化（singleの場合はchatgptにデフォルト）
    let normalizedAiType = aiType;
    if (aiType === "single" || aiType === "3type") {
      // デフォルトはchatgpt
      normalizedAiType = "chatgpt";
    }
    
    // 元のプロンプトテキストを取得（参考情報として）
    const originalPromptText = this.getCellValue(
      spreadsheetData,
      columnGroup.promptColumn,
      rowNumber
    ) || "";
    
    // モデル情報を取得（必要に応じて）
    let extractedModel = null;
    if (spreadsheetData.modelRow && spreadsheetData.values) {
      const modelRowIndex = spreadsheetData.modelRow.index;
      const modelColumnIndex = this.getColumnIndex(sourceColumn);
      if (spreadsheetData.values[modelRowIndex]) {
        const modelValue = spreadsheetData.values[modelRowIndex][modelColumnIndex];
        if (modelValue && modelValue.trim()) {
          extractedModel = modelValue.trim();
        }
      }
    }
    
    const taskData = {
      id: this.generateTaskId(reportColumn, rowNumber),
      column: reportColumn,
      row: rowNumber,
      aiType: normalizedAiType || "chatgpt",  // aiTypeがない場合はchatgptを設定
      taskType: "report",  // タスクタイプを"report"に設定
      sourceColumn: sourceColumn,  // AI回答を取得する列（実行時にここから回答を取得）
      reportColumn: reportColumn,  // レポートURLを書き込む列
      promptColumn: columnGroup.promptColumn || "",  // プロンプト列（参照用）
      prompt: "レポート生成タスク",  // 説明的なテキスト（実際の内容は実行時にsourceColumnから取得）
      
      // スプレッドシート情報（レポート生成時に必要）
      spreadsheetId: spreadsheetData.spreadsheetId || null,  // スプレッドシートID
      sheetGid: spreadsheetData.gid || null,  // シートのGID
      
      // グループID（必須）
      groupId: `group_row${rowNumber}_report_${reportColumn}`,

      // グループ情報
      groupInfo: {
        type: "report",
        sourceColumn: sourceColumn,
        reportColumn: reportColumn,
        promptColumn: columnGroup.promptColumn,  // プロンプト列も含める
        columns: [], // 互換性のため空配列を設定
      },
      
      // モデル情報（取得できた場合）
      ...(extractedModel && { model: extractedModel }),
      
      // メタデータ（追加情報）
      metadata: {
        originalPrompt: originalPromptText,  // 元のプロンプトテキスト（参考用）
        columnGroupType: columnGroup.type,  // 元の列グループタイプ（single/3type）
        note: "AI回答は実行時にsourceColumnから取得"  // 実装メモ
      }
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
   * 列名から列インデックスを計算（A=0, Z=25, AA=26, AB=27...）
   */
  getColumnIndex(columnName) {
    let index = 0;
    for (let i = 0; i < columnName.length; i++) {
      index = index * 26 + (columnName.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * セル値を取得
   */
  getCellValue(spreadsheetData, column, row) {
    // まずworkRowsから探す
    if (spreadsheetData.workRows) {
      const workRow = spreadsheetData.workRows.find(wr => wr.number === row);
      if (workRow && workRow.data) {
        const columnIndex = this.getColumnIndex(column);
        return workRow.data[columnIndex] || null;
      }
    }
    
    // workRowsがない場合はvaluesから取得
    if (!spreadsheetData.values) return null;

    const rowData = spreadsheetData.values[row - 1];
    if (!rowData) return null;

    const columnIndex = this.getColumnIndex(column);
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

    // タスクリストをテーブル形式で表示
    console.groupCollapsed("[TaskGenerator] 実行用タスクリスト");
    
    console.log("╔════════════════════════════════════════════════════════════════════════════╗");
    console.log("║                          タスク実行リスト                                     ║");
    console.log("╠════════════════════════════════════════════════════════════════════════════╣");
    console.log("║ No │ タスクID │ セル │ AI種別 │ タイプ │ グループID │ ウィンドウ │ 状態  ║");
    console.log("╠════════════════════════════════════════════════════════════════════════════╣");

    taskList.tasks.forEach((task, index) => {
      const taskIdShort = task.id.substring(0, 8);
      const cell = `${task.column}${task.row}`;
      const aiType = task.aiType ? task.aiType.substring(0, 7).padEnd(7) : "N/A    ";
      const taskType = (task.taskType || "ai").padEnd(6);
      const groupIdShort = task.groupId ? task.groupId.substring(0, 15).padEnd(15) : "N/A            ";
      const windowId = task.windowId || "未割当";
      const status = task.skipReason ? "スキップ" : "実行可能";
      
      console.log(
        `║ ${String(index + 1).padStart(2)} │ ${taskIdShort} │ ${cell.padEnd(4)} │ ${aiType} │ ${taskType} │ ${groupIdShort} │ ${windowId.toString().padEnd(8)} │ ${status.padEnd(6)} ║`
      );
    });
    
    console.log("╚════════════════════════════════════════════════════════════════════════════╝");
    
    // 詳細情報を別のグループで表示
    console.group("[TaskGenerator] タスク詳細情報");
    
    taskList.tasks.forEach((task, index) => {
      console.log(`\n━━━ タスク ${index + 1} ━━━`);
      console.log(`📍 基本情報:`);
      console.log(`   ID: ${task.id}`);
      console.log(`   セル: ${task.column}${task.row}`);
      console.log(`   AI: ${task.aiType}`);
      console.log(`   タイプ: ${task.taskType || "ai"}`);
      
      console.log(`📂 グループ情報:`);
      console.log(`   グループID: ${task.groupId}`);
      if (task.groupInfo) {
        console.log(`   グループタイプ: ${task.groupInfo.type}`);
        if (task.groupInfo.columns && task.groupInfo.columns.length > 0) {
          console.log(`   関連列: ${task.groupInfo.columns.join(", ")}`);
        }
        if (task.groupInfo.sourceColumn) {
          console.log(`   ソース列: ${task.groupInfo.sourceColumn}`);
        }
        if (task.groupInfo.reportColumn) {
          console.log(`   レポート列: ${task.groupInfo.reportColumn}`);
        }
      }
      
      console.log(`📝 プロンプト情報:`);
      console.log(`   プロンプト列: ${task.promptColumn}`);
      if (task.prompt) {
        const promptPreview = task.prompt.substring(0, 60);
        console.log(`   プロンプト: ${promptPreview}${task.prompt.length > 60 ? "..." : ""}`);
      }
      
      if (task.model || task.specialOperation) {
        console.log(`⚙️ 特殊設定:`);
        if (task.model) console.log(`   モデル: ${task.model}`);
        if (task.specialOperation) console.log(`   機能: ${task.specialOperation}`);
      }
      
      if (task.logColumns) {
        console.log(`📊 ログ列情報:`);
        if (task.logColumns.log) console.log(`   ログ列: ${task.logColumns.log}`);
        if (task.logColumns.layout) console.log(`   レイアウト: ${task.logColumns.layout}`);
        if (task.logColumns.aiColumns) {
          console.log(`   AI列マッピング:`, task.logColumns.aiColumns);
        }
      }
      
      if (task.controlFlags) {
        console.log(`🎮 制御フラグ:`, task.controlFlags);
      }
      
      if (task.skipReason) {
        console.log(`⚠️ スキップ理由: ${task.skipReason}`);
      }
      
      if (task.metadata && Object.keys(task.metadata).length > 0) {
        console.log(`📎 メタデータ:`, task.metadata);
      }
    });
    
    console.groupEnd();
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
