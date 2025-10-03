// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // デフォルト値（デバッグとINFOログを無効化）

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
      console.info(
        `📋 [UI Controller] ログレベル設定: ${["", "ERROR", "WARN", "INFO", "DEBUG"][CURRENT_LOG_LEVEL]}`,
      );
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
    "step0-ui-controller.js": [
      "step1-setup.js",
      "step2-taskgroup.js",
      "step3-tasklist.js",
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
// Section 2: ウィンドウサービス機能を削除 - step3-tasklist.jsで一元管理
// ========================================

// ========================================
// WindowService は step3-tasklist.js で一元管理
// ========================================
log.debug(
  "🔧 [step0-ui-controller] ウィンドウ管理は step3-tasklist.js の StepIntegratedWindowService で行います",
);

// ========================================
// WindowController の初期化はstep3-tasklist.jsで行う
// ========================================
// step3-tasklist.jsでWindowControllerクラスが定義されるまで待機
log.debug("⏳ [step0-ui-controller] WindowController初期化をstep3に委譲");

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
const saveUrlTagInput = document.getElementById("saveUrlTagInput");
const saveUrlTagsContainer = document.getElementById("saveUrlTagsContainer");
const saveUrlSuggestedTagsContainer = document.getElementById(
  "saveUrlSuggestedTagsContainer",
);
const saveUrlSuggestedTags = document.getElementById("saveUrlSuggestedTags");
const saveUrlFolder = document.getElementById("saveUrlFolder");
const newFolderBtn = document.getElementById("newFolderBtn");
const saveUrlMemo = document.getElementById("saveUrlMemo");
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
let savedFolders = []; // 空フォルダを含む全フォルダのリスト
let tagColors = {}; // タグごとの色設定

// データ構造のバージョン
const STORAGE_VERSION = 6; // v6: 空フォルダの永続化サポート
const STORAGE_KEY = "autoai_urls_data";

// タグ色のパレット
const TAG_COLOR_PALETTE = [
  { bg: "#e3f2fd", text: "#1976d2" }, // 青
  { bg: "#f3e5f5", text: "#7b1fa2" }, // 紫
  { bg: "#e8f5e9", text: "#388e3c" }, // 緑
  { bg: "#fff3e0", text: "#f57c00" }, // オレンジ
  { bg: "#fce4ec", text: "#c2185b" }, // ピンク
  { bg: "#e0f2f1", text: "#00796b" }, // ティール
  { bg: "#fff9c4", text: "#f9a825" }, // 黄色
  { bg: "#ede7f6", text: "#5e35b1" }, // 深紫
  { bg: "#e1f5fe", text: "#0277bd" }, // 水色
  { bg: "#ffebee", text: "#c62828" }, // 赤
];

// タグに色を割り当てる（まだ色が割り当てられていない場合）
function assignTagColor(tag) {
  if (!tagColors[tag]) {
    // 既に使用されている色のインデックスを取得
    const usedIndices = Object.values(tagColors);
    // パレットから未使用の色を探す
    let colorIndex = 0;
    for (let i = 0; i < TAG_COLOR_PALETTE.length; i++) {
      if (!usedIndices.includes(i)) {
        colorIndex = i;
        break;
      }
    }
    // すべての色が使用されている場合は、タグ名のハッシュから色を選択
    if (usedIndices.length >= TAG_COLOR_PALETTE.length) {
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      }
      colorIndex = Math.abs(hash) % TAG_COLOR_PALETTE.length;
    }
    tagColors[tag] = colorIndex;
  }
  return TAG_COLOR_PALETTE[tagColors[tag]];
}

// 古いデータ構造を新しい形式に変換（v4対応）
function migrateToV4(urls) {
  const migrated = {};

  Object.entries(urls).forEach(([title, value]) => {
    if (typeof value === "string") {
      // v1形式: { "タイトル": "URL" }
      migrated[title] = {
        url: value,
        tags: [],
        favorite: false,
        memo: "",
      };
    } else if (value && typeof value === "object") {
      // v2/v3形式
      migrated[title] = {
        url: value.url || value,
        tags: value.tags || [],
        favorite: value.favorite || false,
        memo: value.memo || "",
      };
    }
  });

  return migrated;
}

// v4からv5への移行（フォルダ機能追加）
function migrateToV5(urls) {
  const migrated = {};

  Object.entries(urls).forEach(([title, value]) => {
    if (typeof value === "string") {
      // 古い形式
      migrated[title] = {
        url: value,
        tags: [],
        favorite: false,
        memo: "",
        folder: "", // ルートフォルダ
      };
    } else if (value && typeof value === "object") {
      // v4形式
      migrated[title] = {
        url: value.url || value,
        tags: value.tags || [],
        favorite: value.favorite || false,
        memo: value.memo || "",
        folder: value.folder || "", // 既存のfolder or ルート
      };
    }
  });

  return migrated;
}

// chrome.storage.syncから保存されたURLを読み込み（非同期）
async function loadSavedUrls() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], async (result) => {
      try {
        if (result[STORAGE_KEY]) {
          // chrome.storage.syncにデータがある場合
          const data = result[STORAGE_KEY];

          // URLから既存フォルダを抽出するヘルパー関数
          const extractFoldersFromUrls = (urls) => {
            const folders = new Set();
            Object.values(urls).forEach((urlData) => {
              if (urlData.folder && urlData.folder.trim() !== "") {
                folders.add(urlData.folder);
              }
            });
            return Array.from(folders).sort();
          };

          if (data.version === STORAGE_VERSION) {
            // 最新バージョンのデータ（v6）
            savedUrls = data.urls || {};
            savedFolders = data.folders || [];
            tagColors = data.tagColors || {};

            // v6で savedFolders が空の場合は、既存フォルダを抽出（修正適用）
            if (
              savedFolders.length === 0 &&
              Object.keys(savedUrls).length > 0
            ) {
              savedFolders = extractFoldersFromUrls(savedUrls);
              if (savedFolders.length > 0) {
                log.info(
                  `📦 v6データ修正：既存フォルダ${savedFolders.length}件を抽出`,
                );
                await savUrlsToStorage();
              }
            }
          } else if (data.version === 5) {
            // v5からv6への移行（空フォルダ機能追加）
            savedUrls = data.urls || {};
            savedFolders = extractFoldersFromUrls(savedUrls); // 既存フォルダを抽出
            tagColors = data.tagColors || {};
            log.info(
              `📦 v5からv6にデータ移行（空フォルダサポート追加、既存フォルダ${savedFolders.length}件抽出）`,
            );
            await savUrlsToStorage();
          } else if (data.version === 4) {
            // v4からv6への移行
            savedUrls = migrateToV5(data.urls || {});
            savedFolders = extractFoldersFromUrls(savedUrls); // 既存フォルダを抽出
            tagColors = data.tagColors || {};
            log.info(
              `📦 v4からv6にデータ移行（既存フォルダ${savedFolders.length}件抽出）`,
            );
            await savUrlsToStorage();
          } else if (
            data.version === 3 ||
            data.version === 2 ||
            data.version === 1
          ) {
            // v1/v2/v3からv6への移行
            const v4Data = migrateToV4(data.urls || {});
            savedUrls = migrateToV5(v4Data);
            savedFolders = extractFoldersFromUrls(savedUrls); // 既存フォルダを抽出
            tagColors = data.tagColors || {};
            log.info(
              `📦 v${data.version}からv6にデータ移行（既存フォルダ${savedFolders.length}件抽出）`,
            );
            await savUrlsToStorage();
          } else {
            // バージョン不明（古い形式）
            const v4Data = migrateToV4(data);
            savedUrls = migrateToV5(v4Data);
            savedFolders = extractFoldersFromUrls(savedUrls); // 既存フォルダを抽出
            tagColors = {};
            log.info(
              `📦 古い形式からv6にデータ移行（既存フォルダ${savedFolders.length}件抽出）`,
            );
            await savUrlsToStorage();
          }

          log.debug(
            `✅ chrome.storage.syncからURL読み込み完了 (${Object.keys(savedUrls).length}件, フォルダ${savedFolders.length}個)`,
          );
          resolve();
        } else {
          // chrome.storage.syncにデータがない場合、localStorageから移行
          const legacyData = localStorage.getItem("autoai_saved_urls");

          if (legacyData) {
            try {
              const legacyUrls = JSON.parse(legacyData);
              const v4Data = migrateToV4(legacyUrls);
              savedUrls = migrateToV5(v4Data);
              savedFolders = [];
              tagColors = {};
              log.info(
                `📦 localStorageから${Object.keys(savedUrls).length}件のURLを移行します（v6形式）`,
              );

              // chrome.storage.syncに保存
              await savUrlsToStorage();

              log.info(
                "✅ chrome.storage.syncへの移行完了（複数デバイスで自動同期されます）",
              );
            } catch (parseError) {
              log.error("localStorage データ解析エラー:", parseError);
              savedUrls = {};
              savedFolders = [];
            }
          } else {
            log.debug("保存されたURLデータなし（初回起動）");
            savedUrls = {};
            savedFolders = [];
          }
          resolve();
        }
      } catch (error) {
        log.error("保存されたURL読み込みエラー:", error);
        savedUrls = {};
        savedFolders = [];
        resolve();
      }
    });
  });
}

// フォルダ一覧を取得（重複排除、ユーザー定義の順序を維持）
function getAllFolders() {
  // savedFoldersの順序を保持しながら、URLに紐付いたフォルダも含める
  const result = [];
  const seenFolders = new Set();

  // まずsavedFoldersから（ユーザー定義の順序を維持）
  savedFolders.forEach((folder) => {
    if (folder && folder.trim() !== "" && !seenFolders.has(folder)) {
      result.push(folder);
      seenFolders.add(folder);
    }
  });

  // 次にURLに紐付いたフォルダを追加（savedFoldersにない場合のみ）
  Object.values(savedUrls).forEach((urlData) => {
    if (
      urlData.folder &&
      urlData.folder.trim() !== "" &&
      !seenFolders.has(urlData.folder)
    ) {
      result.push(urlData.folder);
      seenFolders.add(urlData.folder);
    }
  });

  return result;
}

// URLをchrome.storage.syncに保存（非同期）
async function savUrlsToStorage() {
  return new Promise((resolve, reject) => {
    const data = {
      version: STORAGE_VERSION,
      urls: savedUrls,
      folders: savedFolders,
      tagColors: tagColors,
      lastUpdated: new Date().toISOString(),
    };

    chrome.storage.sync.set({ [STORAGE_KEY]: data }, async () => {
      if (chrome.runtime.lastError) {
        // 容量オーバーの可能性
        if (chrome.runtime.lastError.message.includes("QUOTA_BYTES")) {
          log.error("❌ 容量制限エラー: URLデータが100KBを超えています");
          showFeedback(
            "保存容量を超えました。古いURLを削除してください。",
            "error",
          );
        } else {
          log.error("URL保存エラー:", chrome.runtime.lastError);
        }
        reject(chrome.runtime.lastError);
      } else {
        log.debug(
          `💾 chrome.storage.syncに保存完了 (${Object.keys(savedUrls).length}件, フォルダ${savedFolders.length}個) - 複数デバイスで同期されます`,
        );
        resolve();
      }
    });
  });
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
  saveUrlTagInput.value = "";
  saveUrlMemo.value = "";
  saveUrlDialog.style.display = "block";
  saveUrlTitle.focus();

  // フォルダ一覧を更新
  const folders = getAllFolders();
  saveUrlFolder.innerHTML = '<option value="">📁 ルートフォルダ</option>';
  folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder;
    const indent = "　".repeat(folder.split("/").length - 1);
    option.textContent = `${indent}📁 ${folder}`;
    saveUrlFolder.appendChild(option);
  });

  // タグ管理用の配列
  const currentTags = [];

  // 全URLから既存タグを収集（重複排除）
  const allExistingTags = new Set();
  Object.values(savedUrls).forEach((urlData) => {
    if (urlData.tags && Array.isArray(urlData.tags)) {
      urlData.tags.forEach((tag) => allExistingTags.add(tag));
    }
  });

  // タグ表示を更新
  function renderTags() {
    saveUrlTagsContainer.innerHTML = "";
    if (currentTags.length === 0) {
      const emptyMessage = document.createElement("span");
      emptyMessage.style.cssText = "color: #999; font-size: 12px;";
      emptyMessage.textContent = "タグがありません";
      saveUrlTagsContainer.appendChild(emptyMessage);
    } else {
      currentTags.forEach((tag) => {
        const color = assignTagColor(tag);
        const tagBadge = document.createElement("span");
        tagBadge.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: ${color.bg};
          color: ${color.text};
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          cursor: pointer;
        `;
        tagBadge.innerHTML = `🏷️ ${tag} <span style="margin-left: 2px; font-weight: bold;">×</span>`;
        tagBadge.title = "クリックして削除";
        tagBadge.addEventListener("click", () => {
          const index = currentTags.indexOf(tag);
          if (index > -1) {
            currentTags.splice(index, 1);
            renderTags();
            renderSuggestedTags();
          }
        });
        saveUrlTagsContainer.appendChild(tagBadge);
      });
    }
  }

  // 候補タグ表示を更新
  function renderSuggestedTags() {
    saveUrlSuggestedTags.innerHTML = "";
    const hasUnusedTags = Array.from(allExistingTags).some(
      (tag) => !currentTags.includes(tag),
    );

    if (hasUnusedTags) {
      saveUrlSuggestedTagsContainer.style.display = "block";
      allExistingTags.forEach((tag) => {
        if (!currentTags.includes(tag)) {
          const color = assignTagColor(tag);
          const tagBtn = document.createElement("button");
          tagBtn.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: ${color.bg};
            color: ${color.text};
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            border: 1px solid ${color.text}40;
            cursor: pointer;
            transition: all 0.2s;
          `;
          tagBtn.innerHTML = `🏷️ ${tag} <span style="font-weight: bold;">+</span>`;
          tagBtn.title = "クリックして追加";
          tagBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (!currentTags.includes(tag)) {
              currentTags.push(tag);
              renderTags();
              renderSuggestedTags();
            }
          });
          tagBtn.addEventListener("mouseenter", () => {
            tagBtn.style.transform = "scale(1.05)";
            tagBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
          });
          tagBtn.addEventListener("mouseleave", () => {
            tagBtn.style.transform = "scale(1)";
            tagBtn.style.boxShadow = "none";
          });
          saveUrlSuggestedTags.appendChild(tagBtn);
        }
      });
    } else {
      saveUrlSuggestedTagsContainer.style.display = "none";
    }
  }

  renderTags();
  renderSuggestedTags();

  // 追加ボタンのクリックイベント
  const addSaveTagBtn = document.getElementById("addSaveTagBtn");
  addSaveTagBtn.addEventListener("click", () => {
    const newTag = saveUrlTagInput.value.trim();
    if (newTag && !currentTags.includes(newTag)) {
      currentTags.push(newTag);
      renderTags();
      renderSuggestedTags();
      saveUrlTagInput.value = "";
      saveUrlTagInput.focus();
      showFeedback(`タグ "${newTag}" を追加しました`, "success");
    } else if (!newTag) {
      showFeedback("タグ名を入力してください", "error");
    } else if (currentTags.includes(newTag)) {
      showFeedback(`タグ "${newTag}" は既に追加されています`, "error");
      saveUrlTagInput.value = "";
      saveUrlTagInput.focus();
    }
  });

  // カンマまたはTabキーでタグを追加、Enterで保存
  saveUrlTagInput.onkeydown = (e) => {
    if (e.key === "," || e.key === "Tab") {
      e.preventDefault();
      const newTag = saveUrlTagInput.value.trim().replace(/,+$/, ""); // 末尾のカンマを削除
      if (newTag && !currentTags.includes(newTag)) {
        currentTags.push(newTag);
        renderTags();
        renderSuggestedTags();
        saveUrlTagInput.value = "";
        showFeedback(`タグ "${newTag}" を追加しました`, "success");
      } else if (currentTags.includes(newTag)) {
        showFeedback(`タグ "${newTag}" は既に追加されています`, "error");
        saveUrlTagInput.value = "";
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      // 入力中のテキストがあれば先にタグとして追加
      const newTag = saveUrlTagInput.value.trim();
      if (newTag && !currentTags.includes(newTag)) {
        currentTags.push(newTag);
        renderTags();
        renderSuggestedTags();
        saveUrlTagInput.value = "";
      }
      // 保存ボタンをクリック
      confirmSaveUrlBtn.click();
    }
  };

  // 保存ボタンのイベント
  confirmSaveUrlBtn.onclick = async () => {
    const title = saveUrlTitle.value.trim();
    if (!title) {
      showFeedback("タイトルを入力してください", "error");
      return;
    }

    // メモとフォルダを取得
    const memo = saveUrlMemo.value.trim();
    const folder = saveUrlFolder.value.trim();

    // URLを保存（v5形式）
    savedUrls[title] = {
      url: url,
      tags: currentTags,
      favorite: false,
      memo: memo,
      folder: folder,
    };
    await savUrlsToStorage();

    const tagInfo =
      currentTags.length > 0 ? ` (タグ: ${currentTags.join(", ")})` : "";
    const folderInfo = folder ? ` (フォルダ: ${folder})` : "";
    showFeedback(
      `"${title}" として保存しました${tagInfo}${folderInfo}`,
      "success",
    );
    saveUrlDialog.style.display = "none";
  };

  // キャンセルボタンのイベント
  cancelSaveUrlBtn.onclick = () => {
    saveUrlDialog.style.display = "none";
  };

  // 新規フォルダボタンのイベント
  newFolderBtn.onclick = async (e) => {
    e.preventDefault();
    const folderName = await showCreateFolderDialog();
    if (folderName) {
      // savedFoldersに追加（重複チェック）
      if (!savedFolders.includes(folderName)) {
        savedFolders.push(folderName);
        await savUrlsToStorage();
      }

      // ドロップダウンを完全に再構築
      const folders = getAllFolders();
      saveUrlFolder.innerHTML = '<option value="">📁 ルートフォルダ</option>';
      folders.forEach((folder) => {
        const option = document.createElement("option");
        option.value = folder;
        const indent = "　".repeat(folder.split("/").length - 1);
        option.textContent = `${indent}📁 ${folder}`;
        saveUrlFolder.appendChild(option);
      });

      // 新しく作成したフォルダを選択
      saveUrlFolder.value = folderName;
      showFeedback(`フォルダ "${folderName}" を作成しました`, "success");
    }
  };
}

// URL編集ダイアログを表示
function showEditUrlDialog(
  oldTitle,
  oldUrl,
  oldTags,
  oldFavorite,
  oldMemo,
  oldFolder,
  targetInput,
) {
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
    min-width: 450px;
    max-width: 600px;
  `;

  const memoText = oldMemo || "";
  const folderText = oldFolder || "";

  // 全URLから既存タグを収集
  const allExistingTags = new Set();
  Object.values(savedUrls).forEach((urlData) => {
    if (urlData.tags && Array.isArray(urlData.tags)) {
      urlData.tags.forEach((tag) => allExistingTags.add(tag));
    }
  });

  editDialog.innerHTML = `
    <h3 style="margin-top: 0;">URLを編集</h3>
    <label style="display: block; margin-bottom: 5px; font-size: 14px;">タイトル:</label>
    <input type="text" id="editUrlTitle" value="${oldTitle}" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px;">
    <label style="display: block; margin-bottom: 5px; font-size: 14px;">URL:</label>
    <input type="text" id="editUrlValue" value="${oldUrl}" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px;">

    <label style="display: block; margin-bottom: 5px; font-size: 14px;">タグ:</label>
    <div style="display: flex; gap: 8px; margin-bottom: 5px;">
      <input type="text" id="editUrlTagInput" placeholder="タグ名を入力" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      <button id="addEditTagBtn" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">+ 追加</button>
    </div>
    <div style="font-size: 11px; color: #666; margin-bottom: 10px;">💡 カンマ（,）・Tab・Enterキーまたは追加ボタンでタグ追加</div>
    <div id="editUrlTagsContainer" style="min-height: 40px; padding: 8px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
      <!-- タグがここに表示される -->
    </div>
    <div id="editUrlSuggestedTagsContainer" style="display: none; margin-bottom: 10px;">
      <label style="display: block; margin-bottom: 5px; font-size: 13px; color: #666;">よく使うタグから選択:</label>
      <div id="editUrlSuggestedTags" style="display: flex; flex-wrap: wrap; gap: 6px;">
        <!-- 候補タグがここに表示される -->
      </div>
    </div>

    <label style="display: block; margin-bottom: 5px; font-size: 14px;">フォルダ（オプション）:</label>
    <div style="display: flex; gap: 8px; margin-bottom: 10px;">
      <select id="editUrlFolder" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        <option value="">📁 ルートフォルダ</option>
      </select>
      <button id="newEditFolderBtn" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">+ 新規</button>
    </div>

    <label style="display: block; margin-bottom: 5px; font-size: 14px;">メモ（オプション）:</label>
    <textarea id="editUrlMemo" placeholder="このURLについてのメモを入力..." style="width: 100%; min-height: 80px; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-family: inherit;">${memoText}</textarea>
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button id="confirmEditUrlBtn" class="btn btn-primary" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
      <button id="cancelEditUrlBtn" class="btn btn-secondary" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">キャンセル</button>
    </div>
  `;

  document.body.appendChild(editDialog);

  const editTitleInput = document.getElementById("editUrlTitle");
  const editUrlInput = document.getElementById("editUrlValue");
  const editUrlTagInput = document.getElementById("editUrlTagInput");
  const addEditTagBtn = document.getElementById("addEditTagBtn");
  const editUrlTagsContainer = document.getElementById("editUrlTagsContainer");
  const editUrlSuggestedTagsContainer = document.getElementById(
    "editUrlSuggestedTagsContainer",
  );
  const editUrlSuggestedTags = document.getElementById("editUrlSuggestedTags");
  const editUrlFolder = document.getElementById("editUrlFolder");
  const newEditFolderBtn = document.getElementById("newEditFolderBtn");
  const editMemoInput = document.getElementById("editUrlMemo");
  const confirmEditBtn = document.getElementById("confirmEditUrlBtn");
  const cancelEditBtn = document.getElementById("cancelEditUrlBtn");

  // フォルダ一覧を初期化
  const folders = getAllFolders();
  folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder;
    const indent = "　".repeat(folder.split("/").length - 1);
    option.textContent = `${indent}📁 ${folder}`;
    editUrlFolder.appendChild(option);
  });
  // 現在のフォルダを選択
  if (folderText) {
    editUrlFolder.value = folderText;
  }

  // 現在のタグを管理
  const currentTags = Array.isArray(oldTags) ? [...oldTags] : [];

  // タグ表示を更新
  function renderTags() {
    editUrlTagsContainer.innerHTML = "";
    if (currentTags.length === 0) {
      const emptyMessage = document.createElement("span");
      emptyMessage.style.cssText = "color: #999; font-size: 12px;";
      emptyMessage.textContent = "タグがありません";
      editUrlTagsContainer.appendChild(emptyMessage);
    } else {
      currentTags.forEach((tag) => {
        const color = assignTagColor(tag);
        const tagBadge = document.createElement("span");
        tagBadge.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: ${color.bg};
          color: ${color.text};
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          cursor: pointer;
        `;
        tagBadge.innerHTML = `🏷️ ${tag} <span style="margin-left: 2px; font-weight: bold;">×</span>`;
        tagBadge.title = "クリックして削除";
        tagBadge.addEventListener("click", () => {
          const index = currentTags.indexOf(tag);
          if (index > -1) {
            currentTags.splice(index, 1);
            renderTags();
            renderSuggestedTags();
          }
        });
        editUrlTagsContainer.appendChild(tagBadge);
      });
    }
  }

  // 候補タグ表示を更新
  function renderSuggestedTags() {
    editUrlSuggestedTags.innerHTML = "";
    const hasUnusedTags = Array.from(allExistingTags).some(
      (tag) => !currentTags.includes(tag),
    );

    if (hasUnusedTags) {
      editUrlSuggestedTagsContainer.style.display = "block";
      allExistingTags.forEach((tag) => {
        if (!currentTags.includes(tag)) {
          const color = assignTagColor(tag);
          const tagBtn = document.createElement("button");
          tagBtn.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: ${color.bg};
            color: ${color.text};
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            border: 1px solid ${color.text}40;
            cursor: pointer;
            transition: all 0.2s;
          `;
          tagBtn.innerHTML = `🏷️ ${tag} <span style="font-weight: bold;">+</span>`;
          tagBtn.title = "クリックして追加";
          tagBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (!currentTags.includes(tag)) {
              currentTags.push(tag);
              renderTags();
              renderSuggestedTags();
            }
          });
          tagBtn.addEventListener("mouseenter", () => {
            tagBtn.style.transform = "scale(1.05)";
            tagBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
          });
          tagBtn.addEventListener("mouseleave", () => {
            tagBtn.style.transform = "scale(1)";
            tagBtn.style.boxShadow = "none";
          });
          editUrlSuggestedTags.appendChild(tagBtn);
        }
      });
    } else {
      editUrlSuggestedTagsContainer.style.display = "none";
    }
  }

  renderTags();
  renderSuggestedTags();

  editTitleInput.focus();
  editTitleInput.select();

  // 追加ボタンのクリックイベント
  addEditTagBtn.addEventListener("click", () => {
    const newTag = editUrlTagInput.value.trim();
    if (newTag && !currentTags.includes(newTag)) {
      currentTags.push(newTag);
      renderTags();
      renderSuggestedTags();
      editUrlTagInput.value = "";
      editUrlTagInput.focus();
      showFeedback(`タグ "${newTag}" を追加しました`, "success");
    } else if (!newTag) {
      showFeedback("タグ名を入力してください", "error");
    } else if (currentTags.includes(newTag)) {
      showFeedback(`タグ "${newTag}" は既に追加されています`, "error");
      editUrlTagInput.value = "";
      editUrlTagInput.focus();
    }
  });

  // カンマまたはTabキーでタグを追加、Enterで保存
  editUrlTagInput.addEventListener("keydown", (e) => {
    if (e.key === "," || e.key === "Tab") {
      e.preventDefault();
      const newTag = editUrlTagInput.value.trim().replace(/,+$/, ""); // 末尾のカンマを削除
      if (newTag && !currentTags.includes(newTag)) {
        currentTags.push(newTag);
        renderTags();
        renderSuggestedTags();
        editUrlTagInput.value = "";
        showFeedback(`タグ "${newTag}" を追加しました`, "success");
      } else if (currentTags.includes(newTag)) {
        showFeedback(`タグ "${newTag}" は既に追加されています`, "error");
        editUrlTagInput.value = "";
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      // 入力中のテキストがあれば先にタグとして追加
      const newTag = editUrlTagInput.value.trim();
      if (newTag && !currentTags.includes(newTag)) {
        currentTags.push(newTag);
        renderTags();
        renderSuggestedTags();
        editUrlTagInput.value = "";
      }
      // 保存ボタンをクリック
      confirmEditBtn.click();
    }
  });

  // 保存ボタン
  confirmEditBtn.onclick = async () => {
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

    // メモとフォルダを取得
    const memo = editMemoInput.value.trim();
    const folder = editUrlFolder.value.trim();

    // 古いエントリを削除
    delete savedUrls[oldTitle];

    // 新しいエントリを追加（v5形式）
    savedUrls[newTitle] = {
      url: newUrl,
      tags: currentTags,
      favorite: oldFavorite || false,
      memo: memo,
      folder: folder,
    };
    await savUrlsToStorage();

    const tagInfo =
      currentTags.length > 0 ? ` (タグ: ${currentTags.join(", ")})` : "";
    const folderInfo = folder ? ` (フォルダ: ${folder})` : "";
    showFeedback(
      `"${newTitle}" として更新しました${tagInfo}${folderInfo}`,
      "success",
    );
    document.body.removeChild(editDialog);
    await showOpenUrlDialog(targetInput); // リストを再表示
  };

  // キャンセルボタン
  cancelEditBtn.onclick = () => {
    document.body.removeChild(editDialog);
  };

  // 新規フォルダボタン
  newEditFolderBtn.onclick = async (e) => {
    e.preventDefault();
    const folderName = await showCreateFolderDialog();
    if (folderName) {
      // savedFoldersに追加（重複チェック）
      if (!savedFolders.includes(folderName)) {
        savedFolders.push(folderName);
        await savUrlsToStorage();
      }

      // ドロップダウンを完全に再構築
      const folders = getAllFolders();
      editUrlFolder.innerHTML = '<option value="">📁 ルートフォルダ</option>';
      folders.forEach((folder) => {
        const option = document.createElement("option");
        option.value = folder;
        const indent = "　".repeat(folder.split("/").length - 1);
        option.textContent = `${indent}📁 ${folder}`;
        editUrlFolder.appendChild(option);
      });

      // 新しく作成したフォルダを選択
      editUrlFolder.value = folderName;
      showFeedback(`フォルダ "${folderName}" を作成しました`, "success");
    }
  };

  // Escキーでキャンセル
  editDialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.body.removeChild(editDialog);
    }
  });
}

// タグ編集ダイアログを表示（簡易版）
function showQuickTagDialog(title, oldTags, targetInput) {
  // タグ編集用のダイアログを作成
  const tagDialog = document.createElement("div");
  tagDialog.id = "quickTagDialog";
  tagDialog.style.cssText = `
    display: block;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1), 0 0 0 9999px rgba(0,0,0,0.5);
    z-index: 10001;
    min-width: 450px;
    max-width: 600px;
  `;

  // 現在のタグをコピー
  const currentTags = Array.isArray(oldTags) ? [...oldTags] : [];

  // 全URLから既存タグを収集（重複排除）
  const allExistingTags = new Set();
  Object.values(savedUrls).forEach((urlData) => {
    if (urlData.tags && Array.isArray(urlData.tags)) {
      urlData.tags.forEach((tag) => allExistingTags.add(tag));
    }
  });

  tagDialog.innerHTML = `
    <h3 style="margin-top: 0;">🏷️ タグを編集</h3>
    <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
      <strong style="color: #333;">${title}</strong>
    </div>

    <label style="display: block; margin-bottom: 5px; font-size: 14px;">新しいタグを追加:</label>
    <div style="display: flex; gap: 8px; margin-bottom: 5px;">
      <input type="text" id="quickTagInput" placeholder="タグ名を入力" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
      <button id="addQuickTagBtn" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">+ 追加</button>
    </div>
    <div style="font-size: 11px; color: #666; margin-bottom: 10px;">💡 カンマ（,）・Tab・Enterキーまたは追加ボタンでタグ追加</div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 5px; font-size: 14px;">現在のタグ:</label>
      <div id="currentTagsContainer" style="min-height: 40px; padding: 8px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
        <!-- 現在のタグがここに表示される -->
      </div>
    </div>

    ${
      allExistingTags.size > 0
        ? `
    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 5px; font-size: 14px;">よく使うタグから選択:</label>
      <div id="suggestedTagsContainer" style="display: flex; flex-wrap: wrap; gap: 6px;">
        <!-- 候補タグがここに表示される -->
      </div>
    </div>
    `
        : ""
    }

    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button id="confirmQuickTagBtn" class="btn btn-primary" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
      <button id="cancelQuickTagBtn" class="btn btn-secondary" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">キャンセル</button>
    </div>
  `;

  document.body.appendChild(tagDialog);

  const quickTagInput = document.getElementById("quickTagInput");
  const addQuickTagBtn = document.getElementById("addQuickTagBtn");
  const currentTagsContainer = document.getElementById("currentTagsContainer");
  const suggestedTagsContainer = document.getElementById(
    "suggestedTagsContainer",
  );
  const confirmQuickTagBtn = document.getElementById("confirmQuickTagBtn");
  const cancelQuickTagBtn = document.getElementById("cancelQuickTagBtn");

  // 現在のタグを表示
  function renderCurrentTags() {
    currentTagsContainer.innerHTML = "";
    if (currentTags.length === 0) {
      const emptyMessage = document.createElement("span");
      emptyMessage.style.cssText = "color: #999; font-size: 12px;";
      emptyMessage.textContent = "タグがありません";
      currentTagsContainer.appendChild(emptyMessage);
    } else {
      currentTags.forEach((tag) => {
        const color = assignTagColor(tag);
        const tagBadge = document.createElement("span");
        tagBadge.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: ${color.bg};
          color: ${color.text};
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          cursor: pointer;
        `;
        tagBadge.innerHTML = `🏷️ ${tag} <span style="margin-left: 2px; font-weight: bold;">×</span>`;
        tagBadge.title = "クリックして削除";
        tagBadge.addEventListener("click", () => {
          const index = currentTags.indexOf(tag);
          if (index > -1) {
            currentTags.splice(index, 1);
            renderCurrentTags();
          }
        });
        currentTagsContainer.appendChild(tagBadge);
      });
    }
  }

  // 候補タグを表示
  function renderSuggestedTags() {
    if (!suggestedTagsContainer) return;
    suggestedTagsContainer.innerHTML = "";
    allExistingTags.forEach((tag) => {
      if (!currentTags.includes(tag)) {
        const color = assignTagColor(tag);
        const tagBtn = document.createElement("button");
        tagBtn.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: ${color.bg};
          color: ${color.text};
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          border: 1px solid ${color.text}40;
          cursor: pointer;
          transition: all 0.2s;
        `;
        tagBtn.innerHTML = `🏷️ ${tag} <span style="font-weight: bold;">+</span>`;
        tagBtn.title = "クリックして追加";
        tagBtn.addEventListener("click", () => {
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            renderCurrentTags();
            renderSuggestedTags();
          }
        });
        tagBtn.addEventListener("mouseenter", () => {
          tagBtn.style.transform = "scale(1.05)";
          tagBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        });
        tagBtn.addEventListener("mouseleave", () => {
          tagBtn.style.transform = "scale(1)";
          tagBtn.style.boxShadow = "none";
        });
        suggestedTagsContainer.appendChild(tagBtn);
      }
    });
  }

  renderCurrentTags();
  renderSuggestedTags();

  quickTagInput.focus();

  // 追加ボタンのクリックイベント
  addQuickTagBtn.addEventListener("click", () => {
    const newTag = quickTagInput.value.trim();
    if (newTag && !currentTags.includes(newTag)) {
      currentTags.push(newTag);
      renderCurrentTags();
      renderSuggestedTags();
      quickTagInput.value = "";
      quickTagInput.focus();
      showFeedback(`タグ "${newTag}" を追加しました`, "success");
    } else if (!newTag) {
      showFeedback("タグ名を入力してください", "error");
    } else if (currentTags.includes(newTag)) {
      showFeedback(`タグ "${newTag}" は既に追加されています`, "error");
      quickTagInput.value = "";
      quickTagInput.focus();
    }
  });

  // カンマまたはTabキーでタグを追加、Enterで保存
  quickTagInput.addEventListener("keydown", (e) => {
    if (e.key === "," || e.key === "Tab") {
      e.preventDefault();
      const newTag = quickTagInput.value.trim().replace(/,+$/, ""); // 末尾のカンマを削除
      if (newTag && !currentTags.includes(newTag)) {
        currentTags.push(newTag);
        renderCurrentTags();
        renderSuggestedTags();
        quickTagInput.value = "";
        showFeedback(`タグ "${newTag}" を追加しました`, "success");
      } else if (currentTags.includes(newTag)) {
        showFeedback(`タグ "${newTag}" は既に追加されています`, "error");
        quickTagInput.value = "";
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      // 入力中のテキストがあれば先にタグとして追加
      const newTag = quickTagInput.value.trim();
      if (newTag && !currentTags.includes(newTag)) {
        currentTags.push(newTag);
        renderCurrentTags();
        renderSuggestedTags();
        quickTagInput.value = "";
      }
      // 保存ボタンをクリック
      confirmQuickTagBtn.click();
    }
  });

  // 保存ボタン
  confirmQuickTagBtn.onclick = async () => {
    // タグを更新（既存のURLデータを保持）
    if (savedUrls[title]) {
      savedUrls[title].tags = currentTags;
      await savUrlsToStorage();

      const tagInfo =
        currentTags.length > 0 ? ` (タグ: ${currentTags.join(", ")})` : "";
      showFeedback(`"${title}" のタグを更新しました${tagInfo}`, "success");
      document.body.removeChild(tagDialog);
      await showOpenUrlDialog(targetInput); // リストを再表示
    }
  };

  // キャンセルボタン
  cancelQuickTagBtn.onclick = () => {
    document.body.removeChild(tagDialog);
  };

  // Escキーでキャンセル
  tagDialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.body.removeChild(tagDialog);
    }
  });
}

// フォルダ管理ダイアログを表示（Promise版）
function showFolderManagementDialog() {
  return new Promise((resolve) => {
    const dialog = document.getElementById("createFolderDialog");
    const parentFolderSelect = document.getElementById("parentFolderSelect");
    const folderNameInput = document.getElementById("createFolderName");
    const folderPreview = document.getElementById("folderPreview");
    const folderPreviewContent = document.getElementById(
      "folderPreviewContent",
    );
    const folderValidation = document.getElementById("folderValidation");
    const confirmBtn = document.getElementById("confirmCreateFolderBtn");
    const cancelBtn = document.getElementById("cancelCreateFolderBtn");
    const closeBtn = document.getElementById("closeFolderManagementBtn");
    const existingFoldersListDiv = document.getElementById(
      "existingFoldersList",
    );

    // フォルダリストを再描画する関数
    function refreshFolderList() {
      const folders = getAllFolders();

      // 親フォルダドロップダウンを更新
      parentFolderSelect.innerHTML =
        '<option value="">📁 ルートフォルダ（トップレベル）</option>';
      folders.forEach((folder) => {
        const option = document.createElement("option");
        option.value = folder;
        const indent = "　".repeat(folder.split("/").length - 1);
        option.textContent = `${indent}📁 ${folder}`;
        parentFolderSelect.appendChild(option);
      });

      // 既存フォルダ一覧を更新
      existingFoldersListDiv.innerHTML = "";

      if (folders.length === 0) {
        existingFoldersListDiv.innerHTML =
          '<div style="text-align: center; color: #999; padding: 20px;">フォルダがありません</div>';
        return;
      }

      folders.forEach((folder, index) => {
        const folderItem = document.createElement("div");
        folderItem.style.cssText =
          "display: flex; align-items: center; gap: 8px; padding: 8px; background: white; border-radius: 4px; margin-bottom: 6px; border: 1px solid #dee2e6;";

        const indent = "　".repeat(folder.split("/").length - 1);
        const folderLabel = document.createElement("span");
        folderLabel.textContent = `${indent}📁 ${folder}`;
        folderLabel.style.cssText = "flex: 1; font-size: 13px; color: #333;";
        folderItem.appendChild(folderLabel);

        // 編集ボタン
        const editBtn = document.createElement("button");
        editBtn.textContent = "✏️";
        editBtn.title = "編集";
        editBtn.style.cssText =
          "padding: 4px 8px; background: #ffc107; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;";
        editBtn.onclick = async (e) => {
          e.stopPropagation();
          const newName = prompt(`フォルダ名を変更:`, folder);
          if (newName && newName.trim() !== "" && newName !== folder) {
            const trimmedName = newName.trim();
            // フォルダ内のすべてのURLを更新
            Object.values(savedUrls).forEach((urlData) => {
              if (urlData.folder === folder) {
                urlData.folder = trimmedName;
              } else if (
                urlData.folder &&
                urlData.folder.startsWith(folder + "/")
              ) {
                // 子フォルダも更新
                urlData.folder = urlData.folder.replace(folder, trimmedName);
              }
            });
            // savedFoldersも更新
            const idx = savedFolders.indexOf(folder);
            if (idx !== -1) {
              savedFolders[idx] = trimmedName;
            }
            // 子フォルダのパスも更新
            savedFolders.forEach((f, i) => {
              if (f.startsWith(folder + "/")) {
                savedFolders[i] = f.replace(folder, trimmedName);
              }
            });
            await savUrlsToStorage();
            refreshFolderList();
            showFeedback(
              `フォルダ "${folder}" を "${trimmedName}" に変更しました`,
              "success",
            );
          }
        };
        folderItem.appendChild(editBtn);

        // 削除ボタン
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "🗑️";
        deleteBtn.title = "削除";
        deleteBtn.style.cssText =
          "padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;";
        deleteBtn.onclick = async (e) => {
          e.stopPropagation();
          if (
            confirm(
              `フォルダ "${folder}" を削除しますか？\n（フォルダ内のURLはルートフォルダに移動されます）`,
            )
          ) {
            // フォルダ内のすべてのURLをルートフォルダに移動
            Object.values(savedUrls).forEach((urlData) => {
              if (urlData.folder === folder) {
                urlData.folder = "";
              } else if (
                urlData.folder &&
                urlData.folder.startsWith(folder + "/")
              ) {
                // 子フォルダも削除
                urlData.folder = "";
              }
            });
            // savedFoldersからも削除（子フォルダも含む）
            savedFolders = savedFolders.filter(
              (f) => f !== folder && !f.startsWith(folder + "/"),
            );
            await savUrlsToStorage();
            refreshFolderList();
            showFeedback(`フォルダ "${folder}" を削除しました`, "success");
          }
        };
        folderItem.appendChild(deleteBtn);

        // 上へ移動ボタン
        const upBtn = document.createElement("button");
        upBtn.textContent = "↑";
        upBtn.title = "上へ";

        // savedFolders内の実際のindexを取得
        const savedFolderIndex = savedFolders.indexOf(folder);
        const canMoveUp = savedFolderIndex > 0;

        upBtn.disabled = !canMoveUp;
        upBtn.style.cssText = canMoveUp
          ? "padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
          : "padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: not-allowed; font-size: 12px; opacity: 0.3;";
        upBtn.onclick = async (e) => {
          e.stopPropagation();
          const currentIndex = savedFolders.indexOf(folder);
          if (currentIndex > 0) {
            // savedFolders配列内で順序を入れ替え
            const temp = savedFolders[currentIndex];
            savedFolders[currentIndex] = savedFolders[currentIndex - 1];
            savedFolders[currentIndex - 1] = temp;
            await savUrlsToStorage();
            refreshFolderList();
            showFeedback(`フォルダを上に移動しました`, "success");
          }
        };
        folderItem.appendChild(upBtn);

        // 下へ移動ボタン
        const downBtn = document.createElement("button");
        downBtn.textContent = "↓";
        downBtn.title = "下へ";

        const canMoveDown =
          savedFolderIndex >= 0 && savedFolderIndex < savedFolders.length - 1;

        downBtn.disabled = !canMoveDown;
        downBtn.style.cssText = canMoveDown
          ? "padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
          : "padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: not-allowed; font-size: 12px; opacity: 0.3;";
        downBtn.onclick = async (e) => {
          e.stopPropagation();
          const currentIndex = savedFolders.indexOf(folder);
          if (currentIndex >= 0 && currentIndex < savedFolders.length - 1) {
            // savedFolders配列内で順序を入れ替え
            const temp = savedFolders[currentIndex];
            savedFolders[currentIndex] = savedFolders[currentIndex + 1];
            savedFolders[currentIndex + 1] = temp;
            await savUrlsToStorage();
            refreshFolderList();
            showFeedback(`フォルダを下に移動しました`, "success");
          }
        };
        folderItem.appendChild(downBtn);

        existingFoldersListDiv.appendChild(folderItem);
      });
    }

    // 初回描画
    refreshFolderList();

    // 完全なフォルダパスを取得
    function getFullFolderPath() {
      const parentFolder = parentFolderSelect.value;
      const newFolderName = folderNameInput.value.trim();

      if (!newFolderName) return "";

      if (parentFolder) {
        return `${parentFolder}/${newFolderName}`;
      } else {
        return newFolderName;
      }
    }

    // バリデーション関数
    function validateFolderName(name) {
      const folders = getAllFolders();

      if (!name || name.trim() === "") {
        return {
          valid: false,
          message: "フォルダ名を入力してください",
          type: "error",
        };
      }

      const trimmedName = name.trim();

      // スラッシュを禁止
      if (trimmedName.includes("/")) {
        return {
          valid: false,
          message: "フォルダ名に「/」は使用できません",
          type: "error",
        };
      }

      // 禁止文字チェック
      const invalidChars = /[<>:"|?*\\]/;
      if (invalidChars.test(trimmedName)) {
        return {
          valid: false,
          message: '使用できない文字が含まれています: < > : " | ? * \\',
          type: "error",
        };
      }

      // 完全なパスで重複チェック
      const fullPath = getFullFolderPath();
      if (folders.includes(fullPath)) {
        return {
          valid: false,
          message: "このフォルダは既に存在します",
          type: "error",
        };
      }

      return {
        valid: true,
        message: "このフォルダ名は使用できます",
        type: "success",
      };
    }

    // プレビュー更新関数
    function updatePreview() {
      const fullPath = getFullFolderPath();

      if (!fullPath) {
        folderPreview.style.display = "none";
        return;
      }

      const parts = fullPath.split("/");
      const previewHtml = parts.map((part) => `📁 ${part}`).join(" → ");
      folderPreviewContent.innerHTML = previewHtml;
      folderPreview.style.display = "block";
    }

    // 入力・選択変更時のバリデーション
    function handleChange() {
      const name = folderNameInput.value;
      updatePreview();

      if (name.trim() === "") {
        folderValidation.style.display = "none";
        confirmBtn.disabled = true;
        folderNameInput.style.borderColor = "#ddd";
        return;
      }

      const validation = validateFolderName(name);
      folderValidation.style.display = "block";
      folderValidation.querySelector("div").textContent = validation.message;

      if (validation.type === "success") {
        folderValidation.style.background = "#d4edda";
        folderValidation.style.borderLeft = "4px solid #28a745";
        folderValidation.querySelector("div").style.color = "#155724";
        folderNameInput.style.borderColor = "#28a745";
        confirmBtn.disabled = false;
      } else {
        folderValidation.style.background = "#f8d7da";
        folderValidation.style.borderLeft = "4px solid #dc3545";
        folderValidation.querySelector("div").style.color = "#721c24";
        folderNameInput.style.borderColor = "#dc3545";
        confirmBtn.disabled = true;
      }
    }

    folderNameInput.addEventListener("input", handleChange);
    parentFolderSelect.addEventListener("change", handleChange);

    // ダイアログ初期化
    parentFolderSelect.value = "";
    folderNameInput.value = "";
    folderValidation.style.display = "none";
    folderPreview.style.display = "none";
    confirmBtn.disabled = true;
    folderNameInput.style.borderColor = "#ddd";
    dialog.style.display = "block";
    folderNameInput.focus();

    // 作成ボタン
    const confirmHandler = async () => {
      const folderName = folderNameInput.value.trim();
      const validation = validateFolderName(folderName);

      if (validation.valid) {
        const fullPath = getFullFolderPath();

        // savedFoldersに追加
        if (!savedFolders.includes(fullPath)) {
          savedFolders.push(fullPath);
          await savUrlsToStorage();
        }

        // フォーム初期化とリスト更新
        folderNameInput.value = "";
        parentFolderSelect.value = "";
        folderValidation.style.display = "none";
        folderPreview.style.display = "none";
        confirmBtn.disabled = true;
        folderNameInput.style.borderColor = "#ddd";

        refreshFolderList();
        showFeedback(`フォルダ "${fullPath}" を作成しました`, "success");
      }
    };

    // キャンセルボタン
    const cancelHandler = () => {
      folderNameInput.value = "";
      parentFolderSelect.value = "";
      folderValidation.style.display = "none";
      folderPreview.style.display = "none";
      confirmBtn.disabled = true;
      folderNameInput.style.borderColor = "#ddd";
    };

    // 閉じるボタン
    const closeHandler = () => {
      cleanup();
      resolve(null);
    };

    // Enterキーで確定
    const keyHandler = (e) => {
      if (e.key === "Enter" && !confirmBtn.disabled) {
        confirmHandler();
      } else if (e.key === "Escape") {
        closeHandler();
      }
    };

    // イベントリスナー登録
    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
    closeBtn.addEventListener("click", closeHandler);
    folderNameInput.addEventListener("keydown", keyHandler);

    // クリーンアップ関数
    function cleanup() {
      dialog.style.display = "none";
      confirmBtn.removeEventListener("click", confirmHandler);
      cancelBtn.removeEventListener("click", cancelHandler);
      closeBtn.removeEventListener("click", closeHandler);
      folderNameInput.removeEventListener("keydown", keyHandler);
    }
  });
}

// 互換性のための旧関数名エイリアス（後で削除予定）
function showCreateFolderDialog() {
  return showFolderManagementDialog();
}

// URL移動先フォルダ選択ダイアログを表示
function showMoveFolderDialog(urlTitle, currentFolder) {
  return new Promise((resolve) => {
    // ダイアログを動的に作成
    const dialog = document.createElement("div");
    dialog.style.cssText = `
      display: block;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 8px 16px rgba(0,0,0,0.15), 0 0 0 9999px rgba(0,0,0,0.5);
      z-index: 10001;
      min-width: 450px;
      max-width: 600px;
    `;

    const folders = getAllFolders();

    dialog.innerHTML = `
      <h3 style="margin-top: 0; color: #333; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 24px;">📁</span>
        URLを移動
      </h3>

      <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
        <div style="font-size: 14px; font-weight: 600; color: #333; margin-bottom: 4px;">${urlTitle}</div>
        <div style="font-size: 12px; color: #666;">
          現在のフォルダ: ${currentFolder ? `📁 ${currentFolder}` : "📁 ルートフォルダ"}
        </div>
      </div>

      <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600;">移動先のフォルダを選択:</label>
      <select id="targetFolderSelect" style="width: 100%; padding: 12px; margin-bottom: 20px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; background: white;">
        <option value="">📁 ルートフォルダ</option>
      </select>

      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="confirmMoveFolderBtn" class="btn btn-primary" style="padding: 10px 20px; background: #ffc107; color: #333; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          移動
        </button>
        <button id="cancelMoveFolderBtn" class="btn btn-secondary" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">
          キャンセル
        </button>
      </div>
    `;

    document.body.appendChild(dialog);

    const targetFolderSelect = document.getElementById("targetFolderSelect");
    const confirmBtn = document.getElementById("confirmMoveFolderBtn");
    const cancelBtn = document.getElementById("cancelMoveFolderBtn");

    // フォルダドロップダウンを構築
    folders.forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder;
      const indent = "　".repeat(folder.split("/").length - 1);
      option.textContent = `${indent}📁 ${folder}`;
      targetFolderSelect.appendChild(option);
    });

    // 現在のフォルダを選択
    targetFolderSelect.value = currentFolder || "";

    // 確定ボタン
    confirmBtn.onclick = () => {
      const selectedFolder = targetFolderSelect.value;
      document.body.removeChild(dialog);
      resolve(selectedFolder);
    };

    // キャンセルボタン
    cancelBtn.onclick = () => {
      document.body.removeChild(dialog);
      resolve(null);
    };

    // Escキーでキャンセル
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.body.removeChild(dialog);
        resolve(null);
      }
    });

    // Enterキーで確定
    targetFolderSelect.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        confirmBtn.click();
      }
    });

    targetFolderSelect.focus();
  });
}

// フォルダ管理メニューを表示
async function showFolderManageMenu(folderName, x, y, targetInput) {
  // 既存のメニューがあれば削除
  const existingMenu = document.getElementById("folderManageMenu");
  if (existingMenu) {
    document.body.removeChild(existingMenu);
  }

  const menu = document.createElement("div");
  menu.id = "folderManageMenu";
  menu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    z-index: 10001;
    min-width: 150px;
  `;

  const renameBtn = document.createElement("div");
  renameBtn.textContent = "📝 リネーム";
  renameBtn.style.cssText = `
    padding: 10px 15px;
    cursor: pointer;
    border-bottom: 1px solid #eee;
  `;
  renameBtn.addEventListener("mouseenter", () => {
    renameBtn.style.background = "#f5f5f5";
  });
  renameBtn.addEventListener("mouseleave", () => {
    renameBtn.style.background = "white";
  });
  renameBtn.addEventListener("click", async () => {
    document.body.removeChild(menu);
    const newName = prompt(
      `フォルダ名を変更:\n（階層フォルダの場合は「親/子」のように入力）`,
      folderName,
    );
    if (newName && newName.trim() !== "" && newName !== folderName) {
      const trimmedName = newName.trim();
      // フォルダ内のすべてのURLのfolderを更新
      Object.values(savedUrls).forEach((urlData) => {
        if (urlData.folder === folderName) {
          urlData.folder = trimmedName;
        }
      });

      // savedFoldersも更新
      const index = savedFolders.indexOf(folderName);
      if (index !== -1) {
        savedFolders[index] = trimmedName;
      }

      await savUrlsToStorage();
      await showOpenUrlDialog(targetInput);
      showFeedback(
        `フォルダ "${folderName}" を "${trimmedName}" にリネームしました`,
        "success",
      );
    }
  });

  const deleteBtn = document.createElement("div");
  deleteBtn.textContent = "🗑️ 削除";
  deleteBtn.style.cssText = `
    padding: 10px 15px;
    cursor: pointer;
    color: #dc3545;
  `;
  deleteBtn.addEventListener("mouseenter", () => {
    deleteBtn.style.background = "#f5f5f5";
  });
  deleteBtn.addEventListener("mouseleave", () => {
    deleteBtn.style.background = "white";
  });
  deleteBtn.addEventListener("click", async () => {
    document.body.removeChild(menu);
    if (
      confirm(
        `フォルダ "${folderName}" を削除しますか？\n（フォルダ内のURLはルートフォルダに移動されます）`,
      )
    ) {
      // フォルダ内のすべてのURLをルートフォルダに移動
      Object.values(savedUrls).forEach((urlData) => {
        if (urlData.folder === folderName) {
          urlData.folder = "";
        }
      });

      // savedFoldersからも削除
      const index = savedFolders.indexOf(folderName);
      if (index !== -1) {
        savedFolders.splice(index, 1);
      }

      await savUrlsToStorage();
      await showOpenUrlDialog(targetInput);
      showFeedback(`フォルダ "${folderName}" を削除しました`, "success");
    }
  });

  menu.appendChild(renameBtn);
  menu.appendChild(deleteBtn);
  document.body.appendChild(menu);

  // メニュー外クリックで閉じる
  setTimeout(() => {
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        document.body.removeChild(menu);
        document.removeEventListener("click", closeMenu);
      }
    };
    document.addEventListener("click", closeMenu);
  }, 0);
}

// 保存済みURL選択ダイアログを表示
async function showOpenUrlDialog(targetInput) {
  await loadSavedUrls();

  // 保存済みURLリストを表示
  savedUrlsList.innerHTML = "";

  if (Object.keys(savedUrls).length === 0) {
    savedUrlsList.innerHTML = "<p>保存済みURLがありません</p>";
  } else {
    // 選択されたURLを保持する変数
    let selectedUrl = null;
    let selectedTitle = null;

    // URLをフォルダごとにグループ化
    const urlsByFolder = {};
    Object.entries(savedUrls).forEach(([title, value]) => {
      const urlData =
        typeof value === "string"
          ? { url: value, tags: [], favorite: false, memo: "", folder: "" }
          : value;
      const folder = urlData.folder || "";

      if (!urlsByFolder[folder]) {
        urlsByFolder[folder] = [];
      }
      urlsByFolder[folder].push([title, value]);
    });

    // フォルダをソート（ルートを最初に、その後アルファベット順）
    const sortedFolders = Object.keys(urlsByFolder).sort((a, b) => {
      if (a === "") return -1; // ルートフォルダを最初に
      if (b === "") return 1;
      return a.localeCompare(b);
    });

    // 各フォルダごとに表示
    sortedFolders.forEach((folder) => {
      const urlsInFolder = urlsByFolder[folder];

      // フォルダ内のURLをソート（カスタム順序→お気に入りを上に、その後タイトル順）
      const sortedUrls = urlsInFolder.sort(
        ([titleA, valueA], [titleB, valueB]) => {
          const dataA =
            typeof valueA === "string"
              ? { favorite: false, order: undefined }
              : valueA;
          const dataB =
            typeof valueB === "string"
              ? { favorite: false, order: undefined }
              : valueB;

          const orderA = dataA.order;
          const orderB = dataB.order;
          const favA = dataA.favorite || false;
          const favB = dataB.favorite || false;

          // カスタム順序が設定されている場合は優先
          if (orderA !== undefined && orderB !== undefined) {
            return orderA - orderB;
          }
          if (orderA !== undefined) return -1;
          if (orderB !== undefined) return 1;

          // お気に入りを優先
          if (favA && !favB) return -1;
          if (!favA && favB) return 1;

          // お気に入り状態が同じ場合はタイトル順
          return titleA.localeCompare(titleB);
        },
      );

      // フォルダヘッダーを作成
      const folderHeader = document.createElement("div");
      folderHeader.style.cssText = `
        background: #f0f0f0;
        padding: 8px 12px;
        margin-bottom: 5px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: bold;
        user-select: none;
      `;

      const folderIcon = document.createElement("span");
      folderIcon.textContent = "📂";
      folderIcon.style.fontSize = "16px";

      const folderName = document.createElement("span");
      folderName.textContent = folder === "" ? "ルートフォルダ" : folder;
      folderName.style.flex = "1";

      const folderCount = document.createElement("span");
      folderCount.textContent = `(${sortedUrls.length})`;
      folderCount.style.cssText = "color: #666; font-size: 12px;";

      const toggleIcon = document.createElement("span");
      toggleIcon.textContent = "▼";
      toggleIcon.style.fontSize = "12px";

      // フォルダ管理ボタン（ルートフォルダ以外）
      const manageBtn = document.createElement("button");
      if (folder !== "") {
        manageBtn.textContent = "⚙️";
        manageBtn.style.cssText = `
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          opacity: 0.7;
        `;
        manageBtn.title = "フォルダ管理";
        manageBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showFolderManageMenu(folder, e.clientX, e.clientY, targetInput);
        });
      }

      folderHeader.appendChild(folderIcon);
      folderHeader.appendChild(folderName);
      folderHeader.appendChild(folderCount);
      if (folder !== "") {
        folderHeader.appendChild(manageBtn);
      }
      folderHeader.appendChild(toggleIcon);

      // フォルダコンテンツ（URL一覧）
      const folderContent = document.createElement("div");
      folderContent.style.cssText = "margin-bottom: 15px;";

      // フォルダの折りたたみ機能
      let isExpanded = true;
      folderHeader.addEventListener("click", () => {
        isExpanded = !isExpanded;
        folderContent.style.display = isExpanded ? "block" : "none";
        toggleIcon.textContent = isExpanded ? "▼" : "▶";
      });

      savedUrlsList.appendChild(folderHeader);
      savedUrlsList.appendChild(folderContent);

      // フォルダ内の各URLを表示
      sortedUrls.forEach(([title, value], index) => {
        // v5形式とv4形式とv3形式とv1形式の両方に対応
        const urlData =
          typeof value === "string"
            ? { url: value, tags: [], favorite: false, memo: "", folder: "" }
            : value;
        const url = urlData.url;
        const tags = urlData.tags || [];
        const favorite = urlData.favorite || false;
        const memo = urlData.memo || "";
        const folder = urlData.folder || "";

        const item = document.createElement("div");
        item.style.cssText =
          "padding: 8px; border: 1px solid #ddd; margin-bottom: 5px; border-radius: 4px; display: flex; align-items: center; gap: 10px;";

        // ラジオボタン
        const radioBtn = document.createElement("input");
        radioBtn.type = "radio";
        radioBtn.name = "savedUrlSelection";
        radioBtn.value = url;
        radioBtn.style.cssText = "margin-right: 5px;";

        // スターボタン（お気に入り）
        const starBtn = document.createElement("button");
        starBtn.style.cssText =
          "background: none; border: none; cursor: pointer; font-size: 20px; padding: 0; line-height: 1;";
        starBtn.textContent = favorite ? "⭐" : "☆";
        starBtn.title = favorite ? "お気に入りから削除" : "お気に入りに追加";
        starBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          // お気に入り状態をトグル
          savedUrls[title].favorite = !savedUrls[title].favorite;
          await savUrlsToStorage();
          // リストを再表示
          await showOpenUrlDialog(targetInput);
          showFeedback(
            savedUrls[title].favorite
              ? `"${title}" をお気に入りに追加しました`
              : `"${title}" をお気に入りから削除しました`,
            "success",
          );
        });

        // メインコンテンツエリア
        const contentArea = document.createElement("div");
        contentArea.style.cssText = "flex: 1; cursor: pointer;";

        // タグを表示
        const tagsHtml =
          tags.length > 0
            ? `<div style="margin-top: 4px;">
             ${tags
               .map((tag) => {
                 const color = assignTagColor(tag);
                 return `<span style="display: inline-block; background: ${color.bg}; color: ${color.text}; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-right: 4px;">🏷️ ${tag}</span>`;
               })
               .join("")}
           </div>`
            : "";

        contentArea.innerHTML = `
        <strong>${title}</strong>
        ${tagsHtml}
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

        // タグ追加ボタン
        const tagBtn = document.createElement("button");
        tagBtn.style.cssText =
          "padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
        tagBtn.textContent = "🏷️ タグ";
        tagBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openUrlDialog.style.display = "none";
          showQuickTagDialog(title, tags, targetInput);
        });

        // 編集ボタン
        const editBtn = document.createElement("button");
        editBtn.style.cssText =
          "padding: 4px 8px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
        editBtn.textContent = "編集";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openUrlDialog.style.display = "none";
          showEditUrlDialog(
            title,
            url,
            tags,
            favorite,
            memo,
            folder,
            targetInput,
          );
        });

        // 削除ボタン
        const deleteBtn = document.createElement("button");
        deleteBtn.style.cssText =
          "padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
        deleteBtn.textContent = "削除";
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm(`"${title}" を削除してもよろしいですか？`)) {
            delete savedUrls[title];
            await savUrlsToStorage();
            await showOpenUrlDialog(targetInput); // リストを再表示
            showFeedback(`"${title}" を削除しました`, "success");
          }
        });

        // 上へ移動ボタン
        const moveUpBtn = document.createElement("button");
        moveUpBtn.style.cssText =
          "padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
        moveUpBtn.textContent = "↑";
        moveUpBtn.title = "上へ移動";
        moveUpBtn.disabled = index === 0; // 最初のアイテムは上に移動できない
        moveUpBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await moveUrlInFolder(folder, index, index - 1);
          await showOpenUrlDialog(targetInput);
          showFeedback(`"${title}" を上へ移動しました`, "success");
        });

        // 下へ移動ボタン
        const moveDownBtn = document.createElement("button");
        moveDownBtn.style.cssText =
          "padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;";
        moveDownBtn.textContent = "↓";
        moveDownBtn.title = "下へ移動";
        moveDownBtn.disabled = index === sortedUrls.length - 1; // 最後のアイテムは下に移動できない
        moveDownBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await moveUrlInFolder(folder, index, index + 1);
          await showOpenUrlDialog(targetInput);
          showFeedback(`"${title}" を下へ移動しました`, "success");
        });

        // フォルダ移動ボタン
        const moveFolderBtn = document.createElement("button");
        moveFolderBtn.style.cssText =
          "padding: 4px 8px; background: #ffc107; color: #333; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: 600;";
        moveFolderBtn.textContent = "📁 移動";
        moveFolderBtn.title = "別のフォルダに移動";
        moveFolderBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          // フォルダ選択ダイアログを表示
          const newFolder = await showMoveFolderDialog(title, folder);
          if (newFolder !== null && newFolder !== folder) {
            // URLのフォルダを変更
            savedUrls[title].folder = newFolder;
            await savUrlsToStorage();
            await showOpenUrlDialog(targetInput);
            const folderInfo = newFolder
              ? `フォルダ「${newFolder}」`
              : "ルートフォルダ";
            showFeedback(`"${title}" を${folderInfo}に移動しました`, "success");
          }
        });

        buttonContainer.appendChild(openUrlBtn);
        buttonContainer.appendChild(tagBtn);
        buttonContainer.appendChild(editBtn);
        buttonContainer.appendChild(moveFolderBtn);
        buttonContainer.appendChild(deleteBtn);
        buttonContainer.appendChild(moveUpBtn);
        buttonContainer.appendChild(moveDownBtn);

        item.appendChild(radioBtn);
        item.appendChild(starBtn);
        item.appendChild(contentArea);
        item.appendChild(buttonContainer);
        folderContent.appendChild(item);
      });
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

  // フォルダ作成ボタンのイベント
  const createFolderBtn = document.getElementById("createFolderFromListBtn");
  if (createFolderBtn) {
    createFolderBtn.onclick = async () => {
      const folderName = await showCreateFolderDialog();
      if (folderName) {
        // savedFoldersに追加（重複チェック）
        if (!savedFolders.includes(folderName)) {
          savedFolders.push(folderName);
          await savUrlsToStorage();
        }

        showFeedback(`フォルダ "${folderName}" を作成しました`, "success");
        // ダイアログを閉じて再度開いて更新
        openUrlDialog.style.display = "none";
        await showOpenUrlDialog(targetInput);
      }
    };
  }

  // エクスポートボタンのイベント
  const exportBtn = document.getElementById("exportUrlsBtn");
  if (exportBtn) {
    exportBtn.onclick = () => {
      exportUrlsToFile();
    };
  }

  // インポートボタンのイベント
  const importBtn = document.getElementById("importUrlsBtn");
  const importFileInput = document.getElementById("importFileInput");
  if (importBtn && importFileInput) {
    importBtn.onclick = () => {
      importFileInput.click();
    };

    importFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        importUrlsFromFile(file, targetInput);
        // ファイル選択をリセット
        e.target.value = "";
      }
    };
  }
}

// URLの順序を変更（フォルダ内）
async function moveUrlInFolder(folder, fromIndex, toIndex) {
  // フォルダ内のURLを取得
  const urlsInFolder = Object.entries(savedUrls).filter(([title, value]) => {
    const urlData = typeof value === "string" ? { folder: "" } : value;
    return (urlData.folder || "") === folder;
  });

  // ソート（カスタム順序→お気に入り→タイトル順）
  const sortedUrls = urlsInFolder.sort(([titleA, valueA], [titleB, valueB]) => {
    const dataA =
      typeof valueA === "string"
        ? { favorite: false, order: undefined }
        : valueA;
    const dataB =
      typeof valueB === "string"
        ? { favorite: false, order: undefined }
        : valueB;

    const orderA = dataA.order;
    const orderB = dataB.order;
    const favA = dataA.favorite || false;
    const favB = dataB.favorite || false;

    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }
    if (orderA !== undefined) return -1;
    if (orderB !== undefined) return 1;

    if (favA && !favB) return -1;
    if (!favA && favB) return 1;

    return titleA.localeCompare(titleB);
  });

  // order値が設定されていない場合は全アイテムに割り当て
  sortedUrls.forEach(([title, value], index) => {
    if (savedUrls[title].order === undefined) {
      savedUrls[title].order = index;
    }
  });

  // fromIndexとtoIndexのorder値を入れ替え
  const [titleFrom] = sortedUrls[fromIndex];
  const [titleTo] = sortedUrls[toIndex];

  const tempOrder = savedUrls[titleFrom].order;
  savedUrls[titleFrom].order = savedUrls[titleTo].order;
  savedUrls[titleTo].order = tempOrder;

  // 保存
  await savUrlsToStorage();
}

// エクスポート機能：URLデータをJSONファイルとしてダウンロード
function exportUrlsToFile() {
  try {
    const exportData = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      exportedFrom: "AutoAI URL Manager",
      urlCount: Object.keys(savedUrls).length,
      urls: savedUrls,
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `autoai-urls-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showFeedback(
      `${Object.keys(savedUrls).length}件のURLをエクスポートしました`,
      "success",
    );
    log.info(`✅ ${Object.keys(savedUrls).length}件のURLをエクスポート`);
  } catch (error) {
    log.error("エクスポートエラー:", error);
    showFeedback("エクスポートに失敗しました", "error");
  }
}

// インポート機能：JSONファイルからURLデータを読み込み
async function importUrlsFromFile(file, targetInput) {
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // データ検証
      if (!data.urls || typeof data.urls !== "object") {
        showFeedback("無効なファイル形式です", "error");
        return;
      }

      const importCount = Object.keys(data.urls).length;
      const currentCount = Object.keys(savedUrls).length;

      // マージか上書きか選択
      const message =
        currentCount > 0
          ? `${importCount}件のURLをインポートします。\n\n【OK】既存データに追加（マージ）\n【キャンセル】既存データを削除して上書き`
          : `${importCount}件のURLをインポートします。`;

      const shouldMerge = currentCount === 0 || confirm(message);

      if (shouldMerge) {
        // マージ（既存データに追加）
        let addedCount = 0;
        let updatedCount = 0;

        Object.entries(data.urls).forEach(([title, value]) => {
          if (savedUrls[title]) {
            updatedCount++;
          } else {
            addedCount++;
          }
          savedUrls[title] = value;
        });

        await savUrlsToStorage();
        await showOpenUrlDialog(targetInput);

        showFeedback(
          `インポート完了: ${addedCount}件追加、${updatedCount}件更新`,
          "success",
        );
        log.info(
          `✅ インポート完了: ${addedCount}件追加、${updatedCount}件更新`,
        );
      } else {
        // 上書き（既存データを削除）
        savedUrls = data.urls;
        await savUrlsToStorage();
        await showOpenUrlDialog(targetInput);

        showFeedback(`${importCount}件のURLで上書きしました`, "success");
        log.info(`✅ ${importCount}件のURLで上書き`);
      }
    } catch (error) {
      log.error("インポートエラー:", error);
      showFeedback("ファイルの読み込みに失敗しました", "error");
    }
  };

  reader.onerror = () => {
    log.error("ファイル読み込みエラー");
    showFeedback("ファイルの読み込みに失敗しました", "error");
  };

  reader.readAsText(file);
}

// ========================================
// Section 6: メイン処理ボタンのイベントリスナー
// ========================================

// STEP処理のみ実行ボタン
if (stepOnlyBtn) {
  stepOnlyBtn.addEventListener("click", async () => {
    log.debug("🎯 [STEP-ONLY] 実行開始");

    // 🔥 実行開始前に全キャッシュをクリア
    log.debug("🧹 [CACHE-CLEAR] 前回実行データのクリア開始");

    // globalStateのタスクグループ関連データをクリア
    if (window.globalState) {
      window.globalState.taskGroups = [];
      window.globalState.currentGroupIndex = 0;
      window.globalState.stats = {
        totalGroups: 0,
        completedGroups: 0,
        totalTasks: 0,
        successTasks: 0,
        failedTasks: 0,
      };
      log.debug("✅ [CACHE-CLEAR] globalStateをリセット");
    }

    // SpreadsheetDataManagerのキャッシュをクリア
    if (
      window.spreadsheetDataManager &&
      typeof window.spreadsheetDataManager.clearCache === "function"
    ) {
      window.spreadsheetDataManager.clearCache();
      log.debug("✅ [CACHE-CLEAR] SpreadsheetDataManagerキャッシュをクリア");
    }

    log.info(
      "✅ [CACHE-CLEAR] 全キャッシュクリア完了 - クリーンな状態で実行開始",
    );

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
      log.info(`📋 [STEP-ONLY] 📄 処理対象スプレッドシートURL: ${firstUrl}`);

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
document.addEventListener("DOMContentLoaded", async () => {
  log.debug("📋 [step0-ui-controller] 初期化開始");

  // 保存されたURLを読み込み
  await loadSavedUrls();

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

          // ドロップダウンを更新
          updateTestConfigDropdowns();

          // UI表の更新を待機（AI情報がUI表に反映されるまで待つ）
          log.info("⏳ UI表の更新を待機中...");
          await waitForAIDataComplete();

          // スプレッドシートへ自動保存
          await saveAIDataToSpreadsheet();
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
    const tbody = document.getElementById("ai-integrated-tbody");
    if (!tbody) {
      log.error("AI統合表のtbodyが見つかりません");
      return;
    }

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
    }

    // 機能情報を更新（詳細情報付き）
    if (data.functionsWithDetails && cells[functionCellIndex]) {
      try {
        const functionList = data.functionsWithDetails
          .map((func) => {
            // オブジェクトが文字列として送信されている場合の対応
            if (typeof func === "string") {
              return `${func}`;
            }

            // 正常なオブジェクトの場合の処理
            if (typeof func === "object" && func !== null) {
              const funcName = func.name || func.functionName || "Unknown";

              let status = "";

              // トグル状態を表示
              if (func.isToggleable) {
                status += func.isToggled ? " 🟢" : " 🔴";
              }

              // セレクタ状態を表示
              if (func.secretStatus) {
                status += ` [${func.secretStatus}]`;
              }

              // 有効/無効状態を表示（見やすくするため）
              const enabledIcon = func.isEnabled ? "" : " (無効)";

              return `${funcName}${status}${enabledIcon}`;
            }

            // 予期しない形式の場合は型情報と共に表示
            return `Unknown (${typeof func})`;
          })
          .filter((item) => item && item.trim() !== "") // 空の項目を除外
          .join("<br>");

        cells[functionCellIndex].innerHTML =
          functionList || '<span style="color: #999;">未検出</span>';
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
      const functionList = data.functions
        .map((func) => {
          // オブジェクトの場合は名前を抽出
          if (typeof func === "object" && func !== null) {
            const funcName = func.name || func.functionName || "Unknown";

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

            return `${funcName}${status}${enabledIcon}`;
          }

          // 文字列の場合はそのまま使用
          if (typeof func === "string") {
            return func;
          }

          // その他の場合
          return `Unknown (${typeof func})`;
        })
        .filter((item) => item && item.trim() !== "") // 空の項目を除外
        .join("<br>");

      cells[functionCellIndex].innerHTML =
        functionList || '<span style="color: #999;">未検出</span>';
    } else if (data.features && cells[functionCellIndex]) {
      // Gemini等でfeaturesとして送信された場合の処理
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

    const modelCount = data.models?.length || 0;
    const funcCount = (
      data.functionsWithDetails ||
      data.functions ||
      data.features ||
      []
    ).length;
    log.info(`✅ ${aiType}情報更新: ${modelCount}モデル, ${funcCount}機能`);
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
