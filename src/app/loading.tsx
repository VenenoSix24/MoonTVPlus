'use client';

import { usePathname } from 'next/navigation';

import MobileBottomNav from '@/components/MobileBottomNav';
import MobileHeader from '@/components/MobileHeader';
import TopNav from '@/components/TopNav';

/**
 * 全局路由级 loading。
 *
 * 切 tab 时如果不给任何反馈，从点到新页面出现之间就是一屏"点了没反应"的静止画面，
 * 0.3~0.5s 的等待会被体感放大成"卡住了"。这里立刻换上一屏灰块占位。
 *
 * 两个刻意的选择：
 * 1. 不用 PageLayout 包。顶栏/底栏确实在 PageLayout 里，但它同时挂着
 *    VersionCheckProvider 和 MoreMenuProvider —— 骨架只活零点几秒，为一个骨架多打
 *    一次版本检查请求不值得。这里直接把三个导航组件摆出来。
 * 2. <main> 的上/下留白必须和 PageLayout 里那份一模一样，否则骨架会先跳一下再落位。
 *    改动 PageLayout 的留白时记得同步这里。
 */
const AppLoading = () => {
  const pathname = usePathname();

  return (
    <div className='relative w-full min-h-screen overflow-hidden'>
      <MobileHeader />
      <TopNav />

      <div className='relative z-10 w-full min-h-screen'>
        <div className='relative min-w-0'>
          <main
            className='mt-[calc(48px+env(safe-area-inset-top))] mb-14 md:mt-0 md:mb-0 md:pt-16'
            style={{
              paddingBottom:
                'calc(64px + 10px + 10px + env(safe-area-inset-bottom))',
            }}
          >
            <div className='mtv-skel'>
              <div className='mtv-skel-hero' />

              {[0, 1].map((row) => (
                <div key={row} className='mtv-skel-row'>
                  <div className='mtv-skel-title' />
                  <div className='mtv-skel-cards'>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className='mtv-skel-card' />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>

      <div className='md:hidden'>
        <MobileBottomNav activePath={pathname} />
      </div>
    </div>
  );
};

export default AppLoading;
