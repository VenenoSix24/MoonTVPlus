/**
 * 视频源标识的编解码。
 *
 * 脚本源的搜索结果不是裸的脚本 key，而是 `script:<脚本 key>:<内部源 id>` ——
 * 同一个脚本可以吐多条线路（hls / raw / …），每条要能独立播放，所以靠后半段
 * 区分。但「源的备注 / 置顶」是按脚本整体配的，得先折回脚本 key 才查得到。
 *
 * 这个文件只放纯函数，不引任何服务端依赖：前端要按同一套规则解析，格式定义在
 * 这里只此一份，以后改前缀或改分隔符不会出现两边对不上的情况。
 */

export const SCRIPT_SOURCE_PREFIX = 'script:';

export function buildScriptSourceValue(scriptKey: string, sourceId?: string) {
  return `${SCRIPT_SOURCE_PREFIX}${scriptKey}:${sourceId || 'default'}`;
}

export function parseScriptSourceValue(source: string) {
  if (!source.startsWith(SCRIPT_SOURCE_PREFIX)) {
    return null;
  }

  const rest = source.slice(SCRIPT_SOURCE_PREFIX.length);
  const separatorIndex = rest.indexOf(':');
  if (separatorIndex === -1) {
    return {
      scriptKey: rest,
      sourceId: 'default',
    };
  }

  return {
    scriptKey: rest.slice(0, separatorIndex),
    sourceId: rest.slice(separatorIndex + 1) || 'default',
  };
}

/**
 * 折叠成「源」的标识：脚本源取脚本 key，其余源原样返回。
 * 备注 / 置顶就是按这个 key 存的。
 */
export function resolveSourceKey(rawSource?: string): string {
  const value = String(rawSource || '');
  const parsed = parseScriptSourceValue(value);
  return parsed ? parsed.scriptKey : value;
}
