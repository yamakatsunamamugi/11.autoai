/**
 * @fileoverview Wake Lock Manager - システムスリープ防止ユーティリティ
 * 
 * 特徴:
 * - Wake Lock APIを使用したスリープ防止
 * - 長時間処理中のハートビート機能
 * - 自動的なWake Lock管理
 * - フォールバック対応（タイマー使用）
 * - バッテリー配慮の設定
 * 
 * 使用方法:
 * ```javascript
 * import { WakeLockManager } from '../utils/wake-lock-manager.js';
 * 
 * const wakeLock = new WakeLockManager();
 * 
 * // 長時間処理開始時
 * await wakeLock.acquire('Deep Research処理');
 * 
 * // 処理完了時
 * await wakeLock.release();
 * ```
 */

export class WakeLockManager {
  constructor(options = {}) {
    this.options = {
      // Wake Lock設定
      enableWakeLock: true,
      enableFallback: true,
      
      // ハートビート設定
      heartbeatInterval: 30000, // 30秒間隔
      maxDuration: 3600000,     // 最大1時間
      
      // バッテリー配慮
      respectBattery: true,
      batteryThreshold: 20, // 20%以下では無効化
      
      // ログ設定
      enableLogging: true,
      logLevel: 'info',
      
      ...options
    };
    
    // 内部状態
    this.wakeLock = null;
    this.wakeLockActive = false;
    this.heartbeatInterval = null;
    this.fallbackInterval = null;
    this.startTime = null;
    this.context = null;
    
    // 統計情報
    this.stats = {
      totalAcquisitions: 0,
      totalDuration: 0,
      batteryBlocks: 0,
      fallbackUsage: 0
    };
    
    // イベントハンドラー
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onBatteryChange = this.onBatteryChange.bind(this);
    
    // ロガー
    this.logger = options.logger || console;
    
    // Wake Lock APIサポート確認
    this.wakeLockSupported = 'wakeLock' in navigator;
    this.batterySupported = 'getBattery' in navigator;
    
    this.log('Wake Lock Manager初期化完了', {
      wakeLockSupported: this.wakeLockSupported,
      batterySupported: this.batterySupported
    });
  }

  /**
   * Wake Lockを取得
   * @param {string} context - コンテキスト（処理名など）
   * @param {Object} options - 追加オプション
   * @returns {Promise<boolean>} 取得成功の場合true
   */
  async acquire(context = 'Long Running Process', options = {}) {
    // 既に取得済みの場合は警告
    if (this.wakeLockActive) {
      this.log('Wake Lock既に取得済み', { currentContext: this.context, newContext: context }, 'warn');
      return false;
    }
    
    this.context = context;
    this.startTime = Date.now();
    this.stats.totalAcquisitions++;
    
    this.log('Wake Lock取得開始', { context });
    
    // バッテリー状態チェック
    if (this.options.respectBattery && !(await this.checkBatteryLevel())) {
      this.stats.batteryBlocks++;
      this.log('バッテリー残量不足でWake Lock無効化', {}, 'warn');
      return false;
    }
    
    // Wake Lock API使用を試行
    if (this.options.enableWakeLock && this.wakeLockSupported) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLockActive = true;
        
        // Wake Lock解放イベントハンドラー
        this.wakeLock.addEventListener('release', () => {
          this.log('Wake Lock自動解放検出');
          this.wakeLockActive = false;
        });
        
        this.log('Wake Lock取得成功 (API)', { context });
        
      } catch (error) {
        this.log('Wake Lock API失敗、フォールバックを使用', error, 'warn');
        this.enableFallback();
      }
    } else {
      // フォールバック使用
      this.enableFallback();
    }
    
    // ハートビート開始
    this.startHeartbeat();
    
    // イベントリスナー登録
    this.registerEventListeners();
    
    return true;
  }

  /**
   * Wake Lockを解放
   * @returns {Promise<void>}
   */
  async release() {
    if (!this.wakeLockActive && !this.fallbackInterval) {
      return;
    }
    
    const duration = this.startTime ? Date.now() - this.startTime : 0;
    this.stats.totalDuration += duration;
    
    this.log('Wake Lock解放開始', { 
      context: this.context,
      duration: Math.round(duration / 1000) + '秒'
    });
    
    // Wake Lock解放
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.log('Wake Lock解放成功 (API)');
      } catch (error) {
        this.log('Wake Lock解放エラー', error, 'error');
      }
      this.wakeLock = null;
    }
    
    // フォールバッククリア
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
      this.log('フォールバック解放');
    }
    
    // ハートビート停止
    this.stopHeartbeat();
    
    // イベントリスナー削除
    this.unregisterEventListeners();
    
    // 状態リセット
    this.wakeLockActive = false;
    this.context = null;
    this.startTime = null;
  }

  /**
   * フォールバック機能を有効化
   * Wake Lock APIが使用できない場合のタイマー使用
   * @private
   */
  enableFallback() {
    if (!this.options.enableFallback) {
      return;
    }
    
    this.stats.fallbackUsage++;
    this.wakeLockActive = true;
    
    // 定期的に小さな処理を実行してシステムをアクティブに保つ
    this.fallbackInterval = setInterval(() => {
      // 小さなDOM操作やメモリ操作を実行
      const dummy = document.createElement('div');
      dummy.style.display = 'none';
      document.body.appendChild(dummy);
      document.body.removeChild(dummy);
      
      // 現在時刻を更新（バックグラウンドタブでの実行維持）
      Date.now();
      
    }, 15000); // 15秒間隔
    
    this.log('フォールバック機能有効化', { context: this.context });
  }

  /**
   * ハートビート機能開始
   * @private
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      
      // 最大実行時間チェック
      if (elapsed > this.options.maxDuration) {
        this.log('最大実行時間到達、Wake Lock自動解放', {
          elapsed: Math.round(elapsed / 1000) + '秒'
        }, 'warn');
        this.release();
        return;
      }
      
      // ハートビートログ
      this.log('ハートビート', {
        context: this.context,
        elapsed: Math.round(elapsed / 1000) + '秒',
        wakeLockActive: this.wakeLockActive
      }, 'debug');
      
      // Wake Lock状態チェック（再取得が必要な場合）
      if (this.wakeLockSupported && !this.wakeLock && this.wakeLockActive) {
        this.log('Wake Lock再取得を試行');
        this.reacquireWakeLock();
      }
      
    }, this.options.heartbeatInterval);
  }

  /**
   * ハートビート機能停止
   * @private
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Wake Lock再取得
   * @private
   */
  async reacquireWakeLock() {
    if (!this.wakeLockSupported || this.wakeLock) {
      return;
    }
    
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.log('Wake Lock再取得成功');
      
      this.wakeLock.addEventListener('release', () => {
        this.log('Wake Lock自動解放検出（再取得分）');
        this.wakeLockActive = false;
      });
      
    } catch (error) {
      this.log('Wake Lock再取得失敗', error, 'warn');
    }
  }

  /**
   * バッテリーレベルチェック
   * @returns {Promise<boolean>} 使用可能な場合true
   * @private
   */
  async checkBatteryLevel() {
    if (!this.batterySupported) {
      return true; // サポートしていない場合は許可
    }
    
    try {
      const battery = await navigator.getBattery();
      const batteryPercent = Math.round(battery.level * 100);
      
      if (batteryPercent < this.options.batteryThreshold) {
        this.log('バッテリー残量不足', { percent: batteryPercent });
        return false;
      }
      
      return true;
      
    } catch (error) {
      this.log('バッテリー情報取得エラー', error, 'warn');
      return true; // エラーの場合は許可
    }
  }

  /**
   * イベントリスナー登録
   * @private
   */
  registerEventListeners() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    
    if (this.batterySupported) {
      navigator.getBattery().then(battery => {
        battery.addEventListener('levelchange', this.onBatteryChange);
      }).catch(() => {});
    }
  }

  /**
   * イベントリスナー削除
   * @private
   */
  unregisterEventListeners() {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    
    if (this.batterySupported) {
      navigator.getBattery().then(battery => {
        battery.removeEventListener('levelchange', this.onBatteryChange);
      }).catch(() => {});
    }
  }

  /**
   * ページ表示状態変更ハンドラー
   * @private
   */
  onVisibilityChange() {
    if (document.hidden) {
      this.log('ページが非表示になりました', {}, 'debug');
    } else {
      this.log('ページが表示されました', {}, 'debug');
      // 表示復帰時にWake Lock再取得を試行
      if (this.wakeLockActive && !this.wakeLock) {
        this.reacquireWakeLock();
      }
    }
  }

  /**
   * バッテリー状態変更ハンドラー
   * @private
   */
  async onBatteryChange() {
    if (this.options.respectBattery && this.wakeLockActive) {
      const allowed = await this.checkBatteryLevel();
      if (!allowed) {
        this.log('バッテリー残量不足のためWake Lock解放');
        this.release();
      }
    }
  }

  /**
   * 現在の状態を取得
   * @returns {Object} 状態情報
   */
  getStatus() {
    return {
      active: this.wakeLockActive,
      context: this.context,
      duration: this.startTime ? Date.now() - this.startTime : 0,
      wakeLockSupported: this.wakeLockSupported,
      batterySupported: this.batterySupported,
      usingFallback: !!this.fallbackInterval,
      stats: { ...this.stats }
    };
  }

  /**
   * 統計情報をリセット
   */
  resetStats() {
    this.stats = {
      totalAcquisitions: 0,
      totalDuration: 0,
      batteryBlocks: 0,
      fallbackUsage: 0
    };
    this.log('統計情報をリセットしました');
  }

  /**
   * ログ出力
   * @param {string} message - メッセージ
   * @param {*} data - 追加データ
   * @param {string} level - ログレベル
   * @private
   */
  log(message, data = {}, level = 'info') {
    if (!this.options.enableLogging) return;
    
    const logMessage = `[WakeLockManager] ${message}`;
    
    switch (level) {
      case 'error':
        this.logger.error(logMessage, data);
        break;
      case 'warn':
        this.logger.warn(logMessage, data);
        break;
      case 'debug':
        if (this.options.logLevel === 'debug') {
          this.logger.log(logMessage, data);
        }
        break;
      default:
        this.logger.log(logMessage, data);
    }
  }

  /**
   * リソースクリーンアップ
   */
  destroy() {
    this.release();
    this.resetStats();
    this.log('Wake Lock Manager破棄');
  }
}

/**
 * グローバルWake Lock Manager インスタンス
 */
export const globalWakeLockManager = new WakeLockManager({
  enableLogging: true,
  logLevel: 'info'
});

/**
 * 簡易ラッパー関数群
 */

/**
 * 長時間処理用のWake Lock取得
 * @param {string} context - 処理名
 * @returns {Promise<boolean>} 成功の場合true
 */
export async function preventSleep(context = 'Long Process') {
  return await globalWakeLockManager.acquire(context);
}

/**
 * Wake Lock解放
 * @returns {Promise<void>}
 */
export async function allowSleep() {
  await globalWakeLockManager.release();
}

/**
 * 処理を囲んでWake Lockを自動管理
 * @param {Function} fn - 実行する関数
 * @param {string} context - コンテキスト
 * @returns {Promise<*>} 関数の戻り値
 */
export async function withWakeLock(fn, context = 'Wrapped Process') {
  const wakeLock = new WakeLockManager();
  
  try {
    await wakeLock.acquire(context);
    return await fn();
  } finally {
    await wakeLock.release();
  }
}