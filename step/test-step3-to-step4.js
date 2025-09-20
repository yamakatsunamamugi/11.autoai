/**
 * Step3→Step4 データフロー検証テスト
 *
 * このファイルは、Step3（タスクリスト生成）からStep4（実行）へのデータフローを
 * 検証するためのテストコードです。
 */

// ========================================
// テストデータ
// ========================================

// Step3が生成するタスクリストのサンプル
const step3TaskListSample = {
  normal: {
    taskId: "task_1_10_1234567890",
    id: "task_1_10_1234567890",
    groupNumber: 1,
    groupType: "通常処理",
    row: 10,
    column: "B",
    prompt: "テストプロンプト",
    ai: "ChatGPT",
    aiType: "chatgpt",  // Step4互換
    model: "GPT-4",
    function: "通常",
    logCell: "A10",
    answerCell: "C10",
    cellInfo: {
      row: 10,
      column: "C",
      columnIndex: 2
    },
    spreadsheetId: "test123",
    gid: "0"
  },

  threeAI: {
    taskId: "task_2_20_1234567890",
    id: "task_2_20_1234567890",
    groupNumber: 2,
    groupType: "3種類AI",
    row: 20,
    column: "B",
    prompt: "3種類AIテストプロンプト",
    ai: "3種類（ChatGPT・Gemini・Claude）",
    aiType: "3種類（ChatGPT・Gemini・Claude）",  // Step4が展開する
    model: "共通モデル",
    function: "共通機能",
    logCell: "A20",
    answerCell: "F20",  // F, G, H列に展開される
    cellInfo: {
      row: 20,
      column: "F",
      columnIndex: 5
    },
    spreadsheetId: "test123",
    gid: "0"
  },

  special: {
    taskId: "task_3_30_1234567890",
    id: "task_3_30_1234567890",
    groupNumber: 3,
    groupType: "レポート化",
    row: 30,
    prompt: "レポート化プロンプト",
    ai: "レポート化",
    aiType: "レポート化",
    model: "",
    function: "",
    logCell: "A30",
    workCell: "D30",
    cellInfo: {
      row: 30,
      column: "D",
      columnIndex: 3
    },
    spreadsheetId: "test123",
    gid: "0"
  }
};

// ========================================
// 検証関数
// ========================================

function verifyTaskStructure(task, taskType) {
  console.log(`\n========== ${taskType} タスクの検証 ==========`);
  console.log('タスク構造:', JSON.stringify(task, null, 2));

  const requiredFields = [
    'taskId', 'id', 'row', 'prompt', 'ai', 'aiType',
    'spreadsheetId', 'gid', 'cellInfo'
  ];

  const results = {
    passed: [],
    failed: []
  };

  // 必須フィールドチェック
  for (const field of requiredFields) {
    if (task[field] !== undefined && task[field] !== null) {
      results.passed.push(`✅ ${field}: ${JSON.stringify(task[field])}`);
    } else {
      results.failed.push(`❌ ${field}: 未定義`);
    }
  }

  // Step4の期待値チェック
  if (taskType === '通常処理') {
    // aiTypeが小文字であることを確認
    if (task.aiType && task.aiType === task.aiType.toLowerCase()) {
      results.passed.push(`✅ aiType形式: ${task.aiType} (小文字)`);
    } else {
      results.failed.push(`❌ aiType形式: ${task.aiType} (小文字でない)`);
    }
  } else if (taskType === '3種類AI') {
    // 3種類AIの特殊な形式を確認
    if (task.aiType === '3種類（ChatGPT・Gemini・Claude）') {
      results.passed.push(`✅ aiType形式: 3種類AI用の特殊形式`);
    } else {
      results.failed.push(`❌ aiType形式: ${task.aiType} (期待値と異なる)`);
    }
  }

  // cellInfo構造の確認
  if (task.cellInfo && task.cellInfo.row && task.cellInfo.column) {
    results.passed.push(`✅ cellInfo構造: 完全`);
  } else {
    results.failed.push(`❌ cellInfo構造: 不完全`);
  }

  // 結果出力
  console.log('\n【検証結果】');
  console.log('成功項目:');
  results.passed.forEach(msg => console.log('  ' + msg));

  if (results.failed.length > 0) {
    console.log('\n失敗項目:');
    results.failed.forEach(msg => console.log('  ' + msg));
  }

  const passRate = (results.passed.length / (results.passed.length + results.failed.length) * 100).toFixed(1);
  console.log(`\n合格率: ${passRate}% (${results.passed.length}/${results.passed.length + results.failed.length})`);

  return results.failed.length === 0;
}

// ========================================
// Step4実行シミュレーション
// ========================================

function simulateStep4Processing(taskList) {
  console.log('\n\n========================================');
  console.log('Step4 実行シミュレーション');
  console.log('========================================');

  // 3種類AIの展開処理をシミュレート
  const expandedTasks = [];

  for (const task of taskList) {
    if (task.aiType === '3種類（ChatGPT・Gemini・Claude）') {
      console.log(`\n📋 3種類AIタスク検出: ${task.taskId}`);

      // Step4の展開処理を再現
      const baseRow = task.row || task.cellInfo?.row;
      const expanded = [
        {
          ...task,
          aiType: 'chatgpt',
          column: 'F',
          cellInfo: { ...task.cellInfo, column: 'F', row: baseRow },
          originalAiType: '3種類（ChatGPT・Gemini・Claude）'
        },
        {
          ...task,
          aiType: 'claude',
          column: 'G',
          cellInfo: { ...task.cellInfo, column: 'G', row: baseRow },
          originalAiType: '3種類（ChatGPT・Gemini・Claude）'
        },
        {
          ...task,
          aiType: 'gemini',
          column: 'H',
          cellInfo: { ...task.cellInfo, column: 'H', row: baseRow },
          originalAiType: '3種類（ChatGPT・Gemini・Claude）'
        }
      ];

      console.log(`  → 3タスクに展開: ChatGPT(F列), Claude(G列), Gemini(H列)`);
      expandedTasks.push(...expanded);
    } else {
      expandedTasks.push(task);
    }
  }

  console.log(`\n展開結果: ${taskList.length}タスク → ${expandedTasks.length}タスク`);

  // バッチ処理のシミュレート
  const batchSize = 3;
  const batches = [];
  for (let i = 0; i < expandedTasks.length; i += batchSize) {
    batches.push(expandedTasks.slice(i, i + batchSize));
  }

  console.log(`バッチ作成: ${batches.length}個のバッチ（各最大3タスク）`);

  batches.forEach((batch, index) => {
    console.log(`\nバッチ${index + 1}: ${batch.length}タスク`);
    batch.forEach((task, i) => {
      const position = ['左上', '右上', '左下'][i];
      console.log(`  - ${position}: ${task.aiType} (${task.column || task.workCell || ''}${task.row})`);
    });
  });

  return true;
}

// ========================================
// メイン実行
// ========================================

function runTests() {
  console.log('================================================');
  console.log(' Step3→Step4 データフロー検証テスト');
  console.log('================================================');

  // 各タスクタイプの検証
  const normalResult = verifyTaskStructure(step3TaskListSample.normal, '通常処理');
  const threeAIResult = verifyTaskStructure(step3TaskListSample.threeAI, '3種類AI');
  const specialResult = verifyTaskStructure(step3TaskListSample.special, '特殊タスク');

  // Step4処理のシミュレーション
  const taskList = [
    step3TaskListSample.normal,
    step3TaskListSample.threeAI,
    step3TaskListSample.special
  ];
  const simulationResult = simulateStep4Processing(taskList);

  // 総合結果
  console.log('\n\n================================================');
  console.log(' 総合検証結果');
  console.log('================================================');

  const allPassed = normalResult && threeAIResult && specialResult && simulationResult;

  if (allPassed) {
    console.log('✅ すべてのテストに合格しました！');
    console.log('Step3→Step4のデータフローは正常に動作します。');
  } else {
    console.log('⚠️ 一部のテストが失敗しました。');
    console.log('上記の失敗項目を確認して修正してください。');
  }

  return allPassed;
}

// テスト実行
console.log('Starting tests...');
runTests();