// 全局聊天悬浮窗和房间信息按钮
'use client';

import { AlertCircle,Check, Copy,Info, Link, LogOut, Maximize2, MessageCircle, Mic, MicOff, Minimize2, Send, Smile, Users, Volume2, VolumeX, X, XCircle } from 'lucide-react';
import { useEffect, useRef,useState } from 'react';

import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useVoiceChat } from '@/hooks/useVoiceChat';

import { useWatchRoomContextSafe } from '@/components/WatchRoomProvider';

const EMOJI_LIST = ['😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '👏', '🎉', '❤️', '🔥', '⭐'];

export default function ChatFloatingWindow() {
  const watchRoom = useWatchRoomContextSafe();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);
  const isOpenRef = useRef(isOpen);
  const isMinimizedRef = useRef(isMinimized);
  const currentRoomIdRef = useRef<string | null>(null);

  // 语音聊天状态
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // 手机端键盘适配：iOS 的 position:fixed 相对「布局视口」定位，键盘弹出后
  // fixed 元素留在原地、被键盘盖住。把「布局视口 - 可视视口」的差值写成
  // --mtv-kb-inset，抽屉就能顶到键盘上沿（见 .mtv-chat 的媒体查询）。
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const syncInset = () => {
      const inset = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
      document.documentElement.style.setProperty(
        '--mtv-kb-inset',
        `${Math.round(inset)}px`
      );
    };
    syncInset();
    vv.addEventListener('resize', syncInset);
    vv.addEventListener('scroll', syncInset);
    return () => {
      vv.removeEventListener('resize', syncInset);
      vv.removeEventListener('scroll', syncInset);
      document.documentElement.style.removeProperty('--mtv-kb-inset');
    };
  }, []);

  // 手机端抽屉打开时锁住背景滚动。不锁的话键盘一弹，浏览器会把文档往下滚去
  // 露出输入框 —— 页面顶部的标题就被推出屏幕，而且文档高度同时收缩，滚不回来。
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen, isMinimized]);

  // 使用语音聊天hook
  const voiceChat = useVoiceChat({
    socket: watchRoom?.socket || null,
    roomId: watchRoom?.currentRoom?.id || null,
    isMicEnabled,
    isSpeakerEnabled,
    members: watchRoom?.members || [],
  });

  // 当房间变化时重置状态
  useEffect(() => {
    const roomId = watchRoom?.currentRoom?.id || null;
    if (roomId !== currentRoomIdRef.current) {
      currentRoomIdRef.current = roomId;
      lastMessageCountRef.current = 0;
      setUnreadCount(0);
      setIsOpen(false);
      setIsMinimized(false);
    }
  }, [watchRoom?.currentRoom?.id]);

  // 同步窗口状态到 ref
  useEffect(() => {
    isOpenRef.current = isOpen;
    isMinimizedRef.current = isMinimized;
  }, [isOpen, isMinimized]);

  // 自动滚动到底部
  useEffect(() => {
    if (messagesEndRef.current && watchRoom?.currentRoom) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [watchRoom?.chatMessages, watchRoom?.currentRoom]);

  // 跟踪未读消息数量
  useEffect(() => {
    if (!watchRoom?.chatMessages) {
      lastMessageCountRef.current = 0;
      return;
    }

    const currentCount = watchRoom.chatMessages.length;

    // 如果消息数量减少了（比如切换房间），重置计数器和未读数
    if (currentCount < lastMessageCountRef.current) {
      lastMessageCountRef.current = currentCount;
      setUnreadCount(0);
      return;
    }

    if (currentCount > lastMessageCountRef.current) {
      // 有新消息
      const newMessageCount = currentCount - lastMessageCountRef.current;

      if (!isOpenRef.current && !isMinimizedRef.current) {
        // 只有在聊天窗口完全关闭时才增加未读计数
        setUnreadCount(prev => prev + newMessageCount);
      }
    }
    lastMessageCountRef.current = currentCount;
  }, [watchRoom?.chatMessages]);

  // 打开聊天窗口时清空未读计数
  useEffect(() => {
    if (isOpen || isMinimized) {
      setUnreadCount(0);
    }
  }, [isOpen, isMinimized]);

  // 处理手动重连
  const handleReconnect = async () => {
    if (!watchRoom?.manualReconnect) return;

    setIsReconnecting(true);
    try {
      await watchRoom.manualReconnect();
    } catch (error) {
      console.error('[ChatFloatingWindow] Reconnect failed:', error);
    } finally {
      setIsReconnecting(false);
    }
  };

  // 如果没有加入房间，只显示重连按钮（如果需要）
  if (!watchRoom?.currentRoom) {
    // 重连失败时显示重连按钮
    if (watchRoom?.reconnectFailed) {
      return (
        <div className="mtv-chat-dock">
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="mtv-fab is-danger is-pulse"
            aria-label="连接失败，点击重连"
            title="连接失败，点击重连"
          >
            <AlertCircle className="h-6 w-6" />
            {isReconnecting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
              </div>
            )}
          </button>
        </div>
      );
    }
    return null;
  }

  const { chatMessages, sendChatMessage, members, isOwner, currentRoom, leaveRoom } = watchRoom;
  // 自己的 socket id：用来把「我发出的」消息靠右对齐
  const selfId = watchRoom?.socket?.id;

  // 邀请链接：打开即自动加入当前房间
  const inviteUrl = typeof window !== 'undefined' && currentRoom
    ? `${window.location.origin}/watch-room?room=${currentRoom.id}`
    : '';

  const handleSendMessage = () => {
    if (!message.trim()) return;

    sendChatMessage(message.trim(), 'text');
    setMessage('');
    setShowEmojiPicker(false);
  };

  const handleSendEmoji = (emoji: string) => {
    sendChatMessage(emoji, 'emoji');
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleLeaveRoom = () => {
    if (confirm(isOwner ? '确定要解散房间吗？所有成员将被踢出房间。' : '确定要退出房间吗？')) {
      leaveRoom();
      setShowRoomInfo(false);
    }
  };

  // 悬浮按钮组
  if (!isOpen && !showRoomInfo) {
    return (
      <div className="mtv-chat-dock">
        {/* 重连失败提示气泡 */}
        {watchRoom?.reconnectFailed && (
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="mtv-fab is-danger is-pulse"
            aria-label="连接失败，点击重连"
            title="连接失败，点击重连"
          >
            <AlertCircle className="h-6 w-6" />
            {isReconnecting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
              </div>
            )}
          </button>
        )}

        {/* 房间信息按钮 */}
        <button
          onClick={() => setShowRoomInfo(true)}
          className="mtv-fab is-surface"
          aria-label="房间信息"
        >
          <Info className="h-6 w-6" />
        </button>

        {/* 聊天按钮 */}
        <button
          onClick={() => setIsOpen(true)}
          className="mtv-fab is-accent"
          aria-label="打开聊天"
        >
          <MessageCircle className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="mtv-fab-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // 房间信息模态框
  if (showRoomInfo) {
    return (
      <>
        {/* 背景遮罩 */}
        <div
          className='mtv-chat-scrim'
          onClick={() => setShowRoomInfo(false)}
          onTouchMove={(e) => {
            e.preventDefault();
          }}
          onWheel={(e) => {
            e.preventDefault();
          }}
          style={{
            touchAction: 'none',
          }}
        />

        {/* 房间信息面板 */}
        <div className='mtv-chat-modal'>
          <div
            className='mtv-chat-modal-body'
            data-panel-content
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto',
            }}
          >
            {/* 标题栏 */}
            <div className='mtv-chat-modal-head'>
              <div className='flex items-center gap-3'>
                <Info className='mtv-chat-modal-ic' />
                <h3 className='mtv-chat-modal-t'>房间信息</h3>
              </div>
              <button
                onClick={() => setShowRoomInfo(false)}
                className='mtv-chat-modal-close'
                aria-label='关闭'
              >
                <X className='h-5 w-5' />
              </button>
            </div>

            {/* 内容 */}
            <div className='mtv-chat-modal-list'>
              {/* 房间基本信息 */}
              <div className='space-y-3'>
                <div className='mtv-chat-row'>
                  <span className='mtv-chat-row-k'>房间名称</span>
                  <span className='mtv-chat-row-v'>{currentRoom.name}</span>
                </div>

                <div className='mtv-chat-row'>
                  <span className='mtv-chat-row-k'>房间号</span>
                  <span className='mtv-chat-row-v is-mono'>{currentRoom.id}</span>
                </div>

                {currentRoom.description && (
                  <div className='mtv-chat-row is-block'>
                    <span className='mtv-chat-row-k'>房间描述</span>
                    <p className='mtv-chat-row-p'>{currentRoom.description}</p>
                  </div>
                )}

                <div className='mtv-chat-row'>
                  <span className='mtv-chat-row-k'>房主</span>
                  <span className='mtv-chat-row-v'>{currentRoom.ownerName}</span>
                </div>
              </div>

              {/* 一键加入链接 */}
              <div className='mtv-chat-row is-block'>
                <div className='flex items-center gap-2 mb-2'>
                  <Link className='mtv-chat-row-ic' />
                  <span className='mtv-chat-row-k'>一键加入链接</span>
                </div>
                <div className='flex items-center gap-2'>
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.target.select()}
                    className='mtv-chat-invite'
                    aria-label='邀请链接'
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        setInviteCopied(true);
                        setTimeout(() => setInviteCopied(false), 2000);
                      } catch {
                        // 剪贴板不可用时回退到手动选择输入框
                      }
                    }}
                    className='mtv-chat-copy'
                  >
                    {inviteCopied ? (
                      <>
                        <Check className='h-3.5 w-3.5' />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className='h-3.5 w-3.5' />
                        复制
                      </>
                    )}
                  </button>
                </div>
                <p className='mtv-chat-hint'>
                  好友打开链接后即可自动加入房间（密码房仍需输入密码）
                </p>
              </div>

              {/* 成员列表 */}
              <div className='mtv-chat-row is-block'>
                <div className='flex items-center gap-2 mb-3'>
                  <Users className='mtv-chat-row-ic' />
                  <span className='mtv-chat-row-k'>成员列表 ({members.length})</span>
                </div>
                <div className='mtv-chat-mlist'>
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className='mtv-chat-mrow'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='mtv-chat-mavatar'>
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <span className='mtv-chat-mname'>{member.name}</span>
                      </div>
                      {member.isOwner && (
                        <span className='mtv-chat-mowner'>
                          房主
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <button
                onClick={handleLeaveRoom}
                className={`mtv-wr-btn is-block ${isOwner ? 'is-danger' : 'is-subtle'}`}
              >
                {isOwner ? (
                  <>
                    <XCircle className='h-5 w-5' />
                    解散房间
                  </>
                ) : (
                  <>
                    <LogOut className='h-5 w-5' />
                    退出房间
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // 最小化状态
  if (isMinimized) {
    return (
      <div className='mtv-chat-dock'>
        {/* 重连失败提示气泡 */}
        {watchRoom?.reconnectFailed && (
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="mtv-fab is-danger is-pulse"
            aria-label="连接失败，点击重连"
            title="连接失败，点击重连"
          >
            <AlertCircle className="h-5 w-5" />
            {isReconnecting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
              </div>
            )}
          </button>
        )}

        {/* 房间信息按钮 */}
        <button
          onClick={() => setShowRoomInfo(true)}
          className="mtv-fab is-surface"
          aria-label="房间信息"
        >
          <Info className="h-5 w-5" />
        </button>

        {/* 最小化的聊天窗口 */}
        <div className="mtv-chat-mini">
          <MessageCircle className="h-5 w-5 text-white" />
          <span className="mtv-chat-title">聊天室</span>
          <button
            onClick={() => setIsMinimized(false)}
            className="mtv-chat-mini-btn"
            aria-label="展开"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="mtv-chat-mini-btn"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // 完整聊天窗口
  return (
    <div className='mtv-chat-dock'>
      {/* 重连失败提示气泡 */}
      {watchRoom?.reconnectFailed && (
        <button
          onClick={handleReconnect}
          disabled={isReconnecting}
          className="mtv-fab is-danger is-pulse"
          aria-label="连接失败，点击重连"
          title="连接失败，点击重连"
        >
          <AlertCircle className="h-5 w-5" />
          {isReconnecting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
            </div>
          )}
        </button>
      )}

      {/* 房间信息按钮 */}
      <button
        onClick={() => setShowRoomInfo(true)}
        className="mtv-fab is-surface"
        aria-label="房间信息"
      >
        <Info className="h-5 w-5" />
      </button>

      {/* 聊天窗口 */}
      <div className="mtv-chat">
      {/* 头部 */}
      <div className="mtv-chat-head">
        {/* 第一行: 标题和窗口控制 */}
        <div className="mtv-chat-head-row">
          <div className="mtv-chat-head-title">
            <MessageCircle className="h-4 w-4" />
            <span className="mtv-chat-title">聊天室</span>
            <span className="mtv-chat-dot" aria-hidden="true" />
            <span className="mtv-chat-sub">{members.length} 人在线</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowRoomInfo(true)}
              className="mtv-chat-iconbtn"
              aria-label="房间信息"
              title="房间信息"
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              className="mtv-chat-iconbtn"
              aria-label="最小化"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="mtv-chat-iconbtn"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 第二行: 语音控制按钮 */}
        <div className="mtv-chat-tools">
          <div className="flex items-center justify-start gap-2 mb-1">
            {/* 麦克风按钮 */}
            <button
              onClick={() => setIsMicEnabled(!isMicEnabled)}
              disabled={voiceChat.isConnecting}
              className={`mtv-chat-toggle${isMicEnabled ? ' is-on' : ''}`}
              aria-label={isMicEnabled ? '关闭麦克风' : '开启麦克风'}
            >
              {isMicEnabled ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
              <span>{isMicEnabled ? '麦克风开' : '麦克风关'}</span>
            </button>

            {/* 喇叭按钮 */}
            <button
              onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
              className={`mtv-chat-toggle${isSpeakerEnabled ? ' is-on' : ''}`}
              aria-label={isSpeakerEnabled ? '关闭喇叭' : '开启喇叭'}
            >
              {isSpeakerEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
              <span>{isSpeakerEnabled ? '喇叭开' : '喇叭关'}</span>
            </button>
          </div>

          {/* 状态指示 */}
          <div className="mtv-chat-status">
            {voiceChat.isConnecting && '正在连接...'}
            {voiceChat.error && (
              <span className="mtv-chat-status-err">{voiceChat.error}</span>
            )}
            {!voiceChat.isConnecting && !voiceChat.error && isMicEnabled && (
              <span>
                {voiceChat.strategy === 'webrtc-fallback' ? 'WebRTC模式' : '服务器中转模式'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="mtv-chat-msgs" style={{ maxHeight: 'min(400px, 46dvh)' }}>
        {chatMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <MessageCircle className="mtv-chat-empty-ic" />
              <p className="mtv-chat-empty-t">还没有消息</p>
              <p className="mtv-chat-empty-s">发送第一条消息吧</p>
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg) => {
              const isOwn = Boolean(selfId) && msg.userId === selfId;
              return (
                <div
                  key={msg.id}
                  className={`mtv-chat-item${isOwn ? ' is-own' : ''}`}
                >
                  {!isOwn && (
                    <div className="mtv-chat-item-head">
                      <span className="mtv-chat-name">{msg.userName}</span>
                      <span className="mtv-chat-time">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  )}
                  <div className="mtv-chat-item-body">
                    {!isOwn && (
                      <span className="mtv-chat-avatar" aria-hidden="true">
                        {(msg.userName || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div
                      className={`mtv-chat-msg${msg.type === 'emoji' ? ' is-emoji' : ''}`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 输入区域 */}
      <div className="mtv-chat-input">
        {/* 表情选择器 */}
        {showEmojiPicker && (
          <div className="mtv-chat-emoji">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendEmoji(emoji)}
                className="mtv-chat-emoji-btn"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="mtv-chat-inputbtn"
            aria-label="表情"
          >
            <Smile className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            className="mtv-chat-field"
            maxLength={200}
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim()}
            className="mtv-chat-send"
            aria-label="发送"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 房间信息提示 */}
      <div className="mtv-chat-foot">
        {isOwner ? (
          <span className="mtv-chat-foot-owner">👑 您是房主</span>
        ) : (
          <span>房间: {watchRoom.currentRoom.name}</span>
        )}
      </div>
    </div>
    </div>
  );
}
