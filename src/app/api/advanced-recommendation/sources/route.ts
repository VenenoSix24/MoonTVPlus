import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { listRecommendableSourceScripts } from '@/lib/source-script';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scripts = await listRecommendableSourceScripts();

    return NextResponse.json({
      sources: scripts.map((item) => ({
        key: item.key,
        name: item.name,
        description: item.description,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取高级推荐脚本失败' },
      { status: 500 }
    );
  }
}
