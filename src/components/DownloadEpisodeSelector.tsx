/* eslint-disable @next/next/no-img-element */

import React, { useMemo,useState } from 'react';
import { createPortal } from 'react-dom';

interface DownloadEpisodeSelectorProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 总集数 */
  totalEpisodes: number;
  /** 剧集标题 */
  episodesTitles?: string[];
  /** 视频标题 */
  videoTitle: string;
  /** 当前集数索引（0开始） */
  currentEpisodeIndex: number;
  /** 下载回调 - 支持批量下载 */
  onDownload: (episodeIndexes: number[], offlineMode: boolean) => void;
  /** 是否启用离线下载功能 */
  enableOfflineDownload?: boolean;
  /** 是否有离线下载权限（管理员或站长） */
  hasOfflinePermission?: boolean;
}

/**
 * 下载选集面板组件
 */
const DownloadEpisodeSelector: React.FC<DownloadEpisodeSelectorProps> = ({
  isOpen,
  onClose,
  totalEpisodes,
  episodesTitles = [],
  videoTitle,
  currentEpisodeIndex,
  onDownload,
  enableOfflineDownload = false,
  hasOfflinePermission = false,
}) => {
  // 多选状态 - 使用 Set 存储选中的集数索引
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<number>>(
    new Set([currentEpisodeIndex])
  );

  // 离线下载模式
  const [offlineMode, setOfflineMode] = useState(false);

  // 每页显示的集数
  const episodesPerPage = 50;
  const pageCount = Math.ceil(totalEpisodes / episodesPerPage);

  // 当前分页索引（0 开始）
  const initialPage = Math.floor(currentEpisodeIndex / episodesPerPage);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  // 是否倒序显示
  const [descending, setDescending] = useState<boolean>(false);

  // 根据 descending 状态计算实际显示的分页索引
  const displayPage = useMemo(() => {
    if (descending) {
      return pageCount - 1 - currentPage;
    }
    return currentPage;
  }, [currentPage, descending, pageCount]);

  // 升序分页标签
  const categoriesAsc = useMemo(() => {
    return Array.from({ length: pageCount }, (_, i) => {
      const start = i * episodesPerPage + 1;
      const end = Math.min(start + episodesPerPage - 1, totalEpisodes);
      return { start, end };
    });
  }, [pageCount, episodesPerPage, totalEpisodes]);

  // 根据 descending 状态决定分页标签的排序和内容
  const categories = useMemo(() => {
    if (descending) {
      return [...categoriesAsc]
        .reverse()
        .map(({ start, end }) => `${end}-${start}`);
    }
    return categoriesAsc.map(({ start, end }) => `${start}-${end}`);
  }, [categoriesAsc, descending]);

  const handleCategoryClick = (index: number) => {
    if (descending) {
      setCurrentPage(pageCount - 1 - index);
    } else {
      setCurrentPage(index);
    }
  };

  const handleEpisodeClick = (episodeIndex: number) => {
    setSelectedEpisodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(episodeIndex)) {
        newSet.delete(episodeIndex);
      } else {
        newSet.add(episodeIndex);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allEpisodes = Array.from({ length: totalEpisodes }, (_, i) => i);
    setSelectedEpisodes(new Set(allEpisodes));
  };

  const handleClearAll = () => {
    setSelectedEpisodes(new Set());
  };

  // 下载前再确认一次：选集面板里点「下载」就直接把任务排进队列，误触的代价
  // 是一次实打实的下载。
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDownload = () => {
    const episodeIndexes = Array.from(selectedEpisodes).sort((a, b) => a - b);
    onDownload(episodeIndexes, offlineMode);
    onClose();
  };

  const currentStart = currentPage * episodesPerPage;
  const currentEnd = Math.min(currentStart + episodesPerPage - 1, totalEpisodes - 1);

  // document 守卫：SSR 首帧没有 body，先不渲染
  if (!isOpen || typeof document === 'undefined') return null;

  // 用 createPortal 挂到 body。弹窗是写在 PageLayout 里的，会被祖先的 stacking
  // context 关住 —— z-index 写得再大也只在这个上下文内比较，而底部导航是 fixed
  // 挂在 body 上的 z-index 100，手机上弹窗贴底就会被它盖住，按钮点不到。
  return createPortal(
    <>
      <div className='mtv-dialog-scrim'>
      <div className='mtv-dialog mtv-dl-ep'>
        {/* 标题栏 */}
        <div className='mtv-dialog-head'>
          <div className='min-w-0'>
            <h3 className='mtv-dialog-title'>选择要下载的集数</h3>
            <p className='mtv-dl-ep-sub'>{videoTitle}</p>
          </div>
          <div className='mtv-dl-ep-actions'>
            <button
              type='button'
              onClick={handleSelectAll}
              className='mtv-dl-ep-act'
            >
              全选
            </button>
            <button
              type='button'
              onClick={handleClearAll}
              className='mtv-dl-ep-act'
            >
              清空
            </button>
            <button
              type='button'
              onClick={onClose}
              className='mtv-dialog-close'
              aria-label='关闭'
            >
              <svg
                className='h-4 w-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M6 18L18 6M6 6l12 12'
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 离线下载开关 - 仅管理员和站长可见 */}
        {enableOfflineDownload && hasOfflinePermission && (
          <div className='mtv-dl-ep-offline'>
            <span className='mtv-dl-ep-offline-icon'>
              <svg
                className='h-4 w-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01'
                />
              </svg>
            </span>
            <div className='mtv-dl-ep-offline-body'>
              <div className='mtv-dl-ep-offline-title'>
                服务器离线下载
                {offlineMode && <span className='mtv-dl-ep-badge'>已启用</span>}
              </div>
              <p className='mtv-dl-ep-offline-desc'>
                开启后将在服务器端下载视频文件，支持断点续传和后台下载
              </p>
            </div>
            <button
              type='button'
              onClick={() => setOfflineMode(!offlineMode)}
              className={`mtv-dl-ep-switch${offlineMode ? ' is-on' : ''}`}
              aria-pressed={offlineMode}
              aria-label='服务器离线下载'
            />
          </div>
        )}

        {/* 分页标签 */}
        {pageCount > 1 && (
          <div className='mtv-dl-ep-pages'>
            <div className='mtv-dl-ep-pagescroll'>
              <div className='mtv-dl-ep-pagelist'>
                {categories.map((label, idx) => (
                  <button
                    key={label}
                    type='button'
                    onClick={() => handleCategoryClick(idx)}
                    className={`mtv-dl-ep-page${
                      idx === displayPage ? ' is-on' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type='button'
              className='mtv-dl-ep-sort'
              aria-label='切换排序方向'
              onClick={() => setDescending((prev) => !prev)}
            >
              <svg
                className='h-4 w-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4'
                />
              </svg>
            </button>
          </div>
        )}

        {/* 集数网格 */}
        <div className='mtv-dl-ep-grid'>
          {(() => {
            const len = currentEnd - currentStart + 1;
            const episodes = Array.from({ length: len }, (_, i) =>
              descending ? currentEnd - i : currentStart + i
            );
            return episodes;
          })().map((episodeIndex) => {
            const isSelected = selectedEpisodes.has(episodeIndex);
            const isCurrent = episodeIndex === currentEpisodeIndex;
            const episodeNumber = episodeIndex + 1;
            return (
              <button
                key={episodeIndex}
                type='button'
                onClick={() => handleEpisodeClick(episodeIndex)}
                className={`mtv-dl-ep-cell${isSelected ? ' is-on' : ''}${
                  isCurrent ? ' is-current' : ''
                }`}
              >
                {(() => {
                  const title = episodesTitles?.[episodeIndex];
                  if (!title) {
                    return episodeNumber;
                  }
                  // 如果是 OVA 格式，直接返回完整标题
                  if (title.match(/^OVA\s+\d+/i)) {
                    return title;
                  }
                  // 如果匹配"第X集"、"第X话"、"X集"、"X话"格式，提取中间的数字
                  const match = title.match(/(?:第)?(\d+)(?:集|话)/);
                  if (match) {
                    return match[1];
                  }
                  return title;
                })()}
              </button>
            );
          })}
        </div>

        {/* 底部操作栏 */}
        <div className='mtv-dl-ep-foot'>
          <div className='mtv-dl-ep-sum'>
            已选择：
            {selectedEpisodes.size === 0 ? (
              <span className='is-warn'>未选择任何集数</span>
            ) : selectedEpisodes.size === 1 ? (
              <>
                第 {Array.from(selectedEpisodes)[0] + 1} 集
                {Array.from(selectedEpisodes)[0] === currentEpisodeIndex && (
                  <span className='mtv-dl-ep-note'>（当前播放）</span>
                )}
              </>
            ) : (
              <strong>{selectedEpisodes.size} 集</strong>
            )}
          </div>
          <div className='mtv-dl-ep-btns'>
            <button type='button' onClick={onClose} className='mtv-dl-ep-btn'>
              取消
            </button>
            <button
              type='button'
              onClick={() => setConfirmOpen(true)}
              disabled={selectedEpisodes.size === 0}
              className='mtv-dl-ep-btn is-primary'
            >
              {offlineMode && enableOfflineDownload && hasOfflinePermission
                ? '离线'
                : ''}
              下载{selectedEpisodes.size > 0 ? ` (${selectedEpisodes.size})` : ''}
            </button>
          </div>
        </div>
      </div>
      {confirmOpen && (
        <div className='fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm'>
          <div className='w-full max-w-sm rounded-2xl border border-white/10 bg-[#141416] p-5 text-white shadow-2xl'>
            <h3 className='text-base font-bold'>确认下载</h3>
            <p className='mt-2 text-sm text-white/60'>{videoTitle}</p>
            <p className='mt-1 text-sm text-white/60'>
              共 {selectedEpisodes.size} 集
              {offlineMode && enableOfflineDownload && hasOfflinePermission
                ? '，保存到本地离线目录'
                : ''}
            </p>
            <div className='mt-5 flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setConfirmOpen(false)}
                className='rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/60 transition-colors hover:border-white/40 hover:text-white'
              >
                取消
              </button>
              <button
                type='button'
                onClick={() => {
                  setConfirmOpen(false);
                  handleDownload();
                }}
                className='rounded-lg bg-ui-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110'
              >
                开始下载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>,
    document.body
  );
};

export default DownloadEpisodeSelector;
