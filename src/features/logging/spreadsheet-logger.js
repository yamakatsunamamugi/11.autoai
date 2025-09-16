/**
 * @fileoverview スプレッドシートログ記録システム
 * 
 * 【役割】
 * AI実行時の詳細ログをスプレッドシートのログ列に記録
 * 
 * 【主要機能】
 * - ログフォーマット生成
 * - タイムスタンプ管理
 * - スプレッドシートへの書き込み
 * - 既存ログとのマージ処理
 */

// 依存関係: sleep-utils.jsから1-ai-common-base.jsに移行
import { getGlobalAICommonBase } from '../../../automations/1-ai-common-base.js';
import { ModelExtractor } from './extractors/model-extractor.js';
import { FunctionExtractor } from './extractors/function-extractor.js';
import { ConsoleLogger } from '../../utils/console-logger.js';
import { getService } from '../../core/service-registry.js';

export class SpreadsheetLogger {
  constructor(logger = console) {
    // ConsoleLoggerインスタンスを作成（シンプルなログ用）
    this.logger = new ConsoleLogger('spreadsheet-logger', logger);

    // AI共通基盤からsleep関数を取得
    this.aiCommonBase = getGlobalAICommonBase();
    this.modelExtractor = ModelExtractor;
    this.functionExtractor = FunctionExtractor;
    this.sendTimestamps = new Map(); // key: taskId, value: { time: Date, aiType: string, model: string }
    this.pendingLogs = new Map(); // key: row, value: array of log entries
    this.writingInProgress = new Set(); // Set of cells currently being written

    // タイムアウト管理（メモリリーク防止）
    this.pendingLogTimeouts = new Map(); // key: row, value: timeoutId
    this.PENDING_LOG_TIMEOUT = 10 * 60 * 1000; // 10分でタイムアウト

    // 統計情報
    this.stats = {
      totalGroups: 0,
      completedGroups: 0,
      timeoutGroups: 0,
      errorGroups: 0
    };

    // SheetsClientのキャッシュ（遅延初期化用）
    this._sheetsClient = null;
  }

  /**
   * SheetsClientを取得（遅延初期化対応）
   * @returns {Object|null} SheetsClientインスタンス
   */
  async getSheetsClient() {
    if (!this._sheetsClient) {
      try {
        // ServiceRegistryから取得（static import使用）
        this._sheetsClient = await getService('sheetsClient');
        // [Step 0-1: SheetsClient取得]
        this.logger.log('[Step 0-1: SheetsClient取得] SheetsClientをServiceRegistryから取得しました');
      } catch (error) {
        this.logger.warn('[Step 0-1: SheetsClient取得失敗] ServiceRegistryからの取得に失敗:', error.message);
      }
    }
    return this._sheetsClient;
  }

  /**
   * AI切り替えイベントをログに記録
   * @param {Object} eventData - イベントデータ
   * @param {string} eventData.cell - セル位置
   * @param {string} eventData.fromAI - 元のAI
   * @param {string} eventData.toAI - 切り替え先のAI
   * @param {string} eventData.fromFunction - 元の機能
   * @param {string} eventData.toFunction - 切り替え先の機能
   * @param {string} eventData.toModel - 切り替え先のモデル
   * @param {string} eventData.reason - 切り替え理由
   * @param {string} eventData.timestamp - タイムスタンプ
   * @param {string} eventData.taskId - タスクID
   */
  async logAISwitchEvent(eventData) {
    const logEntry = {
      type: 'AI_SWITCH',
      timestamp: eventData.timestamp || new Date().toLocaleString('ja-JP'),
      cell: eventData.cell,
      details: `🔄 AI自動切り替え: ${eventData.fromAI}→${eventData.toAI}`,
      fromAI: eventData.fromAI,
      toAI: eventData.toAI,
      fromFunction: eventData.fromFunction || '通常',
      toFunction: eventData.toFunction,
      toModel: eventData.toModel,
      reason: eventData.reason,
      taskId: eventData.taskId
    };

    // [Step 1-1: AI切り替えイベント記録]
    this.logger.log('[Step 1-1: AI切り替えイベント記録]', logEntry);
    
    // 送信時刻記録に追加（切り替え情報付き）
    if (eventData.taskId) {
      this.sendTimestamps.set(eventData.taskId, {
        time: new Date(),
        aiType: eventData.toAI,
        model: eventData.toModel,
        aiSwitched: true,
        switchFrom: eventData.fromAI
      });
    }
    
    return logEntry;
  }

  /**
   * AI切り替え成功をログに記録
   * @param {Object} successData - 成功データ
   */
  async logAISwitchSuccess(successData) {
    const logEntry = {
      type: 'AI_SWITCH_SUCCESS',
      timestamp: successData.timestamp || new Date().toLocaleString('ja-JP'),
      cell: successData.cell,
      details: `✅ AI切り替え成功: ${successData.fromAI}→${successData.toAI}`,
      model: successData.model,
      function: successData.function,
      responseLength: successData.responseLength
    };
    this.logger.log('[Step 1-2: AI切り替え成功記録]', logEntry);
    return logEntry;
  }

  /**
   * 送信時刻を記録
   * @param {string} taskId - タスクID
   * @param {Object} info - 追加情報
   * @param {string} info.aiType - AI種別
   * @param {string} info.model - モデル名
   */
  recordSendTime(taskId, info = {}) {
    const timestamp = new Date();
    this.sendTimestamps.set(taskId, {
      time: timestamp,
      aiType: info.aiType || 'Unknown',
      model: info.model || '不明'
    });

    this.logger.log(`[Step 2-1: 送信時刻記録] タスク=${taskId}, 時刻=${timestamp.toLocaleString('ja-JP')}`);
  }

  /**
   * 送信時刻を記録（タスクオブジェクト版）
   * @param {string} taskId - タスクID
   * @param {Object} task - タスクオブジェクト全体
   */
  recordSendTimestamp(taskId, task) {
    const timestamp = new Date();
    this.sendTimestamps.set(taskId, {
      time: timestamp,
      aiType: task.aiType || 'Claude',
      model: task.model || 'Claude Opus 4.1',  // getModel()で既に設定済みのはず
      function: task.function || '通常',
      row: task.row,
      column: task.column
    });

    this.logger.log(`[Step 2-1: 送信時刻記録] タスク=${taskId}, モデル=${task.model}, 機能=${task.function}, 時刻=${timestamp.toLocaleString('ja-JP')}`);
  }

  /**
   * 送信時刻を取得
   * @param {string} taskId - タスクID
   * @returns {Object|null} 送信時刻情報
   */
  getSendTime(taskId) {
    return this.sendTimestamps.get(taskId) || null;
  }

  /**
   * ログエントリーをフォーマット
   * @param {Object} task - タスクオブジェクト
   * @param {string} url - 現在のURL
   * @param {Date} sendTime - 送信時刻
   * @param {Date} writeTime - 記載時刻
   * @returns {string} フォーマット済みログ
   */
  formatLogEntry(task, url, sendTime, writeTime) {
    const aiType = task.aiType || 'Unknown';
    const selectedModel = task.model || '通常';
    const displayedModel = task.displayedModel || '不明';
    // 常に両方のモデルを表示する形式に変更
    const model = `選択: ${selectedModel} / 表示: ${displayedModel}`;
    const selectedFunction = task.function || task.specialOperation || '通常';
    const displayedFunction = task.displayedFunction || '不明';
    
    // 機能も同様に常に両方表示
    const functionName = `選択: ${selectedFunction} / 表示: ${displayedFunction}`;
    
    // [Step 3-1: モデル情報デバッグ]
    this.logger.debug('[Step 3-1: モデル情報デバッグ] formatLogEntry完全情報:', {
      'task.model': task.model,
      'task.displayedModel': task.displayedModel,
      selectedModel,
      displayedModel,
      model,
      'task.function': task.function,  
      'task.displayedFunction': task.displayedFunction,
      selectedFunction,
      displayedFunction,
      functionName
    });
    
    // 経過時間を計算（秒単位）
    const elapsedMs = writeTime.getTime() - sendTime.getTime();
    const elapsedSeconds = Math.round(elapsedMs / 1000);
    
    // 日本語フォーマット
    const sendTimeStr = sendTime.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const writeTimeStr = writeTime.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // AI名を日本語表記に
    const aiDisplayName = this.getAIDisplayName(aiType);
    
    // 常にテキスト形式で返す（CONCATENATE関数を使わない）
    const logEntry = [
      `---------- ${aiDisplayName} ----------`,
      `モデル: ${model}`,
      `機能: ${functionName}`,
      `URL: ${url || 'URLが取得できませんでした'}`,
      `送信時刻: ${sendTimeStr}`,
      `記載時刻: ${writeTimeStr} (${elapsedSeconds}秒後)`
    ].join('\n');
    
    return logEntry;
  }

  /**
   * AI名を日本語表記に変換
   * @param {string} aiType - AI種別
   * @returns {string} 日本語表記のAI名
   */
  getAIDisplayName(aiType) {
    const nameMap = {
      'chatgpt': 'ChatGPT',
      'claude': 'Claude',
      'gemini': 'Gemini',
      'gpt': 'ChatGPT',
      'openai': 'ChatGPT'
    };
    
    const lowerType = (aiType || '').toLowerCase();
    return nameMap[lowerType] || aiType || '不明';
  }

  /**
   * 既存ログと新規ログをマージ
   * @param {string} existingLog - 既存のログ
   * @param {string} newLog - 新規ログ
   * @param {string} aiType - AI種別（重複チェック用）
   * @returns {string} マージ済みログ
   */
  mergeWithExistingLog(existingLog, newLog, aiType = '') {
    // [Step 3-3: マージ処理開始]
    this.logger.log('[Step 3-3: マージ処理開始] 🔄 マージ処理開始:', {
      aiType,
      hasExistingLog: !!existingLog && existingLog.trim() !== '',
      existingLength: existingLog.length,
      newLogLength: newLog.length
    });
    
    if (!existingLog || existingLog.trim() === '') {
      // [Step 3-3-1: 新規ログ追加]
      this.logger.log(`[Step 3-3-1: 新規ログ追加] ➕ 空のログに新規追加 (AI: ${aiType})`);
      return newLog;
    }
    
    // AIタイプから日本語表記を取得
    const aiDisplayName = this.getAIDisplayName(aiType);
    // [Step 3-2: AI名変換]
    this.logger.log(`[Step 3-2: AI名変換] 🔍 AI名変換: ${aiType} → ${aiDisplayName}`);
    
    // 既存ログに同じAIのログが既に存在するかチェック
    const duplicateCheck = existingLog.includes(`---------- ${aiDisplayName} ----------`);
    this.logger.log('[Step 3-3-2: 重複チェック] 🔍 重複チェック結果:', {
      aiDisplayName,
      isDuplicate: duplicateCheck,
      searchPattern: `---------- ${aiDisplayName} ----------`
    });
    
    if (duplicateCheck) {
      this.logger.warn(`[Step 3-3-3: ログ上書き] ⚠️ 既存の${aiDisplayName}ログを上書き更新`);
      
      // 同じAIのログ部分を新しいログで置換
      // 正規表現のエスケープを修正
      const escapedName = aiDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const logPattern = new RegExp(`---------- ${escapedName} ----------[\\s\\S]*?(?=\\n\\n---------- |$)`, 'g');
      const updatedLog = existingLog.replace(logPattern, newLog);
      
      this.logger.log('[Step 3-3-4: 置換処理] 🔄 置換処理結果:', {
        succeeded: updatedLog !== existingLog,
        originalLength: existingLog.length,
        updatedLength: updatedLog.length
      });
      
      // 置換に失敗した場合は末尾に追加
      if (updatedLog === existingLog) {
        this.logger.warn('[Step 3-3-5: 置換失敗] ⚠️ 置換失敗、末尾に追加');
        return `${existingLog}\n\n═══════════════════════\n\n${newLog}`;
      }
      
      return updatedLog;
    }
    
    // 新しいAIのログなので末尾に追加
    this.logger.log(`[Step 3-3-6: 末尾追加] ➕ 新しいAIログを末尾に追加 (AI: ${aiDisplayName})`);
    return `${existingLog}\n\n═══════════════════════\n\n${newLog}`;
  }

  /**
   * ログ列の妥当性を検証
   * @param {string} logColumn - 検証するログ列
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<{isValid: boolean, validLogColumns: Array, error?: string}>}
   */
  async validateLogColumn(logColumn, spreadsheetData) {
    try {
      // スプレッドシートデータがない場合は検証をスキップ（デフォルトを許可）
      if (!spreadsheetData || !spreadsheetData.menuRow) {
        this.logger.warn('[Step 4-2: ログ列検証スキップ] ⚠️ スプレッドシートデータが提供されていないため、ログ列検証をスキップ');
        return {
          isValid: true,
          validLogColumns: [logColumn],
          warning: 'スプレッドシートデータなしで続行'
        };
      }
      
      // メニュー行から「ログ」という名前の列を検索
      const validLogColumns = [];
      const menuRowData = spreadsheetData.menuRow.data || [];
      
      for (let i = 0; i < menuRowData.length; i++) {
        const cellValue = menuRowData[i];
        if (cellValue && typeof cellValue === 'string' && cellValue.trim() === 'ログ') {
          const columnLetter = this.indexToColumn(i);
          validLogColumns.push(columnLetter);
        }
      }
      
      // 有効なログ列が見つからない場合（デフォルトB列を許可）
      if (validLogColumns.length === 0) {
        this.logger.warn('[Step 4-2-1: デフォルト列使用] ⚠️ メニュー行に「ログ」列が見つかりません。デフォルトB列を許可');
        return {
          isValid: true,
          validLogColumns: ['B'],
          warning: 'ログ列が見つからないため、デフォルトB列を使用'
        };
      }
      
      // 指定されたログ列が有効なログ列に含まれているかチェック
      const isValid = validLogColumns.includes(logColumn);
      
      if (!isValid) {
        return {
          isValid: false,
          validLogColumns: validLogColumns,
          error: `指定されたログ列 ${logColumn} は有効なログ列ではありません`
        };
      }
      
      return {
        isValid: true,
        validLogColumns: validLogColumns
      };
      
    } catch (error) {
      this.logger.error(`[Step 4-2-2: 検証エラー] ❌ ログ列検証エラー: ${error.message}`);
      // エラーが発生した場合は安全のため続行を許可
      return {
        isValid: true,
        validLogColumns: [logColumn],
        warning: `検証エラー: ${error.message}`
      };
    }
  }
  
  /**
   * 列インデックスを列名（A, B, C...）に変換
   * @param {number} index - 列インデックス（0ベース）
   * @returns {string} 列名
   */
  indexToColumn(index) {
    let column = '';
    while (index >= 0) {
      column = String.fromCharCode((index % 26) + 65) + column;
      index = Math.floor(index / 26) - 1;
    }
    return column;
  }

  /**
   * スプレッドシートにログを書き込み
   * @param {Object} task - タスクオブジェクト
   * @param {Object} options - オプション
   * @param {string} options.url - 現在のURL
   * @param {Object} options.sheetsClient - SheetsClientインスタンス
   * @param {string} options.spreadsheetId - スプレッドシートID
   * @param {string} options.gid - シートGID
   * @param {boolean} options.isFirstTask - 最初のタスクかどうか
   * @param {boolean} options.isGroupTask - 3種類AIグループタスクかどうか
   * @param {boolean} options.isLastInGroup - グループ最後のタスクかどうか
   * @param {Function} options.onComplete - 書き込み完了時のコールバック
   * @param {boolean} options.enableWriteVerification - 書き込み確認を有効にするかどうか
   * @returns {Promise<{success: boolean, verified: boolean, error?: string}>}
   */
  async writeLogToSpreadsheet(task, options = {}) {
    try {
      const { url, sheetsClient, spreadsheetId, gid } = options;
      
      this.logger.log('[Step 4-1: ログ書き込み開始] 🔍 ログ書き込み開始:', {
        taskId: task.id,
        row: task.row,
        logColumns: task.logColumns,
        sheetsClient: !!sheetsClient,
        spreadsheetId: !!spreadsheetId,
        gid: gid
      });
      
      if (!sheetsClient || !spreadsheetId) {
        this.logger.error('[Step 4-1-1: エラー] ❌ SheetsClientまたはスプレッドシートIDが未設定');
        return {
          success: false,
          verified: false,
          error: 'SheetsClientまたはスプレッドシートIDが未設定'
        };
      }
      
      // タスクからログ列を取得（ハードコーディングしない）
      const logColumn = task.logColumns?.[0] || 'B'; // デフォルトはB列
      
      // ログ列の妥当性を検証
      const validationResult = await this.validateLogColumn(logColumn, options.spreadsheetData);
      if (!validationResult.isValid) {
        this.logger.error('[Step 4-2-3: 不正なログ列] ❌ 不正なログ列が指定されました:', {
          指定されたログ列: logColumn,
          有効なログ列: validationResult.validLogColumns,
          エラー: validationResult.error,
          タスク: `${task.column}${task.row}`,
          タスクID: task.id
        });
        
        // エラーを返すが処理は続行（ログ書き込みはスキップ）
        return {
          success: false,
          verified: false,
          error: `不正なログ列: ${logColumn}。有効なログ列: ${validationResult.validLogColumns.join(', ')}`
        };
      }
      
      const logCell = `${logColumn}${task.row}`;
      
      // デバッグ: ログセルの詳細確認
      this.logger.debug('[Step 4-1-2: ログセル詳細] 🔍 ログセル詳細デバッグ:', {
        logColumn: logColumn,
        taskRow: task.row,
        結果セル: logCell,
        logColumn型: typeof logColumn,
        有効な列名: /^[A-Z]+$/.test(logColumn),
        logColumns配列: task.logColumns
      });
      
      this.logger.log(`[Step 4-1-3: ログセル特定] 📍 ログセル特定: ${logCell} (logColumns: ${JSON.stringify(task.logColumns)})`);

      // 送信時刻を取得
      const sendTimeInfo = this.getSendTime(task.id);
      this.logger.log('[Step 4-1-4: 送信時刻確認] ⏰ 送信時刻情報:', {
        taskId: task.id,
        sendTimeInfo: sendTimeInfo,
        availableTaskIds: Array.from(this.sendTimestamps.keys())
      });
      
      if (!sendTimeInfo) {
        this.logger.warn(`[Step 4-1-5: 送信時刻なし] ⚠️ タスク${task.id}の送信時刻が記録されていません`);
        return {
          success: false,
          verified: false,
          error: `タスク${task.id}の送信時刻が記録されていません`
        };
      }
      
      // 記載時刻（現在時刻）
      const writeTime = new Date();
      
      // ログエントリーを生成
      let newLog;
      let mergedLog;
      try {
        newLog = this.formatLogEntry(
          task,
          url || (typeof window !== 'undefined' ? window.location.href : 'N/A'),
          sendTimeInfo.time,
          writeTime
        );
      } catch (formatError) {
        this.logger.error('[Step 3-1-1: フォーマットエラー] formatLogEntryエラー:', formatError);
        this.logger.error('[Step 3-1-2: エラー詳細] エラー詳細:', {
          errorMessage: formatError.message,
          errorStack: formatError.stack,
          taskData: {
            id: task.id,
            aiType: task.aiType,
            model: task.model,
            function: task.function,
            row: task.row,
            column: task.column
          },
          sendTimeInfo: sendTimeInfo,
          url: url
        });
        // フォールバック: シンプルなログを生成
        newLog = `${task.aiType || 'Unknown'} - ${writeTime.toLocaleString('ja-JP')} - エラーにより簡易ログ`;
      }
      
      // mergedLogを初期化（デフォルトは新規ログ）
      mergedLog = newLog;
      
      // 3種類AIグループタスクの場合、段階的にログを記載
      this.logger.log(`[Step 5-1: グループタスク判定] isGroupTask=${options.isGroupTask}`);
      if (options.isGroupTask) {
        const rowKey = `${task.row}`;
        
        try {
          // ログ保存用のMapを初期化
          if (!this.pendingLogs.has(rowKey)) {
            this.pendingLogs.set(rowKey, []);
            this.stats.totalGroups++;
            
            // タイムアウト設定（メモリリーク防止）
            const timeoutId = setTimeout(() => {
              this.logger.warn(`[Step 5-3: グループログタイムアウト] ⏰ グループログタイムアウト: 行${task.row}`);
              this._cleanupPendingLog(rowKey, 'timeout');
              this.stats.timeoutGroups++;
            }, this.PENDING_LOG_TIMEOUT);
            
            this.pendingLogTimeouts.set(rowKey, timeoutId);
          }
          
          // 現在のログを追加（AIタイプ、内容、URL）
          this.pendingLogs.get(rowKey).push({
            aiType: sendTimeInfo.aiType,
            content: newLog,
            url: url || (typeof window !== 'undefined' ? window.location.href : 'N/A'),
            timestamp: new Date()
          });
          
          const pendingLogsForRow = this.pendingLogs.get(rowKey);
          this.logger.log(`[Step 5-1-1: グループログ処理] 📦 グループログ処理: ${logCell} (AI: ${sendTimeInfo.aiType}) - 累積${pendingLogsForRow.length}件`);
          
          // 現在までのログをすべて結合（1つ目、2つ目、3つ目と増えていく）
          mergedLog = this.combineGroupLogs(pendingLogsForRow);
          this.logger.success(`[Step 5-2: 段階的ログ結合] ✅ 段階的ログ結合: ${pendingLogsForRow.length}件 → ${mergedLog.length}文字 (${logCell})`);
          
          // 統計情報の更新
          if (pendingLogsForRow.length === 3) {
            this.stats.completedGroups++;
            // 3つ揃ったらタイムアウトをクリア
            this._clearTimeout(rowKey);
            // 最後のタスクの場合のみクリーンアップ（次回実行のため）
            if (options.isLastInGroup) {
              this._cleanupPendingLog(rowKey, 'completed');
            }
          }
          
          // 送信時刻をクリア（メモリ節約）
          this.sendTimestamps.delete(task.id);
          
          // ここでmergedLogを書き込むため、returnせずに処理を続行
          
        } catch (error) {
          this.logger.error(`[Step 5-1-2: グループログエラー] ❌ グループログ処理エラー: ${error.message}`);
          this.stats.errorGroups++;
          // エラー時でも個別ログを使用（フェールセーフ）
          mergedLog = newLog;
        }
      }
      
      // グループタスクではない通常タスクの処理
      if (!options.isGroupTask) {
        if (options.isFirstTask) {
          // 通常の最初のタスク：新規作成
          this.logger.log(`[Step 4-3: ログ新規作成] 🔄 ログをクリアして新規作成: ${logCell}`);
          // mergedLogはそのまま使用（既に設定済み）
        } else {
          // 通常の2回目以降：既存ログに追加
          let existingLog = '';
          try {
            this.logger.log(`[Step 4-3-1: 既存ログ取得] 🔍 既存ログ取得開始: ${logCell} (AI: ${sendTimeInfo.aiType})`);
            const sheetsClient = await this.getSheetsClient();
            if (!sheetsClient) {
              this.logger.warn('[Step 4-3-2: SheetsClient未初期化] ⚠️ SheetsClient未初期化 - 既存ログ読み込みスキップ');
              return;
            }
            const response = await sheetsClient.getSheetData(
              spreadsheetId,
              logCell,
              gid
            );
            existingLog = response?.values?.[0]?.[0] || '';
            this.logger.log('[Step 4-3-3: 既存ログ内容] 📄 既存ログ内容', {
              aiType: sendTimeInfo.aiType,
              hasContent: !!existingLog,
              preview: existingLog.substring(0, 100) + (existingLog.length > 100 ? '...' : '')
            });
          } catch (error) {
            // 既存ログの取得に失敗しても続行
            this.logger.warn(`[Step 4-3-4: 既存ログ取得失敗] ⚠️ 既存ログの取得に失敗: ${error.message}`);
          }
          
          // 既存ログに追加（上書きではなく追加）
          if (existingLog && existingLog.trim() !== '') {
            // 通常タスク：既存ログとマージ（同じAIのログは置換）
            mergedLog = this.mergeWithExistingLog(existingLog, mergedLog, sendTimeInfo.aiType);
            this.logger.log(`[Step 4-3-5: ログマージ完了] 🔄 既存ログとマージ完了 (AI: ${sendTimeInfo.aiType})`);
          } else {
            this.logger.log(`[Step 4-3-6: 新規ログ作成] ➕ 新規ログ作成 (AI: ${sendTimeInfo.aiType})`);
          }
        }
      }
      
      // スプレッドシートに書き込み（リッチテキスト対応）
      this.logger.log('[Step 4-4: スプレッドシート書き込み実行] 💾 スプレッドシート書き込み実行:', {
        spreadsheetId,
        logCell,
        gid,
        logLength: mergedLog.length
      });
      
      // リッチテキストデータを構築
      const richTextData = this.parseLogToRichText(mergedLog);
      
      // リッチテキストメソッドが利用可能な場合は使用、そうでなければ通常の更新
      // タイムアウト付きでAPI呼び出しを実行
      const writeWithTimeout = async (writePromise, timeoutMs = 30000) => {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('スプレッドシート書き込みタイムアウト')), timeoutMs)
        );
        return Promise.race([writePromise, timeoutPromise]);
      };
      
      try {
        const sheetsClient = await this.getSheetsClient();
        if (!sheetsClient) {
          this.logger.warn('[Step 4-4-1: SheetsClient未初期化] ⚠️ SheetsClient未初期化 - ログ書き込みスキップ');
          return;
        }
        if (sheetsClient.updateCellWithRichText && richTextData.some(item => item.url)) {
          this.logger.log('[Step 4-4-2: リッチテキスト書き込み] 🔗 リッチテキスト形式で書き込み（リンク付き）');
          await writeWithTimeout(
            sheetsClient.updateCellWithRichText(
              spreadsheetId,
              logCell,
              richTextData,
              gid
            )
          );
        } else {
          // 通常のテキストとして書き込み
          await writeWithTimeout(
            sheetsClient.updateCell(
              spreadsheetId,
              logCell,
              mergedLog,
              gid
            )
          );
        }
      } catch (timeoutError) {
        this.logger.error(`[Step 4-4-3: 書き込みエラー] ❌ 書き込みエラー: ${logCell}`, timeoutError);
        // エラーでも処理は継続
      }
      
      this.logger.success(`[Step 4-4-4: 書き込み完了] ✅ ログ書き込み完了: ${logCell}`);
      
      // 書き込み確認を実行（有効な場合）
      let writeVerified = true;
      if (options.enableWriteVerification) {
        writeVerified = await this.verifyWriteSuccess(
          sheetsClient, 
          spreadsheetId, 
          logCell, 
          mergedLog, 
          gid
        );
      }
      
      // 拡張機能のログシステムにも記録
      if (globalThis.logManager) {
        globalThis.logManager.log(`📝 スプレッドシートログ書き込み完了: ${logCell}`, {
          category: 'system',
          level: writeVerified ? 'info' : 'warning',
          metadata: {
            taskId: task.id,
            logCell,
            aiType: sendTimeInfo.aiType,
            model: sendTimeInfo.model,
            elapsedSeconds: Math.round((writeTime.getTime() - sendTimeInfo.time.getTime()) / 1000),
            verified: writeVerified
          }
        });
      }
      
      // 送信時刻をクリア（メモリ節約）
      this.sendTimestamps.delete(task.id);
      
      // デバッグ: コールバックの存在確認
      this.logger.debug('[Step 4-5: コールバック確認] 🔍 コールバック確認:', {
        hasOnComplete: !!options.onComplete,
        typeOfOnComplete: typeof options.onComplete,
        isFunction: typeof options.onComplete === 'function',
        optionsKeys: Object.keys(options)
      });
      
      // 完了コールバックを実行
      if (typeof options.onComplete === 'function') {
        this.logger.log(`[Step 4-5-1: コールバック実行] 🔔 完了コールバック実行: ${logCell}`);
        try {
          await options.onComplete(task, logCell, writeVerified);
          this.logger.success(`[Step 4-5-2: コールバック成功] ✅ コールバック実行成功: ${logCell}`);
        } catch (callbackError) {
          this.logger.error('[Step 4-5-3: コールバックエラー] ❌ コールバックエラー:', callbackError);
        }
      } else {
        this.logger.warn('[Step 4-5-4: コールバックなし] ⚠️ コールバックが存在しないかfunction型ではありません');
      }
      
      // 結果を返す
      return {
        success: true,
        verified: writeVerified,
        logCell
      };
      
    } catch (error) {
      // エラーが発生してもメイン処理は続行
      this.logger.error('[Step 4-6: エラーハンドリング] ログ書き込みエラー:', {
        message: error.message,
        stack: error.stack,
        taskId: task.id,
        row: task.row,
        errorName: error.name,
        errorString: error.toString()
      });

      // エラー時もコールバックを実行（エラー情報付き）
      if (typeof options.onComplete === 'function') {
        this.logger.log(`[Step 4-6-1: エラー時コールバック] 🔔 エラー時のコールバック実行`);
        try {
          await options.onComplete(task, null, false, error);
        } catch (callbackError) {
          this.logger.error(`[Step 4-6-2: コールバックエラー] ❌ コールバックエラー:`, callbackError);
        }
      }
      
      // エラー結果を返す
      return {
        success: false,
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * スプレッドシートへの書き込み成功を確認
   * @param {Object} sheetsClient - SheetsClientインスタンス
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} logCell - ログセル
   * @param {string} expectedContent - 期待される内容
   * @param {string} gid - シートGID
   * @returns {Promise<boolean>} 書き込み成功の確認結果
   */
  async verifyWriteSuccess(sheetsClient, spreadsheetId, logCell, expectedContent, gid) {
    try {
      this.logger.log(`[Step 7-1: 書き込み確認開始] 🔍 書き込み確認開始: ${logCell}`);

      // 少し待ってから確認（APIの遅延を考慮）
      // AI共通基盤のsleep関数を使用
      await this.aiCommonBase.utils.sleep(2000);  // 待機時間を増やす

      // 実際のセルの内容を取得
      const sheetsClient = await this.getSheetsClient();
      if (!sheetsClient) {
        this.logger.warn('[Step 7-1-1: SheetsClient未初期化] SheetsClient未初期化 - 検証スキップ');
        return;
      }
      const actualData = await sheetsClient.getSheetData(
        spreadsheetId,
        logCell,
        gid
      );

      // デバッグ用ログ追加
      this.logger.debug(`[Step 7-1-2: データ取得確認] 🔍 getSheetData戻り値:`, {
        logCell,
        actualDataType: typeof actualData,
        isArray: Array.isArray(actualData),
        actualDataLength: actualData?.length,
        firstRowType: actualData?.[0] ? typeof actualData[0] : 'undefined',
        firstRowIsArray: Array.isArray(actualData?.[0]),
        firstRowLength: actualData?.[0]?.length,
        actualDataPreview: JSON.stringify(actualData).substring(0, 200)
      });

      const actualContent = actualData?.[0]?.[0] || '';

      // 内容が期待された内容と一致するかチェック
      const isMatched = actualContent.length > 0 &&
                       (actualContent === expectedContent ||
                        actualContent.includes(expectedContent.substring(0, 100)));

      this.logger.log(`[Step 7-1-3: 書き込み確認結果] 📊 書き込み確認結果:`, {
        logCell,
        expectedLength: expectedContent.length,
        actualLength: actualContent.length,
        isMatched,
        preview: actualContent.substring(0, 100) + (actualContent.length > 100 ? '...' : '')
      });

      if (!isMatched) {
        this.logger.warn(`[Step 7-1-4: 書き込み確認失敗] ⚠️ 書き込み確認失敗: ${logCell} - 期待される内容と一致しません`);

        // 詳細なエラー情報をログに記録
        if (globalThis.logManager) {
          globalThis.logManager.log(`⚠️ スプレッドシート書き込み確認失敗: ${logCell}`, {
            category: 'system',
            level: 'warning',
            metadata: {
              logCell,
              expectedLength: expectedContent.length,
              actualLength: actualContent.length,
              hasContent: actualContent.length > 0
            }
          });
        }
      } else {
        this.logger.success(`[Step 7-1-5: 書き込み確認成功] ✅ 書き込み確認成功: ${logCell}`);
      }

      return isMatched;

    } catch (error) {
      this.logger.error(`[Step 7-1-6: 書き込み確認エラー] ❌ 書き込み確認エラー:`, error);

      // エラーの場合は確認失敗として扱う
      return false;
    }
  }

  /**
   * 待機処理（ヘルパーメソッド）
   * @param {number} ms - 待機時間（ミリ秒）
   * @returns {Promise<void>}
   */

  /**
   * 簡易ログ生成（送信時刻なしの場合）
   * @param {Object} task - タスクオブジェクト
   * @param {string} url - 現在のURL
   * @returns {string} フォーマット済みログ
   */
  formatSimpleLogEntry(task, url) {
    const aiType = task.aiType || 'Unknown';
    const selectedModel = task.model || '不明';
    const displayedModel = task.displayedModel || '不明';
    // 常に両方のモデルを表示する形式に変更
    const model = `選択: ${selectedModel} / 表示: ${displayedModel}`;
    const selectedFunction = task.function || task.specialOperation || '通常';
    const displayedFunction = task.displayedFunction || '不明';
    // 機能も同様に常に両方表示
    const functionName = `選択: ${selectedFunction} / 表示: ${displayedFunction}`;
    const currentTime = new Date();
    
    const timeStr = currentTime.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const aiDisplayName = this.getAIDisplayName(aiType);
    
    const logEntry = [
      `---------- ${aiDisplayName} ----------`,
      `モデル: ${model}`,
      `機能: ${functionName}`,
      `URL: ${url || 'URLが取得できませんでした'}`,
      `記載時刻: ${timeStr}`
    ].join('\n');
    
    return logEntry;
  }

  /**
   * メモリをクリア
   */
  clear() {
    this.sendTimestamps.clear();
    this.logger.log('[Step 6: メモリクリア] タイムスタンプをクリアしました');
  }

  /**
   * ログテキストをリッチテキストデータに変換
   * @param {string} logText - ログテキスト
   * @returns {Array<Object>} リッチテキストデータの配列
   */
  parseLogToRichText(logText) {
    const richTextData = [];
    const lines = logText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // URL行を検出（"URL: "で始まる行）
      if (line.startsWith('URL: ')) {
        // "URL: "部分を追加
        richTextData.push({ text: 'URL: ' });
        
        // URL部分を抽出
        const urlPart = line.substring(5); // "URL: "の後の部分
        const urlMatch = urlPart.match(/^(https?:\/\/[^\s]+)/);
        
        if (urlMatch) {
          // URLをリンクとして追加
          richTextData.push({
            text: urlMatch[1],
            url: urlMatch[1]
          });
          
          // URL以降の残りのテキストがあれば追加
          const remaining = urlPart.substring(urlMatch[1].length);
          if (remaining) {
            richTextData.push({ text: remaining });
          }
        } else {
          // URLが見つからない場合は通常テキストとして追加
          richTextData.push({ text: urlPart });
        }
      } else {
        // 通常の行はそのまま追加
        richTextData.push({ text: line });
      }
      
      // 改行を追加（最後の行以外）
      if (i < lines.length - 1) {
        richTextData.push({ text: '\n' });
      }
    }
    
    return richTextData;
  }

  /**
   * グループログを結合
   * @param {Array<Object|string>} logs - ログの配列（オブジェクトまたは文字列）
   * @returns {string} 結合されたログ
   */
  combineGroupLogs(logs) {
    // オブジェクト形式と文字列形式の両方に対応
    const normalizedLogs = logs.map(log => {
      if (typeof log === 'object' && log.content) {
        return {
          aiType: log.aiType,
          content: log.content,
          url: log.url
        };
      } else if (typeof log === 'string') {
        // 文字列から AIタイプを推測
        let aiType = 'unknown';
        if (log.includes('---------- ChatGPT ----------')) {
          aiType = 'chatgpt';
        } else if (log.includes('---------- Claude ----------')) {
          aiType = 'claude';
        } else if (log.includes('---------- Gemini ----------')) {
          aiType = 'gemini';
        }
        return {
          aiType: aiType,
          content: log,
          url: null
        };
      }
      return null;
    }).filter(log => log !== null);
    
    // AIタイプの順番を定義（ChatGPT → Claude → Gemini）
    const aiOrder = {
      'chatgpt': 1,
      'claude': 2,
      'gemini': 3,
      'unknown': 4
    };
    
    // 順番でソート
    normalizedLogs.sort((a, b) => {
      const orderA = aiOrder[a.aiType.toLowerCase()] || 999;
      const orderB = aiOrder[b.aiType.toLowerCase()] || 999;
      return orderA - orderB;
    });
    
    this.logger.log(`[Step 8-1: ログ順番ソート] 📊 ログ順番ソート結果:`,
      normalizedLogs.map(log => log.aiType));
    
    // contentのみを取り出して結合
    const sortedContents = normalizedLogs.map(log => log.content);
    
    // テキスト形式で結合（明確な区切りを追加）
    return sortedContents.join('\n\n====================\n\n');
  }
  
  /**
   * 数式ログを統合（非推奨 - テキスト形式を使用）
   * @param {Array<string>} formulaLogs - 数式ログの配列
   * @returns {string} 統合されたテキスト
   * @deprecated CONCATENATE関数は使用せず、テキスト形式で返す
   */
  mergeFormulaLogs(formulaLogs) {
    // CONCATENATE関数は使わず、テキスト形式に変換して結合
    const textLogs = formulaLogs.map(formula => {
      // 数式からテキスト部分を抽出（簡易的な処理）
      const text = formula
        .replace(/^=CONCATENATE\(/, '')
        .replace(/\)$/, '')
        .replace(/CHAR\(10\)/g, '\n')
        .replace(/HYPERLINK\([^,]+,\s*"([^"]+)"\)/g, '$1')
        .replace(/",\s*"/g, '')
        .replace(/^"|"$/g, '');
      return text;
    });
    
    // ChatGPT → Claude → Gemini の順番で並び替え
    return this.combineGroupLogs(textLogs);
  }
  
  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStatistics() {
    return {
      pendingTimestamps: this.sendTimestamps.size,
      timestamps: Array.from(this.sendTimestamps.entries()).map(([id, info]) => ({
        taskId: id,
        aiType: info.aiType,
        model: info.model,
        sendTime: info.time.toLocaleString('ja-JP')
      })),
      groups: {
        total: this.stats.totalGroups,
        completed: this.stats.completedGroups,
        timeout: this.stats.timeoutGroups,
        error: this.stats.errorGroups,
        pending: this.pendingLogs.size
      },
      pendingLogDetails: Array.from(this.pendingLogs.entries()).map(([row, logs]) => ({
        row: row,
        count: logs.length,
        aiTypes: logs.map(log => log.aiType),
        oldestTimestamp: Math.min(...logs.map(log => log.timestamp?.getTime() || Date.now()))
      }))
    };
  }

  /**
   * タイムアウトをクリア
   * @private
   * @param {string} rowKey - 行キー
   */
  _clearTimeout(rowKey) {
    const timeoutId = this.pendingLogTimeouts.get(rowKey);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingLogTimeouts.delete(rowKey);
    }
  }

  /**
   * 一時保存ログをクリーンアップ
   * @private
   * @param {string} rowKey - 行キー  
   * @param {string} reason - クリーンアップの理由
   */
  _cleanupPendingLog(rowKey, reason = 'unknown') {
    this._clearTimeout(rowKey);
    
    if (this.pendingLogs.has(rowKey)) {
      const logCount = this.pendingLogs.get(rowKey).length;
      this.pendingLogs.delete(rowKey);
      this.logger.log(`[Step 9-1: 一時ログクリーンアップ] 🧹 一時保存ログをクリーンアップ: 行${rowKey}, ${logCount}件, 理由: ${reason}`);
    }
  }

  /**
   * 全ての一時保存ログを強制クリーンアップ（デバッグ・メンテナンス用）
   */
  forceCleanupAll() {
    this.logger.warn(`[Step 10-1: 全一時ログクリーンアップ] 🧹 全一時保存ログを強制クリーンアップ`);

    // 全タイムアウトをクリア
    for (const timeoutId of this.pendingLogTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingLogTimeouts.clear();

    // 一時保存ログをクリア
    const pendingCount = this.pendingLogs.size;
    this.pendingLogs.clear();

    this.logger.success(`[Step 10-2: クリーンアップ完了] ✅ ${pendingCount}件の一時保存ログをクリーンアップ完了`);
  }

  /**
   * 部分完了グループを強制統合（フェールセーフ機能）
   * @param {string} groupId - グループID
   * @param {number} row - 行番号
   */
  async forceIntegratePartialGroup(groupId, row) {
    const rowKey = `${row}`;
    const pendingLogs = this.pendingLogs.get(rowKey);
    
    if (!pendingLogs || pendingLogs.length === 0) {
      this.logger.log(`[Step 11-1: 部分統合ログなし] 🔍 部分統合: ログなし ${rowKey}`);
      return;
    }

    this.logger.warn(`[Step 11-2: 部分統合開始] ⚠️ 部分完了グループを強制統合開始: 行${row}, ${pendingLogs.length}件のログ`);

    try {
      // 部分ログを統合
      const mergedLog = this.combineGroupLogs(pendingLogs);

      // ログセルを特定（最初のログのAIタイプを基準）
      const firstLog = pendingLogs[0];
      const logColumn = 'B'; // デフォルトのログ列
      const logCell = `${logColumn}${row}`;

      this.logger.log(`[Step 11-3: 部分統合実行] 📦 部分統合実行:`, {
        rowKey,
        logCell,
        logCount: pendingLogs.length,
        mergedLength: mergedLog.length,
        aiTypes: pendingLogs.map(log => log.aiType)
      });

      // スプレッドシートに書き込み
      const sheetsClient = await this.getSheetsClient();
      if (sheetsClient) {
        await sheetsClient.updateCell(
          globalThis.currentSpreadsheetId || '',
          logCell,
          mergedLog,
          globalThis.currentGid || '0'
        );

        this.logger.success(`[Step 11-4: 部分統合書き込み完了] ✅ 部分統合書き込み完了: ${logCell}`);
        this.stats.completedGroups++;
      } else {
        this.logger.error(`[Step 11-5: SheetsClient利用不可] ❌ SheetsClientが利用不可、部分統合失敗`);
        this.stats.errorGroups++;
      }

    } catch (error) {
      this.logger.error(`[Step 11-6: 部分統合エラー] ❌ 部分統合エラー:`, error);
      this.stats.errorGroups++;
    } finally {
      // クリーンアップ
      this._cleanupPendingLog(rowKey, 'forced-partial');
    }
  }
}

// グローバルインスタンスを作成（必要に応じて）
if (typeof globalThis !== 'undefined') {
  globalThis.spreadsheetLogger = globalThis.spreadsheetLogger || new SpreadsheetLogger();
}

export default SpreadsheetLogger;