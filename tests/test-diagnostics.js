// test-diagnostics.js - エラー診断モジュール

export default class TestDiagnostics {
  constructor(testTool) {
    this.testTool = testTool;
    this.errorPatterns = this.initializeErrorPatterns();
    this.recommendations = [];
    this.comparisonResults = [];
    
    this.initializeDiagnostics();
  }
  
  initializeDiagnostics() {
    // 診断関連のイベントリスナー設定
  }
  
  initializeErrorPatterns() {
    return [
      {
        pattern: /401|Unauthorized/i,
        type: 'authentication',
        message: '認証エラー',
        description: 'Google APIへの認証が失敗しました',
        solutions: [
          'Chrome拡張機能の権限を確認してください',
          'Googleアカウントにログインしているか確認してください',
          'スプレッドシートへのアクセス権限があるか確認してください'
        ]
      },
      {
        pattern: /403|Forbidden/i,
        type: 'permission',
        message: 'アクセス権限エラー',
        description: 'スプレッドシートへのアクセス権限がありません',
        solutions: [
          'スプレッドシートの共有設定を確認してください',
          '「リンクを知っている全員」に閲覧権限を付与してください',
          'スプレッドシートのオーナーに編集権限をリクエストしてください'
        ]
      },
      {
        pattern: /404|Not Found/i,
        type: 'notfound',
        message: 'スプレッドシートが見つかりません',
        description: '指定されたスプレッドシートIDが無効です',
        solutions: [
          'URLが正しいか確認してください',
          'スプレッドシートが削除されていないか確認してください',
          'URLからスプレッドシートIDが正しく抽出されているか確認してください'
        ]
      },
      {
        pattern: /Network|ネットワーク|CORS/i,
        type: 'network',
        message: 'ネットワークエラー',
        description: 'ネットワーク接続に問題があります',
        solutions: [
          'インターネット接続を確認してください',
          'ファイアウォールやプロキシの設定を確認してください',
          'Chrome拡張機能のCORS設定を確認してください'
        ]
      },
      {
        pattern: /timeout|タイムアウト/i,
        type: 'timeout',
        message: 'タイムアウトエラー',
        description: '処理がタイムアウトしました',
        solutions: [
          'スプレッドシートのサイズが大きすぎる可能性があります',
          'ネットワーク速度を確認してください',
          '処理を再試行してください'
        ]
      },
      {
        pattern: /Invalid range|範囲が無効/i,
        type: 'range',
        message: '範囲指定エラー',
        description: 'スプレッドシートの範囲指定が無効です',
        solutions: [
          'シート名が正しいか確認してください',
          '範囲指定の形式（A1:Z100など）を確認してください',
          'シートが存在することを確認してください'
        ]
      },
      {
        pattern: /Rate limit|レート制限/i,
        type: 'ratelimit',
        message: 'レート制限エラー',
        description: 'Google APIのレート制限に達しました',
        solutions: [
          '少し時間を置いてから再試行してください',
          'APIクォータを確認してください',
          'リクエスト頻度を下げてください'
        ]
      },
      {
        pattern: /undefined|null|Cannot read/i,
        type: 'nullreference',
        message: 'データ参照エラー',
        description: '予期しないデータ構造に遭遇しました',
        solutions: [
          'スプレッドシートのデータ形式を確認してください',
          'ヘッダー行が正しく設定されているか確認してください',
          '空の行や列が含まれていないか確認してください'
        ]
      },
      {
        pattern: /JSON|parse|SyntaxError/i,
        type: 'parsing',
        message: 'データ解析エラー',
        description: 'データの解析に失敗しました',
        solutions: [
          'スプレッドシートのデータ形式を確認してください',
          '特殊文字が含まれていないか確認してください',
          'セル内の数式が正しいか確認してください'
        ]
      },
      {
        pattern: /memory|メモリ/i,
        type: 'memory',
        message: 'メモリ不足エラー',
        description: 'メモリが不足しています',
        solutions: [
          'スプレッドシートのサイズを小さくしてください',
          'ブラウザのタブを減らしてください',
          'ブラウザを再起動してください'
        ]
      }
    ];
  }
  
  // エラー分析
  analyzeError(error) {
    const errorString = error.toString() + ' ' + (error.stack || '');
    const matchedPatterns = [];
    
    // エラーパターンマッチング
    for (const pattern of this.errorPatterns) {
      if (pattern.pattern.test(errorString)) {
        matchedPatterns.push(pattern);
      }
    }
    
    // 診断結果の生成
    const diagnosis = {
      error: error.message,
      timestamp: new Date(),
      patterns: matchedPatterns,
      recommendations: this.generateRecommendations(matchedPatterns, error),
      stackTrace: this.formatStackTrace(error.stack),
      context: this.captureContext()
    };
    
    // 診断結果の表示
    this.displayDiagnosis(diagnosis);
    
    // ログに記録
    this.testTool.log('エラー診断完了', 'INFO', diagnosis);
    
    return diagnosis;
  }
  
  generateRecommendations(patterns, error) {
    const recommendations = [];
    
    // パターンベースの推奨事項
    patterns.forEach(pattern => {
      recommendations.push({
        type: pattern.type,
        priority: 'high',
        title: pattern.message,
        description: pattern.description,
        solutions: pattern.solutions
      });
    });
    
    // 汎用的な推奨事項
    if (patterns.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'medium',
        title: '一般的なエラー',
        description: 'エラーの詳細を確認してください',
        solutions: [
          'エラーメッセージを確認してください',
          'コンソールログを確認してください',
          'ネットワークタブでリクエストを確認してください',
          'スプレッドシートの形式が正しいか確認してください'
        ]
      });
    }
    
    // コンテキストベースの推奨事項
    if (this.testTool.currentData) {
      if (!this.testTool.currentData.values || this.testTool.currentData.values.length === 0) {
        recommendations.push({
          type: 'data',
          priority: 'high',
          title: 'データが空です',
          description: 'スプレッドシートにデータが含まれていません',
          solutions: [
            'スプレッドシートにデータが入力されているか確認してください',
            '正しいシートを参照しているか確認してください',
            'gidパラメータが正しいか確認してください'
          ]
        });
      }
      
      if (!this.testTool.currentData.aiColumns || Object.keys(this.testTool.currentData.aiColumns).length === 0) {
        recommendations.push({
          type: 'structure',
          priority: 'medium',
          title: 'AI列が検出されません',
          description: 'ChatGPT/Claude/Geminiで始まる列が見つかりません',
          solutions: [
            'ヘッダー行にAI列が定義されているか確認してください',
            '列名が「ChatGPT 」「Claude 」「Gemini 」で始まることを確認してください',
            'ヘッダー行が1行目にあることを確認してください'
          ]
        });
      }
    }
    
    return recommendations;
  }
  
  formatStackTrace(stack) {
    if (!stack) return null;
    
    const lines = stack.split('\n');
    const formatted = lines.map(line => {
      // ファイル名と行番号を抽出
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        return {
          function: match[1],
          file: match[2],
          line: match[3],
          column: match[4]
        };
      }
      return { raw: line };
    }).filter(item => item.function || item.raw);
    
    return formatted;
  }
  
  captureContext() {
    return {
      url: this.testTool.dom.urlInput?.value || '',
      dataLoaded: !!this.testTool.currentData,
      tasksGenerated: !!this.testTool.currentTasks,
      executionMode: this.testTool.executionMode,
      performanceData: this.testTool.performanceData
    };
  }
  
  displayDiagnosis(diagnosis) {
    const container = document.getElementById('errorDiagnostics');
    if (!container) return;
    
    let html = '<div class="diagnosis-container">';
    
    // エラー概要
    html += `
      <div class="diagnosis-error">
        <strong>エラー:</strong> ${this.escapeHtml(diagnosis.error)}
      </div>
    `;
    
    // 推奨事項
    if (diagnosis.recommendations.length > 0) {
      html += '<div class="diagnosis-recommendations">';
      
      diagnosis.recommendations.forEach(rec => {
        html += `
          <div class="recommendation-card priority-${rec.priority}">
            <div class="rec-header">
              <span class="rec-title">${rec.title}</span>
              <span class="rec-priority">${this.getPriorityLabel(rec.priority)}</span>
            </div>
            <div class="rec-description">${rec.description}</div>
            <div class="rec-solutions">
              <strong>解決策:</strong>
              <ul>
                ${rec.solutions.map(s => `<li>${s}</li>`).join('')}
              </ul>
            </div>
          </div>
        `;
      });
      
      html += '</div>';
    }
    
    // スタックトレース（折りたたみ可能）
    if (diagnosis.stackTrace) {
      html += `
        <details class="diagnosis-stacktrace">
          <summary>スタックトレース</summary>
          <div class="stacktrace-content">
            ${diagnosis.stackTrace.map(frame => {
              if (frame.function) {
                return `<div class="stack-frame">
                  <span class="frame-function">${frame.function}</span>
                  <span class="frame-location">${frame.file}:${frame.line}:${frame.column}</span>
                </div>`;
              }
              return `<div class="stack-frame">${frame.raw}</div>`;
            }).join('')}
          </div>
        </details>
      `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // 推奨事項パネルも更新
    this.updateRecommendationsPanel(diagnosis.recommendations);
  }
  
  updateRecommendationsPanel(recommendations) {
    const container = document.getElementById('recommendations');
    if (!container) return;
    
    if (recommendations.length === 0) {
      container.innerHTML = '<div class="empty-state">推奨事項なし</div>';
      return;
    }
    
    const html = recommendations
      .filter(rec => rec.priority === 'high')
      .slice(0, 3)
      .map(rec => `
        <div class="panel-recommendation">
          <strong>${rec.title}</strong>
          <p>${rec.solutions[0]}</p>
        </div>
      `).join('');
    
    container.innerHTML = html;
  }
  
  getPriorityLabel(priority) {
    const labels = {
      high: '高',
      medium: '中',
      low: '低'
    };
    return labels[priority] || priority;
  }
  
  // データ比較機能
  compareData(before, after) {
    const comparison = {
      timestamp: new Date(),
      changes: [],
      additions: [],
      deletions: []
    };
    
    // 行数の比較
    if (before.values?.length !== after.values?.length) {
      comparison.changes.push({
        type: 'rows',
        before: before.values?.length || 0,
        after: after.values?.length || 0
      });
    }
    
    // AI列の比較
    const beforeAI = before.aiColumns ? Object.keys(before.aiColumns) : [];
    const afterAI = after.aiColumns ? Object.keys(after.aiColumns) : [];
    
    afterAI.forEach(col => {
      if (!beforeAI.includes(col)) {
        comparison.additions.push({ type: 'ai_column', value: col });
      }
    });
    
    beforeAI.forEach(col => {
      if (!afterAI.includes(col)) {
        comparison.deletions.push({ type: 'ai_column', value: col });
      }
    });
    
    // 作業行の比較
    const beforeWork = before.workRows?.length || 0;
    const afterWork = after.workRows?.length || 0;
    
    if (beforeWork !== afterWork) {
      comparison.changes.push({
        type: 'work_rows',
        before: beforeWork,
        after: afterWork
      });
    }
    
    this.displayComparison(comparison);
    return comparison;
  }
  
  displayComparison(comparison) {
    const container = document.getElementById('comparisonResults');
    if (!container) return;
    
    if (comparison.changes.length === 0 && 
        comparison.additions.length === 0 && 
        comparison.deletions.length === 0) {
      container.innerHTML = '<div class="empty-state">変更なし</div>';
      return;
    }
    
    let html = '<div class="comparison-container">';
    
    // 変更
    if (comparison.changes.length > 0) {
      html += '<div class="comparison-section">変更:</div>';
      comparison.changes.forEach(change => {
        html += `<div class="comparison-item">
          ${change.type}: ${change.before} → ${change.after}
        </div>`;
      });
    }
    
    // 追加
    if (comparison.additions.length > 0) {
      html += '<div class="comparison-section">追加:</div>';
      comparison.additions.forEach(add => {
        html += `<div class="comparison-item addition">
          + ${add.type}: ${add.value}
        </div>`;
      });
    }
    
    // 削除
    if (comparison.deletions.length > 0) {
      html += '<div class="comparison-section">削除:</div>';
      comparison.deletions.forEach(del => {
        html += `<div class="comparison-item deletion">
          - ${del.type}: ${del.value}
        </div>`;
      });
    }
    
    html += '</div>';
    container.innerHTML = html;
  }
  
  // よくある問題のチェック
  checkCommonIssues(data) {
    const issues = [];
    
    if (!data) {
      issues.push({
        severity: 'error',
        message: 'データが読み込まれていません'
      });
      return issues;
    }
    
    // 空のスプレッドシート
    if (!data.values || data.values.length === 0) {
      issues.push({
        severity: 'error',
        message: 'スプレッドシートが空です'
      });
    }
    
    // ヘッダー行のチェック
    if (data.values && data.values[0]) {
      const headerRow = data.values[0];
      const emptyCells = headerRow.filter(cell => !cell || cell === '').length;
      
      if (emptyCells > headerRow.length / 2) {
        issues.push({
          severity: 'warning',
          message: 'ヘッダー行に空のセルが多すぎます'
        });
      }
    }
    
    // AI列のチェック
    if (!data.aiColumns || Object.keys(data.aiColumns).length === 0) {
      issues.push({
        severity: 'warning',
        message: 'AI列が検出されませんでした'
      });
    }
    
    // 作業行のチェック
    if (!data.workRows || data.workRows.length === 0) {
      issues.push({
        severity: 'info',
        message: '作業行が検出されませんでした'
      });
    }
    
    // 巨大なスプレッドシート
    if (data.values && data.values.length > 1000) {
      issues.push({
        severity: 'warning',
        message: `スプレッドシートが大きすぎます（${data.values.length}行）`
      });
    }
    
    return issues;
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
.diagnosis-container {
  padding: 15px;
}

.diagnosis-error {
  background: #ffebee;
  color: #c62828;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.diagnosis-recommendations {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recommendation-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-primary);
}

.recommendation-card.priority-high {
  border-color: var(--danger-color);
  border-width: 2px;
}

.recommendation-card.priority-medium {
  border-color: var(--warning-color);
}

.rec-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.rec-title {
  font-weight: 600;
  color: var(--text-primary);
}

.rec-priority {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--bg-tertiary);
}

.rec-description {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 10px;
}

.rec-solutions {
  font-size: 13px;
}

.rec-solutions ul {
  margin-top: 5px;
  margin-left: 20px;
}

.rec-solutions li {
  margin-bottom: 3px;
}

.diagnosis-stacktrace {
  margin-top: 15px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
}

.diagnosis-stacktrace summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}

.stacktrace-content {
  margin-top: 10px;
  font-family: monospace;
  font-size: 11px;
}

.stack-frame {
  padding: 2px 0;
  border-bottom: 1px solid var(--border-color);
}

.frame-function {
  color: var(--primary-color);
  margin-right: 10px;
}

.frame-location {
  color: var(--text-tertiary);
  font-size: 10px;
}

.panel-recommendation {
  padding: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 12px;
}

.panel-recommendation strong {
  display: block;
  margin-bottom: 4px;
  color: var(--primary-color);
}

.panel-recommendation p {
  margin: 0;
  color: var(--text-secondary);
}

.comparison-container {
  padding: 10px;
}

.comparison-section {
  font-weight: 600;
  margin: 10px 0 5px 0;
  color: var(--text-secondary);
}

.comparison-item {
  padding: 4px 8px;
  margin: 2px 0;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 12px;
}

.comparison-item.addition {
  background: #e8f5e9;
  color: #2e7d32;
}

.comparison-item.deletion {
  background: #ffebee;
  color: #c62828;
}
`;
document.head.appendChild(style);