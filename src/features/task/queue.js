// queue.js - タスクキュー（Chrome Storage管理）

class TaskQueue {
  constructor() {
    this.storageKey = "task_queue";
    this.metadataKey = "task_metadata";
    this.eventKey = "task_events";
  }

  // タスクリストを保存
  async saveTaskList(taskList) {
    try {
      // タスクリストをJSON形式で保存
      const data = taskList.toJSON();

      await chrome.storage.local.set({
        [this.storageKey]: data,
        [this.eventKey]: {
          type: "task_list_saved",
          timestamp: Date.now(),
          statistics: data.statistics,
        },
      });

      return { success: true, statistics: data.statistics };
    } catch (error) {
      console.error("[TaskQueue] 保存エラー:", error);
      return { success: false, error: error.message };
    }
  }

  // タスクリストを読み込み
  async loadTaskList() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const data = result[this.storageKey];

      if (!data) {
        console.log("[TaskQueue] 保存されたタスクリストが見つかりません");
        return null;
      }

      // TaskListインスタンスを復元
      const { TaskList } = await import("./models.js");
      const taskList = TaskList.fromJSON(data);

      console.log(
        "[TaskQueue] タスクリスト読み込み完了:",
        taskList.getStatistics(),
      );
      return taskList;
    } catch (error) {
      console.error("[TaskQueue] 読み込みエラー:", error);
      return null;
    }
  }

  // タスクリストをクリア
  async clearTaskList() {
    try {
      await chrome.storage.local.remove([this.storageKey, this.metadataKey]);

      await chrome.storage.local.set({
        [this.eventKey]: {
          type: "task_list_cleared",
          timestamp: Date.now(),
        },
      });

      console.log("[TaskQueue] タスクリストをクリアしました");
      return { success: true };
    } catch (error) {
      console.error("[TaskQueue] クリアエラー:", error);
      return { success: false, error: error.message };
    }
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
