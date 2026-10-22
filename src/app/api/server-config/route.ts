/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // 禁用缓存

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  const isLiteMode = process.env.MOONTV_LITE === 'true';
  const isLocalStorage = storageType === 'localstorage';

  // 先读一次配置：观影室开关现在存在后台配置里（管理面板可改），不再是纯环境变量。
  const config = isLocalStorage ? null : await getConfig();

  // Lite 镜像不暴露内置观影室能力，避免前端尝试连接本地 Socket.IO 服务
  // 注意：不要暴露 externalServerAuth 到前端，这是敏感凭据
  const watchRoomEnabledInDb = config?.WatchRoomConfig?.Enabled === true;
  const watchRoomConfig = isLiteMode
    ? {
        enabled: false,
        serverType: 'external' as const,
        externalServerUrl: undefined,
      }
    : {
        // 后台开关与环境变量取 OR：老部署靠 WATCH_ROOM_ENABLED=true 起的实例
        // 不会因为后台默认值 false 而被关掉。
        enabled:
          watchRoomEnabledInDb || process.env.WATCH_ROOM_ENABLED === 'true',
        serverType:
          config?.WatchRoomConfig?.ServerType ||
          (process.env.WATCH_ROOM_SERVER_TYPE as 'internal' | 'external') ||
          'internal',
        externalServerUrl:
          config?.WatchRoomConfig?.ExternalServerUrl ||
          process.env.WATCH_ROOM_EXTERNAL_SERVER_URL,
      };

  // 如果使用 localStorage，返回默认配置
  if (isLocalStorage) {
    return NextResponse.json({
      SiteName: process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTVPlus',
      StorageType: 'localstorage',
      Version: CURRENT_VERSION,
      TVModeEnabled: process.env.ENABLE_TV_MODE !== 'false',
      WatchRoom: watchRoomConfig,
      EnableOfflineDownload: process.env.NEXT_PUBLIC_ENABLE_OFFLINE_DOWNLOAD === 'true',
      DanmakuAutoLoadDefault: true,
      EnableTelegramLogin: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_LOGIN_ENABLED !== 'false'),
      TelegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    });
  }

  // 非 localStorage 模式，配置已经在上面的 getConfig() 里读过
  const result = {
    SiteName: config!.SiteConfig.SiteName,
    StorageType: storageType,
    Version: CURRENT_VERSION,
    TVModeEnabled: process.env.ENABLE_TV_MODE !== 'false',
    WatchRoom: watchRoomConfig,
    EnableOfflineDownload: process.env.NEXT_PUBLIC_ENABLE_OFFLINE_DOWNLOAD === 'true',
    EnableRegistration: config!.SiteConfig.EnableRegistration || false,
    RequireRegistrationInviteCode: config!.SiteConfig.RequireRegistrationInviteCode || false,
    RegistrationRequireTurnstile: config!.SiteConfig.RegistrationRequireTurnstile || false,
    LoginRequireTurnstile: config!.SiteConfig.LoginRequireTurnstile || false,
    TurnstileSiteKey: config!.SiteConfig.TurnstileSiteKey || '',
    EnableOIDCLogin: config!.SiteConfig.EnableOIDCLogin || false,
    EnableOIDCRegistration: config!.SiteConfig.EnableOIDCRegistration || false,
    OIDCButtonText: config!.SiteConfig.OIDCButtonText || '',
    EnableTelegramLogin: Boolean(
      config!.TelegramConfig?.enabled &&
      config!.TelegramConfig?.loginEnabled &&
      (config!.TelegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN) &&
      (config!.TelegramConfig?.botUsername || process.env.TELEGRAM_BOT_USERNAME)
    ),
    TelegramBotUsername: config!.TelegramConfig?.botUsername || process.env.TELEGRAM_BOT_USERNAME || '',
    DanmakuAutoLoadDefault: config!.SiteConfig.DanmakuAutoLoadDefault !== false,
    loginBackgroundImage: config!.ThemeConfig?.loginBackgroundImage || '',
    registerBackgroundImage: config!.ThemeConfig?.registerBackgroundImage || '',
    homeBackgroundImage: config!.ThemeConfig?.homeBackgroundImage || '',
    progressThumbType: config!.ThemeConfig?.progressThumbType || 'default',
    loadingStyle: config!.ThemeConfig?.loadingStyle || 'talisman',
    rateBadgeStyle: config!.ThemeConfig?.rateBadgeStyle || 'flag',
    progressThumbPresetId: config!.ThemeConfig?.progressThumbPresetId || '',
    progressThumbCustomUrl: config!.ThemeConfig?.progressThumbCustomUrl || '',
    // AI配置（只暴露功能开关，不暴露API密钥等敏感信息）
    AIEnabled: config!.AIConfig?.Enabled || false,
    AIEnableHomepageEntry: config!.AIConfig?.EnableHomepageEntry || false,
    AIEnableVideoCardEntry: config!.AIConfig?.EnableVideoCardEntry || false,
    AIEnablePlayPageEntry: config!.AIConfig?.EnablePlayPageEntry || false,
    AIDefaultMessageNoVideo: config!.AIConfig?.DefaultMessageNoVideo || '',
    AIDefaultMessageWithVideo: config!.AIConfig?.DefaultMessageWithVideo || '',
  };
  return NextResponse.json(result);
}
