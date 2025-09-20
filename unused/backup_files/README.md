# バックアップファイル

このディレクトリには、DIコンテナへの移行作業で削除されたファイルのバックアップが保存されています。

## バックアップファイル一覧

### google-services.js.backup
- **削除日**: 2025-09-15
- **ファイルサイズ**: 1,435行
- **削除理由**:
  - すべての機能が他のファイルと重複
  - GoogleAuthManager → `auth-service.js`で代替
  - SheetsReader/Writer → `sheets-client.js`で代替
  - SpreadsheetLogger → `features/logging/spreadsheet-logger.js`で代替
- **影響**: なし（DIコンテナで完全に代替済み）

## 復元方法

必要に応じて以下のコマンドで復元できます：

```bash
cp backup_files/google-services.js.backup src/services/google-services.js
```

## 注意事項

これらのファイルは既に機能が他のファイルに統合されているため、通常は復元する必要はありません。