/**
 * @fileoverview step0-ui-controller.js - AutoAI UI Controller
 *
 * UIの保存機能、ボタンイベント、デバッグ機能を統合したコントローラー
 *
 * 統合内容:
 * - ui-controller.js (メインUI制御)
 * - ui-debug-loader.js (デバッグ機能)
 * - ui-window-loader.js (ウィンドウサービス)
 */

// ========================================
// Section 1: デバッグ機能 (旧 ui-debug-loader.js)
// ========================================

// スクリプト読み込み順序のトラッキング
window.scriptLoadTracker = {
  loadOrder: [],
  timestamps: {},
  dependencies: {
    "step5-loop.js": ["step3-tasklist.js"],
    "step0-ui-controller.js": [
      "step1-setup.js",
      "step2-taskgroup.js",
      "step3-loop.js",
      "step4-tasklist.js",
      "step5-execute.js",
      "step6-nextgroup.js",
    ],
  },
  addScript: function (scriptName) {
    this.loadOrder.push(scriptName);
    this.timestamps[scriptName] = new Date().toISOString();
  },
  checkDependencies: function (scriptName) {
    const deps = this.dependencies[scriptName] || [];
    const missingDeps = deps.filter((dep) => !this.loadOrder.includes(dep));
    if (missingDeps.length > 0) {
      console.warn(`[DEBUG] ${scriptName}の依存関係不足:`, missingDeps);
    }
    return missingDeps.length === 0;
  },
};

// エラーハンドラーを設定
window.addEventListener("error", function (event) {
  console.error(`[ERROR] ${event.filename}:${event.lineno} - ${event.message}`);
});

window.addEventListener("unhandledrejection", function (event) {
  console.error(`[UNHANDLED REJECTION] ${event.reason}`);
});

// ページ読み込み完了を確認
window.addEventListener("load", function () {
  console.log("📊 ページ読み込み完了");
});

// ========================================
// Section 2: ウィンドウサービス機能 (旧 ui-window-loader.js)
// ========================================

console.log("🔧 [step0-ui-controller] WindowService読み込み開始...");

// WindowServiceの簡易実装（外部依存を避けるため）
window.WindowService = {
  /**
   * プライマリディスプレイに強制配置してウィンドウを作成
   * @param {Object} options - ウィンドウオプション
   * @param {boolean} forcePrimary - プライマリディスプレイに強制配置するか
   * @returns {Promise<Object>} 作成されたウィンドウオブジェクト
   */
  async createWindow(options, forcePrimary = false) {
    try {
      if (forcePrimary) {
        console.log(
          "[step0-ui-controller.js→Step0-1] プライマリディスプレイに強制配置でウィンドウ作成...",
        );

        // プライマリディスプレイ情報を取得
        const primaryDisplay = await getPrimaryDisplayInfo();

        // ウィンドウサイズ
        const width = options.width || 800;
        const height = options.height || 600;

        // プライマリディスプレイの中央位置を計算
        const workArea = primaryDisplay.workArea;
        const position = {
          left: workArea.left + Math.floor((workArea.width - width) / 2),
          top: workArea.top + Math.floor((workArea.height - height) / 2),
          width: width,
          height: height,
        };

        // プライマリディスプレイ位置を強制指定
        const windowOptions = {
          ...options,
          left: position.left,
          top: position.top,
          width: position.width,
          height: position.height,
        };

        console.log(
          "[step0-ui-controller.js→Step0-1] プライマリディスプレイ位置:",
          position,
        );

        const window = await chrome.windows.create(windowOptions);

        // 作成後の位置確認
        const actualWindow = await chrome.windows.get(window.id);
        console.log(
          "[step0-ui-controller.js→Step0-1] 作成されたウィンドウ位置:",
          {
            expected: position,
            actual: {
              left: actualWindow.left,
              top: actualWindow.top,
              width: actualWindow.width,
              height: actualWindow.height,
            },
          },
        );

        return window;
      } else {
        return await chrome.windows.create(options);
      }
    } catch (error) {
      console.error(
        "[step0-ui-controller.js→Step0-1] WindowService.createWindow エラー:",
        error,
      );
      throw error;
    }
  },

  async updateWindow(windowId, updateInfo) {
    try {
      return await chrome.windows.update(windowId, updateInfo);
    } catch (error) {
      console.error(
        "[step0-ui-controller.js→Step0-1] WindowService.updateWindow エラー:",
        error,
      );
      throw error;
    }
  },

  async closeWindow(windowId) {
    try {
      return await chrome.windows.remove(windowId);
    } catch (error) {
      console.error(
        "[step0-ui-controller.js→Step0-1] WindowService.closeWindow エラー:",
        error,
      );
      throw error;
    }
  },

  /**
   * 既存ウィンドウをプライマリディスプレイに移動
   * @param {number} windowId - 移動するウィンドウID
   * @param {Object} options - 移動オプション
   * @returns {Promise<boolean>} 移動成功可否
   */
  async moveWindowToPrimaryDisplay(windowId, options = {}) {
    return await moveWindowToPrimaryDisplay(windowId, options);
  },

  /**
   * プライマリディスプレイ情報を取得
   * @returns {Promise<Object>} プライマリディスプレイ情報
   */
  async getPrimaryDisplayInfo() {
    return await getPrimaryDisplayInfo();
  },

  /**
   * 指定された位置にウィンドウを作成（step5との互換性のため）
   * @param {string} url - 開くURL
   * @param {number} position - ウィンドウ位置（0-3）
   * @param {Object} options - 追加オプション
   * @returns {Promise<Object>} 作成されたウィンドウ情報
   */
  async createWindowWithPosition(url, position, options = {}) {
    try {
      console.log(
        `[step0-ui-controller.js→Step0-1] 位置${position}にウィンドウを作成:`,
        url,
      );

      // プライマリディスプレイ情報を取得
      const primaryDisplay = await getPrimaryDisplayInfo();

      // ウィンドウサイズ
      const width = options.width || 800;
      const height = options.height || 600;

      let windowPosition;

      if (
        position === 0 ||
        position === 1 ||
        position === 2 ||
        position === 3
      ) {
        // 4分割レイアウト位置計算
        const halfWidth = Math.floor(primaryDisplay.workArea.width / 2);
        const halfHeight = Math.floor(primaryDisplay.workArea.height / 2);

        switch (position) {
          case 0: // 左上
            windowPosition = {
              left: primaryDisplay.workArea.left,
              top: primaryDisplay.workArea.top,
              width: halfWidth,
              height: halfHeight,
            };
            break;
          case 1: // 右上
            windowPosition = {
              left: primaryDisplay.workArea.left + halfWidth,
              top: primaryDisplay.workArea.top,
              width: halfWidth,
              height: halfHeight,
            };
            break;
          case 2: // 左下
            windowPosition = {
              left: primaryDisplay.workArea.left,
              top: primaryDisplay.workArea.top + halfHeight,
              width: halfWidth,
              height: halfHeight,
            };
            break;
          case 3: // 右下
            windowPosition = {
              left: primaryDisplay.workArea.left + halfWidth,
              top: primaryDisplay.workArea.top + halfHeight,
              width: halfWidth,
              height: halfHeight,
            };
            break;
        }
      } else {
        // 中央配置
        const workArea = primaryDisplay.workArea;
        windowPosition = {
          left: workArea.left + Math.floor((workArea.width - width) / 2),
          top: workArea.top + Math.floor((workArea.height - height) / 2),
          width: width,
          height: height,
        };
      }

      console.log(
        `[step0-ui-controller.js→Step0-1] 🖼️ DEBUG: 位置${position}の座標 (aiType: ${options.aiType || "unknown"}):`,
        windowPosition,
      );

      // ウィンドウ作成（aiTypeを分離してChrome APIに渡す）
      const { aiType, ...chromeWindowOptions } = options;
      const windowOptions = {
        ...chromeWindowOptions,
        url: url,
        left: windowPosition.left,
        top: windowPosition.top,
        width: windowPosition.width,
        height: windowPosition.height,
        type: options.type || "popup",
        focused: true,
      };

      const window = await chrome.windows.create(windowOptions);

      console.log(
        `[step0-ui-controller.js→Step0-1] ✅ 位置${position}にウィンドウ作成完了 (aiType: ${options.aiType || "unknown"}, ID: ${window.id}, TabID: ${window.tabs?.[0]?.id})`,
      );

      const returnData = {
        id: window.id,
        windowId: window.id,
        tabs: window.tabs,
        position: position,
        aiType: aiType || "unknown",
        url: url,
      };

      console.log(
        `[step0-ui-controller.js→Step0-1] 🖼️ DEBUG: createWindowWithPosition戻り値`,
        {
          position: position,
          aiType: options.aiType || "unknown",
          returnDataKeys: Object.keys(returnData),
          hasId: !!returnData.id,
          hasWindowId: !!returnData.windowId,
          hasTabs: !!returnData.tabs,
          tabsLength: returnData.tabs?.length || 0,
          firstTabId: returnData.tabs?.[0]?.id,
          returnData: returnData,
        },
      );

      return returnData;
    } catch (error) {
      console.error(
        "[step0-ui-controller.js→Step0-1] createWindowWithPosition エラー:",
        error,
      );
      throw error;
    }
  },
};

console.log("✅ [step0-ui-controller] WindowService設定完了");

// ========================================
// Section 3: メインUI制御機能 (旧 ui-controller.js)
// ========================================

// Sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * プライマリディスプレイ情報を取得する共通関数
 * @returns {Promise<Object>} プライマリディスプレイ情報
 */
async function getPrimaryDisplayInfo() {
  try {
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];

    console.log("[step0-ui-controller.js→Step0-2] ディスプレイ情報:", {
      total: displays.length,
      primary: {
        id: primaryDisplay.id,
        isPrimary: primaryDisplay.isPrimary,
        bounds: primaryDisplay.bounds,
        workArea: primaryDisplay.workArea,
      },
    });

    return primaryDisplay;
  } catch (error) {
    console.error(
      "[step0-ui-controller.js→Step0-2] ディスプレイ情報取得エラー:",
      error,
    );
    // フォールバック値
    return {
      workArea: { left: 0, top: 0, width: 1440, height: 900 },
      bounds: { left: 0, top: 0, width: 1440, height: 900 },
      isPrimary: true,
    };
  }
}

/**
 * ウィンドウをプライマリディスプレイに移動させる関数
 * @param {number} windowId - 移動するウィンドウID（省略時は現在のウィンドウ）
 * @param {Object} options - 移動オプション
 * @returns {Promise<boolean>} 移動成功可否
 */
async function moveWindowToPrimaryDisplay(windowId = null, options = {}) {
  try {
    console.log(
      "[step0-ui-controller.js→Step0-3] ウィンドウをプライマリディスプレイに移動開始...",
    );

    // ウィンドウIDが指定されていない場合は現在のウィンドウを取得
    const targetWindow = windowId
      ? await chrome.windows.get(windowId)
      : await chrome.windows.getCurrent();

    console.log("[step0-ui-controller.js→Step0-3] 移動対象ウィンドウ:", {
      id: targetWindow.id,
      current: {
        left: targetWindow.left,
        top: targetWindow.top,
        width: targetWindow.width,
        height: targetWindow.height,
      },
    });

    // プライマリディスプレイ情報を取得
    const primaryDisplay = await getPrimaryDisplayInfo();

    // ウィンドウサイズを維持するか、新しいサイズを指定
    const windowWidth = options.width || targetWindow.width;
    const windowHeight = options.height || targetWindow.height;

    // プライマリディスプレイの中央位置を計算
    const workArea = primaryDisplay.workArea;
    const newPosition = {
      left: workArea.left + Math.floor((workArea.width - windowWidth) / 2),
      top: workArea.top + Math.floor((workArea.height - windowHeight) / 2),
      width: windowWidth,
      height: windowHeight,
    };

    console.log("[step0-ui-controller.js→Step0-3] 新しい位置:", newPosition);

    // ウィンドウをプライマリディスプレイに移動
    await chrome.windows.update(targetWindow.id, {
      left: newPosition.left,
      top: newPosition.top,
      width: newPosition.width,
      height: newPosition.height,
      focused: true,
      drawAttention: true,
      state: "normal",
    });

    console.log(
      "[step0-ui-controller.js→Step0-3] ✅ ウィンドウをプライマリディスプレイに移動完了",
    );
    return true;
  } catch (error) {
    console.error(
      "[step0-ui-controller.js→Step0-3] ウィンドウ移動エラー:",
      error,
    );
    return false;
  }
}

// ウィンドウを最前面に表示する共通関数（プライマリディスプレイ移動機能付き）
async function bringWindowToFront(moveToPrimary = false) {
  try {
    if (moveToPrimary) {
      // プライマリディスプレイに移動しながら最前面表示
      const success = await moveWindowToPrimaryDisplay();
      if (!success) {
        // 移動に失敗した場合は通常の最前面表示
        const currentWindow = await chrome.windows.getCurrent();
        await chrome.windows.update(currentWindow.id, {
          focused: true,
          drawAttention: true,
          state: "normal",
        });
      }
    } else {
      // 従来の最前面表示のみ
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.windows.update(currentWindow.id, {
        focused: true,
        drawAttention: true,
        state: "normal",
      });
    }
  } catch (error) {
    console.error(
      "[step0-ui-controller.js→Step0-4] ウィンドウ最前面表示エラー:",
      error,
    );
  }
}

// ========================================
// Section 4: UI要素の取得
// ========================================

// URL入力関連の要素
const urlInputsContainer = document.getElementById("url-inputs-container");
const saveUrlDialog = document.getElementById("saveUrlDialog");
const saveUrlTitle = document.getElementById("saveUrlTitle");
const confirmSaveUrlBtn = document.getElementById("confirmSaveUrlBtn");
const cancelSaveUrlBtn = document.getElementById("cancelSaveUrlBtn");
const openUrlDialog = document.getElementById("openUrlDialog");
const savedUrlsList = document.getElementById("savedUrlsList");
const confirmOpenUrlBtn = document.getElementById("confirmOpenUrlBtn");
const cancelOpenUrlBtn = document.getElementById("cancelOpenUrlBtn");

// メインボタン
const stepOnlyBtn = document.getElementById("stepOnlyBtn");

// ========================================
// Section 5: URL保存・管理機能
// ========================================

// 保存されたURLを管理するオブジェクト
let savedUrls = {};

// ローカルストレージから保存されたURLを読み込み
function loadSavedUrls() {
  try {
    const saved = localStorage.getItem("autoai_saved_urls");
    if (saved) {
      savedUrls = JSON.parse(saved);
    }
  } catch (error) {
    console.error("保存されたURL読み込みエラー:", error);
    savedUrls = {};
  }
}

// URLをローカルストレージに保存
function savUrlsToStorage() {
  try {
    localStorage.setItem("autoai_saved_urls", JSON.stringify(savedUrls));
  } catch (error) {
    console.error("URL保存エラー:", error);
  }
}

// フィードバック表示
function showFeedback(message, type = "info") {
  // 簡易的なフィードバック表示
  const feedback = document.createElement("div");
  feedback.textContent = message;
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    border-radius: 4px;
    z-index: 10000;
    color: white;
    background: ${type === "error" ? "#dc3545" : type === "success" ? "#28a745" : "#007bff"};
  `;
  document.body.appendChild(feedback);

  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.parentNode.removeChild(feedback);
    }
  }, 3000);
}

// URL入力欄を追加
function addUrlInput() {
  const index = urlInputsContainer.children.length;
  const newRow = document.createElement("div");
  newRow.className = "url-input-row";
  newRow.setAttribute("data-index", index);
  newRow.style.cssText = "display: flex; gap: 5px; margin-bottom: 10px;";

  newRow.innerHTML = `
    <input type="text" class="spreadsheet-url-input"
           placeholder="URLを入力してください"
           style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
    <button class="btn btn-icon-only remove-url-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #dc3545; color: white; border: none; cursor: pointer;" title="削除">
      <span>−</span>
    </button>
    <button class="btn btn-icon-only save-url-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #007bff; color: white; border: none; cursor: pointer;" title="URLを保存">
      <span>💾</span>
    </button>
    <button class="btn btn-icon-only view-spreadsheet-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #17a2b8; color: white; border: none; cursor: pointer;" title="スプレッドシートを開く">
      <span>🔗</span>
    </button>
    <button class="btn btn-icon-only open-url-btn" style="width: 40px; height: 40px; padding: 0; border-radius: 4px; background: #6c757d; color: white; border: none; cursor: pointer;" title="保存済みURLを開く">
      <span>📂</span>
    </button>
  `;

  urlInputsContainer.appendChild(newRow);
  attachRowEventListeners(newRow);
}

// URL入力欄を削除
function removeUrlInput(row) {
  if (urlInputsContainer.children.length > 1) {
    row.remove();
  } else {
    showFeedback("最低1つの入力欄は必要です", "error");
  }
}

// 行にイベントリスナーを追加
function attachRowEventListeners(row) {
  // +ボタン（最初の行のみ）
  const addBtn = row.querySelector(".add-url-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => addUrlInput());
  }

  // -ボタン（削除）
  const removeBtn = row.querySelector(".remove-url-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => removeUrlInput(row));
  }

  // 保存ボタン
  const saveBtn = row.querySelector(".save-url-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const input = row.querySelector(".spreadsheet-url-input");
      const url = input.value.trim();
      if (!url) {
        showFeedback("URLを入力してください", "error");
        return;
      }
      showSaveUrlDialog(url, input);
    });
  }

  // スプレッドシートを開くボタン
  const viewBtn = row.querySelector(".view-spreadsheet-btn");
  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      const input = row.querySelector(".spreadsheet-url-input");
      const url = input.value.trim();
      if (!url) {
        showFeedback("URLを入力してください", "error");
        return;
      }

      // URLの形式をチェック
      if (!url.includes("docs.google.com/spreadsheets")) {
        showFeedback(
          "有効なGoogleスプレッドシートのURLを入力してください",
          "error",
        );
        return;
      }

      // 新しいタブでスプレッドシートを開く
      window.open(url, "_blank");
      showFeedback("スプレッドシートを開きました", "success");
    });
  }

  // 開くボタン
  const openBtn = row.querySelector(".open-url-btn");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      const input = row.querySelector(".spreadsheet-url-input");
      showOpenUrlDialog(input);
    });
  }
}

// 保存ダイアログを表示
function showSaveUrlDialog(url, targetInput) {
  saveUrlTitle.value = "";
  saveUrlDialog.style.display = "block";
  saveUrlTitle.focus();

  // 保存ボタンのイベント
  confirmSaveUrlBtn.onclick = () => {
    const title = saveUrlTitle.value.trim();
    if (!title) {
      showFeedback("タイトルを入力してください", "error");
      return;
    }

    // URLを保存
    savedUrls[title] = url;
    savUrlsToStorage();
    showFeedback(`"${title}" として保存しました`, "success");
    saveUrlDialog.style.display = "none";
  };

  // キャンセルボタンのイベント
  cancelSaveUrlBtn.onclick = () => {
    saveUrlDialog.style.display = "none";
  };
}

// 保存済みURL選択ダイアログを表示
function showOpenUrlDialog(targetInput) {
  loadSavedUrls();

  // 保存済みURLリストを表示
  savedUrlsList.innerHTML = "";

  if (Object.keys(savedUrls).length === 0) {
    savedUrlsList.innerHTML = "<p>保存済みURLがありません</p>";
  } else {
    Object.entries(savedUrls).forEach(([title, url]) => {
      const item = document.createElement("div");
      item.style.cssText =
        "padding: 8px; border: 1px solid #ddd; margin-bottom: 5px; border-radius: 4px; cursor: pointer;";
      item.innerHTML = `
        <strong>${title}</strong><br>
        <small style="color: #666;">${url}</small>
      `;

      item.addEventListener("click", () => {
        targetInput.value = url;
        openUrlDialog.style.display = "none";
        showFeedback(`"${title}" を読み込みました`, "success");
      });

      savedUrlsList.appendChild(item);
    });
  }

  openUrlDialog.style.display = "block";

  // 開くボタンのイベント
  confirmOpenUrlBtn.onclick = () => {
    openUrlDialog.style.display = "none";
  };

  // キャンセルボタンのイベント
  cancelOpenUrlBtn.onclick = () => {
    openUrlDialog.style.display = "none";
  };
}

// ========================================
// Section 6: メイン処理ボタンのイベントリスナー
// ========================================

// STEP処理のみ実行ボタン
if (stepOnlyBtn) {
  stepOnlyBtn.addEventListener("click", async () => {
    console.log("🎯 [STEP-ONLY] STEP処理のみ実行開始");

    // 複数のURL入力欄から値を取得
    const urlInputs = document.querySelectorAll(".spreadsheet-url-input");
    const urls = [];

    urlInputs.forEach((input) => {
      const url = input.value.trim();
      if (url) {
        urls.push(url);
      }
    });

    if (urls.length === 0) {
      showFeedback("スプレッドシートURLを入力してください", "error");
      return;
    }

    showFeedback("STEP処理を開始します...", "info");

    try {
      // 各URLに対してStep処理を実行
      for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
        const url = urls[urlIndex];
        console.log(
          `📋 [STEP-ONLY] URL ${urlIndex + 1}/${urls.length} 処理開始: ${url}`,
        );

        // Step関数を順番に実行（URLを渡す）
        const steps = [
          { name: "Step1", func: window.executeStep1, needsUrl: true },
          { name: "Step2", func: window.executeStep2, needsUrl: false },
          { name: "Step3", func: window.executeStep3, needsUrl: false },
          { name: "Step4", func: window.executeStep4, needsUrl: false },
          { name: "Step5", func: window.executeStep5, needsUrl: false },
          { name: "Step6", func: window.executeStep6, needsUrl: false },
        ];

        for (const step of steps) {
          if (typeof step.func === "function") {
            console.log(`🔄 ${step.name}実行中...`);

            // Step1にはURLを渡す、他のStepは引数なし
            if (step.needsUrl) {
              await step.func(url);
            } else {
              await step.func();
            }

            console.log(`✅ ${step.name}完了`);
          } else {
            console.warn(`⚠️ ${step.name}関数が見つかりません`);
          }
        }

        console.log(`✅ URL ${urlIndex + 1}/${urls.length} 処理完了`);
      }

      showFeedback("全てのSTEP処理が完了しました", "success");
    } catch (error) {
      console.error("STEP処理エラー:", error);
      showFeedback(`STEP処理エラー: ${error.message}`, "error");
    }
  });
}

// ========================================
// Section 7: 初期化処理
// ========================================

// ページ読み込み時の初期化
document.addEventListener("DOMContentLoaded", () => {
  console.log("📋 [step0-ui-controller] 初期化開始");

  // 保存されたURLを読み込み
  loadSavedUrls();

  // 最初の行にイベントリスナーを追加
  const firstRow = urlInputsContainer.querySelector(".url-input-row");
  if (firstRow) {
    attachRowEventListeners(firstRow);
  }

  console.log("✅ [step0-ui-controller] 初期化完了");
});

// スクリプト読み込み完了をトラッキング
window.scriptLoadTracker.addScript("step0-ui-controller.js");

console.log("🎉 [step0-ui-controller] 全機能読み込み完了");
