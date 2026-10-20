/**
 * 首页模块的排序与显隐。
 *
 * 分两层：
 *   - 站点默认（管理端 `ThemeConfig.homeModules`，随 RUNTIME_CONFIG 下发）
 *   - 用户覆盖（浏览器 localStorage['homeModules']）
 *
 * 用户动过就以用户那份为准，站点之后怎么改都不再影响他 —— 这是有意的：站长调的是
 * 「新访客默认看到什么」，不是强制推送。反过来，站点**新增**了模块时，老用户的那份
 * 里没有这个 id，会按站点默认的位置补进来，不然新模块永远只有没点过设置的人能看见。
 */

export interface HomeModuleConfig {
  id: string;
  enabled: boolean;
  order: number;
}

export interface HomeModule extends HomeModuleConfig {
  /** 只有展示用途，存库的配置里不带 */
  name: string;
}

/** 内置模块清单。id 是渲染键（见 page.tsx 的 renderModule），不能随便改。 */
export const HOME_MODULE_CATALOG: readonly HomeModule[] = [
  { id: 'hotMovies', name: '热门电影', enabled: true, order: 0 },
  { id: 'hotDuanju', name: '热播短剧', enabled: true, order: 1 },
  { id: 'bangumiCalendar', name: '新番放送', enabled: true, order: 2 },
  { id: 'hotTvShows', name: '热门剧集', enabled: true, order: 3 },
  { id: 'hotVarietyShows', name: '热门综艺', enabled: true, order: 4 },
  { id: 'upcomingContent', name: '即将上映', enabled: true, order: 5 },
];

/** 一份全新的默认清单（可安全改动返回值）。 */
export const defaultHomeModules = (): HomeModule[] =>
  HOME_MODULE_CATALOG.map((item) => ({ ...item }));

const isConfigList = (value: unknown): value is HomeModuleConfig[] =>
  Array.isArray(value) &&
  value.some(
    (item) => item && typeof (item as HomeModuleConfig).id === 'string'
  );

/**
 * 站点配置 → 完整清单。
 *
 * 管理端存的是精简数组，可能缺项（比如代码里后加了一个模块但站长还没保存过）。
 * 缺的按内置目录的顺序补在末尾，不认识的 id 丢掉。
 */
export function resolveSiteHomeModules(
  site?: HomeModuleConfig[] | null
): HomeModule[] {
  const base = defaultHomeModules();
  if (!isConfigList(site) || site.length === 0) return base;

  const saved = new Map(
    site
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => [item.id, item])
  );

  const out: HomeModule[] = [];
  let maxOrder = -1;
  base.forEach((item) => {
    const entry = saved.get(item.id);
    if (!entry) return;
    const order = Number.isFinite(entry.order) ? entry.order : item.order;
    maxOrder = Math.max(maxOrder, order);
    out.push({ ...item, enabled: entry.enabled !== false, order });
  });

  // 配置里没有的模块（代码后加的）按内置顺序补在末尾
  base.forEach((item) => {
    if (saved.has(item.id)) return;
    out.push({ ...item, order: ++maxOrder });
  });

  return out.sort((a, b) => a.order - b.order);
}

/**
 * 站点默认 + 用户覆盖 → 真正渲染用的清单。
 *
 * 用户在设置里改过的模块：显隐和位置都以他为准。
 * 用户那份里没有的模块：用站点默认，排在用户已有项之后。
 */
export function mergeHomeModules(
  siteDefault: HomeModule[],
  saved?: unknown
): HomeModule[] {
  if (!isConfigList(saved) || saved.length === 0) {
    return siteDefault.slice().sort((a, b) => a.order - b.order);
  }

  const userMap = new Map(
    saved
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => [item.id, item])
  );

  let maxOrder = -1;
  userMap.forEach((item) => {
    if (Number.isFinite(item.order)) maxOrder = Math.max(maxOrder, item.order);
  });

  const out: HomeModule[] = [];
  siteDefault.forEach((item) => {
    const mine = userMap.get(item.id);
    if (mine) {
      out.push({
        ...item,
        enabled: mine.enabled !== false,
        order: Number.isFinite(mine.order) ? mine.order : item.order,
      });
    } else {
      out.push({ ...item, order: ++maxOrder });
    }
  });

  return out.sort((a, b) => a.order - b.order);
}
