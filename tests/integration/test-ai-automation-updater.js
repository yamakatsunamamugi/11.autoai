// AI自動化テストページのモデル・機能ドロップダウンを動的に更新するスクリプト

(async function() {
    'use strict';
    
    console.log('🔄 AI設定の動的更新を開始...');
    
    // ストレージからAI設定を取得
    function getAIConfig() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['ai_config_persistence'], (result) => {
                resolve(result.ai_config_persistence || {});
            });
        });
    }
    
    // ドロップダウンを更新する関数
    function updateDropdown(selectId, items, selectedValue) {
        const select = document.getElementById(selectId);
        if (!select) {
            console.warn(`Select element not found: ${selectId}`);
            return;
        }
        
        // 現在の選択値を保存
        const currentValue = selectedValue || select.value;
        
        // オプションをクリア
        select.innerHTML = '';
        
        // 新しいオプションを追加
        items.forEach(item => {
            const option = document.createElement('option');
            
            // itemが文字列かオブジェクトかで処理を分ける
            if (typeof item === 'string') {
                option.value = item;
                option.textContent = item;
            } else if (typeof item === 'object' && item.name) {
                // モデルや機能のオブジェクト形式
                option.value = item.name;
                option.textContent = item.name;
                
                // 追加情報がある場合は属性として保存
                if (item.location) option.setAttribute('data-location', item.location);
                if (item.type) option.setAttribute('data-type', item.type);
                if (item.selected || item.active) option.setAttribute('data-active', 'true');
            }
            
            select.appendChild(option);
        });
        
        // 以前の選択値を復元（存在する場合）
        if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        } else if (select.options.length > 0) {
            // デフォルトの選択を設定
            const activeOption = Array.from(select.options).find(opt => opt.getAttribute('data-active') === 'true');
            if (activeOption) {
                select.value = activeOption.value;
            }
        }
    }
    
    // ChatGPTのデータを更新
    async function updateChatGPT(config) {
        const chatgptConfig = config.chatgpt || {};
        
        // モデルを更新
        if (chatgptConfig.models && chatgptConfig.models.length > 0) {
            console.log('📊 ChatGPT モデルを更新:', chatgptConfig.models);
            
            // モデル名をマッピング（フォーマットを調整）
            const models = chatgptConfig.models.map(model => {
                if (typeof model === 'string') return model;
                
                let name = model.name || model;
                // フルネームをそのまま使用
                return name;
            });
            
            updateDropdown('chatgpt-model', models);
        }
        
        // 機能を更新
        if (chatgptConfig.functions && chatgptConfig.functions.length > 0) {
            console.log('🎯 ChatGPT 機能を更新:', chatgptConfig.functions);
            
            // 機能のリストを作成（「なし」オプションを最初に追加）
            const functions = [{ name: 'なし（通常モード）' }];
            
            chatgptConfig.functions.forEach(func => {
                if (typeof func === 'string') {
                    functions.push({ name: func });
                } else if (func.name) {
                    // 特定の機能のみを表示（UIに適したもの）
                    const name = func.name;
                    if (name.includes('Deep Research') || name === 'Deep Research') {
                        functions.push({ name: 'Deep Research', type: func.type });
                    } else if (name.includes('ウェブ検索') || name === 'ウェブ検索') {
                        functions.push({ name: 'ウェブ検索', type: func.type });
                    } else if (name.includes('canvas') || name === 'canvas') {
                        functions.push({ name: 'Canvas', type: func.type });
                    } else if (name.includes('画像を作成') || name === '画像を作成する') {
                        functions.push({ name: '画像を作成', type: func.type });
                    } else if (name.includes('エージェント') || name.includes('Agent')) {
                        functions.push({ name: 'エージェントモード', type: func.type });
                    }
                }
            });
            
            updateDropdown('chatgpt-feature', functions);
        }
    }
    
    // Claudeのデータを更新
    async function updateClaude(config) {
        const claudeConfig = config.claude || {};
        
        // モデルを更新
        if (claudeConfig.models && claudeConfig.models.length > 0) {
            console.log('📊 Claude モデルを更新:', claudeConfig.models);
            
            const models = claudeConfig.models.map(model => {
                if (typeof model === 'string') return model;
                
                let name = model.name || model;
                // フルネームをそのまま使用
                return name;
            });
            
            updateDropdown('claude-model', models);
        }
        
        // 機能を更新
        if (claudeConfig.functions && claudeConfig.functions.length > 0) {
            console.log('🎯 Claude 機能を更新:', claudeConfig.functions);
            
            const functions = [{ name: 'なし（通常モード）' }];
            
            claudeConfig.functions.forEach(func => {
                const name = typeof func === 'string' ? func : func.name;
                if (name) {
                    if (name.includes('じっくり考える')) {
                        functions.push({ name: 'じっくり考える' });
                    } else if (name.includes('ウェブ検索')) {
                        functions.push({ name: 'ウェブ検索' });
                    } else if (name.includes('DeepResearch')) {
                        functions.push({ name: 'DeepResearch' });
                    }
                }
            });
            
            updateDropdown('claude-feature', functions);
        }
    }
    
    // Geminiのデータを更新
    async function updateGemini(config) {
        const geminiConfig = config.gemini || {};
        
        // モデルを更新
        if (geminiConfig.models && geminiConfig.models.length > 0) {
            console.log('📊 Gemini モデルを更新:', geminiConfig.models);
            
            const models = geminiConfig.models.map(model => {
                if (typeof model === 'string') return model;
                // モデル名をそのまま使用（変換しない）
                return model.name || model;
            });
            
            updateDropdown('gemini-model', models);
        }
        
        // 機能を更新
        if (geminiConfig.functions && geminiConfig.functions.length > 0) {
            console.log('🎯 Gemini 機能を更新:', geminiConfig.functions);
            
            const functions = [{ name: 'なし（通常モード）' }];
            
            geminiConfig.functions.forEach(func => {
                const name = typeof func === 'string' ? func : func.name;
                if (name) {
                    if (name.includes('DeepResearch') || name === 'deep-research') {
                        functions.push({ name: 'DeepResearch' });
                    } else if (name.includes('画像')) {
                        functions.push({ name: '画像' });
                    } else if (name.includes('Canvas') || name === 'canvas') {
                        functions.push({ name: 'Canvas' });
                    } else if (name.includes('動画')) {
                        functions.push({ name: '動画' });
                    } else if (name.includes('Think') || name === 'thinking') {
                        functions.push({ name: 'Think' });
                    }
                }
            });
            
            updateDropdown('gemini-feature', functions);
        }
    }
    
    // 全AIの設定を更新
    async function updateAllAISettings() {
        try {
            const config = await getAIConfig();
            console.log('🔧 取得した設定:', config);
            
            // 各AIの設定を更新
            await updateChatGPT(config);
            await updateClaude(config);
            await updateGemini(config);
            
            console.log('✅ AI設定の更新完了');
            
            // 更新完了を通知
            const event = new CustomEvent('ai-settings-updated', {
                detail: { config }
            });
            window.dispatchEvent(event);
            
        } catch (error) {
            console.error('❌ AI設定の更新エラー:', error);
        }
    }
    
    // ページ読み込み時に実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateAllAISettings);
    } else {
        updateAllAISettings();
    }
    
    // ストレージの変更を監視
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.ai_config_persistence) {
            console.log('🔄 設定が変更されました。再読み込み...');
            updateAllAISettings();
        }
    });
    
    // グローバルに公開（デバッグ用）
    window.updateAISettings = updateAllAISettings;
    
})();