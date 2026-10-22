/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员配置' },
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

    const { Enabled, ServerType, ExternalServerUrl, ExternalServerAuth } =
      body as {
        Enabled?: boolean;
        ServerType?: 'internal' | 'external';
        ExternalServerUrl?: string;
        ExternalServerAuth?: string;
      };

    if (
      (Enabled !== undefined && typeof Enabled !== 'boolean') ||
      (ServerType !== undefined &&
        ServerType !== 'internal' &&
        ServerType !== 'external') ||
      (ExternalServerUrl !== undefined &&
        typeof ExternalServerUrl !== 'string') ||
      (ExternalServerAuth !== undefined && typeof ExternalServerAuth !== 'string')
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    if (ServerType === 'external' && !ExternalServerUrl?.trim()) {
      return NextResponse.json(
        { error: '使用外部服务器时必须填写服务器地址' },
        { status: 400 }
      );
    }

    const adminConfig = await getConfig();

    // 权限校验 - 使用 v2 用户系统
    if (username !== process.env.USERNAME) {
      const userInfo = await db.getUserInfoV2(username);
      if (
        !userInfo ||
        (userInfo.role !== 'admin' && userInfo.role !== 'owner') ||
        userInfo.banned
      ) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    adminConfig.WatchRoomConfig = {
      Enabled: Enabled ?? false,
      ServerType: ServerType ?? 'internal',
      ExternalServerUrl: ExternalServerUrl?.trim() ?? '',
      // 留空表示沿用环境变量里的凭据，不把空串写死覆盖
      ExternalServerAuth:
        ExternalServerAuth?.trim() ||
        adminConfig.WatchRoomConfig?.ExternalServerAuth ||
        '',
    };

    await db.saveAdminConfig(adminConfig);
    await setCachedConfig(adminConfig);

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('更新观影室配置失败:', error);
    return NextResponse.json(
      {
        error: '更新观影室配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
