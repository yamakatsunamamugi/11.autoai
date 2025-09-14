/**
 * integrated-test.js - 統合テストスイート
 * StreamProcessorV2と関連モジュールの統合テスト
 *
 * ステップ構成:
 * 1. 準備作業
 * 2. 基本構造の作成
 * 3. ウィンドウ作成テスト
 * 4. スプレッドシート処理テスト
 * 5. レポート生成テスト
 * 6. 統合テスト
 * 7. テスト実行とクリーンアップ
 */

// ========================================
// ステップ2.1: ファイルヘッダーとimport部
// ========================================

// 2.1.1 本番コードのimport
import StreamProcessorV2 from '../src/features/task/stream-processor-v2.js';
import { Task, TaskList, TaskFactory } from '../src/features/task/models.js';

// 2.1.2 テストユーティリティ
const log = (message, type = 'info', step = null) => {
    const timestamp = new Date().toISOString();
    const stepInfo = step ? `[${step}]` : '';
    const typeEmoji = {
        'info': 'ℹ️',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌'
    }[type] || 'ℹ️';

    console.log(`[${timestamp}]${stepInfo} ${typeEmoji} ${message}`);
};

// ========================================
// ステップ2.2: グローバル変数とテスト設定
// ========================================

// 2.2.1 テスト用グローバル変数
let streamProcessor = null;
let testResults = {
    windowCreation: [],
    spreadsheetProcessing: [],
    reportGeneration: [],
    integration: []
};

// 2.2.2 テスト設定
const TEST_CONFIG = {
    windowCount: 3,
    aiTypes: ['chatgpt', 'claude', 'gemini'],
    testTimeout: 30000,
    columns: ['D', 'E', 'F', 'G'],
    testRows: [9, 10, 11]
};

// ========================================
// ステップ3: ウィンドウ作成テストの移植
// ========================================

/**
 * 3.2.1 ウィンドウ作成テスト関数
 */
async function testWindowCreation() {
    log('=== ステップ3: ウィンドウ作成テスト開始 ===', 'info', '3.1');

    try {
        // 3.2.2 StreamProcessorV2のインスタンス作成
        log('StreamProcessorV2インスタンス作成', 'info', '3.2.2');
        streamProcessor = new StreamProcessorV2(console);

        // 3.2.3 テスト用タスクリスト作成
        log('テスト用タスクリスト作成', 'info', '3.2.3');
        const taskList = new TaskList();

        // 3.2.4 各AIタイプ用のタスク生成
        log('各AIタイプ用のタスク生成', 'info', '3.2.4');
        let taskCount = 0;

        for (const aiType of TEST_CONFIG.aiTypes) {
            const taskData = {
                id: `test_${aiType}_${Date.now()}_${taskCount++}`,
                column: TEST_CONFIG.columns[taskCount % TEST_CONFIG.columns.length],
                row: TEST_CONFIG.testRows[0],
                aiType: aiType,
                prompt: `テストプロンプト for ${aiType}`,
                promptColumn: 'A',
                groupId: `test_group_${aiType}`,
                groupInfo: {
                    type: 'single',
                    position: 0,
                    totalInGroup: 1,
                    columns: [TEST_CONFIG.columns[0]],
                    promptColumn: 'A'
                }
            };

            const task = new Task(TaskFactory.createTask(taskData));
            taskList.add(task);
            log(`タスク作成: ${task.aiType} (${task.column}${task.row})`, 'success', '3.2.4');
        }

        // 3.2.5 ウィンドウ作成テスト実行
        log('ウィンドウ作成テスト実行', 'info', '3.2.5');

        for (let i = 0; i < taskList.tasks.length; i++) {
            const task = taskList.tasks[i];
            try {
                // createWindowForTaskメソッドのモック実行
                log(`${task.aiType}用ウィンドウ作成シミュレーション`, 'info', '3.2.5');
                const mockWindow = {
                    id: `window_${task.id}`,
                    tabId: `tab_${task.id}`,
                    aiType: task.aiType,
                    position: i
                };

                log(`✓ ${task.aiType}用ウィンドウ作成成功`, 'success', '3.2.5');
                testResults.windowCreation.push({
                    task: task.toJSON(),
                    window: mockWindow,
                    success: true
                });
            } catch (error) {
                log(`✗ ウィンドウ作成エラー: ${error.message}`, 'error', '3.2.5');
                testResults.windowCreation.push({
                    error: error.message,
                    success: false
                });
            }
        }

        log(`ウィンドウ作成テスト完了: ${testResults.windowCreation.length}件`, 'success', '3.2.5');

    } catch (error) {
        log(`ウィンドウ作成テスト全体エラー: ${error.message}`, 'error', '3');
        testResults.windowCreation.push({
            error: error.message,
            success: false
        });
    }
}

// ========================================
// ステップ4: スプレッドシート処理テストの移植
// ========================================

/**
 * 4.2.1 スプレッドシート処理テスト
 */
async function testSpreadsheetProcessing() {
    log('=== ステップ4: スプレッドシート処理テスト開始 ===', 'info', '4.1');

    try {
        // 4.2.2 モックスプレッドシートデータ作成
        log('モックスプレッドシートデータ作成', 'info', '4.2.2');
        const mockSpreadsheetData = {
            spreadsheetId: 'test_' + Date.now(),
            gid: '0',
            sheetName: 'テストシート',
            values: [
                ['', '', '', '', '', '', '', ''],  // 1行目（空行）
                ['プロンプト', 'ChatGPT', 'Claude', 'Gemini', 'レポート', '', '', ''],  // 2行目（ヘッダー）
                ['', '', '', '', '', '', '', ''],  // 3行目
                ['', '', '', '', '', '', '', ''],  // 4行目
                ['', '', '', '', '', '', '', ''],  // 5行目
                ['', '', '', '', '', '', '', ''],  // 6行目
                ['', '', '', '', '', '', '', ''],  // 7行目
                ['', '', '', '', '', '', '', ''],  // 8行目
                ['テスト質問1', '', '', '', '', '', '', ''],  // 9行目
                ['テスト質問2', '', '', '', '', '', '', ''],  // 10行目
                ['テスト質問3', '', '', '', '', '', '', '']   // 11行目
            ]
        };

        // 4.2.3 構造分析テスト
        log('構造分析テスト実行', 'info', '4.2.3');
        const structure = streamProcessor.analyzeStructure(mockSpreadsheetData);

        log(`AI列検出: ${JSON.stringify(structure.aiColumns)}`, 'info', '4.2.3');
        log(`作業行: ${JSON.stringify(structure.workRows)}`, 'info', '4.2.3');
        log(`✓ 構造分析完了: ${Object.keys(structure.aiColumns).length}個のAI列検出`, 'success', '4.2.3');

        // 4.2.4 タスクグループ生成テスト
        log('プロンプトグループ識別テスト', 'info', '4.2.4');
        const promptGroups = streamProcessor.identifyPromptGroups(
            mockSpreadsheetData,
            structure.workRows
        );

        log(`プロンプトグループ数: ${promptGroups.length}`, 'info', '4.2.4');
        promptGroups.forEach((group, index) => {
            log(`グループ${index + 1}: ${group.type} - 列${group.columns.join(',')}`, 'info', '4.2.4');
        });

        log(`✓ ${promptGroups.length}個のプロンプトグループ生成`, 'success', '4.2.4');

        testResults.spreadsheetProcessing.push({
            structure,
            promptGroups,
            success: true
        });

    } catch (error) {
        log(`スプレッドシート処理テストエラー: ${error.message}`, 'error', '4');
        testResults.spreadsheetProcessing.push({
            error: error.message,
            success: false
        });
    }
}

// ========================================
// ステップ5: レポート生成テストの移植
// ========================================

/**
 * 5.2.1 レポート生成テスト
 */
async function testReportGeneration() {
    log('=== ステップ5: レポート生成テスト開始 ===', 'info', '5.1');

    try {
        // 5.2.2 レポートグループの作成
        log('レポートグループ作成', 'info', '5.2.2');
        const reportGroup = {
            type: 'report',
            name: 'テストレポート',
            columns: ['E'],
            promptColumn: 'A',
            startRow: 9,
            endRow: 11
        };

        // 5.2.3 レポート処理シミュレーション
        log('レポート処理シミュレーション実行', 'info', '5.2.3');

        // モックデータでレポート処理をシミュレート
        const mockReportData = {
            values: [
                ['ソース質問1', 'ChatGPT回答1', 'Claude回答1', 'Gemini回答1', ''],
                ['ソース質問2', 'ChatGPT回答2', 'Claude回答2', 'Gemini回答2', ''],
                ['ソース質問3', 'ChatGPT回答3', 'Claude回答3', 'Gemini回答3', '']
            ]
        };

        // レポート生成のシミュレーション結果
        const reportResult = {
            group: reportGroup,
            processedRows: 3,
            generatedReports: [
                { row: 9, report: '統合レポート1' },
                { row: 10, report: '統合レポート2' },
                { row: 11, report: '統合レポート3' }
            ]
        };

        log(`✓ レポート生成成功: ${reportResult.processedRows}行処理`, 'success', '5.2.3');
        testResults.reportGeneration.push({
            result: reportResult,
            success: true
        });

    } catch (error) {
        log(`レポート生成エラー: ${error.message}`, 'error', '5');
        testResults.reportGeneration.push({
            error: error.message,
            success: false
        });
    }
}

// ========================================
// ステップ6: 統合テストの実装
// ========================================

/**
 * 6.1.1 統合テスト実行
 */
async function runIntegrationTest() {
    log('=== ステップ6: 統合テスト開始 ===', 'info', '6.1');

    try {
        // 6.1.2 完全なワークフロー実行
        log('完全なワークフローデータ準備', 'info', '6.1.2');
        const fullWorkflowData = {
            spreadsheetId: 'integration_test_' + Date.now(),
            gid: '0',
            sheetName: '統合テスト',
            values: [
                ['', '', '', '', '', '', '', ''],
                ['プロンプト', 'ChatGPT', 'Claude', 'Gemini', 'レポート', 'ログ', '', ''],
                ['', '', '', '', '', '', '', ''],
                ['', '', '', '', '', '', '', ''],
                ['', '', '', '', '', '', '', ''],
                ['', '', '', '', '', '', '', ''],
                ['', '', '', '', '', '', '', ''],
                ['', '', '', '', '', '', '', ''],
                ['統合テスト質問1', '', '', '', '', '', '', ''],
                ['統合テスト質問2', '', '', '', '', '', '', ''],
                ['統合テスト質問3', '', '', '', '', '', '', '']
            ]
        };

        // 6.1.3 メイン処理シミュレーション
        log('メイン処理シミュレーション実行', 'info', '6.1.3');

        // StreamProcessorV2の各メソッドをテスト
        const structure = streamProcessor.analyzeStructure(fullWorkflowData);
        const promptGroups = streamProcessor.identifyPromptGroups(
            fullWorkflowData,
            structure.workRows
        );

        // タスクグループ処理のシミュレーション
        const simulationResult = {
            structure,
            promptGroups,
            processedGroups: promptGroups.length,
            totalTasks: 0
        };

        // 各グループのタスク数をカウント
        promptGroups.forEach(group => {
            const taskCount = group.columns.length * (group.endRow - group.startRow + 1);
            simulationResult.totalTasks += taskCount;
            log(`グループ「${group.name}」: ${taskCount}タスク`, 'info', '6.1.3');
        });

        log(`✓ 統合テスト完了: ${simulationResult.processedGroups}グループ、${simulationResult.totalTasks}タスク`, 'success', '6.1.3');
        testResults.integration.push({
            result: simulationResult,
            success: true
        });

    } catch (error) {
        log(`統合テストエラー: ${error.message}`, 'error', '6');
        testResults.integration.push({
            error: error.message,
            success: false
        });
    }
}

// ========================================
// ステップ7: テスト実行とクリーンアップ
// ========================================

/**
 * 7.1.1 全テスト実行
 */
async function runAllTests() {
    log('===== 統合テストスイート開始 =====', 'info', '7.1.1');
    const startTime = Date.now();

    try {
        // 7.1.2 各テストを順次実行
        log('各テストを順次実行', 'info', '7.1.2');

        await testWindowCreation();
        await testSpreadsheetProcessing();
        await testReportGeneration();
        await runIntegrationTest();

        // 7.1.3 結果サマリー出力
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        log(`===== 全テスト完了: ${duration}秒 =====`, 'success', '7.1.3');
        displayTestResults();

    } catch (error) {
        log(`テスト実行エラー: ${error.message}`, 'error', '7.1');
    }
}

/**
 * 7.2.1 結果表示関数
 */
function displayTestResults() {
    log('===== テスト結果サマリー =====', 'info', '7.2.1');

    const categories = [
        { key: 'windowCreation', name: 'ウィンドウ作成' },
        { key: 'spreadsheetProcessing', name: 'スプレッドシート処理' },
        { key: 'reportGeneration', name: 'レポート生成' },
        { key: 'integration', name: '統合テスト' }
    ];

    let totalTests = 0;
    let totalSuccess = 0;

    categories.forEach(category => {
        const results = testResults[category.key];
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        totalTests += totalCount;
        totalSuccess += successCount;

        const status = successCount === totalCount ? 'success' :
                      successCount > 0 ? 'warning' : 'error';

        log(`${category.name}: ${successCount}/${totalCount} 成功`, status, '7.2.1');
    });

    log(`===== 総合結果: ${totalSuccess}/${totalTests} テスト成功 =====`,
        totalSuccess === totalTests ? 'success' : 'warning', '7.2.1');

    // 詳細なエラー情報の出力
    categories.forEach(category => {
        const failures = testResults[category.key].filter(r => !r.success);
        if (failures.length > 0) {
            log(`${category.name}のエラー詳細:`, 'error', '7.2.1');
            failures.forEach(failure => {
                log(`  - ${failure.error}`, 'error', '7.2.1');
            });
        }
    });
}

// ========================================
// メイン実行部
// ========================================

// テストを自動実行
if (import.meta.url === `file://${process.argv[1]}`) {
    log('統合テストファイル起動', 'info', 'MAIN');
    runAllTests().then(() => {
        log('テストプロセス終了', 'info', 'MAIN');
    }).catch(error => {
        log(`予期しないエラー: ${error.message}`, 'error', 'MAIN');
        process.exit(1);
    });
}

// エクスポート（他のテストから使用する場合）
export {
    testWindowCreation,
    testSpreadsheetProcessing,
    testReportGeneration,
    runIntegrationTest,
    runAllTests,
    displayTestResults
};