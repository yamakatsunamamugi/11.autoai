// ログレベル制御ユーティリティ
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
const CURRENT_LOG_LEVEL = LOG_LEVEL.INFO;

const log = {
  error: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR && console.error(...args),
  warn: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN && console.warn(...args),
  info: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO && console.log(...args),
  debug: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG && console.log(...args)
};

// グローバルに公開
if (typeof window !== 'undefined') {
  window.log = log;
}
