// test-report-direct.js - 直接レポート生成を行うテストスクリプト
// リファクタリング版：共通コアロジックを使用

// 作成したドキュメントのIDを記録
window.createdDocumentIds = window.createdDocumentIds || [];

// ReportManagerクラスの定義（インライン版）
class ReportManager {
  constructor(options = {}) {
    this.testMode = options.testMode || false;
    this.logger = options.logger || console;
    this.createdDocumentIds = [];
  }

  async generateReports(spreadsheetId, gid) {
    try {
      // 1. スプレッドシートからデータを取得
      const sheetsClient = globalThis.sheetsClient;
      const docsClient = globalThis.docsClient;
      
      if (!sheetsClient || !docsClient) {
        throw new Error('クライアントが初期化されていません');
      }
      
      const rawData = await sheetsClient.getSheetData(spreadsheetId, 'A1:Z100', gid);
      this.log('debug', `取得したデータ行数: ${rawData.length}`);
      
      // 2. 列情報を解析
      const columnInfo = this.analyzeColumns(rawData);
      
      // 3. 作業行を処理してレポートを生成
      const results = await this.processWorkRows(rawData, columnInfo, spreadsheetId);
      
      // 4. 統計を計算
      const stats = this.calculateStats(results);
      
      this.log('info', 'レポート生成完了', {
        total: results.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
      
      return {
        success: true,
        results: results,
        stats: stats,
        documentIds: this.createdDocumentIds
      };
      
    } catch (error) {
      this.log('error', 'レポート生成エラー', error);
      return {
        success: false,
        error: error.message,
        results: [],
        stats: { total: 0, success: 0, failed: 0 }
      };
    }
  }

  analyzeColumns(rawData) {
    const columnInfo = {};
    
    // メニュー行を探す
    let menuRowIndex = -1;
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      if (rawData[i] && rawData[i][0] === 'メニュー') {
        menuRowIndex = i;
        break;
      }
    }
    
    if (menuRowIndex === -1) {
      throw new Error('メニュー行が見つかりません');
    }
    
    const menuRow = rawData[menuRowIndex];
    this.log('debug', 'メニュー行を発見', { row: menuRowIndex + 1 });
    
    // 各列の役割を特定
    for (let i = 0; i < menuRow.length; i++) {
      const header = menuRow[i];
      const column = String.fromCharCode(65 + i);
      
      if (!header) continue;
      
      if (header === 'プロンプト' || (header.includes('プロンプト') && !header.includes('2'))) {
        columnInfo.promptColumn = column;
      } else if (header === '回答' || header.includes('回答')) {
        columnInfo.answerColumn = column;
      } else if (header === 'レポート化' || header.includes('レポート化')) {
        columnInfo.reportColumn = column;
      }
    }
    
    if (!columnInfo.reportColumn) {
      throw new Error('レポート化列が見つかりません');
    }
    
    this.log('debug', '列情報解析完了', columnInfo);
    return { ...columnInfo, menuRowIndex };
  }

  async processWorkRows(rawData, columnInfo, spreadsheetId) {
    const results = [];
    
    // メニュー行より後の行を処理
    for (let i = columnInfo.menuRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row[0]) continue;
      
      // A列が数字の場合は作業行
      if (!/^\d+$/.test(row[0].toString())) continue;
      
      const rowNumber = i + 1;
      this.log('debug', `行${rowNumber}を処理中`);
      
      // 回答列をチェック
      const answerIndex = columnInfo.answerColumn.charCodeAt(0) - 65;
      const answerText = row[answerIndex];
      
      if (!answerText || !answerText.trim()) {
        this.log('debug', `行${rowNumber}: 回答なし、スキップ`);
        continue;
      }
      
      // レポート化列をチェック
      const reportIndex = columnInfo.reportColumn.charCodeAt(0) - 65;
      if (row[reportIndex] && row[reportIndex].trim()) {
        this.log('debug', `行${rowNumber}: 既存レポートあり、スキップ`);
        continue;
      }
      
      // プロンプトを取得
      const promptIndex = columnInfo.promptColumn ? 
        columnInfo.promptColumn.charCodeAt(0) - 65 : 3;
      const promptText = row[promptIndex] || 'プロンプトなし';
      
      try {
        // レポート生成
        const docInfo = await globalThis.docsClient.createDocumentFromTaskResult({
          prompt: promptText,
          response: answerText,
          rowNumber: rowNumber
        });
        
        this.createdDocumentIds.push(docInfo.documentId || docInfo.id);
        
        // スプレッドシートに書き込み
        await globalThis.sheetsClient.updateCell(
          spreadsheetId,
          `${columnInfo.reportColumn}${rowNumber}`,
          docInfo.url
        );
        
        results.push({
          row: rowNumber,
          documentId: docInfo.documentId || docInfo.id,
          url: docInfo.url,
          success: true
        });
        
        this.log('info', `レポート作成成功: 行${rowNumber}`);
        
      } catch (error) {
        this.log('error', `レポート作成失敗: 行${rowNumber}`, error);
        results.push({
          row: rowNumber,
          error: error.message,
          success: false
        });
      }
    }
    
    // 作成したドキュメントIDを記録（削除用）
    if (typeof window !== 'undefined') {
      window.createdDocumentIds = this.createdDocumentIds;
    }
    
    return results;
  }

  async deleteReports(documentIds = null, options = {}) {
    const { 
      permanentDelete = true,
      clearSpreadsheet = false,
      spreadsheetId = null,
      gid = null
    } = options;

    const targetIds = documentIds || this.createdDocumentIds;
    
    if (!targetIds || targetIds.length === 0) {
      return {
        success: true,
        message: '削除するドキュメントがありません',
        totalDeleted: 0,
        totalFailed: 0
      };
    }

    this.log('info', `${targetIds.length}個のドキュメントを削除します`);
    
    const results = [];
    const token = await globalThis.authService.getAuthToken();
    
    // 各ドキュメントを削除
    for (const docId of targetIds) {
      const result = await this.deleteDocument(docId, token, permanentDelete);
      results.push(result);
    }
    
    // スプレッドシートのレポート化列をクリア（オプション）
    if (clearSpreadsheet && spreadsheetId) {
      await this.clearSpreadsheetReports(spreadsheetId, gid);
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    this.log('info', `削除完了: 成功${successCount}個、失敗${failCount}個`);
    
    return {
      success: true,
      totalDeleted: successCount,
      totalFailed: failCount,
      results: results
    };
  }

  async deleteDocument(docId, token, permanentDelete) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${docId}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok || response.status === 204) {
        this.log('debug', `ドキュメント ${docId} を削除しました`);
        return { 
          id: docId, 
          success: true, 
          method: 'deleted' 
        };
      }
      
      // エラーの詳細を取得
      let errorMessage = `Status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
        
        if (response.status === 403) {
          if (errorMessage.includes('Google Drive API has not been used')) {
            errorMessage = 'Google Drive APIが無効です。有効にしてください。';
          }
        } else if (response.status === 404) {
          errorMessage += ' (ドキュメントが見つかりません)';
        }
      } catch (e) {
        // JSONパースエラーは無視
      }
      
      return { 
        id: docId, 
        success: false, 
        error: errorMessage 
      };
      
    } catch (error) {
      this.log('error', `ドキュメント削除エラー: ${docId}`, error);
      return { 
        id: docId, 
        success: false, 
        error: error.message 
      };
    }
  }

  async clearSpreadsheetReports(spreadsheetId, gid) {
    this.log('info', 'スプレッドシートのレポート化列をクリアします');
    
    const rawData = await globalThis.sheetsClient.getSheetData(
      spreadsheetId, 
      'A1:Z100', 
      gid
    );
    
    // レポート化列を特定
    const reportColumn = this.findReportColumn(rawData);
    if (!reportColumn) {
      this.log('warn', 'レポート化列が見つかりません');
      return;
    }
    
    // 作業行のレポート化列をクリア
    let clearedCount = 0;
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row[0]) continue;
      
      // A列が数字の場合は作業行
      if (!/^\d+$/.test(row[0].toString())) continue;
      
      const rowNumber = i + 1;
      const reportIndex = reportColumn.charCodeAt(0) - 65;
      
      if (row[reportIndex] && row[reportIndex].trim()) {
        try {
          await globalThis.sheetsClient.updateCell(
            spreadsheetId,
            `${reportColumn}${rowNumber}`,
            ''
          );
          this.log('debug', `${reportColumn}${rowNumber}をクリア`);
          clearedCount++;
        } catch (error) {
          this.log('error', `${reportColumn}${rowNumber}のクリアに失敗`, error);
        }
      }
    }
    
    this.log('info', `${clearedCount}個のセルをクリアしました`);
  }

  findReportColumn(rawData) {
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      if (rawData[i] && rawData[i][0] === 'メニュー') {
        const menuRow = rawData[i];
        for (let j = 0; j < menuRow.length; j++) {
          const header = menuRow[j];
          if (header && (header === 'レポート化' || header.includes('レポート化'))) {
            return String.fromCharCode(65 + j);
          }
        }
        break;
      }
    }
    return null;
  }

  calculateStats(results) {
    const total = results.length;
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    return {
      total,
      success,
      failed,
      successRate: total > 0 ? (success / total * 100).toFixed(1) : 0
    };
  }

  async testFullCycle(spreadsheetId, gid) {
    this.log('info', 'フルサイクルテスト開始');
    
    const results = {
      generation: null,
      deletion: null
    };
    
    // 1. レポート生成
    results.generation = await this.generateReports(spreadsheetId, gid);
    
    if (!results.generation.success) {
      this.log('error', 'レポート生成に失敗しました');
      return results;
    }
    
    this.log('info', `${results.generation.stats.success}個のレポートを生成しました`);
    
    // 2. 生成したレポートを削除
    if (results.generation.documentIds.length > 0) {
      results.deletion = await this.deleteReports(results.generation.documentIds, {
        permanentDelete: true,
        clearSpreadsheet: true,
        spreadsheetId: spreadsheetId,
        gid: gid
      });
      
      if (results.deletion.success) {
        this.log('info', `${results.deletion.totalDeleted}個のレポートを削除しました`);
      }
    }
    
    return results;
  }

  log(level, message, data) {
    if (this.testMode) {
      this.logger[level === 'error' ? 'error' : 'log'](
        `[ReportManager] ${message}`,
        data || ''
      );
    } else if (level === 'error' || level === 'info') {
      this.logger[level === 'error' ? 'error' : 'log'](
        `[ReportManager] ${message}`
      );
    }
  }
}

// レポートマネージャーのインスタンス（テストモード）
const reportManager = new ReportManager({
  testMode: true,
  logger: console
});

/**
 * スプレッドシートから直接レポートを生成
 * （リファクタリング版：ReportManagerを使用）
 */
async function generateReportDirect(spreadsheetId, gid) {
  try {
    // ReportManagerを使用してレポート生成
    const result = await reportManager.generateReports(spreadsheetId, gid);
    
    if (result.success) {
      console.log('レポート生成完了:');
      console.log(`  成功: ${result.stats.success}個`);
      console.log(`  失敗: ${result.stats.failed}個`);
      console.log(`  合計: ${result.stats.total}個`);
      console.log(`  成功率: ${result.stats.successRate}%`);
      
      // ウィンドウのグローバル変数にIDを保存（互換性のため）
      window.createdDocumentIds = result.documentIds;
    } else {
      console.error('レポート生成エラー:', result.error);
    }
    
    return result.results;
    
  } catch (error) {
    console.error('レポート生成エラー:', error);
    throw error;
  }
}

/**
 * 作成したドキュメントを削除
 * （リファクタリング版：ReportManagerを使用）
 * @param {boolean} permanentDelete - true の場合、ゴミ箱を経由せずに完全削除
 */
async function deleteCreatedDocuments(spreadsheetId, gid, permanentDelete = true) {
  try {
    // ReportManagerを使用してドキュメント削除
    const result = await reportManager.deleteReports(
      window.createdDocumentIds || reportManager.getGeneratedDocumentIds(),
      {
        permanentDelete: permanentDelete,
        clearSpreadsheet: true,
        spreadsheetId: spreadsheetId,
        gid: gid
      }
    );
    
    if (result.success) {
      console.log('削除完了:');
      console.log(`  成功: ${result.totalDeleted}個`);
      console.log(`  失敗: ${result.totalFailed}個`);
      
      // ウィンドウのグローバル変数もクリア
      window.createdDocumentIds = [];
    } else {
      console.error('削除エラー:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('削除エラー:', error);
    throw error;
  }
}

/**
 * レポート機能のフルサイクルテスト
 * （生成と削除を連続実行）
 */
async function testReportFullCycle(spreadsheetId, gid) {
  console.log('=== レポート機能フルサイクルテスト開始 ===');
  
  try {
    const result = await reportManager.testFullCycle(spreadsheetId, gid);
    
    console.log('\n=== テスト結果 ===');
    if (result.generation) {
      console.log('生成フェーズ:');
      console.log(`  成功: ${result.generation.stats?.success || 0}個`);
      console.log(`  失敗: ${result.generation.stats?.failed || 0}個`);
    }
    
    if (result.deletion) {
      console.log('削除フェーズ:');
      console.log(`  削除成功: ${result.deletion.totalDeleted}個`);
      console.log(`  削除失敗: ${result.deletion.totalFailed}個`);
    }
    
    return result;
    
  } catch (error) {
    console.error('フルサイクルテストエラー:', error);
    throw error;
  }
}

// グローバルに公開
window.generateReportDirect = generateReportDirect;
window.deleteCreatedDocuments = deleteCreatedDocuments;
window.testReportFullCycle = testReportFullCycle;
window.reportManager = reportManager;