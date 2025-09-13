/**
 * @fileoverview TaskGenerator V2 - シンプルなタスク生成システム
 * 
 * 特徴:
 * - プロンプトを含まないタスクリスト生成（セル位置情報のみ）
 * - メモリ効率的な実装
 * - 既存のgenerator.jsの構造解析ロジックを活用
 */

import { TaskList, Task } from './models.js';

export default class TaskGeneratorV2 {
  constructor(logger = console) {
    this.logger = logger;
    this.data = null;
  }

  /**
   * タスクを生成（プロンプトは含まない）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} taskGroups - タスクグループ情報（オプション）
   * @returns {Promise<TaskList>} タスクリスト
   */
  async generateTasks(spreadsheetData, taskGroups = null) {
    this.logger.log('[TaskGeneratorV2] 🚀 タスク生成開始');
    
    // データ配列の実際のサイズを確認
    if (spreadsheetData.values && spreadsheetData.values.length > 0) {
      const maxCols = Math.max(...spreadsheetData.values.map(row => row ? row.length : 0));
      console.log(`[DEBUG] スプレッドシートデータ: ${spreadsheetData.values.length}行 x 最大${maxCols}列`);
      
      // メニュー行のデータを確認
      if (spreadsheetData.menuRow) {
        console.log(`[DEBUG] メニュー行の列数: ${spreadsheetData.menuRow.data ? spreadsheetData.menuRow.data.length : 0}列`);
      }
    }
    
    this.data = spreadsheetData;
    const taskList = new TaskList();
    
    // 構造解析
    const structure = this.analyzeStructure(spreadsheetData);
    const { rows, promptGroups, controls, workRows } = structure;
    
    this.logger.log(`[TaskGeneratorV2] 📊 構造解析完了:`, {
      menuRow: rows.menu,
      aiRow: rows.ai,
      modelRow: rows.model,
      functionRow: rows.function,
      promptGroups: promptGroups.length,
      workRows: workRows.length,
      columnControls: controls.column,
      rowControls: controls.row
    });
    
    
    // 各作業行でタスク生成
    let taskCount = 0;
    
    for (const workRow of workRows) {
      // 行制御チェック
      if (!this.shouldProcessRow(workRow.number, controls.row)) {
        continue;
      }
      
      // 各プロンプトグループでタスク生成
      for (const promptGroup of promptGroups) {
        // 列制御チェック
        if (!this.shouldProcessColumn(promptGroup, controls.column)) {
          continue;
        }
        
        // プロンプト列の存在確認（プロンプトの内容は取得しない）
        const hasPrompt = this.hasPromptInRow(spreadsheetData, workRow, promptGroup);
        if (!hasPrompt) {
          continue;
        }
        
        // 3種類AI列かどうかを判定
        const is3TypeAI = promptGroup.aiType.includes('3種類') || promptGroup.aiType.includes('３種類');
        
        if (is3TypeAI) {
          // 3種類AI列の処理：各回答列（F,G,H）に対してタスクを生成
          for (let i = 0; i < promptGroup.answerColumns.length; i++) {
            const answerCol = promptGroup.answerColumns[i];
            
            // 既存回答チェック
            const existingAnswer = this.getCellValue(spreadsheetData, workRow.index, answerCol.index);
            if (this.hasAnswer(existingAnswer)) {
              continue;
            }
            
            const functionValue = this.getFunction(spreadsheetData, answerCol, promptGroup.promptColumns);
            
            // ログ列を特定（タスクグループから取得、なければプロンプト列の1列前）
            let logColumn = null;
            if (taskGroups && taskGroups.length > 0) {
              // タスクグループからログ列を探す
              const matchingGroup = taskGroups.find(group => {
                // プロンプト列が一致するグループを探す
                const groupPromptIndices = group.columnRange?.promptColumns?.map(col => 
                  typeof col === 'string' ? this.columnToIndex(col) : col
                ) || [];
                return groupPromptIndices.some(idx => promptGroup.promptColumns.includes(idx));
              });
              if (matchingGroup?.columnRange?.logColumn) {
                logColumn = matchingGroup.columnRange.logColumn;
                this.logger.log(`[TaskGeneratorV2] タスクグループからログ列を取得: ${logColumn}`);
              }
            }
            
            // タスクグループにログ列がない場合はデフォルト（プロンプト列の1列前）
            if (!logColumn) {
              const logColumnIndex = Math.max(0, Math.min(...promptGroup.promptColumns) - 1);
              logColumn = this.indexToColumn(logColumnIndex);
              this.logger.log(`[TaskGeneratorV2] デフォルトログ列を使用: ${logColumn} (プロンプト列の1列前)`);
            }
            
            // グループポジションを決定（ChatGPT:0, Claude:1, Gemini:2）
            const groupPosition = i;
            
            const taskData = {
              id: this.generateTaskId(answerCol.column, workRow.number),
              row: workRow.number,
              column: answerCol.column,  // F列、G列、H列など（回答列）
              promptColumns: promptGroup.promptColumns,  // D,E列（プロンプト列）
              aiType: answerCol.type,  // ChatGPT, Claude, Gemini
              model: this.getModel(spreadsheetData, answerCol, promptGroup.promptColumns),
              function: functionValue,
              cellInfo: {
                row: workRow.number,
                column: answerCol.column,
                columnIndex: answerCol.index
              },
              // ログ列情報を追加
              logColumns: [logColumn],
              // グループ情報（groupTypeとgroupPositionを追加）
              multiAI: true,
              groupId: `group_${workRow.number}_${this.indexToColumn(promptGroup.promptColumns[0])}`,
              groupType: '3type',  // 3種類AIグループを明示
              groupPosition: groupPosition,  // 0:ChatGPT, 1:Claude, 2:Gemini
              // Task必須フィールド
              prompt: '',  // 実行時に動的取得
              taskType: 'ai',
              createdAt: Date.now(),
              version: '2.0'
            };
            
            const task = new Task(taskData);
            taskList.add(task);
            taskCount++;
          }
        } else {
          // 通常のAI列の処理（従来通り）
          for (let answerIndex = 0; answerIndex < promptGroup.answerColumns.length; answerIndex++) {
            const answerCol = promptGroup.answerColumns[answerIndex];
            
            // 個別の既存回答チェック（既に回答があるタスクはスキップ）
            const existingAnswer = this.getCellValue(spreadsheetData, workRow.index, answerCol.index);
            if (this.hasAnswer(existingAnswer)) {
              continue;
            }
            
            // AI種別を設定
            const aiType = promptGroup.aiType.toLowerCase();  // 小文字に統一（'Claude' → 'claude'）
            
            // 単独AIの場合、プロンプト列の設定を使用
            const promptCol = {
              index: promptGroup.promptColumns[0],
              column: this.indexToColumn(promptGroup.promptColumns[0])
            };
            
            // プロンプト列からモデルと機能を取得
            const model = this.getModel(spreadsheetData, promptCol);
            const functionValue = this.getFunction(spreadsheetData, promptCol);
            
            // ログ列を特定（タスクグループから取得、なければプロンプト列の1列前）
            let logColumn = null;
            if (taskGroups && taskGroups.length > 0) {
              // タスクグループからログ列を探す
              const matchingGroup = taskGroups.find(group => {
                // プロンプト列が一致するグループを探す
                const groupPromptIndices = group.columnRange?.promptColumns?.map(col => 
                  typeof col === 'string' ? this.columnToIndex(col) : col
                ) || [];
                return groupPromptIndices.some(idx => promptGroup.promptColumns.includes(idx));
              });
              if (matchingGroup?.columnRange?.logColumn) {
                logColumn = matchingGroup.columnRange.logColumn;
                this.logger.log(`[TaskGeneratorV2] タスクグループからログ列を取得: ${logColumn}`);
              }
            }
            
            // タスクグループにログ列がない場合はデフォルト（プロンプト列の1列前）
            if (!logColumn) {
              const logColumnIndex = Math.max(0, Math.min(...promptGroup.promptColumns) - 1);
              logColumn = this.indexToColumn(logColumnIndex);
              this.logger.log(`[TaskGeneratorV2] デフォルトログ列を使用: ${logColumn} (プロンプト列の1列前)`);
            }
            
            
            const taskData = {
              id: this.generateTaskId(answerCol.column, workRow.number),
              row: workRow.number,
              column: answerCol.column,
              promptColumns: promptGroup.promptColumns,  // プロンプト列の位置のみ
              aiType: aiType,
              model: model,
              function: functionValue,
              cellInfo: {
                row: workRow.number,
                column: answerCol.column,
                columnIndex: answerCol.index
              },
              // ログ列情報を追加
              logColumns: [logColumn],
              // グループ情報
              multiAI: false,
              groupId: null,
              // Task必須フィールド
              prompt: '',  // 実行時に動的取得
              taskType: 'ai',
              createdAt: Date.now(),
              version: '2.0'
            };
            
            const task = new Task(taskData);
            taskList.add(task);
            taskCount++;
          }
        }
      }
    }
    
    this.logger.log(`[TaskGeneratorV2] ✅ タスク生成完了: ${taskCount}件`);
    
    // 列別タスク数を表示
    const columnCounts = {};
    taskList.tasks.forEach(task => {
      columnCounts[task.column] = (columnCounts[task.column] || 0) + 1;
    });
    
    
    return taskList;
  }

  /**
   * スプレッドシート構造を解析
   */
  analyzeStructure(data) {
    const rows = {
      menu: null,
      ai: null,
      model: null,
      function: null
    };
    
    // 制御行を検索
    for (let i = 0; i < Math.min(10, data.values.length); i++) {
      const firstCell = data.values[i][0];
      if (!firstCell) continue;
      
      // firstCellを文字列に変換してからtoLowerCaseを呼び出す
      const cellValue = String(firstCell).toLowerCase();
      
      if (cellValue.includes('メニュー')) {
        rows.menu = i;
      } else if (cellValue === 'ai') {
        rows.ai = i;
      } else if (cellValue === 'モデル' || cellValue === 'model') {
        rows.model = i;
      } else if (cellValue === '機能' || cellValue === 'function') {
        rows.function = i;
      }
    }
    
    // プロンプトグループを特定
    const promptGroups = this.identifyPromptGroups(data, rows);
    
    // 制御情報を取得
    const controls = {
      row: this.getRowControl(data),
      column: this.getColumnControl(data, rows)
    };
    
    // 作業行を特定
    const workRows = this.identifyWorkRows(data, rows);
    
    return { rows, promptGroups, controls, workRows };
  }

  /**
   * プロンプトグループを特定
   * taskGroups情報があれば優先的に使用し、なければ従来のロジックで解析
   */
  identifyPromptGroups(data, rows) {
    // processSpreadsheetData()で生成されたtaskGroups情報があればそれを使用
    if (data.taskGroups && data.taskGroups.length > 0) {
      console.log('[TaskGeneratorV2] taskGroups情報を使用してプロンプトグループを構築');
      return this.convertTaskGroupsToPromptGroups(data.taskGroups);
    }
    
    // フォールバック: 従来のロジックで解析
    console.log('[TaskGeneratorV2] taskGroups情報がないため、従来のロジックで解析');
    const groups = [];
    
    if (!rows.menu || !rows.ai) {
      return groups;
    }
    
    const menuRow = data.values[rows.menu];
    const aiRow = data.values[rows.ai];
    
    // 構造解析のデバッグログ（簡潔版）
    const menuNonEmpty = menuRow.filter(cell => cell && cell.trim()).length;
    const aiNonEmpty = aiRow.filter(cell => cell && cell.trim()).length;
    console.log(`[TaskGeneratorV2] 構造解析: メニュー行${menuNonEmpty}列, AI行${aiNonEmpty}列`);
    
    let currentGroup = null;
    
    for (let i = 0; i < menuRow.length; i++) {
      const menuCell = menuRow[i];
      const aiCell = aiRow[i];
      
      // プロンプト列を検出
      if (menuCell && menuCell.includes('プロンプト')) {
        if (!currentGroup) {
          currentGroup = {
            promptColumns: [],
            answerColumns: [],
            aiType: aiCell || 'Claude'
          };
        }
        currentGroup.promptColumns.push(i);
      }
      // 回答列を検出
      else if (menuCell && (menuCell.includes('回答') || menuCell.includes('答'))) {
        if (currentGroup) {
          // AIタイプを判定（AI行またはメニュー行から）
          let aiType = 'ChatGPT'; // デフォルト
          
          // まずAI行の値から判定
          if (aiCell && aiCell.trim() !== '') {
            const aiCellLower = aiCell.toLowerCase();
            if (aiCellLower.includes('chatgpt') || aiCellLower.includes('gpt')) {
              aiType = 'ChatGPT';
            } else if (aiCellLower.includes('claude')) {
              aiType = 'Claude';
            } else if (aiCellLower.includes('gemini')) {
              aiType = 'Gemini';
            }
          }
          // AI行が空の場合はメニュー行から判定（3種類AIの場合）
          else {
            const menuCellLower = menuCell.toLowerCase();
            if (menuCellLower.includes('chatgpt') || menuCellLower.includes('gpt')) {
              aiType = 'ChatGPT';
            } else if (menuCellLower.includes('claude')) {
              aiType = 'Claude';
            } else if (menuCellLower.includes('gemini')) {
              aiType = 'Gemini';
            }
          }
          
          currentGroup.answerColumns.push({
            index: i,
            column: this.indexToColumn(i),
            type: aiType  // AIタイプを設定
          });
          
        }
      }
      // グループの終了を検出
      else if (currentGroup && currentGroup.promptColumns.length > 0) {
        if (currentGroup.answerColumns.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = null;
      }
    }
    
    // 最後のグループを追加
    if (currentGroup && currentGroup.answerColumns.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  /**
   * taskGroups情報をTaskGeneratorV2が期待するpromptGroups形式に変換
   */
  convertTaskGroupsToPromptGroups(taskGroups) {
    const promptGroups = [];
    
    try {
      if (!taskGroups || !Array.isArray(taskGroups)) {
        console.warn('[TaskGeneratorV2] taskGroupsが無効です:', taskGroups);
        return promptGroups;
      }
      
      for (const taskGroup of taskGroups) {
        try {
          // タスクグループの必須フィールドをチェック
          if (!taskGroup.columnRange || !taskGroup.columnRange.promptColumns || !taskGroup.columnRange.answerColumns) {
            console.warn('[TaskGeneratorV2] 無効なtaskGroup構造をスキップ:', taskGroup);
            continue;
          }
          
          // プロンプト列のインデックスを取得
          const promptColumns = taskGroup.columnRange.promptColumns.map(col => {
            if (typeof col === 'string') {
              return this.columnToIndex(col);
            }
            return col; // 既にインデックスの場合
          });
          
          // 回答列情報を変換
          const answerColumns = taskGroup.columnRange.answerColumns.map(answerCol => {
            if (typeof answerCol === 'object' && answerCol.column) {
              return {
                index: answerCol.index !== undefined ? answerCol.index : this.columnToIndex(answerCol.column),
                column: answerCol.column,
                type: answerCol.aiType || 'Claude'
              };
            }
            // フォールバック処理
            return {
              index: this.columnToIndex(answerCol),
              column: answerCol,
              type: 'Claude'
            };
          });
          
          // TaskGeneratorV2の形式に変換
          const promptGroup = {
            promptColumns: promptColumns,
            answerColumns: answerColumns,
            aiType: taskGroup.aiType || 'Claude',
            groupId: taskGroup.id || `group_${promptGroups.length + 1}`,
            groupType: taskGroup.groupType || 'single',
            sequenceOrder: taskGroup.sequenceOrder || promptGroups.length + 1
          };
          
          promptGroups.push(promptGroup);
          
          console.log(`[TaskGeneratorV2] taskGroup ${promptGroup.groupId} を promptGroup に変換:`, {
            promptColumns: promptGroup.promptColumns.map(idx => this.indexToColumn(idx)),
            answerColumns: promptGroup.answerColumns.map(col => `${col.column}(${col.type})`),
            aiType: promptGroup.aiType,
            groupType: promptGroup.groupType
          });
          
        } catch (groupError) {
          console.error(`[TaskGeneratorV2] taskGroup変換エラー (${taskGroup.id || 'unknown'}):`, groupError);
          continue; // エラーが発生したグループをスキップして続行
        }
      }
      
    } catch (error) {
      console.error('[TaskGeneratorV2] convertTaskGroupsToPromptGroups エラー:', error);
    }
    
    return promptGroups;
  }

  /**
   * 作業行を特定
   */
  identifyWorkRows(data, rows) {
    const workRows = [];
    const startRow = Math.max(
      (rows.menu || 0) + 1,
      (rows.ai || 0) + 1,
      (rows.model || 0) + 1,
      (rows.function || 0) + 1,
      8  // 最低でも9行目から
    );
    
    for (let i = startRow; i < data.values.length; i++) {
      const row = data.values[i];
      
      // 空行はスキップ
      if (!row || row.every(cell => !cell)) {
        continue;
      }
      
      workRows.push({
        index: i,
        number: i + 1  // 1-based行番号
      });
    }
    
    return workRows;
  }

  /**
   * プロンプトが存在するかチェック（内容は取得しない）
   */
  hasPromptInRow(data, workRow, promptGroup) {
    for (const colIndex of promptGroup.promptColumns) {
      const cell = this.getCellValue(data, workRow.index, colIndex);
      // 空文字列や"null"文字列は無視
      if (cell && cell !== "" && cell !== "null" && cell.trim()) {
        return true;
      }
    }
    return false;
  }

  /**
   * セルの値を取得
   */
  getCellValue(data, rowIndex, colIndex) {
    if (!data.values[rowIndex]) {
      console.log(`[DEBUG] getCellValue: 行${rowIndex}が存在しません`);
      return null;
    }
    if (colIndex >= data.values[rowIndex].length) {
      console.log(`[DEBUG] getCellValue: 行${rowIndex}の列${colIndex}(${this.indexToColumn(colIndex)})が範囲外です（行の長さ: ${data.values[rowIndex].length}列）`);
      // 範囲外の場合は空文字を返す（nullではなく）
      return "";
    }
    return data.values[rowIndex][colIndex] || null;
  }

  /**
   * 回答が既に存在するかチェック
   */
  hasAnswer(value) {
    if (!value) return false;
    
    const trimmed = value.trim();
    if (!trimmed) return false;
    
    // 「処理完了」は未回答として扱う
    if (trimmed === '処理完了') {
      this.logger?.log(`[TaskGeneratorV2] 「処理完了」を検出 → 未回答として扱う: "${trimmed}"`);
      return false;
    }
    
    // 排他制御マーカーは未回答として扱う
    // タイムアウト判定はRetryManagerで行う
    if (trimmed.startsWith('現在操作中です_')) {
      this.logger?.log(`[TaskGeneratorV2] 排他制御マーカーを検出 → 未回答として扱う: "${trimmed.substring(0, 50)}..."`);
      return false;
    }
    
    // エラーマーカーは回答なしとして扱う
    const errorMarkers = ['error', 'エラー', 'failed', '失敗', '×'];
    for (const marker of errorMarkers) {
      if (trimmed.toLowerCase().includes(marker)) {
        this.logger?.log(`[TaskGeneratorV2] エラーマーカーを検出 → 未回答として扱う: "${trimmed}"`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * モデル情報を取得
   * @param {Object} data - スプレッドシートデータ
   * @param {Object} answerCol - 回答列情報
   * @param {Array} promptColumns - プロンプト列のインデックス配列（通常処理用）
   */
  getModel(data, answerCol, promptColumns = null) {
    const modelRow = data.values.find(row => 
      row[0] && (row[0] === 'モデル' || row[0].toLowerCase() === 'model')
    );
    
    if (modelRow) {
      // まず回答列の機能を確認
      const functionRow = data.values.find(row => 
        row[0] && (row[0] === '機能' || row[0].toLowerCase() === 'function')
      );
      
      const functionValue = functionRow ? functionRow[answerCol.index] : null;
      
      // 機能が「通常」の場合、プロンプト列から取得
      if (functionValue === '通常' && promptColumns && promptColumns.length > 0) {
        // プロンプト列の最初の列からモデルを取得
        const promptModelValue = modelRow[promptColumns[0]];
        if (promptModelValue) {
          return promptModelValue;
        }
      }
      
      // それ以外は回答列から取得
      const modelValue = modelRow[answerCol.index];
      if (modelValue) {
        return modelValue;
      }
    }
    
    // デフォルトモデル
    const defaultModels = {
      'claude': 'Claude Opus 4.1',
      'chatgpt': 'GPT-4',
      'gemini': 'Gemini Pro',
      'genspark': 'Genspark'
    };
    
    const aiTypeLower = answerCol.type ? answerCol.type.toLowerCase() : 'claude';
    return defaultModels[aiTypeLower] || 'Claude Opus 4.1';
  }

  /**
   * 機能情報を取得
   * @param {Object} data - スプレッドシートデータ
   * @param {Object} answerCol - 回答列情報
   * @param {Array} promptColumns - プロンプト列のインデックス配列（通常処理用）
   */
  getFunction(data, answerCol, promptColumns = null) {
    const functionRow = data.values.find(row => 
      row[0] && (row[0] === '機能' || row[0].toLowerCase() === 'function')
    );
    
    if (functionRow) {
      // まず回答列の機能を確認
      const answerFunctionValue = functionRow[answerCol.index];
      
      
      // 機能が「通常」または空の場合、プロンプト列から取得
      if ((answerFunctionValue === '通常' || !answerFunctionValue || answerFunctionValue === '') && promptColumns && promptColumns.length > 0) {
        // プロンプト列の最初の列から機能を取得
        const promptFunctionValue = functionRow[promptColumns[0]];
        
        if (promptFunctionValue) {
          return promptFunctionValue;
        }
      }
      
      // それ以外は回答列の値を返す
      if (answerFunctionValue) {
        return answerFunctionValue;
      }
    }
    
    return '通常';
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
      const answerMatch = promptGroup.answerColumns.some(answerCol => 
        onlyControls.some(ctrl => ctrl.index === answerCol.index)
      );
      
      return promptMatch || answerMatch;
    }
    
    // "この列から処理"と"この列で停止"
    const fromControl = columnControls.find(c => c.type === 'from');
    const untilControl = columnControls.find(c => c.type === 'until');
    
    
    // グループの範囲を判定
    const groupStart = Math.min(...promptGroup.promptColumns);
    const groupEnd = Math.max(...promptGroup.answerColumns.map(a => a.index));
    
    let shouldProcess = true;
    
    if (fromControl && groupEnd < fromControl.index) {
      shouldProcess = false;
    }
    
    // "この列で停止" - 制御列を含むグループまでは処理する
    // （制御列より後のグループを停止）
    if (untilControl && groupStart > untilControl.index) {
      shouldProcess = false;
      console.log(`[DEBUG] 列制御「${untilControl.column}列で停止」により、グループ(開始:${this.indexToColumn(groupStart)})をスキップ`);
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
  getColumnControl(data, rows) {
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
   * 制御値をパース
   */
  parseControlValues(str) {
    const values = [];
    const parts = str.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (/^\d+$/.test(trimmed)) {
        values.push(parseInt(trimmed, 10));
      } else if (/^\d+-\d+$/.test(trimmed)) {
        const [start, end] = trimmed.split('-').map(n => parseInt(n, 10));
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      }
    }
    
    return values;
  }

  /**
   * 列インデックスを列名に変換
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
   * 列名を列インデックスに変換
   */
  columnToIndex(column) {
    if (typeof column !== 'string' || column.length === 0) {
      return 0;
    }
    
    let index = 0;
    const upperColumn = column.toUpperCase();
    
    for (let i = 0; i < upperColumn.length; i++) {
      index = index * 26 + (upperColumn.charCodeAt(i) - 64);
    }
    
    return index - 1; // 0ベースインデックスに変換
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
   * 特定のプロンプトグループのタスクのみを生成
   * 
   * プロンプトグループとは、プロンプト列と回答列のセットのこと。
   * 例：
   * - グループ1: D,E列（プロンプト） → F列（Claude回答）
   * - グループ2: D,E列（プロンプト） → F,G,H列（ChatGPT, Claude, Gemini回答）
   * - グループ3: J列（プロンプト） → K列（ChatGPT回答）
   * 
   * この関数は、指定されたグループのタスクのみを生成する。
   * グループ1が完了してから、グループ2のタスクを生成することで、
   * メモリ効率的な処理を実現する。
   * 
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {number} promptGroupIndex - プロンプトグループのインデックス（0始まり）
   * @returns {Promise<TaskList>} タスクリスト
   */
  async generateTasksForPromptGroup(spreadsheetData, promptGroupIndex) {
    this.logger.log(`[TaskGeneratorV2] 🎯 プロンプトグループ${promptGroupIndex + 1}のタスク生成開始`);
    
    this.data = spreadsheetData;
    const taskList = new TaskList();
    
    // スプレッドシートの構造を解析（メニュー行、AI行、作業行などを特定）
    const structure = this.analyzeStructure(spreadsheetData);
    const { rows, promptGroups, controls, workRows } = structure;
    
    // 指定されたインデックスのプロンプトグループを取得
    // promptGroupsは左から右への順序で格納されている
    if (!promptGroups[promptGroupIndex]) {
      this.logger.warn(`[TaskGeneratorV2] プロンプトグループ${promptGroupIndex}が存在しません`);
      return taskList;
    }
    
    const targetPromptGroup = promptGroups[promptGroupIndex];
    
    // taskGroups情報からの追加情報を取得
    let taskGroupInfo = null;
    if (spreadsheetData.taskGroups && spreadsheetData.taskGroups.length > promptGroupIndex) {
      taskGroupInfo = spreadsheetData.taskGroups[promptGroupIndex];
      this.logger.log(`[TaskGeneratorV2] taskGroups情報を使用:`, {
        groupId: taskGroupInfo.id,
        groupName: taskGroupInfo.name,
        dependencies: taskGroupInfo.dependencies,
        sequenceOrder: taskGroupInfo.sequenceOrder
      });
    }
    
    this.logger.log(`[TaskGeneratorV2] 📊 プロンプトグループ${promptGroupIndex + 1}:`, {
      promptColumns: targetPromptGroup.promptColumns.map(i => this.indexToColumn(i)),
      answerColumns: targetPromptGroup.answerColumns.map(col => col.column),
      aiType: targetPromptGroup.aiType
    });
    
    // デバッグ：H列のインデックスを確認
    const hColumn = targetPromptGroup.answerColumns.find(col => col.column === 'H');
    if (hColumn) {
      this.logger.log(`[DEBUG] H列のインデックス: ${hColumn.index}`);
      this.logger.log(`[DEBUG] スプレッドシートのデータ行数: ${spreadsheetData.values ? spreadsheetData.values.length : 'undefined'}`);
      if (spreadsheetData.values && spreadsheetData.values[16]) { // H17 = 16行目（0-indexed）
        this.logger.log(`[DEBUG] 行17のデータ長: ${spreadsheetData.values[16].length}`);
        this.logger.log(`[DEBUG] H17(index ${hColumn.index})の値: "${spreadsheetData.values[16][hColumn.index] ? String(spreadsheetData.values[16][hColumn.index]).substring(0, 50) + '...' : spreadsheetData.values[16][hColumn.index]}"`);
      }
    }
    
    let taskCount = 0;
    const skippedCells = []; // スキップされたセルを収集
    
    // 各作業行（9行目以降）に対してタスクを生成
    // 注意：このループは指定されたプロンプトグループのタスクのみを生成する
    this.logger.log(`[TaskGeneratorV2] 作業行数: ${workRows.length}, 開始行: ${workRows[0]?.number}`);
    for (const workRow of workRows) {
      // 「この行から処理」「この行で停止」などの行制御をチェック
      if (!this.shouldProcessRow(workRow.number, controls.row)) {
        continue;
      }
      
      // 「この列から処理」「この列で停止」などの列制御をチェック
      if (!this.shouldProcessColumn(targetPromptGroup, controls.column)) {
        continue;
      }
      
      // この行にプロンプトが存在するか確認（空行はスキップ）
      const hasPromptInRow = this.hasPromptInRow(spreadsheetData, workRow, targetPromptGroup);
      if (!hasPromptInRow) {
        continue;
      }
      
      // このグループが3種類AI（ChatGPT, Claude, Gemini並列）かどうかを判定
      // AI行に「3種類」と記載されている場合、3つのAIが同じプロンプトを処理する
      const is3TypeAI = targetPromptGroup.aiType.includes('3種類') || targetPromptGroup.aiType.includes('３種類');
      
      if (is3TypeAI) {
        // ========================================
        // 3種類AI列の処理（F,G,H列が同時に処理される）
        // 例：D,E列のプロンプト → F列(ChatGPT), G列(Claude), H列(Gemini)
        // ========================================
        for (let i = 0; i < targetPromptGroup.answerColumns.length; i++) {
          const answerCol = targetPromptGroup.answerColumns[i];
          
          // すでに回答が記載されている場合はスキップ
          const existingAnswer = this.getCellValue(spreadsheetData, workRow.index, answerCol.index);
          
          // デバッグログ：H列の値を詳細に出力
          if (answerCol.column === 'H') {
            this.logger.log(`[DEBUG] H${workRow.number}の確認:`)
            this.logger.log(`  - workRow.index: ${workRow.index}`);
            this.logger.log(`  - answerCol.index: ${answerCol.index}`);
            this.logger.log(`  - 取得値: "${existingAnswer ? existingAnswer.substring(0, 50) + '...' : existingAnswer}"`);
            this.logger.log(`  - hasAnswer判定: ${this.hasAnswer(existingAnswer)}`);
            
            // spreadsheetDataの該当行を確認
            if (spreadsheetData.values && spreadsheetData.values[workRow.index]) {
              const rowData = spreadsheetData.values[workRow.index];
              this.logger.log(`  - 行データ長: ${rowData.length}`);
              this.logger.log(`  - H列(index ${answerCol.index})の生データ: "${rowData[answerCol.index] ? String(rowData[answerCol.index]).substring(0, 50) + '...' : rowData[answerCol.index]}"`);
            }
          }
          
          if (this.hasAnswer(existingAnswer)) {
            skippedCells.push(`${answerCol.column}${workRow.number}`);
            continue;
          }
          
          const functionValue = this.getFunction(spreadsheetData, answerCol, targetPromptGroup.promptColumns);
          
          // タスクグループからログ列を取得（設定されていれば）
          let logColumn = null;
          console.log(`[DEBUG] マルチAI - taskGroupInfo内容:`, {
            exists: !!taskGroupInfo,
            columnRange: taskGroupInfo?.columnRange,
            logColumn: taskGroupInfo?.columnRange?.logColumn,
            promptColumns: targetPromptGroup.promptColumns.map(idx => this.indexToColumn(idx)),
            groupIndex: promptGroupIndex
          });
          
          if (taskGroupInfo?.columnRange?.logColumn) {
            logColumn = taskGroupInfo.columnRange.logColumn;
            console.log(`[TaskGeneratorV2] ✅ マルチAI - タスクグループからログ列を取得: ${logColumn}`);
            this.logger.log(`[TaskGeneratorV2] タスクグループからログ列を取得: ${logColumn}`);
          }
          
          // タスクグループにログ列が設定されていない場合のみ計算
          if (!logColumn) {
            const logColumnIndex = Math.max(0, Math.min(...targetPromptGroup.promptColumns) - 1);
            logColumn = this.indexToColumn(logColumnIndex);
            console.log(`[TaskGeneratorV2] ❌ マルチAI - デフォルトログ列を使用: ${logColumn} (プロンプト列の1列前)`);
            this.logger.log(`[TaskGeneratorV2] デフォルトログ列を使用: ${logColumn} (プロンプト列の1列前)`);
          }
          
          const groupPosition = i;
          
          // モデルと機能の取得をデバッグ
          const modelValue = this.getModel(spreadsheetData, answerCol, targetPromptGroup.promptColumns);
          console.log(`[TaskGeneratorV2] 📊 ${answerCol.column}${workRow.number} - モデル取得:`, {
            取得値: modelValue || '❌空',
            answerCol: answerCol.column,
            promptColumns: targetPromptGroup.promptColumns.map(idx => this.indexToColumn(idx))
          });

          const taskData = {
            id: this.generateTaskId(answerCol.column, workRow.number),
            row: workRow.number,
            column: answerCol.column,
            promptColumns: targetPromptGroup.promptColumns,
            aiType: answerCol.type,
            model: modelValue || '',
            function: functionValue || '',
            cellInfo: {
              row: workRow.number,
              column: answerCol.column,
              columnIndex: answerCol.index
            },
            logColumns: [logColumn],
            multiAI: true,
            groupId: taskGroupInfo ? taskGroupInfo.id : `group_${workRow.number}_${this.indexToColumn(targetPromptGroup.promptColumns[0])}`,
            groupType: taskGroupInfo ? taskGroupInfo.groupType : '3type',
            groupPosition: groupPosition,
            sequenceOrder: taskGroupInfo ? taskGroupInfo.sequenceOrder : promptGroupIndex + 1,
            dependencies: taskGroupInfo ? taskGroupInfo.dependencies : [],
            prompt: '',  // 実行時に動的取得
            text: '',    // 互換性のため追加
            taskType: 'ai',
            createdAt: Date.now(),
            version: '2.0'
          };
          
          const task = new Task(taskData);
          taskList.add(task);
          taskCount++;
        }
      } else {
        // ========================================
        // 通常の単独AI列の処理（1つのAIが1つの回答列を担当）
        // 例：J列のプロンプト → K列(ChatGPT回答)
        // ========================================
        for (let answerIndex = 0; answerIndex < targetPromptGroup.answerColumns.length; answerIndex++) {
          const answerCol = targetPromptGroup.answerColumns[answerIndex];
          
          // すでに回答が記載されている場合はスキップ
          const existingAnswer = this.getCellValue(spreadsheetData, workRow.index, answerCol.index);
          
          // デバッグログ：H列の値を詳細に出力
          if (answerCol.column === 'H') {
            this.logger.log(`[DEBUG] H${workRow.number}の確認:`)
            this.logger.log(`  - workRow.index: ${workRow.index}`);
            this.logger.log(`  - answerCol.index: ${answerCol.index}`);
            this.logger.log(`  - 取得値: "${existingAnswer ? existingAnswer.substring(0, 50) + '...' : existingAnswer}"`);
            this.logger.log(`  - hasAnswer判定: ${this.hasAnswer(existingAnswer)}`);
            
            // spreadsheetDataの該当行を確認
            if (spreadsheetData.values && spreadsheetData.values[workRow.index]) {
              const rowData = spreadsheetData.values[workRow.index];
              this.logger.log(`  - 行データ長: ${rowData.length}`);
              this.logger.log(`  - H列(index ${answerCol.index})の生データ: "${rowData[answerCol.index] ? String(rowData[answerCol.index]).substring(0, 50) + '...' : rowData[answerCol.index]}"`);
            }
          }
          
          if (this.hasAnswer(existingAnswer)) {
            skippedCells.push(`${answerCol.column}${workRow.number}`);
            continue;
          }
          
          const aiType = targetPromptGroup.aiType.toLowerCase();
          const promptCol = {
            index: targetPromptGroup.promptColumns[0],
            column: this.indexToColumn(targetPromptGroup.promptColumns[0])
          };
          
          const model = this.getModel(spreadsheetData, promptCol);
          const functionValue = this.getFunction(spreadsheetData, promptCol);

          // デバッグ：モデルと機能の取得状況
          console.log(`[TaskGeneratorV2] 📊 ${answerCol.column}${workRow.number} - 単独AI設定:`, {
            モデル: model || '❌空',
            機能: functionValue || '❌空',
            aiType: aiType,
            promptCol: promptCol.column
          });
          
          // タスクグループからログ列を取得（設定されていれば）
          let logColumn = null;
          console.log(`[DEBUG] 単独AI - taskGroupInfo内容:`, {
            exists: !!taskGroupInfo,
            columnRange: taskGroupInfo?.columnRange,
            logColumn: taskGroupInfo?.columnRange?.logColumn,
            promptColumns: targetPromptGroup.promptColumns.map(idx => this.indexToColumn(idx)),
            groupIndex: promptGroupIndex
          });
          
          if (taskGroupInfo?.columnRange?.logColumn) {
            logColumn = taskGroupInfo.columnRange.logColumn;
            console.log(`[TaskGeneratorV2] ✅ 単独AI - タスクグループからログ列を取得: ${logColumn}`);
            this.logger.log(`[TaskGeneratorV2] タスクグループからログ列を取得: ${logColumn}`);
          }
          
          // タスクグループにログ列が設定されていない場合のみ計算
          if (!logColumn) {
            const logColumnIndex = Math.max(0, Math.min(...targetPromptGroup.promptColumns) - 1);
            logColumn = this.indexToColumn(logColumnIndex);
            console.log(`[TaskGeneratorV2] ❌ 単独AI - デフォルトログ列を使用: ${logColumn} (プロンプト列の1列前)`);
            this.logger.log(`[TaskGeneratorV2] デフォルトログ列を使用: ${logColumn} (プロンプト列の1列前)`);
          }
          
          const taskData = {
            id: this.generateTaskId(answerCol.column, workRow.number),
            row: workRow.number,
            column: answerCol.column,
            promptColumns: targetPromptGroup.promptColumns,
            aiType: aiType,
            model: model || '',
            function: functionValue || '',
            cellInfo: {
              row: workRow.number,
              column: answerCol.column,
              columnIndex: answerCol.index
            },
            logColumns: [logColumn],
            multiAI: false,
            groupId: taskGroupInfo ? taskGroupInfo.id : `group_${workRow.number}_${this.indexToColumn(targetPromptGroup.promptColumns[0])}`,
            groupType: taskGroupInfo ? taskGroupInfo.groupType : 'single',
            sequenceOrder: taskGroupInfo ? taskGroupInfo.sequenceOrder : promptGroupIndex + 1,
            dependencies: taskGroupInfo ? taskGroupInfo.dependencies : [],
            prompt: '',  // 実行時に動的取得
            text: '',    // 互換性のため追加
            taskType: 'ai',
            createdAt: Date.now(),
            version: '2.0'
          };
          
          const task = new Task(taskData);
          taskList.add(task);
          taskCount++;
        }
      }
    }
    
    // スキップされたセルをまとめてログ出力
    if (skippedCells.length > 0) {
      // 連続する範囲をまとめる
      const ranges = this.formatCellRanges(skippedCells);
      this.logger.log(`[TaskGeneratorV2] 📊 既存回答ありでスキップ: ${ranges} (計${skippedCells.length}セル)`);
    }
    
    this.logger.log(`[TaskGeneratorV2] ✅ プロンプトグループ${promptGroupIndex + 1}のタスク生成完了: ${taskCount}個`);
    return taskList;
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
}