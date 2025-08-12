// report-generator.js - レポート生成のコアロジック

/**
 * レポート生成クラス
 * 本番・テスト共通のコアロジック
 */
export class ReportGenerator {
  constructor(options = {}) {
    this.sheetsClient = options.sheetsClient || globalThis.sheetsClient;
    this.docsClient = options.docsClient || globalThis.docsClient;
    this.logger = options.logger || console;
    this.testMode = options.testMode || false;
    this.createdDocumentIds = [];
  }

  /**
   * スプレッドシートからレポートを生成
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのGID
   * @returns {Promise<Object>} 生成結果
   */
  async generateReports(spreadsheetId, gid) {
    this.log('info', 'レポート生成開始', { spreadsheetId, gid });
    
    // 1. データ取得
    const sheetData = await this.fetchSheetData(spreadsheetId, gid);
    
    // 2. 列情報を解析
    const columnInfo = this.analyzeColumns(sheetData);
    
    // 3. 作業行を処理
    const results = await this.processWorkRows(
      sheetData, 
      columnInfo, 
      spreadsheetId
    );
    
    this.log('info', 'レポート生成完了', {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
    
    return results;
  }

  /**
   * スプレッドシートデータを取得
   */
  async fetchSheetData(spreadsheetId, gid) {
    const rawData = await this.sheetsClient.getSheetData(
      spreadsheetId, 
      'A1:Z100', 
      gid
    );
    
    this.log('debug', `データ取得完了: ${rawData.length}行`);
    return rawData;
  }

  /**
   * 列情報を解析
   */
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
      // 他のAI列も同様に処理
    }
    
    if (!columnInfo.reportColumn) {
      throw new Error('レポート化列が見つかりません');
    }
    
    this.log('debug', '列情報解析完了', columnInfo);
    return { ...columnInfo, menuRowIndex };
  }

  /**
   * 作業行を処理してレポートを生成
   */
  async processWorkRows(rawData, columnInfo, spreadsheetId) {
    const results = [];
    
    // 処理対象の作業行を取得
    const workRows = this.findWorkRows(rawData, columnInfo.menuRowIndex);
    
    for (const workRow of workRows) {
      const result = await this.processWorkRow(
        workRow,
        columnInfo,
        spreadsheetId,
        rawData
      );
      
      if (result) {
        results.push(result);
        if (result.documentId) {
          this.createdDocumentIds.push(result.documentId);
        }
      }
    }
    
    // 作成したドキュメントIDを記録（削除用）
    if (typeof window !== 'undefined') {
      window.createdDocumentIds = this.createdDocumentIds;
    }
    
    return results;
  }
  
  /**
   * 作業行を検索
   */
  findWorkRows(rawData, menuRowIndex) {
    const workRows = [];
    
    for (let i = menuRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row[0]) continue;
      
      // A列が数字の場合は作業行
      if (/^\d+$/.test(row[0].toString())) {
        workRows.push({ 
          index: i, 
          rowNumber: i + 1, 
          data: row 
        });
      }
    }
    
    return workRows;
  }
  
  /**
   * 単一の作業行を処理
   */
  async processWorkRow(workRow, columnInfo, spreadsheetId, rawData) {
    const { rowNumber, data: row } = workRow;
    this.log('debug', `行${rowNumber}を処理中`);
    
    // 回答テキストを取得
    const answerText = this.getCellValue(row, columnInfo.answerColumn);
    if (!answerText || !answerText.trim()) {
      this.log('debug', `行${rowNumber}: 回答なし、スキップ`);
      return null;
    }
    
    // 既存レポートをチェック
    const existingReport = this.getCellValue(row, columnInfo.reportColumn);
    if (existingReport && existingReport.trim()) {
      this.log('debug', `行${rowNumber}: 既存レポートあり、スキップ`);
      return null;
    }
    
    // プロンプトを取得
    const promptText = this.getCellValue(row, columnInfo.promptColumn) || 'プロンプトなし';
    
    try {
      // レポート生成
      const docInfo = await this.createReport({
        prompt: promptText,
        response: answerText,
        rowNumber: rowNumber
      });
      
      // スプレッドシートに書き込み
      await this.sheetsClient.updateCell(
        spreadsheetId,
        `${columnInfo.reportColumn}${rowNumber}`,
        docInfo.url
      );
      
      this.log('info', `レポート作成成功: 行${rowNumber}`);
      
      return {
        row: rowNumber,
        documentId: docInfo.documentId || docInfo.id,
        url: docInfo.url,
        success: true
      };
      
    } catch (error) {
      this.log('error', `レポート作成失敗: 行${rowNumber}`, error);
      return {
        row: rowNumber,
        error: error.message,
        success: false
      };
    }
  }
  
  /**
   * セル値を取得
   */
  getCellValue(row, column) {
    if (!column) return null;
    const columnIndex = column.charCodeAt(0) - 65;
    return row[columnIndex] || null;
  }

  /**
   * レポートドキュメントを作成
   */
  async createReport(taskResult) {
    return await this.docsClient.createDocumentFromTaskResult(taskResult);
  }

  /**
   * ログ出力（テストモードで制御可能）
   */
  log(level, message, data) {
    if (this.testMode) {
      // テストモードでは詳細ログ
      this.logger[level === 'error' ? 'error' : 'log'](
        `[ReportGenerator] ${message}`,
        data || ''
      );
    } else if (level === 'error' || level === 'info') {
      // 本番では重要なログのみ
      this.logger[level === 'error' ? 'error' : 'log'](
        `[ReportGenerator] ${message}`
      );
    }
  }
}

export default ReportGenerator;