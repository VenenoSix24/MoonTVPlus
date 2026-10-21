/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { LayoutGrid, X } from 'lucide-react';
import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { buildToolEntries } from '@/lib/more-entries';
import type { MoreEntry } from '@/lib/more-entries';

import AIChatPanel from './AIChatPanel';
import DirectPlayDialog from './DirectPlayDialog';

/**
 * 首页 Hero 下方原来那排彩色图标（直链播放 / 音乐 / 漫画 / 电子书 / 源站寻片 /
 * AI 问片）收进这里的「更多」面板。
 *
 * 为什么不塞进导航：桌面 TopNav 最多能长到 10 项，横向已满；手机底部导航每格写死
 * 20vw + 横向滚动，多出来的项会被推到屏外，变成谁也发现不了的盲区。
 *
 * 落点：桌面在 TopNav 右侧图标区，手机在 MobileHeader 搜索按钮右边 —— 右侧那一组
 * 加了第三个按钮会压住居中的站名（实测 390px 下站名占 123→266，三按钮起点会到 238）。
 *
 * 弹窗（直链播放 / AI 问片）由 Provider 统一挂一次，两个触发器共用，避免双份 DOM。
 */

interface MoreMenuActions {
  openDirectPlay: () => void;
  openAI: () => void;
}

const MoreMenuContext = createContext<MoreMenuActions | null>(null);


/** 给 /more 页面用：拿到直链播放 / AI 问片这两个弹窗的开关 */
export const useMoreMenuActions = () => useContext(MoreMenuContext);
export const MoreMenuProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [directPlayOpen, setDirectPlayOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiWelcome, setAiWelcome] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const config = (window as any).RUNTIME_CONFIG;
    setAiEnabled(!!(config?.AI_ENABLED && config?.AI_ENABLE_HOMEPAGE_ENTRY));
    setAiWelcome(config?.AI_DEFAULT_MESSAGE_NO_VIDEO);
  }, []);

  const value = useMemo<MoreMenuActions>(
    () => ({
      openDirectPlay: () => setDirectPlayOpen(true),
      openAI: () => setAiOpen(true),
    }),
    []
  );

  return (
    <MoreMenuContext.Provider value={value}>
      {children}
      <DirectPlayDialog
        isOpen={directPlayOpen}
        onClose={() => setDirectPlayOpen(false)}
      />
      {aiEnabled && (
        <AIChatPanel
          isOpen={aiOpen}
          onClose={() => setAiOpen(false)}
          welcomeMessage={aiWelcome}
        />
      )}
    </MoreMenuContext.Provider>
  );
};


const MoreMenuTrigger = ({ variant }: { variant: 'desktop' | 'mobile' }) => {
  const actions = useContext(MoreMenuContext);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MoreEntry[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 桌面下拉和手机 /more 共用同一份工具表，条件只写在 lib 里一处
    setItems(buildToolEntries((window as any).RUNTIME_CONFIG));
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // 桌面端是下拉，点外面要收起；手机端是全屏遮罩，点遮罩收
  useEffect(() => {
    if (!open || variant !== 'desktop') return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, variant, close]);

  const run = (item: MoreEntry) => {
    close();
    if (item.action === 'direct-play') actions?.openDirectPlay();
    if (item.action === 'ai') actions?.openAI();
  };

  const grid = (
    <div className='mtv-more-grid'>
      {items.map((item) => {
        const Icon = item.icon;
        const inner = (
          <>
            <span className='mtv-more-item-ic'>
              <Icon size={18} />
            </span>
            <span className='mtv-more-item-t'>{item.label}</span>
          </>
        );
        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            className='mtv-more-item'
            onClick={close}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={item.key}
            type='button'
            className='mtv-more-item'
            onClick={() => run(item)}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <div className='mtv-more-anchor' ref={rootRef}>
        <button
          type='button'
          className={
            variant === 'desktop'
              ? 'mtv-topnav-icon'
              : 'w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-700/50 transition-colors'
          }
          aria-label='更多入口'
          aria-haspopup='true'
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <LayoutGrid size={20} />
        </button>

        {open && variant === 'desktop' && (
          <div className='mtv-more-panel'>{grid}</div>
        )}
      </div>

      {open &&
        variant === 'mobile' &&
        mounted &&
        createPortal(
          <div className='mtv-more-sheet-scrim' onClick={close}>
            <div
              className='mtv-more-sheet'
              onClick={(event) => event.stopPropagation()}
            >
              <div className='mtv-more-sheet-head'>
                <span className='mtv-more-sheet-title'>更多入口</span>
                <button
                  type='button'
                  className='mtv-more-sheet-close'
                  onClick={close}
                  aria-label='关闭'
                >
                  <X size={17} />
                </button>
              </div>
              {grid}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default MoreMenuTrigger;
