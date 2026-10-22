'use client';

import { useEffect, useState } from 'react';

import {
  initLayoutDebug,
  isLayoutDebugEnabled,
  subscribeLayoutDebug,
} from '@/lib/layout-debug';

/**
 * 现场探针：给「没办法开控制台」的机器用（iPhone 上的 PWA 既没有地址栏
 * 也没有 DevTools）。
 *
 * 开关走 src/lib/layout-debug.ts：
 *   · 有地址栏时加 `?mtvdebug=1`；
 *   · PWA 里从「更多 → 诊断 → 界面探针」点开（开关存在 localStorage，跨页面保持）。
 *
 * 面板打印：
 *   · 视口 / 视觉视口 / 横向滚动量 —— 判断页面是不是被横向顶出去了
 *   · T24 —— 屏幕正中距顶 24px 那个点命中的元素（顶栏 / 那层雾是谁）
 *   · L / R —— 屏幕左中、右中两个点命中的元素（左右露边是谁）
 *   · hero / art / player —— 关键容器的实际矩形
 * 点一下面板重新采样（横竖屏切换后点一下）。
 */

const shortClass = (el: Element) =>
  String(el.className || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('.');

const describe = (el: Element | null) => {
  if (!el) return 'null';
  const cls = shortClass(el);
  const cs = getComputedStyle(el);
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} bg=${cs.backgroundColor} blur=${cs.backdropFilter} z=${cs.zIndex}`;
};

const rectOf = (selector: string) => {
  const el = document.querySelector(selector);
  if (!el) return '无';
  const r = el.getBoundingClientRect();
  return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
};

const LayoutDebugOverlay = () => {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    initLayoutDebug();
    // 必须主动读一次：initLayoutDebug 有 initialized 守卫，切页重新挂载时它
    // 直接 return 不会再 notify。只订阅的话 enabled 永远是 false ——
    // 表现就是「开了探针，切换页面之后就没了」。
    setEnabled(isLayoutDebugEnabled());
    return subscribeLayoutDebug(setEnabled);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const sample = () => {
      const vv = window.visualViewport;
      const mid = Math.round(window.innerHeight / 2);
      const cx = Math.round(window.innerWidth / 2);

      setLines([
        `win ${window.innerWidth}x${window.innerHeight}  vv ${Math.round(vv?.width ?? 0)}x${Math.round(vv?.height ?? 0)}`,
        `scrollX ${Math.round(window.scrollX)} htmlLeft ${document.documentElement.scrollLeft} bodyLeft ${document.body.scrollLeft} sw ${document.documentElement.scrollWidth}`,
        `T24: ${describe(document.elementFromPoint(cx, 24))}`,
        `L: ${describe(document.elementFromPoint(20, mid))}`,
        `R: ${describe(document.elementFromPoint(window.innerWidth - 20, mid))}`,
        `hero ${rectOf('.mtv-hero')}  mheader ${rectOf('.mtv-mheader')}`,
        `art: ${rectOf('.art-fullscreen-web')}  player: ${rectOf('.mtv-play-player')}`,
      ]);
    };

    sample();
    const timer = window.setTimeout(sample, 800);
    window.addEventListener('resize', sample);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', sample);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      onClick={() => window.dispatchEvent(new Event('resize'))}
      style={{
        position: 'fixed',
        right: 8,
        bottom: 84,
        zIndex: 2147483000,
        maxWidth: '92vw',
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.82)',
        color: '#9ef',
        font: '10px/1.5 ui-monospace, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        pointerEvents: 'auto',
      }}
    >
      {lines.join('\n')}
    </div>
  );
};

export default LayoutDebugOverlay;
