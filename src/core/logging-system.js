/**
 * @fileoverview 統一ログシステム
 * 
 * アプリケーション全体で使用する統一されたログシステム。
 * 複数の出力先への対応、ログレベル管理、フィルタリング機能を提供。
 */

/**
 * ログレベル定義
 */
export const LOG_LEVELS = {
  TRACE: { name: 'TRACE', value: 0, color: '#999' },
  DEBUG: { name: 'DEBUG', value: 1, color: '#666' },
  INFO: { name: 'INFO', value: 2, color: '#007bff' },
  WARN: { name: 'WARN', value: 3, color: '#ffc107' },
  ERROR: { name: 'ERROR', value: 4, color: '#dc3545' },
  FATAL: { name: 'FATAL', value: 5, color: '#6f42c1' }
};

/**
 * ログ出力先の基底クラス
 */
export class LogAppender {
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      enabled: true,
      minLevel: LOG_LEVELS.INFO,
      maxLevel: LOG_LEVELS.FATAL,
      includeTimestamp: true,
      includeLevel: true,
      includeContext: true,
      dateFormat: 'ISO',
      ...config
    };
    this.filters = [];
  }

  /**
   * ログエントリを出力
   * 
   * @param {Object} entry - ログエントリ
   * @returns {Promise<boolean>} 出力成功フラグ
   */
  async append(entry) {
    if (!this.config.enabled) return false;
    
    // レベルフィルタリング
    if (!this._checkLevel(entry.level)) return false;
    
    // カスタムフィルタリング
    if (!this._applyFilters(entry)) return false;
    
    try {
      await this._write(entry);
      return true;
    } catch (error) {
      console.error(`Log appender ${this.name} failed:`, error);
      return false;
    }
  }

  /**
   * フィルターを追加
   * 
   * @param {Function} filter - フィルター関数
   */
  addFilter(filter) {
    this.filters.push(filter);
  }

  /**
   * 実際の書き込み処理（サブクラスで実装）
   * 
   * @param {Object} entry - ログエントリ
   * @returns {Promise} 書き込み処理
   * @protected
   */
  async _write(entry) {
    throw new Error('_write method must be implemented by subclass');
  }

  /**
   * レベルチェック
   * 
   * @param {Object} level - ログレベル
   * @returns {boolean} 出力するかどうか
   * @private
   */
  _checkLevel(level) {
    return level.value >= this.config.minLevel.value && 
           level.value <= this.config.maxLevel.value;
  }

  /**
   * フィルターを適用
   * 
   * @param {Object} entry - ログエントリ
   * @returns {boolean} 出力するかどうか
   * @private
   */
  _applyFilters(entry) {
    return this.filters.every(filter => filter(entry));
  }
}

/**
 * コンソール出力
 */
export class ConsoleAppender extends LogAppender {
  constructor(config = {}) {
    super('Console', config);
  }

  async _write(entry) {
    const message = this._formatMessage(entry);
    
    switch (entry.level.name) {
      case 'TRACE':
      case 'DEBUG':
        console.debug(message);
        break;
      case 'INFO':
        console.info(message);
        break;
      case 'WARN':
        console.warn(message);
        break;
      case 'ERROR':
      case 'FATAL':
        console.error(message);
        break;
      default:
        console.log(message);
    }
  }

  _formatMessage(entry) {
    const parts = [];
    
    if (this.config.includeTimestamp) {
      parts.push(`[${this._formatTimestamp(entry.timestamp)}]`);
    }
    
    if (this.config.includeLevel) {
      parts.push(`[${entry.level.name}]`);
    }
    
    if (this.config.includeContext && entry.context) {
      parts.push(`[${entry.context}]`);
    }
    
    parts.push(entry.message);
    
    if (entry.data) {
      parts.push(JSON.stringify(entry.data, null, 2));
    }
    
    return parts.join(' ');
  }

  _formatTimestamp(timestamp) {
    switch (this.config.dateFormat) {
      case 'ISO':
        return timestamp.toISOString();
      case 'LOCAL':
        return timestamp.toLocaleString();
      case 'TIME':
        return timestamp.toLocaleTimeString();
      default:
        return timestamp.toString();
    }
  }
}

/**
 * DOM出力（UI用）
 */
export class DOMAppender extends LogAppender {
  constructor(container, config = {}) {
    super('DOM', {
      maxEntries: 1000,
      autoScroll: true,
      showTimestamp: true,
      showLevel: true,
      colorize: true,
      ...config
    });
    
    this.container = container;
    this.entries = [];
  }

  async _write(entry) {
    const element = this._createElement(entry);
    
    if (this.container) {
      this.container.appendChild(element);
      
      // エントリー数を制限
      if (this.config.maxEntries && this.entries.length >= this.config.maxEntries) {
        const oldestElement = this.entries.shift();
        if (oldestElement.parentNode) {
          oldestElement.parentNode.removeChild(oldestElement);
        }
      }
      
      this.entries.push(element);
      
      // 自動スクロール
      if (this.config.autoScroll) {
        this.container.scrollTop = this.container.scrollHeight;
      }
    }
  }

  _createElement(entry) {
    const element = document.createElement('div');
    element.className = `log-entry log-${entry.level.name.toLowerCase()}`;
    
    if (this.config.colorize) {
      element.style.color = entry.level.color;
    }
    
    const parts = [];
    
    if (this.config.showTimestamp) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = `[${entry.timestamp.toLocaleTimeString()}]`;
      parts.push(timeSpan.outerHTML);
    }
    
    if (this.config.showLevel) {
      const levelSpan = document.createElement('span');
      levelSpan.className = 'log-level';
      levelSpan.textContent = `[${entry.level.name}]`;
      parts.push(levelSpan.outerHTML);
    }
    
    if (entry.context) {
      const contextSpan = document.createElement('span');
      contextSpan.className = 'log-context';
      contextSpan.textContent = `[${entry.context}]`;
      parts.push(contextSpan.outerHTML);
    }
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    messageSpan.textContent = entry.message;
    parts.push(messageSpan.outerHTML);
    
    if (entry.data) {
      const dataSpan = document.createElement('span');
      dataSpan.className = 'log-data';
      dataSpan.textContent = JSON.stringify(entry.data);
      parts.push(dataSpan.outerHTML);
    }
    
    element.innerHTML = parts.join(' ');
    return element;
  }

  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.entries = [];
  }
}

/**
 * ファイル出力（Node.js環境用）
 */
export class FileAppender extends LogAppender {
  constructor(filename, config = {}) {
    super('File', {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      ...config
    });
    
    this.filename = filename;
    this.currentSize = 0;
  }

  async _write(entry) {
    // ブラウザ環境では無効
    if (typeof window !== 'undefined') {
      return;
    }

    const fs = require('fs').promises;
    const path = require('path');
    
    const message = this._formatMessage(entry) + '\n';
    
    try {
      await fs.appendFile(this.filename, message);
      this.currentSize += message.length;
      
      // ファイルサイズチェック
      if (this.currentSize > this.config.maxFileSize) {
        await this._rotateFile();
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  _formatMessage(entry) {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.name.padEnd(5);
    const context = entry.context ? `[${entry.context}]` : '';
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    
    return `${timestamp} ${level} ${context} ${entry.message}${data}`;
  }

  async _rotateFile() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      // 古いファイルを削除
      for (let i = this.config.maxFiles - 1; i > 0; i--) {
        const oldFile = `${this.filename}.${i}`;
        const newFile = `${this.filename}.${i + 1}`;
        
        try {
          await fs.rename(oldFile, newFile);
        } catch (error) {
          // ファイルが存在しない場合は無視
        }
      }
      
      // 現在のファイルをローテート
      await fs.rename(this.filename, `${this.filename}.1`);
      this.currentSize = 0;
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }
}

/**
 * メインロガークラス
 */
export class Logger {
  constructor(context = '', config = {}) {
    this.context = context;
    this.config = {
      enabled: true,
      defaultLevel: LOG_LEVELS.INFO,
      includeStackTrace: true,
      ...config
    };
    
    this.appenders = new Map();
    this.children = new Map();
    
    // デフォルトでコンソール出力を追加
    this.addAppender(new ConsoleAppender());
  }

  /**
   * 出力先を追加
   * 
   * @param {LogAppender} appender - 出力先
   */
  addAppender(appender) {
    this.appenders.set(appender.name, appender);
  }

  /**
   * 出力先を削除
   * 
   * @param {string} name - 出力先名
   */
  removeAppender(name) {
    this.appenders.delete(name);
  }

  /**
   * 子ロガーを作成
   * 
   * @param {string} context - コンテキスト名
   * @returns {Logger} 子ロガー
   */
  child(context) {
    const childContext = this.context ? `${this.context}.${context}` : context;
    
    if (!this.children.has(childContext)) {
      const child = new Logger(childContext, this.config);
      // 親の出力先を継承
      this.appenders.forEach((appender, name) => {
        child.addAppender(appender);
      });
      this.children.set(childContext, child);
    }
    
    return this.children.get(childContext);
  }

  /**
   * ログを出力
   * 
   * @param {Object} level - ログレベル
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   * @param {Object} options - オプション
   */
  async log(level, message, data = null, options = {}) {
    if (!this.config.enabled) return;
    
    const entry = {
      timestamp: new Date(),
      level,
      context: this.context,
      message: String(message),
      data,
      stack: options.includeStack && this.config.includeStackTrace ? 
        new Error().stack : null,
      ...options
    };
    
    // 全ての出力先に送信
    const promises = Array.from(this.appenders.values()).map(appender => 
      appender.append(entry).catch(error => 
        console.error(`Appender ${appender.name} failed:`, error)
      )
    );
    
    await Promise.all(promises);
  }

  // 便利メソッド
  trace(message, data, options) { 
    return this.log(LOG_LEVELS.TRACE, message, data, options); 
  }
  debug(message, data, options) { 
    return this.log(LOG_LEVELS.DEBUG, message, data, options); 
  }
  info(message, data, options) { 
    return this.log(LOG_LEVELS.INFO, message, data, options); 
  }
  warn(message, data, options) { 
    return this.log(LOG_LEVELS.WARN, message, data, options); 
  }
  error(message, data, options) { 
    return this.log(LOG_LEVELS.ERROR, message, data, { includeStack: true, ...options }); 
  }
  fatal(message, data, options) { 
    return this.log(LOG_LEVELS.FATAL, message, data, { includeStack: true, ...options }); 
  }
}

/**
 * ログマネージャー
 */
export class LogManager {
  constructor() {
    this.loggers = new Map();
    this.globalConfig = {
      enabled: true,
      defaultLevel: LOG_LEVELS.INFO,
      includeStackTrace: true
    };
  }

  /**
   * ロガーを取得
   * 
   * @param {string} context - コンテキスト名
   * @returns {Logger} ロガーインスタンス
   */
  getLogger(context = '') {
    if (!this.loggers.has(context)) {
      this.loggers.set(context, new Logger(context, this.globalConfig));
    }
    return this.loggers.get(context);
  }

  /**
   * グローバル設定を更新
   * 
   * @param {Object} config - 設定オブジェクト
   */
  configure(config) {
    this.globalConfig = { ...this.globalConfig, ...config };
    
    // 既存のロガーに設定を適用
    this.loggers.forEach(logger => {
      logger.config = { ...logger.config, ...config };
    });
  }

  /**
   * 全ロガーを取得
   * 
   * @returns {Map} ロガーマップ
   */
  getAllLoggers() {
    return new Map(this.loggers);
  }

  /**
   * 全ロガーをクリア
   */
  clearAll() {
    this.loggers.clear();
  }
}

// グローバルインスタンス
export const logManager = new LogManager();

// デフォルトロガー
export const defaultLogger = logManager.getLogger('Default');

/**
 * 便利関数：ロガーを取得
 * 
 * @param {string} context - コンテキスト名
 * @returns {Logger} ロガーインスタンス
 */
export function getLogger(context) {
  return logManager.getLogger(context);
}

/**
 * 便利関数：DOM出力先を設定
 * 
 * @param {string} context - コンテキスト名
 * @param {Element} container - DOM要素
 * @param {Object} config - 設定
 */
export function setupDOMLogging(context, container, config = {}) {
  const logger = getLogger(context);
  const domAppender = new DOMAppender(container, config);
  logger.addAppender(domAppender);
  return domAppender;
}