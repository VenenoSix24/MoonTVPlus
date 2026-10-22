'use client';

import { useEffect, useState } from 'react';

/**
 * 顶栏的滚动状态：是否压在首页 Hero 上，以及当前滚动距离。
 *
 * Hero 是固定「影院感」的深色画面，顶栏如果跟着页面主题走深灰字，浅色主题下就是
 * 深灰压深画面，读不出来；所以压在 Hero 上时要切一套白色前景。
 *
 * 判定不能只看 scrollY：Hero 高达 480–680px，滑 40px 就切实底会在画面中间硬生生
 * 冒出一条亮条。这里看的是「顶栏那条横带和 Hero 有没有交集」。
 *
 * @param headerRef 顶栏元素本身，用它自己的下边缘当横带高度
 *                  （桌面 64px，手机 48px + 安全区，不用在调用方写死）
 */
export const useNavScrollState = (
  headerRef: React.RefObject<HTMLElement | null>
) => {
  const [overHero, setOverHero] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  // 播放页这类「固定深色画布、没有 Hero」的页面：顶栏要白字 + 模糊实底
  const [onDarkCanvas, setOnDarkCanvas] = useState(false);

  useEffect(() => {
    let hero: HTMLElement | null = null;

    const measure = () => {
      if (!hero) hero = document.querySelector<HTMLElement>('.mtv-hero');

      // 页面实际滚动的是 body（globals 里 body 带 overflow-x:hidden，纵向滚动就
      // 落到 body 上），window.scrollY 一直是 0；scroll 事件又不冒泡，所以这里用
      // 捕获阶段收，取值把三个可能的滚动容器一起算上。
      setScrollTop(
        Math.max(
          window.scrollY,
          document.scrollingElement?.scrollTop ?? 0,
          document.body.scrollTop
        )
      );

      // 播放页 / 直播页是固定深色画布（.mtv-play-bg 是 fixed inset-0），顶栏永远
      // 压在暗画面上，不该跟着页面主题走深灰字 —— 浅色主题下那样读不出来。
      // 这种页面没有 .mtv-hero，光靠下面的矩形相交判定永远得不出"压在暗色上"，
      // 所以直接短路成白色那套。
      if (document.querySelector('.mtv-play-bg')) {
        // 播放页 / 直播页：没有 Hero，但底是固定深色画布。
        // 文字要白色，同时顶栏不能保持透明 —— 否则内容会从顶栏下面穿过去。
        setOnDarkCanvas(true);
        setOverHero(true);
        return;
      }

      setOnDarkCanvas(false);

      const headerRect = headerRef.current?.getBoundingClientRect();
      const heroRect = hero?.getBoundingClientRect();
      // 「压在 Hero 上」= Hero 的底边还在顶栏底边以下。
      // 原来是 heroRect.bottom > 0：要等 Hero 底边划过整个顶栏（一直划到视口顶端）
      // 才脱离，视觉上就是「已经滚到下面一行了，顶栏还是透明的」。
      // 改成和顶栏自己的下边缘比 —— Hero 底边一碰到顶栏底部就落实底。
      setOverHero(
        !!headerRect &&
          !!heroRect &&
          heroRect.top < headerRect.bottom &&
          heroRect.bottom > headerRect.bottom
      );
    };

    measure();
    window.addEventListener('scroll', measure, true);
    // Hero 挂载/换图都会改 body 高度，用 ResizeObserver 补首次判定
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    // 播放页首帧是骨架屏，.mtv-play-bg 要等数据回来才挂上：只量一次的话顶栏会
    // 一直停在浅色实底那套，非要等用户滑一下才变。所以盯住整棵 DOM。
    const mutation = new MutationObserver(() => measure());
    // 必须 subtree：.mtv-play-bg 挂得很深（body > PageLayout > 内容），只看 body 的
    // 直接子节点根本不会触发，顶栏就只能靠下面那几次 setTimeout 兜底 —— 用户看到的
    // 就是「页面已经是深色了，顶栏要等一下才变」。
    mutation.observe(document.body, { childList: true, subtree: true });
    // 但响应式回调在后台标签页会被节流，Hero 又是异步渲染的，光靠它首帧可能判
    // 不出来（顶栏会一直停在浅色那套）。补几次有界重测。
    const retries = [200, 800, 2000].map((delay) =>
      window.setTimeout(measure, delay)
    );

    return () => {
      window.removeEventListener('scroll', measure, true);
      observer.disconnect();
      mutation.disconnect();
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, [headerRef]);

  return { overHero, onDarkCanvas, scrollTop };
};
