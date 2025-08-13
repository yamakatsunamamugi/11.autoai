// logging-service.js - 拡張機能用の詳細ログ出力サービス

/**
 * ログレベル定義
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4
};

/**
 * 拡張機能用のロギングサービス
 */
class LoggingService {
  constructor() {
    this.logLevel = LogLevel.DEBUG; // デフォルトは全てのログを出力
    this.logHistory = [];
    this.maxHistorySize = 1000;
    this.isExtension = typeof chrome !== 'undefined' && chrome.runtime;
  }

  /**
   * ログレベルを設定
   */
  setLogLevel(level) {
    this.logLevel = level;
  }

  /**
   * ログエントリを作成
   */
  createLogEntry(level, category, message, details = null) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      category,
      message,
      details,
      stack: (new Error()).stack
    };

    // ログ履歴に追加
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    return entry;
  }

  /**
   * コンソールに出力
   */
  outputToConsole(entry) {
    const levelName = this.getLevelName(entry.level);
    const prefix = `[${entry.timestamp}] [${levelName}] [${entry.category}]`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.details || '');
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.details || '');
        break;
      case LogLevel.WARNING:
        console.warn(prefix, entry.message, entry.details || '');
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(prefix, entry.message, entry.details || '');
        if (entry.stack) {
          console.error('Stack trace:', entry.stack);
        }
        break;
    }
  }

  /**
   * Chrome拡張機能のストレージに保存
   */
  async saveToStorage(entry) {
    if (!this.isExtension) return;

    try {
      const key = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const logs = await this.getStoredLogs();
      logs[key] = entry;

      // 古いログを削除（最大100件）
      const keys = Object.keys(logs);
      if (keys.length > 100) {
        const oldestKeys = keys.slice(0, keys.length - 100);
        oldestKeys.forEach(k => delete logs[k]);
      }

      await chrome.storage.local.set({ extension_logs: logs });
    } catch (error) {
      console.error('Failed to save log to storage:', error);
    }
  }

  /**
   * ストレージからログを取得
   */
  async getStoredLogs() {
    if (!this.isExtension) return {};

    try {
      const result = await chrome.storage.local.get('extension_logs');
      return result.extension_logs || {};
    } catch (error) {
      console.error('Failed to get logs from storage:', error);
      return {};
    }
  }

  /**
   * レベル名を取得
   */
  getLevelName(level) {
    switch (level) {
      case LogLevel.DEBUG: return 'DEBUG';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.WARNING: return 'WARNING';
      case LogLevel.ERROR: return 'ERROR';
      case LogLevel.CRITICAL: return 'CRITICAL';
      default: return 'UNKNOWN';
    }
  }

  /**
   * デバッグログ
   */
  debug(category, message, details = null) {
    if (this.logLevel > LogLevel.DEBUG) return;
    
    const entry = this.createLogEntry(LogLevel.DEBUG, category, message, details);
    this.outputToConsole(entry);
    this.saveToStorage(entry);
  }

  /**
   * 情報ログ
   */
  info(category, message, details = null) {
    if (this.logLevel > LogLevel.INFO) return;
    
    const entry = this.createLogEntry(LogLevel.INFO, category, message, details);
    this.outputToConsole(entry);
    this.saveToStorage(entry);
  }

  /**
   * 警告ログ
   */
  warning(category, message, details = null) {
    if (this.logLevel > LogLevel.WARNING) return;
    
    const entry = this.createLogEntry(LogLevel.WARNING, category, message, details);
    this.outputToConsole(entry);
    this.saveToStorage(entry);
  }

  /**
   * エラーログ
   */
  error(category, message, details = null) {
    if (this.logLevel > LogLevel.ERROR) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, category, message, details);
    this.outputToConsole(entry);
    this.saveToStorage(entry);
  }

  /**
   * 重大エラーログ
   */
  critical(category, message, details = null) {
    if (this.logLevel > LogLevel.CRITICAL) return;
    
    const entry = this.createLogEntry(LogLevel.CRITICAL, category, message, details);
    this.outputToConsole(entry);
    this.saveToStorage(entry);
  }

  /**
   * タスク生成の詳細ログ
   */
  logTaskGeneration(taskData) {
    this.debug('TASK_GENERATION', 'タスク生成情報', {
      総タスク数: taskData.totalTasks,
      実行可能: taskData.executableTasks,
      スキップ: taskData.skippedTasks,
      AI別: taskData.byAI,
      列グループ: taskData.columnGroups,
      制御情報: taskData.controls
    });
  }

  /**
   * スプレッドシート読み込みの詳細ログ
   */
  logSpreadsheetLoad(data) {
    this.info('SPREADSHEET_LOAD', 'スプレッドシート読み込み完了', {
      ID: data.spreadsheetId,
      GID: data.gid,
      行数: data.rows,
      列数: data.columns,
      作業行: data.workRows,
      メニュー行: data.menuRow,
      AI行: data.aiRow,
      モデル行: data.modelRow,
      機能行: data.taskRow,
      AI列: data.aiColumns
    });
  }

  /**
   * 制御情報の詳細ログ
   */
  logControlInfo(controls) {
    this.debug('CONTROL_INFO', '制御情報検出', {
      行制御: controls.rowControls,
      列制御: controls.columnControls,
      処理対象行: controls.targetRows,
      処理対象列: controls.targetColumns
    });
  }

  /**
   * パフォーマンス測定ログ
   */
  logPerformance(operation, duration, details = null) {
    this.info('PERFORMANCE', `${operation} 完了`, {
      処理時間: `${duration}ms`,
      ...details
    });
  }

  /**
   * ログをエクスポート
   */
  async exportLogs(format = 'json') {
    const logs = this.isExtension ? await this.getStoredLogs() : this.logHistory;
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else if (format === 'csv') {
      const csvHeaders = 'Timestamp,Level,Category,Message,Details\n';
      const csvRows = Object.values(logs).map(log => {
        return `"${log.timestamp}","${this.getLevelName(log.level)}","${log.category}","${log.message}","${JSON.stringify(log.details || {})}"`;
      }).join('\n');
      return csvHeaders + csvRows;
    }
    
    return logs;
  }

  /**
   * ログをクリア
   */
  async clearLogs() {
    this.logHistory = [];
    if (this.isExtension) {
      await chrome.storage.local.remove('extension_logs');
    }
  }
}

// シングルトンインスタンスをエクスポート
const loggingService = new LoggingService();

// グローバルに公開（拡張機能内で使いやすくするため）
if (typeof window !== 'undefined') {
  window.LoggingService = loggingService;
}

// Node.js環境（テスト用）でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LoggingService: loggingService, LogLevel };
}