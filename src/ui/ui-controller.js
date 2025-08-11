// window.js - AutoAI Minimal コントロールパネル
//
// このファイルは、Chrome拡張機能のメインUIを管理します。
// ユーザーがスプレッドシートを設定し、AI処理を制御するためのインターフェースを提供します。

// ===== DOM要素の取得 =====
const urlInputsContainer = document.getElementById("urlInputs");
const addUrlBtn = document.getElementById("addUrlBtn");
const loadSheetsBtn = document.getElementById("loadSheetsBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const deleteAnswersBtn = document.getElementById("deleteAnswersBtn");
const startIntegratedTestBtn = document.getElementById(
  "startIntegratedTestBtn",
);
const statusDiv = document.getElementById("status");
const loadFeedback = document.getElementById("loadFeedback");

// 列状況カード関連の要素
const columnStatusCard = document.getElementById("columnStatusCard");
const columnStatusMessage = document.getElementById("columnStatusMessage");
const columnStatusActions = document.getElementById("columnStatusActions");
const undoColumnsBtn = document.getElementById("undoColumnsBtn");

// ===== ステータス管理 =====
/**
 * ステータス表示を更新する
 * @param {string} text - 表示するテキスト
 * @param {string} type - ステータスタイプ (waiting, loading, running, error, success)
 */
function updateStatus(text, type = "waiting") {
  const statusText = statusDiv.querySelector(".status-text");
  const statusIcon = statusDiv.querySelector(".status-icon");

  statusText.textContent = text;
  statusDiv.className = `status ${type}`;

  // 各ステータスに対応するアイコン
  const icons = {
    waiting: "⏸", // 待機中
    loading: "⏳", // 読み込み中
    running: "▶", // 実行中
    error: "⚠", // エラー
    success: "✓", // 成功
  };
  statusIcon.textContent = icons[type] || icons.waiting;
}

/**
 * フィードバックメッセージを表示する
 * @param {string} message - 表示するメッセージ
 * @param {string} type - メッセージタイプ (success, error, loading)
 */
function showFeedback(message, type = "success") {
  // 既存のクラスをクリア
  loadFeedback.className = "feedback-message";

  // メッセージとタイプを設定
  loadFeedback.textContent = message;
  loadFeedback.classList.add(type);

  // アニメーションで表示
  setTimeout(() => {
    loadFeedback.classList.add("show");
  }, 10);

  // 自動非表示を無効化（メッセージはずっと表示）
  // if (type !== "loading") {
  //   setTimeout(() => {
  //     loadFeedback.classList.remove("show");
  //   }, 5000);
  // }
}

/**
 * 列状況カードを表示・更新する
 * @param {Object} columnStatus - 列の状況情報
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} spreadsheetUrl - スプレッドシートURL
 */
function showColumnStatusCard(columnStatus, spreadsheetId, spreadsheetUrl) {
  if (!columnStatus || !columnStatus.checked) {
    columnStatusCard.style.display = "none";
    return;
  }

  // カードのクラスを設定
  columnStatusCard.className = "column-status-card";
  if (columnStatus.hasAdditions) {
    columnStatusCard.classList.add("has-additions");
  }
  if (columnStatus.error) {
    columnStatusCard.classList.add("has-error");
  }

  // メッセージを設定
  if (columnStatus.error) {
    columnStatusMessage.textContent = `列チェックエラー: ${columnStatus.error}`;
  } else {
    columnStatusMessage.textContent = columnStatus.message;
  }

  // アクションボタンの表示制御
  if (columnStatus.hasAdditions && !columnStatus.error) {
    columnStatusActions.style.display = "block";

    // 戻すボタンにデータを設定
    undoColumnsBtn.dataset.spreadsheetId = spreadsheetId;
    undoColumnsBtn.dataset.spreadsheetUrl = spreadsheetUrl;
  } else {
    columnStatusActions.style.display = "none";
  }

  // カードを表示
  columnStatusCard.style.display = "block";
}

/**
 * 列状況カードを非表示にする
 */
function hideColumnStatusCard() {
  columnStatusCard.style.display = "none";
}

// ===== URL入力欄管理 =====
/**
 * 削除ボタンの表示/非表示を制御
 * URL入力欄が1つの場合は削除ボタンを非表示にする
 */
function updateRemoveButtons() {
  const groups = urlInputsContainer.querySelectorAll(".url-input-group");
  groups.forEach((group, index) => {
    const removeBtn = group.querySelector(".btn-remove");
    // 入力欄が2つ以上ある場合のみ削除ボタンを表示
    if (groups.length > 1) {
      removeBtn.style.display = "block";
    } else {
      removeBtn.style.display = "none";
    }
  });
}

/**
 * URL入力欄を動的に追加
 * @param {string} value - 初期値（省略可能）
 */
function addUrlInput(value = "") {
  // 入力欄グループを作成
  const group = document.createElement("div");
  group.className = "url-input-group";

  // URL入力欄を作成
  const input = document.createElement("input");
  input.type = "url";
  input.className = "url-input";
  input.placeholder = "https://docs.google.com/spreadsheets/d/...";
  input.value = value;

  // 削除ボタンを作成
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "×";
  removeBtn.onclick = () => {
    group.remove();
    updateRemoveButtons();
    saveUrls(); // 削除時に自動保存
  };

  // 要素を組み立てて追加
  group.appendChild(input);
  group.appendChild(removeBtn);
  urlInputsContainer.appendChild(group);

  updateRemoveButtons();
}

/**
 * 入力されたURLをローカルストレージに保存
 * 空の値は除外して保存する
 */
function saveUrls() {
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);
  localStorage.setItem("spreadsheetUrls", JSON.stringify(urls));
}

// ===== イベントリスナー: URL入力欄追加 =====
addUrlBtn.addEventListener("click", () => {
  addUrlInput();
});

// ===== イベントリスナー: スプレッドシート読み込み =====
loadSheetsBtn.addEventListener("click", async () => {
  // 入力されたURLを収集（空欄は除外）
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  // バリデーション：URLが入力されているか確認
  if (urls.length === 0) {
    updateStatus("URLを入力してください", "error");
    return;
  }

  // ボタンを無効化
  loadSheetsBtn.disabled = true;

  updateStatus("スプレッドシートを読み込み中...", "loading");
  showFeedback("読み込み中...", "loading");

  try {
    // バックグラウンドスクリプトにURLを送信
    const response = await chrome.runtime.sendMessage({
      action: "loadSpreadsheets",
      urls: urls,
    });

    if (response && response.success) {
      const message =
        "スプレッドシートを読み込み、タスクリストを作成しました。";
      updateStatus(message, "success");
      showFeedback(message, "success");
      saveUrls(); // 成功時にURLを保存

      // 列状況カードを表示
      if (response.columnStatus) {
        const spreadsheetUrl = urls[0];
        const match = spreadsheetUrl.match(
          /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
        );
        const spreadsheetId = match ? match[1] : null;
        showColumnStatusCard(
          response.columnStatus,
          spreadsheetId,
          spreadsheetUrl,
        );
      }

      // ボタンのテキストを変更して有効化
      loadSheetsBtn.innerHTML = '<span class="btn-icon">✓</span>再読み込み';
      loadSheetsBtn.disabled = false;
    } else {
      const errorMessage =
        "読み込みエラー: " + (response?.error || "不明なエラー");
      updateStatus(errorMessage, "error");
      showFeedback(errorMessage, "error");
      // エラー時もボタンを有効化
      loadSheetsBtn.disabled = false;
    }
  } catch (error) {
    console.error("スプレッドシート読み込みエラー:", error);
    updateStatus("読み込みエラー", "error");
    showFeedback("読み込みエラーが発生しました", "error");
    // エラー時もボタンを有効化
    loadSheetsBtn.disabled = false;
  }
});

// ===== イベントリスナー: ストリーミング処理開始 =====
startBtn.addEventListener("click", async () => {
  console.log("ストリーミング処理開始ボタンが押されました。");

  // 入力されたURLを収集（空欄は除外）
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  // バリデーション：URLが入力されているか確認
  if (urls.length === 0) {
    updateStatus("スプレッドシートURLを入力してください", "error");
    return;
  }

  updateStatus("🌊 並列ストリーミング処理を開始しています...", "loading");

  // ボタンの状態を更新
  startBtn.disabled = true;
  stopBtn.disabled = false;

  try {
    // 最初のURLから情報を抽出
    const spreadsheetUrl = urls[0];
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    // gidを抽出
    const gidMatch = spreadsheetUrl.match(/[#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    // まずスプレッドシートを読み込んでタスクを生成
    const loadResponse = await chrome.runtime.sendMessage({
      action: "loadSpreadsheet",
      url: spreadsheetUrl,
    });

    console.log("[UI] loadSpreadsheet レスポンス:", loadResponse);

    if (!loadResponse || !loadResponse.success) {
      throw new Error(loadResponse?.error || "スプレッドシート読み込みエラー");
    }

    // タスクQueueから保存されたタスクを取得して処理
    const taskQueue = new (await import("../features/task/queue.js")).default();
    const savedTasks = await taskQueue.loadTaskList();

    console.log("[UI] 保存されたタスク:", savedTasks);
    console.log("[UI] タスク数:", savedTasks?.tasks?.length || 0);
    console.log("[UI] AI列数:", loadResponse?.aiColumns?.length || 0);

    if (!savedTasks || !savedTasks.tasks || savedTasks.tasks.length === 0) {
      console.error(
        "[UI] タスクが見つかりません。AI列情報:",
        loadResponse?.aiColumns,
      );
      throw new Error("実行可能なタスクがありません");
    }

    // タスクが生成されたら、ストリーミング処理を開始
    const response = await chrome.runtime.sendMessage({
      action: "streamProcessTasks",
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: spreadsheetUrl,
      gid: gid,
      tasks: savedTasks.tasks,
      columnMapping: loadResponse.columnMapping || {},
      testMode: false,
    });

    if (response && response.success) {
      updateStatus("🌊 並列ストリーミング処理実行中", "running");
      showFeedback(
        `ストリーミング処理開始: ${response.totalWindows || 4}個のウィンドウで並列処理中`,
        "success",
      );
    } else {
      updateStatus(
        "ストリーミング開始エラー: " + (response?.error || "不明なエラー"),
        "error",
      );
      // エラー時はボタンを元に戻す
      startBtn.disabled = false;
      stopBtn.disabled = true;
      showFeedback("ストリーミング処理の開始に失敗しました", "error");
    }
  } catch (error) {
    console.error("ストリーミング処理開始エラー:", error);
    updateStatus("ストリーミング開始エラー", "error");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showFeedback("ストリーミング処理でエラーが発生しました", "error");
  }
});

// ===== イベントリスナー: ストリーミング処理停止 =====
stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  updateStatus("ストリーミング処理を停止中...", "loading");

  try {
    // バックグラウンドスクリプトにストリーミング処理停止を通知
    const response = await chrome.runtime.sendMessage({
      action: "stopStreaming",
    });

    if (response && response.success) {
      updateStatus("ストリーミング処理を停止しました", "waiting");
      showFeedback("ストリーミング処理を停止しました", "success");
    } else {
      updateStatus(
        "停止エラー: " + (response?.error || "不明なエラー"),
        "error",
      );
      showFeedback("ストリーミング処理の停止に失敗しました", "error");
    }

    // ボタン状態をリセット
    startBtn.disabled = false;
  } catch (error) {
    console.error("ストリーミング処理停止エラー:", error);
    updateStatus("停止エラー", "error");
    showFeedback("ストリーミング処理の停止でエラーが発生しました", "error");
    // エラー時もボタンをリセット
    startBtn.disabled = false;
  }
});

// ===== イベントリスナー: ログクリア =====
clearLogBtn.addEventListener("click", async () => {
  // 確認ダイアログを表示
  if (!confirm("スプレッドシートのログをクリアしますか？")) {
    return;
  }

  // 現在のスプレッドシートURLを取得
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  if (urls.length === 0) {
    updateStatus("スプレッドシートURLが設定されていません", "error");
    return;
  }

  // ボタンを無効化
  clearLogBtn.disabled = true;
  updateStatus("ログをクリア中...", "loading");

  try {
    // 最初のURLから情報を抽出
    const spreadsheetUrl = urls[0];
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    const response = await chrome.runtime.sendMessage({
      action: "clearLog",
      spreadsheetId: spreadsheetId,
    });

    if (response && response.success) {
      const clearedCount = response.clearedCount || 0;
      updateStatus(`ログをクリアしました (${clearedCount}個のセル)`, "success");
      // 2秒後に通常状態に戻す
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      const errorMessage = response?.error || "不明なエラー";
      updateStatus(`ログクリアエラー: ${errorMessage}`, "error");
    }
  } catch (error) {
    console.error("ログクリアエラー:", error);
    updateStatus(`ログクリアエラー: ${error.message}`, "error");
  } finally {
    // ボタンを有効化
    clearLogBtn.disabled = false;
  }
});

// ===== イベントリスナー: 回答削除 =====
deleteAnswersBtn.addEventListener("click", async () => {
  // 確認ダイアログを表示
  if (!confirm("AI回答を削除しますか？")) {
    return;
  }

  // 現在のスプレッドシートURLを取得
  const inputs = urlInputsContainer.querySelectorAll(".url-input");
  const urls = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);

  if (urls.length === 0) {
    updateStatus("スプレッドシートURLが設定されていません", "error");
    return;
  }

  // ボタンを無効化
  deleteAnswersBtn.disabled = true;
  updateStatus("回答を削除中...", "loading");

  try {
    // 最初のURLから情報を抽出
    const spreadsheetUrl = urls[0];
    const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error("有効なスプレッドシートURLではありません");
    }
    const spreadsheetId = match[1];

    const response = await chrome.runtime.sendMessage({
      action: "deleteAnswers",
      spreadsheetId: spreadsheetId,
    });

    if (response && response.success) {
      const deletedCount = response.deletedCount || 0;
      if (deletedCount > 0) {
        updateStatus(`回答を削除しました (${deletedCount}個のセル)`, "success");
      } else {
        updateStatus(
          response.message || "削除対象の回答が見つかりませんでした",
          "success",
        );
      }
      // 2秒後に通常状態に戻す
      setTimeout(() => updateStatus("待機中", "waiting"), 2000);
    } else {
      const errorMessage = response?.error || "不明なエラー";
      updateStatus(`回答削除エラー: ${errorMessage}`, "error");
    }
  } catch (error) {
    console.error("回答削除エラー:", error);
    updateStatus(`回答削除エラー: ${error.message}`, "error");
  } finally {
    // ボタンを有効化
    deleteAnswersBtn.disabled = false;
  }
});

// ===== 統合AIテスト実行関数 =====
function runIntegratedAITest() {
  try {
    // 統合AIテストページを開く
    const testUrl = chrome.runtime.getURL(
      "tests/integration/test-ai-automation-integrated.html",
    );

    // ウィンドウ設定
    const windowFeatures = `
      width=1200,
      height=800,
      left=${(screen.width - 1200) / 2},
      top=${(screen.height - 800) / 2},
      scrollbars=yes,
      resizable=yes,
      status=no,
      toolbar=no,
      menubar=no,
      location=no
    `.replace(/\s+/g, "");

    // 新しいウィンドウでテストページを開く
    const testWindow = window.open(
      testUrl,
      `integrated_ai_test_${Date.now()}`,
      windowFeatures,
    );

    if (testWindow) {
      console.log("✅ 統合AIテストページが開かれました");
      updateStatus("統合AIテストページを開きました", "success");
    } else {
      console.error("❌ テストページを開けませんでした");
      updateStatus("テストページを開けませんでした", "error");
      alert("ポップアップブロッカーを無効にしてください");
    }
  } catch (error) {
    console.error("❌ 統合AIテスト実行エラー:", error);
    updateStatus("テスト実行エラー", "error");
    alert(`エラーが発生しました: ${error.message}`);
  }
}

// ===== イベントリスナー: 統合AIテスト開始 =====
startIntegratedTestBtn.addEventListener("click", () => {
  console.log("統合AIテスト開始ボタンが押されました");
  runIntegratedAITest();
});





// テスト実行関数（別ウィンドウ版）
