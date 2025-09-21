// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    }
  });
}

// ログユーティリティ
const log = {
  error: (...args) =>
    CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR && console.error(...args),
  warn: (...args) =>
    CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN && console.warn(...args),
  info: (...args) =>
    CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO && console.log(...args),
  debug: (...args) =>
    CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG && console.log(...args),
};

// 🔥 STEP 0: バージョン確認
log.debug("🔥 [STEP 0] step0-ui-controller.js バージョン1です");

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
      log.warn(`[DEBUG] ${scriptName}の依存関係不足:`, missingDeps);
    }
    return missingDeps.length === 0;
  },
};

// エラーハンドラーを設定
window.addEventListener("error", function (event) {
  log.error(`[ERROR] ${event.filename}:${event.lineno} - ${event.message}`);
});

window.addEventListener("unhandledrejection", function (event) {
  log.error(`[UNHANDLED REJECTION] ${event.reason}`);
});

// ページ読み込み完了を確認
window.addEventListener("load", function () {
  log.debug("📊 ページ読み込み完了");
});

// ========================================
// Section 2: ウィンドウサービス機能 (旧 ui-window-loader.js)
// ========================================

log.debug("🔧 [step0-ui-controller] WindowService読み込み開始...");

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
        log.debug(
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

        log.debug(
          "[step0-ui-controller.js→Step0-1] プライマリディスプレイ位置:",
          position,
        );

        const window = await chrome.windows.create(windowOptions);

        // 作成後の位置確認
        const actualWindow = await chrome.windows.get(window.id);
        log.debug(
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
      log.error(
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
      log.error(
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
      log.error(
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
      log.debug(
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

      // DEBUG: ウィンドウ座標の詳細表示

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

      log.debug(
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

      // createWindowWithPosition戻り値

      // 🆕 WindowController.openedWindowsにウィンドウ情報を登録
      if (
        returnData?.id &&
        options.aiType &&
        window.windowController?.openedWindows
      ) {
        // aiTypeを正規化（step4-tasklist.jsとの一貫性確保）
        const normalizedAiType =
          options.aiType?.toLowerCase()?.trim() || "claude";

        const windowData = {
          windowId: returnData.id,
          tabId: returnData.tabs?.[0]?.id,
          url: url,
          position: position,
          aiType: normalizedAiType, // 正規化済みaiTypeを使用
        };

        log.debug(
          `[step0-ui-controller.js→Step0-1] ウィンドウ作成完了（step4で管理）`,
          {
            originalAiType: options.aiType,
            normalizedAiType: normalizedAiType,
            windowData: windowData,
            note: "ウィンドウ情報はstep4-tasklist.jsで一元管理されます",
          },
        );

        // 重複管理を削除: step4-tasklist.jsで一元管理するため、ここでの保存は不要
        // window.windowController.openedWindows.set(normalizedAiType, windowData);

        // 🆕 Content Script を AI タブに注入
        if (returnData.tabs?.[0]?.id) {
          const tabId = returnData.tabs[0].id;
          let scriptFile = null;

          // AI種別に応じたスクリプトファイルを選択
          if (url.includes("claude.ai")) {
            scriptFile = "4-2-claude-automation.js";
          } else if (
            url.includes("chatgpt.com") ||
            url.includes("chat.openai.com")
          ) {
            scriptFile = "4-1-chatgpt-automation.js";
          } else if (url.includes("gemini.google.com")) {
            scriptFile = "4-3-gemini-automation.js";
          } else if (
            url.includes("genspark.com") ||
            url.includes("genspark.ai")
          ) {
            scriptFile = "4-5-genspark-automation.js";
          }

          if (scriptFile) {
            log.debug(
              `[step0-ui-controller.js→Step0-1] 📜 Content Script注入開始 (tabId: ${tabId}, script: ${scriptFile})`,
            );

            try {
              // chrome.tabs.executeScript を使用してスクリプトを注入
              await new Promise((resolve, reject) => {
                chrome.tabs.executeScript(
                  tabId,
                  {
                    file: scriptFile,
                    runAt: "document_end",
                  },
                  (result) => {
                    if (chrome.runtime.lastError) {
                      log.error(
                        `[step0-ui-controller.js→Step0-1] ❌ Script注入エラー:`,
                        chrome.runtime.lastError,
                      );
                      reject(chrome.runtime.lastError);
                    } else {
                      log.debug(
                        `[step0-ui-controller.js→Step0-1] ✅ Script注入成功 (tabId: ${tabId}, script: ${scriptFile})`,
                      );
                      resolve(result);
                    }
                  },
                );
              });
            } catch (error) {
              log.error(
                `[step0-ui-controller.js→Step0-1] ⚠️ Script注入失敗:`,
                error,
              );
            }
          }
        }
      } else {
        // DEBUG: WindowController登録スキップ
      }

      return returnData;
    } catch (error) {
      log.error(
        "[step0-ui-controller.js→Step0-1] createWindowWithPosition エラー:",
        error,
      );
      throw error;
    }
  },
};

log.debug("✅ [step0-ui-controller] WindowService設定完了");

// ========================================
// WindowController の初期化はstep4-tasklist.jsで行う
// ========================================
// step4-tasklist.jsでWindowControllerクラスが定義されるまで待機
log.debug("⏳ [step0-ui-controller] WindowController初期化をstep4に委譲");

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

    log.debug("📺 Display detected:", {
      total: displays.length,
      primaryId: primaryDisplay.id,
    });

    return primaryDisplay;
  } catch (error) {
    log.error(
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
    log.debug(
      "[step0-ui-controller.js→Step0-3] ウィンドウをプライマリディスプレイに移動開始...",
    );

    // ウィンドウIDが指定されていない場合は現在のウィンドウを取得
    const targetWindow = windowId
      ? await chrome.windows.get(windowId)
      : await chrome.windows.getCurrent();

    log.debug("[step0-ui-controller.js→Step0-3] 移動対象ウィンドウ:", {
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

    log.debug("[step0-ui-controller.js→Step0-3] 新しい位置:", newPosition);

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

    log.debug(
      "[step0-ui-controller.js→Step0-3] ✅ ウィンドウをプライマリディスプレイに移動完了",
    );
    return true;
  } catch (error) {
    log.error("[step0-ui-controller.js→Step0-3] ウィンドウ移動エラー:", error);
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
    log.error(
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
    log.error("保存されたURL読み込みエラー:", error);
    savedUrls = {};
  }
}

// URLをローカルストレージに保存
function savUrlsToStorage() {
  try {
    localStorage.setItem("autoai_saved_urls", JSON.stringify(savedUrls));
  } catch (error) {
    log.error("URL保存エラー:", error);
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

// URL編集ダイアログを表示
function showEditUrlDialog(oldTitle, oldUrl, targetInput) {
  // 編集用のダイアログを作成
  const editDialog = document.createElement("div");
  editDialog.id = "editUrlDialog";
  editDialog.style.cssText = `
    display: block;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1), 0 0 0 9999px rgba(0,0,0,0.5);
    z-index: 10000;
    min-width: 400px;
  `;

  editDialog.innerHTML = `
    <h3 style="margin-top: 0;">URLを編集</h3>
    <label style="display: block; margin-bottom: 5px; font-size: 14px;">タイトル:</label>
    <input type="text" id="editUrlTitle" value="${oldTitle}" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px;">
    <label style="display: block; margin-bottom: 5px; font-size: 14px;">URL:</label>
    <input type="text" id="editUrlValue" value="${oldUrl}" style="width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px;">
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button id="confirmEditUrlBtn" class="btn btn-primary" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
      <button id="cancelEditUrlBtn" class="btn btn-secondary" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">キャンセル</button>
    </div>
  `;

  document.body.appendChild(editDialog);

  const editTitleInput = document.getElementById("editUrlTitle");
  const editUrlInput = document.getElementById("editUrlValue");
  const confirmEditBtn = document.getElementById("confirmEditUrlBtn");
  const cancelEditBtn = document.getElementById("cancelEditUrlBtn");

  editTitleInput.focus();
  editTitleInput.select();

  // 保存ボタン
  confirmEditBtn.onclick = () => {
    const newTitle = editTitleInput.value.trim();
    const newUrl = editUrlInput.value.trim();

    if (!newTitle) {
      showFeedback("タイトルを入力してください", "error");
      return;
    }

    if (!newUrl) {
      showFeedback("URLを入力してください", "error");
      return;
    }

    // 古いエントリを削除
    delete savedUrls[oldTitle];

    // 新しいエントリを追加
    savedUrls[newTitle] = newUrl;
    savUrlsToStorage();

    showFeedback(`"${newTitle}" として更新しました`, "success");
    document.body.removeChild(editDialog);
    showOpenUrlDialog(targetInput); // リストを再表示
  };

  // キャンセルボタン
  cancelEditBtn.onclick = () => {
    document.body.removeChild(editDialog);
  };

  // Escキーでキャンセル
  editDialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.body.removeChild(editDialog);
    }
  });
}

// 保存済みURL選択ダイアログを表示
function showOpenUrlDialog(targetInput) {
  loadSavedUrls();

  // 保存済みURLリストを表示
  savedUrlsList.innerHTML = "";

  if (Object.keys(savedUrls).length === 0) {
    savedUrlsList.innerHTML = "<p>保存済みURLがありません</p>";
  } else {
    // 選択されたURLを保持する変数
    let selectedUrl = null;
    let selectedTitle = null;

    Object.entries(savedUrls).forEach(([title, url]) => {
      const item = document.createElement("div");
      item.style.cssText =
        "padding: 8px; border: 1px solid #ddd; margin-bottom: 5px; border-radius: 4px; display: flex; align-items: center; gap: 10px;";

      // ラジオボタン
      const radioBtn = document.createElement("input");
      radioBtn.type = "radio";
      radioBtn.name = "savedUrlSelection";
      radioBtn.value = url;
      radioBtn.style.cssText = "margin-right: 5px;";

      // メインコンテンツエリア
      const contentArea = document.createElement("div");
      contentArea.style.cssText = "flex: 1; cursor: pointer;";
      contentArea.innerHTML = `
        <strong>${title}</strong><br>
        <small style="color: #666;">${url}</small>
      `;

      // コンテンツクリックでラジオボタンを選択
      contentArea.addEventListener("click", () => {
        radioBtn.checked = true;
        selectedUrl = url;
        selectedTitle = title;
        // 開くボタンを有効化
        confirmOpenUrlBtn.disabled = false;
      });

      // ラジオボタンの変更イベント
      radioBtn.addEventListener("change", () => {
        if (radioBtn.checked) {
          selectedUrl = url;
          selectedTitle = title;
          confirmOpenUrlBtn.disabled = false;
        }
      });

      // ボタンコンテナ
      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = "display: flex; gap: 5px;";

      // 編集ボタン
      const editBtn = document.createElement("button");
      editBtn.style.cssText =
        "padding: 4px 8px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openUrlDialog.style.display = "none";
        showEditUrlDialog(title, url, targetInput);
      });

      // 削除ボタン
      const deleteBtn = document.createElement("button");
      deleteBtn.style.cssText =
        "padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
      deleteBtn.textContent = "削除";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`"${title}" を削除してもよろしいですか？`)) {
          delete savedUrls[title];
          savUrlsToStorage();
          showOpenUrlDialog(targetInput); // リストを再表示
          showFeedback(`"${title}" を削除しました`, "success");
        }
      });

      buttonContainer.appendChild(editBtn);
      buttonContainer.appendChild(deleteBtn);

      item.appendChild(radioBtn);
      item.appendChild(contentArea);
      item.appendChild(buttonContainer);
      savedUrlsList.appendChild(item);
    });

    // 開くボタンのイベントを設定
    confirmOpenUrlBtn.onclick = () => {
      if (selectedUrl) {
        targetInput.value = selectedUrl;
        openUrlDialog.style.display = "none";
        showFeedback(`"${selectedTitle}" を読み込みました`, "success");
      }
    };

    // 最初は開くボタンを無効化
    confirmOpenUrlBtn.disabled = true;
  }

  openUrlDialog.style.display = "block";

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
    log.debug("🎯 [STEP-ONLY] 実行開始");

    // ボタンにアニメーションを追加
    stepOnlyBtn.classList.add("processing");
    const originalText = stepOnlyBtn.textContent;
    stepOnlyBtn.textContent = "処理中...";
    stepOnlyBtn.disabled = true;

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
      stepOnlyBtn.classList.remove("processing");
      stepOnlyBtn.textContent = originalText;
      stepOnlyBtn.disabled = false;
      return;
    }

    showFeedback("STEP処理を開始します...", "info");

    try {
      // 各URLに対してStep処理を実行
      for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
        const url = urls[urlIndex];
        log.debug(
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
            log.debug(`🔄 ${step.name}実行中...`);

            // Step1にはURLを渡す、他のStepは引数なし
            if (step.needsUrl) {
              await step.func(url);
            } else {
              await step.func();
            }

            log.debug(`✅ ${step.name}完了`);
          } else {
            // デバッグ: Step4が見つからない理由を詳細に調査
            log.debug("🔍 [DEBUG] Step関数チェック詳細:", {
              stepName: step.name,
              functionExists: !!step.func,
              functionType: typeof step.func,
              allStepFunctions: {
                step1: typeof window.executeStep1,
                step2: typeof window.executeStep2,
                step3: typeof window.executeStep3AllGroups,
                step4: typeof window.executeStep4,
                step5: typeof window.executeStep5,
                step6: typeof window.executeStep6,
              },
              windowKeys: Object.keys(window)
                .filter(
                  (key) => key.includes("Step") || key.includes("execute"),
                )
                .slice(0, 10),
              // Step4特別チェック
              step4Details: {
                windowExecuteStep4: typeof window.executeStep4,
                windowExecuteStep4Name: window.executeStep4?.name,
                step4TasklistLoaded: !!window.Step3TaskList,
                scriptLoadTracker:
                  window.scriptLoadTracker?.getLoadedScripts?.() || "未定義",
                step4FileError: window.step4FileError || "なし",
              },
            });
            log.warn(`⚠️ ${step.name}関数が見つかりません`);
          }
        }

        log.debug(`✅ URL ${urlIndex + 1}/${urls.length} 処理完了`);
      }

      showFeedback("全てのSTEP処理が完了しました", "success");
    } catch (error) {
      log.error("STEP処理エラー:", error);
      showFeedback(`STEP処理エラー: ${error.message}`, "error");
    } finally {
      // アニメーションを削除してボタンを元に戻す
      stepOnlyBtn.classList.remove("processing");
      stepOnlyBtn.textContent = originalText;
      stepOnlyBtn.disabled = false;
    }
  });
}

// ========================================
// Section 7: 初期化処理
// ========================================

// ページ読み込み時の初期化
document.addEventListener("DOMContentLoaded", () => {
  log.debug("📋 [step0-ui-controller] 初期化開始");

  // 保存されたURLを読み込み
  loadSavedUrls();

  // 最初の行にイベントリスナーを追加
  const firstRow = urlInputsContainer.querySelector(".url-input-row");
  if (firstRow) {
    attachRowEventListeners(firstRow);
  }

  log.debug("✅ [step0-ui-controller] 初期化完了");
});

// スクリプト読み込み完了をトラッキング
window.scriptLoadTracker.addScript("step0-ui-controller.js");

log.debug("🎉 [step0-ui-controller] 全機能読み込み完了");
