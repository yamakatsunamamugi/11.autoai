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

export class SpreadsheetLogger {
  constructor(logger = console) {
    this.logger = logger;
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
    
    this.logger.log(`[SpreadsheetLogger] 送信時刻記録: タスク=${taskId}, 時刻=${timestamp.toLocaleString('ja-JP')}`);
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
    const model = task.model || '不明';
    const functionName = task.function || task.specialOperation || '指定なし';
    
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
    console.log(`🔄 [SpreadsheetLogger] マージ処理開始:`, {
      aiType,
      hasExistingLog: !!existingLog && existingLog.trim() !== '',
      existingLength: existingLog.length,
      newLogLength: newLog.length
    });
    
    if (!existingLog || existingLog.trim() === '') {
      console.log(`➕ [SpreadsheetLogger] 空のログに新規追加 (AI: ${aiType})`);
      return newLog;
    }
    
    // AIタイプから日本語表記を取得
    const aiDisplayName = this.getAIDisplayName(aiType);
    console.log(`🔍 [SpreadsheetLogger] AI名変換: ${aiType} → ${aiDisplayName}`);
    
    // 既存ログに同じAIのログが既に存在するかチェック
    const duplicateCheck = existingLog.includes(`---------- ${aiDisplayName} ----------`);
    console.log(`🔍 [SpreadsheetLogger] 重複チェック結果:`, {
      aiDisplayName,
      isDuplicate: duplicateCheck,
      searchPattern: `---------- ${aiDisplayName} ----------`
    });
    
    if (duplicateCheck) {
      console.log(`⚠️ [SpreadsheetLogger] 既存の${aiDisplayName}ログを上書き更新`);
      
      // 同じAIのログ部分を新しいログで置換
      // 正規表現のエスケープを修正
      const escapedName = aiDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const logPattern = new RegExp(`---------- ${escapedName} ----------[\\s\\S]*?(?=\\n\\n---------- |$)`, 'g');
      const updatedLog = existingLog.replace(logPattern, newLog);
      
      console.log(`🔄 [SpreadsheetLogger] 置換処理結果:`, {
        succeeded: updatedLog !== existingLog,
        originalLength: existingLog.length,
        updatedLength: updatedLog.length
      });
      
      // 置換に失敗した場合は末尾に追加
      if (updatedLog === existingLog) {
        console.log(`⚠️ [SpreadsheetLogger] 置換失敗、末尾に追加`);
        return `${existingLog}\n\n${newLog}`;
      }
      
      return updatedLog;
    }
    
    // 新しいAIのログなので末尾に追加
    console.log(`➕ [SpreadsheetLogger] 新しいAIログを末尾に追加 (AI: ${aiDisplayName})`);
    return `${existingLog}\n\n${newLog}`;
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
      
      console.log(`🔍 [SpreadsheetLogger] ログ書き込み開始:`, {
        taskId: task.id,
        row: task.row,
        logColumns: task.logColumns,
        sheetsClient: !!sheetsClient,
        spreadsheetId: !!spreadsheetId,
        gid: gid
      });
      
      if (!sheetsClient || !spreadsheetId) {
        console.error('❌ [SpreadsheetLogger] SheetsClientまたはスプレッドシートIDが未設定');
        this.logger.error('[SpreadsheetLogger] SheetsClientまたはスプレッドシートIDが未設定');
        return;
      }
      
      // タスクからログ列を取得（ハードコーディングしない）
      const logColumn = task.logColumns?.[0] || 'B'; // デフォルトはB列
      const logCell = `${logColumn}${task.row}`;
      
      // デバッグ: ログセルの詳細確認
      console.log(`🔍 [ログセル詳細デバッグ]`, {
        logColumn: logColumn,
        taskRow: task.row,
        結果セル: logCell,
        logColumn型: typeof logColumn,
        有効な列名: /^[A-Z]+$/.test(logColumn),
        logColumns配列: task.logColumns
      });
      
      console.log(`📍 [SpreadsheetLogger] ログセル特定: ${logCell} (logColumns: ${JSON.stringify(task.logColumns)})`);
      
      // 送信時刻を取得
      const sendTimeInfo = this.getSendTime(task.id);
      console.log(`⏰ [SpreadsheetLogger] 送信時刻情報:`, {
        taskId: task.id,
        sendTimeInfo: sendTimeInfo,
        availableTaskIds: Array.from(this.sendTimestamps.keys())
      });
      
      if (!sendTimeInfo) {
        console.warn(`⚠️ [SpreadsheetLogger] タスク${task.id}の送信時刻が記録されていません`);
        this.logger.warn(`[SpreadsheetLogger] タスク${task.id}の送信時刻が記録されていません`);
        return;
      }
      
      // 記載時刻（現在時刻）
      const writeTime = new Date();
      
      // ログエントリーを生成
      const newLog = this.formatLogEntry(
        task,
        url || window.location.href,
        sendTimeInfo.time,
        writeTime
      );
      
      // 3種類AIグループタスクの場合、ログを一時保存（AIタイプとURLも保存）
      if (options.isGroupTask && !options.isLastInGroup) {
        const rowKey = `${task.row}`;
        
        try {
          if (!this.pendingLogs.has(rowKey)) {
            this.pendingLogs.set(rowKey, []);
            this.stats.totalGroups++;
            
            // タイムアウト設定（メモリリーク防止）
            const timeoutId = setTimeout(() => {
              console.warn(`⏰ [SpreadsheetLogger] グループログタイムアウト: 行${task.row}`);
              this._cleanupPendingLog(rowKey, 'timeout');
              this.stats.timeoutGroups++;
            }, this.PENDING_LOG_TIMEOUT);
            
            this.pendingLogTimeouts.set(rowKey, timeoutId);
          }
          
          // オブジェクト形式で保存（AIタイプ、内容、URL）
          this.pendingLogs.get(rowKey).push({
            aiType: sendTimeInfo.aiType,
            content: newLog,
            url: url || window.location.href,
            timestamp: new Date()
          });
          
          console.log(`📦 [SpreadsheetLogger] グループログを一時保存: ${logCell} (AI: ${sendTimeInfo.aiType}) - 現在${this.pendingLogs.get(rowKey).length}件`);
          
          // 送信時刻をクリア（メモリ節約）
          this.sendTimestamps.delete(task.id);
          
          return {
            success: true,
            verified: false,
            logCell,
            status: 'pending'
          };
          
        } catch (error) {
          console.error(`❌ [SpreadsheetLogger] グループログ一時保存エラー:`, error);
          this.stats.errorGroups++;
          throw error;
        }
      }
      
      // グループ最後のタスクの場合、一時保存したログをまとめる
      let mergedLog = newLog;
      
      if (options.isLastInGroup) {
        const rowKey = `${task.row}`;
        
        try {
          // タイムアウトをクリア
          this._clearTimeout(rowKey);
          
          const pendingLogsForRow = this.pendingLogs.get(rowKey) || [];
          
          // 現在のログもオブジェクト形式で追加
          pendingLogsForRow.push({
            aiType: sendTimeInfo.aiType,
            content: newLog,
            url: url || window.location.href,
            timestamp: new Date()
          });
          
          console.log(`📦 [SpreadsheetLogger] グループログ結合開始: ${pendingLogsForRow.length}件 (${logCell})`);
          console.log(`📊 [SpreadsheetLogger] グループ内訳:`, pendingLogsForRow.map(log => ({
            ai: log.aiType,
            timestamp: log.timestamp?.toLocaleString('ja-JP'),
            contentLength: log.content?.length
          })));
          
          // フェールセーフ: 3つ未満でも統合（部分完了対応）
          if (pendingLogsForRow.length < 3) {
            console.warn(`⚠️ [SpreadsheetLogger] 不完全なグループ（${pendingLogsForRow.length}/3）を統合: ${logCell}`);
          }
          
          // すべてのログを結合（ChatGPT→Claude→Geminiの順番で）
          mergedLog = this.combineGroupLogs(pendingLogsForRow);
          console.log(`✅ [SpreadsheetLogger] グループログ結合完了: ${pendingLogsForRow.length}件 → ${mergedLog.length}文字 (${logCell})`);
          
          this.stats.completedGroups++;
          
        } catch (error) {
          console.error(`❌ [SpreadsheetLogger] グループログ結合エラー:`, error);
          this.stats.errorGroups++;
          // エラー時でも個別ログを使用（フェールセーフ）
          mergedLog = newLog;
        } finally {
          // 一時保存をクリア（エラー時も実行）
          this._cleanupPendingLog(rowKey, 'completed');
        }
      }
      
      if (options.isFirstTask && !options.isGroupTask) {
        // 通常の最初のタスクの場合のみクリアして新規作成（3種類AIグループは除外）
        console.log(`🔄 [SpreadsheetLogger] ログをクリアして新規作成: ${logCell}`);
        // mergedLogはそのまま使用（既に設定済み）
      } else {
        // 2回目以降は既存ログに追加
        let existingLog = '';
        try {
          console.log(`🔍 [SpreadsheetLogger] 既存ログ取得開始: ${logCell} (AI: ${sendTimeInfo.aiType})`);
          const response = await sheetsClient.getSheetData(
            spreadsheetId,
            logCell,
            gid
          );
          existingLog = response?.values?.[0]?.[0] || '';
          console.log(`📄 [SpreadsheetLogger] 既存ログ内容 (${existingLog.length}文字):`, {
            aiType: sendTimeInfo.aiType,
            hasContent: !!existingLog,
            preview: existingLog.substring(0, 100) + (existingLog.length > 100 ? '...' : '')
          });
        } catch (error) {
          // 既存ログの取得に失敗しても続行
          this.logger.warn('[SpreadsheetLogger] 既存ログの取得に失敗:', error.message);
        }
        
        // 既存ログに追加（上書きではなく追加）
        if (existingLog && existingLog.trim() !== '') {
          if (options.isGroupTask && options.isLastInGroup) {
            // 3種類AIグループの最後：既存ログにグループ全体を追加
            mergedLog = `${existingLog}\n\n${mergedLog}`;
            console.log(`➕ [SpreadsheetLogger] 既存ログに3種類AIグループを追加`);
          } else {
            // 通常タスク：同じAIのログチェック
            const aiDisplayName = this.getAIDisplayName(sendTimeInfo.aiType);
            if (existingLog.includes(`---------- ${aiDisplayName} ----------`)) {
              console.log(`⚠️ [SpreadsheetLogger] 同じAIのログが既存、スキップ (AI: ${sendTimeInfo.aiType})`);
              return; // 同じAIのログが既にある場合はスキップ
            }
            mergedLog = `${existingLog}\n\n${mergedLog}`;
            console.log(`➕ [SpreadsheetLogger] 既存ログに追加 (AI: ${sendTimeInfo.aiType})`);
          }
        } else {
          console.log(`➕ [SpreadsheetLogger] 新規ログ作成 (${options.isGroupTask ? '3種類AIグループ' : 'AI: ' + sendTimeInfo.aiType})`);
        }
      }
      
      // スプレッドシートに書き込み（リッチテキスト対応）
      console.log(`💾 [SpreadsheetLogger] スプレッドシート書き込み実行:`, {
        spreadsheetId,
        logCell,
        gid,
        logLength: mergedLog.length
      });
      
      // リッチテキストデータを構築
      const richTextData = this.parseLogToRichText(mergedLog);
      
      // リッチテキストメソッドが利用可能な場合は使用、そうでなければ通常の更新
      if (sheetsClient.updateCellWithRichText && richTextData.some(item => item.url)) {
        console.log(`🔗 [SpreadsheetLogger] リッチテキスト形式で書き込み（リンク付き）`);
        await sheetsClient.updateCellWithRichText(
          spreadsheetId,
          logCell,
          richTextData,
          gid
        );
      } else {
        // 通常のテキストとして書き込み
        await sheetsClient.updateCell(
          spreadsheetId,
          logCell,
          mergedLog,
          gid
        );
      }
      
      console.log(`✅ [SpreadsheetLogger] ログ書き込み完了: ${logCell}`);
      this.logger.log(`[SpreadsheetLogger] ログを書き込み: ${logCell}`);
      
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
      console.log(`🔍 [SpreadsheetLogger] コールバック確認:`, {
        hasOnComplete: !!options.onComplete,
        typeOfOnComplete: typeof options.onComplete,
        isFunction: typeof options.onComplete === 'function',
        optionsKeys: Object.keys(options)
      });
      
      // 完了コールバックを実行
      if (typeof options.onComplete === 'function') {
        console.log(`🔔 [SpreadsheetLogger] 完了コールバック実行: ${logCell}`);
        try {
          await options.onComplete(task, logCell, writeVerified);
          console.log(`✅ [SpreadsheetLogger] コールバック実行成功: ${logCell}`);
        } catch (callbackError) {
          console.error(`❌ [SpreadsheetLogger] コールバックエラー:`, callbackError);
        }
      } else {
        console.warn(`⚠️ [SpreadsheetLogger] コールバックが存在しないかfunction型ではありません`);
      }
      
      // 結果を返す
      return {
        success: true,
        verified: writeVerified,
        logCell
      };
      
    } catch (error) {
      // エラーが発生してもメイン処理は続行
      this.logger.error('[SpreadsheetLogger] ログ書き込みエラー:', {
        message: error.message,
        stack: error.stack,
        taskId: task.id,
        row: task.row
      });
      
      // エラー時もコールバックを実行（エラー情報付き）
      if (typeof options.onComplete === 'function') {
        console.log(`🔔 [SpreadsheetLogger] エラー時のコールバック実行`);
        try {
          await options.onComplete(task, null, false, error);
        } catch (callbackError) {
          console.error(`❌ [SpreadsheetLogger] コールバックエラー:`, callbackError);
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
      console.log(`🔍 [SpreadsheetLogger] 書き込み確認開始: ${logCell}`);
      
      // 少し待ってから確認（APIの遅延を考慮）
      await this._sleep(1000);
      
      // 実際のセルの内容を取得
      const actualData = await sheetsClient.getSheetData(
        spreadsheetId,
        logCell,
        gid
      );
      
      const actualContent = actualData?.[0]?.[0] || '';
      
      // 内容が期待された内容と一致するかチェック
      const isMatched = actualContent.length > 0 && 
                       (actualContent === expectedContent || 
                        actualContent.includes(expectedContent.substring(0, 100)));
      
      console.log(`📊 [SpreadsheetLogger] 書き込み確認結果:`, {
        logCell,
        expectedLength: expectedContent.length,
        actualLength: actualContent.length,
        isMatched,
        preview: actualContent.substring(0, 100) + (actualContent.length > 100 ? '...' : '')
      });
      
      if (!isMatched) {
        console.warn(`⚠️ [SpreadsheetLogger] 書き込み確認失敗: ${logCell} - 期待される内容と一致しません`);
        
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
        console.log(`✅ [SpreadsheetLogger] 書き込み確認成功: ${logCell}`);
      }
      
      return isMatched;
      
    } catch (error) {
      console.error(`❌ [SpreadsheetLogger] 書き込み確認エラー:`, error);
      this.logger.error('[SpreadsheetLogger] 書き込み確認エラー:', error.message);
      
      // エラーの場合は確認失敗として扱う
      return false;
    }
  }

  /**
   * 待機処理（ヘルパーメソッド）
   * @param {number} ms - 待機時間（ミリ秒）
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 簡易ログ生成（送信時刻なしの場合）
   * @param {Object} task - タスクオブジェクト
   * @param {string} url - 現在のURL
   * @returns {string} フォーマット済みログ
   */
  formatSimpleLogEntry(task, url) {
    const aiType = task.aiType || 'Unknown';
    const model = task.model || '不明';
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
    this.logger.log('[SpreadsheetLogger] タイムスタンプをクリアしました');
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
    
    console.log(`📊 [SpreadsheetLogger] ログ順番ソート結果:`, 
      normalizedLogs.map(log => log.aiType));
    
    // contentのみを取り出して結合
    const sortedContents = normalizedLogs.map(log => log.content);
    
    // テキスト形式で結合
    return sortedContents.join('\n\n');
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
      console.log(`🧹 [SpreadsheetLogger] 一時保存ログをクリーンアップ: 行${rowKey}, ${logCount}件, 理由: ${reason}`);
    }
  }

  /**
   * 全ての一時保存ログを強制クリーンアップ（デバッグ・メンテナンス用）
   */
  forceCleanupAll() {
    console.warn(`🧹 [SpreadsheetLogger] 全一時保存ログを強制クリーンアップ`);
    
    // 全タイムアウトをクリア
    for (const timeoutId of this.pendingLogTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingLogTimeouts.clear();
    
    // 一時保存ログをクリア
    const pendingCount = this.pendingLogs.size;
    this.pendingLogs.clear();
    
    console.log(`✅ [SpreadsheetLogger] ${pendingCount}件の一時保存ログをクリーンアップ完了`);
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
      console.log(`🔍 [SpreadsheetLogger] 部分統合: ログなし ${rowKey}`);
      return;
    }
    
    console.warn(`⚠️ [SpreadsheetLogger] 部分完了グループを強制統合開始: 行${row}, ${pendingLogs.length}件のログ`);
    
    try {
      // 部分ログを統合
      const mergedLog = this.combineGroupLogs(pendingLogs);
      
      // ログセルを特定（最初のログのAIタイプを基準）
      const firstLog = pendingLogs[0];
      const logColumn = 'B'; // デフォルトのログ列
      const logCell = `${logColumn}${row}`;
      
      console.log(`📦 [SpreadsheetLogger] 部分統合実行:`, {
        rowKey,
        logCell,
        logCount: pendingLogs.length,
        mergedLength: mergedLog.length,
        aiTypes: pendingLogs.map(log => log.aiType)
      });
      
      // スプレッドシートに書き込み（globalThisから取得）
      if (globalThis.sheetsClient) {
        await globalThis.sheetsClient.updateCell(
          globalThis.currentSpreadsheetId || '',
          logCell,
          mergedLog,
          globalThis.currentGid || '0'
        );
        
        console.log(`✅ [SpreadsheetLogger] 部分統合書き込み完了: ${logCell}`);
        this.stats.completedGroups++;
      } else {
        console.error(`❌ [SpreadsheetLogger] SheetsClientが利用不可、部分統合失敗`);
        this.stats.errorGroups++;
      }
      
    } catch (error) {
      console.error(`❌ [SpreadsheetLogger] 部分統合エラー:`, error);
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