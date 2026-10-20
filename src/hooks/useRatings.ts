'use client';

import { useEffect, useState } from 'react';

export interface OmdbRatings {
  imdb: number | null;
  rottenTomatoes: number | null;
  metacritic: number | null;
}

const EMPTY: OmdbRatings = {
  imdb: null,
  rottenTomatoes: null,
  metacritic: null,
};

/* Hero 轮播切回上一张、以及 Hero 与播放页同时展示同一部片子时，
   这两层内存缓存能挡掉重复请求。进程内即可，不需要持久化。 */
const omdbCache = new Map<string, OmdbRatings>();
const imdbIdCache = new Map<string, string | null>();

export function useOmdbRatings(imdbId?: string | null): OmdbRatings {
  const [data, setData] = useState<OmdbRatings>(() => {
    const hit = imdbId ? omdbCache.get(imdbId) : undefined;
    return hit || EMPTY;
  });

  useEffect(() => {
    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
      setData(EMPTY);
      return;
    }

    const hit = omdbCache.get(imdbId);
    if (hit) {
      setData(hit);
      return;
    }

    let alive = true;
    setData(EMPTY);

    fetch(`/api/omdb/ratings?imdb_id=${encodeURIComponent(imdbId)}`)
      .then((res) => res.json())
      .then((json: OmdbRatings) => {
        if (!alive) return;
        const next = { ...EMPTY, ...json };
        omdbCache.set(imdbId, next);
        setData(next);
      })
      .catch(() => {
        // 拿不到就等于没有评分，评分行会自己跳过空源
      });

    return () => {
      alive = false;
    };
  }, [imdbId]);

  return data;
}

/**
 * 从 TMDB 的 id 反查 imdb_id。
 * 只走 /external_ids 这个轻量端点，不拉完整详情——Hero 每切一张都要查，
 * 拉详情就太重了。查不到的条目会缓存成 null，避免反复重试。
 */
export function useImdbId(
  mediaType?: 'movie' | 'tv' | null,
  tmdbId?: number | null
): string | null {
  const key =
    mediaType && tmdbId ? `${mediaType}:${tmdbId}` : undefined;

  const [imdbId, setImdbId] = useState<string | null>(() =>
    key ? imdbIdCache.get(key) ?? null : null
  );

  useEffect(() => {
    if (!key || !mediaType || !tmdbId) {
      setImdbId(null);
      return;
    }

    if (imdbIdCache.has(key)) {
      setImdbId(imdbIdCache.get(key) ?? null);
      return;
    }

    let alive = true;

    fetch(
      `/api/tmdb/external-ids?type=${mediaType}&id=${encodeURIComponent(tmdbId)}`
    )
      .then((res) => res.json())
      .then((json: { imdbId?: string | null }) => {
        if (!alive) return;
        const next = json?.imdbId || null;
        imdbIdCache.set(key, next);
        setImdbId(next);
      })
      .catch(() => {
        // 失败不写缓存，下次还能再试
      });

    return () => {
      alive = false;
    };
  }, [key, mediaType, tmdbId]);

  return imdbId;
}
