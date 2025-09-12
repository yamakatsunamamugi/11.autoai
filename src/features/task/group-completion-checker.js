/**
 * @fileoverview グループ完了チェッカー - タスクグループの完了判定を専門に扱う
 * 
 * 責任:
 * - グループ内タスクの完了状態チェック
 * - 待機テキストの検出
 * - 空白セルの検出
 * - 文字数不足の検出
 * - 最終的な完了判定
 */

export class GroupCompletionChecker {
  constructor(retryManager, logger = console) {
    this.retryManager = retryManager;
    this.logger = logger;
  }

  /**
   * グループの完了状態をチェック
   * @param {string} groupId - グループID
   * @param {Array} tasks - チェック対象のタスク配列
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @returns {Promise<boolean>} 完了している場合true
   */
  async checkGroupCompletion(groupId, tasks, spreadsheetData, sheetsClient) {
    if (!sheetsClient || !spreadsheetData?.spreadsheetId) {
      this.logger.warn('[GroupCompletionChecker] SheetsClientまたはspreadsheetIdが不足');
      return true; // エラー時は完了扱い
    }

    try {
      // 最新のスプレッドシートデータを取得
      const latestData = await sheetsClient.loadAutoAIData(
        spreadsheetData.spreadsheetId,
        spreadsheetData.gid
      );
      
      if (!latestData) {
        this.logger.warn('[GroupCompletionChecker] 最新データの取得に失敗');
        return true;
      }

      // 各タスクの待機テキストをチェック
      for (const task of tasks) {
        const answer = this.retryManager.getCurrentAnswer(task, latestData);
        
        if (this.retryManager.isWaitingText(answer)) {
          this.logger.log(`[GroupCompletionChecker] 待機中: ${task.column}${task.row} - "${answer?.substring(0, 50)}..."`);
          return false; // まだ完了していない
        }
      }
      
      return true; // すべて完了
      
    } catch (error) {
      this.logger.error('[GroupCompletionChecker] 完了チェック中のエラー:', error);
      return true; // エラー時は完了扱い
    }
  }

  /**
   * 最終的な完了チェック（空白、文字数、排他制御マーカーを含む）
   * @param {Array} tasks - チェック対象のタスク配列
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {string} pcId - 自分のPC識別子
   * @returns {Promise<Object>} チェック結果
   */
  async performFinalCompletionCheck(tasks, spreadsheetData, sheetsClient, pcId) {
    const result = {
      isComplete: true,
      incompleteList: [],
      hasEmptyCells: false,
      hasProcessingMarkers: false,
      hasInsufficientText: false
    };

    if (!sheetsClient || !spreadsheetData?.spreadsheetId) {
      this.logger.warn('[GroupCompletionChecker] 最終チェック: 必要な情報が不足');
      return result;
    }

    try {
      // 最新データを取得
      const finalData = await sheetsClient.loadAutoAIData(
        spreadsheetData.spreadsheetId,
        spreadsheetData.gid
      );
      
      if (!finalData) {
        this.logger.warn('[GroupCompletionChecker] 最終チェック: データ取得失敗');
        return result;
      }

      // 各タスクをチェック
      for (const task of tasks) {
        const answer = this.retryManager.getCurrentAnswer(task, finalData);
        const cellRef = `${task.column}${task.row}`;
        
        // 1. 空白チェック
        if (!answer || answer.trim() === '') {
          result.isComplete = false;
          result.hasEmptyCells = true;
          result.incompleteList.push({
            cell: cellRef,
            reason: '空白',
            type: 'empty'
          });
          continue;
        }
        
        // 2. 排他制御マーカーチェック（自分以外）
        if (answer.startsWith('現在操作中です_')) {
          const parts = answer.split('_');
          if (parts.length >= 3 && parts[2] !== pcId) {
            result.isComplete = false;
            result.hasProcessingMarkers = true;
            result.incompleteList.push({
              cell: cellRef,
              reason: '他PCが処理中',
              type: 'processing',
              pcId: parts[2]
            });
            continue;
          }
        }
        
        // 3. 文字数チェック
        const minChars = this.retryManager.minCharacterThreshold || 100;
        if (answer.length <= minChars) {
          result.isComplete = false;
          result.hasInsufficientText = true;
          result.incompleteList.push({
            cell: cellRef,
            reason: `文字数不足(${answer.length}文字)`,
            type: 'insufficient',
            length: answer.length
          });
        }
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('[GroupCompletionChecker] 最終チェック中のエラー:', error);
      return result;
    }
  }

  /**
   * 未完了タスクの詳細をログ出力
   * @param {number} groupIndex - グループインデックス
   * @param {Object} checkResult - performFinalCompletionCheckの結果
   */
  logIncompleteDetails(groupIndex, checkResult) {
    if (!checkResult.isComplete) {
      this.logger.error(`[GroupCompletionChecker] ⛔ グループ${groupIndex + 1}に未完了タスクがあります`);
      
      // タイプ別にグループ化してログ出力
      if (checkResult.hasEmptyCells) {
        const emptyCells = checkResult.incompleteList
          .filter(item => item.type === 'empty')
          .map(item => item.cell);
        this.logger.error(`[GroupCompletionChecker] ⛔ 空白セル: ${emptyCells.join(', ')}`);
      }
      
      if (checkResult.hasProcessingMarkers) {
        const processingCells = checkResult.incompleteList
          .filter(item => item.type === 'processing')
          .map(item => `${item.cell}(${item.pcId})`);
        this.logger.error(`[GroupCompletionChecker] ⛔ 他PC処理中: ${processingCells.join(', ')}`);
      }
      
      if (checkResult.hasInsufficientText) {
        const insufficientCells = checkResult.incompleteList
          .filter(item => item.type === 'insufficient')
          .map(item => `${item.cell}(${item.length}文字)`);
        this.logger.error(`[GroupCompletionChecker] ⛔ 文字数不足: ${insufficientCells.join(', ')}`);
      }
      
      this.logger.error(`[GroupCompletionChecker] ⛔ 以降のグループ処理を停止します`);
    }
  }
}