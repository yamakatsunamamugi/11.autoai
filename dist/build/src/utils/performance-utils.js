/**
 * @fileoverview パフォーマンス最適化ユーティリティ
 *
 * メモリリーク防止、処理の最適化、デバウンス/スロットリング等の
 * パフォーマンス関連のユーティリティ関数を提供
 */

/**
 * デバウンス関数
 * 指定時間内の連続した呼び出しを最後の1回だけ実行
 * @param {Function} func - デバウンスする関数
 * @param {number} wait - 待機時間（ミリ秒）
 * @param {boolean} immediate - 即座に実行するか
 * @returns {Function} デバウンスされた関数
 */
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };

    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) func.apply(this, args);
  };
}

/**
 * スロットリング関数
 * 指定時間内に1回だけ実行を許可
 * @param {Function} func - スロットリングする関数
 * @param {number} limit - 実行間隔の最小時間（ミリ秒）
 * @returns {Function} スロットリングされた関数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 並列処理のバッチ実行
 * 大量の非同期処理を指定数ずつバッチで実行
 * @param {Array} items - 処理対象の配列
 * @param {Function} asyncFunc - 各要素に対する非同期関数
 * @param {number} batchSize - バッチサイズ
 * @returns {Promise<Array>} 全結果の配列
 */
export async function batchProcess(items, asyncFunc, batchSize = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => asyncFunc(item).catch(error => ({
        error: true,
        message: error.message,
        item
      })))
    );
    results.push(...batchResults);
  }
  return results;
}

/**
 * メモリセーフな大量データ処理
 * ジェネレータを使用してメモリ効率的に処理
 * @param {Array} data - 処理対象データ
 * @param {Function} processor - 処理関数
 * @param {number} chunkSize - チャンクサイズ
 */
export async function* processLargeData(data, processor, chunkSize = 100) {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    yield await processor(chunk);
  }
}

/**
 * リトライ付き非同期処理
 * 失敗時に指数バックオフでリトライ
 * @param {Function} asyncFunc - 非同期関数
 * @param {number} maxRetries - 最大リトライ回数
 * @param {number} baseDelay - 基本遅延時間（ミリ秒）
 * @returns {Promise} 処理結果
 */
export async function retryWithBackoff(asyncFunc, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await asyncFunc();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * メモリリーク検出ヘルパー
 * WeakMapを使用してオブジェクトの参照を追跡
 */
export class MemoryLeakDetector {
  constructor() {
    this.objects = new WeakMap();
    this.counters = new Map();
  }

  /**
   * オブジェクトを追跡
   * @param {Object} obj - 追跡対象オブジェクト
   * @param {string} label - ラベル
   */
  track(obj, label) {
    if (!this.objects.has(obj)) {
      this.objects.set(obj, label);
      const count = this.counters.get(label) || 0;
      this.counters.set(label, count + 1);
    }
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return Object.fromEntries(this.counters);
  }

  /**
   * カウンターをリセット
   */
  reset() {
    this.counters.clear();
  }
}

/**
 * パフォーマンス計測デコレータ
 * 関数の実行時間を計測
 * @param {string} label - 計測ラベル
 * @returns {Function} デコレータ関数
 */
export function measurePerformance(label) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
      const start = performance.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - start;
        console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`[Performance] ${label} failed after ${duration.toFixed(2)}ms:`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * キャッシュ付き関数ラッパー
 * 結果をキャッシュして重複処理を防ぐ
 * @param {Function} func - キャッシュする関数
 * @param {number} ttl - キャッシュ有効期限（ミリ秒）
 * @returns {Function} キャッシュ付き関数
 */
export function memoize(func, ttl = 60000) {
  const cache = new Map();

  return async function(...args) {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.value;
    }

    const result = await func.apply(this, args);
    cache.set(key, {
      value: result,
      timestamp: Date.now()
    });

    // 古いキャッシュエントリを削除
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    return result;
  };
}

export default {
  debounce,
  throttle,
  batchProcess,
  processLargeData,
  retryWithBackoff,
  MemoryLeakDetector,
  measurePerformance,
  memoize
};