/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getTMDBImages } from '@/lib/tmdb.client';

export const runtime = 'nodejs';

/**
 * TMDB 的 /images 响应里除了 backdrops / posters 还有一组 logos ——
 * 影片官方标题字（透明 PNG），就是 Netflix / Apple TV+ 放在 Hero 上的那个东西。
 * 这里单独开一个轻量接口取它，避免污染 /api/tmdb/images（那个是照片墙在用的，
 * 混进 logo 会让照片墙多出一堆标题字）。
 */

interface TMDBLogo {
  file_path: string;
  width: number;
  height: number;
  vote_average?: number;
  vote_count?: number;
  iso_639_1?: string | null;
}

/** 排序权重：片名是中文时优先中文标题字，否则中文/英文/无语言标记依次退让。 */
function logoRank(logo: TMDBLogo, preferZh: boolean): number {
  const lang = (logo.iso_639_1 || '').toLowerCase();
  if (lang.startsWith('zh')) return preferZh ? 0 : 1;
  if (lang.startsWith('en')) return 2;
  if (!lang) return 3; // 无语言标记的多半是纯图形标题，任何语言下都能用
  return 4;
}

function pickLogo(logos: TMDBLogo[], preferZh: boolean): TMDBLogo | null {
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
function pickTextlessPoster(posters: TMDBLogo[]): TMDBLogo | null {
  const textless = posters.filter((p) => !p.iso_639_1);
  if (!textless.length) return null;
  return [...textless].sort((a, b) => {
    const vote = (b.vote_average || 0) - (a.vote_average || 0);
    if (vote !== 0) return vote;
    return (b.vote_count || 0) - (a.vote_count || 0);
  })[0];
}

/**
 * GET /api/tmdb/logo?id=xxx&type=movie|tv&zh=1
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
    const preferZh = searchParams.get('zh') === '1';

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

    const response = await getTMDBImages(
      tmdbApiKey,
      parseInt(id, 10),
      type as 'movie' | 'tv',
      config.SiteConfig.TMDBProxy,
      config.SiteConfig.TMDBReverseProxy
    );

    if (response.code !== 200 || !response.images) {
      return NextResponse.json(
        { error: 'TMDB 图片信息获取失败', code: response.code },
        { status: response.code }
      );
    }

    const logos: TMDBLogo[] = response.images.logos || [];
    const picked = pickLogo(logos, preferZh);
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
