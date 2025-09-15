/**
 * モニタリングダッシュボード - フロントエンドスクリプト
 */

// DOM要素
const elements = {
  // 健全性
  healthScore: document.getElementById('healthScore'),
  healthStatus: document.getElementById('healthStatus'),
  connectionText: document.getElementById('connectionText'),

  // メモリ
  memoryPercent: document.getElementById('memoryPercent'),
  memoryDetails: document.getElementById('memoryDetails'),
  memoryProgress: document.getElementById('memoryProgress'),
  memoryUsed: document.getElementById('memoryUsed'),
  memoryLimit: document.getElementById('memoryLimit'),

  // タスク
  taskActive: document.getElementById('taskActive'),
  taskCompleted: document.getElementById('taskCompleted'),
  taskFailed: document.getElementById('taskFailed'),
  taskQueued: document.getElementById('taskQueued'),
  taskAvgTime: document.getElementById('taskAvgTime'),

  // ネットワーク
  networkRequests: document.getElementById('networkRequests'),
  networkErrors: document.getElementById('networkErrors'),
  networkErrorRate: document.getElementById('networkErrorRate'),
  networkAvgTime: document.getElementById('networkAvgTime'),
  networkBandwidth: document.getElementById('networkBandwidth'),

  // ストレージ
  storagePercent: document.getElementById('storagePercent'),
  storageProgress: document.getElementById('storageProgress'),
  storageLocal: document.getElementById('storageLocal'),
  storageSync: document.getElementById('storageSync'),

  // リスト
  alertsList: document.getElementById('alertsList'),
  recommendationsList: document.getElementById('recommendationsList')
};

// 状態
let isConnected = false;
let updateInterval = null;

/**
 * 初期化
 */
async function initialize() {
  console.log('[Dashboard] 初期化開始');

  // バックグラウンドスクリプトに接続
  connectToBackground();

  // 定期更新を開始
  startAutoUpdate();

  // 初回データ取得
  await updateDashboard();
}

/**
 * バックグラウンドスクリプトに接続
 */
function connectToBackground() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SYSTEM_METRICS_UPDATE') {
      updateMetrics(message.data);
    } else if (message.type === 'SYSTEM_ALERT') {
      addAlert(message.alert);
    }
  });

  // 接続確認
  chrome.runtime.sendMessage({ type: 'DASHBOARD_CONNECT' }, (response) => {
    if (response?.connected) {
      setConnectionStatus(true);
    }
  });
}

/**
 * ダッシュボードを更新
 */
async function updateDashboard() {
  try {
    // メトリクスを取得
    const response = await chrome.runtime.sendMessage({ type: 'GET_SYSTEM_METRICS' });

    if (response?.metrics) {
      updateMetrics(response.metrics);
    }

    if (response?.summary) {
      updateSummary(response.summary);
    }
  } catch (error) {
    console.error('[Dashboard] 更新エラー:', error);
    setConnectionStatus(false);
  }
}

/**
 * メトリクスを更新
 */
function updateMetrics(metrics) {
  if (!metrics) return;

  // メモリ
  if (metrics.memory) {
    const memPercent = metrics.memory.percentage || 0;
    const memUsed = formatBytes(metrics.memory.used);
    const memLimit = formatBytes(metrics.memory.limit);

    elements.memoryPercent.textContent = `${memPercent.toFixed(1)}%`;
    elements.memoryDetails.textContent = `${memUsed} / ${memLimit}`;
    elements.memoryProgress.style.width = `${memPercent}%`;
    elements.memoryProgress.className = `progress-fill ${getProgressClass(memPercent)}`;
    elements.memoryUsed.textContent = memUsed;
    elements.memoryLimit.textContent = memLimit;
  }

  // タスク
  if (metrics.tasks) {
    elements.taskActive.textContent = metrics.tasks.active || 0;
    elements.taskCompleted.textContent = metrics.tasks.completed || 0;
    elements.taskFailed.textContent = metrics.tasks.failed || 0;
    elements.taskQueued.textContent = metrics.tasks.queued || 0;
    elements.taskAvgTime.textContent = formatTime(metrics.tasks.avgProcessingTime);
  }

  // ネットワーク
  if (metrics.network) {
    elements.networkRequests.textContent = metrics.network.requests || 0;
    elements.networkErrors.textContent = metrics.network.failures || 0;

    const errorRate = metrics.network.requests > 0
      ? (metrics.network.failures / metrics.network.requests * 100).toFixed(1)
      : 0;
    elements.networkErrorRate.textContent = `${errorRate}%`;
    elements.networkAvgTime.textContent = `${metrics.network.avgResponseTime || 0}ms`;
    elements.networkBandwidth.textContent = formatBytes(metrics.network.bandwidth) + '/s';
  }

  // ストレージ
  if (metrics.storage) {
    const localUsed = metrics.storage.local.used || 0;
    const localQuota = metrics.storage.local.quota || 1;
    const storagePercent = (localUsed / localQuota * 100).toFixed(1);

    elements.storagePercent.textContent = `${storagePercent}%`;
    elements.storageProgress.style.width = `${storagePercent}%`;
    elements.storageProgress.className = `progress-fill ${getProgressClass(storagePercent)}`;
    elements.storageLocal.textContent = formatBytes(localUsed);
    elements.storageSync.textContent = formatBytes(metrics.storage.sync.used || 0);
  }
}

/**
 * サマリーを更新
 */
function updateSummary(summary) {
  if (!summary) return;

  // 健全性スコア
  if (summary.health !== undefined) {
    const score = Math.round(summary.health);
    elements.healthScore.textContent = score;

    // スコアに応じた角度（360度 = 100%）
    const angle = (score / 100) * 360;
    elements.healthScore.parentElement.style.setProperty('--score', `${angle}deg`);

    // ステータスバッジ
    let status, className;
    if (score >= 80) {
      status = '正常';
      className = 'status-healthy';
    } else if (score >= 50) {
      status = '警告';
      className = 'status-warning';
    } else {
      status = '危険';
      className = 'status-critical';
    }

    elements.healthStatus.textContent = status;
    elements.healthStatus.className = `status-badge ${className}`;
  }

  // アラート
  if (summary.alerts) {
    updateAlerts(summary.alerts);
  }

  // 推奨事項
  if (summary.recommendations) {
    updateRecommendations(summary.recommendations);
  }
}

/**
 * アラートを更新
 */
function updateAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    elements.alertsList.innerHTML = '<div class="empty-state">アラートはありません</div>';
    return;
  }

  const alertsHtml = alerts.map(alert => `
    <div class="alert-item ${alert.level}">
      <div class="alert-icon">
        ${getAlertIcon(alert.level)}
      </div>
      <div class="alert-content">
        <div class="alert-message">${escapeHtml(alert.message)}</div>
        <div class="alert-time">${formatTime(Date.now() - alert.timestamp)} 前</div>
      </div>
    </div>
  `).join('');

  elements.alertsList.innerHTML = alertsHtml;
}

/**
 * 推奨事項を更新
 */
function updateRecommendations(recommendations) {
  if (!recommendations || recommendations.length === 0) {
    elements.recommendationsList.innerHTML = '<div class="empty-state">推奨事項はありません</div>';
    return;
  }

  const recsHtml = recommendations.map(rec => `
    <div class="recommendation-item">
      <div class="recommendation-icon">💡</div>
      <div class="recommendation-text">${escapeHtml(rec.message)}</div>
    </div>
  `).join('');

  elements.recommendationsList.innerHTML = recsHtml;
}

/**
 * アラートを追加
 */
function addAlert(alert) {
  const alertElement = document.createElement('div');
  alertElement.className = `alert-item ${alert.level}`;
  alertElement.innerHTML = `
    <div class="alert-icon">
      ${getAlertIcon(alert.level)}
    </div>
    <div class="alert-content">
      <div class="alert-message">${escapeHtml(alert.message)}</div>
      <div class="alert-time">今</div>
    </div>
  `;

  // 空状態を削除
  const emptyState = elements.alertsList.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // 最新のアラートを上に追加
  elements.alertsList.insertBefore(alertElement, elements.alertsList.firstChild);

  // 最大10件まで表示
  while (elements.alertsList.children.length > 10) {
    elements.alertsList.removeChild(elements.alertsList.lastChild);
  }
}

/**
 * 接続状態を設定
 */
function setConnectionStatus(connected) {
  isConnected = connected;
  const statusDot = document.querySelector('.status-dot');

  if (connected) {
    statusDot.className = 'status-dot connected';
    elements.connectionText.textContent = '接続中';
  } else {
    statusDot.className = 'status-dot disconnected';
    elements.connectionText.textContent = '切断';
  }
}

/**
 * 自動更新を開始
 */
function startAutoUpdate() {
  // 5秒ごとに更新
  updateInterval = setInterval(() => {
    updateDashboard();
  }, 5000);
}

/**
 * 自動更新を停止
 */
function stopAutoUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

/**
 * アラートをクリア
 */
function clearAlerts() {
  chrome.runtime.sendMessage({ type: 'CLEAR_ALERTS' }, (response) => {
    if (response?.success) {
      elements.alertsList.innerHTML = '<div class="empty-state">アラートはありません</div>';
    }
  });
}

// ユーティリティ関数

/**
 * バイト数をフォーマット
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 時間をフォーマット
 */
function formatTime(ms) {
  if (!ms || ms === 0) return '0s';

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}分`;
  return `${Math.floor(ms / 3600000)}時間`;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * プログレスクラスを取得
 */
function getProgressClass(percent) {
  if (percent < 50) return 'low';
  if (percent < 80) return 'medium';
  return 'high';
}

/**
 * アラートアイコンを取得
 */
function getAlertIcon(level) {
  switch (level) {
    case 'critical': return '🚨';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '📌';
  }
}

// ページロード時に初期化
document.addEventListener('DOMContentLoaded', initialize);

// ページアンロード時にクリーンアップ
window.addEventListener('beforeunload', () => {
  stopAutoUpdate();
});