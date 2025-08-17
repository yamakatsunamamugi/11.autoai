// test-ai-log-handler.js
// ログ表示の拡張機能を提供（トグル機能とAI回答管理を統合）

(function() {
  'use strict';

  // AI回答を保存するグローバル変数
  window.lastAIResponses = window.lastAIResponses || {};
  
  // ログをクリアする関数（新しいマネージャーと連携）
  window.clearLogs = function() {
    // LogToggleManagerが存在する場合は使用
    if (window.clearAllLogs) {
      window.clearAllLogs();
    } else {
      // フォールバック
      const logContainer = document.getElementById('log-container');
      if (logContainer) {
        logContainer.innerHTML = `
          <div class="log-entry">
            <div class="log-entry-header">
              <span>ログをクリアしました。</span>
            </div>
          </div>
        `;
      }
    }
    
    // AI回答もクリア
    if (window.AIResponseManager) {
      window.AIResponseManager.clearResponses();
    }
    window.lastAIResponses = {};
  };
  
  // AI回答を処理する統合関数
  window.handleAIResponse = function(aiType, prompt, response, timestamp) {
    // AI回答を保存
    window.lastAIResponses[aiType] = {
      prompt: prompt,
      response: response,
      timestamp: timestamp || new Date().toISOString()
    };
    
    // AIResponseManagerが利用可能な場合は使用
    if (window.addAIResponse) {
      window.addAIResponse(aiType, prompt, response, timestamp);
    }
    
    // ログエントリとしても記録
    if (window.addLog) {
      window.addLog(
        `${aiType}が回答を生成しました`,
        'ai',
        `プロンプト: ${prompt}\n\n回答: ${response}`
      );
    }
  };
  
  // テスト実行時のログ関数
  window.logTestEvent = function(message, type = 'info', details = null) {
    if (window.addLog) {
      window.addLog(message, type, details);
    } else {
      // フォールバック: 従来のログ方式
      console.log(`[${type.toUpperCase()}] ${message}`);
      if (details) console.log('詳細:', details);
    }
  };

  // DOMContentLoaded時にイベントリスナーを設定
  document.addEventListener('DOMContentLoaded', function() {
    // ログクリアボタンのイベントリスナー
    const clearButton = document.getElementById('btn-clear-logs');
    if (clearButton) {
      clearButton.addEventListener('click', function() {
        window.clearLogs();
      });
    }
    
    // フィルターボタンを追加（もし関数が利用可能なら）
    if (window.createLogFilters) {
      const logSection = document.querySelector('#log-container').parentElement;
      if (logSection) {
        const filters = window.createLogFilters();
        logSection.insertBefore(filters, document.getElementById('log-container'));
      }
    }
    
    // 初期ログメッセージ
    if (window.addLog) {
      window.addLog('システム準備完了。テストを実行してください。', 'system');
    }
  });

  console.log('✅ 拡張ログハンドラーが初期化されました');
})();