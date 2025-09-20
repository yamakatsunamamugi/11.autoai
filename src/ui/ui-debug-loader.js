/**
 * @fileoverview UI Debug Loader - スクリプト読み込み検証とエラーハンドリング
 * CSPポリシーに準拠するため、インラインスクリプトから外部化
 */

console.log('🔍 [DEBUG] スクリプト読み込み開始', {
  timestamp: new Date().toISOString(),
  documentEncoding: document.characterSet,
  documentReadyState: document.readyState
});

// 各スクリプトの読み込み状態を監視
window.scriptLoadStatus = {
  'step1-setup.js': false,
  'step2-taskgroup.js': false,
  'step3-tasklist.js': false,
  'step4-execute.js': false,
  'step5-loop.js': false,
  'step6-nextgroup.js': false,
  'ui-controller.js': false
};

// エラーハンドラーを設定
window.addEventListener('error', function(event) {
  console.error('❌ [DEBUG] グローバルエラー検出:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack
  });

  // step5-loop.jsのエラーを特別に処理
  if (event.filename && event.filename.includes('step5-loop.js')) {
    console.error('❌ [DEBUG] step5-loop.js固有のエラー:', {
      line: event.lineno,
      column: event.colno,
      message: event.message,
      errorObject: event.error
    });

    // エラー位置の前後のコードを表示できるようにする
    if (event.error && event.error.stack) {
      console.error('❌ [DEBUG] スタックトレース:', event.error.stack);
    }
  }
});

// すべてのスクリプトの読み込み完了を確認
window.addEventListener('load', function() {
  console.log('✅ [DEBUG] 全スクリプト読み込み完了チェック', {
    timestamp: new Date().toISOString(),
    loadedScripts: window.scriptLoadStatus,
    globalFunctions: {
      executeStep5: typeof window.executeStep5,
      checkCompletionStatus: typeof window.checkCompletionStatus,
      processIncompleteTasks: typeof window.processIncompleteTasks,
      readFullSpreadsheet: typeof window.readFullSpreadsheet
    }
  });
});