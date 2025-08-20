// test-report-module.js - レポート機能テスト用モジュールラッパー
// 本体のReportManagerを使用してテストを実行

import { ReportManager } from '../src/features/report/report-manager.js';

// グローバル変数
let sheetData = null;
let reportManager = null;

// ReportManagerを初期化
function initializeReportManager() {
  reportManager = new ReportManager({
    testMode: true,
    logger: console,
    sheetsClient: globalThis.sheetsClient,
    docsClient: globalThis.docsClient,
    authService: globalThis.authService
  });
  
  // グローバルに公開（テスト用）
  window.reportManager = reportManager;
  
  console.log('[Test] ReportManager初期化完了（本体のクラスを使用）');
  return reportManager;
}

// スプレッドシートからレポートを生成（本体の機能をラップ）
async function generateReportsFromSheet(spreadsheetId, gid) {
  if (!reportManager) {
    initializeReportManager();
  }
  
  try {
    console.log('[Test] レポート生成開始（本体のReportManager使用）');
    const result = await reportManager.generateReports(spreadsheetId, gid);
    
    if (result.success) {
      console.log(`[Test] レポート生成成功: ${result.stats.success}/${result.stats.total}件`);
    } else {
      console.error('[Test] レポート生成失敗:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('[Test] レポート生成エラー:', error);
    throw error;
  }
}

// 作成したドキュメントを削除
async function deleteCreatedDocuments(documentIds) {
  if (!reportManager) {
    initializeReportManager();
  }
  
  try {
    const result = await reportManager.deleteReports(documentIds);
    console.log(`[Test] ドキュメント削除完了: ${result.totalDeleted}件削除`);
    return result;
  } catch (error) {
    console.error('[Test] ドキュメント削除エラー:', error);
    throw error;
  }
}

// 単一のレポートを生成
async function generateSingleReport(params) {
  if (!reportManager) {
    initializeReportManager();
  }
  
  try {
    const result = await reportManager.generateReportForRow(params);
    if (result.success) {
      console.log(`[Test] 単一レポート生成成功: ${result.url}`);
    }
    return result;
  } catch (error) {
    console.error('[Test] 単一レポート生成エラー:', error);
    throw error;
  }
}

// テスト用の仮データ生成
function generateMockSheetData() {
  return [
    ['メニュー', '', '', '', '', '', '', ''],
    ['プロンプト', '回答', 'レポート化', '', '', '', '', ''],
    ['1', 'AIの活用方法を教えてください', 'AIは様々な分野で活用されています...', '', '', '', '', ''],
    ['2', '機械学習とは何ですか？', '機械学習はコンピュータがデータから学習する技術です...', '', '', '', '', ''],
    ['3', 'ChatGPTの特徴は？', 'ChatGPTは対話型のAIアシスタントです...', '', '', '', '', '']
  ];
}

// エクスポート
export {
  initializeReportManager,
  generateReportsFromSheet,
  deleteCreatedDocuments,
  generateSingleReport,
  generateMockSheetData
};

// グローバルに公開（非モジュール環境でも使用可能にする）
window.TestReportModule = {
  initializeReportManager,
  generateReportsFromSheet,
  deleteCreatedDocuments,
  generateSingleReport,
  generateMockSheetData
};