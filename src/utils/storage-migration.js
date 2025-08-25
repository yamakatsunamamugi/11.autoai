/**
 * Chrome Storage Migration Helper
 * chrome.storage.localからchrome.storage.syncへの移行を支援
 * 
 * Chrome Storage制限:
 * - storage.sync: 最大100KB、各項目最大8KB、最大512項目
 * - storage.local: 最大5MB
 */

export class StorageMigration {
  constructor() {
    // syncに移行するキー（小さいデータ）
    this.syncKeys = [
      'dynamicAIConfig',      // AI設定
      'extensionWindowId',    // ウィンドウID
      'windowSettings',       // ウィンドウ設定
      'spreadsheetId',        // スプレッドシートID
      'spreadsheetUrl',       // スプレッドシートURL
      'task_metadata',        // タスクメタデータ
      'task_events'           // タスクイベント
    ];
    
    // localに残すキー（大きいデータ）
    this.localKeys = [
      'extension_logs',       // ログデータ（大きい）
      'task_queue',           // タスクキュー（大きい可能性）
      'ai_config_persistence' // AI設定履歴（大きい可能性）
    ];
  }

  /**
   * 現在のlocalストレージからsyncへデータを移行
   */
  async migrateToSync() {
    console.log('🔄 Storage Migration: 開始');
    
    try {
      // 1. localから全データを取得
      const localData = await chrome.storage.local.get(null);
      
      // 2. syncに移行するデータを抽出
      const syncData = {};
      const keepLocal = {};
      
      for (const [key, value] of Object.entries(localData)) {
        if (this.syncKeys.includes(key)) {
          // サイズチェック（8KB制限）
          const size = JSON.stringify(value).length;
          if (size < 8192) {
            syncData[key] = value;
            console.log(`✅ ${key}: syncへ移行可能 (${size} bytes)`);
          } else {
            console.warn(`⚠️ ${key}: サイズ超過のためlocalに残す (${size} bytes)`);
            keepLocal[key] = value;
          }
        } else if (this.localKeys.includes(key)) {
          keepLocal[key] = value;
          console.log(`📦 ${key}: localに残す`);
        }
      }
      
      // 3. syncにデータを保存
      if (Object.keys(syncData).length > 0) {
        await chrome.storage.sync.set(syncData);
        console.log('✅ syncへのデータ保存完了:', Object.keys(syncData));
      }
      
      // 4. 移行済みデータをlocalから削除
      const keysToRemove = Object.keys(syncData);
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log('🗑️ localから移行済みデータを削除:', keysToRemove);
      }
      
      console.log('✅ Storage Migration: 完了');
      return {
        success: true,
        migrated: Object.keys(syncData),
        keptLocal: Object.keys(keepLocal)
      };
      
    } catch (error) {
      console.error('❌ Storage Migration エラー:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 同期状態を確認
   */
  async checkSyncStatus() {
    const syncData = await chrome.storage.sync.get(null);
    const localData = await chrome.storage.local.get(null);
    
    const syncSize = JSON.stringify(syncData).length;
    const localSize = JSON.stringify(localData).length;
    
    return {
      sync: {
        keys: Object.keys(syncData),
        size: syncSize,
        sizeKB: (syncSize / 1024).toFixed(2)
      },
      local: {
        keys: Object.keys(localData),
        size: localSize,
        sizeKB: (localSize / 1024).toFixed(2)
      }
    };
  }

  /**
   * データをバックアップ
   */
  async backupData() {
    const timestamp = new Date().toISOString();
    const syncData = await chrome.storage.sync.get(null);
    const localData = await chrome.storage.local.get(null);
    
    const backup = {
      timestamp,
      sync: syncData,
      local: localData
    };
    
    // バックアップをlocalに保存
    await chrome.storage.local.set({
      [`backup_${timestamp}`]: backup
    });
    
    console.log(`✅ バックアップ作成: backup_${timestamp}`);
    return backup;
  }

  /**
   * 初回起動時の自動移行
   */
  static async autoMigrate() {
    const migrationKey = 'storage_migration_completed';
    
    // 既に移行済みかチェック
    const result = await chrome.storage.sync.get(migrationKey);
    if (result[migrationKey]) {
      console.log('ℹ️ Storage migration already completed');
      return;
    }
    
    // 移行実行
    const migration = new StorageMigration();
    const migrationResult = await migration.migrateToSync();
    
    if (migrationResult.success) {
      // 移行完了フラグを設定
      await chrome.storage.sync.set({
        [migrationKey]: {
          completed: true,
          timestamp: new Date().toISOString(),
          migrated: migrationResult.migrated
        }
      });
    }
    
    return migrationResult;
  }
}

// 拡張機能起動時に自動実行
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(async () => {
    await StorageMigration.autoMigrate();
  });
}