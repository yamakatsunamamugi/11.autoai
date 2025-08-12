// test-report-generation.js - レポート化テストのメインスクリプト

// サービスクラスを初期化
function initializeServices() {
  // AuthServiceを初期化
  if (typeof AuthService !== 'undefined' && !globalThis.authService) {
    globalThis.authService = new AuthService();
  }
  
  // DocsClientを初期化
  if (typeof DocsClient !== 'undefined' && !globalThis.docsClient) {
    globalThis.docsClient = new DocsClient();
  }
  
  // SheetsClientを初期化
  if (typeof SheetsClient !== 'undefined' && !globalThis.sheetsClient) {
    globalThis.sheetsClient = new SheetsClient();
  }
}

// グローバル変数
let sheetData = null;
let createdDocumentIds = []; // 作成したドキュメントのIDを追跡

// DOMContentLoadedイベントで初期化
document.addEventListener('DOMContentLoaded', () => {
  // サービスを初期化
  initializeServices();
  
  // タイトルに現在日時を設定
  document.getElementById('docTitle').value = `レポート化テスト - ${new Date().toLocaleString('ja-JP')}`;
  
  // イベントリスナーを設定
  setupEventListeners();
});

// イベントリスナーの設定
function setupEventListeners() {
  // テスト1: Googleドキュメント作成
  document.getElementById('createDocBtn').addEventListener('click', createDocument);
  
  // テスト2: スプレッドシートからデータ取得
  document.getElementById('fetchSheetBtn').addEventListener('click', fetchSheetData);
  
  // スプレッドシートデータからレポート生成
  document.getElementById('generateReportFromSheetBtn').addEventListener('click', generateReportFromSheet);
  
  // 各作業行から個別ドキュメント作成
  document.getElementById('generateIndividualReportsBtn').addEventListener('click', generateIndividualReports);
  
  // 作成したドキュメントを削除
  document.getElementById('deleteCreatedDocsBtn').addEventListener('click', deleteCreatedDocuments);
}

// テスト1: Googleドキュメント作成
async function createDocument() {
  const title = document.getElementById('docTitle').value;
  const content = document.getElementById('docContent').value;
  const resultBox = document.getElementById('docResult');
  const btn = document.getElementById('createDocBtn');
  
  if (!title || !content) {
    showResult(resultBox, 'error', 'エラー', 'タイトルと内容を入力してください', '❌');
    return;
  }
  
  btn.disabled = true;
  showResult(resultBox, 'info', '処理中', 'Googleドキュメントを作成しています...', '⏳');
  
  try {
    // 本番と同じcreateDocumentFromTaskResultを使用
    const taskResult = {
      prompt: title,
      response: content,
      aiType: "テスト",
      rowNumber: 1,
      columnIndex: "A"
    };
    
    const docInfo = await globalThis.docsClient.createDocumentFromTaskResult(taskResult);
    
    // ドキュメントIDを保存（両方の形式で保存）
    const documentId = docInfo.documentId || docInfo.id;
    if (documentId) {
      createdDocumentIds.push(documentId);
      // グローバル配列にも追加（削除ボタンで使用）
      window.createdDocumentIds = window.createdDocumentIds || [];
      window.createdDocumentIds.push(documentId);
      console.log('テスト1 ドキュメントID保存:', documentId, 'グローバル配列:', window.createdDocumentIds);
    }
    
    const successHtml = `
      <div>✅ ドキュメントが正常に作成されました</div>
      <div style="margin-top: 10px;">
        <strong>ドキュメントURL:</strong><br>
        <a href="${docInfo.url}" target="_blank">${docInfo.url}</a>
      </div>
      <div style="margin-top: 10px;">
        <button id="openDocBtn" class="btn btn-secondary">
          ドキュメントを開く
        </button>
        <button id="deleteDocBtn" class="btn btn-secondary" style="margin-left: 10px; background: #ffebee; color: #c62828;">
          🗑️ ドキュメントを削除
        </button>
      </div>
    `;
    
    showResult(resultBox, 'success', '成功', successHtml, '✅');
    
    // ドキュメントを開くボタンのイベントリスナー
    setTimeout(() => {
      const openBtn = document.getElementById('openDocBtn');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          window.open(docInfo.url, '_blank');
        });
      }
      
      // ドキュメントを削除するボタンのイベントリスナー
      const deleteBtn = document.getElementById('deleteDocBtn');
      const docIdForDelete = docInfo.documentId || docInfo.id;
      if (deleteBtn && docIdForDelete) {
        deleteBtn.addEventListener('click', async () => {
          if (confirm('このテストドキュメントを削除しますか？')) {
            await deleteDocument(docIdForDelete);
          }
        });
      }
    }, 100);
    
  } catch (error) {
    console.error('ドキュメント作成エラー:', error);
    showResult(resultBox, 'error', 'エラー', `作成に失敗しました: ${error.message}`, '❌');
  } finally {
    btn.disabled = false;
  }
}

// テスト2: スプレッドシートからデータ取得（仮データを使用）
async function fetchSheetData() {
  const useRealSheet = document.getElementById('sheetUrl').value.trim() !== '';
  const resultBox = document.getElementById('sheetResult');
  const btn = document.getElementById('fetchSheetBtn');
  const generateBtn = document.getElementById('generateReportFromSheetBtn');
  
  btn.disabled = true;
  
  if (useRealSheet) {
    // 実際のスプレッドシートを使用する場合
    const url = document.getElementById('sheetUrl').value;
    const range = document.getElementById('cellRange').value;
    
    // URLからスプレッドシートIDを抽出
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      showResult(resultBox, 'error', 'エラー', '有効なスプレッドシートURLではありません', '❌');
      btn.disabled = false;
      return;
    }
    
    const spreadsheetId = match[1];
    const gidMatch = url.match(/[#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;
    
    showResult(resultBox, 'info', '処理中', 'スプレッドシートからデータを取得しています...', '⏳');
    
    try {
      // スプレッドシートからデータ取得
      sheetData = await globalThis.sheetsClient.getSheetData(spreadsheetId, range || 'A1:Z100', gid);
      
      if (!sheetData || sheetData.length === 0) {
        throw new Error('データが見つかりませんでした');
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      showResult(resultBox, 'error', 'エラー', `取得に失敗しました: ${error.message}`, '❌');
      generateBtn.style.display = 'none';
      const individualBtn = document.getElementById('generateIndividualReportsBtn');
      if (individualBtn) {
        individualBtn.style.display = 'none';
      }
      btn.disabled = false;
      return;
    }
  } else {
    // 仮のテストデータを使用
    showResult(resultBox, 'info', '処理中', '仮のテストデータを生成しています...', '⏳');
    
    // 仮のスプレッドシートデータを生成
    sheetData = generateMockSpreadsheetData();
    
    // 少し遅延を入れて処理感を演出
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  try {
    
    const resultHtml = `
      <div>✅ データを取得しました</div>
      <div style="margin-top: 10px;">
        <strong>取得データ:</strong>
        <ul style="margin-top: 5px;">
          <li>行数: ${sheetData.length}行</li>
          <li>列数: ${sheetData[0]?.length || 0}列</li>
        </ul>
      </div>
      <div style="margin-top: 15px;">
        <strong>データプレビュー:</strong>
        <div style="margin-top: 10px; overflow-x: auto; background: white; border: 1px solid #ddd; border-radius: 4px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #f5f5f5;">
                ${sheetData[0] ? sheetData[0].map((cell, i) => `
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left; font-weight: 600; white-space: nowrap; ${getColumnStyle(i)}">
                    ${cell || '(空)'}
                  </th>
                `).join('') : ''}
              </tr>
            </thead>
            <tbody>
              ${sheetData.slice(1, Math.min(sheetData.length, 10)).map((row, rowIndex) => `
                <tr style="${rowIndex % 2 === 0 ? 'background: #fafafa;' : ''}">
                  ${row.map((cell, colIndex) => `
                    <td style="border: 1px solid #ddd; padding: 6px; ${getCellStyle(sheetData[0][colIndex], cell)}">
                      ${formatCellContent(cell, sheetData[0][colIndex])}
                    </td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${sheetData.length > 10 ? `
            <div style="padding: 10px; text-align: center; background: #f9f9f9; border-top: 1px solid #ddd; color: #666;">
              ... 他 ${sheetData.length - 10} 行
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    showResult(resultBox, 'success', '成功', resultHtml, '✅');
    generateBtn.style.display = 'inline-flex';
    
    // 個別ドキュメント作成ボタンも表示
    const individualBtn = document.getElementById('generateIndividualReportsBtn');
    if (individualBtn) {
      individualBtn.style.display = 'inline-flex';
    }
    
  } catch (error) {
    console.error('データ取得エラー:', error);
    showResult(resultBox, 'error', 'エラー', `取得に失敗しました: ${error.message}`, '❌');
    generateBtn.style.display = 'none';
    const individualBtn = document.getElementById('generateIndividualReportsBtn');
    if (individualBtn) {
      individualBtn.style.display = 'none';
    }
  } finally {
    btn.disabled = false;
  }
}

// スプレッドシートデータからレポート生成
async function generateReportFromSheet() {
  if (!sheetData || sheetData.length === 0) {
    alert('先にスプレッドシートからデータを取得してください');
    return;
  }
  
  const btn = document.getElementById('generateReportFromSheetBtn');
  const resultBox = document.getElementById('sheetResult');
  
  btn.disabled = true;
  showResult(resultBox, 'info', '処理中', 'スプレッドシートデータからレポートを生成しています...', '⏳');
  
  try {
    // スプレッドシートデータを整形してレポート化
    const reportContent = formatSheetDataForReport(sheetData);
    
    const taskResult = {
      prompt: "スプレッドシートデータのレポート",
      response: reportContent,
      aiType: "スプレッドシート",
      rowNumber: sheetData.length,
      columnIndex: String.fromCharCode(65 + (sheetData[0]?.length || 0) - 1)
    };
    
    const docInfo = await globalThis.docsClient.createDocumentFromTaskResult(taskResult);
    
    // ドキュメントIDを保存
    const documentId = docInfo.documentId || docInfo.id;
    if (documentId) {
      createdDocumentIds.push(documentId);
    }
    
    const successHtml = `
      <div>✅ レポートが正常に作成されました</div>
      <div style="margin-top: 10px;">
        <strong>レポートURL:</strong><br>
        <a href="${docInfo.url}" target="_blank">${docInfo.url}</a>
      </div>
      <div style="margin-top: 10px;">
        <button id="openReportBtn" class="btn btn-secondary">
          レポートを開く
        </button>
        <button id="deleteReportBtn" class="btn btn-secondary" style="margin-left: 10px; background: #ffebee; color: #c62828;">
          🗑️ レポートを削除
        </button>
      </div>
    `;
    
    showResult(resultBox, 'success', '成功', successHtml, '✅');
    
    // レポートを開くボタンのイベントリスナー
    setTimeout(() => {
      const openBtn = document.getElementById('openReportBtn');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          window.open(docInfo.url, '_blank');
        });
      }
      
      // レポートを削除するボタンのイベントリスナー
      const deleteBtn = document.getElementById('deleteReportBtn');
      if (deleteBtn && docInfo.id) {
        deleteBtn.addEventListener('click', async () => {
          if (confirm('このテストレポートを削除しますか？')) {
            await deleteDocument(docInfo.id);
          }
        });
      }
    }, 100);
    
  } catch (error) {
    console.error('レポート生成エラー:', error);
    showResult(resultBox, 'error', 'エラー', `生成に失敗しました: ${error.message}`, '❌');
  } finally {
    btn.disabled = false;
  }
}

// スプレッドシートデータをレポート形式に整形
function formatSheetDataForReport(data) {
  let report = "スプレッドシートデータ分析レポート\n\n";
  report += `データ取得日時: ${new Date().toLocaleString('ja-JP')}\n\n`;
  report += `【データ概要】\n`;
  report += `総行数: ${data.length}行\n`;
  report += `総列数: ${data[0]?.length || 0}列\n\n`;
  
  // ヘッダー行があると仮定
  if (data.length > 0) {
    report += `【ヘッダー情報】\n`;
    report += data[0].join(' | ') + '\n\n';
  }
  
  // データサンプル
  report += `【データサンプル（最初の10行）】\n`;
  data.slice(0, 10).forEach((row, index) => {
    report += `行${index + 1}: ${row.join(' | ')}\n`;
  });
  
  // データ分析
  report += `\n【データ分析】\n`;
  report += `- 空のセル数: ${countEmptyCells(data)}個\n`;
  report += `- データ密度: ${calculateDataDensity(data)}%\n`;
  
  return report;
}

// 仮のスプレッドシートデータを生成（3つの作業行のみ）
function generateMockSpreadsheetData() {
  // AutoAI用の仮データ（実際の構造に基づいて作成）
  const mockData = [
    // メニュー行（A列が「メニュー」）
    ['メニュー', '', 'ログ', 'プロンプト', 'プロンプト2', 'プロンプト3', 'プロンプト4', 'プロンプト5', '回答', 'ChatGPT回答', 'Claude回答', 'Gemini回答', 'レポート化'],
    
    // 行の処理（列制御）行
    ['行の処理', '', '', 'この列から処理', '', '', '', '', '', '', 'この列の処理後に停止', '', ''],
    
    // 使うAI行
    ['使うAI', '', '', 'ChatGPT', '', '', '', '', '', '3種類（ChatGPT・Gemini・Claude）', '', '', ''],
    
    // モデル行
    ['モデル', '', '', '', '', '', '', '', '', 'o3（推論）', '', '', ''],
    
    // 機能行
    ['機能', '', '', '', '', '', '', '', '', 'DeepReserch', '', '', ''],
    
    // 空行
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    
    // 作業行1（A列が「1」）
    ['1', '', '処理開始', '日本の首都について教えてください', '東京の歴史も含めて', '', '', '', 
     '東京は日本の首都で、人口約1400万人の大都市です。江戸時代から続く歴史ある都市です。', 
     'ChatGPT: 東京は日本の首都であり、政治・経済の中心地です。', 
     'Claude: 東京は1869年に首都となり、現在は世界最大級の都市圏を形成しています。',
     'Gemini: 東京都は23区と多摩地域から構成される日本の首都です。', ''],
    
    // 作業行2
    ['2', '', '処理中', 'プログラミング言語の選び方', 'Pythonの利点', 'JavaScriptの特徴', '', '', 
     'プロジェクトの要件に応じて適切な言語を選択することが重要です。',
     'ChatGPT: Python は機械学習に、JavaScript はWeb開発に適しています。',
     'Claude: 各言語には強みがあり、用途に応じて選択すべきです。',
     'Gemini: プログラミング言語選択は、パフォーマンス、生産性、エコシステムを考慮します。', ''],
    
    // 作業行3
    ['3', '', '', '機械学習の基礎を説明してください', '', '', '', '', 
     '機械学習はデータからパターンを学習するAI技術です。教師あり学習、教師なし学習、強化学習の3つの主要な分野があります。',
     'ChatGPT: 機械学習は教師あり、教師なし、強化学習に分類されます。',
     'Claude: 機械学習はアルゴリズムがデータから自動的に学習する技術です。',
     'Gemini: 機械学習は人工知能の一分野で、データ駆動型の学習を行います。', ''],
  ];
  
  return mockData;
}

// 空のセル数をカウント
function countEmptyCells(data) {
  let count = 0;
  data.forEach(row => {
    row.forEach(cell => {
      if (!cell || cell.trim() === '') count++;
    });
  });
  return count;
}

// データ密度を計算
function calculateDataDensity(data) {
  const totalCells = data.length * (data[0]?.length || 0);
  const emptyCells = countEmptyCells(data);
  const filledCells = totalCells - emptyCells;
  return totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
}

// 列のスタイルを取得
function getColumnStyle(index) {
  // 最初の列（A列）は固定幅
  if (index === 0) return 'width: 80px; background: #f9f9f9;';
  // B列（制御列）
  if (index === 1) return 'width: 100px; background: #fff3cd;';
  // プロンプトと回答列は幅広く
  if (index === 2 || index === 3) return 'min-width: 200px;';
  // AI列
  return 'min-width: 150px;';
}

// セルのスタイルを取得
function getCellStyle(header, content) {
  // 空のセル
  if (!content || content.trim() === '') {
    return 'color: #ccc; font-style: italic;';
  }
  // 行制御セル
  if (content === 'この行の処理後に停止' || content === 'この行から処理' || content === 'この行のみ処理') {
    return 'background: #fff3cd; font-weight: bold; color: #856404;';
  }
  // 列制御セル  
  if (content === 'この列から処理' || content === 'この列の処理後に停止' || content === 'この列のみ処理') {
    return 'background: #ffeaa7; font-weight: bold; color: #856404;';
  }
  // AI名のセル
  if (content === 'ChatGPT' || content === 'Claude' || content === 'Gemini' || content.includes('3種類')) {
    return 'background: #e3f2fd; font-weight: bold; color: #1976d2;';
  }
  // モデル名
  if (content === 'o3（推論）' || content === 'o3-pro（鬼推論）') {
    return 'background: #f3e5f5; font-weight: bold; color: #7b1fa2;';
  }
  // 機能名
  if (content === 'DeepReserch' || content === 'DeepResearch') {
    return 'background: #e8f5e9; font-weight: bold; color: #2e7d32;';
  }
  // 長いテキスト
  if (content.length > 50) {
    return 'max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
  }
  return '';
}

// セルの内容をフォーマット
function formatCellContent(content, header) {
  if (!content || content.trim() === '') {
    return '<span style="color: #ccc;">(空)</span>';
  }
  // 長いテキストは省略
  if (content.length > 100) {
    return `<span title="${content.replace(/"/g, '&quot;')}">${content.substring(0, 100)}...</span>`;
  }
  // HTMLエスケープ
  return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 結果表示用ヘルパー関数
function showResult(box, type, title, content, icon) {
  box.style.display = 'block';
  box.className = `result-box ${type}`;
  const titleElement = box.querySelector('.result-title');
  if (titleElement) {
    const iconSpan = titleElement.querySelector('span:first-child');
    const titleSpan = titleElement.querySelector('span:last-child');
    if (iconSpan) iconSpan.textContent = icon;
    if (titleSpan) titleSpan.textContent = title;
  }
  const contentElement = box.querySelector('.result-content');
  if (contentElement) {
    contentElement.innerHTML = content;
  }
}


// 本番と同じシステムでレポート化を実行する関数
async function generateIndividualReports() {
  const sheetUrl = document.getElementById('sheetUrl').value.trim();
  
  if (!sheetUrl) {
    alert('スプレッドシートURLを入力してください');
    return;
  }
  
  // URLからスプレッドシートIDとGIDを抽出
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    alert('有効なスプレッドシートURLではありません');
    return;
  }
  
  const spreadsheetId = match[1];
  const gidMatch = sheetUrl.match(/[#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : null;
  
  const btn = document.getElementById('generateIndividualReportsBtn');
  const resultBox = document.getElementById('sheetResult');
  
  btn.disabled = true;
  showResult(resultBox, 'info', '処理中', '直接レポート生成を実行しています...', '⏳');
  
  try {
    // 直接レポート生成処理を実行
    console.log('直接レポート生成開始:', { spreadsheetId, gid });
    
    // スクリプトを動的に読み込み
    if (!window.generateReportDirect) {
      const script = document.createElement('script');
      script.src = '/tests/test-report-direct.js';
      document.head.appendChild(script);
      await new Promise(resolve => {
        script.onload = resolve;
      });
    }
    
    // 直接レポート生成を実行
    const results = await window.generateReportDirect(spreadsheetId, gid);
    console.log('レポート生成結果:', results);
    
    // 成功したレポートのドキュメントIDをローカル配列にも追加
    const successResults = results.filter(r => r.success);
    successResults.forEach(result => {
      if (result.documentId) {
        createdDocumentIds.push(result.documentId);
      }
    });
    
    // 成功したレポート数をカウント
    const successCount = successResults.length;
    const failCount = results.filter(r => !r.success).length;
    
    if (successCount === 0 && failCount > 0) {
      throw new Error('すべてのレポート生成に失敗しました');
    }
    
    // 成功メッセージを表示
    const successHtml = `
      <div>✅ レポート生成が完了しました</div>
      <div style="margin-top: 15px;">
        <strong>処理結果:</strong>
        <ul style="margin-top: 10px; padding-left: 20px;">
          <li>成功: ${successCount}件</li>
          <li>失敗: ${failCount}件</li>
        </ul>
      </div>
      <div style="margin-top: 15px;">
        <button id="openSpreadsheetBtn" class="btn btn-primary">
          📊 スプレッドシートを開く
        </button>
      </div>
    `;
    
    showResult(resultBox, 'success', '成功', successHtml, '✅');
    
    // 削除ボタンを表示
    const deleteBtn = document.getElementById('deleteCreatedDocsBtn');
    if (deleteBtn && successCount > 0) {
      deleteBtn.style.display = 'inline-flex';
    }
    
    // スプレッドシートを開くボタンのイベントリスナー
    setTimeout(() => {
      const openBtn = document.getElementById('openSpreadsheetBtn');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          window.open(sheetUrl, '_blank');
        });
      }
    }, 100);
    
    btn.disabled = false;
    return;
    
    // 以下の古いコードはコメントアウト
    /*
    console.log('本番システム開始:', { spreadsheetId, gid });
    
    // まずスプレッドシートを読み込んでタスクを生成
    const loadResponse = await chrome.runtime.sendMessage({
      action: 'loadSpreadsheet',
      url: sheetUrl
    });
    
    console.log('loadSpreadsheet response:', loadResponse);
    
    if (!loadResponse || !loadResponse.success) {
      throw new Error(loadResponse?.error || 'スプレッドシート読み込みエラー');
    }
    
    // デバッグ: レスポンス内容を確認
    console.log('AI列情報:', loadResponse.aiColumns);
    console.log('タスク数:', loadResponse.taskCount);
    console.log('タスク保存状態:', loadResponse.taskQueueStatus);
    
    // タスクQueueから保存されたタスクを取得
    const taskQueue = new (await import('../src/features/task/queue.js')).default();
    const savedTasks = await taskQueue.loadTaskList();
    
    console.log('保存されたタスク:', savedTasks);
    
    if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
      console.error('タスクが保存されていません。詳細:', {
        savedTasks,
        aiColumns: loadResponse.aiColumns,
        taskCount: loadResponse.taskCount
      });
      throw new Error('実行可能なタスクがありません');
    }
    
    // レポートタスクのみを抽出
    let reportTasks = savedTasks.tasks.filter(task => task.taskType === 'report');
    
    // レポートタスクがない場合は、手動で作成する（フォールバック）
    if (reportTasks.length === 0) {
      console.warn('レポートタスクが見つかりません。手動で作成します。');
      
      // スプレッドシートから直接データを読み込んで、レポートタスクを作成
      const sheetsClient = globalThis.sheetsClient;
      const rawData = await sheetsClient.getSheetData(spreadsheetId, 'A1:Z100', gid);
      
      console.log('取得したデータ:', rawData);
      
      // レポート化列（M列）を探す
      const headerRow = rawData[0] || [];
      let reportColumnIndex = -1;
      for (let i = 0; i < headerRow.length; i++) {
        if (headerRow[i] && headerRow[i].includes('レポート化')) {
          reportColumnIndex = i;
          break;
        }
      }
      
      if (reportColumnIndex === -1) {
        throw new Error('レポート化列が見つかりません');
      }
      
      const reportColumn = String.fromCharCode(65 + reportColumnIndex);
      console.log('レポート化列:', reportColumn);
      
      // 作業行を探して、レポートタスクを作成
      reportTasks = [];
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !row[0]) continue;
        
        // A列が数字の場合は作業行
        if (/^\d+$/.test(row[0].toString())) {
          // 回答列（I, J, K, L列など）を確認
          const answerColumns = ['I', 'J', 'K', 'L'];
          for (const answerCol of answerColumns) {
            const answerIndex = answerCol.charCodeAt(0) - 65;
            if (row[answerIndex] && row[answerIndex].trim()) {
              // 回答がある場合、レポートタスクを作成
              reportTasks.push({
                id: `report_${answerCol}${i+1}_${Date.now()}`,
                taskType: 'report',
                column: reportColumn,
                row: i + 1,
                sourceColumn: answerCol,
                reportColumn: reportColumn,
                aiType: 'report',
                prompt: 'レポート生成タスク',
                promptColumn: 'D' // プロンプト列
              });
              console.log(`レポートタスク作成: ${answerCol}${i+1} -> ${reportColumn}${i+1}`);
            }
          }
        }
      }
      
      if (reportTasks.length === 0) {
        throw new Error('レポート化可能な回答が見つかりません');
      }
      
      console.log(`手動で${reportTasks.length}個のレポートタスクを作成しました`);
    }
    
    // 本番のstreamProcessTasksアクションを使用
    const response = await chrome.runtime.sendMessage({
      action: 'streamProcessTasks',
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: sheetUrl,
      gid: gid,
      tasks: reportTasks,
      columnMapping: loadResponse.columnMapping || {},
      testMode: false
    });
    
    console.log('本番システム実行結果:', response);
    
    if (!response || !response.success) {
      throw new Error(response?.error || '本番システムでの実行に失敗しました');
    }
    
    // 本番システムの処理完了を表示
    const successHtml = `
      <div>✅ レポート化処理が正常に完了しました</div>
      <div style="margin-top: 15px;">
        <strong>処理結果:</strong>
        <ul style="margin-top: 10px; padding-left: 20px;">
          <li>処理されたレポートタスク数: ${reportTasks.length}個</li>
          <li>本番のStreamProcessorが自動実行</li>
          <li>Googleドキュメントが自動作成済み</li>
          <li>スプレッドシートにURLが自動書き込み済み</li>
        </ul>
      </div>
      <div style="margin-top: 15px;">
        <strong>確認方法:</strong>
        <div style="margin-top: 10px; padding: 10px; background: #f0f8ff; border-radius: 4px;">
          スプレッドシートの「レポート化」列を確認してください。<br>
          レポートが作成された行にはGoogleドキュメントのURLが書き込まれています。
        </div>
      </div>
      <div style="margin-top: 15px;">
        <button id="openSpreadsheetBtn" class="btn btn-primary">
          📊 スプレッドシートを開く
        </button>
      </div>
    `;
    
    showResult(resultBox, 'success', '成功', successHtml, '✅');
    
    // スプレッドシートを開くボタンのイベントリスナー
    setTimeout(() => {
      const openBtn = document.getElementById('openSpreadsheetBtn');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          window.open(sheetUrl, '_blank');
        });
      }
    }, 100);
    
    */
    
  } catch (error) {
    console.error('個別レポート生成エラー:', error);
    showResult(resultBox, 'error', 'エラー', `生成に失敗しました: ${error.message}`, '❌');
  } finally {
    btn.disabled = false;
  }
}

// 作成したドキュメントを削除する関数
async function deleteCreatedDocuments() {
  const sheetUrl = document.getElementById('sheetUrl').value.trim();
  
  if (!sheetUrl) {
    alert('スプレッドシートURLを入力してください');
    return;
  }
  
  // URLからスプレッドシートIDとGIDを抽出
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    alert('有効なスプレッドシートURLではありません');
    return;
  }
  
  const spreadsheetId = match[1];
  const gidMatch = sheetUrl.match(/[#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : null;
  
  const btn = document.getElementById('deleteCreatedDocsBtn');
  const resultBox = document.getElementById('sheetResult');
  
  if (!confirm('作成したドキュメントをすべて削除しますか？\nスプレッドシートのレポート化列もクリアされます。')) {
    return;
  }
  
  btn.disabled = true;
  showResult(resultBox, 'info', '処理中', 'ドキュメントを削除しています...', '⏳');
  
  try {
    // 削除処理を実行（完全削除モード）
    const result = await window.deleteCreatedDocuments(spreadsheetId, gid, true);
    
    if (result.message) {
      showResult(resultBox, 'info', '完了', result.message, 'ℹ️');
    } else {
      // 削除結果に応じて表示を変更
      const hasFailures = result.totalFailed > 0;
      const status = hasFailures ? 'warning' : 'success';
      const icon = hasFailures ? '⚠️' : '✅';
      const title = hasFailures ? '一部失敗' : '成功';
      
      let statusHtml = `<div>${icon} ドキュメント削除処理が完了しました</div>`;
      statusHtml += `
        <div style="margin-top: 15px;">
          <strong>処理結果:</strong>
          <ul style="margin-top: 10px; padding-left: 20px;">
            <li>削除成功: ${result.totalDeleted}件</li>
            <li>削除失敗: ${result.totalFailed}件</li>
          </ul>
        </div>
      `;
      
      if (hasFailures) {
        statusHtml += `
          <div style="margin-top: 10px; padding: 10px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px;">
            <strong>⚠️ 注意:</strong><br>
            一部のドキュメントの削除に失敗しました。<br>
            <br>
            <strong>原因:</strong> Google Drive APIが無効になっています。<br>
            <br>
            <strong>解決方法:</strong><br>
            1. <a href="https://console.developers.google.com/apis/api/drive.googleapis.com/overview" target="_blank">Google Cloud Consoleを開く</a><br>
            2. 「有効にする」ボタンをクリック<br>
            3. 数分待ってから再度削除を試す<br>
            <br>
            または、<a href="https://drive.google.com" target="_blank">Googleドライブ</a>から手動で削除してください。
          </div>
        `;
      } else {
        statusHtml += `
          <div style="margin-top: 10px;">
            <p>すべてのドキュメントが正常に削除されました。</p>
            <p>スプレッドシートのレポート化列もクリアされました。</p>
          </div>
        `;
      }
      
      showResult(resultBox, status, title, statusHtml, icon);
    }
    
    // 削除ボタンを非表示
    btn.style.display = 'none';
    
  } catch (error) {
    console.error('ドキュメント削除エラー:', error);
    showResult(resultBox, 'error', 'エラー', `削除に失敗しました: ${error.message}`, '❌');
  } finally {
    btn.disabled = false;
  }
}

// ドキュメントを削除する関数（個別）
async function deleteDocument(documentId) {
  if (!documentId) {
    alert('ドキュメントIDが見つかりません: ' + documentId);
    return;
  }
  
  try {
    const token = await globalThis.authService.getAuthToken();
    const url = `https://www.googleapis.com/drive/v3/files/${documentId}`;
    
    console.log('削除要求:', { documentId, url, token: token ? 'あり' : 'なし' });
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log('削除レスポンス:', { status: response.status, statusText: response.statusText });
    
    if (response.ok || response.status === 204) {
      alert('ドキュメントが削除されました');
      // 削除したIDをローカル・グローバル両方のリストから除外
      createdDocumentIds = createdDocumentIds.filter(id => id !== documentId);
      if (window.createdDocumentIds) {
        window.createdDocumentIds = window.createdDocumentIds.filter(id => id !== documentId);
      }
      console.log('ドキュメント削除完了:', documentId, 'グローバル配列:', window.createdDocumentIds);
      
      // 結果表示をクリア
      const resultBoxes = document.querySelectorAll('.result-box');
      resultBoxes.forEach(box => {
        box.style.display = 'none';
      });
    } else {
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error?.message || 'ドキュメントの削除に失敗しました');
      } else {
        if (response.status === 401) {
          throw new Error('認証エラー: 再度ログインしてください');
        } else if (response.status === 403) {
          throw new Error('アクセス権限がありません');
        } else if (response.status === 404) {
          throw new Error('ドキュメントが見つかりません（既に削除されている可能性があります）');
        } else {
          throw new Error(`削除に失敗しました (ステータス: ${response.status})`);
        }
      }
    }
  } catch (error) {
    console.error('ドキュメント削除エラー:', error);
    alert(`削除エラー: ${error.message}`);
  }
}

// すべてのテストドキュメントを削除する関数
async function deleteAllTestDocuments() {
  if (createdDocumentIds.length === 0) {
    alert('削除するドキュメントがありません');
    return;
  }
  
  if (!confirm(`${createdDocumentIds.length}個のテストドキュメントをすべて削除しますか？`)) {
    return;
  }
  
  let deletedCount = 0;
  let failedCount = 0;
  
  for (const docId of createdDocumentIds) {
    try {
      const token = await globalThis.authService.getAuthToken();
      const url = `https://www.googleapis.com/drive/v3/files/${docId}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok || response.status === 204) {
        deletedCount++;
      } else {
        failedCount++;
      }
    } catch (error) {
      console.error(`ドキュメント ${docId} の削除に失敗:`, error);
      failedCount++;
    }
  }
  
  createdDocumentIds = [];
  
  if (failedCount === 0) {
    alert(`${deletedCount}個のドキュメントを削除しました`);
  } else {
    alert(`${deletedCount}個のドキュメントを削除しました。${failedCount}個の削除に失敗しました。`);
  }
  
  // 結果表示をクリア
  const resultBoxes = document.querySelectorAll('.result-box');
  resultBoxes.forEach(box => {
    box.style.display = 'none';
  });
}


