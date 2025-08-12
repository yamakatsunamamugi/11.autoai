// report-manager.js - レポート機能の統合管理

import { ReportGenerator } from './report-generator.js';
import { ReportDeleter } from './report-deleter.js';

/**
 * レポート管理クラス
 * レポート生成と削除を統合管理
 */
export class ReportManager {
  constructor(options = {}) {
    // 共通オプション
    const commonOptions = {
      logger: options.logger || console,
      testMode: options.testMode || false,
      sheetsClient: options.sheetsClient || globalThis.sheetsClient,
      docsClient: options.docsClient || globalThis.docsClient,
      authService: options.authService || globalThis.authService
    };
    
    // 各コンポーネントを初期化
    this.generator = new ReportGenerator(commonOptions);
    this.deleter = new ReportDeleter(commonOptions);
    this.logger = commonOptions.logger;
    this.testMode = commonOptions.testMode;
  }

  /**
   * レポートを生成
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのGID
   * @returns {Promise<Object>} 生成結果
   */
  async generateReports(spreadsheetId, gid) {
    try {
      const results = await this.generator.generateReports(spreadsheetId, gid);
      
      // 成功/失敗の統計を計算
      const stats = this.calculateStats(results);
      
      return {
        success: true,
        results: results,
        stats: stats,
        documentIds: this.generator.createdDocumentIds
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

  /**
   * レポートを削除
   * @param {Array<string>|null} documentIds - 削除するドキュメントID（nullの場合は最後に生成したものを削除）
   * @param {Object} options - 削除オプション
   * @returns {Promise<Object>} 削除結果
   */
  async deleteReports(documentIds = null, options = {}) {
    // ドキュメントIDが指定されていない場合は、最後に生成したものを使用
    const targetIds = documentIds || this.generator.createdDocumentIds;
    
    if (!targetIds || targetIds.length === 0) {
      return {
        success: true,
        message: '削除するドキュメントがありません',
        totalDeleted: 0,
        totalFailed: 0
      };
    }
    
    try {
      const result = await this.deleter.deleteDocuments(targetIds, options);
      
      // 削除成功したら、生成器のIDリストをクリア
      if (result.totalDeleted > 0) {
        this.clearGeneratedIds();
      }
      
      return result;
      
    } catch (error) {
      this.log('error', 'レポート削除エラー', error);
      return {
        success: false,
        error: error.message,
        totalDeleted: 0,
        totalFailed: targetIds.length
      };
    }
  }

  /**
   * 特定の行のレポートを生成
   * @param {Object} params - 生成パラメータ
   * @returns {Promise<Object>} 生成結果
   */
  async generateReportForRow(params) {
    const {
      spreadsheetId,
      gid,
      rowNumber,
      promptText,
      answerText,
      reportColumn
    } = params;
    
    try {
      // ドキュメントを作成
      const docInfo = await this.generator.createReport({
        prompt: promptText,
        response: answerText,
        rowNumber: rowNumber
      });
      
      // スプレッドシートに書き込み
      await this.generator.sheetsClient.updateCell(
        spreadsheetId,
        `${reportColumn}${rowNumber}`,
        docInfo.url
      );
      
      // 生成したIDを記録
      this.generator.createdDocumentIds.push(docInfo.documentId || docInfo.id);
      
      return {
        success: true,
        documentId: docInfo.documentId || docInfo.id,
        url: docInfo.url,
        row: rowNumber
      };
      
    } catch (error) {
      this.log('error', `行${rowNumber}のレポート生成エラー`, error);
      return {
        success: false,
        error: error.message,
        row: rowNumber
      };
    }
  }

  /**
   * スプレッドシートのレポート化列をクリア
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのGID
   * @returns {Promise<Object>} クリア結果
   */
  async clearReportColumn(spreadsheetId, gid) {
    try {
      await this.deleter.clearSpreadsheetReports(spreadsheetId, gid);
      return {
        success: true,
        message: 'レポート化列をクリアしました'
      };
    } catch (error) {
      this.log('error', 'レポート化列のクリアエラー', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 生成したドキュメントIDのリストを取得
   * @returns {Array<string>} ドキュメントIDのリスト
   */
  getGeneratedDocumentIds() {
    return [...this.generator.createdDocumentIds];
  }

  /**
   * 生成したドキュメントIDをクリア
   */
  clearGeneratedIds() {
    this.generator.createdDocumentIds = [];
    if (typeof window !== 'undefined') {
      window.createdDocumentIds = [];
    }
  }

  /**
   * 統計情報を計算
   */
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

  /**
   * レポート生成と削除のフルサイクルテスト
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのGID
   * @returns {Promise<Object>} テスト結果
   */
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
      results.deletion = await this.deleteReports(null, {
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

  /**
   * ログ出力
   */
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

// デフォルトエクスポート
export default ReportManager;

// 名前付きエクスポート（個別に使用する場合）
export { ReportGenerator, ReportDeleter };