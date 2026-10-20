/* Trakt.tv 评分查询。
 *
 * 只读公开数据，不需要 OAuth：注册应用拿到 Client ID 后放进请求头即可。
 * 两步走：先用 TMDB id 换 Trakt id，再取评分 —— Trakt 没有「按 TMDB id
 * 直接取评分」的端点。 */

const TRAKT_API = 'https://api.trakt.tv';

export interface TraktRating {
  /** 0–10，0 表示还没有人评分 */
  rating: number | null;
  votes: number;
}

const EMPTY: TraktRating = { rating: null, votes: 0 };

function headers(clientId: string) {
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
}

export async function getTraktRating(
  clientId: string,
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<TraktRating> {
  if (!clientId) return EMPTY;

  try {
    const traktType = mediaType === 'tv' ? 'show' : 'movie';

    const searchRes = await fetch(
      `${TRAKT_API}/search/tmdb/${tmdbId}?type=${traktType}`,
      { headers: headers(clientId), signal: AbortSignal.timeout(8000) }
    );
    if (!searchRes.ok) return EMPTY;

    const searchList: any[] = await searchRes.json();
    if (!Array.isArray(searchList) || searchList.length === 0) return EMPTY;

    const traktId = searchList[0]?.[traktType]?.ids?.trakt;
    if (typeof traktId !== 'number') return EMPTY;

    const ratingsRes = await fetch(
      `${TRAKT_API}/${traktType}s/${traktId}/ratings`,
      { headers: headers(clientId), signal: AbortSignal.timeout(8000) }
    );
    if (!ratingsRes.ok) return EMPTY;

    const data: any = await ratingsRes.json();
    // Trakt 对无人评分的条目返回 rating: 0，等同于没有
    const rating =
      typeof data?.rating === 'number' && data.rating > 0 ? data.rating : null;

    return {
      rating,
      votes: typeof data?.votes === 'number' ? data.votes : 0,
    };
  } catch (error) {
    console.error('获取 Trakt 评分失败:', error);
    return EMPTY;
  }
}
