'use client';

import { Cat, Film, Home, LayoutGrid, Tv } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface MobileBottomNavProps {
  /**
   * 主动指定当前激活的路径。当未提供时，自动使用 usePathname() 获取的路径。
   */
  activePath?: string;
}

/**
 * 手机底部导航：悬浮胶囊 + 固定五格。
 *
 * 只剩五格（首页 / 电影 / 剧集 / 动漫 / 更多），其余频道和工具都进了 /more。
 * 旧版是每格写死 20vw + 横向滚动，项数一变就把后面的格推到屏幕外：既没有提示，
 * 也没法滑到，等于藏起来了。
 */
const NAV_ITEMS = [
  { icon: Home, label: '首页', href: '/' },
  { icon: Film, label: '电影', href: '/douban?type=movie' },
  { icon: Tv, label: '剧集', href: '/douban?type=tv' },
  { icon: Cat, label: '动漫', href: '/douban?type=anime' },
  { icon: LayoutGrid, label: '更多', href: '/more' },
];

const MobileBottomNav = ({ activePath }: MobileBottomNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname === '/watch-room/screen') {
    return null;
  }

  const queryString = searchParams.toString();
  const currentActive =
    activePath ?? (queryString ? `${pathname}?${queryString}` : pathname);

  const isActive = (href: string) => {
    const decodedActive = decodeURIComponent(currentActive);
    const decodedHref = decodeURIComponent(href);

    if (decodedActive === decodedHref) return true;

    const typeMatch = href.match(/type=([^&]+)/)?.[1];
    return (
      !!typeMatch &&
      decodedActive.startsWith('/douban') &&
      decodedActive.includes(`type=${typeMatch}`)
    );
  };

  const activeIndex = NAV_ITEMS.findIndex((item) => isActive(item.href));

  return (
    <nav className='mtv-bnav md:hidden' aria-label='底部导航'>
      <div className='mtv-bnav-list'>
        {activeIndex >= 0 && (
          <span
            className='mtv-bnav-pill'
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
            aria-hidden
          />
        )}

        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={active ? 'mtv-bnav-item is-active' : 'mtv-bnav-item'}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
