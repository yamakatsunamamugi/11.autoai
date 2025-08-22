/**
 * @fileoverview Claude Canvas/Artifacts取得テスト
 * DeepResearchやその他のArtifacts形式の応答を正しく取得できるかテスト
 */

console.log('🧪 Claude Canvas/Artifacts取得テスト開始...\n');

// ========================================
// テスト1: Canvas/Artifactsの検出
// ========================================
async function testCanvasDetection() {
    console.log('📋 テスト1: Canvas/Artifactsの検出');
    
    // プレビューボタンを探す
    const previewButton = document.querySelector('button[aria-label*="プレビュー"]');
    if (previewButton) {
        console.log('✅ プレビューボタン発見');
        console.log('  - ラベル:', previewButton.getAttribute('aria-label'));
        console.log('  - 表示状態:', previewButton.style.display !== 'none' ? '表示' : '非表示');
    } else {
        console.log('❌ プレビューボタンが見つかりません');
    }
    
    // 既存のCanvasを探す
    const canvasSelectors = [
        '.grid-cols-1.grid:has(h1)',
        '.grid-cols-1.grid',
        '[class*="grid-cols-1"][class*="grid"]'
    ];
    
    let foundCanvas = false;
    for (const selector of canvasSelectors) {
        try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const h1 = element.querySelector('h1');
                const textLength = element.textContent?.length || 0;
                if (h1 && textLength > 500) {
                    console.log(`✅ Canvas発見: ${selector}`);
                    console.log(`  - タイトル: ${h1.textContent?.substring(0, 50)}`);
                    console.log(`  - 文字数: ${textLength}`);
                    foundCanvas = true;
                    break;
                }
            }
            if (foundCanvas) break;
        } catch (e) {
            console.log(`⚠️ セレクタエラー: ${selector}`);
        }
    }
    
    if (!foundCanvas) {
        console.log('ℹ️ 展開されたCanvasが見つかりません（プレビューボタンのクリックが必要）');
    }
    
    console.log('');
}

// ========================================
// テスト2: getCanvasContent関数のテスト
// ========================================
async function testGetCanvasContent() {
    console.log('📋 テスト2: getCanvasContent関数のテスト');
    
    if (window.ClaudeAutomation?.utils?.getCanvasContent) {
        console.log('✅ getCanvasContent関数が利用可能');
        
        // expandIfNeeded=falseでテスト（既存のCanvasのみ）
        console.log('\n展開なしでテスト...');
        let result = await window.ClaudeAutomation.utils.getCanvasContent(false);
        if (result?.success) {
            console.log('✅ Canvas取得成功（展開なし）');
            console.log(`  - タイトル: ${result.title}`);
            console.log(`  - セクション数: ${result.sections}`);
            console.log(`  - 段落数: ${result.paragraphs}`);
            console.log(`  - 文字数: ${result.text?.length}`);
            console.log(`  - DeepResearch判定: ${result.isDeepResearch ? 'はい' : 'いいえ'}`);
        } else {
            console.log('❌ Canvas取得失敗（展開なし）');
        }
        
        // expandIfNeeded=trueでテスト（自動展開）
        console.log('\n自動展開ありでテスト...');
        result = await window.ClaudeAutomation.utils.getCanvasContent(true);
        if (result?.success) {
            console.log('✅ Canvas取得成功（自動展開）');
            console.log(`  - タイトル: ${result.title}`);
            console.log(`  - セクション数: ${result.sections}`);
            console.log(`  - 段落数: ${result.paragraphs}`);
            console.log(`  - 文字数: ${result.text?.length}`);
            console.log(`  - DeepResearch判定: ${result.isDeepResearch ? 'はい' : 'いいえ'}`);
            console.log(`  - プレビュー: ${result.text?.substring(0, 200)}...`);
        } else {
            console.log('❌ Canvas取得失敗（自動展開）');
        }
    } else {
        console.log('❌ getCanvasContent関数が見つかりません');
        console.log('  ClaudeAutomationスクリプトが読み込まれていることを確認してください');
    }
    
    console.log('');
}

// ========================================
// テスト3: getResponse関数のCanvas優先ロジック
// ========================================
async function testGetResponseWithCanvas() {
    console.log('📋 テスト3: getResponse関数のCanvas優先ロジック');
    
    if (window.ClaudeAutomation?.getResponse) {
        console.log('✅ getResponse関数が利用可能');
        console.log('応答取得を実行中...');
        
        const startTime = Date.now();
        const response = await window.ClaudeAutomation.getResponse();
        const duration = Date.now() - startTime;
        
        if (response) {
            console.log('✅ 応答取得成功');
            console.log(`  - 取得時間: ${duration}ms`);
            console.log(`  - 文字数: ${response.length}`);
            console.log(`  - 最初の300文字:`);
            console.log(`    ${response.substring(0, 300)}...`);
            
            // DeepResearchの特徴をチェック
            const hasH1 = response.includes('生成AI') || response.includes('著作権');
            const hasStructure = response.split('\n').length > 50;
            const isLong = response.length > 2000;
            
            if (hasH1 && hasStructure && isLong) {
                console.log('✅ DeepResearch形式の可能性が高い');
            }
        } else {
            console.log('❌ 応答取得失敗');
        }
    } else {
        console.log('❌ getResponse関数が見つかりません');
    }
    
    console.log('');
}

// ========================================
// テスト4: 通常メッセージとCanvasの判別
// ========================================
async function testResponseTypeDetection() {
    console.log('📋 テスト4: 応答タイプの判別');
    
    // Canvasチェック
    const canvas = document.querySelector('.grid-cols-1.grid:has(h1)');
    const hasCanvas = !!canvas;
    
    // 通常メッセージチェック
    const normalMessages = document.querySelectorAll('.font-claude-message');
    const hasNormalMessages = normalMessages.length > 0;
    
    console.log('検出結果:');
    console.log(`  - Canvas/Artifacts: ${hasCanvas ? '✅ あり' : '❌ なし'}`);
    console.log(`  - 通常メッセージ: ${hasNormalMessages ? '✅ あり' : '❌ なし'}`);
    
    if (hasCanvas && hasNormalMessages) {
        console.log('⚠️ 両方の形式が検出されました');
        console.log('  → getResponse関数はCanvasを優先して取得します');
    } else if (hasCanvas) {
        console.log('✅ Canvas/Artifacts形式のみ（DeepResearch等）');
    } else if (hasNormalMessages) {
        console.log('✅ 通常メッセージ形式のみ');
    } else {
        console.log('❌ 応答が検出されません');
    }
    
    console.log('');
}

// ========================================
// すべてのテストを実行
// ========================================
async function runAllTests() {
    console.log('===== Claude Canvas/Artifacts取得テスト =====\n');
    
    await testCanvasDetection();
    await testGetCanvasContent();
    await testGetResponseWithCanvas();
    await testResponseTypeDetection();
    
    console.log('===== テスト完了 =====');
    console.log('\n使用方法:');
    console.log('1. Claudeで応答を生成（通常/DeepResearch/Artifacts）');
    console.log('2. コンソールでこのスクリプトを実行');
    console.log('3. 結果を確認');
    console.log('\n動作確認コマンド:');
    console.log('- 通常取得: await window.ClaudeAutomation.getResponse()');
    console.log('- Canvas取得: await window.ClaudeAutomation.utils.getCanvasContent(true)');
}

// テスト実行
runAllTests();