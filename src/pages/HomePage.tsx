import React, { Suspense, lazy, memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { RepositoryCard } from '../components/RepositoryCard';
import { SyncProgress } from '../components/SyncProgress';
import { toast } from '../components/Toast';
import { t } from '../locales';
import { shouldIgnoreGlobalKeydown } from '../utils/keyboard';
import { getTagTextColor } from '../utils/tagColor';
import { getLanguageColor } from '../constants/languages';
import { formatCompactNumber, getRepoSortTimeInfo } from '../utils/format';
import { FilterBar, type FilterBarHandle } from './home/components/FilterBar';
import { EmptyState } from '../components/EmptyState';
import { SkeletonCard } from '../components/Skeleton';
import type { DetailTab, Repository, SortBy, Tag } from '../types';

const HomeNoteCard = lazy(() =>
    import('./home/components/HomeNoteCard').then((m) => ({ default: m.HomeNoteCard }))
);
const ReleaseUpdatesView = lazy(() =>
    import('../components/ReleaseUpdatesView').then((m) => ({ default: m.ReleaseUpdatesView }))
);
import {
    RefreshCw, ChevronLeft, ChevronRight,
    Star, Sparkles, FileText, Package, SearchX, AlertTriangle, X,
    Bell, Box, Tag as TagIcon, MinusCircle, CheckSquare
} from 'lucide-react';

const CARD_ROW_ESTIMATE = 136;
const LIST_ROW_ESTIMATE = 72;

const MiniAvatar: React.FC<{ avatarUrl?: string; login: string }> = memo(({ avatarUrl, login }) => {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [avatarUrl]);

    if (!avatarUrl || failed) {
        return (
            <div style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                background: 'var(--color-surface-secondary)',
                border: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Box size={13} style={{ color: 'var(--color-text-muted)' }} />
            </div>
        );
    }

    return (
        <img
            src={avatarUrl}
            alt={login}
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                border: '1px solid var(--color-border)',
            }}
        />
    );
});
MiniAvatar.displayName = 'MiniAvatar';

interface ListRepoRowContentProps {
    repo: Repository;
    hasNote: boolean;
    tagById: Map<string, Tag>;
    sortBy: SortBy;
    lang: 'zh' | 'en';
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (repo: Repository) => void;
}

/** 列表视图纯内容组件（memo 化，与卡片视图信息口径对齐） */
const ListRepoRowContent = memo<ListRepoRowContentProps>(({
    repo,
    hasNote,
    tagById,
    sortBy,
    lang,
    selectable = false,
    selected = false,
    onToggleSelect,
}) => {
    const langColor = repo.language ? getLanguageColor(repo.language) : null;
    const summaryText = repo.aiSummary || repo.description || t('noDescription', lang);
    const timeInfo = getRepoSortTimeInfo(repo, sortBy, lang);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {selectable && (
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect?.(repo)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={repo.alias || repo.name}
                    style={{
                        width: 15,
                        height: 15,
                        accentColor: 'var(--color-primary)',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                />
            )}

            <MiniAvatar avatarUrl={repo.owner.avatarUrl} login={repo.owner.login} />

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        fontSize: 14,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {repo.alias || repo.name}
                    </span>
                    {repo.alias && (
                        <span style={{
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {repo.fullName}
                        </span>
                    )}

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginLeft: 'auto',
                        flexShrink: 0,
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                    }}>
                        {hasNote && (
                            <FileText size={12} style={{ color: 'var(--color-primary)' }} />
                        )}
                        {repo.isSubscribed && (
                            <Bell size={12} style={{ color: 'var(--color-accent)' }} />
                        )}
                        {repo.language && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    if (selectable || !repo.language) return;
                                    e.stopPropagation();
                                    const { searchFilter, setSearchFilter } = useStore.getState();
                                    const exists = searchFilter.languages.includes(repo.language);
                                    setSearchFilter({
                                        languages: exists
                                            ? searchFilter.languages.filter((l) => l !== repo.language)
                                            : [...searchFilter.languages, repo.language],
                                    });
                                }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: 'transparent',
                                    border: 'none',
                                    padding: 0,
                                    color: 'inherit',
                                    fontSize: 'inherit',
                                    cursor: 'pointer',
                                }}
                                title={`${t('filterTabLanguages', lang)}: ${repo.language}`}
                            >
                                {langColor && (
                                    <span className="lang-dot" style={{ width: 8, height: 8, backgroundColor: langColor }} />
                                )}
                                {repo.language}
                            </button>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontVariantNumeric: 'tabular-nums' }}>
                            <Star size={12} style={{ color: 'var(--color-accent)' }} />
                            {formatCompactNumber(repo.stargazersCount)}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {summaryText}
                    </span>

                    {(repo.customTags || []).slice(0, 2).map((tagId) => {
                        const tag = tagById.get(tagId);
                        if (!tag) return null;
                        const tagBg = tag.color
                            ? (/^#[0-9a-fA-F]{6}$/.test(tag.color) ? `${tag.color}18` : tag.color)
                            : 'color-mix(in srgb, var(--color-primary) 12%, transparent)';
                        const borderColor = tag.color
                            ? `color-mix(in srgb, ${tag.color} 38%, transparent)`
                            : 'color-mix(in srgb, var(--color-primary) 35%, transparent)';
                        return (
                            <button
                                key={tag.id}
                                type="button"
                                onClick={(e) => {
                                    if (selectable) return;
                                    e.stopPropagation();
                                    const { searchFilter, setSearchFilter } = useStore.getState();
                                    const exists = searchFilter.customTags.includes(tag.id);
                                    setSearchFilter({
                                        customTags: exists
                                            ? searchFilter.customTags.filter((id) => id !== tag.id)
                                            : [...searchFilter.customTags, tag.id],
                                    });
                                }}
                                title={`${t('filterTabTags', lang)}: ${tag.name}`}
                                style={{
                                    fontSize: 10,
                                    padding: '1px 7px',
                                    borderRadius: 999,
                                    background: tagBg,
                                    color: getTagTextColor(tag.color),
                                    border: `1px solid ${borderColor}`,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                }}
                            >
                                {tag.icon ? `${tag.icon} ` : ''}{tag.name}
                            </button>
                        );
                    })}

                    {timeInfo.timeText && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {timeInfo.timeText}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});
ListRepoRowContent.displayName = 'ListRepoRowContent';

/** 隔离已订阅视图状态栏统计，避免后台检查版本更新时触发整个 HomePage 重渲染 */
const SubscribedStatusSummary = memo<{ lang: 'zh' | 'en' }>(({ lang }) => {
    const releases = useStore((state) => state.releases);
    const subscribedRepoIds = useStore((state) => state.subscribedRepoIds);
    const summary = useMemo(() => {
        let total = 0;
        let unread = 0;
        for (const r of releases) {
            if (!subscribedRepoIds.has(r.repository.id)) continue;
            total++;
            if (!r.isRead) unread++;
        }
        return { total, unread };
    }, [releases, subscribedRepoIds]);

    return (
        <>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {t('updatesCountSummary', lang, { count: summary.total })}
            </span>
            {summary.unread > 0 && (
                <span style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 500 }}>
                    · {t('unreadUpdatesCount', lang, { count: summary.unread })}
                </span>
            )}
        </>
    );
});
SubscribedStatusSummary.displayName = 'SubscribedStatusSummary';

export const HomePage: React.FC = () => {
    const repositories = useStore((state) => state.repositories);
    const token = useStore((state) => state.token);
    const settings = useStore((state) => state.settings);
    const searchFilter = useStore((state) => state.searchFilter);
    const getFilteredRepos = useStore((state) => state.getFilteredRepos);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const setSelectedRepoId = useStore((state) => state.setSelectedRepoId);
    const currentPageNum = useStore((state) => state.currentPageNum);
    const setCurrentPageNum = useStore((state) => state.setCurrentPageNum);
    const tags = useStore((state) => state.tags);
    const tagById = useStore((state) => state.tagById);
    const viewMode = useStore((state) => state.viewMode);
    const setViewMode = useStore((state) => state.setViewMode);
    const noteRepoIds = useStore((state) => state.noteRepoIds);
    const noteContentByRepoId = useStore((state) => state.noteContentByRepoId);
    const noteByRepoId = useStore((state) => state.noteByRepoId);
    const setDetailInitialTab = useStore((state) => state.setDetailInitialTab);
    const setSearchFilter = useStore((state) => state.setSearchFilter);
    const batchAddTag = useStore((state) => state.batchAddTag);
    const batchRemoveTag = useStore((state) => state.batchRemoveTag);
    const batchSetSubscription = useStore((state) => state.batchSetSubscription);

    const syncStatus = useProgressStore((state) => state.syncStatus);
    const syncProgress = useProgressStore((state) => state.syncProgress);
    const syncError = useProgressStore((state) => state.syncError);
    const setSyncError = useProgressStore((state) => state.setSyncError);

    const lang = (settings.language || 'zh') as 'zh' | 'en';
    const itemsPerPageSetting = settings.itemsPerPage ?? 20;
    const isShowAllMode = itemsPerPageSetting === 0;
    const itemsPerPage = isShowAllMode ? 20 : itemsPerPageSetting;
    const isNotedView = searchFilter.smartView === 'noted';
    const isSubscribedView = searchFilter.smartView === 'subscribed';

    const filteredRepos = useMemo(
        () => getFilteredRepos(),
        [repositories, searchFilter, noteRepoIds, noteContentByRepoId, getFilteredRepos]
    );

    const totalPages = isShowAllMode ? 1 : Math.max(1, Math.ceil(filteredRepos.length / itemsPerPage));
    const currentRepos = isShowAllMode
        ? filteredRepos
        : filteredRepos.slice(
            (currentPageNum - 1) * itemsPerPage,
            currentPageNum * itemsPerPage
        );

    const initialMemoryRef = useRef(useStore.getState().homeScrollMemory);
    const initialMemory = initialMemoryRef.current;
    const restoreOffset = initialMemory
        && initialMemory.keyword === searchFilter.keyword
        && initialMemory.page === currentPageNum
        && initialMemory.viewMode === viewMode
        && initialMemory.itemsPerPage === itemsPerPageSetting
        && currentPageNum <= totalPages
        ? initialMemory.offset
        : 0;

    const [activeRepoIndex, setActiveRepoIndex] = useState<number | null>(null);
    const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
    const [keyboardArea, setKeyboardArea] = useState<'toolbar' | 'list'>('list');
    const [batchMode, setBatchMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [batchTagAction, setBatchTagAction] = useState<'add' | 'remove' | null>(null);

    const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const listContainerRef = useRef<HTMLDivElement | null>(null);
    const filterBarRef = useRef<FilterBarHandle | null>(null);
    const batchTagMenuRef = useRef<HTMLDivElement | null>(null);
    const activeRepo = activeRepoIndex === null ? null : currentRepos[activeRepoIndex] ?? null;

    const listVirtualizer = useVirtualizer({
        count: currentRepos.length,
        getScrollElement: () => listContainerRef.current,
        estimateSize: () => (isNotedView ? 220 : viewMode === 'card' ? CARD_ROW_ESTIMATE : LIST_ROW_ESTIMATE),
        getItemKey: (index) => currentRepos[index]?.id ?? index,
        overscan: 5,
        enabled: isShowAllMode && !isSubscribedView,
        initialOffset: restoreOffset,
    });

    const lastScrollTopRef = useRef(0);

    useEffect(() => {
        return () => {
            const s = useStore.getState();
            s.setHomeScrollMemory({
                offset: lastScrollTopRef.current,
                keyword: s.searchFilter.keyword,
                page: s.currentPageNum,
                viewMode: s.viewMode,
                itemsPerPage: s.settings.itemsPerPage ?? 20,
            });
        };
    }, []);

    useEffect(() => {
        if (!restoreOffset) return;
        const offset = restoreOffset;
        const apply = () => {
            const el = listContainerRef.current;
            if (el) el.scrollTop = offset;
            lastScrollTopRef.current = offset;
        };
        apply();
        requestAnimationFrame(apply);
    }, []);

    useEffect(() => {
        if (!isShowAllMode && filteredRepos.length > 0 && currentPageNum > totalPages) {
            setCurrentPageNum(totalPages);
        }
    }, [isShowAllMode, filteredRepos.length, currentPageNum, totalPages, setCurrentPageNum]);

    useEffect(() => {
        if (currentRepos.length === 0) {
            setActiveRepoIndex(null);
            setKeyboardArea('toolbar');
            return;
        }

        setActiveRepoIndex((prev) => {
            if (prev === null) return 0;
            return Math.min(prev, currentRepos.length - 1);
        });
    }, [currentRepos.length, currentPageNum, viewMode]);

    useEffect(() => {
        if (isShowAllMode && currentPageNum !== 1) {
            setCurrentPageNum(1);
        }
    }, [isShowAllMode, currentPageNum, setCurrentPageNum]);

    useEffect(() => {
        if (isShowAllMode && !isSubscribedView) {
            listVirtualizer.measure();
        }
    }, [viewMode, isNotedView, isShowAllMode, isSubscribedView, listVirtualizer]);

    useEffect(() => {
        if (isSubscribedView && batchMode) {
            setBatchMode(false);
            setSelectedIds(new Set());
            setBatchTagAction(null);
        }
    }, [batchMode, isSubscribedView]);

    const restorePendingRef = useRef(restoreOffset > 0);

    useEffect(() => {
        if (!activeRepo) return;

        if (restorePendingRef.current) {
            restorePendingRef.current = false;
            return;
        }

        if (isShowAllMode) {
            listVirtualizer.scrollToIndex(activeRepoIndex ?? 0, { align: 'auto' });
            return;
        }

        itemRefs.current[activeRepo.id]?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
        });
    }, [activeRepo?.id, activeRepoIndex, isShowAllMode, listVirtualizer]);

    useEffect(() => {
        const el = listContainerRef.current;
        if (el) lastScrollTopRef.current = el.scrollTop;
    }, [currentPageNum]);

    // 任何鼠标点击操作立即关闭键盘高亮环，避免切回或清筛选后首卡残留高亮框
    useEffect(() => {
        const handleMouseDown = () => setIsKeyboardNavigating(false);
        window.addEventListener('mousedown', handleMouseDown);
        return () => window.removeEventListener('mousedown', handleMouseDown);
    }, []);

    useEffect(() => {
        if (!batchTagAction) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (batchTagMenuRef.current && !batchTagMenuRef.current.contains(event.target as Node)) {
                setBatchTagAction(null);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [batchTagAction]);

    const handleSync = useCallback(async () => {
        const result = await useStore.getState().syncRepositories();
        if (result === 'busy') {
            toast.show(t('syncSkippedBusy', lang));
            return;
        }
        if (result === 'ok') {
            const { syncStatus: nextStatus, lastSyncSummary } = useProgressStore.getState();
            if (nextStatus === 'completed' && lastSyncSummary) {
                const modeLabel = lastSyncSummary.mode === 'full'
                    ? t('syncModeFullLabel', lang)
                    : t('syncModeIncrementalLabel', lang);
                if (lastSyncSummary.added === 0 && lastSyncSummary.removed === 0) {
                    toast.show(
                        t('syncSummaryUpToDate', lang, { mode: modeLabel, total: lastSyncSummary.total }),
                        { type: 'success' }
                    );
                } else {
                    toast.show(
                        t('syncSummaryChanged', lang, {
                            mode: modeLabel,
                            added: lastSyncSummary.added,
                            removed: lastSyncSummary.removed,
                            total: lastSyncSummary.total,
                        }),
                        { type: 'success', duration: 4000 }
                    );
                }
            }
        }
    }, [lang]);

    const openRepoDetail = useCallback((repoId: number, initialTab?: DetailTab) => {
        setDetailInitialTab(initialTab);
        setSelectedRepoId(repoId);
        setCurrentPage('detail');
    }, [setCurrentPage, setDetailInitialTab, setSelectedRepoId]);

    const handleRepoClick = useCallback((repo: Repository) => {
        openRepoDetail(repo.id, isNotedView ? 'notes' : undefined);
    }, [isNotedView, openRepoDetail]);

    const handleOpenNote = useCallback((repo: Repository) => {
        openRepoDetail(repo.id, 'notes');
    }, [openRepoDetail]);

    const handleOpenOverview = useCallback((repo: Repository) => {
        openRepoDetail(repo.id, 'overview');
    }, [openRepoDetail]);

    const handleClearKeyboardNav = useCallback(() => {
        setIsKeyboardNavigating(false);
    }, []);

    const handleToggleSelect = useCallback((repo: Repository) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(repo.id)) {
                next.delete(repo.id);
            } else {
                next.add(repo.id);
            }
            return next;
        });
    }, []);

    const handleToggleBatchMode = useCallback(() => {
        setBatchMode((prev) => {
            if (prev) {
                setSelectedIds(new Set());
                setBatchTagAction(null);
            }
            return !prev;
        });
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isSubscribedView) return;
            if (shouldIgnoreGlobalKeydown(event)) return;
            if (keyboardArea !== 'list') return;

            if (event.key === 'ArrowDown') {
                if (currentRepos.length === 0) return;
                event.preventDefault();
                setIsKeyboardNavigating(true);
                setActiveRepoIndex((prev) => {
                    if (prev === null) return 0;
                    return Math.min(prev + 1, currentRepos.length - 1);
                });
                return;
            }

            if (event.key === 'ArrowUp') {
                if (currentRepos.length === 0) return;
                event.preventDefault();
                setActiveRepoIndex((prev) => {
                    if (prev === null || prev <= 0) {
                        setIsKeyboardNavigating(false);
                        setKeyboardArea('toolbar');
                        requestAnimationFrame(() => {
                            filterBarRef.current?.focusActiveControl();
                        });
                        return 0;
                    }
                    setIsKeyboardNavigating(true);
                    return Math.max(prev - 1, 0);
                });
                return;
            }

            if (event.key === 'ArrowRight') {
                if (isShowAllMode || currentPageNum >= totalPages) return;
                event.preventDefault();
                setIsKeyboardNavigating(true);
                setCurrentPageNum(currentPageNum + 1);
                setActiveRepoIndex(0);
                return;
            }

            if (event.key === 'ArrowLeft') {
                if (isShowAllMode || currentPageNum <= 1) return;
                event.preventDefault();
                setIsKeyboardNavigating(true);
                setCurrentPageNum(currentPageNum - 1);
                setActiveRepoIndex(0);
                return;
            }

            if (batchMode && event.key === ' ' && activeRepo) {
                event.preventDefault();
                handleToggleSelect(activeRepo);
                return;
            }

            if (event.key === 'Enter' && activeRepo) {
                event.preventDefault();
                handleRepoClick(activeRepo);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activeRepo,
        batchMode,
        currentPageNum,
        currentRepos.length,
        handleRepoClick,
        handleToggleSelect,
        isShowAllMode,
        isSubscribedView,
        keyboardArea,
        setCurrentPageNum,
        totalPages,
    ]);

    const toggleViewMode = useCallback(() => {
        setViewMode(viewMode === 'card' ? 'list' : 'card');
    }, [viewMode, setViewMode]);

    const currentReposLengthRef = useRef(0);
    currentReposLengthRef.current = currentRepos.length;

    const handleRequestListArea = useCallback(() => {
        if (currentReposLengthRef.current === 0) return;
        setKeyboardArea('list');
        setIsKeyboardNavigating(true);
        setActiveRepoIndex((prev) => prev ?? 0);
        requestAnimationFrame(() => {
            listContainerRef.current?.focus();
        });
    }, []);

    const handleRequestToolbarArea = useCallback(() => {
        setKeyboardArea('toolbar');
    }, []);

    // 批量动作处理
    const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

    const handleSelectPage = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const r of currentRepos) {
                next.add(r.id);
            }
            return next;
        });
    };

    const handleBatchApplyTag = (tag: Tag) => {
        if (selectedIdList.length === 0) return;
        if (batchTagAction === 'add') {
            batchAddTag(selectedIdList, tag.id);
            toast.show(
                lang === 'zh'
                    ? `已为 ${selectedIdList.length} 个仓库添加「${tag.name}」`
                    : `Added "${tag.name}" to ${selectedIdList.length} repos`,
                { type: 'success' }
            );
        } else if (batchTagAction === 'remove') {
            batchRemoveTag(selectedIdList, tag.id);
            toast.show(
                lang === 'zh'
                    ? `已从 ${selectedIdList.length} 个仓库移除「${tag.name}」`
                    : `Removed "${tag.name}" from ${selectedIdList.length} repos`,
                { type: 'info' }
            );
        }
        setBatchTagAction(null);
    };

    const handleBatchSubscribe = () => {
        if (selectedIdList.length === 0) return;
        batchSetSubscription(selectedIdList, true);
        toast.show(
            lang === 'zh'
                ? `已订阅 ${selectedIdList.length} 个仓库的版本更新`
                : `Subscribed to ${selectedIdList.length} repos`,
            { type: 'success' }
        );
    };

    // 状态栏范围文本
    const rangeLabel = useMemo(() => {
        if (filteredRepos.length === 0) return '0';
        if (isShowAllMode) return `${filteredRepos.length}`;
        const start = (currentPageNum - 1) * itemsPerPage + 1;
        const end = Math.min(currentPageNum * itemsPerPage, filteredRepos.length);
        return `${start}–${end} / ${filteredRepos.length}`;
    }, [currentPageNum, filteredRepos.length, isShowAllMode, itemsPerPage]);

    // 首次使用引导
    if (!token) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 16, padding: 32,
            }}>
                <div style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 8,
                    boxShadow: '0 8px 24px color-mix(in srgb, var(--color-primary) 35%, transparent)',
                }}>
                    <Star size={36} color="white" strokeWidth={1.8} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.2 }}>GitHub Stars Manager For uTools</h2>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
                    {t('firstUseHint', lang)}
                </p>
                <button className="btn btn-primary" onClick={() => setCurrentPage('settings')}>
                    <Sparkles size={16} />
                    {t('configureToken', lang)}
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <FilterBar
                ref={filterBarRef}
                lang={lang}
                repositories={repositories}
                tags={tags}
                onRefresh={handleSync}
                syncStatus={syncStatus}
                viewMode={viewMode}
                onViewModeToggle={toggleViewMode}
                batchMode={batchMode}
                onToggleBatchMode={handleToggleBatchMode}
                keyboardArea={keyboardArea}
                onRequestListArea={handleRequestListArea}
                onRequestToolbarArea={handleRequestToolbarArea}
                hasListResults={!isSubscribedView && currentRepos.length > 0}
            />

            {/* 批量整理栏 */}
            {batchMode && (
                <div className="batch-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-dark)' }}>
                            {t('batchSelected', lang, { count: selectedIdList.length })}
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleSelectPage}>
                            <CheckSquare size={12} />
                            {t('batchSelectPage', lang)}
                        </button>
                        {selectedIdList.length > 0 && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>
                                {t('batchClearSelection', lang)}
                            </button>
                        )}
                    </div>

                    <div ref={batchTagMenuRef} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="relative">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={selectedIdList.length === 0 || tags.length === 0}
                                onClick={() => setBatchTagAction((prev) => (prev === 'add' ? null : 'add'))}
                            >
                                <TagIcon size={12} />
                                {t('batchAddTag', lang)}
                            </button>
                            {batchTagAction === 'add' && (
                                <BatchTagDropdown tags={tags} onSelect={handleBatchApplyTag} />
                            )}
                        </div>
                        <div className="relative">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={selectedIdList.length === 0 || tags.length === 0}
                                onClick={() => setBatchTagAction((prev) => (prev === 'remove' ? null : 'remove'))}
                            >
                                <MinusCircle size={12} />
                                {t('batchRemoveTag', lang)}
                            </button>
                            {batchTagAction === 'remove' && (
                                <BatchTagDropdown tags={tags} onSelect={handleBatchApplyTag} />
                            )}
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={selectedIdList.length === 0}
                            onClick={handleBatchSubscribe}
                        >
                            <Bell size={12} />
                            {t('batchSubscribe', lang)}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={handleToggleBatchMode}
                            aria-label={t('commonClose', lang)}
                        >
                            <X size={13} />
                        </button>
                    </div>
                </div>
            )}

            <SyncProgress
                current={syncProgress.current}
                total={syncProgress.total}
                status={syncStatus}
                language={lang}
            />

            {syncError && (
                <div role="alert" style={{
                    padding: '8px 16px', background: 'var(--color-error-strong)',
                    color: 'white', fontSize: 13, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} />
                        {syncError}
                    </span>
                    <button
                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', padding: 2 }}
                        onClick={() => setSyncError(null)}
                        aria-label={t('commonClose', lang)}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* 内容列表：已订阅直接展示版本更新；笔记直接展示笔记正文；其余展示项目卡片/列表 */}
            {isSubscribedView ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', overscrollBehavior: 'contain' }}>
                    <Suspense
                        fallback={
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                            </div>
                        }
                    >
                        <ReleaseUpdatesView
                            keyword={searchFilter.keyword}
                            onOpenRepo={openRepoDetail}
                            onNavigateAll={() => setSearchFilter({ smartView: 'all' })}
                        />
                    </Suspense>
                </div>
            ) : (
            <div
                ref={listContainerRef}
                className="repo-listbox"
                onScroll={(e) => { lastScrollTopRef.current = e.currentTarget.scrollTop; }}
                onMouseMove={isKeyboardNavigating ? handleClearKeyboardNav : undefined}
                style={{ flex: 1, overflowY: 'auto', padding: (isNotedView || viewMode === 'card') ? '14px 20px' : '0' }}
                role="listbox"
                aria-label={t('repositories', lang)}
                aria-activedescendant={keyboardArea === 'list' && activeRepo ? `repo-option-${activeRepo.id}` : undefined}
                tabIndex={keyboardArea === 'list' ? 0 : -1}
            >
                {currentRepos.length === 0 ? (
                    <EmptyState
                        icon={repositories.length === 0
                            ? <Package size={48} strokeWidth={1.5} />
                            : isNotedView && noteRepoIds.size === 0
                                ? <FileText size={48} strokeWidth={1.5} />
                                : <SearchX size={48} strokeWidth={1.5} />}
                        title={
                            repositories.length === 0
                                ? t('noRepos', lang)
                                : isNotedView && noteRepoIds.size === 0
                                    ? t('noNotesYet', lang)
                                    : t('noResults', lang)
                        }
                        description={
                            repositories.length > 0
                                ? (isNotedView && noteRepoIds.size === 0
                                    ? t('noNotesHomeHint', lang)
                                    : t('noResultsHint', lang))
                                : undefined
                        }
                        action={repositories.length === 0 ? (
                            <button className="btn btn-primary" onClick={handleSync}>
                                <RefreshCw size={14} />
                                {t('syncNow', lang)}
                            </button>
                        ) : undefined}
                    />
                ) : isShowAllMode ? (
                    <div style={{ position: 'relative', height: listVirtualizer.getTotalSize(), width: '100%' }}>
                        {listVirtualizer.getVirtualItems().map((virtualRow) => {
                            const repo = currentRepos[virtualRow.index];
                            if (!repo) return null;
                            const isActive = isKeyboardNavigating && activeRepoIndex === virtualRow.index;
                            const isSelected = selectedIds.has(repo.id);
                            return (
                                <div
                                    key={virtualRow.key}
                                    id={`repo-option-${repo.id}`}
                                    className={!isNotedView && viewMode === 'list' ? `list-row-item${isActive ? ' active' : ''}` : undefined}
                                    role="option"
                                    aria-selected={isActive}
                                    data-index={virtualRow.index}
                                    ref={listVirtualizer.measureElement}
                                    onClick={isNotedView || viewMode === 'card'
                                        ? undefined
                                        : () => (batchMode ? handleToggleSelect(repo) : handleRepoClick(repo))}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualRow.start}px)`,
                                        ...(isNotedView || viewMode === 'card' ? { paddingBottom: 12 } : {}),
                                    }}
                                >
                                    {isNotedView ? (
                                        <Suspense fallback={<SkeletonCard />}>
                                            <HomeNoteCard
                                                repo={repo}
                                                note={noteByRepoId.get(repo.id)}
                                                noteContent={noteContentByRepoId.get(repo.id)}
                                                lang={lang}
                                                isActive={isActive}
                                                selectable={batchMode}
                                                selected={isSelected}
                                                onToggleSelect={handleToggleSelect}
                                                onOpenNote={handleOpenNote}
                                                onOpenOverview={handleOpenOverview}
                                            />
                                        </Suspense>
                                    ) : viewMode === 'card' ? (
                                        <RepositoryCard
                                            repo={repo}
                                            onClick={handleRepoClick}
                                            language={lang}
                                            isActive={isActive}
                                            sortBy={searchFilter.sortBy}
                                            hasNote={noteRepoIds.has(repo.id)}
                                            eagerAvatar={virtualRow.index < 4}
                                            selectable={batchMode}
                                            selected={isSelected}
                                            onToggleSelect={handleToggleSelect}
                                        />
                                    ) : (
                                        <ListRepoRowContent
                                            repo={repo}
                                            hasNote={noteRepoIds.has(repo.id)}
                                            tagById={tagById}
                                            sortBy={searchFilter.sortBy}
                                            lang={lang}
                                            selectable={batchMode}
                                            selected={isSelected}
                                            onToggleSelect={handleToggleSelect}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : isNotedView ? (
                    <Suspense
                        fallback={
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <SkeletonCard />
                                <SkeletonCard />
                            </div>
                        }
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {currentRepos.map((repo, index) => {
                                const isActive = isKeyboardNavigating && activeRepoIndex === index;
                                return (
                                    <div
                                        key={repo.id}
                                        id={`repo-option-${repo.id}`}
                                        role="option"
                                        aria-selected={isActive}
                                        ref={(element) => { itemRefs.current[repo.id] = element; }}
                                    >
                                        <HomeNoteCard
                                            repo={repo}
                                            note={noteByRepoId.get(repo.id)}
                                            noteContent={noteContentByRepoId.get(repo.id)}
                                            lang={lang}
                                            isActive={isActive}
                                            selectable={batchMode}
                                            selected={selectedIds.has(repo.id)}
                                            onToggleSelect={handleToggleSelect}
                                            onOpenNote={handleOpenNote}
                                            onOpenOverview={handleOpenOverview}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </Suspense>
                ) : viewMode === 'card' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {currentRepos.map((repo, index) => {
                            const isActive = isKeyboardNavigating && activeRepoIndex === index;
                            return (
                                <div
                                    key={repo.id}
                                    id={`repo-option-${repo.id}`}
                                    className={index >= 5 ? 'list-card-cv' : undefined}
                                    role="option"
                                    aria-selected={isActive}
                                    ref={(element) => { itemRefs.current[repo.id] = element; }}
                                >
                                    <RepositoryCard
                                        repo={repo}
                                        onClick={handleRepoClick}
                                        language={lang}
                                        isActive={isActive}
                                        sortBy={searchFilter.sortBy}
                                        hasNote={noteRepoIds.has(repo.id)}
                                        eagerAvatar={index < 4}
                                        selectable={batchMode}
                                        selected={selectedIds.has(repo.id)}
                                        onToggleSelect={handleToggleSelect}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {currentRepos.map((repo, index) => {
                            const isActive = isKeyboardNavigating && activeRepoIndex === index;
                            return (
                                <div
                                    key={repo.id}
                                    id={`repo-option-${repo.id}`}
                                    className={`${index >= 8 ? 'list-row-cv ' : ''}list-row-item${isActive ? ' active' : ''}`}
                                    role="option"
                                    aria-selected={isActive}
                                    ref={(element) => { itemRefs.current[repo.id] = element; }}
                                    onClick={() => (batchMode ? handleToggleSelect(repo) : handleRepoClick(repo))}
                                >
                                    <ListRepoRowContent
                                        repo={repo}
                                        hasNote={noteRepoIds.has(repo.id)}
                                        tagById={tagById}
                                        sortBy={searchFilter.sortBy}
                                        lang={lang}
                                        selectable={batchMode}
                                        selected={selectedIds.has(repo.id)}
                                        onToggleSelect={handleToggleSelect}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            )}

            {/* 底部紧凑状态栏（分页 + 键盘提示） */}
            <div className="status-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {isSubscribedView ? (
                        <SubscribedStatusSummary lang={lang} />
                    ) : (
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rangeLabel}</span>
                    )}
                    {!isSubscribedView && totalPages > 1 && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '1px 5px' }}
                                disabled={currentPageNum <= 1}
                                onClick={() => setCurrentPageNum(currentPageNum - 1)}
                                aria-label={t('prevPage', lang)}
                            >
                                <ChevronLeft size={13} />
                            </button>
                            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'center' }}>
                                {currentPageNum}/{totalPages}
                            </span>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '1px 5px' }}
                                disabled={currentPageNum >= totalPages}
                                onClick={() => setCurrentPageNum(currentPageNum + 1)}
                                aria-label={t('nextPage', lang)}
                            >
                                <ChevronRight size={13} />
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                        fontSize: 11,
                        color: 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {t('shortcutHints', lang)}
                    </span>
                    <button
                        type="button"
                        className="chip"
                        style={{ padding: '0 6px', fontSize: 11, flexShrink: 0 }}
                        onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
                        title="Ctrl+K / ⌘K"
                    >
                        ⌘K
                    </button>
                </div>
            </div>
        </div>
    );
};

const BatchTagDropdown: React.FC<{ tags: Tag[]; onSelect: (tag: Tag) => void }> = ({ tags, onSelect }) => (
    <div
        className="panel-enter"
        style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 180,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-md)',
            padding: 6,
            zIndex: 130,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
        }}
    >
        {tags.map((tag) => (
            <button
                key={tag.id}
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ justifyContent: 'flex-start', width: '100%' }}
                onClick={() => onSelect(tag)}
            >
                <span>{tag.icon || '🏷️'}</span>
                <span style={{ color: getTagTextColor(tag.color) }}>{tag.name}</span>
            </button>
        ))}
    </div>
);
