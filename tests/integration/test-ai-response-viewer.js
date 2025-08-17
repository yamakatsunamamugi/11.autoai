// test-ai-response-viewer.js
// AI回答の表示と管理を行うコンポーネント

(function() {
  'use strict';

  // AI回答を保存する構造
  window.AIResponseManager = {
    responses: {},
    
    // 回答を追加
    addResponse: function(aiType, prompt, response, timestamp) {
      const id = `${aiType}_${Date.now()}`;
      this.responses[id] = {
        aiType,
        prompt,
        response,
        timestamp: timestamp || new Date().toISOString(),
        expanded: false
      };
      return id;
    },
    
    // 回答をHTMLで表示
    createResponseElement: function(id) {
      const data = this.responses[id];
      if (!data) return null;
      
      const div = document.createElement('div');
      div.className = 'ai-response-container';
      div.dataset.responseId = id;
      
      // AI種別に応じたカラーとアイコン
      const aiConfig = {
        'ChatGPT': { color: '#10a37f', icon: '🤖' },
        'Claude': { color: '#764ba2', icon: '🧠' },
        'Gemini': { color: '#4285f4', icon: '✨' }
      };
      
      const config = aiConfig[data.aiType] || { color: '#666', icon: '💬' };
      
      div.innerHTML = `
        <div class="ai-response-header" style="
          background: ${config.color}15;
          border-left: 3px solid ${config.color};
          padding: 8px 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          border-radius: 4px;
          margin-bottom: 0;
        " onclick="AIResponseManager.toggleResponse('${id}')">
          <div style="display: flex; justify-content: space-between; align-items: center; min-height: 24px;">
            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
              <span style="font-size: 16px; flex-shrink: 0;">${config.icon}</span>
              <strong style="color: ${config.color}; font-size: 13px; flex-shrink: 0;">${data.aiType}</strong>
              <span class="response-preview" style="
                color: #555;
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                flex: 1;
              ">${this.getPreview(data.response)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
              <button onclick="event.stopPropagation(); AIResponseManager.copyResponse('${id}')" style="
                background: ${config.color}22;
                color: ${config.color};
                border: none;
                padding: 2px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
                transition: background 0.2s ease;
              " onmouseover="this.style.background='${config.color}33'" onmouseout="this.style.background='${config.color}22'">
                📋 コピー
              </button>
              <span style="color: #999; font-size: 11px;">
                ${new Date(data.timestamp).toLocaleTimeString()}
              </span>
              <span class="toggle-icon" style="
                transition: transform 0.3s ease;
                display: inline-block;
                font-size: 10px;
                color: ${config.color};
                width: 12px;
              ">▼</span>
            </div>
          </div>
        </div>
        <div class="ai-response-content" style="
          display: none;
          padding: 10px 12px;
          background: #f8f9fa;
          border-left: 3px solid ${config.color};
          border-radius: 0 0 4px 4px;
          border-top: 1px solid #e9ecef;
          max-height: 400px;
          overflow-y: auto;
          margin-top: -1px;
        ">
          <div style="margin-bottom: 10px;">
            <strong style="color: #495057;">プロンプト:</strong>
            <div style="
              background: white;
              padding: 10px;
              border-radius: 6px;
              margin-top: 5px;
              color: #333;
              font-family: monospace;
              font-size: 13px;
            ">${this.escapeHtml(data.prompt)}</div>
          </div>
          <div>
            <strong style="color: #495057;">回答:</strong>
            <div style="
              background: white;
              padding: 10px;
              border-radius: 6px;
              margin-top: 5px;
              color: #333;
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 14px;
              line-height: 1.6;
            ">${this.escapeHtml(data.response)}</div>
          </div>
        </div>
      `;
      
      return div;
    },
    
    // 回答の展開/折りたたみ
    toggleResponse: function(id) {
      const container = document.querySelector(`[data-response-id="${id}"]`);
      if (!container) return;
      
      const content = container.querySelector('.ai-response-content');
      const icon = container.querySelector('.toggle-icon');
      const preview = container.querySelector('.response-preview');
      const header = container.querySelector('.ai-response-header');
      
      if (this.responses[id].expanded) {
        // 折りたたむ
        content.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
        preview.style.display = 'inline';
        header.style.borderRadius = '4px';
        header.style.marginBottom = '0';
        this.responses[id].expanded = false;
      } else {
        // 展開する
        content.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        preview.style.display = 'none';
        header.style.borderRadius = '4px 4px 0 0';
        header.style.marginBottom = '0';
        this.responses[id].expanded = true;
        
        // スムーズなアニメーション
        content.style.opacity = '0';
        setTimeout(() => {
          content.style.transition = 'opacity 0.2s ease';
          content.style.opacity = '1';
        }, 10);
      }
    },
    
    // プレビューテキストを生成
    getPreview: function(text) {
      if (!text) return '(回答なし)';
      const preview = text.substring(0, 50);
      return preview + (text.length > 50 ? '...' : '');
    },
    
    // HTMLエスケープ
    escapeHtml: function(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    },
    
    // 回答をコピー
    copyResponse: function(id) {
      const data = this.responses[id];
      if (!data) return;
      
      const text = `[${new Date(data.timestamp).toLocaleTimeString()}] ${data.aiType}\nプロンプト: ${data.prompt}\n\n回答:\n${data.response}`;
      
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      
      try {
        document.execCommand('copy');
        // 簡単な通知
        const notification = document.createElement('div');
        notification.textContent = '📋 コピーしました';
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #28a745;
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          z-index: 10000;
          animation: fadeInOut 2s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
      } catch (err) {
        console.error('コピーに失敗しました:', err);
      }
      
      document.body.removeChild(textarea);
    },
    
    // すべての回答をクリア
    clearResponses: function() {
      this.responses = {};
    }
  };
  
  // ログコンテナにAI回答を追加する関数
  window.addAIResponse = function(aiType, prompt, response, timestamp) {
    const id = AIResponseManager.addResponse(aiType, prompt, response, timestamp);
    const element = AIResponseManager.createResponseElement(id);
    
    const logContainer = document.getElementById('log-container');
    if (logContainer && element) {
      // AI回答専用の要素にクラスを追加
      element.classList.add('ai-response-entry');
      
      // 最新のログエントリの後に追加（他のログと混在しても独立して開閉可能）
      logContainer.appendChild(element);
      
      // スクロール位置を調整（新しい要素が見えるように）
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    return id;
  };
  
  console.log('✅ AI Response Viewer モジュールが初期化されました');
})();