import { Radio, X } from 'lucide-react';
import Image from 'next/image';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ActionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: (e?: React.MouseEvent) => void | Promise<void>;
  color?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
}

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  actions: ActionItem[];
  poster?: string;
  sources?: string[]; // 播放源信息
  isAggregate?: boolean; // 是否为聚合内容
  sourceName?: string; // 播放源名称
  directLinkUrl?: string; // 直链播放完整链接
  currentEpisode?: number; // 当前集数
  totalEpisodes?: number; // 总集数
  origin?: 'vod' | 'live';
  onPosterClick?: () => void; // 海报点击回调
  description?: string; // 标题下方描述文案
}

const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  isOpen,
  onClose,
  title,
  actions,
  poster,
  sources,
  isAggregate,
  sourceName,
  directLinkUrl,
  currentEpisode,
  totalEpisodes,
  origin = 'vod',
  onPosterClick,
  description = '选择操作',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const backdropPressStarted = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const actionsListRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 操作区可滚动：有可用播放源最多显示 4 项，否则最多 6 项
  const hasPlaySources = Boolean(isAggregate && sources && sources.length > 0);
  // 单项 py-4(2rem) + 内容 h-6(1.5rem) = 3.5rem
  const actionsMaxVisible = hasPlaySources ? 4 : 6;
  const actionsMaxHeight = `calc(3.5rem * ${actionsMaxVisible})`;

  // 确保组件在客户端挂载后才渲染 Portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // 控制动画状态
  useEffect(() => {
    let animationId: number;
    let timer: NodeJS.Timeout;

    if (isOpen) {
      backdropPressStarted.current = false;
      setIsVisible(true);
      // 使用双重 requestAnimationFrame 确保DOM完全渲染
      animationId = requestAnimationFrame(() => {
        animationId = requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      backdropPressStarted.current = false;
      setIsAnimating(false);
      // 等待动画完成后隐藏组件
      timer = setTimeout(() => {
        setIsVisible(false);
      }, 200);
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isOpen]);

  // 弹层打开期间不让背景跟着滚。
  // 以前是 body position:fixed + top:-scrollY 那套：装成 PWA（standalone）之后
  // body 会被夹成布局视口高度，整页内容往上顶一截，底部还露出一条画布底色 ——
  // 就是那个「页面往上移、最下面多出一块纯色」的鬼影。
  // 现在只在弹层自己身上拦非 passive 的 touchmove：页面一点都不搬，自然没有位移。
  // React 的 onTouchMove 是 passive 的，preventDefault 拦不住，所以手动挂监听。
  useEffect(() => {
    if (!isVisible || !mounted) return;
    const root = rootRef.current;
    if (!root) return;

    const blockScroll = (e: TouchEvent) => {
      const target = e.target as Element | null;
      // 弹层内部自己可滚的区域放行（操作项过多时）
      if (target && target.closest('[data-mtv-sheet-scroll]')) return;
      if (e.cancelable) e.preventDefault();
    };

    root.addEventListener('touchmove', blockScroll, { passive: false });
    return () => root.removeEventListener('touchmove', blockScroll);
  }, [isVisible, mounted]);

  useEffect(() => {
    const element = titleRef.current;
    if (!element || !isVisible) {
      setIsTitleOverflowing(false);
      return;
    }

    const checkOverflow = () => {
      setIsTitleOverflowing(element.scrollWidth > element.clientWidth + 1);
    };

    checkOverflow();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', checkOverflow);
      return () => window.removeEventListener('resize', checkOverflow);
    }

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isVisible, title]);

  // 操作列表：用非 passive 的 wheel 监听，保证鼠标滚轮可滚动且不穿透到背景
  useEffect(() => {
    if (!isVisible) return;
    const el = actionsListRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) {
        e.preventDefault();
        return;
      }
      const maxScrollTop = scrollHeight - clientHeight;
      const next = Math.min(maxScrollTop, Math.max(0, scrollTop + e.deltaY));
      if (next !== scrollTop) {
        el.scrollTop = next;
      }
      e.preventDefault();
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isVisible, actionsMaxVisible]);

  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isVisible, onClose]);

  if (!isVisible || !mounted) return null;

  const getActionColor = (color: ActionItem['color']) => {
    switch (color) {
      case 'danger':
        return 'text-ui-danger';
      case 'primary':
        return 'text-ui-accent';
      default:
        return 'text-ui-ink-2';
    }
  };

  const getActionHoverColor = (color: ActionItem['color']) => {
    switch (color) {
      case 'danger':
        return 'hover:bg-ui-danger-soft';
      case 'primary':
        return 'hover:bg-ui-accent-soft';
      default:
        return 'hover:bg-ui-surface-hover';
    }
  };

  const armBackdropClose = () => {
    backdropPressStarted.current = true;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 菜单打开前那次长按的松手会产生一个“悬空 click”，
    // 这次 click 并不是从遮罩开始按下的，所以不能拿来关闭菜单。
    if (!backdropPressStarted.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    backdropPressStarted.current = false;
    onClose();
  };

  const content = (
    <div
      ref={rootRef}
      className='fixed inset-0 z-[9999] flex items-end justify-center'
      style={{
        // 根层禁用触摸手势，背景就滚不动；内部可滚区域自己把 touch-action 放回 pan-y
        touchAction: 'none',
      }}
    >
      {/* 背景遮罩 */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onPointerDown={armBackdropClose}
        onTouchStart={armBackdropClose}
        onClick={handleBackdropClick}
        onTouchMove={(e) => {
          // 只阻止滚动，允许其他触摸事件（包括点击）
          e.preventDefault();
        }}
        onWheel={(e) => {
          // 阻止滚轮滚动
          e.preventDefault();
        }}
        style={{
          backdropFilter: 'blur(4px)',
          willChange: 'opacity',
          touchAction: 'none', // 禁用所有触摸操作
        }}
      />

      {/* 操作表单 */}
      <div
        className='relative w-full max-w-lg mx-3 mb-3 bg-ui-surface rounded-ui-lg shadow-ui-3 transition-all duration-200 ease-out max-h-[85vh] overflow-hidden flex flex-col'
        onTouchMove={(e) => {
          // 允许操作表单内部滚动，阻止事件冒泡到外层
          e.stopPropagation();
        }}
        style={{
          marginBottom: 'calc(1rem + env(safe-area-inset-bottom))',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden', // 避免闪烁
          transform: isAnimating
            ? 'translateY(0) translateZ(0)'
            : 'translateY(100%) translateZ(0)', // 组合变换保持滑入效果和硬件加速
          opacity: isAnimating ? 1 : 0,
          touchAction: 'auto', // 允许操作表单内的正常触摸操作
        }}
      >
        {/* 抓手：手机上一眼看出这是块可以往下收的面板 */}
        <div className='flex justify-center pt-2.5 pb-0.5 sm:hidden'>
          <div className='h-1 w-9 rounded-full bg-ui-hair-strong' />
        </div>

        {/* 头部 */}
        <div className='flex items-center justify-between gap-3 px-4 py-3.5 border-b border-ui-hair shrink-0'>
          <div className='flex items-center gap-3 flex-1 min-w-0'>
            {poster && (
              <div
                className='relative w-12 h-16 rounded-ui-sm overflow-hidden bg-ui-surface-2 flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity'
                onClick={(e) => {
                  e.stopPropagation();
                  onPosterClick?.();
                }}
              >
                <Image
                  src={poster}
                  alt={title}
                  fill
                  className={origin === 'live' ? 'object-contain' : 'object-cover'}
                  loading='lazy'
                />
              </div>
            )}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2 mb-1 min-w-0'>
                <div className='relative min-w-0 flex-1 group/title'>
                  <h3
                    ref={titleRef}
                    className='text-lg font-semibold text-ui-ink truncate'
                  >
                    {title}
                  </h3>
                  {isTitleOverflowing && (
                    <div className='absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-ui-sm bg-ui-ink px-3 py-2 text-center text-sm text-ui-bg shadow-ui-2 opacity-0 invisible transition-all duration-200 ease-out whitespace-normal break-words pointer-events-none group-hover/title:opacity-100 group-hover/title:visible'>
                      {title}
                      <div className='absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-ui-ink'></div>
                    </div>
                  )}
                </div>
                {sourceName && (
                  <span className='flex-shrink-0 text-xs px-2 py-1 border border-ui-hair-strong rounded-ui-sm text-ui-ink-2 bg-ui-surface-2'>
                    {origin === 'live' && (
                      <Radio size={12} className='inline-block text-ui-ink-3 mr-1.5' />
                    )}
                    {sourceName}
                  </span>
                )}
              </div>
              {directLinkUrl && (
                <p className='mb-2 text-xs text-ui-ink-3 break-all'>
                  {directLinkUrl}
                </p>
              )}
              <p className='text-sm text-ui-ink-2'>{description}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label='关闭'
            className='shrink-0 p-2 rounded-full hover:bg-ui-surface-hover active:bg-ui-surface-3 transition-colors duration-150'
          >
            <X size={20} className='text-ui-ink-2' />
          </button>
        </div>

        {/* 操作列表：有源最多 4 项 / 无源最多 6 项，超出可滑动（支持触控与鼠标滚轮） */}
        <div className='px-3 py-1.5 min-h-0'>
          <div
            ref={actionsListRef}
            data-mtv-sheet-scroll
            className='overflow-y-auto overscroll-contain'
            style={{
              maxHeight: actionsMaxHeight,
              WebkitOverflowScrolling: 'touch',
              // 根层把 touch-action 关了，这里显式放回纵向手势，列表才滚得动
              touchAction: 'pan-y',
            }}
          >
            {actions.map((action, index) => (
              <div key={action.id}>
                <button
                  onClick={() => {
                    action.onClick();
                    onClose();
                  }}
                  disabled={action.disabled}
                  className={`
                    w-full flex items-center gap-4 py-3.5 px-3 rounded-ui-sm transition-all duration-150 ease-out
                    ${
                      action.disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : `${getActionHoverColor(action.color)} active:scale-[0.98]`
                    }
                  `}
                  style={{ willChange: 'transform, background-color' }}
                >
                  {/* 图标 - 使用线条风格 */}
                  <div className='w-6 h-6 flex items-center justify-center flex-shrink-0'>
                    <span
                      className={`transition-colors duration-150 ${
                        action.disabled
                          ? 'text-ui-ink-3'
                          : getActionColor(action.color)
                      }`}
                    >
                      {action.icon}
                    </span>
                  </div>

                  {/* 文字 */}
                  <span
                    className={`
                    text-left font-medium text-base flex-1
                    ${action.disabled ? 'text-ui-ink-3' : 'text-ui-ink'}
                  `}
                  >
                    {action.label}
                  </span>

                  {/* 播放进度 - 只在播放按钮且有播放记录时显示 */}
                  {action.id === 'play' && currentEpisode && totalEpisodes && (
                    <span className='text-sm text-ui-ink-3 font-medium tabular-nums'>
                      {currentEpisode}/{totalEpisodes}
                    </span>
                  )}
                </button>

                {/* 分割线 - 最后一项不显示 */}
                {index < actions.length - 1 && (
                  <div className='border-b border-ui-hair ml-12'></div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 播放源信息展示区域 */}
        {isAggregate && sources && sources.length > 0 && (
          <div className='px-4 py-3 border-t border-ui-hair shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'>
            {/* 标题区域 */}
            <div className='mb-2.5'>
              <h4 className='text-sm font-medium text-ui-ink mb-1'>
                可用播放源
              </h4>
              <p className='text-xs text-ui-ink-3'>
                共 {sources.length} 个播放源
              </p>
            </div>

            {/* 播放源列表 */}
            <div
              data-mtv-sheet-scroll
              className='max-h-32 overflow-y-auto'
              style={{ touchAction: 'pan-y' }}
            >
              <div className='grid grid-cols-2 gap-2'>
                {sources.map((source, index) => (
                  <div
                    key={index}
                    className='flex items-center gap-2 py-2 px-3 rounded-ui-sm border border-ui-hair bg-ui-surface-2'
                  >
                    <div className='w-1 h-1 bg-ui-ink-3 rounded-full flex-shrink-0' />
                    <span className='text-xs text-ui-ink-2 truncate'>
                      {source}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // 使用 Portal 将组件渲染到 document.body
  return createPortal(content, document.body);
};

export default MobileActionSheet;
