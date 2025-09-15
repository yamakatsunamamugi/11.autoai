/**
 * @fileoverview ログサービス - 統一されたログ管理
 *
 * コンソール、スプレッドシート、ファイルへのログ出力を管理
 */

export class LogService {
  constructor(options = {}) {
    this.loggers = new Set();
    this.logLevel = options.logLevel || 'info';
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    // デフォルトでコンソールログを追加
    if (options.useConsole !== false) {
      this.addLogger(new ConsoleLogger());
    }
  }

  /**
   * ロガーを追加
   * @param {Object} logger - ILoggerインターフェースを実装したロガー
   */
  addLogger(logger) {
    this.loggers.add(logger);
  }

  /**
   * ログレベルをチェック
   * @param {string} level
   * @returns {boolean}
   */
  shouldLog(level) {
    const currentLevel = this.logLevels[this.logLevel] || 0;
    const messageLevel = this.logLevels[level] || 0;
    return messageLevel >= currentLevel;
  }

  /**
   * デバッグログ
   * @param {...any} args
   */
  debug(...args) {
    if (this.shouldLog('debug')) {
      this.log('debug', ...args);
    }
  }

  /**
   * 情報ログ
   * @param {...any} args
   */
  info(...args) {
    if (this.shouldLog('info')) {
      this.log('info', ...args);
    }
  }

  /**
   * 警告ログ
   * @param {...any} args
   */
  warn(...args) {
    if (this.shouldLog('warn')) {
      this.log('warn', ...args);
    }
  }

  /**
   * エラーログ
   * @param {...any} args
   */
  error(...args) {
    if (this.shouldLog('error')) {
      this.log('error', ...args);
    }
  }

  /**
   * ログを出力
   * @param {string} level
   * @param {...any} args
   */
  log(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = this.formatMessage(args);
    
    for (const logger of this.loggers) {
      try {
        logger.log({
          timestamp,
          level,
          message,
          args
        });
      } catch (error) {
        console.error('Logger error:', error);
      }
    }
  }

  /**
   * メッセージをフォーマット
   * @param {Array} args
   * @returns {string}
   */
  formatMessage(args) {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }

  /**
   * グループログを開始
   * @param {string} label
   */
  group(label) {
    for (const logger of this.loggers) {
      if (typeof logger.group === 'function') {
        logger.group(label);
      }
    }
  }

  /**
   * グループログを終了
   */
  groupEnd() {
    for (const logger of this.loggers) {
      if (typeof logger.groupEnd === 'function') {
        logger.groupEnd();
      }
    }
  }

  /**
   * ログレベルを設定
   * @param {string} level
   */
  setLogLevel(level) {
    if (this.logLevels[level] !== undefined) {
      this.logLevel = level;
    }
  }
}

/**
 * コンソールロガー
 */
export class ConsoleLogger {
  log(entry) {
    const { level, message, timestamp } = entry;
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'debug':
        console.debug(prefix, message);
        break;
      case 'info':
        console.log(prefix, message);
        break;
      case 'warn':
        console.warn(prefix, message);
        break;
      case 'error':
        console.error(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  }

  group(label) {
    console.group(label);
  }

  groupEnd() {
    console.groupEnd();
  }
}

/**
 * スプレッドシートロガーアダプター
 */
export class SpreadsheetLoggerAdapter {
  constructor(spreadsheetLogger) {
    this.spreadsheetLogger = spreadsheetLogger;
  }

  async log(entry) {
    const { level, message } = entry;
    
    // レベルをスプレッドシートロガーの形式に変換
    const levelMap = {
      debug: 'info',
      info: 'info',
      warn: 'warning',
      error: 'error'
    };
    
    const mappedLevel = levelMap[level] || 'info';
    
    // スプレッドシートロガーに転送
    if (this.spreadsheetLogger && typeof this.spreadsheetLogger.log === 'function') {
      await this.spreadsheetLogger.log(message, mappedLevel);
    }
  }
}

/**
 * ファイルロガー（将来的な実装用）
 */
export class FileLogger {
  constructor(options = {}) {
    this.filePath = options.filePath || 'logs/app.log';
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
    this.buffer = [];
    this.bufferSize = options.bufferSize || 100;
  }

  log(entry) {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  flush() {
    // 将来的にファイルへの書き込みを実装
    // 現在はバッファをクリアするのみ
    this.buffer = [];
  }
}

// シングルトンインスタンス
let logServiceInstance = null;

/**
 * グローバルログサービスを取得
 * @param {Object} options
 * @returns {LogService}
 */
export function getLogService(options = {}) {
  if (!logServiceInstance) {
    logServiceInstance = new LogService(options);
  }
  return logServiceInstance;
}

/**
 * ログサービスファクトリー（DIコンテナ用）
 * @param {Object} container
 * @returns {Promise<LogService>}
 */
export async function createLogService(container) {
  const logService = getLogService();
  
  // スプレッドシートロガーがあれば追加
  try {
    if (container.has('spreadsheetLogger')) {
      const spreadsheetLogger = await container.get('spreadsheetLogger');
      logService.addLogger(new SpreadsheetLoggerAdapter(spreadsheetLogger));
    }
  } catch (e) {
    console.warn('SpreadsheetLogger not available:', e.message);
  }
  
  return logService;
}

export default LogService;