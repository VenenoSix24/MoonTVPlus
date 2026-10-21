'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

interface HttpWarningDialogProps {
  onClose: () => void;
}

export default function HttpWarningDialog({ onClose }: HttpWarningDialogProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // 检查是否应该显示弹窗
    const checkShouldShow = () => {
      // 只在客户端执行
      if (typeof window === 'undefined') return false;

      // 检查是否已经选择不再提示
      const dontShowAgain = localStorage.getItem('httpWarningDismissed');
      if (dontShowAgain === 'true') return false;

      // 检查是否是站长
      const authInfo = getAuthInfoFromBrowserCookie();
      if (!authInfo || authInfo.role !== 'owner') return false;

      // 检查是否是 HTTP 环境（非 localhost 和 127.0.0.1）
      const { protocol, hostname } = window.location;
      const isHttp = protocol === 'http:';
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      // 只在 HTTP 且非本地环境下显示
      return isHttp && !isLocalhost;
    };

    const shouldDisplay = checkShouldShow();
    setShouldShow(shouldDisplay);

    if (shouldDisplay) {
      // 延迟显示动画
      setTimeout(() => setIsVisible(true), 100);
    }
  }, []);

  const handleDontShowAgain = () => {
    localStorage.setItem('httpWarningDismissed', 'true');
    handleClose();
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  // 如果不需要显示，直接返回 null
  if (!shouldShow) return null;

  return createPortal(
    <div
      className={`mtv-httpwarn-scrim ${isVisible ? 'is-open' : ''}`}
      onClick={handleClose}
    >
      <div
        className='mtv-httpwarn-card'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-labelledby='mtv-httpwarn-title'
      >
        <div className='mtv-httpwarn-body'>
          <div className='mtv-httpwarn-head'>
            <span className='mtv-httpwarn-icon' aria-hidden='true'>
              <AlertTriangle className='h-5 w-5' />
            </span>
            <h3 id='mtv-httpwarn-title' className='mtv-httpwarn-title'>
              HTTP 环境功能限制提示
            </h3>
            <button
              type='button'
              className='mtv-httpwarn-close'
              onClick={handleClose}
              aria-label='关闭'
            >
              <X className='h-4 w-4' />
            </button>
          </div>

          <p className='mtv-httpwarn-text'>
            检测到您正在使用 HTTP 协议访问本站。受浏览器安全策略限制，以下功能无法正常使用：
          </p>

          <ul className='mtv-httpwarn-list'>
            <li>视频超分（AI 画质增强）</li>
            <li>麦克风语音功能</li>
            <li>其他需要安全上下文的高级功能</li>
          </ul>

          <p className='mtv-httpwarn-tip'>
            建议配置 HTTPS 证书以获得完整功能体验。
          </p>

          <div className='mtv-httpwarn-actions'>
            <button
              type='button'
              onClick={handleDontShowAgain}
              className='mtv-httpwarn-btn is-ghost'
            >
              不再提示
            </button>
            <button
              type='button'
              onClick={handleClose}
              className='mtv-httpwarn-btn is-primary'
            >
              我知道了
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
