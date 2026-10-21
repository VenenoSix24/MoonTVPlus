import type { SearchResult } from '@/lib/types';

/**
 * 测速前的播放入口解析。
 *
 * 采集源（api_site）的 episodes 本身就是可直接播放的 m3u8，hls.js 能直接测。
 * 而脚本源 / 小雅 / openlist / 网盘这类「懒解析」源，episodes 里是 /api/xxx/play?... 的
 * 中间地址，返回 JSON 而不是媒体流，直接丢给 hls.js 必然失败，因此测速前要先换出真实地址。
 */

/** 这些前缀的播放地址返回 JSON（`?format=json`），需要先解析出真实媒体地址 */
const LAZY_PLAY_URL_PREFIXES = [
  '/api/source-script/play',
  '/api/xiaoya/play',
  '/api/openlist/play',
  '/api/netdisk/',
];

const DEFAULT_RESOLVE_TIMEOUT_MS = 8000;

export function isLazyPlayUrl(url: string): boolean {
  if (!url) return false;
  return LAZY_PLAY_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** 把懒解析播放地址换成真实媒体地址；失败时原样返回，交给后续测速流程报错 */
export async function resolveMediaUrlForSpeedTest(
  rawUrl: string,
  timeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS
): Promise<string> {
  if (!rawUrl || !isLazyPlayUrl(rawUrl)) return rawUrl;

  const { signal, done } = withTimeout(timeoutMs);
  try {
    const separator = rawUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${rawUrl}${separator}format=json`, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return rawUrl;
    const data = (await response.json()) as { url?: string } | null;
    return typeof data?.url === 'string' && data.url ? data.url : rawUrl;
  } catch {
    return rawUrl;
  } finally {
    done();
  }
}

/**
 * 懒加载详情源（如 script: 源）在搜索结果里 episodes 为空，测速前需要补全。
 * 其它源保持原有行为：没有 episodes 就直接放弃。
 */
export async function ensureEpisodesForSpeedTest(
  source: Pick<SearchResult, 'episodes' | 'source' | 'id' | 'title'>,
  timeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS
): Promise<string[]> {
  const existing = Array.isArray(source.episodes)
    ? source.episodes.filter(Boolean)
    : [];
  if (existing.length > 0) return existing;
  if (!source.source?.startsWith('script:')) return [];
  if (!source.id) return [];

  const { signal, done } = withTimeout(timeoutMs);
  try {
    const query = new URLSearchParams({
      source: source.source,
      id: source.id,
      title: source.title || '',
    });
    const response = await fetch(`/api/source-detail?${query.toString()}`, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return [];
    const detail = (await response.json()) as { episodes?: string[] } | null;
    const episodes = detail?.episodes;
    return Array.isArray(episodes) ? episodes.filter(Boolean) : [];
  } catch {
    return [];
  } finally {
    done();
  }
}

/**
 * 取一条可直接交给 hls.js 的真实媒体地址用于测速。
 * 返回 null 表示该源没有可测速的地址。
 */
export async function getSpeedTestMediaUrl(
  source: Pick<SearchResult, 'episodes' | 'source' | 'id' | 'title'>,
  timeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS
): Promise<string | null> {
  const episodes = await ensureEpisodesForSpeedTest(source, timeoutMs);
  if (episodes.length === 0) return null;

  // 与既有逻辑保持一致：优先测第二集（跳过片头/试看），只有一集时测第一集
  const rawUrl = episodes.length > 1 ? episodes[1] : episodes[0];
  return resolveMediaUrlForSpeedTest(rawUrl, timeoutMs);
}
