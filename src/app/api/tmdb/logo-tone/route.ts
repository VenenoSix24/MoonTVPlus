import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getTMDBImagesWithLang, getTMDBImageUrl } from '@/lib/tmdb.client';
import { logoRank, TMDBImageAsset } from '@/lib/tmdb.logo';

/**
 * 标题字（logo）分析。
 *
 * 两种用法：
 *   ?src=<图片地址>            分析指定这一张
 *   ?id=&type=&zh=            在同片的所有 logo 里挑一张能在暗底上看清的
 *
 * 第二种是「深色就反相」的升级版：反相会把颜色一起翻掉（深红变浅青），
 * 而 TMDB 上同一部片往往有多个语言/版本的 logo，其中就有原生浅色的。
 * 能直接用原生的就不去糟蹋颜色。
 *
 * 为什么放服务端：TMDB 图床不返回 Access-Control-Allow-Origin，
 * 前端 canvas 读了会抛 SecurityError。
 */

const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

interface ToneResult {
  dark: boolean;
  ratio: number;
  /** 墨迹密度：非透明像素占整图面积的比例，测不出来时为 0 */
  density: number;
}

interface ToneDetail extends ToneResult {
  /** 平均亮度 0–255 */
  lum: number;
  /** 平均饱和度 0–1 */
  sat: number;
}

const EMPTY: ToneResult = { dark: false, ratio: 0, density: 0 };

const cache = new Map<string, { data: ToneResult; timestamp: number }>();

/** 只允许 TMDB 图床，避免这个接口被当成任意 URL 的代理 */
function isAllowedHost(hostname: string) {
  return hostname === 'image.tmdb.org' || hostname.endsWith('.tmdb.org');
}

function readCache(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) return hit.data;
  return null;
}

function writeCache(key: string, data: ToneResult) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * 这张 logo 压在黑色遮罩上读得出来吗？
 *
 * 两条任一满足即可：本身够亮（白/浅灰），或者颜色够饱和（深红、深蓝在暗底上
 * 仍然看得见轮廓）。都不满足的才是真的「深色单色」，只能反相。
 */
function isReadable(t: ToneDetail): boolean {
  return t.lum >= 110 || t.sat >= 0.35;
}

/** 下载一张图并把它量一遍 */
async function analyzeImage(
  sharp: any,
  src: string
): Promise<ToneDetail | null> {
  const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(buf).metadata();
  const ratio = meta.width && meta.height ? meta.width / meta.height : 0;

  // 缩到 32px 再统计：够判断颜色倾向，又不至于每次解码整张大图
  const { data, info } = await sharp(buf)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let lumSum = 0;
  let satSum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3];
    // 透明像素不参与统计：logo 的留白是透明的，算进去会把亮度拉偏
    if (a < 40) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
    satSum += max === 0 ? 0 : (max - min) / max;
    count += 1;
  }

  // 墨迹密度：logo 是透明 PNG，真正占视觉的是笔画，不是外框。
  // 不能沿用上面 32px 的采样——细笔画会被平均成半透明，卡在 alpha 阈值下漏掉。
  // 分母用整图面积：渲染时透明留白同样占着盒子，算进去才和实际占地一致。
  const inkStat = await sharp(buf)
    .resize(400, 400, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let ink = 0;
  for (let i = 3; i < inkStat.data.length; i += inkStat.info.channels) {
    if (inkStat.data[i] >= 40) ink += 1;
  }
  const inkTotal = inkStat.info.width * inkStat.info.height;
  const density = inkTotal > 0 ? ink / inkTotal : 0;

  if (count === 0) {
    return { dark: false, ratio, density, lum: 0, sat: 0 };
  }

  const lum = lumSum / count;
  const sat = satSum / count;

  return {
    dark: lum < 80 && sat < 0.25,
    ratio,
    density,
    lum,
    sat,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const src = params.get('src');
  const id = params.get('id');

  let sharp: any;
  try {
    // 动态引入：Cloudflare 构建下 sharp 不可用，取不到就直接按非深色处理
    sharp = (await import('sharp')).default;
  } catch {
    return NextResponse.json(EMPTY);
  }

  if (src) return handleBySrc(sharp, src);
  if (id) return handleById(sharp, params, id);
  return NextResponse.json(EMPTY);
}

/** 分析指定的一张图 */
async function handleBySrc(sharp: any, src: string) {
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json(EMPTY);
  }
  if (!isAllowedHost(parsed.hostname)) return NextResponse.json(EMPTY);

  const cached = readCache(src);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  try {
    const detail = await analyzeImage(sharp, src);
    if (!detail) return NextResponse.json(EMPTY);

    const result: ToneResult = {
      dark: detail.dark,
      ratio: detail.ratio,
      density: detail.density,
    };
    writeCache(src, result);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (error) {
    console.error('分析 logo 明暗失败:', error);
    return NextResponse.json(EMPTY);
  }
}

/**
 * 在同片的多个 logo 里挑一张。
 *
 * 按语言 / 票数排好序之后逐个量，第一个「读得出来」的就是结果 —— 原生的浅色
 * 版本优先于反相出来的。全都读不出来才退回排第一的那张，并标记 dark 让前端反相。
 */
async function handleById(
  sharp: any,
  params: URLSearchParams,
  id: string
) {
  const type = params.get('type') === 'tv' ? 'tv' : 'movie';
  const preferZh = params.get('zh') === '1';
  const cacheKey = `pick:${type}:${id}:${preferZh ? 1 : 0}`;

  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  try {
    const config = await getConfig();
    const apiKey = config.SiteConfig?.TMDBApiKey;
    if (!apiKey) return NextResponse.json(EMPTY);

    const res = await getTMDBImagesWithLang(
      apiKey,
      parseInt(id, 10),
      type,
      config.SiteConfig?.TMDBProxy,
      config.SiteConfig?.TMDBReverseProxy
    );
    const logos: TMDBImageAsset[] =
      res.code === 200 && res.images?.logos ? res.images.logos : [];
    if (!logos.length) return NextResponse.json(EMPTY);

    // 排序：语言分组 → 同组内原标题语言优先 → 票数。
    // 第三步是关键：《祈念守护人》的 logo 全是日/俄/韩、没有中文版，光按语言排
    // 会先挑到日文深色那张，而它的白色版也在日文里（原标题语言就是 ja）。
    const originalLang = res.originalLanguage || '';
    const isOriginal = (asset: TMDBImageAsset) =>
      Boolean(originalLang) &&
      (asset.iso_639_1 || '').toLowerCase().startsWith(originalLang);

    const sorted = [...logos].sort((a, b) => {
      const rank = logoRank(a, preferZh) - logoRank(b, preferZh);
      if (rank !== 0) return rank;
      const orig = Number(isOriginal(b)) - Number(isOriginal(a));
      if (orig !== 0) return orig;
      const vote = (b.vote_average || 0) - (a.vote_average || 0);
      if (vote !== 0) return vote;
      return (b.vote_count || 0) - (a.vote_count || 0);
    });

    // 并发把候选全量一遍。之前是串行只试前三张，碰上「可读的那张排第四」
    // 就整片误判（祈念守护人正是这种情况）。并发后耗时等于最慢的一张。
    const candidates = sorted.slice(0, 6);
    const analyzed = await Promise.all(
      candidates.map(async (asset) => {
        try {
          const tone = await analyzeImage(
            sharp,
            getTMDBImageUrl(asset.file_path, 'w500')
          );
          return { asset, tone };
        } catch {
          return { asset, tone: null as ToneDetail | null };
        }
      })
    );

    // 第一张「在暗底上读得出来」的：原生浅色版优先于反相出来的
    const readable = analyzed.find((hit) => hit.tone && isReadable(hit.tone));
    if (readable && readable.tone) {
      const result: ToneResult = {
        dark: false,
        ratio: readable.tone.ratio,
        density: readable.tone.density,
      };
      writeCache(cacheKey, result);
      return NextResponse.json(
        { ...result, path: readable.asset.file_path },
        { headers: { 'Cache-Control': 'public, max-age=86400' } }
      );
    }

    // 一张都读不出来才反相。这里直接给 true —— 能走到这行就说明没有可读的，
    // 旧代码用原始 dark 判定，会把「亮度 47、饱和度 0.28」的深彩色漏判成
    // 不需要反色，结果黑字压在黑底上。
    const fallback = analyzed.find((hit) => hit.tone);
    if (fallback && fallback.tone) {
      const result: ToneResult = {
        dark: true,
        ratio: fallback.tone.ratio,
        density: fallback.tone.density,
      };
      writeCache(cacheKey, result);
      return NextResponse.json(
        { ...result, path: fallback.asset.file_path, forcedDark: true },
        { headers: { 'Cache-Control': 'public, max-age=86400' } }
      );
    }

    return NextResponse.json(EMPTY);
  } catch (error) {
    console.error('挑选标题字失败:', error);
    return NextResponse.json(EMPTY);
  }
}
