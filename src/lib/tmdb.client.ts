/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { safeFetch } from './safe-http';
import { getTmdbImageBaseUrl } from './tmdb-image-base';
import { translateGenreNames } from './tmdb.genres';

// TMDB API 默认 Base URL（不包含 /3/，由程序拼接）
const DEFAULT_TMDB_BASE_URL = 'https://api.themoviedb.org';

// TMDB API Key 轮询管理
let currentKeyIndex = 0;

/**
 * 检测是否在 Cloudflare 环境中运行
 */
function isCloudflareEnvironment(): boolean {
  return process.env.CF_PAGES === '1' || process.env.BUILD_TARGET === 'cloudflare';
}

/**
 * 统一的 fetch 函数，根据环境选择使用 node-fetch 或原生 fetch
 */
async function universalFetch(url: string, proxy?: string): Promise<Response> {
  const isCloudflare = isCloudflareEnvironment();

  if (isCloudflare) {
    // Cloudflare 环境：使用原生 fetch，忽略 proxy 参数
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    return response as unknown as Response;
  } else {
    // Node.js 环境：使用 node-fetch（safeFetch），支持 proxy
    const signal = proxy ? AbortSignal.timeout(30000) : AbortSignal.timeout(15000);

    return safeFetch(url, { signal }, proxy) as unknown as Response;
  }
}

/**
 * 解析并获取下一个可用的 TMDB API Key
 * @param apiKeys - API Key 字符串（支持逗号分隔的多个key）
 * @returns 当前应使用的 API Key
 */
export function getNextApiKey(apiKeys: string): string {
  if (!apiKeys) return '';

  const keys = apiKeys.split(',').map(k => k.trim()).filter(k => k);
  if (keys.length === 0) return '';
  if (keys.length === 1) return keys[0];

  // 轮询获取下一个key
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;

  return key;
}

export interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
  vote_average: number;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date: string;
  overview: string;
  vote_average: number;
}

// 统一的类型，用于显示
export interface TMDBItem {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path?: string | null; // 背景图，用于轮播图
  release_date: string;
  overview: string;
  vote_average: number;
  media_type: 'movie' | 'tv';
  genre_ids?: number[]; // 类型ID列表
  video_key?: string; // YouTube视频key
}

interface TMDBUpcomingResponse {
  results: TMDBMovie[];
  page: number;
  total_pages: number;
  total_results: number;
}

interface TMDBTVAiringTodayResponse {
  results: TMDBTVShow[];
  page: number;
  total_pages: number;
  total_results: number;
}

/**
 * 获取即将上映的电影
 * @param apiKey - TMDB API Key
 * @param page - 页码
 * @param region - 地区代码，默认 CN (中国)
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 即将上映的电影列表
 */
export async function getTMDBUpcomingMovies(
  apiKey: string,
  page = 1,
  region = 'CN',
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; list: TMDBMovie[] }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, list: [] };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/movie/upcoming?api_key=${actualKey}&language=zh-CN&page=${page}&region=${region}`;

    // 使用统一的 fetch 函数
    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB API 请求失败:', response.status, response.statusText);
      return { code: response.status, list: [] };
    }

    const data: TMDBUpcomingResponse = await response.json() as TMDBUpcomingResponse;

    return {
      code: 200,
      list: data.results,
    };
  } catch (error) {
    console.error('获取 TMDB 即将上映电影失败:', error);
    return { code: 500, list: [] };
  }
}

/**
 * 获取正在播出的电视剧
 * @param apiKey - TMDB API Key
 * @param page - 页码
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 正在播出的电视剧列表
 */
export async function getTMDBUpcomingTVShows(
  apiKey: string,
  page = 1,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; list: TMDBTVShow[] }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, list: [] };
    }

    // 使用 on_the_air 接口获取正在播出的电视剧
    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/tv/on_the_air?api_key=${actualKey}&language=zh-CN&page=${page}`;

    // 使用统一的 fetch 函数
    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB TV API 请求失败:', response.status, response.statusText);
      return { code: response.status, list: [] };
    }

    const data: TMDBTVAiringTodayResponse = await response.json() as TMDBTVAiringTodayResponse;

    return {
      code: 200,
      list: data.results,
    };
  } catch (error) {
    console.error('获取 TMDB 正在播出电视剧失败:', error);
    return { code: 500, list: [] };
  }
}

/**
 * 获取即将上映/播出的内容（电影+电视剧）
 * @param apiKey - TMDB API Key
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 统一格式的即将上映/播出列表
 */
export async function getTMDBUpcomingContent(
  apiKey: string,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; list: TMDBItem[] }> {
  try {
    if (!apiKey) {
      return { code: 400, list: [] };
    }

    // 并行获取电影和电视剧数据
    const [moviesResult, tvShowsResult] = await Promise.all([
      getTMDBUpcomingMovies(apiKey, 1, 'CN', proxy, reverseProxyBaseUrl),
      getTMDBUpcomingTVShows(apiKey, 1, proxy, reverseProxyBaseUrl),
    ]);

    // 检查是否有错误
    if (moviesResult.code !== 200 && tvShowsResult.code !== 200) {
      // 两个请求都失败，返回错误
      return { code: moviesResult.code, list: [] };
    }

    // 获取今天的日期（本地时区）
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 转换电影数据为统一格式，并过滤掉已上映的
    const movies: TMDBItem[] = moviesResult.code === 200
      ? moviesResult.list
          .filter((movie) => {
            // 只保留未来上映的电影
            return movie.release_date && movie.release_date >= todayStr;
          })
          .map((movie) => ({
            id: movie.id,
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: movie.release_date,
            overview: movie.overview,
            vote_average: movie.vote_average,
            media_type: 'movie' as const,
          }))
      : [];

    // 转换电视剧数据为统一格式，并过滤掉已播出的
    const tvShows: TMDBItem[] = tvShowsResult.code === 200
      ? tvShowsResult.list
          .filter((tv) => {
            // 只保留未来播出的电视剧
            return tv.first_air_date && tv.first_air_date >= todayStr;
          })
          .map((tv) => ({
            id: tv.id,
            title: tv.name,
            poster_path: tv.poster_path,
            release_date: tv.first_air_date,
            overview: tv.overview,
            vote_average: tv.vote_average,
            media_type: 'tv' as const,
          }))
      : [];

    // 合并并返回
    const allContent = [...movies, ...tvShows];

    return {
      code: 200,
      list: allContent,
    };
  } catch (error) {
    console.error('获取 TMDB 即将上映内容失败:', error);
    return { code: 500, list: [] };
  }
}

/**
 * 获取视频（预告片）
 * @param apiKey - TMDB API Key
 * @param mediaType - 媒体类型 (movie 或 tv)
 * @param mediaId - 媒体ID
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns YouTube视频key（只返回预告片）
 */
export async function getTMDBVideos(
  apiKey: string,
  mediaType: 'movie' | 'tv',
  mediaId: number,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<string | null> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return null;
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/${mediaType}/${mediaId}/videos?api_key=${actualKey}`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();
    const videos = data.results || [];

    // 只查找YouTube预告片
    const trailer = videos.find((v: any) =>
      v.site === 'YouTube' && v.type === 'Trailer'
    );

    return trailer?.key || null;
  } catch (error) {
    console.error('获取 TMDB 视频失败:', error);
    return null;
  }
}

export interface TMDBVideoItem {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
  published_at?: string;
  iso_639_1?: string;
}

/**
 * 获取视频列表（预告片/花絮等）
 * @param apiKey - TMDB API Key
 * @param mediaType - 媒体类型 (movie 或 tv)
 * @param mediaId - 媒体ID
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns YouTube视频列表
 */
export async function getTMDBVideoList(
  apiKey: string,
  mediaType: 'movie' | 'tv',
  mediaId: number,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; videos: TMDBVideoItem[] }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, videos: [] };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    // 一次性请求中文、英文和未标语言视频，避免按语言多次请求。
    // TMDB videos 接口支持 include_video_language 传逗号分隔的多个 ISO-639-1 值。
    const url = `${baseUrl}/3/${mediaType}/${mediaId}/videos?api_key=${actualKey}&include_video_language=zh,en,null`;
    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      return { code: response.status, videos: [] };
    }

    const data: any = await response.json();
    const videoMap = new Map<string, TMDBVideoItem>();
    (data.results || [])
      .filter((video: any) => video?.site === 'YouTube' && video?.key)
      .forEach((video: any) => {
        if (videoMap.has(video.key)) return;
        videoMap.set(video.key, {
          id: String(video.id ?? video.key),
          key: video.key,
          name: video.name || '未命名视频',
          site: video.site || 'YouTube',
          type: video.type || '',
          official: video.official,
          published_at: video.published_at,
          iso_639_1: video.iso_639_1,
        });
      });

    const typePriority: Record<string, number> = {
      Trailer: 0,
      Teaser: 1,
      Clip: 2,
      Featurette: 3,
    };

    const videos = Array.from(videoMap.values()).sort((a, b) => {
      const officialDiff = (b.official ? 1 : 0) - (a.official ? 1 : 0);
      if (officialDiff !== 0) return officialDiff;
      const typeDiff = (typePriority[a.type] ?? 99) - (typePriority[b.type] ?? 99);
      if (typeDiff !== 0) return typeDiff;
      return (b.published_at || '').localeCompare(a.published_at || '');
    });

    return {
      code: 200,
      videos,
    };
  } catch (error) {
    console.error('获取 TMDB 视频列表失败:', error);
    return { code: 500, videos: [] };
  }
}

/**
 * 获取热门内容（电影+电视剧）
 * @param apiKey - TMDB API Key
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 热门内容列表
 */
export async function getTMDBTrendingContent(
  apiKey: string,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; list: TMDBItem[] }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, list: [] };
    }

    // 获取本周热门内容（电影+电视剧）
    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/trending/all/week?api_key=${actualKey}&language=zh-CN`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB Trending API 请求失败:', response.status, response.statusText);
      return { code: response.status, list: [] };
    }

    const data: any = await response.json();

    // 转换为统一格式，只保留有backdrop_path的项目（用于轮播图）
    const items: TMDBItem[] = data.results
      .filter((item: any) => item.backdrop_path) // 只保留有背景图的
      .slice(0, 10) // 只取前10个
      .map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path, // 添加背景图
        release_date: item.release_date || item.first_air_date || '',
        overview: item.overview,
        vote_average: item.vote_average,
        media_type: item.media_type as 'movie' | 'tv',
        genre_ids: item.genre_ids || [], // 保存类型ID
      }));

    return {
      code: 200,
      list: items,
    };
  } catch (error) {
    console.error('获取 TMDB 热门内容失败:', error);
    return { code: 500, list: [] };
  }
}

/**
 * 获取 TMDB 图片完整 URL
 * @param path - 图片路径
 * @param size - 图片尺寸，默认 w500
 * @returns 完整的图片 URL
 */
export function getTMDBImageUrl(
  path: string | null,
  size = 'w500'
): string {
  if (!path) return '';

  // 如果已经是完整的 URL (http:// 或 https://),直接返回
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const baseUrl = getTmdbImageBaseUrl();
  return `${baseUrl}/t/p/${size}${path}`;
}

/**
 * TMDB 类型映射（中文）
 */
export const TMDB_GENRES: Record<number, string> = {
  // 电影类型
  28: '动作',
  12: '冒险',
  16: '动画',
  35: '喜剧',
  80: '犯罪',
  99: '纪录',
  18: '剧情',
  10751: '家庭',
  14: '奇幻',
  36: '历史',
  27: '恐怖',
  10402: '音乐',
  9648: '悬疑',
  10749: '爱情',
  878: '科幻',
  10770: '电视电影',
  53: '惊悚',
  10752: '战争',
  37: '西部',
  // 电视剧类型
  10759: '动作冒险',
  10762: '儿童',
  10763: '新闻',
  10764: '真人秀',
  10765: '科幻奇幻',
  10766: '肥皂剧',
  10767: '脱口秀',
  10768: '战争政治',
};

/**
 * 根据类型ID获取类型名称列表
 * @param genreIds - 类型ID数组
 * @param limit - 最多返回几个类型，默认2个
 * @returns 类型名称数组
 */
export function getGenreNames(genreIds: number[] = [], limit = 2): string[] {
  return genreIds
    .map(id => TMDB_GENRES[id])
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * 搜索多媒体内容
 *
 * 传了 year 时先按年份收窄：multi 端点不支持年份参数，所以改走
 * `/3/search/tv?first_air_date_year=` 与 `/3/search/movie?primary_release_year=`，
 * 两个都拿回来合成 multi 的形状；都没命中再退回无年份的 multi 搜索。
 *
 * 为什么必须收窄：中文别名在 TMDB 上经常对不上。CMS 里的「海贼王」在 TMDB 的
 * zh-CN 正名是「航海王」，无年份搜索的第一条会落到 2021 年的《海贼王女》（12 集），
 * 于是整部剧的分集元数据全错，看着像「只拉了 12 集」。
 *
 * @param apiKey - TMDB API Key
 * @param query - 搜索关键词
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @param year - 可选年份，用于收窄搜索（multi 端点本身不支持）
 * @returns 搜索结果列表
 */
export async function searchTMDBMulti(
  apiKey: string,
  query: string,
  proxy?: string,
  reverseProxyBaseUrl?: string,
  year?: string | number | null
): Promise<{ code: number; results: any[] }> {
  const actualKey = getNextApiKey(apiKey);
  if (!actualKey || !query) {
    return { code: 400, results: [] };
  }

  const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
  const encodedQuery = encodeURIComponent(query);

  // 先按年份收窄
  const yearStr = year ? String(year).match(/\d{4}/)?.[0] : null;
  if (yearStr) {
    try {
      const [tvResponse, movieResponse] = await Promise.all([
        universalFetch(
          `${baseUrl}/3/search/tv?api_key=${actualKey}&language=zh-CN&query=${encodedQuery}&first_air_date_year=${yearStr}&page=1`,
          proxy
        ),
        universalFetch(
          `${baseUrl}/3/search/movie?api_key=${actualKey}&language=zh-CN&query=${encodedQuery}&primary_release_year=${yearStr}&page=1`,
          proxy
        ),
      ]);
      const tvData: any = tvResponse.ok ? await tvResponse.json() : null;
      const movieData: any = movieResponse.ok ? await movieResponse.json() : null;
      const merged = [
        ...((tvData?.results || []) as any[]).map((item) => ({
          ...item,
          media_type: 'tv',
        })),
        ...((movieData?.results || []) as any[]).map((item) => ({
          ...item,
          media_type: 'movie',
        })),
      ];
      if (merged.length > 0) {
        return { code: 200, results: merged };
      }
    } catch (error) {
      console.error('按年份搜索 TMDB 失败，回退到普通搜索:', error);
    }
  }

  try {
    const url = `${baseUrl}/3/search/multi?api_key=${actualKey}&language=zh-CN&query=${encodedQuery}&page=1`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB Search API 请求失败:', response.status, response.statusText);
      return { code: response.status, results: [] };
    }

    const data: any = await response.json();

    return {
      code: 200,
      results: data.results || [],
    };
  } catch (error) {
    console.error('搜索 TMDB 内容失败:', error);
    return { code: 500, results: [] };
  }
}

/**
 * 获取电影推荐
 * @param apiKey - TMDB API Key
 * @param movieId - 电影ID
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 推荐列表
 */
export async function getTMDBMovieRecommendations(
  apiKey: string,
  movieId: number,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; results: TMDBMovie[] }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey || !movieId) {
      return { code: 400, results: [] };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/movie/${movieId}/recommendations?api_key=${actualKey}&language=zh-CN&page=1`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB Movie Recommendations API 请求失败:', response.status, response.statusText);
      return { code: response.status, results: [] };
    }

    const data: any = await response.json();

    return {
      code: 200,
      results: data.results || [],
    };
  } catch (error) {
    console.error('获取 TMDB 电影推荐失败:', error);
    return { code: 500, results: [] };
  }
}

/**
 * 获取电视剧推荐
 * @param apiKey - TMDB API Key
 * @param tvId - 电视剧ID
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 推荐列表
 */
export async function getTMDBTVRecommendations(
  apiKey: string,
  tvId: number,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; results: TMDBTVShow[] }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey || !tvId) {
      return { code: 400, results: [] };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/tv/${tvId}/recommendations?api_key=${actualKey}&language=zh-CN&page=1`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB TV Recommendations API 请求失败:', response.status, response.statusText);
      return { code: response.status, results: [] };
    }

    const data: any = await response.json();

    return {
      code: 200,
      results: data.results || [],
    };
  } catch (error) {
    console.error('获取 TMDB 电视剧推荐失败:', error);
    return { code: 500, results: [] };
  }
}

/**
 * 获取 TMDB 电影详情
 * @param apiKey - TMDB API Key
 * @param movieId - 电影ID
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 电影详情
 */
export async function getTMDBMovieDetails(
  apiKey: string,
  movieId: number,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; details: any }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, details: null };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/movie/${movieId}?api_key=${actualKey}&language=zh-CN&append_to_response=external_ids`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB API 请求失败:', response.status, response.statusText);
      return { code: response.status, details: null };
    }

    const data: any = await response.json();

    return {
      code: 200,
      details: data,
    };
  } catch (error) {
    console.error('获取 TMDB 电影详情失败:', error);
    return { code: 500, details: null };
  }
}

/**
 * 获取 TMDB 电视剧详情
 * @param apiKey - TMDB API Key
 * @param tvId - 电视剧ID
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 电视剧详情
 */
export async function getTMDBTVDetails(
  apiKey: string,
  tvId: number,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; details: any }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, details: null };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    // external_ids 跟着详情一起取回，省掉一次单独请求；imdb_id 是 OMDb 评分的唯一入口
    const url = `${baseUrl}/3/tv/${tvId}?api_key=${actualKey}&language=zh-CN&append_to_response=external_ids`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB API 请求失败:', response.status, response.statusText);
      return { code: response.status, details: null };
    }

    const data: any = await response.json();

    return {
      code: 200,
      details: data,
    };
  } catch (error) {
    console.error('获取 TMDB 电视剧详情失败:', error);
    return { code: 500, details: null };
  }
}

/** 评分需要的 TMDB 侧信息：imdb_id 缺失时还要靠原名和年份去 OMDb 兜底 */
export interface TMDBRatingRef {
  imdbId: string | null;
  /** 原始语言标题（国产剧是中文、日漫是日文、美剧是英文） */
  originalTitle: string | null;
  /** 上映 / 首播年份，给 OMDb 的标题搜索收窄范围 */
  year: string | null;
}

/**
 * 一次拿齐评分所需的信息。
 *
 * 为什么不走 /external_ids 那个更轻的端点：很多国产剧、日韩剧在 TMDB 上
 * 根本没有 imdb_id 映射，这时只能退回「按原名 + 年份去 OMDb 搜」，
 * 而原名只在详情里。用 append_to_response 把两个请求并成一个。
 */
export async function getTMDBRatingRef(
  apiKey: string,
  mediaType: 'movie' | 'tv',
  id: number,
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; ref: TMDBRatingRef | null }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, ref: null };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/${mediaType}/${id}?api_key=${actualKey}&append_to_response=external_ids`;

    const response = await universalFetch(url, proxy);
    if (!response.ok) {
      return { code: response.status, ref: null };
    }

    const data: any = await response.json();
    const date = data?.release_date || data?.first_air_date || '';

    return {
      code: 200,
      ref: {
        imdbId: data?.external_ids?.imdb_id || null,
        originalTitle: data?.original_title || data?.original_name || null,
        year:
          typeof date === 'string' && date.length >= 4
            ? date.slice(0, 4)
            : null,
      },
    };
  } catch (error) {
    console.error('获取 TMDB 评分引用失败:', error);
    return { code: 500, ref: null };
  }
}

/** aggregate_credits 与 credits 的返回形状不同：前者用 roles[] / jobs[] 数组，
 *  后者用单个 character / job。这里统一成后者的形状，播放页按 job 过滤导演、
 *  按 character 显示角色的逻辑就不用改。 */
function normalizeTMDBCredits(data: any) {
  if (!data || typeof data !== 'object') return data;

  const cast = Array.isArray(data.cast)
    ? data.cast.map((person: any, index: number) => {
        if (!person) return person;
        const roles = Array.isArray(person.roles)
          ? person.roles.map((r: any) => r?.character).filter(Boolean)
          : [];
        return {
          ...person,
          character: person.character || roles[0] || '',
          order: typeof person.order === 'number' ? person.order : index,
        };
      })
    : [];

  const crew = Array.isArray(data.crew)
    ? data.crew.flatMap((person: any) => {
        if (!person) return [];
        const jobs = Array.isArray(person.jobs)
          ? person.jobs.map((j: any) => j?.job).filter(Boolean)
          : [];
        // 一个人可能同时挂多个职位，展开成多条，避免调用方漏掉 Director
        return jobs.length > 0
          ? jobs.map((job: string) => ({ ...person, job }))
          : [person];
      })
    : [];

  return { ...data, cast, crew };
}

/**
 * 获取 TMDB 演职人员信息
 * @param apiKey - TMDB API Key
 * @param mediaId - 媒体ID
 * @param mediaType - 媒体类型 (movie 或 tv)
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 演职人员信息
 */
export async function getTMDBCredits(
  apiKey: string,
  mediaId: number,
  mediaType: 'movie' | 'tv',
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; credits: any }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, credits: null };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    // 剧集的 /credits 只返回「常驻主演」，长剧往往只剩几个人；全量演职员在
    // /aggregate_credits。电影两者等价，直接走 /credits。
    const endpoints =
      mediaType === 'tv'
        ? [
            `${baseUrl}/3/tv/${mediaId}/aggregate_credits`,
            `${baseUrl}/3/tv/${mediaId}/credits`,
          ]
        : [`${baseUrl}/3/${mediaType}/${mediaId}/credits`];

    let lastCode = 500;
    let emptyCredits: any = null;

    for (const endpoint of endpoints) {
      try {
        const response = await universalFetch(
          `${endpoint}?api_key=${actualKey}&language=zh-CN`,
          proxy
        );

        if (!response.ok) {
          console.error(
            'TMDB Credits API 请求失败:',
            endpoint,
            response.status,
            response.statusText
          );
          lastCode = response.status;
          continue;
        }

        const credits = normalizeTMDBCredits(await response.json());
        const count =
          (credits?.cast?.length ?? 0) + (credits?.crew?.length ?? 0);

        // 空结果继续试下一个端点；全部为空时把空结果原样返回，调用方按
        // 「无演职员」处理，而不是报错
        if (count === 0) {
          emptyCredits = emptyCredits ?? credits;
          lastCode = 200;
          continue;
        }

        return { code: 200, credits };
      } catch (error) {
        console.error('获取 TMDB 演职人员信息失败:', endpoint, error);
        lastCode = 500;
      }
    }

    return { code: lastCode, credits: emptyCredits };
  } catch (error) {
    console.error('获取 TMDB 演职人员信息失败:', error);
    return { code: 500, credits: null };
  }
}

/**
 * 获取 TMDB 图片信息
 * @param apiKey - TMDB API Key
 * @param mediaId - 媒体ID
 * @param mediaType - 媒体类型 (movie 或 tv)
 * @param proxy - 代理服务器地址
 * @param reverseProxyBaseUrl - 反代 Base URL
 * @returns 图片信息
 */
export async function getTMDBImages(
  apiKey: string,
  mediaId: number,
  mediaType: 'movie' | 'tv',
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; images: any }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, images: null };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const url = `${baseUrl}/3/${mediaType}/${mediaId}/images?api_key=${actualKey}`;

    const response = await universalFetch(url, proxy);

    if (!response.ok) {
      console.error('TMDB Images API 请求失败:', response.status, response.statusText);
      return { code: response.status, images: null };
    }

    const data: any = await response.json();

    return {
      code: 200,
      images: data,
    };
  } catch (error) {
    console.error('获取 TMDB 图片信息失败:', error);
    return { code: 500, images: null };
  }
}

/**
 * 按片名 + 年份在 TMDB 里反查条目。
 *
 * 豆瓣只给压缩过的封面（s_ratio_poster，实测 540×771），更没有发行方的官方标题字。
 * 同一部片在 TMDB 上有 key art logo 和 original 尺寸的剧照 —— 这就是 IMDb 体系
 * 那套资产（TMDB 的图源和 IMDb 同源，发行方提交的物料）。数据源选豆瓣时也要按
 * 这套标准出图，就得先把「豆瓣条目」映射到「TMDB 条目」。
 *
 * 打分只看两件事：年份是否对上、有没有海报。同名不同年的片子太多，年份对不上的
 * 排后面；都没有年份时退回第一个有海报的。
 */
export async function searchTMDBByTitle(
  apiKey: string,
  title: string,
  year: string | number | undefined,
  mediaType: 'movie' | 'tv' = 'movie',
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{
  id: number;
  media_type: 'movie' | 'tv';
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average?: number;
  original_language?: string;
} | null> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey || !title) return null;

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const params = new URLSearchParams({
      api_key: actualKey,
      query: title,
      language: 'zh-CN',
      include_adult: 'false',
    });
    if (year) {
      params.set(
        mediaType === 'movie' ? 'year' : 'first_air_date_year',
        String(year)
      );
    }

    const response = await universalFetch(
      `${baseUrl}/3/search/${mediaType}?${params.toString()}`,
      proxy
    );
    if (!response.ok) return null;

    const data: any = await response.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    // 年份必须完全一致。反查命中的条目会把片名/简介/类型整套搬到 Hero 上，
    // 搜成同名不同年的另一部片就是整屏内容全错，所以这里不放宽成加分项。
    const matched = results.filter((item) => {
      if (!item || !item.id) return false;
      if (!year) return true;
      const date: string = item.release_date || item.first_air_date || '';
      return date.startsWith(String(year));
    });

    // 同一年里优先有海报的：豆瓣热门都是院线片，没海报的多半是条目占位
    const scored = matched
      .map((item) => ({ item, score: item.poster_path ? 1 : 0 }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.item;
    if (!best) return null;

    return {
      id: best.id,
      media_type: mediaType,
      poster_path: best.poster_path || null,
      backdrop_path: best.backdrop_path || null,
      vote_average: best.vote_average,
      original_language: best.original_language || '',
    };
  } catch (error) {
    console.error('TMDB 片名反查失败:', error);
    return null;
  }
}

/**
 * 取图片列表，同时带上影片的原产国语言。
 *
 * 挑标题字要用全集，所以必须走 `/images` 端点。`append_to_response=images`
 * 会按 include_image_language 过滤，默认只留英文那一小撮：《偷天父子兵》
 * 的 /images 有 42 张（含 6 张中文），append 只回几张英文 —— 中文标题字
 * 整组被吞掉，前端就只能显示英文片名。详情另外请求一次只为拿 original_language。
 */
export async function getTMDBImagesWithLang(
  apiKey: string,
  mediaId: number,
  mediaType: 'movie' | 'tv',
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<{ code: number; images: any; originalLanguage: string }> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) {
      return { code: 400, images: null, originalLanguage: '' };
    }

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const [imagesRes, detailRes] = await Promise.all([
      universalFetch(
        `${baseUrl}/3/${mediaType}/${mediaId}/images?api_key=${actualKey}`,
        proxy
      ),
      universalFetch(
        `${baseUrl}/3/${mediaType}/${mediaId}?api_key=${actualKey}`,
        proxy
      ),
    ]);

    if (!imagesRes.ok) {
      return { code: imagesRes.status, images: null, originalLanguage: '' };
    }

    const images: any = await imagesRes.json();
    // 原产国语言拿不到不致命，只是白名单里少一条，仍能按中文挑
    const detail: any = detailRes.ok ? await detailRes.json() : {};

    return {
      code: 200,
      images,
      originalLanguage: detail.original_language || '',
    };
  } catch (error) {
    console.error('获取 TMDB 图片与原语言失败:', error);
    return { code: 500, images: null, originalLanguage: '' };
  }
}

export interface TMDBDetails {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string;
  runtime: number | null;
  genres: string[];
  voteAverage: number;
  voteCount: number;
  originalLanguage: string;
  /** YouTube 预告片 key，按 TMDB 的官方排序 */
  videoKeys: string[];
}

/**
 * 取影片的完整文字信息（含预告片）。
 *
 * 数据源选豆瓣时这一条是替代豆瓣详情的关键：豆瓣的 intro/genres 时好时坏 ——
 * 同一部片实测有时返回 77 个字段、有时只剩 16 个，简介直接空掉。而片名、简介、
 * 类型、时长、预告片在 TMDB 上是同一套口径，和站内详情页也能对得上。
 *
 * videos 用 append_to_response 一次带回，不用单独再请求一次。
 */
export async function getTMDBDetails(
  apiKey: string,
  mediaId: number,
  mediaType: 'movie' | 'tv',
  proxy?: string,
  reverseProxyBaseUrl?: string
): Promise<TMDBDetails | null> {
  try {
    const actualKey = getNextApiKey(apiKey);
    if (!actualKey) return null;

    const baseUrl = reverseProxyBaseUrl || DEFAULT_TMDB_BASE_URL;
    const response = await universalFetch(
      // videos 必须跨语言：只挂 zh-CN 时绝大多数片子一个视频都取不到，
      // 预告片会整批消失。include_video_language 是 append_to_response 的配套参数。
      `${baseUrl}/3/${mediaType}/${mediaId}?language=zh-CN&append_to_response=videos&include_video_language=zh,en,null&api_key=${actualKey}`,
      proxy
    );
    if (!response.ok) return null;

    const data: any = await response.json();

    return {
      id: data.id,
      // 剧集是 name / first_air_date，电影是 title / release_date
      title: data.title || data.name || '',
      originalTitle: data.original_title || data.original_name || '',
      overview: data.overview || '',
      releaseDate: data.release_date || data.first_air_date || '',
      runtime: data.runtime || data.episode_run_time?.[0] || null,
      genres: translateGenreNames(
        (data.genres || []).map((g: any) => g.name).filter(Boolean)
      ),
      voteAverage: typeof data.vote_average === 'number' ? data.vote_average : 0,
      voteCount: typeof data.vote_count === 'number' ? data.vote_count : 0,
      originalLanguage: data.original_language || '',
      videoKeys: (data.videos?.results || [])
        .filter((v: any) => v?.site === 'YouTube' && v?.key)
        // Trailer 排在 Teaser / Clip 前面
        .sort(
          (a: any, b: any) =>
            (b.type === 'Trailer' ? 1 : 0) - (a.type === 'Trailer' ? 1 : 0)
        )
        .map((v: any) => v.key),
    };
  } catch (error) {
    console.error('获取 TMDB 详情失败:', error);
    return null;
  }
}
