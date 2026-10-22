'use client';

import { Monitor, MonitorPlay, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import Toast, { ToastProps } from '@/components/Toast';
import { useWatchRoomContext } from '@/components/WatchRoomProvider';
import { screenShareQualityOptions, type ScreenShareQualityPreset, useScreenShare } from '@/hooks/useScreenShare';

const NEW_TAB_KEY_PREFIX = 'watch_room_screen_home_opened_';
const WATCH_ROOM_NO_CONNECT_KEY = 'watch_room_no_connect';
const WATCH_ROOM_NO_CONNECT_TIMESTAMP_KEY = 'watch_room_no_connect_timestamp';
const WATCH_ROOM_NO_CONNECT_TTL_MS = 10 * 60 * 1000;
const SCREEN_SHARE_QUALITY_KEY = 'watch_room_screen_quality';

function getScreenShareHostSupportError() {
  if (typeof window === 'undefined') return null;

  if (!window.isSecureContext) {
    return '当前环境不是安全上下文（HTTPS/localhost），不支持屏幕共享';
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    return '当前浏览器不支持屏幕共享';
  }

  if (typeof window.RTCPeerConnection === 'undefined') {
    return '当前浏览器不支持实时屏幕传输';
  }

  return null;
}

function getScreenShareViewerSupportError() {
  if (typeof window === 'undefined') return null;

  if (typeof window.RTCPeerConnection === 'undefined') {
    return '当前浏览器不支持实时屏幕传输';
  }

  return null;
}

export default function WatchRoomScreenPage() {
  const router = useRouter();
  const watchRoom = useWatchRoomContext();
  const { currentRoom, members, leaveRoom } = watchRoom;
  const [toast, setToast] = useState<ToastProps | null>(null);
  const [qualityPreset, setQualityPreset] = useState<ScreenShareQualityPreset>('smooth');
  const {
    currentRoom: screenRoom,
    isOwner,
    isSharing,
    isStarting,
    error,
    captureSettings,
    localVideoRef,
    remoteVideoRef,
    startSharing,
    stopSharing,
  } = useScreenShare(qualityPreset);

  const showToast = (message: string, type: ToastProps['type'] = 'info') => {
    setToast({
      message,
      type,
      duration: 3000,
      onClose: () => setToast(null),
    });
  };

  const openDetachedPage = useCallback(() => {
    window.open('/', '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = window.localStorage.getItem(SCREEN_SHARE_QUALITY_KEY);
    if (saved === 'smooth' || saved === 'hd' || saved === 'ultra') {
      setQualityPreset(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SCREEN_SHARE_QUALITY_KEY, qualityPreset);
  }, [qualityPreset]);

  useEffect(() => {
    if (!currentRoom) {
      router.replace('/watch-room');
      return;
    }

    if (currentRoom.roomType !== 'screen') {
      router.replace('/watch-room');
    }
  }, [currentRoom, router]);

  useEffect(() => {
    if (!screenRoom || screenRoom.roomType !== 'screen') return;

    const supportError = isOwner
      ? getScreenShareHostSupportError()
      : getScreenShareViewerSupportError();
    if (supportError) {
      showToast(`当前设备无法使用屏幕共享房间：${supportError}`, 'error');
      leaveRoom();
      router.replace('/watch-room');
    }
  }, [isOwner, leaveRoom, router, screenRoom?.id, screenRoom?.roomType]);

  useEffect(() => {
    if (!screenRoom || !isOwner) return;

    localStorage.setItem(WATCH_ROOM_NO_CONNECT_KEY, '1');
    localStorage.setItem(WATCH_ROOM_NO_CONNECT_TIMESTAMP_KEY, String(Date.now()));
    const heartbeat = window.setInterval(() => {
      localStorage.setItem(WATCH_ROOM_NO_CONNECT_TIMESTAMP_KEY, String(Date.now()));
    }, 30_000);
    const key = `${NEW_TAB_KEY_PREFIX}${screenRoom.id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      openDetachedPage();
    }

    return () => {
      localStorage.removeItem(WATCH_ROOM_NO_CONNECT_KEY);
      localStorage.removeItem(WATCH_ROOM_NO_CONNECT_TIMESTAMP_KEY);
      window.clearInterval(heartbeat);
    };
  }, [isOwner, openDetachedPage, screenRoom?.id]);

  if (!screenRoom || screenRoom.roomType !== 'screen') {
    return null;
  }

  const handleLeave = () => {
    if (isOwner && isSharing) {
      stopSharing(true);
    }
    leaveRoom();
    router.push('/watch-room');
  };

  const captureSettingsText = captureSettings
    ? [
        captureSettings.width && captureSettings.height
          ? `${captureSettings.width}x${captureSettings.height}`
          : '分辨率未知',
        captureSettings.frameRate ? `${Math.round(captureSettings.frameRate)} fps` : '帧率未知',
      ].join(' / ')
    : '未开始';

  return (
    <div className='mtv-scr'>
      {/* 底部留白 + dvh 全在 .mtv-scr-wrap 里：iOS 的 100vh 是「工具栏收起后」
          的高度，按它排版，最后一张卡会永远停在地址栏后面。 */}
      <div className='mtv-scr-wrap'>
        <div className='mtv-scr-bar'>
          <div>
            <h1 className='mtv-scr-h1'>
              <Monitor className='mtv-scr-h1-ic' />
              屏幕共享观影室
            </h1>
            <p className='mtv-scr-sub'>
              房间：{screenRoom.name} · 房主：{screenRoom.ownerName}
            </p>
          </div>
          <div className='mtv-scr-actions'>
            {isOwner && (
              <Link
                href='/'
                target='_blank'
                rel='noreferrer'
                onClick={(event) => {
                  event.preventDefault();
                  openDetachedPage();
                }}
                className='mtv-scr-btn is-primary'
              >
                新开主页
              </Link>
            )}
            <button onClick={handleLeave} className='mtv-scr-btn'>
              离开房间
            </button>
          </div>
        </div>

        <div className='mtv-scr-grid'>
          {/* 画面舞台：高度与 object-fit 都在 .mtv-scr-stage / .mtv-scr-video 里 */}
          <div className='mtv-scr-stage'>
            {isOwner ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className='mtv-scr-video'
              />
            ) : (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                controls
                className='mtv-scr-video'
              />
            )}

            {!isSharing && (
              <div className='mtv-scr-overlay'>
                <MonitorPlay className='mtv-scr-overlay-ic' />
                <p className='mtv-scr-overlay-t'>
                  {isOwner ? '点击开始共享，向房员推送浏览器画面' : '等待房主开始共享屏幕'}
                </p>
                {isOwner && (
                  <p className='mtv-scr-overlay-s'>
                    本页不要关闭；已尝试为你新开一个主页标签页方便继续浏览。
                  </p>
                )}
              </div>
            )}
          </div>

          <div className='mtv-scr-side'>
            <div className='mtv-scr-card'>
              <h2 className='mtv-scr-h2'>共享状态</h2>
              <div className='mtv-scr-kv'>
                <p>类型：屏幕共享</p>
                <p>状态：{isSharing ? '共享中' : '未开始'}</p>
                <p>成员：{members.length} 人</p>
              </div>

              {isOwner && (
                <div className='mtv-scr-kv mt-2'>
                  <p>实际采集：{captureSettingsText}</p>
                </div>
              )}

              {error && <div className='mtv-scr-alert'>{error}</div>}

              {isOwner && (
                <div className='mt-4'>
                  <label className='mtv-scr-label'>共享画质</label>
                  <select
                    value={qualityPreset}
                    onChange={(event) => setQualityPreset(event.target.value as ScreenShareQualityPreset)}
                    disabled={isStarting || isSharing}
                    className='mtv-scr-select'
                  >
                    {screenShareQualityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className='mtv-scr-hint'>
                    画质越高越清晰，但更依赖网络和设备性能。共享开始后不可切换。
                  </p>
                </div>
              )}

              <div className='mtv-scr-vrow'>
                {isOwner ? (
                  <>
                    <button
                      onClick={() => startSharing()}
                      disabled={isStarting || isSharing}
                      className='mtv-scr-btn is-primary is-block'
                    >
                      {isStarting ? '启动中...' : isSharing ? '共享中' : '开始共享'}
                    </button>
                    <button
                      onClick={() => stopSharing(true)}
                      disabled={!isSharing}
                      className='mtv-scr-btn is-danger'
                    >
                      停止
                    </button>
                  </>
                ) : (
                  <div className='mtv-scr-note'>
                    房员无需操作，房主开始共享后会自动显示画面。
                  </div>
                )}
              </div>
            </div>

            <div className='mtv-scr-card'>
              <h2 className='mtv-scr-h2'>
                <Users className='mtv-scr-h2-ic' />
                房间成员
              </h2>
              <div className='mtv-scr-members'>
                {members.map((member) => (
                  <div key={member.id} className='mtv-scr-member'>
                    <span>{member.name}</span>
                    {member.isOwner && (
                      <span className='mtv-scr-owner'>房主</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className='mtv-scr-note'>
              建议使用桌面版 Chrome / Edge，并优先共享标签页。
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );
}
