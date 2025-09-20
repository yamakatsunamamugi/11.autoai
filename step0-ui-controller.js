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
  console.log("📊 [DEBUG] ページ読み込み完了時の状態:", {
    timestamp: new Date().toISOString(),
    loadedScripts: window.scriptLoadStatus,
    stepFunctions: {
      executeStep1: typeof window.executeStep1,
      executeStep2: typeof window.executeStep2,
      executeStep3: typeof window.executeStep3,
      executeStep4: typeof window.executeStep4,
      executeStep5: typeof window.executeStep5,
      executeStep6: typeof window.executeStep6,
    },
  });
});

// ========================================
// Section 2: ウィンドウサービス機能 (旧 ui-window-loader.js)
// ========================================

console.log("🔧 [step0-ui-controller] WindowService読み込み開始...");

// WindowServiceの簡易実装（外部依存を避けるため）
window.WindowService = {
  async createWindow(options) {
    try {
      return await chrome.windows.create(options);
    } catch (error) {
      console.error("WindowService.createWindow エラー:", error);
      throw error;
    }
  },

  async updateWindow(windowId, updateInfo) {
    try {
      return await chrome.windows.update(windowId, updateInfo);
    } catch (error) {
      console.error("WindowService.updateWindow エラー:", error);
      throw error;
    }
  },

  async closeWindow(windowId) {
    try {
      return await chrome.windows.remove(windowId);
    } catch (error) {
      console.error("WindowService.closeWindow エラー:", error);
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

// ウィンドウを最前面に表示する共通関数
async function bringWindowToFront() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.windows.update(currentWindow.id, {
      focused: true,
      drawAttention: true,
      state: "normal",
    });
  } catch (error) {
    console.error("[bringWindowToFront] ウィンドウ最前面表示エラー:", error);
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
