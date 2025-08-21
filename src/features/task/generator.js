// タスクジェネレーター - リファクタリング版
// 明確な責任分離と単純なデータフロー

/**
 * ========================================
 * 依存関係
 * ========================================
 * 
 * ■ 内部モジュール:
 *   - models.js: Task, TaskList, TaskFactory - タスクモデルの定義
 *   - filters/index.js: AnswerFilter - 既存回答のフィルタリング
 *   - stream-processor.js: StreamProcessor - タスクストリーム処理（独立モジュール）
 *   - ../report/report-task-factory.js: ReportTaskFactory - レポートタスク生成
 * 
 * ■ 関連モジュール（このモジュールを使用）:
 *   - ai-orchestrator.js - メインのAI実行制御
 *   - background.js - Chrome拡張のバックグラウンド処理
 *   - test関連ファイル - テスト実行
 * 
 * ========================================
 * 制御フローの概要
 * ========================================
 * 
 * 1. スプレッドシート構造解析
 *    - メニュー行、AI行、モデル行、機能行の特定
 *    - プロンプトグループの識別（プロンプト〜プロンプト5を1グループ）
 * 
 * 2. 制御情報の収集
 *    【行制御】B列で「この行から処理」「この行の処理後に停止」「この行のみ処理」
 *    【列制御】制御行で「この列から処理」「この列の処理後に停止」「この列のみ処理」
 * 
 * 3. タスク生成
 *    - 列制御でプロンプトグループをフィルタリング（グループ単位で適用）
 *    - 行制御で作業行をフィルタリング
 *    - 処理対象のグループ×行に対してタスクを生成
 * 
 * ========================================
 * 制御の特徴
 * ========================================
 * 
 * ■ グループ単位の処理:
 *   - 1つのプロンプトグループ（プロンプト列群＋回答列群）をまとめて処理
 *   - 3種類AI: グループが対象なら ChatGPT/Claude/Gemini の3列すべて処理
 *   - 単独AI: グループが対象なら1つの回答列を処理
 * 
 * ■ 制御の優先順位:
 *   1. 「この○○のみ処理」が最優先（他の制御を無視）
 *   2. 「この○○から処理」と「この○○で停止」の組み合わせ
 *   3. 範囲指定（例：5-10行、P-R列）
 */

import { Task, TaskList, TaskFactory } from "./models.js";
import { AnswerFilter } from "./filters/index.js";
import StreamProcessor from "./stream-processor.js";
import ReportTaskFactory from "../report/report-task-factory.js";
// getDynamicConfigManager import削除 - スプレッドシート設定を直接使用するため不要

/**
 * タスクジェネレーター
 * スプレッドシートデータからAIタスクを生成
 */
class TaskGenerator {
  constructor() {
    this.answerFilter = new AnswerFilter();
    this.streamProcessor = new StreamProcessor();
    this.reportTaskFactory = new ReportTaskFactory();
    // dynamicConfigManager削除 - スプレッドシート設定を直接使用するため不要
  }

  /**
   * メインエントリーポイント - タスクを生成
   */
  async generateTasks(spreadsheetData) {
    console.log("[TaskGenerator] タスク生成開始（リファクタリング版）");
    
    try {
      // 1. スプレッドシート構造を解析
      const structure = this.analyzeStructure(spreadsheetData);
      
      // 2. タスクを生成
      const taskList = await this.buildTasks(structure, spreadsheetData);
      
      // 3. 統計情報を出力
      this.logStatistics(taskList);
      
      return taskList;
    } catch (error) {
      console.error("[TaskGenerator] タスク生成エラー:", error);
      return new TaskList();
    }
  }

  /**
   * スプレッドシート構造を解析
   */
  analyzeStructure(spreadsheetData) {
    // 重要な行を特定
    const rows = {
      menu: this.findRowByKeyword(spreadsheetData, "メニュー"),
      ai: this.findRowByKeyword(spreadsheetData, "使うAI"),
      model: this.findRowByKeyword(spreadsheetData, "モデル"),
      task: this.findRowByKeyword(spreadsheetData, "機能")
    };

    if (!rows.menu) {
      throw new Error("メニュー行が見つかりません");
    }

    // プロンプトグループを識別（プロンプト〜プロンプト5を1グループとして）
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
   * プロンプトグループを識別
   */
  identifyPromptGroups(menuRow, aiRow) {
    const groups = [];
    const processed = new Set();

    if (!menuRow || !menuRow.data) return groups;

    for (let i = 0; i < menuRow.data.length; i++) {
      if (processed.has(i)) continue;

      const cell = menuRow.data[i];
      if (cell === "プロンプト") {
        // グループを作成
        const group = {
          startIndex: i,
          promptColumns: [i],
          answerColumns: [],
          aiType: null
        };

        // 連続するプロンプト2〜5を探す
        let lastPromptIndex = i;
        for (let num = 2; num <= 5; num++) {
          const nextIndex = lastPromptIndex + 1;
          if (nextIndex < menuRow.data.length && 
              menuRow.data[nextIndex] === `プロンプト${num}`) {
            group.promptColumns.push(nextIndex);
            processed.add(nextIndex);
            lastPromptIndex = nextIndex;
          } else {
            break;
          }
        }

        // AIタイプを判定
        const aiValue = aiRow?.data?.[i] || "";
        group.aiType = this.determineAIType(aiValue);

        // 回答列を設定
        if (group.aiType === "3type") {
          // 3種類AI: 最後のプロンプトの次から3列
          const answerStart = lastPromptIndex + 1;
          group.answerColumns = [
            { index: answerStart, type: "chatgpt", column: this.indexToColumn(answerStart) },
            { index: answerStart + 1, type: "claude", column: this.indexToColumn(answerStart + 1) },
            { index: answerStart + 2, type: "gemini", column: this.indexToColumn(answerStart + 2) }
          ];
        } else {
          // 単独AI: 最後のプロンプトの次の1列
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
            console.log(`[TaskGenerator] レポート化列を検出: ${this.indexToColumn(lastAnswerIndex + 1)}列`);
          }
        }

        groups.push(group);
        processed.add(i);

        console.log(`[TaskGenerator] プロンプトグループ検出: ` +
          `${this.indexToColumn(i)}〜${this.indexToColumn(lastPromptIndex)}列 ` +
          `(${group.aiType}, 回答列: ${group.answerColumns.length})`);
      }
    }

    return groups;
  }

  /**
   * AIタイプを判定
   */
  determineAIType(aiValue) {
    if (aiValue.includes("3種類")) return "3type";
    return "single";
  }

  /**
   * 単独AIのタイプを抽出
   */
  extractSingleAIType(aiValue) {
    if (aiValue.includes("Claude")) return "claude";
    if (aiValue.includes("Gemini")) return "gemini";
    return "chatgpt"; // デフォルト
  }

  /**
   * 制御情報を収集
   */
  collectControls(spreadsheetData) {
    const controls = {
      row: [],
      column: []
    };

    const values = spreadsheetData.values || [];

    // 行制御を収集（B列）
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!row) continue;

      const cellB = row[1];
      if (cellB && typeof cellB === 'string') {
        if (cellB.includes("この行から処理")) {
          controls.row.push({ type: "from", row: i + 1 });
          console.log(`[TaskGenerator] 行制御: ${i + 1}行から処理`);
        } else if (cellB.includes("この行の処理後に停止")) {
          controls.row.push({ type: "until", row: i + 1 });
          console.log(`[TaskGenerator] 行制御: ${i + 1}行で停止`);
        } else if (cellB.includes("この行のみ処理")) {
          controls.row.push({ type: "only", row: i + 1 });
          console.log(`[TaskGenerator] 行制御: ${i + 1}行のみ処理`);
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
            console.log(`[TaskGenerator] 列制御: ${column}列から処理`);
          } else if (cell.includes("この列の処理後に停止")) {
            controls.column.push({ type: "until", column, index: j });
            console.log(`[TaskGenerator] 列制御: ${column}列で停止`);
          } else if (cell.includes("この列のみ処理")) {
            controls.column.push({ type: "only", column, index: j });
            console.log(`[TaskGenerator] 列制御: ${column}列のみ処理`);
          }
        }
      }
    }

    return controls;
  }

  /**
   * タスクを構築
   */
  async buildTasks(structure, spreadsheetData) {
    const taskList = new TaskList();
    const { rows, promptGroups, controls, workRows } = structure;

    // 列制御でフィルタリング
    const processableGroups = this.filterGroupsByColumnControl(promptGroups, controls.column);

    for (const workRow of workRows) {
      // 行制御チェック
      if (!this.shouldProcessRow(workRow.number, controls.row)) {
        continue;
      }

      for (const group of processableGroups) {
        // プロンプトを連結（プロンプト〜プロンプト5）
        const combinedPrompt = this.buildCombinedPrompt(spreadsheetData, workRow, group);
        if (!combinedPrompt) continue;

        // 各回答列にタスクを生成
        for (const answerCol of group.answerColumns) {
          // 既存回答チェック
          const existingAnswer = this.getCellValue(spreadsheetData, workRow.index, answerCol.index);
          if (this.answerFilter.hasAnswer(existingAnswer)) continue;

          // タスクを作成
          const task = await this.createAITask(
            spreadsheetData,
            structure,
            workRow,
            group,
            answerCol,
            combinedPrompt
          );
          
          taskList.add(task);
        }

        // レポート化タスクを生成
        if (group.reportColumn !== undefined) {
          console.log(`[TaskGenerator] レポート化列が存在: ${this.indexToColumn(group.reportColumn)}列`);
          const reportTask = this.createReportTask(
            spreadsheetData,
            workRow,
            group,
            taskList.tasks
          );
          if (reportTask) {
            console.log(`[TaskGenerator] レポートタスクをタスクリストに追加: ${reportTask.column}${reportTask.row}`);
            taskList.add(reportTask);
          } else {
            console.log(`[TaskGenerator] レポートタスク生成をスキップ`);
          }
        } else {
          console.log(`[TaskGenerator] レポート化列が存在しません`);
        }
      }
    }

    // controls情報を追加（互換性のため）
    taskList.controls = controls;

    return taskList;
  }

  /**
   * 列制御でグループをフィルタリング
   * 
   * 【重要】プロンプトグループ単位で制御を適用
   * - グループ = プロンプト列群（プロンプト〜プロンプト5）＋ 回答列群
   * - 3種類AI: 1グループに ChatGPT/Claude/Gemini の3つの回答列
   * - 単独AI: 1グループに1つの回答列
   * 
   * 【制御の判定】
   * - グループ内のいずれかの列が制御対象 → グループ全体を処理
   * - 例：P列が「この列のみ処理」でP列がプロンプトグループ内
   *      → そのグループの全回答列（3種類AIなら3列すべて）を処理
   * 
   * @param {Array} groups - プロンプトグループの配列
   * @param {Array} columnControls - 列制御情報の配列
   * @returns {Array} 処理対象のグループ
   */
  filterGroupsByColumnControl(groups, columnControls) {
    if (!columnControls || columnControls.length === 0) {
      return groups;
    }

    // "この列のみ処理"が優先（他の制御を無視）
    const onlyControls = columnControls.filter(c => c.type === "only");
    if (onlyControls.length > 0) {
      return groups.filter(group => {
        // グループ内のプロンプト列のいずれかが制御対象なら、グループ全体を処理
        return group.promptColumns.some(colIndex => 
          onlyControls.some(ctrl => ctrl.index === colIndex)
        );
      });
    }

    // "この列から処理"と"この列で停止"の組み合わせ
    const fromControl = columnControls.find(c => c.type === "from");
    const untilControl = columnControls.find(c => c.type === "until");

    return groups.filter(group => {
      // グループの範囲：最初のプロンプト列 〜 最後の回答列
      const groupStart = group.promptColumns[0];
      const groupEnd = group.answerColumns[group.answerColumns.length - 1].index;

      // fromControl: グループの終端が制御開始位置より前なら除外
      if (fromControl && groupEnd < fromControl.index) return false;
      // untilControl: グループの開始が制御終了位置より後なら除外
      if (untilControl && groupStart > untilControl.index) return false;

      return true;
    });
  }

  /**
   * 行を処理すべきか判定
   * 
   * 【行制御の検出箇所】
   * - 作業行のB列：その行専用の制御
   * - 制御行（1-10行）のA/B列：範囲指定など全体的な制御
   * 
   * 【制御の優先順位】
   * 1. "この行のみ処理" - 指定行だけを処理（最優先）
   * 2. "この行から処理" - 指定行以降を処理
   * 3. "この行の処理後に停止" - 指定行までを処理
   * 
   * @param {number} rowNumber - チェック対象の行番号（1ベース）
   * @param {Array} rowControls - 行制御情報の配列
   * @returns {boolean} 処理すべきかどうか
   */
  shouldProcessRow(rowNumber, rowControls) {
    if (!rowControls || rowControls.length === 0) return true;

    // "この行のみ処理"が優先（他の制御を無視）
    const onlyControls = rowControls.filter(c => c.type === "only");
    if (onlyControls.length > 0) {
      return onlyControls.some(c => c.row === rowNumber);
    }

    // "この行から処理"（開始行より前なら除外）
    const fromControl = rowControls.find(c => c.type === "from");
    if (fromControl && rowNumber < fromControl.row) return false;

    // "この行で停止"（終了行より後なら除外）
    const untilControl = rowControls.find(c => c.type === "until");
    if (untilControl && rowNumber > untilControl.row) return false;

    return true;
  }

  /**
   * プロンプトを連結
   */
  buildCombinedPrompt(spreadsheetData, workRow, group) {
    const prompts = [];

    for (const colIndex of group.promptColumns) {
      const value = this.getCellValue(spreadsheetData, workRow.index, colIndex);
      if (value && value.trim()) {
        prompts.push(value.trim());
      }
    }

    if (prompts.length === 0) return null;

    const combined = prompts.join('\n');
    console.log(`[TaskGenerator] プロンプト連結: ${prompts.length}個 → ${combined.length}文字`);
    return combined;
  }

  /**
   * AIタスクを作成
   */
  async createAITask(spreadsheetData, structure, workRow, group, answerCol, prompt) {
    const { rows } = structure;

    // モデルと機能を取得
    let model = null;
    let specialOperation = null;

    if (rows.model) {
      model = this.getCellValue(spreadsheetData, rows.model.index, answerCol.index);
    }
    if (rows.task) {
      specialOperation = this.getCellValue(spreadsheetData, rows.task.index, answerCol.index);
    }

    // スプレッドシートの設定をそのまま使用（シンプル化）
    // DynamicConfig による上書きを削除し、スプレッドシートの値を直接適用

    const taskData = {
      id: this.generateTaskId(answerCol.column, workRow.number),
      column: answerCol.column,
      row: workRow.number,
      aiType: answerCol.type,
      taskType: "ai",
      prompt: prompt,
      promptColumn: this.indexToColumn(group.promptColumns[0]),
      answerColumn: answerCol.column,
      groupId: `group_row${workRow.number}_${group.aiType}_${group.startIndex}`,
      groupInfo: {
        type: group.aiType,
        columns: group.answerColumns.map(a => a.column),
        promptColumn: this.indexToColumn(group.promptColumns[0])
      },
      multiAI: group.aiType === "3type",
      logColumns: {
        log: this.indexToColumn(group.promptColumns[0] - 1),
        layout: group.aiType
      }
    };

    // オプション設定
    if (model) taskData.model = model;
    if (specialOperation) taskData.specialOperation = specialOperation;

    return new Task(TaskFactory.createTask(taskData));
  }

  /**
   * レポートタスクを作成
   */
  createReportTask(spreadsheetData, workRow, group, existingTasks) {
    // 既存レポートチェック
    const existingReport = this.getCellValue(spreadsheetData, workRow.index, group.reportColumn);
    if (existingReport && existingReport.trim()) {
      console.log(`[TaskGenerator] 既存レポートをスキップ: ${this.indexToColumn(group.reportColumn)}${workRow.number}`);
      return null;
    }

    // このグループ・行のAIタスクを探す
    const relatedTasks = existingTasks.filter(t => 
      t.row === workRow.number && 
      group.answerColumns.some(a => a.column === t.column)
    );

    if (relatedTasks.length === 0) {
      console.log(`[TaskGenerator] 関連AIタスクがないためレポートタスクをスキップ: 行${workRow.number}`);
      return null;
    }

    const reportData = {
      id: this.generateTaskId(this.indexToColumn(group.reportColumn), workRow.number),
      column: this.indexToColumn(group.reportColumn),
      row: workRow.number,
      aiType: relatedTasks[0].aiType,
      taskType: "report",
      sourceColumn: relatedTasks[0].column,
      reportColumn: this.indexToColumn(group.reportColumn),
      promptColumn: this.indexToColumn(group.promptColumns[0]),
      prompt: "レポート生成タスク",
      dependsOn: relatedTasks[0].id,
      groupId: `group_row${workRow.number}_report_${group.reportColumn}`,
      groupInfo: {
        type: "report",
        sourceColumn: relatedTasks[0].column,
        reportColumn: this.indexToColumn(group.reportColumn)
      }
    };

    console.log(`[TaskGenerator] レポートタスクを生成: ${this.indexToColumn(group.reportColumn)}${workRow.number}`);
    return new Task(TaskFactory.createTask(reportData));
  }

  /**
   * 作業行を取得
   */
  getWorkRows(spreadsheetData) {
    const workRows = [];

    // 既存のworkRowsを使用
    if (spreadsheetData.workRows && spreadsheetData.workRows.length > 0) {
      return spreadsheetData.workRows;
    }

    // valuesから生成
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

  /**
   * キーワードで行を検索
   */
  findRowByKeyword(spreadsheetData, keyword) {
    // 既存のプロパティをチェック
    const propMap = {
      "メニュー": "menuRow",
      "使うAI": "aiRow",
      "モデル": "modelRow",
      "機能": "taskRow"
    };

    if (propMap[keyword] && spreadsheetData[propMap[keyword]]) {
      return spreadsheetData[propMap[keyword]];
    }

    // valuesから検索
    const values = spreadsheetData.values || [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row && row[0] && row[0].toString().includes(keyword)) {
        return { index: i, data: row };
      }
    }

    return null;
  }

  /**
   * セル値を取得
   */
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
   * タスクIDを生成
   */
  generateTaskId(column, row) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${column}${row}_${timestamp}_${random}`;
  }

  /**
   * 統計情報をログ出力
   */
  logStatistics(taskList) {
    const stats = taskList.getStatistics();
    
    console.log("[TaskGenerator] === タスク生成完了 ===");
    console.log(`総タスク数: ${taskList.tasks.length}`);
    console.log(`実行可能: ${taskList.getExecutableTasks().length}`);
    console.log(`AI別: ChatGPT=${stats.byAI.chatgpt}, Claude=${stats.byAI.claude}, Gemini=${stats.byAI.gemini}`);

    // 詳細ログ
    console.groupCollapsed("[TaskGenerator] タスク詳細");
    taskList.tasks.forEach((task, i) => {
      console.log(`${i + 1}. ${task.column}${task.row} (${task.aiType}) - ${task.taskType}`);
    });
    console.groupEnd();
  }

  /**
   * ストリーミング処理（互換性維持）
   */
  async generateAndExecuteTasks(spreadsheetData, options = {}) {
    console.log("[TaskGenerator] タスク生成・実行開始");
    
    const taskList = await this.generateTasks(spreadsheetData);
    
    if (taskList.tasks.length === 0) {
      return {
        success: true,
        totalTasks: 0,
        processedColumns: [],
        message: "実行可能なタスクがありません"
      };
    }

    try {
      const result = await this.streamProcessor.processTaskStream(
        taskList,
        spreadsheetData,
        options
      );

      return {
        success: result.success,
        totalTasks: taskList.tasks.length,
        processedColumns: result.processedColumns,
        totalWindows: result.totalWindows
      };
    } catch (error) {
      console.error("[TaskGenerator] ストリーミング処理エラー", error);
      await this.streamProcessor.closeAllWindows();
      throw error;
    }
  }
}

export default TaskGenerator;