// Gemini機能設定 - 一元管理
// 新しい機能を追加する場合は、このファイルに追加するだけで全体に反映されます

const GEMINI_FEATURES = {
  DeepResearch: {
    id: "DeepResearch",
    name: "DeepResearch",
    description: "🔬 深い調査・研究を行う機能",
    enableFunction: "enableGeminiDeepResearch",
    disableFunction: "disableGeminiDeepResearch",
    stateFunction: "getGeminiDeepResearchState",
    badge: { text: "DeepResearch", color: "#28a745" },
  },
  DeepThink: {
    id: "DeepThink",
    name: "DeepThink",
    description: "🧠 深い思考モード",
    enableFunction: "enableGeminiDeepThink",
    disableFunction: "disableGeminiDeepThink",
    stateFunction: "getGeminiDeepThinkState",
    badge: { text: "DeepThink", color: "#9b59b6" },
  },
  Canvas: {
    id: "Canvas",
    name: "Canvas",
    description: "🎨 Canvas機能",
    enableFunction: "enableGeminiCanvas",
    disableFunction: "disableGeminiCanvas",
    stateFunction: "getGeminiCanvasState",
    badge: { text: "Canvas", color: "#3498db" },
  },
  Image: {
    id: "Image",
    name: "画像モード",
    description: "🖼️ 画像生成機能",
    enableFunction: "enableGeminiImage",
    disableFunction: "disableGeminiImage",
    stateFunction: "getGeminiImageState",
    badge: { text: "画像", color: "#e74c3c" },
  },
  Video: {
    id: "Video",
    name: "動画モード",
    description: "🎬 動画解析機能",
    enableFunction: "enableGeminiVideo",
    disableFunction: "disableGeminiVideo",
    stateFunction: "getGeminiVideoState",
    badge: { text: "動画", color: "#f39c12" },
  },
};

// 新機能追加例：
// Audio: {
//   id: "Audio",
//   name: "音声モード",
//   description: "🎵 音声解析機能",
//   enableFunction: "enableGeminiAudio",
//   disableFunction: "disableGeminiAudio",
//   stateFunction: "getGeminiAudioState",
//   badge: { text: "音声", color: "#16a085" }
// }

// エクスポート（ES6モジュール）
export { GEMINI_FEATURES };
