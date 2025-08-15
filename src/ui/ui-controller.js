// window.js - AutoAI Minimal コントロールパネル
//
// このファイルは、Chrome拡張機能のメインUIを管理します。
// ユーザーがスプレッドシートを設定し、AI処理を制御するためのインターフェースを提供します。

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
  integratedBtn.textContent = '📊 統合表示';
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
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e9ecef;
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
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
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
const urlInputsContainer = document.getElementById("urlInputs");
const addUrlBtn = document.getElementById("addUrlBtn");
const loadSheetsBtn = document.getElementById("loadSheetsBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const deleteAnswersBtn = document.getElementById("deleteAnswersBtn");
const startIntegratedTestBtn = document.getElementById(
  "startIntegratedTestBtn",
);
const aiDetectionSystemBtn = document.getElementById("aiDetectionSystemBtn");
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
  const groups = urlInputsContainer.querySelectorAll(".url-input-group");
  groups.forEach((group, index) => {
    const removeBtn = group.querySelector(".btn-remove");
    // 入力欄が2つ以上ある場合のみ削除ボタンを表示
    if (groups.length > 1) {
      removeBtn.style.display = "block";
    } else {
      removeBtn.style.display = "none";
    }
  });
}

/**
 * URL入力欄を動的に追加
 * @param {string} value - 初期値（省略可能）
 */
function addUrlInput(value = "") {
  // 入力欄グループを作成
  const group = document.createElement("div");
  group.className = "url-input-group";

  // URL入力欄を作成
  const input = document.createElement("input");
  input.type = "url";
  input.className = "url-input";
  input.placeholder = "https://docs.google.com/spreadsheets/d/...";
  input.value = value;

  // 削除ボタンを作成
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "×";
  removeBtn.onclick = () => {
    group.remove();
    updateRemoveButtons();
    saveUrls(); // 削除時に自動保存
  };

  // 要素を組み立てて追加
  group.appendChild(input);
  group.appendChild(removeBtn);
  urlInputsContainer.appendChild(group);

  updateRemoveButtons();
}

/**
 * 入力されたURLをローカルストレージに保存
 * 空の値は除外して保存する
 */
function saveUrls() {
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);
  localStorage.setItem("spreadsheetUrls", JSON.stringify(urls));
}

// ===== イベントリスナー: URL入力欄追加 =====
addUrlBtn.addEventListener("click", () => {
  addUrlInput();
});

// ===== イベントリスナー: スプレッドシート読み込み =====
loadSheetsBtn.addEventListener("click", async () => {
  // 入力されたURLを収集（空欄は除外）
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  // バリデーション：URLが入力されているか確認
  if (urls.length === 0) {
    updateStatus("URLを入力してください", "error");
    return;
  }

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
      saveUrls(); // 成功時にURLを保存

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

// ===== イベントリスナー: ストリーミング処理開始 =====
startBtn.addEventListener("click", async () => {
  console.log("ストリーミング処理開始ボタンが押されました。");

  // 入力されたURLを収集（空欄は除外）
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  // バリデーション：URLが入力されているか確認
  if (urls.length === 0) {
    updateStatus("スプレッドシートURLを入力してください", "error");
    return;
  }

  updateStatus("🌊 並列ストリーミング処理を開始しています...", "loading");

  // ボタンの状態を更新
  startBtn.disabled = true;
  stopBtn.disabled = false;

  try {
    // 最初のURLから情報を抽出
    const spreadsheetUrl = urls[0];
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    // gidを抽出
    const gidMatch = spreadsheetUrl.match(/[#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    // まずスプレッドシートを読み込んでタスクを生成
    const loadResponse = await chrome.runtime.sendMessage({
      action: "loadSpreadsheet",
      url: spreadsheetUrl,
    });

    console.log("[UI] loadSpreadsheet レスポンス:", loadResponse);

    if (!loadResponse || !loadResponse.success) {
      throw new Error(loadResponse?.error || "スプレッドシート読み込みエラー");
    }

    // タスクQueueから保存されたタスクを取得して処理
    const taskQueue = new (await import("../features/task/queue.js")).default();
    const savedTasks = await taskQueue.loadTaskList();

    console.log("[UI] 保存されたタスク:", savedTasks);
    console.log("[UI] タスク数:", savedTasks?.tasks?.length || 0);
    console.log("[UI] AI列数:", loadResponse?.aiColumns?.length || 0);

    if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
      console.error(
        "[UI] タスクが見つかりません。AI列情報:",
        loadResponse?.aiColumns,
      );
      throw new Error("実行可能なタスクがありません");
    }

    // タスクが生成されたら、ストリーミング処理を開始
    const response = await chrome.runtime.sendMessage({
      action: "streamProcessTasks",
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: spreadsheetUrl,
      gid: gid,
      tasks: savedTasks.tasks,
      columnMapping: loadResponse.columnMapping || {},
      testMode: false,
    });

    if (response && response.success) {
      updateStatus("🌊 並列ストリーミング処理実行中", "running");
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
    updateStatus("ストリーミング開始エラー", "error");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showFeedback("ストリーミング処理でエラーが発生しました", "error");
  }
});

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
clearLogBtn.addEventListener("click", async () => {
  // 確認ダイアログを表示
  if (!confirm("スプレッドシートのログをクリアしますか？")) {
    return;
  }

  // 現在のスプレッドシートURLを取得
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  if (urls.length === 0) {
    updateStatus("スプレッドシートURLが設定されていません", "error");
    return;
  }

  // ボタンを無効化
  clearLogBtn.disabled = true;
  updateStatus("ログをクリア中...", "loading");

  try {
    // 最初のURLから情報を抽出
    const spreadsheetUrl = urls[0];
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    const response = await chrome.runtime.sendMessage({
      action: "clearLog",
      spreadsheetId: spreadsheetId,
    });

    if (response && response.success) {
      const clearedCount = response.clearedCount || 0;
      updateStatus(`ログをクリアしました (${clearedCount}個のセル)`, "success");
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
deleteAnswersBtn.addEventListener("click", async () => {
  // 確認ダイアログを表示
  if (!confirm("AI回答を削除しますか？")) {
    return;
  }

  // 現在のスプレッドシートURLを取得
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  if (urls.length === 0) {
    updateStatus("スプレッドシートURLが設定されていません", "error");
    return;
  }

  // ボタンを無効化
  deleteAnswersBtn.disabled = true;
  updateStatus("回答を削除中...", "loading");

  try {
    // 最初のURLから情報を抽出
    const spreadsheetUrl = urls[0];
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

// ===== 統合AIテスト実行関数 =====
function runIntegratedAITest() {
  try {
    // 統合AIテストページを開く
    const testUrl = chrome.runtime.getURL(
      "tests/integration/test-ai-automation-integrated.html",
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

    // 新しいウィンドウでテストページを開く
    const testWindow = window.open(
      testUrl,
      `integrated_ai_test_${Date.now()}`,
      windowFeatures,
    );

    if (testWindow) {
      console.log("✅ 統合AIテストページが開かれました");
      updateStatus("統合AIテストページを開きました", "success");
    } else {
      console.error("❌ テストページを開けませんでした");
      updateStatus("テストページを開けませんでした", "error");
      alert("ポップアップブロッカーを無効にしてください");
    }
  } catch (error) {
    console.error("❌ 統合AIテスト実行エラー:", error);
    updateStatus("テスト実行エラー", "error");
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

// ===== イベントリスナー: AI変更検出システム =====
let isAIDetectionSystemRunning = false; // 実行中フラグ
let aiDetectionWindows = []; // 開いたウィンドウを記録

aiDetectionSystemBtn.addEventListener("click", async () => {
  console.log("AI変更検出システムボタンが押されました - 4分割ウィンドウを開きます");
  
  try {
    // プライマリモニターのサイズを取得
    const screenInfo = await new Promise((resolve) => {
      chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
        resolve(primaryDisplay);
      });
    });
    
    const screenWidth = screenInfo.bounds.width;
    const screenHeight = screenInfo.bounds.height;
    const halfWidth = Math.floor(screenWidth / 2);
    const halfHeight = Math.floor(screenHeight / 2);
    
    console.log(`画面サイズ: ${screenWidth}x${screenHeight}`);
    console.log(`各ウィンドウサイズ: ${halfWidth}x${halfHeight}`);
    
    // メインウィンドウはそのまま（移動しない）
    console.log('メインウィンドウは現在の位置を維持');
    
    // 既存のAI検出ウィンドウがあれば閉じる
    if (aiDetectionWindows.length > 0) {
      console.log('既存のAI検出ウィンドウを閉じます');
      await closeAIDetectionWindows();
    }
    
    // 1. ChatGPTウィンドウを左上に開く
    const chatgptWindow = await new Promise((resolve) => {
      chrome.windows.create({
        url: 'https://chatgpt.com',
        left: 0,
        top: 0,
        width: halfWidth,
        height: halfHeight,
        type: 'popup',  // popupタイプに変更（URLバー・ブックマークバー非表示）
        focused: false  // フォーカスを奪わない
      }, (window) => {
        console.log('✅ ChatGPTウィンドウを左上に開きました');
        if (window) {
          aiDetectionWindows.push({ windowId: window.id, aiType: 'ChatGPT' });
        }
        resolve(window);
      });
    });
    
    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 2. Claudeウィンドウを右上に開く
    const claudeWindow = await new Promise((resolve) => {
      chrome.windows.create({
        url: 'https://claude.ai',
        left: halfWidth,
        top: 0,
        width: halfWidth,
        height: halfHeight,
        type: 'popup',  // popupタイプに変更（URLバー・ブックマークバー非表示）
        focused: false  // フォーカスを奪わない
      }, (window) => {
        console.log('✅ Claudeウィンドウを右上に開きました');
        if (window) {
          aiDetectionWindows.push({ windowId: window.id, aiType: 'Claude' });
        }
        resolve(window);
      });
    });
    
    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 3. Geminiウィンドウを左下に開く
    const geminiWindow = await new Promise((resolve) => {
      chrome.windows.create({
        url: 'https://gemini.google.com',
        left: 0,
        top: halfHeight,
        width: halfWidth,
        height: halfHeight,
        type: 'popup',  // popupタイプに変更（URLバー・ブックマークバー非表示）
        focused: false  // フォーカスを奪わない
      }, (window) => {
        console.log('✅ Geminiウィンドウを左下に開きました');
        if (window) {
          aiDetectionWindows.push({ windowId: window.id, aiType: 'Gemini' });
        }
        resolve(window);
      });
    });
    
    console.log('4分割ウィンドウを開きました。各AIの自動化スクリプトを注入します...');
    
    // 各ウィンドウのタブIDを取得して自動化スクリプトを注入
    const windows = [
      { window: chatgptWindow, name: 'ChatGPT' },
      { window: claudeWindow, name: 'Claude' },
      { window: geminiWindow, name: 'Gemini' }
    ];
    
    // 各ウィンドウにスクリプトを並列で注入
    let completedCount = 0;
    const totalWindows = windows.length;
    
    // 各ウィンドウの処理を並列実行するためのPromise配列
    const processPromises = windows.map(async ({ window, name }) => {
      if (window && window.tabs && window.tabs[0]) {
        const tabId = window.tabs[0].id;
        console.log(`${name}にスクリプトを注入します (タブID: ${tabId})`);
        
        try {
          // ページの読み込みが完了するまで待機
          await new Promise((resolve) => {
            chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
              if (updatedTabId === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                console.log(`${name}のページ読み込み完了`);
                resolve();
              }
            });
            
            // タイムアウト設定（10秒）
            setTimeout(() => {
              console.log(`${name}のページ読み込みタイムアウト`);
              resolve();
            }, 10000);
          });
          
          // スクリプトを注入し、saveDataを取得
          const saveData = await injectAutomationScripts(tabId, name);
          
          // 完了カウントを更新（スレッドセーフのために注意深く処理）
          completedCount++;
          console.log(`🔢 AI検出進捗: ${completedCount}/${totalWindows} 完了 (${name})`);
          
          // 進捗をステータスに表示
          updateStatus(`AI検出中... (${completedCount}/${totalWindows}) - ${name}完了`, "loading");
          
          return { success: true, aiName: name, saveData: saveData };
        } catch (error) {
          console.error(`${name}の処理でエラー:`, error);
          completedCount++;
          updateStatus(`AI検出中... (${completedCount}/${totalWindows}) - ${name}エラー`, "loading");
          return { success: false, aiName: name, error: error.message };
        }
      }
      return { success: false, aiName: name, error: 'ウィンドウまたはタブが無効' };
    });
    
    // すべてのAI処理を並列実行
    console.log('🚀 すべてのAI検出を並列実行開始...');
    const results = await Promise.allSettled(processPromises);
    
    // 結果を集計
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const errorCount = results.length - successCount;
    
    console.log(`📊 並列処理結果: 成功 ${successCount}件, エラー ${errorCount}件`);
    
    if (errorCount > 0) {
      console.warn('⚠️ 一部のAI検出でエラーが発生しました');
      results.forEach((result, index) => {
        if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)) {
          console.error(`❌ ${windows[index].name}エラー:`, result.reason || result.value?.error);
        }
      });
    }
    
    // 全ての検出が完了したら、データを一括保存
    console.log('💾 すべてのAI検出が完了しました。データを一括保存します...');
    
    // 各AIのsaveDataを収集
    const allSaveData = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success && result.value.saveData) {
        const aiName = windows[index].name.toLowerCase();
        allSaveData[aiName] = result.value.saveData;
        console.log(`✔️ ${windows[index].name}のデータを収集`);
      }
    });
    
    // 収集したデータをChrome Storageに一括保存
    if (Object.keys(allSaveData).length > 0) {
      chrome.storage.local.set({ 'ai_config_persistence': allSaveData }, () => {
        console.log('✅ 全AIのデータを一括保存しました:', allSaveData);
        
        // UI更新を促すイベントを発火
        window.dispatchEvent(new CustomEvent('ai-data-saved', { 
          detail: { timestamp: new Date().toISOString() } 
        }));
      });
    } else {
      console.warn('⚠️ 保存するデータがありません');
    }
    
    console.log('🎉 すべてのAI検出が完了しました。5秒後に自動でウィンドウを閉じます...');
    updateStatus("すべてのAI検出が完了しました。5秒後に自動でウィンドウを閉じます...", "success");
    
    setTimeout(async () => {
      await closeAIDetectionWindows();
      updateStatus("AI検出システム完了 - ウィンドウを閉じました", "success");
    }, 5000);
    
    // 現在のウィンドウ情報を取得してフォーカスを戻す
    chrome.windows.getCurrent((currentWindow) => {
      chrome.windows.update(currentWindow.id, { focused: true });
    });
    
    updateStatus("4分割ウィンドウを開き、AI検出システムを起動しました", "success");
    
  } catch (error) {
    console.error("ウィンドウ操作エラー:", error);
    updateStatus("ウィンドウ操作エラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
  }
});

// 以下は古いコードのコメントアウト
/*
      if (aiTab) {
        console.log(`AIサイトを検出: ${aiTab.url}`);
        
        // そのタブをアクティブにする
        chrome.tabs.update(aiTab.id, { active: true }, () => {
          injectScriptsToTab(aiTab.id);
        });
        
      } else {
        // AIサイトのタブがない場合は選択画面を表示
        const aiSelection = confirm(
          '開いているタブにAIサイトがありません。\n' +
          'どのAIサイトを開きますか？\n\n' +
          'OK = ChatGPT\n' +
          'キャンセル = Claude\n\n' +
          '（Geminiを開く場合は、キャンセル後に再度実行してください）'
        );
        
        let urlToOpen;
        if (aiSelection) {
          urlToOpen = 'https://chatgpt.com';
        } else {
          const claudeOrGemini = confirm(
            'Claudeを開きますか？\n\n' +
            'OK = Claude\n' +
            'キャンセル = Gemini'
          );
          urlToOpen = claudeOrGemini ? 'https://claude.ai' : 'https://gemini.google.com';
        }
        
        // 新しいタブでAIサイトを開く
        chrome.tabs.create({ url: urlToOpen }, (newTab) => {
          console.log(`新しいタブでAIサイトを開きました: ${urlToOpen}`);
          updateStatus("AIサイトを開いています...", "running");
          
          // ページ読み込み完了を待つ
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              
              // 少し待ってからスクリプトを注入
              setTimeout(() => {
                injectScriptsToTab(newTab.id);
              }, 2000);
            }
          });
        });
      }
      
      // スクリプト注入関数
      async function injectScriptsToTab(tabId) {
        // 先に基本的なAI自動化スクリプトを注入
        const baseScripts = [
          'automations/chatgpt-automation.js',
          'automations/claude-automation-dynamic.js',
          'automations/gemini-dynamic-automation.js'
        ];
        
        // その後、4層システムを注入
        const scriptsToInject = [
          'src/ai/unified-ai-api.js',
          'src/ai/change-detection-processor.js',
          'src/ai/ai-config-persistence.js',
          'src/ai/user-settings-sync.js'
        ];
        
        try {
          // まず、既にシステムが注入されているかチェック
          const [checkResult] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              return {
                hasUnifiedAI: typeof window.UnifiedAI !== 'undefined',
                hasAIPersistence: typeof window.AIPersistence !== 'undefined',
                hasUserSettingsSync: typeof window.UserSettingsSync !== 'undefined',
                hasChatGPTAutomation: typeof window.ChatGPTAutomation !== 'undefined'
              };
            }
          });
          
          console.log('既存システムチェック:', checkResult.result);
          
          // 既に全てのシステムが注入されている場合
          if (checkResult.result.hasUnifiedAI && 
              checkResult.result.hasAIPersistence && 
              checkResult.result.hasUserSettingsSync) {
            console.log('⚠️ システムは既に注入されています');
            
            // 既に注入されている場合はアダプタのみ注入して実行
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: [
                'src/detectors/ai-detector-interface.js',
                'src/detectors/adapters/chatgpt-adapter.js',
                'src/detectors/adapters/claude-adapter.js',
                'src/detectors/adapters/gemini-adapter.js',
                'src/detectors/ai-detector-service.js'
              ]
            });
            console.log('✅ AI検出アダプタを注入しました（再実行）');
            
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: async () => {
                console.log('🔄 AI変更検出システム - 再実行');
                
                try {
                  // サービスを初期化
                  if (!window.aiDetectorService) {
                    window.aiDetectorService = new AIDetectorService();
                  }
                  
                  const service = window.aiDetectorService;
                  await service.initialize();
                  
                  // 現在のページのAIタイプを判定
                  const url = window.location.href;
                  let aiType = null;
                  
                  if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
                    aiType = 'chatgpt';
                  } else if (url.includes('claude.ai')) {
                    aiType = 'claude';
                  } else if (url.includes('gemini.google.com')) {
                    aiType = 'gemini';
                  }
                  
                  if (!aiType) {
                    throw new Error('対応するAIサイトではありません');
                  }
                  
                  console.log(`📊 ${aiType.toUpperCase()} のデータを取得中...`);
                  
                  // データを検出
                  const result = await service.detectAI(aiType);
                  
                  console.log(`✅ 取得完了:`, result);
                  
                  // 結果を表示
                  const modelCount = result.models ? result.models.length : 0;
                  const functionCount = result.functions ? result.functions.length : 0;
                  
                  alert(`AI変更検出完了！\n\n` +
                        `AI: ${aiType.toUpperCase()}\n` +
                        `モデル: ${modelCount}個\n` +
                        `機能: ${functionCount}個\n\n` +
                        `トップページでステータスを確認できます。`);
                  
                } catch (error) {
                  console.error('❌ データ取得エラー:', error);
                  alert('データ取得に失敗しました: ' + error.message);
                }
              }
            });
            
            updateStatus("AI変更検出システム起動済み", "ready");
            isAIDetectionSystemRunning = false;
            aiDetectionSystemBtn.disabled = false;
            return; // 重複注入を防ぐ
          }
          
          // 現在のタブのURLを取得
          const tab = await chrome.tabs.get(tabId);
          const url = tab.url;
          
          // URLに応じて必要な基本スクリプトを注入
          if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['automations/chatgpt-automation.js']
            });
            console.log('✅ ChatGPT自動化スクリプトを注入');
          } else if (url.includes('claude.ai')) {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['automations/claude-automation-dynamic.js']
            });
            console.log('✅ Claude自動化スクリプトを注入');
          } else if (url.includes('gemini.google.com')) {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['automations/gemini-dynamic-automation.js']
            });
            console.log('✅ Gemini自動化スクリプトを注入');
          }
          
          // 少し待機（基本スクリプトの初期化を待つ）
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 4層システムのスクリプトを順番に注入
          for (const script of scriptsToInject) {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: [script]
            });
            console.log(`✅ ${script} を注入しました`);
          }
          
          // アダプタスクリプトを注入
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [
              'src/detectors/ai-detector-interface.js',
              'src/detectors/adapters/chatgpt-adapter.js',
              'src/detectors/ai-detector-service.js'
            ]
          });
          console.log('✅ AI検出アダプタを注入しました');
          
          // 少し待ってから実行
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // AIDetectorServiceを使用してデータを取得
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: async () => {
              console.log('🎯 AI変更検出システム起動完了');
              
              try {
                // サービスを初期化
                if (!window.aiDetectorService) {
                  window.aiDetectorService = new AIDetectorService();
                }
                
                const service = window.aiDetectorService;
                await service.initialize();
                
                // 現在のページのAIタイプを判定
                const url = window.location.href;
                let aiType = null;
                
                if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
                  aiType = 'chatgpt';
                } else if (url.includes('claude.ai')) {
                  aiType = 'claude';
                } else if (url.includes('gemini.google.com')) {
                  aiType = 'gemini';
                }
                
                if (!aiType) {
                  throw new Error('対応するAIサイトではありません');
                }
                
                console.log(`📊 ${aiType.toUpperCase()} のデータを取得中...`);
                
                // データを検出
                const result = await service.detectAI(aiType);
                
                console.log(`✅ 取得完了:`, result);
                
                // 結果を表示
                const modelCount = result.models ? result.models.length : 0;
                const functionCount = result.functions ? result.functions.length : 0;
                
                alert(`AI変更検出完了！\n\n` +
                      `AI: ${aiType.toUpperCase()}\n` +
                      `モデル: ${modelCount}個\n` +
                      `機能: ${functionCount}個\n\n` +
                      `トップページでステータスを確認できます。`);
                
              } catch (error) {
                console.error('❌ データ取得エラー:', error);
                alert('データ取得に失敗しました: ' + error.message);
              }
            }
          });
          
          updateStatus("AI変更検出システム起動完了", "ready");
          
          // AIステータスを更新
          setTimeout(() => {
            updateAIStatus();
            console.log('✅ AIステータスを更新しました');
          }, 2000); // 2秒後に更新（データ取得を待つため）
          
        } catch (error) {
          console.error('スクリプト注入エラー:', error);
          updateStatus("スクリプト注入エラー", "error");
          alert(`エラーが発生しました: ${error.message}`);
        } finally {
          // 処理完了後、フラグをリセット
          isAIDetectionSystemRunning = false;
          aiDetectionSystemBtn.disabled = false;
        }
      }
    });
    
  } catch (error) {
    console.error("AI変更検出システムエラー:", error);
    updateStatus("AI変更検出システムエラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
    isAIDetectionSystemRunning = false;
    aiDetectionSystemBtn.disabled = false;
  }
});
*/

// ===== イベントリスナー: 統合AIテスト開始 =====
startIntegratedTestBtn.addEventListener("click", () => {
  console.log("統合AIテスト開始ボタンが押されました");
  runIntegratedAITest();
});

// ===== イベントリスナー: レポート生成 =====
const generateReportBtn = document.getElementById("generateReportBtn");
generateReportBtn.addEventListener("click", () => {
  console.log("レポート生成テストボタンが押されました");
  
  try {
    // レポート化テストページを新しいウィンドウで開く
    const testUrl = chrome.runtime.getURL("tests/test-report-generation.html");
    
    // ウィンドウ設定
    const windowFeatures = `
      width=1400,
      height=800,
      left=${(screen.width - 1400) / 2},
      top=${(screen.height - 800) / 2},
      scrollbars=yes,
      resizable=yes,
      status=no,
      toolbar=no,
      menubar=no,
      location=no
    `.replace(/\s+/g, "");
    
    // 新しいウィンドウでテストページを開く
    const testWindow = window.open(
      testUrl,
      `report_generation_test_${Date.now()}`,
      windowFeatures
    );
    
    if (testWindow) {
      console.log("✅ レポート化テストページが開かれました");
      updateStatus("レポート化テストページを開きました", "success");
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      console.error("❌ テストページを開けませんでした");
      updateStatus("テストページを開けませんでした", "error");
      alert("ポップアップブロッカーを無効にしてください");
    }
  } catch (error) {
    console.error("❌ レポート化テスト実行エラー:", error);
    updateStatus("テスト実行エラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
  }
});

// ===== イベントリスナー: ウィンドウ作成テスト =====
const windowCreationTestBtn = document.getElementById("windowCreationTestBtn");
windowCreationTestBtn.addEventListener("click", () => {
  console.log("ウィンドウ作成テストボタンが押されました");
  
  try {
    // すぐにテストページを開く
    const testUrl = chrome.runtime.getURL("tests/test-window-creation.html");
    console.log("テストページURL:", testUrl);
    
    // Chrome拡張のタブとして開く
    chrome.tabs.create({
      url: testUrl,
      active: true
    }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("タブ作成エラー:", chrome.runtime.lastError);
        // フォールバック: window.openで開く
        const windowFeatures = `
          width=1400,
          height=900,
          left=${(screen.width - 1400) / 2},
          top=${(screen.height - 900) / 2},
          scrollbars=yes,
          resizable=yes,
          status=no,
          menubar=no,
          toolbar=no,
          location=no
        `.replace(/\s+/g, '');
        
        const testWindow = window.open(testUrl, "WindowCreationTest", windowFeatures);
        
        if (!testWindow) {
          alert("ポップアップブロッカーによりウィンドウを開けませんでした。\nポップアップを許可してください。");
        } else {
          console.log("window.openでテストページを開きました");
          updateStatus("ウィンドウ作成テストツールを開きました", "success");
        }
      } else {
        console.log("新しいタブでテストページを開きました:", tab.id);
        updateStatus("ウィンドウ作成テストツールを開きました", "success");
      }
    });
    
  } catch (error) {
    console.error("ウィンドウ作成テストエラー:", error);
    updateStatus(`エラー: ${error.message}`, "error");
    
    // 最終フォールバック: 直接window.openで試す
    try {
      const testUrl = chrome.runtime.getURL("tests/test-window-creation.html");
      const testWindow = window.open(testUrl, "_blank");
      
      if (testWindow) {
        console.log("フォールバックでテストページを開きました");
        updateStatus("ウィンドウ作成テストツールを開きました", "success");
      } else {
        alert("テストページを開けませんでした。\nポップアップブロッカーを確認してください。");
      }
    } catch (fallbackError) {
      console.error("フォールバックも失敗:", fallbackError);
      alert(`テストページを開けませんでした: ${fallbackError.message}`);
    }
  }
});

// ===== イベントリスナー: スプレッドシート読み込みテスト =====
const showTaskListTestBtn = document.getElementById("showTaskListTestBtn");
showTaskListTestBtn.addEventListener("click", () => {
  console.log("スプレッドシート読み込みテストボタンが押されました");
  
  try {
    // 新しいスプレッドシート読み込みテストツールを開く
    const testUrl = chrome.runtime.getURL("tests/test-spreadsheet.html");
    
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
    
    // 新しいウィンドウでテストページを開く
    const testWindow = window.open(
      testUrl,
      `tasklist_test_${Date.now()}`,
      windowFeatures
    );
    
    if (testWindow) {
      console.log("✅ スプレッドシート読み込みテストページが開かれました");
      updateStatus("スプレッドシート読み込みテストページを開きました", "success");
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      console.error("❌ テストページを開けませんでした");
      updateStatus("テストページを開けませんでした", "error");
      alert("ポップアップブロッカーを無効にしてください");
    }
  } catch (error) {
    console.error("❌ スプレッドシート読み込みテスト実行エラー:", error);
    updateStatus("テスト実行エラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
  }
});

// ===== イベントリスナー: AIステータス表示 =====
const showAIStatusBtn = document.getElementById("showAIStatusBtn");
if (showAIStatusBtn) {
  showAIStatusBtn.addEventListener("click", () => {
    console.log("AIステータス表示を開きます...");
    updateStatus("AIステータス表示を開いています...", "running");
    
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/ui/ai-status-display.html"),
    }, (tab) => {
      if (tab) {
        console.log("✅ AIステータス表示ページが開かれました");
        updateStatus("AIステータス表示を開きました", "success");
        setTimeout(() => updateStatus("待機中", "waiting"), 2000);
      } else {
        console.error("❌ AIステータス表示を開けませんでした");
        updateStatus("AIステータス表示を開けませんでした", "error");
      }
    });
  });
}

// テスト実行関数（別ウィンドウ版）

// ===== 初期化処理 =====
// 初回のAIステータスを更新
updateAIStatus();

// ストレージの変更を監視（AI変更検出システムが実行されたときに更新）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.ai_config_persistence) {
    updateAIStatus();
  }
});
