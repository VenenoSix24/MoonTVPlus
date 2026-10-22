/**
 * 冷启动重试：TMDB / 豆瓣代理这些接口在容器刚起来、或者上游偶尔抽风时会失败，
 * 用户刷新一次又好了 —— 观感就是「有的海报 / 简介没加载出来」。
 * 统一在这里多打一次，别在每个调用点各写一遍。
 *
 * 只对网络错误和 5xx 重试：4xx 是请求本身的问题，再打一次结果一样。
 * 请求方主动 abort（切页面、换条目）时立刻放弃，不再重发。
 */
export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  { attempts = 2, delayMs = 600 }: { attempts?: number; delayMs?: number } = {}
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const response = await fetch(input, init);
      const retryable = response.status >= 500 || response.status === 429;
      if (!retryable || attempt === attempts) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('请求失败');
}
