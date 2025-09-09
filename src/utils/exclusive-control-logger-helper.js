/**
 * @fileoverview 排他制御ログヘルパー - SpreadsheetLoggerパラメータの共通化
 * 
 * 特徴:
 * - StreamProcessorV2の設定を保持
 * - SpreadsheetLoggerへのパラメータを自動生成
 * - イベントフックでの冗長なコードを削減
 * - 設定変更時の一元管理
 */

export class ExclusiveControlLoggerHelper {
  /**
   * コンストラクタ
   * @param {Object} config - 設定オブジェクト
   */
  constructor(config = {}) {
    this.spreadsheetLogger = config.spreadsheetLogger || null;
    this.spreadsheetData = config.spreadsheetData || null;
    this.sheetsClient = config.sheetsClient || null;
    this.logger = config.logger || console;
  }

  /**
   * StreamProcessorV2の設定を更新
   * @param {Object} config - 設定オブジェクト
   */
  updateConfig(config) {
    const oldConfig = {
      hasSpreadsheetLogger: !!this.spreadsheetLogger,
      hasSpreadsheetData: !!this.spreadsheetData,
      hasSheetsClient: !!this.sheetsClient
    };
    
    this.spreadsheetLogger = config.spreadsheetLogger || this.spreadsheetLogger;
    this.spreadsheetData = config.spreadsheetData || this.spreadsheetData;
    this.sheetsClient = config.sheetsClient || this.sheetsClient;
    
    const newConfig = {
      hasSpreadsheetLogger: !!this.spreadsheetLogger,
      hasSpreadsheetData: !!this.spreadsheetData,
      hasSheetsClient: !!this.sheetsClient
    };
    
    this.logger.log('[ExclusiveControlLoggerHelper] 設定更新完了:', {
      before: oldConfig,
      after: newConfig,
      spreadsheetId: this.spreadsheetData && this.spreadsheetData.spreadsheetId ? `${this.spreadsheetData.spreadsheetId.substring(0, 10)}...` : 'null'
    });
  }

  /**
   * SpreadsheetLoggerに記録（共通パラメータ自動生成）
   * @param {Object} task - タスクオブジェクト
   * @param {Object} logData - ログデータ
   * @returns {Promise<boolean>} 成功/失敗
   */
  async logToSpreadsheet(task, logData) {
    if (!this.spreadsheetLogger) {
      this.logger.warn('[ExclusiveControlLoggerHelper] SpreadsheetLoggerが未設定');
      return false;
    }

    try {
      // 共通パラメータを自動生成
      const commonParams = this.generateCommonParams();
      this.logger.log('[ExclusiveControlLoggerHelper] 共通パラメータ生成:', {
        hasUrl: !!commonParams.url,
        hasSheetsClient: !!commonParams.sheetsClient,
        spreadsheetId: commonParams.spreadsheetId ? `${commonParams.spreadsheetId.substring(0, 10)}...` : 'null',
        gid: commonParams.gid
      });
      
      // ログデータにタイムスタンプを追加
      const enrichedLogData = {
        ...logData,
        timestamp: new Date().toISOString(),
        isFirstTask: false // 排他制御ログは追加モード
      };

      this.logger.log('[ExclusiveControlLoggerHelper] ログ記録実行中:', {
        action: enrichedLogData.action,
        type: enrichedLogData.type,
        cell: enrichedLogData.cell,
        taskColumn: task.column,
        taskRow: task.row
      });

      // SpreadsheetLoggerを呼び出し
      await this.spreadsheetLogger.writeLogToSpreadsheet(task, {
        ...commonParams,
        ...enrichedLogData
      });

      this.logger.log('[ExclusiveControlLoggerHelper] ログ記録成功');
      return true;

    } catch (error) {
      this.logger.error('[ExclusiveControlLoggerHelper] ログ記録エラー:', {
        errorMessage: error.message,
        errorStack: error.stack,
        taskInfo: task ? `${task.column}${task.row}` : 'null',
        logDataAction: logData.action
      });
      return false;
    }
  }

  /**
   * 共通パラメータを生成
   * @returns {Object} 共通パラメータ
   */
  generateCommonParams() {
    const params = {
      url: 'N/A', // 排他制御ログなのでURL不要
      sheetsClient: this.sheetsClient || globalThis.sheetsClient,
      spreadsheetId: this.spreadsheetData && this.spreadsheetData.spreadsheetId,
      gid: this.spreadsheetData && this.spreadsheetData.gid,
      spreadsheetData: this.spreadsheetData
    };
    
    // デバッグ用検証
    const debug = {
      hasLocalSheetsClient: !!this.sheetsClient,
      hasGlobalSheetsClient: !!globalThis.sheetsClient,
      hasSpreadsheetData: !!this.spreadsheetData,
      spreadsheetId: params.spreadsheetId ? `${params.spreadsheetId.substring(0, 10)}...` : 'null',
      gid: params.gid
    };
    
    this.logger.log('[ExclusiveControlLoggerHelper] 共通パラメータ詳細:', debug);
    
    return params;
  }

  /**
   * ロック取得ログを記録
   * @param {Object} eventData - イベントデータ
   */
  async logLockAcquired(eventData) {
    const { task, cellRef, marker, success } = eventData;
    
    if (!success) return;

    return await this.logToSpreadsheet(task, {
      action: 'EXCLUSIVE_CONTROL',
      type: 'LOCK_ACQUIRED',
      cell: cellRef,
      marker: marker
    });
  }

  /**
   * ロック解放ログを記録
   * @param {Object} eventData - イベントデータ
   */
  async logLockReleased(eventData) {
    const { task, cellRef } = eventData;
    
    return await this.logToSpreadsheet(task, {
      action: 'EXCLUSIVE_CONTROL',
      type: 'LOCK_RELEASED',
      cell: cellRef
    });
  }

  /**
   * タイムアウト検出ログを記録
   * @param {Object} eventData - イベントデータ
   */
  async logTimeout(eventData) {
    const { marker, task } = eventData;
    const cellRef = `${task.column}${task.row}`;
    
    return await this.logToSpreadsheet(task, {
      action: 'EXCLUSIVE_CONTROL',
      type: 'TIMEOUT_DETECTED',
      cell: cellRef,
      oldMarker: marker
    });
  }

  /**
   * ロック取得拒否ログを記録
   * @param {Object} eventData - イベントデータ
   */
  async logLockDenied(eventData) {
    const { task, cellRef, reason } = eventData;
    
    return await this.logToSpreadsheet(task, {
      action: 'EXCLUSIVE_CONTROL',
      type: 'LOCK_DENIED',
      cell: cellRef,
      reason: reason
    });
  }

  /**
   * エラーログを記録
   * @param {Object} eventData - イベントデータ
   */
  async logError(eventData) {
    const { task, cellRef, error } = eventData;
    
    return await this.logToSpreadsheet(task, {
      action: 'EXCLUSIVE_CONTROL',
      type: 'ERROR',
      cell: cellRef,
      error: error?.message || 'Unknown error'
    });
  }

  /**
   * 設定の有効性をチェック
   * @returns {Object} 設定チェック結果
   */
  validateConfig() {
    const result = {
      isValid: true,
      warnings: [],
      errors: []
    };

    if (!this.spreadsheetLogger) {
      result.errors.push('SpreadsheetLoggerが設定されていません');
      result.isValid = false;
    }

    if (!this.spreadsheetData) {
      result.warnings.push('spreadsheetDataが設定されていません');
    } else {
      if (!this.spreadsheetData.spreadsheetId) {
        result.errors.push('spreadsheetIdが設定されていません');
        result.isValid = false;
      }
      if (!this.spreadsheetData.gid) {
        result.warnings.push('gidが設定されていません');
      }
    }

    if (!this.sheetsClient && !globalThis.sheetsClient) {
      result.errors.push('sheetsClientが設定されていません');
      result.isValid = false;
    }

    return result;
  }

  /**
   * デバッグ情報を取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    const validation = this.validateConfig();
    
    return {
      hasSpreadsheetLogger: !!this.spreadsheetLogger,
      hasSpreadsheetData: !!this.spreadsheetData,
      hasSheetsClient: !!(this.sheetsClient || globalThis.sheetsClient),
      spreadsheetId: this.spreadsheetData?.spreadsheetId || 'N/A',
      gid: this.spreadsheetData?.gid || 'N/A',
      validation: validation
    };
  }
}

// デフォルトインスタンスをエクスポート（必要に応じて使用）
export const exclusiveControlLoggerHelper = new ExclusiveControlLoggerHelper();