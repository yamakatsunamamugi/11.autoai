/**
 * ウィンドウ初期化タイムアウト設定UI管理
 * Chrome Storageを使用して設定を保存・読み込み
 */

// ログ設定
const log = {
  info: (...args) => console.log("[WindowInitSettings]", ...args),
  error: (...args) => console.error("[WindowInitSettings]", ...args),
  debug: (...args) => console.debug("[WindowInitSettings]", ...args),
};

/**
 * ウィンドウ初期化タイムアウト設定管理クラス
 */
class WindowInitSettings {
  constructor() {
    // デフォルト設定
    this.defaultSettings = {
      WINDOW_CREATION_WAIT: 5000, // ウィンドウ作成初期待機: 5秒
      TAB_READY_TIMEOUT: 20000, // タブ準備確認タイムアウト: 20秒
      CONTENT_SCRIPT_WAIT: 3000, // Content Script初期化待機: 3秒
      ELEMENT_RETRY_COUNT: 5, // 要素検出リトライ回数: 5回
      ELEMENT_RETRY_INTERVAL: 2750, // 要素検出リトライ間隔: 2.75秒
    };

    this.initializeUI();
  }

  /**
   * UI要素の初期化とイベントリスナーの設定
   */
  initializeUI() {
    // DOM要素の取得
    this.elements = {
      // スライダー
      windowCreationWait: document.getElementById("windowCreationWait"),
      tabReadyTimeout: document.getElementById("tabReadyTimeout"),
      contentScriptWait: document.getElementById("contentScriptWait"),
      elementRetryCount: document.getElementById("elementRetryCount"),
      elementRetryInterval: document.getElementById("elementRetryInterval"),

      // 表示値
      windowCreationWaitValue: document.getElementById(
        "windowCreationWaitValue",
      ),
      tabReadyTimeoutValue: document.getElementById("tabReadyTimeoutValue"),
      contentScriptWaitValue: document.getElementById("contentScriptWaitValue"),
      elementRetryCountValue: document.getElementById("elementRetryCountValue"),
      elementRetryIntervalValue: document.getElementById(
        "elementRetryIntervalValue",
      ),

      // ボタン
      saveBtn: document.getElementById("saveWindowInitBtn"),

      // ステータス
      status: document.getElementById("windowInitStatus"),
    };

    // 保存済み設定の読み込み
    this.loadSettings();

    // イベントリスナーの設定
    this.setupEventListeners();
  }

  /**
   * イベントリスナーのセットアップ
   */
  setupEventListeners() {
    // スライダーの値変更時の表示更新
    this.elements.windowCreationWait?.addEventListener("input", (e) => {
      const seconds = Math.round(parseInt(e.target.value) / 1000);
      this.elements.windowCreationWaitValue.textContent = `${seconds}秒`;
    });

    this.elements.tabReadyTimeout?.addEventListener("input", (e) => {
      const seconds = Math.round(parseInt(e.target.value) / 1000);
      this.elements.tabReadyTimeoutValue.textContent = `${seconds}秒`;
    });

    this.elements.contentScriptWait?.addEventListener("input", (e) => {
      const seconds = (parseInt(e.target.value) / 1000).toFixed(1);
      this.elements.contentScriptWaitValue.textContent = `${seconds}秒`;
    });

    this.elements.elementRetryCount?.addEventListener("input", (e) => {
      this.elements.elementRetryCountValue.textContent = `${e.target.value}回`;
    });

    this.elements.elementRetryInterval?.addEventListener("input", (e) => {
      const seconds = (parseInt(e.target.value) / 1000).toFixed(1);
      this.elements.elementRetryIntervalValue.textContent = `${seconds}秒`;
    });

    // 保存ボタン
    this.elements.saveBtn?.addEventListener("click", () => {
      this.saveSettings();
    });
  }

  /**
   * 表示値の更新
   */
  updateDisplayValues() {
    const windowCreationSeconds = Math.round(
      parseInt(this.elements.windowCreationWait.value) / 1000,
    );
    const tabReadySeconds = Math.round(
      parseInt(this.elements.tabReadyTimeout.value) / 1000,
    );
    const contentScriptSeconds = (
      parseInt(this.elements.contentScriptWait.value) / 1000
    ).toFixed(1);
    const retryCount = this.elements.elementRetryCount.value;
    const retryIntervalSeconds = (
      parseInt(this.elements.elementRetryInterval.value) / 1000
    ).toFixed(1);

    this.elements.windowCreationWaitValue.textContent = `${windowCreationSeconds}秒`;
    this.elements.tabReadyTimeoutValue.textContent = `${tabReadySeconds}秒`;
    this.elements.contentScriptWaitValue.textContent = `${contentScriptSeconds}秒`;
    this.elements.elementRetryCountValue.textContent = `${retryCount}回`;
    this.elements.elementRetryIntervalValue.textContent = `${retryIntervalSeconds}秒`;
  }

  /**
   * 設定をChrome Storageから読み込み
   */
  async loadSettings() {
    if (!chrome?.storage?.local) {
      log.warn("Chrome Storage APIが利用できません");
      return;
    }

    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get("windowInitConfig", resolve);
      });

      const settings = result.windowInitConfig || this.defaultSettings;

      // UI要素に値を設定
      this.elements.windowCreationWait.value = settings.WINDOW_CREATION_WAIT;
      this.elements.tabReadyTimeout.value = settings.TAB_READY_TIMEOUT;
      this.elements.contentScriptWait.value = settings.CONTENT_SCRIPT_WAIT;
      this.elements.elementRetryCount.value = settings.ELEMENT_RETRY_COUNT;
      this.elements.elementRetryInterval.value =
        settings.ELEMENT_RETRY_INTERVAL;

      // 表示値を更新
      this.updateDisplayValues();

      log.info("設定を読み込みました:", settings);
    } catch (error) {
      log.error("設定の読み込みに失敗しました:", error);
    }
  }

  /**
   * 設定をChrome Storageに保存
   */
  async saveSettings() {
    if (!chrome?.storage?.local) {
      log.warn("Chrome Storage APIが利用できません");
      this.showStatus("⚠️ 保存に失敗しました（Storage API利用不可）", false);
      return;
    }

    const settings = {
      WINDOW_CREATION_WAIT: parseInt(this.elements.windowCreationWait.value),
      TAB_READY_TIMEOUT: parseInt(this.elements.tabReadyTimeout.value),
      CONTENT_SCRIPT_WAIT: parseInt(this.elements.contentScriptWait.value),
      ELEMENT_RETRY_COUNT: parseInt(this.elements.elementRetryCount.value),
      ELEMENT_RETRY_INTERVAL: parseInt(
        this.elements.elementRetryInterval.value,
      ),
    };

    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ windowInitConfig: settings }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      log.info("設定を保存しました:", settings);
      this.showStatus("✅ 保存しました", true);
    } catch (error) {
      log.error("設定の保存に失敗しました:", error);
      this.showStatus("❌ 保存に失敗しました", false);
    }
  }

  /**
   * ステータスメッセージの表示
   */
  showStatus(message, success = true) {
    if (!this.elements.status) return;

    this.elements.status.textContent = message;
    this.elements.status.style.color = success ? "#28a745" : "#dc3545";
    this.elements.status.style.display = "inline";

    // 3秒後に非表示
    setTimeout(() => {
      this.elements.status.style.display = "none";
    }, 3000);
  }
}

// DOMContentLoadedで初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.windowInitSettings = new WindowInitSettings();
  });
} else {
  // すでに読み込み完了している場合
  window.windowInitSettings = new WindowInitSettings();
}

log.info("✅ ウィンドウ初期化タイムアウト設定UIを初期化しました");
