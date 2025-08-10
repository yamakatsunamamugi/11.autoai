// テストランナー
// 各AIの自動化を統合制御

(() => {
  "use strict";

  // ログ出力
  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
      const logEntry = `[${timestamp}] ${message}\n`;
      logContainer.textContent += logEntry;
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    console.log(`[TestRunner] ${message}`);
  }

  // ステータス更新
  function updateStatus(text, status = 'ready') {
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.querySelector('.status-indicator');
    
    if (statusText) statusText.textContent = text;
    if (statusIndicator) {
      statusIndicator.className = `status-indicator status-${status}`;
    }
  }

  // テスト設定を取得
  function getTestConfig() {
    return {
      claude: {
        enabled: document.getElementById('enable-claude')?.checked,
        model: document.getElementById('claude-model')?.value,
        function: document.getElementById('claude-feature')?.value,
      },
      chatgpt: {
        enabled: document.getElementById('enable-chatgpt')?.checked,
        model: document.getElementById('chatgpt-model')?.value,
        function: document.getElementById('chatgpt-feature')?.value,
      },
      gemini: {
        enabled: document.getElementById('enable-gemini')?.checked,
        model: document.getElementById('gemini-model')?.value,
        function: document.getElementById('gemini-feature')?.value,
      },
      genspark: {
        enabled: document.getElementById('enable-genspark')?.checked,
        model: document.getElementById('genspark-model')?.value,
        function: document.getElementById('genspark-feature')?.value,
      },
      text: document.getElementById('test-prompt')?.value,
      autoModelSelect: document.getElementById('auto-model-select')?.checked,
      autoFunctionSelect: document.getElementById('auto-feature-select')?.checked,
      autoTextInput: document.getElementById('auto-text-input')?.checked,
      autoSend: document.getElementById('auto-send')?.checked,
      waitResponse: document.getElementById('wait-response')?.checked,
    };
  }

  // 個別AI実行
  async function runAI(aiName, config) {
    log(`${aiName}の自動化を開始`);
    
    try {
      let automation;
      switch(aiName.toLowerCase()) {
        case 'claude':
          automation = window.ClaudeAutomation;
          break;
        case 'chatgpt':
          automation = window.ChatGPTAutomation;
          break;
        case 'gemini':
          automation = window.GeminiAutomation;
          break;
        case 'genspark':
          automation = window.GensparkAutomation;
          break;
        default:
          throw new Error(`不明なAI: ${aiName}`);
      }

      if (!automation) {
        throw new Error(`${aiName}の自動化関数が見つかりません`);
      }

      const result = await automation.runAutomation({
        model: config.autoModelSelect ? config[aiName.toLowerCase()].model : null,
        function: config.autoFunctionSelect ? config[aiName.toLowerCase()].function : null,
        text: config.autoTextInput ? config.text : null,
        send: config.autoSend,
        waitResponse: config.waitResponse,
        getResponse: config.waitResponse,
      });

      if (result.success) {
        log(`✅ ${aiName}の自動化が完了`);
        if (result.response) {
          log(`${aiName}の回答: ${result.response.substring(0, 100)}...`);
        }
      } else {
        log(`❌ ${aiName}でエラー: ${result.error}`, 'error');
      }

      return result;
    } catch (error) {
      log(`❌ ${aiName}で例外エラー: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // 全AI実行
  async function runAllAIs() {
    updateStatus('実行中...', 'running');
    log('統合テスト開始');
    
    const config = getTestConfig();
    const results = {};
    
    // 有効なAIのみ実行
    const ais = [];
    if (config.claude.enabled) ais.push('Claude');
    if (config.chatgpt.enabled) ais.push('ChatGPT');
    if (config.gemini.enabled) ais.push('Gemini');
    if (config.genspark.enabled) ais.push('Genspark');
    
    log(`実行対象: ${ais.join(', ')}`);
    
    for (const ai of ais) {
      results[ai] = await runAI(ai, config);
    }
    
    // 結果サマリー
    const successCount = Object.values(results).filter(r => r.success).length;
    const totalCount = Object.keys(results).length;
    
    log(`\n===== 実行結果 =====`);
    log(`成功: ${successCount}/${totalCount}`);
    
    if (successCount === totalCount) {
      updateStatus('全て成功', 'ready');
    } else {
      updateStatus('一部失敗', 'error');
    }
    
    return results;
  }

  // イベントリスナー設定
  function setupEventListeners() {
    // 全AI実行ボタン
    const btnRunAll = document.getElementById('btn-run-all');
    if (btnRunAll) {
      btnRunAll.addEventListener('click', runAllAIs);
    }

    // 個別実行ボタン
    const btnRunClaude = document.getElementById('btn-run-claude');
    if (btnRunClaude) {
      btnRunClaude.addEventListener('click', () => {
        const config = getTestConfig();
        runAI('Claude', config);
      });
    }

    const btnRunChatGPT = document.getElementById('btn-run-chatgpt');
    if (btnRunChatGPT) {
      btnRunChatGPT.addEventListener('click', () => {
        const config = getTestConfig();
        runAI('ChatGPT', config);
      });
    }

    const btnRunGemini = document.getElementById('btn-run-gemini');
    if (btnRunGemini) {
      btnRunGemini.addEventListener('click', () => {
        const config = getTestConfig();
        runAI('Gemini', config);
      });
    }
  }

  // 初期化
  function initialize() {
    log('テストランナー初期化完了');
    setupEventListeners();
    updateStatus('準備完了', 'ready');
  }

  // DOMContentLoaded待ち
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // グローバル公開
  window.TestRunner = {
    runAI,
    runAllAIs,
    getTestConfig,
    log,
    updateStatus
  };

  console.log("✅ テストランナーが利用可能になりました");
})();