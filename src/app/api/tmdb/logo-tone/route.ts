import { NextRequest, NextResponse } from 'next/server';

/**
 * 分析影片标题字（logo）：它是深色单色吗？宽高比是多少？
 *
 * 为什么要服务端做：TMDB 的图片 CDN 不返回 Access-Control-Allow-Origin，
 * 前端 canvas 读了会抛 SecurityError，采样不到像素。
 *
 * 两个输出：
 *   dark  —— 平均亮度 < 80 且平均饱和度 < 0.25 判为深色单色，前端据此反色。
 *            白色 logo 亮度高、彩色 logo 饱和度高，都不会命中。
 *   ratio —— 原图宽高比。不同片名的 logo 差得很远（街头霸王 2.09:1、
 *            登峰传奇 8.89:1），同一个 height 下视觉重量能差三四倍，
 *            前端按它分档调整高度。
 */

const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

interface ToneResult {
  dark: boolean;
  ratio: number;
}

const EMPTY: ToneResult = { dark: false, ratio: 0 };

const cache = new Map<string, { data: ToneResult; timestamp: number }>();

/** 只允许 TMDB 图床，避免这个接口被当成任意 URL 的代理 */
function isAllowedHost(hostname: string) {
  return hostname === 'image.tmdb.org' || hostname.endsWith('.tmdb.org');
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get('src');
  if (!src) return NextResponse.json(EMPTY);

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json(EMPTY);
  }

  if (!isAllowedHost(parsed.hostname)) {
    return NextResponse.json(EMPTY);
  }

  const cached = cache.get(src);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  let sharp: any;
  try {
    // 动态引入：Cloudflare 构建下 sharp 不可用，取不到就直接按非深色处理
    sharp = (await import('sharp')).default;
  } catch {
    return NextResponse.json(EMPTY);
  }

  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json(EMPTY);

    const buf = Buffer.from(await res.arrayBuffer());

    const meta = await sharp(buf).metadata();
    const ratio =
      meta.width && meta.height ? meta.width / meta.height : 0;

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

    const result: ToneResult =
      count === 0
        ? { dark: false, ratio }
        : {
            dark: lumSum / count < 80 && satSum / count < 0.25,
            ratio,
          };

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(src, { data: result, timestamp: Date.now() });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (error) {
    console.error('分析 logo 明暗失败:', error);
    return NextResponse.json(EMPTY);
  }
}
