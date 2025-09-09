/**
 * バッチエグゼキューター
 * 3つのタスクを並列で効率的に処理
 */

import { sleep } from '../../utils/sleep-utils.js';

export class BatchExecutor {
  constructor(windowManager, aiTaskExecutor, spreadsheetLogger, logger = console) {
    this.windowManager = windowManager;
    this.aiTaskExecutor = aiTaskExecutor;
    this.spreadsheetLogger = spreadsheetLogger;
    this.logger = logger;
    
    // 処理済みタスクの追跡
    this.completedTasks = new Set();
    this.failedTasks = new Set();
  }

  /**
   * バッチを実行（最大3タスクを並列処理）
   * 
   * 【処理フロー】
   * 1. ウィンドウ準備: 3つのウィンドウを開く
   * 2. モデル選択: 並列実行
   * 3. 機能選択: 並列実行
   * 4. 送信: 5秒間隔で順次実行
   * 
   * @param {Array} batch - タスク配列（最大3つ）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 実行結果
   */
  async executeBatch(batch, spreadsheetData) {
    this.logger.log('[BatchExecutor] バッチ実行開始', {
      タスク数: batch.length,
      タスク: batch.map(t => `${t.column}${t.row}`).join(', ')
    });
    
    const results = {
      success: [],
      failed: [],
      skipped: []
    };
    
    const taskContexts = [];
    
    try {
      // ========================================
      // フェーズ1: ウィンドウ準備とテキスト入力
      // ========================================
      this.logger.log('[BatchExecutor] 📋 フェーズ1: ウィンドウ準備');
      
      for (let i = 0; i < batch.length; i++) {
        const task = batch[i];
        const position = i; // 0:左, 1:中央, 2:右
        
        try {
          // ウィンドウを作成
          const tabId = await this.windowManager.createWindowForTask(task, position);
          
          // プロンプトを取得
          const prompt = await this.fetchPromptFromSpreadsheet(task, spreadsheetData);
          
          // コンテキストを保存
          taskContexts.push({
            task,
            tabId,
            prompt,
            position
          });
          
          // テキスト入力
          await this.inputPromptToWindow(tabId, prompt, task);
          
        } catch (error) {
          this.logger.error(`[BatchExecutor] タスク準備失敗: ${task.column}${task.row}`, error);
          results.failed.push(task);
        }
      }
      
      if (taskContexts.length === 0) {
        this.logger.warn('[BatchExecutor] 有効なタスクがありません');
        return results;
      }
      
      // ========================================
      // フェーズ2: モデル選択（並列実行）
      // ========================================
      this.logger.log('[BatchExecutor] 🎯 フェーズ2: モデル選択');
      
      const modelPromises = taskContexts.map(async (context) => {
        try {
          if (context.task.model) {
            await this.selectModel(context.tabId, context.task.model, context.task.aiType);
          }
        } catch (error) {
          this.logger.error(`[BatchExecutor] モデル選択失敗: ${context.task.column}${context.task.row}`, error);
        }
      });
      
      await Promise.allSettled(modelPromises);
      
      // ========================================
      // フェーズ3: 機能選択（並列実行）
      // ========================================
      this.logger.log('[BatchExecutor] ⚙️ フェーズ3: 機能選択');
      
      const functionPromises = taskContexts.map(async (context) => {
        try {
          if (context.task.function) {
            await this.selectFunction(context.tabId, context.task.function, context.task.aiType);
          }
        } catch (error) {
          this.logger.error(`[BatchExecutor] 機能選択失敗: ${context.task.column}${context.task.row}`, error);
        }
      });
      
      await Promise.allSettled(functionPromises);
      
      // ========================================
      // フェーズ4: 5秒間隔で順次送信
      // ========================================
      this.logger.log('[BatchExecutor] 📤 フェーズ4: 送信');
      
      for (let i = 0; i < taskContexts.length; i++) {
        const context = taskContexts[i];
        
        try {
          // 送信実行
          const response = await this.sendAndGetResponse(context.tabId, context.task);
          
          // 成功を記録
          this.completedTasks.add(context.task.id);
          results.success.push({
            task: context.task,
            response
          });
          
          // スプレッドシートに結果を記録
          await this.logToSpreadsheet(context.task, 'success');
          
          // 次のタスクまで5秒待機（最後のタスクは待機不要）
          if (i < taskContexts.length - 1) {
            this.logger.log('[BatchExecutor] 5秒待機中...');
            await this.delay(5000);
          }
          
        } catch (error) {
          this.logger.error(`[BatchExecutor] 送信失敗: ${context.task.column}${context.task.row}`, error);
          this.failedTasks.add(context.task.id);
          results.failed.push(context.task);
          
          await this.logToSpreadsheet(context.task, 'failed');
        }
      }
      
      // ウィンドウを閉じる
      await this.closeAllWindows(taskContexts);
      
    } catch (error) {
      this.logger.error('[BatchExecutor] バッチ実行エラー:', error);
      
      // エラー時もウィンドウを閉じる
      await this.closeAllWindows(taskContexts);
      throw error;
    }
    
    this.logger.log('[BatchExecutor] バッチ実行完了', {
      成功: results.success.length,
      失敗: results.failed.length,
      スキップ: results.skipped.length
    });
    
    return results;
  }

  /**
   * プロンプトをスプレッドシートから取得
   */
  async fetchPromptFromSpreadsheet(task, spreadsheetData) {
    if (!task.promptColumns || task.promptColumns.length === 0) {
      return 'テストプロンプト';
    }
    
    const rowIndex = task.row - 1;
    const row = spreadsheetData.values[rowIndex];
    
    if (!row) {
      return 'テストプロンプト';
    }
    
    const prompts = [];
    for (const colIndex of task.promptColumns) {
      const value = row[colIndex];
      if (value && value.trim()) {
        prompts.push(value.trim());
      }
    }
    
    const cellPosition = `${task.column}${task.row}`;
    return `現在は${cellPosition}のセルです。\n${prompts.join('\n')}`;
  }

  /**
   * プロンプトをウィンドウに入力
   */
  async inputPromptToWindow(tabId, prompt, task) {
    // AIタスクエグゼキューターに委譲
    await this.aiTaskExecutor.inputPrompt(tabId, prompt, task.aiType);
  }

  /**
   * モデルを選択
   */
  async selectModel(tabId, model, aiType) {
    await this.aiTaskExecutor.selectModel(tabId, model, aiType);
  }

  /**
   * 機能を選択
   */
  async selectFunction(tabId, functionName, aiType) {
    await this.aiTaskExecutor.selectFunction(tabId, functionName, aiType);
  }

  /**
   * 送信して応答を取得
   */
  async sendAndGetResponse(tabId, task) {
    return await this.aiTaskExecutor.sendAndGetResponse(tabId, task);
  }

  /**
   * スプレッドシートにログを記録
   */
  async logToSpreadsheet(task, status) {
    if (this.spreadsheetLogger) {
      await this.spreadsheetLogger.writeLog(task, status);
    }
  }

  /**
   * すべてのウィンドウを閉じる
   */
  async closeAllWindows(taskContexts) {
    const promises = taskContexts.map(context => 
      this.windowManager.closeWindow(context.tabId)
    );
    await Promise.allSettled(promises);
  }

  /**
   * 遅延処理
   */
  async delay(ms) {
    return sleep(ms);
  }

  /**
   * 統計情報を取得
   */
  getStatistics() {
    return {
      completed: this.completedTasks.size,
      failed: this.failedTasks.size,
      total: this.completedTasks.size + this.failedTasks.size
    };
  }

  /**
   * リセット
   */
  reset() {
    this.completedTasks.clear();
    this.failedTasks.clear();
  }
}