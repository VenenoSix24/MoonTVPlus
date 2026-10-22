'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import { MoreMenuProvider } from './MoreMenu';
import LayoutDebugOverlay from './LayoutDebugOverlay';
import TopNav from './TopNav';
import { VersionCheckProvider } from './VersionCheckProvider';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  hideNavigation?: boolean; // 控制是否隐藏顶部和底部导航栏
}

const PageLayout = ({
  children,
  activePath = '/',
  hideNavigation = false,
}: PageLayoutProps) => {
  const router = useRouter();
  const [backgroundImage, setBackgroundImage] = useState('');
  const shouldShowSharedBackground = !hideNavigation && activePath !== '/play';

  useEffect(() => {
    router.prefetch('/search');
    router.prefetch('/play');
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldShowSharedBackground) {
      setBackgroundImage('');
      return;
    }

    const homeBg = (
      window as Window & {
        RUNTIME_CONFIG?: {
          HOME_BACKGROUND_IMAGE?: string;
        };
      }
    ).RUNTIME_CONFIG?.HOME_BACKGROUND_IMAGE;
    if (!homeBg) {
      setBackgroundImage('');
      return;
    }

    const urls = homeBg
      .split('\n')
      .map((url: string) => url.trim())
      .filter((url: string) => url !== '');

    if (urls.length === 0) {
      setBackgroundImage('');
      return;
    }

    const randomIndex = Math.floor(Math.random() * urls.length);
    setBackgroundImage(urls[randomIndex]);
  }, [shouldShowSharedBackground]);

  return (
    <VersionCheckProvider>
      <div className='relative w-full min-h-screen overflow-hidden'>
        <MoreMenuProvider>
          {shouldShowSharedBackground && backgroundImage && (
            <>
              {/* 站内共享背景：固定铺满视口 + 重模糊成环境光，再压一层页面底色的薄纱。
                  原来是 absolute inset-0，只覆盖首屏 —— 滚动之后背景没了，只剩顶上一片
                  发白的残留，观感就是「每页顶部一层白雾」。 */}
              <div
                className='mtv-app-bg'
                style={{ backgroundImage: `url(${backgroundImage})` }}
                aria-hidden
              />
              <div className='mtv-app-bg-veil' aria-hidden />
            </>
          )}

          {/* 移动端头部 */}
          {!hideNavigation && (
            <MobileHeader
              showBackButton={['/play', '/live'].includes(activePath)}
            />
          )}

          {/* 桌面端顶部导航 */}
          {!hideNavigation && <TopNav />}

          <div className='relative z-10 w-full min-h-screen'>
            <div className='relative min-w-0'>
              {/* 主内容 */}
              <main className='mtv-main mt-[calc(48px+env(safe-area-inset-top))] md:mt-0 md:pt-16'>
                <div className='mtv-route-in'>{children}</div>
              </main>
            </div>
          </div>

          {/* 移动端底部导航 */}
          {!hideNavigation && (
            <div className='md:hidden'>
              <MobileBottomNav activePath={activePath} />
            </div>
          )}

          {/* 现场探针：只有 URL 带 ?mtvdebug=1 时才渲染（给开不了控制台的机器用） */}
          <LayoutDebugOverlay />
        </MoreMenuProvider>
      </div>
    </VersionCheckProvider>
  );
};

export default PageLayout;
