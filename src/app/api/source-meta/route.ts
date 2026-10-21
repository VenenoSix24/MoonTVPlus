/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getSourceMetaRegistry } from '@/lib/source-meta';

export const runtime = 'nodejs';

// 这个接口每次都读存储，不能被构建期静态化成空结果
export const dynamic = 'force-dynamic';

/**
 * 换源卡片要显示备注和置顶标记，所以读接口不做管理员限制 ——
 * 能看到换源列表的人，本来就看得到这些源。
 */
export async function GET() {
  const registry = await getSourceMetaRegistry();
  return NextResponse.json(
    { items: registry },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
