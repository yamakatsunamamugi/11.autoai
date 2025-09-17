// ui-controller.js - AutoAI Minimal コントロールパネル
//
import { toggleMutationObserverMonitoring } from './controllers/test-ai-selector-mutation-observer.js';

// Sleep function (inline implementation to avoid module import issues)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
//
// このファイルは、Chrome拡張機能のメインUIを管理します。
// ユーザーがスプレッドシートを設定し、AI処理を制御するためのインターフェースを提供します。
//
// ====================================
// 主な機能:
// ====================================
// 1. スプレッドシートの読み込みと処理
// 2. AIタスクの実行制御
// 3. 列追加機能（2025-08-23追加）
//    - スプレッドシートに必要な列（ログ列、回答列）を自動で追加
//    - 既存のSpreadsheetAutoSetupクラスを利用
// 4. ウィンドウ管理
// 5. ログ表示とエラーハンドリング
//
// ====================================
// 依存関係:
// ====================================
// - ui.html: UIのHTML構造
// - background.js: バックグラウンド処理（メッセージハンドラ）
// - src/services/spreadsheet-auto-setup.js: 列追加ロジック（間接的に使用）
// - src/features/spreadsheet/: スプレッドシート関連機能
// - window-manager.js: ウィンドウ管理機能

// ===== 共通ヘルパー関数 =====
/**
 * ウィンドウを最前面に表示する共通関数
 * テスト機能やAIタスク実行時に使用
 */
async function bringWindowToFront() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    
    await chrome.windows.update(currentWindow.id, {
      focused: true,
      drawAttention: true,
      state: 'normal'
    });
    
  } catch (error) {
    console.error('[bringWindowToFront] ウィンドウ最前面表示エラー:', error);
  }
}

// ===== リトライ通知システム =====
let activeNotifications = new Map();

// リトライ通知を表示
function showRetryNotification(data) {
  const { taskId, retryCount, maxRetries, error, errorMessage } = data;
  
  // 既存の通知を削除
  if (activeNotifications.has(taskId)) {
    const oldNotification = activeNotifications.get(taskId);
    if (oldNotification.element) {
      oldNotification.element.remove();
    }
  }
  
  // 通知要素を作成
  const notification = document.createElement('div');
  notification.className = 'retry-notification';
  notification.id = `retry-${taskId}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #ff9a00 0%, #ff6b35 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(255, 107, 53, 0.3);
    z-index: 10001;
    min-width: 300px;
    animation: slideIn 0.3s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="font-size: 24px;">🔄</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 5px;">
          リトライ中 (${retryCount}/${maxRetries})
        </div>
        <div style="font-size: 12px; opacity: 0.9;">
          ${errorMessage || 'タイムアウトエラーを検出しました'}
        </div>
        <div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">
          タスクID: ${taskId.substring(0, 8)}...
        </div>
      </div>
      <button onclick="dismissRetryNotification('${taskId}')" style="
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
         onmouseout="this.style.background='rgba(255,255,255,0.2)'">
        ×
      </button>
    </div>
    <div style="margin-top: 10px; background: rgba(255, 255, 255, 0.1); 
                height: 3px; border-radius: 2px; overflow: hidden;">
      <div style="background: white; height: 100%; width: 0%; 
                  animation: progress 5s linear forwards;"></div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // 通知を記録
  activeNotifications.set(taskId, {
    element: notification,
    timestamp: Date.now(),
    data: data
  });
  
  // 5秒後に自動的に削除
  setTimeout(() => {
    dismissRetryNotification(taskId);
  }, 5000);
}

// 通知を削除
function dismissRetryNotification(taskId) {
  if (activeNotifications.has(taskId)) {
    const notification = activeNotifications.get(taskId);
    if (notification.element) {
      notification.element.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        notification.element.remove();
      }, 300);
    }
    activeNotifications.delete(taskId);
  }
}

// スプレッドシート書き込み失敗通知を表示
function showSpreadsheetWriteFailureNotification(data) {
  const { taskId, retryCount, maxRetries, logCell, writeResult } = data;
  
  // 既存の通知を削除
  const notificationId = `spreadsheet-fail-${taskId}`;
  const existingNotification = document.getElementById(notificationId);
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // 通知要素を作成
  const notification = document.createElement('div');
  notification.className = 'spreadsheet-failure-notification';
  notification.id = notificationId;
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(220, 53, 69, 0.3);
    z-index: 10002;
    min-width: 320px;
    animation: slideIn 0.3s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="font-size: 24px;">⚠️</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 5px;">
          スプレッドシート書き込み失敗
        </div>
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 3px;">
          セル ${logCell || 'Unknown'} への書き込みが確認できませんでした
        </div>
        <div style="font-size: 11px; opacity: 0.8;">
          リトライ ${retryCount}/${maxRetries} 実行中...
        </div>
      </div>
      <button onclick="dismissSpreadsheetFailureNotification('${taskId}')" style="
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
         onmouseout="this.style.background='rgba(255,255,255,0.2)'">
        ×
      </button>
    </div>
    <div style="margin-top: 10px; padding: 8px; 
                background: rgba(255, 255, 255, 0.1); 
                border-radius: 5px; font-size: 11px;">
      <div style="margin-bottom: 5px;">🔧 <strong>対処方法:</strong></div>
      <ul style="margin: 0; padding-left: 15px; line-height: 1.4;">
        <li>スプレッドシートのアクセス権限を確認してください</li>
        <li>ブラウザのネットワーク接続を確認してください</li>
        <li>数秒待ってから手動でリトライしてください</li>
      </ul>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // 通知を記録
  activeNotifications.set(notificationId, {
    element: notification,
    timestamp: Date.now(),
    data: data
  });
  
  // 10秒後に自動的に削除（スプレッドシートエラーは重要なので長めに表示）
  setTimeout(() => {
    dismissSpreadsheetFailureNotification(taskId);
  }, 10000);
}

// スプレッドシート失敗通知を削除
function dismissSpreadsheetFailureNotification(taskId) {
  const notificationId = `spreadsheet-fail-${taskId}`;
  if (activeNotifications.has(notificationId)) {
    const notification = activeNotifications.get(notificationId);
    if (notification.element) {
      notification.element.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        notification.element.remove();
      }, 300);
    }
    activeNotifications.delete(notificationId);
  }
}

// 成功通知を表示
function showSuccessNotification(message, duration = 3000) {
  const notificationId = `success-${Date.now()}`;
  
  const notification = document.createElement('div');
  notification.id = notificationId;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(40, 167, 69, 0.3);
    z-index: 10000;
    min-width: 300px;
    animation: slideIn 0.3s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="font-size: 24px;">✅</div>
      <div style="flex: 1; font-size: 14px; font-weight: 500;">
        ${message}
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, duration);
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showRetryNotification') {
    showRetryNotification(request.data);
    sendResponse({ success: true });
  } else if (request.action === 'showSpreadsheetWriteFailure') {
    showSpreadsheetWriteFailureNotification(request.data);
    sendResponse({ success: true });
  } else if (request.action === 'showSuccessNotification') {
    showSuccessNotification(request.message || 'スプレッドシート書き込み成功', request.duration);
    sendResponse({ success: true });
  }
  return true;
});

// CSSアニメーションを追加
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  @keyframes progress {
    from { width: 0%; }
    to { width: 100%; }
  }
`;
document.head.appendChild(style);

// グローバルに通知機能を公開
window.showRetryNotification = showRetryNotification;
window.showSpreadsheetWriteFailureNotification = showSpreadsheetWriteFailureNotification;
window.showSuccessNotification = showSuccessNotification;
window.dismissRetryNotification = dismissRetryNotification;
window.dismissSpreadsheetFailureNotification = dismissSpreadsheetFailureNotification;

// ===== AIステータス管理 =====
function updateAIStatus() {
  // ストレージから設定を取得
  chrome.storage.local.get(['ai_config_persistence'], (result) => {
    const config = result.ai_config_persistence || {};

    // 各AIのテーブル形式でステータスを更新
    updateAIModelsTable('chatgpt', config.chatgpt);
    updateAIModelsTable('claude', config.claude);
    updateAIModelsTable('gemini', config.gemini);
  });
}

// 新しいテーブル形式のAIステータス更新
function updateAIModelsTable(aiType, aiConfig) {
  const modelCountEl = document.getElementById(`${aiType}-model-count`);
  const functionCountEl = document.getElementById(`${aiType}-function-count`);
  const modelsListEl = document.getElementById(`${aiType}-models-list`);
  const functionsListEl = document.getElementById(`${aiType}-functions-list`);

  if (!modelCountEl || !functionCountEl || !modelsListEl || !functionsListEl) return;

  if (aiConfig && (aiConfig.models || aiConfig.functions)) {
    // モデル数とリストを更新
    const modelCount = aiConfig.models ? aiConfig.models.length : 0;
    modelCountEl.textContent = modelCount.toString();

    if (aiConfig.models && aiConfig.models.length > 0) {
      modelsListEl.innerHTML = aiConfig.models.map(model =>
        `<tr><td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-size: 0.9em;">${model}</td></tr>`
      ).join('');
    } else {
      modelsListEl.innerHTML = '<tr><td style="padding: 8px; text-align: center; color: #999;">モデルデータなし</td></tr>';
    }

    // 機能数とリストを更新
    const functionCount = aiConfig.functions ? aiConfig.functions.length : 0;
    functionCountEl.textContent = functionCount.toString();

    if (aiConfig.functions && aiConfig.functions.length > 0) {
      functionsListEl.innerHTML = aiConfig.functions.map(func =>
        `<tr><td style="padding: 8px; border-bottom: 1px solid #e0e0e0; font-size: 0.9em;">${func}</td></tr>`
      ).join('');
    } else {
      functionsListEl.innerHTML = '<tr><td style="padding: 8px; text-align: center; color: #999;">機能データなし</td></tr>';
    }
  } else {
    // データなしの場合
    modelCountEl.textContent = '0';
    functionCountEl.textContent = '0';
    modelsListEl.innerHTML = '<tr><td style="padding: 8px; text-align: center; color: #999;">データを取得するには上記のボタンを実行してください</td></tr>';
    functionsListEl.innerHTML = '<tr><td style="padding: 8px; text-align: center; color: #999;">データを取得するには上記のボタンを実行してください</td></tr>';
  }
}

// 統合表示ボタンを追加する関数
function addIntegratedViewButton() {
  // 既存のボタンがあれば削除
  const existingBtn = document.getElementById('integrated-view-btn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // AIステータスセクションを取得
  const aiStatusSection = document.querySelector('.ai-status-section');
  if (!aiStatusSection) return;
  
  // 統合表示ボタンを作成
  const integratedBtn = document.createElement('button');
  integratedBtn.id = 'integrated-view-btn';
  integratedBtn.textContent = '📊 モデル・機能一覧';
  integratedBtn.style.cssText = `
    margin: 10px auto;
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s ease;
    display: block;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  `;
  
  integratedBtn.onmouseover = () => {
    integratedBtn.style.transform = 'translateY(-2px)';
    integratedBtn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
  };
  
  integratedBtn.onmouseout = () => {
    integratedBtn.style.transform = 'translateY(0)';
    integratedBtn.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
  };
  
  integratedBtn.onclick = () => {
    showDetailModal('integrated', 'all', []);
  };
  
  aiStatusSection.appendChild(integratedBtn);
}

// データクリーンアップボタンを追加する関数
function addDataCleanupButton() {
  // 既存のボタンがあれば削除
  const existingBtn = document.getElementById('data-cleanup-btn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // AIステータスセクションを取得
  const aiStatusSection = document.querySelector('.ai-status-section');
  if (!aiStatusSection) return;
  
  // データクリーンアップボタンを作成
  const cleanupBtn = document.createElement('button');
  cleanupBtn.id = 'data-cleanup-btn';
  cleanupBtn.textContent = '🧹 データクリーンアップ';
  cleanupBtn.style.cssText = `
    margin: 5px auto;
    padding: 8px 16px;
    background: linear-gradient(135deg, #f39c12 0%, #e74c3c 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.3s ease;
    display: block;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  `;
  
  cleanupBtn.onmouseover = () => {
    cleanupBtn.style.transform = 'translateY(-1px)';
    cleanupBtn.style.boxShadow = '0 3px 12px rgba(0, 0, 0, 0.2)';
  };
  
  cleanupBtn.onmouseout = () => {
    cleanupBtn.style.transform = 'translateY(0)';
    cleanupBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
  };
  
  cleanupBtn.onclick = async () => {
    if (confirm('古いデータ形式をクリアして新しい形式で再取得しますか？')) {
      // Chrome Storage をクリア
      chrome.storage.local.remove(['ai_config_persistence'], () => {
        alert('データクリーンアップ完了。「AI変更検出システム」を再実行してください。');
        
        // AIステータスを更新
        updateAIStatus();
      });
    }
  };
  
  aiStatusSection.appendChild(cleanupBtn);
}

function updateAIStatusCard(aiType, aiConfig) {
  const statusEl = document.getElementById(`${aiType}-status`);
  const modelEl = document.getElementById(`${aiType}-model-info`);
  const functionEl = document.getElementById(`${aiType}-function-info`);
  
  if (!statusEl || !modelEl || !functionEl) return;
  
  if (aiConfig && (aiConfig.models || aiConfig.functions)) {
    // 接続済み表示
    statusEl.textContent = '接続済み';
    statusEl.className = 'ai-status-badge connected';
    
    // モデル数を表示
    const modelCount = aiConfig.models ? aiConfig.models.length : 0;
    modelEl.textContent = modelCount.toString();
    modelEl.title = 'クリックしてモデル一覧を表示';
    
    // 機能数を表示
    const functionCount = aiConfig.functions ? aiConfig.functions.length : 0;
    functionEl.textContent = functionCount.toString();
    functionEl.title = 'クリックして機能一覧を表示';
    
    // クリックイベントを設定（既存のイベントを削除してから追加）
    modelEl.onclick = () => showDetailModal(aiType, 'models', aiConfig.models || []);
    functionEl.onclick = () => showDetailModal(aiType, 'functions', aiConfig.functions || []);
  } else {
    // 未接続表示
    statusEl.textContent = '未接続';
    statusEl.className = 'ai-status-badge';
    modelEl.textContent = '0';
    functionEl.textContent = '0';
    modelEl.onclick = null;
    functionEl.onclick = null;
  }
}

// 詳細モーダルを表示する関数（統合表示対応）
function showDetailModal(aiType, dataType, items) {
  // 統合表示の場合
  if (aiType === 'integrated' && dataType === 'all') {
    showIntegratedModal();
    return;
  }
  
  // 既存のモーダルがあれば削除
  const existingModal = document.getElementById('ai-detail-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // モーダルを作成
  const modal = document.createElement('div');
  modal.id = 'ai-detail-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 20px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;
  
  // ヘッダー
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 2px solid #e9ecef;
  `;
  
  const title = document.createElement('h3');
  const aiNames = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini'
  };
  title.textContent = `${aiNames[aiType]} ${dataType === 'models' ? 'モデル' : '機能'}一覧`;
  title.style.cssText = 'margin: 0; color: #2c3e50;';
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6c757d;
    padding: 0;
    width: 30px;
    height: 30px;
  `;
  closeBtn.onclick = () => modal.remove();
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // アイテムリスト
  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
  
  if (items.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = 'データがありません';
    emptyMsg.style.cssText = 'color: #6c757d; text-align: center; padding: 20px;';
    list.appendChild(emptyMsg);
  } else {
    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.style.cssText = `
        padding: 12px;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #dee2e6;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      
      const itemName = document.createElement('span');
      // itemが文字列の場合はそのまま表示
      // オブジェクトの場合はnameプロパティを優先、なければJSON文字列化を避けて'Unknown'を表示
      let displayText = '';
      if (typeof item === 'string') {
        displayText = item;
      } else if (typeof item === 'object' && item !== null) {
        displayText = item.name || item.label || item.text || item.value || 'Unknown';
      } else {
        displayText = String(item);
      }
      itemName.textContent = displayText;
      itemName.style.cssText = 'font-size: 14px; color: #495057;';
      
      itemDiv.appendChild(itemName);
      
      // アクティブな項目にバッジを追加
      if (typeof item === 'object' && (item.selected || item.active)) {
        const badge = document.createElement('span');
        badge.textContent = '選択中';
        badge.style.cssText = `
          background: #28a745;
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        `;
        itemDiv.appendChild(badge);
      }
      
      list.appendChild(itemDiv);
    });
  }
  
  modalContent.appendChild(header);
  modalContent.appendChild(list);
  modal.appendChild(modalContent);
  
  // モーダル外クリックで閉じる
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  };
  
  document.body.appendChild(modal);
}

// 統合モーダルを表示する関数
function showIntegratedModal() {
  // 既存のモーダルがあれば削除
  const existingModal = document.getElementById('ai-detail-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // ストレージからデータを取得
  chrome.storage.local.get(['ai_config_persistence'], async (result) => {
    const config = result.ai_config_persistence || {};
    
    // データクリーンアップを実行（グローバルAIPersistenceが利用可能な場合）
    if (window.AIPersistence && typeof window.AIPersistence.cleanupExistingData === 'function') {
      try {
        const hasChanges = await window.AIPersistence.cleanupExistingData();
        if (hasChanges) {
          // クリーンアップ後、更新されたデータを再取得
          setTimeout(() => {
            chrome.storage.local.get(['ai_config_persistence'], (updatedResult) => {
              const updatedConfig = updatedResult.ai_config_persistence || {};
              renderIntegratedTable(updatedConfig);
            });
          }, 1000);
          return; // 早期リターンして重複処理を避ける
        }
      } catch (error) {
        console.error('[UI] データクリーンアップエラー:', error);
      }
    }
    
    renderIntegratedTable(config);
  });
}

// テーブル描画を分離した関数
function renderIntegratedTable(config) {
    // モーダルを作成
    const modal = document.createElement('div');
    modal.id = 'ai-detail-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 20px;
      max-width: 900px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    `;
    
    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = `
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e9ecef;
    `;
    
    // タイトル行（タイトルと閉じるボタン）
    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    `;
    
    const title = document.createElement('h3');
    title.textContent = '🤖 AI統合モデル・機能一覧';
    title.style.cssText = 'margin: 0; color: #2c3e50;';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #6c757d;
      padding: 0;
      width: 30px;
      height: 30px;
    `;
    closeBtn.onclick = () => modal.remove();
    
    titleRow.appendChild(title);
    titleRow.appendChild(closeBtn);
    
    // スプレッドシート貼り付け指示テキストを追加
    const instructionText = document.createElement('p');
    instructionText.innerHTML = '📋 <strong>スプレッドシートの「AIモデル変更関数」に下の表を貼り付け</strong>';
    instructionText.style.cssText = `
      margin: 0;
      padding: 8px 12px;
      background-color: #e8f5e8;
      border: 1px solid #28a745;
      border-radius: 5px;
      color: #155724;
      font-size: 14px;
      font-weight: normal;
    `;
    
    header.appendChild(titleRow);
    header.appendChild(instructionText);
    
    // テーブル作成
    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    `;
    
    // テーブルヘッダー
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th style="border: 1px solid #dee2e6; padding: 12px; background: #f8f9fa; text-align: center; font-weight: 600; min-width: 150px;">🤖 ChatGPTモデル</th>
      <th style="border: 1px solid #dee2e6; padding: 12px; background: #f8f9fa; text-align: center; font-weight: 600; min-width: 150px;">🧠 Claudeモデル</th>
      <th style="border: 1px solid #dee2e6; padding: 12px; background: #f8f9fa; text-align: center; font-weight: 600; min-width: 150px;">💎 Geminiモデル</th>
      <th style="border: 1px solid #dee2e6; padding: 12px; background: #f8f9fa; text-align: center; font-weight: 600; min-width: 150px;">⚡ ChatGPT機能</th>
      <th style="border: 1px solid #dee2e6; padding: 12px; background: #f8f9fa; text-align: center; font-weight: 600; min-width: 150px;">🔧 Claude機能</th>
      <th style="border: 1px solid #dee2e6; padding: 12px; background: #f8f9fa; text-align: center; font-weight: 600; min-width: 150px;">🛠️ Gemini機能</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // 各列のデータを準備
    const columns = [
      { key: 'chatgpt', dataKey: 'models', name: 'ChatGPTモデル' },
      { key: 'claude', dataKey: 'models', name: 'Claudeモデル' },
      { key: 'gemini', dataKey: 'models', name: 'Geminiモデル' },
      { key: 'chatgpt', dataKey: 'functions', name: 'ChatGPT機能' },
      { key: 'claude', dataKey: 'functions', name: 'Claude機能' },
      { key: 'gemini', dataKey: 'functions', name: 'Gemini機能' }
    ];
    
    // 各列のデータを取得
    const columnData = columns.map(col => {
      const aiConfig = config[col.key];
      const items = aiConfig && aiConfig[col.dataKey] ? aiConfig[col.dataKey] : [];
      
      
      return items.map((item, index) => {
        let itemName = '';
        let isSelected = false;
        
        // 新しいシンプルなフォーマット（文字列配列）の処理
        if (typeof item === 'string') {
          itemName = item;
          isSelected = false;
        } else {
          
          if (typeof item === 'object' && item !== null) {
            // オブジェクトの場合、一般的なプロパティをチェック
            itemName = item.name || item.text || item.label || item.value || item.title || 'Unknown';
            isSelected = item.selected || item.active || false;
          } else {
            itemName = String(item);
            isSelected = false;
          }
        }
        
        // Claudeのモデル名から説明文を除去（全モデルに適用）
        if (col.key === 'claude' && col.dataKey === 'models' && itemName && typeof itemName === 'string') {
          const originalName = itemName;
          
          // 説明文の開始パターンを探す
          const descriptionPatterns = [
            '情報を', '高性能', 'スマート', '最適な', '高速な', '軽量な', '大規模', '小規模',
            '複雑な', '日常利用', '課題に対応', '効率的', 'に対応できる', 'なモデル'
          ];
          
          for (const pattern of descriptionPatterns) {
            const patternIndex = itemName.indexOf(pattern);
            if (patternIndex > 0) {
              itemName = itemName.substring(0, patternIndex).trim();
              break;
            }
          }
        }
        
        return { name: itemName, selected: isSelected };
      });
    });
    
    // 最大行数を計算
    const maxRows = Math.max(...columnData.map(col => col.length), 1);
    
    // テーブルボディ
    const tbody = document.createElement('tbody');
    
    // 各行を作成
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
      const row = document.createElement('tr');
      
      // 各列のセルを作成
      for (let colIndex = 0; colIndex < 6; colIndex++) {
        const cell = document.createElement('td');
        cell.style.cssText = 'border: 1px solid #dee2e6; padding: 8px; vertical-align: top; font-size: 13px;';
        
        const item = columnData[colIndex][rowIndex];
        if (item) {
          // データがある場合
          const statusBadge = item.selected ? 
            '<span style="background: #d4edda; color: #155724; padding: 1px 6px; border-radius: 8px; font-size: 11px; margin-left: 5px;">選択中</span>' : '';
          cell.innerHTML = `<div style="color: #495057;">${item.name}${statusBadge}</div>`;
        } else {
          // データがない場合（空セル）
          cell.innerHTML = '<div style="color: #dee2e6; text-align: center;">-</div>';
        }
        
        row.appendChild(cell);
      }
      
      tbody.appendChild(row);
    }
    
    table.appendChild(tbody);
    
    modalContent.appendChild(header);
    modalContent.appendChild(table);
    modal.appendChild(modalContent);
    
    // モーダル外クリックで閉じる
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    };
    
    document.body.appendChild(modal);
}

// ===== DOM要素の取得 =====
const urlInputsContainer = document.getElementById("url-inputs-container");
const saveUrlDialog = document.getElementById("saveUrlDialog");
const saveUrlTitle = document.getElementById("saveUrlTitle");
const confirmSaveUrlBtn = document.getElementById("confirmSaveUrlBtn");
const cancelSaveUrlBtn = document.getElementById("cancelSaveUrlBtn");
const openUrlDialog = document.getElementById("openUrlDialog");
const savedUrlsList = document.getElementById("savedUrlsList");
const confirmOpenUrlBtn = document.getElementById("confirmOpenUrlBtn");
const cancelOpenUrlBtn = document.getElementById("cancelOpenUrlBtn");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const deleteAnswersBtn = document.getElementById("deleteAnswersBtn");
// Test button removed - integrated test functionality deleted
// const startIntegratedTestBtn = document.getElementById(
//   "startIntegratedTestBtn",
// );
const aiDetectionSystemBtn = document.getElementById("aiDetectionSystemBtn");
const aiSelectorMutationSystemBtn = document.getElementById("aiSelectorMutationSystemBtn");
const statusDiv = document.getElementById("status");
const loadFeedback = document.getElementById("loadFeedback");

// 列状況カード関連の要素
const columnStatusCard = document.getElementById("columnStatusCard");
const columnStatusMessage = document.getElementById("columnStatusMessage");
const columnStatusActions = document.getElementById("columnStatusActions");
const undoColumnsBtn = document.getElementById("undoColumnsBtn");

// ===== ステータス管理 =====
/**
 * ステータス表示を更新する
 * @param {string} text - 表示するテキスト
 * @param {string} type - ステータスタイプ (waiting, loading, running, error, success)
 */
function updateStatus(text, type = "waiting") {
  // nullチェックを追加
  if (!statusDiv) {
    console.warn('[updateStatus] statusDiv が見つかりません:', text);
    return;
  }

  const statusText = statusDiv.querySelector(".status-text");
  const statusIcon = statusDiv.querySelector(".status-icon");

  // 子要素のnullチェックも追加
  if (!statusText || !statusIcon) {
    console.warn('[updateStatus] ステータス要素が見つかりません:', { statusText: !!statusText, statusIcon: !!statusIcon });
    return;
  }

  statusText.textContent = text;
  statusDiv.className = `status ${type}`;

  // 各ステータスに対応するアイコン
  const icons = {
    waiting: "⏸", // 待機中
    loading: "⏳", // 読み込み中
    running: "▶", // 実行中
    error: "⚠", // エラー
    success: "✓", // 成功
  };
  statusIcon.textContent = icons[type] || icons.waiting;
}

/**
 * フィードバックメッセージを表示する
 * @param {string} message - 表示するメッセージ
 * @param {string} type - メッセージタイプ (success, error, loading)
 */
function showFeedback(message, type = "success") {
  // loadFeedback要素の存在確認
  if (!loadFeedback) {
    console.error('[showFeedback] loadFeedback要素が見つかりません');
    // フォールバックとしてalertを使用
    if (type === 'success') {
      alert(`✅ ${message}`);
    } else if (type === 'error') {
      alert(`❌ ${message}`);
    }
    return;
  }

  // 既存のクラスをクリア
  loadFeedback.className = "feedback-message";

  // メッセージとタイプを設定
  loadFeedback.textContent = message;
  loadFeedback.classList.add(type);

  // アニメーションで表示
  setTimeout(() => {
    loadFeedback.classList.add("show");
  }, 10);

  // successメッセージは10秒間表示、errorは7秒、loadingはずっと表示
  if (type === 'success') {
    setTimeout(() => {
      loadFeedback.classList.remove("show");
    }, 10000); // 10秒
  } else if (type === 'error') {
    setTimeout(() => {
      loadFeedback.classList.remove("show");
    }, 7000); // 7秒
  }
  // loadingは明示的に消されるまで表示継続
}

/**
 * 列状況カードを表示・更新する
 * @param {Object} columnStatus - 列の状況情報
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} spreadsheetUrl - スプレッドシートURL
 */
function showColumnStatusCard(columnStatus, spreadsheetId, spreadsheetUrl) {
  if (!columnStatus || !columnStatus.checked) {
    columnStatusCard.style.display = "none";
    return;
  }

  // カードのクラスを設定
  columnStatusCard.className = "column-status-card";
  if (columnStatus.hasAdditions) {
    columnStatusCard.classList.add("has-additions");
  }
  if (columnStatus.error) {
    columnStatusCard.classList.add("has-error");
  }

  // メッセージを設定
  if (columnStatus.error) {
    columnStatusMessage.textContent = `列チェックエラー: ${columnStatus.error}`;
  } else {
    columnStatusMessage.textContent = columnStatus.message;
  }

  // アクションボタンの表示制御
  if (columnStatus.hasAdditions && !columnStatus.error) {
    columnStatusActions.style.display = "block";

    // 戻すボタンにデータを設定
    undoColumnsBtn.dataset.spreadsheetId = spreadsheetId;
    undoColumnsBtn.dataset.spreadsheetUrl = spreadsheetUrl;
  } else {
    columnStatusActions.style.display = "none";
  }

  // カードを表示
  columnStatusCard.style.display = "block";
}

/**
 * 列状況カードを非表示にする
 */
function hideColumnStatusCard() {
  columnStatusCard.style.display = "none";
}

// ===== URL入力欄管理 =====
/**
 * 削除ボタンの表示/非表示を制御
 * URL入力欄が1つの場合は削除ボタンを非表示にする
 */
function updateRemoveButtons() {
  // datalist方式では不要
  return;
}

/**
 * URL入力欄を動的に追加（datalist方式では不要）
 * @param {string} value - 初期値（省略可能）
 */

/**
 * 入力されたURLをローカルストレージに保存（datalist方式ではChrome Storageを使用）
 * 空の値は除外して保存する
 */
function saveUrls() {
  // datalist方式ではChrome Storageを使用
  return;
}

// ===== 複数URL管理機能 =====
let urlInputCounter = 1;  // URL入力欄のカウンター
let savedUrlToInput = null;  // どの入力欄に保存済みURLを設定するか

// デフォルトURL
const DEFAULT_URL = {
  url: "https://docs.google.com/spreadsheets/d/1C5aOSyyCBXf7HwF-BGGu-cz5jdRwNBaoW4G4ivIRrRg/edit?gid=1633283608#gid=1633283608",
  name: "デフォルトスプレッドシート"
};

// URL入力欄を追加
function addUrlInput() {
  const newRow = document.createElement('div');
  newRow.className = 'url-input-row';
  newRow.dataset.index = urlInputCounter;
  newRow.style.cssText = 'display: flex; gap: 5px; margin-bottom: 10px;';
  
  newRow.innerHTML = `
    <input type="text" class="spreadsheet-url-input" 
           placeholder="URLを入力してください" 
           style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
    <button class="btn btn-icon-only remove-url-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #dc3545; color: white; border: none; cursor: pointer;" title="削除">
      <span>−</span>
    </button>
    <button class="btn btn-icon-only save-url-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #007bff; color: white; border: none; cursor: pointer;" title="URLを保存">
      <span>💾</span>
    </button>
    <button class="btn btn-icon-only view-spreadsheet-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #17a2b8; color: white; border: none; cursor: pointer;" title="スプレッドシートを開く">
      <span>🔗</span>
    </button>
    <button class="btn btn-icon-only open-url-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #6c757d; color: white; border: none; cursor: pointer;" title="保存済みURLを開く">
      <span>📂</span>
    </button>
  `;
  
  urlInputsContainer.appendChild(newRow);
  urlInputCounter++;
  
  // イベントリスナーを追加
  attachUrlRowEventListeners(newRow);
}

// URL入力欄を削除
function removeUrlInput(row) {
  if (urlInputsContainer.children.length > 1) {
    row.remove();
  }
}

// 保存済みURLリストを読み込み
function loadSavedUrls() {
  chrome.storage.local.get(['savedSpreadsheets'], (result) => {
    let savedUrls = result.savedSpreadsheets || [];
    
    // デフォルトURLが存在しない場合は追加
    if (!savedUrls.some(item => item.url === DEFAULT_URL.url)) {
      savedUrls.unshift(DEFAULT_URL);
      chrome.storage.local.set({ savedSpreadsheets: savedUrls });
    }
  });
}

// イベントリスナーを各URL行に追加
function attachUrlRowEventListeners(row) {
  // +ボタン（最初の行のみ）
  const addBtn = row.querySelector('.add-url-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => addUrlInput());
  }
  
  // -ボタン（削除）
  const removeBtn = row.querySelector('.remove-url-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => removeUrlInput(row));
  }
  
  // 保存ボタン
  const saveBtn = row.querySelector('.save-url-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const input = row.querySelector('.spreadsheet-url-input');
      const url = input.value.trim();
      if (!url) {
        showFeedback('URLを入力してください', 'error');
        return;
      }
      showSaveUrlDialog(url, input);
    });
  }
  
  // スプレッドシートを開くボタン
  const viewBtn = row.querySelector('.view-spreadsheet-btn');
  if (viewBtn) {
    viewBtn.addEventListener('click', () => {
      const input = row.querySelector('.spreadsheet-url-input');
      const url = input.value.trim();
      if (!url) {
        showFeedback('URLを入力してください', 'error');
        return;
      }
      
      // URLの形式をチェック
      if (!url.includes('spreadsheets.google.com')) {
        showFeedback('Google スプレッドシートのURLを入力してください', 'error');
        return;
      }
      
      // 新しいタブでスプレッドシートを開く
      chrome.tabs.create({ url: url });
      showFeedback('スプレッドシートを開きました', 'success');
    });
  }
  
  // 開くボタン
  const openBtn = row.querySelector('.open-url-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      const input = row.querySelector('.spreadsheet-url-input');
      showOpenUrlDialog(input);
    });
  }
}

// URL保存ダイアログを表示
function showSaveUrlDialog(url, inputElement) {
  saveUrlDialog.style.display = 'block';
  saveUrlTitle.value = '';
  saveUrlTitle.focus();
  
  // 保存ボタンのイベント
  confirmSaveUrlBtn.onclick = () => {
    const title = saveUrlTitle.value.trim();
    if (!title) {
      showFeedback('タイトルを入力してください', 'error');
      return;
    }
    
    chrome.storage.local.get(['savedSpreadsheets'], (result) => {
      let savedUrls = result.savedSpreadsheets || [];
      savedUrls.push({ url: url, name: title });
      chrome.storage.local.set({ savedSpreadsheets: savedUrls }, () => {
        showFeedback('URLを保存しました', 'success');
        saveUrlDialog.style.display = 'none';
      });
    });
  };
  
  // キャンセルボタン
  cancelSaveUrlBtn.onclick = () => {
    saveUrlDialog.style.display = 'none';
  };
}

// 保存済みURL選択ダイアログを表示
function showOpenUrlDialog(inputElement) {
  chrome.storage.local.get(['savedSpreadsheets'], (result) => {
    const savedUrls = result.savedSpreadsheets || [];
    
    if (savedUrls.length === 0) {
      showFeedback('保存済みURLがありません', 'info');
      return;
    }
    
    // リストを作成
    savedUrlsList.innerHTML = '';
    savedUrls.forEach((item, index) => {
      const div = document.createElement('div');
      div.style.cssText = 'padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 5px; cursor: pointer;';
      div.innerHTML = `
        <input type="radio" name="savedUrl" value="${index}" id="url-${index}" style="margin-right: 10px;">
        <label for="url-${index}" style="cursor: pointer;">
          <strong>${item.name}</strong><br>
          <small style="color: #666;">${item.url.substring(0, 50)}...</small>
        </label>
      `;
      savedUrlsList.appendChild(div);
    });
    
    openUrlDialog.style.display = 'block';
    
    // 開くボタン
    confirmOpenUrlBtn.onclick = () => {
      const selected = document.querySelector('input[name="savedUrl"]:checked');
      if (!selected) {
        showFeedback('URLを選択してください', 'error');
        return;
      }
      
      const selectedUrl = savedUrls[selected.value];
      inputElement.value = selectedUrl.url;
      openUrlDialog.style.display = 'none';
      showFeedback(`「${selectedUrl.name}」を読み込みました`, 'success');
    };
    
    // キャンセルボタン
    cancelOpenUrlBtn.onclick = () => {
      openUrlDialog.style.display = 'none';
    };
  });
}

// 旧実装の関数群（新実装に置き換え済み）
/*
function saveCurrentUrl() {
  const url = spreadsheetInput.value.trim();
  
  if (!url) {
    showFeedback("URLを入力してください", "warning");
    return;
  }
  
  // 名前入力セクションを表示
  saveNameSection.style.display = 'block';
  saveNameInput.value = '';
  saveNameInput.focus();
}

// 名前を付けて保存を実行
function confirmSaveUrl() {
  const url = spreadsheetInput.value.trim();
  const name = saveNameInput.value.trim() || `スプレッドシート ${new Date().toLocaleDateString()}`;
  
  chrome.storage.local.get(['savedSpreadsheets'], (result) => {
    let savedUrls = result.savedSpreadsheets || [];
    
    // 重複チェック
    const existingIndex = savedUrls.findIndex(item => item.url === url);
    if (existingIndex !== -1) {
      // 既存の場合は名前を更新
      savedUrls[existingIndex].name = name;
      showFeedback("名前を更新しました", "success");
    } else {
      // 新規追加
      savedUrls.push({ url, name });
      showFeedback("URLを保存しました", "success");
    }
    
    chrome.storage.local.set({ savedSpreadsheets: savedUrls }, () => {
      loadSavedUrls();
      cancelSave();
    });
  });
}

// 保存をキャンセル
function cancelSave() {
  saveNameSection.style.display = 'none';
  saveNameInput.value = '';
}

// 現在のURLを削除
function deleteCurrentUrl() {
  const url = spreadsheetInput.value.trim();
  
  if (!url) {
    showFeedback("削除するURLを入力してください", "warning");
    return;
  }
  
  // デフォルトURLは削除不可
  if (url === DEFAULT_URL.url) {
    showFeedback("デフォルトURLは削除できません", "warning");
    return;
  }
  
  chrome.storage.local.get(['savedSpreadsheets'], (result) => {
    let savedUrls = result.savedSpreadsheets || [];
    const before = savedUrls.length;
    savedUrls = savedUrls.filter(item => item.url !== url);
    
    if (before === savedUrls.length) {
      showFeedback("このURLは保存されていません", "info");
      return;
    }
    
    chrome.storage.local.set({ savedSpreadsheets: savedUrls }, () => {
      showFeedback("URLを削除しました", "success");
      loadSavedUrls();
      spreadsheetInput.value = "";
    });
  });
}
*/

// 以下も旧実装の関数（コメントアウト）
/*
function editSelectedName() {
  const selectedUrl = savedUrlSelect.value;
  if (!selectedUrl) {
    showFeedback("編集するURLを選択してください", "warning");
    return;
  }
  
  chrome.storage.local.get(['savedSpreadsheets'], (result) => {
    const savedUrls = result.savedSpreadsheets || [];
    const selectedItem = savedUrls.find(item => item.url === selectedUrl);
    
    if (selectedItem) {
      // 編集セクションを表示
      editNameSection.style.display = 'block';
      editNameInput.value = selectedItem.name || '';
      editNameInput.focus();
      editNameInput.select();
    }
  });
}

// 編集した名前を保存
function saveEditedName() {
  const selectedUrl = savedUrlSelect.value;
  const newName = editNameInput.value.trim();
  
  if (!selectedUrl) {
    showFeedback("URLが選択されていません", "error");
    cancelEdit();
    return;
  }
  
  if (!newName) {
    showFeedback("名前を入力してください", "warning");
    return;
  }
  
  chrome.storage.local.get(['savedSpreadsheets'], (result) => {
    let savedUrls = result.savedSpreadsheets || [];
    const index = savedUrls.findIndex(item => item.url === selectedUrl);
    
    if (index !== -1) {
      savedUrls[index].name = newName;
      chrome.storage.local.set({ savedSpreadsheets: savedUrls }, () => {
        showFeedback("名前を変更しました", "success");
        loadSavedUrls();
        // 選択状態を保持
        setTimeout(() => {
          savedUrlSelect.value = selectedUrl;
        }, 100);
        cancelEdit();
      });
    }
  });
}

// 編集をキャンセル
function cancelEdit() {
  editNameSection.style.display = 'none';
  editNameInput.value = '';
}
*/

// URLを読み込む処理
async function loadSpreadsheetUrl(url) {
  if (!url) {
    updateStatus("URLを選択または入力してください", "error");
    return;
  }

  updateStatus("スプレッドシートを読み込み中...", "loading");
  showFeedback("読み込み中...", "loading");

  try {
    const response = await chrome.runtime.sendMessage({
      action: "loadSpreadsheets",
      urls: [url],
    });

    if (response && response.success) {
      const message = "スプレッドシートを読み込み、タスクリストを作成しました。";
      updateStatus(message, "success");
      showFeedback(message, "success");
      
      // 列状況を表示
      if (response.removedColumns) {
        showColumnStatus(response.removedColumns);
      }
    } else {
      const errorMessage = "読み込みエラー: " + (response?.error || "不明なエラー");
      updateStatus(errorMessage, "error");
      showFeedback(errorMessage, "error");
    }
  } catch (error) {
    console.error("スプレッドシート読み込みエラー:", error);
    updateStatus("読み込みエラー", "error");
    showFeedback("読み込みエラーが発生しました", "error");
  }
}

// ===== イベントリスナー: URL管理（旧UI互換） =====
// 以下は旧UI用のイベントリスナー（datalist対応のためコメントアウト）
/*
if (typeof loadSelectedBtn !== 'undefined' && loadSelectedBtn) {
  loadSelectedBtn.addEventListener("click", async () => {
    const selectedUrl = savedUrlSelect.value;
    if (selectedUrl) {
      await loadSpreadsheetUrl(selectedUrl);
    } else {
      showFeedback("URLを選択してください", "warning");
    }
  });
}

if (typeof deleteSelectedBtn !== 'undefined' && deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener("click", () => {
    const selectedUrl = savedUrlSelect.value;
    if (selectedUrl) {
      if (confirm("選択したURLを削除しますか？")) {
        deleteUrl(selectedUrl);
      }
    } else {
      showFeedback("削除するURLを選択してください", "warning");
    }
  });
}

if (typeof saveNewUrlBtn !== 'undefined' && saveNewUrlBtn) {
  saveNewUrlBtn.addEventListener("click", () => {
    const urlInput = document.querySelector(".url-input");
    const url = urlInput.value.trim();
    const name = urlNameInput.value.trim();
    
    if (url) {
      saveNewUrl(url, name);
      urlInput.value = "";
      urlNameInput.value = "";
    } else {
      showFeedback("URLを入力してください", "warning");
    }
  });
}

if (typeof loadNewUrlBtn !== 'undefined' && loadNewUrlBtn) {
  loadNewUrlBtn.addEventListener("click", async () => {
    const urlInput = document.querySelector(".url-input");
    const url = urlInput.value.trim();
    
    if (url) {
      await loadSpreadsheetUrl(url);
    } else {
      showFeedback("URLを入力してください", "warning");
    }
  });
}

if (typeof editNameBtn !== 'undefined' && editNameBtn) {
  editNameBtn.addEventListener("click", () => {
    editSelectedName();
  });
}

if (typeof saveEditBtn !== 'undefined' && saveEditBtn) {
  saveEditBtn.addEventListener("click", () => {
    saveEditedName();
  });
}

if (typeof cancelEditBtn !== 'undefined' && cancelEditBtn) {
  cancelEditBtn.addEventListener("click", () => {
    cancelEdit();
  });
}

if (typeof editNameInput !== 'undefined' && editNameInput) {
  editNameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveEditedName();
    }
  });
  
  editNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelEdit();
    }
  });
}
*/


// ===== イベントリスナー: スプレッドシート読み込み（startBtnに統合済み） =====
// loadSheetsBtnの処理はstartBtnに統合されました
/*
if (loadSheetsBtn) {
  loadSheetsBtn.addEventListener("click", async () => {
    // datalist対応の単一入力欄からURLを取得
    const url = spreadsheetInput.value.trim();
    
    if (!url) {
      showFeedback("URLを入力または選択してください", "warning");
      updateStatus("URLを入力してください", "error");
      return;
    }
    
    // 配列形式で処理（既存の処理と互換性保持）
    const urls = [url];

    // ボタンを無効化
  loadSheetsBtn.disabled = true;

  updateStatus("スプレッドシートを読み込み中...", "loading");
  showFeedback("読み込み中...", "loading");

  try {
    // バックグラウンドスクリプトにURLを送信
    const response = await chrome.runtime.sendMessage({
      action: "loadSpreadsheets",
      urls: urls,
    });

    if (response && response.success) {
      const message =
        "スプレッドシートを読み込み、タスクリストを作成しました。";
      updateStatus(message, "success");
      showFeedback(message, "success");
      // saveUrls(); // datalist方式では自動保存は不要

      // 列状況カードを表示
      if (response.columnStatus) {
        const spreadsheetUrl = urls[0];
        const match = spreadsheetUrl.match(
          /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
        );
        const spreadsheetId = match ? match[1] : null;
        showColumnStatusCard(
          response.columnStatus,
          spreadsheetId,
          spreadsheetUrl,
        );
      }

      // ボタンのテキストを変更して有効化
      loadSheetsBtn.innerHTML = '<span class="btn-icon">✓</span>再読み込み';
      loadSheetsBtn.disabled = false;
    } else {
      const errorMessage =
        "読み込みエラー: " + (response?.error || "不明なエラー");
      updateStatus(errorMessage, "error");
      showFeedback(errorMessage, "error");
      // エラー時もボタンを有効化
      loadSheetsBtn.disabled = false;
    }
  } catch (error) {
    console.error("スプレッドシート読み込みエラー:", error);
    updateStatus("読み込みエラー", "error");
    showFeedback("読み込みエラーが発生しました", "error");
    // エラー時もボタンを有効化
    loadSheetsBtn.disabled = false;
  }
  });
}
*/

// ===== イベントリスナー: 本番実行（ストリーミング処理開始） =====
/**
 * 【本番実行】
 * スプレッドシートから生成されたタスクリストを実際に処理します。
 * バックグラウンドスクリプト経由でStreamProcessorが並列実行されます。
 * 
 * 実行フロー:
 * 1. スプレッドシートURL確認
 * 2. TaskQueueからタスクリスト取得
 * 3. バックグラウンドでStreamProcessor実行
 * 4. 複数AIウィンドウで並列処理
 * 5. 結果をスプレッドシートに書き込み
 */
startBtn.addEventListener("click", async () => {

  // 複数のURL入力欄から値を取得
  const urlInputs = document.querySelectorAll('.spreadsheet-url-input');
  const urls = [];
  
  urlInputs.forEach((input) => {
    const url = input.value.trim();
    if (url) {
      urls.push(url);
    }
  });
  
  // バリデーション：URLが入力されているか確認
  if (urls.length === 0) {
    updateStatus("少なくとも1つのURLを入力してください", "error");
    return;
  }
  

  // ボタンの状態を更新
  startBtn.disabled = true;
  stopBtn.disabled = false;
  
  // 複数URLを並列処理
  await processMultipleUrls(urls);
});

// 複数URLを並列処理する関数
async function processMultipleUrls(urls) {
  if (!urls || urls.length === 0) {
    updateStatus("処理するURLがありません", "error");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }
  
  const currentUrl = urls[0]; // 最初のURLのみ処理（複数URL同時処理は未実装）
  updateStatus(`処理中: ${currentUrl.substring(0, 50)}...`, "loading");

  // まずスプレッドシートが読み込まれているか確認
  const storageResult = await chrome.storage.local.get(['savedTasks']);
  let savedTasks = storageResult.savedTasks;
  let loadResponse = null; // スコープ外でも参照できるように定義
  
  if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
    // スプレッドシートが読み込まれていない場合、自動的に読み込む
    updateStatus("スプレッドシートを自動読み込み中...", "loading");
    
    try {
      // loadSheetsBtnのクリック処理と同じロジックを実行
      loadResponse = await chrome.runtime.sendMessage({
        action: "loadSpreadsheets",
        urls: [currentUrl],
      });

      if (!loadResponse || !loadResponse.success) {
        throw new Error("スプレッドシート読み込みエラー: " + (loadResponse?.error || "不明なエラー"));
      }

      // タスクグループが作成されていることを確認
      if (!loadResponse.taskGroups || loadResponse.taskGroups.length === 0) {
        throw new Error("タスクグループが作成されていません");
      }

      console.log("loadResponse内容:", loadResponse);
      console.log(`✅ ${loadResponse.taskGroups.length}個のタスクグループが準備完了`);
      
      // 動的タスク生成モードではタスクリストは不要
      console.log("✅ 動的タスク生成モード - 実行時にタスクを判定します");
      savedTasks = null; // タスクは実行時に動的生成
    } catch (error) {
      console.error("スプレッドシート自動読み込みエラー:", error);
      updateStatus("スプレッドシート読み込みエラー: " + error.message, "error");
      startBtn.disabled = false;
      stopBtn.disabled = true;
      return;
    }
  }

  updateStatus("🌊 並列ストリーミング処理を開始しています...", "loading");

  try {
    // URLから情報を抽出
    const match = currentUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    // gidを抽出
    const gidMatch = currentUrl.match(/[#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    // 最新のタスクを取得（前のステップで自動読み込みした場合も含む）
    if (!savedTasks) {
      const storageData = await chrome.storage.local.get(['savedTasks']);
      savedTasks = storageData.savedTasks;
    }
    
    // 動的モードではタスクは実行時に生成されるため、ここでの再読み込みをスキップ
    // すでに上記の自動読み込みでスプレッドシートデータは取得済み

    
    // AI列数の正しい計算（savedTasksから取得）
    const aiColumnsCount = savedTasks?.aiColumns ? 
      (Array.isArray(savedTasks.aiColumns) ? 
        savedTasks.aiColumns.length : 
        Object.keys(savedTasks.aiColumns).length
      ) : 0;
    console.log("[UI] AI列数:", aiColumnsCount);

    // 動的タスク生成モードではsavedTasksは不要
    // タスクグループが存在すれば実行可能
    if (!loadResponse || !loadResponse.taskGroups || loadResponse.taskGroups.length === 0) {
      console.error("[UI] タスクグループが見つかりません", loadResponse);
      throw new Error("タスクグループが作成されていません。スプレッドシートを再読み込みしてください。");
    }
    
    console.log(`[UI] ✅ ${loadResponse.taskGroups.length}個のタスクグループで動的実行準備完了`);

    // タスクが生成されたら、ストリーミング処理を開始
    // 統合AIテストと同じstreamProcessTaskListを使用（統一化）
    const response = await Promise.race([
      chrome.runtime.sendMessage({
        action: "streamProcessTaskList",
        taskList: null, // 動的生成モードではタスクリストは不要
        spreadsheetId: spreadsheetId, // スプレッドシートIDを追加
        spreadsheetUrl: currentUrl, // URL情報も追加
        gid: gid, // シートIDも追加
        testMode: false, // 本番実行
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Message timeout')), 10000))
    ]);

    if (response && response.success) {
      updateStatus(`🌊 処理実行中`, "running");
      showFeedback(
        `ストリーミング処理開始: ${response.totalWindows || 4}個のウィンドウで並列処理中`,
        "success",
      );
    } else {
      updateStatus(
        "ストリーミング開始エラー: " + (response?.error || "不明なエラー"),
        "error",
      );
      // エラー時はボタンを元に戻す
      startBtn.disabled = false;
      stopBtn.disabled = true;
      showFeedback("ストリーミング処理の開始に失敗しました", "error");
    }
  } catch (error) {
    console.error("ストリーミング処理開始エラー:", error);
    
    // メッセージングエラーの場合は詳細ログを出力
    if (error.message.includes('message channel closed') || error.message.includes('Message timeout')) {
      updateStatus("処理開始中（通信エラーを検出）", "warning");
      showFeedback("通信エラーが発生しましたが、処理は継続している可能性があります", "warning");
      
      // ボタンはリセットしない（処理が継続している可能性があるため）
      return;
    }
    
    updateStatus("ストリーミング開始エラー", "error");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showFeedback("ストリーミング処理でエラーが発生しました", "error");
  }
}

// ===== イベントリスナー: ストリーミング処理停止 =====
stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  updateStatus("ストリーミング処理を停止中...", "loading");

  try {
    // バックグラウンドスクリプトにストリーミング処理停止を通知
    const response = await chrome.runtime.sendMessage({
      action: "stopStreaming",
    });

    if (response && response.success) {
      updateStatus("ストリーミング処理を停止しました", "waiting");
      showFeedback("ストリーミング処理を停止しました", "success");
    } else {
      updateStatus(
        "停止エラー: " + (response?.error || "不明なエラー"),
        "error",
      );
      showFeedback("ストリーミング処理の停止に失敗しました", "error");
    }

    // ボタン状態をリセット
    startBtn.disabled = false;
  } catch (error) {
    console.error("ストリーミング処理停止エラー:", error);
    updateStatus("停止エラー", "error");
    showFeedback("ストリーミング処理の停止でエラーが発生しました", "error");
    // エラー時もボタンをリセット
    startBtn.disabled = false;
  }
});

// ===== イベントリスナー: ログクリア =====
/**
 * 【ログクリアボタンの動作】
 * 
 * 概要：
 * スプレッドシートのログ列とA列のデータをクリアする機能
 * 
 * 削除対象：
 * 1. メニュー行の「ログ」列（完全一致）の作業行データ
 * 2. A列の2行目以降（A2:A1000）の全データ
 * 
 * 処理フロー：
 * 1. UIからスプレッドシートURLを取得
 * 2. background.jsの clearLog アクションを呼び出し
 * 3. sheets-client.jsでログ列をクリア
 * 4. background.jsでA列を追加クリア
 * 
 * 依存関係：
 * - background.js: clearLog ハンドラー
 * - sheets-client.js: clearSheetLogs メソッド
 * - sheets-client.js: batchUpdate メソッド（A列クリア用）
 * 
 * 前提条件：
 * - スプレッドシートURLが設定されていること
 * - メニュー行に「ログ」列が存在すること
 */
clearLogBtn.addEventListener("click", async () => {
  // 確認ダイアログを表示
  if (!confirm("スプレッドシートのログ列(メニューのログ列)とA列の1行目以降のデータをクリアしますか？")) {
    return;
  }

  // 複数URL入力欄から最初のURLを取得
  const urlInputs = document.querySelectorAll('.spreadsheet-url-input');
  const spreadsheetUrl = urlInputs.length > 0 ? urlInputs[0].value.trim() : '';

  if (!spreadsheetUrl) {
    updateStatus("スプレッドシートURLが設定されていません", "error");
    return;
  }

  // ボタンを無効化
  clearLogBtn.disabled = true;
  updateStatus("ログをクリア中...", "loading");

  try {
    // URLから情報を抽出
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    // ログ列とA列をクリア（background.jsで両方処理される）
    const response = await chrome.runtime.sendMessage({
      action: "clearLog",
      spreadsheetId: spreadsheetId,
    });

    if (response && response.success) {
      const clearedCount = response.clearedCount || 0;
      updateStatus(`ログ列とA列をクリアしました (${clearedCount}個のセル)`, "success");
      
      // 2秒後に通常状態に戻す
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      const errorMessage = response?.error || "不明なエラー";
      updateStatus(`ログクリアエラー: ${errorMessage}`, "error");
    }
  } catch (error) {
    console.error("ログクリアエラー:", error);
    updateStatus(`ログクリアエラー: ${error.message}`, "error");
  } finally {
    // ボタンを有効化
    clearLogBtn.disabled = false;
  }
});

// ===== イベントリスナー: 回答削除 =====
/**
 * 【回答削除ボタンの動作】
 * 
 * 概要：
 * スプレッドシートの全AI回答列とA列のデータを削除する機能
 * 
 * 削除対象：
 * 1. 各AI回答列（Claude、ChatGPT、Gemini等）の作業行データ
 * 2. A列の2行目以降（A2:A1000）の全データ（作業行マーカー）
 * 
 * 削除対象外：
 * - プロンプト列
 * - ログ列
 * - メニュー行、制御行、AI行、モデル行、機能行
 * 
 * 処理フロー：
 * 1. UIからスプレッドシートURLを取得
 * 2. background.jsの deleteAnswers アクションを呼び出し
 * 3. sheets-client.jsでAI回答列を検出し削除
 * 4. A列も同時にクリア
 * 
 * 依存関係：
 * - background.js: deleteAnswers ハンドラー
 * - sheets-client.js: deleteAnswers メソッド
 * - sheets-client.js: columnMapping（AI列の特定）
 * 
 * 前提条件：
 * - スプレッドシートURLが設定されていること
 * - メニュー行にAI名の列が存在すること
 * 
 * ログクリアとの違い：
 * - ログクリア: ログ列＋A列をクリア
 * - 回答削除: AI回答列＋A列をクリア
 * - 両方ともA列はクリアされる（作業行のリセット）
 */
deleteAnswersBtn.addEventListener("click", async () => {
  // 確認ダイアログを表示
  if (!confirm("AI回答を削除しますか？")) {
    return;
  }

  // 複数URL入力欄から最初のURLを取得
  const urlInputs = document.querySelectorAll('.spreadsheet-url-input');
  const spreadsheetUrl = urlInputs.length > 0 ? urlInputs[0].value.trim() : '';

  if (!spreadsheetUrl) {
    updateStatus("スプレッドシートURLが設定されていません", "error");
    return;
  }

  // ボタンを無効化
  deleteAnswersBtn.disabled = true;
  updateStatus("回答を削除中...", "loading");

  try {
    // URLから情報を抽出
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    const response = await chrome.runtime.sendMessage({
      action: "deleteAnswers",
      spreadsheetId: spreadsheetId,
    });

    if (response && response.success) {
      const deletedCount = response.deletedCount || 0;
      if (deletedCount > 0) {
        updateStatus(`回答を削除しました (${deletedCount}個のセル)`, "success");
      } else {
        updateStatus(
          response.message || "削除対象の回答が見つかりませんでした",
          "success",
        );
      }
      // 2秒後に通常状態に戻す
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      const errorMessage = response?.error || "不明なエラー";
      updateStatus(`回答削除エラー: ${errorMessage}`, "error");
    }
  } catch (error) {
    console.error("回答削除エラー:", error);
    updateStatus(`回答削除エラー: ${error.message}`, "error");
  } finally {
    // ボタンを有効化
    deleteAnswersBtn.disabled = false;
  }
});

// ===== テスト実行（統合AIテスト）関数 =====
/**
 * 【テスト実行】
 * AI Orchestratorを開いてテスト環境を提供します。
 * 手動テスト、3連続テスト、プロンプト管理などのテスト機能が使えます。
 * 
 * 主な用途:
 * - AI動作の手動確認
 * - 3連続テストでの性能測定
 * - プロンプトの登録・管理
 * - タスクリストのデバッグ（タスクリストがある場合は渡される）
 * 
 * 注意: これは本番実行ではなく、テスト・デバッグ用の機能です。
 */
async function runIntegratedAITest() {
  try {
    
    // TaskQueueから現在のタスクリストを取得（デバッグ用）
    const { default: TaskQueue } = await import("../features/task/queue.js");
    const taskQueue = new TaskQueue();
    const taskList = await taskQueue.loadTaskList();
    
    if (taskList) {
      // タスクリストをJSON化してChrome Storageに保存
      const taskData = taskList.toJSON();
      await chrome.storage.local.set({
        'task_queue_for_test': taskData
      });
    }
    
    // AI Orchestratorページを開く（タスクリストモードで）
    const orchestratorUrl = chrome.runtime.getURL(
      "src/ai-execution/ai-orchestrator.html?mode=tasklist",
    );

    // ウィンドウ設定
    const windowFeatures = `
      width=1200,
      height=800,
      left=${(screen.width - 1200) / 2},
      top=${(screen.height - 800) / 2},
      scrollbars=yes,
      resizable=yes,
      status=no,
      toolbar=no,
      menubar=no,
      location=no
    `.replace(/\s+/g, "");

    // 新しいウィンドウでAI Orchestratorを開く
    const orchestratorWindow = window.open(
      orchestratorUrl,
      `ai_orchestrator_${Date.now()}`,
      windowFeatures,
    );

    if (orchestratorWindow) {
      updateStatus("AI Orchestratorを開きました", "success");
      
      if (taskList) {
      }
    } else {
      console.error("❌ AI Orchestratorを開けませんでした");
      updateStatus("AI Orchestratorを開けませんでした", "error");
      alert("ポップアップブロッカーを無効にしてください");
    }
  } catch (error) {
    console.error("❌ AI Orchestrator実行エラー:", error);
    updateStatus("実行エラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
  }
}

// ===== AI自動化スクリプト注入関数 =====
async function injectAutomationScripts(tabId, aiName) {
  try {
    console.log(`${aiName}への自動化スクリプト注入開始`);
    
    // Claudeの場合はリサーチ機能を使用
    if (aiName === 'Claude') {
      console.log(`🎯 ${aiName}リサーチ処理を開始します`);
      console.log(`🔬 ${aiName}リサーチ機能を注入・実行します`);
      
      // Claudeのリサーチ検出器ファイル
      const researchFile = 'ai-platforms/claude/claude-research-detector.js';
      
      // リサーチ検出器を注入
      console.log(`⚡ スクリプトファイル: ${researchFile}`);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [researchFile]
        });
        console.log(`✅ ${aiName}リサーチ検出器を注入しました`);
      } catch (injectionError) {
        console.error(`❌ ${aiName}スクリプト注入エラー:`, injectionError);
        return;
      }
      
      // 少し待ってから実行
      console.log(`⏳ スクリプト初期化を待機中...`);
      await sleep(3000);
      
      // リサーチを実行
      const detectorName = 'ClaudeResearchDetector';
      console.log(`🚀 ${detectorName}を実行します`);
      
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async (aiName, detectorName) => {
          console.log(`🔬 ${aiName}リサーチ実行開始`);
          
          const detector = window[detectorName];
          if (!detector) {
            console.error(`${detectorName}が見つかりません`);
            return { success: false, error: `${detectorName}が見つかりません` };
          }
          
          try {
            // リサーチを実行
            const researchResult = await detector.executeResearch();
            
            if (researchResult.success) {
              console.log(`✅ ${aiName}リサーチ完了`);
              console.log('検出されたモデル数:', researchResult.data.models.length);
              // Claudeの場合
              if (aiName === 'Claude') {
                console.log('検出された機能数:', researchResult.data.features.length);
                console.log('DeepResearch利用可能:', researchResult.data.deepResearch.available);
                
                // 機能リストを作成
              const functionsList = researchResult.data.features.map(f => ({
                name: f.name,
                type: f.type,
                enabled: f.enabled,
                connected: f.connected
              }));
              
              // DeepResearchが利用可能な場合は機能リストに追加
              if (researchResult.data.deepResearch && researchResult.data.deepResearch.available) {
                functionsList.push({
                  name: 'DeepResearch',
                  type: 'research',
                  enabled: researchResult.data.deepResearch.activated || false,
                  connected: true,
                  special: true  // 特別な機能としてマーク
                });
                console.log('✅ DeepResearch機能を追加しました');
              }
              
                // 結果を返す（外側で保存処理）
                return {
                success: true,
                models: researchResult.data.models,
                functions: functionsList,  // DeepResearchを含む機能リスト
                deepResearch: researchResult.data.deepResearch,
                comparison: researchResult.comparison,
                // 保存用データを含める（オブジェクト配列形式）
                saveData: {
                  models: researchResult.data.models.map(m => ({ 
                    name: m.name.replace(/複雑な課題に対応できる.*|日常利用に最適な.*/g, '').trim() 
                  })), // 説明文を除去してオブジェクト配列として保存
                  functions: functionsList.map(f => ({ name: f.name })), // オブジェクト配列として保存
                  deepResearch: researchResult.data.deepResearch,
                  additionalModels: researchResult.data.additionalModels,
                  timestamp: new Date().toISOString()
                }
                };
              // Geminiの場合
              } else if (aiName === 'Gemini') {
                console.log('検出されたメイン機能数:', researchResult.data.features.main.length);
                console.log('検出された追加機能数:', researchResult.data.features.additional.length);
                console.log('Deep Think利用可能:', researchResult.data.deepThink.available);
                console.log('Deep Research利用可能:', researchResult.data.deepResearch.available);
                
                // Geminiの機能をフラット化（UIが期待する形式に変換）
                const functionsList = [];
                
                // メイン機能を追加
                researchResult.data.features.main.forEach(f => {
                  functionsList.push({
                    name: f.name,
                    type: f.type || 'main',
                    enabled: f.enabled,
                    connected: true,  // Geminiの機能はデフォルトで接続済み
                    icon: f.icon
                  });
                });
                
                // 追加機能を追加
                researchResult.data.features.additional.forEach(f => {
                  functionsList.push({
                    name: f.name,
                    type: f.type || 'additional',
                    enabled: f.enabled,
                    connected: true,  // Geminiの機能はデフォルトで接続済み
                    icon: f.icon,
                    sublabel: f.sublabel
                  });
                });
                
                // Deep Thinkが利用可能な場合は機能リストに追加
                if (researchResult.data.deepThink && researchResult.data.deepThink.available) {
                  functionsList.push({
                    name: 'Deep Think',
                    type: 'special',
                    enabled: researchResult.data.deepThink.activated || false,
                    connected: true,
                    special: true
                  });
                  console.log('✅ Deep Think機能を追加しました');
                }
                
                // Deep Researchが利用可能な場合は機能リストに追加
                if (researchResult.data.deepResearch && researchResult.data.deepResearch.available) {
                  functionsList.push({
                    name: 'Deep Research',
                    type: 'special',
                    enabled: researchResult.data.deepResearch.activated || false,
                    connected: true,
                    special: true
                  });
                  console.log('✅ Deep Research機能を追加しました');
                }
                
                console.log('✅ Gemini機能フラット化完了:', functionsList.length, '個の機能');
                
                // 結果を返す（外側で保存処理）
                return {
                  success: true,
                  models: researchResult.data.models,
                  functions: functionsList,  // フラット化された機能リスト
                  deepThink: researchResult.data.deepThink,
                  deepResearch: researchResult.data.deepResearch,
                  comparison: researchResult.comparison,
                  // 保存用データを含める（オブジェクト配列形式）
                  saveData: {
                    models: researchResult.data.models.map(m => ({ 
                      name: m.description || m.name || m.title || m  // descriptionを優先
                    })),
                    functions: functionsList.map(f => ({ name: f.name })), // オブジェクト配列として保存
                    deepThink: researchResult.data.deepThink,
                    deepResearch: researchResult.data.deepResearch,
                    timestamp: new Date().toISOString()
                  }
                };
              }
              
              return {
                success: true,
                models: researchResult.data.models,
                functions: functionsList,
                deepThink: researchResult.data.deepThink,
                deepResearch: researchResult.data.deepResearch,
                comparison: researchResult.comparison
              };
            } else {
              return { success: false, error: researchResult.error };
            }
            
          } catch (error) {
            console.error('リサーチ実行エラー:', error);
            return { success: false, error: error.message };
          }
        },
        args: [aiName, detectorName]
      });
      
      console.log(`🔍 ${aiName}のスクリプト実行結果:`);
      console.log('  レスポンス:', result);
      
      if (result && result.result) {
        const scriptResult = result.result;
        if (scriptResult.success) {
          console.log(`✅ ${aiName}リサーチが正常に完了しました`);
          console.log(`📊 検出結果: モデル${scriptResult.models.length}個, 機能${scriptResult.functions ? scriptResult.functions.length : 0}個`);
          
          // モデルの詳細表示
          if (scriptResult.models && scriptResult.models.length > 0) {
            console.log(`📦 ${aiName}モデル一覧:`);
            scriptResult.models.forEach((model, i) => {
              // モデル名から説明を分離（重複問題対応）
              let modelName = model.name;
              if (model.description && modelName.includes(model.description)) {
                modelName = modelName.replace(model.description, '').trim();
              }
              console.log(`  ${i+1}. ${modelName}${model.selected ? ' ✅(選択中)' : ''}`);
              if (model.description) {
                console.log(`     説明: ${model.description}`);
              }
            });
          }
          
          // 機能の詳細表示
          if (scriptResult.functions && scriptResult.functions.length > 0) {
            console.log(`🔧 ${aiName}機能一覧:`);
            scriptResult.functions.forEach((func, i) => {
              const status = func.enabled ? '✅(有効)' : '❌(無効)';
              console.log(`  ${i+1}. ${func.name} ${status} [${func.type}]`);
            });
          }
          
          // 選択されたモデルと有効な機能を簡潔に表示
          const selectedModel = scriptResult.models.find(m => m.selected);
          const enabledFunctions = scriptResult.functions ? scriptResult.functions.filter(f => f.enabled) : [];
          
          console.log(`✨ ${aiName}設定サマリー:`);
          if (selectedModel) {
            let modelName = selectedModel.name;
            if (selectedModel.description && modelName.includes(selectedModel.description)) {
              modelName = modelName.replace(selectedModel.description, '').trim();
            }
            console.log(`  📱 選択モデル: ${modelName}`);
          }
          if (enabledFunctions.length > 0) {
            console.log(`  🔧 有効機能: ${enabledFunctions.map(f => f.name).join(', ')}`);
          }
          if (scriptResult.deepResearch && scriptResult.deepResearch.available) {
            console.log(`  🚀 DeepResearch: ${scriptResult.deepResearch.activated ? '有効' : '利用可能'}`);
          }
          
          // 変更がある場合は表示
          if (scriptResult.comparison && scriptResult.comparison.hasChanges) {
            console.log(`  🔄 変更検出: ${scriptResult.comparison.changes.length}件`);
            scriptResult.comparison.changes.forEach((change, i) => {
              console.log(`    ${i+1}. ${change}`);
            });
            showChangeNotification(aiName, scriptResult.comparison.changes);
          }
          
          // ステータスメッセージを作成
          let statusMessage = `${aiName}: ${scriptResult.models.length}モデル`;
          
          if (scriptResult.functions) {
            statusMessage += `, ${scriptResult.functions.length}機能を検出`;
          }
          
          // 特殊モードの表示
          if (aiName === 'Claude' && scriptResult.deepResearch && scriptResult.deepResearch.available) {
            statusMessage += ' (DeepResearch対応)';
          } else if (aiName === 'Gemini') {
            const specialModes = [];
            if (scriptResult.deepThink && scriptResult.deepThink.available) {
              specialModes.push('Deep Think');
            }
            if (scriptResult.deepResearch && scriptResult.deepResearch.available) {
              specialModes.push('Deep Research');
            }
            if (specialModes.length > 0) {
              statusMessage += ` (${specialModes.join(', ')}対応)`;
            }
          } else if (aiName === 'ChatGPT') {
            const specialModes = [];
            if (scriptResult.deepResearch && scriptResult.deepResearch.available) {
              specialModes.push('Deep Research');
            }
            if (scriptResult.agentMode && scriptResult.agentMode.available) {
              specialModes.push('エージェント');
            }
            if (specialModes.length > 0) {
              statusMessage += ` (${specialModes.join(', ')}対応)`;
            }
          }
          
          updateStatus(statusMessage, "success");
          
          // saveDataを返す
          return scriptResult.saveData;
        } else {
          console.error(`❌ ${aiName}リサーチ失敗:`, scriptResult.error);
          updateStatus(`${aiName}検出エラー: ${scriptResult.error}`, "error");
          return null;
        }
      } else {
        console.error(`❌ ${aiName}スクリプト実行失敗`);
        console.error('詳細なエラー情報:', JSON.stringify(result, null, 2));
        updateStatus(`${aiName}スクリプト実行失敗`, "error");
        return null;
      }
      
      // saveDataを返す
    }
    
    // Geminiの場合もリサーチ機能を使用
    if (aiName === 'Gemini') {
      console.log(`🎯 ${aiName}リサーチ処理を開始します`);
      console.log(`🔬 ${aiName}リサーチ機能を注入・実行します`);
      
      // Geminiのリサーチ検出器ファイル
      const researchFile = 'ai-platforms/gemini/gemini-research-detector.js';
      
      // リサーチ検出器を注入
      console.log(`⚡ スクリプトファイル: ${researchFile}`);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [researchFile]
        });
        console.log(`✅ ${aiName}リサーチ検出器を注入しました`);
      } catch (injectionError) {
        console.error(`❌ ${aiName}スクリプト注入エラー:`, injectionError);
        return;
      }
      
      // 少し待ってから実行
      console.log(`⏳ スクリプト初期化を待機中...`);
      await sleep(3000);
      
      // リサーチを実行
      const detectorName = 'GeminiResearchDetector';
      console.log(`🚀 ${detectorName}を実行します`);
      
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async (aiName, detectorName) => {
          console.log(`🔬 ${aiName}リサーチ実行開始`);
          
          const detector = window[detectorName];
          if (!detector) {
            console.error(`${detectorName}が見つかりません`);
            return { success: false, error: `${detectorName}が見つかりません` };
          }
          
          try {
            // リサーチを実行
            const researchResult = await detector.executeResearch();
            
            if (researchResult.success) {
              console.log(`✅ ${aiName}リサーチ完了`);
              console.log('検出されたモデル数:', researchResult.data.models.length);
              console.log('検出されたメイン機能数:', researchResult.data.features.main.length);
              console.log('検出された追加機能数:', researchResult.data.features.additional.length);
              console.log('Deep Think利用可能:', researchResult.data.deepThink.available);
              console.log('Deep Research利用可能:', researchResult.data.deepResearch.available);
              
              // Geminiの機能をフラット化（UIが期待する形式に変換）
              const functionsList = [];
              
              // メイン機能を追加
              researchResult.data.features.main.forEach(f => {
                functionsList.push({
                  name: f.name,
                  type: f.type || 'main',
                  enabled: f.enabled,
                  connected: true,  // Geminiの機能はデフォルトで接続済み
                  icon: f.icon
                });
              });
              
              // 追加機能を追加
              researchResult.data.features.additional.forEach(f => {
                functionsList.push({
                  name: f.name,
                  type: f.type || 'additional',
                  enabled: f.enabled,
                  connected: true,  // Geminiの機能はデフォルトで接続済み
                  icon: f.icon,
                  sublabel: f.sublabel
                });
              });
              
              // Deep Thinkが利用可能な場合は機能リストに追加
              if (researchResult.data.deepThink && researchResult.data.deepThink.available) {
                functionsList.push({
                  name: 'Deep Think',
                  type: 'special',
                  enabled: researchResult.data.deepThink.activated || false,
                  connected: true,
                  special: true
                });
                console.log('✅ Deep Think機能を追加しました');
              }
              
              // Deep Researchが利用可能な場合は機能リストに追加
              if (researchResult.data.deepResearch && researchResult.data.deepResearch.available) {
                functionsList.push({
                  name: 'Deep Research',
                  type: 'special',
                  enabled: researchResult.data.deepResearch.activated || false,
                  connected: true,
                  special: true
                });
                console.log('✅ Deep Research機能を追加しました');
              }
              
              console.log('✅ Gemini機能フラット化完了:', functionsList.length, '個の機能');
              
              // 結果を返す（外側で保存処理）
              return {
                success: true,
                models: researchResult.data.models,
                functions: functionsList,  // フラット化された機能リスト
                deepThink: researchResult.data.deepThink,
                deepResearch: researchResult.data.deepResearch,
                comparison: researchResult.comparison,
                // 保存用データを含める（オブジェクト配列形式）
                saveData: {
                  models: researchResult.data.models.map(m => ({ 
                    name: m.description || m.name || m.title || m  // descriptionを優先
                  })),
                  functions: functionsList.map(f => ({ name: f.name })), // オブジェクト配列として保存
                  deepThink: researchResult.data.deepThink,
                  deepResearch: researchResult.data.deepResearch,
                  timestamp: new Date().toISOString()
                }
              };
            } else {
              return { success: false, error: researchResult.error };
            }
            
          } catch (error) {
            console.error('リサーチ実行エラー:', error);
            return { success: false, error: error.message };
          }
        },
        args: [aiName, detectorName]
      });
      
      console.log(`🔍 ${aiName}のスクリプト実行結果:`);
      console.log('  レスポンス:', result);
      
      if (result && result.result) {
        const scriptResult = result.result;
        if (scriptResult.success) {
          console.log(`✅ ${aiName}検出が正常に完了しました`);
          console.log(`📊 検出結果: モデル${scriptResult.models.length}個, 機能${scriptResult.functions.length}個`);
          
          // モデルの詳細表示
          if (scriptResult.models && scriptResult.models.length > 0) {
            console.log(`📦 ${aiName}モデル一覧:`);
            scriptResult.models.forEach((model, i) => {
              const modelName = model.title || model.name;
              console.log(`  ${i+1}. ${modelName}${model.selected ? ' ✅(選択中)' : ''}`);
              if (model.description) {
                console.log(`     説明: ${model.description}`);
              }
            });
          }
          
          // 機能の詳細表示
          if (scriptResult.functions && scriptResult.functions.length > 0) {
            console.log(`🔧 ${aiName}機能一覧:`);
            scriptResult.functions.forEach((func, i) => {
              const status = func.enabled ? '✅(有効)' : '❌(無効)';
              console.log(`  ${i+1}. ${func.name} ${status} [${func.type}]`);
            });
          }
          
          // 選択されたモデルと有効な機能を簡潔に表示
          const selectedModel = scriptResult.models.find(m => m.selected);
          const enabledFunctions = scriptResult.functions.filter(f => f.enabled);
          
          console.log(`✨ ${aiName}設定サマリー:`);
          if (selectedModel) {
            console.log(`  📱 選択モデル: ${selectedModel.title || selectedModel.name}`);
          }
          if (enabledFunctions.length > 0) {
            console.log(`  🔧 有効機能: ${enabledFunctions.map(f => f.name).join(', ')}`);
          }
          if (scriptResult.deepThink && scriptResult.deepThink.available) {
            console.log(`  🚀 Deep Think: ${scriptResult.deepThink.activated ? '✅有効' : '⚪利用可能(未有効)'}`);
          }
          if (scriptResult.deepResearch && scriptResult.deepResearch.available) {
            console.log(`  🚀 Deep Research: ${scriptResult.deepResearch.activated ? '✅有効' : '⚪利用可能(未有効)'}`);
          }
          
          // 変更がある場合は表示
          if (scriptResult.comparison && scriptResult.comparison.hasChanges) {
            console.log(`  🔄 変更検出: ${scriptResult.comparison.changes.length}件`);
            scriptResult.comparison.changes.forEach((change, i) => {
              console.log(`    ${i+1}. ${change}`);
            });
          }
          
          // saveDataを返す
          return scriptResult.saveData;
        } else {
          console.error(`❌ ${aiName}検出エラー:`, scriptResult.error);
          return null;
        }
      } else {
        console.error(`❌ ${aiName}スクリプト実行失敗`);
        console.error('詳細なエラー情報:', JSON.stringify(result, null, 2));
        updateStatus(`${aiName}スクリプト実行失敗`, "error");
        return null;
      }
      
      // saveDataを返す
    }
    
    // ChatGPT用の新しいリサーチ機能
    if (aiName === 'ChatGPT') {
      console.log(`🎯 ${aiName}リサーチ処理を開始します`);
      console.log(`🔬 ${aiName}リサーチ機能を注入・実行します`);
      
      // ChatGPTのリサーチ検出器ファイル
      const researchFile = 'ai-platforms/chatgpt/chatgpt-research-detector.js';
      
      // リサーチ検出器を注入
      console.log(`⚡ スクリプトファイル: ${researchFile}`);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: [researchFile]
        });
        console.log(`✅ ${aiName}リサーチ検出器を注入しました`);
      } catch (injectionError) {
        console.error(`❌ ${aiName}スクリプト注入エラー:`, injectionError);
        return;
      }
      
      // 少し待ってから実行
      console.log(`⏳ スクリプト初期化を待機中...`);
      await sleep(3000);
      
      // リサーチを実行
      const detectorName = 'ChatGPTResearchDetector';
      console.log(`🚀 ${detectorName}を実行します`);
      
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async (aiName, detectorName) => {
          console.log(`🔬 ${aiName}リサーチ実行開始`);
          
          const detector = window[detectorName];
          if (!detector) {
            console.error(`${detectorName}が見つかりません`);
            return { success: false, error: `${detectorName}が見つかりません` };
          }
          
          try {
            // リサーチを実行
            const researchResult = await detector.executeResearch();
            
            if (researchResult.success) {
              console.log(`✅ ${aiName}リサーチ完了`);
              console.log('検出されたモデル数:', researchResult.data.models.length);
              console.log('検出された機能数:', researchResult.data.features.length);
              console.log('Deep Research利用可能:', researchResult.data.deepResearch.available);
              console.log('エージェントモード利用可能:', researchResult.data.agentMode.available);
              
              // ChatGPTの機能をUIが期待する形式に変換
              const functionsList = researchResult.data.features.map(f => ({
                name: f.name || f,  // オブジェクトの場合はf.name、文字列の場合はfをそのまま使用
                type: f.type || 'function',
                enabled: f.enabled !== undefined ? f.enabled : true,
                connected: f.connected !== undefined ? f.connected : true
              }));
              
              // Deep Researchが利用可能な場合は機能リストに追加
              if (researchResult.data.deepResearch && researchResult.data.deepResearch.available) {
                functionsList.push({
                  name: 'Deep Research',
                  type: 'special',
                  enabled: researchResult.data.deepResearch.activated || false,
                  connected: true,
                  special: true
                });
                console.log('✅ Deep Research機能を追加しました');
              }
              
              // エージェントモードが利用可能な場合は機能リストに追加
              if (researchResult.data.agentMode && researchResult.data.agentMode.available) {
                functionsList.push({
                  name: 'エージェントモード',
                  type: 'special',
                  enabled: researchResult.data.agentMode.activated || false,
                  connected: true,
                  special: true
                });
                console.log('✅ エージェントモード機能を追加しました');
              }
              
              console.log('✅ ChatGPT機能フラット化完了:', functionsList.length, '個の機能');
              
              // 結果を返す（外側で保存処理）
              return {
                success: true,
                models: researchResult.data.models,
                functions: functionsList,  // フラット化された機能リスト
                deepResearch: researchResult.data.deepResearch,
                agentMode: researchResult.data.agentMode,
                comparison: researchResult.comparison,
                // 保存用データを含める（オブジェクト配列形式）
                saveData: {
                  models: researchResult.data.models.map(m => ({ 
                    name: typeof m === 'string' ? m : m.name || m 
                  })), // すでにオブジェクトの場合はnameプロパティを使用
                  functions: functionsList.map(f => ({ name: f.name })), // オブジェクト配列として保存
                  deepResearch: researchResult.data.deepResearch,
                  agentMode: researchResult.data.agentMode,
                  timestamp: new Date().toISOString()
                }
              };
            } else {
              return { success: false, error: researchResult.error };
            }
            
          } catch (error) {
            console.error('リサーチ実行エラー:', error);
            return { success: false, error: error.message };
          }
        },
        args: [aiName, detectorName]
      });
      
      console.log(`🔍 ${aiName}のスクリプト実行結果:`);
      console.log('  レスポンス:', result);
      
      if (result && result.result) {
        const scriptResult = result.result;
        if (scriptResult.success) {
          console.log(`✅ ${aiName}検出が正常に完了しました`);
          console.log(`📊 検出結果: モデル${scriptResult.models.length}個, 機能${scriptResult.functions.length}個`);
          
          // モデルの詳細表示
          if (scriptResult.models && scriptResult.models.length > 0) {
            console.log(`📦 ${aiName}モデル一覧:`);
            scriptResult.models.forEach((model, i) => {
              const modelName = model.title || model.name;
              console.log(`  ${i+1}. ${modelName}${model.selected ? ' ✅(選択中)' : ''}`);
              if (model.description) {
                console.log(`     説明: ${model.description}`);
              }
            });
          }
          
          // 機能の詳細表示
          if (scriptResult.functions && scriptResult.functions.length > 0) {
            console.log(`🔧 ${aiName}機能一覧:`);
            scriptResult.functions.forEach((func, i) => {
              const status = func.enabled ? '✅(有効)' : '❌(無効)';
              console.log(`  ${i+1}. ${func.name} ${status} [${func.type}]`);
            });
          }
          
          // 選択されたモデルと有効な機能を簡潔に表示
          const selectedModel = scriptResult.models.find(m => m.selected);
          const enabledFunctions = scriptResult.functions.filter(f => f.enabled);
          
          console.log(`✨ ${aiName}設定サマリー:`);
          if (selectedModel) {
            console.log(`  📱 選択モデル: ${selectedModel.title || selectedModel.name}`);
          }
          if (enabledFunctions.length > 0) {
            console.log(`  🔧 有効機能: ${enabledFunctions.map(f => f.name).join(', ')}`);
          }
          if (scriptResult.deepThink && scriptResult.deepThink.available) {
            console.log(`  🚀 Deep Think: ${scriptResult.deepThink.activated ? '✅有効' : '⚪利用可能(未有効)'}`);
          }
          if (scriptResult.deepResearch && scriptResult.deepResearch.available) {
            console.log(`  🚀 Deep Research: ${scriptResult.deepResearch.activated ? '✅有効' : '⚪利用可能(未有効)'}`);
          }
          
          // 変更がある場合は表示
          if (scriptResult.comparison && scriptResult.comparison.hasChanges) {
            console.log(`  🔄 変更検出: ${scriptResult.comparison.changes.length}件`);
            scriptResult.comparison.changes.forEach((change, i) => {
              console.log(`    ${i+1}. ${change}`);
            });
          }
          
          // saveDataを返す
          return scriptResult.saveData;
        } else {
          console.error(`❌ ${aiName}検出エラー:`, scriptResult.error);
          return null;
        }
      } else {
        console.error(`❌ ${aiName}スクリプト実行失敗`);
        console.error('詳細なエラー情報:', JSON.stringify(result, null, 2));
        updateStatus(`${aiName}スクリプト実行失敗`, "error");
        return null;
      }
      
      // saveDataを返す
    }
    
    // 全てのAIが新しいリサーチ検出器システムに移行済み
    console.error(`⚠️ ${aiName}は新しいリサーチ検出器システムに移行されました`);
    return;
  } catch (error) {
    console.error(`${aiName}スクリプト注入エラー:`, error);
  }
}

// AI検出ウィンドウを閉じる関数
async function closeAIDetectionWindows() {
  console.log(`🚪 ${aiDetectionWindows.length}個のAI検出ウィンドウを閉じます`);
  
  const closePromises = aiDetectionWindows.map(async (windowInfo) => {
    try {
      await new Promise((resolve) => {
        chrome.windows.remove(windowInfo.windowId, () => {
          console.log(`✅ ${windowInfo.aiType}ウィンドウを閉じました`);
          resolve();
        });
      });
    } catch (error) {
      console.error(`❌ ${windowInfo.aiType}ウィンドウの閉鎖エラー:`, error);
    }
  });
  
  await Promise.allSettled(closePromises);
  aiDetectionWindows = []; // リストをクリア
  console.log('✅ すべてのAI検出ウィンドウを閉じました');
}

// 変更通知を表示する関数
function showChangeNotification(aiName, changes) {
  if (!changes || changes.length === 0) return;
  
  let message = `以下のモデルと機能が変更された可能性があります。修正してください。\n\n修正内容：\n`;
  
  changes.forEach((change, index) => {
    message += `${index + 1}. ${change.type}: ${change.item}\n`;
    if (change.details) {
      message += `   詳細: ${change.details}\n`;
    }
    if (change.old && change.new) {
      message += `   変更: ${change.old} → ${change.new}\n`;
    }
    message += '\n';
  });
  
  // ポップアップで通知
  setTimeout(() => {
    alert(message);
  }, 1000); // 1秒後に表示（ログ出力の後）
}

// ===== AI検出システム実装 =====

// AI検出システムの実行（テストコントローラーを使用）
async function runAIDetectionSystem(updateStatus, injectAutomationScripts) {
  console.log('🔍 [DEBUG] runAIDetectionSystem関数開始 - テストコントローラーを使用');
  updateStatus('テストコントローラーを読み込み中...', 'loading');

  try {
    // Step 1: 動的インポート実行前
    console.log('🔴 [DEBUG] Step 1: 動的インポート開始 - ./controllers/index.js');
    const controllerManager = await import('./controllers/index.js');
    console.log('🟢 [DEBUG] Step 1 完了: コントローラーマネージャー読み込み成功:', controllerManager);

    // Step 2: loadController関数確認
    const { loadController } = controllerManager;
    if (!loadController) {
      throw new Error('loadController関数が見つかりません');
    }
    console.log('🟢 [DEBUG] Step 2 完了: loadController関数取得成功');

    // Step 3: aiDetectionコントローラーロード
    console.log('🔴 [DEBUG] Step 3: aiDetectionコントローラーロード開始');
    const testModule = await loadController('aiDetection');
    console.log('🟢 [DEBUG] Step 3 完了: aiDetectionコントローラーロード成功:', testModule);

    // Step 4: runAIDetectionSystem関数確認
    if (!testModule.runAIDetectionSystem) {
      throw new Error('runAIDetectionSystem関数がテストモジュールに見つかりません');
    }
    console.log('🟢 [DEBUG] Step 4 完了: runAIDetectionSystem関数確認成功');

    // Step 5: AI検出システム実行
    console.log('🔴 [DEBUG] Step 5: テストモジュールのrunAIDetectionSystem実行開始');
    updateStatus('AI検出システムを実行中...', 'loading');
    await testModule.runAIDetectionSystem();
    console.log('🟢 [DEBUG] Step 5 完了: AI検出システム実行成功');

  } catch (error) {
    console.error('❌ [DEBUG] テストコントローラーエラー:', error);
    console.error('❌ [DEBUG] エラーメッセージ:', error.message);
    console.error('❌ [DEBUG] エラースタック:', error.stack);
    updateStatus(`テストコントローラーエラー: ${error.message}`, 'error');
    throw error;
  }
}

// 本番自動化コードを使用したAI検出関数（エクスポート）
export function detectAIModelsAndFeaturesProduction(aiType) {
  // スクリプト注入実行時に初期化される結果オブジェクト
  const results = {
    models: [],
    functions: []
  };

  // 本番のコードで使用されているセレクタを定義
  const PRODUCTION_SELECTORS = {
    chatgpt: {
      modelButton: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-label*="モデル セレクター"]',
        'button[aria-label*="モデル"][aria-haspopup="menu"]'
      ],
      modelMenu: [
        '[role="menu"][data-radix-menu-content]',
        '[role="menu"][data-state="open"]',
        'div.z-50.max-w-xs.rounded-2xl.popover[role="menu"]'
      ],
      menuButton: [
        '[data-testid="composer-plus-btn"]',
        'button[aria-haspopup="menu"]'
      ],
      features: {
        canvas: ['canvas', 'Canvas'],
        codeInterpreter: ['Code Interpreter', 'コード インタープリター'],
        browsing: ['Web Search', 'ウェブ検索'],
        dalle: ['DALL·E', 'DALL-E', '画像生成'],
        memory: ['Memory', 'メモリー'],
        deepResearch: ['Deep Research', '深い研究']
      }
    },
    claude: {
      modelButton: [
        'button[data-testid*="model-selector"]',
        'button[aria-label*="モデル"]',
        'div.font-medium button'
      ],
      modelMenu: [
        '[role="menu"][data-state="open"]',
        'div[data-radix-menu-content]'
      ],
      features: {
        projects: ['Projects', 'プロジェクト'],
        artifacts: ['Artifacts', 'アーティファクト'],
        vision: ['Vision', '画像認識'],
        codeAnalysis: ['Code Analysis', 'コード解析'],
        deepResearch: ['Deep Research', '深い研究']
      }
    },
    gemini: {
      modelButton: [
        '.gds-mode-switch-button.logo-pill-btn',
        'button[class*="logo-pill-btn"]',
        'button.gds-mode-switch-button'
      ],
      modelMenu: [
        '.cdk-overlay-pane .menu-inner-container',
        '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]'
      ],
      features: {
        imageGeneration: ['Image Generation', '画像生成'],
        codeExecution: ['Code Execution', 'コード実行'],
        googleSearch: ['Google Search', 'Google検索'],
        youtube: ['YouTube'],
        maps: ['Google Maps', 'Maps'],
        deepThink: ['Deep Think', '深思考'],
        deepResearch: ['Deep Research', '深い研究']
      }
    }
  };

  // ユーティリティ関数
  function findElement(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch (e) {
        console.debug(`Selector failed: ${selector}`);
      }
    }
    return null;
  }

  function getCleanText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    const decorativeElements = clone.querySelectorAll('mat-icon, mat-ripple, svg, .icon, .ripple');
    decorativeElements.forEach(el => el.remove());
    return clone.textContent?.trim() || '';
  }

  console.log(`🔍 ${aiType} 検出開始 - 本番コード使用`);

  const aiSelectors = PRODUCTION_SELECTORS[aiType];
  if (!aiSelectors) {
    console.error(`未対応のAIタイプ: ${aiType}`);
    return results;
  }

  try {
    // モデル検出 - 本番のメニューシステムを使用
    console.log(`🔍 ${aiType} モデルボタンを検索...`);
    const modelButton = findElement(aiSelectors.modelButton);
    if (modelButton) {
      const buttonText = getCleanText(modelButton);
      if (buttonText) {
        console.log(`✅ 現在のモデル: ${buttonText}`);
        results.models.push(buttonText);
      }

      // モデルメニューを開いて全モデルを取得
      try {
        if (aiType === 'chatgpt') {
          // ChatGPT用Reactイベントトリガー
          const events = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'];
          events.forEach(eventType => {
            modelButton.dispatchEvent(new PointerEvent(eventType, {
              bubbles: true,
              cancelable: true,
              pointerId: 1
            }));
          });
        } else {
          modelButton.click();
        }

        // メニュー表示待機（同期処理）
        let menu = null;
        for (let i = 0; i < 10; i++) {
          setTimeout(() => {}, 200); // 200ms待機
          menu = findElement(aiSelectors.modelMenu);
          if (menu) break;
        }

        if (menu) {
          const menuItems = menu.querySelectorAll('[role="menuitem"], button, .menu-item');
          console.log(`📝 ${aiType} メニュー項目: ${menuItems.length}個`);

          menuItems.forEach(item => {
            const text = getCleanText(item);
            if (text && !results.models.includes(text)) {
              // モデル名らしいテキストのみ追加
              if (text.match(/(GPT|Claude|Gemini|o1|Sonnet|Haiku|Opus|Flash|Pro|Ultra)/i)) {
                results.models.push(text);
                console.log(`✅ モデル登録: ${text}`);
              }
            }
          });

          // メニューを閉じる
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }
      } catch (e) {
        console.debug('メニュー操作エラー:', e);
      }
    }

    // 機能検出 - 本番の機能リストを使用
    console.log(`🔍 ${aiType} 機能を検索...`);
    const features = aiSelectors.features;
    if (features) {
      Object.keys(features).forEach(featureKey => {
        const featureNames = features[featureKey];
        for (const featureName of featureNames) {
          // ページ内で機能名を検索
          const found = Array.from(document.querySelectorAll('*')).some(el => {
            const text = el.textContent;
            return text && text.includes(featureName);
          });

          if (found && !results.functions.includes(featureName)) {
            results.functions.push(featureName);
            console.log(`✅ 機能登録: ${featureName}`);
          }
        }
      });
    }

    console.log(`✅ ${aiType} 検出完了:`, results);

  } catch (error) {
    console.error(`❌ ${aiType} 検出エラー:`, error);
  }

  // メッセージリスナーを設定
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_AI_DETECTION_RESULTS') {
      sendResponse(results);
    }
  });

  return results;
}

// 6列統合表を更新する関数
function updateIntegratedTable(config) {
  console.log('📊 AI統合モデル・機能一覧を表示します:', config);

  const tbody = document.getElementById('ai-integrated-tbody');
  if (!tbody) return;

  // 各列のデータを準備
  const columns = [
    { key: 'chatgpt', dataKey: 'models', name: 'ChatGPTモデル' },
    { key: 'claude', dataKey: 'models', name: 'Claudeモデル' },
    { key: 'gemini', dataKey: 'models', name: 'Geminiモデル' },
    { key: 'chatgpt', dataKey: 'functions', name: 'ChatGPT機能' },
    { key: 'claude', dataKey: 'functions', name: 'Claude機能' },
    { key: 'gemini', dataKey: 'functions', name: 'Gemini機能' }
  ];

  // 各列のデータを取得
  const columnData = columns.map(col => {
    const aiConfig = config[col.key];
    const items = aiConfig && aiConfig[col.dataKey] ? aiConfig[col.dataKey] : [];

    return items.map(item => {
      let itemName = '';

      // 文字列またはオブジェクトの処理
      if (typeof item === 'string') {
        itemName = item;
      } else if (typeof item === 'object' && item !== null) {
        itemName = item.name || item.text || item.label || item.value || item.title || 'Unknown';
      } else {
        itemName = String(item);
      }

      // Claudeのモデル名から説明文を除去
      if (col.key === 'claude' && col.dataKey === 'models' && itemName && typeof itemName === 'string') {
        const descriptionPatterns = [
          '情報を', '高性能', 'スマート', '最適な', '高速な', '軽量な', '大規模', '小規模',
          '複雑な', '日常利用', '課題に対応', '効率的', 'に対応できる', 'なモデル'
        ];

        for (const pattern of descriptionPatterns) {
          const patternIndex = itemName.indexOf(pattern);
          if (patternIndex > 0) {
            itemName = itemName.substring(0, patternIndex).trim();
            break;
          }
        }
      }

      return itemName;
    });
  });

  // 最大行数を計算
  const maxRows = Math.max(...columnData.map(col => col.length), 1);

  // テーブルボディをクリア
  tbody.innerHTML = '';

  // 各行を作成
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const row = document.createElement('tr');

    // 各列のセルを作成
    for (let colIndex = 0; colIndex < 6; colIndex++) {
      const cell = document.createElement('td');
      cell.style.cssText = 'border: 1px solid #dee2e6; padding: 8px; vertical-align: top; font-size: 13px;';

      const item = columnData[colIndex][rowIndex];
      if (item) {
        // データがある場合
        cell.innerHTML = `<div style="color: #495057;">${item}</div>`;
      } else {
        // データがない場合（空セル）
        cell.innerHTML = '<div style="color: #dee2e6; text-align: center;">-</div>';
      }

      row.appendChild(cell);
    }

    tbody.appendChild(row);
  }

  // データがない場合の表示
  if (maxRows === 0 || (maxRows === 1 && columnData.every(col => col.length === 0))) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="border: 1px solid #dee2e6; padding: 20px; text-align: center; color: #999;">
          データがありません。上記の「モデル・機能変更検出システム」ボタンをクリックしてデータを取得してください。
        </td>
      </tr>
    `;
  }
}

// ストレージからデータを読み込んで表を更新
function loadAndDisplayIntegratedTable() {
  chrome.storage.local.get(['ai_config_persistence'], (result) => {
    const config = result.ai_config_persistence || {
      chatgpt: { models: [], functions: [] },
      claude: { models: [], functions: [] },
      gemini: { models: [], functions: [] }
    };
    updateIntegratedTable(config);
  });
}

// ===== イベントリスナー: AI変更検出システム =====
aiDetectionSystemBtn.addEventListener("click", async () => {
  console.log('🔴 [DEBUG] AI検出システムボタンがクリックされました');
  console.log('🔴 [DEBUG] runAIDetectionSystem関数を呼び出します');

  try {
    await runAIDetectionSystem(updateStatus, injectAutomationScripts);
    console.log('🟢 [DEBUG] AI検出システム正常完了');
  } catch (error) {
    console.error('❌ [DEBUG] AI検出制御エラー:', error);
    console.error('❌ [DEBUG] エラー詳細:', error.stack);
    updateStatus('AI検出制御エラー', 'error');
  }
});


// ===== イベントリスナー: AIセレクタ変更検出システム =====
// test-ai-selector-mutation-observer.jsから復元したtoggleMutationObserverMonitoringを使用

aiSelectorMutationSystemBtn.addEventListener("click", async () => {
  console.log('🔍 AIセレクタ変更検出システム開始', 'step');

  try {
    // 復元した元の実装を使用
    await toggleMutationObserverMonitoring(aiSelectorMutationSystemBtn, updateStatus);
  } catch (error) {
    console.error('❌ AIセレクタ変更検出システムエラー:', error);
    updateStatus(`AIセレクタ変更検出システムエラー: ${error.message}`, 'error');
    aiSelectorMutationSystemBtn.textContent = '👁️ AIセレクタ変更検出システム';
    aiSelectorMutationSystemBtn.style.backgroundColor = '';
  }
});


// 古い検証関数は削除済み（ai-selector-validation.jsに移行）
// async function validateAllSelectorsForAI(windowInfo) { ... } - 削除済み

// 古い実装は削除済み（ai-selector-validation.jsモジュールに移行）

// ストレージの変更を監視（AI変更検出システムが実行されたときに更新）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.ai_config_persistence) {
    console.log('📊 AI設定が更新されました。統合表を更新します。');
    const newConfig = changes.ai_config_persistence.newValue || {};
    updateIntegratedTable(newConfig);
  }
});

// AIサイトタブでMutationObserver開始
async function startMutationObserverOnTab(tabId) {
  try {
    console.log(`🚀 TabID ${tabId} にMutationObserver開始メッセージ送信`);
    
    // WindowServiceを使用してタブにメッセージを送信（タブ操作を統一）
    const response = await WindowService.sendMessageToTab(tabId, {
      type: 'START_MUTATION_OBSERVER',
      timestamp: Date.now()
    });
    
    if (response && response.success) {
      console.log(`✅ TabID ${tabId} でMutationObserver開始成功`);
      return true;
    } else {
      console.error(`❌ TabID ${tabId} でMutationObserver開始失敗:`, response);
      return false;
    }
  } catch (error) {
    console.error(`❌ TabID ${tabId} メッセージ送信エラー:`, error);
    return false;
  }
}

// AIサイトタブからMutationObserver結果取得
async function getMutationObserverResultFromTab(tabId) {
  try {
    // WindowServiceを使用してタブにメッセージを送信（タブ操作を統一）
    const response = await WindowService.sendMessageToTab(tabId, {
      type: 'GET_MUTATION_OBSERVER_RESULT',
      timestamp: Date.now()
    });
    
    if (response && response.success && response.report) {
      return response.report;
    }
    return null;
  } catch (error) {
    // エラーは通常のフロー（まだ完了していない）なので詳細ログは不要
    return null;
  }
}

// AIサイトタブでMutationObserver停止
async function stopMutationObserverOnTab(tabId) {
  try {
    console.log(`🛑 TabID ${tabId} にMutationObserver停止メッセージ送信`);
    
    // WindowServiceを使用してタブにメッセージを送信（タブ操作を統一）
    const response = await WindowService.sendMessageToTab(tabId, {
      type: 'STOP_MUTATION_OBSERVER',
      timestamp: Date.now()
    });
    
    if (response && response.success) {
      console.log(`✅ TabID ${tabId} でMutationObserver停止成功`);
      return true;
    } else {
      console.error(`❌ TabID ${tabId} でMutationObserver停止失敗:`, response);
      return false;
    }
  } catch (error) {
    console.error(`❌ TabID ${tabId} 停止メッセージ送信エラー:`, error);
    return false;
  }
}

// MutationObserver結果表示
function showMutationObserverResults(report) {
  const resultHtml = `
    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px; max-width: 600px;">
      <h3 style="color: #2c3e50; margin-bottom: 15px;">🔍 AI監視システム結果レポート</h3>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
        <h4 style="color: #495057; margin: 0 0 10px 0;">基本情報</h4>
        <p><strong>AI:</strong> ${report.aiType}</p>
        <p><strong>総実行時間:</strong> ${report.monitoringDuration}ms</p>
        <p><strong>応答文字数:</strong> ${report.responseLength}文字</p>
      </div>
      
      <div style="background: #e8f4fd; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
        <h4 style="color: #495057; margin: 0 0 10px 0;">⏱️ 実行時間内訳</h4>
        <p><strong>入力→送信:</strong> ${report.inputToSendTime}ms</p>
        <p><strong>送信→応答開始:</strong> ${report.sendToResponseTime}ms</p>
        <p><strong>応答生成:</strong> ${report.responseGenerationTime}ms</p>
        <p><strong>全体フロー:</strong> ${report.totalFlowTime}ms</p>
      </div>
      
      <div style="background: #f0f8e8; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
        <h4 style="color: #495057; margin: 0 0 10px 0;">📝 入力内容</h4>
        <p style="font-family: monospace; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">${report.inputContent}</p>
      </div>
      
      <div style="background: #fff8e1; padding: 15px; border-radius: 6px;">
        <h4 style="color: #495057; margin: 0 0 10px 0;">🤖 AI応答プレビュー</h4>
        <p style="font-family: monospace; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd; max-height: 150px; overflow-y: auto;">${report.responsePreview}</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px;">
        <button onclick="this.parentElement.parentElement.remove()" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">閉じる</button>
      </div>
    </div>
  `;
  
  // 結果表示エリアに追加
  const resultContainer = document.createElement('div');
  resultContainer.innerHTML = resultHtml;
  resultContainer.style.position = 'fixed';
  resultContainer.style.top = '20px';
  resultContainer.style.right = '20px';
  resultContainer.style.zIndex = '9999';
  resultContainer.style.maxHeight = '80vh';
  resultContainer.style.overflowY = 'auto';
  
  document.body.appendChild(resultContainer);
}

// 4分割ウィンドウレイアウトを作成（MutationObserver用）
async function create4PaneLayoutForMutationObserver() {
  console.log("🖼️ MutationObserver用4分割ウィンドウレイアウト作成開始");
  
  // test-runner-chrome.jsのcreateAIWindow関数を使用
  if (!window.TestRunner || !window.TestRunner.createAIWindow) {
    // test-runner-chrome.jsを動的読み込み
    const script = document.createElement('script');
    // 削除済み: script.src = chrome.runtime.getURL('automations/test-runner-chrome.js');
    console.warn('⚠️ test-runner-chrome.jsは削除されました');
    return; // スクリプトが存在しないため処理を中止
    
    await new Promise((resolve, reject) => {
      script.onload = () => {
        console.log("✅ test-runner-chrome.js読み込み完了");
        resolve();
      };
      script.onerror = (error) => {
        console.error("❌ test-runner-chrome.js読み込み失敗:", error);
        reject(error);
      };
      document.head.appendChild(script);
    });
    
    // スクリプト初期化を少し待つ
    await sleep(500);
  }
  
  if (!window.TestRunner || !window.TestRunner.createAIWindow) {
    throw new Error("TestRunner.createAIWindowが利用できません");
  }
  
  // AIサイト定義（test-runner-chrome.jsと同じ4分割配置）
  const aiSites = [
    { name: 'ChatGPT', position: 0 },  // 左上
    { name: 'Claude', position: 1 },   // 右上  
    { name: 'Gemini', position: 2 }    // 左下
  ];
  
  const createdTabs = [];
  
  for (const site of aiSites) {
    try {
      console.log(`🌐 ${site.name}ウィンドウを作成中... (位置: ${site.position})`);
      
      // TestRunner.createAIWindowを使用してウィンドウを作成
      const tab = await window.TestRunner.createAIWindow(site.name.toLowerCase(), site.position);
      
      if (tab && tab.id) {
        createdTabs.push({
          id: tab.id,
          name: site.name,
          position: site.position
        });
        console.log(`✅ ${site.name}ウィンドウ作成成功 (TabID: ${tab.id})`);
      } else {
        console.error(`❌ ${site.name}ウィンドウ作成失敗`);
      }
      
      // 各ウィンドウ作成間で少し待機
      await sleep(1000);
      
    } catch (error) {
      console.error(`❌ ${site.name}ウィンドウ作成エラー:`, error);
    }
  }
  
  console.log(`🎯 4分割レイアウト作成完了: ${createdTabs.length}個のウィンドウ`);
  return createdTabs;
}

// AIサイトをチェックして必要に応じて開く（WindowService統合版）
async function checkAndOpenAISites() {
  try {
    console.log("🌐 AIサイト統合チェック開始...");
    updateStatus("AIサイト（ChatGPT、Claude、Gemini）をチェック中...", "loading");

    // WindowServiceの動的インポート
    const { default: WindowService } = await import('../services/window-service.js');

    // WindowService統合機能を使用
    const result = await WindowService.openAllAISites();

    if (result.success) {
      if (result.created > 0) {
        const message = `✅ AIサイトオープン完了: ${result.created}個作成, ${result.existing}個既存`;
        console.log(message);
        updateStatus(message, "success");
        return { opened: true, tabs: result.windows };
      } else {
        const message = `✅ AIサイトチェック完了: ${result.existing}個が既に開かれています`;
        console.log(message);
        updateStatus(message, "success");
        return { opened: false, tabs: [] };
      }
    } else {
      console.error("❌ AIサイトオープンエラー:", result.error);
      updateStatus("❌ AIサイトオープンでエラーが発生しました", "error");
      return { opened: false, tabs: [] };
    }

  } catch (error) {
    console.error("❌ AIサイトチェック例外:", error);
    updateStatus("❌ AIサイトチェックでエラーが発生しました", "error");
    return { opened: false, tabs: [] };
  }
}

// Integrated test button listener removed

// Report generation test button removed

// Window creation test button removed

// Spreadsheet test button removed

// ===== セレクタ情報動的取得関数 =====
/**
 * 指定されたAIのセレクタ情報を取得して表示
 * @param {string} aiType - AI名 (chatgpt, claude, gemini)
 */
async function fetchAndDisplaySelectorInfo(aiType) {
  const targetPanel = document.getElementById(`${aiType}-selectors`);
  if (!targetPanel) return;

  try {
    // ローディング表示
    targetPanel.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 24px;">🔄</div>
        <div style="margin-top: 10px; color: #666;">${aiType.toUpperCase()}のセレクタ情報を取得中...</div>
      </div>
    `;

    // まずChrome Storageからセレクタデータを確認
    const result = await chrome.storage.local.get(['ai_selector_data']);
    
    // aiTypeは'chatgpt', 'claude', 'gemini'の小文字で渡される
    const storedData = result.ai_selector_data?.[aiType];
    
    // セレクタデータを取得（selectorDataプロパティの中にある場合とない場合の両方に対応）
    const storedSelectors = storedData?.selectorData || storedData;
    
    // ストレージにデータがある場合は優先的に表示
    if (storedSelectors && (storedSelectors.input || storedSelectors.send || storedSelectors.response || storedSelectors.stop)) {
      
      const aiNameMap = {
        'chatgpt': 'ChatGPT',
        'claude': 'Claude', 
        'gemini': 'Gemini'
      };
      const properAIName = aiNameMap[aiType.toLowerCase()] || aiType;
      
      let html = `<h3>${properAIName} セレクタ情報</h3><div class="selector-types">`;
      
      // 保存されたセレクタを表示
      const selectorTypes = [
        { key: 'input', label: '📝 INPUT (入力欄)' },
        { key: 'send', label: '📤 SEND_BUTTON (送信ボタン)' },
        { key: 'response', label: '📄 RESPONSE (応答)' },
        { key: 'stop', label: '⏸️ STOP_BUTTON (停止ボタン)' },
        { key: 'deepresearch', label: '🔬 DEEP_RESEARCH' }
      ];
      
      console.log(`🔍 ${aiType} 表示対象セレクタタイプ:`, selectorTypes.map(t => t.key));
      
      for (const type of selectorTypes) {
        const value = storedSelectors[type.key];
        console.log(`🔍 ${aiType} ${type.key}の値:`, value);
        
        html += `
          <div class="selector-type">
            <h4>${type.label}</h4>
            <div class="selector-list">
        `;
        
        if (value) {
          // valueがオブジェクトの場合と文字列の場合を処理
          let selectorText = '';
          let priorityInfo = '';
          
          if (typeof value === 'object' && value !== null) {
            // オブジェクトの場合（新しい形式）
            selectorText = value.fullSelector || value.selector || JSON.stringify(value);
            if (value.priority) {
              priorityInfo = `<span style="color: #666; font-size: 11px; margin-left: 8px;">優先度: ${value.priority}</span>`;
            }
            if (value.tagName) {
              priorityInfo += `<span style="color: #666; font-size: 11px; margin-left: 8px;">タグ: &lt;${value.tagName}&gt;</span>`;
            }
            if (typeof value.visible === 'boolean') {
              const visibilityIcon = value.visible ? '👁️' : '🙈';
              const visibilityText = value.visible ? '可視' : '非表示';
              priorityInfo += `<span style="color: ${value.visible ? '#28a745' : '#dc3545'}; font-size: 11px; margin-left: 8px;">${visibilityIcon} ${visibilityText}</span>`;
            }
          } else {
            // 文字列の場合（旧形式）
            selectorText = value;
          }
          
          html += `
            <div style="margin: 5px 0;">
              <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 12px; display: inline-block; max-width: 100%; overflow-x: auto;">
                ${escapeHtml(selectorText)}
              </code>
              ${priorityInfo}
            </div>
          `;
        } else {
          html += `<div style="color: #999; font-size: 14px;">未検出</div>`;
        }
        
        html += `
            </div>
          </div>
        `;
      }
      
      html += `</div>`;
      
      // 最終更新時刻を表示
      if (storedSelectors.lastUpdated) {
        const updateTime = new Date(storedSelectors.lastUpdated).toLocaleString('ja-JP');
        html += `
          <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 8px; font-size: 12px; color: #666;">
            最終更新: ${updateTime}
          </div>
        `;
      }
      
      targetPanel.innerHTML = html;
      return;
    }

    // ストレージにデータがない場合はAIHandlerを確認（フォールバック）
    if (!window.AIHandler || !window.AIHandler.getSelectors) {
      targetPanel.innerHTML = `
        <div style="color: #999; padding: 20px; text-align: center;">
          <div style="font-size: 18px; margin-bottom: 10px;">📊 セレクタ情報未取得</div>
          <div>「2. AIセレクタ変更検出システム」を実行してセレクタを取得してください。</div>
        </div>
      `;
      return;
    }

    // セレクタカテゴリの定義
    const selectorCategories = [
      { key: 'INPUT', label: '📝 INPUT (入力欄)', icon: '📝' },
      { key: 'SEND_BUTTON', label: '📤 SEND_BUTTON (送信ボタン)', icon: '📤' },
      { key: 'STOP_BUTTON', label: '⏸️ STOP_BUTTON (停止ボタン)', icon: '⏸️' },
      { key: 'RESPONSE', label: '📄 RESPONSE (応答)', icon: '📄' },
      { key: 'MODEL_BUTTON', label: '🎯 MODEL_BUTTON (モデル選択)', icon: '🎯' },
      { key: 'MENU_ITEM', label: '📋 MENU_ITEM (メニュー項目)', icon: '📋' },
      { key: 'DEEP_RESEARCH', label: '🔬 DEEP_RESEARCH (DeepResearch)', icon: '🔬' },
      { key: 'CANVAS', label: '🎨 CANVAS (アーティファクト)', icon: '🎨' },
      { key: 'THINKING_PROCESS', label: '🤔 THINKING_PROCESS (思考プロセス)', icon: '🤔' }
    ];

    // 正しいAI名に変換（ChatGPT, Claude, Gemini）
    const aiNameMap = {
      'chatgpt': 'ChatGPT',
      'claude': 'Claude', 
      'gemini': 'Gemini'
    };
    const properAIName = aiNameMap[aiType.toLowerCase()] || aiType;

    // 各カテゴリのセレクタを取得
    let html = `<h3>${properAIName} セレクタ情報</h3><div class="selector-types">`;
    let totalSelectors = 0;
    let hasSelectors = false;

    for (const category of selectorCategories) {
      try {
        const selectors = await window.AIHandler.getSelectors(properAIName, category.key);
        
        if (selectors && selectors.length > 0) {
          hasSelectors = true;
          totalSelectors += selectors.length;
          
          html += `
            <div class="selector-type">
              <h4>${category.label}</h4>
              <div class="selector-list">
          `;
          
          // 各セレクタを表示（最大5個まで表示、それ以上は省略）
          const displayCount = Math.min(selectors.length, 5);
          for (let i = 0; i < displayCount; i++) {
            const selector = selectors[i];
            // セレクタをコード形式で表示
            html += `
              <div style="margin: 5px 0;">
                <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 12px; display: inline-block; max-width: 100%; overflow-x: auto;">
                  ${escapeHtml(selector)}
                </code>
              </div>
            `;
          }
          
          if (selectors.length > 5) {
            html += `
              <div style="color: #666; font-size: 12px; margin-top: 5px;">
                他 ${selectors.length - 5} 個のセレクタ...
              </div>
            `;
          }
          
          html += `
              </div>
            </div>
          `;
        } else {
          // セレクタが見つからない場合
          html += `
            <div class="selector-type">
              <h4>${category.label}</h4>
              <div class="selector-list" style="color: #999; font-size: 14px;">
                未検出
              </div>
            </div>
          `;
        }
      } catch (error) {
        console.error(`${category.key}セレクタ取得エラー:`, error);
        html += `
          <div class="selector-type">
            <h4>${category.label}</h4>
            <div class="selector-list" style="color: #e74c3c; font-size: 14px;">
              取得エラー
            </div>
          </div>
        `;
      }
    }

    html += `</div>`;

    // 統計情報を追加
    if (hasSelectors) {
      html = `
        <h3>${properAIName} セレクタ情報</h3>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 20px;">
          <div style="color: #333; font-size: 14px;">
            ✅ 総セレクタ数: <strong>${totalSelectors}</strong>個
          </div>
        </div>
        <div class="selector-types">
      ` + html.split('<div class="selector-types">')[1];
    } else {
      html = `
        <h3>${properAIName} セレクタ情報</h3>
        <div style="color: #999; padding: 20px; text-align: center;">
          セレクタ情報が取得できませんでした。
        </div>
      `;
    }

    targetPanel.innerHTML = html;
    console.log(`✅ ${properAIName}のセレクタ情報を表示しました (${totalSelectors}個のセレクタ)`);

  } catch (error) {
    console.error('セレクタ情報取得エラー:', error);
    targetPanel.innerHTML = `
      <div style="color: #e74c3c; padding: 20px;">
        ❌ エラーが発生しました: ${error.message}
      </div>
    `;
  }
}

// ===== イベントリスナー: セレクタタブ切り替え =====
document.querySelectorAll('.selector-tab').forEach(tab => {
  tab.addEventListener('click', async (e) => {
    // アクティブタブの切り替え
    document.querySelectorAll('.selector-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    // パネルの表示切り替え
    const aiType = e.target.dataset.ai;
    document.querySelectorAll('.selector-ai-panel').forEach(panel => {
      panel.style.display = 'none';
    });
    const targetPanel = document.getElementById(`${aiType}-selectors`);
    if (targetPanel) {
      targetPanel.style.display = 'block';
    }
    
    console.log(`セレクタタブ切り替え: ${aiType}`);
    
    // セレクタ情報を動的に取得・表示
    await fetchAndDisplaySelectorInfo(aiType);
  });
});

// 初期表示（ChatGPTタブと統合表）
document.addEventListener('DOMContentLoaded', () => {
  // 統合表を初期化
  loadAndDisplayIntegratedTable();

  // 初期状態でChatGPTのセレクタ情報を表示
  const initialTab = document.querySelector('.selector-tab[data-ai="chatgpt"]');
  if (initialTab && initialTab.classList.contains('active')) {
    fetchAndDisplaySelectorInfo('chatgpt');
  }
  
  // Chrome Storageからセレクタデータを読み込んで全タブに反映
  chrome.storage.local.get(['ai_selector_data'], (result) => {
    if (result.ai_selector_data) {
      console.log('📊 初期化時にセレクタデータを検出:', result.ai_selector_data);
      // 各AIのセレクタ情報を更新（バックグラウンドで）
      ['claude', 'gemini'].forEach(aiType => {
        if (result.ai_selector_data[aiType]) {
          // タブがアクティブでない場合も、データがあれば準備しておく
          const panel = document.getElementById(`${aiType}-selectors`);
          if (panel && !panel.innerHTML.includes('セレクタ情報')) {
            // 初期状態のままの場合のみ更新
            console.log(`📋 ${aiType}のセレクタ情報を準備`);
          }
        }
      });
    }
  });
  
  // セレクタデータ保存時のイベントリスナー
  window.addEventListener('ai-selector-data-saved', (event) => {
    console.log('🔄 セレクタデータが保存されました。UIを更新します...', event.detail);
    // 現在アクティブなタブを取得
    const activeTab = document.querySelector('.selector-tab.active');
    if (activeTab) {
      const aiType = activeTab.dataset.ai;
      // アクティブなタブのセレクタ情報を再読み込み
      fetchAndDisplaySelectorInfo(aiType);
    }
  });
});

// AI status display button removed

// テスト実行関数（別ウィンドウ版）

// ===== ログビューアー機能 =====
class LogViewer {
  constructor() {
    this.logs = [];
    this.currentCategory = 'all';
    this.port = null;
    this.initElements();
    this.connectToBackground();
    this.attachEventListeners();
  }
  
  initElements() {
    this.container = document.getElementById('log-container');
    this.tabs = document.querySelectorAll('.log-tab');
    this.clearBtn = document.getElementById('btn-clear-logs');
    this.copyBtn = document.getElementById('btn-copy-logs');
  }
  
  connectToBackground() {
    // background.jsのLogManagerに接続
    this.port = chrome.runtime.connect({ name: 'log-viewer' });
    
    // メッセージリスナー
    this.port.onMessage.addListener((msg) => {
      if (msg.type === 'log') {
        this.addLog(msg.data);
      } else if (msg.type === 'logs-batch') {
        this.logs = msg.data || [];
        this.renderLogs();
      } else if (msg.type === 'clear') {
        if (!msg.category || msg.category === this.currentCategory || this.currentCategory === 'all') {
          this.logs = this.logs.filter(log => {
            if (!msg.category) return false;
            if (msg.category === 'error') return log.level !== 'error';
            if (msg.category === 'system') return log.category !== 'system';
            return log.ai !== msg.category;
          });
          this.renderLogs();
        }
      } else if (msg.type === 'selector-data') {
        // セレクタデータを受信してUIに表示
        if (typeof displaySelectorInfo === 'function') {
          displaySelectorInfo(msg.data);
        }
        if (typeof logSelectorInfo === 'function') {
          logSelectorInfo(msg.data);
        }
      }
    });
    
    // 既存のログを取得
    this.port.postMessage({ type: 'get-logs' });
  }
  
  attachEventListeners() {
    // タブ切り替え
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentCategory = tab.dataset.category;
        this.renderLogs();
      });
    });
    
    // クリアボタン
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        const category = this.currentCategory === 'all' ? null : this.currentCategory;
        this.port.postMessage({ type: 'clear', category });
      });
    }
    
    // コピーボタン
    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', () => {
        this.copyLogs();
      });
    }
  }
  
  addLog(logEntry) {
    this.logs.push(logEntry);
    if (this.shouldShowLog(logEntry)) {
      this.appendLogEntry(logEntry);
    }
  }
  
  shouldShowLog(log) {
    if (this.currentCategory === 'all') return true;
    if (this.currentCategory === 'error') return log.level === 'error';
    if (this.currentCategory === 'system') return log.category === 'system';
    if (this.currentCategory === 'selector') return log.category === 'selector' || log.type === 'selector-update';
    if (this.currentCategory === 'chatgpt') return log.ai === 'ChatGPT' || log.ai === 'chatgpt';
    if (this.currentCategory === 'claude') return log.ai === 'Claude' || log.ai === 'claude';
    if (this.currentCategory === 'gemini') return log.ai === 'Gemini' || log.ai === 'gemini';
    return false;
  }
  
  renderLogs() {
    if (!this.container) return;
    
    const filteredLogs = this.logs.filter(log => this.shouldShowLog(log));
    
    if (filteredLogs.length === 0) {
      this.container.innerHTML = '<div class="log-empty">ログがまだありません</div>';
      return;
    }
    
    this.container.innerHTML = '';
    filteredLogs.forEach(log => this.appendLogEntry(log));
    
    // 最新のログまでスクロール
    this.container.scrollTop = this.container.scrollHeight;
  }
  
  /**
   * URLを検出してリンクに変換する
   * @param {string} text - 変換するテキスト
   * @returns {string} リンク化されたHTML
   */
  linkifyUrls(text) {
    // HTMLエスケープ処理
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };

    // エスケープ後のテキストを取得
    const escapedText = escapeHtml(text);

    // URL正規表現パターン
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^\[\]`]+)/gi;

    // URLをリンクタグに変換
    return escapedText.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" style="color: #0066cc; text-decoration: underline;">${url}</a>`;
    });
  }

  appendLogEntry(log) {
    if (!this.container) return;

    // 空メッセージチェックを削除
    if (this.container.querySelector('.log-empty')) {
      this.container.innerHTML = '';
    }

    const entry = document.createElement('div');
    entry.className = `log-entry log-${log.level || 'info'}`;

    // タイムスタンプ
    const timestamp = new Date(log.timestamp).toLocaleTimeString('ja-JP');
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'log-timestamp';
    timestampSpan.textContent = timestamp;

    // ソース/AI名
    if (log.ai || log.source) {
      const sourceSpan = document.createElement('span');
      sourceSpan.className = 'log-source';
      sourceSpan.textContent = `[${log.ai || log.source}]`;
      entry.appendChild(sourceSpan);
    }

    entry.appendChild(timestampSpan);

    // メッセージ（URLをリンク化）
    const messageSpan = document.createElement('span');
    const linkedMessage = this.linkifyUrls(` ${log.message}`);
    messageSpan.innerHTML = linkedMessage;
    entry.appendChild(messageSpan);

    this.container.appendChild(entry);

    // 最新のログまでスクロール
    this.container.scrollTop = this.container.scrollHeight;
  }
  
  copyLogs() {
    const filteredLogs = this.logs.filter(log => this.shouldShowLog(log));
    
    if (filteredLogs.length === 0) {
      showFeedback('コピーするログがありません', 'warning');
      return;
    }
    
    const text = filteredLogs.map(log => {
      const timestamp = new Date(log.timestamp).toLocaleString('ja-JP');
      const source = log.ai || log.source || '';
      return `[${timestamp}] ${source ? `[${source}] ` : ''}${log.message}`;
    }).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      showFeedback('ログをコピーしました', 'success');
      
      // ボタンのフィードバック
      const originalText = this.copyBtn.textContent;
      this.copyBtn.textContent = '✓ コピー済み';
      setTimeout(() => {
        this.copyBtn.textContent = originalText;
      }, 2000);
    }).catch(err => {
      showFeedback('コピーに失敗しました', 'error');
      console.error('Failed to copy logs:', err);
    });
  }
  
  /**
   * セレクタ情報をログに追加する専用メソッド
   * @param {Object} logEntry - セレクタログエントリ
   */
  addSelectorLog(logEntry) {
    // セレクタログ専用のフォーマット
    const selectorLogEntry = {
      timestamp: logEntry.timestamp || Date.now(),
      level: 'info',
      category: 'selector',
      ai: 'Selector System',
      source: 'MutationObserver',
      message: this.formatSelectorMessage(logEntry.data),
      type: 'selector-update',
      data: logEntry.data
    };
    
    this.addLog(selectorLogEntry);
  }
  
  /**
   * セレクタデータを人間が読める形式にフォーマット
   * @param {Object} selectorData - セレクタデータ
   * @returns {string} フォーマット済みメッセージ
   */
  formatSelectorMessage(selectorData) {
    if (!selectorData) return 'セレクタ情報を更新しました';
    
    const aiTypes = Object.keys(selectorData);
    if (aiTypes.length === 0) return 'セレクタ情報を更新しました';
    
    const summaries = aiTypes.map(aiType => {
      const data = selectorData[aiType];
      if (!data) return `${aiType.toUpperCase()}: データなし`;
      
      const selectorCount = data.totalSelectors || 0;
      const inputCount = data.inputElements || 0;
      const buttonCount = data.buttonElements || 0;
      const deepResearch = data.deepResearch?.available ? ' (DeepResearch対応)' : '';
      
      return `${aiType.toUpperCase()}: ${selectorCount}個のセレクタ (入力:${inputCount}, ボタン:${buttonCount})${deepResearch}`;
    });
    
    return `セレクタ情報を更新: ${summaries.join(', ')}`;
  }
}

// ログビューアーのインスタンスを作成
let logViewer = null;

// ===== 初期化処理 =====
// 初回のAIステータスを更新
updateAIStatus();

// 保存済みURLリストを読み込み
loadSavedUrls();

// 最初の入力欄にイベントリスナーを設定
const firstUrlRow = document.querySelector('.url-input-row');
if (firstUrlRow) {
  attachUrlRowEventListeners(firstUrlRow);
}

// ログビューアーを初期化
logViewer = new LogViewer();

// UI初期化完了を通知（LogManagerは後でポート経由でログを受信）
console.log('[UI] ログビューアー準備完了');

// ===== セレクタ情報表示機能 =====

/**
 * セレクタ情報を各AIタブに表示
 * @param {Object} selectorData - セレクタデータ {chatgpt: {...}, claude: {...}, gemini: {...}}
 */
function displaySelectorInfo(selectorData) {
  if (!selectorData) return;
  
  const aiTypes = ['chatgpt', 'claude', 'gemini'];
  
  aiTypes.forEach(aiType => {
    const tabContent = document.getElementById(`selector-${aiType}`);
    if (!tabContent) return;
    
    const data = selectorData[aiType];
    if (!data) {
      tabContent.innerHTML = '<div class="selector-empty">このAIのセレクタ情報がありません</div>';
      return;
    }
    
    let html = `
      <div class="selector-summary">
        <h4>🎯 ${aiType.toUpperCase()} セレクタ情報</h4>
        <div class="selector-stats">
          <span class="stat-item">総セレクタ数: ${data.totalSelectors || 0}</span>
          <span class="stat-item">入力欄: ${data.inputElements || 0}</span>
          <span class="stat-item">ボタン: ${data.buttonElements || 0}</span>
        </div>
      </div>
      <div class="selector-details">
    `;
    
    // 主要なセレクタ情報を表示
    if (data.selectors && data.selectors.length > 0) {
      html += '<h5>📋 検出されたセレクタ</h5>';
      data.selectors.slice(0, 10).forEach(selector => {
        html += `
          <div class="selector-item">
            <div class="selector-type">${selector.type || 'unknown'}</div>
            <div class="selector-value">${escapeHtml(selector.selector || '')}</div>
            <div class="selector-element">${escapeHtml(selector.element || '')}</div>
          </div>
        `;
      });
      
      if (data.selectors.length > 10) {
        html += `<div class="selector-more">他 ${data.selectors.length - 10} 個のセレクタ...</div>`;
      }
    }
    
    // DeepResearch情報
    if (data.deepResearch) {
      html += `
        <h5>🔍 DeepResearch対応</h5>
        <div class="deepresearch-info">
          <span class="deepresearch-status ${data.deepResearch.available ? 'available' : 'unavailable'}">
            ${data.deepResearch.available ? '✅ 利用可能' : '❌ 利用不可'}
          </span>
          ${data.deepResearch.selector ? `<div class="deepresearch-selector">セレクタ: ${escapeHtml(data.deepResearch.selector)}</div>` : ''}
        </div>
      `;
    }
    
    html += '</div>';
    tabContent.innerHTML = html;
  });
}

/**
 * セレクタ情報をログに記録
 * @param {Object} selectorData - セレクタデータ
 */
function logSelectorInfo(selectorData) {
  if (!selectorData) return;
  
  const logEntry = {
    timestamp: new Date().toLocaleTimeString(),
    type: 'selector-update',
    data: selectorData
  };
  
  // ログビューアーにセレクタ情報を追加
  if (logViewer && typeof logViewer.addSelectorLog === 'function') {
    logViewer.addSelectorLog(logEntry);
  }
  
  console.log('🎯 セレクタ情報ログ:', logEntry);
}

/**
 * HTMLをエスケープする安全な関数
 * @param {string} text - エスケープするテキスト
 * @returns {string} エスケープされたテキスト
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ===== AIタブ切り替え機能 =====
function initAITabsSystem() {
  const aiTabs = document.querySelectorAll('.ai-tab');
  const aiPanels = document.querySelectorAll('.ai-panel');

  if (aiTabs.length === 0 || aiPanels.length === 0) return;

  aiTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const aiType = tab.dataset.ai;

      // すべてのタブを非アクティブ化
      aiTabs.forEach(t => {
        t.classList.remove('active');
        t.style.borderBottom = '2px solid transparent';
        t.style.color = '#666';
      });

      // すべてのパネルを非表示
      aiPanels.forEach(p => p.style.display = 'none');

      // クリックされたタブをアクティブ化
      tab.classList.add('active');
      const colors = {
        chatgpt: '#10a37f',
        claude: '#d97757',
        gemini: '#4285f4'
      };
      tab.style.borderBottom = `2px solid ${colors[aiType]}`;
      tab.style.color = colors[aiType];
      tab.style.fontWeight = '600';

      // 対応するパネルを表示
      const panel = document.getElementById(`${aiType}-panel`);
      if (panel) panel.style.display = 'block';
    });
  });
}

// ストレージの変更を監視（AI変更検出システムが実行されたときに更新）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.ai_config_persistence) {
    updateAIStatus();
  }
});

// AIタブシステムを初期化
initAITabsSystem();

// ===== Dropbox設定機能 =====

// Dropbox設定の読み込み
async function loadDropboxSettings() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['dropboxClientId'], resolve);
    });

    const clientIdInput = document.getElementById('dropboxClientId');
    const statusIcon = document.getElementById('dropboxStatusIcon');
    const statusText = document.getElementById('dropboxStatusText');

    if (clientIdInput && result.dropboxClientId) {
      clientIdInput.value = result.dropboxClientId;
      updateDropboxStatus(true);
    } else {
      updateDropboxStatus(false);
    }
  } catch (error) {
    console.error('Dropbox設定の読み込みエラー:', error);
    updateDropboxStatus(false);
  }
}

// Dropbox設定の保存
async function saveDropboxSettings() {
  const clientIdInput = document.getElementById('dropboxClientId');
  const clientId = clientIdInput?.value?.trim();

  if (!clientId) {
    showFeedback('Client IDを入力してください', 'warning');
    return;
  }

  // 簡単な形式チェック（Dropbox App keyは通常英数字とピリオドを含む）
  if (!/^[a-zA-Z0-9._-]+$/.test(clientId)) {
    showFeedback('Client IDの形式が正しくありません', 'error');
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ dropboxClientId: clientId }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    showFeedback('Dropbox設定を保存しました', 'success');
    updateDropboxStatus(true);
  } catch (error) {
    console.error('Dropbox設定の保存エラー:', error);
    showFeedback('設定の保存に失敗しました', 'error');
  }
}

// Dropboxステータス表示の更新
function updateDropboxStatus(isConfigured) {
  const statusIcon = document.getElementById('dropboxStatusIcon');
  const statusText = document.getElementById('dropboxStatusText');

  if (statusIcon && statusText) {
    if (isConfigured) {
      statusIcon.textContent = '✅';
      statusText.textContent = 'Client IDが設定されています';
      statusText.style.color = '#28a745';
    } else {
      statusIcon.textContent = 'ℹ️';
      statusText.textContent = 'Client IDが設定されていません';
      statusText.style.color = '#666';
    }
  }
}

// Dropbox設定のイベントリスナー初期化
function initDropboxSettings() {
  const saveButton = document.getElementById('saveDropboxSettings');
  const clientIdInput = document.getElementById('dropboxClientId');

  if (saveButton) {
    saveButton.addEventListener('click', saveDropboxSettings);
  }

  // Enterキーでも保存
  if (clientIdInput) {
    clientIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveDropboxSettings();
      }
    });
  }

  // 初期設定を読み込み
  loadDropboxSettings();
}

// ===== Dropbox認証機能 =====

// Dropboxサービスのインポート
let dropboxService = null;

// Dropboxサービスを動的にインポート
async function loadDropboxService() {
  if (!dropboxService) {
    try {
      const module = await import('../services/dropbox-service.js');
      dropboxService = module.dropboxService;
      await dropboxService.initialize();
    } catch (error) {
      console.error('DropboxService読み込みエラー:', error);
      showFeedback('Dropboxサービスの読み込みに失敗しました', 'error');
      throw error;
    }
  }
  return dropboxService;
}

// Dropbox認証の実行
async function authenticateDropbox() {
  const authButton = document.getElementById('authenticateDropbox');

  try {
    // ボタンを無効化
    authButton.disabled = true;
    authButton.textContent = '認証中...';

    // Dropboxサービスをロード
    const service = await loadDropboxService();

    // Client IDが設定されているか確認
    const clientIdInput = document.getElementById('dropboxClientId');
    const clientId = clientIdInput?.value?.trim();

    if (!clientId) {
      throw new Error('Client IDが入力されていません。先にClient IDを設定してください。');
    }

    // Client IDをDropbox Configに設定（念のため再設定）
    await service.config.setClientId(clientId);

    showFeedback('Dropbox認証を開始します...', 'loading');

    // 認証実行
    const result = await service.authenticate();

    if (result.success) {
      showFeedback('Dropbox認証が完了しました！', 'success');
      await updateDropboxAuthStatus();
    } else {
      throw new Error(result.error || '認証に失敗しました');
    }
  } catch (error) {
    console.error('Dropbox認証エラー:', error);
    showFeedback(`認証エラー: ${error.message}`, 'error');
  } finally {
    // ボタンを復活
    authButton.disabled = false;
    authButton.innerHTML = '<span>🔐</span> Dropbox認証を開始';
  }
}

// 認証状態の確認
async function checkDropboxAuth() {
  try {
    const service = await loadDropboxService();
    const isAuthenticated = await service.isAuthenticated();

    // 認証状態を確認

    if (isAuthenticated) {
      showFeedback('Dropbox認証済みです', 'success');
      await updateDropboxAuthStatus();
    } else {
      showFeedback('Dropbox認証が必要です', 'warning');
      updateDropboxAuthUI(false);
    }
  } catch (error) {
    console.error('認証状態確認エラー:', error);
    showFeedback(`認証状態確認エラー: ${error.message}`, 'error');
  }
}

// Dropboxログアウト
async function logoutDropbox() {
  try {
    const service = await loadDropboxService();
    const success = await service.logout();

    if (success) {
      showFeedback('Dropboxからログアウトしました', 'success');
      updateDropboxAuthUI(false);
      updateDropboxStatus(false);
    } else {
      throw new Error('ログアウトに失敗しました');
    }
  } catch (error) {
    console.error('ログアウトエラー:', error);
    showFeedback(`ログアウトエラー: ${error.message}`, 'error');
  }
}

// 認証状態の更新
async function updateDropboxAuthStatus() {
  try {
    const service = await loadDropboxService();
    const isAuthenticated = await service.isAuthenticated();

    if (isAuthenticated) {
      try {
        // ユーザー情報を取得
        const userInfo = await service.getUserInfo();
        updateDropboxAuthUI(true, userInfo);
      } catch (userInfoError) {
        console.error('ユーザー情報取得エラー:', userInfoError);

        // 認証はされているが、ユーザー情報取得に失敗した場合
        if (userInfoError.message.includes('認証トークンが無効') || userInfoError.message.includes('missing_scope')) {
          // トークンが無効またはスコープ不足の場合は再認証が必要
          showFeedback('スコープ権限が不足しています。ログアウト後に再認証してください。', 'warning');
          updateDropboxAuthUI(false);
          // 自動的にログアウト
          await logoutDropbox();
        } else {
          // その他のエラーの場合は、基本的な認証情報を表示
          updateDropboxAuthUI(true, {
            name: 'ユーザー情報取得に失敗',
            email: 'API形式エラーまたはスコープ不足'
          });
          showFeedback('ユーザー情報の取得に失敗しましたが、認証は完了しています', 'warning');
        }
      }
    } else {
      updateDropboxAuthUI(false);
    }
  } catch (error) {
    console.error('認証状態更新エラー:', error);
    updateDropboxAuthUI(false);
  }
}

// 認証UI表示の更新
function updateDropboxAuthUI(isAuthenticated, userInfo = null) {
  const authDetails = document.getElementById('dropboxAuthDetails');
  const logoutButton = document.getElementById('logoutDropbox');
  const authButton = document.getElementById('authenticateDropbox');
  const userNameSpan = document.getElementById('dropboxUserName');
  const userEmailSpan = document.getElementById('dropboxUserEmail');

  if (isAuthenticated && userInfo) {
    // 認証済み表示
    authDetails.style.display = 'block';
    logoutButton.style.display = 'inline-block';
    authButton.style.display = 'none';

    if (userNameSpan) userNameSpan.textContent = userInfo.name || '-';
    if (userEmailSpan) userEmailSpan.textContent = userInfo.email || '-';
  } else {
    // 未認証表示
    authDetails.style.display = 'none';
    logoutButton.style.display = 'none';
    authButton.style.display = 'flex';

    if (userNameSpan) userNameSpan.textContent = '-';
    if (userEmailSpan) userEmailSpan.textContent = '-';
  }
}

// Dropbox認証のイベントリスナー初期化
function initDropboxAuth() {
  const authButton = document.getElementById('authenticateDropbox');
  const checkButton = document.getElementById('checkDropboxAuth');
  const logoutButton = document.getElementById('logoutDropbox');

  if (authButton) {
    authButton.addEventListener('click', authenticateDropbox);
  }

  if (checkButton) {
    checkButton.addEventListener('click', checkDropboxAuth);
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', logoutDropbox);
  }

  // 初期状態の確認
  setTimeout(checkDropboxAuth, 500);
}

// ===== Dropboxファイル選択機能 =====

// 現在のフォルダパスと選択されたファイル情報
let currentDropboxPath = ''; // ルートディレクトリから開始（デバッグ後に適切なパスに変更）
let selectedDropboxFile = null;

// ===== AI別ログレポートファイル選択機能 =====

// AI別のファイル選択状態を管理
let aiLogFileSelectors = {
  chatgpt: {
    currentPath: '/chatgpt-logs',
    selectedFile: null,
    displayName: 'ChatGPT',
    emoji: '🤖'
  },
  claude: {
    currentPath: '/claude-logs',
    selectedFile: null,
    displayName: 'Claude',
    emoji: '🔮'
  },
  gemini: {
    currentPath: '/gemini-logs',
    selectedFile: null,
    displayName: 'Gemini',
    emoji: '✨'
  }
};

// 現在アクティブなAIタブ
let activeAiLogTab = 'chatgpt';

// ログファイル拡張子のフィルタ
const LOG_FILE_EXTENSIONS = ['.txt', '.log', '.json', '.csv', '.md'];

// AI別ログファイル一覧の取得と表示
async function loadAiLogFiles(aiType, folderPath = null) {
  console.log(`[AI-${aiType}] ログファイル一覧取得開始`, { folderPath, currentPath: aiLogFileSelectors[aiType].currentPath });

  const fileListLoading = document.getElementById('aiLogFileListLoading');
  const fileListEmpty = document.getElementById('aiLogFileListEmpty');
  const fileListTable = document.getElementById('aiLogFileListTable');
  const fileListBody = document.getElementById('aiLogFileListBody');
  const currentPathInput = document.getElementById('currentAiLogPath');
  const breadcrumb = document.getElementById('aiLogBreadcrumb');

  try {
    // 表示状態を更新
    if (fileListLoading) fileListLoading.style.display = 'block';
    if (fileListEmpty) fileListEmpty.style.display = 'none';
    if (fileListTable) fileListTable.style.display = 'none';

    if (folderPath !== null) {
      aiLogFileSelectors[aiType].currentPath = folderPath;
      console.log(`[AI-${aiType}] パス更新:`, aiLogFileSelectors[aiType].currentPath);
    }

    if (currentPathInput) {
      currentPathInput.value = aiLogFileSelectors[aiType].currentPath;
    }

    // パンくずリスト更新
    updateAiLogBreadcrumb(aiType);

    // Dropboxサービスを取得
    console.log(`[AI-${aiType}] Dropboxサービス取得開始`);
    const service = await loadDropboxService();
    console.log(`[AI-${aiType}] Dropboxサービス取得完了`);

    const isAuthenticated = await service.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('Dropbox認証が必要です。先に認証を完了してください。');
    }

    // ファイル一覧を取得
    console.log(`[AI-${aiType}] ファイル一覧API呼び出し開始`, { path: aiLogFileSelectors[aiType].currentPath });
    const files = await service.listFiles(aiLogFileSelectors[aiType].currentPath);
    console.log(`[AI-${aiType}] ファイル一覧取得完了:`, files);

    // ログファイルのみフィルタリング
    const logFiles = files.filter(file => {
      if (file.type === 'folder') return true;
      return LOG_FILE_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
    });

    console.log(`[AI-${aiType}] ログファイルフィルタリング:`, {
      totalFiles: files.length,
      logFiles: logFiles.length,
      filteredFiles: logFiles.map(f => f.name)
    });

    // 表示を更新
    if (fileListLoading) fileListLoading.style.display = 'none';

    if (logFiles.length === 0) {
      if (fileListEmpty) fileListEmpty.style.display = 'block';
      if (fileListTable) fileListTable.style.display = 'none';
    } else {
      if (fileListEmpty) fileListEmpty.style.display = 'none';
      if (fileListTable) fileListTable.style.display = 'table';

      // テーブルの内容をクリア
      if (fileListBody) {
        fileListBody.innerHTML = '';
      }

      // ファイルとフォルダを分けてソート
      const folders = logFiles.filter(file => file.type === 'folder').sort((a, b) => a.name.localeCompare(b.name));
      const filesOnly = logFiles.filter(file => file.type === 'file').sort((a, b) => a.name.localeCompare(b.name));

      // 親フォルダへのリンク（ルートでない場合）
      const currentPath = aiLogFileSelectors[aiType].currentPath;
      if (currentPath !== '' && currentPath !== '/' && !currentPath.startsWith('/')) {
        const parentRow = createAiLogFileRow(aiType, {
          name: '.. (親フォルダ)',
          type: 'folder',
          isParent: true
        });
        if (fileListBody) fileListBody.appendChild(parentRow);
      }

      // フォルダを先に表示
      folders.forEach(folder => {
        const row = createAiLogFileRow(aiType, folder);
        if (fileListBody) fileListBody.appendChild(row);
      });

      // ファイルを表示
      filesOnly.forEach(file => {
        const row = createAiLogFileRow(aiType, file);
        if (fileListBody) fileListBody.appendChild(row);
      });
    }

    showFeedback(`${aiLogFileSelectors[aiType].displayName}: ${logFiles.length}個のログファイルを取得しました`, 'success');

  } catch (error) {
    console.error(`AI-${aiType} ログファイル一覧取得エラー:`, error);
    if (fileListLoading) fileListLoading.style.display = 'none';
    if (fileListEmpty) fileListEmpty.style.display = 'block';
    if (fileListTable) fileListTable.style.display = 'none';

    showFeedback(`${aiLogFileSelectors[aiType].displayName}ログファイル取得エラー: ${error.message}`, 'error');
  }
}

// Dropboxファイル一覧の取得と表示
async function loadDropboxFiles(folderPath = null) {
  console.log('[Dropbox] ファイル一覧取得開始', { folderPath, currentDropboxPath });

  const fileListLoading = document.getElementById('fileListLoading');
  const fileListEmpty = document.getElementById('fileListEmpty');
  const fileListTable = document.getElementById('fileListTable');
  const fileListBody = document.getElementById('fileListBody');
  const currentPathInput = document.getElementById('currentDropboxPath');
  const breadcrumb = document.getElementById('folderBreadcrumb');

  console.log('[Dropbox] DOM要素確認:', {
    fileListLoading: !!fileListLoading,
    fileListEmpty: !!fileListEmpty,
    fileListTable: !!fileListTable,
    fileListBody: !!fileListBody,
    currentPathInput: !!currentPathInput,
    breadcrumb: !!breadcrumb
  });

  try {
    // 表示状態を更新
    if (fileListLoading) fileListLoading.style.display = 'block';
    if (fileListEmpty) fileListEmpty.style.display = 'none';
    if (fileListTable) fileListTable.style.display = 'none';

    if (folderPath !== null) {
      currentDropboxPath = folderPath;
      console.log('[Dropbox] パス更新:', currentDropboxPath);
    }

    if (currentPathInput) {
      currentPathInput.value = currentDropboxPath;
    }

    // パンくずリスト更新
    updateBreadcrumb();

    // Dropboxサービスを取得
    console.log('[Dropbox] Dropboxサービス取得開始');
    const service = await loadDropboxService();
    console.log('[Dropbox] Dropboxサービス取得完了');

    console.log('[Dropbox] 認証状態確認開始');
    const isAuthenticated = await service.isAuthenticated();
    console.log('[Dropbox] 認証状態:', isAuthenticated);

    // より詳細な認証状態を確認
    try {
      const accessToken = await service.config.getAccessToken();
      const clientId = await service.config.loadClientId();
      console.log('[Dropbox] 認証詳細:', {
        hasAccessToken: !!accessToken,
        hasClientId: !!clientId,
        accessTokenLength: accessToken ? accessToken.length : 0
      });

      // 現在のアカウント情報を取得して表示
      if (isAuthenticated) {
        try {
          const userInfo = await service.getUserInfo();
          console.log('[Dropbox] 現在のアカウント:', {
            name: userInfo.name,
            email: userInfo.email,
            accountId: userInfo.accountId
          });

          // UIにもアカウント情報を表示
          showFeedback(`Dropboxアカウント: ${userInfo.email}`, 'info');
        } catch (userError) {
          console.error('[Dropbox] ユーザー情報取得エラー:', userError);
        }
      }
    } catch (authError) {
      console.error('[Dropbox] 認証詳細確認エラー:', authError);
    }

    if (!isAuthenticated) {
      throw new Error('Dropbox認証が必要です。先に認証を完了してください。');
    }

    // ファイル一覧を取得
    console.log('[Dropbox] ファイル一覧API呼び出し開始', { path: currentDropboxPath });
    const files = await service.listFiles(currentDropboxPath);
    console.log('[Dropbox] ファイル一覧取得完了:', files);

    // 各アイテムの詳細情報をログ出力
    files.forEach((item, index) => {
      console.log(`[Dropbox] アイテム ${index + 1}:`, {
        name: item.name,
        type: item.type,
        dotTag: item['.tag'],
        path: item.path,
        size: item.size,
        modified: item.modified,
        rawData: item
      });
    });

    // 表示を更新
    console.log('[Dropbox] 表示更新開始', { filesCount: files.length });
    if (fileListLoading) fileListLoading.style.display = 'none';

    if (files.length === 0) {
      console.log('[Dropbox] ファイルが0個のため空表示');
      if (fileListEmpty) fileListEmpty.style.display = 'block';
      if (fileListTable) fileListTable.style.display = 'none';
    } else {
      console.log('[Dropbox] ファイル一覧表示開始');
      if (fileListEmpty) fileListEmpty.style.display = 'none';
      if (fileListTable) fileListTable.style.display = 'table';

      // テーブルの内容をクリア
      if (fileListBody) {
        fileListBody.innerHTML = '';
        console.log('[Dropbox] テーブル内容クリア完了');
      }

      // ファイルとフォルダを分けてソート
      const folders = files.filter(file => file.type === 'folder').sort((a, b) => a.name.localeCompare(b.name));
      const filesOnly = files.filter(file => file.type === 'file').sort((a, b) => a.name.localeCompare(b.name));

      console.log('[Dropbox] ファイル分類:', {
        foldersCount: folders.length,
        filesCount: filesOnly.length,
        allTypes: files.map(f => f.type),
        folders: folders.map(f => f.name),
        files: filesOnly.map(f => f.name)
      });

      // 親フォルダへのリンク（ルートでない場合）
      if (currentDropboxPath !== '' && currentDropboxPath !== '/') {
        console.log('[Dropbox] 親フォルダリンク追加');
        const parentRow = createFileRow({
          name: '.. (親フォルダ)',
          type: 'folder',
          isParent: true
        });
        if (fileListBody) fileListBody.appendChild(parentRow);
      }

      // フォルダを先に表示
      folders.forEach((folder, index) => {
        console.log(`[Dropbox] フォルダ表示 ${index + 1}/${folders.length}:`, folder.name);
        const row = createFileRow(folder);
        if (fileListBody) fileListBody.appendChild(row);
      });

      // ファイルを表示
      filesOnly.forEach((file, index) => {
        console.log(`[Dropbox] ファイル表示 ${index + 1}/${filesOnly.length}:`, file.name);
        const row = createFileRow(file);
        if (fileListBody) fileListBody.appendChild(row);
      });

      console.log('[Dropbox] ファイル一覧表示完了');
    }

    showFeedback(`${files.length}個のアイテムを取得しました`, 'success');
    console.log('[Dropbox] ファイル一覧取得処理完了');

  } catch (error) {
    console.error('Dropboxファイル一覧取得エラー:', error);
    fileListLoading.style.display = 'none';
    fileListEmpty.style.display = 'block';
    fileListTable.style.display = 'none';

    // パスが存在しない場合はルートに戻る
    if (error.message.includes('path/not_found') || error.message.includes('not_found')) {
      currentDropboxPath = '';
      if (currentPathInput) {
        currentPathInput.value = currentDropboxPath;
      }
      updateBreadcrumb();
      showFeedback('フォルダが見つからないため、ルートディレクトリに移動しました', 'warning');

      // ルートディレクトリで再試行
      setTimeout(() => {
        loadDropboxFiles('');
      }, 1000);
    } else {
      showFeedback(`ファイル一覧取得エラー: ${error.message}`, 'error');
    }
  }
}

// パンくずリスト更新
function updateBreadcrumb() {
  const breadcrumb = document.getElementById('folderBreadcrumb');
  if (!breadcrumb) return;

  const pathParts = currentDropboxPath.split('/').filter(part => part);

  // ルートのパンくず
  let breadcrumbHTML = '<span style="cursor: pointer; color: #007bff;" onclick="navigateToFolder(\'/\')">/</span>';

  // 各フォルダのパンくず
  let currentPath = '';
  pathParts.forEach((part, index) => {
    currentPath += '/' + part;
    const isLast = index === pathParts.length - 1;

    if (isLast) {
      breadcrumbHTML += ` / <span style="color: #666;">${part}</span>`;
    } else {
      breadcrumbHTML += ` / <span style="cursor: pointer; color: #007bff;" onclick="navigateToFolder('${currentPath}')">${part}</span>`;
    }
  });

  breadcrumb.innerHTML = breadcrumbHTML;
}

// ファイル行の作成
function createFileRow(file) {
  const row = document.createElement('tr');
  row.style.cursor = 'pointer';
  row.style.borderBottom = '1px solid #eee';

  // ホバー効果
  row.addEventListener('mouseenter', () => {
    row.style.backgroundColor = '#f8f9fa';
  });
  row.addEventListener('mouseleave', () => {
    if (!row.classList.contains('selected')) {
      row.style.backgroundColor = '';
    }
  });

  // アイコンと種類
  const typeCell = document.createElement('td');
  typeCell.style.padding = '8px';
  typeCell.style.textAlign = 'center';
  typeCell.style.width = '40px';

  if (file.isParent) {
    typeCell.innerHTML = '📁';
  } else if (file.type === 'folder') {
    typeCell.innerHTML = '📁';
  } else {
    // ファイル拡張子に基づいてアイコンを設定
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) {
      typeCell.innerHTML = '🖼️';
    } else if (['txt', 'log', 'md'].includes(ext)) {
      typeCell.innerHTML = '📄';
    } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
      typeCell.innerHTML = '📊';
    } else if (['docx', 'doc'].includes(ext)) {
      typeCell.innerHTML = '📝';
    } else if (['pdf'].includes(ext)) {
      typeCell.innerHTML = '📕';
    } else {
      typeCell.innerHTML = '📄';
    }
  }

  // ファイル名
  const nameCell = document.createElement('td');
  nameCell.style.padding = '8px';
  nameCell.textContent = file.name;
  nameCell.style.fontWeight = file.type === 'folder' ? 'bold' : 'normal';

  // サイズ
  const sizeCell = document.createElement('td');
  sizeCell.style.padding = '8px';
  sizeCell.style.fontSize = '12px';
  sizeCell.style.color = '#666';
  if (file.type === 'folder') {
    sizeCell.textContent = '-';
  } else {
    sizeCell.textContent = formatFileSize(file.size || 0);
  }

  // 更新日
  const dateCell = document.createElement('td');
  dateCell.style.padding = '8px';
  dateCell.style.fontSize = '12px';
  dateCell.style.color = '#666';
  if (file.modified) {
    const date = new Date(file.modified);
    dateCell.textContent = date.toLocaleDateString('ja-JP') + ' ' + date.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
  } else {
    dateCell.textContent = '-';
  }

  // 操作ボタン
  const actionCell = document.createElement('td');
  actionCell.style.padding = '8px';
  actionCell.style.textAlign = 'center';

  if (file.type === 'folder' || file.isParent) {
    const openBtn = document.createElement('button');
    openBtn.textContent = '開く';
    openBtn.style.padding = '4px 8px';
    openBtn.style.fontSize = '12px';
    openBtn.style.background = '#007bff';
    openBtn.style.color = 'white';
    openBtn.style.border = 'none';
    openBtn.style.borderRadius = '3px';
    openBtn.style.cursor = 'pointer';

    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (file.isParent) {
        // 親フォルダに移動
        const parentPath = currentDropboxPath.split('/').slice(0, -1).join('/') || '';
        navigateToFolder(parentPath);
      } else {
        navigateToFolder(file.path);
      }
    });

    actionCell.appendChild(openBtn);
  } else {
    const selectBtn = document.createElement('button');
    selectBtn.textContent = '選択';
    selectBtn.style.padding = '4px 8px';
    selectBtn.style.fontSize = '12px';
    selectBtn.style.background = '#28a745';
    selectBtn.style.color = 'white';
    selectBtn.style.border = 'none';
    selectBtn.style.borderRadius = '3px';
    selectBtn.style.cursor = 'pointer';

    selectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectFile(file, row);
    });

    actionCell.appendChild(selectBtn);
  }

  // クリックイベント（行全体）
  row.addEventListener('click', () => {
    if (file.type === 'folder' || file.isParent) {
      if (file.isParent) {
        const parentPath = currentDropboxPath.split('/').slice(0, -1).join('/') || '';
        navigateToFolder(parentPath);
      } else {
        navigateToFolder(file.path);
      }
    } else {
      selectFile(file, row);
    }
  });

  row.appendChild(typeCell);
  row.appendChild(nameCell);
  row.appendChild(sizeCell);
  row.appendChild(dateCell);
  row.appendChild(actionCell);

  return row;
}

// フォルダナビゲーション
function navigateToFolder(folderPath) {
  loadDropboxFiles(folderPath);
}

// ファイル選択機能
function selectFile(file, row) {
  // 既存の選択を解除
  const previousSelected = document.querySelector('#fileListBody tr.selected');
  if (previousSelected) {
    previousSelected.classList.remove('selected');
    previousSelected.style.backgroundColor = '';
  }

  // 新しい選択を設定
  selectedDropboxFile = file;
  row.classList.add('selected');
  row.style.backgroundColor = '#e3f2fd';

  // 選択ファイル情報を表示
  displaySelectedFileInfo(file);

  showFeedback(`ファイル "${file.name}" を選択しました`, 'success');
}

// 選択ファイル情報の表示
function displaySelectedFileInfo(file) {
  const selectedFileInfo = document.getElementById('selectedFileInfo');
  const selectedFileDetails = document.getElementById('selectedFileDetails');

  if (!selectedFileInfo || !selectedFileDetails) return;

  const fileSize = formatFileSize(file.size || 0);
  const modifiedDate = file.modified ? new Date(file.modified).toLocaleString('ja-JP') : '不明';

  selectedFileDetails.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>📄 ファイル名:</strong> ${file.name}</div>
    <div style="margin-bottom: 8px;"><strong>📍 パス:</strong> ${file.path}</div>
    <div style="margin-bottom: 8px;"><strong>📊 サイズ:</strong> ${fileSize}</div>
    <div><strong>📅 更新日:</strong> ${modifiedDate}</div>
  `;

  selectedFileInfo.style.display = 'block';
}

// 選択ファイルクリア
function clearSelectedFile() {
  selectedDropboxFile = null;

  // テーブルの選択状態をクリア
  const selectedRow = document.querySelector('#fileListBody tr.selected');
  if (selectedRow) {
    selectedRow.classList.remove('selected');
    selectedRow.style.backgroundColor = '';
  }

  // 選択ファイル情報を非表示
  const selectedFileInfo = document.getElementById('selectedFileInfo');
  if (selectedFileInfo) {
    selectedFileInfo.style.display = 'none';
  }

  showFeedback('ファイル選択を解除しました', 'info');
}

// ===== AI別ログファイル関連関数群 =====

// AIタブ切り替え機能
function switchAiLogTab(aiType) {
  console.log(`[AI-Tab] タブ切り替え: ${activeAiLogTab} → ${aiType}`);

  // 前のタブを非アクティブに
  const prevTab = document.querySelector(`#${activeAiLogTab}LogTab`);
  if (prevTab) {
    prevTab.style.background = '#6c757d';
    prevTab.classList.remove('active');
  }

  // 新しいタブをアクティブに
  const newTab = document.querySelector(`#${aiType}LogTab`);
  if (newTab) {
    newTab.style.background = '#007bff';
    newTab.classList.add('active');
  }

  // アクティブなAIタブを更新
  activeAiLogTab = aiType;

  // UI要素を更新
  updateAiLogUI(aiType);

  // ファイル一覧を読み込み
  loadAiLogFiles(aiType);

  console.log(`[AI-Tab] タブ切り替え完了: ${aiType}`);
}

// AI別ログUI更新
function updateAiLogUI(aiType) {
  const selector = aiLogFileSelectors[aiType];
  const currentPathInput = document.getElementById('currentAiLogPath');
  const breadcrumb = document.getElementById('aiLogBreadcrumb');

  if (currentPathInput) {
    currentPathInput.value = selector.currentPath;
  }

  updateAiLogBreadcrumb(aiType);
  updateAiSelectionSummary();
}

// AI別パンくずリスト更新
function updateAiLogBreadcrumb(aiType) {
  const breadcrumb = document.getElementById('aiLogBreadcrumb');
  if (!breadcrumb) return;

  const selector = aiLogFileSelectors[aiType];
  const pathParts = selector.currentPath.split('/').filter(part => part);

  let breadcrumbHTML = `<span style="cursor: pointer; color: #007bff;" onclick="navigateToAiLogFolder('${aiType}', '/')">${selector.emoji} ${selector.displayName}ログ</span>`;

  let currentPath = '';
  pathParts.forEach((part, index) => {
    if (part === `${aiType}-logs`) return; // スキップ
    currentPath += '/' + part;
    const isLast = index === pathParts.length - 1;

    if (isLast) {
      breadcrumbHTML += ` / <span style="color: #666;">${part}</span>`;
    } else {
      breadcrumbHTML += ` / <span style="cursor: pointer; color: #007bff;" onclick="navigateToAiLogFolder('${aiType}', '${currentPath}')">${part}</span>`;
    }
  });

  breadcrumb.innerHTML = breadcrumbHTML;
}

// AI別ログファイル行の作成
function createAiLogFileRow(aiType, file) {
  const row = document.createElement('tr');
  row.style.cursor = 'pointer';
  row.style.borderBottom = '1px solid #eee';

  // ホバー効果
  row.addEventListener('mouseenter', () => {
    row.style.backgroundColor = '#f8f9fa';
  });
  row.addEventListener('mouseleave', () => {
    if (!row.classList.contains('selected')) {
      row.style.backgroundColor = '';
    }
  });

  // アイコンと種類
  const typeCell = document.createElement('td');
  typeCell.style.padding = '8px';
  typeCell.style.textAlign = 'center';
  typeCell.style.width = '40px';

  if (file.isParent) {
    typeCell.innerHTML = '📁';
  } else if (file.type === 'folder') {
    typeCell.innerHTML = '📁';
  } else {
    // ログファイル拡張子に基づいてアイコンを設定
    const ext = file.name.split('.').pop().toLowerCase();
    if (['log', 'txt'].includes(ext)) {
      typeCell.innerHTML = '📄';
    } else if (['json'].includes(ext)) {
      typeCell.innerHTML = '📋';
    } else if (['csv'].includes(ext)) {
      typeCell.innerHTML = '📊';
    } else if (['md'].includes(ext)) {
      typeCell.innerHTML = '📝';
    } else {
      typeCell.innerHTML = '📄';
    }
  }

  // ファイル名
  const nameCell = document.createElement('td');
  nameCell.style.padding = '8px';
  nameCell.textContent = file.name;
  nameCell.style.fontWeight = file.type === 'folder' ? 'bold' : 'normal';

  // サイズ
  const sizeCell = document.createElement('td');
  sizeCell.style.padding = '8px';
  sizeCell.style.fontSize = '12px';
  sizeCell.style.color = '#666';
  if (file.type === 'folder') {
    sizeCell.textContent = '-';
  } else {
    sizeCell.textContent = formatFileSize(file.size || 0);
  }

  // 更新日
  const dateCell = document.createElement('td');
  dateCell.style.padding = '8px';
  dateCell.style.fontSize = '12px';
  dateCell.style.color = '#666';
  if (file.modified) {
    const date = new Date(file.modified);
    dateCell.textContent = date.toLocaleDateString('ja-JP') + ' ' + date.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
  } else {
    dateCell.textContent = '-';
  }

  // 操作ボタン
  const actionCell = document.createElement('td');
  actionCell.style.padding = '8px';
  actionCell.style.textAlign = 'center';

  if (file.type === 'folder' || file.isParent) {
    const openBtn = document.createElement('button');
    openBtn.textContent = '開く';
    openBtn.style.padding = '4px 8px';
    openBtn.style.fontSize = '12px';
    openBtn.style.background = '#007bff';
    openBtn.style.color = 'white';
    openBtn.style.border = 'none';
    openBtn.style.borderRadius = '3px';
    openBtn.style.cursor = 'pointer';

    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (file.isParent) {
        // 親フォルダに移動
        const parentPath = aiLogFileSelectors[aiType].currentPath.split('/').slice(0, -1).join('/') || `/${aiType}-logs`;
        navigateToAiLogFolder(aiType, parentPath);
      } else {
        navigateToAiLogFolder(aiType, file.path);
      }
    });

    actionCell.appendChild(openBtn);
  } else {
    const selectBtn = document.createElement('button');
    selectBtn.textContent = '選択';
    selectBtn.style.padding = '4px 8px';
    selectBtn.style.fontSize = '12px';
    selectBtn.style.background = '#28a745';
    selectBtn.style.color = 'white';
    selectBtn.style.border = 'none';
    selectBtn.style.borderRadius = '3px';
    selectBtn.style.cursor = 'pointer';

    selectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectAiLogFile(aiType, file, row);
    });

    actionCell.appendChild(selectBtn);
  }

  // クリックイベント（行全体）
  row.addEventListener('click', () => {
    if (file.type === 'folder' || file.isParent) {
      if (file.isParent) {
        const parentPath = aiLogFileSelectors[aiType].currentPath.split('/').slice(0, -1).join('/') || `/${aiType}-logs`;
        navigateToAiLogFolder(aiType, parentPath);
      } else {
        navigateToAiLogFolder(aiType, file.path);
      }
    } else {
      selectAiLogFile(aiType, file, row);
    }
  });

  row.appendChild(typeCell);
  row.appendChild(nameCell);
  row.appendChild(sizeCell);
  row.appendChild(dateCell);
  row.appendChild(actionCell);

  return row;
}

// AI別ログフォルダナビゲーション
function navigateToAiLogFolder(aiType, folderPath) {
  loadAiLogFiles(aiType, folderPath);
}

// AI別ログファイル選択
function selectAiLogFile(aiType, file, row) {
  // 既存の選択を解除
  const previousSelected = document.querySelector('#aiLogFileListBody tr.selected');
  if (previousSelected) {
    previousSelected.classList.remove('selected');
    previousSelected.style.backgroundColor = '';
  }

  // 新しい選択を設定
  aiLogFileSelectors[aiType].selectedFile = file;
  row.classList.add('selected');
  row.style.backgroundColor = '#e3f2fd';

  // 選択ファイル情報を表示
  displayAiSelectedFileInfo(aiType, file);

  // 選択状況を永続化
  saveAiLogFileSelection(aiType, file);

  // サマリーを更新
  updateAiSelectionSummary();

  showFeedback(`${aiLogFileSelectors[aiType].displayName}ログファイル "${file.name}" を選択しました`, 'success');
}

// AI別選択ファイル情報の表示
function displayAiSelectedFileInfo(aiType, file) {
  const selectedFileInfo = document.getElementById('aiSelectedFileInfo');
  const selectedFileDetails = document.getElementById('aiSelectedFileDetails');

  if (!selectedFileInfo || !selectedFileDetails) return;

  const fileSize = formatFileSize(file.size || 0);
  const modifiedDate = file.modified ? new Date(file.modified).toLocaleString('ja-JP') : '不明';
  const selector = aiLogFileSelectors[aiType];

  selectedFileDetails.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>${selector.emoji} AI:</strong> ${selector.displayName}</div>
    <div style="margin-bottom: 8px;"><strong>📄 ファイル名:</strong> ${file.name}</div>
    <div style="margin-bottom: 8px;"><strong>📍 パス:</strong> ${file.path}</div>
    <div style="margin-bottom: 8px;"><strong>📊 サイズ:</strong> ${fileSize}</div>
    <div><strong>📅 更新日:</strong> ${modifiedDate}</div>
  `;

  selectedFileInfo.style.display = 'block';
}

// AI別選択ファイルクリア
function clearAiSelectedFile() {
  const aiType = activeAiLogTab;
  aiLogFileSelectors[aiType].selectedFile = null;

  // テーブルの選択状態をクリア
  const selectedRow = document.querySelector('#aiLogFileListBody tr.selected');
  if (selectedRow) {
    selectedRow.classList.remove('selected');
    selectedRow.style.backgroundColor = '';
  }

  // 選択ファイル情報を非表示
  const selectedFileInfo = document.getElementById('aiSelectedFileInfo');
  if (selectedFileInfo) {
    selectedFileInfo.style.display = 'none';
  }

  // 永続化ストレージからも削除
  saveAiLogFileSelection(aiType, null);

  // サマリーを更新
  updateAiSelectionSummary();

  showFeedback(`${aiLogFileSelectors[aiType].displayName}ログファイル選択を解除しました`, 'info');
}

// ===== AI別ログファイル永続化ストレージ機能 =====

// AI別ログファイル選択を保存
async function saveAiLogFileSelection(aiType, fileInfo) {
  try {
    const storageKey = `ai_log_file_selection_${aiType}`;
    const data = {};
    data[storageKey] = fileInfo;

    await chrome.storage.local.set(data);
    console.log(`[AI-Storage] ${aiType}ログファイル選択を保存:`, fileInfo);
  } catch (error) {
    console.error(`[AI-Storage] ${aiType}ログファイル選択保存エラー:`, error);
  }
}

// AI別ログファイル選択を読み込み
async function loadAiLogFileSelections() {
  try {
    const keys = ['ai_log_file_selection_chatgpt', 'ai_log_file_selection_claude', 'ai_log_file_selection_gemini'];
    const result = await chrome.storage.local.get(keys);

    // 各AIの選択状況を復元
    Object.keys(aiLogFileSelectors).forEach(aiType => {
      const storageKey = `ai_log_file_selection_${aiType}`;
      const fileInfo = result[storageKey];

      if (fileInfo) {
        aiLogFileSelectors[aiType].selectedFile = fileInfo;
        console.log(`[AI-Storage] ${aiType}ログファイル選択を復元:`, fileInfo);
      }
    });

    // サマリーを更新
    updateAiSelectionSummary();

  } catch (error) {
    console.error('[AI-Storage] ログファイル選択読み込みエラー:', error);
  }
}

// DropboxConfigからAI別フォルダパスを読み込み
async function loadAiLogFolderPaths() {
  try {
    // dropboxConfigがインポートされているかチェック
    if (typeof dropboxConfig !== 'undefined') {
      const aiPaths = await dropboxConfig.getAISpecificPaths();

      // AI別フォルダパスを更新
      if (aiPaths.chatgpt) {
        aiLogFileSelectors.chatgpt.currentPath = aiPaths.chatgpt;
      }
      if (aiPaths.claude) {
        aiLogFileSelectors.claude.currentPath = aiPaths.claude;
      }
      if (aiPaths.gemini) {
        aiLogFileSelectors.gemini.currentPath = aiPaths.gemini;
      }

      console.log('[AI-Log] DropboxConfigからAI別フォルダパスを読み込み:', aiPaths);
    } else {
      console.log('[AI-Log] dropboxConfigが利用できません。デフォルトパスを使用します。');
    }
  } catch (error) {
    console.error('[AI-Log] AI別フォルダパス読み込みエラー:', error);
  }
}

// 選択されたファイルをダウンロード
async function downloadAiSelectedFile() {
  const aiType = activeAiLogTab;
  const selectedFile = aiLogFileSelectors[aiType].selectedFile;

  if (!selectedFile) {
    showFeedback('ダウンロードするファイルが選択されていません', 'warning');
    return;
  }

  try {
    // Dropboxサービスを取得
    const service = await loadDropboxService();
    const isAuthenticated = await service.isAuthenticated();

    if (!isAuthenticated) {
      throw new Error('Dropbox認証が必要です');
    }

    showFeedback(`${selectedFile.name}をダウンロード中...`, 'loading');

    // ファイルをダウンロード
    const fileContent = await service.downloadFile(selectedFile.path);

    // ブラウザでダウンロード
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showFeedback(`${selectedFile.name}をダウンロードしました`, 'success');

  } catch (error) {
    console.error('[AI-Download] ファイルダウンロードエラー:', error);
    showFeedback(`ダウンロードエラー: ${error.message}`, 'error');
  }
}

// AI選択状況サマリー更新
function updateAiSelectionSummary() {
  const chatgptEl = document.getElementById('chatgptSelection');
  const claudeEl = document.getElementById('claudeSelection');
  const geminiEl = document.getElementById('geminiSelection');

  if (chatgptEl) {
    const file = aiLogFileSelectors.chatgpt.selectedFile;
    chatgptEl.textContent = `🤖 ChatGPT: ${file ? file.name : '未選択'}`;
    chatgptEl.style.color = file ? '#28a745' : '#666';
  }

  if (claudeEl) {
    const file = aiLogFileSelectors.claude.selectedFile;
    claudeEl.textContent = `🔮 Claude: ${file ? file.name : '未選択'}`;
    claudeEl.style.color = file ? '#28a745' : '#666';
  }

  if (geminiEl) {
    const file = aiLogFileSelectors.gemini.selectedFile;
    geminiEl.textContent = `✨ Gemini: ${file ? file.name : '未選択'}`;
    geminiEl.style.color = file ? '#28a745' : '#666';
  }
}

// 選択ファイルでAIタスク開始
async function useSelectedFile() {
  if (!selectedDropboxFile) {
    showFeedback('ファイルが選択されていません', 'warning');
    return;
  }

  const fileProcessStatus = document.getElementById('fileProcessStatus');
  const fileProcessIcon = document.getElementById('fileProcessIcon');
  const fileProcessText = document.getElementById('fileProcessText');

  try {
    // 処理状況を表示
    if (fileProcessStatus) {
      fileProcessIcon.textContent = '⏳';
      fileProcessText.textContent = `"${selectedDropboxFile.name}" を処理中...`;
      fileProcessStatus.style.display = 'block';
    }

    showFeedback('選択されたファイルでAI作業を開始します...', 'loading');

    // 1. ファイル形式の確認
    const fileExtension = selectedDropboxFile.name.split('.').pop().toLowerCase();
    const supportedFormats = ['csv', 'xlsx', 'xls', 'txt', 'json'];

    if (!supportedFormats.includes(fileExtension)) {
      throw new Error(`サポートされていないファイル形式です: ${fileExtension}`);
    }

    // 2. 選択されたDropboxファイル情報を既存システムに渡す
    const fileInfo = {
      name: selectedDropboxFile.name,
      path: selectedDropboxFile.path,
      size: selectedDropboxFile.size,
      modified: selectedDropboxFile.modified,
      type: fileExtension,
      source: 'dropbox'
    };

    // 3. 既存のAI処理システムとの統合
    await processSelectedDropboxFile(fileInfo);

    // 成功時の処理
    if (fileProcessStatus) {
      fileProcessIcon.textContent = '✅';
      fileProcessText.textContent = `"${selectedDropboxFile.name}" の処理が完了しました`;
    }

    showFeedback(`ファイル "${selectedDropboxFile.name}" の処理が完了しました`, 'success');

  } catch (error) {
    console.error('ファイル処理エラー:', error);

    // エラー時の処理
    if (fileProcessStatus) {
      fileProcessIcon.textContent = '❌';
      fileProcessText.textContent = `処理エラー: ${error.message}`;
    }

    showFeedback(`ファイル処理エラー: ${error.message}`, 'error');
  }
}

// Dropboxファイルを既存システムで処理
async function processSelectedDropboxFile(fileInfo) {
  console.log('Processing Dropbox file:', fileInfo);

  // 既存のスプレッドシート処理システムとの統合
  // 将来的にはここで実際のデータ処理を行う

  // 1. ファイル情報をローカルストレージに保存（既存システムで参照）
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.set({
      selectedDropboxFile: fileInfo,
      fileProcessingMode: 'dropbox'
    });
  }

  // 2. 既存のAIタスク処理に通知
  // グローバルイベントを発火して他のモジュールに通知
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dropboxFileSelected', {
      detail: fileInfo
    }));
  }

  // 3. UI更新：選択されたファイルでの作業開始を示す
  showFeedback(`Dropboxファイル "${fileInfo.name}" が処理対象として設定されました`, 'success');

  // 仮の処理時間（実際の処理に置き換え）
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// 選択されたDropboxのファイルを使用するファイルとして設定
async function saveToSelectedDropboxLocation() {
  try {
    // 選択されたアイテムを確認
    if (!selectedDropboxFile && !currentDropboxPath) {
      showFeedback('フォルダを選択してください', 'warning');
      return;
    }

    // フォルダパスを取得
    let targetPath = '';

    if (selectedDropboxFile) {
      // 明示的に選択されたアイテムがある場合
      if (selectedDropboxFile.type === 'folder') {
        targetPath = selectedDropboxFile.path;
      } else {
        // ファイルが選択されている場合は、その親フォルダを使用
        const pathParts = selectedDropboxFile.path.split('/');
        pathParts.pop(); // ファイル名を除去
        targetPath = pathParts.join('/') || '/';
      }
    } else {
      // 現在のパスをフォルダとして使用
      targetPath = currentDropboxPath || '/';
    }

    // ログレポート保存先を設定として保存
    await chrome.storage.local.set({
      dropboxLogPath: targetPath,
      dropboxLogEnabled: true,
      dropboxLogSettings: {
        path: targetPath,
        enabled: true,
        timestamp: new Date().toISOString(),
        folderName: targetPath.split('/').pop() || 'root'
      }
    });

    // 成功メッセージを表示
    const folderName = targetPath === '/' ? 'ルートフォルダ' : targetPath.split('/').pop();
    showFeedback(`✅ ログレポート保存先ファイルを "${folderName}" に設定しました`, 'success');

    // 設定表示を更新
    updateDropboxSettingsDisplay(targetPath);

    // 保存ボタンのテキストを一時的に変更
    const saveButton = document.getElementById('saveToDropbox');
    if (saveButton) {
      const originalText = saveButton.textContent;
      saveButton.textContent = '✅ ファイル設定済み';
      saveButton.style.background = '#28a745';
      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.style.background = '#28a745';
      }, 3000);
    }

  } catch (error) {
    showFeedback(`設定エラー: ${error.message}`, 'error');
  }
}

// Dropbox設定表示を更新
function updateDropboxSettingsDisplay(path) {
  const settingsDisplay = document.getElementById('dropboxLogSettings');
  if (settingsDisplay) {
    settingsDisplay.style.display = 'block';
    settingsDisplay.innerHTML = `
      <div style="padding: 12px; background: #d4edda; border-radius: 6px; margin-top: 10px; border-left: 4px solid #28a745; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 20px;">✅</span>
          <strong style="color: #155724; font-size: 14px;">ログレポート使用ファイル設定済み</strong>
        </div>
        <div style="background: white; padding: 8px; border-radius: 4px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">使用するファイルの保存先:</div>
          <div style="font-family: monospace; color: #0066cc; font-size: 13px; word-break: break-all;">
            📁 ${path === '/' ? '/（ルートフォルダ）' : path}
          </div>
        </div>
        <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
          💡 AIタスク完了後、このフォルダに自動でレポートが保存されます
        </div>
        <button
          onclick="clearDropboxLogSettings()"
          style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 0.2s;"
          onmouseover="this.style.background='#5a6268'"
          onmouseout="this.style.background='#6c757d'"
        >
          ❌ 設定をクリア
        </button>
      </div>
    `;
  }
}

// uploadLogToDropboxFolder関数は削除（不要な古い実装）
// 現在はAIタスク完了後にstream-processor-v2.jsから自動でレポートがアップロードされる

// ファイルサイズフォーマット
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ===== レガシー関数（無効化済み） =====
// 新しいDropboxファイル選択機能に移行済み

// ファイルクリア（レガシー）
function clearSelectedFiles() {
  console.log('レガシー機能: 新しいclearSelectedFile()を使用してください');
}

// パスプリセット選択（レガシー）
function handlePathPresetChange() {
  console.log('レガシー機能: 無効化済み');
}

// Dropboxへのファイルアップロード（レガシー）
async function uploadFilesToDropbox() {
  console.log('レガシー機能: 新しいファイル選択機能を使用してください');
  showFeedback('この機能は新しいファイル選択機能に移行済みです', 'info');
}

// Dropboxファイルアップロードのイベントリスナー初期化（レガシー機能）
function initDropboxFileUpload() {
  // 新しいファイル選択機能に移行済み
  // 古いアップロード機能は無効化
  console.log('Dropboxファイル選択機能に移行済み');
}

// Dropboxファイル選択UIの初期化
function initDropboxFileSelection() {
  console.log('[Dropbox] ファイル選択UI初期化開始');

  const refreshButton = document.getElementById('refreshDropboxFiles');
  const saveButton = document.getElementById('saveToDropbox');
  const useFileButton = document.getElementById('useSelectedFile');
  const clearFileButton = document.getElementById('clearSelectedFile');

  console.log('[Dropbox] UI要素確認:', {
    refreshButton: !!refreshButton,
    saveButton: !!saveButton,
    useFileButton: !!useFileButton,
    clearFileButton: !!clearFileButton
  });

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      console.log('[Dropbox] 選択ボタンがクリックされました');
      loadDropboxFiles();
    });
    console.log('[Dropbox] 選択ボタンのイベントリスナー設定完了');
  } else {
    console.error('[Dropbox] 選択ボタンが見つかりません');
  }

  if (saveButton) {
    saveButton.addEventListener('click', saveToSelectedDropboxLocation);
    console.log('[Dropbox] 保存ボタンのイベントリスナー設定完了');
  } else {
    console.warn('[Dropbox] 保存ボタンが見つかりません');
  }

  // アカウント再認証ボタンを追加（アカウント切り替え用）
  const refreshButtonParent = refreshButton?.parentElement;
  if (refreshButtonParent) {
    const reAuthButton = document.createElement('button');
    reAuthButton.textContent = '🔄 別のアカウントで再認証';
    reAuthButton.style.cssText = 'margin-left: 8px; padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;';
    reAuthButton.addEventListener('click', async () => {
      console.log('[Dropbox] 再認証開始');
      try {
        const service = await loadDropboxService();
        // 既存のトークンをクリア
        await service.logout();
        showFeedback('ログアウトしました。再度認証してください。', 'warning');
        // 認証状態を更新
        await updateDropboxAuthStatus();
      } catch (error) {
        console.error('[Dropbox] ログアウトエラー:', error);
        showFeedback(`ログアウトエラー: ${error.message}`, 'error');
      }
    });
    refreshButtonParent.appendChild(reAuthButton);
  }

  if (useFileButton) {
    useFileButton.addEventListener('click', useSelectedFile);
    console.log('[Dropbox] 作業開始ボタンのイベントリスナー設定完了');
  } else {
    console.warn('[Dropbox] 作業開始ボタンが見つかりません');
  }

  if (clearFileButton) {
    clearFileButton.addEventListener('click', clearSelectedFile);
    console.log('[Dropbox] 選択解除ボタンのイベントリスナー設定完了');
  } else {
    console.warn('[Dropbox] 選択解除ボタンが見つかりません');
  }

  // navigateToFolder関数をグローバルに公開（パンくずリストから使用）
  window.navigateToFolder = navigateToFolder;

  // 保存されたログ設定を読み込んで表示
  loadAndDisplayDropboxLogSettings();

  console.log('[Dropbox] ファイル選択UI初期化完了');
}

// Dropboxログ設定を読み込んで表示
async function loadAndDisplayDropboxLogSettings() {
  try {
    const settings = await chrome.storage.local.get(['dropboxLogEnabled', 'dropboxLogPath', 'dropboxLogSettings']);

    if (settings.dropboxLogEnabled && settings.dropboxLogPath) {
      updateDropboxSettingsDisplay(settings.dropboxLogPath);
    }
  } catch (error) {
    console.log('[Dropbox] ログ設定読み込みエラー:', error);
  }
}

// Dropboxログ設定をクリア
window.clearDropboxLogSettings = async function() {
  try {
    await chrome.storage.local.remove(['dropboxLogEnabled', 'dropboxLogPath', 'dropboxLogSettings']);

    const settingsDisplay = document.getElementById('dropboxLogSettings');
    if (settingsDisplay) {
      settingsDisplay.style.display = 'none';
      settingsDisplay.innerHTML = '';
    }

    showFeedback('ログレポート保存先設定をクリアしました', 'success');
  } catch (error) {
    console.error('[Dropbox] 設定クリアエラー:', error);
    showFeedback('設定クリアエラー', 'error');
  }
}

// AI別ログファイル選択のイベントリスナー設定
function initAiLogFileSelection() {
  console.log('[AI-Log] AI別ログファイル選択UI初期化開始');

  // AIタブのイベントリスナー設定
  const chatgptTab = document.getElementById('chatgptLogTab');
  const claudeTab = document.getElementById('claudeLogTab');
  const geminiTab = document.getElementById('geminiLogTab');

  if (chatgptTab) {
    chatgptTab.addEventListener('click', () => switchAiLogTab('chatgpt'));
  }
  if (claudeTab) {
    claudeTab.addEventListener('click', () => switchAiLogTab('claude'));
  }
  if (geminiTab) {
    geminiTab.addEventListener('click', () => switchAiLogTab('gemini'));
  }

  // 更新ボタンのイベントリスナー設定
  const refreshButton = document.getElementById('refreshAiLogFiles');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      console.log(`[AI-Log] 更新ボタンクリック: ${activeAiLogTab}`);
      loadAiLogFiles(activeAiLogTab);
    });
  }

  // 選択解除ボタンのイベントリスナー設定
  const clearButton = document.getElementById('clearAiSelectedFile');
  if (clearButton) {
    clearButton.addEventListener('click', clearAiSelectedFile);
  }

  // ダウンロードボタンのイベントリスナー設定
  const downloadButton = document.getElementById('downloadAiSelectedFile');
  if (downloadButton) {
    downloadButton.addEventListener('click', downloadAiSelectedFile);
  }

  // グローバル関数を公開（パンくずリストから使用）
  window.navigateToAiLogFolder = navigateToAiLogFolder;

  // DropboxConfigからAI別フォルダパスを読み込み
  loadAiLogFolderPaths();

  // 保存されたAI別ログファイル選択を読み込み
  loadAiLogFileSelections();

  // 初期表示（ChatGPTタブ）
  updateAiLogUI('chatgpt');

  console.log('[AI-Log] AI別ログファイル選択UI初期化完了');
}

// DOMContentLoadedイベントでDropbox設定を初期化
document.addEventListener('DOMContentLoaded', () => {
  // 少し遅延させてDOM要素が確実に存在することを保証
  setTimeout(() => {
    initDropboxSettings();
    initDropboxAuth();
    initDropboxFileUpload();
    initDropboxFileSelection();
    initAiLogFileSelection(); // AI別ログファイル選択機能を初期化
  }, 100);
});

// ===== グローバル関数公開 =====
// 他のモジュールから使用できるように関数をwindowオブジェクトに公開
window.injectAutomationScripts = injectAutomationScripts;
