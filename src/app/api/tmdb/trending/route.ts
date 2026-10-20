/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { fetchDoubanData } from '@/lib/douban';
import {
  getTMDBImages,
  getTMDBTrendingContent,
  getTMDBVideos,
  searchTMDBByTitle,
} from '@/lib/tmdb.client';
import { pickLogo, pickTextlessPoster, titlePrefersZh } from '@/lib/tmdb.logo';

// 缓存配置 - 服务器内存缓存3小时
const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3小时

/**
 * 给一个 promise 套上预算，超时或失败都返回 null。
 *
 * 标题字是锦上添花：拿不到就回落文字标题，用户完全无感。但 getTMDBImages 自己带
 * 15/30 秒超时，撞上慢代理时会把整个列表一起拖住——首页要多等半分钟才出轮播图，
 * 代价和收益完全不成比例。这里单独压一个短预算，到点就当没有。
 */
const ASSET_BUDGET_MS = 6000;

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise.catch(() => null), budget]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// 为不同数据源分别维护缓存
let tmdbCache: { data: any; timestamp: number } | null = null;
let txCache: { data: any; timestamp: number } | null = null;
let doubanCache: { data: any; timestamp: number } | null = null;
let mixedCache: { data: any; timestamp: number } | null = null;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 获取配置
    const config = await getConfig();
    const bannerDataSource = config.SiteConfig?.BannerDataSource || 'Douban';

    // 根据数据源选择对应的缓存
    const cache =
      bannerDataSource === 'TX'
        ? txCache
        : bannerDataSource === 'Douban'
          ? doubanCache
          : bannerDataSource === 'Mixed'
            ? mixedCache
            : tmdbCache;

    // 检查缓存
    if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
      return NextResponse.json(cache.data);
    }

    let result: any;

    // 根据配置的数据源获取数据
    if (bannerDataSource === 'Douban') {
      // 使用豆瓣数据源
      result = await getDoubanBannerContent(config);
      // 添加数据源标识
      result.source = 'Douban';
      // 更新豆瓣缓存
      doubanCache = {
        data: result,
        timestamp: Date.now(),
      };
    } else if (bannerDataSource === 'TX') {
      // 使用TX数据源
      result = await getTXBannerContent();
      // 添加数据源标识
      result.source = 'TX';
      // 更新TX缓存
      txCache = {
        data: result,
        timestamp: Date.now(),
      };
    } else if (bannerDataSource === 'Mixed') {
      // 单一数据源看久了就那么几部在转。混合模式让 TMDB 和豆瓣交替出场：
      // TMDB 带官方标题字和预告片，豆瓣带它自己的热点，两边各补一半视角。
      result = await getMixedBannerContent(config);
      result.source = 'Mixed';
      mixedCache = {
        data: result,
        timestamp: Date.now(),
      };
    } else {
      // 使用TMDB数据源（默认）
      result = await getTMDBBannerContent(config);
      if (result.code !== 200) {
        return NextResponse.json(
          { code: result.code, message: result.message },
          { status: result.code }
        );
      }
      // 添加数据源标识
      result.source = 'TMDB';
      // 更新TMDB缓存
      tmdbCache = {
        data: result,
        timestamp: Date.now(),
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('获取热门内容失败:', error);
    return NextResponse.json(
      { code: 500, message: '获取热门内容失败' },
      { status: 500 }
    );
  }
}

/**
 * 获取TX轮播图内容
 */
async function getTXBannerContent(): Promise<{ code: number; list: any[] }> {
  try {
    // TX API 配置
    const txApiUrl = 'https://pbaccess.video.qq.com/trpc.vector_layout.page_view.PageService/getPage?video_appid=3000010&vversion_platform=2&vdevice_guid=a458b2024f8d6f14';
    const requestBody = {
      page_params: {
        page_type: 'channel',
        page_id: '100101',
        scene: 'channel',
        new_mark_label_enabled: '1',
        vl_to_mvl: '',
        free_watch_trans_info: '{"ad_frequency_control_time_list":{}}',
        ad_exp_ids: '',
        ams_cookies: 'lv_play_index=33; o_minduid=PBUiqKSklDHZsTs2JqmXhTsczQfz5uzY; appuser=CC19AC2067F39B71',
        ad_trans_data: '{"ad_request_id":"uglfjd6-26n6yw4-gs9tlvy-k19l366","game_sessions":[]}',
        skip_privacy_types: '0',
        support_click_scan: '1',
      },
      page_bypass_params: {
        params: {
          platform_id: '2',
          caller_id: '3000010',
          data_mode: 'default',
          user_mode: 'default',
          specified_strategy: '',
          page_type: 'channel',
          page_id: '100101',
          scene: 'channel',
          new_mark_label_enabled: '1',
        },
        scene: 'channel',
        app_version: '',
        abtest_bypass_id: 'a458b2024f8d6f14',
      },
      page_context: null,
    };

    // 发送请求到TX API
    const response = await fetch(txApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000),
    });
	
    if (!response.ok) {
      console.error('TX API 请求失败:', response.status, response.statusText);
      return { code: response.status, list: [] };
    }

    const data = await response.json();

    // 解析响应数据
    const bannerItems = parseTXBannerData(data);

    return {
      code: 200,
      list: bannerItems,
    };
  } catch (error) {
    console.error('获取 TX 轮播图数据失败:', error);
    return { code: 500, list: [] };
  }
}

/**
 * 解析TX API响应数据，提取轮播图信息
 */
function parseTXBannerData(data: any): any[] {
  try {
    const cardList = data?.data?.CardList;
    if (!Array.isArray(cardList)) {
      return [];
    }

    // 找到所有类型为 pc_shelves 的卡片
    const pcShelvesCards = cardList.filter((card: any) => card.type === 'pc_shelves');
    if (pcShelvesCards.length === 0) {
      return [];
    }

    // 尝试每个 pc_shelves 卡片，直到找到有效数据
    for (let i = 0; i < pcShelvesCards.length; i++) {
      const pcShelvesCard = pcShelvesCards[i];

      const cards = pcShelvesCard?.children_list?.list?.cards;
      if (!Array.isArray(cards) || cards.length === 0) {
        continue;
      }

    // 转换为统一格式
    const cardsWithParams = cards.filter((card: any) => card.params);

    const mappedItems = cardsWithParams.map((card: any, index: number) => {
        const params = card.params;

        // 获取标题（优先使用title）
        const title = params.title || '';

        // 获取子标题（优先使用priority_sub_title，其次rec_normal_reason）
        const subtitle = params.priority_sub_title || params.rec_normal_reason || '';

        // 获取标签（用"|"分割）
        const topicLabel = params.topic_label || '';
        const tags = topicLabel ? topicLabel.split('|').filter(Boolean) : [];

        // 获取背景图
        const backdropPath = params.priority_image_url || '';

        return {
          id: index + 1, // 使用索引作为ID
          title,
          subtitle,
          tags,
          backdrop_path: backdropPath,
          poster_path: backdropPath, // 使用相同的图片
          release_date: '',
          overview: subtitle,
          vote_average: 0,
          media_type: 'tv',
          genre_ids: [],
        };
      });

      const bannerItems = mappedItems.filter((item: any) => {
        // 只保留有标题和背景图的项目
        if (!item.title || !item.backdrop_path) return false;
        // 剔除标题包含"免费合集"的数据
        if (item.title.includes('免费合集')) return false;
        return true;
      });

      if (bannerItems.length > 0) {
        return bannerItems;
      }
    }

    // 所有 pc_shelves 卡片都没有有效数据
    return [];
  } catch (error) {
    console.error('解析 TX 轮播图数据失败:', error);
    return [];
  }
}

/**
 * 获取豆瓣轮播图内容
 */
async function getDoubanBannerContent(
  config?: any
): Promise<{ code: number; list: any[] }> {
  try {
    // 获取豆瓣热门电影
    const hotMoviesUrl = 'https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie?start=0&limit=10&category=热门&type=全部';

    interface DoubanHotMovie {
      id: string;
      title: string;
      card_subtitle?: string;
      pic?: {
        large: string;
        normal: string;
      };
      rating?: {
        value: number;
      };
    }

    interface DoubanHotMoviesResponse {
      items: DoubanHotMovie[];
    }

    const hotMoviesData = await fetchDoubanData<DoubanHotMoviesResponse>(hotMoviesUrl);

    if (!hotMoviesData.items || hotMoviesData.items.length === 0) {
      return { code: 200, list: [] };
    }

    // 取前5个电影
    const topMovies = hotMoviesData.items.slice(0, 5);

    // 为每个电影获取详情信息
    const bannerItems = await Promise.all(
      topMovies.map(async (movie) => {
        try {
          const detailUrl = `https://m.douban.com/rexxar/api/v2/subject/${movie.id}`;

          interface DoubanDetailResponse {
            id: string;
            title: string;
            original_title?: string;
            year: string;
            rating?: {
              value: number;
            };
            intro?: string;
            genres?: string[];
            cover_url?: string;
            trailers?: Array<{
              video_url?: string;
              [key: string]: any;
            }>;
            [key: string]: any;
          }

          const detail = await fetchDoubanData<DoubanDetailResponse>(detailUrl);

          // 获取横屏图片
          const backdropPath = detail.cover_url || movie.pic?.large || movie.pic?.normal || '';

          // 提取年份
          const year = detail.year || movie.card_subtitle?.match(/(\d{4})/)?.[1] || '';

          // 从card_subtitle提取标签（只读取第二个部分，通过空格分割）
          let tags: string[] = [];
          if (movie.card_subtitle) {
            const parts = movie.card_subtitle.split('/').map(s => s.trim());
            // 过滤掉年份（纯数字）和空字符串
            const filteredParts = parts.filter(part =>
              part && !/^\d{4}$/.test(part)
            );
            // 取第二个部分（类型），通过空格分割
            if (filteredParts.length >= 2) {
              tags = filteredParts[1].split(/\s+/).filter(t => t);
            }
          }

          return {
            id: movie.id,
            title: detail.title,
            backdrop_path: backdropPath,
            poster_path: backdropPath,
            release_date: year,
            overview: detail.intro || '',
            vote_average: detail.rating?.value || movie.rating?.value || 0,
            media_type: 'movie',
            genre_ids: [],
            genres: tags, // 使用从card_subtitle提取的标签
            video_key: null, // 豆瓣不使用YouTube key
          };
        } catch (error) {
          console.error(`获取豆瓣电影 ${movie.id} 详情失败:`, error);

          // 从card_subtitle提取标签（只读取第二个部分，通过空格分割）
          let tags: string[] = [];
          if (movie.card_subtitle) {
            const parts = movie.card_subtitle.split('/').map(s => s.trim());
            // 过滤掉年份（纯数字）和空字符串
            const filteredParts = parts.filter(part =>
              part && !/^\d{4}$/.test(part)
            );
            // 取第二个部分（类型），通过空格分割
            if (filteredParts.length >= 2) {
              tags = filteredParts[1].split(/\s+/).filter(t => t);
            }
          }

          // 如果获取详情失败，使用基本信息
          return {
            id: movie.id,
            title: movie.title,
            backdrop_path: movie.pic?.large || movie.pic?.normal || '',
            poster_path: movie.pic?.large || movie.pic?.normal || '',
            release_date: movie.card_subtitle?.match(/(\d{4})/)?.[1] || '',
            overview: '',
            vote_average: movie.rating?.value || 0,
            media_type: 'movie',
            genre_ids: [],
            genres: tags, // 使用从card_subtitle提取的标签
            video_key: null,
          };
        }
      })
    );

    // 数据源是豆瓣，但出图按 TMDB 那一套来：豆瓣只给压缩过的封面（540×771），
    // 也没有发行方做的官方标题字。先按片名 + 年份反查 TMDB，命中就把图换成
    // 它的资产 —— 那是 original 尺寸的剧照和 key art，和 IMDb 同一批物料。
    const withTmdbAssets = await Promise.all(
      bannerItems.map((item) => enrichWithTmdbAssets(config, item))
    );

    // 过滤掉没有图片的项目
    const validBannerItems = withTmdbAssets.filter(
      (item) => item.backdrop_path
    );

    return {
      code: 200,
      list: validBannerItems,
    };
  } catch (error) {
    console.error('获取豆瓣轮播图数据失败:', error);
    return { code: 500, list: [] };
  }
}

/**
 * TMDB 轮播内容。标题字 / 无字海报和预告片一起取。
 *
 * 标题字原本是前端挂载后才逐条去请求的，首屏渲染时手里还没有，只能先把
 * 文字藏起来等它——表现出来就是标题区先空一块、几百毫秒后才补上。放到这里
 * 随列表一起下发，首帧就是完整的；而且服务端结果有 3 小时缓存，前端那份
 * prefetch 则是每次进首页都要重打一遍。
 */
async function getTMDBBannerContent(config: any): Promise<any> {
  const apiKey = config.SiteConfig?.TMDBApiKey;
  const proxy = config.SiteConfig?.TMDBProxy;
  const reverseProxy = config.SiteConfig?.TMDBReverseProxy;

  if (!apiKey) {
    return { code: 400, message: 'TMDB API Key 未配置', list: [] };
  }

  const result = await getTMDBTrendingContent(apiKey, proxy, reverseProxy);

  if (result.code === 200 && result.list) {
    const itemsWithAssets = await Promise.all(
      result.list.map(async (item: any) => {
        const kind: 'movie' | 'tv' = item.media_type === 'tv' ? 'tv' : 'movie';
        const [videoKey, imagesRes] = await Promise.all([
          getTMDBVideos(apiKey, item.media_type, item.id, proxy, reverseProxy),
          withBudget(
            getTMDBImages(apiKey, item.id, kind, proxy, reverseProxy),
            ASSET_BUDGET_MS
          ),
        ]);

        const images =
          imagesRes && imagesRes.code === 200 && imagesRes.images
            ? imagesRes.images
            : null;
        const logo = images
          ? pickLogo(images.logos || [], titlePrefersZh(item.title))
          : null;
        const textless = images
          ? pickTextlessPoster(images.posters || [])
          : null;

        return {
          ...item,
          video_key: videoKey,
          title_logo_path: logo ? logo.file_path : null,
          textless_poster_path: textless ? textless.file_path : null,
        };
      })
    );
    result.list = itemsWithAssets;
  }

  return result;
}

/** 片名归一：混排去重要跨源比对，两个站的标题标点习惯不一样 */
function normalizeTitle(title: string): string {
  return (title || '')
    .replace(/[\s·:：\-—!！?？,，.。「」《》'"]/g, '')
    .toLowerCase();
}

/**
 * 混合轮播：TMDB 与豆瓣按 3:1 交错。
 *
 * 纯拼接会让前二十屏全是 TMDB，豆瓣排在后面根本轮不到——轮播是按顺序放的，
 * 所以必须打散。3:1 是因为 TMDB 一次给二十条、豆瓣只取五条，等比例交错的话
 * 前几屏会一半是豆瓣，反过来盖住了 TMDB 的标题字优势。
 *
 * 同一个片两边都可能出现，按归一后的片名去重，先到先得（TMDB 在前，
 * 它的资产更全）。
 */
async function getMixedBannerContent(config: any): Promise<any> {
  const [tmdb, douban, tx] = await Promise.all([
    getTMDBBannerContent(config).catch(() => null),
    getDoubanBannerContent(config).catch(() => null),
    getTXBannerContent().catch(() => null),
  ]);

  const tmdbList: any[] =
    tmdb && tmdb.code === 200 && Array.isArray(tmdb.list)
      ? tmdb.list.map((item: any) => ({ ...item, origin_source: 'TMDB' }))
      : [];
  const doubanList: any[] =
    douban && douban.code === 200 && Array.isArray(douban.list)
      ? douban.list.map((item: any) => ({ ...item, origin_source: 'Douban' }))
      : [];
  // TX 的 id 是本地序号，和 TMDB 的数字 id 会撞 React key，统一加前缀
  const txList: any[] =
    tx && tx.code === 200 && Array.isArray(tx.list)
      ? tx.list.map((item: any) => ({
          ...item,
          id: `tx-${item.id}`,
          origin_source: 'TX',
        }))
      : [];

  if (!tmdbList.length && !doubanList.length && !txList.length) {
    return {
      code: tmdb && tmdb.code !== 200 ? tmdb.code : 500,
      message: '没有可用的轮播数据',
      list: [],
    };
  }

  const list: any[] = [];
  const seen = new Set<string>();
  const tryPush = (item: any) => {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push(item);
  };

  // 固定出场节奏：每 6 屏里 TMDB 占 4、豆瓣 1、TX 1。
  // TX 只给图和标题（没有能对上的 id，也没有标题字），排多了会把整体观感拉回去；
  // 但它能补上另外两家都没收录的内容，所以留这一格。
  const pattern: Array<'T' | 'D' | 'X'> = ['T', 'T', 'D', 'T', 'T', 'X'];
  let ti = 0;
  let di = 0;
  let xi = 0;
  let slot = 0;

  while (ti < tmdbList.length || di < doubanList.length || xi < txList.length) {
    const want = pattern[slot % pattern.length];
    slot += 1;

    if (want === 'T' && ti < tmdbList.length) {
      tryPush(tmdbList[ti]);
      ti += 1;
      continue;
    }
    if (want === 'D' && di < doubanList.length) {
      tryPush(doubanList[di]);
      di += 1;
      continue;
    }
    if (want === 'X' && xi < txList.length) {
      tryPush(txList[xi]);
      xi += 1;
      continue;
    }

    // 该出场的位置已经没数据了，用还有剩的顶上，避免留空档
    if (ti < tmdbList.length) {
      tryPush(tmdbList[ti]);
      ti += 1;
    } else if (di < doubanList.length) {
      tryPush(doubanList[di]);
      di += 1;
    } else if (xi < txList.length) {
      tryPush(txList[xi]);
      xi += 1;
    } else {
      break;
    }
  }

  return { code: 200, list };
}

/**
 * 把一条豆瓣条目补上 TMDB 的资产。
 *
 * 豆瓣给的封面是 s_ratio_poster（实测 540×771）这种压缩图，而且完全没有发行方
 * 的官方标题字。同一部片在 TMDB 上有 original 尺寸的剧照和 key art logo ——
 * 这批物料和 IMDb 是同一套。所以即使数据源选豆瓣，出图也走 TMDB 的标准。
 *
 * 反查分两次：先按电影搜，没命中再按剧集搜一次（豆瓣的「热门电影」里也常混着剧）。
 * 两边都没有就原样返回，让豆瓣的图兜底，不至于因为查不到就没图。
 */
async function enrichWithTmdbAssets(config: any, item: any): Promise<any> {
  const apiKey = config?.SiteConfig?.TMDBApiKey;
  if (!apiKey) return item;

  const proxy = config?.SiteConfig?.TMDBProxy;
  const reverseProxy = config?.SiteConfig?.TMDBReverseProxy;
  const year = String(item.release_date || '').match(/\d{4}/)?.[0];

  let hit = await searchTMDBByTitle(
    apiKey,
    item.title,
    year,
    'movie',
    proxy,
    reverseProxy
  );
  if (!hit) {
    hit = await searchTMDBByTitle(
      apiKey,
      item.title,
      year,
      'tv',
      proxy,
      reverseProxy
    );
  }
  if (!hit) return item;

  const imagesRes = await withBudget(
    getTMDBImages(apiKey, hit.id, hit.media_type, proxy, reverseProxy),
    ASSET_BUDGET_MS
  );
  const images =
    imagesRes && imagesRes.code === 200 && imagesRes.images
      ? imagesRes.images
      : null;
  const logo = images
    ? pickLogo(images.logos || [], titlePrefersZh(item.title))
    : null;
  const textless = images
    ? pickTextlessPoster(images.posters || [])
    : null;

  return {
    ...item,
    // 换成 TMDB 的路径形式，前端 getImageUrl 会按 original 尺寸拼
    backdrop_path: hit.backdrop_path || hit.poster_path || item.backdrop_path,
    poster_path: hit.poster_path || item.poster_path,
    media_type: hit.media_type,
    tmdb_id: hit.id,
    title_logo_path: logo ? logo.file_path : null,
    textless_poster_path: textless ? textless.file_path : null,
  };
}
