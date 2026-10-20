/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    const {
      enableBuiltInTheme,
      builtInTheme,
      customCSS,
      enableCache,
      cacheMinutes,
      loginBackgroundImage,
      registerBackgroundImage,
      homeBackgroundImage,
      progressThumbType,
      progressThumbPresetId,
      progressThumbCustomUrl,
      loadingStyle,
      rateBadgeStyle,
      defaultTheme,
      homeModules,
      homeContinueWatching,
    } = body as {
      enableBuiltInTheme: boolean;
      builtInTheme: string;
      customCSS: string;
      enableCache: boolean;
      cacheMinutes: number;
      loginBackgroundImage?: string;
      registerBackgroundImage?: string;
      homeBackgroundImage?: string;
      progressThumbType?: 'default' | 'preset' | 'custom';
      progressThumbPresetId?: string;
      progressThumbCustomUrl?: string;
      loadingStyle?: 'classic' | 'grid' | 'talisman';
      rateBadgeStyle?: 'default' | 'flag' | 'medal';
      defaultTheme?: 'light' | 'dark' | 'system';
      homeModules?: { id: string; enabled: boolean; order: number }[];
      homeContinueWatching?: boolean;
    };

    // 参数校验
    if (
      typeof enableBuiltInTheme !== 'boolean' ||
      typeof builtInTheme !== 'string' ||
      typeof customCSS !== 'string' ||
      typeof enableCache !== 'boolean' ||
      typeof cacheMinutes !== 'number'
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    // 验证背景图URL格式（支持多行，每行一个URL）
    if (loginBackgroundImage && loginBackgroundImage.trim() !== '') {
      const urls = loginBackgroundImage
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url !== '');

      for (const url of urls) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return NextResponse.json(
            { error: `登录界面背景图URL格式错误：${url}，每个URL必须以http://或https://开头` },
            { status: 400 }
          );
        }
      }
    }

    if (registerBackgroundImage && registerBackgroundImage.trim() !== '') {
      const urls = registerBackgroundImage
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url !== '');

      for (const url of urls) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return NextResponse.json(
            { error: `注册界面背景图URL格式错误：${url}，每个URL必须以http://或https://开头` },
            { status: 400 }
          );
        }
      }
    }

    if (homeBackgroundImage && homeBackgroundImage.trim() !== '') {
      const urls = homeBackgroundImage
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url !== '');

      for (const url of urls) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return NextResponse.json(
            { error: `首页背景图URL格式错误：${url}，每个URL必须以http://或https://开头` },
            { status: 400 }
          );
        }
      }
    }

    const adminConfig = await getConfig();

    // 权限校验 - 使用v2用户系统
    if (username !== process.env.USERNAME) {
      const userInfo = await db.getUserInfoV2(username);
      if (!userInfo || userInfo.role !== 'admin' || userInfo.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    // 获取当前版本号，如果CSS有变化则递增
    const currentVersion = adminConfig.ThemeConfig?.cacheVersion || 0;
    const currentCSS = enableBuiltInTheme
      ? adminConfig.ThemeConfig?.builtInTheme
      : adminConfig.ThemeConfig?.customCSS;
    const newCSS = enableBuiltInTheme ? builtInTheme : customCSS;
    const cssChanged = currentCSS !== newCSS;

    // 更新主题配置
    adminConfig.ThemeConfig = {
      enableBuiltInTheme,
      builtInTheme,
      customCSS,
      enableCache,
      cacheMinutes,
      cacheVersion: cssChanged ? currentVersion + 1 : currentVersion,
      loginBackgroundImage: loginBackgroundImage?.trim() || undefined,
      registerBackgroundImage: registerBackgroundImage?.trim() || undefined,
      homeBackgroundImage: homeBackgroundImage?.trim() || undefined,
      progressThumbType: progressThumbType || 'default',
      progressThumbPresetId: progressThumbPresetId?.trim() || undefined,
      progressThumbCustomUrl: progressThumbCustomUrl?.trim() || undefined,
      loadingStyle:
        loadingStyle === 'classic' ||
        loadingStyle === 'grid' ||
        loadingStyle === 'talisman'
          ? loadingStyle
          : 'talisman',
      rateBadgeStyle:
        rateBadgeStyle === 'default' ||
        rateBadgeStyle === 'flag' ||
        rateBadgeStyle === 'medal'
          ? rateBadgeStyle
          : 'flag',
      defaultTheme:
        defaultTheme === 'light' || defaultTheme === 'system'
          ? defaultTheme
          : 'dark',
      homeModules: Array.isArray(homeModules)
        ? homeModules
            .filter(
              (item) =>
                item &&
                typeof item.id === 'string' &&
                typeof item.enabled === 'boolean'
            )
            .map((item, index) => ({
              id: item.id,
              enabled: item.enabled,
              order: Number.isFinite(item.order) ? item.order : index,
            }))
        : undefined,
      homeContinueWatching:
        typeof homeContinueWatching === 'boolean'
          ? homeContinueWatching
          : undefined,
    };

    // 写入数据库
    await db.saveAdminConfig(adminConfig);

    // 立刻刷新进程内缓存：getConfig() 有 30s 上限，不刷新的话管理端自己刷新页面
    // 还会读到旧配置，看起来像「保存没生效」。
    const { setCachedConfig } = await import('@/lib/config');
    await setCachedConfig(adminConfig);

    return NextResponse.json(
      {
        ok: true,
        cacheVersion: adminConfig.ThemeConfig.cacheVersion,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('更新主题配置失败:', error);
    return NextResponse.json(
      {
        error: '更新主题配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
