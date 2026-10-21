'use client';

import { useEffect, useState } from 'react';

export interface OmdbRatings {
  imdb: number | null;
  rottenTomatoes: number | null;
  metacritic: number | null;
}

/** TMDB 侧能提供的评分线索：优先 imdb_id，缺失时用原名 + 年份兜底 */
export interface RatingRef {
  imdbId: string | null;
  originalTitle: string | null;
  year: string | null;
}

const EMPTY: OmdbRatings = {
  imdb: null,
  rottenTomatoes: null,
  metacritic: null,
};

export const EMPTY_REF: RatingRef = {
  imdbId: null,
  originalTitle: null,
  year: null,
};

/* 三层缓存都在模块级：Hero 轮播切回上一张、Hero 与播放页同时看同一部片子、
   以及预加载与组件同时要同一份数据，都不该重复打网络。
   进行中的请求单独登记，避免「预加载刚发出、组件又发一次」。 */
const omdbCache = new Map<string, OmdbRatings>();
const refCache = new Map<string, RatingRef>();
const refInflight = new Map<string, Promise<RatingRef>>();
const omdbInflight = new Map<string, Promise<OmdbRatings>>();

/** imdb_id 优先；没有就用「原名 + 年份」作为缓存键，和后端查询口径一致 */
const omdbKey = (ref: RatingRef) =>
  ref.imdbId
    ? `i:${ref.imdbId}`
    : ref.originalTitle
      ? `t:${ref.originalTitle}|${ref.year || ''}`
      : null;

async function fetchRatingRef(
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<RatingRef> {
  const key = `${mediaType}:${tmdbId}`;

  const cached = refCache.get(key);
  if (cached) return cached;

  const running = refInflight.get(key);
  if (running) return running;

  const task = (async () => {
    try {
      const res = await fetch(
        `/api/tmdb/external-ids?type=${mediaType}&id=${tmdbId}`
      );
      const json: Partial<RatingRef> = await res.json();
      const next: RatingRef = {
        imdbId: json?.imdbId || null,
        originalTitle: json?.originalTitle || null,
        year: json?.year || null,
      };
      // 查不到也缓存：没有 imdb 映射的条目不该被反复重试
      refCache.set(key, next);
      return next;
    } catch {
      // 网络失败不写缓存，下次还能再试
      return EMPTY_REF;
    } finally {
      refInflight.delete(key);
    }
  })();

  refInflight.set(key, task);
  return task;
}

async function fetchOmdbRatings(ref: RatingRef): Promise<OmdbRatings> {
  const key = omdbKey(ref);
  if (!key) return EMPTY;

  const cached = omdbCache.get(key);
  if (cached) return cached;

  const running = omdbInflight.get(key);
  if (running) return running;

  const query = ref.imdbId
    ? `imdb_id=${encodeURIComponent(ref.imdbId)}`
    : `title=${encodeURIComponent(ref.originalTitle as string)}${
        ref.year ? `&year=${encodeURIComponent(ref.year)}` : ''
      }`;

  const task = (async () => {
    try {
      const res = await fetch(`/api/omdb/ratings?${query}`);
      const json: OmdbRatings = await res.json();
      const next = { ...EMPTY, ...json };
      omdbCache.set(key, next);
      return next;
    } catch {
      return EMPTY;
    } finally {
      omdbInflight.delete(key);
    }
  })();

  omdbInflight.set(key, task);
  return task;
}

export interface TraktValue {
  rating: number | null;
  votes: number;
}

const EMPTY_TRAKT: TraktValue = { rating: null, votes: 0 };

const traktCache = new Map<string, TraktValue>();
const traktInflight = new Map<string, Promise<TraktValue>>();

/** Trakt 评分只需要 TMDB id，走服务端代理（Client ID 不落前端） */
async function fetchTraktRating(
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<TraktValue> {
  const key = `${mediaType}:${tmdbId}`;

  const cached = traktCache.get(key);
  if (cached) return cached;

  const running = traktInflight.get(key);
  if (running) return running;

  const task = (async () => {
    try {
      const res = await fetch(
        `/api/trakt/ratings?type=${mediaType}&id=${tmdbId}`
      );
      const json: TraktValue = await res.json();
      const next = { ...EMPTY_TRAKT, ...json };
      // 没有分数不写缓存，下次还有机会补上
      if (next.rating !== null) traktCache.set(key, next);
      return next;
    } catch {
      return EMPTY_TRAKT;
    } finally {
      traktInflight.delete(key);
    }
  })();

  traktInflight.set(key, task);
  return task;
}

export function useTraktRating(
  mediaType?: 'movie' | 'tv' | null,
  tmdbId?: number | null
): TraktValue {
  const key = mediaType && tmdbId ? `${mediaType}:${tmdbId}` : undefined;

  const [data, setData] = useState<TraktValue>(() =>
    key ? traktCache.get(key) || EMPTY_TRAKT : EMPTY_TRAKT
  );

  useEffect(() => {
    if (!key || !mediaType || !tmdbId) {
      setData(EMPTY_TRAKT);
      return;
    }

    const cached = traktCache.get(key);
    if (cached) {
      setData(cached);
      return;
    }

    let alive = true;
    fetchTraktRating(mediaType, tmdbId).then((next) => {
      if (!alive) return;
      setData(next);
    });

    return () => {
      alive = false;
    };
  }, [key, mediaType, tmdbId]);

  return data;
}

/**
 * 预热一部片子的评分。Hero 轮播在数据到手后就按顺序把后面几张备好，
 * 切过去时首帧就是完整数据，不会再「先空一下再闪出来」。
 */
export function prefetchRatings(
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<void> {
  return Promise.all([
    fetchRatingRef(mediaType, tmdbId).then((ref) =>
      fetchOmdbRatings(ref).then(() => undefined)
    ),
    fetchTraktRating(mediaType, tmdbId).then(() => undefined),
  ]).then(() => undefined);
}

export function useOmdbRatings(ref: RatingRef): OmdbRatings {
  const key = omdbKey(ref);

  const [data, setData] = useState<OmdbRatings>(() => {
    const hit = key ? omdbCache.get(key) : undefined;
    return hit || EMPTY;
  });

  useEffect(() => {
    if (!key) {
      setData(EMPTY);
      return;
    }

    const hit = omdbCache.get(key);
    if (hit) {
      setData(hit);
      return;
    }

    let alive = true;
    setData(EMPTY);

    fetchOmdbRatings(ref).then((next) => {
      if (!alive) return;
      setData(next);
    });

    return () => {
      alive = false;
    };
    // ref 是每次渲染新建的对象，用 key + 字段逐个比较避免死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}

export function useRatingRef(
  mediaType?: 'movie' | 'tv' | null,
  tmdbId?: number | null
): RatingRef {
  const key = mediaType && tmdbId ? `${mediaType}:${tmdbId}` : undefined;

  const [ref, setRef] = useState<RatingRef>(() =>
    key ? refCache.get(key) ?? EMPTY_REF : EMPTY_REF
  );

  useEffect(() => {
    if (!key || !mediaType || !tmdbId) {
      setRef(EMPTY_REF);
      return;
    }

    const cached = refCache.get(key);
    if (cached) {
      setRef(cached);
      return;
    }

    let alive = true;
    fetchRatingRef(mediaType, tmdbId).then((next) => {
      if (!alive) return;
      setRef(next);
    });

    return () => {
      alive = false;
    };
  }, [key, mediaType, tmdbId]);

  return ref;
}
