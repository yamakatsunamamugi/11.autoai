// ui-controller.js - AutoAI Minimal コントロールパネル
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
    console.log('[bringWindowToFront] ウィンドウを最前面に表示開始');
    const currentWindow = await chrome.windows.getCurrent();
    console.log('[bringWindowToFront] 現在のウィンドウID:', currentWindow.id);
    
    await chrome.windows.update(currentWindow.id, {
      focused: true,
      drawAttention: true,
      state: 'normal'
    });
    
    console.log('[bringWindowToFront] ウィンドウ最前面表示完了');
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
    
    // 各AIのステータスを更新
    updateAIStatusCard('chatgpt', config.chatgpt);
    updateAIStatusCard('claude', config.claude);
    updateAIStatusCard('gemini', config.gemini);
    
    // 統合表示ボタンを追加
    addIntegratedViewButton();
    
    // データクリーンアップボタンも追加
    addDataCleanupButton();
  });
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
        console.log('✅ 古いデータをクリアしました');
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
        console.log('[UI] データクリーンアップを実行中...');
        const hasChanges = await window.AIPersistence.cleanupExistingData();
        if (hasChanges) {
          console.log('[UI] データクリーンアップが完了しました。新しいデータを取得します...');
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
      
      // デバッグログ: 実際のデータ構造を確認
      console.log(`[UI Debug] ${col.key} ${col.dataKey} データ:`, items);
      
      return items.map((item, index) => {
        let itemName = '';
        let isSelected = false;
        
        // 新しいシンプルなフォーマット（文字列配列）の処理
        if (typeof item === 'string') {
          itemName = item;
          isSelected = false;
        } else {
          // 旧フォーマットとの互換性（デバッグ情報付き）
          console.log(`[UI Debug] レガシーデータ検出 ${col.key} ${col.dataKey}[${index}]:`, item);
          
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
              console.log(`[UI Debug] Claude説明文除去: "${originalName}" → "${itemName}"`);
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
const startIntegratedTestBtn = document.getElementById(
  "startIntegratedTestBtn",
);
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
  const statusText = statusDiv.querySelector(".status-text");
  const statusIcon = statusDiv.querySelector(".status-icon");

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
  // 既存のクラスをクリア
  loadFeedback.className = "feedback-message";

  // メッセージとタイプを設定
  loadFeedback.textContent = message;
  loadFeedback.classList.add(type);

  // アニメーションで表示
  setTimeout(() => {
    loadFeedback.classList.add("show");
  }, 10);

  // 自動非表示を無効化（メッセージはずっと表示）
  // if (type !== "loading") {
  //   setTimeout(() => {
  //     loadFeedback.classList.remove("show");
  //   }, 5000);
  // }
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
function addUrlInput(value = "") {
  // datalist方式では不要
  return;
}

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

// ===== イベントリスナー: URL入力欄追加 =====
// datalist方式では不要なため削除
// const addUrlBtn = document.getElementById("addUrlBtn");
// if (addUrlBtn) {
//   addUrlBtn.addEventListener("click", () => {
//     addUrlInput();
//   });
// }

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
/**
 * 列追加ボタンのイベントリスナー
 * 
 * 【機能概要】
 * スプレッドシートに必要な列（ログ列、回答列など）を自動で追加する機能
 * 
 * 【動作の流れ】
 * 1. ユーザーが「列追加」ボタンをクリック
 * 2. 入力されたスプレッドシートURLを取得
 * 3. background.jsの既存のSpreadsheetAutoSetupクラスを呼び出し
 * 4. プロンプト列の前後に必要な列を自動追加
 * 5. 結果をユーザーに表示
 * 
 * 【追加される列】
 * - ログ列: プロンプト列の左側に配置
 * - 回答列: プロンプト列の右側に配置
 *   - 通常AI: 1つの回答列
 *   - 3種類AI: ChatGPT回答、Claude回答、Gemini回答の3列
 * 
 * 【依存関係】
 * - background.js: executeAutoSetupメッセージハンドラ
 * - SpreadsheetAutoSetup: src/services/spreadsheet-auto-setup.js
 * 
 * @since 2025-08-23 列追加ボタン機能として追加
 */
const addColumnsBtn = document.getElementById("addColumnsBtn");
if (addColumnsBtn) {
  addColumnsBtn.addEventListener("click", async () => {
    console.log("列追加ボタンがクリックされました");
    
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
      updateStatus("スプレッドシートのURLを入力してください", "error");
      return;
    }
    
    // ボタンを無効化（二重クリック防止）
    addColumnsBtn.disabled = true;
    updateStatus("列を追加中...", "loading");
    
    try {
      // background.jsに列追加実行メッセージを送信
      // SpreadsheetAutoSetup.executeAutoSetup()が実行される
      const response = await chrome.runtime.sendMessage({
        action: "executeAutoSetup",
        urls: urls
      });
      
      if (response && response.success) {
        if (response.hasAdditions) {
          // 列が追加された場合
          updateStatus(`${response.addedColumns}個の列を追加しました`, "success");
        } else {
          // 必要な列が既に存在する場合
          updateStatus("必要な列は既に存在します", "success");
        }
      } else {
        throw new Error(response?.error || "列追加に失敗しました");
      }
    } catch (error) {
      console.error("列追加エラー:", error);
      updateStatus(`エラー: ${error.message}`, "error");
    } finally {
      // ボタンを再度有効化
      addColumnsBtn.disabled = false;
    }
  });
}

// Screen Wake Lock API用の変数
let wakeLock = null;

startBtn.addEventListener("click", async () => {
  console.log("【本番実行】ストリーミング処理開始ボタンが押されました。");

  // Screen Wake Lock APIでスリープ防止（UIから画面を明るく保つ）
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('🌞 Screen Wake Lock有効化（画面を明るく保つ）');
    } catch (err) {
      console.log('Screen Wake Lock失敗:', err.name, err.message);
    }
  }

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
    // Wake Lockを解除
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
    return;
  }
  
  console.log(`処理するURL数: ${urls.length}`, urls);

  // ボタンの状態を更新
  startBtn.disabled = true;
  stopBtn.disabled = false;
  
  // 複数URLを並列処理
  await processMultipleUrls(urls);
});

// 複数URLを並列処理する関数
async function processMultipleUrls(urls) {
  if (!urls || urls.length === 0) {
    console.log("処理するURLがありません");
    updateStatus("処理するURLがありません", "error");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }
  
  const currentUrl = urls[0]; // 最初のURLのみ処理（複数URL同時処理は未実装）
  console.log(`処理中: ${currentUrl}`);
  updateStatus(`処理中: ${currentUrl.substring(0, 50)}...`, "loading");

  // まずスプレッドシートが読み込まれているか確認
  const storageResult = await chrome.storage.local.get(['savedTasks']);
  let savedTasks = storageResult.savedTasks;
  
  if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
    // スプレッドシートが読み込まれていない場合、自動的に読み込む
    console.log("スプレッドシートが未読み込み。自動的に読み込みます。");
    updateStatus("スプレッドシートを自動読み込み中...", "loading");
    
    try {
      // loadSheetsBtnのクリック処理と同じロジックを実行
      const loadResponse = await chrome.runtime.sendMessage({
        action: "loadSpreadsheets",
        urls: [currentUrl],
      });

      if (!loadResponse || !loadResponse.success) {
        throw new Error("スプレッドシート読み込みエラー: " + (loadResponse?.error || "不明なエラー"));
      }

      console.log("スプレッドシート読み込み成功。タスクを生成しました。");
      console.log("loadResponse内容:", loadResponse);
      
      // タスクはストレージに保存されているので、少し待ってから取得
      await new Promise(resolve => setTimeout(resolve, 1000));
      const updatedStorage = await chrome.storage.local.get(['savedTasks']);
      
      if (updatedStorage.savedTasks && updatedStorage.savedTasks.tasks && updatedStorage.savedTasks.tasks.length > 0) {
        // ストレージから取得
        savedTasks = updatedStorage.savedTasks;
        console.log("ストレージからタスク取得成功:", savedTasks.tasks.length, "件");
      } else {
        // それでも取得できない場合はTaskQueueから直接取得
        const taskQueue = new (await import("../features/task/queue.js")).default();
        savedTasks = await taskQueue.loadTaskList();
        
        if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
          throw new Error("タスクなし");
        }
      }
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
    
    // タスクがまだない場合は、スプレッドシートを読み込む
    if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
      const loadResponse = await chrome.runtime.sendMessage({
        action: "loadSpreadsheet",
        url: currentUrl,
      });

      console.log("[UI] loadSpreadsheet レスポンス:", loadResponse);

      if (!loadResponse || !loadResponse.success) {
        throw new Error(loadResponse?.error || "スプレッドシート読み込みエラー");
      }

      // 少し待ってからタスクを取得
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // タスクQueueから保存されたタスクを取得して処理
      const taskQueue = new (await import("../features/task/queue.js")).default();
      savedTasks = await taskQueue.loadTaskList();
    }

    console.log("[UI] 保存されたタスク:", savedTasks);
    console.log("[UI] タスク数:", savedTasks?.tasks?.length || 0);
    
    // AI列数の正しい計算（savedTasksから取得）
    const aiColumnsCount = savedTasks?.aiColumns ? 
      (Array.isArray(savedTasks.aiColumns) ? 
        savedTasks.aiColumns.length : 
        Object.keys(savedTasks.aiColumns).length
      ) : 0;
    console.log("[UI] AI列数:", aiColumnsCount);

    if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
      console.error(
        "[UI] タスクが見つかりません。AI列情報:",
        savedTasks?.aiColumns,
        "AI列数:",
        aiColumnsCount
      );
      throw new Error("実行可能なタスクがありません");
    }

    // タスクが生成されたら、ストリーミング処理を開始
    // 統合AIテストと同じstreamProcessTaskListを使用（統一化）
    const response = await Promise.race([
      chrome.runtime.sendMessage({
        action: "streamProcessTaskList",
        taskList: savedTasks, // TaskListオブジェクトをそのまま送信
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
      console.log("🔧 [Debug] メッセージングエラーが発生:", error.message);
      console.log("🔧 [Debug] バックグラウンド処理は継続している可能性があります");
      console.log("🔧 [Debug] タスクリスト:", savedTasks?.tasks?.length, "件のタスク");
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

  // Screen Wake Lockを解除
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
    console.log('🌞 Screen Wake Lock解除');
  }

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
    console.log("【テスト実行】AI Orchestratorを開きます");
    
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
      console.log("📋 タスクリストをChrome Storageに保存しました:", taskData);
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
      console.log("✅ AI Orchestratorが開かれました");
      updateStatus("AI Orchestratorを開きました", "success");
      
      if (taskList) {
        console.log(`📊 タスク統計: 総数=${taskList.tasks.length}`);
      } else {
        console.log("ℹ️ タスクリストなしで手動モードで開きます");
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
      await new Promise(resolve => setTimeout(resolve, 3000));
      
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
      await new Promise(resolve => setTimeout(resolve, 3000));
      
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
      await new Promise(resolve => setTimeout(resolve, 3000));
      
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

// ===== コントローラー統合管理システム =====
let controllerManager = null;

// コントローラーマネージャーの動的読み込み
async function loadControllerManager() {
  if (controllerManager) return controllerManager;
  
  try {
    // モジュールインポートを試してみる
    const module = await import('./controllers/index.js');
    controllerManager = module.default;
    console.log('✅ コントローラーマネージャーをモジュールとして読み込み');
    return controllerManager;
  } catch (error) {
    console.error('❌ コントローラーマネージャーの読み込み失敗:', error);
    throw error;
  }
}

// ===== イベントリスナー: AI変更検出システム =====
aiDetectionSystemBtn.addEventListener("click", async () => {
  try {
    const manager = await loadControllerManager();
    const controller = await manager.loadController('aiDetection');
    
    if (controller && controller.runAIDetectionSystem) {
      await controller.runAIDetectionSystem(updateStatus, injectAutomationScripts);
    } else {
      console.error('❌ AI検出コントローラーが正しく読み込まれていません');
      updateStatus('AI検出コントローラー読み込みエラー', 'error');
    }
  } catch (error) {
    console.error('AI検出制御エラー:', error);
    updateStatus('AI検出制御エラー', 'error');
  }
});


// ===== イベントリスナー: AIセレクタ変更検出システム =====
aiSelectorMutationSystemBtn.addEventListener("click", async () => {
  try {
    const manager = await loadControllerManager();
    const controller = await manager.loadController('mutationObserver');
    
    if (controller && controller.toggleMutationObserverMonitoring) {
      await controller.toggleMutationObserverMonitoring(aiSelectorMutationSystemBtn, updateStatus);
    } else {
      console.error('❌ MutationObserverコントローラーが正しく読み込まれていません');
      updateStatus('MutationObserverコントローラー読み込みエラー', 'error');
    }
  } catch (error) {
    console.error('MutationObserver制御エラー:', error);
    updateStatus('MutationObserver制御エラー', 'error');
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
    script.src = chrome.runtime.getURL('automations/test-runner-chrome.js');
    
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
    await new Promise(resolve => setTimeout(resolve, 500));
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ ${site.name}ウィンドウ作成エラー:`, error);
    }
  }
  
  console.log(`🎯 4分割レイアウト作成完了: ${createdTabs.length}個のウィンドウ`);
  return createdTabs;
}

// AIサイトをチェックして必要に応じて開く
async function checkAndOpenAISites() {
  const aiSites = [
    { name: 'ChatGPT', url: 'https://chatgpt.com/', pattern: /chatgpt\.com|chat\.openai\.com/ },
    { name: 'Claude', url: 'https://claude.ai/', pattern: /claude\.ai/ },
    { name: 'Gemini', url: 'https://gemini.google.com/app', pattern: /gemini\.google\.com|bard\.google\.com/ }
  ];
  
  try {
    // 現在開いているタブを取得
    const tabs = await new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tabs);
        }
      });
    });
    
    // どのAIサイトが開かれているかチェック
    const openAISites = aiSites.filter(site => 
      tabs.some(tab => site.pattern.test(tab.url))
    );
    
    console.log(`✅ 既に開かれているAIサイト: ${openAISites.map(s => s.name).join(', ') || 'なし'}`);
    
    let targetTabs = [];
    
    // 一つもAIサイトが開かれていない場合は全て開く
    if (openAISites.length === 0) {
      console.log("🌐 AIサイトを開きます...");
      updateStatus("AIサイト（ChatGPT、Claude、Gemini）を開いています...", "loading");
      
      for (const site of aiSites) {
        try {
          const tab = await new Promise((resolve, reject) => {
            chrome.tabs.create({ url: site.url, active: false }, (tab) => {
              if (chrome.runtime.lastError) {
                console.error(`❌ ${site.name}を開けませんでした:`, chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
              } else {
                console.log(`✅ ${site.name}を開きました (TabID: ${tab.id})`);
                resolve(tab);
              }
            });
          });
          targetTabs.push(tab);
          // 各サイト間で少し待機
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`❌ ${site.name}開始エラー:`, error);
        }
      }
      
      return { opened: true, tabs: targetTabs }; // AIサイトを開いた
    } else {
      // 既に開かれているAIサイトがある場合は、そのタブをアクティブにする
      const existingTabs = openAISites.map(site => {
        const tab = tabs.find(tab => site.pattern.test(tab.url));
        return tab;
      }).filter(Boolean);
      
      if (existingTabs.length > 0) {
        chrome.tabs.update(existingTabs[0].id, { active: true });
        console.log(`🎯 ${openAISites[0].name}タブをアクティブにしました (TabID: ${existingTabs[0].id})`);
      }
      return { opened: false, tabs: existingTabs }; // 既に開かれている
    }
  } catch (error) {
    console.error("❌ AIサイトチェック・オープンエラー:", error);
    updateStatus("AIサイト確認エラー", "error");
    return { opened: false, tabs: [] };
  }
}

// ===== イベントリスナー: テスト実行（統合AIテスト開始） =====
/**
 * 【テスト用ボタン】
 * AI Orchestratorを開いてテスト環境を起動します。
 * 本番実行は「処理を開始」ボタンを使用してください。
 */
startIntegratedTestBtn.addEventListener("click", async () => {
  try {
    const manager = await loadControllerManager();
    const controller = await manager.loadController('integratedTest');
    
    if (controller && controller.runIntegratedAITest) {
      await controller.runIntegratedAITest();
    } else {
      console.error('❌ 統合テストコントローラーが正しく読み込まれていません');
      updateStatus('統合テストコントローラー読み込みエラー', 'error');
    }
  } catch (error) {
    console.error('統合テスト制御エラー:', error);
    updateStatus('統合テスト制御エラー', 'error');
  }
});

// ===== イベントリスナー: レポート生成 =====
const generateReportBtn = document.getElementById("generateReportBtn");
generateReportBtn.addEventListener("click", async () => {
  await bringWindowToFront(); // ウィンドウを最前面に表示
  try {
    const manager = await loadControllerManager();
    const controller = await manager.loadController('reportTest');
    
    if (controller && controller.runReportTest) {
      controller.runReportTest(updateStatus);
    } else {
      console.error('❌ レポートテストコントローラーが正しく読み込まれていません');
      updateStatus('レポートテストコントローラー読み込みエラー', 'error');
    }
  } catch (error) {
    console.error('レポートテスト制御エラー:', error);
    updateStatus('レポートテスト制御エラー', 'error');
  }
});

// ===== イベントリスナー: ウィンドウ作成テスト =====
const windowCreationTestBtn = document.getElementById("windowCreationTestBtn");
windowCreationTestBtn.addEventListener("click", async () => {
  await bringWindowToFront(); // ウィンドウを最前面に表示
  try {
    const manager = await loadControllerManager();
    const controller = await manager.loadController('windowCreationTest');
    
    if (controller && controller.runWindowCreationTest) {
      controller.runWindowCreationTest(updateStatus);
    } else {
      console.error('❌ ウィンドウ作成テストコントローラーが正しく読み込まれていません');
      updateStatus('ウィンドウ作成テストコントローラー読み込みエラー', 'error');
    }
  } catch (error) {
    console.error('ウィンドウ作成テスト制御エラー:', error);
    updateStatus('ウィンドウ作成テスト制御エラー', 'error');
  }
});

// ===== イベントリスナー: スプレッドシート読み込みテスト =====
const showTaskListTestBtn = document.getElementById("showTaskListTestBtn");
showTaskListTestBtn.addEventListener("click", async () => {
  try {
    const manager = await loadControllerManager();
    const controller = await manager.loadController('spreadsheetTest');
    
    if (controller && controller.runSpreadsheetTest) {
      controller.runSpreadsheetTest(updateStatus);
    } else {
      console.error('❌ スプレッドシートテストコントローラーが正しく読み込まれていません');
      updateStatus('スプレッドシートテストコントローラー読み込みエラー', 'error');
    }
  } catch (error) {
    console.error('スプレッドシートテスト制御エラー:', error);
    updateStatus('スプレッドシートテスト制御エラー', 'error');
  }
});

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
    console.log(`🔍 Chrome Storage全体のデータ:`, result.ai_selector_data);
    
    // aiTypeは'chatgpt', 'claude', 'gemini'の小文字で渡される
    const storedData = result.ai_selector_data?.[aiType];
    console.log(`🔍 ${aiType}の保存データ:`, storedData);
    
    // セレクタデータを取得（selectorDataプロパティの中にある場合とない場合の両方に対応）
    const storedSelectors = storedData?.selectorData || storedData;
    console.log(`🔍 ${aiType}のセレクタデータ:`, storedSelectors);
    
    // 詳細なデバッグ情報を追加
    if (storedSelectors) {
      console.log(`🔍 ${aiType} セレクタキー:`, Object.keys(storedSelectors));
      console.log(`🔍 ${aiType} input値:`, storedSelectors.input);
      console.log(`🔍 ${aiType} send値:`, storedSelectors.send);
      console.log(`🔍 ${aiType} stop値:`, storedSelectors.stop);
      console.log(`🔍 ${aiType} response値:`, storedSelectors.response);
    }
    
    // ストレージにデータがある場合は優先的に表示
    if (storedSelectors && (storedSelectors.input || storedSelectors.send || storedSelectors.response || storedSelectors.stop)) {
      console.log(`📊 Chrome Storageからセレクタデータを取得: ${aiType}`, storedSelectors);
      
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

// 初期表示（ChatGPTタブ）
document.addEventListener('DOMContentLoaded', () => {
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

// ===== イベントリスナー: AIステータス表示 =====
const showAIStatusBtn = document.getElementById("showAIStatusBtn");
if (showAIStatusBtn) {
  showAIStatusBtn.addEventListener("click", async () => {
    await bringWindowToFront(); // ウィンドウを最前面に表示
    try {
      const manager = await loadControllerManager();
      const controller = await manager.loadController('aiStatus');
      
      if (controller && controller.showAIStatus) {
        controller.showAIStatus(updateStatus);
      } else {
        console.error('❌ AIステータスコントローラーが正しく読み込まれていません');
        updateStatus('AIステータスコントローラー読み込みエラー', 'error');
      }
    } catch (error) {
      console.error('AIステータス制御エラー:', error);
      updateStatus('AIステータス制御エラー', 'error');
    }
  });
}

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
    
    // メッセージ
    const messageSpan = document.createElement('span');
    messageSpan.textContent = ` ${log.message}`;
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
console.log('📝 ログビューアー初期化完了');

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

// ===== URLボタンのイベントリスナー（旧実装の削除） =====
// 以下のquickSaveBtn関連は新実装では不要
/*
const quickSaveBtn = document.getElementById("quickSaveBtn");
if (quickSaveBtn) {
  quickSaveBtn.addEventListener("click", () => {
    const url = spreadsheetInput.value.trim();
    
    if (!url) {
      showFeedback("URLを入力してください", "warning");
      return;
    }
    
    // URLのバリデーション
    if (!url.includes("docs.google.com/spreadsheets")) {
      showFeedback("有効なGoogleスプレッドシートURLを入力してください", "error");
      return;
    }
    
    // 名前入力ダイアログを表示
    const name = prompt("保存名を入力してください（空欄の場合はURLの一部が使用されます）");
    
    if (name === null) {
      // キャンセルされた場合
      return;
    }
    
    // 名前が空の場合はスプレッドシートIDを使用
    let saveName = name.trim();
    if (!saveName) {
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      saveName = match ? `シート_${match[1].substring(0, 8)}` : "新規シート";
    }
    
    // 保存処理
    chrome.storage.local.get(['savedSpreadsheets'], (result) => {
      let savedUrls = result.savedSpreadsheets || [];
      
      // 既存のURLかチェック
      const existingIndex = savedUrls.findIndex(item => item.url === url);
      if (existingIndex !== -1) {
        // 既存の場合は更新
        savedUrls[existingIndex].name = saveName;
        showFeedback("URLを更新しました", "success");
      } else {
        // 新規追加
        savedUrls.push({
          url: url,
          name: saveName,
          createdAt: new Date().toISOString()
        });
        showFeedback("URLを保存しました", "success");
      }
      
      // ストレージに保存
      chrome.storage.local.set({ savedSpreadsheets: savedUrls }, () => {
        loadSavedUrls(); // データリストを更新
        
        // ボタンのアニメーション
        quickSaveBtn.style.background = "#218838";
        quickSaveBtn.innerHTML = "<span>✓</span>";
        setTimeout(() => {
          quickSaveBtn.style.background = "#28a745";
          quickSaveBtn.innerHTML = "<span>+</span>";
        }, 1000);
      });
    });
  });
}
*/

// 旧実装のcancelSaveBtnは削除済み（新実装のcancelSaveUrlBtnを使用）

// ストレージの変更を監視（AI変更検出システムが実行されたときに更新）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.ai_config_persistence) {
    updateAIStatus();
  }
});

// ===== テストボタンのイベントハンドラー =====
/**
 * テスト機能のボタンハンドラー
 * 各テスト機能でウィンドウを最前面に表示する
 */

// 1. モデル・機能変更検出システム
const testModelDetectionBtn = document.getElementById('testModelDetectionBtn');
if (testModelDetectionBtn) {
  testModelDetectionBtn.addEventListener('click', async () => {
    console.log('🔍 モデル・機能変更検出システムテスト開始');
    await bringWindowToFront();
    
    updateStatus('モデル・機能変更検出を実行中...', 'loading');
    
    try {
      // AI検出処理を実行
      const detectionResults = await detectAllAIConfigurations();
      
      if (detectionResults && detectionResults.length > 0) {
        console.log('✅ モデル・機能変更検出完了:', detectionResults);
        updateStatus('モデル・機能変更検出が完了しました', 'success');
        
        // 結果をログに表示
        detectionResults.forEach(result => {
          if (result) {
            addLogEntry(`${result.aiType || 'Unknown AI'}: モデル検出完了`, 'system');
          }
        });
      } else {
        updateStatus('検出結果がありません', 'warning');
      }
    } catch (error) {
      console.error('モデル検出エラー:', error);
      updateStatus('モデル検出エラー: ' + error.message, 'error');
    }
  });
}

// 2. AIセレクタ変更検出システム
const testAiSelectorBtn = document.getElementById('testAiSelectorBtn');
if (testAiSelectorBtn) {
  testAiSelectorBtn.addEventListener('click', async () => {
    console.log('🎯 AIセレクタ変更検出システムテスト開始');
    await bringWindowToFront();
    
    updateStatus('AIセレクタ変更検出を実行中...', 'loading');
    
    try {
      // バックグラウンドにメッセージ送信
      const response = await chrome.runtime.sendMessage({
        action: 'testAiSelector'
      });
      
      if (response && response.success) {
        updateStatus('AIセレクタ変更検出が完了しました', 'success');
        addLogEntry('AIセレクタ変更検出完了', 'system');
      } else {
        updateStatus('AIセレクタ検出失敗', 'error');
      }
    } catch (error) {
      console.error('AIセレクタ検出エラー:', error);
      updateStatus('AIセレクタ検出エラー: ' + error.message, 'error');
    }
  });
}

// 3. スプレッドシート読み込みテスト
const testSpreadsheetLoadingBtn = document.getElementById('testSpreadsheetLoadingBtn');
if (testSpreadsheetLoadingBtn) {
  testSpreadsheetLoadingBtn.addEventListener('click', async () => {
    console.log('📊 スプレッドシート読み込みテスト開始');
    await bringWindowToFront();
    
    updateStatus('スプレッドシート読み込みテスト中...', 'loading');
    
    try {
      // スプレッドシートURL入力欄から値を取得
      const urlInputs = document.querySelectorAll('.spreadsheet-url-input');
      const urls = [];
      
      urlInputs.forEach((input) => {
        const url = input.value.trim();
        if (url) {
          urls.push(url);
        }
      });
      
      if (urls.length === 0) {
        updateStatus('URLを入力してください', 'warning');
        return;
      }
      
      // スプレッドシート読み込み
      const response = await chrome.runtime.sendMessage({
        action: 'loadSpreadsheets',
        urls: urls
      });
      
      if (response && response.success) {
        updateStatus(`スプレッドシート読み込み完了: ${urls.length}件`, 'success');
        addLogEntry(`スプレッドシート${urls.length}件を読み込みました`, 'system');
      } else {
        updateStatus('スプレッドシート読み込み失敗', 'error');
      }
    } catch (error) {
      console.error('スプレッドシート読み込みエラー:', error);
      updateStatus('読み込みエラー: ' + error.message, 'error');
    }
  });
}

// 4. ウィンドウ作成テスト
// 注意: windowCreationTestBtnは既に3146行目で定義・実装済みだが、
// IDが異なる（testWindowCreationBtn vs windowCreationTestBtn）ため、これは別のボタン
const testWindowCreationBtn = document.getElementById('testWindowCreationBtn');
if (testWindowCreationBtn) {
  testWindowCreationBtn.addEventListener('click', async () => {
    console.log('🪟 ウィンドウ作成テスト開始');
    await bringWindowToFront();
    
    updateStatus('テストウィンドウを作成中...', 'loading');
    
    try {
      // テストウィンドウ作成
      const testWindow = await chrome.windows.create({
        url: 'https://chatgpt.com',
        type: 'popup',
        width: 800,
        height: 600,
        focused: true,  // 最前面に表示
        left: 100,
        top: 100
      });
      
      updateStatus('テストウィンドウを作成しました', 'success');
      addLogEntry(`ウィンドウID: ${testWindow.id}を作成`, 'system');
      
      // 3秒後に最前面に再度表示
      setTimeout(async () => {
        await chrome.windows.update(testWindow.id, {
          focused: true,
          drawAttention: true
        });
        addLogEntry('ウィンドウを最前面に表示', 'system');
      }, 3000);
      
    } catch (error) {
      console.error('ウィンドウ作成エラー:', error);
      updateStatus('ウィンドウ作成エラー: ' + error.message, 'error');
    }
  });
}

// 5. 統合AIテスト開始
const testIntegratedAiBtn = document.getElementById('testIntegratedAiBtn');
if (testIntegratedAiBtn) {
  testIntegratedAiBtn.addEventListener('click', async () => {
    console.log('🤖 統合AIテスト開始');
    await bringWindowToFront();
    
    updateStatus('統合AIテストを開始中...', 'loading');
    
    try {
      // バックグラウンドに統合テスト開始を通知
      const response = await chrome.runtime.sendMessage({
        action: 'startIntegratedTest',
        testMode: true
      });
      
      if (response && response.success) {
        updateStatus('統合AIテストを開始しました', 'success');
        addLogEntry('統合AIテスト開始', 'system');
        
        // 各AIのウィンドウを順番に最前面に表示
        if (response.windows) {
          for (const windowInfo of response.windows) {
            await chrome.windows.update(windowInfo.id, {
              focused: true,
              drawAttention: true
            });
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } else {
        updateStatus('統合AIテスト開始失敗', 'error');
      }
    } catch (error) {
      console.error('統合AIテストエラー:', error);
      updateStatus('テストエラー: ' + error.message, 'error');
    }
  });
}

// 6. レポート化テスト
// 注意: generateReportBtnは既に3127行目で定義・実装済み

// 7. AIステータス表示
// 注意: showAIStatusBtnは既に3514行目で定義・実装済み

// ===== グローバル関数公開 =====
// 他のモジュールから使用できるように関数をwindowオブジェクトに公開
window.injectAutomationScripts = injectAutomationScripts;
