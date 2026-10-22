/* eslint-disable no-console */
'use client';
import { AlertTriangle, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PlayRecord } from '@/lib/db.client';
import {
  clearAllPlayRecords,
  getAllPlayRecords,
  getCachedPlayRecordsSnapshot,
  subscribeToDataUpdates,
} from '@/lib/db.client';

import PlayRecordsPanel from '@/components/PlayRecordsPanel';
import VideoCard from '@/components/VideoCard';
import VirtualScrollableRow from '@/components/VirtualScrollableRow';

interface ContinueWatchingProps {
  className?: string;
}

type PlayRecordItem = PlayRecord & { key: string };

export default function ContinueWatching({ className }: ContinueWatchingProps) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const cachedDisplayLimit = storageType !== 'localstorage' ? 10 : undefined;
  const [playRecords, setPlayRecords] = useState<PlayRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showPlayRecordsPanel, setShowPlayRecordsPanel] = useState(false);

  const updatePlayRecords = (
    allRecords: Record<string, PlayRecord>,
    limit?: number
  ) => {
    const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
      ...record,
      key,
    }));

    const sortedRecords = recordsArray.sort((a, b) => b.save_time - a.save_time);
    setPlayRecords(limit ? sortedRecords.slice(0, limit) : sortedRecords);
  };

  // 脚本源存下来的记录经常没有封面（搜索结果是空的 cover），同一部剧在别的源
  // 里却有图。同一个标题之间互相借一张，否则一排卡里只有一两张有海报，看着像
  // 图片加载失败。
  //
  // year 不能直接当分组键：脚本源存的是字符串 'unknown'，正片源存的是 '2026'，
  // 同一部剧会被拆成两组，于是既借不到封面也不标来源。未知年份一律当作空。
  const recordsWithCover = useMemo(() => {
    const normalizeYear = (year?: string | number | null) => {
      const text = String(year ?? '').trim();
      return !text || /^(unknown|null|undefined|0)$/i.test(text) ? '' : text;
    };
    const keyOf = (r: PlayRecordItem) =>
      `${r.title}__${normalizeYear(r.year)}`;

    const coverByKey = new Map<string, string>();
    const coverByTitle = new Map<string, string>();
    for (const record of playRecords) {
      if (!record.cover) continue;
      const k = keyOf(record);
      if (!coverByKey.has(k)) {
        coverByKey.set(k, record.cover);
      }
      if (!coverByTitle.has(record.title)) {
        coverByTitle.set(record.title, record.cover);
      }
    }

    return playRecords.map((record) => {
      if (record.cover) return record;
      // 先找同年份的，再退到同名的任意一条
      const cover =
        coverByKey.get(keyOf(record)) ?? coverByTitle.get(record.title) ?? '';
      return { ...record, cover };
    });
  }, [playRecords]);

  // 同一部剧命中多个源时，几张小卡片长得一模一样，右上角标出来源。
  // 按标题计数，不掺年份 —— 年份未知的那条同样需要标。
  const duplicatedTitles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of playRecords) {
      counts.set(record.title, (counts.get(record.title) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([title]) => title)
    );
  }, [playRecords]);
  const applyCachedSnapshot = () => {
    const cachedRecords = getCachedPlayRecordsSnapshot();
    if (Object.keys(cachedRecords).length === 0) {
      return false;
    }

    updatePlayRecords(cachedRecords, cachedDisplayLimit);
    setLoading(false);
    return true;
  };

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
        setLoading(false);
      }
    );

    const fetchPlayRecords = async () => {
      try {
        const hasCachedSnapshot = applyCachedSnapshot();
        if (!hasCachedSnapshot) {
          setLoading(true);
        }

        const allRecords = await getAllPlayRecords();
        updatePlayRecords(allRecords);
      } catch (error) {
        console.error('获取播放记录失败:', error);
        setPlayRecords([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayRecords();
    return unsubscribe;
  }, [cachedDisplayLimit]);

  if (!loading && playRecords.length === 0) {
    return null;
  }

  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  const parseKey = (key: string) => {
    const [source, id] = key.split('+');
    return { source, id };
  };

  const handleClearConfirm = async () => {
    await clearAllPlayRecords();
    setPlayRecords([]);
    setShowConfirmDialog(false);
  };

  return (
    <>
      <section className={`mb-8 ${className || ''}`}>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='mtv-row-title'>继续观看</h2>
          {!loading && playRecords.length > 0 && (
            <div className='mtv-cw-actions'>
              <button
                type='button'
                className='mtv-cw-clear'
                onClick={() => setShowConfirmDialog(true)}
              >
                <Trash2 className='h-3.5 w-3.5' />
                清空
              </button>
              <span className='mtv-cw-divider' aria-hidden='true' />
              <button
                type='button'
                className='mtv-row-more'
                onClick={() => setShowPlayRecordsPanel(true)}
              >
                查看更多
                <ChevronRight className='w-4 h-4 ml-1' />
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div className='flex gap-2 overflow-x-auto scrollbar-hide pb-2 pt-2'>
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className='mtv-card-wide'
              >
                <div className='mtv-skel-poster is-wide' />
                <div className='mtv-skel-line' />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <VirtualScrollableRow>
              {recordsWithCover.map((record) => {
                const { source, id } = parseKey(record.key);
                return (
                  <div
                    key={record.key}
                    className='mtv-card-wide'
                    style={{ position: 'relative' }}
                  >
                    {duplicatedTitles.has(record.title) &&
                      record.source_name && (
                        <span className='mtv-cw-src'>
                          {record.source_name.replace(
                            /^[^\u4e00-\u9fa5A-Za-z0-9]+/,
                            ''
                          )}
                        </span>
                      )}
                    <VideoCard
                      id={id}
                      title={record.title}
                      poster={record.cover}
                      year={record.year}
                      source={source}
                      source_name={record.source_name}
                      progress={getProgress(record)}
                      episodes={record.total_episodes}
                      currentEpisode={record.index}
                      query={record.search_title}
                      from='playrecord'
                      onDelete={() =>
                        setPlayRecords((prev) =>
                          prev.filter((item) => item.key !== record.key)
                        )
                      }
                      type={record.total_episodes > 1 ? 'tv' : ''}
                      origin={record.origin}
                      orientation='horizontal'
                      playTime={record.play_time}
                      totalTime={record.total_time}
                      hideSource
                      isAnime={Boolean(record.is_anime)}
                    />
                    {record.new_episodes && record.new_episodes > 0 && (
                      <span
                        className='mtv-cw-new'
                        aria-label={`新增 ${record.new_episodes} 集`}
                      >
                        <span />
                        <span />
                        <span>+{record.new_episodes}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </VirtualScrollableRow>
          </div>
        )}
      </section>

      {showConfirmDialog &&
        createPortal(
          <div
            className='fixed inset-0 z-[var(--ui-z-modal)] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
            onClick={() => setShowConfirmDialog(false)}
          >
            <div
              className='w-full max-w-sm overflow-hidden rounded-ui-lg border border-ui-hair bg-ui-surface shadow-ui-3'
              onClick={(event) => event.stopPropagation()}
            >
              <div className='flex items-start gap-3 p-5'>
                <span className='grid h-9 w-9 flex-none place-items-center rounded-ui-md bg-ui-danger-soft text-ui-danger'>
                  <AlertTriangle className='h-5 w-5' />
                </span>
                <div className='min-w-0 flex-1'>
                  <h3 className='m-0 text-[15px] font-semibold text-ui-ink'>
                    清空播放记录
                  </h3>
                  <p className='mt-1.5 text-[13px] leading-relaxed text-ui-ink-2'>
                    确定要清空所有播放记录吗？此操作不可恢复。
                  </p>
                </div>
              </div>

              <div className='flex gap-2 border-t border-ui-hair p-3'>
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className='mtv-ui-btn flex-1'
                >
                  取消
                </button>
                <button
                  onClick={handleClearConfirm}
                  className='mtv-ui-btn is-danger flex-1'
                >
                  确定清空
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showPlayRecordsPanel &&
        createPortal(
          <PlayRecordsPanel
            isOpen={showPlayRecordsPanel}
            onClose={() => setShowPlayRecordsPanel(false)}
          />,
          document.body
        )}
    </>
  );
}
