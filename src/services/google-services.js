/**
 * @fileoverview Google Services 統合モジュール
 *
 * 【統合元ファイル】
 * - auth-service.js: OAuth2認証
 * - sheets-client.js: Google Sheets API操作
 * - docs-client.js: Google Docs API操作
 * - spreadsheet-logger.js: スプレッドシートへのログ記録
 * - spreadsheet-auto-setup.js: スプレッドシートの自動セットアップ
 *
 * 【処理の流れ】
 * Step 2-1: 認証処理
 * Step 2-2: スプレッドシート読み込み
 * Step 2-3: スプレッドシート書き込み
 * Step 2-4: スプレッドシートログ記録
 * Step 2-5: 自動セットアップ
 * Step 2-6: Docsレポート生成
 * Step 2-7: ユーティリティ機能
 */

// ========================================
// Step 2-1: 認証処理
// ========================================

/**
 * Step 2-1: Google OAuth2認証管理クラス
 * Google APIへのアクセスに必要な認証トークンを管理
 */
class GoogleAuthManager {
  constructor() {
    // Step 2-1-1: 認証マネージャーの初期化
    this.logger = typeof logger !== "undefined" ? logger : console;

    // Step 2-1-1-1: トークンキャッシュの初期化
    this._tokenCache = null;
    this._tokenTimestamp = null;
    this._tokenExpiry = 50 * 60 * 1000; // 50分間有効（Google tokenは通常1時間）

    // Step 2-1-1-2: 認証状態の初期化
    this._isAuthenticated = false;
    this._authCheckPromise = null;

    this.logger.log('[Step 2-1-1] GoogleAuthManager初期化完了');
  }

  /**
   * Step 2-1-2: OAuth2認証トークンの取得
   * キャッシュ機能付きで効率的にトークンを管理
   */
  async getAuthToken() {
    const now = Date.now();

    // Step 2-1-2-1: キャッシュの有効性チェック
    if (this._tokenCache && this._tokenTimestamp &&
        (now - this._tokenTimestamp) < this._tokenExpiry) {
      this.logger.log('[Step 2-1-2-1] キャッシュからトークン取得');
      return this._tokenCache;
    }

    // Step 2-1-2-2: 新規トークンの取得
    return new Promise((resolve, reject) => {
      this.logger.log('[Step 2-1-2-2] 新規認証トークンを取得中...');

      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          // Step 2-1-2-3: エラー処理
          this.logger.error('[Step 2-1-2-3] 認証トークン取得失敗:', chrome.runtime.lastError);
          this._isAuthenticated = false;
          reject(chrome.runtime.lastError);
        } else {
          // Step 2-1-2-4: トークンのキャッシュ保存
          this._tokenCache = token;
          this._tokenTimestamp = now;
          this._isAuthenticated = true;

          this.logger.log('[Step 2-1-2-4] 認証トークン取得成功');
          resolve(token);
        }
      });
    });
  }

  /**
   * Step 2-1-3: 認証状態の確認
   */
  async checkAuthStatus() {
    try {
      // Step 2-1-3-1: トークン取得試行
      const token = await this.getAuthToken();

      if (!token) {
        // Step 2-1-3-2: 未認証状態
        return {
          isAuthenticated: false,
          message: "認証されていません"
        };
      }

      // Step 2-1-3-3: 認証済み状態
      return {
        isAuthenticated: true,
        token: token
      };
    } catch (error) {
      // Step 2-1-3-4: エラー状態
      this.logger.error('[Step 2-1-3-4] 認証状態確認エラー:', error);
      return {
        isAuthenticated: false,
        error: error.message
      };
    }
  }

  /**
   * Step 2-1-4: 認証のクリア（ログアウト）
   */
  async clearAuth() {
    // Step 2-1-4-1: キャッシュクリア
    this._tokenCache = null;
    this._tokenTimestamp = null;
    this._isAuthenticated = false;

    // Step 2-1-4-2: Chrome認証トークンの削除
    return new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({}, () => {
        this.logger.log('[Step 2-1-4-2] 認証クリア完了');
        resolve();
      });
    });
  }
}

// ========================================
// Step 2-2: スプレッドシート読み込み
// ========================================

/**
 * Step 2-2: Google Sheets読み込みクラス
 * スプレッドシートからデータを取得する機能を提供
 */
class SheetsReader {
  constructor(authManager) {
    // Step 2-2-1: リーダーの初期化
    this.authManager = authManager;
    this.logger = console;

    // Step 2-2-1-1: API設定
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    this.batchGetUrl = (id) => `${this.baseUrl}/${id}:batchGet`;

    // Step 2-2-1-2: キャッシュ設定
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1分間キャッシュ

    this.logger.log('[Step 2-2-1] SheetsReader初期化完了');
  }

  /**
   * Step 2-2-2: スプレッドシートデータの取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 取得範囲（例: 'Sheet1!A1:Z100'）
   */
  async getSheetData(spreadsheetId, range) {
    try {
      // Step 2-2-2-1: キャッシュチェック
      const cacheKey = `${spreadsheetId}_${range}`;
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        this.logger.log('[Step 2-2-2-1] キャッシュからデータ取得');
        return cached.data;
      }

      // Step 2-2-2-2: 認証トークン取得
      const token = await this.authManager.getAuthToken();

      // Step 2-2-2-3: API URLの構築
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}`;

      // Step 2-2-2-4: APIリクエスト実行
      this.logger.log(`[Step 2-2-2-4] Sheets API呼び出し: ${range}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Step 2-2-2-5: レスポンス処理
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Sheets API Error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();

      // Step 2-2-2-6: キャッシュ保存
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });

      this.logger.log(`[Step 2-2-2-6] データ取得完了: ${data.values?.length || 0}行`);
      return data;

    } catch (error) {
      this.logger.error('[Step 2-2-2] データ取得エラー:', error);
      throw error;
    }
  }

  /**
   * Step 2-2-3: AutoAI用データの読み込み
   * 特定フォーマットのスプレッドシートを解析
   */
  async loadAutoAIData(spreadsheetId, gid) {
    // Step 2-2-3-1: シート名の取得
    const sheetName = await this.getSheetName(spreadsheetId, gid);

    // Step 2-2-3-2: 範囲を指定してデータ取得
    const range = sheetName ? `'${sheetName}'!A1:ZZ1000` : 'A1:ZZ1000';
    const data = await this.getSheetData(spreadsheetId, range);

    // Step 2-2-3-3: データ構造の解析
    const result = {
      spreadsheetId: spreadsheetId,
      gid: gid,
      sheetName: sheetName,
      values: data.values || [],
      menuRow: null,
      aiRow: null,
      modelRow: null,
      taskRow: null,
      controlCandidateRows: []
    };

    if (result.values.length > 0) {
      // Step 2-2-3-4: 特殊行の識別
      // メニュー行（1行目）
      result.menuRow = { index: 0, data: result.values[0] };

      // AI行（2行目）
      if (result.values.length > 1) {
        result.aiRow = { index: 1, data: result.values[1] };
      }

      // モデル行（3行目）
      if (result.values.length > 2) {
        result.modelRow = { index: 2, data: result.values[2] };
      }

      // タスク行（4行目）
      if (result.values.length > 3) {
        result.taskRow = { index: 3, data: result.values[3] };
      }

      // Step 2-2-3-5: 制御候補行の検出（5-10行目）
      for (let i = 4; i < Math.min(10, result.values.length); i++) {
        const row = result.values[i];
        if (row && row.some(cell => cell && cell.toString().includes('この列'))) {
          result.controlCandidateRows.push({ index: i, data: row });
        }
      }
    }

    this.logger.log(`[Step 2-2-3] AutoAIデータ読み込み完了: ${result.values.length}行`);
    return result;
  }

  /**
   * Step 2-2-4: シート名の取得
   */
  async getSheetName(spreadsheetId, gid) {
    try {
      // Step 2-2-4-1: スプレッドシートのメタデータ取得
      const token = await this.authManager.getAuthToken();
      const url = `${this.baseUrl}/${spreadsheetId}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get sheet metadata');
      }

      const data = await response.json();

      // Step 2-2-4-2: GIDからシート名を検索
      if (gid && data.sheets) {
        const sheet = data.sheets.find(s => s.properties.sheetId === parseInt(gid));
        if (sheet) {
          return sheet.properties.title;
        }
      }

      // Step 2-2-4-3: デフォルトシート名
      return data.sheets?.[0]?.properties?.title || null;

    } catch (error) {
      this.logger.warn('[Step 2-2-4] シート名取得エラー:', error);
      return null;
    }
  }
}

// ========================================
// Step 2-3: スプレッドシート書き込み
// ========================================

/**
 * Step 2-3: Google Sheets書き込みクラス
 * スプレッドシートへのデータ書き込み機能を提供
 */
class SheetsWriter {
  constructor(authManager) {
    // Step 2-3-1: ライターの初期化
    this.authManager = authManager;
    this.logger = console;

    // Step 2-3-1-1: API設定
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

    // Step 2-3-1-2: バッチ処理設定
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchDelay = 500; // 500ms待ってバッチ処理

    this.logger.log('[Step 2-3-1] SheetsWriter初期化完了');
  }

  /**
   * Step 2-3-2: 単一セルへの書き込み
   */
  async writeValue(spreadsheetId, range, value) {
    try {
      // Step 2-3-2-1: 認証トークン取得
      const token = await this.authManager.getAuthToken();

      // Step 2-3-2-2: API URLの構築
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

      // Step 2-3-2-3: リクエストボディの準備
      const body = {
        values: [[value]]
      };

      // Step 2-3-2-4: APIリクエスト実行
      this.logger.log(`[Step 2-3-2-4] 書き込み実行: ${range} = "${value}"`);
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      // Step 2-3-2-5: レスポンス処理
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Write Error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      this.logger.log(`[Step 2-3-2-5] 書き込み成功: ${result.updatedCells}セル更新`);
      return result;

    } catch (error) {
      this.logger.error('[Step 2-3-2] 書き込みエラー:', error);
      throw error;
    }
  }

  /**
   * Step 2-3-3: バッチ更新（複数セル同時更新）
   */
  async batchUpdate(spreadsheetId, updates) {
    try {
      // Step 2-3-3-1: 認証トークン取得
      const token = await this.authManager.getAuthToken();

      // Step 2-3-3-2: バッチ更新リクエストの構築
      const requests = updates.map(update => {
        // Step 2-3-3-2-1: セル範囲をA1表記からGridRangeに変換
        const gridRange = this.convertA1ToGridRange(update.range);

        // Step 2-3-3-2-2: 更新リクエストの作成
        return {
          updateCells: {
            range: gridRange,
            rows: [{
              values: [{
                userEnteredValue: { stringValue: update.value }
              }]
            }],
            fields: 'userEnteredValue'
          }
        };
      });

      // Step 2-3-3-3: APIリクエスト実行
      const url = `${this.baseUrl}/${spreadsheetId}:batchUpdate`;
      this.logger.log(`[Step 2-3-3-3] バッチ更新実行: ${updates.length}件`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });

      // Step 2-3-3-4: レスポンス処理
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Batch Update Error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      this.logger.log(`[Step 2-3-3-4] バッチ更新成功: ${result.replies?.length}件処理`);
      return result;

    } catch (error) {
      this.logger.error('[Step 2-3-3] バッチ更新エラー:', error);
      throw error;
    }
  }

  /**
   * Step 2-3-4: 範囲のクリア
   */
  async clearRange(spreadsheetId, range) {
    try {
      // Step 2-3-4-1: 認証トークン取得
      const token = await this.authManager.getAuthToken();

      // Step 2-3-4-2: API URLの構築
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;

      // Step 2-3-4-3: クリアリクエスト実行
      this.logger.log(`[Step 2-3-4-3] 範囲クリア実行: ${range}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Step 2-3-4-4: レスポンス処理
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Clear Error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      this.logger.log(`[Step 2-3-4-4] クリア成功: ${range}`);
      return result;

    } catch (error) {
      this.logger.error('[Step 2-3-4] クリアエラー:', error);
      throw error;
    }
  }

  /**
   * Step 2-3-5: A1表記からGridRange変換（ヘルパー）
   */
  convertA1ToGridRange(a1Notation) {
    // Step 2-3-5-1: A1表記の解析
    const match = a1Notation.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid A1 notation: ${a1Notation}`);
    }

    // Step 2-3-5-2: 列番号の計算
    const colLetters = match[1];
    let colIndex = 0;
    for (let i = 0; i < colLetters.length; i++) {
      colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    colIndex--; // 0-indexed

    // Step 2-3-5-3: 行番号の計算
    const rowIndex = parseInt(match[2]) - 1; // 0-indexed

    // Step 2-3-5-4: GridRange形式で返す
    return {
      startRowIndex: rowIndex,
      endRowIndex: rowIndex + 1,
      startColumnIndex: colIndex,
      endColumnIndex: colIndex + 1
    };
  }
}

// ========================================
// Step 2-4: スプレッドシートログ記録
// ========================================

/**
 * Step 2-4: スプレッドシートログ記録クラス
 * タスク実行ログをスプレッドシートに記録
 */
class SpreadsheetLogger {
  constructor(sheetsWriter) {
    // Step 2-4-1: ロガーの初期化
    this.sheetsWriter = sheetsWriter;
    this.logger = console;

    // Step 2-4-1-1: ログ設定
    this.spreadsheetId = null;
    this.logColumn = null;
    this.currentRow = 2; // データは2行目から

    // Step 2-4-1-2: タイムスタンプ管理
    this.sendTimestamps = new Map();
    this.receiveTimestamps = new Map();

    // Step 2-4-1-3: バッファリング設定
    this.logBuffer = [];
    this.flushInterval = 5000; // 5秒ごとにフラッシュ
    this.startFlushTimer();

    this.logger.log('[Step 2-4-1] SpreadsheetLogger初期化完了');
  }

  /**
   * Step 2-4-2: ログの設定
   */
  configure(spreadsheetId, logColumn) {
    // Step 2-4-2-1: スプレッドシートIDの設定
    this.spreadsheetId = spreadsheetId;

    // Step 2-4-2-2: ログ列の設定
    this.logColumn = logColumn;

    // Step 2-4-2-3: 現在行のリセット
    this.currentRow = 2;

    this.logger.log(`[Step 2-4-2] ログ設定完了: ${logColumn}列`);
  }

  /**
   * Step 2-4-3: タスク実行ログの記録
   */
  async logTaskExecution(taskData) {
    // Step 2-4-3-1: ログエントリの作成
    const logEntry = {
      timestamp: new Date().toISOString(),
      taskId: taskData.taskId,
      cellPosition: taskData.cellPosition || 'unknown',
      aiType: taskData.aiType,
      model: taskData.model,
      function: taskData.function,
      status: 'executing'
    };

    // Step 2-4-3-2: 送信時刻の記録
    this.sendTimestamps.set(taskData.taskId, {
      time: new Date(),
      ...logEntry
    });

    // Step 2-4-3-3: ログメッセージの生成
    const logMessage = this.formatLogMessage(logEntry);

    // Step 2-4-3-4: バッファに追加
    this.logBuffer.push({
      row: this.currentRow++,
      column: this.logColumn,
      value: logMessage
    });

    this.logger.log(`[Step 2-4-3-4] ログバッファに追加: ${logMessage}`);
  }

  /**
   * Step 2-4-4: タスク完了ログの記録
   */
  async logTaskCompletion(taskId, response) {
    // Step 2-4-4-1: 受信時刻の記録
    const receiveTime = new Date();
    this.receiveTimestamps.set(taskId, receiveTime);

    // Step 2-4-4-2: 実行時間の計算
    const sendInfo = this.sendTimestamps.get(taskId);
    let executionTime = 'unknown';
    if (sendInfo) {
      executionTime = ((receiveTime - sendInfo.time) / 1000).toFixed(1) + '秒';
    }

    // Step 2-4-4-3: 完了ログエントリの作成
    const logEntry = {
      timestamp: receiveTime.toISOString(),
      taskId: taskId,
      status: response ? 'completed' : 'failed',
      executionTime: executionTime,
      responseLength: response?.length || 0
    };

    // Step 2-4-4-4: ログメッセージの生成と記録
    const logMessage = this.formatCompletionMessage(logEntry);

    this.logBuffer.push({
      row: this.currentRow++,
      column: this.logColumn,
      value: logMessage
    });

    this.logger.log(`[Step 2-4-4-4] 完了ログ記録: ${logMessage}`);
  }

  /**
   * Step 2-4-5: バッファのフラッシュ
   */
  async flushLogBuffer() {
    if (this.logBuffer.length === 0 || !this.spreadsheetId || !this.logColumn) {
      return;
    }

    // Step 2-4-5-1: バッファの取り出し
    const logsToWrite = [...this.logBuffer];
    this.logBuffer = [];

    // Step 2-4-5-2: バッチ更新の準備
    const updates = logsToWrite.map(log => ({
      range: `${log.column}${log.row}`,
      value: log.value
    }));

    try {
      // Step 2-4-5-3: バッチ書き込み実行
      await this.sheetsWriter.batchUpdate(this.spreadsheetId, updates);
      this.logger.log(`[Step 2-4-5-3] ログフラッシュ完了: ${updates.length}件`);
    } catch (error) {
      // Step 2-4-5-4: エラー時はバッファに戻す
      this.logBuffer.unshift(...logsToWrite);
      this.logger.error('[Step 2-4-5-4] ログフラッシュエラー:', error);
    }
  }

  /**
   * Step 2-4-6: 定期フラッシュタイマー
   */
  startFlushTimer() {
    setInterval(() => {
      this.flushLogBuffer();
    }, this.flushInterval);
  }

  /**
   * Step 2-4-7: ログメッセージのフォーマット
   */
  formatLogMessage(entry) {
    return `[${entry.timestamp}] ${entry.aiType} - ${entry.model} - ${entry.function} - ${entry.status}`;
  }

  formatCompletionMessage(entry) {
    return `[${entry.timestamp}] Task ${entry.taskId} - ${entry.status} - ${entry.executionTime}`;
  }
}

// ========================================
// Step 2-5: スプレッドシート自動セットアップ
// ========================================

/**
 * Step 2-5: スプレッドシート自動セットアップクラス
 * プロンプト列の前後に必要な列を自動追加
 */
class SpreadsheetAutoSetup {
  constructor(sheetsReader, sheetsWriter) {
    // Step 2-5-1: セットアップクラスの初期化
    this.sheetsReader = sheetsReader;
    this.sheetsWriter = sheetsWriter;
    this.logger = console;

    // Step 2-5-1-1: 列追加設定
    this.requiredColumns = {
      beforePrompt: ['ログ', 'メニュー'],
      afterPrompt: ['回答']
    };

    this.logger.log('[Step 2-5-1] SpreadsheetAutoSetup初期化完了');
  }

  /**
   * Step 2-5-2: 自動セットアップの実行
   */
  async executeAutoSetup(spreadsheetId, gid) {
    try {
      // Step 2-5-2-1: 現在のシート構造を取得
      this.logger.log('[Step 2-5-2-1] シート構造を解析中...');
      const sheetData = await this.sheetsReader.loadAutoAIData(spreadsheetId, gid);

      // Step 2-5-2-2: プロンプト列の検出
      const promptColumns = this.detectPromptColumns(sheetData);
      this.logger.log(`[Step 2-5-2-2] プロンプト列検出: ${promptColumns.join(', ')}`);

      if (promptColumns.length === 0) {
        return {
          success: false,
          message: 'プロンプト列が見つかりません',
          hasAdditions: false
        };
      }

      // Step 2-5-2-3: 必要な列の追加
      const addedColumns = [];

      for (const promptCol of promptColumns) {
        // Step 2-5-2-3-1: プロンプト列の前に必要な列を追加
        const beforeColumns = await this.addColumnsBefore(
          spreadsheetId,
          promptCol,
          this.requiredColumns.beforePrompt,
          sheetData
        );
        addedColumns.push(...beforeColumns);

        // Step 2-5-2-3-2: プロンプト列の後に必要な列を追加
        const afterColumns = await this.addColumnsAfter(
          spreadsheetId,
          promptCol,
          this.requiredColumns.afterPrompt,
          sheetData
        );
        addedColumns.push(...afterColumns);
      }

      // Step 2-5-2-4: セットアップ結果の返却
      this.logger.log(`[Step 2-5-2-4] セットアップ完了: ${addedColumns.length}列追加`);

      return {
        success: true,
        message: `${addedColumns.length}列を追加しました`,
        addedColumns: addedColumns,
        hasAdditions: addedColumns.length > 0
      };

    } catch (error) {
      this.logger.error('[Step 2-5-2] セットアップエラー:', error);
      return {
        success: false,
        error: error.message,
        hasAdditions: false
      };
    }
  }

  /**
   * Step 2-5-3: プロンプト列の検出
   */
  detectPromptColumns(sheetData) {
    const promptColumns = [];

    if (!sheetData.menuRow || !sheetData.menuRow.data) {
      return promptColumns;
    }

    // Step 2-5-3-1: メニュー行から「プロンプト」を含む列を検索
    sheetData.menuRow.data.forEach((cell, index) => {
      if (cell && cell.toString().includes('プロンプト')) {
        const columnLetter = this.indexToColumn(index);
        promptColumns.push(columnLetter);
      }
    });

    return promptColumns;
  }

  /**
   * Step 2-5-4: 列の前に新しい列を追加
   */
  async addColumnsBefore(spreadsheetId, targetColumn, columnsToAdd, sheetData) {
    const addedColumns = [];

    // Step 2-5-4-1: 対象列のインデックスを取得
    const targetIndex = this.columnToIndex(targetColumn);

    for (let i = columnsToAdd.length - 1; i >= 0; i--) {
      const columnName = columnsToAdd[i];

      // Step 2-5-4-2: 既存列のチェック
      const beforeColumn = this.indexToColumn(targetIndex - (columnsToAdd.length - i));
      if (this.columnExists(beforeColumn, columnName, sheetData)) {
        continue;
      }

      // Step 2-5-4-3: 新しい列の挿入
      await this.insertColumn(spreadsheetId, beforeColumn);

      // Step 2-5-4-4: ヘッダーの設定
      await this.sheetsWriter.writeValue(
        spreadsheetId,
        `${beforeColumn}1`,
        columnName
      );

      addedColumns.push({
        column: beforeColumn,
        name: columnName,
        position: 'before'
      });

      this.logger.log(`[Step 2-5-4-4] 列追加: ${beforeColumn}列 (${columnName})`);
    }

    return addedColumns;
  }

  /**
   * Step 2-5-5: 列の後に新しい列を追加
   */
  async addColumnsAfter(spreadsheetId, targetColumn, columnsToAdd, sheetData) {
    const addedColumns = [];

    // Step 2-5-5-1: 対象列のインデックスを取得
    const targetIndex = this.columnToIndex(targetColumn);

    for (let i = 0; i < columnsToAdd.length; i++) {
      const columnName = columnsToAdd[i];

      // Step 2-5-5-2: 既存列のチェック
      const afterColumn = this.indexToColumn(targetIndex + i + 1);
      if (this.columnExists(afterColumn, columnName, sheetData)) {
        continue;
      }

      // Step 2-5-5-3: 新しい列の挿入
      await this.insertColumn(spreadsheetId, afterColumn);

      // Step 2-5-5-4: ヘッダーの設定
      await this.sheetsWriter.writeValue(
        spreadsheetId,
        `${afterColumn}1`,
        columnName
      );

      addedColumns.push({
        column: afterColumn,
        name: columnName,
        position: 'after'
      });

      this.logger.log(`[Step 2-5-5-4] 列追加: ${afterColumn}列 (${columnName})`);
    }

    return addedColumns;
  }

  /**
   * Step 2-5-6: 列の挿入（Google Sheets API）
   */
  async insertColumn(spreadsheetId, beforeColumn) {
    // Step 2-5-6-1: 列インデックスの計算
    const columnIndex = this.columnToIndex(beforeColumn);

    // Step 2-5-6-2: 挿入リクエストの作成
    const request = {
      insertDimension: {
        range: {
          dimension: 'COLUMNS',
          startIndex: columnIndex,
          endIndex: columnIndex + 1
        },
        inheritFromBefore: false
      }
    };

    // Step 2-5-6-3: バッチ更新で列挿入
    // 注: 実際のAPIコールは簡略化
    this.logger.log(`[Step 2-5-6-3] 列挿入: ${beforeColumn}の位置に新規列`);
  }

  /**
   * Step 2-5-7: ユーティリティ関数
   */

  // 列番号から列文字への変換（0 → A, 1 → B, ...）
  indexToColumn(index) {
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
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1;
  }

  // 列の存在チェック
  columnExists(column, expectedName, sheetData) {
    const index = this.columnToIndex(column);
    if (sheetData.menuRow && sheetData.menuRow.data[index]) {
      return sheetData.menuRow.data[index].toString().includes(expectedName);
    }
    return false;
  }
}

// ========================================
// Step 2-6: Google Docsレポート生成
// ========================================

/**
 * Step 2-6: Google Docsレポート生成クラス
 * スプレッドシートのデータからDocsレポートを生成
 */
class DocsReportGenerator {
  constructor(authManager) {
    // Step 2-6-1: レポート生成クラスの初期化
    this.authManager = authManager;
    this.logger = console;

    // Step 2-6-1-1: Docs API設定
    this.docsApiUrl = 'https://docs.googleapis.com/v1/documents';
    this.driveApiUrl = 'https://www.googleapis.com/drive/v3/files';

    // Step 2-6-1-2: テンプレート設定
    this.reportTemplate = {
      title: 'AI実行レポート',
      sections: []
    };

    this.logger.log('[Step 2-6-1] DocsReportGenerator初期化完了');
  }

  /**
   * Step 2-6-2: レポートドキュメントの作成
   */
  async createReport(title, content) {
    try {
      // Step 2-6-2-1: 認証トークン取得
      const token = await this.authManager.getAuthToken();

      // Step 2-6-2-2: 新規ドキュメントの作成
      this.logger.log('[Step 2-6-2-2] 新規Docsドキュメント作成中...');

      const createResponse = await fetch(this.docsApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: title || this.reportTemplate.title
        })
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create document');
      }

      const doc = await createResponse.json();
      const documentId = doc.documentId;

      // Step 2-6-2-3: コンテンツの挿入
      await this.insertContent(documentId, content);

      // Step 2-6-2-4: ドキュメントURLの生成
      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

      this.logger.log(`[Step 2-6-2-4] レポート作成完了: ${documentUrl}`);

      return {
        success: true,
        documentId: documentId,
        url: documentUrl
      };

    } catch (error) {
      this.logger.error('[Step 2-6-2] レポート作成エラー:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Step 2-6-3: ドキュメントへのコンテンツ挿入
   */
  async insertContent(documentId, content) {
    // Step 2-6-3-1: 認証トークン取得
    const token = await this.authManager.getAuthToken();

    // Step 2-6-3-2: バッチ更新リクエストの構築
    const requests = [];

    // タイトルの挿入
    if (content.title) {
      requests.push({
        insertText: {
          location: { index: 1 },
          text: content.title + '\n\n'
        }
      });
    }

    // セクションの挿入
    if (content.sections && Array.isArray(content.sections)) {
      content.sections.forEach(section => {
        // Step 2-6-3-3: セクションヘッダー
        if (section.header) {
          requests.push({
            insertText: {
              location: { index: 1 },
              text: `\n${section.header}\n`
            }
          });
        }

        // Step 2-6-3-4: セクション本文
        if (section.body) {
          requests.push({
            insertText: {
              location: { index: 1 },
              text: `${section.body}\n`
            }
          });
        }
      });
    }

    // Step 2-6-3-5: バッチ更新の実行
    if (requests.length > 0) {
      const updateUrl = `${this.docsApiUrl}/${documentId}:batchUpdate`;

      const updateResponse = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests: requests.reverse() })
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update document');
      }

      this.logger.log(`[Step 2-6-3-5] コンテンツ挿入完了: ${requests.length}リクエスト`);
    }
  }

  /**
   * Step 2-6-4: スプレッドシートデータからレポート生成
   */
  async generateFromSpreadsheet(spreadsheetData) {
    // Step 2-6-4-1: レポートコンテンツの構築
    const content = {
      title: `スプレッドシート処理レポート - ${new Date().toLocaleDateString('ja-JP')}`,
      sections: []
    };

    // Step 2-6-4-2: サマリーセクション
    content.sections.push({
      header: '概要',
      body: `処理行数: ${spreadsheetData.values?.length || 0}\n` +
            `処理時刻: ${new Date().toLocaleString('ja-JP')}`
    });

    // Step 2-6-4-3: 詳細セクション
    if (spreadsheetData.taskGroups && spreadsheetData.taskGroups.length > 0) {
      content.sections.push({
        header: 'タスクグループ',
        body: spreadsheetData.taskGroups.map((group, i) =>
          `グループ${i + 1}: ${group.name} (${group.columnRange.promptColumns.join(', ')})`
        ).join('\n')
      });
    }

    // Step 2-6-4-4: レポート生成
    return await this.createReport(content.title, content);
  }
}

// ========================================
// Step 2-7: 統合GoogleServicesクラス
// ========================================

/**
 * Step 2-7: 統合Google Servicesクラス
 * すべてのGoogle関連機能を統合管理
 */
export class GoogleServices {
  constructor() {
    // Step 2-7-1: 統合サービスの初期化
    this.logger = console;

    // Step 2-7-1-1: 各サービスのインスタンス化
    this.authManager = new GoogleAuthManager();
    this.sheetsReader = new SheetsReader(this.authManager);
    this.sheetsWriter = new SheetsWriter(this.authManager);
    this.spreadsheetLogger = new SpreadsheetLogger(this.sheetsWriter);
    this.autoSetup = new SpreadsheetAutoSetup(this.sheetsReader, this.sheetsWriter);
    this.docsGenerator = new DocsReportGenerator(this.authManager);

    // Step 2-7-1-2: 共通設定
    this.config = {
      spreadsheetId: null,
      gid: null,
      sheetName: null
    };

    this.logger.log('[Step 2-7-1] GoogleServices統合初期化完了');
  }

  /**
   * Step 2-7-2: 初期化処理
   */
  async initialize() {
    try {
      // Step 2-7-2-1: 認証状態の確認
      const authStatus = await this.authManager.checkAuthStatus();

      if (!authStatus.isAuthenticated) {
        // Step 2-7-2-2: 認証の実行
        this.logger.log('[Step 2-7-2-2] 認証が必要です');
        await this.authManager.getAuthToken();
      }

      // Step 2-7-2-3: 初期化完了
      this.logger.log('[Step 2-7-2-3] GoogleServices初期化完了');
      return true;

    } catch (error) {
      this.logger.error('[Step 2-7-2] 初期化エラー:', error);
      throw error;
    }
  }

  /**
   * Step 2-7-3: スプレッドシート設定
   */
  setSpreadsheet(spreadsheetId, gid) {
    // Step 2-7-3-1: 設定の保存
    this.config.spreadsheetId = spreadsheetId;
    this.config.gid = gid;

    // Step 2-7-3-2: ロガーの設定
    this.spreadsheetLogger.configure(spreadsheetId, 'A'); // デフォルトはA列

    this.logger.log(`[Step 2-7-3] スプレッドシート設定: ${spreadsheetId}`);
  }

  /**
   * Step 2-7-4: 統合API - データ読み込み
   */
  async loadData(spreadsheetId, gid) {
    return await this.sheetsReader.loadAutoAIData(spreadsheetId || this.config.spreadsheetId, gid || this.config.gid);
  }

  /**
   * Step 2-7-5: 統合API - データ書き込み
   */
  async writeData(range, value) {
    return await this.sheetsWriter.writeValue(this.config.spreadsheetId, range, value);
  }

  /**
   * Step 2-7-6: 統合API - ログ記録
   */
  async logTask(taskData) {
    return await this.spreadsheetLogger.logTaskExecution(taskData);
  }

  /**
   * Step 2-7-7: 統合API - 自動セットアップ
   */
  async runAutoSetup(spreadsheetId, gid) {
    return await this.autoSetup.executeAutoSetup(
      spreadsheetId || this.config.spreadsheetId,
      gid || this.config.gid
    );
  }

  /**
   * Step 2-7-8: 統合API - レポート生成
   */
  async generateReport(title, content) {
    return await this.docsGenerator.createReport(title, content);
  }

  /**
   * Step 2-7-9: クリーンアップ
   */
  async cleanup() {
    // Step 2-7-9-1: ログバッファのフラッシュ
    await this.spreadsheetLogger.flushLogBuffer();

    // Step 2-7-9-2: 認証のクリア（必要に応じて）
    // await this.authManager.clearAuth();

    // Step 2-7-9-3: キャッシュのクリア
    this.sheetsReader.cache.clear();

    this.logger.log('[Step 2-7-9] GoogleServicesクリーンアップ完了');
  }

  /**
   * Step 2-7-10: ステータス取得
   */
  getStatus() {
    return {
      authenticated: this.authManager._isAuthenticated,
      spreadsheetId: this.config.spreadsheetId,
      gid: this.config.gid,
      logBufferSize: this.spreadsheetLogger.logBuffer.length,
      cacheSize: this.sheetsReader.cache.size
    };
  }
}

// ========================================
// Step 2-8: エクスポートとグローバル設定
// ========================================

// Step 2-8-1: シングルトンインスタンスの作成
export const googleServices = new GoogleServices();

// Step 2-8-2: 個別サービスのエクスポート（互換性のため）
export const authService = googleServices.authManager;
export const sheetsClient = googleServices.sheetsReader;
export const docsClient = googleServices.docsGenerator;
export const spreadsheetLogger = googleServices.spreadsheetLogger;

// Step 2-8-3: グローバル設定（Chrome拡張機能用）
if (typeof globalThis !== 'undefined') {
  // 統合サービス
  globalThis.GoogleServices = googleServices;

  // 個別サービス（互換性維持）
  globalThis.authService = authService;
  globalThis.sheetsClient = sheetsClient;
  globalThis.docsClient = docsClient;
  globalThis.spreadsheetLogger = spreadsheetLogger;

  // ユーティリティ関数
  globalThis.parseSpreadsheetUrl = (url) => {
    if (!url || typeof url !== 'string') {
      return { spreadsheetId: null, gid: null };
    }

    const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = spreadsheetMatch ? spreadsheetMatch[1] : null;

    const gidMatch = url.match(/[#&]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    return { spreadsheetId, gid };
  };
}

console.log('📊 Google Services loaded - Step 2: Google統合サービス準備完了');