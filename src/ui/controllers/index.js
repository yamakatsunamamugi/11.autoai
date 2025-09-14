/**
 * @fileoverview UI コントローラーのエクスポート管理
 * 
 * 各テスト機能のコントローラーを統一的に管理し、
 * 動的インポートのためのエントリーポイントを提供します。
 */

// 各コントローラーの動的インポート関数
export const controllers = {
  /**
   * 1. テスト用AIモデル・機能変更検出システム
   */
  aiDetection: {
    async load() {
      const module = await import('./test-ai-model-function-detection.js');
      return module;
    }
  },

  /**
   * 2. テスト用AIセレクタ変更検出システム (MutationObserver)
   */
  mutationObserver: {
    async load() {
      const module = await import('./test-ai-selector-mutation-observer.js');
      return module;
    }
  },

  // Test controllers - 2つのファイルに分離完了
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