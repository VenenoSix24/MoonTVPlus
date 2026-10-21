'use client';

import { AlertTriangle, Check, History, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PlayRecord } from '@/lib/db.client';
import {
  clearAllPlayRecords,
  deletePlayRecords,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';

import VideoCard from '@/components/VideoCard';

type PlayRecordItem = PlayRecord & {
  key: string;
};

interface PlayRecordsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 面板右上角动作按钮的统一外观。
 *
 * 原来这几个是裸文字、彼此只隔 8px，删除这种不可撤销的动作紧挨着「取消」，
 * 很容易点错。现在每个按钮自带 10px 内边距的点击面、彼此隔 10px，
 * 破坏性动作单独用红色标出来。
 */
const ACTION_BTN =
  'inline-flex items-center gap-1 h-[30px] px-2 rounded-lg sm:px-2.5 text-xs font-semibold whitespace-nowrap ' +
  'text-ui-ink-2 transition-colors hover:text-ui-ink hover:bg-ui-surface-3 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ui-ink-2';

const ACTION_BTN_ACCENT =
  'inline-flex items-center gap-1 h-[30px] px-2 rounded-lg sm:px-2.5 text-xs font-semibold whitespace-nowrap ' +
  'text-ui-accent transition-colors hover:bg-ui-surface-3';

const ACTION_BTN_DANGER =
  'inline-flex items-center gap-1 h-[30px] px-2 rounded-lg sm:px-2.5 text-xs font-semibold whitespace-nowrap ' +
  'text-red-500 transition-colors hover:bg-red-500/10 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

const DIALOG_BTN =
  'h-9 px-4 rounded-lg text-sm font-semibold text-ui-ink-2 border border-ui-hair-strong ' +
  'transition-colors hover:text-ui-ink hover:bg-ui-surface-3 disabled:opacity-60 disabled:cursor-not-allowed';

const DIALOG_BTN_DANGER =
  'h-9 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 ' +
  'transition-colors hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed';

const parseKey = (key: string) => {
  const [source, id] = key.split('+');
  return { source, id };
};

const getProgress = (record: PlayRecord) => {
  if (record.total_time === 0) return 0;
  return (record.play_time / record.total_time) * 100;
};

export default function PlayRecordsPanel({
  isOpen,
  onClose,
}: PlayRecordsPanelProps) {
  const [playRecords, setPlayRecords] = useState<PlayRecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] =
    useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);

  const loadPlayRecords = async () => {
    setLoading(true);
    try {
      const allRecords = await getAllPlayRecords();
      const sorted = Object.entries(allRecords)
        .map(([key, record]) => ({
          ...record,
          key,
        }))
        .sort((a, b) => b.save_time - a.save_time);
      setPlayRecords(sorted);
      setSelectedKeys((prev) => {
        if (prev.size === 0) return prev;
        const availableKeys = new Set(sorted.map((record) => record.key));
        return new Set(
          Array.from(prev).filter((key) => availableKeys.has(key))
        );
      });
    } catch (error) {
      console.error('加载播放记录失败:', error);
      setPlayRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllPlayRecords();
      setPlayRecords([]);
      setSelectedKeys(new Set());
      setEditMode(false);
      setShowConfirmDialog(false);
    } catch (error) {
      console.error('清空播放记录失败:', error);
    }
  };

  const toggleEditMode = () => {
    setEditMode((prev) => {
      if (prev) {
        setSelectedKeys(new Set());
      }
      return !prev;
    });
  };

  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedKeys(new Set(playRecords.map((record) => record.key)));
  };

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) return;

    setDeletingSelected(true);
    try {
      const keysToDelete = Array.from(selectedKeys);
      await deletePlayRecords(keysToDelete);
      setPlayRecords((prev) =>
        prev.filter((record) => !selectedKeys.has(record.key))
      );
      setSelectedKeys(new Set());
      setEditMode(false);
      setShowDeleteSelectedDialog(false);
    } catch (error) {
      console.error('删除选中播放记录失败:', error);
    } finally {
      setDeletingSelected(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadPlayRecords();
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        if (!isOpen) return;
        const sorted = Object.entries(newRecords)
          .map(([key, record]) => ({
            ...record,
            key,
          }))
          .sort((a, b) => b.save_time - a.save_time);
        setPlayRecords(sorted);
        setSelectedKeys((prev) => {
          if (prev.size === 0) return prev;
          const availableKeys = new Set(sorted.map((record) => record.key));
          return new Set(
            Array.from(prev).filter((key) => availableKeys.has(key))
          );
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const selectedCount = selectedKeys.size;
  const allSelected =
    playRecords.length > 0 && selectedCount === playRecords.length;

  return (
    <>
      <div
        className='fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm'
        onClick={onClose}
      />

      <div className='fixed top-1/2 left-1/2 z-[1001] flex max-h-[85vh] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-ui-hair bg-ui-surface-2 text-ui-ink shadow-[0_32px_72px_-24px_rgba(0,0,0,0.7)]'>
        <div className='flex flex-nowrap items-center justify-between gap-2 border-b border-ui-hair px-4 py-3 sm:gap-4 sm:px-5 sm:py-3.5'>
          <div className='flex min-w-0 items-center gap-2'>
            <History className='hidden h-5 w-5 flex-none text-ui-ink-3 min-[360px]:block' />
            <h3 className='truncate whitespace-nowrap text-[15px] font-bold text-ui-ink'>
              播放记录
            </h3>
            {playRecords.length > 0 && (
              <span className='hidden whitespace-nowrap rounded-full bg-ui-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ui-ink-3 min-[420px]:inline-block'>
                {playRecords.length} 项
              </span>
            )}
          </div>
          <div className='flex flex-none items-center gap-1.5 min-[360px]:gap-2 sm:gap-3'>
            {playRecords.length > 0 &&
              (editMode ? (
                <>
                  <button
                    type='button'
                    onClick={
                      allSelected ? () => setSelectedKeys(new Set()) : selectAll
                    }
                    className={ACTION_BTN}
                  >
                    {allSelected ? '取消全选' : '全选'}
                  </button>
                  <button
                    type='button'
                    onClick={() => setShowDeleteSelectedDialog(true)}
                    disabled={selectedCount === 0 || deletingSelected}
                    className={ACTION_BTN_DANGER}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                    删除{selectedCount > 0 ? `(${selectedCount})` : ''}
                  </button>
                  <button
                    type='button'
                    onClick={toggleEditMode}
                    className={ACTION_BTN}
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button
                    type='button'
                    onClick={toggleEditMode}
                    className={ACTION_BTN_ACCENT}
                  >
                    编辑
                  </button>
                  <button
                    type='button'
                    onClick={() => setShowConfirmDialog(true)}
                    className={ACTION_BTN_DANGER}
                  >
                    清空全部
                  </button>
                </>
              ))}

            <span
              className='hidden h-4 w-px flex-none bg-ui-hair-strong min-[360px]:block'
              aria-hidden='true'
            />

            <button
              type='button'
              onClick={onClose}
              className='flex h-8 w-8 flex-none items-center justify-center rounded-full text-ui-ink-3 transition-colors hover:bg-ui-surface-3 hover:text-ui-ink'
              aria-label='关闭'
            >
              <X className='h-4 w-4' />
            </button>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto p-5'>
          {loading ? (
            <div className='flex items-center justify-center py-12'>
              <div className='h-8 w-8 animate-spin rounded-full border-4 border-ui-accent border-t-transparent' />
            </div>
          ) : playRecords.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-ui-ink-3'>
              <History className='mb-3 h-12 w-12 opacity-30' />
              <p className='text-sm'>暂无播放记录</p>
            </div>
          ) : (
            <div className='grid grid-cols-3 gap-x-2 gap-y-14 px-0 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-20 sm:px-2'>
              {playRecords.map((record) => {
                const { source, id } = parseKey(record.key);
                const checked = selectedKeys.has(record.key);

                return (
                  <div key={record.key} className='relative w-full'>
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
                      playTime={record.play_time}
                      totalTime={record.total_time}
                    />
                    {editMode && (
                      <button
                        type='button'
                        aria-label={
                          checked ? '取消选择播放记录' : '选择播放记录'
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleSelected(record.key);
                        }}
                        className={`absolute inset-0 z-20 rounded-lg transition-colors ${
                          checked
                            ? 'bg-ui-accent/20 ring-2 ring-ui-accent'
                            : 'bg-black/5 hover:bg-ui-accent/10 dark:bg-black/20'
                        }`}
                      >
                        <span
                          className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-md transition-colors ${
                            checked
                              ? 'border-ui-accent bg-ui-accent text-white'
                              : 'border-white bg-black/40 text-transparent'
                          }`}
                        >
                          <Check className='h-4 w-4' />
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showConfirmDialog &&
        createPortal(
          <div
            className='fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
            onClick={() => setShowConfirmDialog(false)}
          >
            <div
              className='w-full max-w-md overflow-hidden rounded-2xl border border-ui-hair bg-ui-surface-2 text-ui-ink shadow-[0_32px_72px_-24px_rgba(0,0,0,0.7)]'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-start gap-4 p-6'>
                <AlertTriangle className='h-7 w-7 flex-none text-red-500' />
                <div className='flex-1'>
                  <h3 className='text-[15px] font-bold text-ui-ink'>
                    清空播放记录
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-ui-ink-2'>
                    确定要清空所有播放记录吗？此操作不可恢复。
                  </p>
                </div>
              </div>

              <div className='flex justify-end gap-3 px-6 pb-6'>
                <button
                  type='button'
                  onClick={() => setShowConfirmDialog(false)}
                  className={DIALOG_BTN}
                >
                  取消
                </button>
                <button
                  type='button'
                  onClick={handleClearAll}
                  className={DIALOG_BTN_DANGER}
                >
                  确定清空
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showDeleteSelectedDialog &&
        createPortal(
          <div
            className='fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
            onClick={() =>
              !deletingSelected && setShowDeleteSelectedDialog(false)
            }
          >
            <div
              className='w-full max-w-md overflow-hidden rounded-2xl border border-ui-hair bg-ui-surface-2 text-ui-ink shadow-[0_32px_72px_-24px_rgba(0,0,0,0.7)]'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-start gap-4 p-6'>
                <AlertTriangle className='h-7 w-7 flex-none text-red-500' />
                <div className='flex-1'>
                  <h3 className='text-[15px] font-bold text-ui-ink'>
                    删除播放记录
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-ui-ink-2'>
                    确定要删除选中的 {selectedCount}{' '}
                    条播放记录吗？此操作不可恢复。
                  </p>
                </div>
              </div>

              <div className='flex justify-end gap-3 px-6 pb-6'>
                <button
                  type='button'
                  onClick={() => setShowDeleteSelectedDialog(false)}
                  disabled={deletingSelected}
                  className={DIALOG_BTN}
                >
                  取消
                </button>
                <button
                  type='button'
                  onClick={handleDeleteSelected}
                  disabled={deletingSelected}
                  className={DIALOG_BTN_DANGER}
                >
                  {deletingSelected ? '删除中…' : '确定删除'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
