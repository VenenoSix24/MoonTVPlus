'use client';

import { Bell, Info, Mail, MonitorSmartphone, Send, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useState } from 'react';

interface EmailSettingsPanelProps {
  isOpen: boolean;
  mounted: boolean;
  onClose: () => void;
  userEmail: string;
  onUserEmailChange: (value: string) => void;
  emailNotifications: boolean;
  onEmailNotificationsChange: (value: boolean) => void;
  pushNotifications: boolean;
  onPushNotificationsChange: (value: boolean) => void;
  pushNotificationsSupported: boolean;
  pushNotificationsConfigured: boolean;
  pushNotificationsBusy: boolean;
  telegramEnabled?: boolean;
  telegramBound?: boolean;
  telegramUsername?: string;
  telegramBindCode?: string;
  telegramDeepLink?: string;
  telegramBindingBusy?: boolean;
  onCreateTelegramBindCode?: () => void;
  emailSettingsLoading: boolean;
  emailSettingsSaving: boolean;
  onSave: () => void;
  statusMessage?: string;
  statusType?: 'success' | 'error' | null;
}

type NotificationTab = 'email' | 'push' | 'telegram';

function Toggle({
  checked,
  disabled,
  busy,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-900 ${
        checked ? 'bg-blue-600' : 'bg-ui-surface-3 bg-ui-surface-3'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-ui-surface shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      >
        {busy ? (
          <span className='h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent' />
        ) : null}
      </span>
    </button>
  );
}

export function EmailSettingsPanel({
  isOpen,
  mounted,
  onClose,
  userEmail,
  onUserEmailChange,
  emailNotifications,
  onEmailNotificationsChange,
  pushNotifications,
  onPushNotificationsChange,
  pushNotificationsSupported,
  pushNotificationsConfigured,
  pushNotificationsBusy,
  telegramEnabled,
  telegramBound,
  telegramUsername,
  telegramBindCode,
  telegramDeepLink,
  telegramBindingBusy,
  onCreateTelegramBindCode,
  emailSettingsLoading,
  emailSettingsSaving,
  onSave,
  statusMessage,
  statusType,
}: EmailSettingsPanelProps) {
  if (!isOpen || !mounted) return null;

  const [notificationTab, setNotificationTab] = useState<NotificationTab>('email');

  const pushDisabled =
    emailSettingsSaving ||
    pushNotificationsBusy ||
    (!pushNotifications && (!pushNotificationsConfigured || !pushNotificationsSupported));

  const telegramNotifyEnabled = Boolean(telegramEnabled);

  const tabs = [
    { key: 'email' as const, label: '邮件通知', icon: Mail },
    { key: 'push' as const, label: '浏览器通知', icon: MonitorSmartphone },
    { key: 'telegram' as const, label: 'Telegram', icon: Send },
  ];

  return createPortal(
    <>
      <div
        className='fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm'
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
        onWheel={(e) => e.preventDefault()}
        style={{ touchAction: 'none' }}
      />

      <div className='fixed left-1/2 top-1/2 z-[1001] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-ui-surface shadow-xl'>
        <div
          className='max-h-[85vh] overflow-y-auto p-6'
          data-panel-content
          onTouchMove={(e) => e.stopPropagation()}
          style={{ touchAction: 'auto' }}
        >
          <div className='mb-6 flex items-start justify-between gap-4'>
            <div>
              <div className='mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'>
                <Bell className='h-5 w-5' />
              </div>
              <h3 className='text-xl font-bold text-ui-ink'>
                通知设置
              </h3>
              <p className='mt-1 text-sm text-ui-ink-3'>
                管理邮件通知、浏览器系统通知和 Telegram Bot 通知。
              </p>
            </div>
            <button
              onClick={onClose}
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ui-ink-3 transition-colors hover:bg-ui-surface-hover focus:outline-none focus:ring-2 focus:ring-blue-500'
              aria-label='关闭通知设置'
            >
              <X className='h-5 w-5' />
            </button>
          </div>

          {/* 三区域切换式导航 — 与电视访问一致 */}
          <div className='mb-5 grid grid-cols-3 rounded-2xl bg-ui-surface-3 p-1 dark:bg-white/10'>
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = notificationTab === item.key;
              return (
                <button
                  key={item.key}
                  type='button'
                  onClick={() => setNotificationTab(item.key)}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 ${
                    active
                      ? 'bg-ui-surface text-ui-ink shadow-sm bg-ui-bg dark:text-white'
                      : 'text-ui-ink-3 hover:text-ui-ink text-ui-ink-3 dark:hover:text-white'
                  }`}
                >
                  <Icon className='h-4 w-4' />
                  <span className='hidden sm:inline'>{item.label}</span>
                  <span className='sm:hidden'>{item.key === 'email' ? '邮件' : item.key === 'push' ? '浏览器' : 'Telegram'}</span>
                </button>
              );
            })}
          </div>

          {emailSettingsLoading ? (
            <div className='space-y-4' aria-live='polite'>
              <div className='animate-pulse rounded-2xl border border-ui-hair bg-ui-surface-2 p-4'>
                <div className='mb-3 h-5 w-28 rounded bg-ui-surface-3' />
                <div className='h-10 rounded bg-ui-surface-3' />
              </div>
              <div className='animate-pulse rounded-2xl border border-ui-hair bg-ui-surface-2 p-4'>
                <div className='mb-3 h-5 w-32 rounded bg-ui-surface-3' />
                <div className='h-16 rounded bg-ui-surface-3' />
              </div>
              <p className='text-center text-sm text-ui-ink-3'>
                加载中...
              </p>
            </div>
          ) : (
            <>
              {/* 邮件通知 */}
              {notificationTab === 'email' && (
                <section className='rounded-2xl border border-ui-hair bg-ui-surface-2 p-4'>
                  <div className='mb-4 flex items-start gap-3'>
                    <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'>
                      <Mail className='h-5 w-5' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <h4 className='text-base font-semibold text-ui-ink'>
                        邮件通知
                      </h4>
                      <p className='mt-1 text-sm text-ui-ink-3'>
                        用于接收收藏影视更新等异步提醒，可独立于系统通知关闭。
                      </p>
                    </div>
                  </div>

                  <label className='mb-2 block text-sm font-medium text-ui-ink'>
                    邮箱地址
                  </label>
                  <input
                    type='email'
                    value={userEmail}
                    onChange={(e) => onUserEmailChange(e.target.value)}
                    placeholder='输入您的邮箱地址'
                    disabled={emailSettingsSaving}
                    className='mb-4 w-full rounded-xl border border-ui-hair-strong bg-ui-surface px-3 py-2.5 text-sm text-ui-ink transition-colors placeholder:text-ui-ink-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white'
                  />

                  <div className='flex items-center justify-between gap-4 rounded-xl bg-ui-surface p-3'>
                    <div>
                      <h5 className='text-sm font-medium text-ui-ink'>
                        收藏更新邮件
                      </h5>
                      <p className='mt-1 text-xs text-ui-ink-3'>
                        当收藏的影片有更新时发送邮件通知。
                      </p>
                    </div>
                    <Toggle
                      checked={emailNotifications}
                      disabled={emailSettingsSaving}
                      label='切换收藏更新邮件通知'
                      onChange={() => onEmailNotificationsChange(!emailNotifications)}
                    />
                  </div>
                </section>
              )}

              {/* 浏览器系统通知 */}
              {notificationTab === 'push' && (
                <section className='rounded-2xl border border-ui-hair bg-ui-surface-2 p-4'>
                  <div className='mb-4 flex items-start gap-3'>
                    <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'>
                      <MonitorSmartphone className='h-5 w-5' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <h4 className='text-base font-semibold text-ui-ink'>
                        当前设备浏览器系统通知
                      </h4>
                      <p className='mt-1 text-sm text-ui-ink-3'>
                        当前设备收到站内通知时，通过浏览器推送到系统通知中心。
                      </p>
                    </div>
                    <Toggle
                      checked={pushNotifications}
                      disabled={pushDisabled}
                      busy={pushNotificationsBusy}
                      label='切换当前设备浏览器系统通知'
                      onChange={() => onPushNotificationsChange(!pushNotifications)}
                    />
                  </div>

                  <div className='space-y-2 rounded-xl bg-ui-surface p-3'>
                    <div className='flex items-center justify-between gap-3 text-sm'>
                      <span className='text-ui-ink-2'>当前设备</span>
                      <span className={`font-medium ${pushNotificationsSupported ? 'text-ui-accent ' : 'text-amber-600 dark:text-amber-400'}`}>
                        {pushNotificationsSupported ? '可用' : '需支持或授权'}
                      </span>
                    </div>
                    {!pushNotificationsConfigured && (
                      <p className='text-xs text-amber-600 dark:text-amber-400' role='alert'>
                        系统正在初始化 Web Push 密钥，请稍后重试。
                      </p>
                    )}
                    {pushNotificationsConfigured && !pushNotificationsSupported && (
                      <p className='text-xs text-amber-600 dark:text-amber-400' role='alert'>
                        当前浏览器、系统权限或登录模式暂不支持系统通知。
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Telegram 通知 */}
              {notificationTab === 'telegram' && (
                <>
                {telegramNotifyEnabled ? (
                  <section className='rounded-2xl border border-ui-hair bg-ui-surface-2 p-4'>
                    <div className='mb-4 flex items-start gap-3'>
                      <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'>
                        <Send className='h-5 w-5' />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <h4 className='text-base font-semibold text-ui-ink'>Telegram Bot 通知</h4>
                        <p className='mt-1 text-sm text-ui-ink-3'>
                          绑定 Telegram 后可接收站内通知，也可在登录页使用 Telegram 确认登录。
                        </p>
                      </div>
                    </div>
                    <div className='space-y-3 rounded-xl bg-ui-surface p-3'>
                      <div className='flex items-center justify-between gap-3 text-sm'>
                        <span className='text-ui-ink-2'>绑定状态</span>
                        <span className={`font-medium ${telegramBound ? 'text-ui-accent ' : 'text-amber-600 dark:text-amber-400'}`}>
                          {telegramBound ? `已绑定${telegramUsername ? ` @${telegramUsername}` : ''}` : '未绑定'}
                        </span>
                      </div>
                      {!telegramBound && (
                        <>
                          {telegramBindCode && (
                            <div className='rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'>
                              绑定码：<span className='font-mono text-base font-bold'>{telegramBindCode}</span>
                              <p className='mt-1 text-xs'>在 Bot 中发送 /bind {telegramBindCode}，或点击下方按钮打开 Telegram。</p>
                            </div>
                          )}
                          <div className='flex gap-2'>
                            <button
                              type='button'
                              onClick={onCreateTelegramBindCode}
                              disabled={telegramBindingBusy}
                              className='flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400'
                            >
                              {telegramBindingBusy ? '生成中...' : '生成绑定码'}
                            </button>
                            {telegramDeepLink && (
                              <button
                                type='button'
                                onClick={() => window.open(telegramDeepLink, '_blank', 'noopener,noreferrer')}
                                className='flex-1 rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30'
                              >
                                打开 Telegram
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                ) : (
                  <section className='rounded-2xl border border-ui-hair bg-ui-surface-2 p-4'>
                    <div className='mb-4 flex items-start gap-3'>
                      <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ui-surface-3 text-ui-ink-3'>
                        <Send className='h-5 w-5' />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <h4 className='text-base font-semibold text-ui-ink'>Telegram Bot 通知</h4>
                        <p className='mt-1 text-sm text-ui-ink-3'>
                          当前站点未启用 Telegram Bot 通知功能。
                        </p>
                      </div>
                    </div>
                  </section>
                )}
                </>
              )}

              <button
                onClick={onSave}
                disabled={emailSettingsSaving}
                className='mt-[10px] flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400 dark:focus:ring-offset-gray-900 dark:disabled:bg-blue-500'
              >
                {emailSettingsSaving ? (
                  <>
                    <span className='h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent' />
                    <span>保存中...</span>
                  </>
                ) : (
                  '保存通知设置'
                )}
              </button>

              {statusMessage ? (
                <p
                  role={statusType === 'error' ? 'alert' : 'status'}
                  className={`text-center text-xs ${
                    statusType === 'success'
                      ? 'text-ui-accent '
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {statusMessage}
                </p>
              ) : null}
            </>
          )}

          <div className='mt-6 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20'>
            <Info className='mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300' />
            <p className='text-xs leading-5 text-blue-800 dark:text-blue-200'>
              邮件通知需要管理员配置邮件服务；浏览器系统通知需要当前浏览器授权。
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
