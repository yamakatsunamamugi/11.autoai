/**
 * @fileoverview TaskGroupScanner - タスクグループのスキャン機能
 * 
 * 特徴:
 * - スプレッドシートからタスクを動的にスキャン
 * - バッチAPIによる高速回答チェック
 * - 排他制御マーカーのタイムアウト判定
 * - 「処理完了」等の特殊マーカー対応
 */

export class TaskGroupScanner {
  constructor(config = {}) {
    this.logger = config.logger || console;
    this.exclusiveManager = config.exclusiveManager;
    this.waitManager = config.waitManager;
    this.processedAnswerCells = config.processedAnswerCells || new Set();
    
    // ヘルパーメソッドの参照を保存
    this.indexToColumn = config.indexToColumn;
    this.columnToIndex = config.columnToIndex;
    this.shouldProcessRow = config.shouldProcessRow;
    this.shouldProcessColumn = config.shouldProcessColumn;
    this.getRowControl = config.getRowControl;
    this.getColumnControl = config.getColumnControl;
    this.scanPromptRows = config.scanPromptRows;
    this.loadAdditionalRows = config.loadAdditionalRows;
  }

  /**
   * タスクグループをスキャンして処理対象を見つける
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} promptCols - プロンプト列のインデックス配列
   * @param {Array} answerCols - 回答列のインデックス配列
   * @returns {Promise<Array>} 見つかったタスクの配列
   */
  async scanGroupTasks(spreadsheetData, promptCols, answerCols) {
    const tasks = [];
    const MAX_TASKS_PER_BATCH = 3; // バッチあたりの最大タスク数
    
    this.logger.log(`[TaskGroupScanner] 📊 スキャン開始:`, {
      spreadsheetData: spreadsheetData ? 'あり' : 'なし',
      values: spreadsheetData?.values ? `${spreadsheetData.values.length}行` : 'なし',
      promptCols: promptCols || 'なし',
      answerCols: answerCols || 'なし'
    });
    
    if (!spreadsheetData?.values || !Array.isArray(spreadsheetData.values)) {
      this.logger.warn('[TaskGroupScanner] 無効なスプレッドシートデータ');
      return tasks;
    }
    
    if (!promptCols || !Array.isArray(promptCols) || promptCols.length === 0) {
      this.logger.warn('[TaskGroupScanner] 無効なプロンプト列データ');
      return tasks;
    }
    
    if (!answerCols || !Array.isArray(answerCols) || answerCols.length === 0) {
      this.logger.warn('[TaskGroupScanner] 無効な回答列データ');
      return tasks;
    }
    
    // 制御情報を取得
    let rowControls = this.getRowControl(spreadsheetData);
    const columnControls = this.getColumnControl(spreadsheetData);
    
    // 現在のグループ情報を作成（列制御チェック用）
    const promptGroup = {
      promptColumns: promptCols,
      answerColumns: answerCols
    };
    
    // 列制御チェック（グループ全体）
    if (!this.shouldProcessColumn(promptGroup, columnControls)) {
      this.logger.log(`[TaskGroupScanner] このグループは列制御によりスキップ`);
      return tasks;
    }
    
    // ========== 重要：プロンプト列を最後まで読み込む ==========
    this.logger.log(`[TaskGroupScanner] 📊 プロンプト列を最後まで読み込み開始...`);
    
    // scanPromptRowsを使ってプロンプトがある行を全て検出
    const promptRows = await this.scanPromptRows(promptCols);
    
    if (!promptRows || promptRows.length === 0) {
      this.logger.log(`[TaskGroupScanner] プロンプトが見つかりません`);
      return tasks;
    }
    
    // プロンプトがある最大行を特定
    const maxPromptRow = Math.max(...promptRows);
    this.logger.log(`[TaskGroupScanner] プロンプト発見: ${promptRows.length}行、最大行: ${maxPromptRow + 1}`);
    
    // 現在のデータが不足している場合、追加読み込み
    if (maxPromptRow >= spreadsheetData.values.length) {
      this.logger.log(`[TaskGroupScanner] 📥 追加データ読み込み: 現在${spreadsheetData.values.length}行 → ${maxPromptRow + 1}行まで`);
      await this.loadAdditionalRows(maxPromptRow);
      
      // 重要：追加データ読み込み後に行制御を再取得
      this.logger.log(`[TaskGroupScanner] 📊 行制御を再取得（全${spreadsheetData.values.length}行から）`);
      rowControls = this.getRowControl(spreadsheetData);
      if (rowControls.length > 0) {
        this.logger.log(`[TaskGroupScanner] 行制御発見:`, rowControls.map(c => `${c.type}:${c.row}行`));
      }
    }
    
    // 作業行範囲を更新
    const startRow = 8; // 0ベース（9行目）
    let endRow = Math.min(maxPromptRow + 1, spreadsheetData.values.length)
    
    // カウンタ
    let totalRowsChecked = 0;
    let rowSkippedByControl = 0;
    let promptFoundCount = 0;
    let answerExistCount = 0;
    let skippedCompleted = 0;
    
    this.logger.log(`[TaskGroupScanner] 📊 タスク生成開始:`, {
      プロンプト列: promptCols.map(idx => this.indexToColumn(idx)),
      回答列: answerCols.map(idx => this.indexToColumn(idx)), 
      対象行: `${startRow + 1}～${endRow}行目`,
      プロンプト行数: promptRows.length
    });
    
    // デバッグ：制御情報の状態
    if (rowControls.length > 0 || columnControls.length > 0) {
      this.logger.log(`[TaskGroupScanner] 制御適用: 行制御${rowControls.length}件、列制御${columnControls.length}件`);
    }
    
    // ========== 最適化: バッチで回答状態をチェック ==========
    this.logger.log(`[TaskGroupScanner] 🚀 バッチチェック開始: ${promptRows.length}行 × ${answerCols.length}列`);
    
    // バッチで回答状態を取得
    const answerStatusMap = await this.batchCheckAnswers(spreadsheetData, promptRows, answerCols);
    
    // プロンプトがある行のみを処理（promptRowsを使用）
    let debugCount = 0;
    for (const rowIndex of promptRows) {
      // 最大タスク数に達したら終了
      if (tasks.length >= MAX_TASKS_PER_BATCH) {
        this.logger.log(`[TaskGroupScanner] 📦 最大タスク数(${MAX_TASKS_PER_BATCH})に達したため、スキャン終了`);
        break;
      }
      
      // 範囲外チェック
      if (rowIndex < startRow || rowIndex >= endRow) continue;
      
      totalRowsChecked++;
      const row = spreadsheetData.values[rowIndex];
      if (!row) {
        this.logger.warn(`[TaskGroupScanner] ⚠️ 行${rowIndex + 1}のデータなし`);
        continue;
      }
      
      // 行制御チェック
      if (!this.shouldProcessRow(rowIndex + 1, rowControls)) {
        rowSkippedByControl++;
        continue;
      }
      
      promptFoundCount++;
      
      // 対応する回答列をチェック
      for (const answerColIndex of answerCols) {
        // 最大タスク数に達したら内側ループも終了
        if (tasks.length >= MAX_TASKS_PER_BATCH) {
          break;
        }
        
        // バッチチェック結果から回答状態を取得
        const answerStatusKey = `${rowIndex}-${answerColIndex}`;
        const answerStatus = answerStatusMap.get(answerStatusKey);
        
        let hasAnswer = false;
        let answerValue = '';
        
        if (answerStatus) {
          // バッチチェック結果を使用（高速）
          hasAnswer = answerStatus.hasAnswer;
          answerValue = answerStatus.value;
        } else {
          // フォールバック：従来の方法でチェック（バッチ取得に失敗した場合）
          answerValue = row[answerColIndex];
          
          // 回答の判定ロジック
          if (answerValue && typeof answerValue === 'string') {
            const trimmed = answerValue.trim();
            if (trimmed.length > 0) {
              // 排他制御マーカーの場合
              if (trimmed.startsWith('現在操作中です_')) {
                // TaskWaitManagerのisMarkerTimeoutメソッドを使用
                const isTimeout = this.waitManager.isMarkerTimeout(trimmed);
                
                if (isTimeout) {
                  hasAnswer = false;  // タイムアウト済み → タスクを生成
                  
                  // マーカーの経過時間を計算（ログ用）
                  const age = this.waitManager.calculateMarkerAge(trimmed);
                  if (age !== null) {
                    this.logger.log(`[TaskGroupScanner] 排他制御マーカーがタイムアウト: ${this.indexToColumn(answerColIndex)}${rowIndex + 1} (経過: ${Math.floor(age/60000)}分)`);
                  }
                } else {
                  hasAnswer = true;   // まだタイムアウトしていない → タスクをスキップ
                }
              }
              // 待機テキストや処理完了は回答なしとして扱う  
              else if (trimmed === 'お待ちください...' || trimmed === '現在操作中です' || trimmed === '処理完了') {
                hasAnswer = false;
              }
              // それ以外は回答ありとして扱う
              else {
                hasAnswer = true;
              }
            }
          }
        }
        
        // 処理済みセルチェック（重複処理防止）
        const cellKey = `${this.indexToColumn(answerColIndex)}${rowIndex + 1}`;
        if (this.processedAnswerCells.has(cellKey)) {
          hasAnswer = true;  // 既に処理済みのセル
          debugCount++;
          continue;
        }
        
        // デバッグ：最初の5行と問題のある行（40-42行目）の回答状態を確認
        if (debugCount < 5 || (rowIndex >= 39 && rowIndex <= 42)) {
          this.logger.log(`[DEBUG] 行${rowIndex + 1} 回答列${this.indexToColumn(answerColIndex)}[${answerColIndex}]: "${answerValue ? answerValue.substring(0, 50) : '(空)'}" → ${hasAnswer ? '回答済み' : '未回答'}`);
          
          // 41行目の詳細デバッグ
          if (rowIndex === 40) { // 0ベースなので40が41行目
            this.logger.log(`[DEBUG] ⚠️ 41行目詳細:`, {
              row長: row.length,
              B列: row[1] || '(空)',
              H列: row[7] || '(空)', 
              I列: row[8] || '(空)',
              I列型: typeof row[8],
              制御チェック: this.shouldProcessRow(41, rowControls) ? '処理対象' : 'スキップ'
            });
          }
          debugCount++;
        }
        
        if (hasAnswer) {
          // 回答済み - スキップ
          answerExistCount++;
          skippedCompleted++;
        } else {
          // プロンプトあり＆回答なし = 予約処理を試みる
          const taskCell = `${this.indexToColumn(answerColIndex)}${rowIndex + 1}`;
          
          // 未処理のセルのみ予約を試みる
          if (!this.processedAnswerCells.has(taskCell)) {
            // sheetsClientの取得
            const sheetsClient = globalThis.sheetsClient;
            
            // sheetsClientが未定義の場合は通常のタスク処理
            if (!sheetsClient) {
              this.logger.warn('[TaskGroupScanner] sheetsClient未定義、予約処理をスキップしてタスク追加');
              // 最大タスク数チェック
              if (tasks.length < MAX_TASKS_PER_BATCH) {
                tasks.push({
                  row: rowIndex + 1, // 1ベース行番号
                  column: this.indexToColumn(answerColIndex),
                  columnIndex: answerColIndex
                });
              }
              continue;
            }
            
            // ========== 予約システム ==========
            // 複数PC環境でセルの重複処理を防ぐため、
            // タスク実行前に予約マーカーを書き込み、
            // 他のPCが同じセルを処理しないようにする
            
            try {
              // 1. 予約マーカーを書き込み
              await sheetsClient.updateCell(
                spreadsheetData.spreadsheetId,
                taskCell,
                'お待ちください...',
                spreadsheetData.sheetName
              );
              
              // 2. 少し待機（書き込み反映）
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // 3. 中間チェック
              const midCheck = await sheetsClient.getCellValue(
                spreadsheetData.spreadsheetId,
                spreadsheetData.sheetName,
                taskCell
              );
              
              if (midCheck !== 'お待ちください...') {
                this.logger.log(`[TaskGroupScanner] ⚠️ ${taskCell}: 他PCが書き込み済み（中間）`);
                continue;
              }
              
              // 4. もう一度待機
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // 5. 最終チェック
              const finalCheck = await sheetsClient.getCellValue(
                spreadsheetData.spreadsheetId,
                spreadsheetData.sheetName,
                taskCell
              );
              
              if (finalCheck === 'お待ちください...') {
                // 予約成功 - タスクとして追加
                
                // 処理開始マーカーに更新
                const timestamp = new Date().toISOString().replace('T', '_').split('.')[0];
                await sheetsClient.updateCell(
                  spreadsheetData.spreadsheetId,
                  taskCell,
                  `現在操作中です_${timestamp}_${this.exclusiveManager?.pcId || 'unknown'}`,
                  spreadsheetData.sheetName
                );
                
                // タスクリストに追加
                if (tasks.length < MAX_TASKS_PER_BATCH) {
                  tasks.push({
                    row: rowIndex + 1,
                    column: this.indexToColumn(answerColIndex),
                    columnIndex: answerColIndex
                  });
                  this.processedAnswerCells.add(taskCell);
                }
              } else {
                this.logger.log(`[TaskGroupScanner] ⚠️ ${taskCell}: 他PCが処理中（最終）`);
              }
              
            } catch (error) {
              this.logger.warn(`[TaskGroupScanner] 予約処理エラー ${taskCell}:`, error);
            }
          }
        }
      }
    }
  
    // 統計情報をログ出力
    this.logger.log(`[TaskGroupScanner] 📊 スキャン完了:`, {
      チェックした行数: totalRowsChecked,
      行制御でスキップ: rowSkippedByControl,
      プロンプトあり: promptFoundCount,
      回答済み: answerExistCount,
      スキップ済み: skippedCompleted,
      生成タスク数: tasks.length
    });
    
    // タスク範囲を簡潔に表示
    if (tasks.length > 0) {
      const taskRanges = tasks.map(t => `${t.column}${t.row}`).join(', ');
      this.logger.log(`[TaskGroupScanner] 📝 処理対象: ${taskRanges}`);
    }
  
    return tasks;
  }

  /**
   * バッチで複数セルの回答状態をチェック
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} promptRows - プロンプトがある行のインデックス配列
   * @param {Array} answerCols - 回答列のインデックス配列
   * @returns {Promise<Map>} セル位置 -> 回答状態のマップ
   */
  async batchCheckAnswers(spreadsheetData, promptRows, answerCols) {
    const answerStatusMap = new Map();
    
    if (!globalThis.sheetsClient) {
      this.logger.warn('[batchCheckAnswers] sheetsClientが利用できません');
      return answerStatusMap;
    }
    
    try {
      // バッチ取得する範囲を構築
      const ranges = [];
      const cellToRange = new Map();
      
      for (const rowIndex of promptRows) {
        for (const colIndex of answerCols) {
          const colLetter = this.indexToColumn(colIndex);
          const range = `${colLetter}${rowIndex + 1}`;
          ranges.push(range);
          cellToRange.set(range, { rowIndex, colIndex });
        }
      }
      
      if (ranges.length === 0) {
        return answerStatusMap;
      }
      
      // 100セルずつバッチ取得（API制限対策）
      const batchSize = 100;
      for (let i = 0; i < ranges.length; i += batchSize) {
        const batchRanges = ranges.slice(i, i + batchSize);
        
        try {
          const batchResult = await globalThis.sheetsClient.batchGetSheetData(
            spreadsheetData.spreadsheetId,
            batchRanges,
            spreadsheetData.sheetName
          );
          
          // 結果を解析
          if (batchResult) {
            // batchGetSheetDataは range -> 値の配列 のマップを返す
            batchRanges.forEach((range, index) => {
              const { rowIndex, colIndex } = cellToRange.get(range);
              const cellData = batchResult[range] || [];
              const value = cellData[0] || '';
              
              // 回答状態を判定
              const hasAnswer = this.checkIfHasAnswer(value);
              answerStatusMap.set(`${rowIndex}-${colIndex}`, {
                value,
                hasAnswer,
                rowIndex,
                colIndex
              });
            });
          }
        } catch (error) {
          this.logger.warn(`[batchCheckAnswers] バッチ取得エラー:`, error);
        }
      }
      
      this.logger.log(`[batchCheckAnswers] ${answerStatusMap.size}セルの状態をチェック完了`);
      
    } catch (error) {
      this.logger.error('[batchCheckAnswers] エラー:', error);
    }
    
    return answerStatusMap;
  }

  /**
   * セルの値が回答済みかチェック
   * @param {string} value - セルの値
   * @returns {boolean} 回答済みの場合true
   */
  checkIfHasAnswer(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }
    
    const trimmed = value.trim();
    
    // 空文字は未回答
    if (!trimmed) {
      return false;
    }
    
    // 特定のマーカーは未回答とみなす
    if (trimmed === 'お待ちください...' || 
        trimmed === '現在操作中です' || 
        trimmed === '処理完了' ||
        trimmed === 'TODO' ||
        trimmed === 'PENDING' ||
        trimmed === '-' ||
        trimmed === 'N/A' ||
        trimmed === '未回答' ||
        trimmed === '未処理' ||
        trimmed === '処理中' ||
        trimmed === 'エラー' ||
        trimmed === 'ERROR') {
      return false;
    }
    
    // 排他制御マーカーのチェック
    if (trimmed.startsWith('現在操作中です_')) {
      const parsed = this.exclusiveManager?.control?.parseMarker(trimmed);
      if (parsed && this.exclusiveManager?.control?.isTimeout(trimmed, {})) {
        return false; // タイムアウトしていれば未回答扱い
      }
      return true; // タイムアウトしていなければ回答済み扱い
    }
    
    return true;
  }
}