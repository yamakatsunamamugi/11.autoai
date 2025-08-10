// special-configs.js - 特殊モデル・特殊作業の設定モジュール

/**
 * 特殊モデル設定
 * 将来的に追加しやすいようにモジュール化
 */
export const SPECIAL_MODEL_CONFIG = {
  // o3（推論）
  o3: {
    id: "o3",
    displayName: "o3（推論）",
    aliases: ["o3（推論）", "o3(推論)", "o3", "推論"],
    description: "推論能力に特化したモデル",
  },

  // o3-pro（鬼推論）
  "o3-pro": {
    id: "o3-pro",
    displayName: "o3-pro（鬼推論）",
    aliases: ["o3-pro（鬼推論）", "o3-pro(鬼推論)", "o3-pro", "鬼推論"],
    description: "最高レベルの推論能力を持つモデル",
  },
};

/**
 * 特殊作業設定
 * 将来的に追加しやすいようにモジュール化
 */
export const SPECIAL_OPERATION_CONFIG = {
  // DeepResearch
  DeepResearch: {
    id: "DeepResearch",
    displayName: "DeepResearch",
    aliases: ["DeepResearch", "deepresearch", "deep research", "深掘り"],
    description: "深い調査・研究を行う特殊作業",
  },

  // ChatGPT Agent Mode
  ChatGPTAgent: {
    id: "ChatGPTAgent",
    displayName: "エージェントモード",
    aliases: ["エージェントモード", "エージェント", "Agent", "agent"],
    description: "ChatGPTのエージェントモード（新規作成）",
  },

  // ChatGPT Canvas
  ChatGPTCanvas: {
    id: "ChatGPTCanvas",
    displayName: "Canvas",
    aliases: ["Canvas", "canvas", "キャンバス"],
    description: "コード編集やファイル作成に特化したモード",
  },

  // ChatGPT Web Search
  ChatGPTWebSearch: {
    id: "ChatGPTWebSearch",
    displayName: "ウェブ検索",
    aliases: ["ウェブ検索", "Web検索", "検索", "search"],
    description: "最新情報を検索しながら回答",
  },

  // ChatGPT Image Generation
  ChatGPTImage: {
    id: "ChatGPTImage",
    displayName: "画像生成",
    aliases: ["画像生成", "画像を作成", "画像", "image"],
    description: "DALL-E 3による画像生成",
  },
};

/**
 * 設定から抽出マップを生成
 */
export function generateExtractionMap(config) {
  const map = {};

  Object.entries(config).forEach(([key, value]) => {
    // すべてのエイリアスをマップに追加
    value.aliases.forEach((alias) => {
      map[alias] = value.id;
    });
  });

  return map;
}

/**
 * 特殊モデルの抽出マップ
 */
export const SPECIAL_MODEL_MAP = generateExtractionMap(SPECIAL_MODEL_CONFIG);

/**
 * 特殊作業の抽出マップ
 */
export const SPECIAL_OPERATION_MAP = generateExtractionMap(
  SPECIAL_OPERATION_CONFIG,
);

/**
 * 設定に新しい項目を追加
 */
export function addSpecialModel(id, displayName, aliases, description) {
  SPECIAL_MODEL_CONFIG[id] = {
    id,
    displayName,
    aliases,
    description,
  };
  // マップを再生成
  Object.assign(SPECIAL_MODEL_MAP, generateExtractionMap(SPECIAL_MODEL_CONFIG));
}

export function addSpecialOperation(id, displayName, aliases, description) {
  SPECIAL_OPERATION_CONFIG[id] = {
    id,
    displayName,
    aliases,
    description,
  };
  // マップを再生成
  Object.assign(
    SPECIAL_OPERATION_MAP,
    generateExtractionMap(SPECIAL_OPERATION_CONFIG),
  );
}
