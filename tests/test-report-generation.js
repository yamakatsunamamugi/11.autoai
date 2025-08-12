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
  
  // 本番システムでレポート化実行
  document.getElementById('executeRealReportBtn').addEventListener('click', executeRealReportGeneration);
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
    
    // ドキュメントIDを保存
    const documentId = docInfo.documentId || docInfo.id;
    if (documentId) {
      createdDocumentIds.push(documentId);
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
      if (deleteBtn && docInfo.id) {
        deleteBtn.addEventListener('click', async () => {
          if (confirm('このテストドキュメントを削除しますか？')) {
            await deleteDocument(docInfo.id);
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

// 回答のみを含むドキュメントを作成する関数
async function createAnswerOnlyDocument(rowNumber, answerText) {
  if (!globalThis.docsClient) {
    throw new Error('DocsClientが初期化されていません');
  }
  
  // タイトルを設定
  const title = `行${rowNumber}の回答 - ${new Date().toLocaleDateString('ja-JP')}`;
  
  // ドキュメントを作成
  const doc = await globalThis.docsClient.createDocument(title);
  
  // 回答テキストのみを挿入
  if (answerText && answerText.trim()) {
    await globalThis.docsClient.insertText(doc.documentId, answerText.trim());
  }
  
  return {
    documentId: doc.documentId,
    title: doc.title,
    url: doc.url
  };
}

// スプレッドシートにレポートURLを書き込む関数（本番と同じ動作）
async function writeReportUrlToSpreadsheet(workRow, docUrl) {
  // 実際のスプレッドシートURLが指定されている場合のみ書き込み
  const sheetUrl = document.getElementById('sheetUrl').value.trim();
  
  if (!sheetUrl || !globalThis.sheetsClient) {
    console.log('仮データまたはSheetsClientなしのためスプレッドシート書き込みをスキップ');
    return;
  }

  try {
    // URLからスプレッドシートIDを抽出
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      console.log('無効なスプレッドシートURL');
      return;
    }
    
    const spreadsheetId = match[1];
    
    // レポート化列を探す（メニュー行から）
    let reportColumnIndex = -1;
    if (sheetData[0]) {
      for (let i = 0; i < sheetData[0].length; i++) {
        if (sheetData[0][i] === 'レポート化') {
          reportColumnIndex = i;
          break;
        }
      }
    }
    
    if (reportColumnIndex === -1) {
      console.log('レポート化列が見つかりません');
      return;
    }
    
    // セル範囲を計算（例：M7 = レポート化列の作業行）
    const columnLetter = String.fromCharCode(65 + reportColumnIndex); // A,B,C...
    const range = `${columnLetter}${workRow.rowIndex}`; // 実際のシート行番号
    
    // スプレッドシートにURLを書き込み
    await globalThis.sheetsClient.updateCell(spreadsheetId, range, docUrl);
    
    console.log(`レポートURL書き込み完了: ${range} = ${docUrl}`);
    
  } catch (error) {
    console.error('スプレッドシート書き込みエラー:', error);
    // エラーが発生してもドキュメント作成は継続
  }
}

// 各作業行から個別にドキュメントを作成する関数
async function generateIndividualReports() {
  if (!sheetData || sheetData.length === 0) {
    alert('先にスプレッドシートからデータを取得してください');
    return;
  }
  
  const btn = document.getElementById('generateIndividualReportsBtn');
  const resultBox = document.getElementById('sheetResult');
  
  btn.disabled = true;
  showResult(resultBox, 'info', '処理中', '各作業行からドキュメントを作成しています...', '⏳');
  
  try {
    const workRows = [];
    
    // メニュー行を見つけて回答列のインデックスを特定
    let answerColumnIndex = -1;
    if (sheetData[0]) {
      for (let i = 0; i < sheetData[0].length; i++) {
        if (sheetData[0][i] === '回答') {
          answerColumnIndex = i;
          break;
        }
      }
    }
    
    if (answerColumnIndex === -1) {
      throw new Error('回答列が見つかりません');
    }
    
    // 作業行（A列が数字）を抽出
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (row[0] && /^\d+$/.test(row[0])) {
        const answerText = row[answerColumnIndex] || '';
        const promptText = row[3] || ''; // プロンプト列（D列）
        
        if (answerText.trim()) {
          workRows.push({
            rowNumber: row[0],
            prompt: promptText,
            answer: answerText,
            rowIndex: i + 1 // 実際の行番号（1ベース）
          });
        }
      }
    }
    
    if (workRows.length === 0) {
      throw new Error('回答が入力された作業行が見つかりません');
    }
    
    const createdDocs = [];
    
    // 各作業行の回答からドキュメントを作成
    for (const workRow of workRows) {
      const taskResult = {
        prompt: `行${workRow.rowNumber}の回答`, // シンプルなタイトル
        response: workRow.answer, // 回答のみ
        aiType: "スプレッドシート行" + workRow.rowNumber,
        rowNumber: workRow.rowNumber,
        columnIndex: String.fromCharCode(65 + answerColumnIndex) // A,B,C...
      };
      
      // 回答のみのドキュメントを作成
      const docInfo = await createAnswerOnlyDocument(workRow.rowNumber, workRow.answer);
      
      // 本番同様にスプレッドシートにURLを書き込み（実際のスプレッドシートの場合のみ）
      // await writeReportUrlToSpreadsheet(workRow, docInfo.url); // 一旦コメントアウト
      
      // デバッグ情報を出力
      console.log('作成されたドキュメント情報:', docInfo);
      
      // ドキュメントIDを保存
      const documentId = docInfo.documentId || docInfo.id;
      if (documentId) {
        createdDocumentIds.push(documentId);
        console.log('ドキュメントIDを保存:', documentId);
        console.log('現在のcreatedDocumentIds:', createdDocumentIds);
      } else {
        console.error('ドキュメントIDが見つかりません:', docInfo);
      }
      
      createdDocs.push({
        rowNumber: workRow.rowNumber,
        prompt: workRow.prompt.length > 50 ? workRow.prompt.substring(0, 50) + '...' : workRow.prompt,
        url: docInfo.url,
        id: documentId
      });
    }
    
    const successHtml = `
      <div>✅ ${createdDocs.length}個のドキュメントが正常に作成されました</div>
      <div style="margin-top: 15px;">
        <strong>作成されたドキュメント:</strong>
        <div style="margin-top: 10px;">
          ${createdDocs.map((doc, index) => `
            <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 10px; background: #f9f9f9;">
              <div style="font-weight: bold; margin-bottom: 5px;">行${doc.rowNumber}: ${doc.prompt}</div>
              <div style="margin-bottom: 8px;">
                <a href="${doc.url}" target="_blank" style="color: #667eea; text-decoration: none; font-size: 12px;">
                  📄 ${doc.url}
                </a>
              </div>
              <div>
                <button class="btn btn-secondary open-doc-btn" data-url="${doc.url}" style="font-size: 11px; padding: 4px 8px; margin-right: 5px;">
                  開く
                </button>
                <button class="btn btn-secondary delete-doc-btn" data-id="${doc.id}" style="font-size: 11px; padding: 4px 8px; background: #ffebee; color: #c62828;">
                  🗑️ 削除
                </button>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top: 15px;">
          <button id="deleteAllDocsBtn" class="btn btn-secondary" style="background: #ffebee; color: #c62828;">
            🗑️ すべて削除
          </button>
        </div>
      </div>
    `;
    
    showResult(resultBox, 'success', '成功', successHtml, '✅');
    
    // イベントリスナーを設定
    setTimeout(() => {
      // 個別の開くボタン
      document.querySelectorAll('.open-doc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const url = e.target.getAttribute('data-url');
          window.open(url, '_blank');
        });
      });
      
      // 個別の削除ボタン
      document.querySelectorAll('.delete-doc-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const docId = e.target.getAttribute('data-id');
          console.log('削除ボタンクリック - docId:', docId);
          console.log('削除ボタンクリック - createdDocumentIds:', createdDocumentIds);
          
          if (docId && confirm('このドキュメントを削除しますか？')) {
            await deleteDocument(docId);
          } else if (!docId) {
            alert('ドキュメントIDが取得できませんでした');
          }
        });
      });
      
      // すべて削除ボタン
      const deleteAllBtn = document.getElementById('deleteAllDocsBtn');
      if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', async () => {
          await deleteAllTestDocuments();
        });
      }
    }, 100);
    
  } catch (error) {
    console.error('個別レポート生成エラー:', error);
    showResult(resultBox, 'error', 'エラー', `生成に失敗しました: ${error.message}`, '❌');
  } finally {
    btn.disabled = false;
  }
}

// ドキュメントを削除する関数
async function deleteDocument(documentId) {
  if (!documentId) {
    alert('ドキュメントIDが見つかりません: ' + documentId);
    return;
  }
  
  try {
    // まず既存のトークンをクリア（新しい権限で再取得するため）
    if (chrome && chrome.identity) {
      chrome.identity.clearAllCachedAuthTokens(() => {
        console.log('認証トークンをクリアしました');
      });
    }
    
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
      // 削除したIDをリストから除外
      createdDocumentIds = createdDocumentIds.filter(id => id !== documentId);
      
      // 結果表示をクリア
      const resultBoxes = document.querySelectorAll('.result-box');
      resultBoxes.forEach(box => {
        box.style.display = 'none';
      });
    } else {
      // レスポンスのコンテンツタイプを確認
      const contentType = response.headers.get('content-type');
      console.log('エラーレスポンス content-type:', contentType);
      
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error?.message || 'ドキュメントの削除に失敗しました');
      } else {
        // HTMLレスポンスの場合（認証エラーの可能性）
        const errorText = await response.text();
        console.log('エラーレスポンス（HTML）:', errorText.substring(0, 200));
        
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
    
    if (error.message.includes('認証')) {
      alert(`${error.message}\n\n拡張機能の認証を確認してください。`);
    } else {
      alert(`削除エラー: ${error.message}`);
    }
  }
}

// すべてのテストドキュメントを削除する関数
async function deleteAllTestDocuments() {
  console.log('すべて削除 - createdDocumentIds:', createdDocumentIds);
  
  if (createdDocumentIds.length === 0) {
    alert('削除するドキュメントがありません\\n\\nデバッグ情報: ' + JSON.stringify(createdDocumentIds));
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

// グローバルに公開（デバッグ用）
window.testReportGeneration = {
  sheetData,
  createDocument,
  fetchSheetData,
  generateReportFromSheet,
  deleteDocument,
  deleteAllTestDocuments,
  createdDocumentIds
};