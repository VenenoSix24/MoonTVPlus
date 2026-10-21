import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  clearSourceMetaBatch,
  getSourceMetaRegistry,
  setSourceMetaBatch,
} from '@/lib/source-meta';

export const runtime = 'nodejs';

async function assertAdmin(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    throw new Error('不支持本地存储进行管理员配置');
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) return null;

  if (authInfo.username === process.env.USERNAME) return authInfo.username;

  const userInfoV2 = await db.getUserInfoV2(authInfo.username);
  if (
    !userInfoV2 ||
    (userInfoV2.role !== 'admin' && userInfoV2.role !== 'owner') ||
    userInfoV2.banned
  ) {
    return null;
  }

  return authInfo.username;
}

export async function GET(request: NextRequest) {
  try {
    const username = await assertAdmin(request);
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { items: await getSourceMetaRegistry() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取失败' },
      { status: 500 }
    );
  }
}

/**
 * action:
 *   set    —— 给 keys 写备注 / 置顶，只改传进来的字段
 *   clear  —— 删掉 keys 的备注和置顶
 */
export async function POST(request: NextRequest) {
  try {
    const username = await assertAdmin(request);
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: 'set' | 'clear';
      keys?: unknown;
      remark?: unknown;
      pinned?: unknown;
    };

    const keys = Array.isArray(body.keys)
      ? body.keys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];
    if (keys.length === 0) {
      return NextResponse.json({ error: '请提供源 Key' }, { status: 400 });
    }

    if (body.action === 'clear') {
      return NextResponse.json({ items: await clearSourceMetaBatch(keys) });
    }

    const patch: { remark?: string; pinned?: boolean } = {};
    if (body.remark !== undefined) {
      patch.remark = typeof body.remark === 'string' ? body.remark : '';
    }
    if (body.pinned !== undefined) {
      patch.pinned = body.pinned === true;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '没有要保存的内容' }, { status: 400 });
    }

    return NextResponse.json({ items: await setSourceMetaBatch(keys, patch) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '保存失败' },
      { status: 500 }
    );
  }
}
