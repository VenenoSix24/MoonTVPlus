/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Blend,
  BookMarked,
  BookOpen,
  Bot,
  Clover,
  Container,
  Globe,
  Link2,
  ListVideo,
  Music,
  Star,
  TvMinimalPlay,
  Users,
} from 'lucide-react';

/**
 * 「更多」这一层要放的东西，桌面下拉面板和手机 /more 页面共用同一份。
 *
 * 分成两类：
 * - 工具：桌面的「更多」下拉里就这些（直链播放 / 音乐 / 漫画 / 电子书 / 源站寻片 / AI）
 * - 频道：手机底栏固定成五格之后，综艺、直播、影库这些挤不进底栏，全部收到 /more；
 *   桌面不给「更多」面板塞频道，那一排本来就在 TopNav 上。
 *
 * 两端的显示条件必须一致，否则同一个人会在桌面看到一个、在手机看不到，所以条件
 * 只写在这里一份。
 */

export type MoreEntryIcon = typeof Blend;

export interface MoreEntry {
  key: string;
  label: string;
  icon: MoreEntryIcon;
  href?: string;
  action?: 'direct-play' | 'ai';
}

type RuntimeConfig = Record<string, any>;

/** 工具类：桌面下拉面板 + /more 的「工具」分组 */
export const buildToolEntries = (config: RuntimeConfig): MoreEntry[] => {
  const list: MoreEntry[] = [
    {
      key: 'direct-play',
      label: '直链播放',
      icon: Link2,
      action: 'direct-play',
    },
  ];

  if (config?.MUSIC_ENABLED) {
    list.push({ key: 'music', label: '音乐视听', icon: Music, href: '/music' });
  }
  if (config?.SUWAYOMI_ENABLED) {
    list.push({
      key: 'manga',
      label: '漫画展馆',
      icon: BookOpen,
      href: '/manga',
    });
  }
  if (config?.BOOKS_ENABLED) {
    list.push({
      key: 'books',
      label: '电子书馆',
      icon: BookMarked,
      href: '/books',
    });
  }
  if (config?.ENABLE_SOURCE_SEARCH !== false) {
    list.push({
      key: 'source-search',
      label: '源站寻片',
      icon: ListVideo,
      href: '/source-search',
    });
  }
  if (config?.AI_ENABLED && config?.AI_ENABLE_HOMEPAGE_ENTRY) {
    list.push({ key: 'ai', label: 'AI 问片', icon: Bot, action: 'ai' });
  }

  return list;
};

/**
 * 频道类：只在 /more 出现。
 *
 * `watchRoomEnabled` 不是配置项 —— 它来自 WatchRoomProvider 的运行时探测（服务端
 * 观影室是否可达），所以由调用方传进来。
 */
export const buildChannelEntries = (
  config: RuntimeConfig,
  watchRoomEnabled: boolean
): MoreEntry[] => {
  const list: MoreEntry[] = [
    { key: 'show', label: '综艺', icon: Clover, href: '/douban?type=show' },
  ];

  if (config?.LIVE_ENABLED) {
    list.push({
      key: 'live',
      label: '电视直播',
      icon: TvMinimalPlay,
      href: '/live',
    });
  }
  if (config?.WEB_LIVE_ENABLED) {
    list.push({
      key: 'web-live',
      label: '网络直播',
      icon: Globe,
      href: '/web-live',
    });
  }
  if (config?.PRIVATE_LIBRARY_ENABLED) {
    list.push({
      key: 'private-library',
      label: '私人影库',
      icon: Container,
      href: '/private-library',
    });
  }
  if (config?.ADVANCED_RECOMMENDATION_ENABLED) {
    list.push({
      key: 'advanced-recommendation',
      label: '高级推荐',
      icon: Blend,
      href: '/advanced-recommendation',
    });
  }
  if (watchRoomEnabled) {
    list.push({ key: 'watch-room', label: '观影室', icon: Users, href: '/watch-room' });
  }
  if (config?.CUSTOM_CATEGORIES?.length > 0) {
    list.push({
      key: 'custom',
      label: '自定义分类',
      icon: Star,
      href: '/douban?type=custom',
    });
  }

  return list;
};
