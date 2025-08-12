// spreadsheet-config.js - スプレッドシート構造の定義
// 3.auto-aiと同じ構造を使用

const SPREADSHEET_CONFIG = {
  // 行の識別定義
  rowIdentifiers: {
    // A列で検索する行
    menuRow: {
      keyword: "メニュー",
      name: "メニュー行",
      expectedTexts: [
        "ログ",
        "プロンプト",
        "回答",
        "ChatGPT回答",
        "Claude回答",
        "Gemini回答",
      ],
    },

    controlRow: {
      keyword: "行の処理",
      name: "列制御",
      expectedTexts: [
        "この列のみ処理",
        "この列から処理",
        "この列の処理後に停止",
      ],
    },

    aiRow: {
      keyword: "使うAI",
      name: "使うAI行",
      expectedTexts: [
        "ChatGPT",
        "Claude",
        "Gemini",
        "3種類（ChatGPT・Gemini・Claude）",
      ],
      aiModels: {
        ChatGPT: { type: "chatgpt", displayName: "ChatGPT" },
        Claude: { type: "claude", displayName: "Claude" },
        Gemini: { type: "gemini", displayName: "Gemini" },
        "3種類（ChatGPT・Gemini・Claude）": {
          type: "multi",
          displayName: "マルチAI",
        },
      },
    },

    modelRow: {
      keyword: "モデル",
      name: "モデル行",
      expectedTexts: ["o3（推論）", "o3-pro（鬼推論）"],
    },

    taskRow: {
      keyword: "機能",
      name: "機能行",
      expectedTexts: ["DeepReserch"],
    },
  },

  // 作業行の定義
  workRow: {
    startMarker: "1", // A列が「1」から始まる
    name: "作業行",
  },

  // 行制御の定義（B列）
  rowControl: {
    column: "B",
    types: {
      stopAfter: "この行の処理後に停止",
      startFrom: "この行から処理",
      onlyThis: "この行のみ処理",
    },
  },

  // 列の種別識別（メニュー行で使用）
  columnTypes: {
    log: {
      keyword: "ログ",
      type: "log",
    },
    prompt: {
      keyword: "プロンプト",
      type: "prompt",
    },
    prompt2: {
      keyword: "プロンプト2",
      type: "prompt",
    },
    prompt3: {
      keyword: "プロンプト3",
      type: "prompt",
    },
    prompt4: {
      keyword: "プロンプト4",
      type: "prompt",
    },
    prompt5: {
      keyword: "プロンプト5",
      type: "prompt",
    },
    answer: {
      keyword: "回答",
      type: "answer",
    },
    chatgptAnswer: {
      keyword: "ChatGPT回答",
      type: "answer",
      aiType: "chatgpt",
    },
    claudeAnswer: {
      keyword: "Claude回答",
      type: "answer",
      aiType: "claude",
    },
    geminiAnswer: {
      keyword: "Gemini回答",
      type: "answer",
      aiType: "gemini",
    },
    history: {
      keyword: "処理履歴を記録",
      type: "history",
    },
    documentUrl: {
      keyword: "ドキュメントURL",
      type: "documentUrl",
    },
    report: {
      keyword: "レポート化",
      type: "report",
    },
  },

  // その他の設定
  settings: {
    maxColumns: 26, // A-Z列まで
    defaultTimeout: 30000, // 30秒
    retryCount: 3,
  },
};

// Chrome拡張機能で使用できるようにグローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.SPREADSHEET_CONFIG = SPREADSHEET_CONFIG;
}
