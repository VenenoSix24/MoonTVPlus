'use client';

/**
 * 界面探针的开关状态。
 *
 * 为什么需要它：iOS 上的 PWA 没有地址栏，也没有控制台 —— 想临时加个
 * `?mtvdebug=1` 都没地方输。所以开关必须能从界面里点出来，并且跨页面保持。
 *
 * 状态来源有两个：
 *   1. URL 带 `mtvdebug=1` —— 有地址栏的场合（桌面浏览器）直接开，并写进本地存储；
 *   2. 「更多 → 诊断 → 界面探针」—— 手机 PWA 走这条。
 *
 * 用模块级变量 + 订阅，而不是 Context：开关只需要被一两处读写，
 * 而 PageLayout 和 /more 之间隔了好几层，塞 Context 反而要改更多文件。
 */

const STORAGE_KEY = 'mtv-layout-debug';

type Listener = (enabled: boolean) => void;

let enabled = false;
let initialized = false;
const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach((listener) => listener(enabled));
};

const readStored = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeStored = (next: boolean) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // 隐私模式下 localStorage 会抛，忽略即可 —— 本次会话内仍然生效
  }
};

export const initLayoutDebug = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mtvdebug') === '1') {
      enabled = true;
      writeStored(true);
      notify();
      return;
    }
  } catch {
    // location.search 读不到就只看本地存储
  }

  enabled = readStored();
  notify();
};

export const isLayoutDebugEnabled = () => {
  initLayoutDebug();
  return enabled;
};

export const setLayoutDebugEnabled = (next: boolean) => {
  enabled = next;
  writeStored(next);
  notify();
};

export const toggleLayoutDebug = () => {
  setLayoutDebugEnabled(!enabled);
};

export const subscribeLayoutDebug = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
