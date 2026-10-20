/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  Blend,
  Cat,
  Clover,
  Container,
  Film,
  Globe,
  Home,
  Search,
  Star,
  Tv,
  TvMinimalPlay,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { SPECIAL_SOURCE_PATH } from '@/lib/special-source.client';
import { useNavScrollState } from '@/hooks/useNavScrollState';

import MoreMenuTrigger from './MoreMenu';
import { useSite } from './SiteProvider';
import { UpdateNotification } from './UpdateNotification';
import { UserMenu } from './UserMenu';
import { useWatchRoomContextSafe } from './WatchRoomProvider';

interface NavItem {
  icon: typeof Film;
  label: string;
  href: string;
}

/**
 * 桌面端顶部导航。
 *
 * 取代原来的固定侧栏：侧栏 + 主内容列是「后台仪表盘」的骨架，画面永远被挤在
 * 右边；流媒体平台一律用顶部导航，让内容占满整个宽度。移动端仍走 MobileHeader
 * + MobileBottomNav，这里只在 md 以上显示。
 */
const TopNav = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const watchRoomContext = useWatchRoomContextSafe();
  const { siteName } = useSite();

  const [active, setActive] = useState(pathname);

  useEffect(() => {
    const queryString = searchParams.toString();
    setActive(queryString ? `${pathname}?${queryString}` : pathname);
  }, [pathname, searchParams]);

  // /under 下的「搜索」留在特殊源入口，避免一点就跳回普通搜索
  const isUnderPath =
    pathname === SPECIAL_SOURCE_PATH ||
    pathname.startsWith(`${SPECIAL_SOURCE_PATH}/`);
  const searchHref = isUnderPath ? SPECIAL_SOURCE_PATH : '/search';

  // 压在 Hero 上时整条栏走白色那套；Hero 过去之后再按滚动距离转实底。
  // 判定逻辑在 hooks 里，手机顶栏共用同一份，两端的阈值不会漂。
  const headerRef = useRef<HTMLElement | null>(null);
  const { overHero, scrollTop } = useNavScrollState(headerRef);
  const scrolled = !overHero && scrollTop > 40;

  // 搜索：收起时是个圆形图标，点开在原位长成胶囊
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 展开后直接把焦点交给输入框，不用再点一次
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchValue('');
    setSearchOpen(false);
  };

  const submitSearch = () => {
    const keyword = searchValue.trim();
    router.push(
      keyword ? `${searchHref}?q=${encodeURIComponent(keyword)}` : searchHref
    );
    closeSearch();
  };

  const [menuItems, setMenuItems] = useState<NavItem[]>([
    { icon: Film, label: '电影', href: '/douban?type=movie' },
    { icon: Tv, label: '剧集', href: '/douban?type=tv' },
    { icon: Cat, label: '动漫', href: '/douban?type=anime' },
    { icon: Clover, label: '综艺', href: '/douban?type=show' },
    { icon: TvMinimalPlay, label: '电视直播', href: '/live' },
  ]);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;

    const items: NavItem[] = [
      { icon: Film, label: '电影', href: '/douban?type=movie' },
      { icon: Tv, label: '剧集', href: '/douban?type=tv' },
      { icon: Cat, label: '动漫', href: '/douban?type=anime' },
      { icon: Clover, label: '综艺', href: '/douban?type=show' },
    ];

    if (runtimeConfig?.LIVE_ENABLED) {
      items.push({ icon: TvMinimalPlay, label: '电视直播', href: '/live' });
    }
    if (runtimeConfig?.WEB_LIVE_ENABLED) {
      items.push({ icon: Globe, label: '网络直播', href: '/web-live' });
    }
    if (runtimeConfig?.PRIVATE_LIBRARY_ENABLED) {
      items.push({
        icon: Container,
        label: '私人影库',
        href: '/private-library',
      });
    }
    if (runtimeConfig?.ADVANCED_RECOMMENDATION_ENABLED) {
      items.push({
        icon: Blend,
        label: '高级推荐',
        href: '/advanced-recommendation',
      });
    }
    if (watchRoomContext?.isEnabled) {
      items.push({ icon: Users, label: '观影室', href: '/watch-room' });
    }
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      items.push({ icon: Star, label: '自定义', href: '/douban?type=custom' });
    }

    // 特殊源入口不在导航展示，只能手动访问 /under
    setMenuItems(items);
  }, [watchRoomContext?.isEnabled]);

  if (pathname === '/watch-room/screen') {
    return null;
  }

  const isActiveHref = (href: string) => {
    const decodedActive = decodeURIComponent(active);
    const decodedHref = decodeURIComponent(href);
    const typeMatch = href.match(/type=([^&]+)/)?.[1];
    return (
      decodedActive === decodedHref ||
      (decodedActive.startsWith('/douban') &&
        !!typeMatch &&
        decodedActive.includes(`type=${typeMatch}`)) ||
      (!typeMatch && decodedActive.split('?')[0] === decodedHref.split('?')[0])
    );
  };

  return (
    <header
      ref={headerRef}
      className={
        overHero
          ? 'mtv-topnav is-over-hero'
          : scrolled
          ? 'mtv-topnav is-scrolled'
          : 'mtv-topnav'
      }
    >
      <Link href='/' className='mtv-topnav-brand' prefetch={false}>
        {siteName}
      </Link>

      <nav className='mtv-topnav-links'>
        <Link
          href='/'
          prefetch={false}
          className='mtv-topnav-link'
          aria-current={active === '/' ? 'page' : undefined}
        >
          <Home />
          <span>首页</span>
        </Link>

        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch={false}
              className='mtv-topnav-link'
              aria-current={isActiveHref(item.href) ? 'page' : undefined}
            >
              <Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className='mtv-topnav-right'>
        <form
          className={searchOpen ? 'mtv-search is-open' : 'mtv-search'}
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeSearch();
          }}
        >
          <button
            type={searchOpen ? 'submit' : 'button'}
            className='mtv-topnav-icon'
            aria-label='搜索'
            aria-expanded={searchOpen}
            onClick={() => {
              if (!searchOpen) setSearchOpen(true);
            }}
          >
            <Search />
          </button>
          <input
            ref={searchInputRef}
            type='search'
            className='mtv-search-input'
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onBlur={() => {
              if (!searchValue.trim()) setSearchOpen(false);
            }}
            placeholder='搜索影片、剧集'
            aria-label='搜索关键词'
            tabIndex={searchOpen ? 0 : -1}
          />
          <button
            type='button'
            className='mtv-search-cancel'
            onClick={closeSearch}
            tabIndex={searchOpen ? 0 : -1}
          >
            取消
          </button>
        </form>
        <MoreMenuTrigger variant='desktop' />
        <UpdateNotification />
        <UserMenu className='mtv-topnav-icon' />
      </div>
    </header>
  );
};

export default TopNav;
