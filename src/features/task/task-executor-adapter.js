// task-executor-adapter.js - タスクとレイアウトを結合するアダプター

import LayoutManager from "./layout-manager.js";

/**
 * タスク実行アダプター
 * タスクデータとレイアウト情報を結合して実行可能な形式に変換
 */
class TaskExecutorAdapter {
  constructor() {
    this.layoutManager = new LayoutManager();
  }

  /**
   * タスクを実行用に準備
   * @param {Object} task - 純粋なタスクオブジェクト
   * @returns {Object} レイアウト情報を含む実行可能なタスク
   */
  prepareTaskForExecution(task) {
    const taskType = this.determineTaskType(task);
    const layout = this.layoutManager.getColumnLayout(
      taskType,
      task.promptColumn,
    );

    return {
      ...task,
      layout: layout,
      writeLocations: this.layoutManager.calculateWriteLocations(task, layout),
    };
  }

  /**
   * タスクタイプを判定
   * @param {Object} task - タスクオブジェクト
   * @returns {string} 'single' または '3type'
   */
  determineTaskType(task) {
    // groupInfoやmultiAIフラグからタスクタイプを判定
    if (task.multiAI || (task.groupInfo && task.groupInfo.type === "3type")) {
      return "3type";
    }
    return "single";
  }

  /**
   * 複数のタスクを一括準備
   * @param {Array} tasks - タスクの配列
   * @returns {Array} 実行可能なタスクの配列
   */
  prepareBatchForExecution(tasks) {
    return tasks.map((task) => this.prepareTaskForExecution(task));
  }

  /**
   * レガシーフォーマットからの変換
   * 既存のlogColumnsプロパティを持つタスクをレイアウトベースに変換
   */
  convertFromLegacyFormat(task) {
    // 既存のlogColumnsがある場合は削除
    const { logColumns, ...cleanTask } = task;

    // 新しい形式で返す
    return this.prepareTaskForExecution(cleanTask);
  }
}

export default TaskExecutorAdapter;
