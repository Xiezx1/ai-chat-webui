// 前端调试日志控制工具

// 从环境变量获取调试模式状态
const DEBUG_MODE = import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true';

interface DebugLogOptions {
  enabled?: boolean;
  prefix?: string;
  color?: string;
}

/**
 * 调试日志函数
 * 只有在调试模式下才会输出日志
 */
export function debugLog(message: string, options: DebugLogOptions = {}) {
  if (!DEBUG_MODE && !options.enabled) {
    return;
  }

  const prefix = options.prefix || '🔍';
  const color = options.color || '';
  
  if (color) {
    console.log(`%c${prefix} [DEBUG] ${message}`, color);
  } else {
    console.log(`${prefix} [DEBUG] ${message}`);
  }
}

/**
 * 成功日志（绿色）
 */
export function debugSuccess(message: string, options: DebugLogOptions = {}) {
  if (!DEBUG_MODE && !options.enabled) {
    return;
  }
  
  const prefix = options.prefix || '✅';
  console.log(`%c${prefix} ${message}`, 'color: green; font-weight: bold');
}

/**
 * 警告日志（黄色）
 */
export function debugWarn(message: string, options: DebugLogOptions = {}) {
  if (!DEBUG_MODE && !options.enabled) {
    return;
  }
  
  const prefix = options.prefix || '⚠️';
  console.log(`%c${prefix} ${message}`, 'color: orange; font-weight: bold');
}

/**
 * 错误日志（红色）
 */
export function debugError(message: string, options: DebugLogOptions = {}) {
  if (!DEBUG_MODE && !options.enabled) {
    return;
  }
  
  const prefix = options.prefix || '❌';
  console.log(`%c${prefix} ${message}`, 'color: red; font-weight: bold');
}

/**
 * Token 专用调试日志
 */
export function debugToken(message: string, data: any, options: DebugLogOptions = {}) {
  if (!DEBUG_MODE && !options.enabled) {
    return;
  }
  
  const prefix = options.prefix || '📊';
  console.log(`${prefix} [TOKEN DEBUG] ${message}:`, data);
}

/**
 * Store 专用调试日志
 */
export function debugStore(message: string, data: any, options: DebugLogOptions = {}) {
  if (!DEBUG_MODE && !options.enabled) {
    return;
  }
  
  const prefix = options.prefix || '🏪';
  console.log(`${prefix} [STORE DEBUG] ${message}:`, data);
}

/**
 * UI 专用调试日志
 */
export function debugUi(message: string, data: any, options: DebugLogOptions = {}) {
  if (!DEBUG_MODE && !options.enabled) {
    return;
  }
  
  const prefix = options.prefix || '🖥️';
  console.log(`${prefix} [UI DEBUG] ${message}:`, data);
}

/**
 * 检查是否处于调试模式
 */
export function isDebugMode(): boolean {
  return DEBUG_MODE;
}

/**
 * 条件调试 - 只有在满足条件时才输出日志
 */
export function conditionalDebug(condition: boolean, message: string, options: DebugLogOptions = {}) {
  if (condition && (DEBUG_MODE || options.enabled)) {
    debugLog(message, options);
  }
}