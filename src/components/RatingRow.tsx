'use client';

export type RatingKey =
  | 'imdb'
  | 'tmdb'
  | 'douban'
  | 'rt'
  | 'metacritic'
  | 'trakt';

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
   * logo：默认款，每个源带品牌图标
   * text：纯文字 + `·` 分隔，空间极窄时用
   */
  variant?: 'logo' | 'text';
  /** 紧凑款：手机 Hero 用，图标与字号同时缩一档 */
  compact?: boolean;
  className?: string;
}

/* 彩色官方 logo（Iconify 的 selfhst 集合，CC0 协议的社区重绘版本）。
   这些 SVG 自带渐变与底色，直接当图片用最稳：
   用 <img src="data:..."> 而不是内联 —— 内联时 TMDB / Trakt 的
   linearGradient id 会在同页多实例间撞车，颜色可能被第一个定义劫持。 */
const ICON_SVG: Partial<Record<RatingKey, string>> = {
  imdb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#f6c700" d="M512 149.1c-1.4-11.4-9.8-20.4-20.6-22.2H20.7C9 128.9 0 139.6 0 152.4v206.8C0 373.5 11 385 24.6 385h463c12.5 0 22.9-9.8 24.4-22.5z"/><path d="M61.8 178.8h40.6v156.4H61.8zm117.4 72.1c-3.5-23.8-5.4-37.1-5.8-39.7c-1.7-12.8-3.3-23.9-4.9-33.3h-52.7v156.4h35.6l.1-103.3l15 103.3h25.4L206 228.6l.1 105.6h35.5V177.8h-53.1zm129.5-40.6c.4 2 .7 6.5.7 13.6v60.6c0 10.4-.7 16.8-2 19.1c-1.4 2.4-5 3.5-10.8 3.5V204.4c4.4 0 7.4.5 9 1.4c1.6 1.1 2.7 2.5 3.1 4.5m18.4 122.3c4.8-1.1 8.9-2.9 12.2-5.6q4.95-4.05 6.9-11.1c1.3-4.7 2.1-14.1 2.1-28.1v-54.9c0-14.8-.6-24.7-1.5-29.8c-.9-5-3.2-9.6-6.8-13.7s-8.9-7.1-15.8-8.9s-18.2-2.7-37.9-2.7H256v156.4h49.2c11.4-.4 18.7-.9 21.9-1.6m86.7-23.4c-.7 2-4 3-6.5 3c-2.4 0-4-1-4.9-2.9q-1.2-2.85-1.2-13.2v-41.3c0-7.1.4-11.6 1.1-13.3c.7-1.8 2.3-2.6 4.7-2.6c2.5 0 5.8 1 6.7 3c.8 2 1.3 6.3 1.3 13V295c-.3 8.1-.7 12.9-1.2 14.2m-51.7 23.6h36.6c1.5-6 2.4-9.3 2.5-10c3.3 4 7 7 11 9s9.9 3 14.5 3c6.4 0 12-1.7 16.6-5.1c4.7-3.4 7.6-7.4 8.9-11.9c1.3-4.6 1.9-11.6 1.9-21v-43.9c0-9.4-.2-15.6-.6-18.5s-1.7-5.8-3.7-8.9c-2.1-3-5.1-5.4-9-7c-4-1.7-8.6-2.5-14-2.5c-4.7 0-10.7.9-14.6 2.8q-6 2.7-10.8 8.4v-50.9h-39.1v156.5z"/></svg>',
  tmdb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><linearGradient id="mtvTmdbGrad" x1="0" x2="512.021" y1="533.35" y2="533.35" gradientTransform="translate(0 -277.4)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#90cea1"/><stop offset=".56" stop-color="#3cbec9"/><stop offset="1" stop-color="#00b3e5"/></linearGradient><path fill="url(#mtvTmdbGrad)" d="M141.2 256c0-27 21.8-48.9 48.8-49h.1h-.3c27 0 48.9 21.9 48.9 48.9v.1c0 27-21.9 48.9-48.9 48.9h.3c-27 0-48.9-21.9-48.9-48.9m228.7-86.7h91c27 0 48.9-21.9 48.9-48.9S488 71.5 461 71.4h-91.1c-27 0-48.9 21.9-48.9 48.9v.1c0 27.1 21.9 48.9 48.9 48.9M57.3 440.4h176.8c27 0 48.9-21.9 48.9-48.9s-21.8-48.9-48.8-49H57.3c-27 0-48.9 21.9-48.9 48.9v.1c.1 27 21.9 48.9 48.9 48.9m232.2-135.5h17.3l40.4-97.8h-23.1l-24.6 64.2h-.3L275 207h-24.6zm89.7 0h21.6V207h-21.6zm61.4 0h69V285h-47.4v-19.9h42.5v-19.9h-42.5V227h44.9v-20h-66.4zM27.9 169.4h21.6V90.6h27.9V71.5H0v19.1h27.9zm80 0h21.6v-42.3h41.8v42.3h21.6V71.5h-21.6V108h-41.9V71.5H108zm114.1 0h69.2v-19.9h-47.7v-19.9H286v-19.9h-42.5V91.4h44.9V71.5H222zM3.5 305h21.4v-75.1h.3L50.1 305h16.3l25.7-75.1h.3V305H114v-98H81.5l-22.7 63.9h-.3L36 207H3.3zm310 135.5h35c7.1 0 14.1-1 20.9-3.2c6.4-2 12.3-5.2 17.6-9.3c5.1-4.1 9.2-9.3 12.1-15.2c3.2-6.5 4.8-13.7 4.8-21c.2-7.9-1.4-15.7-4.6-22.8c-2.9-6-7.2-11.3-12.5-15.3c-5.6-4-11.9-6.8-18.6-8.4c-7.3-1.8-14.8-2.8-22.3-2.8h-32.4zm21.6-78h12.7c4.4 0 8.7.6 12.9 1.7c3.9 1.1 7.5 2.8 10.7 5.2c3.1 2.3 5.5 5.3 7.2 8.8c1.9 3.9 2.8 8.2 2.8 12.5c.1 4.8-.8 9.6-2.8 14.1c-1.7 3.6-4.2 6.8-7.4 9.2c-3.3 2.4-7.1 4.1-11.1 5.1c-4.5 1-9.2 1.6-13.8 1.5H335zm100 78h40.1c4.4 0 8.8-.5 13.1-1.4c4.2-.8 8.2-2.4 11.8-4.6c3.5-2.1 6.4-4.9 8.6-8.3c2.3-3.9 3.5-8.4 3.3-12.9c0-3-.5-6-1.5-8.9c-1-2.7-2.4-5.1-4.3-7.2s-4.2-3.8-6.8-5.1c-2.8-1.4-5.7-2.3-8.8-2.8v-.3c4.8-1.4 9-4.1 12.3-7.8c3.2-3.9 4.8-8.8 4.6-13.8c.2-4.5-.9-9-3.2-12.9c-2.1-3.2-4.9-5.8-8.3-7.6c-3.6-1.8-7.5-3.1-11.5-3.6c-4.2-.6-8.5-.9-12.8-.9h-36.5v98.1zm21.6-79.7h14.7c1.7 0 3.4.2 5.1.5c1.6.3 3.2.8 4.7 1.6c1.4.7 2.6 1.8 3.4 3.1c.9 1.5 1.4 3.3 1.3 5c0 1.7-.4 3.4-1.2 5c-.7 1.4-1.8 2.5-3.1 3.3c-1.3.9-2.8 1.5-4.3 1.8c-1.6.4-3.3.6-4.9.6h-15.9zm0 39.2H473c1.9 0 3.8.1 5.7.4s3.8.8 5.5 1.5s3.2 1.8 4.4 3.2c1.2 1.6 1.8 3.5 1.7 5.5c.1 1.9-.4 3.7-1.3 5.4c-.8 1.4-2 2.7-3.4 3.6s-3 1.6-4.6 1.9c-1.7.4-3.4.5-5.1.6h-19.4z"/></svg>',
  trakt:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><radialGradient id="mtvTraktGrad" cx="516.907" cy="267.867" r="691.627" gradientTransform="translate(0 -278)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9f42c6"/><stop offset=".27" stop-color="#a041c3"/><stop offset=".42" stop-color="#a43ebb"/><stop offset=".53" stop-color="#aa39ad"/><stop offset=".64" stop-color="#b4339a"/><stop offset=".73" stop-color="#c02b81"/><stop offset=".82" stop-color="#cf2061"/><stop offset=".9" stop-color="#e1143c"/><stop offset=".97" stop-color="#f50613"/><stop offset="1" stop-color="red"/></radialGradient><path fill="url(#mtvTraktGrad)" d="M512 120.1v271.7c0 66.3-53.9 120.2-120.2 120.2H120.1C53.8 512 0 458.1 0 391.8V120.1C0 53.8 53.8 0 120.1 0h271.7c35.4 0 67.2 15.3 89.3 39.7c5 5.5 9.5 11.5 13.3 17.9c1.9 3.1 3.6 6.3 5.3 9.5c3.5 7.3 6.4 14.8 8.4 22.8c1.1 3.9 1.9 8.1 2.5 12.3c1 5.7 1.4 11.8 1.4 17.9"/><path fill="#fff" d="m145.3 191.7l84.5 84.5l15.7-15.7L161 176zm153.5 153.6l15.7-15.6l-23-23L508.2 89.9c-2-8-4.9-15.6-8.4-22.8L260.2 306.7zm-161-146.2l-15.6 15.6l153.6 153.6l15.6-15.7l-46.1-46l249.1-249c-3.8-6.4-8.3-12.4-13.3-17.9L229.8 291zm372.8-96.9L306.1 306.7l15.7 15.6L512 132.1v-11.9c0-6.2-.4-12.3-1.4-18M268.4 237.5L183.9 153l-15.7 15.7l84.5 84.5zm172.3 137.1c0 36.5-29.7 66.1-66.1 66.1H137.4c-36.5 0-66.1-29.7-66.1-66.1V137.4c0-36.5 29.7-66.2 66.1-66.2H359V49.1H137.4c-48.6 0-88.3 39.6-88.3 88.3v237.2c0 48.6 39.6 88.3 88.3 88.3h237.2c48.6 0 88.3-39.6 88.3-88.3v-37.4h-22.1z"/></svg>',
};

/** 转成 data URI，避免每次渲染重新 encode，也不额外发请求 */
const ICON_SRC: Partial<Record<RatingKey, string>> = Object.fromEntries(
  Object.entries(ICON_SVG).map(([key, svg]) => [
    key,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg as string)}`,
  ])
);

/** 没有图形 logo 的源退回文字块 / emoji */
const BADGE: Record<RatingKey, string> = {
  imdb: 'IMDb',
  tmdb: 'TMDB',
  douban: '豆瓣',
  rt: '🍅',
  metacritic: '🍿',
  trakt: 'Trakt',
};

/** 把原始分数格式化；非数字一律当没有 */
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
  compact = false,
  className,
}: RatingRowProps) {
  const list = (sources || []).filter((item) => item && item.value);
  if (list.length === 0) return null;

  const rootClass = [
    variant === 'text' ? 'mtv-rating-text' : 'mtv-rating-row',
    compact ? 'is-compact' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  if (variant === 'text') {
    return (
      <div className={rootClass}>
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
    <div className={rootClass}>
      {list.map((item) => {
        const iconSrc = ICON_SRC[item.key];
        return (
          <span key={item.key} className={`mtv-rating is-${item.key}`}>
            <span className='mtv-rating-badge' aria-hidden='true'>
              {iconSrc ? (
                <img src={iconSrc} alt='' decoding='async' />
              ) : (
                BADGE[item.key]
              )}
            </span>
            <span className='mtv-rating-val'>
              {item.value}
              {item.percent ? '%' : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}
