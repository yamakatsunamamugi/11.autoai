// event-bus.js - イベント駆動アーキテクチャの中核
//
// 企業レベルのイベント管理:
// - 疎結合なコンポーネント間通信
// - イベントの持続化と再実行
// - 非同期イベント処理とエラーハンドリング
// - パフォーマンス監視とメトリクス

export class EventBus {
  static instance = null;

  constructor() {
    this.listeners = new Map(); // イベントリスナー
    this.middlewares = []; // ミドルウェア
    this.history = []; // イベント履歴
    this.metrics = {
      totalEvents: 0,
      failedEvents: 0,
      processedEvents: 0,
      averageProcessingTime: 0,
    };
    this.config = {
      maxHistorySize: 1000,
      enableMetrics: true,
      enableHistory: true,
      errorThreshold: 10,
    };
    this.isShuttingDown = false;
    this.eventQueue = []; // 非同期イベントキュー
    this.processing = false;
  }

  /**
   * シングルトンインスタンス取得
   */
  static getInstance() {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * イベントリスナー登録
   * @param {string} eventName - イベント名
   * @param {Function} listener - リスナー関数
   * @param {Object} options - オプション
   */
  on(eventName, listener, options = {}) {
    if (this.isShuttingDown) {
      throw new Error("シャットダウン中はリスナー登録できません");
    }

    if (typeof listener !== "function") {
      throw new Error("リスナーは関数である必要があります");
    }

    const listenerConfig = {
      listener,
      once: options.once || false,
      priority: options.priority || 0,
      async: options.async || false,
      timeout: options.timeout || 5000,
      id: this.generateListenerId(),
      metadata: options.metadata || {},
    };

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }

    const listeners = this.listeners.get(eventName);
    listeners.push(listenerConfig);

    // 優先度でソート
    listeners.sort((a, b) => b.priority - a.priority);

    return listenerConfig.id;
  }

  /**
   * 一回限りのイベントリスナー登録
   * @param {string} eventName - イベント名
   * @param {Function} listener - リスナー関数
   * @param {Object} options - オプション
   */
  once(eventName, listener, options = {}) {
    return this.on(eventName, listener, { ...options, once: true });
  }

  /**
   * イベントリスナー削除
   * @param {string} eventName - イベント名
   * @param {string|Function} listenerOrId - リスナー関数またはID
   */
  off(eventName, listenerOrId) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return false;

    const index = listeners.findIndex(
      (config) =>
        config.id === listenerOrId || config.listener === listenerOrId,
    );

    if (index !== -1) {
      listeners.splice(index, 1);
      if (listeners.length === 0) {
        this.listeners.delete(eventName);
      }
      return true;
    }

    return false;
  }

  /**
   * 全てのリスナー削除
   * @param {string} eventName - イベント名（省略時は全て）
   */
  removeAllListeners(eventName = null) {
    if (eventName) {
      this.listeners.delete(eventName);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * イベント発行（同期）
   * @param {string} eventName - イベント名
   * @param {*} data - イベントデータ
   * @param {Object} options - オプション
   */
  emit(eventName, data = null, options = {}) {
    if (this.isShuttingDown) {
      console.warn("シャットダウン中のイベント発行は無視されます:", eventName);
      return false;
    }

    const eventData = this.createEventData(eventName, data, options);

    try {
      // ミドルウェア実行
      if (!this.runMiddlewares(eventData)) {
        return false;
      }

      // 履歴に追加
      this.addToHistory(eventData);

      // リスナー実行
      const result = this.executeListeners(eventName, eventData);

      // メトリクス更新
      this.updateMetrics(eventData, true);

      return result;
    } catch (error) {
      this.updateMetrics(eventData, false);
      this.handleEventError(error, eventData);
      throw error;
    }
  }

  /**
   * イベント発行（非同期）
   * @param {string} eventName - イベント名
   * @param {*} data - イベントデータ
   * @param {Object} options - オプション
   */
  async emitAsync(eventName, data = null, options = {}) {
    const eventData = this.createEventData(eventName, data, {
      ...options,
      async: true,
    });

    // イベントキューに追加
    this.eventQueue.push(eventData);

    // 処理開始
    if (!this.processing) {
      await this.processEventQueue();
    }

    return eventData.id;
  }

  /**
   * イベントキューの処理
   */
  async processEventQueue() {
    this.processing = true;

    while (this.eventQueue.length > 0 && !this.isShuttingDown) {
      const eventData = this.eventQueue.shift();

      try {
        // ミドルウェア実行
        if (!this.runMiddlewares(eventData)) {
          continue;
        }

        // 履歴に追加
        this.addToHistory(eventData);

        // 非同期リスナー実行
        await this.executeListenersAsync(eventData.name, eventData);

        // メトリクス更新
        this.updateMetrics(eventData, true);
      } catch (error) {
        this.updateMetrics(eventData, false);
        this.handleEventError(error, eventData);
      }
    }

    this.processing = false;
  }

  /**
   * リスナーの同期実行
   * @param {string} eventName - イベント名
   * @param {Object} eventData - イベントデータ
   */
  executeListeners(eventName, eventData) {
    const listeners = this.listeners.get(eventName) || [];
    let results = [];

    for (const config of listeners) {
      try {
        if (config.async) {
          // 非同期リスナーはスキップ（emitAsyncで処理）
          continue;
        }

        const result = config.listener(eventData.data, eventData);
        results.push(result);

        // once リスナーの削除
        if (config.once) {
          this.off(eventName, config.id);
        }
      } catch (error) {
        console.error(`イベントリスナーエラー (${eventName}):`, error);
        results.push({ error: error.message });
      }
    }

    return results.length === 1 ? results[0] : results;
  }

  /**
   * リスナーの非同期実行
   * @param {string} eventName - イベント名
   * @param {Object} eventData - イベントデータ
   */
  async executeListenersAsync(eventName, eventData) {
    const listeners = this.listeners.get(eventName) || [];
    const promises = [];

    for (const config of listeners) {
      const promise = this.executeListenerWithTimeout(config, eventData)
        .then((result) => {
          // once リスナーの削除
          if (config.once) {
            this.off(eventName, config.id);
          }
          return result;
        })
        .catch((error) => {
          console.error(`非同期イベントリスナーエラー (${eventName}):`, error);
          return { error: error.message };
        });

      promises.push(promise);
    }

    return await Promise.allSettled(promises);
  }

  /**
   * タイムアウト付きリスナー実行
   * @param {Object} config - リスナー設定
   * @param {Object} eventData - イベントデータ
   */
  async executeListenerWithTimeout(config, eventData) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`リスナータイムアウト: ${config.timeout}ms`));
      }, config.timeout);

      try {
        const result = await config.listener(eventData.data, eventData);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * ミドルウェア追加
   * @param {Function} middleware - ミドルウェア関数
   */
  use(middleware) {
    if (typeof middleware !== "function") {
      throw new Error("ミドルウェアは関数である必要があります");
    }
    this.middlewares.push(middleware);
  }

  /**
   * ミドルウェア実行
   * @param {Object} eventData - イベントデータ
   * @returns {boolean} 続行可能かどうか
   */
  runMiddlewares(eventData) {
    for (const middleware of this.middlewares) {
      try {
        const result = middleware(eventData);
        if (result === false) {
          return false; // イベント処理を中断
        }
      } catch (error) {
        console.error("ミドルウェアエラー:", error);
        return false;
      }
    }
    return true;
  }

  /**
   * イベントデータ作成
   * @param {string} eventName - イベント名
   * @param {*} data - データ
   * @param {Object} options - オプション
   */
  createEventData(eventName, data, options) {
    return {
      id: this.generateEventId(),
      name: eventName,
      data,
      timestamp: new Date(),
      async: options.async || false,
      metadata: options.metadata || {},
      source: options.source || "unknown",
    };
  }

  /**
   * 履歴に追加
   * @param {Object} eventData - イベントデータ
   */
  addToHistory(eventData) {
    if (!this.config.enableHistory) return;

    this.history.push(eventData);

    // 履歴サイズ制限
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * メトリクス更新
   * @param {Object} eventData - イベントデータ
   * @param {boolean} success - 成功かどうか
   */
  updateMetrics(eventData, success) {
    if (!this.config.enableMetrics) return;

    this.metrics.totalEvents++;

    if (success) {
      this.metrics.processedEvents++;
    } else {
      this.metrics.failedEvents++;
    }

    // 平均処理時間の更新
    const processingTime = Date.now() - eventData.timestamp.getTime();
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime + processingTime) / 2;
  }

  /**
   * イベントエラーハンドリング
   * @param {Error} error - エラー
   * @param {Object} eventData - イベントデータ
   */
  handleEventError(error, eventData) {
    // エラーイベントを発行（循環回避のため条件付き）
    if (eventData.name !== "error.occurred") {
      try {
        this.emit("error.occurred", {
          originalEvent: eventData,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        });
      } catch (nestedError) {
        console.error("エラーイベント発行中にエラー:", nestedError);
      }
    }
  }

  /**
   * イベント履歴取得
   * @param {string} eventName - イベント名（省略時は全て）
   * @param {number} limit - 取得数制限
   */
  getHistory(eventName = null, limit = 100) {
    let history = this.history;

    if (eventName) {
      history = history.filter((event) => event.name === eventName);
    }

    return history.slice(-limit);
  }

  /**
   * メトリクス取得
   * @returns {Object} メトリクス
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - (this.startTime || Date.now()),
      activeListeners: this.getTotalListenerCount(),
      queueSize: this.eventQueue.length,
      errorRate:
        this.metrics.totalEvents > 0
          ? (this.metrics.failedEvents / this.metrics.totalEvents) * 100
          : 0,
    };
  }

  /**
   * イベント統計取得
   * @returns {Object} 統計情報
   */
  getStatistics() {
    const eventCounts = {};
    const listenerCounts = {};

    // イベント履歴から統計を作成
    for (const event of this.history) {
      eventCounts[event.name] = (eventCounts[event.name] || 0) + 1;
    }

    // リスナー数統計
    for (const [eventName, listeners] of this.listeners.entries()) {
      listenerCounts[eventName] = listeners.length;
    }

    return {
      eventCounts,
      listenerCounts,
      totalEvents: this.metrics.totalEvents,
      totalListeners: this.getTotalListenerCount(),
    };
  }

  /**
   * 設定更新
   * @param {Object} newConfig - 新しい設定
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // 履歴サイズ調整
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * リスナー数取得
   * @returns {number} 総リスナー数
   */
  getTotalListenerCount() {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.length;
    }
    return count;
  }

  /**
   * イベントID生成
   * @returns {string} イベントID
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * リスナーID生成
   * @returns {string} リスナーID
   */
  generateListenerId() {
    return `listener_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * イベントバスのシャットダウン
   */
  async shutdown() {
    console.debug("EventBus シャットダウン開始");
    this.isShuttingDown = true;

    // 残りのイベントキューを処理
    if (this.eventQueue.length > 0) {
      console.debug(`残り ${this.eventQueue.length} イベントを処理中...`);
      await this.processEventQueue();
    }

    // シャットダウンイベント発行
    this.emit("eventbus.shutdown", {
      timestamp: new Date(),
      metrics: this.getMetrics(),
    });

    // リソースクリア
    this.listeners.clear();
    this.middlewares.length = 0;
    this.history.length = 0;
    this.eventQueue.length = 0;

    console.debug("EventBus シャットダウン完了");
  }

  /**
   * デバッグ情報取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      totalListeners: this.getTotalListenerCount(),
      eventTypes: Array.from(this.listeners.keys()),
      queueSize: this.eventQueue.length,
      historySize: this.history.length,
      middlewareCount: this.middlewares.length,
      isProcessing: this.processing,
      isShuttingDown: this.isShuttingDown,
      config: this.config,
      metrics: this.getMetrics(),
    };
  }
}
