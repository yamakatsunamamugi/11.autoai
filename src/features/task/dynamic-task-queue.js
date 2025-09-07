/**
 * @fileoverview 動的タスクキューシステム
 * タスク完了時に次のタスクを動的に生成・追加する
 */

export class DynamicTaskQueue {
  constructor(logger = console) {
    this.logger = logger;
    this.queue = [];
    this.processing = false;
    this.processedTasks = new Set();
    this.completedCells = new Map(); // cell -> value
    this.maxIterations = 10;
    this.currentIteration = 0;
    this.onTaskCompleted = null; // コールバック
    this.sheetsClient = null;
    this.taskGenerator = null;
    this.spreadsheetData = null;
    this.processedGroups = new Set(); // 処理済みグループを追跡
    this.groupProcessingCount = new Map(); // グループごとの処理回数
  }

  /**
   * 初期設定
   */
  initialize(config) {
    this.sheetsClient = config.sheetsClient;
    this.taskGenerator = config.taskGenerator;
    this.spreadsheetData = config.spreadsheetData;
    this.onTaskCompleted = config.onTaskCompleted;
  }

  /**
   * タスクをキューに追加
   */
  enqueue(tasks) {
    if (Array.isArray(tasks)) {
      this.queue.push(...tasks);
      this.logger.log(`[DynamicTaskQueue] ${tasks.length}個のタスクを追加`);
    } else if (tasks) {
      this.queue.push(tasks);
      this.logger.log(`[DynamicTaskQueue] 1個のタスクを追加`);
    }
  }

  /**
   * 次のタスクを取得
   */
  dequeue() {
    return this.queue.shift();
  }

  /**
   * キューが空かチェック
   */
  isEmpty() {
    return this.queue.length === 0;
  }

  /**
   * タスク処理のメインループ
   */
  async processAll() {
    this.logger.log('[DynamicTaskQueue] 処理開始');
    this.processing = true;
    
    while (!this.isEmpty() && this.currentIteration < this.maxIterations) {
      this.currentIteration++;
      
      // バッチ単位で処理（3タスクずつ）
      const batch = this.dequeueBatch(3);
      if (batch.length === 0) break;
      
      this.logger.log(`[DynamicTaskQueue] バッチ処理: ${batch.length}タスク（イテレーション${this.currentIteration}）`);
      
      // バッチ処理を実行
      const results = await this.processBatch(batch);
      
      // 完了したタスクを記録
      for (const result of results) {
        if (result.success) {
          this.recordCompletion(result.task, result.value);
        }
      }
      
      // 新しいタスクをチェック
      await this.checkForNewTasks();
    }
    
    this.processing = false;
    this.logger.log(`[DynamicTaskQueue] 処理完了: ${this.processedTasks.size}タスク処理済み`);
    
    return {
      processed: this.processedTasks.size,
      remaining: this.queue.length,
      iterations: this.currentIteration
    };
  }

  /**
   * バッチ単位でタスクを取得
   */
  dequeueBatch(size) {
    const batch = [];
    for (let i = 0; i < size && !this.isEmpty(); i++) {
      batch.push(this.dequeue());
    }
    return batch;
  }

  /**
   * バッチ処理（外部の処理ロジックを呼び出す）
   */
  async processBatch(batch) {
    if (!this.onTaskCompleted) {
      throw new Error('onTaskCompleted callback not set');
    }
    
    // 外部の処理ロジックを実行
    const results = await this.onTaskCompleted(batch);
    
    // 処理済みタスクを記録
    batch.forEach(task => {
      this.processedTasks.add(`${task.column}${task.row}`);
    });
    
    return results;
  }

  /**
   * タスク完了を記録
   */
  recordCompletion(task, value) {
    const cellKey = `${task.column}${task.row}`;
    this.completedCells.set(cellKey, value);
    
    this.logger.log(`[DynamicTaskQueue] セル完了記録: ${cellKey}`);
  }

  /**
   * 新しいタスクをチェックして生成
   */
  async checkForNewTasks() {
    this.logger.log('[DynamicTaskQueue] 新しいタスクをチェック中...');
    
    // スプレッドシートデータを再読み込み
    if (this.sheetsClient) {
      try {
        const updatedData = await this.sheetsClient.readSpreadsheet();
        if (updatedData) {
          // データ構造に応じて更新
          if (updatedData.values) {
            this.spreadsheetData.values = updatedData.values;
          } else if (updatedData.data && updatedData.data.values) {
            this.spreadsheetData.values = updatedData.data.values;
          } else if (updatedData.data) {
            this.spreadsheetData.data = updatedData.data;
          } else {
            // データ全体を置き換え
            this.spreadsheetData = updatedData;
          }
          this.logger.log('[DynamicTaskQueue] スプレッドシートデータ更新完了');
          
          // デバッグ: K10のデータを確認
          if (this.spreadsheetData.values && this.spreadsheetData.values[9]) {
            const k10Value = this.spreadsheetData.values[9][10]; // K列 = index 10
            this.logger.log(`[DynamicTaskQueue] K10の値: "${k10Value}" (型: ${typeof k10Value})`);
          }
        }
      } catch (error) {
        this.logger.error('[DynamicTaskQueue] データ再読み込みエラー:', error);
      }
    }
    
    // 各プロンプトグループをチェック
    if (this.taskGenerator && this.spreadsheetData) {
      const structure = this.taskGenerator.analyzeStructure(this.spreadsheetData);
      const promptGroups = structure.promptGroups || [];
      
      let newTaskCount = 0;
      
      for (let groupIndex = 0; groupIndex < promptGroups.length; groupIndex++) {
        const promptGroup = promptGroups[groupIndex];
        
        // このグループのプロンプト列が埋まっているかチェック（groupIndexも渡す）
        const canProcess = this.canProcessGroup(promptGroup, groupIndex);
        
        if (canProcess) {
          // タスクを生成
          const groupTaskList = await this.taskGenerator.generateTasksForPromptGroup(
            this.spreadsheetData,
            groupIndex
          );
          
          if (groupTaskList && groupTaskList.tasks.length > 0) {
            // 未処理のタスクのみ追加
            const newTasks = groupTaskList.tasks.filter(task => {
              const cellKey = `${task.column}${task.row}`;
              return !this.processedTasks.has(cellKey);
            });
            
            if (newTasks.length > 0) {
              this.enqueue(newTasks);
              newTaskCount += newTasks.length;
              this.logger.log(`[DynamicTaskQueue] グループ${groupIndex + 1}から${newTasks.length}個の新タスク追加`);
            }
          }
        }
      }
      
      if (newTaskCount > 0) {
        this.logger.log(`[DynamicTaskQueue] 合計${newTaskCount}個の新タスクを発見`);
      } else {
        this.logger.log('[DynamicTaskQueue] 新しいタスクなし');
      }
    }
  }

  /**
   * プロンプトグループが処理可能かチェック
   */
  canProcessGroup(promptGroup, groupIndex) {
    // すでに処理中のグループはスキップ
    const groupKey = `group_${groupIndex}`;
    const processingCount = this.groupProcessingCount.get(groupKey) || 0;
    
    // 同じグループを何度も処理しないように制限
    if (processingCount >= 2) {
      this.logger.log(`[DynamicTaskQueue] グループ${groupIndex + 1}は処理済み（${processingCount}回）`);
      return false;
    }
    
    // プロンプト列にデータが存在するかチェック
    if (!this.spreadsheetData || !this.spreadsheetData.values) {
      return false;
    }
    
    const values = this.spreadsheetData.values;
    
    // デバッグ: グループ情報を表示
    this.logger.log(`[DynamicTaskQueue] グループ${groupIndex + 1}チェック:`, {
      promptColumns: promptGroup.promptColumns.map(idx => `${this.indexToColumn(idx)}(${idx})`),
      answerColumns: promptGroup.answerColumns.map(col => `${col.column}(${col.index})`)
    });
    
    // プロンプト列の確認
    for (const promptColIndex of promptGroup.promptColumns) {
      // 少なくとも1つの行でプロンプト列にデータがあるかチェック
      let hasData = false;
      let foundTaskableRow = false;
      
      for (let rowIndex = 8; rowIndex < values.length; rowIndex++) { // 9行目以降（0-indexed で8）
        const row = values[rowIndex];
        if (row && row[promptColIndex] && String(row[promptColIndex]).trim()) {
          hasData = true;
          const promptValue = String(row[promptColIndex]).trim();
          
          // 対応する回答列が空かもチェック
          for (const answerCol of promptGroup.answerColumns) {
            const answerIndex = answerCol.index;
            const answerValue = row[answerIndex] ? String(row[answerIndex]).trim() : '';
            
            // デバッグ: 特定行の状態を表示（K10など重要な行）
            if (rowIndex === 9) { // 10行目（0-indexed で9）
              this.logger.log(`[DynamicTaskQueue] 行${rowIndex + 1}の状態:`, {
                promptCol: `${this.indexToColumn(promptColIndex)}`,
                promptValue: promptValue.substring(0, 50),
                answerCol: `${answerCol.column}`,
                answerValue: answerValue || '(空)',
                answerIndex: answerIndex
              });
            }
            
            if (!answerValue) {
              // プロンプトあり、回答なし → 処理可能
              this.logger.log(`[DynamicTaskQueue] グループ${groupIndex + 1}は処理可能（行${rowIndex + 1}、${answerCol.column}列が空）`);
              
              // 処理回数をインクリメント
              this.groupProcessingCount.set(groupKey, processingCount + 1);
              foundTaskableRow = true;
              return true;
            }
          }
        }
      }
      
      if (!hasData) {
        this.logger.log(`[DynamicTaskQueue] グループ${groupIndex + 1}のプロンプト列${this.indexToColumn(promptColIndex)}にデータなし`);
        return false;
      }
      
      if (hasData && !foundTaskableRow) {
        // データはあるが、すべて回答済み
        this.logger.log(`[DynamicTaskQueue] グループ${groupIndex + 1}のプロンプト列${this.indexToColumn(promptColIndex)}にはデータがあるが、すべて回答済み`);
      }
    }
    
    this.logger.log(`[DynamicTaskQueue] グループ${groupIndex + 1}はすべて回答済み`);
    return false;
  }
  
  /**
   * インデックスを列名に変換
   */
  indexToColumn(index) {
    let column = '';
    while (index >= 0) {
      column = String.fromCharCode(65 + (index % 26)) + column;
      index = Math.floor(index / 26) - 1;
    }
    return column;
  }

  /**
   * キューの状態を取得
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      processedCount: this.processedTasks.size,
      currentIteration: this.currentIteration,
      completedCells: this.completedCells.size
    };
  }

  /**
   * キューをクリア
   */
  clear() {
    this.queue = [];
    this.processedTasks.clear();
    this.completedCells.clear();
    this.currentIteration = 0;
    this.logger.log('[DynamicTaskQueue] キューをクリアしました');
  }
}