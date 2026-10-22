'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  clearBangumiImageFallbackCacheIfFailed,
  ensureBangumiImagePrimaryProbed,
  processImageUrl,
  tryApplyBangumiImageFallback,
  tryApplyDoubanImageFallback,
} from '@/lib/utils';

interface ProxyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  originalSrc: string;
  displaySrc?: string;
  retryDelay?: number;
  retryOnError?: boolean;
}

const ProxyImage: React.FC<ProxyImageProps> = ({
  originalSrc,
  displaySrc,
  retryDelay = 2000,
  retryOnError = true,
  loading = 'lazy',
  decoding = 'async',
  onError,
  src: _src,
  ...props
}) => {
  const initialSrc = useMemo(
    () => displaySrc || processImageUrl(originalSrc),
    [displaySrc, originalSrc]
  );
  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // 重试次数：浏览器会把这次失败短暂记在缓存里，同一个 URL 重设 src 不会真的
  // 再发一次请求（React 也不会因为 setState 同值而重新渲染）。所以重试要带
  // 一个变化的参数，最多两次。
  const retryCountRef = useRef(0);

  useEffect(() => {
    retryCountRef.current = 0;
    setCurrentSrc(initialSrc);
  }, [initialSrc]);

  // 主源图片域主页探测：失败则 sticky 走备源（替代原 5s complete 误判）
  useEffect(() => {
    if (displaySrc) return;

    let cancelled = false;
    void (async () => {
      const reachable = await ensureBangumiImagePrimaryProbed();
      if (cancelled || reachable) return;
      setCurrentSrc(processImageUrl(originalSrc));
    })();

    return () => {
      cancelled = true;
    };
  }, [displaySrc, originalSrc]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;

    if (
      tryApplyDoubanImageFallback(img, originalSrc) ||
      tryApplyBangumiImageFallback(img, originalSrc)
    ) {
      setCurrentSrc(img.src);
      return;
    }

    if (clearBangumiImageFallbackCacheIfFailed(img, originalSrc)) {
      setCurrentSrc(processImageUrl(originalSrc));
      return;
    }

    if (retryOnError && retryCountRef.current < 2) {
      retryCountRef.current += 1;
      const attempt = retryCountRef.current;
      window.setTimeout(() => {
        // 必须换一个 URL 才会真的重新发起请求
        const glue = initialSrc.includes('?') ? '&' : '?';
        setCurrentSrc(`${initialSrc}${glue}imgretry=${attempt}`);
      }, retryDelay * attempt);
    }

    onError?.(e);
  };

  return (
    <img
      {...props}
      ref={imgRef}
      src={currentSrc}
      loading={loading}
      decoding={decoding}
      onError={handleError}
    />
  );
};

export default ProxyImage;
