/**
 * @fileoverview タスク待機マネージャー - 待機戦略と機能別タイムアウトを管理
 * 
 * 責任:
 * - 機能別の待機時間判定
 * - 排他制御マーカーの解析
 * - チェック間隔の管理
 * - 待機戦略の実行
 */

import { getTimeoutForFunction } from '../../config/exclusive-control-config.js';

export class TaskWaitManager {
  constructor(logger = console) {
    this.logger = logger;
    
    // デフォルト設定
    this.defaultCheckInterval = 60000;  // 1分
    this.defaultMaxWaitTime = 5 * 60 * 1000;  // 5分
    this.longProcessMaxWaitTime = 40 * 60 * 1000;  // 40分
  }

  /**
   * タスクグループから機能を検出して最大待機時間を決定
   * @param {Array} tasks - タスク配列
   * @param {Object} retryManager - RetryManagerインスタンス
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Object} 待機設定 { maxWaitTime, detectedFunction, checkInterval }
   */
  async determineWaitStrategy(tasks, retryManager, spreadsheetData) {
    let maxWaitTime = this.defaultMaxWaitTime;
    let detectedFunction = '通常';
    const checkInterval = this.defaultCheckInterval;

    if (!spreadsheetData) {
      return { maxWaitTime, detectedFunction, checkInterval };
    }

    try {
      // 各タスクの回答をチェックして機能を判定
      for (const task of tasks) {
        const answer = retryManager.getCurrentAnswer(task, spreadsheetData);
        
        if (answer && answer.startsWith('現在操作中です_')) {
          const functionName = this.extractFunctionFromMarker(answer);
          
          if (functionName) {
            // 機能別のタイムアウトを取得
            const timeout = this.getFunctionTimeout(functionName);
            
            if (timeout > maxWaitTime) {
              maxWaitTime = timeout;
              detectedFunction = functionName;
              this.logger.log(`[TaskWaitManager] 長時間処理を検出: ${functionName} (${timeout/60000}分)`);
            }
          }
        }
      }
      
      this.logger.log(`[TaskWaitManager] 待機戦略決定: 機能=${detectedFunction}, 最大待機=${maxWaitTime/60000}分`);
      
    } catch (error) {
      this.logger.warn('[TaskWaitManager] 機能判定中のエラー:', error);
    }

    return { maxWaitTime, detectedFunction, checkInterval };
  }

  /**
   * 排他制御マーカーから機能名を抽出
   * @param {string} marker - 排他制御マーカー文字列
   * @returns {string|null} 機能名
   */
  extractFunctionFromMarker(marker) {
    if (!marker || !marker.startsWith('現在操作中です_')) {
      return null;
    }

    const parts = marker.split('_');
    
    // 新形式の判定: parts.length >= 4 かつ parts[2] が時刻形式 (HH:MM:SS)
    if (parts.length >= 4 && /^\d{2}:\d{2}:\d{2}$/.test(parts[2])) {
      // 新形式: 現在操作中です_2025-09-12_16:43:37_PC1
      // 新形式では機能名がないため、PC IDをデフォルト機能名として返す
      const pcId = parts[3];
      this.logger.debug('[TaskWaitManager] 新形式マーカー: PC ID', pcId, 'をデフォルト機能として使用');
      return 'default'; // デフォルト機能名を返す
    } else if (parts.length >= 4) {
      // 旧形式: 現在操作中です_timestamp_pcId_function
      return parts.slice(3).join('_'); // 機能名部分（_を含む可能性があるため）
    }
    
    return null;
  }

  /**
   * 機能名から適切なタイムアウト時間を取得
   * @param {string} functionName - 機能名
   * @returns {number} タイムアウト時間（ミリ秒）
   */
  getFunctionTimeout(functionName) {
    // Deep Research、エージェントは長時間処理
    if (this.isLongRunningFunction(functionName)) {
      return this.longProcessMaxWaitTime;
    }

    // exclusive-control-configから取得を試みる
    try {
      const configTimeout = getTimeoutForFunction(functionName);
      if (configTimeout) {
        return configTimeout;
      }
    } catch (error) {
      this.logger.debug('[TaskWaitManager] 設定からのタイムアウト取得失敗:', error);
    }

    return this.defaultMaxWaitTime;
  }

  /**
   * 長時間処理の機能かどうか判定
   * @param {string} functionName - 機能名
   * @returns {boolean} 長時間処理の場合true
   */
  isLongRunningFunction(functionName) {
    if (!functionName) return false;
    
    const longRunningPatterns = [
      'Deep',
      'deep',
      'Research',
      'research',
      'エージェント',
      'Agent',
      'agent',
      'ディープ',
      'リサーチ'
    ];
    
    return longRunningPatterns.some(pattern => functionName.includes(pattern));
  }

  /**
   * 待機ループを実行
   * @param {string} groupId - グループID
   * @param {Function} checkFunc - 完了チェック関数
   * @param {number} checkInterval - チェック間隔（ミリ秒）
   * @param {number} maxWaitTime - 最大待機時間（ミリ秒）
   * @returns {Promise<boolean>} 完了した場合true、タイムアウトの場合false
   */
  async executeWaitLoop(groupId, checkFunc, checkInterval, maxWaitTime) {
    const startTime = Date.now();
    let checkCount = 0;
    const maxChecks = Math.floor(maxWaitTime / checkInterval);
    
    this.logger.log(`[TaskWaitManager] グループ${groupId}の完了を待機中... (最大${maxWaitTime/60000}分、${checkInterval/1000}秒間隔)`);
    
    while (Date.now() - startTime < maxWaitTime) {
      checkCount++;
      
      // 完了チェック
      const isComplete = await checkFunc(groupId);
      
      if (isComplete) {
        this.logger.log(`[TaskWaitManager] グループ${groupId}が完了しました (${checkCount}回目のチェック)`);
        return true;
      }
      
      // 進捗ログ
      if (checkCount % 5 === 0) { // 5回ごとに進捗を表示
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.floor((maxWaitTime - (Date.now() - startTime)) / 1000);
        this.logger.log(`[TaskWaitManager] 待機中... (経過: ${elapsed}秒, 残り: ${remaining}秒)`);
      }
      
      // 次のチェックまで待機
      await this.delay(checkInterval);
    }
    
    this.logger.warn(`[TaskWaitManager] グループ${groupId}の完了待機がタイムアウトしました (${maxWaitTime/60000}分経過)`);
    return false;
  }

  /**
   * 指定時間待機
   * @param {number} ms - 待機時間（ミリ秒）
   * @returns {Promise<void>}
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * マーカーの経過時間を計算
   * @param {string} marker - 排他制御マーカー
   * @returns {number|null} 経過時間（ミリ秒）、解析できない場合null
   */
  calculateMarkerAge(marker) {
    if (!marker || !marker.startsWith('現在操作中です_')) {
      return null;
    }

    const parts = marker.split('_');
    if (parts.length >= 2) {
      try {
        let timestampStr;
        
        // 新形式の判定: parts.length >= 4 かつ parts[2] が時刻形式 (HH:MM:SS)
        if (parts.length >= 4 && /^\d{2}:\d{2}:\d{2}$/.test(parts[2])) {
          // 新形式: 現在操作中です_2025-09-12_16:43:37_PC1
          timestampStr = parts[1] + 'T' + parts[2];
          this.logger.debug('[TaskWaitManager] 新マーカー形式を検出:', timestampStr);
        } else {
          // 旧形式: 現在操作中です_2025-09-12T07:36:12.695Z_pcId_function
          timestampStr = parts[1];
        }
        
        const timestamp = new Date(timestampStr);
        if (!isNaN(timestamp.getTime())) {
          return Date.now() - timestamp.getTime();
        }
      } catch (error) {
        this.logger.debug('[TaskWaitManager] タイムスタンプ解析エラー:', error);
      }
    }

    return null;
  }

  /**
   * マーカーがタイムアウトしているか判定
   * @param {string} marker - 排他制御マーカー
   * @returns {boolean} タイムアウトしている場合true
   */
  isMarkerTimeout(marker) {
    const age = this.calculateMarkerAge(marker);
    if (age === null) return false;

    const functionName = this.extractFunctionFromMarker(marker);
    const timeout = this.getFunctionTimeout(functionName);

    return age > timeout;
  }
}