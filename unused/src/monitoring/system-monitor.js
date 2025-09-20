/**
 * @fileoverview システム監視モニター
 *
 * Chrome拡張機能の健全性、パフォーマンス、リソース使用状況を
 * リアルタイムで監視し、問題を早期発見
 */

/**
 * システムメトリクス
 */
class SystemMetrics {
  constructor() {
    this.metrics = {
      memory: {
        used: 0,
        limit: 0,
        percentage: 0
      },
      cpu: {
        usage: 0,
        processes: []
      },
      network: {
        requests: 0,
        failures: 0,
        avgResponseTime: 0,
        bandwidth: 0
      },
      storage: {
        local: { used: 0, quota: 0 },
        sync: { used: 0, quota: 0 },
        session: { used: 0, quota: 0 }
      },
      runtime: {
        uptime: 0,
        crashes: 0,
        errors: 0,
        warnings: 0
      },
      tasks: {
        active: 0,
        completed: 0,
        failed: 0,
        queued: 0,
        avgProcessingTime: 0
      },
      api: {
        googleSheets: { calls: 0, errors: 0, quota: 0 },
        googleDocs: { calls: 0, errors: 0, quota: 0 },
        openai: { calls: 0, errors: 0, tokens: 0 },
        claude: { calls: 0, errors: 0, tokens: 0 }
      }
    };

    this.history = [];
    this.alerts = [];
    this.thresholds = this.getDefaultThresholds();
    this.collectors = new Map();
    this.isMonitoring = false;
    this.collectionInterval = 5000; // 5秒ごと
  }

  /**
   * デフォルトの閾値を取得
   */
  getDefaultThresholds() {
    return {
      memory: {
        warning: 80,  // 80%
        critical: 95  // 95%
      },
      cpu: {
        warning: 70,
        critical: 90
      },
      network: {
        failureRate: 10,  // 10%
        responseTime: 5000  // 5秒
      },
      storage: {
        warning: 80,
        critical: 95
      },
      errors: {
        perMinute: 10,
        perHour: 100
      }
    };
  }

  /**
   * 監視を開始
   */
  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.initializeCollectors();
    this.startCollection();

    console.log('[SystemMonitor] 監視開始');
  }

  /**
   * 監視を停止
   */
  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
    }

    console.log('[SystemMonitor] 監視停止');
  }

  /**
   * コレクターを初期化
   */
  initializeCollectors() {
    // メモリコレクター
    this.collectors.set('memory', async () => {
      if (chrome.runtime && chrome.runtime.getMemoryUsage) {
        try {
          const memory = await chrome.runtime.getMemoryUsage();
          this.metrics.memory = {
            used: memory.usedJSHeapSize,
            limit: memory.jsHeapSizeLimit,
            percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
          };
        } catch (error) {
          console.error('[SystemMonitor] メモリ情報取得エラー:', error);
        }
      }

      // Performance APIを使用
      if (performance.memory) {
        this.metrics.memory = {
          used: performance.memory.usedJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
          percentage: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
        };
      }
    });

    // ネットワークコレクター
    this.collectors.set('network', () => {
      // chrome.webRequestから情報を取得（要権限）
      if (this.networkStats) {
        this.metrics.network = { ...this.networkStats };
      }
    });

    // ストレージコレクター
    this.collectors.set('storage', async () => {
      try {
        // Local Storage
        if (chrome.storage.local) {
          const localUsage = await chrome.storage.local.getBytesInUse();
          this.metrics.storage.local.used = localUsage;
          this.metrics.storage.local.quota = chrome.storage.local.QUOTA_BYTES || 5242880;
        }

        // Sync Storage
        if (chrome.storage.sync) {
          const syncUsage = await chrome.storage.sync.getBytesInUse();
          this.metrics.storage.sync.used = syncUsage;
          this.metrics.storage.sync.quota = chrome.storage.sync.QUOTA_BYTES || 102400;
        }
      } catch (error) {
        console.error('[SystemMonitor] ストレージ情報取得エラー:', error);
      }
    });

    // ランタイムコレクター
    this.collectors.set('runtime', () => {
      if (!this.startTime) {
        this.startTime = Date.now();
      }
      this.metrics.runtime.uptime = Date.now() - this.startTime;
    });

    // タスクコレクター
    this.collectors.set('tasks', () => {
      // StreamProcessorV2から情報を取得
      if (globalThis.streamProcessorV2Instance) {
        const processor = globalThis.streamProcessorV2Instance;
        const status = processor.getProcessingStatus();

        this.metrics.tasks = {
          active: status.activeWindows || 0,
          completed: status.completedTasks || 0,
          failed: status.failedTasks || 0,
          queued: status.queuedTasks || 0,
          avgProcessingTime: status.avgProcessingTime || 0
        };
      }
    });
  }

  /**
   * メトリクス収集を開始
   */
  startCollection() {
    this.collectionTimer = setInterval(async () => {
      await this.collect();
      this.analyze();
      this.checkThresholds();
      this.updateHistory();
    }, this.collectionInterval);

    // 即座に最初の収集を実行
    this.collect();
  }

  /**
   * メトリクスを収集
   */
  async collect() {
    const promises = [];

    for (const [name, collector] of this.collectors) {
      promises.push(
        Promise.resolve(collector()).catch(error => {
          console.error(`[SystemMonitor] ${name}コレクターエラー:`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * メトリクスを分析
   */
  analyze() {
    // メモリリーク検出
    if (this.history.length > 10) {
      const recentMemory = this.history.slice(-10).map(h => h.memory.used);
      const isIncreasing = recentMemory.every((val, i) =>
        i === 0 || val >= recentMemory[i - 1]
      );

      if (isIncreasing) {
        this.addAlert('warning', 'メモリリークの可能性があります', {
          trend: recentMemory
        });
      }
    }

    // エラー率計算
    const errorRate = this.calculateErrorRate();
    if (errorRate > this.thresholds.network.failureRate) {
      this.addAlert('critical', `エラー率が高すぎます: ${errorRate.toFixed(2)}%`);
    }
  }

  /**
   * 閾値をチェック
   */
  checkThresholds() {
    // メモリチェック
    if (this.metrics.memory.percentage > this.thresholds.memory.critical) {
      this.addAlert('critical', `メモリ使用率が危険域: ${this.metrics.memory.percentage.toFixed(2)}%`);
    } else if (this.metrics.memory.percentage > this.thresholds.memory.warning) {
      this.addAlert('warning', `メモリ使用率が高い: ${this.metrics.memory.percentage.toFixed(2)}%`);
    }

    // ストレージチェック
    const localStoragePercent = (this.metrics.storage.local.used / this.metrics.storage.local.quota) * 100;
    if (localStoragePercent > this.thresholds.storage.critical) {
      this.addAlert('critical', `ローカルストレージがほぼ満杯: ${localStoragePercent.toFixed(2)}%`);
    }
  }

  /**
   * 履歴を更新
   */
  updateHistory() {
    const snapshot = {
      timestamp: Date.now(),
      ...JSON.parse(JSON.stringify(this.metrics))
    };

    this.history.push(snapshot);

    // 履歴サイズを制限（最大1時間分）
    const maxHistorySize = (3600 / (this.collectionInterval / 1000));
    if (this.history.length > maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * アラートを追加
   */
  addAlert(level, message, data = {}) {
    const alert = {
      id: Date.now() + '_' + Math.random(),
      timestamp: Date.now(),
      level,
      message,
      data,
      acknowledged: false
    };

    this.alerts.push(alert);

    // 最大100件まで
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // クリティカルアラートは即座に通知
    if (level === 'critical') {
      this.notifyCriticalAlert(alert);
    }

    return alert;
  }

  /**
   * クリティカルアラートを通知
   */
  notifyCriticalAlert(alert) {
    if (chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'SYSTEM_ALERT',
        alert
      }).catch(error => {
        console.error('[SystemMonitor] アラート通知失敗:', error);
      });
    }
  }

  /**
   * エラー率を計算
   */
  calculateErrorRate() {
    const total = this.metrics.network.requests;
    if (total === 0) return 0;
    return (this.metrics.network.failures / total) * 100;
  }

  /**
   * 現在のメトリクスを取得
   */
  getCurrentMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now()
    };
  }

  /**
   * 統計サマリーを取得
   */
  getSummary() {
    return {
      health: this.calculateHealthScore(),
      metrics: this.metrics,
      alerts: this.alerts.filter(a => !a.acknowledged),
      trends: this.calculateTrends(),
      recommendations: this.getRecommendations()
    };
  }

  /**
   * 健全性スコアを計算（0-100）
   */
  calculateHealthScore() {
    let score = 100;

    // メモリ使用率による減点
    if (this.metrics.memory.percentage > 80) {
      score -= (this.metrics.memory.percentage - 80) * 0.5;
    }

    // エラー率による減点
    const errorRate = this.calculateErrorRate();
    if (errorRate > 5) {
      score -= errorRate * 2;
    }

    // アラート数による減点
    const criticalAlerts = this.alerts.filter(a => a.level === 'critical' && !a.acknowledged).length;
    score -= criticalAlerts * 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * トレンドを計算
   */
  calculateTrends() {
    if (this.history.length < 2) return {};

    const recent = this.history.slice(-10);
    const older = this.history.slice(-20, -10);

    if (older.length === 0) return {};

    const avgRecent = {
      memory: recent.reduce((sum, h) => sum + h.memory.percentage, 0) / recent.length,
      errors: recent.reduce((sum, h) => sum + (h.runtime?.errors || 0), 0) / recent.length
    };

    const avgOlder = {
      memory: older.reduce((sum, h) => sum + h.memory.percentage, 0) / older.length,
      errors: older.reduce((sum, h) => sum + (h.runtime?.errors || 0), 0) / older.length
    };

    return {
      memory: avgRecent.memory - avgOlder.memory,
      errors: avgRecent.errors - avgOlder.errors
    };
  }

  /**
   * 推奨事項を取得
   */
  getRecommendations() {
    const recommendations = [];

    // メモリ関連
    if (this.metrics.memory.percentage > 70) {
      recommendations.push({
        type: 'memory',
        message: '不要なタブを閉じてメモリを解放してください',
        priority: 'high'
      });
    }

    // ストレージ関連
    const localStoragePercent = (this.metrics.storage.local.used / this.metrics.storage.local.quota) * 100;
    if (localStoragePercent > 70) {
      recommendations.push({
        type: 'storage',
        message: '古いログやキャッシュをクリーンアップしてください',
        priority: 'medium'
      });
    }

    // エラー関連
    const errorRate = this.calculateErrorRate();
    if (errorRate > 5) {
      recommendations.push({
        type: 'network',
        message: 'ネットワーク接続を確認してください',
        priority: 'high'
      });
    }

    return recommendations;
  }

  /**
   * ネットワーク統計を更新
   */
  updateNetworkStats(stats) {
    this.networkStats = stats;
  }

  /**
   * メトリクスをリセット
   */
  reset() {
    this.history = [];
    this.alerts = [];
    console.log('[SystemMonitor] メトリクスをリセット');
  }

  /**
   * データをエクスポート
   */
  export() {
    return {
      metrics: this.metrics,
      history: this.history,
      alerts: this.alerts,
      summary: this.getSummary(),
      exported: new Date().toISOString()
    };
  }
}

// シングルトンインスタンス
export const systemMonitor = new SystemMetrics();

// 自動起動
if (typeof chrome !== 'undefined' && chrome.runtime) {
  systemMonitor.start();
}

export default {
  SystemMetrics,
  systemMonitor
};