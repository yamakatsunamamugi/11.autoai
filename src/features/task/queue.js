// queue.js - タスクキュー（Chrome Storage管理）

class TaskQueue {
  constructor() {
    this.storageKey = "task_queue";
    this.metadataKey = "task_metadata";
    this.eventKey = "task_events";
    this.chunkSize = 10; // 1チャンクあたりのタスク数を10に削減（より安全）
  }

  // タスクリストを保存（分割保存対応）
  async saveTaskList(taskList) {
    try {
      // 保存前に既存データをクリア
      await this.clearTaskList();
      
      // ストレージ使用量を確認
      const usage = await this.getStorageUsage();
      
      const data = taskList.toJSON();
      const tasks = data.tasks;
      
      // タスクを30個ずつのチャンクに分割
      const chunks = [];
      for (let i = 0; i < tasks.length; i += this.chunkSize) {
        chunks.push(tasks.slice(i, i + this.chunkSize));
      }
      
      
      // メタデータを保存（チャンク数と統計情報）
      await chrome.storage.local.set({
        [this.metadataKey]: {
          chunkCount: chunks.length,
          totalTasks: tasks.length,
          createdAt: data.createdAt,
          statistics: data.statistics,
          aiColumns: data.aiColumns,
        },
      });
      
      // 各チャンクを個別に保存
      for (let i = 0; i < chunks.length; i++) {
        const chunkKey = `${this.storageKey}_chunk_${i}`;
        await chrome.storage.local.set({
          [chunkKey]: chunks[i],
        });
      }
      
      // イベントを記録
      await chrome.storage.local.set({
        [this.eventKey]: {
          type: "task_list_saved",
          timestamp: Date.now(),
          statistics: data.statistics,
          chunkCount: chunks.length,
        },
      });

      return { success: true, statistics: data.statistics, chunkCount: chunks.length };
    } catch (error) {
      console.error("[TaskQueue] 保存エラー:", error);
      return { success: false, error: error.message };
    }
  }

  // タスクリストを読み込み（分割読み込み対応）
  async loadTaskList() {
    try {
      // メタデータを読み込み
      const metaResult = await chrome.storage.local.get([this.metadataKey]);
      const metadata = metaResult[this.metadataKey];
      
      if (!metadata) {
        // 旧形式のデータを試す
        const result = await chrome.storage.local.get([this.storageKey]);
        const data = result[this.storageKey];
        
        if (!data) {
          return null;
        }
        
        // 旧形式のデータを復元
        const { TaskList } = await import("./models.js");
        const taskList = TaskList.fromJSON(data);
        return taskList;
      }
      
      // 新形式（チャンク分割）のデータを読み込み
      const allTasks = [];
      const chunkCount = metadata.chunkCount;
      
      
      // 各チャンクを読み込み
      for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `${this.storageKey}_chunk_${i}`;
        const chunkResult = await chrome.storage.local.get([chunkKey]);
        const chunkData = chunkResult[chunkKey];
        
        if (chunkData) {
          allTasks.push(...chunkData);
        }
      }
      
      // TaskListインスタンスを復元
      const { TaskList, Task } = await import("./models.js");
      const tasks = allTasks.map((taskData) => Task.fromJSON(taskData));
      const taskList = new TaskList(tasks);
      taskList.createdAt = metadata.createdAt || Date.now();
      taskList.aiColumns = metadata.aiColumns || {};
      
      return taskList;
    } catch (error) {
      console.error("[TaskQueue] 読み込みエラー:", error);
      return null;
    }
  }

  // タスクリストをクリア
  async clearTaskList() {
    try {
      // メタデータを取得してチャンク数を確認
      const metaResult = await chrome.storage.local.get([this.metadataKey]);
      const metadata = metaResult[this.metadataKey];
      
      // 削除するキーのリスト
      const keysToRemove = [this.storageKey, this.metadataKey, this.eventKey];
      
      // チャンクがある場合は全てのチャンクキーを追加
      if (metadata && metadata.chunkCount) {
        for (let i = 0; i < metadata.chunkCount; i++) {
          keysToRemove.push(`${this.storageKey}_chunk_${i}`);
        }
      }
      
      // 全ての関連データを削除
      await chrome.storage.local.remove(keysToRemove);

      return { success: true };
    } catch (error) {
      console.error("[TaskQueue] クリアエラー:", error);
      return { success: false, error: error.message };
    }
  }
  
  // ストレージ使用量を取得
  async getStorageUsage() {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
        const mb = (bytesInUse / 1024 / 1024).toFixed(2);
        resolve({ bytesInUse, mb, percentage: (bytesInUse / 10485760 * 100).toFixed(1) });
      });
    });
  }

  // 列ごとのタスクを取得
  async getTasksByColumn(column) {
    const taskList = await this.loadTaskList();
    if (!taskList) return [];

    return taskList.getTasksByColumn(column);
  }

  // AIタイプごとのタスクを取得
  async getTasksByAI(aiType) {
    const taskList = await this.loadTaskList();
    if (!taskList) return [];

    return taskList.getTasksByAI(aiType);
  }

  // 実行可能なタスクを取得
  async getExecutableTasks() {
    const taskList = await this.loadTaskList();
    if (!taskList) return [];

    return taskList.getExecutableTasks();
  }

  // タスクの統計情報を取得
  async getStatistics() {
    const taskList = await this.loadTaskList();
    if (!taskList) {
      return {
        total: 0,
        executable: 0,
        skipped: 0,
        byAI: { chatgpt: 0, claude: 0, gemini: 0 },
        skipReasons: {
          already_answered: 0,
          row_control: 0,
          column_control: 0,
          no_prompt: 0,
        },
      };
    }

    return taskList.getStatistics();
  }
}

export default TaskQueue;
