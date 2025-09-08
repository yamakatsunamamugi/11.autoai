/**
 * スプレッドシートデータ処理モジュール
 * スプレッドシートから各種データ（AI・モデル・機能）を取得する処理を統一管理
 */
class SpreadsheetDataProcessor {
  constructor(logger) {
    this.logger = logger || console;
  }

  /**
   * スプレッドシートデータから指定された行を検索
   */
  findRow(spreadsheetData, rowKeyword) {
    if (!spreadsheetData || !spreadsheetData.values) {
      return null;
    }
    return spreadsheetData.values.find(row => row[0] === rowKeyword);
  }

  /**
   * タスクに基づいてAI、モデル、機能を取得
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} task - タスクオブジェクト
   * @returns {Object} - {ai, model, function}
   */
  getAIModelFunction(spreadsheetData, task) {
    try {
      // 各行を取得
      const aiRow = this.findRow(spreadsheetData, 'AI');
      const modelRow = this.findRow(spreadsheetData, 'モデル');
      const functionRow = this.findRow(spreadsheetData, '機能');

      if (!modelRow || !functionRow) {
        this.logger.warn('[SpreadsheetDataProcessor] モデル行または機能行が見つかりません');
        return { ai: '', model: '', function: '' };
      }

      // プロンプト列のインデックスを取得
      const promptIndex = task.promptColumns && task.promptColumns.length > 0 ? task.promptColumns[0] : null;
      
      if (!promptIndex) {
        this.logger.warn('[SpreadsheetDataProcessor] プロンプト列が見つかりません');
        return { ai: '', model: '', function: '' };
      }

      // プロンプト列の機能値で通常処理かどうか判定
      const promptFunctionValue = functionRow[promptIndex] || '';
      
      let ai = '';
      let model = '';
      let func = '';
      
      if (promptFunctionValue === '通常') {
        // 通常処理：プロンプト列から取得
        ai = aiRow ? (aiRow[promptIndex] || '') : '';
        model = modelRow[promptIndex] || '';
        func = functionRow[promptIndex] || '通常';
        
        this.logger.log(`[SpreadsheetDataProcessor] 通常処理: プロンプト列から取得`, {
          column: this.indexToColumn(promptIndex),
          ai,
          model,
          function: func
        });
      } else {
        // 3種類AI：回答列から取得
        const answerColumnIndex = this.columnToIndex(task.column);
        ai = aiRow ? (aiRow[answerColumnIndex] || '') : '';
        model = modelRow[answerColumnIndex] || '';
        func = functionRow[answerColumnIndex] || '';
        
        this.logger.log(`[SpreadsheetDataProcessor] 3種類AI: 回答列から取得`, {
          column: task.column,
          ai,
          model,
          function: func
        });
      }

      return { ai, model, function: func };
    } catch (error) {
      this.logger.error('[SpreadsheetDataProcessor] データ取得エラー:', error);
      return { ai: '', model: '', function: '' };
    }
  }

  /**
   * 列文字を数値インデックスに変換
   */
  columnToIndex(column) {
    if (typeof column === 'number') return column;
    
    let index = 0;
    const columnStr = column.toString().toUpperCase();
    
    for (let i = 0; i < columnStr.length; i++) {
      index = index * 26 + (columnStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    
    return index - 1; // 0ベースに変換
  }

  /**
   * 数値インデックスを列文字に変換
   */
  indexToColumn(index) {
    if (typeof index === 'string') return index;
    
    let column = '';
    let num = index + 1; // 1ベースに変換
    
    while (num > 0) {
      num--; // 0ベースに調整
      column = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + column;
      num = Math.floor(num / 26);
    }
    
    return column;
  }

  /**
   * スプレッドシートデータの構造を検証
   */
  validateSpreadsheetData(spreadsheetData) {
    const validation = {
      valid: true,
      missing: [],
      available: {}
    };

    if (!spreadsheetData || !spreadsheetData.values) {
      validation.valid = false;
      validation.missing.push('spreadsheetData.values');
      return validation;
    }

    // 必要な行の存在確認
    const requiredRows = ['AI', 'モデル', '機能'];
    requiredRows.forEach(rowKeyword => {
      const row = this.findRow(spreadsheetData, rowKeyword);
      if (row) {
        validation.available[rowKeyword] = true;
      } else {
        validation.valid = false;
        validation.missing.push(`${rowKeyword}行`);
      }
    });

    return validation;
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpreadsheetDataProcessor;
}

// ES6 export (for modern environments)
if (typeof window !== 'undefined') {
  window.SpreadsheetDataProcessor = SpreadsheetDataProcessor;
}