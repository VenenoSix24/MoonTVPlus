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

  // 整条栏压在 Hero 上时走白色那套，滚过 Hero 才转实底
  const [overHero, setOverHero] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // 搜索：收起时是个圆形图标，点开在原位长成胶囊
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // 页面实际滚动的是 body（globals 里 body 带 overflow-x:hidden，纵向滚动就落到
    // body 上），window.scrollY 一直是 0；scroll 事件又不冒泡，所以用捕获阶段收，
    // 取值把三个可能的滚动容器一起算上。
    const readScroll = () =>
      Math.max(
        window.scrollY,
        document.scrollingElement?.scrollTop ?? 0,
        document.body.scrollTop
      );

    // Hero 是异步数据渲染出来的，挂载晚于首次执行，所以缓存为空时每次都重查一遍
    let hero: HTMLElement | null = null;

    const measure = () => {
      if (!hero) hero = document.querySelector<HTMLElement>('.mtv-hero');
      // 「压在 Hero 上」= 顶栏那条 64px 横带和 Hero 有交集，不是 Hero 存在就算
      const rect = hero?.getBoundingClientRect();
      const over = !!rect && rect.top < 64 && rect.bottom > 0;

      setOverHero(over);
      // 压在 Hero 上时保持透明；Hero 过去之后再按滚动距离转实底
      setScrolled(!over && readScroll() > 40);
    };

    measure();
    window.addEventListener('scroll', measure, true);
    // Hero 挂载/换图都会改 body 高度，用 ResizeObserver 补首次判定
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    // ResizeObserver 的回调在后台标签页会被节流，Hero 又是异步渲染的，
    // 光靠它首帧可能判不出来（顶栏会一直停在浅色那套）。这里补几次有界的重测。
    const retries = [200, 800, 2000].map((delay) =>
      window.setTimeout(measure, delay)
    );
    return () => {
      window.removeEventListener('scroll', measure, true);
      observer.disconnect();
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, []);

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
