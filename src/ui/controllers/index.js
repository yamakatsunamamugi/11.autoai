/**
 * @fileoverview UI コントローラーのエクスポート管理
 *
 * 各テスト機能のコントローラーを統一的に管理し、
 * 動的インポートのためのエントリーポイントを提供します。
 */

// 各コントローラーの動的インポート関数
export const controllers = {
  /**
   * 1. AIモデル・機能変更検出システム (統合関数版)
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
  }
};

/**
 * 特定のコントローラーを動的にロード
 * @param {string} controllerName - コントローラー名
 * @returns {Promise<Object>} コントローラーモジュール
 */
export async function loadController(controllerName) {
  console.log(`🔴 [DEBUG] loadController開始: ${controllerName}`);
  console.log(`🔴 [DEBUG] 利用可能なコントローラー:`, Object.keys(controllers));

  if (!controllers[controllerName]) {
    const error = `Controller '${controllerName}' not found`;
    console.error(`❌ [DEBUG] ${error}`);
    throw new Error(error);
  }

  try {
    console.log(`🔴 [DEBUG] ${controllerName}コントローラーのload()実行開始`);
    const module = await controllers[controllerName].load();
    console.log(`🟢 [DEBUG] ${controllerName}モジュール読み込み成功:`, module);
    console.log(`🟢 [DEBUG] モジュールのエクスポート:`, Object.keys(module));
    console.log(`✅ Controller '${controllerName}' loaded successfully`);
    return module;
  } catch (error) {
    console.error(`❌ [DEBUG] ${controllerName}コントローラー読み込みエラー:`, error);
    console.error(`❌ [DEBUG] エラー詳細:`, error.stack);
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