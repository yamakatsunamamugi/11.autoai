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
    // navigator.onLine: チェック済み
    // ユーザーエージェント: チェック済み

    // 現在のURLから環境を判定
    // 現在のURL: チェック済み
    const isExtension = window.location.protocol === "chrome-extension:";
    const isDrive = window.location.hostname === "docs.google.com";

    // 1-1-1: Chrome Extensionの認証確認
    if (isExtension) {
      console.log("[step1-setup.js→Step1-1-1] Chrome Extension認証確認開始");

      // 認証トークン確認
      let authToken = null;

      // 方法1: chrome.storage から確認
      // chrome.storage から認証情報を確認中
      try {
        if (chrome?.storage?.local) {
          const result = await new Promise((resolve) => {
            chrome.storage.local.get(["authToken"], resolve);
          });
          if (result.authToken) {
            authToken = result.authToken;
            // chrome.storage: トークン取得成功
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

      /* 方法3: chrome.runtime message経由（background scriptから取得）
      if (!authToken) {
        console.log(
          "[step1-setup.js] [Step 1-1-1] background script から認証情報を確認中...",
        );
        try {
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "getAuthToken" }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "[step1-setup.js] background script通信エラー:",
                  chrome.runtime.lastError.message,
                );
                resolve({}); // エラー時は空オブジェクトを返す
              } else {
                resolve(response || {});
              }
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
      } */
    } else if (isDrive) {
      console.log(
        "[step1-setup.js→Step1-1-1] Google Driveサンドボックス環境で実行中",
      );
    }

    // 1-1-2: Google APIへの接続確認（簡易チェック）
    const testUrl = "https://sheets.googleapis.com/v4";
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
        // Wake Lock取得を試行中
        wakeLock = await navigator.wakeLock.request("screen");
        const elapsedTime = Date.now() - startTime;

        console.log("[step1-setup.js] [Step 1-2-1] ✅ Wake Lock取得成功");
        // 取得時間記録
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
  // 認証モード: interactive

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
        // 取得時刻記録
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
        // ヘッダー設定済み
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
// 1-3-X: UI セレクタ管理機能（一元管理）
// ========================================

/**
 * 全AIのUIセレクタを一元管理
 */
function initializeUISelectors() {
  console.log("========");
  console.log("[step1-setup.js→Step1-3-X] UIセレクタ一元管理初期化開始");
  console.log("========");

  // 全AIのセレクタ定義を一箇所で管理
  const ALL_UI_SELECTORS = {
    ChatGPT: {
      INPUT: [
        ".ProseMirror",
        "#prompt-textarea",
        '[contenteditable="true"][translate="no"]',
        'div[data-virtualkeyboard="true"]',
        "div.ProseMirror.text-token-text-primary",
        ".ql-editor",
        '[contenteditable="true"]',
        'div[contenteditable="true"]',
        'textarea[data-testid="conversation-textarea"]',
        'textarea[placeholder*="メッセージ"]',
        "textarea",
      ],
      SEND_BUTTON: [
        '[data-testid="send-button"]',
        "#composer-submit-button",
        'button[aria-label="プロンプトを送信する"]',
        "button.composer-submit-btn.composer-submit-button-color",
        'button:has(svg[width="20"][height="20"])',
        '[aria-label="Send prompt"]',
        '[aria-label*="送信"]',
        'button[data-testid="composer-send-button"]',
        'button[class*="send"]',
        'button[type="submit"]',
      ],
      STOP_BUTTON: [
        '[data-testid="stop-button"]',
        '#composer-submit-button[aria-label="ストリーミングの停止"]',
        "button.composer-submit-btn.composer-secondary-button-color",
        'button:has(svg path[d*="M4.5 5.75"])',
        '[aria-label="ストリーミングの停止"]',
        '#composer-submit-button[aria-label*="停止"]',
        '[aria-label="Stop generating"]',
        '[aria-label="Stop"]',
        'button[aria-label*="Stop"]',
        'button[aria-label*="stop"]',
        '[data-testid="composer-moderation-stop-button"]',
      ],
      MODEL_BUTTON: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-label*="モデル セレクター"]',
        'button[aria-label*="モデル"][aria-haspopup="menu"]',
        "#radix-\\:r2m\\:",
        'button.group.flex.cursor-pointer[aria-haspopup="menu"]',
        'button[aria-label*="モデル"]',
        'button[aria-label*="Model"]',
        '[aria-label="Model selector"]',
        'button[aria-haspopup="menu"]',
        '[data-testid="model-selector"]',
      ],
      MESSAGE: [
        '[data-message-author-role="assistant"]',
        ".message-content",
        ".assistant-message",
      ],
    },

    Gemini: {
      INPUT: [
        '.ql-editor.new-input-ui[contenteditable="true"]',
        '.ql-editor[contenteditable="true"]',
        "div.ql-editor.textarea",
        '[contenteditable="true"][role="textbox"]',
        "rich-textarea .ql-editor",
      ],
      SEND_BUTTON: [
        'button[aria-label="送信"]',
        'button[mattooltip="送信"]',
        ".send-button-container button",
        "button.send-button:not(.stop)",
        '[aria-label="プロンプトを送信"]',
        'button:has(mat-icon[data-mat-icon-name="send"])',
        'button[aria-label*="Send"]',
        '[data-testid="send-button"]',
        'button[type="submit"]',
      ],
      STOP_BUTTON: [
        "div.blue-circle.stop-icon",
        'div.stop-icon mat-icon[data-mat-icon-name="stop"]',
        ".blue-circle.stop-icon",
        'button[aria-label="回答を停止"]',
        "button.send-button.stop",
        "button.stop",
        ".stop-icon",
        'mat-icon[data-mat-icon-name="stop"]',
        '[aria-label="Stop response"]',
        'button[aria-label*="停止"]',
        'button[aria-label*="stop"]',
        ".stop-button",
      ],
      MODEL_BUTTON: [
        ".gds-mode-switch-button",
        "button.logo-pill-btn",
        "button[mat-flat-button]:has(.logo-pill-label-container)",
        'button[aria-haspopup="menu"][aria-expanded="false"]',
        "button:has(.mode-title)",
        'button[aria-label*="モデル"]',
        'button[mattooltip*="モデル"]',
        "button.model-selector-button",
        "button:has(.model-name)",
        ".model-selector",
      ],
      MESSAGE: [
        ".conversation-turn.model-turn",
        ".model-response-text",
        "message-content",
      ],
    },

    Genspark: {
      INPUT: [
        'textarea[placeholder*="質問"]',
        'textarea[placeholder*="スライド"]',
        'textarea[placeholder*="factcheck"]',
        "textarea",
        'input[type="text"]',
        '[contenteditable="true"]',
      ],
      SEND_BUTTON: [
        ".enter-icon-wrapper",
        'button[type="submit"]',
        "button:has(svg.enter-icon)",
        '[aria-label*="送信"]',
        '[aria-label*="submit"]',
      ],
      STOP_BUTTON: [
        '.enter-icon-wrapper[class*="bg-[#232425]"]',
        ".enter-icon-wrapper:has(.stop-icon)",
        "button:has(svg.stop-icon)",
        '[aria-label*="停止"]',
        '[aria-label*="stop"]',
      ],
      MESSAGE: [
        ".response-content",
        ".message-content",
        '[data-testid="response"]',
        '[class*="response"]',
        '[class*="message"]',
        'div[role="article"]',
        ".markdown-content",
      ],
    },

    Report: {
      GOOGLE_DOCS: {
        NEW_DOC_BUTTON: [
          'div[aria-label="新しいドキュメントを作成"]',
          '[data-tooltip="新しいドキュメントを作成"]',
          "div.docs-homescreen-templates-templateview-preview",
          ".docs-homescreen-templates-templateview-preview",
        ],
        TITLE_INPUT: [
          ".docs-title-input",
          '[data-docs-flag-name="docs_title_input"]',
          ".docs-title-widget input",
        ],
        CONTENT_AREA: [
          ".kix-page",
          ".kix-page-content-wrap",
          ".docs-texteventtarget-iframe",
        ],
      },
    },
  };

  // グローバルに設定
  window.UI_SELECTORS = ALL_UI_SELECTORS;
  window.globalState = window.globalState || {};
  window.globalState.uiSelectorsInitialized = true;

  console.log("[step1-setup.js] [Step 1-3-X] ✅ UIセレクタ一元管理初期化完了");
  console.log(`  - 対応AI: ${Object.keys(ALL_UI_SELECTORS).join(", ")}`);
  console.log(
    `  - 総セレクタ数: ${JSON.stringify(ALL_UI_SELECTORS).length}文字`,
  );

  return ALL_UI_SELECTORS;
}

/**
 * 特定AIのセレクタを取得
 * @param {string} aiType - AI種別 (ChatGPT, Gemini, Genspark, Report)
 * @returns {Object} 指定AIのセレクタ
 */
function getSelectors(aiType) {
  if (!window.UI_SELECTORS) {
    console.warn(
      `[step1-setup.js] UIセレクタが未初期化です。初期化を実行します。`,
    );
    initializeUISelectors();
  }

  if (!window.UI_SELECTORS[aiType]) {
    console.error(`[step1-setup.js] 未対応のAI種別: ${aiType}`);
    return {};
  }

  return window.UI_SELECTORS[aiType];
}

/**
 * 全セレクタを取得
 * @returns {Object} 全AIのセレクタ
 */
function getAllSelectors() {
  if (!window.UI_SELECTORS) {
    console.warn(
      `[step1-setup.js] UIセレクタが未初期化です。初期化を実行します。`,
    );
    initializeUISelectors();
  }

  return window.UI_SELECTORS;
}

// ========================================
// トークンリフレッシュ機能（他の関数から利用されるため先に定義）
// ========================================

/**
 * トークンを更新する関数
 */
async function refreshAuthToken() {
  console.log("[step1-setup.js] 🔄 トークンリフレッシュ開始...");

  try {
    // 既存のトークンを削除
    if (window.globalState && window.globalState.authToken) {
      console.log("[step1-setup.js] 既存トークンをクリア");
      chrome.identity.removeCachedAuthToken({
        token: window.globalState.authToken,
      });
    }

    // 新しいトークンを取得
    const newToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (authToken) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(authToken);
        }
      });
    });

    if (newToken) {
      // globalStateを更新
      if (!window.globalState) {
        window.globalState = {};
      }
      window.globalState.authToken = newToken;

      console.log("[step1-setup.js] ✅ トークンリフレッシュ成功");
      console.log(`  - 新トークン長: ${newToken.length}文字`);
      console.log(`  - 更新時刻: ${new Date().toISOString()}`);

      return newToken;
    } else {
      throw new Error("新しいトークンの取得に失敗");
    }
  } catch (error) {
    console.error("[step1-setup.js] ❌ トークンリフレッシュ失敗:", error);
    throw error;
  }
}

/**
 * 401エラー時の自動リトライ機能付きfetch（レート制限対応強化版）
 */
async function fetchWithTokenRefresh(url, options = {}, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Only log on retries or errors
      if (attempt > 1) {
        console.log(
          `[step1-setup.js] API呼び出し再試行 ${attempt}/${maxRetries}: ${url}`,
        );
      }

      // 最初の試行
      let response = await fetch(url, options);

      // 429 (Too Many Requests) エラーの場合
      if (response.status === 429) {
        const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // 最大10秒
        console.log(
          `[step1-setup.js] 429エラー検出 - ${waitTime}ms待機後に再試行`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // 401エラーの場合、トークンをリフレッシュして再試行
      if (response.status === 401) {
        console.log(
          "[step1-setup.js] 401エラー検出 - トークンリフレッシュ実行",
        );

        const newToken = await refreshAuthToken();

        // ヘッダーを更新
        const newOptions = {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        };

        // 少し待ってから再試行
        await new Promise((resolve) => setTimeout(resolve, 1000));
        response = await fetch(url, newOptions);
        console.log(`[step1-setup.js] 再試行結果: ${response.status}`);

        // 再試行後も429の場合は待機
        if (response.status === 429) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          console.log(
            `[step1-setup.js] 再試行後も429エラー - ${waitTime}ms待機`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // 成功またはその他のエラーの場合は結果を返す
      if (response.status < 500 || response.status === 429) {
        return response;
      }

      // 5xxエラーの場合は再試行
      console.log(`[step1-setup.js] ${response.status}エラー - 再試行します`);
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      console.error(
        `[step1-setup.js] fetchWithTokenRefresh エラー (試行${attempt}):`,
        error,
      );
      lastError = error;

      // ネットワークエラーの場合は少し待って再試行
      if (attempt < maxRetries) {
        const waitTime = 1000 * attempt;
        console.log(`[step1-setup.js] ${waitTime}ms待機後に再試行`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`[step1-setup.js] 最大試行回数に達しました: ${maxRetries}`);
  throw lastError || new Error("最大試行回数に達しました");
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

      // spreadsheetUrlが設定されている場合はそこからIDとGIDを抽出
      if (!spreadsheetId && window.globalState.spreadsheetUrl) {
        const spreadsheetUrl = window.globalState.spreadsheetUrl;
        console.log(
          `[step1-setup.js] [Step 1-4] globalStateからURL取得: ${spreadsheetUrl}`,
        );

        // URLからスプレッドシートIDとGIDを抽出
        const idMatch = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        const gidMatch = spreadsheetUrl.match(/[#&]gid=([0-9]+)/);

        if (!idMatch) {
          throw new Error("無効なスプレッドシートURL");
        }

        spreadsheetId = idMatch[1];
        gid = gidMatch ? gidMatch[1] : "0"; // デフォルトGID

        // globalStateに保存
        window.globalState.spreadsheetId = spreadsheetId;
        window.globalState.gid = gid;
      }

      console.log("[step1-setup.js] [Step 1-4] ✅ globalStateから取得:");
      console.log(`  - スプレッドシートID: ${spreadsheetId}`);
      console.log(`  - GID: ${gid}`);
    }

    // スプレッドシートURLが取得できない場合、詳細なエラーメッセージを表示
    if (!spreadsheetId) {
      console.error("[step1-setup.js] [Step 1-4] スプレッドシートID未設定:");
      console.error(
        "  - globalState.spreadsheetId:",
        window.globalState?.spreadsheetId,
      );
      console.error(
        "  - globalState.spreadsheetUrl:",
        window.globalState?.spreadsheetUrl,
      );

      throw new Error(
        "スプレッドシートURLまたはIDが設定されていません。step0-ui-controller.jsでURLを入力してください。",
      );
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

    // 1-4-1: 全データ一括取得（初期設定用キャッシュ作成）
    console.log(
      "[step1-setup.js] [Step 1-4-1] 全データ一括取得開始 (A1:CZ100)",
    );
    console.log(
      `  - APIエンドポイント: ${window.globalState.sheetsApiBase}/${spreadsheetId}/values/A1:CZ100`,
    );

    const startTime = Date.now();
    const response = await fetchWithTokenRefresh(
      `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/A1:CZ100`,
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
      console.error("[step1-setup.js] [Step 1-4-1] API呼び出し失敗:");
      console.error(
        "  - URL:",
        `${window.globalState.sheetsApiBase}/${spreadsheetId}/values/A1:CZ100`,
      );
      console.error("  - HTTPステータス:", response.status);
      console.error("  - エラー内容:", error);
      console.error(
        "  - レスポンスヘッダー:",
        Object.fromEntries(response.headers.entries()),
      );

      if (response.status === 403) {
        throw new Error(
          `Google Sheets APIアクセス権限エラー: スプレッドシートへのアクセス権限がないか、APIキーが無効です (${response.status})`,
        );
      } else if (response.status === 404) {
        throw new Error(
          `スプレッドシートが見つかりません: スプレッドシートID "${spreadsheetId}" が存在しないか、共有設定を確認してください (${response.status})`,
        );
      } else {
        throw new Error(
          `Google Sheets API エラー: ${response.status} - ${error}`,
        );
      }
    }

    const data = await response.json();
    const allSheetData = data.values || [];

    // 初期設定用データをキャッシュ
    window.globalState.initialSheetData = allSheetData;
    console.log(
      `[step1-setup.js] [Step 1-4-1] ✅ 初期データキャッシュ完了: ${allSheetData.length}行`,
    );

    // A列データを抽出
    const columnA = allSheetData.map((row) => [row[0] || ""]);

    // 1-4-2: 特殊行の検索

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
    // 検索結果の検証
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

    // キャッシュからメニュー行データを取得
    if (!window.globalState.initialSheetData) {
      console.error(
        "[step1-setup.js] [Step 1-5-1] 初期データキャッシュが見つかりません",
      );
      return false;
    }

    const headerRow =
      window.globalState.initialSheetData[menuRowNumber - 1] || [];
    console.log(
      `[step1-setup.js] [Step 1-5-1] ✅ キャッシュからメニュー行取得: ${headerRow.length}列`,
    );

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
    const aiRow = window.globalState.initialSheetData[aiRowNumber - 1] || [];
    console.log(
      `[step1-setup.js] [Step 1-5-2] ✅ キャッシュからAI行取得: ${aiRow.length}列`,
    );

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
    // レスポンス取得

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
async function executeStep1(spreadsheetUrl) {
  console.log("＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝");
  console.log("[step1-setup.js] ステップ1: 初期設定 開始");
  console.log("＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝");

  try {
    // Global State確認
    console.log(`  - window.globalState存在: ${!!window.globalState}`);
    console.log(`  - chrome API利用可能: ${typeof chrome !== "undefined"}`);
    console.log(
      `  - globalThis.googleServices: ${!!globalThis.googleServices}`,
    );
    console.log(`  - 受け取ったスプレッドシートURL: ${spreadsheetUrl}`);

    // グローバルステートの初期化
    window.globalState = window.globalState || {};

    // スプレッドシートURLをglobalStateに設定
    if (spreadsheetUrl) {
      window.globalState.spreadsheetUrl = spreadsheetUrl;
      console.log(
        `[step1-setup.js] ✅ スプレッドシートURLをglobalStateに設定: ${spreadsheetUrl}`,
      );
    } else {
      console.warn(
        "[step1-setup.js] ⚠️ スプレッドシートURLが提供されていません",
      );
    }

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
    // globalState情報: 認証済み, スプレッドシートID, 特殊行情報

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

// Note: トークンリフレッシュ機能は前方で定義済み

// グローバルエクスポート
if (typeof window !== "undefined") {
  window.refreshAuthToken = refreshAuthToken;
  window.fetchWithTokenRefresh = fetchWithTokenRefresh;
}

console.log("[step1-setup.js] ✅ Step1関数定義完了（全体制御機能付き）");
console.log("[step1-setup.js] ✅ トークンリフレッシュ機能追加完了");
