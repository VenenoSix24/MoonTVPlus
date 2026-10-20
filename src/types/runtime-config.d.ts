/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 服务端在 src/app/layout.tsx 里把运行时配置序列化进 window.RUNTIME_CONFIG。
 * 这里给出全局声明，供客户端组件直接读取。
 */
declare global {
  interface Window {
    RUNTIME_CONFIG?: {
      EnableComments?: boolean;
      RecommendationDataSource?: string;
      HOME_MODULES?: { id: string; enabled: boolean; order: number }[] | null;
      HOME_CONTINUE_WATCHING?: boolean | null;
      [key: string]: any;
    };
  }
}

export {};
