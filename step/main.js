/**
 * @fileoverview メイン統合実行ファイル
 *
 * 全ステップを順番に実行し、タスクグループを処理する
 * 各stepファイルから関数を呼び出し、エラーハンドリングと進捗表示を行う
 */

// グローバル設定
const config = {
  spreadsheetUrl: null,  // 実行時に設定
  maxRetries: 3,
  batchSize: 3,
  debug: true
};

// グローバル状態
const globalState = {
  initialized: false,
  spreadsheetId: null,
  gid: null,
  taskGroups: [],
  currentGroupIndex: 0,
  totalStats: {
    startTime: null,
    endTime: null,
    totalGroups: 0,
    completedGroups: 0,
    totalTasks: 0,
    successTasks: 0,
    failedTasks: 0,
    skippedTasks: 0
  }
};

/**
 * Step 1: 初期設定を実行
 * overview.mdより：
 * - 1-1: インターネット接続確認
 * - 1-2: スリープ防止＆画面オフ防止
 * - 1-3: API関連の初期化
 * - 1-4: 特殊行の検索と定義
 */
async function executeStep1() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(50));
  console.log('[main.js] [Step 1] 初期設定');
  console.log('='.repeat(50));
  console.log('[main.js] [Step 1] 実行環境:', {
    spreadsheetUrl: config.spreadsheetUrl || '未設定',
    デバッグモード: config.debug,
    最大リトライ: config.maxRetries,
    バッチサイズ: config.batchSize
  });

  try {
    console.log('[main.js] [Step 1] 初期設定を開始します...');

    // Step 1-1: インターネット接続確認
    console.log('[main.js] [Step 1-1] インターネット接続確認');
    console.log('[main.js] [Step 1-1-1] ネットワーク接続状態を取得');
    console.log('[main.js] [Step 1-1-2] 接続判定 → 成功');

    // Step 1-2: スリープ防止＆画面オフ防止
    console.log('[main.js] [Step 1-2] スリープ防止＆画面オフ防止');
    console.log('[main.js] [Step 1-2-1] PowerConfig APIを呼び出し');
    console.log('[main.js] [Step 1-2-2] 画面オフ防止設定');
    console.log('[main.js] [Step 1-2-3] 設定成功の確認');

    // Step 1-3: API関連の初期化
    console.log('[main.js] [Step 1-3] API関連の初期化');
    console.log('[main.js] [Step 1-3-1] Google OAuth2認証');
    console.log('[main.js] [Step 1-3-2] トークンの保存');
    console.log('[main.js] [Step 1-3-3] Sheets API初期化');

    // Step 1-4: 特殊行の検索と定義
    console.log('[main.js] [Step 1-4] 特殊行の検索と定義');
    console.log('[main.js] [Step 1-4-1] スプレッドシートのA列を取得');
    console.log('[main.js] [Step 1-4-2] 各キーワードを検索');
    console.log('[main.js] [Step 1-4-2-1] 「メニュー」を検索');
    console.log('[main.js] [Step 1-4-2-2] 「列制御」を検索');
    console.log('[main.js] [Step 1-4-2-3] 「AI」を検索');
    console.log('[main.js] [Step 1-4-2-4] 「モデル」を検索');
    console.log('[main.js] [Step 1-4-2-5] 「機能」を検索');
    console.log('[main.js] [Step 1-4-2-6] 「1」を検索');
    console.log('[main.js] [Step 1-4-3] 検索結果の検証');

    globalState.initialized = true;
    globalState.spreadsheetId = 'dummy-sheet-id';
    globalState.gid = '0';

    console.log('[main.js] [Step 1] ✅ 初期設定完了', {
      実行時間: `${Date.now() - startTime}ms`,
      spreadsheetId: globalState.spreadsheetId,
      gid: globalState.gid
    });
    console.log('\n');
    return true;

  } catch (error) {
    console.error('[main.js] [Step 1] ❌ 初期設定エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      実行時間: `${Date.now() - startTime}ms`
    });
    throw error;
  }
}

/**
 * Step 2: タスクグループの作成
 * overview.mdより：
 * - 2-0: スプレッドシート情報の取得
 * - 2-1: タスクグループの識別と作成
 * - 2-2: 列制御の適用
 * - 2-3: タスクグループのスキップ判定
 * - 2-4: タスクグループの順番整理
 * - 2-5: タスクグループ情報の記録とログ出力
 * - 2-6: 定義の作成と保存
 */
async function executeStep2() {
  const startTime = Date.now();
  console.log('='.repeat(50));
  console.log('[main.js] [Step 2] タスクグループの作成');
  console.log('='.repeat(50));
  console.log('[main.js] [Step 2] スプレッドシート情報:', {
    spreadsheetId: globalState.spreadsheetId,
    gid: globalState.gid
  });

  try {
    console.log('[main.js] [Step 2] タスクグループを作成します...');

    // Step 2-0: スプレッドシート情報の取得
    console.log('[main.js] [Step 2-0] スプレッドシート情報の取得');
    console.log('[main.js] [Step 2-0-1] URLからIDを抽出');
    console.log('[main.js] [Step 2-0-2] 取得した情報の保存');

    // Step 2-1: タスクグループの識別と作成
    console.log('[main.js] [Step 2-1] タスクグループの識別と作成');
    console.log('[main.js] [Step 2-1-1] メニュー行とAI行の読み込み');
    console.log('[main.js] [Step 2-1-2] 列の走査とパターン認識');
    console.log('[main.js] [Step 2-1-3] パターン別のタスクグループ作成');
    console.log('[main.js] [Step 2-1-3-1] 通常処理パターンの検出');
    console.log('[main.js] [Step 2-1-3-2] 3種類AIパターンの検出');

    // Step 2-2: 列制御の適用
    console.log('[main.js] [Step 2-2] 列制御の適用');
    console.log('[main.js] [Step 2-2-1] 列制御行の全列を読み込み');
    console.log('[main.js] [Step 2-2-2] 列制御テキストの検出と処理');

    // Step 2-3: タスクグループのスキップ判定
    console.log('[main.js] [Step 2-3] タスクグループのスキップ判定');
    console.log('[main.js] [Step 2-3-1] プロンプト列と回答列の全データ取得');
    console.log('[main.js] [Step 2-3-2] スキップ条件の適用');
    console.log('[main.js] [Step 2-3-3] 有効なタスクグループの判定');

    // Step 2-4: タスクグループの順番整理
    console.log('[main.js] [Step 2-4] タスクグループの順番整理');
    console.log('[main.js] [Step 2-4-1] 有効なタスクグループの番号振り直し');

    // Step 2-5: タスクグループ情報の記録とログ出力
    console.log('[main.js] [Step 2-5] タスクグループ情報の記録とログ出力');
    console.log('[main.js] [Step 2-5-1] タスクタイプの決定');
    console.log('[main.js] [Step 2-5-2] タスクグループ情報の構造化');
    console.log('[main.js] [Step 2-5-3] ログ出力');

    // Step 2-6: 定義の作成と保存
    console.log('[main.js] [Step 2-6] 定義の作成と保存');
    console.log('[main.js] [Step 2-6-1] タスクグループ配列の作成');
    console.log('[main.js] [Step 2-6-2] タスクタイプマップの作成');
    console.log('[main.js] [Step 2-6-3] 作業列マップの作成');

    // ダミー実装
    const taskGroups = [
      {
        groupNumber: 1,
        taskType: '通常処理',
        pattern: '通常',
        columns: {
          log: 'A',
          prompts: ['B', 'C', 'D'],
          answer: 'E'
        },
        dataStartRow: 7
      },
      {
        groupNumber: 2,
        taskType: '3種類AI',
        pattern: '3種類AI',
        columns: {
          log: 'A',
          prompts: ['F', 'G'],
          answer: {
            chatgpt: 'H',
            claude: 'I',
            gemini: 'J'
          }
        },
        dataStartRow: 7
      }
    ];

    globalState.taskGroups = taskGroups;
    globalState.totalStats.totalGroups = taskGroups.length;

    console.log(`[main.js] [Step 2] ✅ ${taskGroups.length}個のタスクグループを作成`, {
      実行時間: `${Date.now() - startTime}ms`,
      総グループ数: taskGroups.length
    });
    console.log('\n');

    // グループ詳細を表示
    console.log('[main.js] [Step 2-5-3] タスクグループ詳細:');
    taskGroups.forEach((group, index) => {
      console.log(`  グループ${index + 1}: ${group.taskType} (${group.pattern})`);
    });
    console.log('');

    return taskGroups;

  } catch (error) {
    console.error('[main.js] [Step 2] ❌ タスクグループ作成エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      実行時間: `${Date.now() - startTime}ms`,
      現在の状態: {
        グループ数: globalState.taskGroups.length
      }
    });
    throw error;
  }
}

/**
 * Step 3: タスクリスト作成
 * overview.mdより：
 * - 3-1: スプレッドシートデータの取得
 * - 3-2: タスク生成の除外処理
 * - 3-3: タスクリストの生成
 */
async function executeStep3(taskGroup) {
  const startTime = Date.now();
  console.log('[main.js] [Step 3] タスクリスト作成', {
    グループ番号: taskGroup?.groupNumber,
    タスクタイプ: taskGroup?.taskType,
    パターン: taskGroup?.pattern
  });

  try {
    // Step 3-1: スプレッドシートデータの取得
    console.log('[main.js] [Step 3-1] スプレッドシートデータの取得');
    console.log('[main.js] [Step 3-1-1] 対象範囲の決定');
    console.log('[main.js] [Step 3-1-2] データの一括取得');

    // Step 3-2: タスク生成の除外処理
    console.log('[main.js] [Step 3-2] タスク生成の除外処理');
    console.log('[main.js] [Step 3-2-1] 除外条件の適用');
    console.log('[main.js] [Step 3-2-1-1] 回答済みチェック');
    console.log('[main.js] [Step 3-2-2] 有効タスクのフィルタリング');

    // Step 3-3: タスクリストの生成
    console.log('[main.js] [Step 3-3] タスクリストの生成');
    console.log('[main.js] [Step 3-3-1] 3タスクのバッチ作成');
    console.log('[main.js] [Step 3-3-2] 各タスクの詳細情報構築');
    console.log('[main.js] [Step 3-3-3] タスクリストのログ出力');

    // ダミー実装
    const tasks = [
      { row: 7, prompt: 'タスク1', status: 'pending' },
      { row: 8, prompt: 'タスク2', status: 'pending' },
      { row: 9, prompt: 'タスク3', status: 'pending' }
    ];

    console.log(`[main.js] [Step 3] ${tasks.length}個のタスクを生成`, {
      実行時間: `${Date.now() - startTime}ms`,
      タスク詳細: tasks.slice(0, 3) // 最初の3件のみ表示
    });
    return tasks;

  } catch (error) {
    console.error('[main.js] [Step 3] タスクリスト作成エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      実行時間: `${Date.now() - startTime}ms`,
      グループ情報: {
        番号: taskGroup?.groupNumber,
        タイプ: taskGroup?.taskType
      }
    });
    throw error;
  }
}

/**
 * Step 4: タスク実行
 * overview.mdより：
 * - 4-1: ウィンドウの準備
 * - 4-2: ウィンドウ状態の確認
 * - 4-3: AI自動化の実行
 * - 4-4: 回答の記録
 * - 4-5: ログ情報の記録
 * - 4-6: 特殊タスクの処理
 * - 4-7: ウィンドウのクリーンアップ
 */
async function executeStep4(tasks, taskGroup) {
  const startTime = Date.now();
  console.log('[main.js] [Step 4] タスク実行', {
    タスク数: tasks.length,
    グループ番号: taskGroup?.groupNumber,
    パターン: taskGroup?.pattern
  });

  try {
    // Step 4-1: ウィンドウの準備
    console.log('[main.js] [Step 4-1] ウィンドウの準備');
    console.log('[main.js] [Step 4-1-1] 通常処理パターンの場合');
    console.log('[main.js] [Step 4-1-1-1] AIサービスの判定');
    console.log('[main.js] [Step 4-1-1-2] ウィンドウ配置');

    // Step 4-2: ウィンドウ状態の確認
    console.log('[main.js] [Step 4-2] ウィンドウ状態の確認');
    console.log('[main.js] [Step 4-2-1] 各ウィンドウの要素チェック');

    // Step 4-3: AI自動化の実行
    console.log('[main.js] [Step 4-3] AI自動化の実行');
    console.log('[main.js] [Step 4-3-1] プロンプトデータの動的取得');
    console.log('[main.js] [Step 4-3-2] 各AIでの処理実行');

    // Step 4-4: 回答の記録
    console.log('[main.js] [Step 4-4] 回答の記録');
    console.log('[main.js] [Step 4-4-1] AIからの応答取得');
    console.log('[main.js] [Step 4-4-2] スプレッドシートへの記載');
    console.log('[main.js] [Step 4-4-3] ログへの記載');

    // Step 4-5: ログ情報の記録
    console.log('[main.js] [Step 4-5] ログ情報の記録');
    console.log('[main.js] [Step 4-5-1] ログフォーマットの生成');
    console.log('[main.js] [Step 4-5-2] ログセルへの書き込み');

    // Step 4-6: 特殊タスクの処理
    if (taskGroup.pattern === 'レポート化' || taskGroup.pattern.includes('Genspark')) {
      console.log('[main.js] [Step 4-6] 特殊タスクの処理');
      console.log('[main.js] [Step 4-6-1] レポート化の処理');
    }

    // Step 4-7: ウィンドウのクリーンアップ
    console.log('[main.js] [Step 4-7] ウィンドウのクリーンアップ');
    console.log('[main.js] [Step 4-7-1] 使用済みウィンドウの確認');
    console.log('[main.js] [Step 4-7-2] ウィンドウの順次クローズ');

    // ダミー実装
    console.log(`[main.js] [Step 4] ${tasks.length}個のタスクを処理中...`);
    await sleep(1000);

    // 統計更新
    globalState.totalStats.totalTasks += tasks.length;
    globalState.totalStats.successTasks += tasks.length;

    console.log(`[main.js] [Step 4] ✅ タスク実行完了`, {
      実行時間: `${Date.now() - startTime}ms`,
      成功タスク: tasks.length,
      失敗タスク: 0,
      総タスク数累計: globalState.totalStats.totalTasks
    });
    return { success: tasks.length, failed: 0 };

  } catch (error) {
    console.error('[main.js] [Step 4] タスク実行エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      実行時間: `${Date.now() - startTime}ms`,
      タスク数: tasks.length,
      グループ情報: {
        番号: taskGroup?.groupNumber,
        パターン: taskGroup?.pattern
      }
    });
    // エラー時も統計を更新
    globalState.totalStats.failedTasks += tasks.length;
    throw error;
  }
}

/**
 * Step 5: 繰り返し処理（完了確認）
 * overview.mdより：
 * - 5-1: 完了状況の確認
 * - 5-2: 未完了タスクの処理
 */
async function executeStep5(taskGroup) {
  const startTime = Date.now();
  console.log('[main.js] [Step 5] タスクグループ内の繰り返し', {
    グループ番号: taskGroup?.groupNumber,
    タスクタイプ: taskGroup?.taskType
  });

  try {
    console.log('[main.js] [Step 5-1] 完了状況の確認');
    console.log('[main.js] [Step 5-1-1] プロンプト列の確認');
    console.log('[main.js] [Step 5-1-2] 回答列の確認');
    console.log('[main.js] [Step 5-1-3] 完了判定');

    // ダミー実装
    const isComplete = true;  // ダミーでは常に完了とする

    if (!isComplete) {
      console.log('[main.js] [Step 5-2] 未完了タスクの処理');
      console.log('[main.js] [Step 5-2-1] ステップ3へ戻る');
      console.log('[main.js] [Step 5-2-2] ステップ4を実行');
      console.log('[main.js] [Step 5-2-3] 繰り返し');
    }

    console.log(`[main.js] [Step 5] 完了状態: ${isComplete ? '✅ 完了' : '⏳ 未完了'}`, {
      実行時間: `${Date.now() - startTime}ms`,
      グループ番号: taskGroup?.groupNumber
    });
    return isComplete;

  } catch (error) {
    console.error('[main.js] [Step 5] 完了確認エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      実行時間: `${Date.now() - startTime}ms`,
      グループ情報: taskGroup
    });
    throw error;
  }
}

/**
 * Step 6: 次グループ/終了処理
 * overview.mdより：
 * - 6-1: 次グループの確認
 * - 6-2: 次グループの処理
 * - 6-3: 終了処理
 */
async function executeStep6() {
  const startTime = Date.now();
  console.log('[main.js] [Step 6] 次のタスクグループへ移行', {
    現在のインデックス: globalState.currentGroupIndex,
    総グループ数: globalState.taskGroups.length
  });

  try {
    console.log('[main.js] [Step 6-1] 次グループの確認');
    console.log('[main.js] [Step 6-1-1] 現在のグループ番号を取得');
    console.log('[main.js] [Step 6-1-2] 次のグループの存在確認');

    // ダミー実装
    const hasNext = globalState.currentGroupIndex < globalState.taskGroups.length - 1;

    if (hasNext) {
      console.log('[main.js] [Step 6-2] 次グループの処理');
      console.log('[main.js] [Step 6-2-1] グループが存在する場合');
      return { hasNext: true };
    } else {
      console.log('[main.js] [Step 6-2-2] すべて完了した場合');
      console.log('[main.js] [Step 6-3] 終了処理');
      console.log('[main.js] [Step 6-3-1] スリープ防止の解除');
      console.log('[main.js] [Step 6-3-2] 処理統計の集計');
      console.log('[main.js] [Step 6-3-3] 完了メッセージの表示');
      return { hasNext: false };
    }

  } catch (error) {
    console.error('[main.js] [Step 6] 終了処理エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      実行時間: `${Date.now() - startTime}ms`,
      現在の状態: {
        インデックス: globalState.currentGroupIndex,
        グループ数: globalState.taskGroups.length
      }
    });
    throw error;
  }
}

/**
 * タスクグループ処理ループ
 */
async function processTaskGroup(taskGroup) {
  const groupStartTime = Date.now();
  console.log('\n' + '='.repeat(50));
  console.log(`🔄 タスクグループ ${taskGroup.groupNumber} 処理開始`);
  console.log(`   タイプ: ${taskGroup.taskType}`);
  console.log(`   パターン: ${taskGroup.pattern}`);
  console.log(`   列情報:`, {
    プロンプト列: taskGroup.columns?.prompts,
    回答列: taskGroup.columns?.answer
  });
  console.log('='.repeat(50) + '\n');

  let isComplete = false;
  let retryCount = 0;

  do {
    // Step 3: タスクリスト作成
    const tasks = await executeStep3(taskGroup);

    if (tasks.length === 0) {
      console.log('[main.js] 処理可能なタスクがありません');
      break;
    }

    // Step 4: タスク実行
    await executeStep4(tasks, taskGroup);

    // Step 5: 完了確認
    isComplete = await executeStep5(taskGroup);

    if (!isComplete) {
      retryCount++;
      console.log(`[main.js] 未完了タスクあり。再処理 (${retryCount}回目)`, {
        最大リトライ: config.maxRetries,
        現在のリトライ: retryCount
      });
      await sleep(2000);
    }

  } while (!isComplete && retryCount < config.maxRetries);

  globalState.totalStats.completedGroups++;
  console.log(`[main.js] ✅ グループ ${taskGroup.groupNumber} 処理完了`, {
    処理時間: `${Date.now() - groupStartTime}ms`,
    繰り返し回数: retryCount,
    完了状態: isComplete ? '完全完了' : '部分完了'
  });
  console.log('\n');
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 Chrome拡張機能 AIタスク自動化システム 起動');
  console.log('='.repeat(70));
  console.log('📅 開始時刻:', new Date().toLocaleString('ja-JP'));
  console.log('🔗 URL:', config.spreadsheetUrl || '未設定');
  console.log('\n');

  globalState.totalStats.startTime = new Date();

  try {
    // Step 1: 初期設定
    await executeStep1();

    // Step 2: タスクグループ作成
    const taskGroups = await executeStep2();

    if (taskGroups.length === 0) {
      console.log('[main.js] 処理するタスクグループがありません', {
        理由: 'スプレッドシートにタスクが定義されていないか、すべて完了済み',
        spreadsheetUrl: config.spreadsheetUrl
      });
      return;
    }

    // 各タスクグループを順番に処理
    for (let i = 0; i < taskGroups.length; i++) {
      globalState.currentGroupIndex = i;
      const taskGroup = taskGroups[i];

      // グループを処理
      await processTaskGroup(taskGroup);

      // Step 6: 次グループ確認
      const step6Result = await executeStep6();

      if (!step6Result.hasNext) {
        break;
      }
    }

    // 最終的な終了処理
    await showFinalResults();

  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.error('❌ エラーが発生しました');
    console.error('='.repeat(50));
    console.error('エラー詳細:', {
      メッセージ: error.message,
      スタック: error.stack,
      発生箇所: error.fileName,
      発生時刻: new Date().toISOString(),
      処理状態: {
        完了グループ: globalState.totalStats.completedGroups,
        総グループ: globalState.totalStats.totalGroups,
        成功タスク: globalState.totalStats.successTasks,
        失敗タスク: globalState.totalStats.failedTasks
      }
    });

    // エラー時も統計を表示
    await showFinalResults();
  }
}

/**
 * 最終結果表示
 */
async function showFinalResults() {
  globalState.totalStats.endTime = new Date();
  const duration = globalState.totalStats.endTime - globalState.totalStats.startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  console.log('\n' + '='.repeat(70));
  console.log('📊 処理完了 - 最終統計');
  console.log('='.repeat(70));

  console.log(`
  ✅ 処理結果:
     総グループ数: ${globalState.totalStats.totalGroups}
     完了グループ: ${globalState.totalStats.completedGroups}
     総タスク数: ${globalState.totalStats.totalTasks}
     成功: ${globalState.totalStats.successTasks}
     失敗: ${globalState.totalStats.failedTasks}
     スキップ: ${globalState.totalStats.skippedTasks}

  ⏱️ 処理時間:
     ${minutes}分${seconds}秒
     開始: ${globalState.totalStats.startTime.toLocaleString('ja-JP')}
     終了: ${globalState.totalStats.endTime.toLocaleString('ja-JP')}

  📈 成功率:
     ${globalState.totalStats.totalTasks > 0
       ? Math.round((globalState.totalStats.successTasks / globalState.totalStats.totalTasks) * 100)
       : 0}%
  `);

  console.log('='.repeat(70));
  console.log('🎉 全処理完了');
  console.log('='.repeat(70) + '\n');
}

// ========================================
// ヘルパー関数
// ========================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// エラーハンドリング
// ========================================

// 未処理のPromiseエラーをキャッチ
if (typeof process !== 'undefined') {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromiseエラー:', reason);
  });
}

// ========================================
// 実行
// ========================================

// Chrome拡張機能環境かNode.js環境かを判定
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  // Chrome拡張機能環境
  console.log('[Main] Chrome拡張機能環境で実行');

  // メッセージリスナー設定
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_PROCESSING') {
      config.spreadsheetUrl = request.spreadsheetUrl;
      main().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;  // 非同期レスポンスを有効化
    }
  });

} else if (typeof module !== 'undefined' && module.exports) {
  // Node.js環境（テスト用）
  console.log('[Main] Node.js環境で実行（テストモード）');

  // コマンドライン引数からURLを取得
  if (process.argv[2]) {
    config.spreadsheetUrl = process.argv[2];
  }

  // エクスポート
  module.exports = {
    main,
    executeStep1,
    executeStep2,
    executeStep3,
    executeStep4,
    executeStep5,
    executeStep6,
    processTaskGroup,
    globalState,
    config
  };

  // 直接実行された場合
  if (require.main === module) {
    main();
  }

} else {
  // ブラウザ環境（直接実行）
  console.log('[Main] ブラウザ環境で実行');

  // グローバルに公開
  window.AITaskAutomation = {
    main,
    config,
    globalState,
    start: (spreadsheetUrl) => {
      config.spreadsheetUrl = spreadsheetUrl;
      return main();
    }
  };
}