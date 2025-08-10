// service-registry.js - 依存性注入（DI）コンテナ
//
// 企業レベルのサービス管理:
// - ライフサイクル管理（シングルトン、ファクトリー、プロトタイプ）
// - 循環依存の検出と回避
// - サービスの健全性チェック
// - 動的サービス登録・解除

export class ServiceRegistry {
  constructor(config = null) {
    this.services = new Map(); // サービス定義
    this.instances = new Map(); // インスタンスキャッシュ
    this.dependencies = new Map(); // 依存関係グラフ
    this.config = config;
    this.isShuttingDown = false;
  }

  /**
   * サービスを登録
   * @param {string} name - サービス名
   * @param {Function|Object} factory - ファクトリー関数またはインスタンス
   * @param {Object} options - オプション
   */
  register(name, factory, options = {}) {
    if (this.isShuttingDown) {
      throw new Error("シャットダウン中はサービス登録できません");
    }

    const serviceDefinition = {
      name,
      factory: typeof factory === "function" ? factory : () => factory,
      lifecycle: options.lifecycle || "singleton", // singleton, factory, prototype
      dependencies: options.dependencies || [],
      lazy: options.lazy !== false, // デフォルトは遅延初期化
      health: options.health || null, // ヘルスチェック関数
      tags: options.tags || [],
      metadata: options.metadata || {},
    };

    // 循環依存チェック
    this.checkCircularDependency(name, serviceDefinition.dependencies);

    this.services.set(name, serviceDefinition);
    this.dependencies.set(name, serviceDefinition.dependencies);

    // 即座に初期化する場合
    if (!serviceDefinition.lazy) {
      this.get(name);
    }

    console.debug(`サービス登録: ${name} (${serviceDefinition.lifecycle})`);
  }

  /**
   * サービスを取得
   * @param {string} name - サービス名
   * @returns {*} サービスインスタンス
   */
  get(name) {
    if (this.isShuttingDown) {
      throw new Error("シャットダウン中はサービス取得できません");
    }

    const serviceDefinition = this.services.get(name);
    if (!serviceDefinition) {
      throw new Error(`サービスが見つかりません: ${name}`);
    }

    return this.createInstance(serviceDefinition);
  }

  /**
   * サービスが登録されているかチェック
   * @param {string} name - サービス名
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * サービスを削除
   * @param {string} name - サービス名
   */
  unregister(name) {
    if (this.instances.has(name)) {
      const instance = this.instances.get(name);
      // dispose メソッドがあれば呼び出し
      if (instance && typeof instance.dispose === "function") {
        instance.dispose();
      }
      this.instances.delete(name);
    }

    this.services.delete(name);
    this.dependencies.delete(name);

    console.debug(`サービス削除: ${name}`);
  }

  /**
   * インスタンス作成
   * @param {Object} serviceDefinition - サービス定義
   * @returns {*} インスタンス
   */
  createInstance(serviceDefinition) {
    const { name, factory, lifecycle } = serviceDefinition;

    switch (lifecycle) {
      case "singleton":
        if (!this.instances.has(name)) {
          const instance = this.instantiate(serviceDefinition);
          this.instances.set(name, instance);
        }
        return this.instances.get(name);

      case "factory":
      case "prototype":
        return this.instantiate(serviceDefinition);

      default:
        throw new Error(`未知のライフサイクル: ${lifecycle}`);
    }
  }

  /**
   * インスタンス化（依存関係解決付き）
   * @param {Object} serviceDefinition - サービス定義
   * @returns {*} インスタンス
   */
  instantiate(serviceDefinition) {
    const { name, factory, dependencies } = serviceDefinition;

    try {
      // 依存関係を解決
      const resolvedDependencies = this.resolveDependencies(dependencies);

      // ファクトリー関数を呼び出し
      const instance = factory(resolvedDependencies);

      // インスタンスの後処理
      this.postProcessInstance(instance, serviceDefinition);

      return instance;
    } catch (error) {
      throw new Error(
        `サービス ${name} のインスタンス化に失敗: ${error.message}`,
      );
    }
  }

  /**
   * 依存関係解決
   * @param {Array} dependencies - 依存関係配列
   * @returns {Object} 解決された依存関係
   */
  resolveDependencies(dependencies) {
    const resolved = {};

    for (const dependency of dependencies) {
      if (typeof dependency === "string") {
        resolved[dependency] = this.get(dependency);
      } else if (typeof dependency === "object") {
        const { name, optional = false, defaultValue = null } = dependency;
        try {
          resolved[name] = this.get(name);
        } catch (error) {
          if (!optional) {
            throw error;
          }
          resolved[name] = defaultValue;
        }
      }
    }

    return resolved;
  }

  /**
   * インスタンスの後処理
   * @param {*} instance - インスタンス
   * @param {Object} serviceDefinition - サービス定義
   */
  postProcessInstance(instance, serviceDefinition) {
    // ライフサイクルコールバック
    if (instance && typeof instance.initialize === "function") {
      instance.initialize();
    }

    // メタデータの設定
    if (instance && serviceDefinition.metadata) {
      Object.defineProperty(instance, "__service_metadata__", {
        value: serviceDefinition.metadata,
        enumerable: false,
        writable: false,
      });
    }
  }

  /**
   * 循環依存チェック
   * @param {string} serviceName - サービス名
   * @param {Array} dependencies - 依存関係
   * @param {Set} visited - 訪問済みサービス
   */
  checkCircularDependency(serviceName, dependencies, visited = new Set()) {
    if (visited.has(serviceName)) {
      throw new Error(
        `循環依存が検出されました: ${Array.from(visited).join(" -> ")} -> ${serviceName}`,
      );
    }

    visited.add(serviceName);

    for (const dependency of dependencies) {
      const depName =
        typeof dependency === "string" ? dependency : dependency.name;
      const depDependencies = this.dependencies.get(depName) || [];
      this.checkCircularDependency(depName, depDependencies, new Set(visited));
    }
  }

  /**
   * 全サービスの健全性チェック
   * @returns {Object} ヘルス状態
   */
  getHealthStatus() {
    const health = {
      overall: "healthy",
      services: {},
      timestamp: new Date(),
    };

    let hasUnhealthy = false;

    for (const [name, serviceDefinition] of this.services.entries()) {
      try {
        if (serviceDefinition.health && this.instances.has(name)) {
          const instance = this.instances.get(name);
          const isHealthy = serviceDefinition.health(instance);
          health.services[name] = {
            status: isHealthy ? "healthy" : "unhealthy",
            lifecycle: serviceDefinition.lifecycle,
          };
          if (!isHealthy) hasUnhealthy = true;
        } else {
          health.services[name] = {
            status: "not_checked",
            lifecycle: serviceDefinition.lifecycle,
          };
        }
      } catch (error) {
        health.services[name] = {
          status: "error",
          error: error.message,
          lifecycle: serviceDefinition.lifecycle,
        };
        hasUnhealthy = true;
      }
    }

    if (hasUnhealthy) {
      health.overall = "degraded";
    }

    return health;
  }

  /**
   * レジストリの健全性チェック
   * @returns {boolean}
   */
  isHealthy() {
    const health = this.getHealthStatus();
    return health.overall === "healthy";
  }

  /**
   * サービス再構成
   * @param {string} name - サービス名
   */
  async reconfigure(name) {
    if (!this.services.has(name)) {
      throw new Error(`サービスが見つかりません: ${name}`);
    }

    // シングルトンインスタンスを削除（次回取得時に再作成）
    if (this.instances.has(name)) {
      const instance = this.instances.get(name);
      if (instance && typeof instance.dispose === "function") {
        await instance.dispose();
      }
      this.instances.delete(name);
    }

    console.debug(`サービス再構成: ${name}`);
  }

  /**
   * 登録済みサービス一覧取得
   * @returns {Array} サービス名配列
   */
  getServiceNames() {
    return Array.from(this.services.keys());
  }

  /**
   * サービス詳細情報取得
   * @param {string} name - サービス名
   * @returns {Object} サービス情報
   */
  getServiceInfo(name) {
    const serviceDefinition = this.services.get(name);
    if (!serviceDefinition) {
      return null;
    }

    return {
      name: serviceDefinition.name,
      lifecycle: serviceDefinition.lifecycle,
      dependencies: serviceDefinition.dependencies,
      hasInstance: this.instances.has(name),
      tags: serviceDefinition.tags,
      metadata: serviceDefinition.metadata,
    };
  }

  /**
   * タグによるサービス検索
   * @param {string} tag - タグ
   * @returns {Array} マッチするサービス名配列
   */
  getServicesByTag(tag) {
    const matches = [];
    for (const [name, serviceDefinition] of this.services.entries()) {
      if (serviceDefinition.tags.includes(tag)) {
        matches.push(name);
      }
    }
    return matches;
  }

  /**
   * レジストリのシャットダウン
   */
  async shutdown() {
    console.debug("ServiceRegistry シャットダウン開始");
    this.isShuttingDown = true;

    // 全インスタンスの dispose を呼び出し
    const disposePromises = [];
    for (const [name, instance] of this.instances.entries()) {
      if (instance && typeof instance.dispose === "function") {
        disposePromises.push(
          instance
            .dispose()
            .catch((error) =>
              console.error(`サービス ${name} の dispose でエラー:`, error),
            ),
        );
      }
    }

    await Promise.allSettled(disposePromises);

    // リソースクリア
    this.instances.clear();
    this.services.clear();
    this.dependencies.clear();

    console.debug("ServiceRegistry シャットダウン完了");
  }

  /**
   * デバッグ情報取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      registeredServices: this.getServiceNames().length,
      activeInstances: this.instances.size,
      dependencyGraph: Object.fromEntries(this.dependencies),
      isShuttingDown: this.isShuttingDown,
    };
  }
}
