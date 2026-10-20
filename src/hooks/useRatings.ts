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

/* 三层缓存都在模块级：Hero 轮播切回上一张、Hero 与播放页同时看同一部片子、
   以及预加载与组件同时要同一份数据，都不该重复打网络。
   进行中的请求单独登记，避免「预加载刚发出、组件又发一次」。 */
const omdbCache = new Map<string, OmdbRatings>();
const imdbIdCache = new Map<string, string | null>();
const imdbIdInflight = new Map<string, Promise<string | null>>();
const omdbInflight = new Map<string, Promise<OmdbRatings>>();

async function fetchImdbId(
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<string | null> {
  const key = `${mediaType}:${tmdbId}`;

  if (imdbIdCache.has(key)) return imdbIdCache.get(key) ?? null;

  const running = imdbIdInflight.get(key);
  if (running) return running;

  const task = (async () => {
    try {
      const res = await fetch(
        `/api/tmdb/external-ids?type=${mediaType}&id=${tmdbId}`
      );
      const json: { imdbId?: string | null } = await res.json();
      const next = json?.imdbId || null;
      // 查不到也缓存成 null：TMDB 上确实没映射的条目不该被反复重试
      imdbIdCache.set(key, next);
      return next;
    } catch {
      // 网络失败不写缓存，下次还能再试
      return null;
    } finally {
      imdbIdInflight.delete(key);
    }
  })();

  imdbIdInflight.set(key, task);
  return task;
}

async function fetchOmdbRatings(imdbId: string): Promise<OmdbRatings> {
  const hit = omdbCache.get(imdbId);
  if (hit) return hit;

  const running = omdbInflight.get(imdbId);
  if (running) return running;

  const task = (async () => {
    try {
      const res = await fetch(
        `/api/omdb/ratings?imdb_id=${encodeURIComponent(imdbId)}`
      );
      const json: OmdbRatings = await res.json();
      const next = { ...EMPTY, ...json };
      omdbCache.set(imdbId, next);
      return next;
    } catch {
      return EMPTY;
    } finally {
      omdbInflight.delete(imdbId);
    }
  })();

  omdbInflight.set(imdbId, task);
  return task;
}

/**
 * 预热一部片子的评分。Hero 轮播在数据到手后就按顺序把后面几张备好，
 * 切过去时首帧就是完整数据，不会再「先空一下再闪出来」。
 */
export function prefetchRatings(
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<void> {
  return fetchImdbId(mediaType, tmdbId).then((imdbId) => {
    if (!imdbId) return;
    return fetchOmdbRatings(imdbId).then(() => undefined);
  });
}

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

    fetchOmdbRatings(imdbId).then((next) => {
      if (!alive) return;
      setData(next);
    });

    return () => {
      alive = false;
    };
  }, [imdbId]);

  return data;
}

export function useImdbId(
  mediaType?: 'movie' | 'tv' | null,
  tmdbId?: number | null
): string | null {
  const key = mediaType && tmdbId ? `${mediaType}:${tmdbId}` : undefined;

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
    fetchImdbId(mediaType, tmdbId).then((next) => {
      if (!alive) return;
      setImdbId(next);
    });

    return () => {
      alive = false;
    };
  }, [key, mediaType, tmdbId]);

  return imdbId;
}
