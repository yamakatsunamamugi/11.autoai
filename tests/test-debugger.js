// test-debugger.js - デバッグ機能モジュール

export default class TestDebugger {
  constructor(testTool) {
    this.testTool = testTool;
    this.breakpoints = new Map();
    this.watchedVariables = new Map();
    this.callStack = [];
    this.currentContext = {};
    this.consoleHistory = [];
    
    this.initializeDebugger();
  }
  
  initializeDebugger() {
    // デバッグコンソール入力の設定
    const consoleInput = document.getElementById('consoleInput');
    const executeBtn = document.getElementById('executeBtn');
    
    if (consoleInput && executeBtn) {
      executeBtn.addEventListener('click', () => {
        this.executeConsoleCommand(consoleInput.value);
        consoleInput.value = '';
      });
      
      consoleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.executeConsoleCommand(consoleInput.value);
          consoleInput.value = '';
        }
      });
    }
    
    // ブレークポイント追加ボタン
    const addBreakpointBtn = document.getElementById('addBreakpointBtn');
    if (addBreakpointBtn) {
      addBreakpointBtn.addEventListener('click', () => {
        this.showBreakpointDialog();
      });
    }
  }
  
  // ブレークポイント管理
  addBreakpoint(stepName, condition = null) {
    this.breakpoints.set(stepName, {
      enabled: true,
      condition,
      hitCount: 0
    });
    this.renderBreakpoints();
    this.testTool.log(`ブレークポイント追加: ${stepName}`, 'DEBUG');
  }
  
  removeBreakpoint(stepName) {
    this.breakpoints.delete(stepName);
    this.renderBreakpoints();
    this.testTool.log(`ブレークポイント削除: ${stepName}`, 'DEBUG');
  }
  
  toggleBreakpoint(stepName) {
    if (this.breakpoints.has(stepName)) {
      const bp = this.breakpoints.get(stepName);
      bp.enabled = !bp.enabled;
      this.renderBreakpoints();
    }
  }
  
  checkBreakpoint(stepName, context) {
    if (!this.breakpoints.has(stepName)) return false;
    
    const bp = this.breakpoints.get(stepName);
    if (!bp.enabled) return false;
    
    bp.hitCount++;
    
    // 条件付きブレークポイントのチェック
    if (bp.condition) {
      try {
        const result = this.evaluateExpression(bp.condition, context);
        return result === true;
      } catch (e) {
        this.testTool.log(`ブレークポイント条件エラー: ${e.message}`, 'ERROR');
        return false;
      }
    }
    
    return true;
  }
  
  renderBreakpoints() {
    const container = document.getElementById('breakpointsList');
    if (!container) return;
    
    if (this.breakpoints.size === 0) {
      container.innerHTML = '<div class="empty-state">ブレークポイントなし</div>';
      return;
    }
    
    const html = Array.from(this.breakpoints.entries()).map(([name, bp]) => `
      <div class="breakpoint-item">
        <input type="checkbox" ${bp.enabled ? 'checked' : ''} 
               onchange="window.testTool.debugger.toggleBreakpoint('${name}')">
        <span class="bp-name">${name}</span>
        <span class="bp-hits">ヒット: ${bp.hitCount}</span>
        ${bp.condition ? `<span class="bp-condition">条件: ${bp.condition}</span>` : ''}
        <button onclick="window.testTool.debugger.removeBreakpoint('${name}')">×</button>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }
  
  showBreakpointDialog() {
    const steps = [
      'データ読み込み',
      '自動セットアップ',
      'データ処理',
      '制御情報収集',
      'タスク生成'
    ];
    
    const stepName = prompt('ブレークポイントを設定するステップを選択:\n' + steps.join('\n'));
    if (stepName && steps.includes(stepName)) {
      const condition = prompt('条件式（オプション、空白で無条件）:');
      this.addBreakpoint(stepName, condition || null);
    }
  }
  
  // 変数インスペクター
  updateVariables(context) {
    this.currentContext = context;
    this.renderVariables();
  }
  
  watchVariable(name, expression) {
    this.watchedVariables.set(name, expression);
    this.renderVariables();
  }
  
  unwatchVariable(name) {
    this.watchedVariables.delete(name);
    this.renderVariables();
  }
  
  renderVariables() {
    const container = document.getElementById('variablesTree');
    if (!container) return;
    
    const sections = [];
    
    // 現在のコンテキスト
    if (Object.keys(this.currentContext).length > 0) {
      sections.push(this.renderObjectTree('現在のコンテキスト', this.currentContext));
    }
    
    // 監視中の変数
    if (this.watchedVariables.size > 0) {
      const watchedValues = {};
      this.watchedVariables.forEach((expr, name) => {
        try {
          watchedValues[name] = this.evaluateExpression(expr, this.currentContext);
        } catch (e) {
          watchedValues[name] = `<エラー: ${e.message}>`;
        }
      });
      sections.push(this.renderObjectTree('監視中の変数', watchedValues));
    }
    
    // グローバル変数（testToolのデータ）
    if (this.testTool.currentData) {
      sections.push(this.renderObjectTree('スプレッドシートデータ', {
        rows: this.testTool.currentData.values?.length,
        workRows: this.testTool.currentData.workRows?.length,
        aiColumns: this.testTool.currentData.aiColumns?.length,
        controls: this.testTool.currentData.controls
      }));
    }
    
    if (this.testTool.currentTasks) {
      sections.push(this.renderObjectTree('タスク情報', {
        total: this.testTool.currentTasks.tasks?.length,
        statistics: this.testTool.currentTasks.getStatistics()
      }));
    }
    
    container.innerHTML = sections.join('<hr>');
  }
  
  renderObjectTree(title, obj, level = 0) {
    const indent = '  '.repeat(level);
    let html = level === 0 ? `<div class="var-section"><strong>${title}</strong>\n` : '';
    
    if (obj === null) {
      html += `${indent}null\n`;
    } else if (obj === undefined) {
      html += `${indent}undefined\n`;
    } else if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        html += `${indent}Array(${obj.length})\n`;
        obj.slice(0, 10).forEach((item, i) => {
          html += `${indent}  [${i}]: ${this.formatValue(item)}\n`;
        });
        if (obj.length > 10) {
          html += `${indent}  ... ${obj.length - 10} more items\n`;
        }
      } else {
        const entries = Object.entries(obj);
        entries.slice(0, 20).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && level < 2) {
            html += `${indent}${key}:\n${this.renderObjectTree('', value, level + 1)}`;
          } else {
            html += `${indent}${key}: ${this.formatValue(value)}\n`;
          }
        });
        if (entries.length > 20) {
          html += `${indent}... ${entries.length - 20} more properties\n`;
        }
      }
    } else {
      html += `${indent}${this.formatValue(obj)}\n`;
    }
    
    if (level === 0) html += '</div>';
    return html;
  }
  
  formatValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'function') return '[Function]';
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (typeof value === 'object') return '{...}';
    return String(value);
  }
  
  // デバッグコンソール
  executeConsoleCommand(command) {
    if (!command.trim()) return;
    
    this.consoleHistory.push(command);
    this.appendToConsole(`> ${command}`, 'command');
    
    try {
      // 特殊コマンドの処理
      if (command.startsWith('watch ')) {
        const expr = command.substring(6);
        const name = `watch_${this.watchedVariables.size + 1}`;
        this.watchVariable(name, expr);
        this.appendToConsole(`Watching: ${expr}`, 'info');
        return;
      }
      
      if (command === 'clear') {
        document.getElementById('debugOutput').innerHTML = '';
        return;
      }
      
      if (command === 'help') {
        this.showDebugHelp();
        return;
      }
      
      // JavaScript式の評価
      const result = this.evaluateExpression(command, {
        ...this.currentContext,
        testTool: this.testTool,
        data: this.testTool.currentData,
        tasks: this.testTool.currentTasks
      });
      
      this.appendToConsole(this.formatConsoleOutput(result), 'result');
      
    } catch (error) {
      this.appendToConsole(`エラー: ${error.message}`, 'error');
    }
  }
  
  evaluateExpression(expression, context) {
    // セキュアな評価のためにFunction constructorを使用
    const contextKeys = Object.keys(context);
    const contextValues = contextKeys.map(k => context[k]);
    
    try {
      const func = new Function(...contextKeys, `return ${expression}`);
      return func(...contextValues);
    } catch (error) {
      throw new Error(`式の評価エラー: ${error.message}`);
    }
  }
  
  formatConsoleOutput(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'function') return value.toString();
    
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  
  appendToConsole(text, type = 'log') {
    const output = document.getElementById('debugOutput');
    if (!output) return;
    
    const entry = document.createElement('div');
    entry.className = `console-entry console-${type}`;
    entry.textContent = text;
    output.appendChild(entry);
    output.scrollTop = output.scrollHeight;
  }
  
  showDebugHelp() {
    const helpText = `
デバッグコンソールコマンド:
- JavaScript式を入力して評価
- watch <式> - 式を監視リストに追加
- clear - コンソールをクリア
- help - このヘルプを表示

利用可能な変数:
- testTool - テストツールインスタンス
- data - 現在のスプレッドシートデータ
- tasks - 現在のタスクリスト
    `;
    this.appendToConsole(helpText, 'info');
  }
  
  // コールスタック管理
  pushCallStack(name, args) {
    this.callStack.push({
      name,
      args,
      timestamp: performance.now()
    });
    this.renderCallStack();
  }
  
  popCallStack() {
    const frame = this.callStack.pop();
    this.renderCallStack();
    return frame;
  }
  
  renderCallStack() {
    // 実装予定: コールスタックの表示
  }
  
  // スナップショット機能
  takeSnapshot(name) {
    const snapshot = {
      name,
      timestamp: new Date(),
      data: JSON.parse(JSON.stringify(this.testTool.currentData)),
      tasks: this.testTool.currentTasks ? {
        count: this.testTool.currentTasks.tasks.length,
        statistics: this.testTool.currentTasks.getStatistics()
      } : null,
      context: { ...this.currentContext }
    };
    
    return snapshot;
  }
  
  compareSnapshots(snapshot1, snapshot2) {
    // 実装予定: スナップショットの比較
  }
}

// スタイル追加（動的に挿入）
const style = document.createElement('style');
style.textContent = `
.breakpoint-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px;
  border-bottom: 1px solid var(--border-color);
}

.bp-name {
  flex: 1;
  font-weight: 500;
}

.bp-hits {
  font-size: 12px;
  color: var(--text-tertiary);
}

.bp-condition {
  font-size: 12px;
  color: var(--info-color);
}

.var-section {
  margin-bottom: 15px;
  white-space: pre;
  font-family: monospace;
  font-size: 12px;
}

.console-entry {
  margin-bottom: 5px;
  padding: 2px 5px;
  font-family: monospace;
  font-size: 12px;
}

.console-command {
  color: #4299e1;
}

.console-result {
  color: #48bb78;
}

.console-error {
  color: #f56565;
}

.console-info {
  color: #718096;
}

.empty-state {
  text-align: center;
  color: var(--text-tertiary);
  padding: 20px;
  font-style: italic;
}
`;
document.head.appendChild(style);