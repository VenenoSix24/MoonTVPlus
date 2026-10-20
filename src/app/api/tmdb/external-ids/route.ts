import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getTMDBExternalIds } from '@/lib/tmdb.client';

/**
 * TMDB id → imdb_id 的轻量查询。
 * Hero 轮播每次切片都要查一次，所以不复用 /api/tmdb-details（那个拉完整详情）。
 */

const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

// 查不到也缓存成 null：某些条目 TMDB 上没有 imdb 映射，反复重试只是白烧请求
const cache = new Map<string, { imdbId: string | null; timestamp: number }>();

function readCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.timestamp > CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return hit.imdbId;
}

function writeCache(key: string, imdbId: string | null) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { imdbId, timestamp: Date.now() });
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');
  const id = Number(request.nextUrl.searchParams.get('id'));

  if ((type !== 'movie' && type !== 'tv') || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ imdbId: null });
  }

  const cacheKey = `${type}:${id}`;
  const cached = readCache(cacheKey);
  if (cached !== undefined) {
    return NextResponse.json(
      { imdbId: cached },
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    );
  }

  try {
    const config = await getConfig();
    const result = await getTMDBExternalIds(
      config.SiteConfig.TMDBApiKey || '',
      type as 'movie' | 'tv',
      id,
      config.SiteConfig.TMDBProxy,
      config.SiteConfig.TMDBReverseProxy
    );

    const imdbId = result.code === 200 ? result.imdbId : null;
    if (result.code === 200) {
      writeCache(cacheKey, imdbId);
    }

    return NextResponse.json(
      { imdbId },
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    );
  } catch (error) {
    console.error('获取 TMDB 外部 ID 失败:', error);
    return NextResponse.json({ imdbId: null });
  }
}
