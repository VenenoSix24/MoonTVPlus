'use client';

import { useCallback, useEffect, useState } from 'react';

import { useEnableComments } from '@/hooks/useEnableComments';

interface DoubanComment {
  id: string;
  userName: string;
  userAvatar: string;
  userUrl: string;
  rating: number | null;
  content: string;
  time: string;
  votes: number;
}

interface DoubanCommentsProps {
  doubanId: number;
}

const FALLBACK_AVATAR =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"%3E%3Cpath d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/%3E%3C/svg%3E';

export default function DoubanComments({ doubanId }: DoubanCommentsProps) {
  const [comments, setComments] = useState<DoubanComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const limit = 20;

  const enableComments = useEnableComments();

  const fetchComments = useCallback(
    async (startIndex: number) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/douban-comments?id=${doubanId}&start=${startIndex}&limit=${limit}`
        );

        if (!response.ok) {
          throw new Error('获取评论失败');
        }

        const data = await response.json();

        if (startIndex === 0) {
          setComments(data.comments);
        } else {
          setComments((prev) => [...prev, ...data.comments]);
        }

        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (err) {
        console.error('获取评论失败:', err);
        setError(err instanceof Error ? err.message : '获取评论失败');
      } finally {
        setLoading(false);
      }
    },
    [doubanId]
  );

  useEffect(() => {
    // 重置状态当 doubanId 变化时
    setHasStartedLoading(false);
    setComments([]);
    setLoading(false);
    setError(null);
    setTotal(0);
    setHasMore(false);
  }, [doubanId]); // 只在 doubanId 变化时重新获取

  const startLoading = () => {
    setHasStartedLoading(true);
    fetchComments(0);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      // 使用当前已加载的评论数量作为下一页的起始位置
      fetchComments(comments.length);
    }
  };

  // 星级渲染
  const renderStars = (rating: number | null) => {
    if (rating === null) return null;

    return (
      <span className='mtv-play-cmt-stars' aria-label={`${rating} 星`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`mtv-play-cmt-star ${
              star <= rating ? 'mtv-play-cmt-star-on' : ''
            }`}
            viewBox='0 0 24 24'
            aria-hidden='true'
          >
            <path d='M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z' />
          </svg>
        ))}
      </span>
    );
  };

  // 如果评论功能被禁用，不显示任何内容
  if (!enableComments) {
    return null;
  }

  // 初始状态：显示查看评论按钮。这里刻意不自动加载 —— 豆瓣短评是一次分页抓取，
  // 每次进播放页都拉会白白多打一轮上游
  if (!hasStartedLoading) {
    return (
      <div className='mtv-play-cmt-empty'>
        <svg
          className='mtv-play-cmt-empty-ic'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.5}
            d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
          />
        </svg>
        <p className='mtv-play-cmt-empty-t'>点击下方按钮加载豆瓣短评</p>
        <button type='button' onClick={startLoading} className='mtv-play-cmt-btn'>
          <svg
            className='mtv-play-cmt-btn-ic'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
            aria-hidden='true'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
            />
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
            />
          </svg>
          加载评论
        </button>
      </div>
    );
  }

  if (loading && comments.length === 0) {
    return (
      <div className='mtv-play-cmt-empty'>
        <span className='mtv-play-cmt-spin' aria-hidden='true' />
        <span className='mtv-play-cmt-empty-t'>加载评论中…</span>
      </div>
    );
  }

  if (error && comments.length === 0) {
    return (
      <div className='mtv-play-cmt-empty'>
        <span className='mtv-play-cmt-empty-t'>{error}</span>
        <button type='button' onClick={startLoading} className='mtv-play-cmt-btn'>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className='mtv-play-cmts'>
      {/* 头部统计 */}
      {total > 0 && (
        <div className='mtv-play-cmt-stat'>
          {total > comments.length
            ? `共 ${total} 条短评`
            : `已加载 ${comments.length} 条短评`}
        </div>
      )}

      {/* 评论列表 */}
      {comments.map((comment) => (
        <article key={comment.id} className='mtv-play-cmt'>
          <div className='mtv-play-cmt-head'>
            {/* 头像 */}
            <a
              href={comment.userUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='flex-shrink-0'
            >
              <img
                src={comment.userAvatar}
                alt={comment.userName}
                className='mtv-play-cmt-avatar'
                loading='lazy'
                onError={(e) => {
                  e.currentTarget.src = FALLBACK_AVATAR;
                }}
              />
            </a>

            {/* 用户名和评分 */}
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <a
                  href={comment.userUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='mtv-play-cmt-name'
                >
                  {comment.userName}
                </a>
                {renderStars(comment.rating)}
              </div>
              <div className='mtv-play-cmt-time'>{comment.time}</div>
            </div>

            {/* 有用数 */}
            {comment.votes > 0 && (
              <div className='mtv-play-cmt-votes'>
                <svg
                  className='mtv-play-cmt-votes-ic'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                  aria-hidden='true'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5'
                  />
                </svg>
                <span>{comment.votes}</span>
              </div>
            )}
          </div>

          {/* 评论内容 */}
          <div className='mtv-play-cmt-body'>{comment.content}</div>
        </article>
      ))}

      {/* 加载更多按钮 */}
      {hasMore && (
        <div className='mtv-play-cmt-foot'>
          <button
            type='button'
            onClick={loadMore}
            disabled={loading}
            className='mtv-play-cmt-btn'
          >
            {loading ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}

      {/* 没有更多了 */}
      {!hasMore && comments.length > 0 && (
        <div className='mtv-play-cmt-end'>没有更多评论了</div>
      )}
    </div>
  );
}
