// ========================================
// Claude機能選択テストコード
// 作成日時: 2025年9月24日
// 用途: Claude.aiで機能（じっくり考える、ウェブ検索など）を選択するテスト
// ========================================

(async function () {
  "use strict";

  console.log("===== Claude機能選択テスト開始（全機能OFF → 選択） =====");
  console.log(`実行時刻: ${new Date().toLocaleString("ja-JP")}`);

  // ========================================
  // ステップ1: 機能メニューを開く
  // ========================================
  console.log("\n【ステップ1】機能メニューを開く");

  const menuButton = document.querySelector('[data-testid="input-menu-tools"]');
  if (!menuButton) {
    console.error("❌ メニューボタンが見つかりません");
    return;
  }

  menuButton.click();
  await new Promise((r) => setTimeout(r, 1500));
  console.log("✅ メニューを開きました");

  // ========================================
  // ステップ2: すべてのトグル機能を検出
  // ========================================
  console.log("\n【ステップ2】すべてのトグル機能を検出");

  const toggleButtons = document.querySelectorAll(
    'button:has(input[role="switch"])',
  );
  console.log(`検出されたトグル数: ${toggleButtons.length}`);

  const features = [];
  toggleButtons.forEach((button, index) => {
    const label = button.querySelector("p.font-base");
    const labelText = label ? label.textContent.trim() : "";
    const input = button.querySelector('input[role="switch"]');
    const isChecked = input ? input.checked : false;

    features.push({
      index: index,
      text: labelText,
      element: button,
      input: input,
      checked: isChecked,
    });

    console.log(
      `  [${index}] "${labelText}" - 現在の状態: ${isChecked ? "ON" : "OFF"}`,
    );
  });

  // ========================================
  // ステップ3: すべての機能をOFFにする
  // ========================================
  console.log("\n【ステップ3】すべての機能をOFFにする");
  console.log("─".repeat(50));

  for (const feature of features) {
    if (feature.input.checked) {
      console.log(`🔄 "${feature.text}"をOFFに設定中...`);
      feature.element.click();
      await new Promise((r) => setTimeout(r, 500));

      // 状態確認（再取得）
      const newState = feature.input.checked;
      console.log(`  → ${feature.text}: ${newState ? "⚠️ まだON" : "✅ OFF"}`);
    } else {
      console.log(`  ✓ "${feature.text}": すでにOFF`);
    }
  }

  console.log("\n✅ すべての機能をOFFにしました");

  // ========================================
  // ステップ4: 状態確認（全OFF確認）
  // ========================================
  console.log("\n【ステップ4】全機能OFF状態の確認");
  console.log("─".repeat(50));

  const verifyButtons = document.querySelectorAll(
    'button:has(input[role="switch"])',
  );
  verifyButtons.forEach((button) => {
    const label = button.querySelector("p.font-base");
    const labelText = label ? label.textContent.trim() : "(ラベルなし)";
    const input = button.querySelector('input[role="switch"]');
    const isChecked = input ? input.checked : false;

    console.log(`  "${labelText}": ${isChecked ? "❌ ON" : "✅ OFF"}`);
  });

  // ========================================
  // 機能選択関数を定義（グローバル）
  // ========================================
  window.selectFeature = async function (targetFeatures) {
    console.log("\n========== 機能選択実行 ==========");

    // 配列に変換
    const featuresToSelect = Array.isArray(targetFeatures)
      ? targetFeatures
      : [targetFeatures];

    console.log(`選択する機能: ${featuresToSelect.join(", ")}`);
    console.log("─".repeat(50));

    // 最新の機能リストを取得
    const currentButtons = document.querySelectorAll(
      'button:has(input[role="switch"])',
    );
    const currentFeatures = [];

    currentButtons.forEach((button) => {
      const label = button.querySelector("p.font-base");
      const labelText = label ? label.textContent.trim() : "";
      const input = button.querySelector('input[role="switch"]');

      currentFeatures.push({
        text: labelText,
        element: button,
        input: input,
      });
    });

    // 各機能を選択
    for (const targetFeatureName of featuresToSelect) {
      const targetFeature = currentFeatures.find(
        (f) => f.text === targetFeatureName,
      );

      if (targetFeature) {
        console.log(`\n🎯 「${targetFeatureName}」を選択`);
        console.log(
          `  - 現在の状態: ${targetFeature.input.checked ? "ON" : "OFF"}`,
        );

        if (!targetFeature.input.checked) {
          console.log(`  - クリックして状態を変更...`);
          targetFeature.element.click();
          await new Promise((r) => setTimeout(r, 500));

          // 状態確認
          const newState = targetFeature.input.checked;
          console.log(`  - 新しい状態: ${newState ? "✅ ON" : "❌ OFF"}`);
        } else {
          console.log(`  - すでにONです`);
        }
      } else {
        console.error(`❌ 「${targetFeatureName}」が見つかりません`);
        console.log("利用可能な機能:");
        currentFeatures.forEach((f) => console.log(`  - "${f.text}"`));
      }
    }

    // 最終状態表示
    console.log("\n【最終状態】");
    console.log("─".repeat(50));

    const finalButtons = document.querySelectorAll(
      'button:has(input[role="switch"])',
    );
    finalButtons.forEach((button) => {
      const label = button.querySelector("p.font-base");
      const labelText = label ? label.textContent.trim() : "(ラベルなし)";
      const input = button.querySelector('input[role="switch"]');
      const isChecked = input ? input.checked : false;

      const emoji = featuresToSelect.includes(labelText) ? "🎯" : "  ";
      console.log(`${emoji} "${labelText}": ${isChecked ? "✅ ON" : "⬜ OFF"}`);
    });

    console.log("\n✅ 機能選択完了");
    console.log(`終了時刻: ${new Date().toLocaleString("ja-JP")}`);
  };

  // メニューを閉じる関数
  window.closeMenu = function () {
    const menuBtn = document.querySelector('[data-testid="input-menu-tools"]');
    if (menuBtn) {
      menuBtn.click();
      console.log("✅ メニューを閉じました");
    } else {
      console.log("❌ メニューボタンが見つかりません");
    }
  };

  // すべてオフにする関数（再利用可能）
  window.allOff = async function () {
    console.log("\n========== すべての機能をOFFにする ==========");
    const buttons = document.querySelectorAll(
      'button:has(input[role="switch"])',
    );

    for (const button of buttons) {
      const label = button.querySelector("p.font-base");
      const labelText = label ? label.textContent.trim() : "";
      const input = button.querySelector('input[role="switch"]');

      if (input && input.checked) {
        console.log(`🔄 "${labelText}"をOFFに設定中...`);
        button.click();
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log("✅ すべての機能をOFFにしました");
  };

  // 専用セレクタのテスト関数
  window.testSelectors = function (featureName) {
    console.log(`\n========== ${featureName}のセレクタテスト ==========`);

    const selectors = {
      じっくり考える: [
        'button:has(svg path[d*="M10.3857 2.50977"]):has(input[role="switch"])',
        'button:has(p:contains("じっくり考える")):has(input[role="switch"])',
        'button input[role="switch"][style*="width: 28px"]',
        'div:contains("じっくり考える") button:has(.group\\/switch)',
        'button .font-base:contains("じっくり考える")',
      ],
      ウェブ検索: [
        'button:has(svg path[d*="M7.2705 3.0498"]):has(input[role="switch"])',
        'button:has(p:contains("ウェブ検索")):has(input[role="switch"])',
        'button.text-primary-500:has(input[role="switch"])',
        'div:contains("ウェブ検索") button:has(.group\\/switch)',
        'button .font-base:contains("ウェブ検索")',
      ],
    };

    const testSelectors = selectors[featureName] || [];

    for (const selector of testSelectors) {
      try {
        if (selector.includes(":contains")) {
          const buttons = document.querySelectorAll(
            'button:has(input[role="switch"])',
          );
          let found = false;
          for (const btn of buttons) {
            const label = btn.querySelector("p.font-base");
            if (label && label.textContent.trim() === featureName) {
              console.log(`✅ セレクタで発見: ${selector} (特別処理)`);
              found = true;
              break;
            }
          }
          if (!found) {
            console.log(`❌ 見つからない: ${selector}`);
          }
        } else {
          const element = document.querySelector(selector);
          if (element) {
            console.log(`✅ セレクタで発見: ${selector}`);
          } else {
            console.log(`❌ 見つからない: ${selector}`);
          }
        }
      } catch (e) {
        console.log(`⚠️ セレクタエラー: ${selector}`);
      }
    }
  };

  console.log("\n===== 初期設定完了 =====");
  console.log("\n使用可能なコマンド:");
  console.log("┌─────────────────────────────────────────────────────┐");
  console.log('│ selectFeature("じっくり考える")     // 単一選択    │');
  console.log('│ selectFeature("ウェブ検索")          // 単一選択    │');
  console.log('│ selectFeature("Drive検索")           // 単一選択    │');
  console.log('│ selectFeature(["じっくり考える", "ウェブ検索"])    │');
  console.log("│                                      // 複数選択    │");
  console.log("│ allOff()                             // 全OFF      │");
  console.log('│ testSelectors("じっくり考える")     // セレクタ検証│');
  console.log('│ testSelectors("ウェブ検索")         // セレクタ検証│');
  console.log("│ closeMenu()                          // メニュー閉じる│");
  console.log("└─────────────────────────────────────────────────────┘");
})();
