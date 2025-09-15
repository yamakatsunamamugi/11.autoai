/**
 * @fileoverview 電源管理設定 - システムスリープ防止とバッテリー管理
 *
 * 統合機能:
 * - Wake Lock API管理（wake-lock-manager.js統合）
 * - スリープ防止設定
 * - バッテリー配慮設定
 * - ハートビート機能
 *
 * 使用方法:
 * ```javascript
 * import { PowerConfig } from '../config/power-config.js';
 *
 * // 長時間処理開始時
 * await PowerConfig.preventSleep('Deep Research処理');
 *
 * // 処理完了時
 * await PowerConfig.allowSleep();
 * ```
 */

class PowerConfiguration {
  constructor() {
    // デフォルト設定
    this.config = {
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
      logLevel: 'info'
    };

    // Wake Lock Manager機能（wake-lock-manager.js統合）
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

    // Wake Lock APIサポート確認
    this.wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    this.batterySupported = typeof navigator !== 'undefined' && 'getBattery' in navigator;

    // イベントハンドラーバインド
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onBatteryChange = this.onBatteryChange.bind(this);

    console.log('[PowerConfig] 電源管理設定初期化完了', {
      wakeLockSupported: this.wakeLockSupported,
      batterySupported: this.batterySupported
    });
  }

  /**
   * Wake Lockを取得（スリープ防止開始）
   * @param {string} context - コンテキスト（処理名など）
   * @param {Object} options - 追加オプション
   * @returns {Promise<boolean>} 取得成功の場合true
   */
  async preventSleep(context = 'Long Running Process', options = {}) {
    // 既に取得済みの場合は警告
    if (this.wakeLockActive) {
      console.warn('[PowerConfig] Wake Lock既に取得済み', {
        currentContext: this.context,
        newContext: context
      });
      return false;
    }

    this.context = context;
    this.startTime = Date.now();
    this.stats.totalAcquisitions++;

    console.log('[PowerConfig] スリープ防止開始', { context });

    // バッテリー状態チェック
    if (this.config.respectBattery && !(await this.checkBatteryLevel())) {
      this.stats.batteryBlocks++;
      console.warn('[PowerConfig] バッテリー残量不足でスリープ防止無効化');
      return false;
    }

    // Wake Lock API使用を試行
    if (this.config.enableWakeLock && this.wakeLockSupported) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLockActive = true;

        // Wake Lock解放イベントハンドラー
        this.wakeLock.addEventListener('release', () => {
          console.log('[PowerConfig] Wake Lock自動解放検出');
          this.wakeLockActive = false;
        });

        console.log('[PowerConfig] Wake Lock取得成功 (API)', { context });

      } catch (error) {
        console.warn('[PowerConfig] Wake Lock API失敗、フォールバックを使用', error);
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
   * Wake Lockを解放（スリープ防止解除）
   * @returns {Promise<void>}
   */
  async allowSleep() {
    if (!this.wakeLockActive && !this.fallbackInterval) {
      return;
    }

    const duration = this.startTime ? Date.now() - this.startTime : 0;
    this.stats.totalDuration += duration;

    console.log('[PowerConfig] スリープ防止解除', {
      context: this.context,
      duration: Math.round(duration / 1000) + '秒'
    });

    // Wake Lock解放
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        console.log('[PowerConfig] Wake Lock解放成功 (API)');
      } catch (error) {
        console.error('[PowerConfig] Wake Lock解放エラー', error);
      }
      this.wakeLock = null;
    }

    // フォールバッククリア
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
      console.log('[PowerConfig] フォールバック解放');
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
    if (!this.config.enableFallback) {
      return;
    }

    this.stats.fallbackUsage++;
    this.wakeLockActive = true;

    // 定期的に小さな処理を実行してシステムをアクティブに保つ
    this.fallbackInterval = setInterval(() => {
      // 小さなDOM操作やメモリ操作を実行
      if (typeof document !== 'undefined') {
        const dummy = document.createElement('div');
        dummy.style.display = 'none';
        document.body.appendChild(dummy);
        document.body.removeChild(dummy);
      }

      // 現在時刻を更新（バックグラウンドタブでの実行維持）
      Date.now();

    }, 15000); // 15秒間隔

    console.log('[PowerConfig] フォールバック機能有効化', { context: this.context });
  }

  /**
   * ハートビート機能開始
   * @private
   */
  startHeartbeat() {
    this.heartbeatIntervalId = setInterval(() => {
      const elapsed = Date.now() - this.startTime;

      // 最大実行時間チェック
      if (elapsed > this.config.maxDuration) {
        console.warn('[PowerConfig] 最大実行時間到達、スリープ防止自動解除', {
          elapsed: Math.round(elapsed / 1000) + '秒'
        });
        this.allowSleep();
        return;
      }

      // ハートビートログ
      if (this.config.logLevel === 'debug') {
        console.log('[PowerConfig] ハートビート', {
          context: this.context,
          elapsed: Math.round(elapsed / 1000) + '秒',
          wakeLockActive: this.wakeLockActive
        });
      }

      // Wake Lock状態チェック（再取得が必要な場合）
      if (this.wakeLockSupported && !this.wakeLock && this.wakeLockActive) {
        console.log('[PowerConfig] Wake Lock再取得を試行');
        this.reacquireWakeLock();
      }

    }, this.config.heartbeatInterval);
  }

  /**
   * ハートビート機能停止
   * @private
   */
  stopHeartbeat() {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
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
      console.log('[PowerConfig] Wake Lock再取得成功');

      this.wakeLock.addEventListener('release', () => {
        console.log('[PowerConfig] Wake Lock自動解放検出（再取得分）');
        this.wakeLockActive = false;
      });

    } catch (error) {
      console.warn('[PowerConfig] Wake Lock再取得失敗', error);
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

      if (batteryPercent < this.config.batteryThreshold) {
        console.log('[PowerConfig] バッテリー残量不足', { percent: batteryPercent });
        return false;
      }

      return true;

    } catch (error) {
      console.warn('[PowerConfig] バッテリー情報取得エラー', error);
      return true; // エラーの場合は許可
    }
  }

  /**
   * イベントリスナー登録
   * @private
   */
  registerEventListeners() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

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
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }

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
      if (this.config.logLevel === 'debug') {
        console.log('[PowerConfig] ページが非表示になりました');
      }
    } else {
      if (this.config.logLevel === 'debug') {
        console.log('[PowerConfig] ページが表示されました');
      }
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
    if (this.config.respectBattery && this.wakeLockActive) {
      const allowed = await this.checkBatteryLevel();
      if (!allowed) {
        console.log('[PowerConfig] バッテリー残量不足のためスリープ防止解除');
        this.allowSleep();
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
    console.log('[PowerConfig] 統計情報をリセットしました');
  }

  /**
   * 設定を更新
   * @param {Object} newConfig - 新しい設定
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('[PowerConfig] 設定更新完了', this.config);
  }

  /**
   * リソースクリーンアップ
   */
  destroy() {
    this.allowSleep();
    this.resetStats();
    console.log('[PowerConfig] 電源管理設定破棄');
  }
}

// シングルトンインスタンス
export const PowerConfig = new PowerConfiguration();

/**
 * 処理を囲んでWake Lockを自動管理
 * @param {Function} fn - 実行する関数
 * @param {string} context - コンテキスト
 * @returns {Promise<*>} 関数の戻り値
 */
export async function withWakeLock(fn, context = 'Wrapped Process') {
  try {
    await PowerConfig.preventSleep(context);
    return await fn();
  } finally {
    await PowerConfig.allowSleep();
  }
}

// グローバル設定としてエクスポート
if (typeof globalThis !== 'undefined') {
  globalThis.PowerConfig = PowerConfig;
}

console.log('⚙️ Power Config loaded - スリープ防止機能準備完了');