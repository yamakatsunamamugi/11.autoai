/**
 * @fileoverview BlankChecker - 空白セルチェック機能
 * 
 * 概要:
 * 行制御を考慮して、処理対象の回答列に空白がないかチェックする機能。
 * グループ完了後や全体処理完了後に使用する。
 * 
 * 特徴:
 * - 行制御考慮の空白チェック
 * - グループ単位の空白確認
 * - 再処理が必要な箇所の特定
 */

/**
 * 空白チェッククラス
 */
export class BlankChecker {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * グループの空白をチェック
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} group - プロンプトグループ
   * @param {Array} rowControls - 行制御情報
   * @param {Array} workRows - 作業行情報
   * @returns {Object} チェック結果
   */
  checkGroupBlanks(spreadsheetData, group, rowControls = [], workRows = []) {
    this.logger.info('BlankChecker', 'グループ空白チェック開始', {
      groupType: group.aiType,
      answerColumns: group.answerColumns.map(a => a.column)
    });

    const blankCells = [];
    const processableRows = this.getProcessableRows(workRows, rowControls);
    
    this.logger.debug('BlankChecker', '処理対象行', {
      totalWorkRows: workRows.length,
      processableRows: processableRows.length,
      rowNumbers: processableRows.map(r => r.number)
    });

    // 各回答列をチェック
    for (const answerCol of group.answerColumns) {
      const columnBlanks = this.checkColumnBlanks(
        spreadsheetData,
        answerCol,
        processableRows
      );
      
      blankCells.push(...columnBlanks);
    }

    // レポート列もチェック（存在する場合）
    if (group.reportColumn !== undefined) {
      const reportCol = {
        column: this.indexToColumn(group.reportColumn),
        index: group.reportColumn,
        type: 'report'
      };
      
      const reportBlanks = this.checkColumnBlanks(
        spreadsheetData,
        reportCol,
        processableRows
      );
      
      blankCells.push(...reportBlanks);
    }

    const result = {
      groupId: group.groupId || `group_${group.aiType}_${group.startIndex}`,
      groupType: group.aiType,
      totalBlanks: blankCells.length,
      blankCells: blankCells,
      isComplete: blankCells.length === 0,
      processedRows: processableRows.length
    };

    this.logger.info('BlankChecker', 'グループ空白チェック完了', {
      groupType: group.aiType,
      totalBlanks: result.totalBlanks,
      isComplete: result.isComplete
    });

    return result;
  }

  /**
   * 列の空白をチェック
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} column - 列情報 {column, index, type}
   * @param {Array} processableRows - 処理可能な行
   * @returns {Array} 空白セル情報
   */
  checkColumnBlanks(spreadsheetData, column, processableRows) {
    const blanks = [];
    
    for (const workRow of processableRows) {
      const cellValue = this.getCellValue(spreadsheetData, workRow.index, column.index);
      const isEmpty = this.isCellEmpty(cellValue);
      
      if (isEmpty) {
        blanks.push({
          column: column.column,
          row: workRow.number,
          cell: `${column.column}${workRow.number}`,
          columnType: column.type,
          value: cellValue
        });
      }
    }
    
    this.logger.debug('BlankChecker', `${column.column}列空白チェック`, {
      column: column.column,
      totalRows: processableRows.length,
      blankCount: blanks.length
    });
    
    return blanks;
  }

  /**
   * 複数グループの空白をチェック
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} groups - プロンプトグループ配列
   * @param {Array} rowControls - 行制御情報
   * @param {Array} workRows - 作業行情報
   * @returns {Object} 全体チェック結果
   */
  checkAllGroupsBlanks(spreadsheetData, groups, rowControls = [], workRows = []) {
    this.logger.info('BlankChecker', '全グループ空白チェック開始', {
      totalGroups: groups.length,
      groupTypes: groups.map(g => g.aiType)
    });

    const results = [];
    let totalBlanks = 0;
    
    for (const group of groups) {
      const groupResult = this.checkGroupBlanks(
        spreadsheetData,
        group,
        rowControls,
        workRows
      );
      
      results.push(groupResult);
      totalBlanks += groupResult.totalBlanks;
    }

    const overallResult = {
      totalGroups: groups.length,
      totalBlanks: totalBlanks,
      allComplete: totalBlanks === 0,
      groupResults: results,
      incompleteGroups: results.filter(r => !r.isComplete),
      checkedAt: new Date().toISOString()
    };

    this.logger.info('BlankChecker', '全グループ空白チェック完了', {
      totalGroups: overallResult.totalGroups,
      totalBlanks: overallResult.totalBlanks,
      allComplete: overallResult.allComplete,
      incompleteGroups: overallResult.incompleteGroups.length
    });

    return overallResult;
  }

  /**
   * 処理可能な行を取得（行制御考慮）
   * @param {Array} workRows - 全作業行
   * @param {Array} rowControls - 行制御情報
   * @returns {Array} 処理可能な行
   */
  getProcessableRows(workRows, rowControls) {
    return workRows.filter(workRow => {
      return this.shouldProcessRow(workRow.number, rowControls);
    });
  }

  /**
   * 行を処理すべきか判定（TaskGeneratorと同じロジック）
   * @param {number} rowNumber - 行番号
   * @param {Array} rowControls - 行制御情報
   * @returns {boolean} 処理すべきか
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
   * セルが空かどうかチェック
   * @param {any} cellValue - セル値
   * @returns {boolean} 空かどうか
   */
  isCellEmpty(cellValue) {
    if (cellValue === null || cellValue === undefined) return true;
    if (typeof cellValue === 'string' && cellValue.trim() === '') return true;
    return false;
  }

  /**
   * セル値を取得
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {number} rowIndex - 行インデックス
   * @param {number} colIndex - 列インデックス
   * @returns {any} セル値
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
   * @param {number} index - 列インデックス
   * @returns {string} 列名
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
   * 再処理が必要なタスクを生成
   * @param {Object} blankCheckResult - 空白チェック結果
   * @param {Object} originalTaskList - 元のタスクリスト
   * @returns {Array} 再処理が必要なタスク
   */
  generateRetryTasks(blankCheckResult, originalTaskList) {
    const retryTasks = [];
    
    for (const groupResult of blankCheckResult.groupResults) {
      if (groupResult.isComplete) continue;
      
      for (const blankCell of groupResult.blankCells) {
        // 元のタスクリストから対応するタスクを検索
        const originalTask = originalTaskList.tasks.find(task => 
          task.column === blankCell.column && task.row === blankCell.row
        );
        
        if (originalTask) {
          retryTasks.push({
            ...originalTask,
            isRetry: true,
            originalTaskId: originalTask.id,
            retryReason: 'blank_cell_detected',
            retryAt: Date.now()
          });
        }
      }
    }
    
    this.logger.info('BlankChecker', '再処理タスク生成', {
      totalBlanks: blankCheckResult.totalBlanks,
      retryTasks: retryTasks.length,
      cells: retryTasks.map(t => `${t.column}${t.row}`)
    });
    
    return retryTasks;
  }
}

export default BlankChecker;