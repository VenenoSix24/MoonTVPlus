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

      const headerRect = headerRef.current?.getBoundingClientRect();
      const heroRect = hero?.getBoundingClientRect();
      setOverHero(
        !!headerRect &&
          !!heroRect &&
          heroRect.top < headerRect.bottom &&
          heroRect.bottom > 0
      );
    };

    measure();
    window.addEventListener('scroll', measure, true);
    // Hero 挂载/换图都会改 body 高度，用 ResizeObserver 补首次判定
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    // 但响应式回调在后台标签页会被节流，Hero 又是异步渲染的，光靠它首帧可能判
    // 不出来（顶栏会一直停在浅色那套）。补几次有界重测。
    const retries = [200, 800, 2000].map((delay) =>
      window.setTimeout(measure, delay)
    );

    return () => {
      window.removeEventListener('scroll', measure, true);
      observer.disconnect();
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, [headerRef]);

  return { overHero, scrollTop };
};
