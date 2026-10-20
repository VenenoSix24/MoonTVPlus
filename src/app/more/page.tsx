/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { ChevronRight, Palette } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import {
  type MoreEntry,
  buildChannelEntries,
  buildToolEntries,
} from '@/lib/more-entries';

import { useMoreMenuActions } from '@/components/MoreMenu';
import PageLayout from '@/components/PageLayout';
import { useWatchRoomContextSafe } from '@/components/WatchRoomProvider';

const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
] as const;

/**
 * 手机底栏第 5 格落点。
 *
 * 底栏固定成五格之后，综艺 / 直播 / 网络直播 / 私人影库 / 高级推荐 / 观影室 /
 * 自定义分类都挤不进去，全部收到这里。桌面也能直接访问，所以限宽居中。
 *
 * 用真路由而不是覆盖层：手机返回键/侧滑手势要能回到上一页，覆盖层得自己接管
 * history，接管不干净就直接退出站点。
 */
const MorePage = () => {
  const actions = useMoreMenuActions();
  const watchRoom = useWatchRoomContextSafe();
  const { theme, setTheme } = useTheme();

  const [channels, setChannels] = useState<MoreEntry[]>([]);
  const [tools, setTools] = useState<MoreEntry[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const config = (window as any).RUNTIME_CONFIG;
    setChannels(buildChannelEntries(config, !!watchRoom?.isEnabled));
    setTools(buildToolEntries(config));
  }, [watchRoom?.isEnabled]);

  const themeLabel =
    THEME_OPTIONS.find((option) => option.value === theme)?.label ?? '跟随系统';

  const renderRow = (entry: MoreEntry) => {
    const Icon = entry.icon;
    const content = (
      <>
        <Icon className='mtv-mp-ic' />
        <span className='mtv-mp-row-t'>{entry.label}</span>
        <ChevronRight className='mtv-mp-chev' />
      </>
    );

    if (entry.href) {
      return (
        <Link
          key={entry.key}
          href={entry.href}
          prefetch={false}
          className='mtv-mp-row'
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={entry.key}
        type='button'
        className='mtv-mp-row'
        onClick={() => {
          if (entry.action === 'direct-play') actions?.openDirectPlay();
          if (entry.action === 'ai') actions?.openAI();
        }}
      >
        {content}
      </button>
    );
  };

  return (
    <PageLayout activePath='/more'>
      <div className='mtv-mp'>
        <h1 className='mtv-mp-h1'>更多</h1>

        {channels.length > 0 && (
          <section className='mtv-mp-group'>
            <h2 className='mtv-mp-title'>频道</h2>
            <div className='mtv-mp-list'>{channels.map(renderRow)}</div>
          </section>
        )}

        {tools.length > 0 && (
          <section className='mtv-mp-group'>
            <h2 className='mtv-mp-title'>工具</h2>
            <div className='mtv-mp-list'>{tools.map(renderRow)}</div>
          </section>
        )}

        <section className='mtv-mp-group'>
          <h2 className='mtv-mp-title'>设置</h2>
          <div className='mtv-mp-list'>
            <div className='mtv-mp-row is-static'>
              <Palette className='mtv-mp-ic' />
              <span className='mtv-mp-row-t'>外观主题</span>
              <span className='mtv-mp-row-v'>{themeLabel}</span>
            </div>
            <div className='mtv-mp-theme'>
              <div className='mtv-mp-seg'>
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type='button'
                    aria-pressed={theme === option.value}
                    onClick={() => setTheme(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
};

export default MorePage;
