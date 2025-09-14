/**
 * @fileoverview テスト用AIモデル・機能変更検出システム コントローラー V2 - ステップ構造化版
 *
 * 【ステップ構成】
 * Step 0: 初期化・設定 - システムの基本設定とモジュール初期化
 * Step 1: メインエントリーポイント - 4分割ウィンドウ作成と検出制御
 * Step 2: ウィンドウ作成・管理 - 本番のWindowServiceを使用したウィンドウ管理
 * Step 3: 検出・スクリプト注入 - 本番のAITaskExecutorを使用した統一処理
 * Step 4: 並列処理・結果集計 - StreamProcessorV2のパターンを流用
 * Step 5: データ保存・クリーンアップ - 結果保存とリソース解放
 *
 * ============================================================================
 * 主要機能:
 * ============================================================================
 * 1. 4分割ウィンドウでのAI検出: ChatGPT、Claude、Geminiを同時表示
 * 2. 本番コード統合: WindowService、AITaskExecutor、RetryManagerを使用
 * 3. 並列検出処理: 3つのAIを同時に検出して効率化
 * 4. データ永続化: chrome.storageへの結果保存
 * 5. 自動クリーンアップ: 検出完了後のウィンドウ自動クローズ
 *
 * @version 2.0.0
 * @updated 2025-09-14 ファイル分離、testプレフィックス追加
 */

// ========================================
// Step 0: 初期化・設定
// システム全体の基本設定と依存モジュールの初期化を行う
// ========================================

// Step 0-1: AI検出システム設定定義
const AI_DETECTION_CONFIG = {
  windowCloseDelay: 5000,        // 自動クローズまでの遅延時間（ミリ秒）
  pageLoadTimeout: 10000,        // ページ読み込み待機タイムアウト（ミリ秒）
  retryCount: 3,                 // 失敗時のリトライ回数
  windowCreationDelay: 300       // ウィンドウ作成間隔（ミリ秒）
};

// Step 0-2: AI検出ウィンドウの管理変数
let aiDetectionWindows = [];

// Step 0-3: 内部ステータス表示関数
function updateStatus(message, status = 'info') {
  console.log(`[AI検出システム] ${message}`);

  // DOM要素が存在する場合はUI更新
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${status}`;
  }
}

// Step 0-4: AI検出用の設定マップ
const AI_CONFIG_MAP = {
  'ChatGPT': {
    url: 'https://chatgpt.com',
    position: 'topLeft',
    aiType: 'chatgpt'
  },
  'Claude': {
    url: 'https://claude.ai',
    position: 'topRight',
    aiType: 'claude'
  },
  'Gemini': {
    url: 'https://gemini.google.com',
    position: 'bottomLeft',
    aiType: 'gemini'
  }
};

// Step 0-4: 本番自動化コードのセレクタ定義（1-ai-common-base.jsから取得）
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
    ]
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
    ]
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
    ]
  }
};

// ========================================
// Step 1: メインエントリーポイント
// 4分割ウィンドウの作成から検出完了までの全体制御を行う
// ========================================

/**
 * Step 1: AI検出システムメインエントリーポイント
 *
 * StreamProcessorV2と同じパターンでステップ化された検出処理を実行します。
 * 本番のWindowServiceとAITaskExecutorを使用して統一された処理を行います。
 *
 * 完全に独立して実行可能。引数は不要。
 */
export async function runAIDetectionSystem() {
  console.log('📍 Step 1: AI検出システムメインエントリーポイント開始');
  console.log('ℹ️ Step 1-0: 4分割ウィンドウでのAI検出処理を開始します');

  try {
    // Step 1-1: スクリーン情報取得とレイアウト計算
    console.log('ℹ️ Step 1-1: スクリーン情報取得とレイアウト計算処理開始');
    const screenInfo = await getScreenInfo();
    const quadLayout = calculateQuadLayout(screenInfo);

    console.log(`ℹ️ Step 1-1-1: 📊 画面サイズ確認 - ${screenInfo.width}x${screenInfo.height}`);
    console.log(`ℹ️ Step 1-1-2: 📐 各ウィンドウサイズ確認 - ${quadLayout.topLeft.width}x${quadLayout.topLeft.height}`);

    // Step 1-2: 既存ウィンドウのクリーンアップ
    console.log('ℹ️ Step 1-2: 既存ウィンドウクリーンアップ処理開始');
    if (aiDetectionWindows.length > 0) {
      console.log(`ℹ️ Step 1-2-1: 🧹 ${aiDetectionWindows.length}個の既存ウィンドウクローズ実行中`);
      await closeAIDetectionWindows();
    }

    // Step 1-3: 3つのAIウィンドウを順次作成
    console.log('ℹ️ Step 1-3: 3つのAIウィンドウを順次作成');

    const chatgptWindow = await createAIWindowWithPosition('ChatGPT', quadLayout.topLeft);
    await sleep(AI_DETECTION_CONFIG.windowCreationDelay);

    const claudeWindow = await createAIWindowWithPosition('Claude', quadLayout.topRight);
    await sleep(AI_DETECTION_CONFIG.windowCreationDelay);

    const geminiWindow = await createAIWindowWithPosition('Gemini', quadLayout.bottomLeft);

    // Step 1-4: 検出対象ウィンドウの準備
    console.log('ℹ️ Step 1-4: 🎯 4分割ウィンドウを作成完了。検出処理を準備');
    const detectionWindows = [
      { window: chatgptWindow, name: 'ChatGPT', config: AI_CONFIG_MAP['ChatGPT'] },
      { window: claudeWindow, name: 'Claude', config: AI_CONFIG_MAP['Claude'] },
      { window: geminiWindow, name: 'Gemini', config: AI_CONFIG_MAP['Gemini'] }
    ];

    // Step 1-5: 並列検出処理の実行
    console.log('ℹ️ Step 1-5: 🚀 3つのAIで並列検出処理を開始');
    const results = await executeDetectionInParallel(detectionWindows);

    // Step 1-6: 検出結果の集計と分析
    console.log('ℹ️ Step 1-6: 検出結果を集計して分析');
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const errorCount = results.length - successCount;

    console.log(`ℹ️ Step 1-6-1: 📊 並列検出結果: 成功 ${successCount}件, エラー ${errorCount}件`);

    // Step 1-7: データ保存処理
    console.log('ℹ️ Step 1-7: 検出データを永続化');
    await saveDetectionResults(results, detectionWindows);

    // Step 1-8: 成功通知と自動クリーンアップ設定
    console.log('ℹ️ Step 1-8: 🎉 すべてのAI検出が完了。自動クリーンアップを設定');
    const successMessage = `すべてのAI検出が完了しました。${AI_DETECTION_CONFIG.windowCloseDelay / 1000}秒後に自動でウィンドウを閉じます...`;
    updateStatus(successMessage, "success");

    // Step 1-8-1: 遅延クリーンアップの設定
    setTimeout(async () => {
      console.log('ℹ️ Step 1-8-1: 自動クリーンアップを実行');
      await closeAIDetectionWindows();
      updateStatus("AI検出完了。ウィンドウを閉じました。", "success");
    }, AI_DETECTION_CONFIG.windowCloseDelay);

  } catch (error) {
    // Step 1-9: エラーハンドリングとクリーンアップ
    console.error('❌ Step 1-9: AI検出システムでエラーが発生');
    console.error('エラー詳細:', error);
    updateStatus(`AI検出エラー: ${error.message}`, "error");

    // 緊急クリーンアップ
    await closeAIDetectionWindows();
  }
}

// ========================================
// Step 2: ウィンドウ作成・管理
// 本番のWindowServiceを使用したウィンドウ作成と管理機能
// ========================================

/**
 * Step 2-1: 位置指定付きAIウィンドウ作成
 */
async function createAIWindowWithPosition(aiName, position) {
  console.log(`📍 Step 2-1: ${aiName}ウィンドウ作成開始`);

  const config = AI_CONFIG_MAP[aiName];
  if (!config) {
    throw new Error(`未対応のAI: ${aiName}`);
  }

  try {
    const window = await chrome.windows.create({
      url: config.url,
      type: 'normal',
      state: 'normal',
      left: position.left,
      top: position.top,
      width: position.width,
      height: position.height,
      focused: false
    });

    console.log(`✅ Step 2-1-1: ${aiName}ウィンドウ作成完了 (ID: ${window.id})`);

    // ウィンドウ管理配列に追加
    aiDetectionWindows.push({
      id: window.id,
      aiName: aiName,
      aiType: config.aiType,
      url: config.url
    });

    return window;
  } catch (error) {
    console.error(`❌ Step 2-1-2: ${aiName}ウィンドウ作成エラー:`, error);
    throw error;
  }
}

/**
 * Step 2-2: スクリーン情報取得
 */
async function getScreenInfo() {
  return new Promise((resolve) => {
    chrome.system.display.getInfo((displays) => {
      const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
      resolve({
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top
      });
    });
  });
}

/**
 * Step 2-3: 4分割レイアウト計算
 */
function calculateQuadLayout(screenInfo) {
  const { width, height, left, top } = screenInfo;
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);

  return {
    topLeft: { left, top, width: halfWidth, height: halfHeight },
    topRight: { left: left + halfWidth, top, width: halfWidth, height: halfHeight },
    bottomLeft: { left, top: top + halfHeight, width: halfWidth, height: halfHeight },
    bottomRight: { left: left + halfWidth, top: top + halfHeight, width: halfWidth, height: halfHeight }
  };
}

/**
 * Step 2-4: AI検出ウィンドウクローズ
 */
async function closeAIDetectionWindows() {
  console.log(`📍 Step 2-4: ${aiDetectionWindows.length}個のAI検出ウィンドウを閉じます`);

  const closePromises = aiDetectionWindows.map(async (windowInfo) => {
    try {
      await chrome.windows.remove(windowInfo.id);
      console.log(`✅ Step 2-4-1: ${windowInfo.aiName}ウィンドウクローズ完了 (ID: ${windowInfo.id})`);
    } catch (error) {
      console.warn(`⚠️ Step 2-4-2: ${windowInfo.aiName}ウィンドウクローズ失敗 (ID: ${windowInfo.id}):`, error);
    }
  });

  await Promise.allSettled(closePromises);
  aiDetectionWindows = []; // リストをクリア
  console.log('✅ Step 2-4-3: すべてのAI検出ウィンドウクローズ処理完了');
}

// ========================================
// Step 3: 検出・スクリプト注入処理
// 本番のAITaskExecutorを使用した統一検出処理
// ========================================

/**
 * Step 3: 並列検出処理の実行
 */
async function executeDetectionInParallel(detectionWindows) {
  console.log('📍 Step 3: 並列検出処理を開始');

  let completedCount = 0;
  const totalWindows = detectionWindows.length;

  const detectionPromises = detectionWindows.map(async ({ window, name, config }) => {
    return await executeSingleDetection(window, name, config, () => {
      completedCount++;
      console.log(`ℹ️ Step 3-1: 🔢 AI検出進捗: ${completedCount}/${totalWindows} 完了 (${name})`);
      updateStatus(`AI検出中... (${completedCount}/${totalWindows}) - ${name}完了`, "loading");
    });
  });

  console.log('ℹ️ Step 3-2: 🚀 すべてのAI検出を並列実行開始...');
  return await Promise.allSettled(detectionPromises);
}

/**
 * Step 3-3: 単一AI検出処理
 */
async function executeSingleDetection(window, aiName, config, onComplete) {
  console.log(`📍 Step 3-3: ${aiName}の検出処理開始`);

  try {
    // Step 3-3-1: ページ読み込み待機
    console.log(`ℹ️ Step 3-3-1: ${aiName}のページ読み込み待機`);
    await sleep(AI_DETECTION_CONFIG.pageLoadTimeout);

    // Step 3-3-2: タブ取得
    const tabs = await chrome.tabs.query({ windowId: window.id });
    if (!tabs || tabs.length === 0) {
      throw new Error(`${aiName}のタブが見つかりません`);
    }

    const tab = tabs[0];
    console.log(`ℹ️ Step 3-3-2: ${aiName}タブ取得完了 (ID: ${tab.id})`);

    // Step 3-3-3: 本番の検出スクリプトを注入
    console.log(`ℹ️ Step 3-3-3: ${aiName}に本番検出スクリプトを注入`);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: productionDetectionScript,
      args: [config.aiType, PRODUCTION_SELECTORS[config.aiType]]
    });

    const detectionData = results[0]?.result || { models: [], functions: [] };
    console.log(`✅ Step 3-3-4: ${aiName}検出完了:`, detectionData);

    onComplete();

    return {
      success: true,
      aiName,
      aiType: config.aiType,
      data: detectionData
    };

  } catch (error) {
    console.error(`❌ Step 3-3-5: ${aiName}検出エラー:`, error);
    onComplete();

    return {
      success: false,
      aiName,
      aiType: config.aiType,
      error: error.message,
      data: { models: [], functions: [] }
    };
  }
}

/**
 * Step 3-4: 本番検出スクリプト（ページに注入される関数）
 */
function productionDetectionScript(aiType, selectors) {
  const results = { models: [], functions: [] };

  // 本番のユーティリティ関数
  function findElement(selectorArray) {
    for (const selector of selectorArray) {
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

  try {
    // モデル検出 - 現在のモデルボタンから取得
    console.log(`🔍 ${aiType} モデルボタンを検索...`);
    const modelButton = findElement(selectors.modelButton);
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
        let attempts = 0;
        while (!menu && attempts < 20) {
          menu = findElement(selectors.modelMenu);
          if (!menu) {
            // 100ms待機
            const start = Date.now();
            while (Date.now() - start < 100) {}
          }
          attempts++;
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

    // 機能検出 - よく使用される機能名を検索
    console.log(`🔍 ${aiType} 機能を検索...`);
    const commonFeatures = {
      chatgpt: ['Canvas', 'Code Interpreter', 'Web Search', 'DALL·E', 'Memory', 'Deep Research'],
      claude: ['Projects', 'Artifacts', 'Vision', 'Code Analysis', 'Deep Research'],
      gemini: ['Image Generation', 'Code Execution', 'Google Search', 'YouTube', 'Maps', 'Deep Think', 'Deep Research']
    };

    const featuresForAI = commonFeatures[aiType] || [];
    featuresForAI.forEach(feature => {
      const found = Array.from(document.querySelectorAll('*')).some(el => {
        const text = el.textContent;
        return text && text.includes(feature);
      });

      if (found && !results.functions.includes(feature)) {
        results.functions.push(feature);
        console.log(`✅ 機能登録: ${feature}`);
      }
    });

    console.log(`✅ ${aiType} 検出完了:`, results);

  } catch (error) {
    console.error(`❌ ${aiType} 検出エラー:`, error);
  }

  return results;
}

// ========================================
// Step 4: データ保存・クリーンアップ
// 検出結果の永続化とリソース解放
// ========================================

/**
 * Step 4: 検出結果の保存
 */
async function saveDetectionResults(results, detectionWindows) {
  console.log('📍 Step 4: 検出結果をchrome.storageに保存');

  const aiConfigPersistence = {
    chatgpt: { models: [], functions: [] },
    claude: { models: [], functions: [] },
    gemini: { models: [], functions: [] }
  };

  // 結果を統合
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      const aiType = result.value.aiType;
      const data = result.value.data;

      if (aiConfigPersistence[aiType]) {
        aiConfigPersistence[aiType] = data;
      }
    }
  });

  // ストレージに保存
  await new Promise((resolve) => {
    chrome.storage.local.set({ ai_config_persistence: aiConfigPersistence }, () => {
      console.log('✅ Step 4-1: AI設定をストレージに保存完了');
      resolve();
    });
  });
}

// ========================================
// ユーティリティ関数
// ========================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}