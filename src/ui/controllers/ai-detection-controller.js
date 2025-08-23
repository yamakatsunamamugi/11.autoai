/**
 * @fileoverview モデル・機能変更検出システム コントローラー
 * 
 * 4分割ウィンドウでAI変更検出を実行する機能を管理します。
 * ChatGPT、Claude、Geminiの設定を自動検出して保存します。
 */

// AI検出ウィンドウの管理
let aiDetectionWindows = [];

/**
 * AI変更検出システムを実行
 * @param {Function} updateStatus - ステータス更新関数
 * @param {Function} injectAutomationScripts - スクリプト注入関数
 */
export async function runAIDetectionSystem(updateStatus, injectAutomationScripts) {
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
    
    // 既存のAI検出ウィンドウがあれば閉じる
    if (aiDetectionWindows.length > 0) {
      console.log('既存のAI検出ウィンドウを閉じます');
      await closeAIDetectionWindows();
    }
    
    // 1. ChatGPTウィンドウを左上に開く
    const chatgptWindow = await createAIWindow(
      'https://chatgpt.com',
      0, 0, halfWidth, halfHeight,
      'ChatGPT'
    );
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 2. Claudeウィンドウを右上に開く
    const claudeWindow = await createAIWindow(
      'https://claude.ai',
      halfWidth, 0, halfWidth, halfHeight,
      'Claude'
    );
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 3. Geminiウィンドウを左下に開く
    const geminiWindow = await createAIWindow(
      'https://gemini.google.com',
      0, halfHeight, halfWidth, halfHeight,
      'Gemini'
    );
    
    console.log('4分割ウィンドウを開きました。各AIの自動化スクリプトを注入します...');
    
    // 各ウィンドウのタブIDを取得して自動化スクリプトを注入
    const windows = [
      { window: chatgptWindow, name: 'ChatGPT' },
      { window: claudeWindow, name: 'Claude' },
      { window: geminiWindow, name: 'Gemini' }
    ];
    
    // 各ウィンドウの処理を並列実行
    const results = await processWindowsInParallel(windows, updateStatus, injectAutomationScripts);
    
    // 結果を集計
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const errorCount = results.length - successCount;
    
    console.log(`📊 並列処理結果: 成功 ${successCount}件, エラー ${errorCount}件`);
    
    // データを保存
    await saveDetectionResults(results, windows);
    
    console.log('🎉 すべてのAI検出が完了しました。5秒後に自動でウィンドウを閉じます...');
    updateStatus("すべてのAI検出が完了しました。5秒後に自動でウィンドウを閉じます...", "success");
    
    // 5秒後に自動でウィンドウを閉じる
    setTimeout(async () => {
      await closeAIDetectionWindows();
      updateStatus("AI検出完了。ウィンドウを閉じました。", "success");
    }, 5000);
    
  } catch (error) {
    console.error('AI検出エラー:', error);
    updateStatus("AI検出エラー", "error");
    await closeAIDetectionWindows();
  }
}

/**
 * AIウィンドウを作成
 * @private
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
      focused: true  // AIページを最前面に表示
    }, (window) => {
      console.log(`✅ ${aiType}ウィンドウを開きました`);
      if (window) {
        aiDetectionWindows.push({ windowId: window.id, aiType: aiType });
      }
      resolve(window);
    });
  });
}

/**
 * ウィンドウを並列処理
 * @private
 */
async function processWindowsInParallel(windows, updateStatus, injectAutomationScripts) {
  let completedCount = 0;
  const totalWindows = windows.length;
  
  const processPromises = windows.map(async ({ window, name }) => {
    if (window && window.tabs && window.tabs[0]) {
      const tabId = window.tabs[0].id;
      console.log(`${name}にスクリプトを注入します (タブID: ${tabId})`);
      
      try {
        // ページの読み込みが完了するまで待機
        await waitForPageLoad(tabId, name);
        
        // スクリプトを注入し、saveDataを取得
        const saveData = await injectAutomationScripts(tabId, name);
        
        completedCount++;
        console.log(`🔢 AI検出進捗: ${completedCount}/${totalWindows} 完了 (${name})`);
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
  
  console.log('🚀 すべてのAI検出を並列実行開始...');
  return await Promise.allSettled(processPromises);
}

/**
 * ページ読み込み待機
 * @private
 */
async function waitForPageLoad(tabId, name) {
  return new Promise((resolve) => {
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
}

/**
 * 検出結果を保存
 * @private
 */
async function saveDetectionResults(results, windows) {
  console.log('💾 すべてのAI検出が完了しました。データを一括保存します...');
  
  const allSaveData = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success && result.value.saveData) {
      const aiName = windows[index].name.toLowerCase();
      allSaveData[aiName] = result.value.saveData;
      console.log(`✔️ ${windows[index].name}のデータを収集`);
    }
  });
  
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
}

/**
 * AI検出ウィンドウを閉じる
 */
export async function closeAIDetectionWindows() {
  console.log('🔄 AI検出ウィンドウを閉じます...');
  
  if (aiDetectionWindows.length === 0) {
    console.log('閉じるウィンドウがありません');
    return;
  }
  
  for (const winInfo of aiDetectionWindows) {
    try {
      await new Promise((resolve) => {
        chrome.windows.remove(winInfo.windowId, () => {
          console.log(`✅ ${winInfo.aiType}ウィンドウを閉じました`);
          resolve();
        });
      });
    } catch (error) {
      console.error(`${winInfo.aiType}ウィンドウを閉じる際にエラー:`, error);
    }
  }
  
  aiDetectionWindows = [];
  console.log('✅ すべてのAI検出ウィンドウを閉じました');
}

/**
 * AI検出状態を取得
 */
export function getDetectionWindows() {
  return aiDetectionWindows;
}