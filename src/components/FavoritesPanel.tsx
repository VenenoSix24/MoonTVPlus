/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertTriangle, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import VideoCard from '@/components/VideoCard';
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';

interface FavoriteItem {
  id: string;
  source: string;
  title: string;
  year: string;
  poster: string;
  episodes?: number;
  source_name?: string;
  currentEpisode?: number;
  search_title?: string;
  origin?: 'vod' | 'live';
}

interface FavoritesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 加载收藏数据
  const loadFavorites = async () => {
    setLoading(true);
    try {
      const allFavorites = await getAllFavorites();
      const allPlayRecords = await getAllPlayRecords();

      // 根据保存时间排序（从近到远）
      const sorted = Object.entries(allFavorites)
        .sort(([, a], [, b]) => b.save_time - a.save_time)
        .map(([key, fav]) => {
          const plusIndex = key.indexOf('+');
          const source = key.slice(0, plusIndex);
          const id = key.slice(plusIndex + 1);

          // 查找对应的播放记录，获取当前集数
          const playRecord = allPlayRecords[key];
          const currentEpisode = playRecord?.index;

          return {
            id,
            source,
            title: fav.title,
            year: fav.year,
            poster: fav.cover,
            episodes: fav.total_episodes,
            source_name: fav.source_name,
            currentEpisode,
            search_title: fav?.search_title,
            origin: fav?.origin,
          } as FavoriteItem;
        });
      setFavoriteItems(sorted);
    } catch (error) {
      console.error('加载收藏失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 清空所有收藏
  const handleClearAll = async () => {
    try {
      await clearAllFavorites();
      setFavoriteItems([]);
      setShowConfirmDialog(false);
    } catch (error) {
      console.error('清空收藏失败:', error);
    }
  };

  // 打开面板时加载收藏
  useEffect(() => {
    if (isOpen) {
      loadFavorites();
    }
  }, [isOpen]);

  // 监听收藏变化,实时移除已取消收藏的项目
  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      async (newFavorites: Record<string, any>) => {
        if (isOpen) {
          // 获取最新的收藏列表的键
          const currentKeys = Object.keys(newFavorites);

          // 过滤掉已经不在收藏中的项目
          setFavoriteItems((prevItems) =>
            prevItems.filter((item) => {
              const key = `${item.source}+${item.id}`;
              return currentKeys.includes(key);
            })
          );
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={onClose}
      />

      {/* 收藏面板：手机端留一圈边（不再铺满整屏），桌面端居中弹窗 —— 一屏能看到的
          卡片数差太多；但铺满整屏时关闭按钮正好顶在状态栏下面，手指够不到。 */}
      <div className='fixed z-[1001] flex flex-col overflow-hidden bg-ui-surface shadow-ui-3 inset-x-3 top-[max(12px,env(safe-area-inset-top))] bottom-[max(12px,env(safe-area-inset-bottom))] rounded-ui-lg sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-4xl sm:max-h-[85vh]'>
        {/* 标题栏 */}
        <div className='flex items-center justify-between px-4 py-3.5 border-b border-ui-hair shrink-0 sm:px-6 sm:py-4 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:pt-4'>
          <div className='flex items-center gap-2 min-w-0'>
            <Star className='w-5 h-5 shrink-0 text-amber-500 dark:text-amber-400' />
            <h3 className='text-lg font-bold text-ui-ink truncate'>我的收藏</h3>
            {favoriteItems.length > 0 && (
              <span className='shrink-0 px-2 py-0.5 text-xs font-medium bg-ui-accent-soft text-ui-accent rounded-full'>
                {favoriteItems.length} 项
              </span>
            )}
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            {favoriteItems.length > 0 && (
              <button
                onClick={() => setShowConfirmDialog(true)}
                className='text-xs text-ui-danger hover:opacity-80 transition-opacity'
              >
                清空全部
              </button>
            )}
            <button
              onClick={onClose}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-ui-ink-2 hover:bg-ui-surface-hover active:bg-ui-surface-3 transition-colors'
              aria-label='关闭'
            >
              <X className='w-full h-full' />
            </button>
          </div>
        </div>

        {/* 收藏列表 */}
        <div className='flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6'>
          {loading ? (
            <div className='flex items-center justify-center py-12'>
              <div className='w-8 h-8 border-4 border-ui-accent border-t-transparent rounded-full animate-spin'></div>
            </div>
          ) : favoriteItems.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-ui-ink-3'>
              <Star className='w-12 h-12 mb-3 opacity-30' />
              <p className='text-sm'>暂无收藏内容</p>
            </div>
          ) : (
            <div className='grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
              {favoriteItems.map((item) => (
                <div key={item.id + item.source} className='w-full'>
                  <VideoCard
                    query={item.search_title}
                    {...item}
                    from='favorite'
                    type={item.episodes && item.episodes > 1 ? 'tv' : ''}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 确认对话框 */}
      {showConfirmDialog &&
        createPortal(
          <div
            className='fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 transition-opacity duration-300'
            onClick={() => setShowConfirmDialog(false)}
          >
            <div
              className='bg-ui-surface rounded-ui-lg shadow-ui-3 max-w-md w-full border border-ui-hair transition-all duration-300'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='p-6'>
                {/* 图标和标题 */}
                <div className='flex items-start gap-4 mb-4'>
                  <div className='flex-shrink-0'>
                    <AlertTriangle className='w-8 h-8 text-ui-danger' />
                  </div>
                  <div className='flex-1'>
                    <h3 className='text-lg font-semibold text-ui-ink mb-2'>
                      清空收藏
                    </h3>
                    <p className='text-sm text-ui-ink-2'>
                      确定要清空所有收藏吗？此操作不可恢复。
                    </p>
                  </div>
                </div>

                {/* 按钮组 */}
                <div className='flex gap-3 mt-6'>
                  <button
                    onClick={() => setShowConfirmDialog(false)}
                    className='flex-1 px-4 py-2 text-sm font-medium text-ui-ink-2 bg-ui-surface-2 hover:bg-ui-surface-hover active:bg-ui-surface-3 rounded-ui-md transition-colors'
                  >
                    取消
                  </button>
                  <button
                    onClick={handleClearAll}
                    className='flex-1 px-4 py-2 text-sm font-medium text-white bg-ui-danger hover:opacity-90 active:opacity-80 rounded-ui-md transition-opacity'
                  >
                    确定清空
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
