import { NextRequest, NextResponse } from 'next/server';

/**
 * 判断影片标题字（logo）是「深色单色」还是别的。
 *
 * 为什么要服务端做：TMDB 的图片 CDN 不返回 Access-Control-Allow-Origin，
 * 前端 canvas 读了会抛 SecurityError，根本采样不到像素。
 *
 * 判据是「平均亮度低 + 平均饱和度低」：黑色 / 深灰色的 logo 判为 true，
 * 白色 logo 亮度高、彩色 logo 饱和度高，都不会命中 —— 只有真的需要反色时
 * 才反色，不会把彩色片名也洗掉。
 */

const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const cache = new Map<string, { dark: boolean; timestamp: number }>();

/** 只允许 TMDB 图床，避免这个接口被当成任意 URL 的代理 */
function isAllowedHost(hostname: string) {
  return hostname === 'image.tmdb.org' || hostname.endsWith('.tmdb.org');
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get('src');
  if (!src) return NextResponse.json({ dark: false });

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ dark: false });
  }

  if (!isAllowedHost(parsed.hostname)) {
    return NextResponse.json({ dark: false });
  }

  const cached = cache.get(src);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(
      { dark: cached.dark },
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    );
  }

  let sharp: any;
  try {
    // 动态引入：Cloudflare 构建下 sharp 不可用，取不到就直接按非深色处理
    sharp = (await import('sharp')).default;
  } catch {
    return NextResponse.json({ dark: false });
  }

  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ dark: false });

    const buf = Buffer.from(await res.arrayBuffer());

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

    if (count === 0) {
      return NextResponse.json({ dark: false });
    }

    const lum = lumSum / count;
    const sat = satSum / count;
    const dark = lum < 80 && sat < 0.25;

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(src, { dark, timestamp: Date.now() });

    return NextResponse.json(
      { dark },
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    );
  } catch (error) {
    console.error('分析 logo 明暗失败:', error);
    return NextResponse.json({ dark: false });
  }
}
