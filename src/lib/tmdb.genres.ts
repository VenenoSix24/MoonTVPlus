/**
 * TMDB 类型名的中文补译。
 *
 * TMDB 的 genres 是随 `name` 字符串下发的，`language=zh-CN` 下大部分已经翻译好，
 * 但少数条目缺翻译（实测剧集的 `Sci-Fi & Fantasy` 就是英文），混在一排中文标签里
 * 很扎眼。这里只做兜底：命中的替换，没命中的原样返回 —— 已经翻译好的「动作」
 * 「剧情」不受影响，将来 TMDB 补齐了翻译这条也就自动失效。
 */
const GENRE_ZH: Record<string, string> = {
  // 电影与剧集共有
  Action: '动作',
  Adventure: '冒险',
  Animation: '动画',
  Comedy: '喜剧',
  Crime: '犯罪',
  Documentary: '纪录',
  Drama: '剧情',
  Family: '家庭',
  Fantasy: '奇幻',
  History: '历史',
  Horror: '恐怖',
  Music: '音乐',
  Mystery: '悬疑',
  Romance: '爱情',
  'Science Fiction': '科幻',
  'TV Movie': '电视电影',
  Thriller: '惊悚',
  War: '战争',
  Western: '西部',
  // 剧集独有
  'Action & Adventure': '动作冒险',
  Kids: '儿童',
  News: '新闻',
  Reality: '真人秀',
  'Sci-Fi & Fantasy': '科幻奇幻',
  Soap: '肥皂剧',
  Talk: '脱口秀',
  'War & Politics': '战争政治',
};

/** 单个类型名补译；不在表里就原样返回 */
export function translateGenreName(name: string): string {
  return GENRE_ZH[name] || name;
}

/** 批量补译，保持原顺序 */
export function translateGenreNames(names: string[]): string[] {
  return (names || []).map(translateGenreName);
}
