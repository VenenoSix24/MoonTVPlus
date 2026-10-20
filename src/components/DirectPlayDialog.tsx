/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { detectNetdiskLink, netdiskSourceId } from '@/lib/netdisk-link';
import { base58Encode } from '@/lib/utils';

import Toast, { ToastProps } from './Toast';

interface DirectPlayDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 直链 / 网盘链接播放弹窗。
 *
 * 从首页 `page.tsx` 搬出来做成自包含组件：入口现在挂在全局「更多」面板里，
 * 任何页面都能打开，所以不能再用首页的 state。
 *
 * 配色全部走 `--ui-*` 令牌，跟着站点主题走 —— 这里不是播放页，不能用播放页
 * 那套写死的深色值。
 */
const DirectPlayDialog = ({ isOpen, onClose }: DirectPlayDialogProps) => {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tempPlayEnabled, setTempPlayEnabled] = useState(false);
  const [toast, setToast] = useState<ToastProps | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setTempPlayEnabled(
      !!(window as any).RUNTIME_CONFIG?.NETDISK_TEMP_PLAY_ENABLED
    );
  }, []);

  // 每次打开都清空，和被搬走的旧行为保持一致
  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setSubmitting(false);
    }
  }, [isOpen]);

  const submit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const netdisk = detectNetdiskLink(trimmed);
      if (netdisk && !tempPlayEnabled) {
        throw new Error('无权限使用临时播放');
      }

      if (netdisk) {
        const id = base58Encode(
          JSON.stringify({
            shareUrl: netdisk.shareUrl,
            passcode: netdisk.passcode || '',
          })
        );
        if (!id) throw new Error('网盘链接编码失败');
        onClose();
        window.location.assign(
          `/play?source=${encodeURIComponent(
            netdiskSourceId(netdisk.provider)
          )}&id=${encodeURIComponent(id)}&title=${encodeURIComponent(
            '网盘直链播放'
          )}`
        );
        return;
      }

      const encoded = base58Encode(trimmed);
      if (!encoded) return;
      onClose();
      window.location.assign(
        `/play?source=directplay&id=${encodeURIComponent(encoded)}`
      );
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : '播放失败',
        type: 'error',
        onClose: () => setToast(null),
      });
    } finally {
      setSubmitting(false);
    }
  }, [url, tempPlayEnabled, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className='mtv-ui-scrim' onClick={onClose}>
        <div
          className='mtv-ui-dialog'
          role='dialog'
          aria-modal='true'
          aria-label='直链播放'
          onClick={(event) => event.stopPropagation()}
        >
          <div className='mtv-ui-dialog-head'>
            <h3 className='mtv-ui-dialog-title'>直链播放</h3>
            <button
              type='button'
              className='mtv-ui-dialog-close'
              onClick={onClose}
              aria-label='关闭'
            >
              <X size={17} />
            </button>
          </div>
          <div className='mtv-ui-dialog-body'>
            <p className='mtv-ui-dialog-note'>请输入可直接播放的视频链接。</p>
            {tempPlayEnabled && (
              <p className='mtv-ui-dialog-note is-faint'>
                支持夸克、UC、百度、天翼、移动、123、115 网盘在线播放。
              </p>
            )}
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              placeholder='https://example.com/video.m3u8'
              className='mtv-ui-input'
              autoFocus
            />
            <div className='mtv-ui-dialog-foot'>
              <button type='button' className='mtv-ui-btn' onClick={onClose}>
                取消
              </button>
              <button
                type='button'
                className='mtv-ui-btn is-primary'
                onClick={() => void submit()}
                disabled={!url.trim() || submitting}
              >
                {submitting ? '处理中…' : '开始播放'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast {...toast} />}
    </>
  );
};

export default DirectPlayDialog;
