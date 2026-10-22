/**
 * 弹层打开时锁住背景滚动。
 *
 * 以前每处面板都自己写一遍 `body.position = 'fixed'; body.top = -scrollY`。
 * 那套在桌面是标准做法，但装成 PWA（display-mode: standalone）之后，iOS 会把
 * body 夹成布局视口的高度：整页内容往上顶一截，页面底部还露出一条画布底色。
 * 于是每开一次长按菜单 / 详情面板，页面就整体跳一下。
 *
 * 这里改成只关滚动容器的 overflow：不搬动 body，就没有位移可看。
 * - html + body 同时关：只用 body 的话 iOS 仍然会滚
 * - overscroll-behavior 挡住橡皮筋（连带挡掉下拉刷新）
 * - 引用计数：面板叠面板时，先关的那个不应该把锁开掉
 */

let lockCount = 0;
let saved: {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyOverscroll: string;
} | null = null;

export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  if (lockCount > 1) return;

  const html = document.documentElement;
  const body = document.body;
  saved = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyOverscroll: body.style.overscrollBehavior,
  };
  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const html = document.documentElement;
  const body = document.body;
  if (saved) {
    html.style.overflow = saved.htmlOverflow;
    body.style.overflow = saved.bodyOverflow;
    body.style.overscrollBehavior = saved.bodyOverscroll;
    saved = null;
  } else {
    html.style.overflow = '';
    body.style.overflow = '';
    body.style.overscrollBehavior = '';
  }
}
