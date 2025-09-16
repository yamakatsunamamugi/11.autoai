/**
 * @fileoverview コンソールログ統一管理システム
 *
 * 【概要】
 * すべてのコンソールログを統一フォーマットで出力するためのユーティリティ。
 * スタックトレースから呼び出し元ファイル名を自動取得し、
 * 階層的なステップ番号システムで処理の流れを可視化します。
 *
 * 【主要機能】
 * 1. 自動ファイル名取得：スタックトレースから呼び出し元を特定
 * 2. 階層的ステップ番号：無制限の深さに対応（例: 3-5-1-2-4）
 * 3. ステップ名マッピング：番号に意味のある名前を自動付与
 * 4. 統一フォーマット出力：[ファイル名] [Step 番号: 名前] メッセージ
 *
 * 【使用方法】
 * ```javascript
 * import { ConsoleLogger } from './utils/console-logger.js';
 * const logger = new ConsoleLogger('my-module');
 *
 * // ステップ名を事前登録
 * logger.registerStep('3-5-1', 'URL解析');
 *
 * // ログ出力
 * logger.log('3-5-1', 'parseSpreadsheetUrl実行');
 * // 出力: [my-file.js] [Step 3-5-1: URL解析] parseSpreadsheetUrl実行
 * ```
 *
 * 【ステップ番号体系】
 * - メインステップ: 1, 2, 3...
 * - サブステップ: 1-1, 1-2, 2-1...
 * - 詳細ステップ: 1-1-1, 1-1-2...
 * - さらなる詳細: 1-1-1-1, 1-1-1-2...（無制限）
 *
 * @version 1.0.0
 * @since 2024-01-16
 */

export class ConsoleLogger {
  /**
   * コンストラクタ
   * @param {string} moduleName - モジュール名（ファイル名の代替として使用可能）
   * @param {Console} consoleInstance - コンソールインスタンス（デフォルト: console）
   */
  constructor(moduleName = '', consoleInstance = console) {
    // [Step 0-1: 初期化] 基本プロパティの設定
    this.moduleName = moduleName;
    this.console = consoleInstance;

    // [Step 0-2: ステップ管理] ステップ名マッピングの初期化
    this.stepNames = new Map();

    // [Step 0-3: 設定] ログ設定の初期化
    this.config = {
      enableStackTrace: true,  // スタックトレースからファイル名を取得
      enableTimestamp: false,  // タイムスタンプを表示
      enableLineNumber: false, // 行番号を表示
      logLevel: 'all'         // all, warn, error
    };

    // [Step 0-4: デフォルトステップ名] 共通ステップ名の登録
    this.registerCommonSteps();
  }

  /**
   * [Step 1: 共通ステップ名登録]
   * よく使用される共通ステップ名を事前登録
   */
  registerCommonSteps() {
    // [Step 1-1: 初期化系]
    this.stepNames.set('0', '初期化');
    this.stepNames.set('0-1', '基本設定');
    this.stepNames.set('0-2', 'モジュールロード');
    this.stepNames.set('0-3', '依存関係解決');

    // [Step 1-2: データ処理系]
    this.stepNames.set('1', 'データ処理');
    this.stepNames.set('1-1', 'データ取得');
    this.stepNames.set('1-2', 'データ検証');
    this.stepNames.set('1-3', 'データ変換');

    // [Step 1-3: 実行系]
    this.stepNames.set('2', '実行');
    this.stepNames.set('2-1', '前処理');
    this.stepNames.set('2-2', 'メイン処理');
    this.stepNames.set('2-3', '後処理');

    // [Step 1-4: エラー処理系]
    this.stepNames.set('9', 'エラー処理');
    this.stepNames.set('9-1', 'エラー検出');
    this.stepNames.set('9-2', 'エラー回復');
    this.stepNames.set('9-3', 'エラー報告');
  }

  /**
   * [Step 2: ステップ名登録]
   * カスタムステップ名を登録
   * @param {string} stepNumber - ステップ番号（例: "3-5-1"）
   * @param {string} stepName - ステップ名（例: "URL解析"）
   */
  registerStep(stepNumber, stepName) {
    // [Step 2-1: 登録処理]
    this.stepNames.set(stepNumber, stepName);
  }

  /**
   * [Step 2-2: 複数ステップ一括登録]
   * @param {Object} steps - ステップ番号と名前のマッピングオブジェクト
   */
  registerSteps(steps) {
    // [Step 2-2-1: 一括登録処理]
    Object.entries(steps).forEach(([number, name]) => {
      this.stepNames.set(number, name);
    });
  }

  /**
   * [Step 3: スタックトレース解析]
   * スタックトレースから呼び出し元情報を取得
   * @param {number} depth - スタックの深さ（デフォルト: 3）
   * @returns {{fileName: string, lineNumber: number, functionName: string}}
   */
  getCallerInfo(depth = 3) {
    try {
      // [Step 3-1: エラーオブジェクト生成]
      const error = new Error();
      const stack = error.stack || '';
      const lines = stack.split('\n');

      // [Step 3-2: 呼び出し元の行を取得]
      // 0: Error
      // 1: getCallerInfo
      // 2: log/warn/error メソッド
      // 3: 実際の呼び出し元（デフォルト）
      const callerLine = lines[depth] || '';

      // [Step 3-3: ファイル名抽出]
      // パターン1: /path/to/file.js:line:column
      // パターン2: at functionName (/path/to/file.js:line:column)
      const fileMatch = callerLine.match(/(?:at\s+(?:[\w.]+\s+)?\()?([^():]+\.js):(\d+):(\d+)/);

      if (fileMatch) {
        // [Step 3-3-1: フルパスから最後のファイル名のみ抽出]
        const fullPath = fileMatch[1];
        const fileName = fullPath.split('/').pop() || 'unknown';
        const lineNumber = parseInt(fileMatch[2]) || 0;

        // [Step 3-3-2: 関数名の抽出（オプション）]
        const funcMatch = callerLine.match(/at\s+([\w.]+)/);
        const functionName = funcMatch ? funcMatch[1] : '';

        return { fileName, lineNumber, functionName };
      }

      // [Step 3-4: フォールバック]
      return {
        fileName: this.moduleName || 'unknown',
        lineNumber: 0,
        functionName: ''
      };

    } catch (e) {
      // [Step 3-5: エラー時のフォールバック]
      return {
        fileName: this.moduleName || 'unknown',
        lineNumber: 0,
        functionName: ''
      };
    }
  }

  /**
   * [Step 4: ログフォーマット生成]
   * 統一フォーマットでログメッセージを生成
   * @param {string} stepNumber - ステップ番号
   * @param {string} customStepName - カスタムステップ名（オプション）
   * @param {string} message - ログメッセージ
   * @param {string} level - ログレベル (log, warn, error)
   * @returns {string} フォーマット済みメッセージ
   */
  formatMessage(stepNumber, customStepName, message, level = 'log') {
    // [Step 4-1: 呼び出し元情報取得]
    const caller = this.getCallerInfo(4); // formatMessageの呼び出し元を取得

    // [Step 4-2: ステップ名の決定]
    const registeredName = this.stepNames.get(stepNumber);
    const stepName = customStepName || registeredName || '';

    // [Step 4-3: ファイル名の決定]
    const fileName = caller.fileName;

    // [Step 4-4: ステップ部分の構築]
    let stepPart = `Step ${stepNumber}`;
    if (stepName) {
      stepPart += `: ${stepName}`;
    }

    // [Step 4-5: オプション情報の追加]
    const parts = [`[${fileName}]`, `[${stepPart}]`];

    if (this.config.enableLineNumber && caller.lineNumber > 0) {
      parts.push(`[L${caller.lineNumber}]`);
    }

    if (this.config.enableTimestamp) {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      parts.push(`[${timestamp}]`);
    }

    // [Step 4-6: レベル表示の追加]
    const levelIndicators = {
      'log': '',
      'warn': '⚠️',
      'error': '❌',
      'info': 'ℹ️',
      'success': '✅',
      'debug': '🔍'
    };

    const indicator = levelIndicators[level] || '';

    // [Step 4-7: 最終フォーマット生成]
    return `${parts.join(' ')} ${indicator}${indicator ? ' ' : ''}${message}`;
  }

  /**
   * [Step 5: ログ出力メソッド群]
   */

  /**
   * [Step 5-1: 通常ログ]
   * @param {string} stepNumber - ステップ番号
   * @param {string} stepNameOrMessage - ステップ名またはメッセージ
   * @param {string} message - メッセージ（stepNameOrMessageがステップ名の場合）
   * @param {*} data - 追加データ
   */
  log(stepNumber, stepNameOrMessage, message = null, data = null) {
    // [Step 5-1-1: 引数の解釈]
    let stepName = null;
    let actualMessage = message;

    if (message === null) {
      // 2引数の場合: stepNumber, message
      actualMessage = stepNameOrMessage;
    } else {
      // 3引数以上の場合: stepNumber, stepName, message
      stepName = stepNameOrMessage;
    }

    // [Step 5-1-2: フォーマット済みメッセージ生成]
    const formatted = this.formatMessage(stepNumber, stepName, actualMessage, 'log');

    // [Step 5-1-3: 出力]
    if (data !== null && data !== undefined) {
      this.console.log(formatted, data);
    } else {
      this.console.log(formatted);
    }
  }

  /**
   * [Step 5-2: 警告ログ]
   */
  warn(stepNumber, stepNameOrMessage, message = null, data = null) {
    // [Step 5-2-1: 引数の解釈]
    let stepName = null;
    let actualMessage = message;

    if (message === null) {
      actualMessage = stepNameOrMessage;
    } else {
      stepName = stepNameOrMessage;
    }

    // [Step 5-2-2: フォーマット済みメッセージ生成]
    const formatted = this.formatMessage(stepNumber, stepName, actualMessage, 'warn');

    // [Step 5-2-3: 出力]
    if (data !== null && data !== undefined) {
      this.console.warn(formatted, data);
    } else {
      this.console.warn(formatted);
    }
  }

  /**
   * [Step 5-3: エラーログ]
   */
  error(stepNumber, stepNameOrMessage, message = null, data = null) {
    // [Step 5-3-1: 引数の解釈]
    let stepName = null;
    let actualMessage = message;

    if (message === null) {
      actualMessage = stepNameOrMessage;
    } else {
      stepName = stepNameOrMessage;
    }

    // [Step 5-3-2: フォーマット済みメッセージ生成]
    const formatted = this.formatMessage(stepNumber, stepName, actualMessage, 'error');

    // [Step 5-3-3: 出力]
    if (data !== null && data !== undefined) {
      this.console.error(formatted, data);
    } else {
      this.console.error(formatted);
    }
  }

  /**
   * [Step 5-4: 情報ログ]
   */
  info(stepNumber, stepNameOrMessage, message = null, data = null) {
    // [Step 5-4-1: メッセージ生成と出力]
    let stepName = null;
    let actualMessage = message;

    if (message === null) {
      actualMessage = stepNameOrMessage;
    } else {
      stepName = stepNameOrMessage;
    }

    const formatted = this.formatMessage(stepNumber, stepName, actualMessage, 'info');

    if (data !== null && data !== undefined) {
      this.console.log(formatted, data);
    } else {
      this.console.log(formatted);
    }
  }

  /**
   * [Step 5-5: 成功ログ]
   */
  success(stepNumber, stepNameOrMessage, message = null, data = null) {
    // [Step 5-5-1: メッセージ生成と出力]
    let stepName = null;
    let actualMessage = message;

    if (message === null) {
      actualMessage = stepNameOrMessage;
    } else {
      stepName = stepNameOrMessage;
    }

    const formatted = this.formatMessage(stepNumber, stepName, actualMessage, 'success');

    if (data !== null && data !== undefined) {
      this.console.log(formatted, data);
    } else {
      this.console.log(formatted);
    }
  }

  /**
   * [Step 5-6: デバッグログ]
   */
  debug(stepNumber, stepNameOrMessage, message = null, data = null) {
    // [Step 5-6-1: デバッグレベルチェック]
    if (this.config.logLevel !== 'all' && this.config.logLevel !== 'debug') {
      return;
    }

    // [Step 5-6-2: メッセージ生成と出力]
    let stepName = null;
    let actualMessage = message;

    if (message === null) {
      actualMessage = stepNameOrMessage;
    } else {
      stepName = stepNameOrMessage;
    }

    const formatted = this.formatMessage(stepNumber, stepName, actualMessage, 'debug');

    if (data !== null && data !== undefined) {
      this.console.log(formatted, data);
    } else {
      this.console.log(formatted);
    }
  }

  /**
   * [Step 6: 設定メソッド]
   */

  /**
   * [Step 6-1: 設定更新]
   * @param {Object} newConfig - 新しい設定
   */
  updateConfig(newConfig) {
    // [Step 6-1-1: 設定のマージ]
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * [Step 6-2: モジュール名設定]
   * @param {string} moduleName - モジュール名
   */
  setModuleName(moduleName) {
    // [Step 6-2-1: モジュール名更新]
    this.moduleName = moduleName;
  }

  /**
   * [Step 7: ユーティリティメソッド]
   */

  /**
   * [Step 7-1: グループログ開始]
   * コンソールグループを開始
   * @param {string} stepNumber - ステップ番号
   * @param {string} groupName - グループ名
   */
  group(stepNumber, groupName) {
    // [Step 7-1-1: グループ開始]
    const formatted = this.formatMessage(stepNumber, groupName, '===== 開始 =====', 'info');
    this.console.group(formatted);
  }

  /**
   * [Step 7-2: グループログ終了]
   */
  groupEnd() {
    // [Step 7-2-1: グループ終了]
    this.console.groupEnd();
  }

  /**
   * [Step 7-3: テーブル出力]
   * @param {string} stepNumber - ステップ番号
   * @param {string} tableName - テーブル名
   * @param {Array|Object} data - テーブルデータ
   */
  table(stepNumber, tableName, data) {
    // [Step 7-3-1: テーブルヘッダー出力]
    const formatted = this.formatMessage(stepNumber, tableName, 'テーブルデータ:', 'info');
    this.console.log(formatted);

    // [Step 7-3-2: テーブル出力]
    this.console.table(data);
  }

  /**
   * [Step 7-4: タイミング計測開始]
   * @param {string} label - タイマーラベル
   */
  time(label) {
    // [Step 7-4-1: タイマー開始]
    this.console.time(label);
  }

  /**
   * [Step 7-5: タイミング計測終了]
   * @param {string} stepNumber - ステップ番号
   * @param {string} label - タイマーラベル
   */
  timeEnd(stepNumber, label) {
    // [Step 7-5-1: タイマー終了メッセージ]
    const formatted = this.formatMessage(stepNumber, '処理時間', `${label}:`, 'info');
    this.console.log(formatted);

    // [Step 7-5-2: タイマー終了]
    this.console.timeEnd(label);
  }
}

/**
 * [Step 8: グローバルインスタンス]
 * デフォルトのロガーインスタンスを作成してエクスポート
 */
export const defaultLogger = new ConsoleLogger('global');

/**
 * [Step 9: 便利関数]
 * 簡易的に使用できるログ関数
 */
export const log = (step, name, msg, data) => defaultLogger.log(step, name, msg, data);
export const warn = (step, name, msg, data) => defaultLogger.warn(step, name, msg, data);
export const error = (step, name, msg, data) => defaultLogger.error(step, name, msg, data);
export const info = (step, name, msg, data) => defaultLogger.info(step, name, msg, data);
export const success = (step, name, msg, data) => defaultLogger.success(step, name, msg, data);
export const debug = (step, name, msg, data) => defaultLogger.debug(step, name, msg, data);

// [Step 10: デフォルトエクスポート]
export default ConsoleLogger;