/**
 * @fileoverview UI コントローラーのエクスポート管理
 * 
 * 各テスト機能のコントローラーを統一的に管理し、
 * 動的インポートのためのエントリーポイントを提供します。
 */

// 各コントローラーの動的インポート関数
export const controllers = {
  /**
   * 1. モデル・機能変更検出システム
   */
  aiDetection: {
    async load() {
      const module = await import('./ai-detection-controller.js');
      return module;
    }
  },

  /**
   * 2. AIセレクタ変更検出システム
   */
  mutationObserver: {
    async load() {
      const module = await import('./mutation-observer-controller.js');
      return module;
    }
  },

  // Test controllers removed - only keeping model/function detection
};

/**
 * 特定のコントローラーを動的にロード
 * @param {string} controllerName - コントローラー名
 * @returns {Promise<Object>} コントローラーモジュール
 */
export async function loadController(controllerName) {
  if (!controllers[controllerName]) {
    throw new Error(`Controller '${controllerName}' not found`);
  }
  
  try {
    const module = await controllers[controllerName].load();
    console.log(`✅ Controller '${controllerName}' loaded successfully`);
    return module;
  } catch (error) {
    console.error(`❌ Failed to load controller '${controllerName}':`, error);
    throw error;
  }
}

/**
 * すべてのコントローラーを事前ロード（オプション）
 * @returns {Promise<Object>} 全コントローラーモジュール
 */
export async function preloadAllControllers() {
  const loadedControllers = {};
  
  for (const [name, controller] of Object.entries(controllers)) {
    try {
      loadedControllers[name] = await controller.load();
      console.log(`✅ Preloaded controller: ${name}`);
    } catch (error) {
      console.error(`❌ Failed to preload controller '${name}':`, error);
      loadedControllers[name] = null;
    }
  }
  
  return loadedControllers;
}

/**
 * 利用可能なコントローラー一覧を取得
 * @returns {Array<string>} コントローラー名の配列
 */
export function getAvailableControllers() {
  return Object.keys(controllers);
}

// デフォルトエクスポート
export default {
  controllers,
  loadController,
  preloadAllControllers,
  getAvailableControllers
};