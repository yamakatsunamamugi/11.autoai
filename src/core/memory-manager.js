/**
 * @fileoverview メモリ管理システム
 *
 * Chrome拡張機能のメモリ使用を最適化し、
 * メモリリークを防ぐための包括的な管理システム
 */

/**
 * メモリ管理クラス
 */
export class MemoryManager {
  constructor(config = {}) {
    this.config = {
      maxCacheSize: config.maxCacheSize || 50 * 1024 * 1024, // 50MB
      gcInterval: config.gcInterval || 60000, // 1分
      leakDetectionInterval: config.leakDetectionInterval || 300000, // 5分
      warningThreshold: config.warningThreshold || 0.7, // 70%
      criticalThreshold: config.criticalThreshold || 0.9, // 90%
      enableAutoCleanup: config.enableAutoCleanup !== false
    };

    this.caches = new Map();
    this.references = new WeakMap();
    this.timers = new Set();
    this.listeners = new Map();
    this.objectPool = new Map();
    this.memorySnapshots = [];
    this.isMonitoring = false;
  }

  /**
   * メモリ監視を開始
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // 定期的なガベージコレクション
    this.gcTimer = setInterval(() => {
      this.performGarbageCollection();
    }, this.config.gcInterval);

    // メモリリーク検出
    this.leakDetectionTimer = setInterval(() => {
      this.detectMemoryLeaks();
    }, this.config.leakDetectionInterval);

    // メモリ使用状況の監視
    this.monitorMemoryUsage();

    console.log('[MemoryManager] 監視開始');
  }

  /**
   * メモリ監視を停止
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;
    this.isMonitoring = false;

    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    if (this.leakDetectionTimer) {
      clearInterval(this.leakDetectionTimer);
      this.leakDetectionTimer = null;
    }

    console.log('[MemoryManager] 監視停止');
  }

  /**
   * キャッシュを作成
   */
  createCache(name, options = {}) {
    const cache = new CacheManager({
      name,
      maxSize: options.maxSize || 10 * 1024 * 1024, // 10MB
      ttl: options.ttl || 3600000, // 1時間
      onEvict: options.onEvict
    });

    this.caches.set(name, cache);
    return cache;
  }

  /**
   * キャッシュを取得
   */
  getCache(name) {
    return this.caches.get(name);
  }

  /**
   * すべてのキャッシュをクリア
   */
  clearAllCaches() {
    let totalCleared = 0;

    for (const [name, cache] of this.caches) {
      const cleared = cache.clear();
      totalCleared += cleared;
      console.log(`[MemoryManager] キャッシュ "${name}" をクリア: ${cleared} bytes`);
    }

    return totalCleared;
  }

  /**
   * オブジェクトプールを作成
   */
  createObjectPool(type, factory, options = {}) {
    const pool = new ObjectPool({
      type,
      factory,
      maxSize: options.maxSize || 100,
      resetFn: options.resetFn
    });

    this.objectPool.set(type, pool);
    return pool;
  }

  /**
   * オブジェクトプールから取得
   */
  borrowObject(type) {
    const pool = this.objectPool.get(type);
    if (!pool) {
      throw new Error(`Object pool "${type}" not found`);
    }
    return pool.borrow();
  }

  /**
   * オブジェクトプールに返却
   */
  returnObject(type, obj) {
    const pool = this.objectPool.get(type);
    if (pool) {
      pool.return(obj);
    }
  }

  /**
   * イベントリスナーを管理
   */
  addEventListener(target, event, handler, options = {}) {
    const key = this.getListenerKey(target, event);

    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    const wrapper = {
      handler,
      options,
      remove: () => {
        target.removeEventListener(event, handler, options);
        this.listeners.get(key)?.delete(wrapper);
      }
    };

    this.listeners.get(key).add(wrapper);
    target.addEventListener(event, handler, options);

    return wrapper.remove;
  }

  /**
   * すべてのリスナーを削除
   */
  removeAllListeners(target = null, event = null) {
    for (const [key, wrappers] of this.listeners) {
      const [keyTarget, keyEvent] = this.parseListenerKey(key);

      if (target && keyTarget !== target) continue;
      if (event && keyEvent !== event) continue;

      for (const wrapper of wrappers) {
        wrapper.remove();
      }

      this.listeners.delete(key);
    }
  }

  /**
   * タイマーを管理
   */
  setTimeout(fn, delay, ...args) {
    const timerId = setTimeout(() => {
      this.timers.delete(timerId);
      fn(...args);
    }, delay);

    this.timers.add(timerId);
    return timerId;
  }

  /**
   * インターバルを管理
   */
  setInterval(fn, interval, ...args) {
    const intervalId = setInterval(fn, interval, ...args);
    this.timers.add(intervalId);
    return intervalId;
  }

  /**
   * タイマーをクリア
   */
  clearTimer(timerId) {
    clearTimeout(timerId);
    clearInterval(timerId);
    this.timers.delete(timerId);
  }

  /**
   * すべてのタイマーをクリア
   */
  clearAllTimers() {
    for (const timerId of this.timers) {
      this.clearTimer(timerId);
    }
    this.timers.clear();
  }

  /**
   * ガベージコレクションを実行
   */
  performGarbageCollection() {
    const startMemory = this.getMemoryUsage();

    // 期限切れキャッシュをクリア
    for (const cache of this.caches.values()) {
      cache.removeExpired();
    }

    // 未使用のオブジェクトプールをクリーンアップ
    for (const pool of this.objectPool.values()) {
      pool.cleanup();
    }

    // 弱参照のクリーンアップ（自動）
    // WeakMapは自動的にGCされる

    const endMemory = this.getMemoryUsage();
    const freed = startMemory.used - endMemory.used;

    if (freed > 0) {
      console.log(`[MemoryManager] GC完了: ${this.formatBytes(freed)} 解放`);
    }

    return freed;
  }

  /**
   * メモリリークを検出
   */
  detectMemoryLeaks() {
    const currentSnapshot = this.takeMemorySnapshot();
    this.memorySnapshots.push(currentSnapshot);

    // 最大10スナップショットを保持
    if (this.memorySnapshots.length > 10) {
      this.memorySnapshots.shift();
    }

    // リーク検出（5スナップショット以上必要）
    if (this.memorySnapshots.length >= 5) {
      const trend = this.analyzeMemoryTrend();

      if (trend.isLeaking) {
        console.warn('[MemoryManager] メモリリーク検出:', {
          growthRate: `${trend.growthRate.toFixed(2)}%/分`,
          currentUsage: this.formatBytes(currentSnapshot.used),
          recommendation: trend.recommendation
        });

        // 自動クリーンアップ
        if (this.config.enableAutoCleanup) {
          this.performEmergencyCleanup();
        }
      }
    }

    return currentSnapshot;
  }

  /**
   * メモリスナップショットを取得
   */
  takeMemorySnapshot() {
    const memory = this.getMemoryUsage();
    return {
      timestamp: Date.now(),
      used: memory.used,
      limit: memory.limit,
      percentage: memory.percentage,
      cacheSize: this.getTotalCacheSize(),
      poolSize: this.getTotalPoolSize(),
      listeners: this.listeners.size,
      timers: this.timers.size
    };
  }

  /**
   * メモリトレンドを分析
   */
  analyzeMemoryTrend() {
    const snapshots = this.memorySnapshots;
    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];

    const timeDiff = (lastSnapshot.timestamp - firstSnapshot.timestamp) / 60000; // 分
    const memoryDiff = lastSnapshot.used - firstSnapshot.used;
    const growthRate = (memoryDiff / firstSnapshot.used) * 100 / timeDiff;

    // 成長率が1%/分以上の場合はリークの可能性
    const isLeaking = growthRate > 1;

    let recommendation = '';
    if (isLeaking) {
      if (lastSnapshot.cacheSize > lastSnapshot.used * 0.3) {
        recommendation = 'キャッシュサイズが大きすぎます';
      } else if (lastSnapshot.listeners > 1000) {
        recommendation = 'イベントリスナーが多すぎます';
      } else {
        recommendation = '不要なオブジェクト参照を確認してください';
      }
    }

    return {
      isLeaking,
      growthRate,
      memoryDiff,
      timeDiff,
      recommendation
    };
  }

  /**
   * 緊急クリーンアップ
   */
  performEmergencyCleanup() {
    console.warn('[MemoryManager] 緊急クリーンアップ開始');

    // すべてのキャッシュをクリア
    const cacheCleared = this.clearAllCaches();

    // オブジェクトプールをリセット
    for (const pool of this.objectPool.values()) {
      pool.reset();
    }

    // 不要なリスナーを削除
    const oldListenerCount = this.listeners.size;
    this.cleanupListeners();
    const listenersRemoved = oldListenerCount - this.listeners.size;

    // ガベージコレクションを強制
    const gcFreed = this.performGarbageCollection();

    console.log('[MemoryManager] 緊急クリーンアップ完了:', {
      cacheCleared: this.formatBytes(cacheCleared),
      listenersRemoved,
      gcFreed: this.formatBytes(gcFreed)
    });

    return {
      cacheCleared,
      listenersRemoved,
      gcFreed
    };
  }

  /**
   * メモリ使用状況を監視
   */
  monitorMemoryUsage() {
    const memory = this.getMemoryUsage();

    if (memory.percentage > this.config.criticalThreshold) {
      console.error('[MemoryManager] メモリ使用量が危険域:', `${memory.percentage.toFixed(2)}%`);
      this.performEmergencyCleanup();
    } else if (memory.percentage > this.config.warningThreshold) {
      console.warn('[MemoryManager] メモリ使用量が高い:', `${memory.percentage.toFixed(2)}%`);
      this.performGarbageCollection();
    }

    return memory;
  }

  /**
   * メモリ使用量を取得
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        percentage: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
      };
    }

    // フォールバック
    return {
      used: 0,
      limit: 0,
      percentage: 0
    };
  }

  /**
   * 総キャッシュサイズを取得
   */
  getTotalCacheSize() {
    let total = 0;
    for (const cache of this.caches.values()) {
      total += cache.getSize();
    }
    return total;
  }

  /**
   * 総プールサイズを取得
   */
  getTotalPoolSize() {
    let total = 0;
    for (const pool of this.objectPool.values()) {
      total += pool.getSize();
    }
    return total;
  }

  /**
   * 不要なリスナーをクリーンアップ
   */
  cleanupListeners() {
    for (const [key, wrappers] of this.listeners) {
      const [target] = this.parseListenerKey(key);

      // ターゲットが存在しない場合は削除
      if (!document.contains(target) && target !== window && target !== document) {
        for (const wrapper of wrappers) {
          wrapper.remove();
        }
        this.listeners.delete(key);
      }
    }
  }

  // ヘルパーメソッド

  getListenerKey(target, event) {
    const targetId = target.id || target.tagName || 'unknown';
    return `${targetId}_${event}`;
  }

  parseListenerKey(key) {
    const [targetId, event] = key.split('_');
    return [document.getElementById(targetId) || document, event];
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 統計情報を取得
   */
  getStatistics() {
    return {
      memory: this.getMemoryUsage(),
      caches: {
        count: this.caches.size,
        totalSize: this.getTotalCacheSize()
      },
      pools: {
        count: this.objectPool.size,
        totalSize: this.getTotalPoolSize()
      },
      listeners: this.listeners.size,
      timers: this.timers.size,
      snapshots: this.memorySnapshots.length
    };
  }

  /**
   * クリーンアップ
   */
  cleanup() {
    this.stopMonitoring();
    this.clearAllTimers();
    this.removeAllListeners();
    this.clearAllCaches();

    for (const pool of this.objectPool.values()) {
      pool.destroy();
    }
    this.objectPool.clear();

    this.memorySnapshots = [];
    console.log('[MemoryManager] クリーンアップ完了');
  }
}

/**
 * キャッシュマネージャー
 */
class CacheManager {
  constructor(options) {
    this.name = options.name;
    this.maxSize = options.maxSize;
    this.ttl = options.ttl;
    this.onEvict = options.onEvict;
    this.cache = new Map();
    this.access = new Map();
    this.size = 0;
  }

  set(key, value, ttl = this.ttl) {
    const size = this.estimateSize(value);

    // サイズチェック
    while (this.size + size > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    const entry = {
      value,
      size,
      expires: Date.now() + ttl
    };

    // 既存エントリの削除
    if (this.cache.has(key)) {
      this.delete(key);
    }

    this.cache.set(key, entry);
    this.access.set(key, Date.now());
    this.size += size;

    return true;
  }

  get(key) {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // 期限チェック
    if (entry.expires < Date.now()) {
      this.delete(key);
      return null;
    }

    // アクセス時間を更新
    this.access.set(key, Date.now());
    return entry.value;
  }

  delete(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.access.delete(key);
    this.size -= entry.size;

    if (this.onEvict) {
      this.onEvict(key, entry.value);
    }

    return true;
  }

  clear() {
    const totalSize = this.size;
    this.cache.clear();
    this.access.clear();
    this.size = 0;
    return totalSize;
  }

  removeExpired() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expires < now) {
        this.delete(key);
        removed++;
      }
    }

    return removed;
  }

  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.access) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  estimateSize(value) {
    // 簡易的なサイズ推定
    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    } else if (typeof value === 'object') {
      return JSON.stringify(value).length * 2;
    } else {
      return 8; // 数値など
    }
  }

  getSize() {
    return this.size;
  }
}

/**
 * オブジェクトプール
 */
class ObjectPool {
  constructor(options) {
    this.type = options.type;
    this.factory = options.factory;
    this.resetFn = options.resetFn || ((obj) => obj);
    this.maxSize = options.maxSize;
    this.available = [];
    this.inUse = new Set();
  }

  borrow() {
    let obj;

    if (this.available.length > 0) {
      obj = this.available.pop();
    } else {
      obj = this.factory();
    }

    this.inUse.add(obj);
    return obj;
  }

  return(obj) {
    if (!this.inUse.has(obj)) {
      return false;
    }

    this.inUse.delete(obj);

    // リセット
    this.resetFn(obj);

    // プールサイズチェック
    if (this.available.length < this.maxSize) {
      this.available.push(obj);
    }

    return true;
  }

  cleanup() {
    // 使用中でないオブジェクトを削減
    const targetSize = Math.floor(this.maxSize / 2);
    while (this.available.length > targetSize) {
      this.available.pop();
    }
  }

  reset() {
    this.available = [];
    this.inUse.clear();
  }

  destroy() {
    this.reset();
  }

  getSize() {
    return this.available.length + this.inUse.size;
  }
}

// シングルトンインスタンス
export const memoryManager = new MemoryManager();

// 自動起動
if (typeof window !== 'undefined') {
  memoryManager.startMonitoring();

  // ページアンロード時のクリーンアップ
  window.addEventListener('beforeunload', () => {
    memoryManager.cleanup();
  });
}

export default {
  MemoryManager,
  CacheManager,
  ObjectPool,
  memoryManager
};