/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getDoubanCategories } from '@/lib/douban.client';
import {
  type HomeModule,
  defaultHomeModules,
  mergeHomeModules,
  resolveSiteHomeModules,
} from '@/lib/home-modules';
import { getTMDBImageUrl, TMDBItem } from '@/lib/tmdb.client';
import { DoubanItem } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import BannerCarousel from '@/components/BannerCarousel';
import ContinueWatching from '@/components/ContinueWatching';
import FireworksCanvas from '@/components/FireworksCanvas';
import HttpWarningDialog from '@/components/HttpWarningDialog';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

function HomeClient() {
  // 移除了 activeTab 状态，收藏夹功能已移到 UserMenu
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [hotDuanju, setHotDuanju] = useState<any[]>([]);
  const [upcomingContent, setUpcomingContent] = useState<TMDBItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [loading, setLoading] = useState(true);
  const { announcement, announcementDisplayMode } = useSite();
  // 首页模块配置状态：默认值来自站点配置，本机覆盖在 loadHomeLayoutSettings 里合并
  const [homeModules, setHomeModules] =
    useState<HomeModule[]>(defaultHomeModules);
  const [homeBannerEnabled, setHomeBannerEnabled] = useState(true);
  const [homeContinueWatchingEnabled, setHomeContinueWatchingEnabled] =
    useState(true);

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showHttpWarning, setShowHttpWarning] = useState(true);

  /** 站点默认来自管理端 ThemeConfig.homeModules；没配过就回落内置目录。 */
  const siteDefaultModules = (): HomeModule[] =>
    resolveSiteHomeModules(
      typeof window === 'undefined'
        ? null
        : (window as any).RUNTIME_CONFIG?.HOME_MODULES ?? null
    );

  const loadHomeLayoutSettings = () => {
    if (typeof window === 'undefined') return;

    // 站点默认打底，本机改过的以本机为准；本机那份里没有的模块（代码后加的）
    // 会按站点默认补进来，不然新模块永远只有没动过设置的人能看见。
    const savedHomeModules = localStorage.getItem('homeModules');
    let parsedHomeModules: unknown = null;
    if (savedHomeModules) {
      try {
        parsedHomeModules = JSON.parse(savedHomeModules);
      } catch (error) {
        console.error('解析首页模块配置失败:', error);
      }
    }
    setHomeModules(mergeHomeModules(siteDefaultModules(), parsedHomeModules));

    const savedHomeBannerEnabled = localStorage.getItem('homeBannerEnabled');
    if (savedHomeBannerEnabled !== null) {
      setHomeBannerEnabled(savedHomeBannerEnabled === 'true');
    }

    const savedHomeContinueWatchingEnabled = localStorage.getItem(
      'homeContinueWatchingEnabled'
    );
    if (savedHomeContinueWatchingEnabled !== null) {
      setHomeContinueWatchingEnabled(
        savedHomeContinueWatchingEnabled === 'true'
      );
    } else {
      // 没动过就用站点默认；站点也没配就显示
      setHomeContinueWatchingEnabled(
        (window as any).RUNTIME_CONFIG?.HOME_CONTINUE_WATCHING !== false
      );
    }
  };

  // 加载首页模块配置
  useEffect(() => {
    loadHomeLayoutSettings();
  }, []);

  // 监听首页模块配置更新事件
  useEffect(() => {
    const handleHomeModulesUpdated = () => {
      loadHomeLayoutSettings();
    };

    window.addEventListener('homeModulesUpdated', handleHomeModulesUpdated);
    return () => {
      window.removeEventListener(
        'homeModulesUpdated',
        handleHomeModulesUpdated
      );
    };
  }, []);

  // 检查公告弹窗状态
  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      // 会话级标记：只在首次访问站点时弹出，导航切回首页不重复弹
      if (sessionStorage.getItem('announcementShown')) {
        return;
      }
      // 每次显示模式：每次新会话首次访问弹出一次
      if (announcementDisplayMode === 'every') {
        setShowAnnouncement(true);
        sessionStorage.setItem('announcementShown', '1');
        return;
      }
      // 单次显示模式：localStorage 记住已看过的公告文本，换公告则重新弹出
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement, announcementDisplayMode]);

  useEffect(() => {
    const CACHE_DURATION = 60 * 60 * 1000; // 1小时

    const getCache = (key: string) => {
      try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        return { data, expired: Date.now() - timestamp > CACHE_DURATION };
      } catch {
        return null;
      }
    };

    const setCache = (key: string, data: any) => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ data, timestamp: Date.now() })
        );
      } catch {
        // Ignore localStorage errors
      }
    };

    const moviesCache = getCache('homepage_movies');
    const tvShowsCache = getCache('homepage_tvshows');
    const varietyCache = getCache('homepage_variety');
    const bangumiCache = getCache('homepage_bangumi');
    const duanjuCache = getCache('homepage_duanju');
    const upcomingCache = getCache('homepage_upcoming');

    if (moviesCache?.data) setHotMovies(moviesCache.data);
    if (tvShowsCache?.data) setHotTvShows(tvShowsCache.data);
    if (varietyCache?.data) setHotVarietyShows(varietyCache.data);
    if (bangumiCache?.data) setBangumiCalendarData(bangumiCache.data);
    if (duanjuCache?.data) setHotDuanju(duanjuCache.data);
    if (upcomingCache?.data) setUpcomingContent(upcomingCache.data);

    const hasCache =
      moviesCache ||
      tvShowsCache ||
      varietyCache ||
      bangumiCache ||
      duanjuCache ||
      upcomingCache;
    if (hasCache) setLoading(false);

    const needsRefresh =
      !moviesCache ||
      moviesCache.expired ||
      !tvShowsCache ||
      tvShowsCache.expired ||
      !varietyCache ||
      varietyCache.expired ||
      !bangumiCache ||
      bangumiCache.expired ||
      !duanjuCache ||
      duanjuCache.expired ||
      !upcomingCache ||
      upcomingCache.expired;

    if (needsRefresh) {
      (async () => {
        try {
          const [
            moviesData,
            tvShowsData,
            varietyShowsData,
            bangumiCalendarData,
          ] = await Promise.all([
            getDoubanCategories({
              kind: 'movie',
              category: '热门',
              type: '全部',
            }).catch((error) => {
              console.error('获取热门电影数据失败:', error);
              return null;
            }),
            getDoubanCategories({
              kind: 'tv',
              category: 'tv',
              type: 'tv',
            }).catch((error) => {
              console.error('获取热门剧集数据失败:', error);
              return null;
            }),
            getDoubanCategories({
              kind: 'tv',
              category: 'show',
              type: 'show',
            }).catch((error) => {
              console.error('获取热门综艺数据失败:', error);
              return null;
            }),
            GetBangumiCalendarData().catch((error) => {
              console.error('获取新番放送数据失败:', error);
              return [];
            }),
          ]);

          if (moviesData?.code === 200) {
            setHotMovies(moviesData.list);
            if (moviesData.list && moviesData.list.length > 0) {
              setCache('homepage_movies', moviesData.list);
            }
          }
          if (tvShowsData?.code === 200) {
            setHotTvShows(tvShowsData.list);
            if (tvShowsData.list && tvShowsData.list.length > 0) {
              setCache('homepage_tvshows', tvShowsData.list);
            }
          }
          if (varietyShowsData?.code === 200) {
            setHotVarietyShows(varietyShowsData.list);
            if (varietyShowsData.list && varietyShowsData.list.length > 0) {
              setCache('homepage_variety', varietyShowsData.list);
            }
          }
          setBangumiCalendarData(bangumiCalendarData);
          if (bangumiCalendarData && bangumiCalendarData.length > 0) {
            setCache('homepage_bangumi', bangumiCalendarData);
          }

          try {
            const duanjuResponse = await fetch('/api/duanju/recommends');
            if (duanjuResponse.ok) {
              const duanjuResult = await duanjuResponse.json();
              if (
                duanjuResult.code === 200 &&
                duanjuResult.data &&
                duanjuResult.data.length > 0
              ) {
                setHotDuanju(duanjuResult.data);
                setCache('homepage_duanju', duanjuResult.data);
              }
            }
          } catch (error) {
            console.error('获取热播短剧数据失败:', error);
          }

          try {
            const response = await fetch('/api/tmdb/upcoming');
            if (response.ok) {
              const result = await response.json();
              if (
                result.code === 200 &&
                result.data &&
                result.data.length > 0
              ) {
                const sorted = [...result.data].sort((a, b) => {
                  const dateA = new Date(
                    a.release_date || '9999-12-31'
                  ).getTime();
                  const dateB = new Date(
                    b.release_date || '9999-12-31'
                  ).getTime();
                  return dateA - dateB;
                });
                setUpcomingContent(sorted);
                setCache('homepage_upcoming', sorted);
              }
            }
          } catch (error) {
            console.error('获取TMDB即将上映数据失败:', error);
          }

          setLoading(false);
        } catch (error) {
          console.error('获取推荐数据失败:', error);
          setLoading(false);
        }
      })();
    }
  }, []);

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  // 渲染模块的函数
  const renderModule = (moduleId: string) => {
    switch (moduleId) {
      case 'hotMovies':
        if (!loading && hotMovies.length === 0) return null;
        return (
          <section key='hotMovies' className='mtv-row'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='mtv-row-title'>热门电影</h2>
              <Link href='/douban?type=movie' className='mtv-row-more'>
                查看更多
                <ChevronRight className='w-4 h-4 ml-1' />
              </Link>
            </div>
            <ScrollableRow snap>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className='mtv-card-md'>
                      <div className='mtv-skel-poster' />
                      <div className='mtv-skel-line' />
                    </div>
                  ))
                : hotMovies.map((movie) => (
                    <div key={movie.id} className='mtv-card-md'>
                      <VideoCard
                        hoverPanel
                        id={movie.id}
                        poster={movie.poster}
                        title={movie.title}
                        year={movie.year}
                        rate={movie.rate}
                        type='movie'
                        from='douban'
                        douban_id={movie.id ? parseInt(movie.id) : undefined}
                      />
                    </div>
                  ))}
            </ScrollableRow>
          </section>
        );

      case 'hotDuanju':
        if (!loading && hotDuanju.length === 0) return null;
        return (
          <section key='hotDuanju' className='mtv-row'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='mtv-row-title'>热播短剧</h2>
              <Link href='/duanju' className='mtv-row-more'>
                查看更多
                <ChevronRight className='w-4 h-4 ml-1' />
              </Link>
            </div>
            <ScrollableRow snap>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className='mtv-card-md'>
                      <div className='mtv-skel-poster' />
                      <div className='mtv-skel-line' />
                    </div>
                  ))
                : hotDuanju.map((duanju) => (
                    <div
                      key={duanju.id + duanju.source}
                      className='mtv-card-md'
                    >
                      <VideoCard
                        hoverPanel
                        id={duanju.id}
                        source={duanju.source}
                        poster={duanju.poster}
                        title={duanju.title}
                        year={duanju.year}
                        type='tv'
                        from='search'
                        source_name={duanju.source_name}
                        episodes={duanju.episodes?.length}
                        douban_id={duanju.douban_id}
                        cmsData={{
                          desc: duanju.desc,
                          episodes: duanju.episodes,
                          episodes_titles: duanju.episodes_titles,
                        }}
                      />
                    </div>
                  ))}
            </ScrollableRow>
          </section>
        );

      case 'bangumiCalendar': {
        const today = new Date();
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayAnimes =
          bangumiCalendarData
            .find((item) => item.weekday.en === weekdays[today.getDay()])
            ?.items.filter((anime) => anime.images) || [];

        // 这一行只显示当天更新的番，「今天没有」是常态而不是异常。空态必须和别的行
        // 一样收起来，否则会留下「标题 + 查看更多 + 空轨道」的空壳。
        if (!loading && todayAnimes.length === 0) return null;

        return (
          <section key='bangumiCalendar' className='mtv-row'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='mtv-row-title'>新番放送</h2>
              <Link href='/douban?type=anime' className='mtv-row-more'>
                查看更多
                <ChevronRight className='w-4 h-4 ml-1' />
              </Link>
            </div>
            <ScrollableRow snap>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className='mtv-card-md'>
                      <div className='mtv-skel-poster' />
                      <div className='mtv-skel-line' />
                    </div>
                  ))
                : todayAnimes.map((anime, index) => (
                    <div key={`${anime.id}-${index}`} className='mtv-card-md'>
                      <VideoCard
                        hoverPanel
                        from='douban'
                        title={anime.name_cn || anime.name}
                        poster={
                          anime.images?.large ||
                          anime.images?.common ||
                          anime.images?.medium ||
                          anime.images?.small ||
                          anime.images?.grid ||
                          ''
                        }
                        douban_id={anime.id}
                        rate={anime.rating?.score?.toFixed(1) || ''}
                        year={anime.air_date?.split('-')?.[0] || ''}
                        isBangumi={true}
                      />
                    </div>
                  ))}
            </ScrollableRow>
          </section>
        );
      }

      case 'hotTvShows':
        if (!loading && hotTvShows.length === 0) return null;
        return (
          <section key='hotTvShows' className='mtv-row'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='mtv-row-title'>热门剧集</h2>
              <Link href='/douban?type=tv' className='mtv-row-more'>
                查看更多
                <ChevronRight className='w-4 h-4 ml-1' />
              </Link>
            </div>
            <ScrollableRow snap>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className='mtv-card-md'>
                      <div className='mtv-skel-poster' />
                      <div className='mtv-skel-line' />
                    </div>
                  ))
                : hotTvShows.map((tvShow) => (
                    <div key={tvShow.id} className='mtv-card-md'>
                      <VideoCard
                        hoverPanel
                        id={tvShow.id}
                        poster={tvShow.poster}
                        title={tvShow.title}
                        year={tvShow.year}
                        rate={tvShow.rate}
                        type='tv'
                        from='douban'
                        douban_id={tvShow.id ? parseInt(tvShow.id) : undefined}
                      />
                    </div>
                  ))}
            </ScrollableRow>
          </section>
        );

      case 'hotVarietyShows':
        if (!loading && hotVarietyShows.length === 0) return null;
        return (
          <section key='hotVarietyShows' className='mtv-row'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='mtv-row-title'>热门综艺</h2>
              <Link href='/douban?type=show' className='mtv-row-more'>
                查看更多
                <ChevronRight className='w-4 h-4 ml-1' />
              </Link>
            </div>
            <ScrollableRow snap>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className='mtv-card-md'>
                      <div className='mtv-skel-poster' />
                      <div className='mtv-skel-line' />
                    </div>
                  ))
                : hotVarietyShows.map((varietyShow) => (
                    <div key={varietyShow.id} className='mtv-card-md'>
                      <VideoCard
                        hoverPanel
                        id={varietyShow.id}
                        poster={varietyShow.poster}
                        title={varietyShow.title}
                        year={varietyShow.year}
                        rate={varietyShow.rate}
                        type='tv'
                        from='douban'
                        douban_id={
                          varietyShow.id ? parseInt(varietyShow.id) : undefined
                        }
                      />
                    </div>
                  ))}
            </ScrollableRow>
          </section>
        );

      case 'upcomingContent':
        if (!loading && upcomingContent.length === 0) return null;
        return (
          <section key='upcomingContent' className='mtv-row'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='mtv-row-title'>即将上映</h2>
            </div>
            <ScrollableRow snap>
              {upcomingContent.map((item) => (
                <div
                  key={`${item.media_type}-${item.id}`}
                  className='mtv-card-md'
                >
                  <VideoCard
                    hoverPanel
                    title={item.title}
                    poster={processImageUrl(getTMDBImageUrl(item.poster_path))}
                    year={item.release_date?.split('-')?.[0] || ''}
                    rate={
                      item.vote_average && item.vote_average > 0
                        ? item.vote_average.toFixed(1)
                        : ''
                    }
                    type={item.media_type === 'tv' ? 'tv' : 'movie'}
                    from='douban'
                    tmdb_id={item.id}
                    releaseDate={item.release_date}
                    isUpcoming={true}
                  />
                </div>
              ))}
            </ScrollableRow>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <PageLayout>
      <FireworksCanvas />
      {/* TMDB 热门轮播图 */}
      {homeBannerEnabled && (
        <div className='w-full mb-4'>
          <BannerCarousel delayLoad={true} />
        </div>
      )}

      <div className='mtv-page overflow-visible'>
        <div>
          {/* 首页内容 */}
          <>
            {/* 继续观看 */}
            {homeContinueWatchingEnabled && <ContinueWatching />}

            {/* 根据配置动态渲染首页模块 */}
            {homeModules
              .filter((module) => module.enabled)
              .sort((a, b) => a.order - b.order)
              .map((module) => renderModule(module.id))}
          </>
        </div>
      </div>

      {/* HTTP 环境警告弹窗 */}
      {showHttpWarning && (
        <HttpWarningDialog onClose={() => setShowHttpWarning(false)} />
      )}

      {/* 公告弹窗 */}
      {showAnnouncement && (
        <div
          className='fixed inset-0 z-[var(--ui-z-modal)] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm'
          onClick={() => handleCloseAnnouncement(announcement || '')}
        >
          <div
            role='dialog'
            aria-modal='true'
            aria-labelledby='announcement-title'
            className='animate-slide-up w-full max-w-md overflow-hidden rounded-ui-lg border border-ui-hair bg-ui-surface shadow-ui-3'
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部强调线：一条就够，再多就成了装饰 */}
            <div className='h-[3px] w-full bg-ui-accent' />

            <div className='p-5 sm:p-6'>
              <div className='mb-3 flex items-start gap-3'>
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ui-accent-soft text-ui-accent'>
                  <Megaphone className='h-4 w-4' />
                </div>
                <div className='min-w-0 pt-0.5'>
                  <h3
                    id='announcement-title'
                    className='text-base font-semibold text-ui-ink'
                  >
                    公告
                  </h3>
                  <p className='mt-0.5 text-xs text-ui-ink-3'>来自站点的通知</p>
                </div>
              </div>

              {/* 长公告在框内滚动，不把弹窗撑出屏幕 */}
              <div className='max-h-[46vh] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words pr-1 text-sm leading-relaxed text-ui-ink-2'>
                {announcement}
              </div>

              <button
                onClick={() => handleCloseAnnouncement(announcement || '')}
                className='mt-5 w-full rounded-ui-md bg-ui-accent py-2.5 text-sm font-semibold text-ui-accent-ink transition-opacity hover:opacity-90 active:opacity-80'
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
