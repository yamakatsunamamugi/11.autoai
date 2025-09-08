/**
 * タスクスキャナー
 * スプレッドシートからタスクを検出し、制御を適用する
 */

export class TaskScanner {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * グループのタスクをスキャン
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} promptCols - プロンプト列インデックス
   * @param {Array} answerCols - 回答列インデックス
   * @returns {Array} 検出されたタスク
   */
  scanGroupTasks(spreadsheetData, promptCols, answerCols) {
    const tasks = [];
    
    if (!spreadsheetData?.values || !Array.isArray(spreadsheetData.values)) {
      this.logger.warn('[TaskScanner] 無効なスプレッドシートデータ');
      return tasks;
    }
    
    // 制御情報を取得
    const rowControls = this.getRowControl(spreadsheetData);
    const columnControls = this.getColumnControl(spreadsheetData);
    
    // グループ全体の列制御チェック
    const promptGroup = {
      promptColumns: promptCols,
      answerColumns: answerCols
    };
    
    if (!this.shouldProcessColumn(promptGroup, columnControls)) {
      this.logger.log('[TaskScanner] このグループは列制御によりスキップ');
      return tasks;
    }
    
    // 作業行範囲（9行目以降）
    const startRow = 8; // 0ベース
    const endRow = spreadsheetData.values.length;
    
    // スキャン統計
    let rowSkippedByControl = 0;
    let promptFoundCount = 0;
    let answerExistCount = 0;
    
    this.logger.log('[TaskScanner] スキャン開始', {
      プロンプト列: promptCols.map(idx => this.indexToColumn(idx)),
      回答列: answerCols.map(idx => this.indexToColumn(idx)),
      対象行: `${startRow + 1}～${endRow}行目`
    });
    
    // 各行をチェック
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const row = spreadsheetData.values[rowIndex];
      if (!row) continue;
      
      // 行制御チェック
      if (!this.shouldProcessRow(rowIndex + 1, rowControls)) {
        rowSkippedByControl++;
        continue;
      }
      
      // プロンプト有無チェック
      const hasPrompt = promptCols.some(colIndex => {
        const cellValue = row[colIndex];
        return cellValue && typeof cellValue === 'string' && cellValue.trim().length > 0;
      });
      
      if (!hasPrompt) continue;
      promptFoundCount++;
      
      // 回答列チェック
      for (const answerColIndex of answerCols) {
        const answerValue = row[answerColIndex];
        const hasAnswer = answerValue && typeof answerValue === 'string' && answerValue.trim().length > 0;
        
        if (hasAnswer) {
          answerExistCount++;
        } else {
          // タスク対象（プロンプト有り×回答無し）
          tasks.push({
            row: rowIndex + 1,
            column: this.indexToColumn(answerColIndex),
            columnIndex: answerColIndex
          });
        }
      }
    }
    
    this.logger.log('[TaskScanner] スキャン完了', {
      行制御スキップ: `${rowSkippedByControl}行`,
      プロンプト有り: `${promptFoundCount}行`,
      既存回答有り: `${answerExistCount}セル`,
      タスク数: `${tasks.length}個`
    });
    
    return tasks;
  }

  /**
   * 行制御チェック
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
    if (fromControl && rowNumber < fromControl.row) {
      return false;
    }
    
    // "この行で停止"
    const untilControl = rowControls.find(c => c.type === 'until');
    if (untilControl && rowNumber > untilControl.row) {
      return false;
    }
    
    return true;
  }

  /**
   * 列制御チェック
   */
  shouldProcessColumn(promptGroup, columnControls) {
    if (!columnControls || columnControls.length === 0) {
      return true;
    }
    
    // "この列のみ処理"が優先
    const onlyControls = columnControls.filter(c => c.type === 'only');
    if (onlyControls.length > 0) {
      const promptMatch = promptGroup.promptColumns.some(colIndex => 
        onlyControls.some(ctrl => ctrl.index === colIndex)
      );
      const answerMatch = promptGroup.answerColumns.some(answerCol => {
        const idx = typeof answerCol === 'number' ? answerCol : answerCol.index;
        return onlyControls.some(ctrl => ctrl.index === idx);
      });
      return promptMatch || answerMatch;
    }
    
    // "この列から処理"と"この列で停止"
    const fromControl = columnControls.find(c => c.type === 'from');
    const untilControl = columnControls.find(c => c.type === 'until');
    
    const groupStart = Math.min(...promptGroup.promptColumns);
    const answerIndices = promptGroup.answerColumns.map(a => typeof a === 'number' ? a : a.index);
    const groupEnd = Math.max(...answerIndices);
    
    if (fromControl && groupEnd < fromControl.index) {
      return false;
    }
    
    if (untilControl && groupStart > untilControl.index) {
      return false;
    }
    
    return true;
  }

  /**
   * 行制御情報を取得（B列から）
   */
  getRowControl(data) {
    const controls = [];
    
    for (let i = 0; i < data.values.length; i++) {
      const row = data.values[i];
      if (!row) continue;
      
      const cellB = row[1]; // B列
      if (cellB && typeof cellB === 'string') {
        if (cellB.includes('この行から処理')) {
          controls.push({ type: 'from', row: i + 1 });
        } else if (cellB.includes('この行で停止')) {
          controls.push({ type: 'until', row: i + 1 });
        } else if (cellB.includes('この行のみ処理')) {
          controls.push({ type: 'only', row: i + 1 });
        }
      }
    }
    
    return controls;
  }

  /**
   * 列制御情報を取得（制御行から）
   */
  getColumnControl(data) {
    const controls = [];
    
    // 制御行（1-10行目）をチェック
    for (let i = 0; i < Math.min(10, data.values.length); i++) {
      const row = data.values[i];
      if (!row) continue;
      
      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        if (cell && typeof cell === 'string') {
          const column = this.indexToColumn(j);
          
          if (cell.includes('この列から処理')) {
            controls.push({ type: 'from', column, index: j });
          } else if (cell.includes('この列で停止')) {
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
   * インデックスを列名に変換
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
   * 列名をインデックスに変換
   */
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 65) + 1;
    }
    return index - 1;
  }
}