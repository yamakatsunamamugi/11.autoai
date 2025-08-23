// models.js - タスクモデルの定義

import { TaskFactory } from "./task-schema.js";

// Taskクラス - タスクオブジェクトの振る舞いを定義
class Task {
  constructor(data) {
    // TaskFactoryで検証済みのデータを受け取る
    Object.assign(this, data);
  }

  // タスクが実行可能かチェック
  isExecutable() {
    // レポートタスクの場合は別の条件
    if (this.taskType === "report") {
      return !this.skipReason && this.sourceColumn;
    }
    // AIタスクの場合は従来の条件
    return !this.skipReason && this.prompt && this.prompt.trim().length > 0;
  }

  // タスクをJSON形式で出力（Chrome Storage保存用）
  toJSON() {
    return {
      id: this.id,
      column: this.column,
      row: this.row,
      aiType: this.aiType,
      taskType: this.taskType, // タスクタイプ（"ai" or "report"）
      prompt: this.prompt,
      promptColumn: this.promptColumn,
      sourceColumn: this.sourceColumn, // レポート化の場合のソース列
      reportColumn: this.reportColumn, // レポート化列
      specialOperation: this.specialOperation,
      model: this.model,
      multiAI: this.multiAI,
      existingAnswer: this.existingAnswer,
      skipReason: this.skipReason,
      metadata: this.metadata,
      logColumns: this.logColumns, // ログ列情報を追加
      groupId: this.groupId,
      groupInfo: this.groupInfo,
      specialSettings: this.specialSettings,
      controlFlags: this.controlFlags,
      createdAt: this.createdAt,
      version: this.version,
    };
  }

  // JSONからTaskインスタンスを復元
  static fromJSON(json) {
    return new Task(json);
  }
}

// タスクリスト - 複数のタスクを管理
class TaskList {
  constructor(tasks = []) {
    this.tasks = tasks;
    this.createdAt = Date.now();
    this.aiColumns = {}; // AI列情報を追加
  }

  // タスクを追加（重複チェック付き）
  add(task) {
    // 重複チェック: 同じ列・行のタスクが既に存在しないか確認
    const duplicate = this.tasks.find(existingTask => 
      existingTask.column === task.column && existingTask.row === task.row
    );
    
    if (duplicate) {
      console.warn(`[TaskList] 重複タスクをスキップ: ${task.column}${task.row} (既存ID: ${duplicate.id}, 新規ID: ${task.id})`);
      return false; // 追加しない
    }
    
    this.tasks.push(task);
    return true; // 追加成功
  }

  // タスクを一括追加
  addBatch(tasks) {
    this.tasks.push(...tasks);
  }

  // 実行可能なタスクのみ取得
  getExecutableTasks() {
    return this.tasks.filter((task) => task.isExecutable());
  }

  // AIタイプ別にタスクを取得
  getTasksByAI(aiType) {
    return this.tasks.filter((task) => task.aiType === aiType);
  }

  // 列別にタスクを取得
  getTasksByColumn(column) {
    return this.tasks.filter((task) => task.column === column);
  }

  // 統計情報を取得
  getStatistics() {
    const stats = {
      total: this.tasks.length,
      executable: 0,
      skipped: 0,
      byAI: {
        chatgpt: 0,
        claude: 0,
        gemini: 0,
      },
      skipReasons: {
        already_answered: 0,
        row_control: 0,
        column_control: 0,
        no_prompt: 0,
      },
    };

    this.tasks.forEach((task) => {
      if (task.isExecutable()) {
        stats.executable++;
        // 実行可能なタスクのみAI別カウントを増やす
        if (stats.byAI[task.aiType] !== undefined) {
          stats.byAI[task.aiType]++;
        }
      } else {
        stats.skipped++;
        if (
          task.skipReason &&
          stats.skipReasons[task.skipReason] !== undefined
        ) {
          stats.skipReasons[task.skipReason]++;
        }
      }
    });

    return stats;
  }

  // Chrome Storage保存用のJSON形式
  toJSON() {
    return {
      tasks: this.tasks.map((task) => task.toJSON()),
      createdAt: this.createdAt,
      statistics: this.getStatistics(),
      aiColumns: this.aiColumns, // AI列情報を含める
    };
  }

  // JSONからTaskListインスタンスを復元
  static fromJSON(json) {
    const tasks = json.tasks.map((taskData) => Task.fromJSON(taskData));
    const taskList = new TaskList(tasks);
    taskList.createdAt = json.createdAt || Date.now();
    taskList.aiColumns = json.aiColumns || {}; // AI列情報を復元
    return taskList;
  }
}

export { Task, TaskList, TaskFactory };
