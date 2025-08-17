// test-log-toggle-manager.js
// ログエントリのトグル管理システム

(function() {
  'use strict';

  window.LogToggleManager = {
    logEntries: [],
    logCategories: {
      'system': { icon: '⚙️', color: '#6c757d', label: 'システム' },
      'error': { icon: '❌', color: '#dc3545', label: 'エラー' },
      'warning': { icon: '⚠️', color: '#ffc107', label: '警告' },
      'success': { icon: '✅', color: '#28a745', label: '成功' },
      'info': { icon: 'ℹ️', color: '#17a2b8', label: '情報' },
      'ai': { icon: '🤖', color: '#007bff', label: 'AI処理' },
      'debug': { icon: '🔍', color: '#6610f2', label: 'デバッグ' }
    },
    
    // ログエントリを追加
    addLogEntry: function(message, category = 'info', details = null) {
      const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const entry = {
        id,
        message,
        category,
        details,
        timestamp: new Date().toISOString(),
        expanded: false
      };
      
      this.logEntries.push(entry);
      this.renderLogEntry(entry);
      return id;
    },
    
    // ログエントリをレンダリング
    renderLogEntry: function(entry) {
      const container = document.getElementById('log-container');
      if (!container) return;
      
      const categoryConfig = this.logCategories[entry.category] || this.logCategories['info'];
      
      const logDiv = document.createElement('div');
      logDiv.className = 'log-entry-toggle';
      logDiv.dataset.logId = entry.id;
      logDiv.style.cssText = `
        margin-bottom: 4px;
        border: 1px solid #e9ecef;
        border-radius: 4px;
        overflow: hidden;
        background: white;
        transition: all 0.2s ease;
      `;
      
      // ヘッダー部分（1行表示、クリック可能）
      const headerHtml = `
        <div class="log-header" style="
          padding: 6px 12px;
          background: ${categoryConfig.color}08;
          cursor: ${entry.details ? 'pointer' : 'default'};
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-left: 3px solid ${categoryConfig.color};
          transition: background 0.2s ease;
          min-height: 32px;
        " ${entry.details ? `onclick="LogToggleManager.toggleLog('${entry.id}')"` : ''}>
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
            <span style="font-size: 14px; flex-shrink: 0;">${categoryConfig.icon}</span>
            <span style="
              background: ${categoryConfig.color}22;
              color: ${categoryConfig.color};
              padding: 1px 6px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              flex-shrink: 0;
            ">${categoryConfig.label}</span>
            <span style="
              color: #333;
              font-size: 13px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              flex: 1;
            " title="${this.escapeHtml(entry.message)}">${this.escapeHtml(entry.message)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <span style="color: #999; font-size: 11px;">
              ${new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            ${entry.details ? `
              <span class="log-toggle-icon" style="
                transition: transform 0.3s ease;
                display: inline-block;
                color: ${categoryConfig.color};
                font-size: 10px;
                width: 12px;
              ">▼</span>
            ` : ''}
          </div>
        </div>
      `;
      
      // 詳細部分（最初は非表示）
      const detailsHtml = entry.details ? `
        <div class="log-details" style="
          display: none;
          padding: 10px 12px;
          background: #f8f9fa;
          border-top: 1px solid #e9ecef;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 12px;
          line-height: 1.5;
          color: #495057;
          max-height: 300px;
          overflow-y: auto;
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <strong style="color: #666; font-size: 11px;">詳細情報</strong>
            <button onclick="LogToggleManager.copyDetails('${entry.id}')" style="
              background: #6c757d22;
              color: #6c757d;
              border: none;
              padding: 2px 8px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 11px;
            ">
              📋 詳細をコピー
            </button>
          </div>
          <pre style="
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            background: white;
            padding: 8px;
            border-radius: 4px;
            border: 1px solid #e9ecef;
          ">${this.escapeHtml(entry.details)}</pre>
        </div>
      ` : '';
      
      logDiv.innerHTML = headerHtml + detailsHtml;
      
      // ホバーエフェクト
      const header = logDiv.querySelector('.log-header');
      if (header && entry.details) {
        header.addEventListener('mouseenter', function() {
          this.style.background = `${categoryConfig.color}12`;
        });
        header.addEventListener('mouseleave', function() {
          this.style.background = `${categoryConfig.color}08`;
        });
      }
      
      container.appendChild(logDiv);
      
      // 自動スクロール（最新のログが見えるように）
      if (container.scrollHeight - container.scrollTop <= container.clientHeight + 100) {
        logDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    },
    
    // ログの展開/折りたたみ
    toggleLog: function(id) {
      const entry = this.logEntries.find(e => e.id === id);
      if (!entry) return;
      
      const logDiv = document.querySelector(`[data-log-id="${id}"]`);
      if (!logDiv) return;
      
      const details = logDiv.querySelector('.log-details');
      const icon = logDiv.querySelector('.log-toggle-icon');
      
      if (!details) return;
      
      if (entry.expanded) {
        // 折りたたむ
        details.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
        entry.expanded = false;
      } else {
        // 展開する
        details.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(180deg)';
        entry.expanded = true;
        
        // スムーズなアニメーション
        details.style.opacity = '0';
        setTimeout(() => {
          details.style.transition = 'opacity 0.3s ease';
          details.style.opacity = '1';
        }, 10);
      }
    },
    
    // カテゴリでフィルタリング
    filterByCategory: function(category) {
      const container = document.getElementById('log-container');
      if (!container) return;
      
      const allLogs = container.querySelectorAll('.log-entry-toggle');
      allLogs.forEach(logDiv => {
        const logId = logDiv.dataset.logId;
        const entry = this.logEntries.find(e => e.id === logId);
        if (entry) {
          if (category === 'all' || entry.category === category) {
            logDiv.style.display = 'block';
          } else {
            logDiv.style.display = 'none';
          }
        }
      });
    },
    
    // すべてのログをクリア
    clearLogs: function() {
      this.logEntries = [];
      const container = document.getElementById('log-container');
      if (container) {
        container.innerHTML = '';
        this.addLogEntry('ログをクリアしました', 'system');
      }
    },
    
    // HTMLエスケープ
    escapeHtml: function(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    // ログをクリップボードにコピー
    copyLog: function(id) {
      const entry = this.logEntries.find(e => e.id === id);
      if (!entry) return;
      
      const text = `[${new Date(entry.timestamp).toLocaleTimeString()}] [${this.logCategories[entry.category].label}] ${entry.message}`;
      this.copyToClipboard(text);
    },
    
    // 詳細をクリップボードにコピー
    copyDetails: function(id) {
      const entry = this.logEntries.find(e => e.id === id);
      if (!entry || !entry.details) return;
      
      const text = `[${new Date(entry.timestamp).toLocaleTimeString()}] [${this.logCategories[entry.category].label}] ${entry.message}\n\n詳細:\n${entry.details}`;
      this.copyToClipboard(text);
    },
    
    // クリップボードにコピー
    copyToClipboard: function(text) {
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
    
    // 統計情報を取得
    getStatistics: function() {
      const stats = {};
      Object.keys(this.logCategories).forEach(category => {
        stats[category] = this.logEntries.filter(e => e.category === category).length;
      });
      stats.total = this.logEntries.length;
      return stats;
    }
  };
  
  // グローバル関数として公開
  window.addLog = function(message, category, details) {
    return LogToggleManager.addLogEntry(message, category, details);
  };
  
  window.clearAllLogs = function() {
    LogToggleManager.clearLogs();
  };
  
  window.filterLogs = function(category) {
    LogToggleManager.filterByCategory(category);
  };
  
  // すべてのログをコピー
  window.copyAllLogs = function() {
    const logs = LogToggleManager.logEntries.map(entry => {
      const category = LogToggleManager.logCategories[entry.category].label;
      const time = new Date(entry.timestamp).toLocaleTimeString();
      let text = `[${time}] [${category}] ${entry.message}`;
      if (entry.details) {
        text += `\n  詳細: ${entry.details}`;
      }
      return text;
    });
    LogToggleManager.copyToClipboard(logs.join('\n'));
  };
  
  // フィルターボタンを追加（オプション）
  window.createLogFilters = function() {
    const filterContainer = document.createElement('div');
    filterContainer.style.cssText = `
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
      flex-wrap: wrap;
      align-items: center;
    `;
    
    // 「すべて」ボタン
    const allBtn = document.createElement('button');
    allBtn.textContent = 'すべて';
    allBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #dee2e6;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;
    `;
    allBtn.onclick = () => filterLogs('all');
    filterContainer.appendChild(allBtn);
    
    // カテゴリボタン
    Object.entries(LogToggleManager.logCategories).forEach(([key, config]) => {
      const btn = document.createElement('button');
      btn.innerHTML = `${config.icon} ${config.label}`;
      btn.style.cssText = `
        padding: 4px 10px;
        border: 1px solid ${config.color}44;
        background: ${config.color}11;
        color: ${config.color};
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s ease;
      `;
      btn.onmouseenter = function() {
        this.style.background = `${config.color}22`;
      };
      btn.onmouseleave = function() {
        this.style.background = `${config.color}11`;
      };
      btn.onclick = () => filterLogs(key);
      filterContainer.appendChild(btn);
    });
    
    // すべてコピーボタンを追加
    const copyAllBtn = document.createElement('button');
    copyAllBtn.innerHTML = '📋 すべてコピー';
    copyAllBtn.style.cssText = `
      padding: 4px 10px;
      border: 1px solid #17a2b8;
      background: #17a2b822;
      color: #17a2b8;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s ease;
      margin-left: auto;
    `;
    copyAllBtn.onclick = () => copyAllLogs();
    filterContainer.appendChild(copyAllBtn);
    
    return filterContainer;
  };
  
  console.log('✅ Log Toggle Manager モジュールが初期化されました');
})();