// task-executor-adapter.js - タスクとレイアウトを結合するアダプター

/**
 * タスク実行アダプター
 * タスクデータを実行可能な形式に変換（シンプル版）
 */
class TaskExecutorAdapter {
  constructor() {
    // LayoutManager不要 - logColumnsをそのまま保持
  }

  /**
   * タスクを実行用に準備
   * @param {Object} task - 純粋なタスクオブジェクト
   * @returns {Object} 実行可能なタスク
   */
  prepareTaskForExecution(task) {
    // タスクをそのまま返す（logColumnsを保持）
    return {
      ...task
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
   * logColumnsプロパティを保持するように修正
   */
  convertFromLegacyFormat(task) {
    // logColumnsを削除せずにそのまま保持
    return this.prepareTaskForExecution(task);
  }
}

export default TaskExecutorAdapter;
