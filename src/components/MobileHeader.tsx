'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

import { useNavScrollState } from '@/hooks/useNavScrollState';

import { BackButton } from './BackButton';
import { useSite } from './SiteProvider';
import { UserMenu } from './UserMenu';

interface MobileHeaderProps {
  showBackButton?: boolean;
}

/**
 * 手机顶栏：搜索 / 站名 / 头像，三件东西。
 *
 * 原来右边挤着主题、头像、更新通知三个，左边还有「更多」——「更多」已经挪到底栏
 * 第 5 格，主题进了用户菜单，更新通知手机端本来也用不上。
 * 站名绝对居中，两边按钮再怎么增减都不会把站名顶偏。
 *
 * 首屏压在 Hero 上时和桌面顶栏一样是透明的（白字），Hero 过去之后才落成实底。
 * 判定和桌面共用 useNavScrollState，横带高度取顶栏自己的下边缘，
 * 自动带上安全区，不用在这里写死 48。
 */
const MobileHeader = ({ showBackButton = false }: MobileHeaderProps) => {
  const { siteName } = useSite();
  const headerRef = useRef<HTMLElement | null>(null);
  const { overHero, onDarkCanvas } = useNavScrollState(headerRef);

  return (
    <header
      ref={headerRef}
      className={[
        'mtv-mheader md:hidden',
        overHero ? 'is-over-hero' : '',
        onDarkCanvas ? 'is-on-dark' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className='relative flex h-12 items-center justify-between px-4'>
        <div className='flex items-center gap-2'>
          <Link
            href='/search'
            prefetch={false}
            className='mtv-topnav-icon'
            aria-label='搜索'
          >
            <Search />
          </Link>
          {showBackButton && <BackButton />}
        </div>

        <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'>
          <Link
            href='/'
            prefetch={false}
            className='text-2xl font-bold tracking-tight text-ui-accent transition-opacity hover:opacity-80'
          >
            {siteName}
          </Link>
        </div>

        <UserMenu className='mtv-topnav-icon' />
      </div>
    </header>
  );
};

export default MobileHeader;
