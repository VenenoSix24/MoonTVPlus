'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';

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
 */
const MobileHeader = ({ showBackButton = false }: MobileHeaderProps) => {
  const { siteName } = useSite();
  return (
    <header
      className='mtv-mheader md:hidden'
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
