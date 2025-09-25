/**
 * 回答待機時間設定UI管理
 * Chrome Storageを使用して設定を保存・読み込み
 */

// ログ設定
const log = {
  info: (...args) => console.log("[ResponseWaitSettings]", ...args),
  error: (...args) => console.error("[ResponseWaitSettings]", ...args),
  debug: (...args) => console.debug("[ResponseWaitSettings]", ...args),
};

/**
 * 回答待機時間設定管理クラス
 */
class ResponseWaitSettings {
  constructor() {
    // デフォルト設定
    this.defaultSettings = {
      MAX_RESPONSE_WAIT_TIME: 600000, // 通常モード: 10分
      MAX_RESPONSE_WAIT_TIME_DEEP: 2400000, // DeepResearch: 40分
      MAX_RESPONSE_WAIT_TIME_AGENT: 2400000, // エージェント: 40分
      STOP_CHECK_INTERVAL: 10000, // 停止ボタン消滅継続時間: 10秒
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
      normalWaitTime: document.getElementById("normalWaitTime"),
      deepWaitTime: document.getElementById("deepWaitTime"),
      agentWaitTime: document.getElementById("agentWaitTime"),
      stopCheckInterval: document.getElementById("stopCheckInterval"),

      // 表示値
      normalWaitValue: document.getElementById("normalWaitValue"),
      deepWaitValue: document.getElementById("deepWaitValue"),
      agentWaitValue: document.getElementById("agentWaitValue"),
      stopCheckValue: document.getElementById("stopCheckValue"),

      // ボタン
      saveBtn: document.getElementById("saveResponseWaitBtn"),

      // ステータス
      status: document.getElementById("responseWaitStatus"),
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
    // 通常モードのスライダー
    this.elements.normalWaitTime?.addEventListener("input", (e) => {
      const minutes = Math.round(parseInt(e.target.value) / 60000);
      this.elements.normalWaitValue.textContent = `${minutes}分`;
    });

    // DeepResearchモードのスライダー
    this.elements.deepWaitTime?.addEventListener("input", (e) => {
      const minutes = Math.round(parseInt(e.target.value) / 60000);
      this.elements.deepWaitValue.textContent = `${minutes}分`;
    });

    // エージェントモードのスライダー
    this.elements.agentWaitTime?.addEventListener("input", (e) => {
      const minutes = Math.round(parseInt(e.target.value) / 60000);
      this.elements.agentWaitValue.textContent = `${minutes}分`;
    });

    // Stop確認間隔のスライダー
    this.elements.stopCheckInterval?.addEventListener("input", (e) => {
      const seconds = Math.round(parseInt(e.target.value) / 1000);
      this.elements.stopCheckValue.textContent = `${seconds}秒`;
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
    const normalMinutes = Math.round(
      parseInt(this.elements.normalWaitTime.value) / 60000,
    );
    const deepMinutes = Math.round(
      parseInt(this.elements.deepWaitTime.value) / 60000,
    );
    const agentMinutes = Math.round(
      parseInt(this.elements.agentWaitTime.value) / 60000,
    );
    const stopSeconds = Math.round(
      parseInt(this.elements.stopCheckInterval.value) / 1000,
    );

    this.elements.normalWaitValue.textContent = `${normalMinutes}分`;
    this.elements.deepWaitValue.textContent = `${deepMinutes}分`;
    this.elements.agentWaitValue.textContent = `${agentMinutes}分`;
    this.elements.stopCheckValue.textContent = `${stopSeconds}秒`;
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
        chrome.storage.local.get("responseWaitConfig", resolve);
      });

      const settings = result.responseWaitConfig || this.defaultSettings;

      // UI要素に値を設定
      this.elements.normalWaitTime.value = settings.MAX_RESPONSE_WAIT_TIME;
      this.elements.deepWaitTime.value = settings.MAX_RESPONSE_WAIT_TIME_DEEP;
      this.elements.agentWaitTime.value = settings.MAX_RESPONSE_WAIT_TIME_AGENT;
      this.elements.stopCheckInterval.value = settings.STOP_CHECK_INTERVAL;

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
      MAX_RESPONSE_WAIT_TIME: parseInt(this.elements.normalWaitTime.value),
      MAX_RESPONSE_WAIT_TIME_DEEP: parseInt(this.elements.deepWaitTime.value),
      MAX_RESPONSE_WAIT_TIME_AGENT: parseInt(this.elements.agentWaitTime.value),
      STOP_CHECK_INTERVAL: parseInt(this.elements.stopCheckInterval.value),
    };

    try {
      // 回答待機時間設定を保存
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ responseWaitConfig: settings }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // バッチ処理設定も更新（統合のため）
      const batchResult = await new Promise((resolve) => {
        chrome.storage.local.get("batchProcessingConfig", resolve);
      });

      const batchConfig = batchResult.batchProcessingConfig || {};
      Object.assign(batchConfig, settings);

      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ batchProcessingConfig: batchConfig }, () => {
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
    window.responseWaitSettings = new ResponseWaitSettings();
  });
} else {
  // すでに読み込み完了している場合
  window.responseWaitSettings = new ResponseWaitSettings();
}

log.info("✅ 回答待機時間設定UIを初期化しました");
