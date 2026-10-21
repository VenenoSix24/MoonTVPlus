/* eslint-disable no-console,react-hooks/exhaustive-deps */

'use client';

import {
  Bug,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { changelog, ChangelogEntry } from '@/lib/changelog';
import { CURRENT_VERSION } from '@/lib/version';
import { compareVersions, UpdateStatus } from '@/lib/version_check';

interface VersionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RemoteChangelogEntry {
  version: string;
  date: string;
  added: string[];
  changed: string[];
  fixed: string[];
}

// 变更日志支持有限的 HTML 样式（加粗、变色等）。
// 只保留白名单标签与内联样式，远程日志内容也走同一过滤，避免注入。
const CHANGELOG_ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'DEL',
  'BR',
  'CODE',
  'MARK',
  'SPAN',
  'SMALL',
  'SUB',
  'SUP',
]);

const CHANGELOG_ALLOWED_STYLES = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
  'font-size',
]);

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] ?? char)
  );

const sanitizeChangelogHtml = (html: string): string => {
  if (typeof document === 'undefined' || !html.includes('<')) {
    return escapeHtml(html);
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const container = document.createElement('div');

  const cloneChildren = (source: Node, target: Node) => {
    source.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(node.textContent ?? ''));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (!CHANGELOG_ALLOWED_TAGS.has(element.tagName)) {
          // 未允许的标签直接解包，仅保留其中的文本
          cloneChildren(element, target);
          return;
        }
        const clean = document.createElement(element.tagName.toLowerCase());
        if (element.tagName === 'SPAN') {
          CHANGELOG_ALLOWED_STYLES.forEach((prop) => {
            const value = element.style.getPropertyValue(prop);
            if (value) clean.style.setProperty(prop, value);
          });
        }
        cloneChildren(element, clean);
        target.appendChild(clean);
      }
    });
  };

  cloneChildren(parsed.body, container);
  return container.innerHTML;
};

const changelogHtmlCache = new Map<string, string>();
const renderChangelogText = (html: string): string => {
  const cached = changelogHtmlCache.get(html);
  if (cached !== undefined) return cached;
  const sanitized = sanitizeChangelogHtml(html);
  changelogHtmlCache.set(html, sanitized);
  return sanitized;
};

export const VersionPanel: React.FC<VersionPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const [remoteChangelog, setRemoteChangelog] = useState<ChangelogEntry[]>([]);
  const [hasUpdate, setIsHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [showRemoteContent, setShowRemoteContent] = useState(false);

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Body 滚动锁定 - 使用 overflow 方式避免布局问题
  useEffect(() => {
    if (isOpen) {
      const body = document.body;
      const html = document.documentElement;

      // 保存原始样式
      const originalBodyOverflow = body.style.overflow;
      const originalHtmlOverflow = html.style.overflow;

      // 只设置 overflow 来阻止滚动
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';

      return () => {
        // 恢复所有原始样式
        body.style.overflow = originalBodyOverflow;
        html.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isOpen]);

  // 获取远程变更日志
  useEffect(() => {
    if (isOpen) {
      fetchRemoteChangelog();
    }
  }, [isOpen]);

  // 获取远程变更日志
  const fetchRemoteChangelog = async () => {
    try {
      const response = await fetch(
        'https://raw.githubusercontent.com/VenenoSix24/MoonTVPlus/main/CHANGELOG'
      );
      if (response.ok) {
        const content = await response.text();
        const parsed = parseChangelog(content);
        setRemoteChangelog(parsed);

        // 检查是否有更新
        if (parsed.length > 0) {
          const latest = parsed[0];
          setLatestVersion(latest.version);
          setIsHasUpdate(
            compareVersions(latest.version) === UpdateStatus.HAS_UPDATE
          );
        }
      } else {
        console.error(
          '获取远程变更日志失败:',
          response.status,
          response.statusText
        );
      }
    } catch (error) {
      console.error('获取远程变更日志失败:', error);
    }
  };

  // 解析变更日志格式
  const parseChangelog = (content: string): RemoteChangelogEntry[] => {
    const lines = content.split('\n');
    const versions: RemoteChangelogEntry[] = [];
    let currentVersion: RemoteChangelogEntry | null = null;
    let currentSection: string | null = null;
    let inVersionContent = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 匹配版本行: ## [X.Y.Z] - YYYY-MM-DD
      const versionMatch = trimmedLine.match(
        /^## \[([\d.]+)\] - (\d{4}-\d{2}-\d{2})$/
      );
      if (versionMatch) {
        if (currentVersion) {
          versions.push(currentVersion);
        }

        currentVersion = {
          version: versionMatch[1],
          date: versionMatch[2],
          added: [],
          changed: [],
          fixed: [],
        };
        currentSection = null;
        inVersionContent = true;
        continue;
      }

      // 如果遇到下一个版本或到达文件末尾，停止处理当前版本
      if (inVersionContent && currentVersion) {
        // 匹配章节标题
        if (trimmedLine === '### Added') {
          currentSection = 'added';
          continue;
        } else if (trimmedLine === '### Changed') {
          currentSection = 'changed';
          continue;
        } else if (trimmedLine === '### Fixed') {
          currentSection = 'fixed';
          continue;
        }

        // 匹配条目: - 内容
        if (trimmedLine.startsWith('- ') && currentSection) {
          const entry = trimmedLine.substring(2);
          if (currentSection === 'added') {
            currentVersion.added.push(entry);
          } else if (currentSection === 'changed') {
            currentVersion.changed.push(entry);
          } else if (currentSection === 'fixed') {
            currentVersion.fixed.push(entry);
          }
        }
      }
    }

    // 添加最后一个版本
    if (currentVersion) {
      versions.push(currentVersion);
    }

    return versions;
  };

  // 渲染变更日志条目
  const renderChangelogEntry = (
    entry: ChangelogEntry | RemoteChangelogEntry,
    isCurrentVersion = false,
    isRemote = false
  ) => {
    const isUpdate = isRemote && hasUpdate && entry.version === latestVersion;

    return (
      <div
        key={entry.version}
        className={`rounded-ui-md border p-4 ${isCurrentVersion
          ? 'border-ui-accent bg-ui-accent-soft'
          : isUpdate
            ? 'border-ui-success bg-ui-success-soft'
            : 'border-ui-hair bg-ui-surface'
          }`}
      >
        {/* 版本标题 */}
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <h4 className='text-lg font-semibold text-ui-ink'>
              v{entry.version}
            </h4>
            {isCurrentVersion && (
              <span className='px-2 py-1 text-xs font-medium bg-ui-accent text-white rounded-full'>
                当前版本
              </span>
            )}
            {isUpdate && (
              <span className='px-2 py-1 text-xs font-medium bg-ui-success text-white rounded-full flex items-center gap-1'>
                <Download className='w-3 h-3' />
                可更新
              </span>
            )}
          </div>
          <div className='flex items-center gap-2 text-sm text-ui-ink-3'>
            {entry.date}
          </div>
        </div>

        {/* 变更内容 */}
        <div className='space-y-3'>
          {entry.added.length > 0 && (
            <div>
              <h5 className='text-sm font-medium text-ui-accent  mb-2 flex items-center gap-1'>
                <Plus className='w-4 h-4' />
                新增功能
              </h5>
              <ul className='space-y-1'>
                {entry.added.map((item, index) => (
                  <li
                    key={index}
                    className='text-sm text-ui-ink-2 flex items-start gap-2'
                  >
                    <span className='w-1.5 h-1.5 bg-ui-accent rounded-full mt-2 flex-shrink-0'></span>
                    <span
                      className='min-w-0 flex-1'
                      dangerouslySetInnerHTML={{
                        __html: renderChangelogText(item),
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.changed.length > 0 && (
            <div>
              <h5 className='text-sm font-medium text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1'>
                <RefreshCw className='w-4 h-4' />
                功能改进
              </h5>
              <ul className='space-y-1'>
                {entry.changed.map((item, index) => (
                  <li
                    key={index}
                    className='text-sm text-ui-ink-2 flex items-start gap-2'
                  >
                    <span className='w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0'></span>
                    <span
                      className='min-w-0 flex-1'
                      dangerouslySetInnerHTML={{
                        __html: renderChangelogText(item),
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.fixed.length > 0 && (
            <div>
              <h5 className='text-sm font-medium text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-1'>
                <Bug className='w-4 h-4' />
                问题修复
              </h5>
              <ul className='space-y-1'>
                {entry.fixed.map((item, index) => (
                  <li
                    key={index}
                    className='text-sm text-ui-ink-2 flex items-start gap-2'
                  >
                    <span className='w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 flex-shrink-0'></span>
                    <span
                      className='min-w-0 flex-1'
                      dangerouslySetInnerHTML={{
                        __html: renderChangelogText(item),
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 版本面板内容
  const versionPanelContent = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={onClose}
        onTouchMove={(e) => {
          // 只阻止滚动，允许其他触摸事件
          e.preventDefault();
        }}
        onWheel={(e) => {
          // 阻止滚轮滚动
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 版本面板 */}
      <div
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[90vh] bg-ui-surface-2 border border-ui-hair rounded-ui-lg shadow-ui-3 z-[1001] overflow-hidden'
        onTouchMove={(e) => {
          // 允许版本面板内部滚动，阻止事件冒泡到外层
          e.stopPropagation();
        }}
        style={{
          touchAction: 'auto', // 允许面板内的正常触摸操作
        }}
      >
        {/* 标题栏 */}
        <div className='flex items-center justify-between p-3 sm:p-6 border-b border-ui-hair'>
          <div className='flex items-center gap-2 sm:gap-3'>
            <h3 className='text-lg sm:text-xl font-bold text-ui-ink'>
              版本信息
            </h3>
            <div className='flex flex-wrap items-center gap-1 sm:gap-2'>
              <span className='px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium bg-ui-accent-soft text-ui-accent   rounded-full'>
                v{CURRENT_VERSION}
              </span>
              {hasUpdate && (
                <span className='px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium bg-ui-accent-soft text-ui-accent rounded-full flex items-center gap-1'>
                  <Download className='w-3 h-3 sm:w-4 sm:h-4' />
                  <span className='hidden sm:inline'>有新版本可用</span>
                  <span className='sm:hidden'>可更新</span>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className='w-6 h-6 sm:w-8 sm:h-8 p-1 rounded-full flex items-center justify-center text-ui-ink-3 mtv-hover-ink'
            aria-label='关闭'
          >
            <X className='w-full h-full' />
          </button>
        </div>

        {/* 内容区域 */}
        <div className='p-3 sm:p-6 overflow-y-auto max-h-[calc(95vh-140px)] sm:max-h-[calc(90vh-120px)]'>
          <div className='space-y-3 sm:space-y-6'>
            {/* 远程更新信息 */}
            {hasUpdate && (
              <div className='rounded-ui-md border border-ui-success bg-ui-success-soft p-3 sm:p-4'>
                <div className='flex flex-col gap-3'>
                  <div className='flex items-center gap-2 sm:gap-3'>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 bg-ui-success rounded-full flex items-center justify-center flex-shrink-0'>
                      <Download className='w-4 h-4 sm:w-5 sm:h-5 text-white' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <h4 className='text-sm sm:text-base font-semibold text-ui-ink'>
                        发现新版本
                      </h4>
                      <p className='text-xs sm:text-sm text-ui-ink-2 break-all'>
                        v{CURRENT_VERSION} → v{latestVersion}
                      </p>
                    </div>
                  </div>
                  <a
                    href='https://github.com/VenenoSix24/MoonTVPlus'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center justify-center gap-2 px-3 py-2 bg-ui-accent text-white text-xs sm:text-sm rounded-ui-sm transition-opacity shadow-ui-1 w-full hover:opacity-90'
                  >
                    <Download className='w-3 h-3 sm:w-4 sm:h-4' />
                    前往仓库
                  </a>
                </div>
              </div>
            )}

            {/* 当前为最新版本信息 */}
            {!hasUpdate && (
              <div className='rounded-ui-md border border-ui-hair bg-ui-surface p-3 sm:p-4'>
                <div className='flex flex-col gap-3'>
                  <div className='flex items-center gap-2 sm:gap-3'>
                    <div className='w-8 h-8 sm:w-10 sm:h-10 bg-ui-success-soft rounded-full flex items-center justify-center flex-shrink-0'>
                      <CheckCircle className='w-4 h-4 sm:w-5 sm:h-5 text-ui-success' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <h4 className='text-sm sm:text-base font-semibold text-ui-ink'>
                        当前为最新版本
                      </h4>
                      <p className='text-xs sm:text-sm text-ui-ink-2 break-all'>
                        已是最新版本 v{CURRENT_VERSION}
                      </p>
                    </div>
                  </div>
                  <a
                    href='https://github.com/VenenoSix24/MoonTVPlus'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center justify-center gap-2 px-3 py-2 bg-ui-accent text-white text-xs sm:text-sm rounded-ui-sm transition-opacity shadow-ui-1 w-full hover:opacity-90'
                  >
                    <CheckCircle className='w-3 h-3 sm:w-4 sm:h-4' />
                    前往仓库
                  </a>
                </div>
              </div>
            )}

            {/* 远程可更新内容 */}
            {hasUpdate && (
              <div className='space-y-4'>
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
                  <h4 className='text-lg font-semibold text-ui-ink flex items-center gap-2'>
                    <Download className='w-5 h-5 text-ui-accent' />
                    远程更新内容
                  </h4>
                  <button
                    onClick={() => setShowRemoteContent(!showRemoteContent)}
                    className='inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-ui-accent-soft text-ui-accent rounded-ui-sm transition-opacity hover:opacity-85 text-sm w-full sm:w-auto'
                  >
                    {showRemoteContent ? (
                      <>
                        <ChevronUp className='w-4 h-4' />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown className='w-4 h-4' />
                        查看更新内容
                      </>
                    )}
                  </button>
                </div>

                {showRemoteContent && remoteChangelog.length > 0 && (
                  <div className='space-y-4'>
                    {remoteChangelog
                      .filter((entry) => {
                        // 找到第一个本地版本，过滤掉本地已有的版本
                        const localVersions = changelog.map(
                          (local) => local.version
                        );
                        return !localVersions.includes(entry.version);
                      })
                      .map((entry, index) => (
                        <div
                          key={index}
                          className={`rounded-ui-md border p-4 ${entry.version === latestVersion
                            ? 'border-ui-success bg-ui-success-soft'
                            : 'border-ui-hair bg-ui-surface'
                            }`}
                        >
                          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <h4 className='text-lg font-semibold text-ui-ink'>
                                v{entry.version}
                              </h4>
                              {entry.version === latestVersion && (
                                <span className='px-2 py-1 text-xs font-medium bg-ui-success text-white rounded-full flex items-center gap-1'>
                                  远程最新
                                </span>
                              )}
                            </div>
                            <div className='flex items-center gap-2 text-sm text-ui-ink-3'>
                              {entry.date}
                            </div>
                          </div>

                          {entry.added && entry.added.length > 0 && (
                            <div className='mb-3'>
                              <h5 className='text-sm font-medium text-ui-accent  mb-2 flex items-center gap-1'>
                                <Plus className='w-4 h-4' />
                                新增功能
                              </h5>
                              <ul className='space-y-1'>
                                {entry.added.map((item, itemIndex) => (
                                  <li
                                    key={itemIndex}
                                    className='text-sm text-ui-ink-2 flex items-start gap-2'
                                  >
                                    <span className='w-1.5 h-1.5 bg-ui-accent rounded-full mt-2 flex-shrink-0'></span>
                                    <span
                                      className='min-w-0 flex-1'
                                      dangerouslySetInnerHTML={{
                                        __html: renderChangelogText(item),
                                      }}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {entry.changed && entry.changed.length > 0 && (
                            <div className='mb-3'>
                              <h5 className='text-sm font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1'>
                                <RefreshCw className='w-4 h-4' />
                                功能改进
                              </h5>
                              <ul className='space-y-1'>
                                {entry.changed.map((item, itemIndex) => (
                                  <li
                                    key={itemIndex}
                                    className='text-sm text-ui-ink-2 flex items-start gap-2'
                                  >
                                    <span className='w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0'></span>
                                    <span
                                      className='min-w-0 flex-1'
                                      dangerouslySetInnerHTML={{
                                        __html: renderChangelogText(item),
                                      }}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {entry.fixed && entry.fixed.length > 0 && (
                            <div>
                              <h5 className='text-sm font-medium text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-1'>
                                <Bug className='w-4 h-4' />
                                问题修复
                              </h5>
                              <ul className='space-y-1'>
                                {entry.fixed.map((item, itemIndex) => (
                                  <li
                                    key={itemIndex}
                                    className='text-sm text-ui-ink-2 flex items-start gap-2'
                                  >
                                    <span className='w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 flex-shrink-0'></span>
                                    <span
                                      className='min-w-0 flex-1'
                                      dangerouslySetInnerHTML={{
                                        __html: renderChangelogText(item),
                                      }}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* 变更日志标题 */}
            <div className='border-b border-ui-hair pb-4'>
              <h4 className='text-lg font-semibold text-ui-ink pb-3 sm:pb-4'>
                变更日志
              </h4>

              <div className='space-y-4'>
                {/* 本地变更日志 */}
                {changelog.map((entry) =>
                  renderChangelogEntry(
                    entry,
                    entry.version === CURRENT_VERSION,
                    false
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // 使用 Portal 渲染到 document.body
  if (!mounted || !isOpen) return null;

  return createPortal(versionPanelContent, document.body);
};
