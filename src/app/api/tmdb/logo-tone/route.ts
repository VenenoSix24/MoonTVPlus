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
 * 只看亮度。饱和度不算数 —— 深红（#8B0000）饱和度满格、亮度只有 40，压在黑色
 * 遮罩上照样看不见。之前把「饱和度 ≥ 0.35」也算作可读，于是亮度 55 的深彩色被
 * 当成「不用反色」，表现出来就是深色模式下还有黑 logo。
 */
function isReadable(t: ToneDetail): boolean {
  return t.lum >= 115;
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
  // pick2：换了一套选择规则，旧缓存不能再用
  const cacheKey = `pick2:${type}:${id}:${preferZh ? 1 : 0}`;

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

    const originalLang = res.originalLanguage || '';

    /**
     * 语言优先级是硬约束，不能拿它不是来换颜色。
     *
     * 中文站先要中文片名，没有中文才用原产国语言，再没有才轮到无标记 / 英文 /
     * 其他。之前为了「找一张浅色的」跨语言挑，结果是中文站显示英文 or 日文片名 ——
     * 片名语言错了比颜色不对严重得多。
     */
    const langRank = (asset: TMDBImageAsset) => {
      const lang = (asset.iso_639_1 || '').toLowerCase();
      if (lang.startsWith('zh')) return preferZh ? 0 : 1;
      if (originalLang && lang.startsWith(originalLang)) return 2;
      if (!lang) return 3;
      if (lang.startsWith('en')) return 4;
      return 5;
    };

    const ranked = [...logos].sort((a, b) => {
      const rank = langRank(a) - langRank(b);
      if (rank !== 0) return rank;
      const vote = (b.vote_average || 0) - (a.vote_average || 0);
      if (vote !== 0) return vote;
      return (b.vote_count || 0) - (a.vote_count || 0);
    });

    // 只取优先级最高的那一组，一个都不跨组挑
    const topRank = langRank(ranked[0]);
    const group = ranked
      .filter((asset) => langRank(asset) === topRank)
      .slice(0, 4);

    // 组内并发量一遍，找第一张「在暗底上读得出来」的：
    // 中文有浅色版就用浅色版，没有就反相中文那张 —— 但始终是中文。
    const analyzed = await Promise.all(
      group.map(async (asset) => {
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

    const readable = analyzed.find((hit) => hit.tone && isReadable(hit.tone));
    const chosen = readable || analyzed.find((hit) => hit.tone);
    if (!chosen || !chosen.tone) return NextResponse.json(EMPTY);

    const result: ToneResult = {
      // 组内没有可读的才反相。能走到这里说明这一组全是深色。
      dark: !readable,
      ratio: chosen.tone.ratio,
      density: chosen.tone.density,
    };
    writeCache(cacheKey, result);

    return NextResponse.json(
      { ...result, path: chosen.asset.file_path },
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    );
  } catch (error) {
    console.error('挑选标题字失败:', error);
    return NextResponse.json(EMPTY);
  }
}
