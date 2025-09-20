/**
 * ステップ1: 初期設定
 * インターネット接続確認、スリープ防止、API認証、特殊行検索を実行
 */

// グローバル状態を初期化（他のステップと共有）
if (!window.globalState) {
  window.globalState = {
    // Step1の結果
    internetConnected: false,
    sleepPrevented: false,
    authenticated: false,
    authToken: null,
    spreadsheetId: null,
    gid: null,
    specialRows: {},
    wakeLock: null,
    fallbackInterval: null,
    apiHeaders: null,
    sheetsApiBase: 'https://sheets.googleapis.com/v4/spreadsheets',

    // Step2以降で使用
    taskGroups: [],
    currentGroupIndex: 0,
    currentGroup: null,

    // 統計情報
    stats: {
      totalGroups: 0,
      completedGroups: 0,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      totalPrompts: 0,
      completedAnswers: 0,
      pendingTasks: 0,
      retryCount: 0
    },

    // 処理時間
    startTime: null,
    endTime: null
  };
}

// ========================================
// 1-1. インターネット接続確認
// ========================================
async function checkInternetConnection() {
  console.log('========');
  console.log('[step1-setup.js] [Step 1-1] インターネット接続確認開始');
  console.log('========');

  // 1-1-1. ネットワーク接続状態を取得
  const isOnline = navigator.onLine;
  console.log(`[step1-setup.js] [Step 1-1-1] navigator.onLine: ${isOnline}`);
  console.log(`[step1-setup.js] [Step 1-1-1] ユーザーエージェント: ${navigator.userAgent}`);
  console.log(`[step1-setup.js] [Step 1-1-1] 現在のURL: ${window.location.href}`);

  if (!isOnline) {
    console.error('[step1-setup.js] [Step 1-1-1] ❌ オフライン状態検出');
    console.error('詳細: ネットワーク接続が確認できません。Wi-FiまたはEthernet接続を確認してください。');
    throw new Error('インターネット接続なし（navigator.onLine=false）');
  }

  // Chrome Extension環境では既存の認証システムを利用
  console.log(`[step1-setup.js] [Step 1-1-1] Chrome Extension認証確認開始`);

  try {
    // グローバルに利用可能な認証トークンを確認
    let authToken = null;

    // Method 1: chrome.storage から認証情報を取得
    if (typeof chrome !== 'undefined' && chrome.storage) {
      console.log(`[step1-setup.js] [Step 1-1-1] chrome.storage から認証情報を確認中...`);
      try {
        const result = await chrome.storage.local.get(['authToken', 'googleServices']);
        if (result.authToken) {
          authToken = result.authToken;
          console.log(`[step1-setup.js] [Step 1-1-1] ✅ chrome.storage から認証トークンを取得`);
        }
      } catch (storageError) {
        console.log(`[step1-setup.js] [Step 1-1-1] chrome.storage アクセスエラー:`, storageError);
      }
    }

    // Method 2: globalThis から認証情報を確認
    if (!authToken && globalThis.googleServices) {
      console.log(`[step1-setup.js] [Step 1-1-1] globalThis.googleServices から認証情報を確認中...`);
      authToken = globalThis.googleServices.getAuthToken?.();
      if (authToken) {
        console.log(`[step1-setup.js] [Step 1-1-1] ✅ globalThis から認証トークンを取得`);
      }
    }

    // Method 3: chrome.runtime.sendMessage で認証情報を取得
    if (!authToken && typeof chrome !== 'undefined' && chrome.runtime) {
      console.log(`[step1-setup.js] [Step 1-1-1] background script から認証情報を確認中...`);
      try {
        const response = await chrome.runtime.sendMessage({action: 'getAuthToken'});
        if (response && response.token) {
          authToken = response.token;
          console.log(`[step1-setup.js] [Step 1-1-1] ✅ background script から認証トークンを取得`);
        }
      } catch (runtimeError) {
        console.log(`[step1-setup.js] [Step 1-1-1] chrome.runtime メッセージエラー:`, runtimeError);
      }
    }

    const startTime = Date.now();
    let testResponse;

    if (authToken) {
      // 認証トークンありでテスト
      const apiTestUrl = 'https://sheets.googleapis.com/v4/spreadsheets?q=test';
      testResponse = await fetch(apiTestUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
    } else {
      // 認証トークンなしでテスト（401エラーが期待される）
      // 存在するエンドポイントを使用（404を回避）
      const apiTestUrl = 'https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest';
      testResponse = await fetch(apiTestUrl, {
        method: 'GET'
      });
    }

    const responseTime = Date.now() - startTime;

    console.log(`[step1-setup.js] [Step 1-1-1] APIレスポンス詳細:`);
    console.log(`  - ステータス: ${testResponse.status} ${testResponse.statusText}`);
    console.log(`  - レスポンス時間: ${responseTime}ms`);
    console.log(`  - Headers: ${testResponse.headers.get('content-type') || 'N/A'}`);
    console.log(`  - 認証トークン使用: ${authToken ? 'あり (長さ: ' + authToken.length + ')' : 'なし'}`);

    if (testResponse.ok || testResponse.status === 401) {
      // 200 OK: APIディスカバリー成功または認証済み
      // 401 Unauthorized: APIは動作しているが認証が必要
      const statusDescription = testResponse.status === 401 ? '認証エラー（問題なし）' : '正常';
      console.log(`[step1-setup.js] [Step 1-1-2] ✅ Google Sheets APIへの接続確認成功（ステータス: ${testResponse.status} - ${statusDescription}）`);
      window.globalState.internetConnected = true;
      window.globalState.authenticated = authToken ? true : false;
      window.globalState.authToken = authToken;
      console.log(`[step1-setup.js] [Step 1-1-2] 🔐 認証状態: ${window.globalState.authenticated ? '認証済み' : '未認証'}`);
      return true;
    } else {
      console.error(`[step1-setup.js] [Step 1-1-2] ⚠️ 予期しないAPIレスポンス: ${testResponse.status}`);
      throw new Error(`API接続エラー: ステータス ${testResponse.status}`);
    }
  } catch (error) {
    console.error('[step1-setup.js] [Step 1-1-2] ❌ Google API接続エラー詳細:');
    console.error(`  - エラータイプ: ${error.name}`);
    console.error(`  - エラーメッセージ: ${error.message}`);
    console.error(`  - スタックトレース: ${error.stack}`);

    // ネットワークエラーの可能性のある詳細を追加
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.error('  - 可能性のある原因: CORS、ネットワークブロック、DNSエラー');
    }

    throw new Error(`Google API接続失敗: ${error.message}`);
  }
}

// ========================================
// 1-2. スリープ防止＆画面オフ防止
// ========================================
async function preventSleep() {
  console.log('========');
  console.log('[step1-setup.js] [Step 1-2] スリープ防止設定開始');
  console.log('========');

  // 1-2-1. Wake Lock APIサポート確認
  const wakeLockSupported = 'wakeLock' in navigator;
  console.log(`[step1-setup.js] [Step 1-2-1] Wake Lock APIサポート: ${wakeLockSupported}`);
  console.log(`[step1-setup.js] [Step 1-2-1] ブラウザ: ${navigator.userAgent.split(' ').pop()}`);
  console.log(`[step1-setup.js] [Step 1-2-1] 現在のタブ状態: ${document.visibilityState}`);

  let wakeLock = null;

  if (wakeLockSupported) {
    try {
      console.log('[step1-setup.js] [Step 1-2-1] Wake Lock取得を試行中...');
      const startTime = Date.now();

      // Wake Lock取得
      wakeLock = await navigator.wakeLock.request('screen');

      const acquireTime = Date.now() - startTime;
      console.log(`[step1-setup.js] [Step 1-2-1] ✅ Wake Lock取得成功`);
      console.log(`  - 取得時間: ${acquireTime}ms`);
      console.log(`  - Wake Lock状態: ${wakeLock.released ? '解放済み' : 'アクティブ'}`);
      console.log(`  - 取得時刻: ${new Date().toLocaleTimeString()}`);

      // Wake Lock解放イベントハンドラー
      wakeLock.addEventListener('release', () => {
        const releaseTime = new Date().toLocaleTimeString();
        console.warn(`[step1-setup.js] [Step 1-2-1] ⚠️ Wake Lock自動解放検出 at ${releaseTime}`);
        console.warn('  - 原因: タブ切り替え、画面ロック、またはブラウザによる自動解放');
        window.globalState.sleepPrevented = false;
      });

      // グローバルに保存（後で解放するため）
      window.globalState.wakeLock = wakeLock;
      window.globalState.sleepPrevented = true;
      window.globalState.wakeLockAcquiredAt = new Date().toISOString();

    } catch (error) {
      console.warn('[step1-setup.js] [Step 1-2-2] ⚠️ Wake Lock API失敗、フォールバック使用');
      console.warn(`  - エラー名: ${error.name}`);
      console.warn(`  - エラー詳細: ${error.message}`);
      console.warn(`  - 可能な原因: ユーザー操作なし、権限拒否、バッテリー節約モード`);
      enableFallbackSleepPrevention();
    }
  } else {
    // 1-2-2. フォールバック処理
    console.log('[step1-setup.js] [Step 1-2-2] Wake Lock API未サポート、フォールバック使用');
    console.log('  - 対応策: 15秒間隔でDOM操作を実行してアクティブ状態を維持');
    enableFallbackSleepPrevention();
  }

  // 1-2-3. 設定成功の確認
  const preventionMethod = window.globalState.wakeLock ? 'Wake Lock API' : 'フォールバック';
  console.log(`[step1-setup.js] [Step 1-2-3] ✅ スリープ防止設定完了`);
  console.log(`  - 使用方法: ${preventionMethod}`);
  console.log(`  - 状態: ${window.globalState.sleepPrevented ? 'アクティブ' : '無効'}`);
  return true;
}

// フォールバック処理
function enableFallbackSleepPrevention() {
  console.log('[step1-setup.js] [Step 1-2-2] フォールバックスリープ防止を開始');

  let executionCount = 0;
  const intervalMs = 15000;

  // 定期的に小さな処理を実行してシステムをアクティブに保つ
  const fallbackInterval = setInterval(() => {
    executionCount++;
    const currentTime = new Date().toLocaleTimeString();

    // 小さなDOM操作を実行
    const dummy = document.createElement('div');
    dummy.style.display = 'none';
    dummy.setAttribute('data-sleep-prevention', executionCount);
    document.body.appendChild(dummy);
    document.body.removeChild(dummy);

    // 現在時刻を更新
    Date.now();

    // 10回ごとに状態をログ出力
    if (executionCount % 10 === 0) {
      console.log(`[step1-setup.js] [Step 1-2-2] フォールバック実行状況:`);
      console.log(`  - 実行回数: ${executionCount}`);
      console.log(`  - 実行時刻: ${currentTime}`);
      console.log(`  - 経過時間: ${(executionCount * intervalMs / 1000 / 60).toFixed(1)}分`);
    }
  }, intervalMs); // 15秒間隔

  // グローバルに保存（後でクリアするため）
  window.globalState.fallbackInterval = fallbackInterval;
  window.globalState.fallbackStartTime = new Date().toISOString();
  window.globalState.sleepPrevented = true;

  console.log('[step1-setup.js] [Step 1-2-2] ✅ フォールバック機能有効化');
  console.log(`  - 実行間隔: ${intervalMs / 1000}秒`);
  console.log(`  - 開始時刻: ${new Date().toLocaleTimeString()}`);
}

// ========================================
// 1-3. API関連の初期化
// ========================================
async function initializeAPI() {
  console.log('========');
  console.log('[step1-setup.js] [Step 1-3] API関連の初期化開始');
  console.log('========');

  // 1-3-1. Google OAuth2認証
  console.log('[step1-setup.js] [Step 1-3-1] Google OAuth2認証を開始');
  console.log('  - 認証モード: interactive (ユーザー操作許可)');

  const authStartTime = Date.now();
  let retryCount = 0;
  const maxRetries = 3;

  return new Promise((resolve, reject) => {
    const attemptAuth = () => {
      retryCount++;
      console.log(`[step1-setup.js] [Step 1-3-1] 認証試行 ${retryCount}/${maxRetries}`);

      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        const authTime = Date.now() - authStartTime;

        if (chrome.runtime.lastError) {
          console.error(`[step1-setup.js] [Step 1-3-1] ❌ 認証エラー (試行 ${retryCount})`);
          console.error(`  - エラーメッセージ: ${chrome.runtime.lastError.message}`);
          console.error(`  - 経過時間: ${authTime}ms`);

          // エラータイプ別の詳細ログ
          if (chrome.runtime.lastError.message.includes('user')) {
            console.error('  - 原因: ユーザーが認証をキャンセル');
          } else if (chrome.runtime.lastError.message.includes('network')) {
            console.error('  - 原因: ネットワークエラー');
          } else if (chrome.runtime.lastError.message.includes('invalid')) {
            console.error('  - 原因: 無効な認証設定またはスコープ');
          }

          if (retryCount < maxRetries) {
            console.log(`[step1-setup.js] [Step 1-3-1] ${3 * retryCount}秒後にリトライ...`);
            setTimeout(attemptAuth, 3000 * retryCount);
          } else {
            reject(chrome.runtime.lastError);
          }
          return;
        }

        if (!token) {
          console.error('[step1-setup.js] [Step 1-3-1] ❌ トークンが空');
          console.error('  - 可能な原因: 拡張機能の権限不足、OAuth2設定エラー');
          reject(new Error('トークンなし'));
          return;
        }

        // 1-3-2. トークンの保存
        const tokenInfo = {
          length: token.length,
          prefix: token.substring(0, 10) + '...',
          timestamp: new Date().toISOString(),
          expiryTime: new Date(Date.now() + 50 * 60 * 1000).toISOString()
        };

        console.log('[step1-setup.js] [Step 1-3-2] ✅ アクセストークン取得成功');
        console.log(`  - トークン長: ${tokenInfo.length}文字`);
        console.log(`  - 取得時刻: ${tokenInfo.timestamp}`);
        console.log(`  - 有効期限: ${tokenInfo.expiryTime}`);
        console.log(`  - 認証時間: ${authTime}ms`);

        window.globalState.authToken = token;
        window.globalState.authenticated = true;
        window.globalState.tokenTimestamp = Date.now();
        window.globalState.tokenExpiry = 50 * 60 * 1000; // 50分

        // 1-3-3. Sheets API初期化（ヘッダー設定）
        window.globalState.apiHeaders = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        window.globalState.sheetsApiBase = 'https://sheets.googleapis.com/v4/spreadsheets';

        console.log('[step1-setup.js] [Step 1-3-3] Sheets API設定完了');
        console.log(`  - APIベースURL: ${window.globalState.sheetsApiBase}`);
        console.log('  - ヘッダー: Authorization, Content-Type設定済み');
        console.log('[step1-setup.js] [Step 1-3] ✅ API初期化完了');

        resolve(token);
      });
    };

    attemptAuth();
  });
}

// ========================================
// 1-4. 特殊行の検索と定義
// ========================================
async function findSpecialRows() {
  console.log('========');
  console.log('[step1-setup.js] [Step 1-4] 特殊行の検索開始');
  console.log('========');

  // globalStateまたはURLからspreadsheetIdとgidを取得
  let spreadsheetId = null;
  let gid = '0';

  // 方法1: globalStateから取得（STEP専用ボタンで設定済み）
  if (window.globalState && window.globalState.spreadsheetId) {
    spreadsheetId = window.globalState.spreadsheetId;
    gid = window.globalState.gid || '0';
    console.log(`[step1-setup.js] [Step 1-4] ✅ globalStateから取得:`);
    console.log(`  - スプレッドシートID: ${spreadsheetId}`);
    console.log(`  - GID: ${gid}`);
  } else {
    // 方法2: URLから解析（元の方法）
    const url = window.location.href;
    console.log(`[step1-setup.js] [Step 1-4] 現在のURL: ${url}`);

    const spreadsheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/#gid=([0-9]+)/);

    console.log('[step1-setup.js] [Step 1-4] URL解析結果:');
    console.log(`  - スプレッドシートIDマッチ: ${spreadsheetIdMatch ? '成功' : '失敗'}`);
    console.log(`  - GIDマッチ: ${gidMatch ? '成功' : '失敗'}`);

    if (!spreadsheetIdMatch) {
      console.error('[step1-setup.js] [Step 1-4] ❌ スプレッドシートIDが見つかりません');
      console.error(`  - URL形式が正しくない可能性があります`);
      console.error(`  - 期待される形式: https://docs.google.com/spreadsheets/d/[ID]/edit`);
      console.error(`  - Chrome Extension環境ではUIコントローラーでglobalStateに設定してください`);
      throw new Error('スプレッドシートIDが見つかりません');
    }

    spreadsheetId = spreadsheetIdMatch[1];
    gid = gidMatch ? gidMatch[1] : '0';
  }

  window.globalState.spreadsheetId = spreadsheetId;
  window.globalState.gid = gid;

  console.log(`[step1-setup.js] [Step 1-4] 抽出された情報:`);
  console.log(`  - スプレッドシートID: ${spreadsheetId}`);
  console.log(`  - GID: ${gid}`);
  console.log(`  - シート名: ${gid === '0' ? 'デフォルトシート' : `シート${gid}`}`);

  // 1-4-1. スプレッドシートのA列を取得
  const range = 'A1:A100'; // 最初の100行
  const apiUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/${range}`;

  console.log('[step1-setup.js] [Step 1-4-1] A列データ取得開始');
  console.log(`  - 取得範囲: ${range}`);
  console.log(`  - APIエンドポイント: ${apiUrl}`);

  try {
    const startTime = Date.now();
    const response = await fetch(apiUrl, {
      headers: window.globalState.apiHeaders
    });
    const fetchTime = Date.now() - startTime;

    console.log(`[step1-setup.js] [Step 1-4-1] API応答:`);
    console.log(`  - ステータス: ${response.status} ${response.statusText}`);
    console.log(`  - 応答時間: ${fetchTime}ms`);

    if (!response.ok) {
      console.error(`[step1-setup.js] [Step 1-4-1] APIエラー詳細:`);
      console.error(`  - ステータスコード: ${response.status}`);
      console.error(`  - 可能な原因: 権限不足、スプレッドシートID誤り、API制限`);
      throw new Error(`API エラー: ${response.status}`);
    }

    const data = await response.json();
    const values = data.values || [];

    console.log(`[step1-setup.js] [Step 1-4-1] 取得データ概要:`);
    console.log(`  - 取得行数: ${values.length}行`);
    console.log(`  - 最初の5行: ${values.slice(0, 5).map(v => v[0] || '(空)').join(', ')}`);

    // 1-4-2. 各キーワードを検索
    console.log('[step1-setup.js] [Step 1-4-2] 特殊行キーワード検索開始');

    const specialRows = {
      menuRow: null,
      controlRow: null,
      aiRow: null,
      modelRow: null,
      functionRow: null,
      dataStartRow: null
    };

    // 検索キーワードと対応する変数名
    const searchKeywords = {
      'メニュー': 'menuRow',
      '列制御': 'controlRow',
      'AI': 'aiRow',
      'モデル': 'modelRow',
      '機能': 'functionRow',
      '1': 'dataStartRow'
    };

    // 各行を検索
    const foundKeywords = [];
    values.forEach((row, index) => {
      const cellValue = row[0] || '';
      const rowNumber = index + 1; // 1-based index

      for (const [keyword, varName] of Object.entries(searchKeywords)) {
        if (cellValue === keyword && !specialRows[varName]) {
          specialRows[varName] = rowNumber;
          foundKeywords.push(`${keyword}:${rowNumber}行目`);
        }
      }
    });

    // 統合ログ出力 - 特殊行検索結果
    if (foundKeywords.length > 0) {
      console.log(`[step1-setup.js] [Step 1-4-2] ✅ 特殊行検索結果: ${foundKeywords.join(' | ')}`);
    }

    // 1-4-3. 検索結果の検証
    console.log('[step1-setup.js] [Step 1-4-3] 検索結果の検証');

    const missingRows = [];
    const foundRows = [];

    for (const [varName, rowNumber] of Object.entries(specialRows)) {
      if (rowNumber === null) {
        missingRows.push(varName);
      } else {
        foundRows.push(`${varName}=${rowNumber}`);
      }
    }

    console.log(`[step1-setup.js] [Step 1-4-3] 検出結果サマリー:`);
    console.log(`  - 発見: ${foundRows.join(', ')}`);

    if (missingRows.length > 0) {
      console.warn(`[step1-setup.js] [Step 1-4-3] ⚠️ 未検出の特殊行: ${missingRows.join(', ')}`);
      console.warn('  - 注: 一部の行は任意のため、処理は継続します');
    }

    window.globalState.specialRows = specialRows;
    console.log('[step1-setup.js] [Step 1-4] ✅ 特殊行検索完了');
    console.log('最終結果:', specialRows);

    return specialRows;

  } catch (error) {
    console.error('[step1-setup.js] [Step 1-4-1] ❌ A列取得エラー詳細:');
    console.error(`  - エラー名: ${error.name}`);
    console.error(`  - メッセージ: ${error.message}`);
    console.error(`  - スタック: ${error.stack}`);
    throw error;
  }
}

// ========================================
// 1-5. 列構造の自動セットアップ
// ========================================
async function setupColumnStructure() {
  console.log('========');
  console.log('[step1-setup.js] [Step 1-5] 列構造の自動セットアップ開始');
  console.log('========');

  try {
    // 1-5-0. シートIDの取得
    const spreadsheetId = window.globalState.spreadsheetId;
    const gid = window.globalState.gid || '0';
    const sheetId = parseInt(gid);
    console.log(`[step1-setup.js] [Step 1-5-0] シート情報:`);
    console.log(`  - スプレッドシートID: ${spreadsheetId}`);
    console.log(`  - シートID (GID): ${sheetId}`);

    // 1-5-1. プロンプト列の検出
    console.log('[step1-setup.js] [Step 1-5-1] プロンプト列を検出中...');

    const range = 'A1:Z1'; // 最初の行（ヘッダー行）を取得
    const apiUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/${range}`;

    const response = await fetch(apiUrl, {
      headers: window.globalState.apiHeaders
    });

    if (!response.ok) {
      console.error('[step1-setup.js] [Step 1-5-1] ヘッダー行取得エラー:', response.status);
      return false;
    }

    const data = await response.json();
    const headerRow = data.values?.[0] || [];

    // プロンプト列を検索
    const promptColumns = [];
    headerRow.forEach((cell, index) => {
      if (cell && cell.toString().includes('プロンプト')) {
        const columnLetter = indexToColumn(index);
        promptColumns.push({
          column: columnLetter,
          index: index,
          value: cell
        });
      }
    });

    console.log(`[step1-setup.js] [Step 1-5-1] プロンプト列検出結果: ${promptColumns.length}列`);
    promptColumns.forEach(col => {
      console.log(`  - ${col.column}列: "${col.value}"`);
    });

    if (promptColumns.length === 0) {
      console.log('[step1-setup.js] [Step 1-5-1] プロンプト列が見つかりません。列追加をスキップします。');
      return true;
    }

    // 1-5-2. 必要な列の確認と追加
    console.log('[step1-setup.js] [Step 1-5-2] 必要な列の確認開始...');

    const requiredColumns = {
      beforePrompt: ['ログ', 'メニュー'],
      afterPrompt: ['回答']
    };

    const columnsToAdd = [];

    for (const promptCol of promptColumns) {
      // プロンプト列の前に必要な列をチェック
      console.log(`[step1-setup.js] [Step 1-5-2] ${promptCol.column}列の前後を確認中...`);

      // 前の列をチェック（ログ、メニュー）
      for (let i = 0; i < requiredColumns.beforePrompt.length; i++) {
        const requiredCol = requiredColumns.beforePrompt[i];
        const checkIndex = promptCol.index - (requiredColumns.beforePrompt.length - i);

        if (checkIndex < 0 || !headerRow[checkIndex] || !headerRow[checkIndex].includes(requiredCol)) {
          columnsToAdd.push({
            position: promptCol.index,
            name: requiredCol,
            type: 'before'
          });
          console.log(`  - "${requiredCol}"列の追加が必要（${promptCol.column}列の前）`);
        }
      }

      // 後の列をチェック（回答）
      for (let i = 0; i < requiredColumns.afterPrompt.length; i++) {
        const requiredCol = requiredColumns.afterPrompt[i];
        const checkIndex = promptCol.index + i + 1;

        if (checkIndex >= headerRow.length || !headerRow[checkIndex] || !headerRow[checkIndex].includes(requiredCol)) {
          columnsToAdd.push({
            position: promptCol.index + i + 1,
            name: requiredCol,
            type: 'after'
          });
          console.log(`  - "${requiredCol}"列の追加が必要（${promptCol.column}列の後）`);
        }
      }
    }

    if (columnsToAdd.length === 0) {
      console.log('[step1-setup.js] [Step 1-5-2] ✅ 必要な列は既に存在します');
      return true;
    }

    // 1-5-3. 列追加の実行
    console.log(`[step1-setup.js] [Step 1-5-3] ${columnsToAdd.length}列を追加中...`);

    // 列追加は位置の大きい順（右から）実行する必要がある
    columnsToAdd.sort((a, b) => b.position - a.position);

    for (const col of columnsToAdd) {
      console.log(`[step1-setup.js] [Step 1-5-3] ${indexToColumn(col.position)}位置に"${col.name}"列を追加中...`);

      const success = await insertColumn(spreadsheetId, sheetId, col.position);
      if (!success) {
        console.error(`[step1-setup.js] [Step 1-5-3] ❌ 列追加失敗: ${col.name}`);
        continue;
      }

      // 1-5-4. 列ヘッダーの設定
      console.log(`[step1-setup.js] [Step 1-5-4] ヘッダー設定中: ${indexToColumn(col.position)}1 = "${col.name}"`);

      const headerRange = `${indexToColumn(col.position)}1`;
      const headerUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/${headerRange}?valueInputOption=USER_ENTERED`;

      const headerResponse = await fetch(headerUrl, {
        method: 'PUT',
        headers: window.globalState.apiHeaders,
        body: JSON.stringify({
          values: [[col.name]]
        })
      });

      if (headerResponse.ok) {
        console.log(`[step1-setup.js] [Step 1-5-4] ✅ ヘッダー設定成功: ${col.name}`);
      } else {
        console.error(`[step1-setup.js] [Step 1-5-4] ⚠️ ヘッダー設定失敗: ${col.name}`);
      }
    }

    console.log('[step1-setup.js] [Step 1-5] ✅ 列構造の自動セットアップ完了');
    return true;

  } catch (error) {
    console.error('[step1-setup.js] [Step 1-5] ❌ 列構造セットアップエラー:', error);
    console.error('  - エラー詳細:', error.message);
    console.error('  - スタック:', error.stack);
    // エラーが発生しても処理を継続
    return true;
  }
}

// 1-5-5. 列操作ユーティリティ関数
// 列番号から列文字への変換（0 → A, 1 → B, ...）
function indexToColumn(index) {
  let column = '';
  let num = index;

  while (num >= 0) {
    column = String.fromCharCode(65 + (num % 26)) + column;
    num = Math.floor(num / 26) - 1;
    if (num < 0) break;
  }

  return column;
}

// 列文字から列番号への変換（A → 0, B → 1, ...）
function columnToIndex(column) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return index - 1;
}

// 1-5-6. Google Sheets APIで列を挿入
async function insertColumn(spreadsheetId, sheetId, columnIndex) {
  console.log(`[step1-setup.js] [Step 1-5-6] 列挿入API呼び出し: インデックス${columnIndex}`);

  try {
    // バッチ更新リクエストの作成
    const request = {
      requests: [{
        insertDimension: {
          range: {
            sheetId: sheetId,  // シートIDを指定
            dimension: 'COLUMNS',
            startIndex: columnIndex,
            endIndex: columnIndex + 1
          },
          inheritFromBefore: false
        }
      }]
    };

    // batchUpdate APIを呼び出し
    const batchUpdateUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}:batchUpdate`;

    console.log(`[step1-setup.js] [Step 1-5-6] batchUpdate実行中...`);
    console.log(`  - URL: ${batchUpdateUrl}`);
    console.log(`  - 挿入位置: ${columnIndex} (${indexToColumn(columnIndex)}列)`);

    const response = await fetch(batchUpdateUrl, {
      method: 'POST',
      headers: window.globalState.apiHeaders,
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[step1-setup.js] [Step 1-5-6] ❌ 列挿入エラー:`, errorData);
      console.error(`  - ステータス: ${response.status}`);
      console.error(`  - エラー: ${errorData.error?.message || response.statusText}`);
      return false;
    }

    const result = await response.json();
    console.log(`[step1-setup.js] [Step 1-5-6] ✅ 列挿入成功`);
    console.log(`  - レスポンス:`, result.replies?.[0] || 'OK');

    return true;

  } catch (error) {
    console.error(`[step1-setup.js] [Step 1-5-6] ❌ 列挿入例外エラー:`, error);
    return false;
  }
}

// ========================================
// メイン実行関数
// ========================================
async function executeStep1() {
  console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');
  console.log('[step1-setup.js] ステップ1: 初期設定 開始');
  console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');

  // Global State初期化確認・デバッグ
  console.log(`[step1-setup.js] [Debug] Global State確認:`);
  console.log(`  - window.globalState存在: ${!!window.globalState}`);
  console.log(`  - chrome API利用可能: ${!!chrome}`);
  console.log(`  - globalThis.googleServices: ${!!globalThis.googleServices}`);

  if (!window.globalState) {
    console.log(`[step1-setup.js] [Debug] Global State初期化実行`);
    window.globalState = {
      internetConnected: false,
      authenticated: false,
      authToken: null,
      spreadsheetId: null,
      gid: null,
      specialRows: {},
      taskGroups: [],
      currentTaskGroup: null,
      completedTasks: 0,
      totalTasks: 0
    };
  }
  console.log(`[step1-setup.js] [Debug] Global State初期化完了:`, window.globalState);

  try {
    // 1-1: インターネット接続確認
    await checkInternetConnection();

    // 1-2: スリープ防止
    await preventSleep();

    // 1-3: API認証
    await initializeAPI();

    // 1-4: 特殊行検索
    await findSpecialRows();

    // 1-5: 列構造の自動セットアップ
    await setupColumnStructure();

    console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');
    console.log('[step1-setup.js] ✅ ステップ1: 初期設定 完了');
    console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');

    // ステップ2で使用する形式でglobalStateを補完
    if (!window.globalState.apiHeaders && window.globalState.authToken) {
      window.globalState.apiHeaders = {
        'Authorization': `Bearer ${window.globalState.authToken}`,
        'Content-Type': 'application/json'
      };
    }

    if (!window.globalState.sheetsApiBase) {
      window.globalState.sheetsApiBase = 'https://sheets.googleapis.com/v4/spreadsheets';
    }

    // step1完了フラグを設定
    window.globalState.step1Completed = true;

    // 結果をlocalStorageにも保存（互換性のため）
    const step1Result = {
      spreadsheetId: window.globalState.spreadsheetId,
      specialRows: window.globalState.specialRows,
      apiHeaders: window.globalState.apiHeaders,
      sheetsApiBase: window.globalState.sheetsApiBase
    };
    localStorage.setItem('step1Result', JSON.stringify(step1Result));

    console.log('[step1-setup.js] ✅ globalState準備完了:', window.globalState);
    return window.globalState;

  } catch (error) {
    console.error('[step1-setup.js] ❌ ステップ1 エラー:', error);
    throw error;
  }
}

// エクスポート（モジュールとして使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executeStep1,
    checkInternetConnection,
    preventSleep,
    initializeAPI,
    findSpecialRows,
    setupColumnStructure,
    indexToColumn,
    columnToIndex,
    insertColumn
  };
}

// グローバル関数として公開（ブラウザ環境用）
if (typeof window !== 'undefined') {
  window.executeStep1 = executeStep1;
  window.checkInternetConnection = checkInternetConnection;
  window.preventSleep = preventSleep;
  window.initializeAPI = initializeAPI;
  window.findSpecialRows = findSpecialRows;
  window.setupColumnStructure = setupColumnStructure;
  window.indexToColumn = indexToColumn;
  window.columnToIndex = columnToIndex;
  window.insertColumn = insertColumn;
}

// 自動実行を無効化（STEP専用ボタンから手動で実行するため）
// 元の自動実行コード:
/*
if (typeof window !== 'undefined' && !window.step1Executed) {
  window.step1Executed = true;

  // DOMContentLoadedを待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', executeStep1);
  } else {
    executeStep1();
  }
}
*/

console.log('[step1-setup.js] ✅ Step1関数定義完了（自動実行無効）');