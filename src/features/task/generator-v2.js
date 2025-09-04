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
   * @returns {Promise<TaskList>} タスクリスト
   */
  async generateTasks(spreadsheetData) {
    this.logger.log('[TaskGeneratorV2] 🚀 タスク生成開始');
    
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
      workRows: workRows.length
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
          // 3種類AI列：全ての回答列が完了しているかチェック
          const allAnswersComplete = promptGroup.answerColumns.every(answerCol => {
            const existingAnswer = this.getCellValue(spreadsheetData, workRow.index, answerCol.index);
            return this.hasAnswer(existingAnswer);
          });
          
          if (allAnswersComplete) {
            // 全て完了している場合は、この行の3種類AI列をスキップ
            continue;
          }
        }
        
        // 各回答列にタスクを生成
        for (let answerIndex = 0; answerIndex < promptGroup.answerColumns.length; answerIndex++) {
          const answerCol = promptGroup.answerColumns[answerIndex];
          
          // 個別の既存回答チェック（既に回答があるタスクはスキップ）
          const existingAnswer = this.getCellValue(spreadsheetData, workRow.index, answerCol.index);
          if (this.hasAnswer(existingAnswer)) {
            continue;
          }
          
          // AI種別を設定
          let aiType;
          if (is3TypeAI) {
            const aiTypes = ['ChatGPT', 'Claude', 'Gemini'];
            aiType = aiTypes[answerIndex] || 'ChatGPT';
          } else {
            aiType = promptGroup.aiType.toLowerCase();  // 小文字に統一（'Claude' → 'claude'）
          }
          
          // Taskインスタンスを作成
          const taskData = {
            id: this.generateTaskId(answerCol.column, workRow.number),
            row: workRow.number,
            column: answerCol.column,
            promptColumns: promptGroup.promptColumns,  // プロンプト列の位置のみ
            aiType: aiType,
            model: this.getModel(spreadsheetData, promptGroup),
            function: this.getFunction(spreadsheetData, promptGroup),
            cellInfo: {
              row: workRow.number,
              column: answerCol.column,
              columnIndex: answerCol.index
            },
            // グループ情報
            multiAI: promptGroup.answerColumns.length > 1,
            groupId: promptGroup.answerColumns.length > 1 
              ? `group_${workRow.number}_${promptGroup.promptColumns[0]}` 
              : null,
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
    
    this.logger.log(`[TaskGeneratorV2] ✅ タスク生成完了: ${taskCount}件`);
    
    // 列別タスク数を表示
    const columnCounts = {};
    taskList.tasks.forEach(task => {
      columnCounts[task.column] = (columnCounts[task.column] || 0) + 1;
    });
    
    this.logger.log('[TaskGeneratorV2] 📊 列別タスク数:', columnCounts);
    
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
      
      const cellValue = firstCell.toLowerCase();
      
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
   */
  identifyPromptGroups(data, rows) {
    const groups = [];
    
    if (!rows.menu || !rows.ai) {
      return groups;
    }
    
    const menuRow = data.values[rows.menu];
    const aiRow = data.values[rows.ai];
    
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
          currentGroup.answerColumns.push({
            index: i,
            column: this.indexToColumn(i)
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
      if (cell && cell.trim()) {
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
      return null;
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
    
    // エラーマーカーは回答なしとして扱う
    const errorMarkers = ['error', 'エラー', 'failed', '失敗', '×'];
    for (const marker of errorMarkers) {
      if (trimmed.toLowerCase().includes(marker)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * モデル情報を取得
   */
  getModel(data, promptGroup) {
    const modelRow = data.values.find(row => 
      row[0] && (row[0] === 'モデル' || row[0].toLowerCase() === 'model')
    );
    
    if (modelRow) {
      // まずプロンプト列から取得を試みる
      if (promptGroup.promptColumns && promptGroup.promptColumns.length > 0) {
        const modelValue = modelRow[promptGroup.promptColumns[0]];
        if (modelValue) {
          this.logger.log(`[TaskGeneratorV2] モデル取得: プロンプト列${promptGroup.promptColumns[0]}から "${modelValue}"`);
          return modelValue;
        }
      }
      
      // 次に回答列から取得を試みる
      if (promptGroup.answerColumns.length > 0) {
        const modelValue = modelRow[promptGroup.answerColumns[0].index];
        if (modelValue) {
          this.logger.log(`[TaskGeneratorV2] モデル取得: 回答列${promptGroup.answerColumns[0].index}から "${modelValue}"`);
          return modelValue;
        }
      }
    }
    
    // デフォルトモデル
    const defaultModels = {
      'Claude': 'Claude Opus 4.1',
      'ChatGPT': 'GPT-4',
      'Gemini': 'Gemini Pro',
      'Genspark': 'Genspark'
    };
    
    return defaultModels[promptGroup.aiType] || 'Claude Opus 4.1';
  }

  /**
   * 機能情報を取得
   */
  getFunction(data, promptGroup) {
    const functionRow = data.values.find(row => 
      row[0] && (row[0] === '機能' || row[0].toLowerCase() === 'function')
    );
    
    if (functionRow) {
      // まずプロンプト列から取得を試みる
      if (promptGroup.promptColumns && promptGroup.promptColumns.length > 0) {
        const functionValue = functionRow[promptGroup.promptColumns[0]];
        if (functionValue) {
          this.logger.log(`[TaskGeneratorV2] 機能取得: プロンプト列${promptGroup.promptColumns[0]}から "${functionValue}"`);
          return functionValue;
        }
      }
      
      // 次に回答列から取得を試みる
      if (promptGroup.answerColumns.length > 0) {
        const functionValue = functionRow[promptGroup.answerColumns[0].index];
        if (functionValue) {
          this.logger.log(`[TaskGeneratorV2] 機能取得: 回答列${promptGroup.answerColumns[0].index}から "${functionValue}"`);
          return functionValue;
        }
      }
    }
    
    return '通常';
  }

  /**
   * 行制御をチェック
   */
  shouldProcessRow(rowNumber, rowControl) {
    if (!rowControl) return true;
    
    const { type, values } = rowControl;
    
    if (type === 'only') {
      return values.includes(rowNumber);
    } else if (type === 'skip') {
      return !values.includes(rowNumber);
    }
    
    return true;
  }

  /**
   * 列制御をチェック
   */
  shouldProcessColumn(promptGroup, columnControl) {
    if (!columnControl) return true;
    
    const { type, values } = columnControl;
    const columns = promptGroup.answerColumns.map(ac => ac.column);
    
    if (type === 'only') {
      return columns.some(col => values.includes(col));
    } else if (type === 'skip') {
      return !columns.some(col => values.includes(col));
    }
    
    return true;
  }

  /**
   * 行制御情報を取得
   */
  getRowControl(data) {
    // A列で「only:」や「skip:」を探す
    for (const row of data.values) {
      const cell = row[0];
      if (!cell) continue;
      
      const lower = cell.toLowerCase();
      if (lower.startsWith('only:')) {
        const values = this.parseControlValues(cell.substring(5));
        return { type: 'only', values };
      } else if (lower.startsWith('skip:')) {
        const values = this.parseControlValues(cell.substring(5));
        return { type: 'skip', values };
      }
    }
    
    return null;
  }

  /**
   * 列制御情報を取得
   */
  getColumnControl(data, rows) {
    if (!rows.menu) return null;
    
    const menuRow = data.values[rows.menu];
    for (const cell of menuRow) {
      if (!cell) continue;
      
      const lower = cell.toLowerCase();
      if (lower.includes('only:')) {
        const match = lower.match(/only:\s*([a-z,\s]+)/);
        if (match) {
          const values = match[1].split(',').map(v => v.trim().toUpperCase());
          return { type: 'only', values };
        }
      } else if (lower.includes('skip:')) {
        const match = lower.match(/skip:\s*([a-z,\s]+)/);
        if (match) {
          const values = match[1].split(',').map(v => v.trim().toUpperCase());
          return { type: 'skip', values };
        }
      }
    }
    
    return null;
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
   * タスクIDを生成
   */
  generateTaskId(column, row) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${column}${row}_${timestamp}_${random}`;
  }
}