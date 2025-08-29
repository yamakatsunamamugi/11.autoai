/**
 * Gemini V2 Integration - スプレッドシートとGemini Automation V2の統合
 * Version: 1.0.0
 * 
 * 【機能】
 * - スプレッドシートからのタスクを受け取り、Gemini Automation V2で処理
 * - モデルと機能の自動選択
 * - プロンプトの自動入力と実行
 */

(function() {
    'use strict';

    console.log('%c📦 Gemini V2 Integration 初期化開始', 'color: #4285f4; font-weight: bold');

    // ========================================
    // グローバル統合関数
    // ========================================
    
    /**
     * スプレッドシートデータからGemini V2を実行
     * @param {Object} taskData - スプレッドシートからのタスクデータ
     * @returns {Promise<Object>} 実行結果
     */
    async function executeGeminiV2WithSpreadsheetData(taskData) {
        console.log('📊 Gemini V2 統合実行開始', taskData);
        
        try {
            // V2関数が利用可能か確認
            if (!window.runIntegrationTest || !window.continueTest) {
                console.error('❌ Gemini Automation V2が利用できません');
                
                // V2スクリプトを手動でロード試行
                await loadGeminiV2Script();
                
                // 再確認
                if (!window.runIntegrationTest || !window.continueTest) {
                    throw new Error('Gemini Automation V2のロードに失敗しました');
                }
            }

            // Step 1: 統合テストを開始してモデルと機能の一覧を取得
            console.log('📋 Step 1: 利用可能なモデルと機能を探索中...');
            await window.runIntegrationTest();
            
            // 少し待機してグローバル変数が設定されるのを待つ
            await wait(2000);
            
            // Step 2: スプレッドシートデータからモデルと機能を決定
            const modelNumber = selectModelFromTask(taskData);
            const featureNumber = selectFeatureFromTask(taskData);
            
            console.log(`📌 選択: モデル番号=${modelNumber}, 機能番号=${featureNumber}`);
            
            // Step 3: 選択したモデルと機能でテストを続行
            console.log('📋 Step 3: 選択したモデルと機能で実行中...');
            const result = await window.continueTest(modelNumber, featureNumber);
            
            // Step 4: カスタムプロンプトを使用する場合
            if (taskData.text && taskData.text !== '桃太郎について2000文字で解説して') {
                console.log('📝 カスタムプロンプトを設定中...');
                await replacePromptText(taskData.text);
            }
            
            return {
                success: true,
                result: result,
                taskData: taskData,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Gemini V2 統合エラー:', error);
            return {
                success: false,
                error: error.message,
                taskData: taskData,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * タスクデータから適切なモデル番号を選択
     * @param {Object} taskData - タスクデータ
     * @returns {number|null} モデル番号
     */
    function selectModelFromTask(taskData) {
        if (!window.availableModels || !taskData.model) {
            return null;
        }
        
        const modelName = taskData.model.toLowerCase();
        
        // モデル名のマッピング
        const modelMapping = {
            'flash': 1,      // 通常は1番目がFlash
            'pro': 2,        // 通常は2番目がPro
            'thinking': 3,   // 通常は3番目がThinking
            '2.5 flash': 1,
            '2.5 pro': 2,
            '2.0 flash thinking': 3,
            'exp': 3         // Experimental
        };
        
        // 直接マッピングから探す
        for (const [key, value] of Object.entries(modelMapping)) {
            if (modelName.includes(key)) {
                // 実際に存在するか確認
                if (window.availableModels.length >= value) {
                    console.log(`✅ モデル「${taskData.model}」→ 番号${value}を選択`);
                    return value;
                }
            }
        }
        
        // 利用可能なモデルから名前で検索
        for (let i = 0; i < window.availableModels.length; i++) {
            const availableModel = window.availableModels[i];
            if (availableModel.名前 && availableModel.名前.toLowerCase().includes(modelName)) {
                console.log(`✅ モデル「${taskData.model}」→ 番号${i + 1}を選択`);
                return i + 1;
            }
        }
        
        console.log(`⚠️ モデル「${taskData.model}」が見つからないため、デフォルトを使用`);
        return null;
    }
    
    /**
     * タスクデータから適切な機能番号を選択
     * @param {Object} taskData - タスクデータ
     * @returns {number|null} 機能番号
     */
    function selectFeatureFromTask(taskData) {
        if (!window.availableFeatures || !taskData.function) {
            return null;
        }
        
        const functionName = taskData.function.toLowerCase();
        
        // 機能名のマッピング
        const featureMapping = {
            'canvas': 'canvas',
            'deep research': 'deep research',
            'deepresearch': 'deep research',
            'deep think': 'deep think',
            'deepthink': 'deep think',
            '画像': '画像',
            'image': '画像',
            '動画': '動画',
            'video': '動画'
        };
        
        // マッピングから正規化された名前を取得
        const normalizedName = featureMapping[functionName] || functionName;
        
        // 利用可能な機能から検索
        for (let i = 0; i < window.availableFeatures.length; i++) {
            const feature = window.availableFeatures[i];
            if (feature.name && feature.name.toLowerCase() === normalizedName) {
                console.log(`✅ 機能「${taskData.function}」→ 番号${i + 1}を選択`);
                return i + 1;
            }
        }
        
        console.log(`⚠️ 機能「${taskData.function}」が見つからないため、選択なし`);
        return null;
    }
    
    /**
     * プロンプトテキストを置き換える
     * @param {string} newText - 新しいプロンプトテキスト
     */
    async function replacePromptText(newText) {
        try {
            // window.safeInputTextが利用可能な場合は使用
            if (window.safeInputText) {
                const result = await window.safeInputText(newText);
                if (result.success) {
                    console.log('✅ プロンプトテキストを設定しました');
                    return true;
                }
            }
            
            // 直接DOM操作でテキストを設定
            const inputSelectors = [
                '.ql-editor.textarea',
                '.ql-editor',
                'rich-textarea .ql-editor',
                '[contenteditable="true"][role="textbox"]'
            ];
            
            for (const selector of inputSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    element.textContent = newText;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log('✅ プロンプトテキストを直接設定しました');
                    return true;
                }
            }
            
            console.warn('⚠️ プロンプト入力欄が見つかりません');
            return false;
            
        } catch (error) {
            console.error('プロンプト設定エラー:', error);
            return false;
        }
    }
    
    /**
     * Gemini V2スクリプトをロード
     */
    async function loadGeminiV2Script() {
        return new Promise((resolve, reject) => {
            if (window.runIntegrationTest && window.continueTest) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('src/platforms/gemini-automation-v2.js');
            script.onload = () => {
                console.log('✅ Gemini V2スクリプトをロードしました');
                resolve();
            };
            script.onerror = (error) => {
                console.error('❌ Gemini V2スクリプトのロードに失敗:', error);
                reject(error);
            };
            (document.head || document.documentElement).appendChild(script);
        });
    }
    
    /**
     * 待機関数
     */
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // ========================================
    // 既存システムとの統合
    // ========================================
    
    // GeminiAutomationに統合関数を追加
    if (window.GeminiAutomation) {
        window.GeminiAutomation.executeV2WithSpreadsheet = executeGeminiV2WithSpreadsheetData;
        console.log('✅ GeminiAutomation.executeV2WithSpreadsheetを追加しました');
    }
    
    // runAutomationをオーバーライド（V2を使用）
    const originalRunAutomation = window.GeminiAutomation?.runAutomation;
    if (originalRunAutomation) {
        window.GeminiAutomation.runAutomation = async function(config) {
            console.log('[Gemini V2 Integration] runAutomationをインターセプト', config);
            
            // V2モードが有効な場合
            if (config.useV2 || config.model || config.function) {
                console.log('📦 V2モードで実行します');
                const taskData = {
                    model: config.model,
                    function: config.function,
                    text: config.text || config.prompt
                };
                return await executeGeminiV2WithSpreadsheetData(taskData);
            }
            
            // 通常モード
            return await originalRunAutomation.call(this, config);
        };
        console.log('✅ runAutomationをV2対応にオーバーライドしました');
    }
    
    // グローバルに公開
    window.GeminiV2Integration = {
        executeWithSpreadsheet: executeGeminiV2WithSpreadsheetData,
        selectModel: selectModelFromTask,
        selectFeature: selectFeatureFromTask,
        replacePrompt: replacePromptText,
        loadScript: loadGeminiV2Script
    };
    
    console.log('%c✅ Gemini V2 Integration 初期化完了', 'color: #4CAF50; font-weight: bold');
    console.log('使用方法:');
    console.log('  GeminiV2Integration.executeWithSpreadsheet({ model: "Pro", function: "Canvas", text: "..." })');
    console.log('  GeminiAutomation.executeV2WithSpreadsheet({ model: "Flash", text: "..." })');
    console.log('  GeminiAutomation.runAutomation({ useV2: true, model: "Pro", text: "..." })');
    
})();