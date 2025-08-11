// task-schema.js - タスクモデルのスキーマ定義
// 将来の拡張に対応できるよう、バージョン管理とバリデーション機能を含む

const TaskSchema = {
  version: "2.0.0",
  fields: {
    // 必須フィールド
    id: {
      type: "string",
      required: true,
      description: "タスクの一意識別子",
    },
    column: {
      type: "string",
      required: true,
      description: "回答を書き込む列（例: B, D）",
      pattern: /^[A-Z]+$/,
    },
    row: {
      type: "number",
      required: true,
      description: "行番号",
      min: 1,
    },
    aiType: {
      type: "string",
      required: true,
      enum: ["chatgpt", "claude", "gemini"],
      description: "使用するAIサービス",
    },
    prompt: {
      type: "string",
      required: true,
      description: "AIに送信するプロンプト",
    },
    promptColumn: {
      type: "string",
      required: true,
      description: "プロンプトが記載されている列",
      pattern: /^[A-Z]+$/,
    },

    // グループ管理フィールド（新規追加）
    groupId: {
      type: "string",
      required: true,
      description: "グループの識別子（同じ処理単位で共通）",
    },
    groupInfo: {
      type: "object",
      required: true,
      description: "グループ情報",
      schema: {
        type: { type: "string", enum: ["3type", "single"] },
        position: { type: "number" },
        totalInGroup: { type: "number" },
        columns: { type: "array" },
        promptColumn: { type: "string" },
      },
    },

    // オプションフィールド
    specialOperation: {
      type: "string",
      required: false,
      description: "機能の種類（deep_research等）",
    },
    model: {
      type: "string",
      required: false,
      description: "モデル（gpt-4等）",
    },

    // 列固有の特殊設定（新規追加）
    specialSettings: {
      type: "object",
      required: false,
      description: "列固有の特殊設定",
      schema: {
        operation: { type: "string", required: false },
        model: { type: "string", required: false },
      },
    },

    // 制御フラグ（新規追加）
    controlFlags: {
      type: "object",
      required: false,
      description: "処理制御フラグ",
      schema: {
        stopAfterGroup: { type: "boolean", default: false },
        priority: { type: "number", default: 0 },
      },
    },

    // ログ列情報（新規追加）
    logColumns: {
      type: "object",
      required: false,
      description: "ログ列の位置情報",
      schema: {
        left: { type: "string", required: false },
        right: { type: "string", required: false },
        log: { type: "string", required: false },
        layout: { type: "string", enum: ["3type", "single"], required: false },
        aiColumns: {
          type: "object",
          required: false,
          schema: {
            chatgpt: { type: "string", required: false },
            claude: { type: "string", required: false },
            gemini: { type: "string", required: false },
          },
        },
      },
    },

    multiAI: {
      type: "boolean",
      default: false,
      description: "3種類AIタスクかどうか",
    },
    existingAnswer: {
      type: "string",
      required: false,
      description: "既存の回答（回答済みの場合）",
    },
    skipReason: {
      type: "string",
      required: false,
      enum: ["already_answered", "row_control", "column_control", "no_prompt"],
      description: "スキップされた理由",
    },

    // メタデータ
    metadata: {
      type: "object",
      default: {},
      description: "追加のメタデータ",
    },
    createdAt: {
      type: "number",
      default: () => Date.now(),
      description: "タスク生成時刻",
    },
    version: {
      type: "string",
      default: "2.0.0",
      description: "スキーマバージョン",
    },
  },

  // バリデーションルール
  validate(data) {
    const errors = [];

    // 必須フィールドチェック
    for (const [field, config] of Object.entries(this.fields)) {
      if (config.required && !data.hasOwnProperty(field)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // 型チェック
    for (const [field, value] of Object.entries(data)) {
      const config = this.fields[field];
      if (!config) continue;

      if (config.type === "string" && typeof value !== "string") {
        errors.push(`Field ${field} must be string, got ${typeof value}`);
      }
      if (config.type === "number" && typeof value !== "number") {
        errors.push(`Field ${field} must be number, got ${typeof value}`);
      }
      if (config.type === "boolean" && typeof value !== "boolean") {
        errors.push(`Field ${field} must be boolean, got ${typeof value}`);
      }

      // enum チェック
      if (config.enum && !config.enum.includes(value)) {
        errors.push(`Field ${field} must be one of: ${config.enum.join(", ")}`);
      }

      // pattern チェック
      if (config.pattern && !config.pattern.test(value)) {
        errors.push(`Field ${field} does not match pattern: ${config.pattern}`);
      }

      // min チェック
      if (config.min !== undefined && value < config.min) {
        errors.push(`Field ${field} must be >= ${config.min}`);
      }
    }

    return errors;
  },
};

// タスクファクトリー - スキーマに基づいてタスクを生成
class TaskFactory {
  static createTask(params) {
    // デフォルト値を適用
    const taskData = {};

    for (const [field, config] of Object.entries(TaskSchema.fields)) {
      if (params.hasOwnProperty(field)) {
        taskData[field] = params[field];
      } else if (config.hasOwnProperty("default")) {
        taskData[field] =
          typeof config.default === "function"
            ? config.default()
            : config.default;
      }
    }

    // 追加フィールドも含める（logColumnsなど、スキーマに未定義でも許可）
    for (const [key, value] of Object.entries(params)) {
      if (!taskData.hasOwnProperty(key)) {
        taskData[key] = value;
      }
    }

    // バリデーション
    const errors = TaskSchema.validate(taskData);
    if (errors.length > 0) {
      throw new Error(`Task validation failed: ${errors.join(", ")}`);
    }

    return taskData;
  }

  static createBatch(paramsList) {
    return paramsList.map((params) => this.createTask(params));
  }
}

export { TaskSchema, TaskFactory };
