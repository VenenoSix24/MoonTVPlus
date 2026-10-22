/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Bell, Check, Settings, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { Notification } from '@/lib/types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNotificationSettings?: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  onOpenNotificationSettings,
}) => {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载通知
  const loadNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('加载通知失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 标记为已读
  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_read',
          notificationId,
        }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n
          )
        );
        // 触发事件通知 UserMenu 更新未读计数
        window.dispatchEvent(new Event('notificationsUpdated'));
      }
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  };

  // 删除通知
  const deleteNotification = async (notificationId: string) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          notificationId,
        }),
      });

      if (response.ok) {
        const deletedNotification = notifications.find(
          (n) => n.id === notificationId
        );
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        // 如果删除的是未读通知，触发事件更新 UserMenu
        if (deletedNotification && !deletedNotification.read) {
          window.dispatchEvent(new Event('notificationsUpdated'));
        }
      }
    } catch (error) {
      console.error('删除通知失败:', error);
    }
  };

  // 清空所有通知
  const clearAll = async () => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_all',
        }),
      });

      if (response.ok) {
        setNotifications([]);
        // 触发事件通知 UserMenu 更新未读计数
        window.dispatchEvent(new Event('notificationsUpdated'));
      }
    } catch (error) {
      console.error('清空通知失败:', error);
    }
  };

  // 处理通知点击
  const handleNotificationClick = (notification: Notification) => {
    // 标记为已读
    if (!notification.read) {
      markAsRead(notification.id);
    }

    // 根据通知类型跳转
    if (notification.type === 'favorite_update' && notification.metadata) {
      const { source, id, title } = notification.metadata;
      router.push(
        `/play?source=${source}&id=${id}&title=${encodeURIComponent(title)}`
      );
      onClose();
    } else if (notification.type === 'manga_update' && notification.metadata) {
      const { sourceId, mangaId, title, cover, sourceName } =
        notification.metadata;
      const params = new URLSearchParams({
        sourceId,
        mangaId,
        title: title || '',
        cover: cover || '',
        sourceName: sourceName || '',
      });
      router.push(`/manga/detail?${params.toString()}`);
      onClose();
    } else if (notification.type === 'movie_request') {
      // 获取用户角色
      const authInfo = getAuthInfoFromBrowserCookie();
      const isAdmin = authInfo?.role === 'owner' || authInfo?.role === 'admin';

      // 管理员跳转到管理面板，普通用户跳转到我的求片
      router.push(isAdmin ? '/admin' : '/movie-request');
      onClose();
    }
  };

  const handleOpenNotificationSettings = () => {
    onOpenNotificationSettings?.();
  };

  // 打开面板时加载通知
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={onClose}
      />

      {/* 通知面板：手机端铺满整屏。列表项本身是整行可点的，弹窗留白只会
          让每条通知挤成两行字。 */}
      <div className='fixed z-[1001] flex flex-col overflow-hidden bg-ui-surface shadow-ui-3 inset-x-3 top-[max(12px,env(safe-area-inset-top))] bottom-[max(12px,env(safe-area-inset-bottom))] rounded-ui-lg sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:min-h-[520px] sm:max-h-[80vh]'>
        {/* 标题栏 */}
        <div className='flex items-center justify-between px-4 py-3.5 border-b border-ui-hair shrink-0 sm:px-6 sm:py-4 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:pt-4'>
          <div className='flex items-center gap-2 min-w-0'>
            <Bell className='w-5 h-5 shrink-0 text-ui-ink-2' />
            <h3 className='text-lg font-bold text-ui-ink truncate'>通知中心</h3>
            {notifications.length > 0 && (
              <span className='shrink-0 px-2 py-0.5 text-xs font-medium bg-ui-accent-soft text-ui-accent rounded-full'>
                {notifications.filter((n) => !n.read).length} 条未读
              </span>
            )}
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
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

        {/* 通知列表 */}
        <div className='flex flex-1 flex-col overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4'>
          {onOpenNotificationSettings && (
            <button
              type='button'
              onClick={handleOpenNotificationSettings}
              className='mb-3 flex w-full items-center gap-2.5 rounded-ui-md border border-ui-hair bg-ui-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-ui-surface-hover focus:outline-none focus:ring-2 focus:ring-ui-accent'
            >
              <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-sm bg-ui-accent-soft text-ui-accent'>
                <Settings className='h-4 w-4' />
              </div>
              <span className='min-w-0 flex-1 text-sm text-ui-ink-2'>
                开启邮件通知或当前设备浏览器系统通知后，重要更新可在站外提醒您
              </span>
              <span className='shrink-0 text-xs font-medium text-ui-accent'>
                去配置
              </span>
            </button>
          )}

          {loading ? (
            <div className='flex items-center justify-center py-12'>
              <div className='w-8 h-8 border-4 border-ui-accent border-t-transparent rounded-full animate-spin'></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className='flex flex-1 flex-col items-center justify-center py-12 text-ui-ink-3'>
              <Bell className='w-12 h-12 mb-3 opacity-30' />
              <p className='text-sm'>暂无通知</p>
            </div>
          ) : (
            <div className='space-y-2'>
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`group relative p-4 rounded-ui-md border transition-all cursor-pointer ${
                    notification.read
                      ? 'bg-ui-surface-2 border-ui-hair'
                      : 'bg-ui-accent-soft border-ui-accent/40'
                  } sm:hover:shadow-ui-2`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* 未读标识 */}
                  {!notification.read && (
                    <div className='absolute top-4 right-4 w-2 h-2 bg-ui-accent rounded-full'></div>
                  )}

                  {/* 通知内容 */}
                  <div className='pr-8'>
                    <div className='flex items-start justify-between mb-1'>
                      <h4 className='text-sm font-semibold text-ui-ink'>
                        {notification.title}
                      </h4>
                    </div>
                    <p className='text-sm text-ui-ink-2 mb-2'>
                      {notification.message}
                    </p>
                    <p className='text-xs text-ui-ink-3'>
                      {new Date(notification.timestamp).toLocaleString('zh-CN')}
                    </p>
                  </div>

                  {/* 操作按钮：触屏没有 hover，常驻显示，否则永远点不到 */}
                  <div className='absolute top-2 right-2 flex items-center gap-1 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100'>
                    {!notification.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        className='p-1.5 rounded-full bg-ui-surface hover:bg-ui-surface-hover active:bg-ui-surface-3 transition-colors'
                        title='标记为已读'
                      >
                        <Check className='w-3.5 h-3.5 text-ui-accent' />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      className='p-1.5 rounded-full bg-ui-surface hover:bg-ui-danger-soft transition-colors'
                      title='删除'
                    >
                      <Trash2 className='w-3.5 h-3.5 text-ui-danger' />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
