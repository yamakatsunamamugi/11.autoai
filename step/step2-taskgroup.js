/**
 * ステップ2: タスクグループの作成
 * スプレッドシート構造を解析してタスクグループを識別・生成
 */

// グローバル状態を使用（step1と共有）
if (!window.globalState) {
  window.globalState = {
    spreadsheetId: null,
    gid: null,
    taskGroups: [],
    taskTypeMap: {},
    workColumnMap: {},
    columnControls: {},
    skipInfo: {},
    currentGroupIndex: 0,
    stats: {
      totalGroups: 0,
      completedGroups: 0,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0
    }
  };
}

// ========================================
// 2-0. スプレッドシート情報の取得
// ========================================
function extractSpreadsheetInfo() {
  console.log('========');
  console.log('[step2-taskgroup.js] [Step 2-0] スプレッドシート情報の取得');
  console.log('========');

  // 2-0-1. URLからIDを抽出
  const url = window.location.href;
  console.log(`[step2-taskgroup.js] [Step 2-0-1] 現在のURL: ${url}`);

  const spreadsheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/#gid=([0-9]+)/);

  console.log('[step2-taskgroup.js] [Step 2-0-1] URLパターンマッチング結果:');
  console.log(`  - スプレッドシートIDマッチ: ${spreadsheetIdMatch ? '成功' : '失敗'}`);
  console.log(`  - GIDマッチ: ${gidMatch ? '成功' : '失敗'}`);

  const spreadsheetId = spreadsheetIdMatch ? spreadsheetIdMatch[1] : null;
  const gid = gidMatch ? gidMatch[1] : '0';

  // 2-0-2. 取得した情報の保存
  console.log('[step2-taskgroup.js] [Step 2-0-2] 抽出情報を保存');
  window.globalState.spreadsheetId = spreadsheetId;
  window.globalState.gid = gid;

  console.log(`  - スプレッドシートID: ${spreadsheetId}`);
  console.log(`  - GID: ${gid}`);
  console.log(`  - シート名: ${gid === '0' ? 'デフォルトシート' : `シート${gid}`}`);

  if (!spreadsheetId) {
    console.error('[step2-taskgroup.js] [Step 2-0-2] ⚠️ スプレッドシートIDが取得できませんでした');
    console.error('  - 原因: URLが正しいGoogleスプレッドシートではない可能性');
  }

  return { spreadsheetId, gid };
}

// ========================================
// 2-1. タスクグループの識別と作成
// ========================================
async function identifyTaskGroups() {
  console.log('========');
  console.log('[step2-taskgroup.js] [Step 2-1] タスクグループの識別開始');
  console.log('========');

  const setupResult = window.setupResult || JSON.parse(localStorage.getItem('step1Result'));
  if (!setupResult) {
    console.error('[step2-taskgroup.js] [Step 2-1] ❌ ステップ1の結果が取得できません');
    console.error('  - window.setupResult: ', window.setupResult);
    console.error('  - localStorage.step1Result: ', localStorage.getItem('step1Result') ? 'あり' : 'なし');
    throw new Error('ステップ1の結果が見つかりません');
  }

  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { menuRow, aiRow } = specialRows;

  // 2-1-1. メニュー行とAI行の読み込み
  console.log('[step2-taskgroup.js] [Step 2-1-1] メニュー行とAI行の読み込み開始');
  console.log(`  - メニュー行: ${menuRow}行目`);
  console.log(`  - AI行: ${aiRow}行目`);

  const menuRange = `${menuRow}:${menuRow}`; // メニュー行全体
  const aiRange = `${aiRow}:${aiRow}`; // AI行全体

  try {
    // メニュー行取得
    console.log(`[step2-taskgroup.js] [Step 2-1-1] メニュー行取得: ${menuRange}`);
    const menuStartTime = Date.now();
    const menuResponse = await fetch(
      `${sheetsApiBase}/${spreadsheetId}/values/${menuRange}`,
      { headers: apiHeaders }
    );
    const menuFetchTime = Date.now() - menuStartTime;

    console.log(`  - ステータス: ${menuResponse.status}`);
    console.log(`  - 応答時間: ${menuFetchTime}ms`);

    const menuData = await menuResponse.json();
    const menuValues = menuData.values ? menuData.values[0] : [];

    // AI行取得
    console.log(`[step2-taskgroup.js] [Step 2-1-1] AI行取得: ${aiRange}`);
    const aiStartTime = Date.now();
    const aiResponse = await fetch(
      `${sheetsApiBase}/${spreadsheetId}/values/${aiRange}`,
      { headers: apiHeaders }
    );
    const aiFetchTime = Date.now() - aiStartTime;

    console.log(`  - ステータス: ${aiResponse.status}`);
    console.log(`  - 応答時間: ${aiFetchTime}ms`);

    const aiData = await aiResponse.json();
    const aiValues = aiData.values ? aiData.values[0] : [];

    console.log(`[step2-taskgroup.js] [Step 2-1-1] 取得データ概要:`);
    console.log(`  - メニュー行列数: ${menuValues.length}`);
    console.log(`  - AI行列数: ${aiValues.length}`);
    console.log(`  - メニュー行先頭5列: ${menuValues.slice(0, 5).join(', ')}`);
    console.log(`  - AI行先頭5列: ${aiValues.slice(0, 5).join(', ')}`);

    // 2-1-2. 列の走査とパターン認識（stream-processor-v2.jsのロジックを採用）
    console.log('[step2-taskgroup.js] [Step 2-1-2] 列の走査とパターン認識開始');
    const taskGroups = [];
    let groupCounter = 1;
    let currentGroup = null;
    let processedColumns = 0;

    menuValues.forEach((header, index) => {
      processedColumns++;
      const columnLetter = columnToLetter(index);
      const trimmedHeader = header ? header.trim() : '';
      const aiValue = aiValues[index] || '';

      // デバッグ用：各列の内容を詳細に記録（最初の20列）
      if (index < 20 && (trimmedHeader || aiValue)) {
        console.log(`  [${columnLetter}] メニュー:"${trimmedHeader}" / AI:"${aiValue}"`);
      }

      // ログ列の検出（stream-processor-v2.jsより）
      if (trimmedHeader === 'ログ' || trimmedHeader.includes('ログ')) {
        console.log(`[step2-taskgroup.js] [Step 2-1-2] ログ列検出: ${columnLetter}列`);

        // 前のグループが完成していれば保存
        if (currentGroup && currentGroup.answerColumns && currentGroup.answerColumns.length > 0) {
          console.log(`  - 前のグループ${currentGroup.groupNumber}を保存`);
          taskGroups.push(currentGroup);
          groupCounter++;
          currentGroup = null;
        }

        // 新しいグループを開始
        currentGroup = {
          id: `group_${groupCounter}`,
          name: `タスクグループ${groupCounter}`,
          groupNumber: groupCounter,
          type: '通常処理',
          startColumn: columnLetter,
          endColumn: columnLetter,
          logColumn: columnLetter,
          promptColumns: [],
          answerColumns: [],
          groupType: 'single',
          aiType: aiValue || 'Claude',
          dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
          sequenceOrder: groupCounter,
          startCol: index,
          endCol: index
        };
      }

      // 2-1-3. 特殊グループの検出（レポート化、Genspark）
      if (trimmedHeader === 'レポート化' ||
          trimmedHeader.includes('Genspark（スライド）') ||
          trimmedHeader.includes('Genspark（ファクトチェック）')) {

        console.log(`[step2-taskgroup.js] [Step 2-1-3] 特殊グループ検出: ${trimmedHeader} (${columnLetter}列)`);

        // 前のグループがあれば完了させる
        if (currentGroup && (currentGroup.answerColumns.length > 0 ||
            ['report', 'genspark_slide', 'genspark_factcheck'].includes(currentGroup.groupType))) {
          taskGroups.push(currentGroup);
          groupCounter++;
        }

        // 特殊グループタイプの判定
        let groupType = 'report';
        let aiType = 'Report';
        if (trimmedHeader.includes('Genspark（スライド）')) {
          groupType = 'genspark_slide';
          aiType = 'Genspark-Slides';
        } else if (trimmedHeader.includes('Genspark（ファクトチェック）')) {
          groupType = 'genspark_factcheck';
          aiType = 'Genspark-FactCheck';
        }

        // 特殊グループを作成
        const specialGroup = {
          id: `group_${groupCounter}`,
          name: `タスクグループ${groupCounter}`,
          groupNumber: groupCounter,
          type: trimmedHeader.includes('レポート') ? 'レポート化' :
                trimmedHeader.includes('スライド') ? 'Gensparkスライド' : 'Gensparkファクトチェック',
          startColumn: columnLetter,
          endColumn: columnLetter,
          column: columnLetter,
          promptColumns: [columnLetter],
          answerColumns: [],
          groupType: groupType,
          aiType: aiType,
          ai: aiType,
          dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
          sequenceOrder: groupCounter,
          isSpecialGroup: true,
          startCol: index,
          endCol: index
        };

        taskGroups.push(specialGroup);
        console.log(`  - ✅ タスクグループ${groupCounter}: ${specialGroup.type}パターンを登録`);
        groupCounter++;
        currentGroup = null;
      }

      // プロンプト列の検出
      if (trimmedHeader.includes('プロンプト')) {
        console.log(`[step2-taskgroup.js] [Step 2-1-2] プロンプト列検出: ${columnLetter}列 ("${trimmedHeader}")`);
        // 前のグループが完成していれば新しいグループを開始
        if (currentGroup && currentGroup.promptColumns.length > 0 &&
            currentGroup.answerColumns.length > 0) {
          taskGroups.push(currentGroup);
          groupCounter++;
          currentGroup = null;
        }

        // 現在のグループがない場合、新しいグループを開始
        if (!currentGroup) {
          currentGroup = {
            id: `group_${groupCounter}`,
            name: `タスクグループ${groupCounter}`,
            groupNumber: groupCounter,
            type: '通常処理',
            startColumn: columnLetter,
            endColumn: columnLetter,
            logColumn: null,
            promptColumns: [columnLetter],
            answerColumns: [],
            groupType: 'single',
            aiType: aiValue || 'Claude',
            ai: aiValue,
            dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
            sequenceOrder: groupCounter,
            startCol: index,
            endCol: index
          };
        } else {
          // 既存のグループにプロンプト列を追加
          currentGroup.promptColumns.push(columnLetter);
          currentGroup.endCol = index;
        }

        // AI行の値からグループタイプを判定
        if (aiValue.includes('3種類')) {
          console.log(`  - 3種類AIパターンとして設定 (AI値: "${aiValue}")`);
          currentGroup.groupType = '3type';
          currentGroup.type = '3種類AI';
          currentGroup.aiType = aiValue;
        } else if (aiValue) {
          console.log(`  - 通常処理パターンとして設定 (AI: "${aiValue}")`);
          currentGroup.groupType = 'single';
          currentGroup.aiType = aiValue;
        }
      }

      // 回答列の検出
      if (currentGroup && (trimmedHeader.includes('回答') || trimmedHeader.includes('答'))) {
        console.log(`[step2-taskgroup.js] [Step 2-1-2] 回答列検出: ${columnLetter}列 ("${trimmedHeader}")`);

        // AIタイプを判定（stream-processor-v2.jsのdetectAITypeFromHeaderロジック）
        let detectedAiType = 'Claude';
        if (currentGroup.groupType === '3type' || currentGroup.type === '3種類AI') {
          const headerLower = trimmedHeader.toLowerCase();
          if (headerLower.includes('chatgpt') || headerLower.includes('gpt')) {
            detectedAiType = 'ChatGPT';
            currentGroup.chatgptColumn = columnLetter;
          } else if (headerLower.includes('claude')) {
            detectedAiType = 'Claude';
            currentGroup.claudeColumn = columnLetter;
          } else if (headerLower.includes('gemini')) {
            detectedAiType = 'Gemini';
            currentGroup.geminiColumn = columnLetter;
          }
        } else {
          currentGroup.answerColumn = columnLetter;
        }

        currentGroup.answerColumns.push({
          column: columnLetter,
          index: index,
          aiType: detectedAiType
        });
        currentGroup.endColumn = columnLetter;
        currentGroup.endCol = index;
      }
    });

    // 最後のグループを追加
    if (currentGroup && currentGroup.answerColumns.length > 0) {
      taskGroups.push(currentGroup);
      console.log(`✅ タスクグループ${currentGroup.groupNumber}: ${currentGroup.type}パターン`);
    }

    // 全列処理完了
    console.log(`[step2-taskgroup.js] [Step 2-1-2] 列走査完了: ${processedColumns}列を処理`);

    // タスクグループごとにサマリー出力
    console.log('[step2-taskgroup.js] [Step 2-1] 検出されたタスクグループサマリー:');
    taskGroups.forEach(group => {
      console.log(`  グループ${group.groupNumber}: ${group.type}`);
      console.log(`    - 範囲: ${group.startColumn}〜${group.endColumn}列`);
      console.log(`    - AI: ${group.aiType || group.ai || '未設定'}`);
      if (group.promptColumns && group.promptColumns.length > 0) {
        console.log(`    - プロンプト列: ${group.promptColumns.join(', ')}`);
      }
      if (group.answerColumns && group.answerColumns.length > 0) {
        console.log(`    - 回答列: ${group.answerColumns.map(a => a.column).join(', ')}`);
      }
    });

    window.globalState.taskGroups = taskGroups;
    console.log(`[step2-taskgroup.js] [Step 2-1] ✅ 合計${taskGroups.length}個のタスクグループを検出`);
    return taskGroups;

  } catch (error) {
    console.error('[step2-taskgroup.js] [Step 2-1] ❌ タスクグループ識別エラー詳細:');
    console.error(`  - エラー名: ${error.name}`);
    console.error(`  - メッセージ: ${error.message}`);
    console.error(`  - スタック: ${error.stack}`);
    throw error;
  }
}

// ========================================
// 2-2. 列制御の適用
// ========================================
async function applyColumnControls() {
  console.log('========');
  console.log('[step2-taskgroup.js] [Step 2-2] 列制御の適用');
  console.log('========');

  const setupResult = window.setupResult || JSON.parse(localStorage.getItem('step1Result'));
  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { controlRow } = specialRows;

  if (!controlRow) {
    console.log('[step2-taskgroup.js] [Step 2-2] 列制御行が定義されていません - 列制御処理をスキップ');
    return;
  }

  console.log(`[step2-taskgroup.js] [Step 2-2] 列制御行: ${controlRow}行目`);

  // 2-2-1. 列制御行の全列を読み込み
  const controlRange = `${controlRow}:${controlRow}`;
  console.log(`[step2-taskgroup.js] [Step 2-2-1] 列制御行データ取得: ${controlRange}`);

  try {
    const startTime = Date.now();
    const response = await fetch(
      `${sheetsApiBase}/${spreadsheetId}/values/${controlRange}`,
      { headers: apiHeaders }
    );
    const fetchTime = Date.now() - startTime;

    console.log(`  - ステータス: ${response.status}`);
    console.log(`  - 応答時間: ${fetchTime}ms`);

    const data = await response.json();
    const controlValues = data.values ? data.values[0] : [];

    console.log(`[step2-taskgroup.js] [Step 2-2-1] 取得データ: ${controlValues.length}列`);
    console.log(`  - 有効な制御: ${controlValues.filter(v => v).length}個`);

    // 2-2-2. 列制御テキストの検出と処理
    console.log('[step2-taskgroup.js] [Step 2-2-2] 列制御テキストの検出開始');
    const controls = {
      startFrom: null,
      stopAfter: null,
      onlyProcess: []
    };

    let controlCount = 0;
    controlValues.forEach((text, index) => {
      if (!text) return;

      const column = columnToLetter(index);
      const groupIndex = findGroupByColumn(column);

      console.log(`  [${column}] 制御テキスト: "${text}"`);

      // 2-2-2-1. 「この列から処理」の検出
      if (text.includes('この列から処理')) {
        controls.startFrom = groupIndex;
        controlCount++;
        console.log(`[step2-taskgroup.js] [Step 2-2-2-1] ✅ 「この列から処理」検出: ${column}列 (グループ${groupIndex})`);
      }

      // 2-2-2-2. 「この列の処理後に停止」の検出
      if (text.includes('この列の処理後に停止')) {
        controls.stopAfter = groupIndex;
        controlCount++;
        console.log(`[step2-taskgroup.js] [Step 2-2-2-2] ✅ 「この列の処理後に停止」検出: ${column}列 (グループ${groupIndex})`);
      }

      // 2-2-2-3. 「この列のみ処理」の検出
      if (text.includes('この列のみ処理')) {
        controls.onlyProcess.push(groupIndex);
        controlCount++;
        console.log(`[step2-taskgroup.js] [Step 2-2-2-3] ✅ 「この列のみ処理」検出: ${column}列 (グループ${groupIndex})`);
      }
    });

    console.log(`[step2-taskgroup.js] [Step 2-2-2] 列制御検出完了: ${controlCount}個の制御を検出`);

    // 2-2-3. 複数の列制御がある場合の処理
    console.log('[step2-taskgroup.js] [Step 2-2-3] 列制御の適用開始');
    const taskGroups = window.globalState.taskGroups;
    let skipCount = 0;

    if (controls.onlyProcess.length > 0) {
      // 「この列のみ処理」が優先
      console.log(`[step2-taskgroup.js] [Step 2-2-3] 「この列のみ処理」モード: グループ${controls.onlyProcess.join(', ')}のみ処理`);

      taskGroups.forEach((group, index) => {
        if (!controls.onlyProcess.includes(index + 1)) {
          group.skip = true;
          skipCount++;
          console.log(`  - グループ${group.groupNumber}をスキップ設定`);
        }
      });
    } else {
      // 範囲制御の適用
      if (controls.startFrom) {
        console.log(`[step2-taskgroup.js] [Step 2-2-3] 開始位置制御: グループ${controls.startFrom}から開始`);
        taskGroups.forEach((group) => {
          if (group.groupNumber < controls.startFrom) {
            group.skip = true;
            skipCount++;
            console.log(`  - グループ${group.groupNumber}をスキップ（開始前）`);
          }
        });
      }

      if (controls.stopAfter) {
        console.log(`[step2-taskgroup.js] [Step 2-2-3] 終了位置制御: グループ${controls.stopAfter}で停止`);
        taskGroups.forEach((group) => {
          if (group.groupNumber > controls.stopAfter) {
            group.skip = true;
            skipCount++;
            console.log(`  - グループ${group.groupNumber}をスキップ（終了後）`);
          }
        });
      }
    }

    console.log(`[step2-taskgroup.js] [Step 2-2-3] 列制御適用完了: ${skipCount}個のグループをスキップ設定`);

    window.globalState.columnControls = controls;

  } catch (error) {
    console.error('[step2-taskgroup.js] [Step 2-2] ❌ 列制御適用エラー詳細:');
    console.error(`  - エラー名: ${error.name}`);
    console.error(`  - メッセージ: ${error.message}`);
    console.error('  - 注: 列制御エラーでも処理は継続します');
    // エラーでも処理を続行
  }
}

// ========================================
// 2-3. タスクグループのスキップ判定
// ========================================
async function applySkipConditions() {
  console.log('========');
  console.log('[step2-taskgroup.js] [Step 2-3] スキップ判定の適用');
  console.log('========');

  const setupResult = window.setupResult || JSON.parse(localStorage.getItem('step1Result'));
  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { dataStartRow } = specialRows;
  const taskGroups = window.globalState.taskGroups;

  // 2-3-1. プロンプト列と回答列の全データ取得
  console.log('[step2-taskgroup.js] [Step 2-3-1] 各グループのプロンプト/回答データを取得');
  let checkedGroups = 0;
  let skippedByData = 0;

  for (const group of taskGroups) {
    if (group.skip) {
      console.log(`  - グループ${group.groupNumber}: 既にスキップ設定済み`);
      continue;
    }

    checkedGroups++;
    console.log(`[step2-taskgroup.js] [Step 2-3-1] グループ${group.groupNumber}のデータチェック`);

    try {
      // データ範囲を決定（データ開始行から100行）
      const endRow = dataStartRow + 99;

      if (group.type === '通常処理' || group.type === '3種類AI') {
        // プロンプト列の最初の列を取得
        const promptCol = group.promptColumns[0];
        const range = `${promptCol}${dataStartRow}:${promptCol}${endRow}`;

        const promptResponse = await fetch(
          `${sheetsApiBase}/${spreadsheetId}/values/${range}`,
          { headers: apiHeaders }
        );
        const promptData = await promptResponse.json();
        const promptValues = promptData.values || [];

        // 回答列を取得
        let answerCol;
        if (group.type === '通常処理') {
          answerCol = group.answerColumn;
        } else {
          answerCol = group.chatgptColumn; // 3種類AIの場合は最初の回答列で判定
        }

        const answerRange = `${answerCol}${dataStartRow}:${answerCol}${endRow}`;
        const answerResponse = await fetch(
          `${sheetsApiBase}/${spreadsheetId}/values/${answerRange}`,
          { headers: apiHeaders }
        );
        const answerData = await answerResponse.json();
        const answerValues = answerData.values || [];

        console.log(`  - プロンプトデータ: ${promptValues.length}行`);
        console.log(`  - 回答データ: ${answerValues.length}行`);

        // 2-3-2. スキップ条件の適用
        console.log('[step2-taskgroup.js] [Step 2-3-2] スキップ条件を適用中...');
        let hasUnprocessedTask = false;
        let processedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < promptValues.length; i++) {
          const promptText = promptValues[i] && promptValues[i][0];
          const answerText = answerValues[i] && answerValues[i][0];
          const rowNum = dataStartRow + i;

          // プロンプトがあって回答がない場合は処理対象
          if (promptText && !answerText) {
            hasUnprocessedTask = true;
            processedCount++;
            if (processedCount <= 3) { // 最初の3件をログ
              console.log(`    - 行${rowNum}: 未処理（プロンプトあり/回答なし）`);
            }
          } else if (promptText && answerText) {
            skippedCount++;
            if (skippedCount <= 3) { // 最初の3件をログ
              console.log(`    - 行${rowNum}: 処理済み（プロンプトあり/回答あり）`);
            }
          }
        }

        // 2-3-3. 有効なタスクグループの判定
        console.log('[step2-taskgroup.js] [Step 2-3-3] 判定結果:');
        if (!hasUnprocessedTask) {
          group.skip = true;
          skippedByData++;
          console.log(`  - グループ${group.groupNumber}: 未処理タスクなし → スキップ`);
          console.log(`    (処理済み: ${skippedCount}行, 未処理: ${processedCount}行)`);
        } else {
          console.log(`  - グループ${group.groupNumber}: 処理対象`);
          console.log(`    (処理済み: ${skippedCount}行, 未処理: ${processedCount}行)`);
        }
      }

    } catch (error) {
      console.error(`[step2-taskgroup.js] [Step 2-3] グループ${group.groupNumber}のスキップ判定エラー:`);
      console.error(`  - エラー: ${error.message}`);
      console.error('  - 注: エラー発生時は安全のため処理対象として扱います');
      // エラーの場合はスキップしない
    }
  }

  console.log('[step2-taskgroup.js] [Step 2-3] スキップ判定完了:');
  console.log(`  - チェックしたグループ: ${checkedGroups}`);
  console.log(`  - データによるスキップ: ${skippedByData}`);
}

// ========================================
// 2-4. タスクグループの順番整理
// ========================================
function reorganizeTaskGroups() {
  console.log('========');
  console.log('[step2-taskgroup.js] [Step 2-4] タスクグループの順番整理');
  console.log('========');

  const taskGroups = window.globalState.taskGroups;

  // 2-4-1. 有効なタスクグループの番号振り直し
  console.log('[step2-taskgroup.js] [Step 2-4-1] 有効グループの番号振り直し開始');
  const activeGroups = taskGroups.filter(group => !group.skip);
  const skippedGroups = taskGroups.filter(group => group.skip);

  console.log(`  - 元のグループ数: ${taskGroups.length}`);
  console.log(`  - スキップグループ: ${skippedGroups.length}`);
  console.log(`  - 有効グループ: ${activeGroups.length}`);

  let renumberCount = 0;
  activeGroups.forEach((group, index) => {
    const oldNumber = group.groupNumber;
    group.groupNumber = index + 1;
    if (oldNumber !== group.groupNumber) {
      renumberCount++;
      console.log(`  - グループ番号変更: ${oldNumber} → ${group.groupNumber} (${group.type})`);
    }
  });

  if (renumberCount === 0) {
    console.log('  - 番号変更なし（連続したグループ）');
  }

  console.log(`[step2-taskgroup.js] [Step 2-4] ✅ 順番整理完了: ${activeGroups.length}個の有効グループ`);
  return activeGroups;
}

// ========================================
// 2-5. タスクグループ情報の記録とログ出力
// ========================================
async function logTaskGroups() {
  console.log('========');
  console.log('2-5. タスクグループ情報のログ出力');
  console.log('========');

  const setupResult = window.setupResult || JSON.parse(localStorage.getItem('step1Result'));
  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { modelRow, menuRow } = specialRows;
  const taskGroups = window.globalState.taskGroups.filter(g => !g.skip);

  // モデル行とメニュー行を取得
  let modelValues = [];
  let menuValues = [];

  try {
    if (modelRow) {
      const modelRange = `${modelRow}:${modelRow}`;
      const modelResponse = await fetch(
        `${sheetsApiBase}/${spreadsheetId}/values/${modelRange}`,
        { headers: apiHeaders }
      );
      const modelData = await modelResponse.json();
      modelValues = modelData.values ? modelData.values[0] : [];
    }

    const menuRange = `${menuRow}:${menuRow}`;
    const menuResponse = await fetch(
      `${sheetsApiBase}/${spreadsheetId}/values/${menuRange}`,
      { headers: apiHeaders }
    );
    const menuData = await menuResponse.json();
    menuValues = menuData.values ? menuData.values[0] : [];

  } catch (error) {
    console.error('行データ取得エラー:', error);
  }

  // 2-5-1. タスクタイプの決定と2-5-3. ログ出力
  taskGroups.forEach(group => {
    let taskType = group.type;

    // タスクタイプをより詳細に設定
    if (group.type === '通常処理' || group.type === '3種類AI') {
      const modelText = modelValues[group.startCol] || '';
      if (modelText) {
        taskType = modelText;
      }
    }

    // 2-5-2. タスクグループ情報の構造化
    const structuredInfo = {
      groupNumber: group.groupNumber,
      taskType: taskType,
      columns: {}
    };

    if (group.type === '通常処理') {
      structuredInfo.columns = {
        log: group.logColumn,
        prompts: group.promptColumns,
        answer: group.answerColumn
      };
    } else if (group.type === '3種類AI') {
      structuredInfo.columns = {
        log: group.logColumn,
        prompts: group.promptColumns,
        answer: {
          chatgpt: group.chatgptColumn,
          claude: group.claudeColumn,
          gemini: group.geminiColumn
        }
      };
    } else {
      structuredInfo.columns = {
        column: group.column
      };
    }

    // taskTypeMapとworkColumnMapを更新
    window.globalState.taskTypeMap[group.groupNumber] = taskType;
    window.globalState.workColumnMap[group.groupNumber] = structuredInfo.columns;

    // ログ出力
    console.log('＝＝＝＝＝＝＝＝');
    console.log(`タスクグループ${group.groupNumber}`);
    console.log(`タスク: ${taskType}`);

    if (group.type === '通常処理') {
      console.log(`ログ: ${group.logColumn}`);
      console.log(`プロンプト: ${group.promptColumns.join('~')}`);
      console.log(`回答: ${group.answerColumn}`);
    } else if (group.type === '3種類AI') {
      console.log(`ログ: ${group.logColumn}`);
      console.log(`プロンプト: ${group.promptColumns.join('~')}`);
      console.log(`ChatGPT回答: ${group.chatgptColumn}`);
      console.log(`Claude回答: ${group.claudeColumn}`);
      console.log(`Gemini回答: ${group.geminiColumn}`);
    } else {
      console.log(`作業列: ${group.column}`);
    }
    console.log('＝＝＝＝＝＝＝＝');
  });
}

// ========================================
// 2-6. 定義の作成と保存
// ========================================
function saveDefinitions() {
  console.log('========');
  console.log('2-6. 定義の作成と保存');
  console.log('========');

  const activeGroups = window.globalState.taskGroups.filter(g => !g.skip);

  // 2-6-1. タスクグループ配列の作成（既に完了）
  console.log(`タスクグループ配列: ${activeGroups.length}個`);

  // 2-6-2. タスクタイプマップの作成（2-5で完了）
  console.log('タスクタイプマップ:', window.globalState.taskTypeMap);

  // 2-6-3. 作業列マップの作成（2-5で完了）
  console.log('作業列マップ:', window.globalState.workColumnMap);

  // localStorageに保存
  localStorage.setItem('step2Result', JSON.stringify(window.globalState));

  console.log('✅ 定義の保存完了');
  return window.globalState;
}

// ========================================
// ユーティリティ関数
// ========================================
function columnToLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

function findGroupByColumn(column) {
  const taskGroups = window.globalState.taskGroups;
  for (const group of taskGroups) {
    const colIndex = letterToColumn(column);
    if (colIndex >= group.startCol && colIndex <= group.endCol) {
      return group.groupNumber;
    }
  }
  return null;
}

function letterToColumn(letter) {
  let column = 0;
  for (let i = 0; i < letter.length; i++) {
    column = column * 26 + (letter.charCodeAt(i) - 64);
  }
  return column - 1; // 0-based index
}

// ========================================
// メイン実行関数
// ========================================
async function executeStep2() {
  console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');
  console.log('[step2-taskgroup.js] ステップ2: タスクグループ作成 開始');
  console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');

  try {
    // 2-0: スプレッドシート情報取得
    extractSpreadsheetInfo();

    // 2-1: タスクグループ識別
    await identifyTaskGroups();

    // 2-2: 列制御適用
    await applyColumnControls();

    // 2-3: スキップ判定
    await applySkipConditions();

    // 2-4: 順番整理
    reorganizeTaskGroups();

    // 2-5: ログ出力
    await logTaskGroups();

    // 2-6: 定義保存
    saveDefinitions();

    console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');
    console.log('[step2-taskgroup.js] ✅ ステップ2: タスクグループ作成 完了');
    console.log('＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝');

    return window.globalState;

  } catch (error) {
    console.error('[step2-taskgroup.js] ❌ ステップ2 エラー:', error);
    throw error;
  }
}

// エクスポート（モジュールとして使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executeStep2TaskGroups,
    extractSpreadsheetInfo,
    createTaskGroups,
    applyColumnControls,
    skipTaskGroups,
    renumberTaskGroups,
    recordTaskGroupInfo,
    createDefinitions
  };
}

// グローバル関数として公開（ブラウザ環境用）
if (typeof window !== 'undefined') {
  window.executeStep2TaskGroups = executeStep2TaskGroups;
  window.extractSpreadsheetInfo = extractSpreadsheetInfo;
  window.createTaskGroups = createTaskGroups;
  window.applyColumnControls = applyColumnControls;
  window.skipTaskGroups = skipTaskGroups;
  window.renumberTaskGroups = renumberTaskGroups;
  window.recordTaskGroupInfo = recordTaskGroupInfo;
  window.createDefinitions = createDefinitions;
}

// 自動実行（直接読み込まれた場合）
if (typeof window !== 'undefined' && !window.step2Executed) {
  window.step2Executed = true;

  // ステップ1の完了を待つ
  const waitForStep1 = () => {
    if (window.setupResult || localStorage.getItem('step1Result')) {
      executeStep2();
    } else {
      console.log('ステップ1の完了待機中...');
      setTimeout(waitForStep1, 1000);
    }
  };

  // DOMContentLoadedを待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForStep1);
  } else {
    waitForStep1();
  }
}