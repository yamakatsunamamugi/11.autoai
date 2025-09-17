# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Install dependencies
npm install

# Run tests
npm test                    # Run all tests with Jest
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report

# Linting
npm run lint               # Run ESLint on src/**/*.js

# Build
npm run build              # Production build
npm run build:dev          # Development build
npm run build:prod         # Production build with optimizations
```

### Chrome Extension Development
```bash
# The extension must be loaded in Chrome directly
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select project root directory

# Package extension for distribution
npm run package            # Creates dist/extension.zip
```

## Architecture Overview

### Core System: Direct Service Access

The project uses direct imports and globalThis for service access.

**Key services:**
- `AuthService` - OAuth2 authentication for Google APIs (singleton via `getAuthService()`)
- `SheetsClient` - Google Sheets API client
- `DocsClient` - Google Docs API client
- `SpreadsheetLogger` - Logging to spreadsheets
- `AITaskExecutor` - AI task execution coordinator

**Usage patterns:**
```javascript
// AuthService (singleton)
import { getAuthService } from './src/services/auth-service.js';
const authService = getAuthService();

// Other services (create instances as needed)
import SheetsClient from './src/features/spreadsheet/sheets-client.js';
const sheetsClient = new SheetsClient();

// Global services
const logManager = globalThis.logManager;
```

### Chrome Extension Architecture

This is a Manifest V3 Chrome extension with the following structure:

1. **Service Worker** (`background.js`): Handles background tasks, message passing, and API authentication
2. **Content Scripts** (`src/content/content-script-consolidated.js`): Injected into AI service pages (ChatGPT, Claude, Gemini, Genspark)
3. **Popup UI** (`popup.html/js`): Extension control panel
4. **Main UI** (`src/ui/ui.html`): Primary interface for task management

### Task Processing Flow

The system processes AI tasks through a sophisticated pipeline:

1. **Stream Processor V2** (`src/features/task/stream-processor-v2.js`):
   - Reads tasks from Google Sheets
   - Groups tasks dynamically based on column structure
   - Manages task dependencies and execution order

2. **AI Task Executor** (`src/core/ai-task-executor.js`):
   - Coordinates multiple AI services in parallel
   - Handles window management for different AI tabs
   - Manages task queues and results

3. **Automation Scripts** (`automations/`):
   - Service-specific automation for ChatGPT, Claude, Gemini, Genspark
   - Each handles UI interaction patterns for their respective services

### Data Flow

1. Tasks are defined in Google Sheets with columns:
   - Column A: Log entries
   - Column B: Prompts
   - Columns C-E: AI responses (ChatGPT, Claude, Gemini)

2. Tasks are processed in groups with dependencies
3. Results are written back to the spreadsheet in real-time
4. Logs are maintained for debugging and audit

### Error Handling

- Centralized error service (`src/core/error-service.js`)
- Automatic retry mechanism with exponential backoff
- Error recovery service for critical failures
- All errors logged to spreadsheet for debugging

### Testing Approach

Tests use Jest with ES modules configuration. The test structure mirrors the source structure under `test/`.

## Key Development Patterns

1. **Use direct imports** for service access
2. **Handle OAuth tokens** through `AuthService` - never store credentials
3. **Log critical operations** to spreadsheet for debugging
4. **Use retry mechanisms** for network operations
5. **Implement graceful degradation** when AI services are unavailable
6. **Follow existing code style** - ES6 modules, async/await patterns