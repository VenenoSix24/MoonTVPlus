/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getTMDBImagesWithLang } from '@/lib/tmdb.client';
import { pickLogo, pickTextlessPoster, TMDBImageAsset } from '@/lib/tmdb.logo';

export const runtime = 'nodejs';

/**
 * 给 TMDB 调用套一个总预算。
 *
 * 这条链是「详情 → 图片」两步串行，每步自带 15 秒超时、图片那段还带一次重试，
 * TMDB 整体不可达时最坏要挂 45 秒。标题字本来就是锦上添花——拿不到就回落文字
 * 标题，用户完全无感——没理由让浏览器等这么久，到点直接当没有。
 *
 * 注意：这只是不再等待，底层请求不会被取消（同 trending 里的 withBudget）。
 */
const LOGO_BUDGET_MS = 8000;

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * TMDB 的 /images 响应里除了 backdrops / posters 还有一组 logos ——
 * 影片官方标题字（透明 PNG），就是 Netflix / Apple TV+ 放在 Hero 上的那个东西。
 * 这里单独开一个轻量接口取它，避免污染 /api/tmdb/images（那个是照片墙在用的，
 * 混进 logo 会让照片墙多出一堆标题字）。
 */

/**
 * GET /api/tmdb/logo?id=xxx&type=movie|tv
 * 返回 { logo_path, aspect_ratio }。没有标题字时 logo_path 为 null，
 * 前端据此回落到文字标题。
 */
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type') || 'movie';

    if (!id) {
      return NextResponse.json({ error: '缺少ID参数' }, { status: 400 });
    }

    if (type !== 'movie' && type !== 'tv') {
      return NextResponse.json(
        { error: '类型参数必须是movie或tv' },
        { status: 400 }
      );
    }

    const config = await getConfig();
    const tmdbApiKey = config.SiteConfig.TMDBApiKey;
    if (!tmdbApiKey) {
      return NextResponse.json(
        { error: 'TMDB API Key 未配置' },
        { status: 400 }
      );
    }

    const response = await withBudget(
      getTMDBImagesWithLang(
        tmdbApiKey,
        parseInt(id, 10),
        type as 'movie' | 'tv',
        config.SiteConfig.TMDBProxy,
        config.SiteConfig.TMDBReverseProxy
      ),
      LOGO_BUDGET_MS
    );

    // 预算到点：按「没有标题字」处理，前端立刻回落文字标题，不再干等。
    if (!response) {
      return NextResponse.json({
        logo_path: null,
        aspect_ratio: null,
        textless_poster_path: null,
        total: 0,
      });
    }

    if (response.code !== 200 || !response.images) {
      return NextResponse.json(
        { error: 'TMDB 图片信息获取失败', code: response.code },
        { status: response.code }
      );
    }

    const logos: TMDBImageAsset[] = response.images.logos || [];
    const picked = pickLogo(logos, response.originalLanguage);
    const textlessPoster = pickTextlessPoster(response.images.posters || []);

    return NextResponse.json({
      logo_path: picked ? picked.file_path : null,
      aspect_ratio:
        picked && picked.height ? picked.width / picked.height : null,
      // 无字海报。取不到就是 null，前端回落到带字海报（logo 始终保留）
      textless_poster_path: textlessPoster ? textlessPoster.file_path : null,
      total: logos.length,
    });
  } catch (error) {
    console.error('TMDB 标题字获取失败:', error);
    return NextResponse.json(
      { error: '获取标题字失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
