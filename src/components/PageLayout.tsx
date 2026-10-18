'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { BackButton } from './BackButton';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
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
        {shouldShowSharedBackground && backgroundImage && (
          <>
            <div
              className='absolute inset-0 pointer-events-none bg-cover bg-center bg-no-repeat opacity-45'
              style={{ backgroundImage: `url(${backgroundImage})` }}
            />
            <div className='absolute inset-0 pointer-events-none bg-white/50 dark:bg-gray-950/50' />
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
            {/* 桌面端左上角返回按钮 */}
            {!hideNavigation && ['/play', '/live'].includes(activePath) && (
              <div className='absolute top-3 left-1 z-20 hidden md:flex'>
                <BackButton />
              </div>
            )}

            {/* 主内容 */}
            <main
              className='mt-[calc(3rem+env(safe-area-inset-top))] mb-14 md:mt-0 md:mb-0 md:pt-16'
              style={{
                paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
              }}
            >
              {children}
            </main>
          </div>
        </div>

        {/* 移动端底部导航 */}
        {!hideNavigation && (
          <div className='md:hidden'>
            <MobileBottomNav activePath={activePath} />
          </div>
        )}
      </div>
    </VersionCheckProvider>
  );
};

export default PageLayout;
