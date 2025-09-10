/**
 * @fileoverview 排他制御マネージャー - 排他制御の統合管理
 * 
 * 特徴:
 * - PC識別子と排他制御ユーティリティの統合
 * - イベントフックシステム
 * - ストラテジーパターンによる処理選択
 * - SpreadsheetLoggerとの連携
 */

import { PCIdentifier } from './pc-identifier.js';
import { ExclusiveControl } from './exclusive-control.js';

export class ExclusiveControlManager {
  /**
   * コンストラクタ
   * @param {Object} options - オプション
   */
  constructor(options = {}) {
    // 排他制御ユーティリティ
    this.control = new ExclusiveControl(options.controlConfig || {});
    
    // PC識別子
    this.pcIdentifier = PCIdentifier.getInstance();
    this.pcId = this.pcIdentifier.getId();
    
    // ロガー
    this.logger = options.logger || console;
    
    // SpreadsheetLogger参照（オプション）
    this.spreadsheetLogger = options.spreadsheetLogger || null;
    
    // イベントフック
    this.hooks = {};
    
    // 処理中のロック情報を管理
    this.activeLocks = new Map();
    
    // 再試行スケジュール管理
    this.retrySchedules = new Map();
    
    this.logger.log('[ExclusiveControlManager] 初期化完了', {
      pcId: this.pcId,
      metadata: this.pcIdentifier.getMetadata()
    });
  }

  /**
   * イベントフックを登録
   * @param {string} event - イベント名
   * @param {Function} callback - コールバック関数
   */
  on(event, callback) {
    if (!this.hooks[event]) {
      this.hooks[event] = [];
    }
    this.hooks[event].push(callback);
  }

  /**
   * イベントをトリガー
   * @param {string} event - イベント名
   * @param {Object} data - イベントデータ
   */
  async trigger(event, data) {
    const callbacks = this.hooks[event] || [];
    for (const callback of callbacks) {
      try {
        await callback(data);
      } catch (error) {
        this.logger.error(`[ExclusiveControlManager] イベントフックエラー (${event}):`, error);
      }
    }
  }

  /**
   * ロックを取得
   * @param {Object} task - タスクオブジェクト
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {Object} options - オプション
   * @returns {Object} 取得結果
   */
  async acquireLock(task, sheetsClient, options = {}) {
    const { spreadsheetId, gid } = options;
    const cellRef = `${task.column}${task.row}`;
    
    try {
      // フック: ロック取得前
      await this.trigger('beforeAcquire', { task, cellRef });
      
      // 現在の値を取得（シート名を取得してgetCellValueを使用）
      this.logger.log(`[ExclusiveControlManager] デバッグ情報:`, {
        spreadsheetId: spreadsheetId ? `${spreadsheetId.substring(0, 10)}...` : 'null',
        gid: gid,
        cellRef: cellRef,
        sheetsClientType: typeof sheetsClient,
        hasGetSheetNameFromGid: sheetsClient && typeof sheetsClient.getSheetNameFromGid,
        hasGetCellValue: sheetsClient && typeof sheetsClient.getCellValue
      });
      
      let sheetName;
      let currentValue;
      let useNewMethod = true;
      
      // 新しいメソッド（getCellValue + getSheetNameFromGid）を試行
      try {
        sheetName = await sheetsClient.getSheetNameFromGid(spreadsheetId, gid);
        this.logger.log(`[ExclusiveControlManager] シート名取得成功: ${sheetName} (GID: ${gid})`);
        
        if (!sheetName) {
          throw new Error(`シート名が空です (GID: ${gid})`);
        }
        
        this.logger.log(`[ExclusiveControlManager] セル値取得中: ${sheetName}!${cellRef}`);
        currentValue = await sheetsClient.getCellValue(
          spreadsheetId,
          sheetName,
          cellRef
        );
        this.logger.log(`[ExclusiveControlManager] セル値取得成功: "${currentValue}" (${typeof currentValue})`);
        
      } catch (newMethodError) {
        this.logger.warn(`[ExclusiveControlManager] 新メソッド失敗、フォールバック処理を実行:`, newMethodError);
        useNewMethod = false;
        
        // フォールバック: 従来のgetCellメソッドを使用
        try {
          if (sheetsClient.getCell && typeof sheetsClient.getCell === 'function') {
            this.logger.log(`[ExclusiveControlManager] フォールバック: getCell使用中`);
            currentValue = await sheetsClient.getCell(
              spreadsheetId,
              cellRef,
              gid
            );
            this.logger.log(`[ExclusiveControlManager] フォールバック成功: "${currentValue}" (${typeof currentValue})`);
          } else {
            throw new Error('フォールバック用のgetCellメソッドが存在しません');
          }
        } catch (fallbackError) {
          this.logger.error(`[ExclusiveControlManager] フォールバック処理も失敗:`, fallbackError);
          throw new Error(`セル値を取得できませんでした (${cellRef}, GID: ${gid}): 新メソッド失敗 (${newMethodError.message}), フォールバック失敗 (${fallbackError.message})`);
        }
      }
      
      this.logger.log(`[ExclusiveControlManager] 使用メソッド: ${useNewMethod ? '新メソッド' : 'フォールバック'}`);
      
      if (currentValue === undefined || currentValue === null) {
        this.logger.warn(`[ExclusiveControlManager] セル値が空です: ${cellRef}`);
        currentValue = '';
      }
      
      // 既存のマーカーチェック
      if (currentValue && currentValue.includes('現在操作中です')) {
        const handled = await this.handleExistingMarker(
          currentValue, 
          task, 
          sheetsClient,
          options
        );
        
        if (!handled.canProceed) {
          await this.trigger('lockDenied', { task, cellRef, reason: handled.reason });
          return {
            success: false,
            reason: handled.reason,
            marker: currentValue,
            recommendedWaitTime: handled.recommendedWaitTime
          };
        }
      }
      
      // 新しいマーカーを作成
      const newMarker = this.control.createMarker(this.pcId, {
        function: task.function || task.displayedFunction
      });
      
      // マーカーを設定
      await sheetsClient.updateCell(
        spreadsheetId,
        cellRef,
        newMarker,
        gid
      );
      
      // アクティブロックとして記録
      this.activeLocks.set(cellRef, {
        marker: newMarker,
        task: task,
        acquiredAt: new Date()
      });
      
      // SpreadsheetLoggerへの記録はイベントフックで実行される
      
      // フック: ロック取得後
      await this.trigger('afterAcquire', { 
        task, 
        cellRef, 
        marker: newMarker,
        success: true 
      });
      
      this.logger.log(`[ExclusiveControlManager] ロック取得成功: ${cellRef}`);
      
      return {
        success: true,
        marker: newMarker,
        cellRef: cellRef
      };
      
    } catch (error) {
      this.logger.error(`[ExclusiveControlManager] ロック取得エラー: ${cellRef}`, error);
      
      await this.trigger('acquireError', { task, cellRef, error });
      
      return {
        success: false,
        reason: 'error',
        error: error
      };
    }
  }

  /**
   * ロックを解放
   * @param {Object} task - タスクオブジェクト
   * @param {string} newValue - 新しい値（AIの応答など）
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {Object} options - オプション
   */
  async releaseLock(task, newValue, sheetsClient, options = {}) {
    const { spreadsheetId, gid } = options;
    const cellRef = `${task.column}${task.row}`;
    
    try {
      // フック: ロック解放前
      await this.trigger('beforeRelease', { task, cellRef, newValue });
      
      // 新しい値を書き込み（マーカーを上書き）
      await sheetsClient.updateCell(
        spreadsheetId,
        cellRef,
        newValue,
        gid
      );
      
      // アクティブロックから削除
      const lockInfo = this.activeLocks.get(cellRef);
      this.activeLocks.delete(cellRef);
      
      // SpreadsheetLoggerへの記録はイベントフックで実行される
      
      // フック: ロック解放後
      await this.trigger('afterRelease', { task, cellRef, success: true });
      
      this.logger.log(`[ExclusiveControlManager] ロック解放成功: ${cellRef}`);
      
      return { success: true };
      
    } catch (error) {
      this.logger.error(`[ExclusiveControlManager] ロック解放エラー: ${cellRef}`, error);
      
      await this.trigger('releaseError', { task, cellRef, error });
      
      return {
        success: false,
        error: error
      };
    }
  }

  /**
   * エラー時のクリーンアップ
   * @param {Object} task - タスクオブジェクト
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {Object} options - オプション
   */
  async cleanupOnError(task, sheetsClient, options = {}) {
    const { spreadsheetId, gid } = options;
    const cellRef = `${task.column}${task.row}`;
    
    try {
      // マーカーをクリア（空文字列を設定）
      await sheetsClient.updateCell(
        spreadsheetId,
        cellRef,
        '',
        gid
      );
      
      // アクティブロックから削除
      this.activeLocks.delete(cellRef);
      
      // SpreadsheetLoggerへの記録はイベントフックで実行される
      
      this.logger.log(`[ExclusiveControlManager] エラークリーンアップ完了: ${cellRef}`);
      
      return { success: true };
      
    } catch (error) {
      this.logger.error(`[ExclusiveControlManager] クリーンアップエラー: ${cellRef}`, error);
      return { success: false, error };
    }
  }

  /**
   * 既存マーカーの処理
   * @param {string} marker - 既存のマーカー
   * @param {Object} task - タスクオブジェクト
   * @param {Object} sheetsClient - Google Sheets クライアント
   * @param {Object} options - オプション
   * @returns {Object} 処理結果
   */
  async handleExistingMarker(marker, task, sheetsClient, options = {}) {
    const strategy = options.strategy || 'smart';
    
    const strategies = {
      'aggressive': () => this.aggressiveStrategy(marker, task),
      'polite': () => this.politeStrategy(marker, task),
      'smart': () => this.smartStrategy(marker, task),
      'default': () => this.defaultStrategy(marker, task)
    };
    
    const strategyFn = strategies[strategy] || strategies.default;
    const result = await strategyFn();
    
    // SpreadsheetLoggerへの記録はイベントフックで実行される
    
    return result;
  }

  /**
   * スマート戦略（推奨）
   * @param {string} marker - マーカー
   * @param {Object} task - タスクオブジェクト
   */
  async smartStrategy(marker, task) {
    const parsed = this.control.parseMarker(marker);
    
    // 自分のマーカーの場合は即座に処理可能
    if (this.control.isMarkerFromPC(marker, this.pcId)) {
      this.logger.log('[ExclusiveControlManager] 自分のマーカーを検出 - 処理続行');
      return { canProceed: true, reason: 'own-marker' };
    }
    
    // タイムアウトチェック
    if (this.control.isTimeout(marker, task)) {
      this.logger.log('[ExclusiveControlManager] タイムアウトしたマーカー - 上書き可能');
      return { canProceed: true, reason: 'timeout' };
    }
    
    // まだタイムアウトしていない場合
    const recommendedWaitTime = this.control.getRecommendedWaitTime(marker, task);
    
    this.logger.log('[ExclusiveControlManager] 他PCが作業中 - 待機推奨', {
      recommendedWaitMinutes: Math.ceil(recommendedWaitTime / (60 * 1000))
    });
    
    return {
      canProceed: false,
      reason: 'locked-by-other',
      recommendedWaitTime: recommendedWaitTime
    };
  }

  /**
   * デフォルト戦略
   * @param {string} marker - マーカー
   * @param {Object} task - タスクオブジェクト
   */
  async defaultStrategy(marker, task) {
    return this.smartStrategy(marker, task);
  }

  /**
   * アグレッシブ戦略（強制上書き）
   * @param {string} marker - マーカー
   * @param {Object} task - タスクオブジェクト
   */
  async aggressiveStrategy(marker, task) {
    this.logger.warn('[ExclusiveControlManager] アグレッシブ戦略 - 強制上書き');
    return { canProceed: true, reason: 'forced' };
  }

  /**
   * ポライト戦略（常に待機）
   * @param {string} marker - マーカー
   * @param {Object} task - タスクオブジェクト
   */
  async politeStrategy(marker, task) {
    const recommendedWaitTime = this.control.getRecommendedWaitTime(marker, task);
    
    this.logger.log('[ExclusiveControlManager] ポライト戦略 - 待機');
    
    return {
      canProceed: false,
      reason: 'polite-wait',
      recommendedWaitTime: recommendedWaitTime || 5 * 60 * 1000 // 最低5分待機
    };
  }

  /**
   * 再処理をスケジュール
   * @param {Object} task - タスクオブジェクト
   * @param {number} waitTime - 待機時間（ミリ秒）
   * @param {Function} callback - コールバック関数
   */
  scheduleRetry(task, waitTime, callback) {
    const cellRef = `${task.column}${task.row}`;
    
    // 既存のスケジュールをキャンセル
    if (this.retrySchedules.has(cellRef)) {
      clearTimeout(this.retrySchedules.get(cellRef));
    }
    
    const timeoutId = setTimeout(async () => {
      this.logger.log(`[ExclusiveControlManager] 再処理実行: ${cellRef}`);
      
      try {
        await callback();
        
        // SpreadsheetLoggerへの記録はイベントフックで実行される
        
      } catch (error) {
        this.logger.error(`[ExclusiveControlManager] 再処理エラー: ${cellRef}`, error);
      } finally {
        this.retrySchedules.delete(cellRef);
      }
    }, waitTime);
    
    this.retrySchedules.set(cellRef, timeoutId);
    
    this.logger.log(`[ExclusiveControlManager] 再処理スケジュール設定: ${cellRef}`, {
      waitMinutes: Math.round(waitTime / (60 * 1000))
    });
  }

  /**
   * SpreadsheetLoggerに記録
   * @param {Object} task - タスクオブジェクト
   * @param {Object} logData - ログデータ
   */
  async logToSpreadsheet(task, logData) {
    if (!this.spreadsheetLogger) {
      return;
    }
    
    try {
      const enrichedData = {
        ...logData,
        timestamp: new Date().toISOString(),
        pcId: this.pcId,
        taskFunction: task.function || task.displayedFunction || '通常'
      };
      
      // SpreadsheetLoggerを直接呼び出し（SheetsClientやspreadsheetIdは不要）
      await this.spreadsheetLogger.writeLogToSpreadsheet(task, enrichedData);
      
    } catch (error) {
      this.logger.error('[ExclusiveControlManager] SpreadsheetLogger記録エラー:', error);
    }
  }

  /**
   * アクティブロックの状態を取得
   * @returns {Object} ロック状態
   */
  getActiveLocks() {
    const locks = {};
    for (const [cellRef, lockInfo] of this.activeLocks.entries()) {
      locks[cellRef] = {
        marker: lockInfo.marker,
        acquiredAt: lockInfo.acquiredAt.toISOString(),
        durationMs: Date.now() - lockInfo.acquiredAt.getTime()
      };
    }
    return locks;
  }

  /**
   * すべてのアクティブロックをクリア（緊急用）
   */
  clearAllLocks() {
    const count = this.activeLocks.size;
    this.activeLocks.clear();
    
    for (const [cellRef, timeoutId] of this.retrySchedules.entries()) {
      clearTimeout(timeoutId);
    }
    this.retrySchedules.clear();
    
    this.logger.warn(`[ExclusiveControlManager] すべてのロックをクリア: ${count}個`);
    
    return count;
  }
}

// デフォルトインスタンスをエクスポート
export const exclusiveControlManager = new ExclusiveControlManager();