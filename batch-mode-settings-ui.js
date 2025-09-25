/**
 * バッチ処理モード設定UI管理
 * Chrome Storageを使用して設定を保存・読み込み
 */

// ログ設定
const log = {
  info: (...args) => console.log("[BatchModeSettings]", ...args),
  error: (...args) => console.error("[BatchModeSettings]", ...args),
  debug: (...args) => console.debug("[BatchModeSettings]", ...args),
};

/**
 * バッチ処理モード設定管理クラス
 */
class BatchModeSettings {
  constructor() {
    // デフォルト設定
    this.defaultSettings = {
      INDEPENDENT_WINDOW_MODE: false,
      WAIT_FOR_BATCH_COMPLETION: true,
      SPREADSHEET_WAIT_TIME: 10000,
      WINDOW_CLOSE_WAIT_TIME: 1000,
    };

    // プリセット設定
    this.presets = {
      safe: {
        name: "安全モード",
        INDEPENDENT_WINDOW_MODE: false,
        WAIT_FOR_BATCH_COMPLETION: true,
        SPREADSHEET_WAIT_TIME: 10000,
        WINDOW_CLOSE_WAIT_TIME: 1000,
      },
      fast: {
        name: "高速モード",
        INDEPENDENT_WINDOW_MODE: true,
        WAIT_FOR_BATCH_COMPLETION: false,
        SPREADSHEET_WAIT_TIME: 0,
        WINDOW_CLOSE_WAIT_TIME: 0,
      },
      balanced: {
        name: "バランスモード",
        INDEPENDENT_WINDOW_MODE: true,
        WAIT_FOR_BATCH_COMPLETION: true,
        SPREADSHEET_WAIT_TIME: 2000,
        WINDOW_CLOSE_WAIT_TIME: 500,
      },
    };

    this.initializeUI();
  }

  /**
   * UI要素の初期化とイベントリスナーの設定
   */
  initializeUI() {
    // DOM要素の取得
    this.elements = {
      // チェックボックス
      independentMode: document.getElementById("independentWindowMode"),
      waitForBatch: document.getElementById("waitForBatchCompletion"),

      // スライダー
      spreadsheetWait: document.getElementById("spreadsheetWaitTime"),
      windowCloseWait: document.getElementById("windowCloseWaitTime"),

      // 表示値
      spreadsheetWaitValue: document.getElementById("spreadsheetWaitValue"),
      windowCloseWaitValue: document.getElementById("windowCloseWaitValue"),

      // ボタン
      saveBtn: document.getElementById("saveBatchModeBtn"),
      safePresetBtn: document.getElementById("batchModeSafePreset"),
      fastPresetBtn: document.getElementById("batchModeFastPreset"),
      balancedPresetBtn: document.getElementById("batchModeBalancedPreset"),

      // ステータス
      status: document.getElementById("batchModeStatus"),
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
    this.elements.spreadsheetWait?.addEventListener("input", (e) => {
      const seconds = (parseInt(e.target.value) / 1000).toFixed(1);
      this.elements.spreadsheetWaitValue.textContent = `${seconds}秒`;
    });

    this.elements.windowCloseWait?.addEventListener("input", (e) => {
      const seconds = (parseInt(e.target.value) / 1000).toFixed(1);
      this.elements.windowCloseWaitValue.textContent = `${seconds}秒`;
    });

    // プリセットボタン
    this.elements.safePresetBtn?.addEventListener("click", () => {
      this.applyPreset("safe");
    });

    this.elements.fastPresetBtn?.addEventListener("click", () => {
      this.applyPreset("fast");
    });

    this.elements.balancedPresetBtn?.addEventListener("click", () => {
      this.applyPreset("balanced");
    });

    // 保存ボタン
    this.elements.saveBtn?.addEventListener("click", () => {
      this.saveSettings();
    });

    // チェックボックス変更時の連動処理
    this.elements.independentMode?.addEventListener("change", (e) => {
      // 独立モードOFFの場合、バッチ完了待機を自動的にONにする
      if (!e.target.checked && !this.elements.waitForBatch.checked) {
        this.elements.waitForBatch.checked = true;
      }
    });
  }

  /**
   * プリセット設定を適用
   */
  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      log.error(`プリセット ${presetName} が見つかりません`);
      return;
    }

    log.info(`プリセット適用: ${preset.name}`);

    // UI要素に値を設定
    this.elements.independentMode.checked = preset.INDEPENDENT_WINDOW_MODE;
    this.elements.waitForBatch.checked = preset.WAIT_FOR_BATCH_COMPLETION;
    this.elements.spreadsheetWait.value = preset.SPREADSHEET_WAIT_TIME;
    this.elements.windowCloseWait.value = preset.WINDOW_CLOSE_WAIT_TIME;

    // 表示値を更新
    this.updateDisplayValues();

    // プリセットボタンのスタイル更新
    this.updatePresetButtonStyles(presetName);
  }

  /**
   * プリセットボタンのスタイル更新
   */
  updatePresetButtonStyles(activePreset) {
    // すべてのボタンをリセット
    const buttons = {
      safe: this.elements.safePresetBtn,
      fast: this.elements.fastPresetBtn,
      balanced: this.elements.balancedPresetBtn,
    };

    Object.entries(buttons).forEach(([name, button]) => {
      if (button) {
        if (name === activePreset) {
          button.classList.remove("btn-secondary");
          button.classList.add("btn-primary");
        } else {
          button.classList.remove("btn-primary");
          button.classList.add("btn-secondary");
        }
      }
    });
  }

  /**
   * 表示値の更新
   */
  updateDisplayValues() {
    const spreadsheetSeconds = (
      parseInt(this.elements.spreadsheetWait.value) / 1000
    ).toFixed(1);
    const windowCloseSeconds = (
      parseInt(this.elements.windowCloseWait.value) / 1000
    ).toFixed(1);

    this.elements.spreadsheetWaitValue.textContent = `${spreadsheetSeconds}秒`;
    this.elements.windowCloseWaitValue.textContent = `${windowCloseSeconds}秒`;
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
        chrome.storage.local.get("batchProcessingConfig", resolve);
      });

      const settings = result.batchProcessingConfig || this.defaultSettings;

      // UI要素に値を設定
      this.elements.independentMode.checked = settings.INDEPENDENT_WINDOW_MODE;
      this.elements.waitForBatch.checked = settings.WAIT_FOR_BATCH_COMPLETION;
      this.elements.spreadsheetWait.value = settings.SPREADSHEET_WAIT_TIME;
      this.elements.windowCloseWait.value = settings.WINDOW_CLOSE_WAIT_TIME;

      // 表示値を更新
      this.updateDisplayValues();

      // 現在の設定に最も近いプリセットを判定
      this.detectCurrentPreset(settings);

      log.info("設定を読み込みました:", settings);
    } catch (error) {
      log.error("設定の読み込みに失敗しました:", error);
    }
  }

  /**
   * 現在の設定に最も近いプリセットを判定
   */
  detectCurrentPreset(settings) {
    for (const [name, preset] of Object.entries(this.presets)) {
      if (
        settings.INDEPENDENT_WINDOW_MODE === preset.INDEPENDENT_WINDOW_MODE &&
        settings.WAIT_FOR_BATCH_COMPLETION ===
          preset.WAIT_FOR_BATCH_COMPLETION &&
        settings.SPREADSHEET_WAIT_TIME === preset.SPREADSHEET_WAIT_TIME &&
        settings.WINDOW_CLOSE_WAIT_TIME === preset.WINDOW_CLOSE_WAIT_TIME
      ) {
        this.updatePresetButtonStyles(name);
        break;
      }
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
      INDEPENDENT_WINDOW_MODE: this.elements.independentMode.checked,
      WAIT_FOR_BATCH_COMPLETION: this.elements.waitForBatch.checked,
      SPREADSHEET_WAIT_TIME: parseInt(this.elements.spreadsheetWait.value),
      WINDOW_CLOSE_WAIT_TIME: parseInt(this.elements.windowCloseWait.value),
    };

    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ batchProcessingConfig: settings }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      log.info("設定を保存しました:", settings);
      this.showStatus("✅ 保存しました", true);

      // 現在の設定に最も近いプリセットを判定
      this.detectCurrentPreset(settings);
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
    window.batchModeSettings = new BatchModeSettings();
  });
} else {
  // すでに読み込み完了している場合
  window.batchModeSettings = new BatchModeSettings();
}

log.info("✅ バッチ処理モード設定UIを初期化しました");
