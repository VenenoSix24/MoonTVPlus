// 观影室首页 - 选项卡式界面
'use client';

import { List as ListIcon, Lock, RefreshCw,UserPlus, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect,useRef,useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { getStoredRoomInfo } from '@/hooks/useWatchRoom';

import PageLayout from '@/components/PageLayout';
import Toast, { ToastProps } from '@/components/Toast';
import { useWatchRoomContext } from '@/components/WatchRoomProvider';

import type { Room, RoomType } from '@/types/watch-room';

type TabType = 'create' | 'join' | 'list';

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

export default function WatchRoomPage() {
  return (
    <Suspense fallback={null}>
      <WatchRoomPageContent />
    </Suspense>
  );
}

function WatchRoomPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkRoomId = searchParams.get('room');
  const watchRoom = useWatchRoomContext();
  const { getRoomList, isConnected, createRoom, joinRoom, currentRoom, isOwner, members, socket } = watchRoom;
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [musicEnabled, setMusicEnabled] = useState(false);

  // 获取当前登录用户（在客户端挂载后读取，避免 hydration 错误）
  const [currentUsername, setCurrentUsername] = useState<string>('游客');

  useEffect(() => {
    const authInfo = getAuthInfoFromBrowserCookie();
    setCurrentUsername(authInfo?.username || '游客');
  }, []);

  useEffect(() => {
    setMusicEnabled(Boolean((window as any).RUNTIME_CONFIG?.MUSIC_ENABLED));
  }, []);

  // 创建房间表单
  const [createForm, setCreateForm] = useState({
    roomName: '',
    description: '',
    password: '',
    isPublic: true,
    roomType: 'sync' as RoomType,
  });

  // 加入房间表单
  const [joinForm, setJoinForm] = useState({
    roomId: '',
    password: '',
  });

  // 房间列表
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [toast, setToast] = useState<ToastProps | null>(null);

  const showToast = (message: string, type: ToastProps['type'] = 'info') => {
    setToast({
      message,
      type,
      duration: 3000,
      onClose: () => setToast(null),
    });
  };

  const getAvatarText = (name?: string) => (name?.trim().charAt(0).toUpperCase() || '用');

  // 加载房间列表
  const loadRooms = async (showLoading = false) => {
    if (!isConnected) return;

    if (showLoading) {
      setLoading(true);
    }
    try {
      const roomList = await getRoomList();
      setRooms(roomList);
    } catch (error) {
      console.error('[WatchRoom] Failed to load rooms:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // 切换到房间列表 tab 时加载房间
  useEffect(() => {
    if (activeTab === 'list') {
      loadRooms(true);
      // 每5秒刷新一次
      const interval = setInterval(() => loadRooms(false), 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, isConnected]);

  // 处理创建房间
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.roomName.trim()) {
      showToast('请输入房间名称', 'error');
      return;
    }

    if (createForm.roomType === 'screen') {
      const supportError = getScreenShareHostSupportError();
      if (supportError) {
        showToast(`当前设备无法创建屏幕共享房间：${supportError}`, 'error');
        return;
      }
    }

    setCreateLoading(true);
    try {
      await createRoom({
        name: createForm.roomName.trim(),
        description: createForm.description.trim(),
        password: createForm.password.trim() || undefined,
        isPublic: createForm.isPublic,
        roomType: createForm.roomType,
        userName: currentUsername,
      });

      // 清空表单
      setCreateForm({
        roomName: '',
        description: '',
        password: '',
        isPublic: true,
        roomType: 'sync',
      });
    } catch (error: any) {
      showToast(error.message || '创建房间失败', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  // 处理加入房间
  const handleJoinRoom = async (e: React.FormEvent, roomId?: string) => {
    e.preventDefault();
    const targetRoomId = roomId || joinForm.roomId.trim().toUpperCase();
    if (!targetRoomId) {
      showToast('请输入房间ID', 'error');
      return;
    }

    const targetRoom = rooms.find((room) => room.id === targetRoomId);
    if (targetRoom?.roomType === 'screen') {
      const supportError = getScreenShareViewerSupportError();
      if (supportError) {
        showToast(`当前设备无法加入屏幕共享房间：${supportError}`, 'error');
        return;
      }
    }

    setJoinLoading(true);
    try {
      const result = await joinRoom({
        roomId: targetRoomId,
        password: joinForm.password.trim() || undefined,
        userName: currentUsername,
      });

      // 清空表单
      setJoinForm({
        roomId: '',
        password: '',
      });

      // 注意：加入房间后，isOwner 状态会在 useWatchRoom 中更新
      // 跳转逻辑会在 useEffect 中处理
    } catch (error: any) {
      showToast(error.message || '加入房间失败', 'error');
    } finally {
      setJoinLoading(false);
    }
  };

  // 通过邀请链接进入时自动加入房间（已加入则跳过）
  const autoJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!linkRoomId || autoJoinAttemptedRef.current) return;
    if (!watchRoom.isConnected || currentRoom) return;

    // 房主不接受邀请链接：直接拒绝加入
    if (getStoredRoomInfo()?.isOwner) {
      autoJoinAttemptedRef.current = true;
      showToast('你是房间房主，无法通过邀请链接加入', 'error');
      return;
    }

    autoJoinAttemptedRef.current = true;
    joinRoom({
      roomId: linkRoomId.trim().toUpperCase(),
      userName: currentUsername,
    }).catch((error: any) => {
      showToast(error.message || '加入房间失败', 'error');
    });
  }, [linkRoomId, watchRoom.isConnected, currentRoom, currentUsername, joinRoom]);

  // 监听房间状态，房员加入后自动跟随房主播放
  useEffect(() => {
    if (!currentRoom || isOwner) return;

    if (currentRoom.roomType === 'screen') {
      router.push('/watch-room/screen');
      return;
    }

    if (currentRoom.roomType === 'music') {
      router.push('/watch-room/music');
      return;
    }

    // 进度同步房：房主正在播放时自动跟随
    const state = currentRoom.currentState;
    if (state?.type === 'play') {
      const params = new URLSearchParams({
        id: state.videoId,
        source: state.source,
        episode: String(state.episode || 1),
      });
      if (state.videoName) params.set('title', state.videoName);
      if (state.videoYear) params.set('year', state.videoYear);
      if (state.searchTitle) params.set('stitle', state.searchTitle);
      router.push(`/play?${params.toString()}`);
    }
    // 房主暂无播放状态时停留在本页等待，房主开始播放后会收到 play:change 自动跟随
  }, [currentRoom, isOwner]);

  // 监听房主的主动操作（切换视频/频道）
  useEffect(() => {
    if (!currentRoom || isOwner) return;

    if (currentRoom.roomType === 'screen' || currentRoom.roomType === 'music') return;

    const handlePlayChange = (state: any) => {
      if (state.type === 'play') {
        const params = new URLSearchParams({
          id: state.videoId,
          source: state.source,
          episode: String(state.episode || 1),
        });

        if (state.videoName) params.set('title', state.videoName);
        if (state.videoYear) params.set('year', state.videoYear);
        if (state.searchTitle) params.set('stitle', state.searchTitle);

        router.push(`/play?${params.toString()}`);
      }
    };

    const handleLiveChange = (state: any) => {
      if (state.type === 'live') {
        // 判断是否为 weblive 格式（channelUrl 包含 platform:roomId）
        if (state.channelUrl && state.channelUrl.includes(':')) {
          // weblive 格式，导航到 web-live 页面
          // channelId 是 sourceKey，channelUrl 是 platform:roomId
          const [platform, roomId] = state.channelUrl.split(':');
          router.push(`/web-live?platform=${platform}&roomId=${roomId}`);
        } else {
          // 普通 live 格式，导航到 live 页面
          router.push(`/live?id=${state.channelId}`);
        }
      }
    };

    // 监听房主切换视频/频道的事件
    if (socket) {
      socket.on('play:change', handlePlayChange);
      socket.on('live:change', handleLiveChange);

      return () => {
        socket.off('play:change', handlePlayChange);
        socket.off('live:change', handleLiveChange);
      };
    }
  }, [currentRoom, isOwner, router, socket]);

  // 屏幕共享房间创建/加入后直接进入共享页
  useEffect(() => {
    if (currentRoom?.roomType === 'screen') {
      router.push('/watch-room/screen');
    } else if (currentRoom?.roomType === 'music' && !isOwner) {
      router.push('/watch-room/music');
    }
  }, [currentRoom?.id, currentRoom?.roomType, isOwner, router]);

  // 从房间列表加入房间
  const handleJoinFromList = (room: Room) => {
    if (room.roomType === 'screen') {
      const supportError = getScreenShareViewerSupportError();
      if (supportError) {
        showToast(`当前设备无法加入屏幕共享房间：${supportError}`, 'error');
        return;
      }
    }

    setJoinForm({
      roomId: room.id,
      password: '',
    });
    setActiveTab('join');
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  };

  const tabs = [
    { id: 'create' as TabType, label: '创建房间', icon: Users },
    { id: 'join' as TabType, label: '加入房间', icon: UserPlus },
    { id: 'list' as TabType, label: '房间列表', icon: ListIcon },
  ];

  return (
    <PageLayout activePath="/watch-room">
      <div className="mtv-wr">
        {/* 房员等待提示 */}
        {currentRoom && !isOwner && (
          <div className="mtv-wr-wait">
            <div className="mtv-wr-wait-row">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative">
                  <div className="mtv-wr-wait-spin" />
                </div>
                <div className="flex-1">
                  <h3 className="mtv-wr-wait-t">
                    {currentRoom.roomType === 'screen'
                      ? currentRoom.currentState?.type === 'screen' ? '房主正在共享屏幕' : '等待房主开始共享'
                      : currentRoom.currentState ? '房主正在播放' : '等待房主开始播放'}
                  </h3>
                  <p className="mtv-wr-wait-s">
                    房间: {currentRoom.name} | 房主: {currentRoom.ownerName}
                  </p>
                  {currentRoom.currentState && (
                    <p className="mtv-wr-wait-s">
                      {currentRoom.currentState.type === 'play'
                        ? `${currentRoom.currentState.videoName || '未知视频'}`
                        : currentRoom.currentState.type === 'live'
                          ? `${currentRoom.currentState.channelName || '未知频道'}`
                          : '屏幕共享进行中'}
                    </p>
                  )}
                  {!currentRoom.currentState && (
                    <p className="mtv-wr-wait-s">
                      {currentRoom.roomType === 'screen' ? '当房主开始共享时，您将自动进入共享页' : '当房主开始播放时，您将自动跟随'}
                    </p>
                  )}
                </div>
              </div>
              {currentRoom.currentState && (
                <button
                  onClick={() => {
                    const state = currentRoom.currentState!;
                    if (state.type === 'play') {
                      const params = new URLSearchParams({
                        id: state.videoId,
                        source: state.source,
                        episode: String(state.episode || 1),
                      });
                      if (state.videoName) params.set('title', state.videoName);
                      if (state.videoYear) params.set('year', state.videoYear);
                      if (state.searchTitle) params.set('stitle', state.searchTitle);
                      router.push(`/play?${params.toString()}`);
                    } else if (state.type === 'live') {
                      // 判断是否为 weblive 格式（channelUrl 包含 platform:roomId）
                      if (state.channelUrl && state.channelUrl.includes(':')) {
                        // weblive 格式，导航到 web-live 页面
                        const [platform, roomId] = state.channelUrl.split(':');
                        router.push(`/web-live?platform=${platform}&roomId=${roomId}`);
                      } else {
                        // 普通 live 格式，导航到 live 页面
                        router.push(`/live?id=${state.channelId}`);
                      }
                    } else if (state.type === 'screen') {
                      router.push('/watch-room/screen');
                    }
                  }}
                  className="mtv-wr-wait-btn"
                >
                  立即加入
                </button>
              )}
            </div>
          </div>
        )}

        {/* 页面标题 */}
        <div className="mtv-wr-head">
          <h1 className="mtv-wr-h1">
            <Users className="mtv-wr-h1-ic" />
            观影室
            {currentRoom && (
              <span className="mtv-wr-h1-tag">
                ({isOwner ? '房主' : '房员'})
              </span>
            )}
          </h1>
          <p className="mtv-wr-sub">
            与好友一起看视频，支持进度同步或屏幕共享
          </p>
        </div>

        {/* 选项卡 */}
        <div className="mtv-wr-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`mtv-wr-tab${activeTab === tab.id ? ' is-active' : ''}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 选项卡内容 */}
        <div className="flex-1">
          {/* 创建房间 */}
          {activeTab === 'create' && (
            <div className="mtv-wr-panel">
              <div className="mtv-wr-card">
                <h2 className="mtv-wr-h2">
                  创建新房间
                </h2>

                {/* 如果已在房间内，显示当前房间信息 */}
                {currentRoom ? (
                  <div className="space-y-4">
                    {/* 房间信息卡片 */}
                    <div className="mtv-wr-hero">
                      <div className="mtv-wr-hero-head">
                        <div>
                          <h3 className="text-2xl font-bold mb-1">{currentRoom.name}</h3>
                          <p className="mtv-wr-hero-sub">{currentRoom.description || '暂无描述'}</p>
                        </div>
                        {isOwner && (
                          <span className="mtv-wr-owner">
                            房主
                          </span>
                        )}
                      </div>

                      <div className="mtv-wr-stats">
                        <div className="mtv-wr-stat">
                          <p className="mtv-wr-stat-k">房间号</p>
                          <p className="mtv-wr-stat-v is-mono">{currentRoom.id}</p>
                        </div>
                        <div className="mtv-wr-stat">
                          <p className="mtv-wr-stat-k">成员数</p>
                          <p className="mtv-wr-stat-v">{members.length} 人</p>
                        </div>
                        <div className="mtv-wr-stat">
                          <p className="mtv-wr-stat-k">房间类型</p>
                          <p className="mtv-wr-stat-v">{currentRoom.roomType === 'screen' ? '屏幕共享' : currentRoom.roomType === 'music' ? '一起听' : '进度同步'}</p>
                        </div>
                      </div>
                    </div>

                    {/* 成员列表 */}
                    <div className="mtv-wr-members">
                      <h4 className="mtv-wr-members-h">房间成员</h4>
                      <div className="space-y-2">
                        {members.map((member) => (
                          <div
                            key={member.id}
                            className="mtv-wr-member"
                          >
                            <div className="flex items-center gap-3">
                              <div className="mtv-wr-avatar">
                                {getAvatarText(member.name)}
                              </div>
                              <span className="mtv-wr-strong">
                                {member.name}
                              </span>
                            </div>
                            {member.isOwner && (
                              <span className="mtv-wr-member-owner">
                                房主
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 提示信息 */}
                    <div className="mtv-wr-note">
                      <p className="mtv-wr-note-t">
                        💡 {currentRoom.roomType === 'screen'
                          ? '这是屏幕共享房间，创建后将进入共享页，由房主发起屏幕共享'
                          : currentRoom.roomType === 'music'
                            ? '进入音乐页面后，房间成员将同步收听您的播放列表'
                            : '前往播放页面或直播页面开始观影，房间成员将自动同步您的操作'}
                      </p>
                    </div>
                    {currentRoom.roomType === 'music' && isOwner && (
                      <button
                        type="button"
                        onClick={() => router.push('/music?watchRoom=music')}
                        className="mtv-wr-btn is-primary is-block"
                      >
                        进入音乐页面
                      </button>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleCreateRoom} className="mtv-wr-form">
                  {/* 显示当前用户 */}
                  <div className="mtv-wr-note">
                    <p className="mtv-wr-note-t">
                      <strong>当前用户：</strong>{currentUsername}
                    </p>
                  </div>

                  <div>
                    <label className="mtv-wr-label">
                      房间名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.roomName}
                      onChange={(e) => setCreateForm({ ...createForm, roomName: e.target.value })}
                      placeholder="请输入房间名称"
                      className="mtv-wr-input"
                      maxLength={50}
                      required
                    />
                  </div>

                  <div>
                    <label className="mtv-wr-label">
                      房间描述
                    </label>
                    <textarea
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder="请输入房间描述（可选）"
                      className="mtv-wr-input"
                      rows={3}
                      maxLength={200}
                    />
                  </div>

                  <div>
                    <label className="mtv-wr-label">
                      房间密码
                    </label>
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      placeholder="留空表示无需密码"
                      className="mtv-wr-input"
                      maxLength={20}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={createForm.isPublic}
                      onChange={(e) => setCreateForm({ ...createForm, isPublic: e.target.checked })}
                      className="mtv-wr-check"
                    />
                    <label htmlFor="isPublic" className="mtv-wr-check-t">
                      在房间列表中公开显示
                    </label>
                  </div>

                  <div>
                    <label className="mtv-wr-label">
                      房间类型
                    </label>
                    <div className={`mtv-wr-opts${musicEnabled ? ' is-three' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, roomType: 'sync' })}
                        className={`mtv-wr-opt${createForm.roomType === 'sync' ? ' is-on' : ''}`}
                      >
                        <div className="mtv-wr-opt-t">进度同步</div>
                        <div className="mtv-wr-opt-d">统一播放进度（适合双方网络稳定的情况）</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, roomType: 'screen' })}
                        className={`mtv-wr-opt${createForm.roomType === 'screen' ? ' is-on' : ''}`}
                      >
                        <div className="mtv-wr-opt-t">屏幕共享</div>
                        <div className="mtv-wr-opt-d">房员直接观看房主共享的浏览器画面（适合完全实时同步的情况）</div>
                      </button>
                      {musicEnabled && (
                        <button
                          type="button"
                          onClick={() => setCreateForm({ ...createForm, roomType: 'music' })}
                          className={`mtv-wr-opt${createForm.roomType === 'music' ? ' is-on' : ''}`}
                        >
                          <div className="mtv-wr-opt-t">一起听</div>
                          <div className="mtv-wr-opt-d">房主控制音乐播放，房员同步收听播放列表</div>
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={createLoading || !createForm.roomName.trim()}
                    className="mtv-wr-btn is-primary is-block"
                  >
                    {createLoading ? '创建中...' : '创建房间'}
                  </button>
                </form>
                )}
              </div>

              {/* 使用说明 - 仅在未在房间内时显示 */}
              {!currentRoom && (
                <div className="mtv-wr-note">
                  <p className="mtv-wr-note-t">
                    <strong>提示：</strong>创建房间后，您将成为房主。进度同步房会跟随播放状态，屏幕共享房会进入独立共享页。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 加入房间 */}
          {activeTab === 'join' && (
            <div className="mtv-wr-panel">
              <div className="mtv-wr-card">
                <h2 className="mtv-wr-h2">
                  加入房间
                </h2>

                {/* 如果已在房间内，显示当前房间信息 */}
                {currentRoom ? (
                  <div className="space-y-4">
                    {/* 房间信息卡片 */}
                    <div className="mtv-wr-hero">
                      <div className="mtv-wr-hero-head">
                        <div>
                          <h3 className="text-2xl font-bold mb-1">{currentRoom.name}</h3>
                          <p className="mtv-wr-hero-sub">{currentRoom.description || '暂无描述'}</p>
                        </div>
                        {isOwner && (
                          <span className="mtv-wr-owner">
                            房主
                          </span>
                        )}
                      </div>

                      <div className="mtv-wr-stats">
                        <div className="mtv-wr-stat">
                          <p className="mtv-wr-stat-k">房间号</p>
                          <p className="mtv-wr-stat-v is-mono">{currentRoom.id}</p>
                        </div>
                        <div className="mtv-wr-stat">
                          <p className="mtv-wr-stat-k">成员数</p>
                          <p className="mtv-wr-stat-v">{members.length} 人</p>
                        </div>
                        <div className="mtv-wr-stat">
                          <p className="mtv-wr-stat-k">房间类型</p>
                          <p className="mtv-wr-stat-v">{currentRoom.roomType === 'screen' ? '屏幕共享' : '进度同步'}</p>
                        </div>
                      </div>
                    </div>

                    {/* 成员列表 */}
                    <div className="mtv-wr-members">
                      <h4 className="mtv-wr-members-h">房间成员</h4>
                      <div className="space-y-2">
                        {members.map((member) => (
                          <div
                            key={member.id}
                            className="mtv-wr-member"
                          >
                            <div className="flex items-center gap-3">
                              <div className="mtv-wr-avatar">
                                {getAvatarText(member.name)}
                              </div>
                              <span className="mtv-wr-strong">
                                {member.name}
                              </span>
                            </div>
                            {member.isOwner && (
                              <span className="mtv-wr-member-owner">
                                房主
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 提示信息 */}
                    <div className="mtv-wr-note">
                      <p className="mtv-wr-note-t">
                        💡 {currentRoom.roomType === 'screen'
                          ? '这是屏幕共享房间，进入后即可观看房主共享画面'
                          : isOwner ? '前往播放页面或直播页面开始观影，房间成员将自动同步您的操作' : '等待房主开始播放，您的播放进度将自动跟随房主'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleJoinRoom} className="mtv-wr-form">
                  {/* 显示当前用户 */}
                  <div className="mtv-wr-note">
                    <p className="mtv-wr-note-t">
                      <strong>当前用户：</strong>{currentUsername}
                    </p>
                  </div>

                  <div>
                    <label className="mtv-wr-label">
                      房间号 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={joinForm.roomId}
                      onChange={(e) => setJoinForm({ ...joinForm, roomId: e.target.value.toUpperCase() })}
                      placeholder="请输入6位房间号"
                      className="mtv-wr-input is-mono"
                      maxLength={6}
                      required
                    />
                  </div>

                  <div>
                    <label className="mtv-wr-label">
                      房间密码
                    </label>
                    <input
                      type="password"
                      value={joinForm.password}
                      onChange={(e) => setJoinForm({ ...joinForm, password: e.target.value })}
                      placeholder="如果房间有密码，请输入"
                      className="mtv-wr-input"
                      maxLength={20}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={joinLoading || !joinForm.roomId.trim()}
                    className="mtv-wr-btn is-primary is-block"
                  >
                    {joinLoading ? '加入中...' : '加入房间'}
                  </button>
                </form>
                )}
              </div>

              {/* 使用说明 - 仅在未在房间内时显示 */}
              {!currentRoom && (
                <div className="mtv-wr-note">
                  <p className="mtv-wr-note-t">
                    <strong>提示：</strong>加入进度同步房后将跟随播放，加入屏幕共享房后会进入共享页面。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 房间列表 */}
          {activeTab === 'list' && (
            <div className="py-4">
              {/* 顶部操作栏 */}
              <div className="mtv-wr-list-bar">
                <p className="mtv-wr-list-count">
                  找到 <span className="mtv-wr-strong">{rooms.length}</span> 个公开房间
                </p>
                <button
                  onClick={() => loadRooms(true)}
                  disabled={loading}
                  className="mtv-wr-btn is-subtle"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>

              {/* 加载中 */}
              {loading && rooms.length === 0 && (
                <div className="mtv-wr-empty">
                  <div className="text-center">
                    <RefreshCw className="mtv-wr-empty-ic" />
                    <p className="mtv-wr-empty-t">加载中...</p>
                  </div>
                </div>
              )}

              {/* 空状态 */}
              {!loading && rooms.length === 0 && (
                <div className="mtv-wr-empty">
                  <div className="text-center">
                    <Users className="mtv-wr-empty-ic" />
                    <p className="mtv-wr-empty-t is-strong">暂无公开房间</p>
                    <p className="mtv-wr-empty-s">
                      创建一个新房间或通过房间号加入私密房间
                    </p>
                  </div>
                </div>
              )}

              {/* 房间卡片列表 */}
              {rooms.length > 0 && (
                <div className="mtv-wr-rooms">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="mtv-wr-room"
                    >
                      <div className="mtv-wr-room-head">
                        <div className="flex-1 min-w-0">
                          <h3 className="mtv-wr-room-t">
                            {room.name}
                          </h3>
                          {room.description && (
                            <p className="mtv-wr-room-d">
                              {room.description}
                            </p>
                          )}
                        </div>
                        {room.password && (
                          <Lock className="mtv-wr-room-lock" />
                        )}
                      </div>

                      <div className="mtv-wr-room-meta">
                        <div className="mtv-wr-room-row">
                          <span className="mtv-wr-room-k">房间号</span>
                          <span className="mtv-wr-room-id">
                            {room.id}
                          </span>
                        </div>
                        <div className="mtv-wr-room-row is-inline">
                          <Users className="w-4 h-4" />
                          <span>{room.memberCount} 人在线</span>
                        </div>
                        <div className="mtv-wr-room-row">
                          <span>房主</span>
                          <span className="font-medium">{room.ownerName}</span>
                        </div>
                        <div className="mtv-wr-room-row">
                          <span>类型</span>
                          <span>{room.roomType === 'screen' ? '屏幕共享' : room.roomType === 'music' ? '一起听' : '进度同步'}</span>
                        </div>
                        <div className="mtv-wr-room-row">
                          <span>创建时间</span>
                          <span>{formatTime(room.createdAt)}</span>
                        </div>
                        {room.currentState && (
                          <div className="mtv-wr-room-live">
                            <p className="mtv-wr-room-live-t">
                              {room.currentState.type === 'play'
                                ? `正在播放: ${room.currentState.videoName}`
                                : room.currentState.type === 'live'
                                  ? `正在观看: ${room.currentState.channelName}`
                                  : room.currentState.type === 'music'
                                    ? `正在听: ${room.currentState.song.name} - ${room.currentState.song.artist}`
                                    : '正在共享屏幕'}
                            </p>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleJoinFromList(room)}
                        className="mtv-wr-btn is-primary is-block"
                      >
                        加入房间
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {toast && <Toast {...toast} />}
    </PageLayout>
  );
}
