// test-report-direct.js - レポート機能の互換性レイヤー
// 本体のReportManagerを使用しつつ、既存のテストコードとの互換性を保つ

// 作成したドキュメントのIDを記録
window.createdDocumentIds = window.createdDocumentIds || [];

// 互換性のためのラッパー関数
// 本体のReportManagerはtest-report-module.jsで初期化される

// 既存のテストコードとの互換性を保つための関数
window.directGenerateReport = async function(spreadsheetId, gid) {
  // TestReportModuleが利用可能になるまで待機
  if (!window.TestReportModule) {
    console.log('[互換レイヤー] TestReportModuleの読み込みを待機中...');
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (window.TestReportModule) {
          clearInterval(checkInterval);
          resolve(window.TestReportModule.generateReportsFromSheet(spreadsheetId, gid));
        }
      }, 100);
    });
  }
  
  return window.TestReportModule.generateReportsFromSheet(spreadsheetId, gid);
};

// 削除関数の互換性ラッパー
window.directDeleteDocuments = async function(documentIds) {
  if (!window.TestReportModule) {
    console.error('[互換レイヤー] TestReportModuleが初期化されていません');
    return { success: false, error: 'Module not initialized' };
  }
  
  return window.TestReportModule.deleteCreatedDocuments(documentIds);
};

// テスト用の仮データ生成（互換性のため）
window.generateTestData = function() {
  if (window.TestReportModule && window.TestReportModule.generateMockSheetData) {
    return window.TestReportModule.generateMockSheetData();
  }
  
  // フォールバック用のデータ
  return [
    ['メニュー', '', '', '', '', '', '', ''],
    ['プロンプト', '回答', 'レポート化', '', '', '', '', ''],
    ['1', 'テスト質問1', 'テスト回答1', '', '', '', '', ''],
    ['2', 'テスト質問2', 'テスト回答2', '', '', '', '', '']
  ];
};

console.log('[互換レイヤー] test-report-direct.js 読み込み完了（本体のReportManagerを使用）');