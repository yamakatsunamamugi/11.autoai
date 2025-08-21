/**
 * @fileoverview AIセレクタ変更検出システム コントローラー
 * 
 * MutationObserver監視機能を独立したモジュールとして管理します。
 * 統合AIテスト開始(runIntegratedAITest)の機能を再利用して実装します。
 * 
 * @requires ../automations/test-runner-chrome.js
 * @requires ../automations/ai-mutation-observer.js
 */

// MutationObserver監視状態管理
let isAIMutationSystemRunning = false;
let currentMutationObserver = null;

// セレクタ検出ログ管理
let selectorDetectionLogs = [];

/**
 * 拡張機能UIにログを送信
 */
function logToExtensionUI(message, type = 'info', aiType = null) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = {
    timestamp: timestamp,
    message: message,
    type: type, // 'info', 'success', 'warning', 'error'
    aiType: aiType
  };
  
  selectorDetectionLogs.push(logEntry);
  
  // コンソールにも出力
  console.log(`[${timestamp}] ${message}`);
  
  // 拡張機能のログビューアーに送信
  try {
    chrome.runtime.sendMessage({
      type: 'SELECTOR_DETECTION_LOG',
      log: logEntry
    });
  } catch (error) {
    // エラーは無視（background scriptが利用できない場合など）
  }
}

/**
 * MutationObserver監視の開始/停止を切り替える
 * @param {HTMLElement} button - ボタン要素
 * @param {Function} updateStatus - ステータス更新関数
 */
export async function toggleMutationObserverMonitoring(button, updateStatus) {
  console.log("AIセレクタ変更検出システムボタンが押されました");
  
  if (isAIMutationSystemRunning) {
    // 監視停止
    await stopMutationObserverMonitoring(button, updateStatus);
  } else {
    // 監視開始
    await startMutationObserverMonitoring(button, updateStatus);
  }
}

/**
 * MutationObserver監視を開始（4分割ウィンドウ + セレクタ検出フロー）
 * @private
 */
async function startMutationObserverMonitoring(button, updateStatus) {
  logToExtensionUI("🔍 AIセレクタ変更検出システムを開始します（4分割ウィンドウ方式）", "info");
  
  try {
    button.disabled = true;
    updateStatus("4分割ウィンドウ準備中...", "loading");
    
    // 4分割ウィンドウでAIサイトを開く
    const aiWindows = await create4PaneAIWindows();
    
    if (!aiWindows || aiWindows.length === 0) {
      throw new Error("AIウィンドウの作成に失敗しました");
    }
    
    logToExtensionUI(`✅ ${aiWindows.length}個のAIウィンドウを作成しました`, "success");
    updateStatus("各AIサイトに自動化スクリプト注入中...", "loading");
    
    // 各ウィンドウにスクリプトを注入して、セレクタ検出フローを実行
    const results = await executeSelectorDetectionFlow(aiWindows, updateStatus);
    
    const successCount = results.filter(r => r.success).length;
    
    if (successCount > 0) {
      // データを保存（ai-detection-controller.jsの機能を流用）
      await saveDetectionResults(results, aiWindows);
      
      currentMutationObserver = {
        windows: aiWindows,
        mode: 'selector_detection',
        results: results
      };
      isAIMutationSystemRunning = true;
      
      // ボタンの表示を更新
      button.innerHTML = '<span class="btn-icon">⏹️</span>監視停止 (実行中)';
      button.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)";
      button.disabled = false;
      
      updateStatus(`セレクタ検出完了 (${successCount}/${aiWindows.length}サイト)`, "success");
      logToExtensionUI(`🎉 セレクタ検出フロー完了: ${successCount}/${aiWindows.length}サイト成功`, "success");
      
      // 5秒後に自動でウィンドウを閉じる
      setTimeout(async () => {
        await closeAIWindows(aiWindows);
        resetMutationObserverState(button, updateStatus);
        updateStatus("セレクタ検出完了。ウィンドウを閉じました。", "success");
      }, 5000);
      
    } else {
      throw new Error("全てのAIサイトでセレクタ検出に失敗しました");
    }
    
  } catch (error) {
    console.error("セレクタ検出エラー:", error);
    updateStatus("セレクタ検出エラー", "error");
    button.disabled = false;
    alert(`セレクタ検出エラー: ${error.message}`);
  }
}

/**
 * MutationObserver監視を停止
 * @private
 */
async function stopMutationObserverMonitoring(button, updateStatus) {
  console.log("🛑 AIセレクタ変更検出システムを停止します");
  
  try {
    if (currentMutationObserver && currentMutationObserver.windows) {
      // 4分割ウィンドウを閉じる
      await closeAIWindows(currentMutationObserver.windows);
      resetMutationObserverState(button, updateStatus);
      console.log("✅ 全AIウィンドウを閉じました");
    } else if (currentMutationObserver && currentMutationObserver.tabs) {
      // 従来のタブ版の場合（互換性のため残す）
      for (const tab of currentMutationObserver.tabs) {
        try {
          console.log(`🛑 TabID ${tab.id} でMutationObserver停止`);
          await stopMutationObserverOnTab(tab.id);
        } catch (error) {
          console.error(`❌ TabID ${tab.id} 停止エラー:`, error);
        }
      }
      stopSelectorDataCollection();
      resetMutationObserverState(button, updateStatus);
      console.log("✅ 全AIサイトのMutationObserver監視を停止しました");
    }
  } catch (error) {
    console.error("セレクタ検出停止エラー:", error);
    updateStatus("監視停止エラー", "error");
  }
}

/**
 * MutationObserver状態をリセット
 * @private
 */
function resetMutationObserverState(button, updateStatus) {
  isAIMutationSystemRunning = false;
  currentMutationObserver = null;
  button.innerHTML = '<span class="btn-icon">👁️</span>2. AIセレクタ変更検出システム';
  button.style.background = "linear-gradient(135deg, #a55eea, #3742fa)";
  updateStatus("MutationObserver監視停止", "warning");
}

/**
 * MutationObserver監視状態を取得
 * @returns {boolean} 監視中の場合true
 */
export function isMutationObserverRunning() {
  return isAIMutationSystemRunning;
}

/**
 * 現在のMutationObserver情報を取得
 * @returns {Object|null} MutationObserver情報
 */
export function getCurrentMutationObserver() {
  return currentMutationObserver;
}

// セレクタデータ収集管理
let selectorDataCollectionInterval = null;

/**
 * 検出結果を保存
 * ai-detection-controller.jsのsaveDetectionResults機能を流用
 */
async function saveDetectionResults(results, windows) {
  logToExtensionUI('💾 すべてのAI検出が完了しました。データを一括保存します...', "info");
  
  const allSaveData = {};
  results.forEach((result, index) => {
    if (result.success) {
      const aiName = windows[index].aiType.toLowerCase();
      
      // selectorDataが存在する場合はそれを使用、なければresult全体から取得
      const selectorData = result.selectorData || {};
      
      // resultの中にもセレクタ情報が含まれている場合があるので確認
      console.log(`🔍 ${windows[index].aiType}の結果データ:`, result);
      
      allSaveData[aiName] = selectorData;
      logToExtensionUI(`✔️ ${windows[index].aiType}のデータを収集`, "success", windows[index].aiType);
      
      // UIに直接セレクタを表示
      updateSelectorDisplay(windows[index].aiType, selectorData);
    }
  });
  
  if (Object.keys(allSaveData).length > 0) {
    // セレクタデータ専用のストレージキーを使用（モデル・機能リストとは別）
    chrome.storage.local.set({ 'ai_selector_data': allSaveData }, () => {
      logToExtensionUI('✅ 全AIのセレクタデータを一括保存しました', "success");
      
      // UI更新を促すイベントを発火
      window.dispatchEvent(new CustomEvent('ai-selector-data-saved', { 
        detail: { timestamp: new Date().toISOString() } 
      }));
    });
  } else {
    logToExtensionUI('⚠️ 保存するセレクタデータがありません', "warning");
  }
}

/**
 * セレクタ情報をUIに表示
 * @param {string} aiType - AI名 (ChatGPT, Claude, Gemini)
 * @param {Object} selectors - セレクタ情報 {input, send, response}
 */
function updateSelectorDisplay(aiType, selectors) {
  const aiTypeLower = aiType.toLowerCase();
  
  // 各セレクタタイプのDOM要素を更新
  const inputEl = document.getElementById(`${aiTypeLower}-input-selectors`);
  const sendEl = document.getElementById(`${aiTypeLower}-send-selectors`);
  const stopEl = document.getElementById(`${aiTypeLower}-stop-selectors`);
  const responseEl = document.getElementById(`${aiTypeLower}-response-selectors`);
  
  // セレクタ値を表示（詳細情報付き）
  if (inputEl) {
    if (selectors.input) {
      const data = selectors.input;
      let html = '';
      if (typeof data === 'object' && data.selector) {
        // 詳細情報がある場合
        html = `
          <div style="margin-bottom: 8px;">
            <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block; margin-bottom: 4px;">
              ${escapeHtml(data.fullSelector || data.selector)}
            </code>
            <div style="font-size: 11px; color: #666; margin-left: 8px;">
              優先度: ${data.priority} | タグ: &lt;${data.tagName}&gt;
              ${data.attributes?.['data-testid'] ? ` | data-testid="${data.attributes['data-testid']}"` : ''}
              ${data.attributes?.['aria-label'] ? ` | aria-label="${data.attributes['aria-label']}"` : ''}
            </div>
          </div>
        `;
        logToExtensionUI(`📝 [${aiType}] 入力セレクタ (優先度${data.priority}): ${data.fullSelector || data.selector}`, "info", aiType);
      } else {
        // シンプルな文字列の場合
        html = `<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${escapeHtml(data)}</code>`;
        logToExtensionUI(`📝 [${aiType}] 入力セレクタ: ${data}`, "info", aiType);
      }
      inputEl.innerHTML = html;
    } else {
      inputEl.textContent = '未検出';
    }
  }
  
  if (sendEl) {
    if (selectors.send) {
      const data = selectors.send;
      let html = '';
      if (typeof data === 'object' && data.selector) {
        html = `
          <div style="margin-bottom: 8px;">
            <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block; margin-bottom: 4px;">
              ${escapeHtml(data.fullSelector || data.selector)}
            </code>
            <div style="font-size: 11px; color: #666; margin-left: 8px;">
              優先度: ${data.priority} | タグ: &lt;${data.tagName}&gt;
              ${data.attributes?.['data-testid'] ? ` | data-testid="${data.attributes['data-testid']}"` : ''}
              ${data.attributes?.['aria-label'] ? ` | aria-label="${data.attributes['aria-label']}"` : ''}
            </div>
          </div>
        `;
        logToExtensionUI(`📤 [${aiType}] 送信セレクタ (優先度${data.priority}): ${data.fullSelector || data.selector}`, "info", aiType);
      } else {
        html = `<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${escapeHtml(data)}</code>`;
        logToExtensionUI(`📤 [${aiType}] 送信セレクタ: ${data}`, "info", aiType);
      }
      sendEl.innerHTML = html;
    } else {
      sendEl.textContent = '未検出';
    }
  }
  
  // 停止ボタンのセレクタを表示
  if (stopEl) {
    if (selectors.stop) {
      const data = selectors.stop;
      let html = '';
      if (typeof data === 'object' && data.selector) {
        html = `
          <div style="margin-bottom: 8px;">
            <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block; margin-bottom: 4px;">
              ${escapeHtml(data.fullSelector || data.selector)}
            </code>
            <div style="font-size: 11px; color: #666; margin-left: 8px;">
              優先度: ${data.priority} | タグ: &lt;${data.tagName}&gt;
              ${data.attributes?.['data-testid'] ? ` | data-testid="${data.attributes['data-testid']}"` : ''}
              ${data.attributes?.['aria-label'] ? ` | aria-label="${data.attributes['aria-label']}"` : ''}
            </div>
          </div>
        `;
        logToExtensionUI(`⏸️ [${aiType}] 停止セレクタ (優先度${data.priority}): ${data.fullSelector || data.selector}`, "info", aiType);
      } else {
        html = `<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${escapeHtml(data)}</code>`;
        logToExtensionUI(`⏸️ [${aiType}] 停止セレクタ: ${data}`, "info", aiType);
      }
      stopEl.innerHTML = html;
    } else {
      stopEl.textContent = '未検出';
    }
  }
  
  if (responseEl) {
    if (selectors.response) {
      const data = selectors.response;
      let html = '';
      if (typeof data === 'object' && data.selector) {
        html = `
          <div style="margin-bottom: 8px;">
            <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block; margin-bottom: 4px;">
              ${escapeHtml(data.fullSelector || data.selector)}
            </code>
            <div style="font-size: 11px; color: #666; margin-left: 8px;">
              優先度: ${data.priority} | タグ: &lt;${data.tagName}&gt;
              ${data.attributes?.['role'] ? ` | role="${data.attributes['role']}"` : ''}
              ${data.attributes?.['class'] ? ` | class="${data.attributes['class'].substring(0, 50)}..."` : ''}
            </div>
          </div>
        `;
        logToExtensionUI(`📄 [${aiType}] 応答セレクタ (優先度${data.priority}): ${data.fullSelector || data.selector}`, "info", aiType);
      } else {
        html = `<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${escapeHtml(data)}</code>`;
        logToExtensionUI(`📄 [${aiType}] 応答セレクタ: ${data}`, "info", aiType);
      }
      responseEl.innerHTML = html;
    } else {
      responseEl.textContent = '未検出';
    }
  }
  
  // 停止ボタンセレクタ（存在する場合）- stopElは既に上で宣言済み
  if (stopEl) {
    if (selectors.stop) {
      const data = selectors.stop;
      let html = '';
      if (typeof data === 'object' && data.selector) {
        html = `
          <div style="margin-bottom: 8px;">
            <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; font-family: monospace; display: block; margin-bottom: 4px;">
              ${escapeHtml(data.fullSelector || data.selector)}
            </code>
            <div style="font-size: 11px; color: #666; margin-left: 8px;">
              優先度: ${data.priority} | タグ: &lt;${data.tagName}&gt;
              ${data.attributes?.['data-testid'] ? ` | data-testid="${data.attributes['data-testid']}"` : ''}
              ${data.attributes?.['aria-label'] ? ` | aria-label="${data.attributes['aria-label']}"` : ''}
            </div>
          </div>
        `;
        logToExtensionUI(`⏸️ [${aiType}] 停止セレクタ (優先度${data.priority}): ${data.fullSelector || data.selector}`, "info", aiType);
      } else {
        html = `<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${escapeHtml(data)}</code>`;
        logToExtensionUI(`⏸️ [${aiType}] 停止セレクタ: ${data}`, "info", aiType);
      }
      stopEl.innerHTML = html;
    } else {
      stopEl.textContent = '未検出';
    }
  }
  
  // DeepResearchセレクタ（存在する場合）
  const deepResearchEl = document.getElementById(`${aiTypeLower}-deepresearch-selectors`);
  if (deepResearchEl && selectors.deepresearch) {
    deepResearchEl.innerHTML = `<code style="background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-family: monospace;">${escapeHtml(selectors.deepresearch)}</code>`;
  }
  
  console.log(`✅ ${aiType}のセレクタ情報をUIに表示しました`, selectors);
}

/**
 * HTMLエスケープ処理
 * @param {string} text - エスケープする文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 4分割AIウィンドウを作成
 * ai-detection-controller.jsの機能を完全流用
 */
async function create4PaneAIWindows() {
  logToExtensionUI("🖼️ 4分割AIウィンドウを作成中...", "info");
  
  try {
    // ai-detection-controller.jsから既存の機能をインポート
    const aiDetectionModule = await import('./ai-detection-controller.js');
    
    // 既存のウィンドウ作成ロジックを流用
    return await executeAIDetectionWindowCreation();
    
  } catch (error) {
    logToExtensionUI(`4分割ウィンドウ作成エラー: ${error.message}`, "error");
    throw error;
  }
}

/**
 * AI検出ウィンドウ作成処理を実行
 * ai-detection-controller.jsのコードを完全流用
 */
async function executeAIDetectionWindowCreation() {
  // プライマリモニターのサイズを取得（ai-detection-controller.jsと同じ処理）
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
  
  logToExtensionUI(`画面サイズ: ${screenWidth}x${screenHeight}`, "info");
  
  const aiWindows = [];
  
  // 1. ChatGPTウィンドウを左上に開く（ai-detection-controller.jsと同じ）
  const chatgptWindow = await createAIWindow(
    'https://chatgpt.com',
    0, 0, halfWidth, halfHeight,
    'ChatGPT'
  );
  if (chatgptWindow) aiWindows.push(chatgptWindow);
  
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 2. Claudeウィンドウを右上に開く（ai-detection-controller.jsと同じ）
  const claudeWindow = await createAIWindow(
    'https://claude.ai',
    halfWidth, 0, halfWidth, halfHeight,
    'Claude'
  );
  if (claudeWindow) aiWindows.push(claudeWindow);
  
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 3. Geminiウィンドウを左下に開く（ai-detection-controller.jsと同じ）
  const geminiWindow = await createAIWindow(
    'https://gemini.google.com',
    0, halfHeight, halfWidth, halfHeight,
    'Gemini'
  );
  if (geminiWindow) aiWindows.push(geminiWindow);
  
  logToExtensionUI(`✅ ${aiWindows.length}個のAIウィンドウを作成しました`, "success");
  return aiWindows;
}

/**
 * AIウィンドウを作成
 * ai-detection-controller.jsのcreateAIWindow関数を流用
 */
async function createAIWindow(url, left, top, width, height, aiType) {
  return new Promise((resolve) => {
    chrome.windows.create({
      url: url,
      left: left,
      top: top,
      width: width,
      height: height,
      type: 'popup',
      focused: false
    }, (window) => {
      console.log(`✅ ${aiType}ウィンドウを開きました`);
      if (window) {
        resolve({ 
          windowId: window.id, 
          tabId: window.tabs[0].id, 
          aiType: aiType,
          url: url
        });
      } else {
        console.error(`❌ ${aiType}ウィンドウ作成失敗`);
        resolve(null);
      }
    });
  });
}

/**
 * AIウィンドウを閉じる
 * ai-detection-controller.jsのcloseAIDetectionWindows機能を流用
 */
async function closeAIWindows(aiWindows) {
  console.log("🔄 AIウィンドウを閉じます...");
  
  for (const window of aiWindows) {
    try {
      chrome.windows.remove(window.windowId);
      console.log(`✅ ${window.aiType}ウィンドウを閉じました`);
    } catch (error) {
      console.error(`❌ ${window.aiType}ウィンドウ閉じエラー:`, error);
    }
  }
  
  console.log("✅ すべてのAIウィンドウを閉じました");
}

/**
 * セレクタ検出フローを実行
 * ai-detection-controller.jsのprocessWindowsInParallel機能を完全流用
 */
async function executeSelectorDetectionFlow(aiWindows, updateStatus) {
  logToExtensionUI("🔍 セレクタ検出フローを開始します", "info");
  
  try {
    // ai-detection-controller.jsのprocessWindowsInParallel機能を使用
    const windows = aiWindows.map(window => ({
      window: window,
      name: window.aiType
    }));
    
    // セレクタ検出専用のスクリプト注入関数を使用
    const injectAutomationScripts = injectAIAutomationScript;
    
    // ai-detection-controller.jsの並列処理を流用
    const results = await processWindowsInParallel(windows, updateStatus, injectAutomationScripts);
    
    // セレクタデータは後から非同期で取得されるため、ここでは基本情報のみ返す
    return results.map((result, index) => ({
      aiType: windows[index].name,
      tabId: windows[index].window.tabId,
      success: result.status === 'fulfilled' && result.value && result.value.success,
      selectorData: {}, // 後から追加される
      error: result.reason?.message || (result.value ? result.value.error : 'Unknown error')
    }));
    
  } catch (error) {
    logToExtensionUI(`セレクタ検出フローエラー: ${error.message}`, "error");
    throw error;
  }
}

/**
 * 並列ウィンドウ処理
 * ai-detection-controller.jsのprocessWindowsInParallel機能を流用
 */
async function processWindowsInParallel(windows, updateStatus, injectAutomationScripts) {
  let completedCount = 0;
  const totalWindows = windows.length;
  
  const processPromises = windows.map(async ({ window, name }) => {
    if (window && window.tabId) {
      const tabId = window.tabId;
      logToExtensionUI(`${name}にスクリプトを注入します (タブID: ${tabId})`, "info", name);
      
      try {
        // ページの読み込みが完了するまで待機
        await waitForPageLoad(tabId, name);
        
        // スクリプトを注入し、saveDataを取得
        const saveData = await injectAutomationScripts(tabId, name);
        
        completedCount++;
        logToExtensionUI(`🔢 AI検出進捗: ${completedCount}/${totalWindows} 完了 (${name})`, "info", name);
        updateStatus(`AI検出中... (${completedCount}/${totalWindows}) - ${name}完了`, "loading");
        
        return { success: true, aiName: name, saveData: saveData };
      } catch (error) {
        logToExtensionUI(`${name}の処理でエラー: ${error.message}`, "error", name);
        completedCount++;
        updateStatus(`AI検出中... (${completedCount}/${totalWindows}) - ${name}エラー`, "loading");
        return { success: false, aiName: name, error: error.message };
      }
    }
    return { success: false, aiName: name, error: 'ウィンドウまたはタブが無効' };
  });
  
  logToExtensionUI('🚀 すべてのAI検出を並列実行開始...', "info");
  return await Promise.allSettled(processPromises);
}

/**
 * ページ読み込み完了を待機
 */
async function waitForPageLoad(tabId, aiType) {
  console.log(`⏳ ${aiType}のページ読み込み完了を待機中...`);
  
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        console.log(`✅ ${aiType}のページ読み込み完了`);
        resolve();
      }
    });
    
    // タイムアウト設定（10秒）
    setTimeout(() => {
      console.log(`⚠️ ${aiType}のページ読み込みタイムアウト`);
      resolve();
    }, 10000);
  });
}

/**
 * AI自動化スクリプトを注入
 * test-runner-chrome.jsのexecuteInTab機能を完全流用
 */
async function injectAIAutomationScript(tabId, aiType) {
  logToExtensionUI(`🔧 ${aiType}にtest-runner-chrome.jsと同じスクリプトを注入中...`, "info", aiType);
  
  try {
    // test-runner-chrome.jsと完全に同じスクリプト構成 + ui-selectors.js
    const commonScripts = [
      'src/config/ui-selectors.js',  // セレクタ定義を追加
      'automations/feature-constants.js',
      'automations/common-ai-handler.js',
      'automations/deepresearch-handler.js',
      'automations/claude-deepresearch-selector.js'
    ];
    
    // test-runner-chrome.jsと完全に同じAI固有スクリプトマッピング
    const scriptFileMap = {
      'claude': 'automations/claude-automation-dynamic.js',
      'chatgpt': 'automations/chatgpt-automation.js', 
      'gemini': 'automations/gemini-dynamic-automation.js',
      'genspark': 'automations/genspark-automation.js'
    };
    
    const aiScript = scriptFileMap[aiType.toLowerCase()] || `automations/${aiType.toLowerCase()}-automation.js`;
    const scriptsToInject = [...commonScripts, aiScript];
    
    // スクリプト注入（test-runner-chrome.jsと同じ方法）
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: scriptsToInject
    });
    
    logToExtensionUI(`✅ ${aiType}にtest-runner-chrome.js互換スクリプトを注入しました`, "success", aiType);
    
    // test-runner-chrome.jsと同じ初期化待機時間（2秒）
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // test-runner-chrome.jsのexecuteInTab機能を使用
    const result = await executeInTabForSelector(tabId, aiType);
    
    return result;
    
  } catch (error) {
    console.error(`❌ ${aiType}スクリプト注入エラー:`, error);
    logToExtensionUI(`❌ ${aiType}スクリプト注入エラー: ${error.message}`, "error", aiType);
    throw error;
  }
}

/**
 * test-runner-chrome.jsのexecuteInTab機能を完全流用
 * 統合AIテスト開始と完全に同じ実装
 */
async function executeInTabForSelector(tabId, aiType) {
  logToExtensionUI(`🎯 [${aiType}] test-runner-chrome.jsのexecuteInTab機能を使用`, "info", aiType);
  
  return new Promise((resolve) => {
    // test-runner-chrome.jsと完全に同じ処理
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: async (aiName, config) => {
        try {
          // test-runner-chrome.jsと完全に同じ自動化オブジェクト検索
          const automationMap = {
            'Claude': ['ClaudeAutomation', 'Claude'],
            'ChatGPT': ['ChatGPTAutomation', 'ChatGPT'], 
            'Gemini': ['Gemini', 'GeminiAutomation'],
            'Genspark': ['GensparkAutomation', 'Genspark']
          };
          
          const possibleNames = automationMap[aiName] || [`${aiName}Automation`];
          let automation = null;
          let foundName = null;
          
          for (const name of possibleNames) {
            if (window[name]) {
              automation = window[name];
              foundName = name;
              break;
            }
          }
          
          console.log(`[TestRunner] ${aiName}の自動化オブジェクトを探しています...`);
          console.log(`[TestRunner] 利用可能な候補: ${possibleNames.join(', ')}`);
          
          if (!automation) {
            const availableKeys = Object.keys(window).filter(key => 
              key.includes('Automation') || key.includes(aiName)
            );
            console.error(`[TestRunner] ${aiName}の自動化オブジェクトが見つかりません`);
            console.log(`[TestRunner] ウィンドウで利用可能: ${availableKeys.join(', ')}`);
            return { success: false, error: `${aiName}の自動化オブジェクトが見つかりません` };
          }
          
          console.log(`[TestRunner] ${foundName}を発見、実行開始`);
          console.log(`[デバッグ] 選択された機能: "${config.function}"`);
          
          // test-runner-chrome.jsと完全に同じ実行方法
          if (typeof automation.runAutomation === 'function') {
            // DeepResearchの場合は長時間待機（最大60分）
            const isDeepResearch = window.FeatureConstants ? 
              window.FeatureConstants.isDeepResearch(config.function) :
              (config.function && config.function.toLowerCase().includes('research'));
            
            // Gensparkは処理に時間がかかるため特別扱い
            const isGenspark = aiName.toLowerCase() === 'genspark';
            const timeout = isDeepResearch ? 60 * 60 * 1000 : 
                          isGenspark ? 60 * 60 * 1000 :  // Genspark: 60分
                          60000;  // その他: 1分
            
            if (isDeepResearch) {
              console.log(`[TestRunner] ${aiName} DeepResearchモード - 最大60分待機`);
            } else if (isGenspark) {
              console.log(`[TestRunner] ${aiName} スライド生成モード - 最大60分待機`);
            }
            
            console.log(`[デバッグ] runAutomationに渡す機能名: "${config.function}"`);
            const result = await automation.runAutomation({
              model: config.model,
              function: config.function,
              text: config.text,
              send: config.send,
              waitResponse: config.waitResponse,
              getResponse: config.getResponse,
              timeout: timeout
            });
            
            // セレクタデータは後で別途取得する（外部スコープから）
            console.log(`✅ ${aiName} 自動化実行完了、セレクタデータは別途取得予定`);
            
            // セレクタデータを後で追加するための準備
            if (result.success) {
              console.log(`📋 ${aiName} runAutomation成功、セレクタデータを後で取得します`);
            }
            
            return result;
          } else {
            return { success: false, error: `${foundName}に適切な実行方法が見つかりません` };
          }
          
          // セレクタデータ取得関数（18種類の優先度に基づく属性収集）
          async function getSelectorData(aiName, automationObj) {
            const selectors = {};
            
            // 優先度リスト（高→低）
            const PRIORITY_ATTRIBUTES = [
              'data-testid',      // 1. React UIで最も信頼性が高い
              'aria-label',       // 2. Reactコンポーネントでよく使用
              'aria-haspopup',    // 3. メニュー系の状態管理
              'aria-expanded',    // 3. メニュー系の状態管理
              'data-state',       // 4. React状態管理属性
              'role',             // 5. ARIA roleは安定している
              'id',               // 6. 動的生成される可能性があるが記録
              'type',             // 7. input要素の種類
              'textContent',      // 8. ボタンのテキスト内容
              'className',        // 9. class（特定のパターン）
              'placeholder',      // 10. 入力欄のヒント
              'aria-label-parent',// 11. 親要素からの相対パス
              'multiple-selectors',// 12. 複数セレクタの組み合わせ
              'name',             // 13. フォーム要素で重要
              'data-*',           // 14. カスタムdata属性
              'title',            // 15. title属性
              'href',             // 15. href属性
              'src',              // 15. src属性
              'alt'               // 15. alt属性
            ];
            
            // 要素の詳細情報を取得する関数
            function getElementDetails(element) {
              if (!element) return null;
              
              const details = {
                tagName: element.tagName.toLowerCase(),
                attributes: {},
                selector: null,
                priority: 999
              };
              
              // 優先度順に属性をチェック
              for (let i = 0; i < PRIORITY_ATTRIBUTES.length; i++) {
                const attrName = PRIORITY_ATTRIBUTES[i];
                
                if (attrName === 'textContent') {
                  const text = element.textContent?.trim().substring(0, 50);
                  if (text) {
                    details.attributes.textContent = text;
                    if (!details.selector) {
                      details.selector = `${details.tagName}:contains("${text.substring(0, 20)}")`;
                      details.priority = i + 1;
                    }
                  }
                } else if (attrName === 'className') {
                  const classes = element.className;
                  if (classes) {
                    details.attributes.className = classes;
                    if (!details.selector && typeof classes === 'string') {
                      const primaryClass = classes.split(' ')[0];
                      details.selector = `.${primaryClass}`;
                      details.priority = i + 1;
                    }
                  }
                } else if (attrName === 'data-*') {
                  // カスタムdata属性を収集
                  for (const attr of element.attributes) {
                    if (attr.name.startsWith('data-') && attr.name !== 'data-testid' && attr.name !== 'data-state') {
                      details.attributes[attr.name] = attr.value;
                      if (!details.selector) {
                        details.selector = `[${attr.name}="${attr.value}"]`;
                        details.priority = i + 1;
                      }
                    }
                  }
                } else {
                  const value = element.getAttribute(attrName);
                  if (value) {
                    details.attributes[attrName] = value;
                    if (!details.selector) {
                      details.selector = `[${attrName}="${value}"]`;
                      details.priority = i + 1;
                    }
                  }
                }
              }
              
              // セレクタが見つからない場合はタグ名を使用
              if (!details.selector) {
                details.selector = details.tagName;
              }
              
              return details;
            }
            
            try {
              // ui-selectors.jsを使用してセレクタ候補を取得
              let UI_SELECTORS = window.UI_SELECTORS || {};
              
              // UI_SELECTORSが空の場合、少し待ってから再試行
              if (Object.keys(UI_SELECTORS).length === 0) {
                console.log(`⚠️ UI_SELECTORSが空です。200ms待機してから再試行...`);
                await new Promise(resolve => setTimeout(resolve, 200));
                UI_SELECTORS = window.UI_SELECTORS || {};
              }
              
              console.log(`🔍 UI_SELECTORS取得:`, Object.keys(UI_SELECTORS));
              console.log(`🔍 UI_SELECTORSオブジェクト:`, UI_SELECTORS);
              console.log(`🔍 ${aiName}のセレクタを検索中...`);
              const aiSelectors = UI_SELECTORS[aiName] || {};
              console.log(`🔍 ${aiName}のセレクタ:`, aiSelectors);
              
              // 空の場合の代替処理
              if (Object.keys(aiSelectors).length === 0) {
                console.warn(`⚠️ UI_SELECTORS[${aiName}]が空です。代替セレクタを使用します。`);
                // 代替セレクタの定義（ui-selectors.jsと同じものを使用）
                const fallbackSelectors = {
                  ChatGPT: {
                    INPUT: ['#prompt-textarea', '[contenteditable="true"]', '.ProseMirror', 'div[contenteditable="true"]', 'textarea[data-testid="conversation-textarea"]', 'textarea[placeholder*="メッセージ"]', 'textarea'],
                    SEND_BUTTON: ['[data-testid="send-button"]', '#composer-submit-button', '[aria-label="プロンプトを送信する"]', '[aria-label="Send prompt"]', '[aria-label*="送信"]', 'button[data-testid="composer-send-button"]', 'button[class*="send"]', 'button[type="submit"]'],
                    STOP_BUTTON: ['[data-testid="stop-button"]', '[aria-label="応答を停止"]', '[aria-label="Stop streaming"]', '[aria-label*="停止"]', 'button[class*="stop"]'],
                    MESSAGE: ['[data-testid="conversation-turn-"]', '.group.w-full', '[data-message-id]', '[data-message-author-role]', '.text-message', '.message-content']
                  },
                  Claude: {
                    INPUT: ['[contenteditable="true"][role="textbox"]', '.ProseMirror', '[data-testid="chat-input"]', 'div[contenteditable="true"]', 'textarea[placeholder*="Claude"]'],
                    SEND_BUTTON: ['button[aria-label="メッセージを送信"]', '[data-testid="send-button"]', 'button[aria-label="Send Message"]', 'button[type="submit"]', '.send-button'],
                    STOP_BUTTON: ['button[aria-label="停止"]', '[data-testid="stop-button"]', 'button[aria-label="Stop"]', 'button[class*="stop"]'],
                    MESSAGE: ['.font-claude-message', '[data-testid="conversation-turn"]', '.prose', '.message-content', '[role="article"]']
                  },
                  Gemini: {
                    INPUT: ['.ql-editor', '[contenteditable="true"]', '[data-testid="chat-input"]', 'textarea[placeholder*="Gemini"]', 'div[contenteditable="true"]'],
                    SEND_BUTTON: ['.send-button-container button', '[data-testid="send-button"]', 'button[aria-label*="送信"]', 'button[aria-label*="Send"]', 'button[type="submit"]'],
                    STOP_BUTTON: ['button[aria-label*="停止"]', '[data-testid="stop-button"]', 'button[aria-label*="Stop"]', 'button[class*="stop"]'],
                    MESSAGE: ['.model-response-text', '[data-testid="response"]', '.response-container', '.markdown', '.message-content']
                  }
                };
                
                const fallback = fallbackSelectors[aiName];
                if (fallback) {
                  console.log(`🔄 ${aiName}の代替セレクタを使用します:`, fallback);
                  Object.assign(aiSelectors, fallback);
                }
              }
              
              // 各タイプのセレクタを検索
              const types = [
                { key: 'input', candidates: aiSelectors.INPUT || [] },
                { key: 'send', candidates: aiSelectors.SEND_BUTTON || [] },
                { key: 'stop', candidates: aiSelectors.STOP_BUTTON || [] },
                { key: 'response', candidates: aiSelectors.MESSAGE || aiSelectors.RESPONSE || [] }
              ];
              console.log(`🔍 検索するセレクタタイプ:`, types);
              
              for (const type of types) {
                console.log(`🔍 ${type.key}のセレクタ候補数: ${type.candidates.length}`);
                let bestElement = null;
                let bestPriority = 999;
                let bestSelector = null;
                let bestDetails = null;
                
                for (const selector of type.candidates) {
                  try {
                    console.log(`  🔍 試行中: ${selector}`);
                    const element = document.querySelector(selector);
                    if (element) {
                      console.log(`  ✅ 要素発見: ${selector}`);
                      
                      // 要素の可視性をチェック
                      const isVisible = element.offsetParent !== null && 
                                       window.getComputedStyle(element).display !== 'none' &&
                                       window.getComputedStyle(element).visibility !== 'hidden';
                      
                      console.log(`    表示状態: ${isVisible ? '可視' : '非表示'}`);
                      
                      const details = getElementDetails(element);
                      if (details && details.priority < bestPriority) {
                        bestElement = element;
                        bestPriority = details.priority;
                        bestSelector = selector;
                        bestDetails = details;
                        console.log(`    新しい最高優先度: ${details.priority}`);
                      }
                    } else {
                      console.log(`  ❌ 要素なし: ${selector}`);
                    }
                  } catch (e) {
                    console.log(`  ⚠️ セレクタエラー: ${selector}`, e.message);
                  }
                }
                
                if (bestElement && bestDetails) {
                  // 最も優先度の高いセレクタを保存
                  selectors[type.key] = {
                    selector: bestDetails.selector,
                    fullSelector: bestSelector,  // 元のセレクタも保存
                    priority: bestDetails.priority,
                    attributes: bestDetails.attributes,
                    tagName: bestDetails.tagName,
                    visible: bestElement.offsetParent !== null
                  };
                  console.log(`✅ ${aiName} ${type.key}要素発見（優先度${bestPriority}）:`, bestDetails);
                } else {
                  console.log(`⚠️ ${aiName} ${type.key}要素未検出`);
                }
              }
              
              console.log(`📊 ${aiName}: セレクタ詳細取得完了`, selectors);
              
              // セレクタが空の場合、現在のページの状態を確認
              if (Object.keys(selectors).length === 0) {
                console.warn(`⚠️ ${aiName}: セレクタが1つも見つかりませんでした`);
                console.log(`現在のURL: ${window.location.href}`);
                console.log(`ページタイトル: ${document.title}`);
                console.log(`document.readyState: ${document.readyState}`);
                
                // 実際に存在する要素を確認
                const possibleInputs = document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]');
                const possibleButtons = document.querySelectorAll('button');
                console.log(`ページ上の入力欄数: ${possibleInputs.length}`);
                console.log(`ページ上のボタン数: ${possibleButtons.length}`);
                
                if (possibleInputs.length > 0) {
                  console.log(`最初の入力欄:`, possibleInputs[0]);
                  console.log(`  ID: ${possibleInputs[0].id}`);
                  console.log(`  クラス: ${possibleInputs[0].className}`);
                  console.log(`  data-testid: ${possibleInputs[0].getAttribute('data-testid')}`);
                }
                if (possibleButtons.length > 0) {
                  console.log(`最初のボタン:`, possibleButtons[0]);
                  console.log(`  テキスト: ${possibleButtons[0].textContent?.trim()}`);
                  console.log(`  aria-label: ${possibleButtons[0].getAttribute('aria-label')}`);
                  console.log(`  data-testid: ${possibleButtons[0].getAttribute('data-testid')}`);
                }
              } else {
                // セレクタが見つかった場合の詳細情報
                const selectorCount = Object.keys(selectors).length;
                console.log(`✅ ${aiName}: ${selectorCount}個のセレクタを取得しました`);
                
                // 各セレクタの詳細を表示
                Object.entries(selectors).forEach(([key, data]) => {
                  console.log(`  ${key}: ${data.fullSelector} (優先度: ${data.priority}, 可視: ${data.visible})`);
                });
              }
              
              return selectors;
              
            } catch (error) {
              console.error(`❌ ${aiName}: セレクタ取得エラー`, error);
              return {};
            }
          }
          
        } catch (error) {
          console.error(`[TestRunner] 実行エラー:`, error);
          return { success: false, error: error.message };
        }
      },
      args: [aiType, {
        model: "first",  // 一番上のモデルを選択
        // functionは設定しない（機能選択をスキップ）
        text: "桃太郎の歴史について解説して",
        send: true,
        waitResponse: true,
        getResponse: true,
        cellInfo: {  // セレクタ検出テスト用のダミーセル情報を追加
          column: "TEST",
          row: "検出"
        }
      }]
    }, (results) => {
      if (chrome.runtime.lastError) {
        logToExtensionUI(`❌ [${aiType}] executeInTab実行エラー: ${chrome.runtime.lastError.message}`, "error", aiType);
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      
      const result = results[0]?.result;
      if (result && result.success) {
        logToExtensionUI(`🎉 [${aiType}] runAutomation実行完了`, "success", aiType);
        logToExtensionUI(`📋 [${aiType}] 応答: ${result.response?.substring(0, 100) || '取得失敗'}...`, "info", aiType);
        
        // runAutomation完了後にセレクタデータを別途取得
        logToExtensionUI(`🔍 [${aiType}] セレクタデータを取得中...`, "info", aiType);
        
        // 2秒待機してからセレクタデータを取得
        setTimeout(async () => {
          try {
            const selectorData = await executeGetSelectorData(tabId, aiType);
            console.log(`🔍 [${aiType}] 取得したセレクタデータ:`, selectorData);
            
            if (selectorData) {
              // 結果にセレクタデータを追加
              result.selectorData = selectorData;
              
              const selectorCount = Object.keys(selectorData).length;
              logToExtensionUI(`📊 [${aiType}] セレクタ取得: ${selectorCount}個`, "success", aiType);
              
              // セレクタ情報をUIに直接表示
              updateSelectorDisplay(aiType, selectorData);
              
              // Chrome Storageに保存
              const tab = await chrome.tabs.get(tabId);
              await saveSelectorDataToStorage(tab.url, selectorData);
            } else {
              logToExtensionUI(`⚠️ [${aiType}] セレクタデータの取得に失敗`, "warning", aiType);
            }
          } catch (error) {
            console.error(`❌ [${aiType}] セレクタデータ取得エラー:`, error);
            logToExtensionUI(`❌ [${aiType}] セレクタデータ取得エラー: ${error.message}`, "error", aiType);
          }
        }, 2000);
        
      } else {
        logToExtensionUI(`❌ [${aiType}] 処理失敗: ${result?.error || 'Unknown error'}`, "error", aiType);
      }
      
      resolve(result || { success: false, error: 'No result returned' });
    });
  });
}

/**
 * 優先順位付きセレクタ検出
 * ユーザー指定の優先順位リストに基づいてセレクタを検出
 */
async function detectSelectorWithPriority(tabId, aiType, selectorType) {
  console.log(`🔍 [${aiType}] ${selectorType}セレクタを優先順位で検出中...`);
  
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (aiType, selectorType) => {
      // 優先順位リスト（高→低）
      const PRIORITY_LIST = [
        'data-testid',     // 1. 最も信頼性が高い
        'id',              // 2. 固有性が高い
        'name',            // 3. フォーム要素で重要
        'data-component',  // 4. カスタムdata属性
        'data-feature',
        'role',            // 5. セマンティクス
        'type',            // 6. input要素の種類
        'aria-label',      // 7. ARIA属性
        'aria-haspopup',
        'value',           // 8. 特定の値を持つ要素
        'placeholder',     // 9. 入力欄のヒント
        'title',           // 10. ツールチップテキスト
        'href',            // 11. リンクのURL
        'src',             // 12. 画像から特定
        'alt',
        'class',           // 13. 変更されやすいが一般的
        'textContent'      // 14. テキスト内容（最後の手段）
      ];
      
      // 既存のAIMutationObserverからセレクタ候補を取得
      let selectorCandidates = [];
      
      if (window.currentAIObserver && window.currentAIObserver.getSelectors) {
        selectorCandidates = window.currentAIObserver.getSelectors(selectorType) || [];
      }
      
      const detectionResults = [];
      
      // 各セレクタ候補をテスト
      for (let i = 0; i < selectorCandidates.length; i++) {
        const selector = selectorCandidates[i];
        const elements = document.querySelectorAll(selector);
        
        if (elements.length > 0) {
          const element = elements[0]; // 最初に見つかった要素を使用
          
          // 要素の属性を優先順位順で分析
          const attributeAnalysis = PRIORITY_LIST.map(attrName => {
            let value = null;
            let priority = PRIORITY_LIST.indexOf(attrName) + 1;
            
            if (attrName === 'textContent') {
              value = element.textContent?.trim().substring(0, 50);
            } else {
              value = element.getAttribute(attrName) || element[attrName];
            }
            
            return {
              attribute: attrName,
              value: value,
              priority: priority,
              found: !!value
            };
          }).filter(attr => attr.found);
          
          detectionResults.push({
            selector: selector,
            element: {
              tagName: element.tagName,
              id: element.id,
              className: element.className,
              textContent: element.textContent?.trim().substring(0, 50)
            },
            attributes: attributeAnalysis,
            priority: Math.min(...attributeAnalysis.map(attr => attr.priority)),
            candidateIndex: i
          });
        }
      }
      
      // 優先順位でソート（数値が小さいほど高優先）
      detectionResults.sort((a, b) => a.priority - b.priority);
      
      const result = {
        selectorType: selectorType,
        aiType: aiType,
        timestamp: new Date().toISOString(),
        selector: detectionResults.length > 0 ? detectionResults[0].selector : null,
        allCandidates: selectorCandidates,
        detectionResults: detectionResults,
        bestMatch: detectionResults[0] || null
      };
      
      // 詳細ログ出力
      console.log(`🎯 [${aiType}] ${selectorType}セレクタ検出結果`);
      console.log(`📊 候補数: ${selectorCandidates.length}, 見つかった要素: ${detectionResults.length}`);
      
      if (detectionResults.length > 0) {
        const best = detectionResults[0];
        console.log(`✅ [${aiType}] 最優先セレクタ (優先度${best.priority}): ${best.selector}`);
        console.log(`📋 [${aiType}] 要素: <${best.element.tagName}> ${best.element.textContent}`);
        
        best.attributes.forEach((attr, index) => {
          console.log(`   ${index + 1}. ${attr.attribute} (優先度${attr.priority}): "${attr.value}"`);
        });
      } else {
        console.log(`❌ [${aiType}] ${selectorType}セレクタが見つかりませんでした`);
      }
      
      return result;
    },
    args: [aiType, selectorType]
  });
  
  return result.result;
}

/**
 * テキスト入力（各AI対応）
 */
async function inputText(tabId, aiType, selector, text) {
  logToExtensionUI(`📝 [${aiType}] テキスト入力開始: "${text}"`, "info", aiType);
  
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (selector, text, aiType) => {
      const element = document.querySelector(selector);
      if (!element) {
        console.error(`❌ 入力要素が見つかりません: ${selector}`);
        return { success: false, error: '入力要素が見つかりません' };
      }
      
      // 要素にフォーカス
      element.focus();
      element.click();
      
      // 既存の内容をクリア
      if (element.value !== undefined) {
        element.value = '';
      }
      if (element.textContent !== undefined) {
        element.textContent = '';
      }
      if (element.innerHTML !== undefined) {
        element.innerHTML = '';
      }
      
      // AI別の入力方法
      if (aiType === 'ChatGPT') {
        // ChatGPTの場合: textarea要素
        if (element.tagName === 'TEXTAREA') {
          element.value = text;
          // React系のイベントを発火
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
          nativeInputValueSetter.call(element, text);
          
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // contenteditable要素の場合
          element.textContent = text;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (aiType === 'Claude') {
        // Claudeの場合: contenteditable要素
        element.textContent = text;
        element.innerHTML = text;
        
        // contenteditable要素用のイベント
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('keyup', { bubbles: true }));
        element.dispatchEvent(new Event('compositionend', { bubbles: true }));
      } else if (aiType === 'Gemini') {
        // Geminiの場合: contenteditable要素
        element.textContent = text;
        element.innerHTML = text;
        
        // Gemini特有のイベント
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('keydown', { bubbles: true }));
        element.dispatchEvent(new Event('keyup', { bubbles: true }));
      }
      
      // 追加のイベント発火（どのAIでも共通）
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      
      // 入力後の状態確認
      const finalValue = element.value || element.textContent || element.innerHTML;
      
      console.log(`✅ [${aiType}] テキスト入力完了: "${finalValue}"`);
      return { 
        success: true, 
        finalValue: finalValue,
        method: aiType,
        element: {
          tagName: element.tagName,
          type: element.type,
          contentEditable: element.contentEditable
        }
      };
    },
    args: [selector, text, aiType]
  });
  
  const inputResult = result.result;
  if (inputResult.success) {
    logToExtensionUI(`✅ [${aiType}] テキスト入力成功: "${inputResult.finalValue}" (${inputResult.element.tagName})`, "success", aiType);
  } else {
    logToExtensionUI(`❌ [${aiType}] テキスト入力失敗: ${inputResult.error}`, "error", aiType);
  }
  
  return inputResult;
}

/**
 * 要素をクリック
 */
async function clickElement(tabId, aiType, selector) {
  console.log(`🖱️ [${aiType}] 要素クリック: ${selector}`);
  
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (selector) => {
      const element = document.querySelector(selector);
      if (element) {
        element.click();
        console.log(`✅ 要素クリック完了: ${selector}`);
        return true;
      } else {
        console.error(`❌ クリック要素が見つかりません: ${selector}`);
        return false;
      }
    },
    args: [selector]
  });
}

/**
 * 回答完了まで待機
 */
async function waitForResponseComplete(tabId, aiType, stopSelector) {
  console.log(`⏳ [${aiType}] 回答完了まで待機中...`);
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(async () => {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (stopSelector) => {
            const stopButton = document.querySelector(stopSelector);
            return !stopButton || !stopButton.offsetParent; // 要素が存在しないか非表示
          },
          args: [stopSelector]
        });
        
        if (result.result) {
          clearInterval(checkInterval);
          console.log(`✅ [${aiType}] 回答完了を検出`);
          resolve();
        }
      } catch (error) {
        // エラーは無視（要素が見つからない場合など）
      }
    }, 1000);
    
    // 最大60秒でタイムアウト
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log(`⚠️ [${aiType}] 回答待機タイムアウト`);
      resolve();
    }, 60000);
  });
}

/**
 * 回答テキストを取得
 */
async function getResponseText(tabId, aiType, selector) {
  console.log(`📋 [${aiType}] 回答テキスト取得: ${selector}`);
  
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (selector) => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // 最新の回答（最後の要素）を取得
        const lastElement = elements[elements.length - 1];
        const text = lastElement.textContent || lastElement.innerText || '';
        console.log(`✅ 回答テキスト取得完了: ${text.length}文字`);
        return text.trim();
      } else {
        console.error(`❌ 回答要素が見つかりません: ${selector}`);
        return '';
      }
    },
    args: [selector]
  });
  
  return result.result || '';
}

/**
 * AIサイトのタブを検索
 * @returns {Promise<Array>} AIサイトのタブ一覧
 */
async function findAISiteTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const aiTabs = tabs.filter(tab => {
        const url = tab.url.toLowerCase();
        return (
          (url.includes('chatgpt.com') || url.includes('chat.openai.com')) ||
          url.includes('claude.ai') ||
          (url.includes('gemini.google.com') || url.includes('bard.google.com'))
        );
      });
      resolve(aiTabs);
    });
  });
}

/**
 * 特定のタブでMutationObserver開始
 * @param {number} tabId - タブID
 * @param {string} url - タブのURL
 * @returns {Promise<boolean>} 成功の場合true
 */
async function startMutationObserverOnTab(tabId, url) {
  try {
    console.log(`🚀 TabID ${tabId} にMutationObserver開始メッセージ送信`);
    
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'START_MUTATION_OBSERVER',
      timestamp: Date.now(),
      url: url
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

/**
 * 特定のタブでMutationObserver停止
 * @param {number} tabId - タブID
 * @returns {Promise<boolean>} 成功の場合true
 */
async function stopMutationObserverOnTab(tabId) {
  try {
    console.log(`🛑 TabID ${tabId} にMutationObserver停止メッセージ送信`);
    
    const response = await chrome.tabs.sendMessage(tabId, {
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

/**
 * セレクタデータの定期収集を開始
 */
function startSelectorDataCollection() {
  console.log("📊 セレクタデータの定期収集を開始します");
  
  // 5秒ごとにセレクタデータを収集
  selectorDataCollectionInterval = setInterval(async () => {
    if (currentMutationObserver && currentMutationObserver.tabs) {
      console.log("🔍 セレクタデータ収集中...");
      
      for (const tab of currentMutationObserver.tabs) {
        try {
          const selectorData = await getSelectorDataFromTab(tab.id);
          if (selectorData) {
            console.log(`📋 TabID ${tab.id} セレクタデータ:`, selectorData);
            
            // セレクタデータをChrome Storageに保存
            await saveSelectorDataToStorage(tab.url, selectorData);
          }
        } catch (error) {
          // エラーは通常のフロー（まだ完了していない）なので詳細ログは不要
          console.log(`📝 TabID ${tab.id} セレクタデータ収集待機中...`);
        }
      }
    }
  }, 5000);
}

/**
 * セレクタデータの定期収集を停止
 */
function stopSelectorDataCollection() {
  if (selectorDataCollectionInterval) {
    clearInterval(selectorDataCollectionInterval);
    selectorDataCollectionInterval = null;
    console.log("📊 セレクタデータの定期収集を停止しました");
  }
}

/**
 * 特定のタブからセレクタデータを取得
 * @param {number} tabId - タブID
 * @returns {Promise<Object>} セレクタデータ
 */
async function getSelectorDataFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'GET_SELECTOR_DATA',
      timestamp: Date.now()
    });
    
    if (response && response.success && response.data) {
      return response.data;
    }
    return null;
  } catch (error) {
    // エラーは通常のフロー（まだ完了していない）なので詳細ログは不要
    return null;
  }
}

/**
 * executeScriptを使ってセレクタデータを直接取得
 * @param {number} tabId - タブID
 * @param {string} aiType - AI名
 * @returns {Promise<Object>} セレクタデータ
 */
async function executeGetSelectorData(tabId, aiType) {
  console.log(`🔍 executeGetSelectorData開始: tabId=${tabId}, aiType=${aiType}`);
  
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (aiName) => {
        console.log(`🔍 executeScript内でセレクタ取得開始: ${aiName}`);
        console.log(`現在のURL: ${window.location.href}`);
        console.log(`ページタイトル: ${document.title}`);
        
        // getSelectorData関数を再実装（executeScript内で実行可能な形）
        const selectors = {};
        
        try {
          // ui-selectors.jsを使用してセレクタ候補を取得
          let UI_SELECTORS = window.UI_SELECTORS || {};
          console.log(`UI_SELECTORS取得:`, Object.keys(UI_SELECTORS));
          
          // UI_SELECTORSが空の場合の代替セレクタ
          if (Object.keys(UI_SELECTORS).length === 0) {
            const fallbackSelectors = {
              ChatGPT: {
                INPUT: ['#prompt-textarea', '[contenteditable="true"]', '.ProseMirror', 'div[contenteditable="true"]', 'textarea[data-testid="conversation-textarea"]', 'textarea[placeholder*="メッセージ"]', 'textarea'],
                SEND_BUTTON: ['[data-testid="send-button"]', '#composer-submit-button', '[aria-label="プロンプトを送信する"]', '[aria-label="Send prompt"]', '[aria-label*="送信"]', 'button[data-testid="composer-send-button"]', 'button[class*="send"]', 'button[type="submit"]'],
                STOP_BUTTON: ['[data-testid="stop-button"]', '[aria-label="応答を停止"]', '[aria-label="Stop streaming"]', '[aria-label*="停止"]', 'button[class*="stop"]'],
                MESSAGE: ['[data-testid="conversation-turn-"]', '.group.w-full', '[data-message-id]', '[data-message-author-role]', '.text-message', '.message-content']
              },
              Claude: {
                INPUT: ['[contenteditable="true"][role="textbox"]', '.ProseMirror', '[data-testid="chat-input"]', 'div[contenteditable="true"]', 'textarea[placeholder*="Claude"]'],
                SEND_BUTTON: ['button[aria-label="メッセージを送信"]', '[data-testid="send-button"]', 'button[aria-label="Send Message"]', 'button[type="submit"]', '.send-button'],
                STOP_BUTTON: ['button[aria-label="停止"]', '[data-testid="stop-button"]', 'button[aria-label="Stop"]', 'button[class*="stop"]'],
                MESSAGE: ['.font-claude-message', '[data-testid="conversation-turn"]', '.prose', '.message-content', '[role="article"]']
              },
              Gemini: {
                INPUT: ['.ql-editor', '[contenteditable="true"]', '[data-testid="chat-input"]', 'textarea[placeholder*="Gemini"]', 'div[contenteditable="true"]'],
                SEND_BUTTON: ['.send-button-container button', '[data-testid="send-button"]', 'button[aria-label*="送信"]', 'button[aria-label*="Send"]', 'button[type="submit"]'],
                STOP_BUTTON: ['button[aria-label*="停止"]', '[data-testid="stop-button"]', 'button[aria-label*="Stop"]', 'button[class*="stop"]'],
                MESSAGE: ['.model-response-text', '[data-testid="response"]', '.response-container', '.markdown', '.message-content']
              }
            };
            
            const fallback = fallbackSelectors[aiName];
            if (fallback) {
              UI_SELECTORS[aiName] = fallback;
            }
          }
          
          const aiSelectors = UI_SELECTORS[aiName] || {};
          
          // 各タイプのセレクタを検索
          const types = [
            { key: 'input', candidates: aiSelectors.INPUT || [] },
            { key: 'send', candidates: aiSelectors.SEND_BUTTON || [] },
            { key: 'stop', candidates: aiSelectors.STOP_BUTTON || [] },
            { key: 'response', candidates: aiSelectors.MESSAGE || aiSelectors.RESPONSE || [] }
          ];
          
          for (const type of types) {
            for (const selector of type.candidates) {
              try {
                const element = document.querySelector(selector);
                if (element) {
                  selectors[type.key] = {
                    selector: selector,
                    fullSelector: selector,
                    visible: element.offsetParent !== null,
                    tagName: element.tagName.toLowerCase(),
                    priority: 1
                  };
                  break;
                }
              } catch (e) {
                console.log(`セレクタエラー: ${selector}`, e.message);
              }
            }
          }
          
          console.log(`${aiName} セレクタ取得完了:`, selectors);
          return selectors;
          
        } catch (error) {
          console.error(`${aiName} セレクタ取得エラー:`, error);
          return {};
        }
      },
      args: [aiType]
    });
    
    return result?.result || {};
  } catch (error) {
    console.error(`executeGetSelectorData エラー:`, error);
    return {};
  }
}

/**
 * セレクタデータをChrome Storageに保存
 * @param {string} url - タブのURL
 * @param {Object} selectorData - セレクタデータ
 */
async function saveSelectorDataToStorage(url, selectorData) {
  try {
    // AIタイプを判定
    let aiType = 'unknown';
    if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
      aiType = 'chatgpt';
    } else if (url.includes('claude.ai')) {
      aiType = 'claude';
    } else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
      aiType = 'gemini';
    }
    
    // 既存のセレクタデータを取得
    const result = await chrome.storage.local.get(['ai_selector_data']);
    const existingData = result.ai_selector_data || {};
    
    // 新しいデータをマージ
    existingData[aiType] = {
      ...selectorData,
      lastUpdated: new Date().toISOString(),
      url: url
    };
    
    // ストレージに保存
    await chrome.storage.local.set({ ai_selector_data: existingData });
    
    console.log(`💾 ${aiType}のセレクタデータをストレージに保存しました:`, selectorData);
    
    // UIセレクタ情報セクションの更新を通知
    if (typeof window !== 'undefined' && window.updateAIStatus) {
      window.updateAIStatus();
    }
    
  } catch (error) {
    console.error("セレクタデータ保存エラー:", error);
  }
}

// グローバルに公開（モジュールインポートが使えない場合のフォールバック）
if (typeof window !== 'undefined') {
  window.MutationObserverController = {
    toggleMutationObserverMonitoring,
    isMutationObserverRunning,
    getCurrentMutationObserver
  };
}