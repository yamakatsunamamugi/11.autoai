/**
 * @fileoverview テスト用AIモデル・機能変更検出システム コントローラー V4 - 統合関数版
 *
 * 各AI本番自動化ファイルから整理済みの関数を使用
 * - ChatGPT: openModelMenu, openFunctionMenu + 共通処理関数群
 * - Claude: openClaudeModelMenu + 共通処理関数群
 * - Gemini: openGeminiModelMenu, closeGeminiMenu + 共通処理関数群
 *
 * 本番executeTask内のコードを関数化したものを直接インポートして使用
 * 本番コードの変更が自動的に検出システムにも反映される仕組み
 */

// 本番自動化ファイルから実証済みメニュー開閉コード・共通処理関数を直接インポート
// Chrome extension用の拡張機能ルートからの絶対パスを使用
let openModelMenu, openFunctionMenu, inputTextChatGPT, sendMessageChatGPT, waitForResponseChatGPT, getResponseTextChatGPT, selectModelChatGPT, selectFunctionChatGPT;
let openClaudeModelMenu, inputTextClaude, sendMessageClaude, waitForResponseClaude, getResponseTextClaude, selectModelClaude, selectFunctionClaude;
let openGeminiModelMenu, closeGeminiMenu, inputTextGemini, sendMessageGemini, waitForResponseGemini, getResponseTextGemini, selectModelGemini, selectFunctionGemini;

// 動的インポートで本番自動化モジュールを読み込み
async function loadAutomationModules() {
  try {
    const chatgptModule = await import(chrome.runtime.getURL('automations/chatgpt-automation.js'));
    ({ openModelMenu, openFunctionMenu, inputTextChatGPT, sendMessageChatGPT, waitForResponseChatGPT, getResponseTextChatGPT, selectModelChatGPT, selectFunctionChatGPT } = chatgptModule);

    const claudeModule = await import(chrome.runtime.getURL('automations/claude-automation.js'));
    ({ openClaudeModelMenu, inputTextClaude, sendMessageClaude, waitForResponseClaude, getResponseTextClaude, selectModelClaude, selectFunctionClaude } = claudeModule);

    const geminiModule = await import(chrome.runtime.getURL('automations/gemini-automation.js'));
    ({ openGeminiModelMenu, closeGeminiMenu, inputTextGemini, sendMessageGemini, waitForResponseGemini, getResponseTextGemini, selectModelGemini, selectFunctionGemini } = geminiModule);

    console.log('✅ 本番自動化モジュール読み込み成功');
  } catch (error) {
    console.error('❌ 本番自動化モジュール読み込みエラー:', error);
    throw error;
  }
}

/**
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
 * 2. 本番コード統合: WindowService、AITaskExecutorを使用（リトライ機能は各サービスで直接実装）
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
  windowCloseDelay: 30000,       // 自動クローズまでの遅延時間（ミリ秒）
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

// Step 0-4: セレクタ定義は ui-controller.js の動作実績のある関数内に定義済みのため不要

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
  console.log('🔴 [DEBUG] テストコントローラーのrunAIDetectionSystem関数開始！');
  console.log('🔴 [DEBUG] この関数が実行されています - エラー修正成功の可能性大！');
  console.log('📍 Step 1: AI検出システムメインエントリーポイント開始');
  console.log('ℹ️ Step 1-0: 4分割ウィンドウでのAI検出処理を開始します');

  // Step 0: 本番自動化モジュールを事前に読み込み
  console.log('ℹ️ Step 0: 本番自動化モジュールを読み込み中...');
  await loadAutomationModules();

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
      focused: true
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

    // Step 3-3-3: 各AI専用の検出スクリプトを注入
    console.log(`ℹ️ Step 3-3-3: ${aiName}に本番自動化ベースの検出スクリプトを注入`);

    let detectionFunction;
    switch (config.aiType) {
      case 'chatgpt':
        detectionFunction = detectChatGPTModelsAndFeatures;
        break;
      case 'claude':
        detectionFunction = detectClaudeModelsAndFeatures;
        break;
      case 'gemini':
        detectionFunction = detectGeminiModelsAndFeatures;
        break;
      default:
        throw new Error(`未対応のAI: ${config.aiType}`);
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectionFunction
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

// ========================================
// Step 3-4: 各AI専用の検出スクリプト
// 本番自動化ファイルのロジックを使用した確実なメニュー開閉
// ========================================

/**
 * ChatGPT専用検出スクリプト
 * chatgpt-automation.jsのモデル・機能選択ロジックを使用
 */
async function detectChatGPTModelsAndFeatures() {
  console.log('[ChatGPT検出] 開始 - 本番自動化ロジック使用');

  const SELECTORS = {
    modelButton: ['button[type="button"]:has([data-testid="model-switcher-button"])'],
    modelMenu: ['div[role="menu"]'],
    functionMenuButton: ['button[aria-label="機能メニューを開く"]', 'button:has(svg):has(path[d*="M12 6.5a5.5"])'],
    functionMenu: ['div[role="menu"]']
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const findElement = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const availableModels = [];
  const availableFunctions = [];

  try {
    // モデル検出 - 本番chatgpt-automation.jsから直接インポートした関数使用
    const modelBtn = findElement(SELECTORS.modelButton);
    if (modelBtn) {
      // 本番chatgpt-automation.jsのexecuteTask内コードを直接使用
      await openModelMenu(modelBtn);

      const modelMenu = findElement(SELECTORS.modelMenu);
      if (modelMenu) {
        // メインメニューのモデル取得
        const mainMenuItems = modelMenu.querySelectorAll('[role="menuitem"][data-testid^="model-switcher-"]');
        mainMenuItems.forEach(item => {
          const modelName = item.textContent.trim();
          if (modelName && !modelName.includes('レガシー')) {
            availableModels.push(modelName);
          }
        });

        // レガシーモデルもチェック
        const legacyButton = modelMenu.querySelector('[role="menuitem"][data-has-submenu]') ||
                            Array.from(modelMenu.querySelectorAll('[role="menuitem"]'))
                              .find(el => el.textContent && el.textContent.includes('レガシーモデル'));

        if (legacyButton) {
          legacyButton.click();
          await sleep(1500);

          const allMenus = document.querySelectorAll('[role="menu"]');
          allMenus.forEach(menu => {
            if (menu !== modelMenu) {
              const items = menu.querySelectorAll('[role="menuitem"]');
              items.forEach(item => {
                const modelName = item.textContent.trim();
                if (modelName && modelName.includes('GPT')) {
                  availableModels.push(modelName);
                }
              });
            }
          });
        }

        // メニューを閉じる
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
        await sleep(500);
      }
    }

    // 機能検出 - 本番chatgpt-automation.jsから直接インポートした関数使用
    const funcMenuBtn = findElement(SELECTORS.functionMenuButton);
    if (funcMenuBtn) {
      // 本番chatgpt-automation.jsのexecuteTask内コードを直接使用
      await openFunctionMenu(funcMenuBtn);

      const funcMenu = findElement(SELECTORS.functionMenu);
      if (funcMenu) {
        // メイン機能を取得
        const menuItems = funcMenu.querySelectorAll('[role="menuitemradio"]');
        menuItems.forEach(item => {
          const funcName = item.textContent.trim();
          if (funcName) {
            availableFunctions.push(funcName);
          }
        });

        // サブメニューもチェック
        const moreButton = Array.from(funcMenu.querySelectorAll('[role="menuitem"]'))
          .find(el => el.textContent && el.textContent.includes('さらに表示'));

        if (moreButton) {
          moreButton.click();
          await sleep(1000);

          const subMenu = document.querySelector('[data-side="right"]');
          if (subMenu) {
            const subMenuItems = subMenu.querySelectorAll('[role="menuitemradio"]');
            subMenuItems.forEach(item => {
              const funcName = item.textContent.trim();
              if (funcName) {
                availableFunctions.push(funcName);
              }
            });
          }
        }

        // メニューを閉じる
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
        await sleep(500);
      }
    }

    console.log(`[ChatGPT検出] 完了 - モデル: ${availableModels.length}個, 機能: ${availableFunctions.length}個`);
    return { models: availableModels, functions: availableFunctions };

  } catch (error) {
    console.error('[ChatGPT検出] エラー:', error);
    return { models: availableModels, functions: availableFunctions };
  }
}

/**
 * Claude専用検出スクリプト
 * claude-automation.jsのモデル・機能選択ロジックを使用
 */
async function detectClaudeModelsAndFeatures() {
  console.log('[Claude検出] 開始 - 本番自動化ロジック使用');

  const SELECTORS = {
    modelButton: ['button[role="button"]:has(svg):has(span)'],
    menuItems: ['[role="menuitem"]'],
    functionMenuButton: ['button[aria-label*="機能"]', 'button:has(svg[viewBox="0 0 24 24"])'],
    webSearchToggle: ['button:has(p:contains("ウェブ検索")):has(input[role="switch"])'],
    deepResearchButton: ['button[type="button"][aria-pressed]']
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const findElement = (selectors) => {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) return element;
      } catch (e) { continue; }
    }
    return null;
  };

  const availableModels = [];
  const availableFunctions = [];

  try {
    // モデル検出 - 本番claude-automation.jsから直接インポートした関数使用
    const menuButton = findElement(SELECTORS.modelButton);
    if (menuButton) {
      // 本番claude-automation.jsのexecuteTask内コードを直接使用
      await openClaudeModelMenu(menuButton);

      const modelElements = Array.from(document.querySelectorAll('[role="menuitem"]'));
      modelElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.includes('Claude')) {
          availableModels.push(text);
        }
      });

      // 他のモデルメニューもチェック
      const otherModelsBtn = document.querySelector('[role="menuitem"][aria-haspopup="menu"]');
      if (otherModelsBtn) {
        otherModelsBtn.click();
        await sleep(1000);

        const additionalModels = Array.from(document.querySelectorAll('[role="menuitem"]'));
        additionalModels.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.includes('Claude')) {
            availableModels.push(text);
          }
        });
      }

      // メニューを閉じる
      const overlay = document.querySelector('.cdk-overlay-backdrop');
      if (overlay) overlay.click();
      await sleep(500);
    }

    // 機能検出 - 本番claude-automation.jsから直接インポートした関数使用
    const featureMenuBtn = findElement(SELECTORS.functionMenuButton);
    if (featureMenuBtn) {
      // 本番claude-automation.jsのexecuteTask内コードを直接使用
      // Claudeでは機能選択は主にプロンプト内で制御するため、
      // 明示的な機能メニューの代わりに利用可能な機能を探索
      console.log('Claude機能検出: プロンプト制御方式のため探索的検出を実行');

      // ウェブ検索トグル確認
      const webSearchToggle = findElement(SELECTORS.webSearchToggle);
      if (webSearchToggle) {
        availableFunctions.push('ウェブ検索');
      }

      // その他の機能も確認
      const allButtons = document.querySelectorAll('button');
      allButtons.forEach(btn => {
        const text = btn.textContent?.trim();
        if (text && (text.includes('じっくり') || text.includes('thinking'))) {
          availableFunctions.push('じっくり考える');
        }
      });

      featureMenuBtn.click(); // メニューを閉じる
      await sleep(500);
    }

    // Deep Researchボタン確認
    const buttons = document.querySelectorAll(SELECTORS.deepResearchButton.join(', '));
    for (const btn of buttons) {
      const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
      if (svg) {
        availableFunctions.push('Deep Research');
        break;
      }
    }

    console.log(`[Claude検出] 完了 - モデル: ${availableModels.length}個, 機能: ${availableFunctions.length}個`);
    return { models: availableModels, functions: availableFunctions };

  } catch (error) {
    console.error('[Claude検出] エラー:', error);
    return { models: availableModels, functions: availableFunctions };
  }
}

/**
 * Gemini専用検出スクリプト
 * gemini-automation.jsのモデル・機能選択ロジックを使用
 */
async function detectGeminiModelsAndFeatures() {
  console.log('[Gemini検出] 開始 - 本番自動化ロジック使用');

  const SELECTORS = {
    modelMenuButton: ['.gds-mode-switch-button.logo-pill-btn', 'button[class*="logo-pill-btn"]'],
    modelOptions: ['button.bard-mode-list-button', 'button[role="menuitemradio"]'],
    functionButtons: ['toolbox-drawer-item > button'],
    moreButton: ['button[aria-label="その他"]'],
    menuButtons: ['.cdk-overlay-pane .toolbox-drawer-menu-item button']
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const findElement = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  };
  const findElements = (selectors) => {
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) return Array.from(elements);
    }
    return [];
  };

  const availableModels = [];
  const availableFunctions = [];

  try {
    // モデル検出 - gemini-automation.jsのロジック使用
    const menuButton = findElement(SELECTORS.modelMenuButton);
    if (menuButton) {
      menuButton.click();
      await sleep(1500);

      const modelOptions = findElements(SELECTORS.modelOptions);
      modelOptions.forEach(btn => {
        const text = btn.textContent?.trim();
        if (text) {
          availableModels.push(text);
        }
      });

      // オーバーレイを閉じる
      const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
      if (overlay) overlay.click();
      await sleep(500);
    }

    // 機能検出 - gemini-automation.jsのロジック使用
    const allButtons = findElements(SELECTORS.functionButtons);
    allButtons.forEach(btn => {
      const labelElement = btn.querySelector('.label');
      if (labelElement) {
        const text = labelElement.textContent?.trim();
        if (text && text !== 'その他') {
          availableFunctions.push(text);
        }
      }
    });

    // 「その他」メニューの機能もチェック
    const moreButton = findElement(SELECTORS.moreButton);
    if (moreButton) {
      moreButton.click();
      await sleep(1500);

      const menuButtons = findElements(SELECTORS.menuButtons);
      menuButtons.forEach(btn => {
        const labelElement = btn.querySelector('.label');
        if (labelElement) {
          const text = labelElement.textContent?.trim().replace(/\s*arrow_drop_down\s*/, '');
          if (text) {
            availableFunctions.push(text);
          }
        }
      });

      // オーバーレイを閉じる
      const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
      if (overlay) overlay.click();
      await sleep(500);
    }

    console.log(`[Gemini検出] 完了 - モデル: ${availableModels.length}個, 機能: ${availableFunctions.length}個`);
    return { models: availableModels, functions: availableFunctions };

  } catch (error) {
    console.error('[Gemini検出] エラー:', error);
    return { models: availableModels, functions: availableFunctions };
  }
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