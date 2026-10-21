/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

/**
 * 后台扫描任务管理
 */

export interface ScanTask {
  id: string;
  status: 'running' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    currentFolder?: string;
  };
  result?: {
    total: number;
    new: number;
    existing: number;
    errors: number;
  };
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * 扫描任务表钉在 globalThis 上，而不是模块作用域。
 *
 * Next.js 按需编译路由会重建该路由依赖的模块实例（dev 下首次访问某条路由、
 * 或任意一次重编译）。任务是在 /api/openlist/refresh 里创建的，而
 * /api/openlist/scan-progress 第一次被轮询时才编译 —— 那一刻模块作用域的 Map
 * 已经是新的，任务留在旧实例里，进度接口就一直 404。
 * 表现：点「立即扫描」弹「获取进度失败」，但扫描其实在正常跑、也扫出了结果。
 *
 * 仓库里 qr-login/store.ts、login-fail2ban.ts 用的是同一套 globalThis 约定。
 */
type GlobalWithScanTasks = typeof globalThis & {
  __moonTvScanTasks?: Map<string, ScanTask>;
};

const g = globalThis as GlobalWithScanTasks;
const tasks = g.__moonTvScanTasks || new Map<string, ScanTask>();
g.__moonTvScanTasks = tasks;

export function createScanTask(): string {
  const id = `scan_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const task: ScanTask = {
    id,
    status: 'running',
    progress: {
      current: 0,
      total: 0,
    },
    startTime: Date.now(),
  };
  tasks.set(id, task);
  return id;
}

export function getScanTask(id: string): ScanTask | null {
  return tasks.get(id) || null;
}

export function updateScanTaskProgress(
  id: string,
  current: number,
  total: number,
  currentFolder?: string
): void {
  let task = tasks.get(id);
  if (!task) {
    // 如果任务不存在（可能因为模块重新加载），重新创建任务
    console.warn(`[ScanTask] 任务 ${id} 不存在，重新创建`);
    task = {
      id,
      status: 'running',
      progress: {
        current: 0,
        total: 0,
      },
      startTime: Date.now(),
    };
    tasks.set(id, task);
  }
  task.progress = { current, total, currentFolder };
}

export function completeScanTask(
  id: string,
  result: ScanTask['result']
): void {
  let task = tasks.get(id);
  if (!task) {
    // 如果任务不存在（可能因为模块重新加载），重新创建任务
    console.warn(`[ScanTask] 任务 ${id} 不存在，重新创建并标记为完成`);
    task = {
      id,
      status: 'completed',
      progress: {
        current: result?.total || 0,
        total: result?.total || 0,
      },
      startTime: Date.now() - 60000, // 假设任务运行了1分钟
      endTime: Date.now(),
      result,
    };
    tasks.set(id, task);
    return;
  }
  task.status = 'completed';
  task.result = result;
  task.endTime = Date.now();
}

export function failScanTask(id: string, error: string): void {
  let task = tasks.get(id);
  if (!task) {
    // 如果任务不存在（可能因为模块重新加载），重新创建任务
    console.warn(`[ScanTask] 任务 ${id} 不存在，重新创建并标记为失败`);
    task = {
      id,
      status: 'failed',
      progress: {
        current: 0,
        total: 0,
      },
      startTime: Date.now() - 60000, // 假设任务运行了1分钟
      endTime: Date.now(),
      error,
    };
    tasks.set(id, task);
    return;
  }
  task.status = 'failed';
  task.error = error;
  task.endTime = Date.now();
}

export function cleanupOldTasks(): void {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1小时

  for (const [id, task] of Array.from(tasks.entries())) {
    if (task.endTime && now - task.endTime > maxAge) {
      tasks.delete(id);
    }
  }
}
