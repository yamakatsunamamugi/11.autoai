/**
 * @fileoverview 依存性注入（DI）コンテナ
 *
 * サービスの登録、解決、ライフサイクル管理を提供する軽量DIコンテナ
 *
 * @example
 * // コンテナの作成
 * const container = new DIContainer();
 *
 * // サービスの登録
 * container.register('sheetsClient', () => new SheetsClient());
 * container.register('logger', (container) => new Logger(container.get('sheetsClient')));
 *
 * // サービスの取得
 * const logger = container.get('logger');
 */

export class DIContainer {
  constructor() {
    // サービス定義を保存
    this.services = new Map();
    // シングルトンインスタンスを保存
    this.singletons = new Map();
    // 循環依存検出用
    this.resolving = new Set();
  }

  /**
   * サービスを登録
   * @param {string} name - サービス名
   * @param {Function|*} factoryOrValue - ファクトリ関数または値
   * @param {Object} options - オプション設定
   * @param {boolean} options.singleton - シングルトンとして管理（デフォルト: true）
   * @param {Array<string>} options.dependencies - 明示的な依存関係リスト
   */
  register(name, factoryOrValue, options = {}) {
    if (!name) {
      throw new Error('サービス名は必須です');
    }

    const serviceDefinition = {
      factory: typeof factoryOrValue === 'function' ? factoryOrValue : () => factoryOrValue,
      singleton: options.singleton !== false,
      dependencies: options.dependencies || []
    };

    this.services.set(name, serviceDefinition);

    // 既存のシングルトンインスタンスをクリア
    if (this.singletons.has(name)) {
      this.singletons.delete(name);
    }

    return this;
  }

  /**
   * サービスを取得
   * @param {string} name - サービス名
   * @returns {*} サービスインスタンス
   */
  get(name) {
    if (!this.services.has(name)) {
      // グローバル変数へのフォールバック（移行期間用）
      if (globalThis[name]) {
        console.warn(`DIコンテナ: '${name}'はglobalThisから取得されました。将来的に登録が必要です。`);
        return globalThis[name];
      }
      throw new Error(`サービス '${name}' は登録されていません`);
    }

    // 循環依存のチェック
    if (this.resolving.has(name)) {
      throw new Error(`循環依存が検出されました: ${name}`);
    }

    const service = this.services.get(name);

    // シングルトンの場合はキャッシュを確認
    if (service.singleton && this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    try {
      this.resolving.add(name);

      // インスタンスを作成
      const instance = service.factory(this);

      // シングルトンの場合はキャッシュに保存
      if (service.singleton) {
        this.singletons.set(name, instance);
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * 複数のサービスを一度に取得
   * @param {Array<string>} names - サービス名の配列
   * @returns {Object} サービス名をキーとしたオブジェクト
   */
  getMultiple(names) {
    const result = {};
    for (const name of names) {
      result[name] = this.get(name);
    }
    return result;
  }

  /**
   * サービスが登録されているか確認
   * @param {string} name - サービス名
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name) || !!globalThis[name];
  }

  /**
   * すべてのシングルトンインスタンスをクリア
   */
  clearSingletons() {
    this.singletons.clear();
  }

  /**
   * 特定のシングルトンインスタンスをクリア
   * @param {string} name - サービス名
   */
  clearSingleton(name) {
    this.singletons.delete(name);
  }

  /**
   * 登録されているすべてのサービス名を取得
   * @returns {Array<string>}
   */
  getRegisteredServices() {
    return Array.from(this.services.keys());
  }

  /**
   * サービスの依存関係を取得
   * @param {string} name - サービス名
   * @returns {Array<string>} 依存サービス名のリスト
   */
  getDependencies(name) {
    if (!this.services.has(name)) {
      return [];
    }
    return this.services.get(name).dependencies;
  }

  /**
   * バッチ登録用のヘルパーメソッド
   * @param {Object} definitions - サービス定義のオブジェクト
   * @example
   * container.registerBatch({
   *   sheetsClient: () => new SheetsClient(),
   *   logger: (c) => new Logger(c.get('sheetsClient'))
   * });
   */
  registerBatch(definitions) {
    for (const [name, factory] of Object.entries(definitions)) {
      this.register(name, factory);
    }
    return this;
  }

  /**
   * デバッグ情報を出力
   */
  debug() {
    console.group('DIコンテナ デバッグ情報');
    console.log('登録済みサービス:', this.getRegisteredServices());
    console.log('シングルトンインスタンス:', Array.from(this.singletons.keys()));
    console.log('解決中のサービス:', Array.from(this.resolving));
    console.groupEnd();
  }
}

// デフォルトのグローバルコンテナを作成（オプション）
export const defaultContainer = new DIContainer();

export default DIContainer;