/**
 * 视频源的附加信息：备注和置顶。
 *
 * 单独存一份 key → entry 的映射，而不是往 SourceConfig 每条源上挂字段 ——
 * 脚本源不在 SourceConfig 里，两套源共用同一份 key 空间才不会出现「api 源能
 * 写备注、脚本源写不了」。
 */

import { db } from '@/lib/db';

export interface SourceMetaEntry {
  /** 备注：站长自己看的说明，展示在换源卡片上 */
  remark?: string;
  /** 置顶：换源列表里永远排最前，测速成功失败都不影响位置 */
  pinned?: boolean;
}

export type SourceMetaRegistry = Record<string, SourceMetaEntry>;

const SOURCE_META_KEY = 'source-meta:registry';
const CACHE_TTL_MS = 30 * 1000;
export const SOURCE_REMARK_MAX_LENGTH = 120;

let _cache: { data: SourceMetaRegistry; ts: number } | null = null;

/** 去掉空值、削掉超长备注，只留下真正有内容的条目 */
function sanitize(registry: SourceMetaRegistry): SourceMetaRegistry {
  const next: SourceMetaRegistry = {};
  Object.keys(registry).forEach((key) => {
    const entry = registry[key];
    if (!entry || typeof entry !== 'object') return;
    const remark =
      typeof entry.remark === 'string'
        ? entry.remark.trim().slice(0, SOURCE_REMARK_MAX_LENGTH)
        : '';
    const pinned = entry.pinned === true;
    if (!remark && !pinned) return;
    next[key] = {
      ...(remark ? { remark } : {}),
      ...(pinned ? { pinned } : {}),
    };
  });
  return next;
}

export async function getSourceMetaRegistry(): Promise<SourceMetaRegistry> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return _cache.data;
  }

  let raw: string | null = null;
  try {
    raw = await db.getGlobalValue(SOURCE_META_KEY);
  } catch {
    raw = null;
  }

  if (!raw) {
    _cache = { data: {}, ts: Date.now() };
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    const data =
      parsed && typeof parsed === 'object'
        ? sanitize(parsed as SourceMetaRegistry)
        : {};
    _cache = { data, ts: Date.now() };
    return data;
  } catch {
    _cache = { data: {}, ts: Date.now() };
    return {};
  }
}

/** 按 key 合并写入；patch 里没出现的字段保持原值 */
export async function setSourceMetaBatch(
  keys: string[],
  patch: SourceMetaEntry
): Promise<SourceMetaRegistry> {
  const registry = await getSourceMetaRegistry();
  const next: SourceMetaRegistry = { ...registry };

  keys.forEach((key) => {
    if (!key) return;
    const current = next[key] || {};
    next[key] = {
      remark: patch.remark === undefined ? current.remark : patch.remark,
      pinned: patch.pinned === undefined ? current.pinned : patch.pinned,
    };
  });

  const sanitized = sanitize(next);
  _cache = { data: sanitized, ts: Date.now() };
  await db.setGlobalValue(SOURCE_META_KEY, JSON.stringify(sanitized));
  return sanitized;
}

/** 删除某个源的所有附加信息（源被删掉时顺手清理） */
export async function clearSourceMetaBatch(
  keys: string[]
): Promise<SourceMetaRegistry> {
  const registry = await getSourceMetaRegistry();
  const next: SourceMetaRegistry = { ...registry };
  let changed = false;
  keys.forEach((key) => {
    if (next[key]) {
      delete next[key];
      changed = true;
    }
  });
  if (!changed) return registry;

  _cache = { data: next, ts: Date.now() };
  await db.setGlobalValue(SOURCE_META_KEY, JSON.stringify(next));
  return next;
}
