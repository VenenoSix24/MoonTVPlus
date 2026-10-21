import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

/**
 * OMDb 评分代理。
 *
 * 为什么不直接在前端打 OMDb：
 * 1. API key 会暴露在浏览器里；
 * 2. 免费档每天只有 1000 次，Hero 轮播一次就要看 5 部片子的评分，
 *    不做服务端缓存很快就会打满配额；
 * 3. 客户端直连会撞跨域。
 *
 * 支持两种入参：
 *   ?imdb_id=tt3896198              优先，最准
 *   ?title=Inception&year=2010      兜底，用于 TMDB 上没有 imdb_id 映射的条目
 */

interface OmdbRatings {
  imdb: number | null;
  rottenTomatoes: number | null;
  metacritic: number | null;
}

const CACHE_TTL = 24 * 60 * 60 * 1000;
// 简单容量上限，防止长期运行后 Map 无限膨胀
const CACHE_MAX = 500;

const cache = new Map<string, { data: OmdbRatings; timestamp: number }>();

const EMPTY: OmdbRatings = {
  imdb: null,
  rottenTomatoes: null,
  metacritic: null,
};

/** OMDb 的 Value 形如「8.7/10」「78%」「70/100」，统一剥成数字 */
function parseScore(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = String(value).match(/([\d.]+)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function readCache(key: string): OmdbRatings | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function writeCache(key: string, data: OmdbRatings) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawImdbId = params.get('imdb_id');
  const rawTitle = params.get('title');
  const rawYear = params.get('year');

  const imdbId =
    rawImdbId && /^tt\d+$/.test(rawImdbId) ? rawImdbId : null;
  const title = rawTitle ? rawTitle.trim() : null;
  const year = rawYear && /^\d{4}$/.test(rawYear) ? rawYear : null;

  // 两个入口都没有就当没有数据，省掉一次上游请求
  if (!imdbId && !title) {
    return NextResponse.json(EMPTY);
  }

  const cacheKey = imdbId ? `i:${imdbId}` : `t:${title}|${year || ''}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // 管理端配置优先（不需要碰 .env），环境变量作为部署侧兜底
  let apiKey = process.env.OMDB_API_KEY || '';
  try {
    const config = await getConfig();
    apiKey = config.SiteConfig.OMDbApiKey || apiKey;
  } catch {
    // 配置读取失败不该影响评分降级，直接用 env 里的
  }

  if (!apiKey) {
    // 没配 key 不算错误：前端按「无评分」降级，页面照常渲染
    return NextResponse.json(EMPTY);
  }

  try {
    const query = imdbId
      ? `i=${encodeURIComponent(imdbId)}`
      : `t=${encodeURIComponent(title as string)}${
          year ? `&y=${encodeURIComponent(year)}` : ''
        }`;
    const url = `https://www.omdbapi.com/?${query}&apikey=${encodeURIComponent(
      apiKey
    )}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return NextResponse.json(EMPTY);
    }

    const data: any = await response.json();
    if (data?.Response === 'False') {
      // 常见原因：key 没激活（注册邮件里的链接没点）或当天配额用尽。
      // 不抛错，只留一条日志线索，前端照常按「无评分」降级
      console.warn(
        `OMDb 未返回数据（${query}）:`,
        data?.Error || '未知原因'
      );
      return NextResponse.json(EMPTY);
    }

    const ratings: any[] = Array.isArray(data?.Ratings) ? data.Ratings : [];
    const bySource = (source: string) =>
      parseScore(ratings.find((r) => r?.Source === source)?.Value);

    const payload: OmdbRatings = {
      // imdbRating 与 Ratings[0] 通常一致，留一个兜底防止上游字段缺失
      imdb: bySource('Internet Movie Database') ?? parseScore(data?.imdbRating),
      rottenTomatoes: bySource('Rotten Tomatoes'),
      metacritic: bySource('Metacritic') ?? parseScore(data?.Metascore),
    };

    // 全空不写缓存：否则上游一次抖动会被锁住 24 小时
    if (payload.imdb !== null || payload.rottenTomatoes !== null) {
      writeCache(cacheKey, payload);
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (error) {
    console.error('获取 OMDb 评分失败:', error);
    return NextResponse.json(EMPTY);
  }
}
