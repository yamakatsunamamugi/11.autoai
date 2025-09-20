// ========================================
// Step1: 初期設定・環境準備
// ========================================

// ========================================
// 1-1: インターネット接続確認
// ========================================
async function checkInternetConnection() {
  console.log("========");
  console.log("[step1-setup.js→Step1-1] インターネット接続確認開始");
  console.log("========");

  try {
    console.log(
      `[step1-setup.js→Step1-1-1] navigator.onLine: ${navigator.onLine}`,
    );
    console.log(
      `[step1-setup.js→Step1-1-1] ユーザーエージェント: ${navigator.userAgent}`,
    );

    // 現在のURLから環境を判定
    console.log(
      `[step1-setup.js→Step1-1-1] 現在のURL: ${window.location.href}`,
    );
    const isExtension = window.location.protocol === "chrome-extension:";
    const isDrive = window.location.hostname === "docs.google.com";

    // 1-1-1: Chrome Extensionの認証確認
    if (isExtension) {
      console.log("[step1-setup.js→Step1-1-1] Chrome Extension認証確認開始");

      // 認証トークン確認
      let authToken = null;

      // 方法1: chrome.storage から確認
      console.log(
        "[step1-setup.js] [Step 1-1-1] chrome.storage から認証情報を確認中...",
      );
      try {
        if (chrome?.storage?.local) {
          const result = await new Promise((resolve) => {
            chrome.storage.local.get(["authToken"], resolve);
          });
          if (result.authToken) {
            authToken = result.authToken;
            console.log(
              "[step1-setup.js] [Step 1-1-1] ✅ chrome.storage: トークン取得成功",
            );
          }
        }
      } catch (error) {
        console.log(
          "[step1-setup.js] [Step 1-1-1] chrome.storage 確認スキップ:",
          error.message,
        );
      }

      // 方法2: globalThis.googleServices から確認
      if (!authToken) {
        console.log(
          "[step1-setup.js] [Step 1-1-1] globalThis.googleServices から認証情報を確認中...",
        );
        if (globalThis.googleServices) {
          try {
            const authStatus =
              await globalThis.googleServices.checkAuthStatus();
            if (authStatus.isAuthenticated) {
              authToken = authStatus.token;
              console.log(
                "[step1-setup.js] [Step 1-1-1] ✅ googleServices: 認証済み",
              );
            }
          } catch (error) {
            console.log(
              "[step1-setup.js] [Step 1-1-1] googleServices 認証確認エラー:",
              error.message,
            );
          }
        }
      }

      // 方法3: chrome.runtime message経由（background scriptから取得）
      if (!authToken) {
        console.log(
          "[step1-setup.js] [Step 1-1-1] background script から認証情報を確認中...",
        );
        try {
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "getAuthToken" }, (response) => {
              resolve(response || {});
            });
          });
          if (response.token) {
            authToken = response.token;
            console.log(
              "[step1-setup.js] [Step 1-1-1] ✅ background script: トークン取得成功",
            );
          }
        } catch (error) {
          console.log(
            "[step1-setup.js] [Step 1-1-1] chrome.runtime メッセージエラー:",
            error.message,
          );
        }
      }
    } else if (isDrive) {
      console.log(
        "[step1-setup.js→Step1-1-1] Google Driveサンドボックス環境で実行中",
      );
    }

    // 1-1-2: Google APIへの接続確認（簡易チェック）
    const testUrl = "https://sheets.googleapis.com/v4/spreadsheets/test";
    try {
      const testResponse = await fetch(testUrl, { method: "HEAD" });
      const status = testResponse.status;
      const statusText =
        status === 403
          ? "正常（認証必要）"
          : status === 404
            ? "正常（リソース不明）"
            : `ステータス: ${status}`;

      console.log(
        `[step1-setup.js] [Step 1-1-2] ✅ Google Sheets APIへの接続確認成功（ステータス: ${status} - ${statusText}）`,
      );
    } catch (apiError) {
      console.warn(
        `[step1-setup.js] [Step 1-1-2] ⚠️ Google Sheets APIへの接続確認失敗:`,
        apiError.message,
      );
      console.log(
        "[step1-setup.js] [Step 1-1-2] 　→ 処理は継続します（認証時に再試行）",
      );
    }

    console.log(`[step1-setup.js] [Step 1-1-2] 🔐 認証状態: 未認証`);

    return { connected: true, authenticated: false };
  } catch (error) {
    console.error(
      "[step1-setup.js→Step1-1] ❌ インターネット接続確認エラー:",
      error,
    );
    return { connected: false, error: error.message };
  }
}

// ========================================
// 1-2: スリープ防止設定
// ========================================
async function preventSleep() {
  console.log("========");
  console.log("[step1-setup.js→Step1-2] スリープ防止設定開始");
  console.log("========");

  try {
    console.log(
      `[step1-setup.js] [Step 1-2-1] Wake Lock APIサポート: ${"wakeLock" in navigator}`,
    );

    // ブラウザ情報の取得
    console.log(
      `[step1-setup.js] [Step 1-2-1] ブラウザ: ${navigator.userAgent.match(/(Chrome|Safari|Firefox|Edge)\/[\d.]+/)?.[0] || "不明"}`,
    );

    // タブの可視性状態
    console.log(
      `[step1-setup.js] [Step 1-2-1] 現在のタブ状態: ${document.visibilityState}`,
    );

    let wakeLock = null;

    if ("wakeLock" in navigator) {
      // 1-2-1: Wake Lock API（標準的なアプローチ）
      try {
        const startTime = Date.now();
        console.log("[step1-setup.js] [Step 1-2-1] Wake Lock取得を試行中...");
        wakeLock = await navigator.wakeLock.request("screen");
        const elapsedTime = Date.now() - startTime;

        console.log("[step1-setup.js] [Step 1-2-1] ✅ Wake Lock取得成功");
        console.log(`  - 取得時間: ${elapsedTime}ms`);
        console.log(`  - Wake Lock状態: アクティブ`);

        const now = new Date();
        console.log(
          `  - 取得時刻: ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`,
        );

        // タブの可視性変更時に再取得
        document.addEventListener("visibilitychange", async () => {
          if (wakeLock !== null && document.visibilityState === "visible") {
            try {
              wakeLock = await navigator.wakeLock.request("screen");
              console.log(
                "[step1-setup.js] [Step 1-2-1] Wake Lock再取得成功（タブ復帰）",
              );
            } catch (err) {
              console.error(
                `[step1-setup.js] [Step 1-2-1] Wake Lock再取得失敗: ${err.name}, ${err.message}`,
              );
            }
          }
        });

        // グローバルに保存
        window.wakeLock = wakeLock;
      } catch (err) {
        console.error(
          `[step1-setup.js] [Step 1-2-1] Wake Lock取得失敗: ${err.name}, ${err.message}`,
        );
      }
    }

    // 1-2-2: NoSleepライブラリ（フォールバック1）
    if (!wakeLock && typeof NoSleep !== "undefined") {
      console.log(
        "[step1-setup.js] [Step 1-2-2] NoSleepライブラリ使用を試行中...",
      );
      const noSleep = new NoSleep();
      noSleep.enable();
      console.log("[step1-setup.js] [Step 1-2-2] ✅ NoSleepライブラリ有効化");
      window.noSleep = noSleep;
    }

    // 1-2-3: 定期的な活動によるスリープ防止（フォールバック2）
    console.log(
      "[step1-setup.js] [Step 1-2-3] 定期的な活動によるスリープ防止を設定中...",
    );

    // 30秒ごとに小さな活動を実行
    const keepAliveInterval = setInterval(() => {
      // 現在時刻を取得（簡単な処理）
      const now = new Date();
      // タブのタイトルを一時的に更新（すぐに戻す）
      const originalTitle = document.title;
      document.title = `${originalTitle} `;
      setTimeout(() => {
        document.title = originalTitle;
      }, 100);
    }, 30000);

    // グローバルに保存（必要に応じて停止可能）
    window.keepAliveInterval = keepAliveInterval;

    console.log("[step1-setup.js] [Step 1-2-3] ✅ スリープ防止設定完了");
    console.log(
      `  - 使用方法: ${wakeLock ? "Wake Lock API" : window.noSleep ? "NoSleepライブラリ" : "定期的な活動"}`,
    );
    console.log(
      `  - 状態: ${wakeLock ? "アクティブ" : window.noSleep ? "有効" : "実行中"}`,
    );

    return {
      success: true,
      method: wakeLock ? "wakeLock" : window.noSleep ? "noSleep" : "keepAlive",
    };
  } catch (error) {
    console.error("[step1-setup.js→Step1-2] ❌ スリープ防止設定エラー:", error);
    return { success: false, error: error.message };
  }
}

// ========================================
// 1-3: API関連の初期化
// ========================================
async function initializeAPI() {
  console.log("========");
  console.log("[step1-setup.js→Step1-3] API関連の初期化開始");
  console.log("========");

  console.log("[step1-setup.js] [Step 1-3-1] Google OAuth2認証を開始");
  console.log("  - 認証モード: interactive (ユーザー操作許可)");

  // トークン取得（リトライ機能付き）
  let token = null;
  let retryCount = 0;
  const maxRetries = 3;

  while (!token && retryCount < maxRetries) {
    console.log(
      `[step1-setup.js] [Step 1-3-1] 認証試行 ${retryCount + 1}/${maxRetries}`,
    );
    const startTime = Date.now();

    try {
      token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (authToken) => {
          if (chrome.runtime.lastError) {
            console.error(
              `[step1-setup.js] [Step 1-3-1] 認証エラー (試行 ${retryCount + 1}):`,
              chrome.runtime.lastError,
            );
            retryCount++;
            if (retryCount >= maxRetries) {
              reject(chrome.runtime.lastError);
            } else {
              setTimeout(() => resolve(null), 1000 * retryCount);
            }
          } else {
            resolve(authToken);
          }
        });
      });

      if (token) {
        const elapsedTime = Date.now() - startTime;
        console.log(
          "[step1-setup.js] [Step 1-3-2] ✅ アクセストークン取得成功",
        );

        // トークンの詳細情報を表示
        console.log(`  - トークン長: ${token.length}文字`);
        console.log(`  - 取得時刻: ${new Date().toISOString()}`);
        console.log(
          `  - 有効期限: ${new Date(Date.now() + 50 * 60 * 1000).toISOString()}`,
        );
        console.log(`  - 認証時間: ${elapsedTime}ms`);

        // グローバルStateにトークンを保存
        window.globalState = window.globalState || {};
        window.globalState.authToken = token;
        window.globalState.authenticated = true;

        // APIヘッダーの設定
        window.globalState.apiHeaders = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        window.globalState.sheetsApiBase =
          "https://sheets.googleapis.com/v4/spreadsheets";

        console.log("[step1-setup.js] [Step 1-3-3] Sheets API設定完了");
        console.log(
          "  - APIベースURL: https://sheets.googleapis.com/v4/spreadsheets",
        );
        console.log("  - ヘッダー: Authorization, Content-Type設定済み");
        console.log("[step1-setup.js] [Step 1-3] ✅ API初期化完了");
        return { success: true, token: token };
      }
    } catch (error) {
      console.error("[step1-setup.js] [Step 1-3-1] ❌ 認証失敗:", error);
      console.error("  - エラーの詳細:", error.message || error);
    }
  }

  console.error(
    "[step1-setup.js] [Step 1-3] ❌ API初期化失敗: 認証を完了できませんでした",
  );
  return { success: false, error: "認証失敗" };
}

// ========================================
// 1-4: スプレッドシートから特殊行を検索
// ========================================
async function findSpecialRows() {
  console.log("========");
  console.log("[step1-setup.js→Step1-4] 特殊行の検索開始");
  console.log("========");

  try {
    // 1-4-0: スプレッドシートURL取得（グローバルStateから）
    let spreadsheetId = null;
    let gid = null;

    // globalStateからURLまたはIDを取得
    if (window.globalState) {
      spreadsheetId = window.globalState.spreadsheetId;
      gid = window.globalState.gid;

      console.log("[step1-setup.js] [Step 1-4] ✅ globalStateから取得:");
      console.log(`  - スプレッドシートID: ${spreadsheetId}`);
      console.log(`  - GID: ${gid}`);
    }

    // スプレッドシートURLが取得できない場合、入力を促す
    if (!spreadsheetId) {
      const spreadsheetUrl = prompt(
        "スプレッドシートのURLを入力してください：",
      );
      if (!spreadsheetUrl) {
        throw new Error("スプレッドシートURLが提供されていません");
      }

      // URLからスプレッドシートIDとGIDを抽出
      const idMatch = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const gidMatch = spreadsheetUrl.match(/[#&]gid=([0-9]+)/);

      if (!idMatch) {
        throw new Error("無効なスプレッドシートURL");
      }

      spreadsheetId = idMatch[1];
      gid = gidMatch ? gidMatch[1] : "0";

      // globalStateに保存
      window.globalState.spreadsheetUrl = spreadsheetUrl;
      window.globalState.spreadsheetId = spreadsheetId;
      window.globalState.gid = gid;
    }

    // シート名の推測（GIDから）
    const sheetName = gid === "0" ? "シート1" : `シート${gid}`;

    console.log("[step1-setup.js] [Step 1-4] 抽出された情報:");
    console.log(`  - スプレッドシートID: ${spreadsheetId}`);
    console.log(`  - GID: ${gid}`);
    console.log(`  - シート名: ${sheetName}`);

    // 1-4-1: A列データ取得
    const token = window.globalState.authToken;
    if (!token) {
      throw new Error("認証トークンが見つかりません");
    }

    console.log("[step1-setup.js] [Step 1-4-1] A列データ取得開始");
    console.log("  - 取得範囲: A1:A100");
    console.log(
      `  - APIエンドポイント: ${window.globalState.sheetsApiBase}/${spreadsheetId}/values/A1:A100`,
    );

    const startTime = Date.now();
    const response = await fetch(
      `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/A1:A100`,
      {
        headers: window.globalState.apiHeaders,
      },
    );
    const responseTime = Date.now() - startTime;

    console.log("[step1-setup.js] [Step 1-4-1] API応答:");
    console.log(`  - ステータス: ${response.status} `);
    console.log(`  - 応答時間: ${responseTime}ms`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API エラー: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const columnA = data.values || [];

    // 先頭5行のデータをログ表示（デバッグ用）
    const preview = columnA.slice(0, 5).map((row) => row[0] || "(空)");
    console.log("[step1-setup.js] [Step 1-4-1] 取得データ概要:");
    console.log(`  - 取得行数: ${columnA.length}行`);
    console.log(`  - 最初の5行: ${preview.join(", ")}`);

    // 1-4-2: 特殊行の検索
    console.log("[step1-setup.js] [Step 1-4-2] 特殊行キーワード検索開始");

    const specialRows = {
      menuRow: null,
      controlRow: null,
      aiRow: null,
      modelRow: null,
      functionRow: null,
      dataStartRow: null,
    };

    // 検索キーワードと対応する変数名
    const searchKeywords = {
      メニュー: "menuRow",
      列制御: "controlRow",
      AI: "aiRow",
      モデル: "modelRow",
      機能: "functionRow",
      1: "dataStartRow",
    };

    // A列を走査して特殊行を検出
    columnA.forEach((row, index) => {
      const cellValue = row[0] || "";

      for (const [keyword, varName] of Object.entries(searchKeywords)) {
        if (cellValue.includes(keyword) && !specialRows[varName]) {
          specialRows[varName] = index + 1; // 1ベースの行番号
          console.log(
            `[step1-setup.js] [Step 1-4-2] ✅ ${keyword}行 検出: ${index + 1}行目`,
          );
        }
      }
    });

    // メニュー行、AI行が必須
    if (!specialRows.menuRow || !specialRows.aiRow) {
      throw new Error("必須の特殊行（メニュー行、AI行）が見つかりません");
    }

    console.log(
      `[step1-setup.js] [Step 1-4-2] ✅ 特殊行検索結果: メニュー:${specialRows.menuRow}行目 | 列制御:${specialRows.controlRow}行目 | AI:${specialRows.aiRow}行目 | モデル:${specialRows.modelRow}行目 | 機能:${specialRows.functionRow}行目 | 1:${specialRows.dataStartRow}行目`,
    );

    // 1-4-3: 検索結果の検証
    console.log("[step1-setup.js] [Step 1-4-3] 検索結果の検証");
    const foundRows = [];
    const missingRows = [];

    Object.entries(specialRows).forEach(([key, value]) => {
      if (value) {
        foundRows.push(`${key}=${value}`);
      } else {
        missingRows.push(key);
      }
    });

    console.log(`[step1-setup.js] [Step 1-4-3] 検出結果サマリー:`);
    console.log(`  - 発見: ${foundRows.join(", ")}`);

    if (missingRows.length > 0) {
      console.warn(
        `[step1-setup.js] [Step 1-4-3] ⚠️ 未検出の特殊行: ${missingRows.join(", ")}`,
      );
      console.warn("  - 注: 一部の行は任意のため、処理は継続します");
    }

    window.globalState.specialRows = specialRows;
    console.log("[step1-setup.js] [Step 1-4] ✅ 特殊行検索完了");
    console.log("最終結果:", specialRows);

    return specialRows;
  } catch (error) {
    console.error("[step1-setup.js] [Step 1-4-1] ❌ A列取得エラー詳細:");
    console.error(`  - エラー名: ${error.name}`);
    console.error(`  - メッセージ: ${error.message}`);
    console.error(`  - スタック: ${error.stack}`);
    throw error;
  }
}

// ========================================
// 1-5. 列構造の自動セットアップ
// ========================================
async function setupColumnStructure() {
  console.log("========");
  console.log("[step1-setup.js→Step1-5] 列構造の自動セットアップ開始");
  console.log("========");

  try {
    // 1-5-0. シートIDの取得
    const spreadsheetId = window.globalState.spreadsheetId;
    const gid = window.globalState.gid || "0";
    const sheetId = parseInt(gid);
    console.log(`[step1-setup.js] [Step 1-5-0] シート情報:`);
    console.log(`  - スプレッドシートID: ${spreadsheetId}`);
    console.log(`  - シートID (GID): ${sheetId}`);

    // メニュー行番号を取得
    const menuRowNumber = window.globalState.specialRows?.menuRow || 3;
    console.log(
      `[step1-setup.js] [Step 1-5-0] メニュー行: ${menuRowNumber}行目`,
    );

    // 1-5-1. プロンプト列の検出
    console.log("[step1-setup.js] [Step 1-5-1] プロンプト列を検出中...");

    // メニュー行の全列を取得
    const range = `${menuRowNumber}:${menuRowNumber}`;
    const apiUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/${range}`;

    const response = await fetch(apiUrl, {
      headers: window.globalState.apiHeaders,
    });

    if (!response.ok) {
      console.error(
        "[step1-setup.js] [Step 1-5-1] メニュー行取得エラー:",
        response.status,
      );
      return false;
    }

    const data = await response.json();
    const headerRow = data.values?.[0] || [];

    // プロンプト列を検索
    const promptColumns = [];
    headerRow.forEach((cell, index) => {
      if (cell && cell.toString().includes("プロンプト")) {
        const columnLetter = indexToColumn(index);
        promptColumns.push({
          column: columnLetter,
          index: index,
          value: cell,
        });
      }
    });

    console.log(
      `[step1-setup.js] [Step 1-5-1] プロンプト列検出結果: ${promptColumns.length}列`,
    );
    promptColumns.forEach((col) => {
      console.log(`  - ${col.column}列: "${col.value}"`);
    });

    if (promptColumns.length === 0) {
      console.log(
        "[step1-setup.js] [Step 1-5-1] プロンプト列が見つかりません。列追加をスキップします。",
      );
      return true;
    }

    // 1-5-2. 必要な列の確認と追加
    console.log("[step1-setup.js] [Step 1-5-2] 必要な列の確認開始...");

    // AI行を取得して3種類AIかチェック
    const aiRowNumber = window.globalState.specialRows?.aiRow || 5;
    const aiRange = `${aiRowNumber}:${aiRowNumber}`;
    const aiApiUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/${aiRange}`;

    const aiResponse = await fetch(aiApiUrl, {
      headers: window.globalState.apiHeaders,
    });

    let aiRow = [];
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      aiRow = aiData.values?.[0] || [];
    }

    const columnsToAdd = [];

    // プロンプトグループを検出（プロンプト、プロンプト2〜5）
    const promptGroups = [];
    for (let i = 0; i < promptColumns.length; i++) {
      const promptCol = promptColumns[i];
      if (promptCol.value === "プロンプト") {
        let lastIndex = promptCol.index;

        // 連続するプロンプト2〜5を探す
        for (let j = 2; j <= 5; j++) {
          const nextIndex = lastIndex + 1;
          if (
            nextIndex < headerRow.length &&
            headerRow[nextIndex] === `プロンプト${j}`
          ) {
            lastIndex = nextIndex;
          } else {
            break;
          }
        }

        promptGroups.push({
          firstIndex: promptCol.index,
          lastIndex: lastIndex,
          column: promptCol.column,
          aiType: aiRow[promptCol.index] || "",
        });
      }
    }

    // 右から左に処理（インデックスずれ防止）
    const sortedGroups = promptGroups.sort(
      (a, b) => b.firstIndex - a.firstIndex,
    );

    for (const group of sortedGroups) {
      console.log(`[step1-setup.js] [Step 1-5-2] ${group.column}列の処理中...`);

      const is3TypeAI = group.aiType.includes(
        "3種類（ChatGPT・Gemini・Claude）",
      );

      // プロンプト列の直前に「ログ」があるかチェック
      const logIndex = group.firstIndex - 1;
      console.log(`  [Debug] ログ列チェック:`);
      console.log(`    - チェック位置: index=${logIndex}`);
      console.log(`    - 現在の値: "${headerRow[logIndex] || "(空)"}"`);
      console.log(`    - 期待値: "ログ"`);

      if (
        logIndex < 0 ||
        !headerRow[logIndex] ||
        headerRow[logIndex].trim() !== "ログ"
      ) {
        columnsToAdd.push({
          position: group.firstIndex,
          name: "ログ",
          type: "before",
        });
        console.log(`  - "ログ"列の追加が必要（${group.column}列の前）`);
      } else {
        console.log(`    - ✓ "ログ"列は既に存在`);
      }

      if (is3TypeAI) {
        // 3種類AI: 既存の「回答」列を削除して3つの回答列を追加
        const answerIndex = group.lastIndex + 1;
        if (
          answerIndex < headerRow.length &&
          headerRow[answerIndex] === "回答"
        ) {
          // 削除はbatchUpdateで行うため、ここでは記録のみ
          console.log(
            `  - "回答"列の削除が必要（${indexToColumn(answerIndex)}列）`,
          );
        }

        // 3つの回答列を追加
        const answerHeaders = ["ChatGPT回答", "Claude回答", "Gemini回答"];
        for (let i = 0; i < answerHeaders.length; i++) {
          const checkIndex = group.lastIndex + 1 + i;
          if (
            checkIndex >= headerRow.length ||
            headerRow[checkIndex] !== answerHeaders[i]
          ) {
            columnsToAdd.push({
              position: group.lastIndex + 1 + i,
              name: answerHeaders[i],
              type: "after",
              is3Type: true,
            });
            console.log(`  - "${answerHeaders[i]}"列の追加が必要`);
          }
        }
      } else {
        // 通常AI: 最後のプロンプトの直後に「回答」があるかチェック
        const answerIndex = group.lastIndex + 1;
        console.log(`  [Debug] 回答列チェック:`);
        console.log(`    - チェック位置: index=${answerIndex}`);
        console.log(`    - 現在の値: "${headerRow[answerIndex] || "(空)"}"`);
        console.log(`    - 期待値: "回答"`);

        if (
          answerIndex >= headerRow.length ||
          !headerRow[answerIndex] ||
          headerRow[answerIndex].trim() !== "回答"
        ) {
          columnsToAdd.push({
            position: answerIndex,
            name: "回答",
            type: "after",
          });
          console.log(`  - "回答"列の追加が必要（最後のプロンプトの後）`);
        } else {
          console.log(`    - ✓ "回答"列は既に存在`);
        }
      }
    }

    if (columnsToAdd.length === 0) {
      console.log("[step1-setup.js] [Step 1-5-2] ✅ 必要な列は既に存在します");
      return true;
    }

    // 1-5-3. 列追加の実行
    console.log(
      `[step1-setup.js] [Step 1-5-3] ${columnsToAdd.length}列を追加中...`,
    );

    // 列追加は位置の大きい順（右から）実行する必要がある
    columnsToAdd.sort((a, b) => b.position - a.position);

    for (const col of columnsToAdd) {
      console.log(
        `[step1-setup.js] [Step 1-5-3] ${indexToColumn(col.position)}位置に"${col.name}"列を追加中...`,
      );

      const success = await insertColumn(spreadsheetId, sheetId, col.position);
      if (!success) {
        console.error(
          `[step1-setup.js] [Step 1-5-3] ❌ 列追加失敗: ${col.name}`,
        );
        continue;
      }

      // 1-5-4. 列ヘッダーの設定（メニュー行に設定）
      const menuRowNumber = window.globalState.specialRows?.menuRow || 3;
      console.log(
        `[step1-setup.js] [Step 1-5-4] ヘッダー設定中: ${indexToColumn(col.position)}${menuRowNumber} = "${col.name}"`,
      );

      const headerRange = `${indexToColumn(col.position)}${menuRowNumber}`;
      const headerUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/${headerRange}?valueInputOption=USER_ENTERED`;

      const headerResponse = await fetch(headerUrl, {
        method: "PUT",
        headers: window.globalState.apiHeaders,
        body: JSON.stringify({
          values: [[col.name]],
        }),
      });

      if (headerResponse.ok) {
        console.log(
          `[step1-setup.js] [Step 1-5-4] ✅ ヘッダー設定成功: ${col.name}`,
        );
      } else {
        console.error(
          `[step1-setup.js] [Step 1-5-4] ⚠️ ヘッダー設定失敗: ${col.name}`,
        );
      }
    }

    console.log("[step1-setup.js] [Step 1-5] ✅ 列構造の自動セットアップ完了");
    return true;
  } catch (error) {
    console.error(
      "[step1-setup.js] [Step 1-5] ❌ 列構造セットアップエラー:",
      error,
    );
    console.error("  - エラー詳細:", error.message);
    console.error("  - スタック:", error.stack);
    return false;
  }
}

// ========================================
// 1-6. Google Sheets APIのバッチ更新で列を挿入
// ========================================
async function insertColumn(spreadsheetId, sheetId, columnIndex) {
  console.log(
    `[step1-setup.js] [Step 1-5-6] 列挿入API呼び出し: インデックス${columnIndex}`,
  );

  const batchUpdateUrl = `${window.globalState.sheetsApiBase}/${spreadsheetId}:batchUpdate`;

  const requestBody = {
    requests: [
      {
        insertDimension: {
          range: {
            sheetId: sheetId,
            dimension: "COLUMNS",
            startIndex: columnIndex,
            endIndex: columnIndex + 1,
          },
          inheritFromBefore: false,
        },
      },
    ],
  };

  try {
    console.log("[step1-setup.js] [Step 1-5-6] batchUpdate実行中...");
    console.log(`  - URL: ${batchUpdateUrl}`);
    console.log(
      `  - 挿入位置: ${columnIndex} (${indexToColumn(columnIndex)}列)`,
    );

    const response = await fetch(batchUpdateUrl, {
      method: "POST",
      headers: window.globalState.apiHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[step1-setup.js] [Step 1-5-6] ❌ 列挿入エラー:`,
        errorText,
      );
      return false;
    }

    const result = await response.json();
    console.log("[step1-setup.js] [Step 1-5-6] ✅ 列挿入成功");
    console.log("  - レスポンス:", result);

    return true;
  } catch (error) {
    console.error(`[step1-setup.js] [Step 1-5-6] ❌ 列挿入例外:`, error);
    return false;
  }
}

// ========================================
// ユーティリティ関数
// ========================================

// 列インデックスを列文字に変換（0ベース → A, B, C...）
function indexToColumn(index) {
  let column = "";
  while (index >= 0) {
    column = String.fromCharCode(65 + (index % 26)) + column;
    index = Math.floor(index / 26) - 1;
  }
  return column;
}

// 列文字を列インデックスに変換（A, B, C... → 0ベース）
function columnToIndex(column) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 64);
  }
  return index - 1;
}

// ========================================
// メイン実行関数
// ========================================
async function executeStep1() {
  console.log("＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝");
  console.log("[step1-setup.js] ステップ1: 初期設定 開始");
  console.log("＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝");

  try {
    console.log("[step1-setup.js] [Debug] Global State確認:");
    console.log(`  - window.globalState存在: ${!!window.globalState}`);
    console.log(`  - chrome API利用可能: ${typeof chrome !== "undefined"}`);
    console.log(
      `  - globalThis.googleServices: ${!!globalThis.googleServices}`,
    );

    // グローバルステートの初期化
    window.globalState = window.globalState || {};

    // 1-1: インターネット接続確認
    const connectionResult = await checkInternetConnection();
    if (!connectionResult.connected) {
      throw new Error("インターネット接続がありません");
    }
    window.globalState.internetConnected = true;

    // 1-2: スリープ防止設定
    const sleepResult = await preventSleep();
    window.globalState.sleepPrevented = sleepResult.success;

    console.log(
      `[step1-setup.js] [Debug] Global State初期化完了:`,
      window.globalState,
    );

    // 1-3: API初期化（認証）
    const apiResult = await initializeAPI();
    if (!apiResult.success) {
      throw new Error("API初期化に失敗しました");
    }
    window.globalState.authenticated = true;

    // 1-4: 特殊行検索
    const setupResult = await findSpecialRows();
    window.globalState.setupResult = setupResult;

    // 1-5: 列構造の自動セットアップ
    const columnResult = await setupColumnStructure();
    if (!columnResult) {
      console.warn(
        "[step1-setup.js] [Step 1-5] ⚠️ 列構造セットアップに一部失敗しましたが、処理を継続します",
      );
    }

    console.log("＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝");
    console.log("[step1-setup.js] ✅ ステップ1: 初期設定 完了");
    console.log("＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝");

    const resultSummary = {
      インターネット接続: connectionResult.connected ? "✅" : "❌",
      スリープ防止: sleepResult.success ? "✅" : "❌",
      API認証: apiResult.success ? "✅" : "❌",
      特殊行検出: setupResult ? "✅" : "❌",
      列構造設定: columnResult ? "✅" : "⚠️",
    };

    console.log("[step1-setup.js] 初期設定サマリー:");
    Object.entries(resultSummary).forEach(([key, value]) => {
      console.log(`  - ${key}: ${value}`);
    });

    console.log("[step1-setup.js] globalState最終状態:");
    console.log("  - 認証済み:", window.globalState.authenticated);
    console.log("  - スプレッドシートID:", window.globalState.spreadsheetId);
    console.log("  - 特殊行情報:", window.globalState.specialRows);

    console.log(`[step1-setup.js] ✅ globalState準備完了:`, window.globalState);

    return {
      success: true,
      globalState: window.globalState,
    };
  } catch (error) {
    console.error("[step1-setup.js] ❌ ステップ1 エラー:", error);
    console.error("  - エラー詳細:", error.message);
    console.error("  - スタック:", error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ========================================
// グローバル公開
// ========================================
if (typeof window !== "undefined") {
  window.executeStep1 = executeStep1;
  window.checkInternetConnection = checkInternetConnection;
  window.preventSleep = preventSleep;
  window.initializeAPI = initializeAPI;
  window.findSpecialRows = findSpecialRows;
  window.setupColumnStructure = setupColumnStructure;
  window.indexToColumn = indexToColumn;
  window.columnToIndex = columnToIndex;
  window.insertColumn = insertColumn;
}

// ========================================
// 全ステップを制御するメインエントリーポイント
// ========================================
async function executeAllSteps() {
  console.log("========================================");
  console.log("🚀 [step1-setup.js] 全ステップ実行開始");
  console.log("========================================");

  try {
    // Step 1: 初期設定
    console.log("\n📋 Step 1: 初期設定を実行中...");
    const step1Result = await executeStep1();

    if (!step1Result || !step1Result.success) {
      console.error("❌ Step 1 失敗");
      return { success: false, step: 1 };
    }

    // Step 2: タスクグループ作成
    if (window.executeStep2) {
      console.log("\n📋 Step 2: タスクグループ作成中...");
      await window.executeStep2();
    }

    // Step 3: メインループ（全グループ処理）
    // 旧 executeStep5 を executeStep3 として呼び出し
    if (window.executeStep3 || window.executeStep5) {
      console.log("\n📋 Step 3: 全グループ処理開始...");
      const executeFunc = window.executeStep3 || window.executeStep5;
      await executeFunc();
    }

    console.log("\n========================================");
    console.log("✅ [step1-setup.js] 全ステップ完了");
    console.log("========================================");

    return { success: true };
  } catch (error) {
    console.error("❌ [step1-setup.js] エラー発生:", error);
    return { success: false, error: error.message };
  }
}

// グローバルエクスポート
if (typeof window !== "undefined") {
  window.executeAllSteps = executeAllSteps;
}

console.log("[step1-setup.js] ✅ Step1関数定義完了（全体制御機能付き）");
