/**
 * TMDB 标题字（key art logo）与无字海报的挑选逻辑。
 *
 * 抽成共享模块是因为有两个消费方，而且必须挑到同一张图，否则会出现
 * 「Hero 上是 A、照片墙里是 B」这种前后不一致：
 *   - /api/tmdb/logo     —— 单条查询，照片墙与前端兜底用
 *   - /api/tmdb/trending —— 批量查询，把结果随列表一起下发给 Hero
 */

export interface TMDBImageAsset {
  file_path: string;
  width: number;
  height: number;
  vote_average?: number;
  vote_count?: number;
  iso_639_1?: string | null;
}

/** 排序权重：片名是中文时优先中文标题字，否则中文/英文/无语言标记依次退让。 */
export function logoRank(logo: TMDBImageAsset, preferZh: boolean): number {
  const lang = (logo.iso_639_1 || '').toLowerCase();
  if (lang.startsWith('zh')) return preferZh ? 0 : 1;
  if (lang.startsWith('en')) return 2;
  if (!lang) return 3; // 无语言标记的多半是纯图形标题，任何语言下都能用
  return 4;
}

export function pickLogo(
  logos: TMDBImageAsset[],
  preferZh: boolean
): TMDBImageAsset | null {
  const sorted = [...logos].sort((a, b) => {
    const rank = logoRank(a, preferZh) - logoRank(b, preferZh);
    if (rank !== 0) return rank;
    const vote = (b.vote_average || 0) - (a.vote_average || 0);
    if (vote !== 0) return vote;
    return (b.vote_count || 0) - (a.vote_count || 0);
  });
  return sorted[0] || null;
}

/**
 * 无字海报：iso_639_1 为 null 的那种，TMDB 官网标成「Not Specified」。
 * 手机端用它 + 标题字 logo，避免海报自带的片名和 logo 叠在一起。
 * 注意不保证每部片都有——没有就回落到带字海报，logo 始终保留。
 */
export function pickTextlessPoster(
  posters: TMDBImageAsset[]
): TMDBImageAsset | null {
  const textless = posters.filter((p) => !p.iso_639_1);
  if (!textless.length) return null;
  return [...textless].sort((a, b) => {
    const vote = (b.vote_average || 0) - (a.vote_average || 0);
    if (vote !== 0) return vote;
    return (b.vote_count || 0) - (a.vote_count || 0);
  })[0];
}

/** 片名是否含中文。标题字 / 海报的语种偏好按它决定。 */
export function titlePrefersZh(title: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(title || '');
}
