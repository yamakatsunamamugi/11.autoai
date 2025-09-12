/**
 * @fileoverview リアルタイムタスクスキャナー
 * 
 * 責任:
 * - 動的な空きタスク検索
 * - リアルタイム処理ループ
 * - 既存の判定ロジック活用
 * - 設定可能な処理間隔・タスク数制御
 */

export class RealtimeTaskScanner {
  constructor(streamProcessor, logger = console) {
    this.streamProcessor = streamProcessor;
    this.logger = logger;
    
    // 設定
    this.isScanning = false;
    this.scanInterval = 5000; // 5秒間隔
    this.maxTasksPerScan = 50; // 1回のスキャンでの最大タスク数
    this.maxConcurrentTasks = 3; // 並列実行タスク数
    this.stopRequested = false;
    
    // 統計
    this.stats = {
      totalScans: 0,
      totalTasksProcessed: 0,
      emptyScans: 0
    };
  }

  /**
   * 利用可能なタスクを動的スキャン
   * @param {number} maxTasks - 最大タスク数
   * @param {Array} taskGroups - タスクグループ（オプション）
   * @returns {Array} 利用可能なタスク配列
   */
  async scanAvailableTasks(maxTasks = this.maxTasksPerScan, taskGroups = null) {
    const tasks = [];
    this.stats.totalScans++;
    
    try {
      const spreadsheetData = this.streamProcessor.spreadsheetData;
      if (!spreadsheetData) {
        this.logger.warn('[RealtimeTaskScanner] スプレッドシートデータが利用できません');
        return tasks;
      }

      // タスクグループが提供されない場合は基本的な列構成を使用
      const groups = taskGroups || this.getDefaultColumnGroups();
      
      if (!groups || groups.length === 0) {
        this.logger.debug('[RealtimeTaskScanner] タスクグループが見つかりません');
        return tasks;
      }

      this.logger.debug(`[RealtimeTaskScanner] 📊 ${groups.length}グループをスキャン開始`);

      // 各タスクグループから利用可能なタスクを検索
      for (const group of groups) {
        if (tasks.length >= maxTasks) break;

        // 既存のscanGroupTasksロジックを活用
        const promptColIndices = group.columnRange?.promptColumns || group.promptColumns || [];
        const answerColIndices = group.columnRange?.answerColumns?.map(col => col.index) || 
                                 group.answerColumns?.map(col => col.index) || 
                                 group.answerColumns || [];

        if (promptColIndices.length === 0 || answerColIndices.length === 0) {
          this.logger.debug(`[RealtimeTaskScanner] ${group.name}: プロンプト列または回答列が未定義、スキップ`);
          continue;
        }

        const groupTasks = await this.streamProcessor.scanGroupTasks(
          spreadsheetData,
          promptColIndices,
          answerColIndices
        );

        if (groupTasks.length > 0) {
          // 負荷制御：グループあたり最大10タスク
          const limitedTasks = groupTasks.slice(0, Math.min(10, maxTasks - tasks.length));
          
          // AIタイプ情報を付加
          const enrichedTasks = limitedTasks.map(task => ({
            ...task,
            aiType: group.aiType,
            groupName: group.name,
            spreadsheetId: spreadsheetData.spreadsheetId,
            gid: spreadsheetData.gid
          }));

          tasks.push(...enrichedTasks);
          
          this.logger.debug(`[RealtimeTaskScanner] ${group.name}: ${limitedTasks.length}タスクを検出`);
        }
      }

      if (tasks.length === 0) {
        this.stats.emptyScans++;
      }

      this.logger.log(`[RealtimeTaskScanner] 📊 スキャン完了: ${tasks.length}個のタスクが利用可能`);
      return tasks;

    } catch (error) {
      this.logger.error('[RealtimeTaskScanner] スキャンエラー:', error);
      return tasks;
    }
  }

  /**
   * デフォルトの列グループ構成を取得
   * @returns {Array} デフォルトタスクグループ
   */
  getDefaultColumnGroups() {
    // 基本的な3列グループ構成（F->G, H->I, J->K）
    return [
      {
        name: 'ChatGPT Group',
        aiType: 'chatgpt',
        promptColumns: [5], // F列
        answerColumns: [6]  // G列
      },
      {
        name: 'Claude Group', 
        aiType: 'claude',
        promptColumns: [7], // H列
        answerColumns: [8]  // I列
      },
      {
        name: 'Gemini Group',
        aiType: 'gemini', 
        promptColumns: [9], // J列
        answerColumns: [10] // K列
      }
    ];
  }

  /**
   * リアルタイム処理を開始
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 処理結果
   */
  async startRealtimeProcessing(options = {}) {
    this.isScanning = true;
    this.stopRequested = false;
    
    // 設定を更新
    if (options.scanInterval) this.scanInterval = options.scanInterval;
    if (options.maxTasksPerScan) this.maxTasksPerScan = options.maxTasksPerScan;
    if (options.maxConcurrentTasks) this.maxConcurrentTasks = options.maxConcurrentTasks;

    // タスクグループを保存
    const taskGroups = options.taskGroups || null;

    this.logger.log(`[RealtimeTaskScanner] 🚀 リアルタイム処理開始`, {
      スキャン間隔: `${this.scanInterval/1000}秒`,
      最大並列タスク: this.maxConcurrentTasks,
      最大スキャンタスク: this.maxTasksPerScan,
      タスクグループ: taskGroups ? `${taskGroups.length}グループ` : 'デフォルト'
    });

    let iterationCount = 0;
    const startTime = Date.now();

    try {
      while (!this.stopRequested) {
        iterationCount++;
        
        this.logger.log(`[RealtimeTaskScanner] 🔄 反復${iterationCount}: 利用可能タスクをスキャン中...`);

        // 1. 利用可能なタスクを動的検索（タスクグループを渡す）
        const availableTasks = await this.scanAvailableTasks(this.maxTasksPerScan, taskGroups);

        if (availableTasks.length === 0) {
          this.logger.log(`[RealtimeTaskScanner] 🎯 反復${iterationCount}: 処理可能なタスクなし`);
          
          // 連続して空の場合は終了を検討
          if (this.stats.emptyScans >= 3) {
            this.logger.log('[RealtimeTaskScanner] ✅ 連続3回空スキャン、処理終了');
            break;
          }
        } else {
          // 空スキャンカウントをリセット
          this.stats.emptyScans = 0;

          // 2. 最大並列タスク数を選択
          const batch = availableTasks.slice(0, this.maxConcurrentTasks);
          
          this.logger.log(`[RealtimeTaskScanner] 🔥 反復${iterationCount}: ${batch.length}タスクを並列処理開始`);
          this.logger.log(`[RealtimeTaskScanner] 📋 処理対象: ${batch.map(t => `${t.column}${t.row}`).join(', ')}`);

          // 3. 既存のprocessBatchメソッドで並列処理
          await this.streamProcessor.processBatch(batch, false);
          
          this.stats.totalTasksProcessed += batch.length;
          this.logger.log(`[RealtimeTaskScanner] ✅ 反復${iterationCount}: ${batch.length}タスク処理完了`);
        }

        // 4. 次のスキャンまで待機（停止要求チェック付き）
        if (!this.stopRequested) {
          this.logger.debug(`[RealtimeTaskScanner] ⏳ ${this.scanInterval/1000}秒待機...`);
          await this.delay(this.scanInterval);
        }
      }

    } catch (error) {
      this.logger.error('[RealtimeTaskScanner] 処理エラー:', error);
      throw error;
    } finally {
      this.isScanning = false;
      
      const totalTime = Date.now() - startTime;
      const result = {
        success: true,
        iterations: iterationCount,
        totalTasksProcessed: this.stats.totalTasksProcessed,
        totalTime: `${Math.round(totalTime/1000)}秒`,
        stats: { ...this.stats }
      };

      this.logger.log('[RealtimeTaskScanner] 🎉 リアルタイム処理完了', result);
      return result;
    }
  }

  /**
   * スキャンを停止
   */
  async stopScanning() {
    this.logger.log('[RealtimeTaskScanner] 🛑 停止要求受信');
    this.stopRequested = true;
    
    // スキャンが停止するまで待機
    while (this.isScanning) {
      await this.delay(100);
    }
    
    this.logger.log('[RealtimeTaskScanner] ✅ スキャン停止完了');
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      ...this.stats,
      isScanning: this.isScanning,
      configuration: {
        scanInterval: this.scanInterval,
        maxTasksPerScan: this.maxTasksPerScan,
        maxConcurrentTasks: this.maxConcurrentTasks
      }
    };
  }

  /**
   * 設定を更新
   * @param {Object} config - 新しい設定
   */
  updateConfig(config) {
    if (config.scanInterval !== undefined) {
      this.scanInterval = config.scanInterval;
    }
    if (config.maxTasksPerScan !== undefined) {
      this.maxTasksPerScan = config.maxTasksPerScan;
    }
    if (config.maxConcurrentTasks !== undefined) {
      this.maxConcurrentTasks = config.maxConcurrentTasks;
    }
    
    this.logger.log('[RealtimeTaskScanner] 設定更新:', {
      scanInterval: this.scanInterval,
      maxTasksPerScan: this.maxTasksPerScan,
      maxConcurrentTasks: this.maxConcurrentTasks
    });
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
   * 統計をリセット
   */
  resetStats() {
    this.stats = {
      totalScans: 0,
      totalTasksProcessed: 0,
      emptyScans: 0
    };
    this.logger.log('[RealtimeTaskScanner] 統計をリセットしました');
  }
}