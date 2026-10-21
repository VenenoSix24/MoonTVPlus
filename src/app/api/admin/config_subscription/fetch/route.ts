/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // 权限检查：仅站长可以拉取配置订阅
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 只比 USERNAME 会把 owner 账号挡在门外：Windows 上 USERNAME 就是系统账户名，
    // 站长用别的名字登录时永远对不上。补一条角色判定，和 /api/admin/config 一致。
    if (authInfo.username !== process.env.USERNAME) {
      const { db } = await import('@/lib/db');
      const userInfoV2 = await db.getUserInfoV2(authInfo.username);
      if (
        !userInfoV2 ||
        (userInfoV2.role !== 'admin' && userInfoV2.role !== 'owner') ||
        userInfoV2.banned
      ) {
        return NextResponse.json(
          { error: '权限不足，只有站长可以拉取配置订阅' },
          { status: 401 }
        );
      }
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
    }

    // 直接 fetch URL 获取配置内容
    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: `请求失败: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const configContent = await response.text();

    // 对 configContent 进行 base58 解码
    let decodedContent;
    try {
      const bs58 = (await import('bs58')).default;
      const decodedBytes = bs58.decode(configContent);
      decodedContent = new TextDecoder().decode(decodedBytes);
    } catch (decodeError) {
      console.warn('Base58 解码失败', decodeError);
      throw decodeError;
    }

    return NextResponse.json({
      success: true,
      configContent: decodedContent,
      message: '配置拉取成功'
    });

  } catch (error) {
    console.error('拉取配置失败:', error);
    return NextResponse.json(
      { error: '拉取配置失败' },
      { status: 500 }
    );
  }
}
