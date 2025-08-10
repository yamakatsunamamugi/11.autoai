/**
 * ユーティリティ関数とクラス
 */

export class Logger {
  constructor() {
    this.level = 'info';
    this.prefix = '[Genspark]';
  }

  setLevel(level) {
    this.level = level;
  }

  log(message) {
    if (this.level === 'verbose' || this.level === 'info') {
      console.log(`${this.prefix} ${message}`);
    }
  }

  error(message) {
    console.error(`${this.prefix} [ERROR] ${message}`);
  }

  debug(message) {
    if (this.level === 'verbose') {
      console.debug(`${this.prefix} [DEBUG] ${message}`);
    }
  }
}

/**
 * Chrome拡張機能のメッセージ送信ヘルパー
 */
export async function sendMessage(action, data = {}) {
  try {
    return await chrome.runtime.sendMessage({ action, ...data });
  } catch (error) {
    console.error('メッセージ送信エラー:', error);
    throw error;
  }
}

/**
 * ストレージヘルパー
 */
export class StorageHelper {
  static async get(keys) {
    return await chrome.storage.local.get(keys);
  }

  static async set(data) {
    return await chrome.storage.local.set(data);
  }

  static async remove(keys) {
    return await chrome.storage.local.remove(keys);
  }

  static async clear() {
    return await chrome.storage.local.clear();
  }
}

/**
 * 実行履歴の管理
 */
export class ExecutionHistory {
  static async add(execution) {
    const storage = await StorageHelper.get(['history']);
    const history = storage.history || [];
    
    history.push({
      ...execution,
      timestamp: new Date().toISOString()
    });
    
    // 最新50件のみ保持
    if (history.length > 50) {
      history.shift();
    }
    
    await StorageHelper.set({ history });
  }

  static async getAll() {
    const storage = await StorageHelper.get(['history']);
    return storage.history || [];
  }

  static async clear() {
    await StorageHelper.set({ history: [] });
  }
}