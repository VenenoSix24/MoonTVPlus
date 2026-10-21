'use client';

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  type SyntheticEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { getDoubanDetail } from '@/lib/douban.client';
import {
  type TMDBItem,
  getGenreNames,
  getTMDBImageUrl,
} from '@/lib/tmdb.client';
import { processImageUrl } from '@/lib/utils';

import ProxyImage from '@/components/ProxyImage';
import RatingRow, {
  type RatingSource,
  formatScore,
} from '@/components/RatingRow';
import {
  useOmdbRatings,
  useRatingRef,
  useTraktRating,
  prefetchRatings,
} from '@/hooks/useRatings';

interface BannerCarouselProps {
  autoPlayInterval?: number; // 自动播放间隔（毫秒）
  delayLoad?: boolean; // 是否延迟加载（等页面加载完毕后再加载）
}

type HomeBannerHeightScale = '1' | '1.5' | '2';

const bannerHeightClassMap: Record<HomeBannerHeightScale, string> = {
  '1': 'h-[200px] sm:h-[300px] md:h-[400px] lg:h-[500px]',
  '1.5': 'h-[300px] sm:h-[450px] md:h-[600px] lg:h-[750px]',
  '2': 'h-[400px] sm:h-[600px] md:h-[800px] lg:h-[1000px]',
};

const getSavedBannerHeightScale = (): HomeBannerHeightScale => {
  if (typeof window === 'undefined') return '1';

  const saved = localStorage.getItem('homeBannerHeightScale');
  return saved === '1.5' || saved === '2' ? saved : '1';
};

// 获取图片原始URL（处理TX完整URL和TMDB路径）
const getImageUrl = (path: string | null) => {
  if (!path) return '';
  // 如果是完整URL（TX数据源或豆瓣），直接返回原始地址
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // 否则使用TMDB的URL拼接原始地址
  return getTMDBImageUrl(path, 'original');
};

// 扩展TMDBItem类型以支持TX数据源的额外字段
interface BannerItem extends TMDBItem {
  subtitle?: string; // TX数据源的子标题
  tags?: string[]; // TX数据源的标签
  trailer_url?: string | null; // 豆瓣预告片直链
  genres?: string[]; // 豆瓣数据源的类型标签
  // 以下两项由 /api/tmdb/trending 在服务端随列表一起下发，首帧即可用
  title_logo_path?: string | null; // 官方标题字（key art logo）
  textless_poster_path?: string | null; // 无字海报
  origin_source?: 'TMDB' | 'Douban' | 'TX'; // 混合数据源下来自哪个源
  tmdb_id?: number; // 豆瓣条目反查到的 TMDB id
  tmdb_vote?: number; // TMDB 评分（豆瓣条目反查命中后一并带回）
  douban_vote?: number; // 豆瓣评分（混合模式下由服务端按 TMDB id 映射补上）
}

/* Hero 的多源评分。能拿到几个源就显示几个，不硬凑：
   - TMDB 数据源：TMDB 分直接有，IMDb / 烂番茄 / Metacritic 要经
     external_ids 反查 imdb_id 再问 OMDb；
   - 豆瓣数据源：只有豆瓣分，没有可靠的 imdb 映射可走；
   - TX 数据源：通常没有评分。 */
function HeroRatings({
  item,
  dataSource,
}: {
  item: BannerItem;
  dataSource: string;
}) {
  // 混合数据源下每一屏来源不同，按条目判断；没有标记时退回全局配置。
  // 豆瓣条目反查过 TMDB 的会带 tmdb_id，同样能走完整的 IMDb / RT / Trakt 链路。
  const origin = item.origin_source || dataSource;
  const tmdbId = item.tmdb_id ?? (origin === 'TMDB' ? item.id : null);
  const isTmdb = Boolean(tmdbId);
  const ratingRef = useRatingRef(isTmdb ? item.media_type : null, tmdbId);
  const omdb = useOmdbRatings(ratingRef);
  const trakt = useTraktRating(isTmdb ? item.media_type : null, tmdbId);

  const sources: RatingSource[] = [];

  if (omdb.imdb) {
    sources.push({ key: 'imdb', value: omdb.imdb.toFixed(1) });
  }

  const own = formatScore(item.vote_average);
  if (own) {
    sources.push({
      key: origin === 'Douban' ? 'douban' : 'tmdb',
      value: own,
    });
  }

  // 豆瓣条目反查 TMDB 后一并带上 TMDB 自己的分数。两套评分体系口径不同
  // （豆瓣偏中文观众、TMDB 偏全球），都给比只给一个更有参考价值。
  if (origin !== 'TMDB' && item.tmdb_vote) {
    const tmdbScore = formatScore(item.tmdb_vote);
    if (tmdbScore) sources.push({ key: 'tmdb', value: tmdbScore });
  }

  // TMDB 条目若在豆瓣列表里出现过，服务端会补一个 douban_vote。豆瓣没有公开的
  // 搜索接口，所以这一项只在混合模式下、且两边都收录时才有。
  if (origin !== 'Douban' && item.douban_vote) {
    const doubanScore = formatScore(item.douban_vote);
    if (doubanScore) sources.push({ key: 'douban', value: doubanScore });
  }

  if (trakt.rating) {
    sources.push({ key: 'trakt', value: trakt.rating.toFixed(1) });
  }

  if (omdb.rottenTomatoes) {
    sources.push({
      key: 'rt',
      value: String(omdb.rottenTomatoes),
      percent: true,
    });
  }

  if (omdb.metacritic) {
    sources.push({ key: 'metacritic', value: String(omdb.metacritic) });
  }

  if (sources.length === 0) return null;

  // 手机宽度只放得下三个源，按优先级截前三个
  const compact = sources.slice(0, 3);

  // 两个版本都渲染，显隐交给 CSS 媒体查询，避免首帧闪动
  return (
    <div className='mtv-hero-ratings'>
      <RatingRow sources={sources} className='is-wide' />
      <RatingRow sources={compact} className='is-narrow' />
    </div>
  );
}

/* 只负责预热，不渲染任何东西：Hero 手里本来就有整份 items，
   数据到手后按顺序把每张片的评分备好，切过去时首帧就是完整数据。
   串行 + 90ms 间隔是刻意的 —— 同时发 N×2 个请求会和标题 logo 抢带宽，
   反而让首屏更慢，这也正是之前「切过去才加载、logo 也变慢」的来源。 */
function HeroRatingPrefetch({
  items,
  dataSource,
}: {
  items: BannerItem[];
  dataSource: string;
}) {
  const doneRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      (dataSource !== 'TMDB' && dataSource !== 'Mixed') ||
      items.length === 0
    )
      return;

    let cancelled = false;

    const run = async () => {
      // 先把首屏让给标题字预取：logo 决定第一眼观感，评分晚一两秒没人会察觉
      await new Promise((resolve) => setTimeout(resolve, 1200));

      for (const item of items) {
        if (cancelled) return;
        // 豆瓣条目反查过 TMDB 的也带着 tmdb_id，可以一起预取；没有的就跳过 ——
        // 拿豆瓣 id 去查 TMDB 会查到另一部片。
        const tmdbId =
          item.tmdb_id ?? (item.origin_source === 'TMDB' ? item.id : null);
        if (!tmdbId) continue;

        const mediaType: 'movie' | 'tv' =
          item.media_type === 'tv' ? 'tv' : 'movie';
        const key = `${mediaType}:${tmdbId}`;
        if (doneRef.current.has(key)) continue;
        doneRef.current.add(key);

        try {
          await prefetchRatings(mediaType, tmdbId);
        } catch {
          // 单张失败不影响其它张
        }

        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [items, dataSource]);

  return null;
}
export default function BannerCarousel({
  autoPlayInterval = 5000,
  delayLoad = false,
}: BannerCarouselProps) {
  const router = useRouter();
  const [items, setItems] = useState<BannerItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [shouldLoad, setShouldLoad] = useState(!delayLoad); // 是否应该开始加载数据
  const [cycle, setCycle] = useState(0); // 自动播放计时器代次，用来同步指示器动画
  const [skipNextAutoPlay, setSkipNextAutoPlay] = useState(false); // 跳过下一次自动播放
  const [isYouTubeAccessible, setIsYouTubeAccessible] = useState(false); // YouTube连通性（默认false，检查后再决定）
  const [enableTrailers, setEnableTrailers] = useState(false); // 是否启用预告片（默认关闭）
  const [dataSource, setDataSource] = useState<string>(''); // 当前数据源
  const [trailersLoaded, setTrailersLoaded] = useState(false); // 预告片是否已加载
  const [isMuted, setIsMuted] = useState(true); // 视频是否静音（默认静音）
  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({}); // 官方标题字：请求键 → URL

  // 标题字若是深色单色，压在暗海报上读不出来，需要反色。
  // 判定在服务端做（TMDB 图床不返回 CORS 头，前端 canvas 采样会抛 SecurityError），
  // 结果按缓存键存在这里 —— 由下面的预取 effect 提前算好，切换时同步命中。
  const [logoMetaMap, setLogoMetaMap] = useState<
    Record<string, { dark: boolean; ratio: number; density: number }>
  >({});
  const [bannerHeightScale, setBannerHeightScale] =
    useState<HomeBannerHeightScale>('1'); // 轮播图高度倍率
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileTitleFontSize, setMobileTitleFontSize] = useState(30);
  const videoRef = useRef<HTMLVideoElement>(null); // 视频元素引用
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map()); // 所有视频元素的引用
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleTextRef = useRef<HTMLSpanElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isManualChange = useRef(false); // 标记是否为手动切换

  // LocalStorage 缓存配置
  const LOCALSTORAGE_DURATION = 24 * 60 * 60 * 1000; // 1天
  const currentTitle = items[currentIndex]?.title || '';

  // 根据数据源获取缓存key
  const getLocalStorageKey = (source: string) => {
    return `banner_trending_cache_${source}`;
  };

  // 跳转到播放页面。
  // 必须连年份一起带过去：只给片名时播放页会按标题反查，撞上同名不同年的片子
  // 就整部都错（《希望》有 2020 和 2026 两部，结果点 2026 的进了 2020 那部）。
  // 播放页本来就支持 year 参数，/api/tmdb-details 也接受它。
  const handlePlay = (item: BannerItem) => {
    const params = new URLSearchParams({ title: item.title });
    const year = String(item.release_date || '').match(/\d{4}/)?.[0];
    if (year) params.set('year', year);
    router.push(`/play?${params.toString()}`);
  };

  // 切换音量
  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    // 直接更新当前视频元素的静音状态
    const currentVideo = videoRefs.current.get(currentIndex);
    if (currentVideo) {
      currentVideo.muted = newMutedState;
    }
  };

  // 获取视频URL（处理豆瓣视频代理）
  const getVideoUrl = (url: string | null) => {
    if (!url) return null;
    // 豆瓣视频直接使用服务器代理
    if (url.includes('doubanio.com')) {
      return `/api/video-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // 读取本地设置
  useEffect(() => {
    const setting = localStorage.getItem('enableTrailers');
    if (setting !== null) {
      setEnableTrailers(setting === 'true');
    }

    setBannerHeightScale(getSavedBannerHeightScale());

    const handleHomeModulesUpdated = () => {
      setBannerHeightScale(getSavedBannerHeightScale());
    };

    window.addEventListener('homeModulesUpdated', handleHomeModulesUpdated);
    return () => {
      window.removeEventListener(
        'homeModulesUpdated',
        handleHomeModulesUpdated
      );
    };
  }, []);

  // 检测移动端视口，用于 1x 高度下的标题自适应
  useEffect(() => {
    const updateIsMobileView = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    updateIsMobileView();
    window.addEventListener('resize', updateIsMobileView);
    return () => window.removeEventListener('resize', updateIsMobileView);
  }, []);

  // 手机界面且轮播图高度为 1x 时，仅在标题超过一行时自动缩小字号，不改变布局位置
  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    const titleTextElement = titleTextRef.current;
    if (!titleElement || !titleTextElement) return;

    if (bannerHeightScale !== '1' || !isMobileView) {
      titleElement.style.fontSize = '';
      setMobileTitleFontSize(30);
      return;
    }

    const maxFontSize = 30;
    const minFontSize = 12;
    let nextFontSize = maxFontSize;

    titleElement.style.fontSize = `${nextFontSize}px`;

    while (
      nextFontSize > minFontSize &&
      titleTextElement.getClientRects().length > 1
    ) {
      nextFontSize -= 1;
      titleElement.style.fontSize = `${nextFontSize}px`;
    }

    titleElement.style.fontSize = `${nextFontSize}px`;
    setMobileTitleFontSize(nextFontSize);

    return undefined;
  }, [bannerHeightScale, currentTitle, isMobileView]);

  // 延迟加载：等待页面加载完毕后再开始加载轮播图数据
  useEffect(() => {
    if (!delayLoad) return;

    // 页面加载完毕后再开始加载
    if (document.readyState === 'complete') {
      setShouldLoad(true);
    } else {
      const handleLoad = () => {
        setShouldLoad(true);
      };
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, [delayLoad]);

  // 检测YouTube连通性 - 仅在启用预告片且数据源为TMDB时检测
  useEffect(() => {
    // 如果未启用预告片或数据源不是TMDB，不进行检测
    if (!enableTrailers || dataSource !== 'TMDB') {
      setIsYouTubeAccessible(false);
      return;
    }

    const checkYouTubeAccess = () => {
      const img = document.createElement('img');
      const timeout = setTimeout(() => {
        img.src = '';
        setIsYouTubeAccessible(false);
      }, 3000);

      img.onload = () => {
        clearTimeout(timeout);
        setIsYouTubeAccessible(true);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        setIsYouTubeAccessible(false);
      };

      // 添加随机查询参数避免缓存
      img.src = `https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg?t=${Date.now()}`;
    };

    checkYouTubeAccess();
  }, [enableTrailers, dataSource]);

  // 获取热门内容
  useEffect(() => {
    // 如果不应该加载，直接返回
    if (!shouldLoad) return;

    const fetchTrending = async () => {
      try {
        let cachedData = null;
        let validSource = null;
        let cacheExpired = false;
        let latestTimestamp = 0;

        // 遍历本地所有 banner 缓存，取时间戳最新的那份。
        // 这里不能写死 ['TMDB','TX','Douban']：多源混合时接口给的 source 是
        // 'Mixed'，写回的是 banner_trending_cache_Mixed，固定白名单永远读不到，
        // 每次进首页都当作无缓存重新请求（冷缓存要等两秒多才出画面）。
        const CACHE_PREFIX = 'banner_trending_cache_';
        const cacheKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(CACHE_PREFIX)) {
            cacheKeys.push(key);
          }
        }

        for (const cacheKey of cacheKeys) {
          const cached = localStorage.getItem(cacheKey);
          if (!cached) continue;

          try {
            const { data, timestamp } = JSON.parse(cached);

            // 选择时间戳最新的缓存
            if (timestamp > latestTimestamp) {
              cachedData = data;
              validSource = cacheKey.slice(CACHE_PREFIX.length);
              latestTimestamp = timestamp;
              cacheExpired = Date.now() - timestamp > LOCALSTORAGE_DURATION;
            }
          } catch (e) {
            console.error('解析缓存数据失败:', e);
          }
        }

        // 乐观缓存：如果有缓存（无论是否过期），先显示缓存数据
        if (cachedData) {
          primeLogoCache(cachedData);
          setItems(cachedData);
          setDataSource(validSource || ''); // 设置数据源
          setIsLoading(false);
          setTrailersLoaded(false); // 重置预告片加载状态
        }

        // 如果缓存过期或没有缓存，后台更新数据
        if (!cachedData || cacheExpired) {
          const response = await fetch('/api/tmdb/trending');
          const result = await response.json();

          if (result.code === 200 && result.list.length > 0) {
            const newDataSource = result.source || 'TMDB'; // 获取数据源标识
            const cacheKey = getLocalStorageKey(newDataSource);

            primeLogoCache(result.list);
            setItems(result.list);
            setDataSource(newDataSource); // 设置数据源
            setTrailersLoaded(false); // 重置预告片加载状态

            // 保存到 localStorage（使用数据源特定的key）
            try {
              localStorage.setItem(
                cacheKey,
                JSON.stringify({
                  data: result.list,
                  timestamp: Date.now(),
                })
              );
            } catch (e) {
              // localStorage 可能已满，忽略错误
              console.error('保存到 localStorage 失败:', e);
            }
          }
        }
      } catch (error) {
        console.error('获取热门内容失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrending();
  }, [shouldLoad]);

  // 前端获取豆瓣预告片
  useEffect(() => {
    // 只有在启用预告片、数据源是豆瓣、有数据且未加载预告片时才执行
    if (
      !enableTrailers ||
      dataSource !== 'Douban' ||
      items.length === 0 ||
      trailersLoaded
    ) {
      return;
    }

    const fetchDoubanTrailers = async () => {
      try {
        // 为每个项目获取预告片
        const itemsWithTrailers = await Promise.all(
          items.map(async (item) => {
            try {
              // 使用统一的豆瓣详情获取函数（会根据用户配置的代理设置自动选择请求方式）
              const detail = await getDoubanDetail(item.id.toString());

              // 获取预告片链接（取第一个）
              const trailerUrl =
                detail.trailers && detail.trailers.length > 0
                  ? detail.trailers[0].video_url
                  : null;

              return {
                ...item,
                trailer_url: trailerUrl,
              };
            } catch (error) {
              console.error(`获取豆瓣电影 ${item.id} 预告片失败:`, error);
              return item;
            }
          })
        );

        setItems(itemsWithTrailers);
        setTrailersLoaded(true);
      } catch (error) {
        console.error('获取豆瓣预告片失败:', error);
      }
    };

    fetchDoubanTrailers();
  }, [enableTrailers, dataSource, items.length, trailersLoaded]);

  // 切换轮播图时重置静音状态
  useEffect(() => {
    setIsMuted(true);
  }, [currentIndex]);

  // 控制视频播放/暂停和静音状态
  useEffect(() => {
    // 遍历所有视频元素
    videoRefs.current.forEach((video, index) => {
      if (index === currentIndex) {
        // 当前显示的视频：播放并设置静音状态
        video.muted = isMuted;
        video.play().catch(() => {
          // 忽略自动播放失败的错误
        });
      } else {
        // 非当前显示的视频：暂停
        video.pause();
      }
    });
  }, [currentIndex, isMuted]);

  // 自动播放。鼠标悬停不暂停——按需求「移上去也继续跑」，所以没有 isPaused 这一档。
  useEffect(() => {
    if (!items.length) return;

    const timer = setInterval(() => {
      // 如果设置了跳过标志，跳过这一次自动播放
      if (skipNextAutoPlay) {
        setSkipNextAutoPlay(false);
        return;
      }

      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [items.length, autoPlayInterval, skipNextAutoPlay]);

  // 进度条的动画要和自动播放计时器同一个起点：计时器每次重建就 bump cycle，
  // 指示器靠 key 重挂载来重启动画，条走满的瞬间正好是切片的瞬间。
  useEffect(() => {
    if (!items.length) return;
    setCycle((c) => c + 1);
  }, [items.length, autoPlayInterval, skipNextAutoPlay, currentIndex]);

  // TMDB 数据源下把所有条目的官方标题字（key art logo）一次性预取进 logoMap。
  // 不能等轮到某一屏才去取——那时背景已经切过去了、标题字还在路上，看起来就是
  // 「左边慢半拍」。豆瓣 / TX 没有这个资产，取不到就是 null，标题回落到文字。
  useEffect(() => {
    // 混合数据源里 TMDB 条目同样要判标题字深浅，否则深色 logo 在暗底上不反色。
    // 豆瓣条目在数据落地时就已经带上了 title_logo_path，命中缓存后不会重复请求。
    if ((dataSource !== 'TMDB' && dataSource !== 'Mixed') || !items.length)
      return;

    /**
     * 预判标题字深浅，顺便让服务端挑一张更合适的。
     *
     * 留到轮播切过去才做的话，会先黑一下再闪成白。这里传 id 而不是图片地址：
     * 同一部片在 TMDB 上常有好几个版本的 logo，深色的那个反相会把颜色一起翻掉
     * （深红变浅青）。服务端会在候选里挑第一张「在暗底上读得出来」的原生版本，
     * 全都挑不出来才退回反相。
     *
     * v=6 是响应格式的版本号。接口带 24h 强缓存，不换 URL 的话升级后的浏览器
     * 会继续用旧响应，挑浅色版这一步会静默失效一整天。
     */
    const warmTone = (item: BannerItem, src: string) => {
      const { key } = logoRequest(item);
      if (logoDarkCache.has(key)) return;

      // 豆瓣条目反查过 TMDB 的，必须用真实的 TMDB id —— item.id 是豆瓣的数字串，
      // 拿去查 TMDB 只会返回空，整条 logo 的深浅判定和换图就都不会发生。
      const tmdbId =
        item.tmdb_id ?? (item.origin_source === 'Douban' ? null : item.id);
      if (!tmdbId) return;

      const kind = item.media_type === 'tv' ? 'tv' : 'movie';
      const zh = /[\u3400-\u9fff\uf900-\ufaff]/.test(item.title) ? 1 : 0;

      fetch(`/api/tmdb/logo-tone?id=${tmdbId}&type=${kind}&zh=${zh}&v=8`)
        .then((res) => res.json())
        .then((data) => {
          // 没有中文、也没有原产国语言的标题字：回退文字标题。
          // 中文站宁可显示中文文字，也不显示英文 logo。
          if (data?.noLogo) {
            heroLogoCache.set(key, null);
            setLogoMap((prev) => ({ ...prev, [key]: null }));
            logoDarkCache.set(key, false);
            return;
          }

          const dark = Boolean(data?.dark);
          const ratio = typeof data?.ratio === 'number' ? data.ratio : 0;
          const density =
            typeof data?.density === 'number' ? data.density : 0;

          // 服务端挑了另一版（原生的浅色那张），把当前地址换掉
          if (typeof data?.path === 'string' && data.path) {
            const better = getTMDBImageUrl(data.path, 'w500');
            if (better && better !== src) {
              heroLogoCache.set(key, better);
              setLogoMap((prev) => ({ ...prev, [key]: better }));
              warmLogo(better);
            }
          }

          logoDarkCache.set(key, dark);
          setLogoMetaMap((prev) => ({
            ...prev,
            [key]: { dark, ratio, density },
          }));
        })
        .catch(() => {
          // 测不出来按非深色处理
        });
    };

    // 服务端随列表下发的标题字已经把 URL 写进缓存了，但「有 URL」不等于「有图」：
    // 图片本身是 <img> 挂上去那一刻才开始下的，也就是轮换到的瞬间。这里趁第一屏
    // 还在展示，把其余各屏的标题字全部下完并解码好，顺便把深浅也判掉。
    items.forEach((item) => {
      const { key } = logoRequest(item);
      const cached = heroLogoCache.get(key);
      if (cached) {
        warmLogo(cached);
        warmTone(item, cached);
      }
    });

    const pending = items.filter(
      (item) => !heroLogoCache.has(logoRequest(item).key)
    );
    if (!pending.length) return;

    const controller = new AbortController();

    pending.forEach((item) => {
      const { key, url } = logoRequest(item);
      fetch(url, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const src = data?.logo_path
            ? getTMDBImageUrl(data.logo_path, 'w500')
            : null;
          heroLogoCache.set(key, src);
          setLogoMap((prev) => ({ ...prev, [key]: src }));
          if (src) {
            warmLogo(src);
            warmTone(item, src);
          }
        })
        .catch(() => {
          // 取不到就回落到文字标题，不打扰用户
        });
    });

    return () => controller.abort();
  }, [dataSource, items]);
  const goToPrevious = useCallback(() => {
    isManualChange.current = true;
    setSkipNextAutoPlay(true);
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    setTimeout(() => {
      isManualChange.current = false;
    }, 100);
  }, [items.length]);

  const goToNext = useCallback(() => {
    isManualChange.current = true;
    setSkipNextAutoPlay(true);
    setCurrentIndex((prev) => (prev + 1) % items.length);
    setTimeout(() => {
      isManualChange.current = false;
    }, 100);
  }, [items.length]);

  const goToSlide = useCallback((index: number) => {
    isManualChange.current = true;
    setSkipNextAutoPlay(true);
    setCurrentIndex(index);
    setTimeout(() => {
      isManualChange.current = false;
    }, 100);
  }, []);

  // 触摸事件处理
  const handleTouchStart = (e: React.TouchEvent) => {
    // 防止在手动切换过程中触发
    if (isManualChange.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = 0; // 重置结束位置
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // 防止在手动切换过程中触发
    if (isManualChange.current) return;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    // 防止在手动切换过程中触发
    if (isManualChange.current) return;
    if (!touchStartX.current) return;

    // 如果有滑动，则执行滑动逻辑
    if (touchEndX.current !== 0) {
      const distance = touchStartX.current - touchEndX.current;
      const minSwipeDistance = 50; // 最小滑动距离

      if (Math.abs(distance) > minSwipeDistance) {
        if (distance > 0) {
          // 向左滑动，显示下一张
          goToNext();
        } else {
          // 向右滑动，显示上一张
          goToPrevious();
        }
      }
    }

    // 重置
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  if (isLoading || !shouldLoad) {
    // 容器挂 mtv-hero 是为了直接继承它的上提与最小高度规则：骨架和真 Hero
    // 同高同位，数据到达时不会有一下跳版。以前这里是一块 gray-* 灰渐变加
    // 半透明 logo，首屏看着像上一版的页面。
    return (
      <div
        className={`mtv-hero mtv-hero-skel relative w-full ${
          bannerHeightClassMap[bannerHeightScale]
        } overflow-hidden`}
      >
        <div className='mtv-hero-skel-body'>
          <div className='mtv-hero-skel-title' />
          <div className='mtv-hero-skel-meta' />
        </div>
      </div>
    );

  }

  if (!items.length) {
    return null;
  }

  const currentItem = items[currentIndex];

  // 指示条最多显示 7 个。数据源一多，平铺一排点会横贯整个画面；这里只渲染
  // 当前前后各三个，窗口随进度滑动 —— 位置仍然反映进度，但不随条目总数变长。
  const DOT_WINDOW = 7;
  const dotCount = Math.min(items.length, DOT_WINDOW);
  const dotStart = Math.max(
    0,
    Math.min(currentIndex - Math.floor(dotCount / 2), items.length - dotCount)
  );
  const visibleDots = Array.from({ length: dotCount }, (_, i) => dotStart + i);

  // 外部详情页：豆瓣条目跳豆瓣，TMDB 条目跳 TMDB。TX 数据源的 id 是本地序号，
  // 没有对应的公开页面，那种情况下不显示这个按钮。
  // 混合数据源下每一屏来自哪里不一定，按条目标记判断，不看全局 dataSource。
  const itemOrigin = currentItem?.origin_source || dataSource;
  const detailUrl = (() => {
    if (!currentItem) return null;
    if (itemOrigin === 'Douban') {
      return `https://movie.douban.com/subject/${currentItem.id}/`;
    }
    if (itemOrigin === 'TMDB') {
      const kind = currentItem.media_type === 'tv' ? 'tv' : 'movie';
      return `https://www.themoviedb.org/${kind}/${currentItem.id}`;
    }
    return null;
  })();

  // 中文方块字的字距规则和拉丁字母相反，见 .mtv-hero-title 的注释
  const titleIsCJK = /[\u3400-\u9fff\uf900-\ufaff]/.test(currentItem.title);

  // 官方标题字：优先读 state（预取完成后会触发重渲染），再兜一次模块缓存——
  // 重新挂载时 state 是空的，而模块缓存里已经有值，可以立刻命中。
  const logoKey = logoRequest(currentItem).key;
  const titleLogo: string | null =
    logoMap[logoKey] ?? heroLogoCache.get(logoKey) ?? null;

  // 深色、宽高比、墨迹密度都在预取阶段算好，这里同步读，不会出现「先黑一下再闪成白」
  const logoMeta = logoMetaMap[logoKey];
  const logoDark = logoMeta?.dark === true;
  const ratio = logoMeta?.ratio ?? 0;
  const density = logoMeta?.density ?? 0;
  // 视觉重量用「墨迹面积」归一，而不是让高度一致。
  // 高度一样时，近方形的 logo（泥面人 1.5:1）宽度太小、显得弱；
  // 长条片名（登峰传奇 8.89:1）宽度又太大、横贯画面。
  // 但只按矩形面积开方还不够：透明 PNG 的墨迹密度实测在 18%–57% 之间，
  // 同样的框里笔画密的显大、笔画疏的显空，所以按密度做相对修正。
  // LOGO_AREA 的语义保持「矩形面积」不变 —— 乘 REF 密度是为了让密度刚好等于
  // 参考值的片子退化回原来的尺寸，整体基准不因为加了这个维度而平移。
  const LOGO_AREA = 24000; // 目标矩形面积（px²）
  const LOGO_REF_DENSITY = 0.42; // 实测中位数，也是密度缺失时的兜底
  const LOGO_MAX_W = 480; // 与 CSS 的宽度上限（30rem）保持一致
  const logoRatio = ratio || 3; // 同时传给 CSS：宽度驱动时靠它换算高度
  const logoHeight = (() => {
    const d = density > 0.05 ? density : LOGO_REF_DENSITY;
    const ideal = Math.sqrt(
      (LOGO_AREA * LOGO_REF_DENSITY) / (logoRatio * d)
    );
    // 宽度顶到上限时的高度也要夹住，否则长条图会溢出
    return Math.max(Math.min(ideal, LOGO_MAX_W / logoRatio, 132), 42);
  })();

  // TMDB 源下标题字是异步取的。落地之前先把文字藏起来（占位仍在，不跳版），
  // 否则会「先显示文字、一秒后突然变成 logo」闪一下。
  const logoPending =
    dataSource === 'TMDB' && !titleLogo && !heroLogoCache.has(logoKey);

  return (
    <div
      className={`mtv-hero relative w-full ${bannerHeightClassMap[bannerHeightScale]} overflow-hidden group`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        // 移动端点击整个轮播图跳转
        if (window.innerWidth < 768) {
          handlePlay(currentItem);
        }
      }}
    >

      <HeroRatingPrefetch items={items} dataSource={dataSource} />
      {/* 背景图片或视频 */}
      <div className='absolute inset-0'>
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`mtv-hero-art absolute inset-0 transition-opacity duration-700 ${
              index === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {item.trailer_url && enableTrailers ? (
              /* 显示豆瓣直链视频 */
              <div className='absolute inset-0 overflow-hidden'>
                <video
                  ref={(el) => {
                    if (el) {
                      videoRefs.current.set(index, el);
                    } else {
                      videoRefs.current.delete(index);
                    }
                  }}
                  src={getVideoUrl(item.trailer_url) || undefined}
                  className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover'
                  muted={isMuted}
                  loop
                  playsInline
                  preload='metadata'
                />
              </div>
            ) : item.video_key && isYouTubeAccessible && enableTrailers ? (
              /* 显示YouTube视频 */
              <div className='absolute inset-0 overflow-hidden'>
                <iframe
                  src={`https://www.youtube.com/embed/${item.video_key}?listType=playlist&autoplay=1&mute=1&controls=0&loop=1&playlist=${item.video_key}&modestbranding=1&rel=0&showinfo=0&vq=hd1080&hd=1&disablekb=1&fs=0&iv_load_policy=3`}
                  className='absolute top-1/2 left-1/2 pointer-events-none'
                  allow='autoplay; encrypted-media'
                  style={{
                    border: 'none',
                    width: '100vw',
                    height: '100vh',
                    minWidth: '100%',
                    minHeight: '100%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </div>
            ) : (
              /* 显示图片。竖版海报走双层处理，见 HeroArt */
              <HeroArt
                item={item}
                priority={index === 0}
                active={index === currentIndex}
                mobile={isMobileView}
              />
            )}
            {/* 渐变遮罩 */}
            <div className='mtv-hero-scrim absolute inset-0'></div>
          </div>
        ))}
      </div>

      {/* 内容信息 */}
      <div className='mtv-hero-wrap absolute inset-0 flex items-end pointer-events-none'>
        <div key={currentIndex} className='mtv-hero-body max-w-xl space-y-3'>
          <h2
            ref={titleRef}
            lang={titleIsCJK ? 'zh-Hans' : 'en'}
            className='mtv-hero-title'
            style={
              isMobileView && bannerHeightScale === '1'
                ? { fontSize: `${mobileTitleFontSize}px` }
                : undefined
            }
          >
            {/* 文字始终留在 DOM 里：它是标题字的无障碍名称，而且移动端的自动缩字号
                逻辑靠 titleTextRef 量它的行数，拿掉就会失效。 */}
            <span
              ref={titleTextRef}
              className={
                titleLogo ? 'sr-only' : logoPending ? 'invisible' : undefined
              }
            >
              {currentItem.title}
            </span>
            {titleLogo && (
              <ProxyImage
                originalSrc={titleLogo}
                alt=''
                aria-hidden='true'
                className={`mtv-hero-logo${logoDark ? ' is-dark' : ''}`}
                style={
                  {
                    '--logo-h': `${logoHeight}px`,
                    '--logo-r': logoRatio,
                  } as CSSProperties
                }
                loading='eager'
                decoding='sync'
              />
            )}
          </h2>

          <HeroRatings item={currentItem} dataSource={dataSource} />

          <div className='mtv-hero-meta flex items-center gap-2 md:gap-3 text-sm md:text-base flex-wrap'>
            {/* 显示标签：优先TX的tags，其次豆瓣的genres，最后TMDB的genre_ids */}
            {currentItem.tags && currentItem.tags.length > 0
              ? currentItem.tags.slice(0, 3).map((tag, index) => (
                  <span key={index} className='mtv-hero-chip'>
                    {tag}
                  </span>
                ))
              : currentItem.genres &&
                Array.isArray(currentItem.genres) &&
                currentItem.genres.length > 0
              ? /* 显示豆瓣数据源的标签 */
                currentItem.genres.slice(0, 3).map((genre, index) => (
                  <span key={index} className='mtv-hero-chip'>
                    {genre}
                  </span>
                ))
              : /* 显示TMDB数据源的类型标签 */
                getGenreNames(currentItem.genre_ids, 3).map((genre) => (
                  <span key={genre} className='mtv-hero-chip'>
                    {genre}
                  </span>
                ))}
            {currentItem.release_date && (
              <span>{currentItem.release_date}</span>
            )}
          </div>

          {currentItem.overview && (
            <p className='mtv-hero-syn text-sm md:text-base drop-shadow-md'>
              {currentItem.overview}
            </p>
          )}

          {/* 操作区：主按钮实心 + 次按钮玻璃描边，整颗胶囊、高度与圆角完全一致。
              手机端整块不显示（见 .mtv-hero-actions 的移动端规则）——整块画面可点
              即播，再叠一个按钮是多余的一层。 */}
          <div className='mtv-hero-actions pointer-events-auto flex items-center gap-3'>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePlay(currentItem);
              }}
              className='mtv-hero-play flex items-center gap-2'
            >
              <Play className='w-5 h-5' />
              立即播放
            </button>
            {detailUrl && (
              <a
                href={detailUrl}
                target='_blank'
                rel='noopener noreferrer'
                onClick={(e) => e.stopPropagation()}
                className='mtv-hero-more hidden md:flex items-center'
              >
                {itemOrigin === 'Douban' ? '豆瓣详情' : 'TMDB 详情'}
                <ExternalLink className='h-4 w-4' />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 左右切换按钮 - 只在桌面端显示 */}
      <button
        onClick={goToPrevious}
        className='mtv-hero-ctl hidden md:flex absolute left-[var(--ui-sp-4)] top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300'
        aria-label='上一张'
      >
        <ChevronLeft className='w-8 h-8' />
      </button>
      <button
        onClick={goToNext}
        className='mtv-hero-ctl hidden md:flex absolute right-[var(--ui-sp-4)] top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300'
        aria-label='下一张'
      >
        <ChevronRight className='w-8 h-8' />
      </button>

      {/* 音量控制按钮 - 只在有豆瓣预告片时显示 */}
      {currentItem.trailer_url && enableTrailers && (
        <button
          onClick={toggleMute}
          className='mtv-hero-ctl absolute top-2 right-2 md:top-4 md:right-4 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center transition-all duration-300 z-10'
          aria-label={isMuted ? '开启声音' : '关闭声音'}
        >
          {isMuted ? (
            <VolumeX className='w-4 h-4 md:w-5 md:h-5' />
          ) : (
            <Volume2 className='w-4 h-4 md:w-5 md:h-5' />
          )}
        </button>
      )}

      {/* 指示器：未到的是圆点，当前那张拉长成进度条并按自动播放时长填充 */}
      <div className='absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2'>
        {/* 窗口式：只渲染当前前后各三个。数据一多，平铺一排点会横贯整个画面 */}
        {visibleDots.map((index) => {
          const distance = Math.abs(index - currentIndex);
          const isActive = distance === 0;
          return (
            <button
              key={index}
              onClick={(e) => {
                // 不拦的话手机上点圆点会直接跳走，而不是切到那一张。
                e.stopPropagation();
                goToSlide(index);
              }}
              className={`mtv-hero-dot${
                distance === 1 ? ' mtv-hero-dot-near' : ''
              }${isActive ? ' mtv-hero-dot-active' : ''}`}
              aria-label={`跳转到第 ${index + 1} 张`}
              aria-current={isActive}
            >
              <span
                key={cycle}
                className={`mtv-hero-dot-fill${
                  isActive ? ' mtv-hero-dot-fill-active' : ''
                }`}
                style={
                  isActive
                    ? { animationDuration: `${autoPlayInterval}ms` }
                    : undefined
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 宽高比达到这个值就按横版剧照处理，否则视为竖版海报。 */
const WIDE_ART_MIN_RATIO = 1.4;

/**
 * 把标题字图片真正下载下来并解码。
 *
 * 光有 URL 没用：`<img>` 是渲染那一刻才发起请求的，而 Hero 每切一屏会把整块文字
 * 重挂载一次，于是就成了「轮换 → 才开始下 → 白一下 → 才出来」。这里提前把字节和
 * 解码都做掉，切屏时只是从内存里画一帧。
 *
 * 元素必须留着引用 —— 脱离文档的 <img> 一旦被 GC，已解码的那份数据也跟着没了。
 */
const warmedLogos = new Map<string, HTMLImageElement>();

const warmLogo = (src: string) => {
  const url = processImageUrl(src);
  if (warmedLogos.has(url)) return;
  const img = document.createElement('img');
  img.decoding = 'sync';
  img.src = url;
  warmedLogos.set(url, img);
  void img.decode?.().catch(() => {
    // 解码失败就退回浏览器默认流程，不打扰用户
  });
};

/** 标题字按「类型:id:语言」缓存。轮播每 5 秒切一次，来回切不该反复打接口。 */
const heroLogoCache = new Map<string, string | null>();
/* 标题字深浅的预判结果：键同 logoRequest，true 表示需要反色 */
const logoDarkCache = new Map<string, boolean>();

/** 官方标题字的请求参数。key 同时用作缓存键；语言按片名内容判定。 */
const logoRequest = (item: BannerItem) => {
  const kind = item.media_type === 'tv' ? 'tv' : 'movie';
  const zh = /[\u3400-\u9fff\uf900-\ufaff]/.test(item.title) ? 1 : 0;
  return {
    key: `${kind}:${item.id}:${zh}`,
    url: `/api/tmdb/logo?id=${item.id}&type=${kind}&zh=${zh}`,
  };
};

/**
 * 把服务端随列表下发的标题字写进模块缓存。
 *
 * 必须在 setItems 之前同步调用：渲染时才去读 heroLogoCache，这样 items 到位的那
 * 一帧标题字就已经在手，不会先空一块再补上。
 *
 * 字段缺失时跳过（老 localStorage 缓存、非 TMDB 数据源），留给下面的预取 effect 兜底。
 */
const primeLogoCache = (list: BannerItem[]) => {
  list.forEach((item) => {
    if (item.title_logo_path === undefined) return;
    const { key } = logoRequest(item);
    if (heroLogoCache.has(key)) return;
    heroLogoCache.set(
      key,
      item.title_logo_path
        ? getTMDBImageUrl(item.title_logo_path, 'w500')
        : null
    );
  });
};

/**
 * Hero 画面。
 *
 * 豆瓣 / TX 数据源把同一张封面同时写进 backdrop_path 和 poster_path，而豆瓣的
 * cover_url 是 s_ratio_poster 竖图（实测 540×771）。2:3 的图被 object-cover 塞进
 * 扁 Hero，只能裁出中间一条，看着就像被拉扁铺满。
 *
 * 所以分两种画法：横版剧照直接铺满；竖版海报走两层——同一张图放大模糊铺底提供
 * 环境色，原图 object-contain 靠右立起来，比例不失真。
 *
 * 判型先按「两个字段相同即手里只有海报」同步给初值，图加载完再用实际宽高比校正，
 * 数据源换图型时不用改代码。
 */
function HeroArt({
  item,
  priority,
  active,
  mobile,
}: {
  item: BannerItem;
  priority: boolean;
  active: boolean;
  mobile: boolean;
}) {
  // 手机端优先竖版海报：2:3 的海报塞进竖屏天然合适，横版剧照则要被裁掉一大半。
  // 桌面端反过来——横屏用横图。
  //
  // 有官方标题字时手机端改用无字海报：带字海报自带的片名会和叠在上面的 logo
  // 撞在一起。无字海报不是每部片都有，取不到就回落带字海报——logo 始终保留，
  // 版面不会因为少一层而错位。
  const textlessPoster = item.textless_poster_path
    ? getTMDBImageUrl(item.textless_poster_path, 'w500')
    : null;
  const src = getImageUrl(
    mobile
      ? textlessPoster || item.poster_path || item.backdrop_path || null
      : item.backdrop_path || item.poster_path || null
  );
  const [isPoster, setIsPoster] = useState(
    () => !item.backdrop_path || item.backdrop_path === item.poster_path
  );

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    setIsPoster(naturalWidth / naturalHeight < WIDE_ART_MIN_RATIO);
  };

  // 手机端一律单层铺满：竖屏里 2:3 和 16:9 都不需要「模糊铺底 + 立式海报」那套
  const useDoubleLayer = !mobile && isPoster;

  return (
    <>
      <ProxyImage
        originalSrc={src}
        alt={item.title}
        loading={priority ? 'eager' : 'lazy'}
        onLoad={handleLoad}
        className={
          useDoubleLayer
            ? `mtv-hero-art-fill${active ? ' mtv-hero-art-fill-active' : ''}`
            : 'mtv-hero-art-cover'
        }
      />
      {useDoubleLayer && (
        <>
          {/* 渐变垫在竖版海报下面，海报才不会被渐变压暗 */}
          <div className='mtv-hero-art-veil' />
          <ProxyImage
            originalSrc={src}
            alt=''
            aria-hidden='true'
            loading={priority ? 'eager' : 'lazy'}
            className='mtv-hero-art-subject'
          />
        </>
      )}
    </>
  );
}
