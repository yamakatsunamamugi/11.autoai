// test-visualizer.js - データ可視化モジュール

export default class TestVisualizer {
  constructor(testTool) {
    this.testTool = testTool;
    this.currentView = 'table';
    this.expandedNodes = new Set();
    
    this.initializeVisualizer();
  }
  
  initializeVisualizer() {
    // 展開/折りたたみボタン
    const expandAllBtn = document.getElementById('expandAllBtn');
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    
    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => this.expandAll());
    }
    
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => this.collapseAll());
    }
  }
  
  // スプレッドシート構造の可視化
  renderStructure(data) {
    if (!data || !data.values) return;
    
    // ツリー構造の生成
    this.renderStructureTree(data);
    
    // テーブル表示の生成
    this.renderSpreadsheetTable(data);
  }
  
  renderStructureTree(data) {
    const container = document.getElementById('structureTree');
    if (!container) return;
    
    const structure = this.analyzeStructure(data);
    
    const html = `
      <div class="tree-view">
        <div class="tree-node">
          <span class="tree-icon">📊</span>
          <strong>スプレッドシート構造</strong>
        </div>
        <div class="tree-children">
          ${this.renderTreeNode('ヘッダー行', structure.header, 'header')}
          ${this.renderTreeNode('特殊行', structure.specialRows, 'special')}
          ${this.renderTreeNode('作業行', structure.workRows, 'work')}
          ${this.renderTreeNode('AI列', structure.aiColumns, 'ai')}
          ${this.renderTreeNode('制御情報', structure.controls, 'control')}
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }
  
  renderTreeNode(label, data, type) {
    const nodeId = `node-${type}`;
    const isExpanded = this.expandedNodes.has(nodeId);
    
    let content = '';
    let badge = '';
    
    switch (type) {
      case 'header':
        badge = `<span class="badge">${data.columns?.length || 0}列</span>`;
        if (isExpanded && data.columns) {
          content = data.columns.map((col, i) => 
            `<div class="tree-item">${String.fromCharCode(65 + i)}: ${col}</div>`
          ).join('');
        }
        break;
        
      case 'special':
        badge = `<span class="badge">${Object.keys(data).length}種類</span>`;
        if (isExpanded) {
          content = Object.entries(data).map(([key, rows]) => 
            `<div class="tree-item">${this.getSpecialRowLabel(key)}: ${rows.length}行</div>`
          ).join('');
        }
        break;
        
      case 'work':
        badge = `<span class="badge">${data.count}行</span>`;
        if (isExpanded) {
          content = `
            <div class="tree-item">開始行: ${data.startRow}</div>
            <div class="tree-item">終了行: ${data.endRow}</div>
            <div class="tree-item">データあり: ${data.withData}行</div>
          `;
        }
        break;
        
      case 'ai':
        badge = `<span class="badge">${data.length}列</span>`;
        if (isExpanded) {
          content = data.map(col => 
            `<div class="tree-item">${col.letter}列: ${col.ai} - ${col.promptDescription}</div>`
          ).join('');
        }
        break;
        
      case 'control':
        badge = `<span class="badge">${data.rowControls?.length || 0} + ${data.columnControls?.length || 0}</span>`;
        if (isExpanded) {
          content = `
            <div class="tree-item">行制御: ${data.rowControls?.length || 0}件</div>
            <div class="tree-item">列制御: ${data.columnControls?.length || 0}件</div>
          `;
        }
        break;
    }
    
    return `
      <div class="tree-node" data-node-id="${nodeId}">
        <span class="tree-toggle ${isExpanded ? 'expanded' : ''}" 
              onclick="window.testTool.visualizer.toggleNode('${nodeId}')">
          ${isExpanded ? '▼' : '▶'}
        </span>
        <span class="tree-label">${label}</span>
        ${badge}
      </div>
      ${isExpanded ? `<div class="tree-children">${content}</div>` : ''}
    `;
  }
  
  getSpecialRowLabel(type) {
    const labels = {
      menu: 'メニュー行',
      control: '制御行',
      ai: 'AI行',
      model: 'モデル行',
      function: '機能行'
    };
    return labels[type] || type;
  }
  
  analyzeStructure(data) {
    const structure = {
      header: { columns: data.values[0] || [] },
      specialRows: {
        menu: [],
        control: [],
        ai: [],
        model: [],
        function: []
      },
      workRows: {
        count: 0,
        startRow: null,
        endRow: null,
        withData: 0
      },
      aiColumns: data.aiColumns || [],
      controls: {
        rowControls: [],
        columnControls: []
      }
    };
    
    // 特殊行の分析
    data.values.forEach((row, index) => {
      if (index === 0) return; // ヘッダー行をスキップ
      
      const firstCell = row[0] || '';
      
      if (firstCell.includes('メニュー')) {
        structure.specialRows.menu.push(index + 1);
      } else if (firstCell.includes('行制御') || firstCell.includes('列制御')) {
        structure.specialRows.control.push(index + 1);
      } else if (firstCell.includes('AI')) {
        structure.specialRows.ai.push(index + 1);
      } else if (firstCell.includes('モデル')) {
        structure.specialRows.model.push(index + 1);
      } else if (firstCell.includes('機能')) {
        structure.specialRows.function.push(index + 1);
      } else if (row.some(cell => cell && cell !== '')) {
        // 作業行
        structure.workRows.count++;
        if (!structure.workRows.startRow) {
          structure.workRows.startRow = index + 1;
        }
        structure.workRows.endRow = index + 1;
        structure.workRows.withData++;
      }
    });
    
    // 制御情報
    if (data.controls) {
      structure.controls = data.controls;
    }
    
    return structure;
  }
  
  renderSpreadsheetTable(data) {
    const container = document.getElementById('spreadsheetTable');
    if (!container) return;
    
    const maxRows = Math.min(data.values.length, 100); // 最大100行まで表示
    const maxCols = Math.min(data.values[0]?.length || 0, 26); // 最大Z列まで
    
    let html = '<thead><tr><th>行</th>';
    
    // 列ヘッダー
    for (let i = 0; i < maxCols; i++) {
      const letter = String.fromCharCode(65 + i);
      const isAIColumn = data.aiColumns?.some(col => col.letter === letter);
      html += `<th class="${isAIColumn ? 'ai-column-header' : ''}">${letter}</th>`;
    }
    html += '</tr></thead><tbody>';
    
    // データ行
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
      const row = data.values[rowIndex] || [];
      const rowNum = rowIndex + 1;
      const rowClass = this.getRowClass(row, rowIndex, data);
      
      html += `<tr class="${rowClass}">`;
      html += `<th>${rowNum}</th>`;
      
      for (let colIndex = 0; colIndex < maxCols; colIndex++) {
        const cellValue = row[colIndex] || '';
        const cellClass = this.getCellClass(cellValue, rowIndex, colIndex, data);
        const displayValue = this.formatCellValue(cellValue);
        
        html += `<td class="${cellClass}" title="${this.escapeHtml(cellValue)}">${displayValue}</td>`;
      }
      
      html += '</tr>';
    }
    
    html += '</tbody>';
    
    if (data.values.length > maxRows) {
      html += `<tfoot><tr><td colspan="${maxCols + 1}" style="text-align: center;">
        ... ${data.values.length - maxRows} 行省略 ...
      </td></tr></tfoot>`;
    }
    
    container.innerHTML = html;
  }
  
  getRowClass(row, index, data) {
    if (index === 0) return 'row-header';
    
    const firstCell = row[0] || '';
    
    if (firstCell.includes('メニュー')) return 'row-menu';
    if (firstCell.includes('行制御') || firstCell.includes('列制御')) return 'row-control';
    if (firstCell.includes('AI')) return 'row-ai';
    if (firstCell.includes('モデル')) return 'row-model';
    if (firstCell.includes('機能')) return 'row-function';
    
    // 作業行かどうか
    if (data.workRows?.includes(index + 1)) return 'row-work';
    
    return '';
  }
  
  getCellClass(value, rowIndex, colIndex, data) {
    const classes = [];
    
    // AI列かどうか
    const columnLetter = String.fromCharCode(65 + colIndex);
    if (data.aiColumns?.some(col => col.letter === columnLetter)) {
      classes.push('ai-column');
    }
    
    // 空セル
    if (!value || value === '') {
      classes.push('empty-cell');
    }
    
    // 特殊な値
    if (typeof value === 'string') {
      if (value.startsWith('=')) classes.push('formula-cell');
      if (value.includes('プロンプト')) classes.push('prompt-cell');
      if (value.includes('エラー')) classes.push('error-cell');
    }
    
    return classes.join(' ');
  }
  
  formatCellValue(value) {
    if (value === null || value === undefined || value === '') {
      return '<span class="empty">-</span>';
    }
    
    const str = String(value);
    const maxLength = 50;
    
    if (str.length > maxLength) {
      return this.escapeHtml(str.substring(0, maxLength)) + '...';
    }
    
    return this.escapeHtml(str);
  }
  
  // 制御情報の可視化
  renderControls(data) {
    if (!data || !data.controls) return;
    
    this.renderRowControls(data.controls.rowControls);
    this.renderColumnControls(data.controls.columnControls);
    this.renderControlMapping(data.controls);
  }
  
  renderRowControls(controls) {
    const container = document.getElementById('rowControlsContainer');
    if (!container) return;
    
    if (!controls || controls.length === 0) {
      container.innerHTML = '<div class="empty-state">行制御情報なし</div>';
      return;
    }
    
    const html = controls.map(control => `
      <div class="control-card">
        <div class="control-header">
          <span class="control-type">行制御</span>
          <span class="control-row">行 ${control.row}</span>
        </div>
        <div class="control-body">
          <div class="control-field">
            <span class="field-label">タイプ:</span>
            <span class="field-value">${control.type}</span>
          </div>
          <div class="control-field">
            <span class="field-label">値:</span>
            <span class="field-value">${control.value}</span>
          </div>
          ${control.description ? `
            <div class="control-field">
              <span class="field-label">説明:</span>
              <span class="field-value">${control.description}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }
  
  renderColumnControls(controls) {
    const container = document.getElementById('columnControlsContainer');
    if (!container) return;
    
    if (!controls || controls.length === 0) {
      container.innerHTML = '<div class="empty-state">列制御情報なし</div>';
      return;
    }
    
    const html = controls.map(control => `
      <div class="control-card">
        <div class="control-header">
          <span class="control-type">列制御</span>
          <span class="control-column">列 ${control.column}</span>
        </div>
        <div class="control-body">
          <div class="control-field">
            <span class="field-label">タイプ:</span>
            <span class="field-value">${control.type}</span>
          </div>
          <div class="control-field">
            <span class="field-label">値:</span>
            <span class="field-value">${control.value}</span>
          </div>
          ${control.targetColumns ? `
            <div class="control-field">
              <span class="field-label">対象列:</span>
              <span class="field-value">${control.targetColumns.join(', ')}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }
  
  renderControlMapping(controls) {
    const container = document.getElementById('controlMappingDiagram');
    if (!container) return;
    
    // 簡易的な制御マッピング図を生成
    const svg = this.createControlMappingSVG(controls);
    container.innerHTML = svg;
  }
  
  createControlMappingSVG(controls) {
    // SVGで制御関係を可視化（簡易版）
    const width = 600;
    const height = 400;
    
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <style>
          .control-node { fill: #667eea; }
          .target-node { fill: #48bb78; }
          .link { stroke: #cbd5e0; stroke-width: 2; fill: none; }
          .node-text { fill: white; font-size: 12px; text-anchor: middle; }
        </style>
        
        <text x="${width/2}" y="30" text-anchor="middle" font-size="16" fill="var(--text-primary)">
          制御関係マッピング
        </text>
        
        <text x="${width/2}" y="200" text-anchor="middle" fill="var(--text-tertiary)">
          （詳細な制御マッピング図は実装予定）
        </text>
      </svg>
    `;
  }
  
  // ノードの展開/折りたたみ
  toggleNode(nodeId) {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
    } else {
      this.expandedNodes.add(nodeId);
    }
    
    // 現在のデータで再描画
    if (this.testTool.currentData) {
      this.renderStructureTree(this.testTool.currentData);
    }
  }
  
  expandAll() {
    this.expandedNodes.add('node-header');
    this.expandedNodes.add('node-special');
    this.expandedNodes.add('node-work');
    this.expandedNodes.add('node-ai');
    this.expandedNodes.add('node-control');
    
    if (this.testTool.currentData) {
      this.renderStructureTree(this.testTool.currentData);
    }
  }
  
  collapseAll() {
    this.expandedNodes.clear();
    
    if (this.testTool.currentData) {
      this.renderStructureTree(this.testTool.currentData);
    }
  }
  
  // ユーティリティ
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// スタイル追加
const style = document.createElement('style');
style.textContent = `
.tree-view {
  font-family: monospace;
  font-size: 14px;
}

.tree-node {
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}

.tree-children {
  margin-left: 20px;
}

.tree-toggle {
  display: inline-block;
  width: 20px;
  text-align: center;
  cursor: pointer;
}

.tree-label {
  font-weight: 500;
}

.tree-item {
  padding: 2px 0 2px 20px;
  color: var(--text-secondary);
  font-size: 13px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  background: var(--primary-color);
  color: white;
  border-radius: 12px;
  font-size: 11px;
  margin-left: 8px;
}

.ai-column-header {
  background: #f0e6ff !important;
  font-weight: 600;
}

.ai-column {
  background: #faf5ff;
}

.empty-cell {
  opacity: 0.3;
}

.formula-cell {
  background: #e6f7ff;
}

.prompt-cell {
  background: #fff3cd;
}

.error-cell {
  background: #ffebee;
  color: #c62828;
}

.control-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.control-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.control-type {
  font-weight: 600;
  color: var(--primary-color);
}

.control-row, .control-column {
  font-size: 12px;
  color: var(--text-tertiary);
}

.control-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-field {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.field-label {
  color: var(--text-tertiary);
  min-width: 60px;
}

.field-value {
  color: var(--text-primary);
  flex: 1;
}

.timeline-entry {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 15px;
  font-size: 13px;
}

.timeline-time {
  color: var(--text-tertiary);
  min-width: 80px;
}

.timeline-step {
  flex: 1;
  font-weight: 500;
}

.timeline-duration {
  color: var(--primary-color);
}
`;
document.head.appendChild(style);