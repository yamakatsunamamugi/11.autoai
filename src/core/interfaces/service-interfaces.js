/**
 * @fileoverview サービスインターフェース定義
 *
 * 各サービスが実装すべきインターフェースを定義
 * JSDocを使用した型定義により、IDEの補完とドキュメント化を支援
 */

/**
 * @interface ISheetsClient
 * スプレッドシート操作サービスのインターフェース
 */
export class ISheetsClient {
  /**
   * シートデータを取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 範囲（例: "A1:Z100"）
   * @returns {Promise<Array>} データ配列
   */
  async getSheetData(spreadsheetId, range) {
    throw new Error('実装が必要です');
  }

  /**
   * セルを更新
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 範囲
   * @param {*} value - 書き込む値
   * @returns {Promise<void>}
   */
  async updateCell(spreadsheetId, range, value) {
    throw new Error('実装が必要です');
  }

  /**
   * 値を書き込み
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 範囲
   * @param {Array} values - 値の配列
   * @returns {Promise<void>}
   */
  async writeValue(spreadsheetId, range, values) {
    throw new Error('実装が必要です');
  }
}

/**
 * @interface ILogger
 * ログサービスのインターフェース
 */
export class ILogger {
  /**
   * ログを記録
   * @param {string} message - メッセージ
   * @param {string} level - ログレベル（info, warning, error, success）
   * @param {string} step - ステップ番号
   * @returns {Promise<void>}
   */
  async log(message, level = 'info', step = '') {
    throw new Error('実装が必要です');
  }

  /**
   * エラーログを記録
   * @param {string} message - エラーメッセージ
   * @param {Error} error - エラーオブジェクト
   * @returns {Promise<void>}
   */
  async logError(message, error) {
    throw new Error('実装が必要です');
  }

  /**
   * グループ完了ログを記録
   * @param {Object} groupInfo - グループ情報
   * @returns {Promise<void>}
   */
  async logGroupCompletion(groupInfo) {
    throw new Error('実装が必要です');
  }
}

/**
 * @interface IAuthService
 * 認証サービスのインターフェース
 */
export class IAuthService {
  /**
   * 認証トークンを取得
   * @returns {Promise<string>} アクセストークン
   */
  async getAuthToken() {
    throw new Error('実装が必要です');
  }

  /**
   * 認証状態を確認
   * @returns {Promise<boolean>} 認証済みかどうか
   */
  async isAuthenticated() {
    throw new Error('実装が必要です');
  }

  /**
   * トークンをリフレッシュ
   * @returns {Promise<string>} 新しいアクセストークン
   */
  async refreshToken() {
    throw new Error('実装が必要です');
  }
}

/**
 * @interface ITaskExecutor
 * タスク実行サービスのインターフェース
 */
export class ITaskExecutor {
  /**
   * タスクを実行
   * @param {Object} task - タスクオブジェクト
   * @returns {Promise<Object>} 実行結果
   */
  async execute(task) {
    throw new Error('実装が必要です');
  }

  /**
   * バッチでタスクを実行
   * @param {Array<Object>} tasks - タスク配列
   * @returns {Promise<Array<Object>>} 実行結果の配列
   */
  async executeBatch(tasks) {
    throw new Error('実装が必要です');
  }
}

/**
 * @interface IExclusiveControlManager
 * 排他制御マネージャーのインターフェース
 */
export class IExclusiveControlManager {
  /**
   * ロックを取得
   * @param {string} resourceId - リソースID
   * @returns {Promise<Object>} ロックオブジェクト
   */
  async acquireLock(resourceId) {
    throw new Error('実装が必要です');
  }

  /**
   * ロックを解放
   * @param {Object} lock - ロックオブジェクト
   * @returns {Promise<void>}
   */
  async releaseLock(lock) {
    throw new Error('実装が必要です');
  }

  /**
   * 排他制御が有効か確認
   * @returns {boolean}
   */
  isEnabled() {
    throw new Error('実装が必要です');
  }
}

/**
 * @interface IPowerManager
 * 電源管理サービスのインターフェース
 */
export class IPowerManager {
  /**
   * スリープ防止を開始
   * @param {string} taskId - タスクID
   * @returns {Promise<void>}
   */
  async startProtection(taskId) {
    throw new Error('実装が必要です');
  }

  /**
   * スリープ防止を停止
   * @param {string} taskId - タスクID
   * @returns {Promise<void>}
   */
  async stopProtection(taskId) {
    throw new Error('実装が必要です');
  }
}

// IRetryManager: 削除済み（各サービスで直接実装）

/**
 * @interface ITaskProcessor
 * タスクプロセッサーのインターフェース（メインの処理エンジン）
 */
export class ITaskProcessor {
  /**
   * タスクを処理
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} taskGroups - タスクグループ配列
   * @param {Object} options - 処理オプション
   * @returns {Promise<Object>} 処理結果
   */
  async processTasks(spreadsheetData, taskGroups, options = {}) {
    throw new Error('実装が必要です');
  }

  /**
   * タスクグループを処理
   * @param {Object} group - タスクグループ
   * @param {number} index - グループインデックス
   * @returns {Promise<Object>} グループ処理結果
   */
  async processTaskGroup(group, index) {
    throw new Error('実装が必要です');
  }
}

// 型チェック用のヘルパー関数
export function implementsInterface(instance, interfaceClass) {
  const interfaceMethods = Object.getOwnPropertyNames(interfaceClass.prototype)
    .filter(name => name !== 'constructor');

  for (const method of interfaceMethods) {
    if (typeof instance[method] !== 'function') {
      return false;
    }
  }
  return true;
}

// インターフェースのエクスポート
export default {
  ISheetsClient,
  ILogger,
  IAuthService,
  ITaskExecutor,
  IExclusiveControlManager,
  IPowerManager,
  ITaskProcessor,
  implementsInterface
};