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
    
    try {
      // 1. スプレッドシート構造を解析
      const structure = this.analyzeStructure(spreadsheetData);
      
      // 2. タスクを生成
      const taskList = await this.buildTasks(structure, spreadsheetData);
      
      
      return taskList;
    } catch (error) {
      console.error("[TaskGenerator] タスク生成エラー:", error);
      console.error("[TaskGenerator] エラー詳細:", {
        errorMessage: error.message,
        errorStack: error.stack,
        spreadsheetDataKeys: spreadsheetData ? Object.keys(spreadsheetData) : null,
        hasValues: spreadsheetData && spreadsheetData.values ? spreadsheetData.values.length : 0
      });
      
      // エラーの種類に応じて適切なメッセージを設定
      if (error.message.includes("メニュー行が見つかりません")) {
        throw new Error("スプレッドシート構造エラー: メニュー行が見つかりません。スプレッドシートの形式を確認してください。");
      } else if (error.message.includes("SPREADSHEET_CONFIG")) {
        throw new Error("設定エラー: スプレッドシート設定ファイルが読み込まれていません。");
      } else {
        throw new Error(`タスク生成エラー: ${error.message}`);
      }
    }
  }

  /**
   * スプレッドシート構造を解析
   */
  analyzeStructure(spreadsheetData) {
    // 重要な行を特定
    const rows = {
      menu: this.findRowByKeyword(spreadsheetData, "メニュー"),
      ai: this.findRowByKeyword(spreadsheetData, "AI"),
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
      // ログ列から開始してプロンプトグループを識別
      if (cell === "ログ") {
        // 次の列が「プロンプト」かチェック
        const nextIndex = i + 1;
        if (nextIndex < menuRow.data.length && menuRow.data[nextIndex] === "プロンプト") {
          // グループを作成
          const group = {
            startIndex: nextIndex, // プロンプト列がstartIndex
            logColumn: this.indexToColumn(i), // ログ列を記録
            promptColumns: [nextIndex],
            answerColumns: [],
            aiType: null
          };
          
          processed.add(i); // ログ列を処理済みに

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
          const aiValue = aiRow?.data?.[nextIndex] || ""; // プロンプト列のAI値を取得
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
            }
          }

          groups.push(group);
          processed.add(nextIndex); // プロンプト列を処理済みに

        }
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
        // configから行制御文字列を取得
        const config = typeof SPREADSHEET_CONFIG !== "undefined" ? SPREADSHEET_CONFIG : null;
        if (config && config.rowControl && config.rowControl.types) {
          const { startFrom, stopAfter, onlyThis } = config.rowControl.types;
          
          if (cellB.includes(startFrom)) {
            controls.row.push({ type: "from", row: i + 1 });
          } else if (cellB.includes(stopAfter)) {
            controls.row.push({ type: "until", row: i + 1 });
          } else if (cellB.includes(onlyThis)) {
            controls.row.push({ type: "only", row: i + 1 });
          }
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
          // configから列制御文字列を取得
          const config = typeof SPREADSHEET_CONFIG !== "undefined" ? SPREADSHEET_CONFIG : null;
          if (config && config.rowIdentifiers && config.rowIdentifiers.controlRow && config.rowIdentifiers.controlRow.expectedTexts) {
            const [onlyThis, startFrom, stopAfter] = config.rowIdentifiers.controlRow.expectedTexts;
            
            if (cell.includes(startFrom)) {
              controls.column.push({ type: "from", column, index: j });
            } else if (cell.includes(stopAfter)) {
              controls.column.push({ type: "until", column, index: j });
            } else if (cell.includes(onlyThis)) {
              controls.column.push({ type: "only", column, index: j });
            }
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
          if (this.answerFilter.hasAnswer(existingAnswer)) {
            continue;
          }


          // タスクを作成
          const task = await this.createAITask(
            spreadsheetData,
            structure,
            workRow,
            group,
            answerCol,
            combinedPrompt
          );
          
          // 重複チェック付きでタスクを追加
          const added = taskList.add(task);
          if (!added) {
            console.warn(`[TaskGenerator] タスク追加失敗（重複）: ${task.column}${task.row}`);
          }
        }

        // レポート化タスクを生成
        if (group.reportColumn !== undefined) {
          const reportTask = this.createReportTask(
            spreadsheetData,
            workRow,
            group,
            taskList.tasks
          );
          if (reportTask) {
            taskList.add(reportTask);
          }
        }
      }
    }

    // AI列情報を収集してTaskListに設定
    const aiColumns = {};
    for (const group of processableGroups) {
      if (group.aiType && group.answerColumns && group.answerColumns.length > 0) {
        const aiType = group.aiType.toLowerCase();
        if (!aiColumns[aiType]) {
          aiColumns[aiType] = [];
        }
        // 各AIタイプの回答列を記録
        group.answerColumns.forEach(ansCol => {
          if (!aiColumns[aiType].includes(ansCol.column)) {
            aiColumns[aiType].push(ansCol.column);
          }
        });
      }
    }
    taskList.aiColumns = aiColumns;

    // controls情報を追加（互換性のため）
    taskList.controls = controls;


    // タスクが0件の場合の詳細ログ
    if (taskList.tasks.length === 0) {
      console.warn("[TaskGenerator] タスクが生成されませんでした。詳細:", {
        promptGroups: promptGroups.length,
        processableGroups: processableGroups.length,
        workRows: workRows.length,
        controlInfo: {
          columnControls: controls.column,
          rowControls: controls.row
        },
        spreadsheetStructure: {
          hasMenuRow: !!rows.menu,
          hasAIRow: !!rows.ai,
          hasModelRow: !!rows.model,
          hasTaskRow: !!rows.task
        }
      });
    }

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
        // グループ内のログ列、プロンプト列、回答列のいずれかが制御対象なら、グループ全体を処理
        
        // ログ列のチェック（文字列比較）
        const logColumnIndex = this.columnToIndex(group.logColumn);
        const logMatch = logColumnIndex !== null && onlyControls.some(ctrl => ctrl.index === logColumnIndex);
        
        // プロンプト列のチェック
        const promptMatch = group.promptColumns.some(colIndex => 
          onlyControls.some(ctrl => ctrl.index === colIndex)
        );
        
        // 回答列のチェック
        const answerMatch = group.answerColumns.some(answerCol => 
          onlyControls.some(ctrl => ctrl.index === answerCol.index)
        );
        
        const isMatched = logMatch || promptMatch || answerMatch;
        
        if (isMatched) {
          const matchedColumns = [];
          if (logMatch) matchedColumns.push(`ログ列(${group.logColumn})`);
          if (promptMatch) matchedColumns.push(`プロンプト列`);
          if (answerMatch) matchedColumns.push(`回答列`);
          
        }
        
        return isMatched;
      });
    }

    // "この列から処理"と"この列で停止"の組み合わせ
    const fromControl = columnControls.find(c => c.type === "from");
    const untilControl = columnControls.find(c => c.type === "until");

    return groups.filter(group => {
      // グループの全範囲：ログ列 〜 最後の回答列
      const logColumnIndex = this.columnToIndex(group.logColumn);
      const groupStart = logColumnIndex !== null ? logColumnIndex : group.promptColumns[0];
      const groupEnd = group.answerColumns[group.answerColumns.length - 1].index;

      let shouldProcess = true;

      // fromControl: グループ内のいずれかの列が制御開始位置以降にあるかチェック
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

      // untilControl: グループ内のいずれかの列が制御終了位置以前にあるかチェック
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
   * プロンプトを連結（拡張デバッグ版）
   */
  buildCombinedPrompt(spreadsheetData, workRow, group) {
    // デバッグログを削減（開始ログは削除）

    const prompts = [];
    const promptDetails = []; // デバッグ用詳細情報

    for (const colIndex of group.promptColumns) {
      const columnName = this.indexToColumn(colIndex);
      const value = this.getCellValue(spreadsheetData, workRow.index, colIndex);
      
      // プロンプト列取得（ログ削除）
      
      if (value && value.trim()) {
        const trimmedValue = value.trim();
        prompts.push(trimmedValue);
        promptDetails.push({
          column: columnName,
          colIndex: colIndex,
          length: trimmedValue.length,
          preview: trimmedValue.substring(0, 100) + (trimmedValue.length > 100 ? '...' : ''),
          fullValue: trimmedValue // デバッグ用の完全値
        });
      } else {
        // 空のセルも記録
        promptDetails.push({
          column: columnName,
          colIndex: colIndex,
          length: 0,
          preview: '[空]',
          fullValue: value
        });
      }
    }

    if (prompts.length === 0) {
      // プロンプト連結失敗（行${workRow.number}）
      return null;
    }

    const combined = prompts.join('\n');
    
    // プロンプト内容のハッシュを生成（重複検出用）
    const promptHash = this.generateSimpleHash(combined);
    
    // プロンプト連結成功（行${workRow.number}）

    // 重複検出（同じハッシュのプロンプトが既に存在するかチェック）
    if (!this.promptHashTracker) {
      this.promptHashTracker = new Map(); // プロンプトハッシュ → 初回出現位置
    }
    
    if (this.promptHashTracker.has(promptHash)) {
      const firstOccurrence = this.promptHashTracker.get(promptHash);
      console.warn(`[TaskGenerator] ⚠️ 重複プロンプト検出:`, {
        現在: `行${workRow.number} (${group.aiType})`,
        初回出現: firstOccurrence,
        ハッシュ: promptHash,
        プレビュー: combined.substring(0, 100) + '...'
      });
    } else {
      this.promptHashTracker.set(promptHash, `行${workRow.number} (${group.aiType})`);
    }

    return combined;
  }
  
  /**
   * シンプルハッシュ生成（重複検出用）
   */
  generateSimpleHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    return hash.toString(36); // 36進数文字列として返す
  }

  /**
   * AIタスクを作成
   */
  async createAITask(spreadsheetData, structure, workRow, group, answerCol, prompt) {
  
    const { rows } = structure;

    // モデルと機能を取得
    let model = null;
    let specialOperation = null;

    // 3種類AIか単独AIかで取得方法を分ける
    const isThreeTypeAI = (group.aiType === "3type");
    
    if (rows.model) {
      if (isThreeTypeAI) {
        // 3種類AI: 各回答列（ChatGPT回答、Claude回答、Gemini回答）のモデル・機能を取得
        model = this.getCellValue(spreadsheetData, rows.model.index, answerCol.index);
      } else {
        // 単独AI: プロンプト列のモデル・機能を取得
        const promptColumnIndex = group.promptColumns[0]; // 最初のプロンプト列
        model = this.getCellValue(spreadsheetData, rows.model.index, promptColumnIndex);
      }
    }
    
    if (rows.task) {
      if (isThreeTypeAI) {
        // 3種類AI: 各回答列の機能を取得
        specialOperation = this.getCellValue(spreadsheetData, rows.task.index, answerCol.index);
      } else {
        // 単独AI: プロンプト列の機能を取得
        const promptColumnIndex = group.promptColumns[0]; // 最初のプロンプト列
        specialOperation = this.getCellValue(spreadsheetData, rows.task.index, promptColumnIndex);
      }
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
      logColumns: [group.logColumn] // 動的検索されたログ列を使用
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
      return null;
    }

    // このグループ・行のAIタスクを探す
    const relatedTasks = existingTasks.filter(t => 
      t.row === workRow.number && 
      group.answerColumns.some(a => a.column === t.column)
    );

    if (relatedTasks.length === 0) {
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
    // configから動的にプロパティマップを生成
    const config = typeof SPREADSHEET_CONFIG !== "undefined" ? SPREADSHEET_CONFIG : null;
    if (!config) {
      throw new Error("SPREADSHEET_CONFIG が見つかりません。config.js を読み込んでください。");
    }

    const propMap = {};
    Object.entries(config.rowIdentifiers).forEach(([propName, rowConfig]) => {
      propMap[rowConfig.keyword] = propName;
    });

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
    const result = (() => {
      if (rowIndex >= 0 && rowIndex < values.length) {
        const row = values[rowIndex];
        if (row && colIndex >= 0 && colIndex < row.length) {
          return row[colIndex];
        }
      }
      return null;
    })();
    
    
    return result;
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


  /**
   * タスクIDを生成
   */
  generateTaskId(column, row) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${column}${row}_${timestamp}_${random}`;
  }


  /**
   * ストリーミング処理（互換性維持）
   */
  async generateAndExecuteTasks(spreadsheetData, options = {}) {
    
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