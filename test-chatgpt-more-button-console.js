// ========================================
// ChatGPT「さらに表示」ボタンテスト
// ========================================
// ChatGPTのページで開発者コンソールを開いて、
// このコード全体をコピー&ペーストして実行してください

(async function () {
  const log = (msg) =>
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

  console.log("========================================");
  console.log("ChatGPT「さらに表示」ボタンテスト開始");
  console.log("========================================\n");

  // 実装と同じfindElementByText関数
  const findElementByText = (selector, text, parentElement = document) => {
    const elements = parentElement.querySelectorAll(selector);
    return Array.from(elements).find(
      (el) => el.textContent && el.textContent.trim().includes(text),
    );
  };

  // 1. メニューボタンを探す
  log("📍 ステップ1: メニューボタンを探索中...");
  const menuBtn =
    document.querySelector('[data-testid="composer-plus-btn"]') ||
    document.querySelector('button[aria-haspopup="menu"]');

  if (!menuBtn) {
    log("❌ メニューボタンが見つかりません");
    return;
  }

  log("✅ メニューボタン発見");

  // 2. メニューを開く
  log("📍 ステップ2: メニューを開きます...");
  menuBtn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  menuBtn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));

  // 3. 開いたメニューを確認
  const funcMenu =
    document.querySelector('[role="menu"][data-state="open"]') ||
    document.querySelector('[role="menu"]');

  if (!funcMenu) {
    log("❌ 機能メニューが開きませんでした");
    return;
  }

  log("✅ 機能メニューが開きました");
  console.log("funcMenu要素:", funcMenu);

  // 4. メニュー内のすべての項目を表示
  log("\n📍 ステップ3: メニュー項目を確認...");
  const allMenuItems = funcMenu.querySelectorAll('[role="menuitem"]');
  log(`[role="menuitem"]要素数: ${allMenuItems.length}`);

  console.log("\n--- メニュー項目一覧 ---");
  allMenuItems.forEach((item, i) => {
    const text = item.textContent?.trim();
    console.log(`  [${i}] "${text}"`);
  });
  console.log("--- メニュー項目一覧終了 ---\n");

  // 5. 「さらに表示」ボタンを検索（実装コードと同じ方法）
  log("📍 ステップ4: 「さらに表示」ボタンを検索...");
  const moreButton = findElementByText(
    '[role="menuitem"]',
    "さらに表示",
    funcMenu,
  );

  if (!moreButton) {
    log("❌ 「さらに表示」ボタンが見つかりません");
    log("💡 これは正常な場合があります（全機能が既に表示されている）");

    // 代替検索を試行
    log("\n🔧 代替検索を試行...");

    const alternatives = [
      { selector: '[role="menuitem"]', text: "Show more" },
      { selector: '[role="menuitem"]', text: "More" },
      { selector: "div", text: "さらに表示" },
      { selector: "button", text: "さらに表示" },
    ];

    for (const alt of alternatives) {
      const btn = findElementByText(alt.selector, alt.text, funcMenu);
      if (btn) {
        log(
          `✅ 代替検索で発見: selector="${alt.selector}", text="${alt.text}"`,
        );
        console.log("ボタン要素:", btn);
        break;
      } else {
        log(`  試行: selector="${alt.selector}", text="${alt.text}" → 未発見`);
      }
    }

    console.log("\n========================================");
    console.log("テスト完了: 「さらに表示」ボタンなし");
    console.log("========================================");
    return;
  }

  // 6. ボタンが見つかった場合
  log(`✅ 「さらに表示」ボタン発見: "${moreButton.textContent.trim()}"`);
  console.log("ボタン要素:", moreButton);

  // ボタンの状態確認
  const btnState = {
    visible: moreButton.offsetParent !== null,
    rect: moreButton.getBoundingClientRect(),
    display: window.getComputedStyle(moreButton).display,
    opacity: window.getComputedStyle(moreButton).opacity,
  };
  console.log("ボタン状態:", btnState);

  // 7. クリック実行
  log("\n📍 ステップ5: ボタンをクリック...");
  moreButton.click();
  await new Promise((r) => setTimeout(r, 1000));

  // 8. サブメニュー確認
  log("📍 ステップ6: サブメニューを確認...");
  const subMenu = document.querySelector('[data-side="right"]');

  if (subMenu) {
    log("✅ サブメニュー表示成功!");
    console.log("サブメニュー要素:", subMenu);

    const subItems = subMenu.querySelectorAll('[role="menuitemradio"]');
    log(`サブメニュー項目数: ${subItems.length}`);

    console.log("\n--- サブメニュー項目一覧 ---");
    subItems.forEach((item, i) => {
      console.log(`  [${i}] ${item.textContent.trim()}`);
    });
    console.log("--- サブメニュー項目一覧終了 ---\n");

    console.log("========================================");
    console.log("✅ テスト完了: すべて成功");
    console.log("========================================");
  } else {
    log("❌ サブメニューが表示されませんでした");

    // デバッグ情報
    log("🔍 すべてのメニューを確認:");
    document.querySelectorAll('[role="menu"]').forEach((menu, i) => {
      const side = menu.getAttribute("data-side");
      const state = menu.getAttribute("data-state");
      const items = menu.querySelectorAll('[role*="menu"]').length;
      console.log(
        `  Menu ${i}: side="${side}", state="${state}", items=${items}`,
      );
    });

    console.log("\n========================================");
    console.log("⚠️ テスト完了: サブメニュー表示失敗");
    console.log("========================================");
  }
})();
