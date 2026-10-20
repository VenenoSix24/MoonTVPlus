import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getTraktRating } from '@/lib/trakt.client';

/**
 * Trakt 评分代理。key 放在服务端，前端只认 TMDB id。
 *
 * 缓存 24 小时：Trakt 的评分一天内变化很小，而 Hero 一次要看 5 部片子，
 * 每部要两次 Trakt 请求，不缓存很容易撞上它的限流。
 */

const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

interface Payload {
  rating: number | null;
  votes: number;
}

const EMPTY: Payload = { rating: null, votes: 0 };

const cache = new Map<string, { data: Payload; timestamp: number }>();

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');
  const id = Number(request.nextUrl.searchParams.get('id'));

  if ((type !== 'movie' && type !== 'tv') || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json(EMPTY);
  }

  const cacheKey = `${type}:${id}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return NextResponse.json(hit.data, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  let clientId = process.env.TRAKT_CLIENT_ID || '';
  try {
    const config = await getConfig();
    clientId = config.SiteConfig.TraktClientId || clientId;
  } catch {
    // 读配置失败就用环境变量里的
  }

  if (!clientId) {
    // 没配 Key 不是错误：前端按「无 Trakt 评分」降级
    return NextResponse.json(EMPTY);
  }

  const data = await getTraktRating(clientId, type as 'movie' | 'tv', id);

  // 拿不到分数不写缓存，免得一次抖动被锁 24 小时
  if (data.rating !== null) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, { data, timestamp: Date.now() });
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}
