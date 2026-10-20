'use client';

export type RatingKey = 'imdb' | 'tmdb' | 'douban' | 'rt' | 'metacritic';

export interface RatingSource {
  key: RatingKey;
  /** 已经格式化好的数值，例如「8.7」；空值源不要传进来 */
  value: string;
  /** 百分比型（烂番茄新鲜度），渲染时补 % */
  percent?: boolean;
}

interface RatingRowProps {
  sources: RatingSource[];
  /**
   * logo：桌面用，每个源带品牌角标
   * text：手机用，纯文字 + `·` 分隔，省宽度也省高度
   */
  variant?: 'logo' | 'text';
  className?: string;
}

const BADGE: Record<RatingKey, string> = {
  imdb: 'IMDb',
  tmdb: 'TMDB',
  douban: '豆瓣',
  rt: '🍅',
  metacritic: '🍿',
};

/** 把 OMDb / TMDB / 豆瓣的原始分数格式化；非数字一律当没有 */
export function formatScore(
  value: number | null | undefined,
  digits = 1
): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '';
  }
  return value.toFixed(digits);
}

export default function RatingRow({
  sources,
  variant = 'logo',
  className,
}: RatingRowProps) {
  const list = (sources || []).filter((item) => item && item.value);
  if (list.length === 0) return null;

  if (variant === 'text') {
    return (
      <div className={`mtv-rating-text ${className || ''}`}>
        {list.map((item, index) => (
          <span key={item.key} className='mtv-rating-text-item'>
            {index > 0 && (
              <span className='mtv-rating-sep' aria-hidden='true'>
                ·
              </span>
            )}
            <span className='mtv-rating-text-label'>{BADGE[item.key]}</span>
            <span className='mtv-rating-text-val'>
              {item.value}
              {item.percent ? '%' : ''}
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`mtv-rating-row ${className || ''}`}>
      {list.map((item) => (
        <span key={item.key} className={`mtv-rating is-${item.key}`}>
          <span className='mtv-rating-badge' aria-hidden='true'>
            {BADGE[item.key]}
          </span>
          <span className='mtv-rating-val'>
            {item.value}
            {item.percent ? '%' : ''}
          </span>
        </span>
      ))}
    </div>
  );
}
