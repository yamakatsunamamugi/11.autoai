/**
 * @fileoverview 拡張ログシステム
 *
 * 構造化ログ、パフォーマンス計測、デバッグ支援機能を提供
 */

/**
 * ログレベル
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
  NONE: 999
};

/**
 * ログカテゴリー
 */
export const LogCategory = {
  SYSTEM: 'system',
  AUTH: 'auth',
  API: 'api',
  UI: 'ui',
  PERFORMANCE: 'performance',
  NETWORK: 'network',
  STORAGE: 'storage',
  TASK: 'task',
  DEBUG: 'debug'
};

/**
 * 拡張ログシステム
 */
class EnhancedLogger {
  constructor(config = {}) {
    this.config = {
      level: config.level || LogLevel.INFO,
      enableConsole: config.enableConsole !== false,
      enableStorage: config.enableStorage || false,
      enableRemote: config.enableRemote || false,
      maxStorageSize: config.maxStorageSize || 1000,
      categories: config.categories || Object.values(LogCategory),
      prefix: config.prefix || '[11.autoai]'
    };

    this.logs = [];
    this.performanceMarks = new Map();
    this.contextStack = [];
    this.filters = new Set();
  }

  /**
   * ログレベルを設定
   */
  setLevel(level) {
    this.config.level = level;
  }

  /**
   * カテゴリーフィルターを追加
   */
  addFilter(category) {
    this.filters.add(category);
  }

  /**
   * カテゴリーフィルターを削除
   */
  removeFilter(category) {
    this.filters.delete(category);
  }

  /**
   * コンテキストをプッシュ
   */
  pushContext(context) {
    this.contextStack.push(context);
  }

  /**
   * コンテキストをポップ
   */
  popContext() {
    return this.contextStack.pop();
  }

  /**
   * デバッグログ
   */
  debug(message, data = {}, category = LogCategory.DEBUG) {
    this.log(LogLevel.DEBUG, message, data, category);
  }

  /**
   * 情報ログ
   */
  info(message, data = {}, category = LogCategory.SYSTEM) {
    this.log(LogLevel.INFO, message, data, category);
  }

  /**
   * 警告ログ
   */
  warn(message, data = {}, category = LogCategory.SYSTEM) {
    this.log(LogLevel.WARN, message, data, category);
  }

  /**
   * エラーログ
   */
  error(message, error = null, data = {}, category = LogCategory.SYSTEM) {
    const errorData = {
      ...data,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : null
    };
    this.log(LogLevel.ERROR, message, errorData, category);
  }

  /**
   * クリティカルログ
   */
  critical(message, error = null, data = {}, category = LogCategory.SYSTEM) {
    const errorData = {
      ...data,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : null
    };
    this.log(LogLevel.CRITICAL, message, errorData, category);

    // クリティカルエラーは即座に通知
    this.notifyCritical(message, errorData);
  }

  /**
   * ログ出力
   */
  log(level, message, data = {}, category = LogCategory.SYSTEM) {
    // レベルチェック
    if (level < this.config.level) return;

    // フィルターチェック
    if (this.filters.size > 0 && !this.filters.has(category)) return;

    // ログエントリを作成
    const entry = this.createLogEntry(level, message, data, category);

    // ログを保存
    this.logs.push(entry);
    this.trimLogs();

    // 各出力先に送信
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    if (this.config.enableStorage) {
      this.outputToStorage(entry);
    }

    if (this.config.enableRemote) {
      this.outputToRemote(entry);
    }

    return entry;
  }

  /**
   * ログエントリを作成
   */
  createLogEntry(level, message, data, category) {
    return {
      id: this.generateId(),
      timestamp: Date.now(),
      level: level,
      levelName: this.getLevelName(level),
      category: category,
      message: message,
      data: data,
      context: [...this.contextStack],
      source: this.getSource(),
      session: this.getSessionId()
    };
  }

  /**
   * コンソールに出力
   */
  outputToConsole(entry) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `${this.config.prefix} [${timestamp}] [${entry.levelName}] [${entry.category}]`;
    const message = `${prefix} ${entry.message}`;

    const style = this.getConsoleStyle(entry.level);
    const args = [message];

    // データがある場合は追加
    if (Object.keys(entry.data).length > 0) {
      args.push(entry.data);
    }

    // コンテキストがある場合は追加
    if (entry.context.length > 0) {
      args.push({ context: entry.context });
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(...args);
        break;
      case LogLevel.INFO:
        console.log(...args);
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(...args);
        break;
      default:
        console.log(...args);
    }
  }

  /**
   * ストレージに出力
   */
  async outputToStorage(entry) {
    try {
      const key = `log_${entry.id}`;
      const logs = await chrome.storage.local.get('logs') || {};
      const logList = logs.logs || [];

      logList.push(entry);

      // サイズ制限
      if (logList.length > this.config.maxStorageSize) {
        logList.shift();
      }

      await chrome.storage.local.set({ logs: logList });
    } catch (error) {
      console.error('[EnhancedLogger] ストレージ出力エラー:', error);
    }
  }

  /**
   * リモートに出力（将来実装）
   */
  async outputToRemote(entry) {
    // TODO: リモートログサーバーへの送信実装
  }

  /**
   * パフォーマンス計測開始
   */
  startPerformance(label, data = {}) {
    const mark = {
      start: performance.now(),
      data: data
    };
    this.performanceMarks.set(label, mark);
    this.debug(`Performance start: ${label}`, data, LogCategory.PERFORMANCE);
  }

  /**
   * パフォーマンス計測終了
   */
  endPerformance(label, data = {}) {
    const mark = this.performanceMarks.get(label);
    if (!mark) {
      this.warn(`Performance mark not found: ${label}`, {}, LogCategory.PERFORMANCE);
      return null;
    }

    const duration = performance.now() - mark.start;
    this.performanceMarks.delete(label);

    const perfData = {
      ...mark.data,
      ...data,
      duration: duration,
      durationFormatted: `${duration.toFixed(2)}ms`
    };

    this.info(`Performance end: ${label} (${perfData.durationFormatted})`, perfData, LogCategory.PERFORMANCE);

    return duration;
  }

  /**
   * 関数実行時間を計測
   */
  async measureAsync(label, fn, data = {}) {
    this.startPerformance(label, data);
    try {
      const result = await fn();
      this.endPerformance(label, { success: true });
      return result;
    } catch (error) {
      this.endPerformance(label, { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * グループログ開始
   */
  group(label, data = {}) {
    this.pushContext({ type: 'group', label, data });
    this.info(`=== ${label} START ===`, data);
  }

  /**
   * グループログ終了
   */
  groupEnd() {
    const context = this.popContext();
    if (context && context.type === 'group') {
      this.info(`=== ${context.label} END ===`);
    }
  }

  /**
   * テーブル形式でログ出力
   */
  table(data, columns = null) {
    if (this.config.enableConsole) {
      console.table(data, columns);
    }
    this.info('Table data', { table: data, columns });
  }

  /**
   * アサーション
   */
  assert(condition, message, data = {}) {
    if (!condition) {
      this.error(`Assertion failed: ${message}`, null, data);
      if (this.config.enableConsole) {
        console.assert(condition, message, data);
      }
    }
  }

  /**
   * カウント
   */
  count(label) {
    if (!this.counters) {
      this.counters = new Map();
    }
    const count = (this.counters.get(label) || 0) + 1;
    this.counters.set(label, count);
    this.debug(`${label}: ${count}`, { count });
    return count;
  }

  /**
   * ログをクリア
   */
  clear() {
    this.logs = [];
    this.performanceMarks.clear();
    this.contextStack = [];
    if (this.config.enableConsole) {
      console.clear();
    }
  }

  /**
   * ログを検索
   */
  search(query) {
    return this.logs.filter(log => {
      if (query.level !== undefined && log.level !== query.level) return false;
      if (query.category && log.category !== query.category) return false;
      if (query.message && !log.message.includes(query.message)) return false;
      if (query.startTime && log.timestamp < query.startTime) return false;
      if (query.endTime && log.timestamp > query.endTime) return false;
      return true;
    });
  }

  /**
   * ログ統計を取得
   */
  getStatistics() {
    const stats = {
      total: this.logs.length,
      byLevel: {},
      byCategory: {},
      errors: this.logs.filter(l => l.level >= LogLevel.ERROR).length,
      performance: Array.from(this.performanceMarks.entries())
    };

    this.logs.forEach(log => {
      stats.byLevel[log.levelName] = (stats.byLevel[log.levelName] || 0) + 1;
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
    });

    return stats;
  }

  /**
   * ログをエクスポート
   */
  export(format = 'json') {
    const data = {
      logs: this.logs,
      statistics: this.getStatistics(),
      config: this.config,
      timestamp: Date.now()
    };

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.exportAsCsv(data.logs);
      default:
        return data;
    }
  }

  /**
   * CSV形式でエクスポート
   */
  exportAsCsv(logs) {
    const headers = ['timestamp', 'level', 'category', 'message', 'data'];
    const rows = logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.levelName,
      log.category,
      log.message,
      JSON.stringify(log.data)
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  // ヘルパーメソッド

  getLevelName(level) {
    const names = {
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.INFO]: 'INFO',
      [LogLevel.WARN]: 'WARN',
      [LogLevel.ERROR]: 'ERROR',
      [LogLevel.CRITICAL]: 'CRITICAL'
    };
    return names[level] || 'UNKNOWN';
  }

  getConsoleStyle(level) {
    const styles = {
      [LogLevel.DEBUG]: 'color: gray',
      [LogLevel.INFO]: 'color: blue',
      [LogLevel.WARN]: 'color: orange',
      [LogLevel.ERROR]: 'color: red',
      [LogLevel.CRITICAL]: 'color: red; font-weight: bold'
    };
    return styles[level] || '';
  }

  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = this.generateId();
    }
    return this.sessionId;
  }

  getSource() {
    // スタックトレースから呼び出し元を取得
    const stack = new Error().stack;
    const lines = stack.split('\n');
    const callerLine = lines[3]; // 呼び出し元の行
    const match = callerLine?.match(/at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)/);

    if (match) {
      return {
        function: match[1],
        file: match[2].split('/').pop(),
        line: parseInt(match[3]),
        column: parseInt(match[4])
      };
    }

    return null;
  }

  trimLogs() {
    // メモリ節約のためログ数を制限
    const maxLogs = this.config.maxStorageSize * 2;
    if (this.logs.length > maxLogs) {
      this.logs = this.logs.slice(-maxLogs);
    }
  }

  notifyCritical(message, data) {
    // クリティカルエラーをバックグラウンドに通知
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'CRITICAL_LOG',
        message,
        data
      }).catch(error => {
        console.error('[EnhancedLogger] クリティカル通知失敗:', error);
      });
    }
  }
}

// シングルトンインスタンス
export const logger = new EnhancedLogger();

// デフォルトエクスポート
export default {
  LogLevel,
  LogCategory,
  EnhancedLogger,
  logger
};