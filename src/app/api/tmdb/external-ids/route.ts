import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getTMDBRatingRef, type TMDBRatingRef } from '@/lib/tmdb.client';

/**
 * TMDB id → 评分所需的信息（imdb_id / 原名 / 年份）。
 *
 * 为什么还要原名：很多国产剧、日韩剧在 TMDB 上没有 imdb_id 映射，
 * 这时只能拿原名 + 年份去 OMDb 按标题搜，否则这些片子永远只有一个 TMDB 分。
 */

const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const EMPTY: TMDBRatingRef = {
  imdbId: null,
  originalTitle: null,
  year: null,
};

// 查不到也缓存：没有 imdb 映射的条目不该被反复重试
const cache = new Map<string, { ref: TMDBRatingRef; timestamp: number }>();

function readCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.ref;
}

function writeCache(key: string, ref: TMDBRatingRef) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { ref, timestamp: Date.now() });
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');
  const id = Number(request.nextUrl.searchParams.get('id'));

  if ((type !== 'movie' && type !== 'tv') || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json(EMPTY);
  }

  const cacheKey = `${type}:${id}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  try {
    const config = await getConfig();
    const result = await getTMDBRatingRef(
      config.SiteConfig.TMDBApiKey || '',
      type as 'movie' | 'tv',
      id,
      config.SiteConfig.TMDBProxy,
      config.SiteConfig.TMDBReverseProxy
    );

    if (result.code !== 200 || !result.ref) {
      return NextResponse.json(EMPTY);
    }

    writeCache(cacheKey, result.ref);

    return NextResponse.json(result.ref, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (error) {
    console.error('获取 TMDB 评分引用失败:', error);
    return NextResponse.json(EMPTY);
  }
}
