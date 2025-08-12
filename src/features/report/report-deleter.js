// report-deleter.js - レポート削除のコアロジック

/**
 * レポート削除クラス
 * 本番・テスト共通のコアロジック
 */
export class ReportDeleter {
  constructor(options = {}) {
    this.authService = options.authService || globalThis.authService;
    this.sheetsClient = options.sheetsClient || globalThis.sheetsClient;
    this.logger = options.logger || console;
    this.testMode = options.testMode || false;
  }

  /**
   * ドキュメントを削除
   * @param {Array<string>} documentIds - 削除するドキュメントIDの配列
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 削除結果
   */
  async deleteDocuments(documentIds, options = {}) {
    const { 
      permanentDelete = true,
      clearSpreadsheet = false,
      spreadsheetId = null,
      gid = null
    } = options;

    if (!documentIds || documentIds.length === 0) {
      this.log('info', '削除するドキュメントがありません');
      return { 
        success: true, 
        message: '削除するドキュメントがありません',
        totalDeleted: 0,
        totalFailed: 0,
        results: []
      };
    }

    this.log('info', `${documentIds.length}個のドキュメントを削除します`);
    
    const results = [];
    const token = await this.authService.getAuthToken();
    
    // 各ドキュメントを削除
    for (const docId of documentIds) {
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

  /**
   * 単一のドキュメントを削除
   */
  async deleteDocument(docId, token, permanentDelete) {
    try {
      // permanentDelete が false の場合はゴミ箱に移動
      if (!permanentDelete) {
        const trashedResult = await this.trashDocument(docId, token);
        if (trashedResult.success) {
          return trashedResult;
        }
        // ゴミ箱移動に失敗した場合は完全削除を試みる
        this.log('warn', `ゴミ箱移動失敗、完全削除を試みます: ${docId}`);
      }
      
      // 完全削除を実行
      return await this.permanentDeleteDocument(docId, token);
      
    } catch (error) {
      this.log('error', `ドキュメント削除エラー: ${docId}`, error);
      return { 
        id: docId, 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * ドキュメントをゴミ箱に移動
   */
  async trashDocument(docId, token) {
    const url = `https://www.googleapis.com/drive/v3/files/${docId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.trashed === true) {
        this.log('debug', `ドキュメント ${docId} をゴミ箱に移動しました`);
        return { 
          id: docId, 
          success: true, 
          method: 'trashed' 
        };
      }
    }
    
    return { 
      id: docId, 
      success: false, 
      error: 'ゴミ箱移動に失敗' 
    };
  }

  /**
   * ドキュメントを完全削除
   */
  async permanentDeleteDocument(docId, token) {
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
      errorMessage = this.formatErrorMessage(
        errorData.error?.message || errorMessage, 
        response.status
      );
    } catch (e) {
      // JSONパースエラーは無視
    }
    
    return { 
      id: docId, 
      success: false, 
      error: errorMessage 
    };
  }

  /**
   * エラーメッセージをフォーマット
   */
  formatErrorMessage(message, status) {
    if (status === 403) {
      if (message.includes('Google Drive API has not been used')) {
        return 'Google Drive APIが無効です。有効にしてください。';
      }
      return `${message} (アクセス権限なし)`;
    }
    
    if (status === 404) {
      return `${message} (ドキュメントが見つかりません)`;
    }
    
    return message;
  }

  /**
   * スプレッドシートのレポート化列をクリア
   */
  async clearSpreadsheetReports(spreadsheetId, gid) {
    this.log('info', 'スプレッドシートのレポート化列をクリアします');
    
    const rawData = await this.sheetsClient.getSheetData(
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
    const clearedCells = await this.clearReportCells(
      rawData, 
      reportColumn, 
      spreadsheetId
    );
    
    this.log('info', `${clearedCells}個のセルをクリアしました`);
  }

  /**
   * レポート化列を検索
   */
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

  /**
   * レポートセルをクリア
   */
  async clearReportCells(rawData, reportColumn, spreadsheetId) {
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
          await this.sheetsClient.updateCell(
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
    
    return clearedCount;
  }

  /**
   * ログ出力
   */
  log(level, message, data) {
    if (this.testMode) {
      // テストモードでは詳細ログ
      this.logger[level === 'error' ? 'error' : 'log'](
        `[ReportDeleter] ${message}`,
        data || ''
      );
    } else if (level === 'error' || level === 'info') {
      // 本番では重要なログのみ
      this.logger[level === 'error' ? 'error' : 'log'](
        `[ReportDeleter] ${message}`
      );
    }
  }
}

export default ReportDeleter;