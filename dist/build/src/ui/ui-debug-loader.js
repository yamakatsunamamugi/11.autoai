// ui-debug-loader.js
// CSP対応: インラインスクリプトを外部化

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

// エラーハンドラーを設定（詳細なログ追加）
window.addEventListener('error', function(event) {
  console.error('❌ [DEBUG] グローバルエラー検出:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack,
    timestamp: new Date().toISOString()
  });

  // ファイル別のエラー処理
  const errorFiles = ['step3-tasklist.js', 'step5-loop.js', 'step2-taskgroup.js'];
  errorFiles.forEach(file => {
    if (event.filename && event.filename.includes(file)) {
      console.error(`❌ [DEBUG] ${file}固有のエラー:`, {
        file: file,
        line: event.lineno,
        column: event.colno,
        message: event.message,
        errorObject: event.error,
        errorType: event.error?.constructor?.name
      });

      // エラー位置の前後のコードを表示できるようにする
      if (event.error && event.error.stack) {
        console.error(`❌ [DEBUG] ${file} スタックトレース:`, event.error.stack);
      }
    }
  });
});

// Promise rejection ハンドラー追加
window.addEventListener('unhandledrejection', function(event) {
  console.error('❌ [DEBUG] 未処理のPromiseエラー:', {
    reason: event.reason,
    promise: event.promise,
    timestamp: new Date().toISOString(),
    stack: event.reason?.stack
  });
});

// すべてのスクリプトの読み込み完了を確認
window.addEventListener('load', function() {
  console.log('✅ [DEBUG] 全スクリプト読み込み完了チェック', {
    timestamp: new Date().toISOString(),
    loadedScripts: window.scriptLoadStatus,
    globalFunctions: {
      executeStep1: typeof window.executeStep1,
      executeStep2: typeof window.executeStep2,
      executeStep3: typeof window.executeStep3,
      executeStep4: typeof window.executeStep4,
      executeStep5: typeof window.executeStep5,
      executeStep6: typeof window.executeStep6,
      checkCompletionStatus: typeof window.checkCompletionStatus,
      processIncompleteTasks: typeof window.processIncompleteTasks,
      readFullSpreadsheet: typeof window.readFullSpreadsheet
    },
    globalState: {
      exists: !!window.globalState,
      properties: window.globalState ? Object.keys(window.globalState) : []
    }
  });

  // 詳細なグローバル状態のログ
  if (window.globalState) {
    console.log('📊 [DEBUG] globalState詳細:', {
      spreadsheetId: window.globalState.spreadsheetId,
      gid: window.globalState.gid,
      currentGroupIndex: window.globalState.currentGroupIndex,
      taskGroups数: window.globalState.taskGroups?.length,
      spreadsheetData行数: window.globalState.spreadsheetData?.length,
      authToken存在: !!window.globalState.authToken
    });
  }
});

// スクリプト読み込み監視関数
function monitorScriptLoad(scriptName) {
  window.scriptLoadStatus[scriptName] = true;
  console.log(`📦 [DEBUG] ${scriptName} 読み込み完了`, {
    timestamp: new Date().toISOString(),
    現在の読み込み状況: window.scriptLoadStatus
  });
}

// 各モジュールの読み込みを監視（DOMContentLoaded後）
document.addEventListener('DOMContentLoaded', function() {
  console.log('📄 [DEBUG] DOMContentLoaded イベント発火', {
    timestamp: new Date().toISOString(),
    readyState: document.readyState
  });

  // モジュールスクリプトの読み込み監視
  const moduleScripts = document.querySelectorAll('script[type="module"]');
  moduleScripts.forEach(script => {
    const src = script.src;
    if (src) {
      const fileName = src.split('/').pop();
      console.log(`🔄 [DEBUG] モジュール監視開始: ${fileName}`);

      // load イベント
      script.addEventListener('load', () => {
        monitorScriptLoad(fileName);
      });

      // error イベント
      script.addEventListener('error', (e) => {
        console.error(`❌ [DEBUG] ${fileName} 読み込みエラー:`, e);
        window.scriptLoadStatus[fileName] = 'error';
      });
    }
  });
});

// デバッグ用のグローバル関数
window.debugTaskGeneration = function() {
  console.log('🔍 [DEBUG] タスク生成デバッグ情報:', {
    globalState: window.globalState,
    taskGroups: window.globalState?.taskGroups,
    currentGroup: window.globalState?.taskGroups?.[window.globalState?.currentGroupIndex],
    spreadsheetData: {
      exists: !!window.globalState?.spreadsheetData,
      rows: window.globalState?.spreadsheetData?.length,
      sample: window.globalState?.spreadsheetData?.slice(0, 3)
    }
  });
};

console.log('✅ [DEBUG] ui-debug-loader.js 読み込み完了');