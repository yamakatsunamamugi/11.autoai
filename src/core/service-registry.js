/**
 * @fileoverview サービスレジストリ - すべてのサービス登録を管理
 *
 * アプリケーション全体のサービス登録を一元管理し、
 * 段階的な依存性注入への移行をサポート
 *
 * @example
 * // サービスの初期化
 * const container = await initializeServices();
 * const taskProcessor = container.get('taskProcessor');
 */

import DIContainer from './di-container.js';

/**
 * メインのサービスコンテナを初期化
 * @returns {Promise<DIContainer>} 初期化済みのDIコンテナ
 */
export async function initializeServices() {
  const container = new DIContainer();

  // ========================================
  // Phase 0: エラーハンドリングサービス
  // ========================================

  // ErrorService - エラーハンドリング
  container.register('errorService', async () => {
    const module = await import('./error-service.js');
    const getErrorService = module.getErrorService;
    return getErrorService();
  });

  // ========================================
  // Phase 1: 基本サービス（グローバル変数との互換性維持）
  // ========================================

  // SheetsClient - スプレッドシート操作（統合版）
  container.register('sheetsClient', async (container) => {
    // 既存のglobalThis.sheetsClientがあれば使用（移行期間用）
    if (globalThis.sheetsClient) {
      return globalThis.sheetsClient;
    }

    // sheets-client.jsからインポート（メイン実装）
    const module = await import('../features/spreadsheet/sheets-client.js');
    const SheetsClient = module.default || module.SheetsClient;

    // AuthServiceを取得
    let authService = null;
    try {
      authService = await container.get('authService');
    } catch (e) {
      console.warn('AuthService not available for SheetsClient');
    }

    // 新しいインスタンスを作成（依存性注入）
    const client = new SheetsClient({
      authService: authService
    });

    // グローバル変数にも設定（後方互換性）
    globalThis.sheetsClient = client;

    return client;
  });

  // DocsClient - Google Docs操作
  container.register('docsClient', async (container) => {
    // 既存のglobalThis.docsClientがあれば使用
    if (globalThis.docsClient) {
      return globalThis.docsClient;
    }

    // docs-client.jsからインポート
    const module = await import('../features/spreadsheet/docs-client.js');
    const DocsClient = module.default || module.DocsClient;

    // AuthServiceを取得
    let authService = null;
    try {
      authService = await container.get('authService');
    } catch (e) {
      console.warn('AuthService not available for DocsClient');
    }

    // 新しいインスタンスを作成（依存性注入）
    const client = new DocsClient({
      authService: authService
    });

    // グローバル変数にも設定（後方互換性）
    globalThis.docsClient = client;

    return client;
  });

  // AuthService - 認証サービス（統合版）
  container.register('authService', async () => {
    // 既存のグローバルインスタンスを確認
    if (globalThis.authService) {
      return globalThis.authService;
    }

    // auth-service.jsからインポート
    const module = await import('../services/auth-service.js');
    const AuthService = module.default || module.AuthService;
    const getAuthService = module.getAuthService;

    // getAuthServiceがあればシングルトンを使用
    if (getAuthService) {
      const service = getAuthService();
      globalThis.authService = service;
      return service;
    }

    // フォールバック：新しいインスタンスを作成
    const service = new AuthService();
    globalThis.authService = service;
    return service;
  });

  // PowerManager - スリープ防止
  container.register('powerManager', () => {
    if (globalThis.powerManager) {
      return globalThis.powerManager;
    }
    // PowerManagerの実装がある場合はインポート
    // 現在はglobalThisから取得
    return globalThis.powerManager || null;
  });

  // ========================================
  // Phase 2: ログ・監視サービス
  // ========================================

  // LogService - 統合ログサービス
  container.register('logService', async (container) => {
    const module = await import('./log-service.js');
    const createLogService = module.createLogService;
    return await createLogService(container);
  });

  // SpreadsheetLogger - スプレッドシートログ（統合版）
  container.register('spreadsheetLogger', async (container) => {
    // 既存のglobalThis.spreadsheetLoggerがあれば使用
    if (globalThis.spreadsheetLogger) {
      return globalThis.spreadsheetLogger;
    }

    // features/logging/spreadsheet-logger.jsからインポート（メイン実装）
    const module = await import('../features/logging/spreadsheet-logger.js');
    const SpreadsheetLogger = module.default || module.SpreadsheetLogger;

    // SheetsClientを取得（必要に応じて）
    let sheetsClient = null;
    try {
      sheetsClient = await container.get('sheetsClient');
    } catch (e) {
      console.warn('SpreadsheetLogger: sheetsClientが利用できません', e);
    }

    // 新しいインスタンスを作成
    const logger = new SpreadsheetLogger(console);

    // sheetsClientがあれば設定
    if (sheetsClient) {
      logger.sheetsClient = sheetsClient;
    }

    // グローバル変数にも設定（後方互換性）
    globalThis.spreadsheetLogger = logger;

    return logger;
  });

  // ========================================
  // Phase 3: タスク実行サービス
  // ========================================

  // RetryManager - リトライ管理
  container.register('retryManager', () => {
    // 既存のgetGlobalAICommonBaseから取得を試みる
    if (typeof globalThis.getGlobalAICommonBase === 'function') {
      const commonBase = globalThis.getGlobalAICommonBase();
      if (commonBase && commonBase.RetryManager) {
        return new commonBase.RetryManager();
      }
    }
    // フォールバック：簡易的なRetryManager
    return {
      executeWithRetry: async (fn, options = {}) => {
        const maxRetries = options.maxRetries || 3;
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn();
          } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
          }
        }
        throw lastError;
      }
    };
  });

  // AITaskExecutor - AI実行エンジン
  container.register('taskExecutor', async (container) => {
    const module = await import('../core/ai-task-executor.js');
    const AITaskExecutor = module.default || module.AITaskExecutor;
    const retryManager = await container.get('retryManager');

    return new AITaskExecutor({
      retryManager: retryManager
    });
  });

  // ExclusiveControlManager - 排他制御
  container.register('exclusiveControlManager', async (container) => {
    const sheetsClient = await container.get('sheetsClient');

    // 簡易的な排他制御マネージャー
    return {
      acquireLock: async (spreadsheetId) => {
        // 実装は後で追加
        return {
          release: async () => {}
        };
      },
      isEnabled: () => false
    };
  });

  // ========================================
  // Phase 4: メインプロセッサー（新規作成予定）
  // ========================================

  // TaskProcessor - タスクプロセッサー（アダプター経由）
  container.register('taskProcessor', async (container) => {
    // TaskProcessorAdapterを使用
    const module = await import('./task-processor-adapter.js');
    const createTaskProcessorAdapter = module.createTaskProcessorAdapter;

    // アダプターを作成（DIコンテナを渡す）
    const adapter = await createTaskProcessorAdapter(container);

    return adapter;
  });

  // ========================================
  // Phase 5: ハンドラー（将来的に追加）
  // ========================================

  return container;
}

/**
 * グローバルコンテナインスタンス（シングルトン）
 */
let globalContainer = null;

/**
 * グローバルコンテナを取得（遅延初期化）
 * @returns {Promise<DIContainer>}
 */
export async function getGlobalContainer() {
  if (!globalContainer) {
    globalContainer = await initializeServices();
  }
  return globalContainer;
}

/**
 * サービスを取得するヘルパー関数
 * @param {string} serviceName - サービス名
 * @returns {Promise<*>} サービスインスタンス
 */
export async function getService(serviceName) {
  const container = await getGlobalContainer();
  return container.get(serviceName);
}

/**
 * 複数のサービスを取得するヘルパー関数
 * @param {Array<string>} serviceNames - サービス名の配列
 * @returns {Promise<Object>} サービスのオブジェクト
 */
export async function getServices(...serviceNames) {
  const container = await getGlobalContainer();
  return container.getMultiple(serviceNames);
}

/**
 * コンテナをリセット（テスト用）
 */
export function resetContainer() {
  if (globalContainer) {
    globalContainer.clearSingletons();
    globalContainer = null;
  }
}

// デバッグ用：コンテナの状態を確認
export async function debugContainer() {
  const container = await getGlobalContainer();
  container.debug();
}

export default {
  initializeServices,
  getGlobalContainer,
  getService,
  getServices,
  resetContainer,
  debugContainer
};