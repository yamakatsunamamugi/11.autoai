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
const openTestModalBtn = document.getElementById("openTestModalBtn");
const testModal = document.getElementById("testModal");
const closeTestModal = document.getElementById("closeTestModal");
const closeTestExecution = document.getElementById("closeTestExecution");
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
      "test-ai-automation-integrated.html",
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

// ===== イベントリスナー: テストモーダル =====
openTestModalBtn.addEventListener("click", () => {
  testModal.style.display = "block";
});

closeTestModal.addEventListener("click", () => {
  testModal.style.display = "none";
});

closeTestExecution.addEventListener("click", () => {
  const testExecutionArea = document.getElementById("testExecutionArea");
  const testFrame = document.getElementById("testFrame");
  testExecutionArea.style.display = "none";
  testFrame.src = ""; // IFrameを空にしてリソースを解放
  updateStatus("待機中", "waiting");
});

// ガイド閉じるボタンのイベントリスナー
document.getElementById("closeGuide").addEventListener("click", () => {
  const guideArea = document.getElementById("guideArea");
  guideArea.style.display = "none";
  updateStatus("待機中", "waiting");
});

// モーダル外クリックで閉じる
window.addEventListener("click", (event) => {
  if (event.target === testModal) {
    testModal.style.display = "none";
  }
});

// ESCキーでモーダルを閉じる
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && testModal.style.display === "block") {
    testModal.style.display = "none";
  }
});

// テストボタンのイベントリスナー
document.addEventListener("click", (event) => {
  if (event.target.classList.contains("test-btn")) {
    const testType = event.target.getAttribute("data-test");
    runTest(testType);
  } else if (event.target.classList.contains("guide-btn")) {
    const guideType = event.target.getAttribute("data-guide");
    showGuide(guideType);
  }
});

// テスト実行関数（別ウィンドウ版）
function runTest(testType) {
  const testUrls = {
    simple: "tests/test-simple-ai.html",
    responses: "tests/test-actual-ai-responses.html",
    integration: "tests/test-ai-integration-enhanced.html", // 新しい改良版
    "integration-old": "tests/test-ai-integration-real.html", // 旧版も保持
    content: "tests/test-content-script-integration.html",
    quick: "tests/test-simple-ai.html",
    spreadsheet: "test-spreadsheet-loading.html",
    "task-generation": "test-task-generation.html",
    streaming: "tests/test-real-streaming.html",
    enterprise: "tests/test-enterprise-streaming.html",
    "log-delete": "tests/test-log-clear-answer-delete.html",
    extension: "tests/test-extension.html",
    "ai-model": "tests/test-ai-model-behavior.html",
    "stream-processor": "tests/test-stream-processor.html",
    "integration-preview": "tests/test-integration-preview.html",
    comprehensive: "test-ai-automation-integrated.html",
    "special-models": "tests/test-o3-model.html",
    "deep-research": "tests/test-deep-research.html",
  };

  let testUrl = chrome.runtime.getURL(testUrls[testType] || testUrls.simple);

  // 統合テストの場合、チェックボックスの状態をURLパラメータとして追加
  if (testType === "comprehensive") {
    const enableSpecial =
      document.getElementById("enableSpecialModels")?.checked || false;
    const enableDeep =
      document.getElementById("enableDeepResearch")?.checked || false;
    const chatgptToolMode =
      document.getElementById("chatgptToolMode")?.value || "default";
    testUrl += `?special=${enableSpecial}&deep=${enableDeep}&chatgptTool=${chatgptToolMode}`;
  }

  // 別ウィンドウでテストページを開く
  const windowFeatures = `
    width=1400,
    height=900,
    left=${(screen.width - 1400) / 2},
    top=${(screen.height - 900) / 2},
    scrollbars=yes,
    resizable=yes,
    status=no,
    toolbar=no,
    menubar=no,
    location=no
  `.replace(/\s+/g, "");

  const testWindow = window.open(
    testUrl,
    `test_${testType}_${Date.now()}`,
    windowFeatures,
  );

  if (testWindow) {
    // ステータス更新
    updateStatus(
      `${getTestName(testType)}を別ウィンドウで実行中...`,
      "running",
    );
    showFeedback(
      `${getTestName(testType)}を新しいウィンドウで開きました`,
      "success",
    );

    // フォーカスを新しいウィンドウに移動
    testWindow.focus();

    // ウィンドウが閉じられたときの処理
    const checkClosed = setInterval(() => {
      if (testWindow.closed) {
        clearInterval(checkClosed);
        updateStatus("テスト完了", "success");
        setTimeout(() => updateStatus("待機中", "waiting"), 3000);
      }
    }, 1000);
  } else {
    // ポップアップがブロックされた場合
    updateStatus("ポップアップがブロックされました", "error");
    showFeedback(
      "ブラウザのポップアップブロックを無効にして再試行してください",
      "error",
    );
  }
}

// テスト名を取得
function getTestName(testType) {
  const testNames = {
    simple: "基本テスト",
    responses: "応答比較テスト",
    integration: "完全統合テスト",
    content: "コンテンツスクリプトテスト",
    quick: "クイックテスト",
    spreadsheet: "スプレッドシートテスト",
    "task-generation": "タスク生成テスト",
    streaming: "ストリーミングテスト",
    enterprise: "エンタープライズテスト",
    "log-delete": "ログ・削除テスト",
    extension: "拡張機能テスト",
    "ai-model": "AIモデル動作テスト",
    "stream-processor": "ストリームプロセッサテスト",
    "integration-preview": "統合プレビューテスト",
    comprehensive: "統合AIテスト",
    "special-models": "特殊モデルテスト",
    "deep-research": "DeepResearchテスト",
  };
  return testNames[testType] || "テスト";
}

// ガイド表示関数
function showGuide(guideType) {
  const guideArea = document.getElementById("guideArea");
  const guideContent = document.getElementById("guideContent");

  const guides = {
    "ai-operations": getAiOperationsGuide(),
  };

  guideContent.innerHTML = guides[guideType] || "ガイドが見つかりません";
  guideArea.style.display = "block";
  updateStatus("AI操作ガイドを表示中", "success");
}

// AI操作ガイドのHTML内容を生成
function getAiOperationsGuide() {
  return `
    <div class="guide-section">
      <h3>🤖 11.autoai の AI操作 - 初心者ガイド</h3>
      <p class="guide-intro">このガイドでは、11.autoaiがどのようにAI操作を行っているかを、初心者でもわかりやすく説明します。</p>
    </div>
    
    <div class="guide-section">
      <h4>📋 1. 基本的な処理の流れ</h4>
      <div class="guide-step">
        <div class="step-number">STEP 1</div>
        <div class="step-content">
          <h5>スプレッドシートの読み込み</h5>
          <p>Google スプレッドシートから質問や指示を読み込みます。拡張機能が自動でスプレッドシートにアクセスし、各行の内容を取得します。</p>
          <ul>
            <li>➤ スプレッドシートのURLを解析</li>
            <li>➤ 認証情報を使ってシートにアクセス</li>
            <li>➤ 各行のデータを順番に読み取り</li>
          </ul>
        </div>
      </div>
      
      <div class="guide-step">
        <div class="step-number">STEP 2</div>
        <div class="step-content">
          <h5>AIサイトへの移動</h5>
          <p>処理する質問に応じて、適切なAIサイト（ChatGPT、Claude、Gemini）を自動で開きます。</p>
          <ul>
            <li>➤ 新しいタブまたはウィンドウを開く</li>
            <li>➤ 指定されたAIサイトに移動</li>
            <li>➤ サイトの読み込み完了を待機</li>
          </ul>
        </div>
      </div>
      
      <div class="guide-step">
        <div class="step-number">STEP 3</div>
        <div class="step-content">
          <h5>質問の自動入力</h5>
          <p>読み込んだ質問をAIサイトの入力欄に自動で入力します。人間がキーボードで入力するのと同じ動作を自動化しています。</p>
          <ul>
            <li>➤ 入力欄を特定（テキストボックスを探す）</li>
            <li>➤ 質問テキストを1文字ずつ入力</li>
            <li>➤ 入力内容を確認</li>
          </ul>
        </div>
      </div>
      
      <div class="guide-step">
        <div class="step-number">STEP 4</div>
        <div class="step-content">
          <h5>送信ボタンのクリック</h5>
          <p>質問を送信するために、送信ボタンを自動でクリックします。各AIサイトの送信ボタンの位置を正確に特定します。</p>
          <ul>
            <li>➤ 送信ボタンを探す（「送信」「Send」等のボタン）</li>
            <li>➤ ボタンが押せる状態になるまで待機</li>
            <li>➤ ボタンを自動でクリック</li>
          </ul>
        </div>
      </div>
      
      <div class="guide-step">
        <div class="step-number">STEP 5</div>
        <div class="step-content">
          <h5>回答の監視・取得</h5>
          <p>AIが回答を生成している間、画面を監視して回答が完了したタイミングを検出します。</p>
          <ul>
            <li>➤ 回答エリアを継続的に監視</li>
            <li>➤ 回答生成中の状態を検出</li>
            <li>➤ 回答完了のサインを待機</li>
            <li>➤ 完成した回答テキストを取得</li>
          </ul>
        </div>
      </div>
      
      <div class="guide-step">
        <div class="step-number">STEP 6</div>
        <div class="step-content">
          <h5>結果の保存</h5>
          <p>取得した回答をスプレッドシートの指定した列に自動で書き込みます。</p>
          <ul>
            <li>➤ 回答テキストをコピー</li>
            <li>➤ スプレッドシートの該当セルを特定</li>
            <li>➤ 回答を自動で書き込み</li>
            <li>➤ 保存の完了を確認</li>
          </ul>
        </div>
      </div>
    </div>
    
    <div class="guide-section">
      <h4>🤖 2. 各AIサイトでの具体的な操作</h4>
      
      <div class="ai-guide">
        <h5>🔵 ChatGPT での操作</h5>
        <div class="operation-detail">
          <p><strong>入力方法：</strong></p>
          <ul>
            <li>📝 テキストエリア（textarea）に質問を入力</li>
            <li>⌨️ 「message」という名前のテキスト入力欄を使用</li>
            <li>🎯 プレースホルダー「Message ChatGPT」の欄を特定</li>
          </ul>
          
          <p><strong>送信方法：</strong></p>
          <ul>
            <li>🔘 右下の矢印ボタン（➤）をクリック</li>
            <li>⌨️ または Enter キーを押下</li>
            <li>🎯 「data-testid='send-button'」の要素を探す</li>
          </ul>
          
          <p><strong>回答の取得：</strong></p>
          <ul>
            <li>👁️ 回答エリア内のテキストを監視</li>
            <li>⏳ 「thinking...」表示の消失を待機</li>
            <li>✅ 「Stop generating」ボタンが消えたら完了と判定</li>
          </ul>
        </div>
      </div>
      
      <div class="ai-guide">
        <h5>🟡 Claude での操作</h5>
        <div class="operation-detail">
          <p><strong>入力方法：</strong></p>
          <ul>
            <li>📝 メインの入力エリア（contenteditable div）に入力</li>
            <li>🎯 「Tell Claude...」のプレースホルダーを持つ要素</li>
            <li>⌨️ 実際の文字入力をシミュレート</li>
          </ul>
          
          <p><strong>送信方法：</strong></p>
          <ul>
            <li>🔘 右下の送信ボタンをクリック</li>
            <li>⌨️ Ctrl+Enter のキーボードショートカット</li>
            <li>🎯 SVGアイコンを含む送信ボタンを特定</li>
          </ul>
          
          <p><strong>回答の取得：</strong></p>
          <ul>
            <li>👁️ 新しい会話ブロックの出現を監視</li>
            <li>⏳ 「Claude is thinking...」の消失を待機</li>
            <li>✅ 回答テキストの更新停止を検出</li>
          </ul>
        </div>
      </div>
      
      <div class="ai-guide">
        <h5>🔴 Gemini での操作</h5>
        <div class="operation-detail">
          <p><strong>入力方法：</strong></p>
          <ul>
            <li>📝 rich-textarea コンポーネントに入力</li>
            <li>🎯 「Enter a prompt here」のプレースホルダー</li>
            <li>⌨️ リッチテキスト形式での入力処理</li>
          </ul>
          
          <p><strong>送信方法：</strong></p>
          <ul>
            <li>🔘 円形の送信ボタンをクリック</li>
            <li>🎯 「Send message」のaria-labelを持つボタン</li>
            <li>⚡ ボタンのアクティブ状態を確認してクリック</li>
          </ul>
          
          <p><strong>回答の取得：</strong></p>
          <ul>
            <li>👁️ response-container 内のテキストを監視</li>
            <li>⏳ 点滅カーソルの消失を待機</li>
            <li>✅ 「思考中...」状態の終了を検出</li>
          </ul>
        </div>
      </div>
    </div>
    
    <div class="guide-section">
      <h4>⚡ 3. 特殊機能の説明</h4>
      
      <div class="special-feature">
        <h5>🔬 DeepResearch（ChatGPT）</h5>
        <p>通常のChatGPTよりも深く調査・分析する特別なモードです。</p>
        <ul>
          <li>🎯 「Research this topic」のような研究ボタンをクリック</li>
          <li>⏳ 長時間の処理（数分〜数十分）を許可</li>
          <li>📊 より詳細で包括的な回答を生成</li>
        </ul>
      </div>
      
      <div class="special-feature">
        <h5>🧠 o3 推論モード（ChatGPT）</h5>
        <p>複雑な論理的問題を段階的に解決する高度なモードです。</p>
        <ul>
          <li>🎯 o3モデルを選択（設定から変更）</li>
          <li>🧮 数学・論理・推論問題に特化</li>
          <li>📝 思考過程を段階的に表示</li>
        </ul>
      </div>
      
      <div class="special-feature">
        <h5>💻 Computer Use（Claude）</h5>
        <p>画面を見て操作できるClaudeの特別な機能です。</p>
        <ul>
          <li>📸 スクリーンショットを撮影・解析</li>
          <li>🖱️ マウスクリックやキーボード入力を実行</li>
          <li>👁️ 画面の変化を認識・対応</li>
        </ul>
      </div>
      
      <div class="special-feature">
        <h5>🤔 思考モード（Gemini）</h5>
        <p>Geminiが内部的な思考過程を表示しながら回答する機能です。</p>
        <ul>
          <li>🧠 思考プロセスの可視化</li>
          <li>📋 段階的な推論の表示</li>
          <li>✨ より透明性の高い回答生成</li>
        </ul>
      </div>
    </div>
    
    <div class="guide-section">
      <h4>🛠️ 4. エラー処理と対策</h4>
      
      <div class="error-handling">
        <h5>⚠️ よくあるエラーと対処法</h5>
        
        <div class="error-case">
          <h6>🔒 認証エラー</h6>
          <p><strong>症状：</strong> 「ログインが必要です」「認証に失敗しました」</p>
          <p><strong>対処：</strong></p>
          <ul>
            <li>✅ 各AIサイトに手動でログイン</li>
            <li>🔄 ブラウザのクッキーを確認</li>
            <li>🆔 ログイン状態を維持</li>
          </ul>
        </div>
        
        <div class="error-case">
          <h6>🌐 接続エラー</h6>
          <p><strong>症状：</strong> 「サイトに接続できません」「タイムアウト」</p>
          <p><strong>対処：</strong></p>
          <ul>
            <li>📶 インターネット接続を確認</li>
            <li>🚫 ポップアップブロッカーを無効化</li>
            <li>🔄 ページを再読み込み</li>
          </ul>
        </div>
        
        <div class="error-case">
          <h6>🎯 要素が見つからない</h6>
          <p><strong>症状：</strong> 「送信ボタンが見つかりません」</p>
          <p><strong>対処：</strong></p>
          <ul>
            <li>⏳ ページの完全な読み込みを待機</li>
            <li>🔄 拡張機能を再読み込み</li>
            <li>🆕 ブラウザを最新版に更新</li>
          </ul>
        </div>
      </div>
    </div>
    
    <div class="guide-section">
      <h4>💡 5. 使用のコツとベストプラクティス</h4>
      
      <div class="tips">
        <h5>📈 効率的な使用方法</h5>
        <ul>
          <li>🕐 <strong>時間配分：</strong> 複雑な質問は時間がかかることを想定</li>
          <li>📝 <strong>質問の書き方：</strong> 明確で具体的な指示を心がける</li>
          <li>⚡ <strong>並列処理：</strong> 複数のAIを同時に活用</li>
          <li>📊 <strong>結果の確認：</strong> 処理後は必ずスプレッドシートを確認</li>
        </ul>
        
        <h5>🚀 パフォーマンス向上のポイント</h5>
        <ul>
          <li>🎯 <strong>適切なAI選択：</strong> 質問の種類に応じてAIを使い分け</li>
          <li>💾 <strong>メモリ管理：</strong> 長時間の処理では定期的にブラウザを再起動</li>
          <li>🔄 <strong>エラー対策：</strong> 失敗した処理は個別に再実行</li>
          <li>📋 <strong>ログの活用：</strong> 処理ログで問題を特定・解決</li>
        </ul>
      </div>
    </div>
    
    <div class="guide-footer">
      <p>💡 <strong>ヒント：</strong> このガイドを参考に、実際の処理を確認しながら11.autoaiの動作を理解してください。</p>
      <p>🔧 <strong>サポート：</strong> 問題が発生した場合は、ログを確認して具体的なエラー内容を特定しましょう。</p>
    </div>
  `;
}

// ===== イベントリスナー: 入力変更時の自動保存 =====
urlInputsContainer.addEventListener("input", saveUrls);

// ===== 初期化処理 =====
/**
 * ページ読み込み時の初期化
 * - 保存されたURLの復元
 * - 現在の処理状態の確認
 */
document.addEventListener("DOMContentLoaded", async () => {
  // ローカルストレージから保存されたURLを復元
  const savedUrls = localStorage.getItem("spreadsheetUrls");
  if (savedUrls) {
    const urls = JSON.parse(savedUrls);
    if (urls.length > 0) {
      // デフォルトの入力欄をクリア
      urlInputsContainer.innerHTML = "";
      // 保存されたURLで入力欄を再作成
      urls.forEach((url) => addUrlInput(url));
    }
  }

  // バックグラウンドスクリプトから現在の処理状態を取得
  async function checkStatus() {
    try {
      // Service Workerの準備ができているか確認
      if (chrome.runtime?.id) {
        const response = await chrome.runtime.sendMessage({
          action: "getStatus",
        });

        // 処理中の場合はUIを更新
        if (response && response.success && response.status?.isProcessing) {
          startBtn.disabled = true;
          stopBtn.disabled = false;
          updateStatus("実行中", "running");
        }
        return true; // 成功
      } else {
        console.log("Service Worker準備中...");
        return false;
      }
    } catch (error) {
      // 接続エラーは初期化時によく発生するので、詳細ログは出さない
      if (error.message?.includes("Could not establish connection")) {
        console.log("Service Workerとの接続待機中...");
      } else {
        console.error("状態取得エラー:", error);
      }
      return false;
    }
  }

  // 初回チェック
  const statusChecked = await checkStatus();

  // 失敗した場合は少し待ってから再試行
  if (!statusChecked) {
    setTimeout(async () => {
      await checkStatus();
    }, 1000); // 1秒後に再試行
  }
});
