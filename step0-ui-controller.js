// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // デフォルト値（デバッグとINFOログを無効化）

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    } else {
    }
  });
}

// ログユーティリティ（CURRENT_LOG_LEVELを動的に参照）
const log = {
  error: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) console.error(...args);
  },
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) console.warn(...args);
  },
  info: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) console.log(...args);
  },
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) console.log(...args);
  },
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
// Section 2: ウィンドウサービス機能を削除 - step4-tasklist.jsで一元管理
// ========================================

// ========================================
// WindowService は step4-tasklist.js で一元管理
// ========================================
log.debug(
  "🔧 [step0-ui-controller] ウィンドウ管理は step4-tasklist.js の StepIntegratedWindowService で行います",
);

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
const stopBtn = document.getElementById("stopBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const deleteAnswersBtn = document.getElementById("deleteAnswersBtn");

// AI検出機能ボタン
const aiDetectionSystemBtn = document.getElementById("aiDetectionSystemBtn");
const aiSelectorMutationSystemBtn = document.getElementById(
  "aiSelectorMutationSystemBtn",
);

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
function showSaveUrlDialog(url) {
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

      // 開くボタン
      const openUrlBtn = document.createElement("button");
      openUrlBtn.style.cssText =
        "padding: 4px 8px; background: #17a2b8; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
      openUrlBtn.textContent = "開く";
      openUrlBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(url, "_blank");
        showFeedback(`"${title}" を開きました`, "success");
      });

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

      buttonContainer.appendChild(openUrlBtn);
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
      // globalStateにURL情報を保存
      if (!window.globalState) {
        window.globalState = {};
      }

      window.globalState.spreadsheetUrls = urls;
      window.globalState.currentUrlIndex = 0;
      window.globalState.totalUrlCount = urls.length;

      log.info(
        `📋 [STEP-ONLY] ${urls.length}個のスプレッドシートを順次処理します`,
      );

      // 最初のURLでStep1を実行
      const firstUrl = urls[0];
      log.debug(`📋 [STEP-ONLY] URL 1/${urls.length} 処理開始: ${firstUrl}`);

      if (typeof window.executeStep1 === "function") {
        await window.executeStep1(firstUrl);
        log.debug("✅ Step1完了");
      } else {
        throw new Error("executeStep1関数が見つかりません");
      }

      // Step2を実行
      if (typeof window.executeStep2 === "function") {
        await window.executeStep2();
        log.debug("✅ Step2完了");
      } else {
        throw new Error("executeStep2関数が見つかりません");
      }

      // Step3を実行（Step3が内部でStep6まで自動実行）
      // Step6が次のスプレッドシートを自動処理
      if (typeof window.executeStep3AllGroups === "function") {
        await window.executeStep3AllGroups();
        log.debug("✅ Step3-6完了");
      } else if (typeof window.executeStep3 === "function") {
        await window.executeStep3();
        log.debug("✅ Step3-6完了");
      } else {
        throw new Error("executeStep3関数が見つかりません");
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
// Section 6.5: ログクリア・回答削除ボタンのイベントリスナー
// ========================================

// ログクリアボタン
if (clearLogBtn) {
  clearLogBtn.addEventListener("click", async () => {
    // 確認ダイアログを表示
    if (
      !confirm(
        "スプレッドシートのログ列(メニューのログ列)とA列の1行目以降のデータをクリアしますか？",
      )
    ) {
      return;
    }

    log.info("🧹 [ログクリア] 処理開始");

    // ボタンを無効化
    clearLogBtn.disabled = true;
    const originalText = clearLogBtn.innerHTML;
    clearLogBtn.innerHTML = '<span class="btn-icon">⏳</span> 処理中...';

    try {
      // background.jsにメッセージを送信
      const response = await chrome.runtime.sendMessage({
        action: "CLEAR_SPREADSHEET_LOG",
        type: "CLEAR_SPREADSHEET_LOG",
      });

      console.log("📝 [ログクリア] レスポンス受信:", response);

      if (response && response.success) {
        log.info("✅ [ログクリア] 処理完了");
        showFeedback(`${response.message}`, "success");
      } else {
        throw new Error(response?.error || "ログクリアに失敗しました");
      }
    } catch (error) {
      log.error("❌ [ログクリア] エラー:", error);
      showFeedback(`エラー: ${error.message}`, "error");
    } finally {
      // ボタンを復元
      clearLogBtn.disabled = false;
      clearLogBtn.innerHTML = originalText;
    }
  });
}

// 回答削除ボタン
if (deleteAnswersBtn) {
  deleteAnswersBtn.addEventListener("click", async () => {
    // 確認ダイアログを表示
    if (!confirm("AI回答を削除しますか？")) {
      return;
    }

    log.info("🗑️ [回答削除] 処理開始");

    // ボタンを無効化
    deleteAnswersBtn.disabled = true;
    const originalText = deleteAnswersBtn.innerHTML;
    deleteAnswersBtn.innerHTML = '<span class="btn-icon">⏳</span> 処理中...';

    try {
      // background.jsにメッセージを送信
      const response = await chrome.runtime.sendMessage({
        action: "DELETE_SPREADSHEET_ANSWERS",
        type: "DELETE_SPREADSHEET_ANSWERS",
      });

      console.log("📝 [回答削除] レスポンス受信:", response);

      if (response && response.success) {
        log.info("✅ [回答削除] 処理完了");
        showFeedback(`${response.message}`, "success");
      } else {
        throw new Error(response?.error || "回答削除に失敗しました");
      }
    } catch (error) {
      log.error("❌ [回答削除] エラー:", error);
      showFeedback(`エラー: ${error.message}`, "error");
    } finally {
      // ボタンを復元
      deleteAnswersBtn.disabled = false;
      deleteAnswersBtn.innerHTML = originalText;
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

  // AI統合表を初期化（削除済みの場合はスキップ）
  if (typeof initializeAITable === "function") {
    initializeAITable();
  }

  // 保存されたAI検出データを読み込み（削除済みの場合はスキップ）
  if (typeof loadSavedAIData === "function") {
    loadSavedAIData();
  }

  // AI統合テスト設定用ドロップダウンを初期化
  initializeAITestConfig();

  // AI統合テストボタンのイベントリスナー
  const aiTestAllBtn = document.getElementById("aiTestAllBtn");
  if (aiTestAllBtn) {
    aiTestAllBtn.addEventListener("click", async () => {
      log.info("🚀 AI統合テスト実行開始");

      // ボタンを無効化
      aiTestAllBtn.disabled = true;
      aiTestAllBtn.classList.add("processing");
      const originalText = aiTestAllBtn.innerHTML;
      aiTestAllBtn.innerHTML = '<span class="btn-icon">⏳</span> 実行中...';

      // 各AIサービスの設定を収集
      const testConfig = {
        chatgpt: {
          prompt:
            document.getElementById("chatgptPrompt")?.value ||
            "こんにちは！今日はいい天気ですね。AIテストです。",
          model: document.getElementById("chatgptModel")?.value || "",
          feature: document.getElementById("chatgptFeature")?.value || "",
        },
        claude: {
          prompt:
            document.getElementById("claudePrompt")?.value ||
            "こんにちは！今日はいい天気ですね。AIテストです。",
          model: document.getElementById("claudeModel")?.value || "",
          feature: document.getElementById("claudeFeature")?.value || "",
        },
        gemini: {
          prompt:
            document.getElementById("geminiPrompt")?.value ||
            "こんにちは！今日はいい天気ですね。AIテストです。",
          model: document.getElementById("geminiModel")?.value || "",
          feature: document.getElementById("geminiFeature")?.value || "",
        },
      };

      // 設定をChrome Storageに保存
      chrome.storage.local.set({
        aiTestConfig: testConfig,
        lastTestTime: new Date().toISOString(),
      });

      log.info("📝 テスト設定:", testConfig);

      try {
        // background.jsにメッセージを送信してウィンドウを作成
        const response = await chrome.runtime.sendMessage({
          type: "RUN_AI_TEST_ALL",
          data: testConfig,
        });

        if (response && response.success) {
          log.info("✅ AI統合テストウィンドウを作成しました");
          showFeedback("AI統合テストを開始しました", "success");
        } else {
          throw new Error(response?.error || "ウィンドウ作成に失敗しました");
        }
      } catch (error) {
        log.error("❌ AI統合テストエラー:", error);
        showFeedback(`エラー: ${error.message}`, "error");
      } finally {
        // ボタンを復元
        setTimeout(() => {
          aiTestAllBtn.disabled = false;
          aiTestAllBtn.classList.remove("processing");
          aiTestAllBtn.innerHTML = originalText;
        }, 2000);
      }
    });
  }

  // AIモデル・機能更新ボタンのイベントリスナー
  const aiDiscoverBtn = document.getElementById("aiDiscoverBtn");
  if (aiDiscoverBtn) {
    aiDiscoverBtn.addEventListener("click", async () => {
      log.info("🔍 AIモデル・機能更新開始");

      // ボタンを無効化
      aiDiscoverBtn.disabled = true;
      aiDiscoverBtn.classList.add("processing");
      const originalText = aiDiscoverBtn.innerHTML;
      aiDiscoverBtn.innerHTML = '<span class="btn-icon">⏳</span> 探索中...';

      try {
        // background.jsにメッセージを送信
        const response = await chrome.runtime.sendMessage({
          action: "DISCOVER_AI_FEATURES_ONLY",
        });

        if (response && response.success) {
          log.info("✅ AIモデル・機能探索完了");
          showFeedback("AIモデル・機能情報を更新しました", "success");

          // ドロップダウンを更新
          updateTestConfigDropdowns();

          // UI表の更新を待機（AI情報がUI表に反映されるまで待つ）
          log.info("⏳ UI表の更新を待機中...");
          await waitForAIDataComplete();

          // スプレッドシートへ自動保存
          await saveAIDataToSpreadsheet();
        } else {
          throw new Error(response?.error || "探索に失敗しました");
        }
      } catch (error) {
        log.error("❌ AIモデル・機能探索エラー:", error);
        showFeedback(`探索エラー: ${error.message}`, "error");
      } finally {
        // ボタンを復元
        setTimeout(() => {
          aiDiscoverBtn.disabled = false;
          aiDiscoverBtn.classList.remove("processing");
          aiDiscoverBtn.innerHTML = originalText;
        }, 2000);
      }
    });
  }

  log.debug("✅ [step0-ui-controller] 初期化完了");
});

// ========================================
// Section 8: AI モデル・機能情報受信・更新処理
// ========================================

// 前回のAI情報を保存（変更検出用）
const lastAIData = {
  chatgpt: { models: [], functions: [] },
  claude: { models: [], functions: [] },
  gemini: { models: [], functions: [] },
};

// 保存されたデータを読み込んで表に表示
function loadSavedAIData() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    // 各AIサービスごとに独立したキーから読み込み
    ["chatgpt", "claude", "gemini"].forEach((aiType) => {
      const storageKey = `ai_detection_data_${aiType}`;

      chrome.storage.local.get(storageKey, (result) => {
        if (result[storageKey]) {
          const savedData = result[storageKey];

          // メモリに復元
          lastAIData[aiType] = {
            models: savedData.models || [],
            functions: savedData.functions || [],
          };

          // UIテーブルを更新
          updateAITable(aiType, {
            models: savedData.models,
            functions: savedData.functions,
          });
        }
      });
    });

    // データ読み込み後にドロップダウンを更新
    setTimeout(() => {
      updateTestConfigDropdowns();
    }, 500);
  }
}

// AI統合テスト設定の初期化
function initializeAITestConfig() {
  log.info("🎮 AI統合テスト設定を初期化中...");

  // loadSavedAIDataの完了を待ってからドロップダウンを更新
  // (loadSavedAIData内で非同期にupdateTestConfigDropdowns()が呼ばれる)

  // Chrome Storageから前回の設定を復元
  chrome.storage.local.get(["aiTestConfig"], (result) => {
    if (result.aiTestConfig) {
      const config = result.aiTestConfig;

      // ChatGPT設定を復元
      if (config.chatgpt) {
        const chatgptPromptEl = document.getElementById("chatgptPrompt");
        const chatgptModelEl = document.getElementById("chatgptModel");
        const chatgptFeatureEl = document.getElementById("chatgptFeature");

        if (chatgptPromptEl)
          chatgptPromptEl.value = config.chatgpt.prompt || "";
        if (chatgptModelEl) chatgptModelEl.value = config.chatgpt.model || "";
        if (chatgptFeatureEl)
          chatgptFeatureEl.value = config.chatgpt.feature || "";
      }

      // Claude設定を復元
      if (config.claude) {
        const claudePromptEl = document.getElementById("claudePrompt");
        const claudeModelEl = document.getElementById("claudeModel");
        const claudeFeatureEl = document.getElementById("claudeFeature");

        if (claudePromptEl) claudePromptEl.value = config.claude.prompt || "";
        if (claudeModelEl) claudeModelEl.value = config.claude.model || "";
        if (claudeFeatureEl)
          claudeFeatureEl.value = config.claude.feature || "";
      }

      // Gemini設定を復元
      if (config.gemini) {
        const geminiPromptEl = document.getElementById("geminiPrompt");
        const geminiModelEl = document.getElementById("geminiModel");
        const geminiFeatureEl = document.getElementById("geminiFeature");

        if (geminiPromptEl) geminiPromptEl.value = config.gemini.prompt || "";
        if (geminiModelEl) geminiModelEl.value = config.gemini.model || "";
        if (geminiFeatureEl)
          geminiFeatureEl.value = config.gemini.feature || "";
      }

      log.info("✅ AI統合テスト設定を復元しました");
    }
  });
}

// lastAIDataからドロップダウンを更新
function updateTestConfigDropdowns() {
  log.debug("📋 ドロップダウンを更新中...");
  log.debug("📋 lastAIData内容:", {
    chatgpt: {
      models: lastAIData.chatgpt?.models?.length || 0,
      functions: lastAIData.chatgpt?.functions?.length || 0,
    },
    claude: {
      models: lastAIData.claude?.models?.length || 0,
      functions: lastAIData.claude?.functions?.length || 0,
      functionsType:
        lastAIData.claude?.functions?.length > 0
          ? typeof lastAIData.claude.functions[0]
          : "none",
    },
    gemini: {
      models: lastAIData.gemini?.models?.length || 0,
      functions: lastAIData.gemini?.functions?.length || 0,
    },
  });

  // ChatGPT - AI統合情報から取得したデータを使用
  if (lastAIData.chatgpt) {
    const chatgptModels = lastAIData.chatgpt.models || [];
    const chatgptFeatures = lastAIData.chatgpt.functions || [];

    // ChatGPT データ取得完了

    updateSelectOptions("chatgptModel", chatgptModels);
    updateSelectOptions("chatgptFeature", chatgptFeatures);
  } else {
    // ChatGPT データなし
  }

  // Claude - AI統合情報から取得したデータを使用
  if (lastAIData.claude) {
    const claudeModels = lastAIData.claude.models || [];
    const claudeFeatures = lastAIData.claude.functions || [];

    // Claude データ取得完了

    updateSelectOptions("claudeModel", claudeModels);
    updateSelectOptions("claudeFeature", claudeFeatures);
  } else {
    // Claude データなし
  }

  // Gemini - AI統合情報から取得したデータを使用
  if (lastAIData.gemini) {
    const geminiModels = lastAIData.gemini.models || [];
    const geminiFeatures = lastAIData.gemini.functions || [];

    // Gemini データ取得完了

    updateSelectOptions("geminiModel", geminiModels);
    updateSelectOptions("geminiFeature", geminiFeatures);
  } else {
    // Gemini データなし
  }
}

// ドロップダウンオプションを更新
function updateSelectOptions(selectId, options) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) {
    // セレクト要素が見つからない
    return;
  }

  // オプション更新中

  // 現在の値を保存
  const currentValue = selectEl.value;

  // 既存のオプションをクリア（最初のオプションは残す）
  while (selectEl.options.length > 1) {
    selectEl.remove(1);
  }

  // 新しいオプションを追加
  if (options && options.length > 0) {
    options.forEach((opt) => {
      const option = document.createElement("option");

      // オプションが文字列かオブジェクトかで処理を分岐
      if (typeof opt === "string") {
        option.value = opt;
        option.textContent = opt;
        // 文字列オプション追加
      } else if (opt && typeof opt === "object") {
        // functionsWithDetailsの場合の処理
        const funcName = opt.name || opt.label || opt.value || opt.toString();
        option.value = funcName;

        // 機能名のみを表示（トグル状態のチェックマークは表示しない）
        option.textContent = funcName;

        // オブジェクトオプション追加
      }

      selectEl.appendChild(option);
    });

    // オプション追加完了
  } else {
    // オプションなし
  }

  // デフォルト選択の処理
  // 1. 前の値が有効な場合は復元
  if (
    currentValue &&
    Array.from(selectEl.options).some((opt) => opt.value === currentValue)
  ) {
    selectEl.value = currentValue;
    // 前の選択を復元
  }
  // 2. モデルの場合は最初のモデルを自動選択
  else if (selectId.includes("Model") && selectEl.options.length > 1) {
    selectEl.value = selectEl.options[1].value; // 最初の実際のオプションを選択
    // デフォルトモデル選択
  }
  // 3. 機能の場合は空のままにする（ユーザーが選択）
  else if (selectId.includes("Feature")) {
    selectEl.value = ""; // 機能は明示的に空を選択
    // 機能未選択状態維持
  }
}

// データが変更されたかチェック
function hasDataChanged(aiType, newData) {
  const lastData = lastAIData[aiType];

  // データが取得できていない場合は更新しない
  if (
    !newData.models &&
    !newData.functions &&
    !newData.modelsWithDetails &&
    !newData.functionsWithDetails
  ) {
    log.debug(`🔍 [UI] ${aiType}: データが取得されていないため更新をスキップ`);
    return false;
  }

  // 詳細な比較ログを追加
  const newModels = newData.models || [];
  const lastModels = lastData.models || [];
  const newFunctions = newData.functionsWithDetails || newData.functions || [];
  const lastFunctions = lastData.functions || [];

  // モデル比較
  if (newModels.length !== lastModels.length) {
    log.debug(
      `🔍 [UI] ${aiType}: モデル数が変更されました (${lastModels.length} → ${newModels.length})`,
    );
    return true;
  }

  for (let i = 0; i < newModels.length; i++) {
    if (newModels[i] !== lastModels[i]) {
      log.debug(
        `🔍 [UI] ${aiType}: モデルが変更されました (${lastModels[i]} → ${newModels[i]})`,
      );
      return true;
    }
  }

  // 機能比較
  if (newFunctions.length !== lastFunctions.length) {
    log.debug(
      `🔍 [UI] ${aiType}: 機能数が変更されました (${lastFunctions.length} → ${newFunctions.length})`,
    );
    return true;
  }

  // 初回検出の場合（lastFunctionsが空の場合）
  if (lastFunctions.length === 0 && newFunctions.length > 0) {
    log.debug(`🔍 [UI] ${aiType}: 初回機能検出 (${newFunctions.length}個)`);
    return true;
  }

  // 機能の詳細比較
  for (let i = 0; i < newFunctions.length; i++) {
    const newFunc = newFunctions[i];
    const lastFunc = lastFunctions[i];

    if (typeof newFunc === "object" && typeof lastFunc === "object") {
      // 詳細オブジェクトの比較
      if (
        newFunc.name !== lastFunc.name ||
        newFunc.isEnabled !== lastFunc.isEnabled ||
        newFunc.isToggled !== lastFunc.isToggled ||
        newFunc.secretStatus !== lastFunc.secretStatus
      ) {
        return true;
      }
    } else {
      // 単純な文字列比較
      if (newFunc !== lastFunc) {
        log.debug(
          `🔍 [UI] ${aiType}: 機能文字列が変更されました (${lastFunc} → ${newFunc})`,
        );
        return true;
      }
    }
  }

  return false;
}

// データを保存（メモリ内とchrome.storageの両方）
function saveAIData(aiType, data) {
  // メモリ内に保存
  lastAIData[aiType] = {
    models: data.models || [],
    functions:
      data.functionsWithDetails || data.functions || data.features || [],
  };

  // chrome.storage.localに永続保存（各AIサービスごとに独立したキー）
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    // 各AIサービスごとに独立したストレージキーを使用
    const storageKey = `ai_detection_data_${aiType}`;

    const saveData = {
      models: data.models || [],
      functions:
        data.functionsWithDetails || data.functions || data.features || [],
      timestamp: new Date().toISOString(),
      source: data.source || "dynamic_detection",
    };

    // 独立して保存（他のAIサービスに影響しない）
    chrome.storage.local.set({ [storageKey]: saveData }, () => {
      log.debug(
        `💾 [UI] ${aiType}のデータを独立キー(${storageKey})に保存しました`,
      );
    });
  }
}

// Chromeメッセージ受信処理
if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.runtime.onMessage
) {
  chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
    if (message.type === "AI_MODEL_FUNCTION_UPDATE") {
      // 変更検出

      if (hasDataChanged(message.aiType, message.data)) {
        log.info(
          `🔄 [UI] ${message.aiType}のデータが変更されました - UI更新実行`,
        );

        updateAITable(message.aiType, message.data);
        saveAIData(message.aiType, message.data);

        // 表更新時にプルダウンは更新しない（選択が消える問題を回避）
        // updateTestConfigDropdowns();

        sendResponse({ success: true, updated: true });
      } else {
        log.debug(
          `📋 [UI] ${message.aiType}のデータは変更なし - UI更新スキップ`,
        );
        sendResponse({ success: true, updated: false });
      }
    }
  });
}

// UI表更新関数
function updateAITable(aiType, data) {
  try {
    log.debug(`🔧 [updateAITable] 開始: ${aiType}`);
    log.debug(`🔧 [updateAITable] 受信データキー:`, Object.keys(data));

    const tbody = document.getElementById("ai-integrated-tbody");
    if (!tbody) {
      log.error("AI統合表のtbodyが見つかりません");
      return;
    }

    log.debug(`🔧 [updateAITable] tbody要素発見: ${aiType}`);

    // 表の行を取得または作成
    let row = tbody.querySelector("tr");
    if (!row) {
      // 新しい行を作成
      row = document.createElement("tr");
      for (let i = 0; i < 6; i++) {
        const cell = document.createElement("td");
        cell.style.cssText =
          "border: 1px solid #dee2e6; padding: 12px; text-align: left; vertical-align: top; font-size: 13px; min-height: 60px; line-height: 1.4;";
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }

    const cells = row.querySelectorAll("td");

    // AI種別に応じて該当セルを更新
    let modelCellIndex, functionCellIndex;
    switch (aiType) {
      case "chatgpt":
        modelCellIndex = 0; // ChatGPTモデル列
        functionCellIndex = 3; // ChatGPT機能列
        break;
      case "claude":
        modelCellIndex = 1; // Claudeモデル列
        functionCellIndex = 4; // Claude機能列
        break;
      case "gemini":
        modelCellIndex = 2; // Geminiモデル列
        functionCellIndex = 5; // Gemini機能列
        break;
      default:
        log.warn("未対応のAI種別:", aiType);
        return;
    }

    // モデル情報を更新
    if (data.models && cells[modelCellIndex]) {
      const modelList = data.models.map((model) => `• ${model}`).join("<br>");
      cells[modelCellIndex].innerHTML =
        modelList || '<span style="color: #999;">未検出</span>';
      log.debug(`✅ ${aiType}モデル情報更新完了:`, data.models);
    }

    // 機能情報を更新（詳細情報付き）
    if (data.functionsWithDetails && cells[functionCellIndex]) {
      log.debug(`🔧 [updateAITable] ${aiType} functionsWithDetails処理開始`);
      log.debug(
        `🔧 [updateAITable] functionsWithDetails配列長: ${data.functionsWithDetails.length}`,
      );

      try {
        const functionList = data.functionsWithDetails
          .map((func, index) => {
            log.debug(
              `🔧 [updateAITable] 機能${index}: 型=${typeof func}`,
              func,
            );

            // オブジェクトが文字列として送信されている場合の対応
            if (typeof func === "string") {
              log.debug(`🔧 [updateAITable] 文字列機能: ${func}`);
              return `${func}`;
            }

            // 正常なオブジェクトの場合の処理
            if (typeof func === "object" && func !== null) {
              const funcName = func.name || func.functionName || "Unknown";
              log.debug(`🔧 [updateAITable] オブジェクト機能: ${funcName}`);

              let status = "";

              // トグル状態を表示
              if (func.isToggleable) {
                status += func.isToggled ? " 🟢" : " 🔴";
                log.debug(`🔧 [updateAITable] トグル状態: ${func.isToggled}`);
              }

              // セレクタ状態を表示
              if (func.secretStatus) {
                status += ` [${func.secretStatus}]`;
              }

              // 有効/無効状態を表示（見やすくするため）
              const enabledIcon = func.isEnabled ? "" : " (無効)";

              const result = `${funcName}${status}${enabledIcon}`;
              log.debug(`🔧 [updateAITable] 生成された表示: ${result}`);
              return result;
            }

            // 予期しない形式の場合は型情報と共に表示
            log.debug(`🔧 [updateAITable] 予期しない形式:`, func);
            return `Unknown (${typeof func})`;
          })
          .filter((item) => item && item.trim() !== "") // 空の項目を除外
          .join("<br>");

        log.debug(`🔧 [updateAITable] 最終的な機能リスト: ${functionList}`);

        cells[functionCellIndex].innerHTML =
          functionList || '<span style="color: #999;">未検出</span>';
        log.debug(`✅ ${aiType}機能情報更新完了:`, data.functionsWithDetails);
      } catch (error) {
        log.error(`❌ ${aiType}機能情報処理エラー:`, error);
        log.debug("エラー発生時のデータ:", data.functionsWithDetails);

        // エラー時はフォールバック処理
        const fallbackList = Array.isArray(data.functionsWithDetails)
          ? data.functionsWithDetails.map(
              (func, index) => `• 機能${index + 1}: ${typeof func}`,
            )
          : [`• エラー: ${typeof data.functionsWithDetails}`];

        cells[functionCellIndex].innerHTML = fallbackList.join("<br>");
      }
    } else if (data.functions && cells[functionCellIndex]) {
      // フォールバック：data.functions配列の処理（オブジェクト対応）
      log.debug(`🔧 [updateAITable] ${aiType} functions処理開始`);
      log.debug(`🔧 [updateAITable] functions配列長: ${data.functions.length}`);

      const functionList = data.functions
        .map((func, index) => {
          log.debug(`🔧 [updateAITable] 機能${index}: 型=${typeof func}`, func);

          // オブジェクトの場合は名前を抽出
          if (typeof func === "object" && func !== null) {
            const funcName = func.name || func.functionName || "Unknown";
            log.debug(`🔧 [updateAITable] オブジェクト機能名: ${funcName}`);

            let status = "";

            // トグル状態を表示
            if (func.isToggleable) {
              status += func.isToggled ? " 🟢" : " 🔴";
            }

            // セレクタ状態を表示
            if (func.secretStatus) {
              status += ` [${func.secretStatus}]`;
            }

            // 有効/無効状態を表示
            const enabledIcon = func.isEnabled ? "" : " (無効)";

            const result = `${funcName}${status}${enabledIcon}`;
            log.debug(`🔧 [updateAITable] 生成された表示: ${result}`);
            return result;
          }

          // 文字列の場合はそのまま使用
          if (typeof func === "string") {
            log.debug(`🔧 [updateAITable] 文字列機能: ${func}`);
            return func;
          }

          // その他の場合
          log.debug(`🔧 [updateAITable] 予期しない形式:`, func);
          return `Unknown (${typeof func})`;
        })
        .filter((item) => item && item.trim() !== "") // 空の項目を除外
        .join("<br>");

      log.debug(`🔧 [updateAITable] 最終的な機能リスト: ${functionList}`);

      cells[functionCellIndex].innerHTML =
        functionList || '<span style="color: #999;">未検出</span>';
      log.debug(`✅ ${aiType}機能情報更新完了:`, data.functions);
    } else if (data.features && cells[functionCellIndex]) {
      // Gemini等でfeaturesとして送信された場合の処理
      log.debug(`🔧 [updateAITable] ${aiType} features処理開始`);
      log.debug(`🔧 [updateAITable] features配列長: ${data.features.length}`);

      const featureList = data.features
        .map((feature) => {
          if (typeof feature === "string") {
            return feature;
          }
          return feature?.name || feature?.featureName || "Unknown";
        })
        .filter((item) => item && item.trim() !== "")
        .join("<br>");

      cells[functionCellIndex].innerHTML =
        featureList || '<span style="color: #999;">未検出</span>';
      log.debug(`✅ ${aiType}機能情報更新完了:`, data.features);
    }

    // 更新時刻・日付を表示（各セルの下部に追加）
    const now = new Date();
    const timestamp = now.toLocaleString("ja-JP");

    // モデルセルに更新時刻を追加
    if (cells[modelCellIndex] && data.models && data.models.length > 0) {
      const currentContent = cells[modelCellIndex].innerHTML;
      if (!currentContent.includes("更新:")) {
        cells[modelCellIndex].innerHTML +=
          `<br><small style="color: #666;">更新: ${timestamp}</small>`;
      } else {
        // 既存の更新時刻を置換
        cells[modelCellIndex].innerHTML = currentContent.replace(
          /更新: .*?<\/small>/,
          `更新: ${timestamp}</small>`,
        );
      }
    }

    // 機能セルに更新時刻を追加
    if (
      cells[functionCellIndex] &&
      (data.functionsWithDetails || data.functions)
    ) {
      const currentContent = cells[functionCellIndex].innerHTML;
      if (!currentContent.includes("更新:")) {
        cells[functionCellIndex].innerHTML +=
          `<br><small style="color: #666;">更新: ${timestamp}</small>`;
      } else {
        // 既存の更新時刻を置換
        cells[functionCellIndex].innerHTML = currentContent.replace(
          /更新: .*?<\/small>/,
          `更新: ${timestamp}</small>`,
        );
      }
    }

    log.info(`🔍 [UI] ${aiType}の情報表示を更新しました`);
  } catch (error) {
    log.error("AI表更新エラー:", error);
  }
}

// 初期化時に表の構造を準備
function initializeAITable() {
  const tbody = document.getElementById("ai-integrated-tbody");
  if (tbody) {
    // 既存の "データを読み込み中..." を削除
    tbody.innerHTML = "";

    // 空の行を作成
    const row = document.createElement("tr");
    const headers = [
      "ChatGPTモデル",
      "Claudeモデル",
      "Geminiモデル",
      "ChatGPT機能",
      "Claude機能",
      "Gemini機能",
    ];

    headers.forEach(() => {
      const cell = document.createElement("td");
      cell.style.cssText =
        "border: 1px solid #dee2e6; padding: 12px; text-align: left; vertical-align: top; font-size: 13px; min-height: 60px; line-height: 1.4;";
      cell.innerHTML = '<span style="color: #999;">検出待機中...</span>';
      row.appendChild(cell);
    });

    tbody.appendChild(row);
    log.debug("✅ AI統合表を初期化しました");
  }
}

// ========================================
// 表コピー機能
// ========================================

// AI情報がすべて揃うまで待機
async function waitForAIDataComplete() {
  const maxWaitTime = 15000; // 最大15秒待機
  const checkInterval = 500; // 500ms毎にチェック
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    // lastAIDataをチェック（3つのAIサービス全てにデータがあるか確認）
    const chatgptHasData =
      lastAIData.chatgpt &&
      (lastAIData.chatgpt.models.length > 0 ||
        lastAIData.chatgpt.functions.length > 0);
    const claudeHasData =
      lastAIData.claude &&
      (lastAIData.claude.models.length > 0 ||
        lastAIData.claude.functions.length > 0);
    const geminiHasData =
      lastAIData.gemini &&
      (lastAIData.gemini.models.length > 0 ||
        lastAIData.gemini.functions.length > 0);

    if (chatgptHasData && claudeHasData && geminiHasData) {
      log.info("✅ 全AIサービスのデータ取得完了");
      log.info(
        `ChatGPT: ${lastAIData.chatgpt.models.length}モデル, ${lastAIData.chatgpt.functions.length}機能`,
      );
      log.info(
        `Claude: ${lastAIData.claude.models.length}モデル, ${lastAIData.claude.functions.length}機能`,
      );
      log.info(
        `Gemini: ${lastAIData.gemini.models.length}モデル, ${lastAIData.gemini.functions.length}機能`,
      );

      // データ取得後、さらに1秒待機してUI反映を確実にする
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  log.warn("⚠️ タイムアウト: 一部のAIデータが取得できませんでした");
}

// AI統合表データをスプレッドシートへ自動保存
async function saveAIDataToSpreadsheet() {
  try {
    log.info("📊 スプレッドシートへ保存開始...");

    const table = document.getElementById("ai-integrated-table");
    if (!table) {
      throw new Error("AI統合表が見つかりません");
    }

    const tbody = table.querySelector("tbody");
    const dataRows = tbody.querySelectorAll("tr");

    if (dataRows.length === 0) {
      throw new Error("表にデータがありません");
    }

    // データ抽出（copyAITableToClipboardと同じロジック）
    const row = dataRows[0];
    const cells = row.querySelectorAll("td");

    if (cells.length !== 6) {
      throw new Error("表の列数が正しくありません");
    }

    const columnData = [];

    cells.forEach((cell) => {
      let cellContent =
        cell.innerHTML || cell.textContent || cell.innerText || "";

      cellContent = cellContent
        .replace(/<small[^>]*>/g, "")
        .replace(/<\/small>/g, "")
        .replace(/<span[^>]*>/g, "")
        .replace(/<\/span>/g, "")
        .replace(/(?:更新|検出日):.*$/m, "")
        .trim();

      if (
        cellContent.includes("検出待機中") ||
        cellContent.includes("未検出") ||
        cellContent.trim() === ""
      ) {
        columnData.push(["-"]);
        return;
      }

      let items = [];

      if (cellContent.includes("<br>")) {
        items = cellContent.split(/<br\s*\/?>/gi);
      } else if (cellContent.includes("\n")) {
        items = cellContent.split(/\n/);
      } else if (cellContent.includes("•")) {
        items = cellContent.split(/•/);
      } else if (
        /[a-zA-Z]/.test(cellContent) &&
        cellContent.split(/\s+/).length > 1
      ) {
        items = cellContent.split(/\s+/);
      } else {
        items = [cellContent];
      }

      items = items
        .map((item) => {
          return item
            .replace(/^[•✅❌]\s*/, "")
            .replace(/\s*🟢|\s*🔴/g, "")
            .replace(/🍌\s*/g, "")
            .replace(/[\u{1F000}-\u{1F9FF}]/gu, "")
            .replace(/[\u{2600}-\u{26FF}]/gu, "")
            .replace(/\([^)]*\)/g, "")
            .replace(/\[[^\]]*\]/g, "")
            .replace(/\s*\(無効\)/g, "")
            .trim();
        })
        .filter(
          (item) =>
            item !== "" && !item.includes("検出日") && !item.includes("更新"),
        );

      if (items.length === 0) {
        columnData.push(["-"]);
      } else {
        columnData.push(items);
      }
    });

    // 最大アイテム数を取得
    const maxItems = Math.max(
      ...columnData.map((col) => (Array.isArray(col) ? col.length : 1)),
    );

    // データを2次元配列に整形
    const sheetData = [];

    // ヘッダー行
    sheetData.push([
      "ChatGPTモデル",
      "Claudeモデル",
      "Geminiモデル",
      "ChatGPT機能",
      "Claude機能",
      "Gemini機能",
    ]);

    // データ行
    for (let rowIndex = 0; rowIndex < maxItems; rowIndex++) {
      const dataRow = [];
      for (let colIndex = 0; colIndex < columnData.length; colIndex++) {
        const columnItems = Array.isArray(columnData[colIndex])
          ? columnData[colIndex]
          : [columnData[colIndex]];
        const item = columnItems[rowIndex] || "-";
        dataRow.push(item);
      }
      sheetData.push(dataRow);
    }

    // スプレッドシートID抽出
    const spreadsheetId = "1Yk43YLLo-xQTL6Wqz0FjuvBGP3izW1JhRolHow3fs1c";
    const gid = "910709667";

    // background.jsにメッセージを送信してスプレッドシートに書き込み
    const response = await chrome.runtime.sendMessage({
      action: "WRITE_AI_DATA_TO_SPREADSHEET",
      spreadsheetId: spreadsheetId,
      gid: gid,
      data: sheetData,
    });

    if (response && response.success) {
      log.info("✅ スプレッドシートへ保存完了");
      showFeedback("スプレッドシートへ保存しました", "success");

      // スプレッドシート保存完了メッセージを表示
      const messageDiv = document.getElementById("spreadsheetSavedMessage");
      if (messageDiv) {
        messageDiv.style.display = "block";
      }
    } else {
      throw new Error(response?.error || "保存に失敗しました");
    }
  } catch (error) {
    log.error("❌ スプレッドシート保存エラー:", error);
    showFeedback(`保存エラー: ${error.message}`, "error");
  }
}

// AI統合表を指定フォーマットでコピー
function copyAITableToClipboard() {
  try {
    const table = document.getElementById("ai-integrated-table");
    const statusDiv = document.getElementById("copy-status");

    if (!table) {
      statusDiv.textContent = "❌ 表が見つかりません";
      statusDiv.style.color = "#dc3545";
      return;
    }

    // データ行を取得
    const tbody = table.querySelector("tbody");
    const dataRows = tbody.querySelectorAll("tr");

    if (dataRows.length === 0) {
      statusDiv.textContent = "❌ 表にデータがありません";
      statusDiv.style.color = "#dc3545";
      return;
    }

    let tsvData = "";

    // 最初の行からデータを取得
    const row = dataRows[0];
    const cells = row.querySelectorAll("td");

    if (cells.length === 6) {
      // 各セルからデータを抽出
      const columnData = [];

      cells.forEach((cell) => {
        // HTMLタグを保持してから処理
        let cellContent =
          cell.innerHTML || cell.textContent || cell.innerText || "";

        // HTMLタグを適切に処理・除去
        cellContent = cellContent
          .replace(/<small[^>]*>/g, "") // <small>開始タグを除去
          .replace(/<\/small>/g, "") // </small>終了タグを除去
          .replace(/<span[^>]*>/g, "") // <span>開始タグを除去
          .replace(/<\/span>/g, "") // </span>終了タグを除去
          .replace(/(?:更新|検出日):.*$/m, "") // 更新・検出日情報を除去
          .trim();

        // 検出待機中や未検出の場合は "-" に置換
        if (
          cellContent.includes("検出待機中") ||
          cellContent.includes("未検出") ||
          cellContent.trim() === ""
        ) {
          columnData.push("-");
          return;
        }

        // デバッグ: セルの生コンテンツを確認

        // より詳細な分割パターンを使用
        let items = [];

        // HTMLの<br>タグがある場合
        if (cellContent.includes("<br>")) {
          items = cellContent.split(/<br\s*\/?>/gi);
        }
        // 改行文字がある場合
        else if (cellContent.includes("\n")) {
          items = cellContent.split(/\n/);
        }
        // •文字がある場合
        else if (cellContent.includes("•")) {
          items = cellContent.split(/•/);
        }
        // スペースで区切られた複数の項目の場合（日本語の場合は適用しない）
        else if (
          /[a-zA-Z]/.test(cellContent) &&
          cellContent.split(/\s+/).length > 1
        ) {
          items = cellContent.split(/\s+/);
        }
        // その他の場合は単一項目として扱う
        else {
          items = [cellContent];
        }

        // 各項目をクリーンアップ
        items = items
          .map((item) => {
            return item
              .replace(/^[•✅❌]\s*/, "")
              .replace(/\s*🟢|\s*🔴/g, "")
              .replace(/🍌\s*/g, "") // バナナ絵文字を除去
              .replace(/[\u{1F000}-\u{1F9FF}]/gu, "") // 一般的な絵文字を除去
              .replace(/[\u{2600}-\u{26FF}]/gu, "") // その他記号・絵文字を除去
              .replace(/\([^)]*\)/g, "")
              .replace(/\[[^\]]*\]/g, "")
              .replace(/\s*\(無効\)/g, "")
              .trim();
          })
          .filter(
            (item) =>
              item !== "" && !item.includes("検出日") && !item.includes("更新"),
          );

        if (items.length === 0) {
          columnData.push(["-"]);
        } else {
          // 複数項目を配列として保持（後で個別セルに分離）
          columnData.push(items);
        }
      });

      // 最大アイテム数を取得
      const maxItems = Math.max(
        ...columnData.map((col) => (Array.isArray(col) ? col.length : 1)),
      );

      // シンプルなヘッダー（固定6列）
      const headers = [
        "ChatGPTモデル",
        "Claudeモデル",
        "Geminiモデル",
        "ChatGPT機能",
        "Claude機能",
        "Gemini機能",
      ];

      tsvData = headers.join("\t") + "\n";

      // 各アイテムを個別の行として出力
      for (let rowIndex = 0; rowIndex < maxItems; rowIndex++) {
        const dataRow = [];
        for (let colIndex = 0; colIndex < columnData.length; colIndex++) {
          const columnItems = Array.isArray(columnData[colIndex])
            ? columnData[colIndex]
            : [columnData[colIndex]];
          const item = columnItems[rowIndex] || "-";
          dataRow.push(item);
        }
        tsvData += dataRow.join("\t");
        if (rowIndex < maxItems - 1) {
          tsvData += "\n";
        }
      }
    }

    // クリップボードにコピー
    navigator.clipboard
      .writeText(tsvData)
      .then(() => {
        statusDiv.textContent =
          "✅ 表を指定フォーマットでクリップボードにコピーしました！";
        statusDiv.style.color = "#28a745";

        // 3秒後にステータスをクリア
        setTimeout(() => {
          statusDiv.textContent = "";
        }, 3000);

        log.info("📋 AI統合表を指定フォーマットでコピー完了");
        log.debug("📋 コピーされたデータ:", tsvData);
      })
      .catch((err) => {
        statusDiv.textContent = "❌ コピーに失敗しました: " + err.message;
        statusDiv.style.color = "#dc3545";
        log.error("📋 クリップボードコピーエラー:", err);
      });
  } catch (error) {
    const statusDiv = document.getElementById("copy-status");
    statusDiv.textContent = "❌ エラーが発生しました: " + error.message;
    statusDiv.style.color = "#dc3545";
    log.error("📋 表コピー機能エラー:", error);
  }
}

// ページ読み込み時にコピーボタンのイベントリスナーを設定
document.addEventListener("DOMContentLoaded", () => {
  const copyButton = document.getElementById("copy-ai-table-btn");
  if (copyButton) {
    copyButton.addEventListener("click", copyAITableToClipboard);
    log.debug("📋 表コピーボタンのイベントリスナーを設定しました");
  }
});

// ========================================
// セレクタ管理機能の統合
// ========================================

// セレクタ管理システムの初期化
let selectorTimelineManager = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // step8-selector-timeline-manager.js の読み込み完了を待機
    if (typeof window.SelectorTimelineManager === "undefined") {
      // 動的インポートでセレクタ管理システムを読み込み
      const { SelectorTimelineManager } = await import(
        "./step8-selector-timeline-manager.js"
      );

      // セレクタ管理システムを初期化
      selectorTimelineManager = new SelectorTimelineManager();
      selectorTimelineManager.init();

      // グローバルアクセス用
      window.selectorTimelineManager = selectorTimelineManager;

      log.debug("🎯 セレクタ管理システム初期化完了");
    }
  } catch (error) {
    log.error("❌ セレクタ管理システム初期化エラー:", error);
  }
});

// セレクタ関連のイベントハンドラー
document.addEventListener("click", (e) => {
  // セレクタコピー機能
  if (e.target.matches(".copy-selector-btn")) {
    e.stopPropagation();
    const selector = e.target.dataset.selector;
    if (selector) {
      window.copySelectorToClipboard(selector);
    }
  }
});

// セレクタテスト結果の表示補助関数
window.showSelectorTestNotification = function (message, success = true) {
  const notification = document.createElement("div");
  notification.className = `selector-test-notification ${success ? "success" : "error"}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    background: ${success ? "#28a745" : "#dc3545"};
    color: white;
    border-radius: 6px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    animation: slideInRight 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  // 3秒後に自動削除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = "slideOutRight 0.3s ease-in";
      setTimeout(() => notification.remove(), 300);
    }
  }, 3000);
};

// CSS アニメーション定義を追加
if (!document.getElementById("selector-animations")) {
  const style = document.createElement("style");
  style.id = "selector-animations";
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ========================================
// セレクタ管理機能の公開API
// ========================================

// セレクタ統計の更新
window.updateSelectorUsage = async function (
  aiName,
  selectorKey,
  success,
  responseTime,
) {
  // step7-selector-data-structure.jsのupdateSelectorStatsを動的インポート
  try {
    const { updateSelectorStats } = await import(
      "./step7-selector-data-structure.js"
    );

    // 統計を更新
    updateSelectorStats(aiName, selectorKey, success, responseTime);

    // UI表示も更新
    if (selectorTimelineManager) {
      selectorTimelineManager.updateDisplay();
    }

    log.debug(
      `✅ [セレクタ統計更新] ${aiName}:${selectorKey} - 成功:${success}, 応答時間:${responseTime}ms`,
    );
  } catch (error) {
    log.error("セレクタ統計更新エラー:", error);
  }
};

// 現在表示中のAIを取得
window.getCurrentSelectorAI = function () {
  return selectorTimelineManager
    ? selectorTimelineManager.getCurrentAI()
    : "chatgpt";
};

// セレクタ管理システムの再初期化
window.reinitializeSelectorManager = function () {
  if (selectorTimelineManager) {
    selectorTimelineManager.updateDisplay();
    log.debug("🔄 セレクタ管理システム再初期化完了");
  }
};

// スクリプト読み込み完了をトラッキング
window.scriptLoadTracker.addScript("step0-ui-controller.js");

log.debug(
  "🎉 [step0-ui-controller] 全機能読み込み完了（セレクタ管理システム含む）",
);
