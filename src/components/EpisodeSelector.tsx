/* eslint-disable @next/next/no-img-element */

import {
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GalleryHorizontal,
  LayoutGrid,
  Link as LinkIcon,
  MoreVertical,
  Settings,
  Wand2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import type { DanmakuComment,DanmakuEpisode,DanmakuSelection } from '@/lib/danmaku/types';
import { generateStorageKey, getCachedPlayRecordsSnapshot } from '@/lib/db.client';
import { isEpisodeHiddenByFilter } from '@/lib/episode-filter';
import { loadAllLocalEpisodeProgressRecords } from '@/lib/episode-progress';
import { isNetdiskSource } from '@/lib/netdisk/source';
import { EpisodeFilterConfig,SearchResult } from '@/lib/types';
import type { SpeedTestErrorType } from '@/lib/utils';
import { getVideoResolutionFromM3u8, SpeedTestError } from '@/lib/utils';
import { useLongPress } from '@/hooks/useLongPress';

import DanmakuPanel from '@/components/DanmakuPanel';
import EpisodeFilterSettings from '@/components/EpisodeFilterSettings';
import EpisodeTitleCorrectDialog from '@/components/EpisodeTitleCorrectDialog';
import ProxyImage from '@/components/ProxyImage';

/** 选集按钮上显示的短标签（数字等）；全名仍保留在 originalTitle 供长按查看 */
function getEpisodeDisplayLabel(
  title: string | undefined,
  episodeNumber: number
): string {
  if (!title) {
    return String(episodeNumber);
  }
  // OVA 单独展示
  const ovaMatch = title.match(/OVA\s*(\d+(?:\.\d+)?)/i);
  if (ovaMatch) {
    return `OVA ${ovaMatch[1]}`;
  }
  // S01E05 / s01e05 → 5
  const sxxexxMatch = title.match(/[Ss]\d+[Ee](\d{1,4}(?:\.\d+)?)/);
  if (sxxexxMatch) {
    return sxxexxMatch[1];
  }
  // 第12集 / 12话 → 12
  const zhMatch = title.match(/(?:第)?(\d+(?:\.\d+)?)(?:集|话)/);
  if (zhMatch) {
    return zhMatch[1];
  }
  // [01] / (01) → 1（网盘常见）
  const bracketMatch = title.match(/[[(【](\d+(?:\.\d+)?)[\])】]/);
  if (bracketMatch) {
    return bracketMatch[1];
  }
  // E01 / EP01 / ep.01 → 1
  const epMatch = title.match(/(?:^|[^a-zA-Z])(?:EP|E|ep|e)[.\s_-]*(\d+(?:\.\d+)?)/);
  if (epMatch) {
    return epMatch[1];
  }
  // _01_ / -01- → 1
  const sepMatch = title.match(/[_-](\d+(?:\.\d+)?)[_-]/);
  if (sepMatch) {
    return sepMatch[1];
  }
  // 纯数字开头：01.xxx / 01 xxx
  const leadingNum = title.match(/^(\d+(?:\.\d+)?)[^\d.]/);
  if (leadingNum) {
    return leadingNum[1];
  }
  // 整串就是数字
  if (/^\d+(?:\.\d+)?$/.test(title.trim())) {
    return title.trim();
  }
  return title;
}

/** 分组标签的显示文案：分季分组原样显示（S01 / 其他），集数区间补上「集」并
 *  把连字符两侧留空 —— 对齐定稿里的「1 - 12 集」 */
function formatEpisodeGroupLabel(label: string): string {
  if (/^S\d+$/i.test(label) || label === '其他') {
    return label;
  }
  return `${label.replace('-', ' - ')} 集`;
}

/** 码率文案（"2.5 Mbps" / "1234 Kbps"）→ Kbps 数值，用于「画质优先」排序。
 *  拿不到就返回 -1，自然排到最后。 */
function parseBitrateToKbps(bitrate?: string): number {
  if (!bitrate) return -1;
  const match = bitrate.match(/([\d.]+)\s*(Kbps|Mbps|kb\/s|mb\/s)/i);
  if (!match) return -1;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return -1;
  return /^m/i.test(match[2]) ? value * 1000 : value;
}
interface EpisodeNamePopupState {
  title: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}

interface EpisodeChipProps {
  episodeNumber: number;
  isActive: boolean;
  isWatched: boolean;
  originalTitle?: string;
  /** 仅 netdisk 源启用长按/右键查看全名 */
  enableOriginalNamePopup?: boolean;
  onSelect: (zeroBasedIndex: number) => void;
  onShowOriginalName: (title: string, rect: DOMRect) => void;
}

/** 集数格：定稿的数字格（等宽数字、激活走品牌色 + 投影）。
 *  纯数字标签补零到两位（01 / 12），OVA 这类非数字标签原样显示。
 *  netdisk 源下保留移动端长按 / 桌面右键查看原集名。 */
const EpisodeChip: React.FC<EpisodeChipProps> = ({
  episodeNumber,
  isActive,
  isWatched,
  originalTitle,
  enableOriginalNamePopup = false,
  onSelect,
  onShowOriginalName,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const displayLabel = getEpisodeDisplayLabel(originalTitle, episodeNumber);
  const chipLabel = /^\d+$/.test(displayLabel)
    ? displayLabel.padStart(2, '0')
    : displayLabel;
  // 只要返回了原始集名就允许右键/长按。即使短标签与原名相同，
  // 也不能把按钮设为 disabled，否则 PC 端不会触发 contextmenu。
  const canShowOriginalName =
    enableOriginalNamePopup && !!originalTitle && originalTitle.trim() !== '';

  const showOriginalName = useCallback(() => {
    if (!canShowOriginalName || !buttonRef.current) return;
    onShowOriginalName(
      originalTitle!,
      buttonRef.current.getBoundingClientRect()
    );
  }, [canShowOriginalName, onShowOriginalName, originalTitle]);

  const longPressProps = useLongPress({
    onLongPress: showOriginalName,
    onClick: () => {
      if (!isActive) {
        onSelect(episodeNumber - 1);
      }
    },
    longPressDelay: 500,
  });

  return (
    <button
      ref={buttonRef}
      type='button'
      disabled={canShowOriginalName ? undefined : isActive || undefined}
      aria-current={isActive ? 'true' : undefined}
      onClick={() => {
        if (!isActive) {
          onSelect(episodeNumber - 1);
        }
      }}
      onContextMenu={
        canShowOriginalName
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              showOriginalName();
            }
          : undefined
      }
      {...(canShowOriginalName ? longPressProps : {})}
      title={
        originalTitle && originalTitle.trim() !== ''
          ? `第 ${episodeNumber} 集 · ${originalTitle.trim()}`
          : `第 ${episodeNumber} 集`
      }
      className={`mtv-play-ep ${isActive ? 'mtv-play-ep-on' : ''} ${
        canShowOriginalName ? 'select-none' : ''
      }`.trim()}
      style={
        canShowOriginalName
          ? ({
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
            } as React.CSSProperties)
          : undefined
      }
    >
      {chipLabel}
      {isWatched && !isActive && <span className='mtv-play-ep-dot' />}
    </button>
  );
};

/** 播出日期只保留 YYYY-MM-DD；没有或格式不对就原样返回 */
function formatAirDate(date?: string): string {
  if (!date) return '';
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : date;
}

/** Date → 'YYYY-MM-DD'（本地时区）。播出日期只按日历日比较，不涉及时分秒 */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 把集号列表压成区间文案：[1,2,3,4] → '1-4'，[7] → '7'，不连续就逗号连起来 */
function formatEpisodeRange(episodes: number[]): string {
  if (episodes.length === 0) return '';
  const sorted = [...episodes].sort((a, b) => a - b);
  const contiguous = sorted.every((n, i) => n === sorted[0] + i);
  if (!contiguous) return sorted.join(',');
  return sorted.length === 1
    ? `${sorted[0]}`
    : `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

interface CalendarCell {
  /** 'YYYY-MM-DD' */
  key: string;
  day: number;
  /** 是否属于当前展示的月份（首尾会补上邻月的日子） */
  inMonth: boolean;
  /** 这一天更新的集号 */
  episodes: number[];
}

/** 生成 6×7 的月历网格。周日开头，首尾补齐邻月日期，保证行数固定不跳动。 */
function buildMonthGrid(
  monthKey: string,
  airDates: Map<string, number[]>
): CalendarCell[] {
  const [year, month] = monthKey.split('-').map(Number);
  const startOffset = new Date(year, month - 1, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month - 1, 1 - startOffset + i);
    const key = toDateKey(date);
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1,
      episodes: airDates.get(key) ?? [],
    };
  });
}

/** 分集卡片用的数据（按集号-1 索引传入） */
export interface EpisodeCardData {
  /** 分集名，弹幕 / TMDB 已合过优先级 */
  name?: string;
  overview?: string;
  runtime?: number;
  airDate?: string;
  /** 已拼好图片地址的剧照 */
  still?: string;
}

/** 播出日历汇总。只有存在未播集数时才有值 —— 完结剧不显示这一行。 */
export interface AirCalendar {
  airedCount: number;
  totalCount: number;
  lastEpisodeNumber: number;
  lastAirDate: string;
  nextEpisodeNumber: number;
  nextAirDate: string;
}

interface EpisodeCardProps {
  episodeNumber: number;
  isActive: boolean;
  isWatched: boolean;
  data?: EpisodeCardData;
  /** 剧照还在加载：用骨架占位，而不是先显示集号 */
  loading?: boolean;
  /** TMDB 没有数据时的分集名回落（弹幕分集名） */
  fallbackName?: string;
  onSelect: (zeroBasedIndex: number) => void;
}

/** 分集卡片：剧照 + 播出日期 / 时长 + 分集名 + 简介。
 *  没有 TMDB 数据时退回「大号集数」，不会留一块空画面。 */
const EpisodeCard: React.FC<EpisodeCardProps> = ({
  episodeNumber,
  isActive,
  isWatched,
  data,
  loading = false,
  fallbackName,
  onSelect,
}) => {
  const title =
    data?.name?.trim() || fallbackName?.trim() || `第 ${episodeNumber} 集`;
  const airDate = formatAirDate(data?.airDate);
  const hasMeta = Boolean(airDate) || Boolean(data?.runtime);

  return (
    <button
      type='button'
      disabled={isActive || undefined}
      aria-current={isActive ? 'true' : undefined}
      onClick={() => {
        if (!isActive) {
          onSelect(episodeNumber - 1);
        }
      }}
      title={title}
      className={`mtv-play-epcard ${isActive ? 'mtv-play-epcard-on' : ''}`.trim()}
    >
      <span className='mtv-play-epcard-art'>
        {data?.still ? (
          <ProxyImage
            originalSrc={data.still}
            alt={title}
            className='mtv-play-epcard-img'
          />
        ) : loading ? (
          <span className='mtv-play-epcard-skel' aria-hidden='true' />
        ) : (
          <span className='mtv-play-epcard-num'>
            {String(episodeNumber).padStart(2, '0')}
          </span>
        )}
        <span className='mtv-play-epcard-tag'>
          {isActive ? '正在播放' : `第 ${episodeNumber} 集`}
        </span>
        {isWatched && !isActive && (
          <span className='mtv-play-epcard-watched'>已看过</span>
        )}
      </span>
      <span className='mtv-play-epcard-body'>
        {hasMeta && (
          <span className='mtv-play-epcard-meta'>
            {airDate && <span>{airDate}</span>}
            {data?.runtime ? <span>{data.runtime} 分钟</span> : null}
          </span>
        )}
        <span className='mtv-play-epcard-t'>{title}</span>
        {data?.overview && (
          <span className='mtv-play-epcard-syn'>{data.overview}</span>
        )}
      </span>
    </button>
  );
};

// 定义视频信息类型
interface VideoInfo {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  bitrate: string; // 视频码率
  hasError?: boolean; // 添加错误状态标识
  errorType?: SpeedTestErrorType; // 失败类型：超时 / 无法访问
}

interface EpisodeSelectorProps {
  /** 总集数 */
  totalEpisodes: number;
  /** 剧集标题 */
  episodes_titles: string[];
  /** 弹幕/TMDB 提供的分集名称（按 episodeNumber-1 索引）；存在时选集以列表形式展示 */
  richEpisodeNames?: (string | undefined)[];
  /** 分集卡片的数据（剧照 / 简介 / 时长 / 播出日期），按 episodeNumber-1 索引 */
  episodeCards?: (EpisodeCardData | undefined)[] | null;
  /** 剧照 / 简介还在路上：卡片先显示骨架，不要先闪一下集号再换成剧照 */
  episodeCardsLoading?: boolean;
  /** 播出日历汇总；为 null 表示已完结或没有播出日期，不显示这一行 */
  airCalendar?: AirCalendar | null;
  /**
   * 选集面板当前展示的集号区间。父组件据此按需拉取对应的 TMDB 季 ——
   * 1000+ 集的剧只看当前这一段，不把二十多季全拉一遍
   */
  onVisibleEpisodesChange?: (range: { start: number; end: number }) => void;
  /** 每页显示多少集，默认 50 */
  episodesPerPage?: number;
  /** 当前选中的集数（1 开始） */
  value?: number;
  /** 用户点击选集后的回调 */
  onChange?: (episodeNumber: number) => void;
  /** 换源相关 */
  onSourceChange?: (source: string, id: string, title: string) => void;
  currentSource?: string;
  currentId?: string;
  episodeProgressContentKey?: string;
  videoTitle?: string;
  videoYear?: string;
  availableSources?: SearchResult[];
  sourceSearchLoading?: boolean;
  sourceSearchError?: string | null;
  /** 后台源加载状态 */
  backgroundSourcesLoading?: boolean;
  /** 预计算的测速结果，避免重复测速 */
  precomputedVideoInfo?: Map<string, VideoInfo>;
  /** 弹幕相关 */
  onDanmakuSelect?: (selection: DanmakuSelection) => void;
  currentDanmakuSelection?: DanmakuSelection | null;
  onUploadDanmaku?: (comments: DanmakuComment[]) => void;
  /** 手动选集弹幕时回传该源的完整分集列表，供刷新分集标题 */
  onDanmakuEpisodesLoaded?: (episodes: DanmakuEpisode[]) => void;
  /** 观影室房员状态 - 禁用选集和换源，但保留弹幕 */
  isRoomMember?: boolean;
  /** 外层使用 TMDB 背景图时，提升深色文字对比度 */
  useLightTextOnBackdrop?: boolean;
  /** 集数过滤配置 */
  episodeFilterConfig?: EpisodeFilterConfig | null;
  onFilterConfigUpdate?: (config: EpisodeFilterConfig) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * 选集组件，支持分页、自动滚动聚焦当前分页标签，以及换源功能。
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  totalEpisodes,
  episodes_titles,
  richEpisodeNames,
  episodeCards,
  episodeCardsLoading = false,
  airCalendar,
  onVisibleEpisodesChange,
  episodesPerPage = 50,
  value = 1,
  onChange,
  onSourceChange,
  currentSource,
  currentId,
  episodeProgressContentKey,
  videoTitle,
  availableSources = [],
  sourceSearchLoading = false,
  sourceSearchError = null,
  backgroundSourcesLoading = false,
  precomputedVideoInfo,
  onDanmakuSelect,
  currentDanmakuSelection,
  onUploadDanmaku,
  onDanmakuEpisodesLoaded,
  isRoomMember = false,
  useLightTextOnBackdrop = false,
  episodeFilterConfig = null,
  onFilterConfigUpdate,
  onShowToast,
}) => {
  const router = useRouter();
  // 文字色一律走 ui-* 令牌。播放页恒为深色，而 .mtv-play-root 已经把 ui-* 钉成
  // 深色值；写成 gray-x + dark:gray-y 的话，浅色主题下会拿到浅色变体，
  // 结果就是深灰字压在深色面板上。下载状态那几个紫/黄/橙/红/蓝是语义色，
  // 不跟主题走，保持原样。
  const mutedTextClass = useLightTextOnBackdrop
    ? 'text-white/80'
    : 'text-ui-ink-2';
  const faintTextClass = useLightTextOnBackdrop
    ? 'text-white/65'
    : 'text-ui-ink-3';
  const inactiveTabClass = useLightTextOnBackdrop
    ? 'text-white/85 hover:text-white bg-white/10 dark:bg-white/5 hover:bg-white/15 dark:hover:bg-white/10'
    : 'text-ui-ink-2 hover:text-ui-accent bg-ui-hair hover:bg-ui-hair-strong';
  const sourceTitleClass = useLightTextOnBackdrop
    ? 'text-white'
    : 'text-ui-ink';
  const sourcePillTextClass = useLightTextOnBackdrop
    ? 'text-white/85'
    : 'text-ui-ink-2';
  const disabledTextClass = useLightTextOnBackdrop
    ? 'text-white/45 cursor-not-allowed'
    : 'text-ui-ink-3 cursor-not-allowed';

  const parseSxxExxTitle = useCallback((title?: string) => {
    const match = title?.match(/[Ss](\d+)[Ee](\d{1,4}(?:\.\d+)?)/);
    if (!match) {
      return null;
    }

    const seasonNumber = Number.parseInt(match[1], 10);
    if (!Number.isFinite(seasonNumber)) {
      return null;
    }

    return { season: seasonNumber };
  }, []);

  const episodeGroupsAsc = useMemo(() => {
    const sxxexxMatchCount = episodes_titles.reduce((count, title) => {
      return count + (parseSxxExxTitle(title) ? 1 : 0);
    }, 0);

    if (sxxexxMatchCount >= 2) {
      const seasons = new Map<number, number[]>();
      const otherEpisodes: number[] = [];

      for (let episodeNumber = 1; episodeNumber <= totalEpisodes; episodeNumber += 1) {
        const parsed = parseSxxExxTitle(episodes_titles?.[episodeNumber - 1]);
        if (!parsed) {
          otherEpisodes.push(episodeNumber);
          continue;
        }

        const episodes = seasons.get(parsed.season) ?? [];
        episodes.push(episodeNumber);
        seasons.set(parsed.season, episodes);
      }

      const seasonGroups = Array.from(seasons.entries())
        .sort(([seasonA], [seasonB]) => seasonA - seasonB)
        .map(([season, episodes]) => ({
          label: `S${String(season).padStart(2, '0')}`,
          episodes,
        }));

      if (otherEpisodes.length > 0) {
        seasonGroups.push({ label: '其他', episodes: otherEpisodes });
      }

      return seasonGroups;
    }

    const pageCount = Math.ceil(totalEpisodes / episodesPerPage);
    return Array.from({ length: pageCount }, (_, i) => {
      const start = i * episodesPerPage + 1;
      const end = Math.min(start + episodesPerPage - 1, totalEpisodes);
      return {
        label: `${start}-${end}`,
        episodes: Array.from({ length: end - start + 1 }, (_, idx) => start + idx),
      };
    });
  }, [episodesPerPage, episodes_titles, parseSxxExxTitle, totalEpisodes]);

  const pageCount = episodeGroupsAsc.length;

  // 存储每个源的视频信息
  const [videoInfoMap, setVideoInfoMap] = useState<Map<string, VideoInfo>>(
    new Map()
  );
  const [attemptedSources, setAttemptedSources] = useState<Set<string>>(
    new Set()
  );
  // 存储正在重新测试的源
  const [retestingSources, setRetestingSources] = useState<Set<string>>(
    new Set()
  );
  // 标记初始测速是否已完成
  const [initialTestingCompleted, setInitialTestingCompleted] = useState(false);
  // 标记是否正在进行全部重测
  const [isRetestingAll, setIsRetestingAll] = useState(false);
  // 标记是否正在进行初始测速
  const [isInitialTesting, setIsInitialTesting] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<number>>(new Set());
  // 选集按钮长按/右键：原集名 popup（样式参考标题上方 aka 提示）
  const [episodeNamePopup, setEpisodeNamePopup] =
    useState<EpisodeNamePopupState | null>(null);
  const episodeNamePopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const clearEpisodeNamePopupTimer = useCallback(() => {
    if (episodeNamePopupTimerRef.current) {
      clearTimeout(episodeNamePopupTimerRef.current);
      episodeNamePopupTimerRef.current = null;
    }
  }, []);

  const hideEpisodeNamePopup = useCallback(() => {
    clearEpisodeNamePopupTimer();
    setEpisodeNamePopup(null);
  }, [clearEpisodeNamePopupTimer]);

  const showEpisodeNamePopup = useCallback(
    (title: string, rect: DOMRect) => {
      const gap = 8;
      const estimatedHeight = 40;
      const spaceAbove = rect.top;
      const placement: 'top' | 'bottom' =
        spaceAbove < estimatedHeight + gap ? 'bottom' : 'top';
      const x = rect.left + rect.width / 2;
      const y =
        placement === 'top' ? rect.top - gap : rect.bottom + gap;

      clearEpisodeNamePopupTimer();
      setEpisodeNamePopup({ title, x, y, placement });
      // 自动消失，避免遮挡后续操作
      episodeNamePopupTimerRef.current = setTimeout(() => {
        setEpisodeNamePopup(null);
        episodeNamePopupTimerRef.current = null;
      }, 2500);
    },
    [clearEpisodeNamePopupTimer]
  );

  useEffect(() => {
    if (!episodeNamePopup) return;

    const handleDismiss = () => hideEpisodeNamePopup();
    // 下一帧再绑定，避免触发本次的右键/触摸立即关闭
    const bindId = window.setTimeout(() => {
      window.addEventListener('scroll', handleDismiss, true);
      window.addEventListener('touchstart', handleDismiss, { passive: true });
      window.addEventListener('mousedown', handleDismiss);
      window.addEventListener('keydown', handleDismiss);
    }, 0);

    return () => {
      window.clearTimeout(bindId);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('touchstart', handleDismiss);
      window.removeEventListener('mousedown', handleDismiss);
      window.removeEventListener('keydown', handleDismiss);
    };
  }, [episodeNamePopup, hideEpisodeNamePopup]);

  useEffect(() => {
    return () => clearEpisodeNamePopupTimer();
  }, [clearEpisodeNamePopupTimer]);

  // 使用 ref 来避免闭包问题
  const attemptedSourcesRef = useRef<Set<string>>(new Set());
  const videoInfoMapRef = useRef<Map<string, VideoInfo>>(new Map());

  // 同步状态到 ref
  useEffect(() => {
    attemptedSourcesRef.current = attemptedSources;
  }, [attemptedSources]);

  useEffect(() => {
    videoInfoMapRef.current = videoInfoMap;
  }, [videoInfoMap]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !currentSource ||
      !currentId ||
      !episodeProgressContentKey
    ) {
      setWatchedEpisodes(new Set());
      return;
    }

    const watched = new Set<number>();

    try {
      const records = getCachedPlayRecordsSnapshot();
      const record = records[generateStorageKey(currentSource, currentId)];
      if (record && record.index > 0 && record.play_time > 1) {
        watched.add(record.index);
      }
    } catch (error) {
      console.warn('[EpisodeSelector] Failed to read cached play records:', error);
    }

    try {
      const episodeRecords = loadAllLocalEpisodeProgressRecords(
        episodeProgressContentKey
      );

      for (const [episodeIndex, record] of Object.entries(episodeRecords)) {
        if (Number(record?.playTime) > 1) {
          const episodeNumber = Number(episodeIndex) + 1;
          if (episodeNumber >= 1 && episodeNumber <= totalEpisodes) {
            watched.add(episodeNumber);
          }
        }
      }
    } catch (error) {
      console.warn('[EpisodeSelector] Failed to read local episode progress:', error);
    }

    setWatchedEpisodes(watched);
  }, [currentSource, currentId, episodeProgressContentKey, totalEpisodes, value]);

  // 主要的 tab 状态：'danmaku' | 'episodes' | 'sources'
  // 默认显示选集选项卡，但如果是房员则显示弹幕
  const [activeTab, setActiveTab] = useState<'danmaku' | 'episodes' | 'sources'>(
    isRoomMember ? 'danmaku' : 'episodes'
  );

  // 当房员状态变化时，自动切换到弹幕选项卡
  useEffect(() => {
    if (isRoomMember && (activeTab === 'episodes' || activeTab === 'sources')) {
      setActiveTab('danmaku');
    }
  }, [isRoomMember, activeTab]);

  // 当前分组索引（0 开始）
  const initialPage = Math.max(
    0,
    episodeGroupsAsc.findIndex((group) => group.episodes.includes(value))
  );
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  // 是否倒序显示
  const [descending, setDescending] = useState<boolean>(false);

  // 集数过滤设置弹窗状态
  const [showFilterSettings, setShowFilterSettings] = useState<boolean>(false);

  // 手动矫正标题弹窗状态（矫正配置按 videoTitle 存 localStorage，由播放页消费）
  const [showTitleCorrect, setShowTitleCorrect] = useState<boolean>(false);

  // 集数视图模式：分集卡片（定稿，默认）/ 数字网格。原「列表」视图在卡片
  // 上线后是重复信息，已去掉。
  const [episodeViewMode, setEpisodeViewMode] = useState<'card' | 'grid'>('card');
  // 卡片横滑容器：播出日历选日期后要把卡片条滚到那一集
  const cardStripRef = useRef<HTMLDivElement>(null);
  // 侧栏根节点：窄屏展开/收起换源列表时要拿它量位置（见 toggleAllSources）
  const railRef = useRef<HTMLDivElement>(null);
  const railTopBeforeRef = useRef<number | null>(null);
  const [showEpisodeMenu, setShowEpisodeMenu] = useState<boolean>(false);
  const episodeMenuRef = useRef<HTMLDivElement>(null);

  // 范围选择器（原来是一条横向的分类 tab 条，靠滚轮横向滚动；改成下拉菜单，
  // 那条链路的 wheel 监听也一并删掉了 —— 它本身就是一个滚轮陷阱）
  const [showRangeMenu, setShowRangeMenu] = useState<boolean>(false);
  const rangeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showRangeMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        rangeMenuRef.current &&
        !rangeMenuRef.current.contains(e.target as Node)
      ) {
        setShowRangeMenu(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRangeMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showRangeMenu]);

  // 窄屏换源列表默认只列前 4 个（见 .mtv-play-sources.is-capped）
  const [showAllSources, setShowAllSources] = useState<boolean>(false);

  // 窄屏展开/收起换源列表：切换前记一下侧栏顶端的位置，收起后用它把视口拉回来
  const toggleAllSources = useCallback(() => {
    railTopBeforeRef.current =
      railRef.current?.getBoundingClientRect().top ?? null;
    setShowAllSources((v) => !v);
  }, []);

  useEffect(() => {
    const before = railTopBeforeRef.current;
    railTopBeforeRef.current = null;
    const rail = railRef.current;
    if (before === null || !rail) return;

    // 收起时列表短了两千多 px，页面总高跟着变短，浏览器会把 scrollTop 夹到新的
    // 最大值 —— 视口就飘到很下面去了（用户实测反馈）。直接把侧栏顶端滚回视口
    // 顶部（顶栏高度由 .mtv-play-rail 的 scroll-margin-top 让开），也就是用户
    // 开始往下翻列表之前的位置。展开时不干预。
    if (showAllSources) return;
    // 用 'auto' 不用 'smooth'：smooth 依赖渲染帧，面板/后台标签页里会静默失效，
    // 结果就是「什么都不做」。这里是纠错性质的滚动，位置正确比动效重要。
    rail.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [showAllSources]);

  // 换源排序规则（见 sortedSources）
  const [sourceSortMode, setSourceSortMode] = useState<'speed' | 'quality'>(
    'speed'
  );

  // 读取本地"优选和测速"开关，默认开启
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  });

  // 读取测速超时设置，默认4秒
  const [speedTestTimeout] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('speedTestTimeout');
      if (saved !== null) {
        return Number(saved);
      }
    }
    return 4000;
  });

  // 集数过滤逻辑
  const isEpisodeFiltered = useCallback(
    (episodeNumber: number): boolean => {
      if (!episodeFilterConfig || episodeFilterConfig.rules.length === 0) {
        return false;
      }

      // 获取集数标题
      const title = episodes_titles?.[episodeNumber - 1];
      if (!title) return false;
      return isEpisodeHiddenByFilter(title, episodeFilterConfig);
    },
    [episodeFilterConfig, episodes_titles]
  );

  // 根据 descending 状态计算实际显示的分页索引
  const displayPage = useMemo(() => {
    if (descending) {
      return pageCount - 1 - currentPage;
    }
    return currentPage;
  }, [currentPage, descending, pageCount]);

  useEffect(() => {
    const currentEpisode = Math.max(1, Math.min(value, totalEpisodes));
    const nextPage = episodeGroupsAsc.findIndex((group) =>
      group.episodes.includes(currentEpisode)
    );

    if (nextPage >= 0) {
      setCurrentPage(nextPage);
    }
  }, [episodeGroupsAsc, totalEpisodes, value]);

  // 获取视频信息的函数 - 移除 attemptedSources 依赖避免不必要的重新创建
  const getVideoInfo = useCallback(async (source: SearchResult) => {
    const sourceKey = `${source.source}-${source.id}`;

    // 使用 ref 获取最新的状态，避免闭包问题
    if (attemptedSourcesRef.current.has(sourceKey)) {
      return;
    }

    // 获取第一集的URL
    if (!source.episodes || source.episodes.length === 0) {
      return;
    }
    const episodeUrl =
      source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];

    // 标记为已尝试
    setAttemptedSources((prev) => new Set(prev).add(sourceKey));

    try {
      const info = await getVideoResolutionFromM3u8(episodeUrl, speedTestTimeout);
      setVideoInfoMap((prev) => new Map(prev).set(sourceKey, info));
    } catch (error) {
      // 失败时保存错误状态，并区分超时与无法访问
      const errorType: SpeedTestErrorType =
        error instanceof SpeedTestError ? error.type : 'unreachable';
      setVideoInfoMap((prev) =>
        new Map(prev).set(sourceKey, {
          quality: '错误',
          loadSpeed: '未知',
          pingTime: 0,
          bitrate: '未知',
          hasError: true,
          errorType,
        })
      );
    }
  }, [speedTestTimeout]);

  // 重测所有源的函数
  const retestAllSources = useCallback(async () => {
    if (!availableSources || availableSources.length === 0) return;

    setIsRetestingAll(true);

    // 清空之前的测速结果
    setVideoInfoMap(new Map());
    setAttemptedSources(new Set());
    attemptedSourcesRef.current = new Set();
    videoInfoMapRef.current = new Map();

    // 筛选需要测速的源（排除 openlist/emby/xiaoya）
    const sourcesToTest = availableSources.filter((source) => {
      if (source.source === 'openlist' || source.source === 'emby' || source.source.startsWith('emby_') || source.source === 'xiaoya') {
        return false;
      }
      return true;
    });

    // 分批测速，每批最多5个
    const batchSize = 5;
    for (let i = 0; i < sourcesToTest.length; i += batchSize) {
      const batch = sourcesToTest.slice(i, i + batchSize);
      await Promise.all(batch.map(source => getVideoInfo(source)));
    }

    setIsRetestingAll(false);
  }, [availableSources, getVideoInfo]);

  // 当有预计算结果时，先合并到videoInfoMap中
  useEffect(() => {
    if (precomputedVideoInfo && precomputedVideoInfo.size > 0) {
      // 原子性地更新两个状态，避免时序问题
      setVideoInfoMap((prev) => {
        const newMap = new Map(prev);
        precomputedVideoInfo.forEach((value, key) => {
          newMap.set(key, value);
        });
        return newMap;
      });

      setAttemptedSources((prev) => {
        const newSet = new Set(prev);
        precomputedVideoInfo.forEach((info, key) => {
          if (!info.hasError) {
            newSet.add(key);
          }
        });
        return newSet;
      });

      // 同步更新 ref，确保 getVideoInfo 能立即看到更新
      precomputedVideoInfo.forEach((info, key) => {
        if (!info.hasError) {
          attemptedSourcesRef.current.add(key);
        }
      });
    }
  }, [precomputedVideoInfo]);

  // 当切换到换源tab并且有源数据时，异步获取视频信息 - 移除 attemptedSources 依赖避免循环触发
  useEffect(() => {
    const fetchVideoInfosInBatches = async () => {
      if (
        !optimizationEnabled || // 若关闭测速则直接退出
        activeTab !== 'sources' ||
        availableSources.length === 0
      )
        return;

      // 筛选出尚未测速的播放源，并排除不需要测速的源（openlist/emby/xiaoya）
      const pendingSources = availableSources.filter((source) => {
        const sourceKey = `${source.source}-${source.id}`;
        // 跳过已测速的源
        if (attemptedSourcesRef.current.has(sourceKey)) return false;
        // 跳过不需要测速的源
        if (source.source === 'openlist' || source.source === 'emby' || source.source.startsWith('emby_') || source.source === 'xiaoya') return false;
        return true;
      });

      // 没有待测的源（例如已被预计算结果填满）也要把标志置上 —— 原来这里直接
      // return，标志位永远停在 false，sortedSources 里的排序被整段挡掉，
      // 表现就是「测完速了但排序跟没排一样」
      if (pendingSources.length === 0) {
        if (!initialTestingCompleted) setInitialTestingCompleted(true);
        return;
      }

      // 标记开始初始测速
      setIsInitialTesting(true);

      const batchSize = Math.ceil(pendingSources.length / 2);

      for (let start = 0; start < pendingSources.length; start += batchSize) {
        const batch = pendingSources.slice(start, start + batchSize);
        await Promise.all(batch.map(getVideoInfo));
      }

      // 初始测速完成后，标记为已完成
      setIsInitialTesting(false);
      if (!initialTestingCompleted) {
        setInitialTestingCompleted(true);
      }
    };

    fetchVideoInfosInBatches();
    // 依赖项保持与之前一致
  }, [activeTab, availableSources, getVideoInfo, optimizationEnabled, initialTestingCompleted, currentSource]);

  // 监听后台加载完成，触发自动测速
  const prevBackgroundLoadingRef = useRef<boolean>(false);
  useEffect(() => {
    // 当后台加载从 true 变为 false 时（即加载完成）
    if (prevBackgroundLoadingRef.current && !backgroundSourcesLoading) {
      // 如果当前选项卡在换源位置，触发测速
      if (activeTab === 'sources' && optimizationEnabled) {
        // 筛选出尚未测速的播放源，并排除不需要测速的源（openlist/emby/xiaoya）
        const pendingSources = availableSources.filter((source) => {
          const sourceKey = `${source.source}-${source.id}`;
          // 跳过已测速的源
          if (attemptedSourcesRef.current.has(sourceKey)) return false;
          // 跳过不需要测速的源
          if (source.source === 'openlist' || source.source === 'emby' || source.source.startsWith('emby_') || source.source === 'xiaoya') return false;
          return true;
        });

        if (pendingSources.length > 0) {
          const batchSize = Math.ceil(pendingSources.length / 2);

          const fetchInBatches = async () => {
            for (let start = 0; start < pendingSources.length; start += batchSize) {
              const batch = pendingSources.slice(start, start + batchSize);
              await Promise.all(batch.map(getVideoInfo));
            }

            if (!initialTestingCompleted) {
              setInitialTestingCompleted(true);
            }
          };

          fetchInBatches();
        }
      }
    }

    // 更新前一次的加载状态
    prevBackgroundLoadingRef.current = backgroundSourcesLoading;
  }, [backgroundSourcesLoading, activeTab, availableSources, getVideoInfo, optimizationEnabled, initialTestingCompleted, currentSource]);

  // 根据 descending 状态决定分组标签的排序和内容
  const categories = useMemo(() => {
    const groups = descending ? [...episodeGroupsAsc].reverse() : episodeGroupsAsc;
    return groups.map((group) => group.label);
  }, [episodeGroupsAsc, descending]);


  // 处理换源tab点击，只在点击时才搜索
  const handleSourceTabClick = () => {
    setActiveTab('sources');
  };

  const handleCategoryClick = useCallback(
    (index: number) => {
      if (descending) {
        // 在倒序时，需要将显示索引转换为实际索引
        setCurrentPage(pageCount - 1 - index);
      } else {
        setCurrentPage(index);
      }
    },
    [descending, pageCount]
  );

  const handleEpisodeClick = useCallback(
    (episodeNumber: number) => {
      if (episodeNumber + 1 === value) {
        return;
      }

      onChange?.(episodeNumber);
    },
    [onChange, value]
  );

  // 播出日历：日期 → 该日更新的集号。用 episodeCards 的 airDate（TMDB 播出
  // 日期），只统计当前源实际有的集数。
  const airDateMap = useMemo(() => {
    const map = new Map<string, number[]>();
    if (!episodeCards) return map;
    episodeCards.forEach((card, index) => {
      const date = card?.airDate;
      if (!date) return;
      const key = date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), index + 1]);
    });
    return map;
  }, [episodeCards]);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState('');

  // 默认落在「最新已播」那一集所在的月份。用源内实际有播出日期的集算，而不是
  // TMDB 该季 —— 完结剧没有 airCalendar，落到「今天」会打开一个空月历。
  const latestAirDate = useMemo(() => {
    let latest = '';
    airDateMap.forEach((_, date) => {
      if (date > latest) latest = date;
    });
    return latest;
  }, [airDateMap]);
  const shownMonth = calendarMonth || (latestAirDate || todayKey).slice(0, 7);
  const calendarCells = useMemo(
    () => buildMonthGrid(shownMonth, airDateMap),
    [shownMonth, airDateMap]
  );
  const [shownYear, shownMonthNumber] = shownMonth.split('-').map(Number);

  // 当前正在播放那一集的播出日期，用于在日历上标出「你在这里」
  const activeDayKey = episodeCards?.[value - 1]?.airDate?.slice(0, 10);

  // 日历行的汇总。用源里实际有播出日期的集数算，而不是 TMDB 该季的总集数 ——
  // 源里可能只上架了 2 集，拿 TMDB 的 8 集当分母会显示成「2 / 8」，误导。
  const airSummary = useMemo(() => {
    const entries = Array.from(airDateMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    if (entries.length === 0) return null;
    let total = 0;
    let aired = 0;
    let latestAiredEpisode: number | undefined;
    let latestAiredDate = '';
    for (const [date, episodes] of entries) {
      total += episodes.length;
      if (date <= todayKey) {
        aired += episodes.length;
        latestAiredEpisode = episodes[episodes.length - 1];
        latestAiredDate = date;
      }
    }
    return {
      total,
      aired,
      firstDate: entries[0][0],
      lastDate: entries[entries.length - 1][0],
      latestAiredEpisode,
      latestAiredDate,
    };
  }, [airDateMap, todayKey]);

  const shiftCalendarMonth = useCallback(
    (delta: number) => {
      const [year, month] = shownMonth.split('-').map(Number);
      const next = new Date(year, month - 1 + delta, 1);

      setCalendarMonth(
        `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
      );
    },
    [shownMonth]
  );

  // 把卡片条滚到某一集并居中。按 data-episode 找，不依赖渲染顺序。
  // 桌面端是竖排（滚 top）、窄屏是横排（滚 left），按实际的 flex-direction 决定
  // 滚哪个方向 —— 另一个方向虽然 overflow 是 hidden，程序化滚动仍然会生效，
  // 不判断的话会把内容推歪。
  // 用 'auto' 不用 'smooth'：smooth 依赖渲染帧，面板 / 后台标签页里会静默失效。
  const scrollStripToEpisode = useCallback((episodeNumber: number) => {
    const strip = cardStripRef.current;
    if (!strip) return;
    const slot = strip.querySelector<HTMLElement>(
      `[data-episode="${episodeNumber}"]`
    );
    if (!slot) return;

    const stripRect = strip.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();

    if (getComputedStyle(strip).flexDirection === 'column') {
      strip.scrollTo({
        top:
          strip.scrollTop +
          (slotRect.top - stripRect.top) -
          (strip.clientHeight - slotRect.height) / 2,
      });
    } else {
      strip.scrollTo({
        left:
          strip.scrollLeft +
          (slotRect.left - stripRect.left) -
          (strip.clientWidth - slotRect.width) / 2,
      });
    }
  }, []);

  // 进入播放页（含从播放记录 / 历史恢复）时，把卡片条滚到正在播的那一集 ——
  // 否则不管在播第几集，卡片列表永远停在第一集。
  //
  // 首屏几帧内 detail 还没到、栅格高度也没定，卡片尺寸量出来是 0，直接滚会算出
  // 位移 0 什么也不做。所以轮询到「卡片条有高度且真的能滚」再执行。
  // 用 setTimeout 而不是 requestAnimationFrame：rAF 依赖渲染帧，面板 / 后台
  // 标签页里不产生帧，回调永远不触发（'smooth' 滚动失效也是同一个原因）。
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const tick = () => {
      if (cancelled) return;

      const strip = cardStripRef.current;
      const slot = strip?.querySelector(`[data-episode="${value}"]`);
      const ready =
        strip &&
        slot &&
        strip.clientHeight > 0 &&
        (strip.scrollHeight > strip.clientHeight ||
          strip.scrollWidth > strip.clientWidth);

      if (ready) {
        scrollStripToEpisode(value);
        return;
      }
      // 最多等 20 次 × 80ms ≈ 1.6s，避免分集数据一直不来时空转
      if (attempts++ < 20) {
        timer = setTimeout(tick, 80);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [value, episodeViewMode, totalEpisodes, scrollStripToEpisode]);

  // 点日历上的某一天 → 切到那天更新的第一集，并把卡片条滚过去
  const handleCalendarDay = useCallback(
    (episodes: number[]) => {
      const target = episodes[0];
      if (!target) return;
      if (target !== value) {
        onChange?.(target - 1);
      }
      scrollStripToEpisode(target);
      setShowCalendar(false);
    },
    [onChange, value, scrollStripToEpisode]
  );

  const handleSourceClick = useCallback(
    (source: SearchResult) => {
      onSourceChange?.(source.source, source.id, source.title);
    },
    [onSourceChange]
  );

  // 解析网速字符串，转换为 KB/s 数值用于排序
  const parseSpeedToKBps = useCallback((speedStr: string): number => {
    if (!speedStr || speedStr === '未知' || speedStr === '测量中...') {
      return -1; // 无效速度返回 -1，排在最后
    }

    const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
    if (!match) {
      return -1;
    }

    const value = parseFloat(match[1]);
    const unit = match[2];

    // 统一转换为 KB/s
    return unit === 'MB/s' ? value * 1024 : value;
  }, []);

  // 换源列表的排序结果。当前源始终置顶 —— 正在看哪个源需要一眼看到；其余
  // 按所选规则：
  //   速度优先 → 网速降序，网速相同再比画质
  //   画质优先 → 画质降序，画质相同再比网速
  // 测速未完成的源速度为 -1，自然落到最后。
  const sortedSources = useMemo(() => {
    const keyOf = (source: SearchResult) => `${source.source}-${source.id}`;
    return [...availableSources].sort((a, b) => {
      // 不设「等全部测完再排」的闸门：那个标志位一旦没翻上来，排序就整段失效，
      // 用户看到的是「测完速了顺序还是乱的」。没有数据的源速度为 -1，天然排在
      // 最后，边测边排也不会错乱。
      const aInfo = videoInfoMap.get(keyOf(a));

      const bInfo = videoInfoMap.get(keyOf(b));
      const speedDiff =
        (bInfo ? parseSpeedToKBps(bInfo.loadSpeed) : -1) -
        (aInfo ? parseSpeedToKBps(aInfo.loadSpeed) : -1);
      // 「画质优先」按码率排，不按 1080p / 4K 这种标称档位 —— 同样标 1080p
      // 的源实际码率能差一倍，标称值说明不了清晰度
      const bitrateDiff =
        (bInfo ? parseBitrateToKbps(bInfo.bitrate) : -1) -
        (aInfo ? parseBitrateToKbps(aInfo.bitrate) : -1);

      return sourceSortMode === 'quality'
        ? bitrateDiff || speedDiff
        : speedDiff || bitrateDiff;
    });
  }, [availableSources, videoInfoMap, parseSpeedToKBps, sourceSortMode]);

  // 重新测试单个源
  const handleRetestSource = useCallback(
    async (source: SearchResult, e: React.MouseEvent) => {
      e.stopPropagation(); // 阻止事件冒泡，避免触发换源
      const sourceKey = `${source.source}-${source.id}`;


      // 标记为正在测试
      setRetestingSources((prev) => new Set(prev).add(sourceKey));

      // 从已尝试列表中移除，允许重新测试
      setAttemptedSources((prev) => {
        const newSet = new Set(prev);
        newSet.delete(sourceKey);
        return newSet;
      });

      // 同步更新 ref
      attemptedSourcesRef.current.delete(sourceKey);

      // 执行测试
      try {
        await getVideoInfo(source);
      } finally {
        // 无论成功或失败，都移除测试标记
        setRetestingSources((prev) => {
          const newSet = new Set(prev);
          newSet.delete(sourceKey);
          return newSet;
        });
      }
    },
    [getVideoInfo]
  );

  const currentEpisodeGroup = episodeGroupsAsc[currentPage] ?? {
    label: '',
    episodes: [],
  };

  // 工具条上显示的当前范围文案
  const currentGroupLabel = formatEpisodeGroupLabel(currentEpisodeGroup.label);

  // 把当前展示的集号区间报给父组件，让它只拉这一段覆盖到的 TMDB 季。
  // 父组件那边用「值没变就返回 prev」的 setState 兜底，这里不必自己防抖
  useEffect(() => {
    if (!onVisibleEpisodesChange) return;
    // 用 memo 化的分组表 + 下标取，别依赖 currentEpisodeGroup（那个是就地构造的
    // 表达式，每次渲染都是新对象，会让这个 effect 每帧都跑）
    const episodes = episodeGroupsAsc[currentPage]?.episodes;
    if (!episodes || episodes.length === 0) return;
    if (episodes.length === 0) return;
    let start = Number.POSITIVE_INFINITY;
    let end = 0;
    for (const episodeNumber of episodes) {
      if (isEpisodeFiltered(episodeNumber)) continue;
      if (episodeNumber < start) start = episodeNumber;
      if (episodeNumber > end) end = episodeNumber;
    }
    if (!Number.isFinite(start) || end === 0) return;
    onVisibleEpisodesChange({ start, end });
  }, [currentPage, episodeGroupsAsc, isEpisodeFiltered, onVisibleEpisodesChange]);

  // 定稿的选集是数字网格，所以不再「有分集名就自动切列表」——那个自动切换会
  // 让 47 集的剧变成 47 行要滚。分集名挪到每格的 title（悬停可见），网盘源下
  // 长按 / 右键仍能看全名；想要带名字的列表可以在「更多」菜单里手动切。

  // 点击菜单外部关闭三点菜单
  useEffect(() => {
    if (!showEpisodeMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        episodeMenuRef.current &&
        !episodeMenuRef.current.contains(e.target as Node)
      ) {
        setShowEpisodeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, [showEpisodeMenu]);

  return (
    <div
      ref={railRef}
      className='mtv-play-rail flex h-full flex-col overflow-hidden'
    >
      {/* 主要的 Tab 切换 - 无缝融入设计 */}
      <div className='mtv-play-tabbar'>
        {/* 选集选项卡 - 仅在多集时显示 */}
        {totalEpisodes > 1 && (
          <div
            onClick={() => !isRoomMember && setActiveTab('episodes')}
            className={`mtv-play-tab ${isRoomMember ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
              activeTab === 'episodes' ? 'mtv-play-tab-active text-ui-accent' : inactiveTabClass
            }`}
          >
            选集
            {isRoomMember && <span className="ml-1 text-xs">🔒</span>}
          </div>
        )}

        {/* 换源选项卡 */}
        <div
          onClick={() => !isRoomMember && handleSourceTabClick()}
          className={`mtv-play-tab ${isRoomMember ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
            activeTab === 'sources' ? 'mtv-play-tab-active text-ui-accent' : inactiveTabClass
          }`}
        >
          换源
          {isRoomMember && <span className="ml-1 text-xs">🔒</span>}
        </div>

        {/* 弹幕选项卡 */}
        <div
          onClick={() => setActiveTab('danmaku')}
          className={`mtv-play-tab cursor-pointer ${
            activeTab === 'danmaku' ? 'mtv-play-tab-active text-ui-accent' : inactiveTabClass
          }`}
        >
          弹幕
        </div>
      </div>

      {/* 弹幕 Tab 内容 */}
      {activeTab === 'danmaku' && onDanmakuSelect && (
        <div className='mtv-play-danmaku-host overflow-hidden px-4 py-4'>
          <DanmakuPanel
            videoTitle={videoTitle || ''}
            currentEpisodeIndex={value - 1}
            onDanmakuSelect={onDanmakuSelect}
            currentSelection={currentDanmakuSelection || null}
            onUploadDanmaku={onUploadDanmaku}
            onEpisodesLoaded={onDanmakuEpisodesLoaded}
          />
        </div>
      )}

      {/* 选集 Tab 内容 */}
      {activeTab === 'episodes' && (
        <div className='mtv-play-rail-body flex min-h-0 flex-1 flex-col'>
          {/* 工具条：范围选择器吃掉剩余宽度，倒序 / 更多两个方按钮与它同高。
              原来是一条定宽 w-20 的横向 tab 条 + 两个靠 translate-y-[-4px] 硬
              顶上去的图标按钮 —— 既对不齐，又要在栏内横向滚。 */}
          <div className='mtv-play-rail-toolbar'>
            <div className='relative min-w-0 flex-1' ref={rangeMenuRef}>
              <button
                type='button'
                className='mtv-play-select w-full'
                aria-haspopup='menu'
                aria-expanded={showRangeMenu}
                onClick={() => setShowRangeMenu((v) => !v)}
              >
                <span className='truncate'>{currentGroupLabel}</span>
                <ChevronDown className='h-3.5 w-3.5' />
              </button>
              {showRangeMenu && (
                <div
                  className='mtv-play-pop absolute top-full right-0 left-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-xl py-1'
                  role='menu'
                >
                  {categories.map((label, idx) => (
                    <button
                      key={label}
                      type='button'
                      role='menuitem'
                      className='mtv-play-pop-item flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors'
                      onClick={() => {
                        handleCategoryClick(idx);
                        setShowRangeMenu(false);
                      }}
                    >
                      <span>{formatEpisodeGroupLabel(label)}</span>
                      {idx === displayPage && (
                        <Check className='h-3.5 w-3.5 flex-shrink-0' />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 视图切换：分集卡片（默认）/ 数字网格 */}
            <button
              type='button'
              className='mtv-play-mini'
              onClick={() =>
                setEpisodeViewMode((mode) => (mode === 'card' ? 'grid' : 'card'))
              }
              title={
                episodeViewMode === 'card' ? '切换到数字网格' : '切换到分集卡片'
              }
              aria-pressed={episodeViewMode === 'card'}
            >
              {episodeViewMode === 'card' ? (
                <LayoutGrid className='h-4 w-4' />
              ) : (
                <GalleryHorizontal className='h-4 w-4' />
              )}
            </button>

            {/* 正序 / 倒序 */}
            <button
              type='button'
              className='mtv-play-mini'
              onClick={() => setDescending((prev) => !prev)}
              title={descending ? '当前倒序，点击切正序' : '当前正序，点击切倒序'}
              aria-pressed={descending}
            >
              <ArrowUpDown className='h-4 w-4' />
            </button>

            {/* 更多菜单（集数视图切换 / 集数屏蔽 / 手动矫正标题） */}
            <div className='relative flex-shrink-0' ref={episodeMenuRef}>
              <button
                type='button'
                className='mtv-play-mini'
                onClick={() => setShowEpisodeMenu((v) => !v)}
                title='更多'
                aria-haspopup='menu'
                aria-expanded={showEpisodeMenu}
              >
                <MoreVertical className='h-4 w-4' />
              </button>
              {showEpisodeMenu && (
                <div
                  className='mtv-play-pop absolute top-full right-0 z-50 mt-2 min-w-[9rem] rounded-xl py-1'
                  role='menu'
                >
                  <button
                    type='button'
                    role='menuitem'
                    className='mtv-play-pop-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors'
                    onClick={() => {
                      setShowFilterSettings(true);
                      setShowEpisodeMenu(false);
                    }}
                  >
                    <Settings className='h-4 w-4' />
                    <span>集数屏蔽</span>
                  </button>
                  <button
                    type='button'
                    role='menuitem'
                    className='mtv-play-pop-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors'
                    onClick={() => {
                      setShowTitleCorrect(true);
                      setShowEpisodeMenu(false);
                    }}
                  >
                    <Wand2 className='h-4 w-4' />
                    <span>手动矫正标题</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 播出日历：只要有播出日期就出现（完结剧也能看到每集什么时候播的）。
              点整行展开月历，月历里点某一天就切到那天更新的第一集。 */}
          {airSummary && (
            <div className='mtv-play-aircal-wrap'>
              <button
                type='button'
                className='mtv-play-aircal'
                onClick={() => setShowCalendar((v) => !v)}
                aria-expanded={showCalendar}
                aria-label='播出日历'
                title={
                  airCalendar
                    ? `下一集 ${formatAirDate(airCalendar.nextAirDate)} 更新`
                    : undefined
                }
              >
                <CalendarDays className='mtv-play-aircal-ic' />
                <div className='mtv-play-aircal-txt'>
                  <div className='mtv-play-aircal-t'>播出日历</div>
                  <div className='mtv-play-aircal-s'>
                    {airSummary.latestAiredEpisode
                      ? `更新至 第 ${airSummary.latestAiredEpisode} 集 · ${formatAirDate(airSummary.latestAiredDate)}`
                      : `首播 ${formatAirDate(airSummary.firstDate)}`}
                  </div>
                </div>
                <span className='mtv-play-aircal-prog'>
                  {airSummary.aired} / {airSummary.total}
                </span>
                <ChevronDown
                  className={`mtv-play-aircal-chev ${
                    showCalendar ? 'mtv-play-aircal-chev-open' : ''
                  }`}
                />
              </button>

              {showCalendar && (
                <div className='mtv-play-cal'>
                  <div className='mtv-play-cal-head'>
                    <button
                      type='button'
                      className='mtv-play-cal-nav'
                      onClick={() => shiftCalendarMonth(-1)}
                      aria-label='上个月'
                    >
                      <ChevronLeft className='h-4 w-4' />
                    </button>
                    <div className='mtv-play-cal-title'>
                      {shownYear} 年 {shownMonthNumber} 月
                    </div>
                    <button
                      type='button'
                      className='mtv-play-cal-nav'
                      onClick={() => shiftCalendarMonth(1)}
                      aria-label='下个月'
                    >
                      <ChevronRight className='h-4 w-4' />
                    </button>
                  </div>

                  <div className='mtv-play-cal-week'>
                    {['日', '一', '二', '三', '四', '五', '六'].map(
                      (weekday) => (
                        <span key={weekday}>{weekday}</span>
                      )
                    )}
                  </div>

                  <div className='mtv-play-cal-grid'>
                    {calendarCells.map((cell) => {
                      const hasEpisodes = cell.episodes.length > 0;
                      const isAired = hasEpisodes && cell.key <= todayKey;
                      return (
                        <button
                          key={cell.key}
                          type='button'
                          disabled={!hasEpisodes}
                          onClick={() => handleCalendarDay(cell.episodes)}
                          className={[
                            'mtv-play-cal-day',
                            cell.inMonth ? '' : 'mtv-play-cal-day-out',
                            isAired ? 'mtv-play-cal-day-aired' : '',
                            hasEpisodes && !isAired ? 'mtv-play-cal-day-up' : '',
                            hasEpisodes && cell.key === activeDayKey
                              ? 'mtv-play-cal-day-on'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={
                            hasEpisodes
                              ? `第 ${formatEpisodeRange(cell.episodes)} 集`
                              : undefined
                          }
                        >
                          <span className='mtv-play-cal-num'>{cell.day}</span>
                          {cell.key === todayKey && (
                            <span className='mtv-play-cal-today' />
                          )}
                          {hasEpisodes && (
                            <span className='mtv-play-cal-eps'>
                              {formatEpisodeRange(cell.episodes)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 集数：分集卡片（默认）/ 数字网格。两者在窄屏都是横向滚动 ——
              横向条不产生竖向滚动容器，手指竖向拖动不再被这一块吃掉。 */}
          {episodeViewMode === 'card' ? (
            <div className='mtv-play-epcards' ref={cardStripRef}>
              {(() => {
                const episodes = descending
                  ? [...currentEpisodeGroup.episodes].reverse()
                  : currentEpisodeGroup.episodes;
                // 过滤掉被屏蔽的集数，但保持原有索引
                return episodes
                  .filter((episodeNumber) => !isEpisodeFiltered(episodeNumber))
                  .map((episodeNumber) => (
                    <span
                      key={episodeNumber}
                      data-episode={episodeNumber}
                      className='mtv-play-epcard-slot'
                    >
                      <EpisodeCard
                        episodeNumber={episodeNumber}
                        isActive={episodeNumber === value}
                        isWatched={watchedEpisodes.has(episodeNumber)}
                        data={episodeCards?.[episodeNumber - 1]}
                        fallbackName={richEpisodeNames?.[episodeNumber - 1]}
                        loading={episodeCardsLoading}
                        onSelect={handleEpisodeClick}
                      />
                    </span>
                  ));
              })()}
            </div>
          ) : (
            <div className='mtv-play-eps-host'>
              <div className='mtv-play-eps'>
                {(() => {
                  const episodes = descending
                    ? [...currentEpisodeGroup.episodes].reverse()
                    : currentEpisodeGroup.episodes;
                  // 过滤掉被屏蔽的集数，但保持原有索引
                  return episodes
                    .filter(
                      (episodeNumber) => !isEpisodeFiltered(episodeNumber)
                    )
                    .map((episodeNumber) => (
                      <EpisodeChip
                        key={episodeNumber}
                        episodeNumber={episodeNumber}
                        isActive={episodeNumber === value}
                        isWatched={watchedEpisodes.has(episodeNumber)}
                        originalTitle={episodes_titles?.[episodeNumber - 1]}
                        enableOriginalNamePopup={isNetdiskSource(currentSource)}
                        onSelect={handleEpisodeClick}
                        onShowOriginalName={showEpisodeNamePopup}
                      />
                    ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 换源 Tab 内容 */}
      {activeTab === 'sources' && (
        <div className='flex h-full flex-col px-4 py-4'>
          {/* 工具条：排序规则 + 全部重测。排序只在测速完成后生效（没有测速
              数据时无从比较），未完成时按源顺序展示。 */}
          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length > 0 && (
              <div className='mtv-play-srctools'>
                <div
                  className='mtv-play-sortmode'
                  role='group'
                  aria-label='换源排序规则'
                >
                  <button
                    type='button'
                    className={`mtv-play-sortbtn ${
                      sourceSortMode === 'speed' ? 'mtv-play-sortbtn-on' : ''
                    }`}
                    aria-pressed={sourceSortMode === 'speed'}
                    onClick={() => setSourceSortMode('speed')}
                  >
                    速度优先
                  </button>
                  <button
                    type='button'
                    className={`mtv-play-sortbtn ${
                      sourceSortMode === 'quality' ? 'mtv-play-sortbtn-on' : ''
                    }`}
                    aria-pressed={sourceSortMode === 'quality'}
                    onClick={() => setSourceSortMode('quality')}
                  >
                    画质优先
                  </button>
                </div>
                <button
                  type='button'
                  onClick={retestAllSources}
                  disabled={
                    isRetestingAll ||
                    retestingSources.size > 0 ||
                    isInitialTesting
                  }
                  className={`mtv-play-srcretest ${
                    isRetestingAll ||
                    retestingSources.size > 0 ||
                    isInitialTesting
                      ? disabledTextClass
                      : ''
                  }`}
                >
                  {isRetestingAll
                    ? '重测中…'
                    : isInitialTesting
                      ? '测速中…'
                      : '全部重测'}
                </button>
              </div>
            )}
          {sourceSearchLoading && (
            <div className='flex items-center justify-center py-8'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-ui-accent'></div>
              <span className={`ml-2 text-sm ${mutedTextClass}`}>
                搜索中...
              </span>
            </div>
          )}

          {sourceSearchError && (
            <div className='flex items-center justify-center py-8'>
              <div className='text-center'>
                <div className='text-red-500 text-2xl mb-2'>⚠️</div>
                <p className='text-sm text-red-400'>
                  {sourceSearchError}
                </p>
              </div>
            </div>
          )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length === 0 && (
              <div className='flex items-center justify-center py-8'>
                <div className='text-center'>
                  <div className='text-gray-400 text-2xl mb-2'>📺</div>
                  <p className={`text-sm ${mutedTextClass}`}>
                    暂无可用的换源
                  </p>
                </div>
              </div>
            )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length > 0 && (
              <div className='flex-1 overflow-y-auto space-y-2 pb-2'>
                <div
                  className={`mtv-play-sources ${
                    showAllSources ? '' : 'is-capped'
                  }`}
                >
                {sortedSources
                  .map((source, index) => {
                    const isCurrentSource =
                      source.source?.toString() === currentSource?.toString() &&
                      source.id?.toString() === currentId?.toString();
                    return (
                      <div
                        key={`${source.source}-${source.id}`}
                        onClick={() =>
                          !isCurrentSource && handleSourceClick(source)
                        }
                        className={`flex items-start gap-3 px-2 py-3 rounded-lg transition-all select-none duration-200 relative
                      ${isCurrentSource
                         ? 'bg-ui-accent-soft border-ui-accent-soft border'
                          : 'hover:bg-white/10 hover:scale-[1.02] cursor-pointer'
                          }`.trim()}
                      >
                        {/* 封面 */}
                        <div className='flex-shrink-0 w-12 h-20 bg-ui-surface-3 rounded overflow-hidden flex items-center justify-center'>
                          {source.source === 'directplay' ? (
                            <LinkIcon className='w-6 h-6 text-blue-500' />
                          ) : source.poster ? (
                            <ProxyImage
                              originalSrc={source.poster}
                              alt={source.title}
                              className='w-full h-full object-cover'
                              retryOnError={false}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          ) : null}
                        </div>

                        {/* 信息区域 */}
                        <div className='flex-1 min-w-0 flex flex-col justify-between h-20'>
                          {/* 标题和分辨率 - 顶部 */}
                          <div className='flex items-start justify-between gap-3 h-6'>
                            <div className='relative flex min-w-0 flex-1 items-center gap-1.5 group/title'>
                              <h3 className={`font-medium text-base truncate ${sourceTitleClass} leading-none`}>
                                {source.title}
                              </h3>
                              {isCurrentSource && (
                                <span className='mtv-play-srcnow'>当前</span>
                              )}
                              {/* 标题级别的 tooltip - 第一个元素不显示 */}
                              {index !== 0 && (
                                <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover/title:opacity-100 group-hover/title:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap z-[500] pointer-events-none'>
                                  {source.title}
                                  <div className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'></div>
                                </div>
                              )}
                            </div>
                            {(() => {
                              const sourceKey = `${source.source}-${source.id}`;
                              const videoInfo = videoInfoMap.get(sourceKey);

                              if (videoInfo && videoInfo.quality !== '未知') {
                                if (videoInfo.hasError) {
                                  return (
                                    <div className='bg-white/10 text-red-400 px-1.5 py-0 rounded text-xs flex-shrink-0 min-w-[50px] text-center'>
                                      {videoInfo.errorType === 'timeout'
                                        ? '超时'
                                        : '无法访问'}
                                    </div>
                                  );
                                } else {
                                  // 根据分辨率设置不同颜色：2K、4K为紫色，1080p、720p为绿色，其他为黄色
                                  const isUltraHigh = ['4K', '2K'].includes(
                                    videoInfo.quality
                                  );
                                  const isHigh = ['1080p', '720p'].includes(
                                    videoInfo.quality
                                  );
                                  const textColorClasses = isUltraHigh
                                    ? 'text-purple-600 dark:text-purple-400'
                                    : isHigh
                                      ? 'text-ui-accent'
                                      : 'text-yellow-600 dark:text-yellow-400';

                                  return (
                                    <div
                                      className={`bg-white/10 ${textColorClasses} px-1.5 py-0 rounded text-xs flex-shrink-0 min-w-[50px] text-center`}
                                    >
                                      {videoInfo.quality}
                                    </div>
                                  );
                                }
                              }

                              return null;
                            })()}
                          </div>

                          {/* 源名称和集数信息 - 垂直居中 */}
                          <div className='flex items-center justify-between'>
                            <span className={`text-xs px-2 py-1 border rounded ${sourcePillTextClass} ${
                              source.source === 'xiaoya' ? 'border-blue-500' : isNetdiskSource(source.source) ? 'border-purple-500' : source.source === 'openlist' || source.source === 'emby' || source.source?.startsWith('emby_')
                           ? 'border-yellow-500'
                                : 'border-gray-500/60'
                      }`}>
                              {source.source_name}
                            </span>
                            {source.episodes.length > 1 && (
                              <span className={`text-xs ${faintTextClass} font-medium`}>
                                {source.episodes.length} 集
                              </span>
                            )}
                          </div>

                          {/* 网络信息 - 底部 */}
                          <div className='flex items-end justify-between h-6'>
                            <div className='flex items-end gap-3'>
                              {(() => {
                                const sourceKey = `${source.source}-${source.id}`;
                                const videoInfo = videoInfoMap.get(sourceKey);
                                if (videoInfo) {
                                  if (!videoInfo.hasError) {
                                    return (
                                      <div className='flex items-end gap-3 text-xs'>
                                        <div className='text-ui-accent font-medium text-xs'>
                                          {videoInfo.loadSpeed}
                                        </div>
                                        <div className='text-orange-600 dark:text-orange-400 font-medium text-xs'>
                                          {videoInfo.pingTime}ms
                                        </div>
                                        {videoInfo.bitrate && videoInfo.bitrate !== '未知' && (
                                          <div className='text-purple-600 dark:text-purple-400 font-medium text-xs'>
                                            {videoInfo.bitrate}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div className='text-red-500/90 dark:text-red-400 font-medium text-xs'>
                                        {videoInfo.errorType === 'timeout'
                                          ? '测速超时'
                                          : '源无法访问'}
                                      </div>
                                    );
                                  }
                                }
                                return null;
                              })()}
                            </div>
                            {/* 重新测试按钮 */}
                            {(() => {
                              // 私人影库、Emby 和小雅不显示重新测试按钮
                              if (source.source === 'openlist' || source.source === 'emby' || source.source.startsWith('emby_') || source.source === 'xiaoya') {
                                return null;
                              }

                              const sourceKey = `${source.source}-${source.id}`;
                              const isTesting = retestingSources.has(sourceKey);
                              const videoInfo = videoInfoMap.get(sourceKey);

                              // 只有第一次测试完成后（有测速数据）才显示重新测试按钮
                              if (videoInfo) {
                                return (
                                  <button
                                    onClick={(e) => handleRetestSource(source, e)}
                                    disabled={isTesting}
                                    className={`text-xs font-medium transition-colors ${
                                      isTesting
                                        ? disabledTextClass
                                        : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer'
                                    }`}
                                  >
                                    {isTesting ? '测试中...' : '重新测试'}
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 窄屏默认只列前 4 个源：侧栏去掉内部滚动条之后，几十个源会
                    把页面撑到两千多 px，把详情推到很远。桌面端列表本来就在
                    栏内滚，不裁剪。 */}
                {availableSources.length > 4 && (
                  <button
                    type='button'
                    className='mtv-play-sources-more mtv-play-pop-item w-full rounded-lg px-3 py-2 text-center text-xs transition-colors'
                    onClick={toggleAllSources}
                  >
                    {showAllSources
                      ? '收起'
                      : `展开全部 ${availableSources.length} 个播放源`}
                  </button>
                )}

                {/* 后台加载提示 */}
                {backgroundSourcesLoading && (
                  <div className='flex items-center justify-center py-6 border-t border-white/10'>
                    <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-ui-accent'></div>
                    <span className={`ml-2 text-sm ${mutedTextClass}`}>
                      正在加载更多播放源...
                    </span>
                  </div>
                )}
                <div className='flex-shrink-0 mt-auto pt-2 border-t border-ui-hair'>
                  <button
                    onClick={() => {
                      if (videoTitle) {
                        router.push(
                          `/search?q=${encodeURIComponent(videoTitle)}`
                        );
                      }
                    }}
                    className={`w-full text-center text-xs ${faintTextClass} hover:text-ui-accent transition-colors py-2`}
                  >
                    影片匹配有误？点击去搜索
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      {/* 集数过滤设置弹窗 */}
      <EpisodeFilterSettings
        isOpen={showFilterSettings}
        onClose={() => setShowFilterSettings(false)}
        onConfigUpdate={(config) => {
          onFilterConfigUpdate?.(config);
        }}
        onShowToast={onShowToast}
      />

      {/* 手动矫正标题弹窗 */}
      <EpisodeTitleCorrectDialog
        isOpen={showTitleCorrect}
        onClose={() => setShowTitleCorrect(false)}
        videoTitle={videoTitle || ''}
        totalEpisodes={totalEpisodes}
      />

      {/* 原集名 popup：移动端长按 / 桌面右键，样式对齐标题上方 aka 提示 */}
      {episodeNamePopup &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className='fixed z-[1000] px-3 py-2 bg-gray-800 dark:bg-gray-900 text-white text-sm rounded-lg shadow-xl pointer-events-none max-w-[min(80vw,20rem)]'
            style={{
              left: episodeNamePopup.x,
              top: episodeNamePopup.y,
              transform:
                episodeNamePopup.placement === 'top'
                  ? 'translate(-50%, -100%)'
                  : 'translate(-50%, 0)',
            }}
            role='tooltip'
          >
            <div className='text-sm break-words whitespace-normal'>
              {episodeNamePopup.title}
            </div>
            {episodeNamePopup.placement === 'top' ? (
              <div className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800 dark:border-t-gray-900' />
            ) : (
              <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800 dark:border-b-gray-900' />
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default EpisodeSelector;
