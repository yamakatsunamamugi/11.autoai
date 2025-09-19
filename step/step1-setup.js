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

  // Google APIへのテスト接続
  const apiTestUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  console.log(`[step1-setup.js] [Step 1-1-1] Google Sheets API接続テスト開始: ${apiTestUrl}`);

  try {
    const startTime = Date.now();
    const testResponse = await fetch(apiTestUrl, {
      method: 'HEAD'
    });
    const responseTime = Date.now() - startTime;

    console.log(`[step1-setup.js] [Step 1-1-1] APIレスポンス詳細:`);
    console.log(`  - ステータス: ${testResponse.status} ${testResponse.statusText}`);
    console.log(`  - レスポンス時間: ${responseTime}ms`);
    console.log(`  - Headers: ${testResponse.headers.get('content-type') || 'N/A'}`);

    if (testResponse.ok || testResponse.status === 401) {
      // 401は認証エラーだが、接続自体は成功
      console.log(`[step1-setup.js] [Step 1-1-2] ✅ Google Sheets APIへの接続確認成功（ステータス: ${testResponse.status}）`);
      window.globalState.internetConnected = true;
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

  // URLからspreadsheetIdとgidを取得
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
    throw new Error('スプレッドシートIDが見つかりません');
  }

  const spreadsheetId = spreadsheetIdMatch[1];
  const gid = gidMatch ? gidMatch[1] : '0';

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
    values.forEach((row, index) => {
      const cellValue = row[0] || '';
      const rowNumber = index + 1; // 1-based index

      for (const [keyword, varName] of Object.entries(searchKeywords)) {
        if (cellValue === keyword && !specialRows[varName]) {
          specialRows[varName] = rowNumber;
          console.log(`[step1-setup.js] [Step 1-4-2] ✅ "${keyword}" 発見: ${rowNumber}行目 (A${rowNumber})`);
        }
      }

      // デバッグ用：最初の20行の内容を詳細に記録
      if (index < 20 && cellValue) {
        console.log(`  A${rowNumber}: "${cellValue}"`);
      }
    });

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
// メイン実行関数
// ========================================
async function executeStep1() {
  console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');
  console.log('[step1-setup.js] ステップ1: 初期設定 開始');
  console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');

  try {
    // 1-1: インターネット接続確認
    await checkInternetConnection();

    // 1-2: スリープ防止
    await preventSleep();

    // 1-3: API認証
    await initializeAPI();

    // 1-4: 特殊行検索
    await findSpecialRows();

    console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');
    console.log('[step1-setup.js] ✅ ステップ1: 初期設定 完了');
    console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');

    // 結果をlocalStorageにも保存
    localStorage.setItem('step1Result', JSON.stringify(window.globalState));

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
    findSpecialRows
  };
}

// グローバル関数として公開（ブラウザ環境用）
if (typeof window !== 'undefined') {
  window.executeStep1 = executeStep1;
  window.checkInternetConnection = checkInternetConnection;
  window.preventSleep = preventSleep;
  window.initializeAPI = initializeAPI;
  window.findSpecialRows = findSpecialRows;
}

// 自動実行（直接読み込まれた場合）
if (typeof window !== 'undefined' && !window.step1Executed) {
  window.step1Executed = true;

  // DOMContentLoadedを待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', executeStep1);
  } else {
    executeStep1();
  }
}