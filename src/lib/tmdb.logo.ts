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

/**
 * 语言白名单：只认中文和影片的原产国语言。
 *
 * 这是白名单不是排序权重 —— 两样都没有的片就不挂 logo，回退文字标题。
 * 中文站上显示英文片名是硬伤，而 TMDB 的偏门片经常只有英/俄/韩版本，
 * 按权重退让就会一路退到英文上去。
 *
 * 没有语言标记的多半是纯图形标题（不含文字），放最后兜底不会引入外语。
 */
export function logoLangRank(
  logo: TMDBImageAsset,
  originalLanguage?: string
): number | null {
  const lang = (logo.iso_639_1 || '').toLowerCase();
  if (!lang) return 2;
  if (lang.startsWith('zh')) return 0;
  const origin = (originalLanguage || '').toLowerCase();
  if (origin && lang.startsWith(origin)) return 1;
  return null;
}

/**
 * 挑标题字：白名单内取优先级最高的第一张。
 *
 * 组内保持 TMDB 返回的顺序，不按票数重排 —— logo 的 vote_average 实测几乎全是 0，
 * 排序没有意义，反而会打乱官方提交的先后（用户核对 TMDB 时说的「第一个」就是它）。
 */
export function pickLogo(
  logos: TMDBImageAsset[],
  originalLanguage?: string
): TMDBImageAsset | null {
  let best: TMDBImageAsset | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const logo of logos) {
    const rank = logoLangRank(logo, originalLanguage);
    if (rank === null || rank >= bestRank) continue;
    best = logo;
    bestRank = rank;
    if (rank === 0) break;
  }
  return best;
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
