/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { fetchDoubanData } from '@/lib/douban';
import {
  getTMDBDetails,
  getTMDBImages,
  getTMDBTrendingContent,
  searchTMDBByTitle,
} from '@/lib/tmdb.client';
import { pickLogo, pickTextlessPoster } from '@/lib/tmdb.logo';

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

// 缓存按「数据源组合」分开存：选了哪几个源，结果就不同，不能共用一份。
const sourceCaches = new Map<string, { data: any; timestamp: number }>();

export const dynamic = 'force-dynamic';

const KNOWN_SOURCES = ['TMDB', 'Douban', 'TX'] as const;
type SourceName = (typeof KNOWN_SOURCES)[number];

/**
 * 解析轮播数据源配置。
 *
 * 两种写法都认：
 *   - 单个值：'TMDB' / 'Douban' / 'TX'
 *   - 组合：'TMDB,Douban' —— 管理端勾几个就存几个，逗号分隔，顺序无所谓
 * 旧配置里的 'Mixed' 等价于三个源全要，留着兼容。
 */
function parseBannerSources(raw: string): Set<SourceName> {
  if (raw === 'Mixed') {
    return new Set<SourceName>(KNOWN_SOURCES);
  }
  const picked = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is SourceName =>
      (KNOWN_SOURCES as readonly string[]).includes(name)
    );
  return new Set<SourceName>(picked.length ? picked : ['Douban']);
}

export async function GET() {
  try {
    // 获取配置
    const config = await getConfig();
    const bannerDataSource = config.SiteConfig?.BannerDataSource || 'Douban';
    const sources = parseBannerSources(bannerDataSource);
    const cacheKey = Array.from(sources).sort().join(',');

    const cached = sourceCaches.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }

    let result: any;

    if (sources.size > 1) {
      // 组合模式，出场节奏见 getMixedBannerContent
      result = await getMixedBannerContent(config, sources);
    } else if (sources.has('Douban')) {
      result = await getDoubanBannerContent(config);
    } else if (sources.has('TX')) {
      result = await getTXBannerContent();
    } else {
      result = await getTMDBBannerContent(config);
      if (result.code !== 200) {
        return NextResponse.json(
          { code: result.code, message: result.message },
          { status: result.code }
        );
      }
    }

    // 多个源时统一报 Mixed，前端按条目的 origin_source 判断具体来自哪
    result.source = sources.size > 1 ? 'Mixed' : Array.from(sources)[0];
    sourceCaches.set(cacheKey, { data: result, timestamp: Date.now() });

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
            original_title: detail.original_title || '',
            backdrop_path: backdropPath,
            poster_path: backdropPath,
            release_date: year,
            overview: detail.intro || '',
            vote_average: detail.rating?.value || movie.rating?.value || 0,
            // 豆瓣的 is_tv 能直接判类型。原来写死 movie，热门里混着剧集时会
            // 拿错类型去反查，白白多搜一次还查不到。
            media_type: detail.is_tv ? 'tv' : 'movie',
            genre_ids: [],
            // 详情接口的 genres 是干净的类型名，退回 card_subtitle 抠出来的那份
            genres: detail.genres?.length ? detail.genres : tags,
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
            original_title: '',
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
 * 在豆瓣搜索结果里挑一条评分。
 *
 * 豆瓣上同名不同年的片子太多（《时光代理人》有 5 部），年份仍是主要判据：
 * 精确命中直接收下；没有再放宽到 ±1 年 —— 跨年上映、电影节首映这类两边数据
 * 的年份经常差一岁，卡死会白丢本来对得上的分。窗口内的候选取年份最接近的，
 * 距离相同取分高的。
 */
const DOUBAN_VOTE_YEAR_WINDOW = 1;

function pickDoubanVote(items: any[], year: string): number | null {
  const want = Number(year);
  if (!Number.isFinite(want)) return null;

  let best: { diff: number; vote: number } | null = null;

  for (const item of items) {
    const target = item?.target;
    if (!target) continue;

    const value = target.rating?.value;
    if (typeof value !== 'number' || value <= 0) continue;

    const got = Number(target.year);
    if (!Number.isFinite(got)) continue;

    const diff = Math.abs(got - want);
    if (diff === 0) return value;
    if (diff > DOUBAN_VOTE_YEAR_WINDOW) continue;

    if (!best || diff < best.diff || (diff === best.diff && value > best.vote)) {
      best = { diff, vote: value };
    }
  }

  return best ? best.vote : null;
}

/**
 * 按片名 + 年份查一条豆瓣评分。
 *
 * `/rexxar/api/v2/search/movie` 一次请求就同时给 id、year 和 rating，比先
 * subject_suggest 再拉一次详情省一半。
 *
 * `titles` 按优先级给：中文名在前、原名在后。豆瓣条目基本都用中文名，但 TMDB
 * 的中文标题偶尔是港台译名或带副标题，这时换原名再搜一次能捞回来。只有请求
 * 本身失败才重试 —— 搜到了但没对上就不再试，那说明豆瓣确实没收录。
 *
 * 走的是配置里的豆瓣 CDN 反代，不是直连源站。
 */
async function fetchDoubanVote(
  titles: string[],
  year: string,
  config: any
): Promise<number | null> {
  const candidates = Array.from(
    new Set(titles.map((title) => String(title || '').trim()).filter(Boolean))
  );
  if (!candidates.length || !year) return null;

  const proxyType =
    config?.SiteConfig?.DoubanProxyType || 'cmliussss-cdn-tencent';
  const custom = String(config?.SiteConfig?.DoubanProxy || '')
    .trim()
    .replace(/\/+$/, '');
  const base =
    proxyType === 'cmliussss-cdn-ali'
      ? 'https://m.douban.cmliussss.com'
      : proxyType === 'cmliussss-cdn-tencent'
        ? 'https://m.douban.cmliussss.net'
        : proxyType === 'custom' && custom
          ? custom
          : 'https://m.douban.com';

  for (const title of candidates) {
    let data: any = null;
    // 第一次失败多半是反代抖动，再试一次；豆瓣正常响应就只打一次
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        data = await fetchDoubanData<any>(
          `${base}/rexxar/api/v2/search/movie?q=${encodeURIComponent(title)}&start=0&count=10`
        );
      } catch {
        data = null;
      }
    }
    if (!data) continue;

    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    const vote = pickDoubanVote(items, year);
    if (vote !== null) return vote;
  }

  return null;
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
        const [details, imagesRes] = await Promise.all([
          getTMDBDetails(apiKey, item.id, kind, proxy, reverseProxy),
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
          ? pickLogo(
              images.logos || [],
              details?.originalLanguage || item.original_language
            )
          : null;
        const textless = images
          ? pickTextlessPoster(images.posters || [])
          : null;

        return {
          ...item,
          // 和豆瓣那条链路保持同一套字段。详情接口的 videos 已经随
          // append_to_response 一起下来了，所以用不着再单独请求一次视频。
          // 没有这一步，Hero 上会有的片子带类型标签、有的不带，一眼看出是两套数据。
          overview: details?.overview || item.overview,
          genres: details?.genres?.length ? details.genres : item.genres ?? [],
          runtime: details?.runtime ?? item.runtime ?? null,
          original_language: details?.originalLanguage || item.original_language,
          video_key: details?.videoKeys?.[0] ?? null,
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
async function getMixedBannerContent(
  config: any,
  sources: Set<string>
): Promise<any> {
  const wantTmdb = sources.has('TMDB');
  const wantDouban = sources.has('Douban');
  const wantTx = sources.has('TX');

  const [tmdb, douban, tx] = await Promise.all([
    wantTmdb ? getTMDBBannerContent(config).catch(() => null) : null,
    wantDouban ? getDoubanBannerContent(config).catch(() => null) : null,
    wantTx ? getTXBannerContent().catch(() => null) : null,
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

  // 豆瓣条目反查命中后带着 tmdb_id，先用它建一张「TMDB id → 豆瓣分」的表。
  const doubanScores = new Map<number, number>();
  for (const item of doubanList) {
    if (
      item.tmdb_id &&
      typeof item.vote_average === 'number' &&
      item.vote_average > 0
    ) {
      doubanScores.set(item.tmdb_id, item.vote_average);
    }
  }

  // 上面那张表只覆盖「两边都收录」的片，剩下的 TMDB 条目得自己查一次。
  // 中文名对不上时用原名再搜一次，见 fetchDoubanVote。查不到就空着 ——
  // 评分行少一格，不拖整屏。
  await Promise.all(
    tmdbList.map(async (item, index) => {
      if (doubanScores.has(item.id)) return;
      const year = String(item.release_date || '').match(/\d{4}/)?.[0] || '';
      const vote = await withBudget(
        fetchDoubanVote([item.title, item.original_title], year, config),
        ASSET_BUDGET_MS
      );
      if (typeof vote === 'number' && vote > 0) {
        tmdbList[index] = { ...item, douban_vote: vote };
      }
    })
  );

  const tryPush = (item: any) => {
    // 去重键优先用 TMDB 的 id：豆瓣条目反查命中后也带着这个 id，于是《希望》这种
    // 两边都收录的片只会留一条，而且是信息更全的 TMDB 那条。没有 id 的（没反查
    // 到的豆瓣条目、TX 条目）才退回片名比对。
    const tmdbId =
      item.tmdb_id ?? (item.origin_source === 'TMDB' ? item.id : null);
    const key = tmdbId
      ? `tmdb:${tmdbId}`
      : `title:${normalizeTitle(item.title)}`;
    if (!key || seen.has(key)) return;
    seen.add(key);

    // TMDB 条目补上豆瓣分（豆瓣条目自己就带着，不用补）
    if (item.origin_source === 'TMDB' && tmdbId && doubanScores.has(tmdbId)) {
      list.push({ ...item, douban_vote: doubanScores.get(tmdbId) });
      return;
    }
    list.push(item);
  };

  // 固定出场节奏：每 6 屏里 TMDB 占 4、豆瓣 1、TX 1。
  // TX 只给图和标题（没有能对上的 id，也没有标题字），排多了会把整体观感拉回去；
  // 但它能补上另外两家都没收录的内容，所以留这一格。
  // 出场节奏按选中的源来，具体见 buildMixedPattern
  const pattern: Array<'T' | 'D' | 'X'> = buildMixedPattern(
    sources.has('TMDB'),
    sources.has('Douban'),
    sources.has('TX')
  );
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
 * 把一条豆瓣条目换成 TMDB 的资产和文字信息。
 *
 * 豆瓣在这一层只负责两件事：告诉我们「哪几部片现在热」（选片），以及豆瓣自己的
 * 评分。其余全部走 TMDB —— 豆瓣详情接口时好时坏（实测同一部片有时返回 77 个
 * 字段、有时只剩 16 个，简介直接空掉），它给的封面也只是 540×771 的压缩图，
 * 更没有发行方做的官方标题字。TMDB 那边是 original 尺寸的剧照加 key art，
 * 和 IMDb 同一批物料，跟站内详情页也同源。
 *
 * 反查按豆瓣自己的类型判定搜（is_tv 已经算进 media_type），先用中文片名、不行
 * 再试外语原名，最后换另一边类型兜一次。年份必须完全一致才算命中，这条约束在
 * searchTMDBByTitle 里。全都没命中就原样返回让豆瓣兜底 —— 宁可这一屏差点，
 * 也不要少一屏。
 */
async function enrichWithTmdbAssets(config: any, item: any): Promise<any> {
  const apiKey = config?.SiteConfig?.TMDBApiKey;
  if (!apiKey) return item;

  const proxy = config?.SiteConfig?.TMDBProxy;
  const reverseProxy = config?.SiteConfig?.TMDBReverseProxy;
  const year = String(item.release_date || '').match(/\d{4}/)?.[0];
  const kind: 'movie' | 'tv' = item.media_type === 'tv' ? 'tv' : 'movie';

  let hit = await searchTMDBByTitle(
    apiKey,
    item.title,
    year,
    kind,
    proxy,
    reverseProxy
  );
  // 中文译名在 TMDB 上对不上时，外语原名的命中率高得多
  if (!hit && item.original_title && item.original_title !== item.title) {
    hit = await searchTMDBByTitle(
      apiKey,
      item.original_title,
      year,
      kind,
      proxy,
      reverseProxy
    );
  }
  // 豆瓣判成电影、TMDB 那边其实是剧集的也有，换一边再试一次
  if (!hit) {
    hit = await searchTMDBByTitle(
      apiKey,
      item.title,
      year,
      kind === 'movie' ? 'tv' : 'movie',
      proxy,
      reverseProxy
    );
  }
  if (!hit) return item;

  const [imagesRes, details] = await Promise.all([
    withBudget(
      getTMDBImages(apiKey, hit.id, hit.media_type, proxy, reverseProxy),
      ASSET_BUDGET_MS
    ),
    getTMDBDetails(apiKey, hit.id, hit.media_type, proxy, reverseProxy),
  ]);

  const images =
    imagesRes && imagesRes.code === 200 && imagesRes.images
      ? imagesRes.images
      : null;
  const logo = images
    ? pickLogo(
        images.logos || [],
        details?.originalLanguage || hit.original_language
      )
    : null;
  const textless = images
    ? pickTextlessPoster(images.posters || [])
    : null;

  return {
    ...item,
    // 文字信息整套换成 TMDB 的：片名、简介、类型、时长、预告片同一口径，跟详情页
    // 也对得上。vote_average 保持豆瓣分不动，TMDB 自己的分单独放 tmdb_vote。
    title: details?.title || item.title,
    overview: details?.overview || item.overview,
    genres: details?.genres?.length ? details.genres : item.genres,
    release_date: details?.releaseDate || item.release_date,
    runtime: details?.runtime || item.runtime,
    original_language: details?.originalLanguage || hit.original_language,
    video_key: details?.videoKeys?.[0] || item.video_key || null,
    // 换成 TMDB 的路径形式，前端 getImageUrl 会按 original 尺寸拼
    backdrop_path: hit.backdrop_path || hit.poster_path || item.backdrop_path,
    poster_path: hit.poster_path || item.poster_path,
    media_type: hit.media_type,
    tmdb_id: hit.id,
    tmdb_vote: hit.vote_average,
    vote_count: details?.voteCount || 0,
    title_logo_path: logo ? logo.file_path : null,
    textless_poster_path: textless ? textless.file_path : null,
  };
}

/**
 * 混合出场节奏。
 *
 * 三家全选时 TMDB 4 / 豆瓣 1 / TX 1。两家则按 2:1，让资产更全的那个多占一格。
 * TX 永远只占最少的格 —— 它只给图和标题，对不上 id、也没有标题字。
 */
function buildMixedPattern(
  wantTmdb: boolean,
  wantDouban: boolean,
  wantTx: boolean
): Array<'T' | 'D' | 'X'> {
  if (wantTmdb && wantDouban && wantTx) return ['T', 'T', 'D', 'T', 'T', 'X'];
  if (wantTmdb && wantDouban) return ['T', 'T', 'D'];
  if (wantTmdb && wantTx) return ['T', 'T', 'X'];
  if (wantDouban && wantTx) return ['D', 'D', 'X'];
  return [];
}
