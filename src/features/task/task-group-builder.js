/**
 * @fileoverview TaskGroupBuilder - タスクグループ構築ユーティリティ
 * 
 * 責任:
 * - スプレッドシートデータからタスクグループを構築
 * - プロンプト列と回答列の関係性を解析
 * - 将来的なタスクグループ管理機能
 * 
 * 注意: このクラスは将来使用のために作成されており、
 * 現在のリアルタイムスキャナーでは直接使用されていません。
 */

export class TaskGroupBuilder {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * スプレッドシートデータからタスクグループを構築
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 構築オプション
   * @returns {Array} タスクグループ配列
   */
  async buildTaskGroups(spreadsheetData, options = {}) {
    this.logger.log('[TaskGroupBuilder] タスクグループ構築開始');
    
    if (!spreadsheetData?.values) {
      this.logger.warn('[TaskGroupBuilder] 無効なスプレッドシートデータ');
      return [];
    }

    try {
      // 基本的なグループ構造を検出
      const taskGroups = await this.detectTaskGroupStructure(spreadsheetData, options);
      
      this.logger.log(`[TaskGroupBuilder] ${taskGroups.length}個のタスクグループを構築`);
      return taskGroups;
      
    } catch (error) {
      this.logger.error('[TaskGroupBuilder] タスクグループ構築エラー:', error);
      return [];
    }
  }

  /**
   * タスクグループ構造を検出
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 検出オプション
   * @returns {Array} 検出されたタスクグループ
   */
  async detectTaskGroupStructure(spreadsheetData, options) {
    const taskGroups = [];
    
    // 例：基本的な3列グループ構造を検出
    // F(プロンプト) -> G(回答), H(プロンプト) -> I(回答), etc.
    
    const columnPairs = [
      { promptCol: 5, answerCol: 6, aiType: 'chatgpt', name: 'ChatGPT Group' },  // F->G
      { promptCol: 7, answerCol: 8, aiType: 'claude', name: 'Claude Group' },    // H->I  
      { promptCol: 9, answerCol: 10, aiType: 'gemini', name: 'Gemini Group' }    // J->K
    ];

    for (const pair of columnPairs) {
      const group = {
        name: pair.name,
        aiType: pair.aiType,
        columnRange: {
          promptColumns: [pair.promptCol],
          answerColumns: [{ 
            index: pair.answerCol, 
            column: this.indexToColumn(pair.answerCol) 
          }]
        }
      };
      
      taskGroups.push(group);
    }
    
    return taskGroups;
  }

  /**
   * プロンプト列を動的検出
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Array} プロンプト列のインデックス配列
   */
  detectPromptColumns(spreadsheetData) {
    const promptColumns = [];
    
    if (!spreadsheetData?.values || spreadsheetData.values.length < 2) {
      return promptColumns;
    }

    // 2行目（インデックス1）をチェックしてプロンプト列を検出
    const headerRow = spreadsheetData.values[1] || [];
    
    for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
      const cellValue = headerRow[colIndex];
      
      if (this.isPromptColumn(cellValue)) {
        promptColumns.push(colIndex);
      }
    }
    
    return promptColumns;
  }

  /**
   * セル値がプロンプト列を示すかどうか判定
   * @param {string} cellValue - セル値
   * @returns {boolean} プロンプト列の場合true
   */
  isPromptColumn(cellValue) {
    if (!cellValue || typeof cellValue !== 'string') {
      return false;
    }
    
    const promptKeywords = [
      'prompt', 'プロンプト', 'input', '入力',
      'question', '質問', 'task', 'タスク'
    ];
    
    const lowerValue = cellValue.toLowerCase();
    return promptKeywords.some(keyword => lowerValue.includes(keyword));
  }

  /**
   * 回答列を動的検出（プロンプト列に対応）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} promptColumns - プロンプト列インデックス配列
   * @returns {Array} 回答列情報配列
   */
  detectAnswerColumns(spreadsheetData, promptColumns) {
    const answerColumns = [];
    
    // 基本的にはプロンプト列の次の列を回答列とする
    for (const promptCol of promptColumns) {
      const answerCol = promptCol + 1;
      
      answerColumns.push({
        index: answerCol,
        column: this.indexToColumn(answerCol),
        correspondingPromptColumn: promptCol
      });
    }
    
    return answerColumns;
  }

  /**
   * AIタイプを検出
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {number} columnIndex - 列インデックス
   * @returns {string} AIタイプ
   */
  detectAIType(spreadsheetData, columnIndex) {
    // 1行目（ヘッダー）からAIタイプを検出
    if (!spreadsheetData?.values || spreadsheetData.values.length < 1) {
      return 'unknown';
    }
    
    const headerRow = spreadsheetData.values[0] || [];
    const cellValue = headerRow[columnIndex] || '';
    
    if (typeof cellValue === 'string') {
      const lowerValue = cellValue.toLowerCase();
      
      if (lowerValue.includes('chatgpt') || lowerValue.includes('gpt')) {
        return 'chatgpt';
      } else if (lowerValue.includes('claude')) {
        return 'claude';
      } else if (lowerValue.includes('gemini') || lowerValue.includes('bard')) {
        return 'gemini';
      }
    }
    
    return 'unknown';
  }

  /**
   * 列インデックスを列文字に変換
   * @param {number} index - 列インデックス（0ベース）
   * @returns {string} 列文字（A, B, C...）
   */
  indexToColumn(index) {
    let column = '';
    while (index >= 0) {
      column = String.fromCharCode((index % 26) + 65) + column;
      index = Math.floor(index / 26) - 1;
    }
    return column;
  }

  /**
   * 高度なグループ検出（将来拡張用）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 検出オプション
   * @returns {Array} 高度な検出結果
   */
  async advancedGroupDetection(spreadsheetData, options = {}) {
    this.logger.log('[TaskGroupBuilder] 高度なグループ検出開始');
    
    // 将来的にはここで以下のような高度な検出を行う：
    // - 複数プロンプト列を持つグループ
    // - 動的な列構成の検出
    // - ユーザー定義のグループ設定
    // - 依存関係のあるグループ
    
    const groups = await this.buildTaskGroups(spreadsheetData, options);
    
    this.logger.log('[TaskGroupBuilder] 高度なグループ検出完了');
    return groups;
  }

  /**
   * グループ設定をバリデート
   * @param {Array} taskGroups - タスクグループ配列
   * @returns {Array} バリデート済みタスクグループ
   */
  validateTaskGroups(taskGroups) {
    const validGroups = [];
    
    for (const group of taskGroups) {
      if (this.isValidTaskGroup(group)) {
        validGroups.push(group);
      } else {
        this.logger.warn('[TaskGroupBuilder] 無効なタスクグループをスキップ:', group.name);
      }
    }
    
    return validGroups;
  }

  /**
   * タスクグループが有効かチェック
   * @param {Object} group - タスクグループ
   * @returns {boolean} 有効な場合true
   */
  isValidTaskGroup(group) {
    if (!group.name || !group.columnRange) {
      return false;
    }
    
    const { promptColumns, answerColumns } = group.columnRange;
    
    if (!Array.isArray(promptColumns) || promptColumns.length === 0) {
      return false;
    }
    
    if (!Array.isArray(answerColumns) || answerColumns.length === 0) {
      return false;
    }
    
    return true;
  }
}