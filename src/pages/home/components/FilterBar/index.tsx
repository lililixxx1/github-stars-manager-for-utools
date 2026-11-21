/**
 * 首页筛选与工具栏组件
 * @module pages/home/components/FilterBar
 */

import React, {
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useStore } from '@/stores/useStore';
import { useProgressStore } from '@/stores/useProgressStore';
import { t, type TranslationKey } from '@/locales';
import { PLATFORM_OPTIONS, PLATFORM_NONE } from '@/constants/platforms';
import { getTagTextColor } from '@/utils/tagColor';
import { shouldIgnoreGlobalKeydown } from '@/utils/keyboard';
import { checkAnalysisNeeded } from '@/utils/analysis';
import { toast } from '@/components/Toast';
import type { SortBy, SmartView, Tag as TagType, Repository } from '@/types';
import {
    ArrowUpDown,
    CheckSquare,
    Filter,
    LayoutGrid,
    List,
    Loader2,
    RefreshCw,
    Settings,
    Sparkles,
    Tags,
    X,
} from 'lucide-react';
import { FilterPopover } from './FilterPopover';
import { SORT_OPTIONS, SortMenu } from './SortMenu';

interface FilterBarProps {
    lang: 'zh' | 'en';
    repositories: Repository[];
    tags: TagType[];
    onRefresh: () => void;
    syncStatus: string;
    viewMode: 'card' | 'list';
    onViewModeToggle: () => void;
    batchMode: boolean;
    onToggleBatchMode: () => void;
    keyboardArea: 'toolbar' | 'list';
    onRequestListArea: () => void;
    onRequestToolbarArea: () => void;
    hasListResults: boolean;
}

export interface FilterBarHandle {
    focusActiveControl: () => void;
}

interface ToolbarControl {
    key: string;
    title: string;
    action: () => void;
    disabled?: boolean;
    active?: boolean;
    iconOnly?: boolean;
    content: React.ReactNode;
}

const QUICK_TAG_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const SORT_SHORT_LABEL_KEYS: Record<SortBy, TranslationKey> = {
    stars: 'sortShortStars',
    updated: 'sortShortUpdated',
    name: 'sortShortName',
    starredAt: 'sortShortStarredAt',
    pushedAt: 'sortShortPushedAt',
};

const SubscribedUnreadDot = memo(() => {
    const releases = useStore((state) => state.releases);
    const subscribedRepoIds = useStore((state) => state.subscribedRepoIds);
    const hasUnread = useMemo(
        () => releases.some((r) => !r.isRead && subscribedRepoIds.has(r.repository.id)),
        [releases, subscribedRepoIds]
    );
    return hasUnread ? <span className="unread-dot" /> : null;
});
SubscribedUnreadDot.displayName = 'SubscribedUnreadDot';

interface AnalyzeToolbarButtonProps {
    lang: 'zh' | 'en';
    pendingAnalyze: number;
    buttonRef: (element: HTMLButtonElement | null) => void;
    tabIndex: number;
    onClick: () => void;
    onMouseEnter: () => void;
    onFocus: () => void;
    style: React.CSSProperties;
}

const AnalyzeToolbarButton = memo<AnalyzeToolbarButtonProps>(({
    lang,
    pendingAnalyze,
    buttonRef,
    tabIndex,
    onClick,
    onMouseEnter,
    onFocus,
    style,
}) => {
    const isAnalyzing = useProgressStore((state) => state.isAnalyzing);
    const analyzeProgress = useProgressStore((state) => state.analyzeProgress);

    const title = isAnalyzing
        ? (analyzeProgress
            ? `${t('clickToStopAnalysis', lang)} (${analyzeProgress.current}/${analyzeProgress.total})`
            : t('clickToStopAnalysis', lang))
        : pendingAnalyze > 0
            ? t('analyzePendingHint', lang, { count: pendingAnalyze })
            : t('analyzeNow', lang);

    return (
        <button
            ref={buttonRef}
            type="button"
            className={`btn btn-filter btn-sm btn-icon-sm${isAnalyzing ? ' active' : ''}`}
            tabIndex={tabIndex}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onFocus={onFocus}
            title={title}
            aria-label={title}
            aria-pressed={isAnalyzing}
            style={style}
        >
            {isAnalyzing
                ? <Loader2 size={14} className="animate-spin" />
                : <Sparkles size={14} />}
        </button>
    );
});
AnalyzeToolbarButton.displayName = 'AnalyzeToolbarButton';

const FilterBarComponent = forwardRef<FilterBarHandle, FilterBarProps>(({
    lang,
    repositories,
    tags,
    onRefresh,
    syncStatus,
    viewMode,
    onViewModeToggle,
    batchMode,
    onToggleBatchMode,
    keyboardArea,
    onRequestListArea,
    onRequestToolbarArea,
    hasListResults,
}, ref) => {
    const searchFilter = useStore((state) => state.searchFilter);
    const setSearchFilter = useStore((state) => state.setSearchFilter);
    const setSortPreference = useStore((state) => state.setSortPreference);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const addTag = useStore((state) => state.addTag);
    const tagById = useStore((state) => state.tagById);
    const noteRepoIds = useStore((state) => state.noteRepoIds);
    const token = useStore((state) => state.token);
    const startAutoAnalyze = useStore((state) => state.startAutoAnalyze);
    const stopAnalyze = useStore((state) => state.stopAnalyze);

    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const [activeControlIndex, setActiveControlIndex] = useState(0);
    const [activeSortMenuIndex, setActiveSortMenuIndex] = useState(0);

    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const sortMenuContainerRef = useRef<HTMLDivElement | null>(null);
    const filterPopoverContainerRef = useRef<HTMLDivElement | null>(null);

    const stats = useMemo(() => {
        const languageCounts = new Map<string, number>();
        const platformCounts = new Map<string, number>();
        let tagged = 0;
        let unanalyzed = 0;
        let noted = 0;
        let subscribed = 0;
        let pendingAnalyze = 0;
        let cooldownAnalyze = 0;

        for (const repo of repositories) {
            if (repo.customTags && repo.customTags.length > 0) tagged++;
            if (!repo.analyzedAt || repo.analysisFailed) unanalyzed++;
            const analysisCheck = checkAnalysisNeeded(repo);
            if (analysisCheck.needsAnalyze) pendingAnalyze++;
            else if (analysisCheck.reason === 'failed_cooldown') cooldownAnalyze++;
            if (noteRepoIds.has(repo.id)) noted++;
            if (repo.isSubscribed) subscribed++;
            if (repo.language) {
                languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
            }
            if (repo.aiPlatforms) {
                for (const p of repo.aiPlatforms) {
                    platformCounts.set(p, (platformCounts.get(p) || 0) + 1);
                }
            }
        }

        const sortedLanguages = Array.from(languageCounts.entries())
            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

        return {
            total: repositories.length,
            tagged,
            unanalyzed,
            pendingAnalyze,
            cooldownAnalyze,
            noted,
            subscribed,
            sortedLanguages,
            platformCounts,
        };
    }, [repositories, noteRepoIds]);

    const currentSmartView: SmartView = searchFilter.smartView || 'all';

    const smartViewItems = useMemo<Array<{ id: SmartView; label: string; count: number }>>(() => [
        { id: 'all', label: t('smartViewAll', lang), count: stats.total },
        { id: 'tagged', label: t('smartViewTagged', lang), count: stats.tagged },
        { id: 'noted', label: t('smartViewNoted', lang), count: stats.noted },
        { id: 'subscribed', label: t('smartViewSubscribed', lang), count: stats.subscribed },
    ], [lang, stats.noted, stats.subscribed, stats.tagged, stats.total]);

    const activeFilterCount =
        searchFilter.languages.length
        + searchFilter.customTags.length
        + searchFilter.platforms.length
        + (searchFilter.hasNotes ? 1 : 0)
        + (searchFilter.hasAlias ? 1 : 0)
        + (searchFilter.hasReleases ? 1 : 0);

    const hasFacetFilter = activeFilterCount > 0;

    const handleSortChange = useCallback((sortBy: SortBy) => {
        setSortPreference({ sortBy });
        setShowSortMenu(false);
    }, [setSortPreference]);

    const toggleSortOrder = useCallback(() => {
        setSortPreference({ sortOrder: searchFilter.sortOrder === 'asc' ? 'desc' : 'asc' });
    }, [searchFilter.sortOrder, setSortPreference]);

    const handleQuickAnalyze = useCallback(async () => {
        if (useProgressStore.getState().isAnalyzing) {
            stopAnalyze();
            toast.show(t('analysisStopped', lang), { type: 'info' });
            return;
        }
        if (!token) {
            toast.show(t('tokenRequired', lang), { type: 'error' });
            return;
        }
        if (repositories.length === 0) {
            toast.show(t('syncRequiredHint', lang), { type: 'info' });
            return;
        }
        if (stats.pendingAnalyze === 0) {
            toast.show(
                stats.cooldownAnalyze > 0
                    ? t('noReposToAnalyzeCooldown', lang)
                    : t('noReposToAnalyze', lang),
                { type: 'info' }
            );
            return;
        }
        const res = await startAutoAnalyze(false);
        if (res === 'busy') {
            toast.show(t('analyzeDeferredBusy', lang), { type: 'info' });
        }
    }, [
        lang,
        repositories.length,
        startAutoAnalyze,
        stats.cooldownAnalyze,
        stats.pendingAnalyze,
        stopAnalyze,
        token,
    ]);

    const openSortMenu = useCallback(() => {
        const currentSortIndex = SORT_OPTIONS.findIndex((option) => option.value === searchFilter.sortBy);
        setActiveSortMenuIndex(currentSortIndex >= 0 ? currentSortIndex : 0);
        setShowFilterPopover(false);
        setShowSortMenu(true);
    }, [searchFilter.sortBy]);

    const closeSortMenu = useCallback(() => setShowSortMenu(false), []);

    const onToggleOrderAndClose = useCallback(() => {
        toggleSortOrder();
        closeSortMenu();
    }, [closeSortMenu, toggleSortOrder]);

    const toggleFilterPopover = useCallback(() => {
        setShowSortMenu(false);
        setShowFilterPopover((prev) => !prev);
    }, []);

    const toolbarControls = useMemo<ToolbarControl[]>(() => [
        {
            key: 'filter',
            title: t('addFilter', lang),
            action: toggleFilterPopover,
            active: showFilterPopover || hasFacetFilter,
            content: (
                <>
                    <Filter size={13} />
                    <span>{t('addFilter', lang)}</span>
                    {activeFilterCount > 0 && (
                        <span
                            className={`count-pill ${showFilterPopover || hasFacetFilter ? 'count-pill-on-solid' : 'count-pill-soft'}`}
                            style={{ marginLeft: 0 }}
                        >
                            {activeFilterCount}
                        </span>
                    )}
                </>
            ),
        },
        {
            key: 'sort',
            title: t(SORT_OPTIONS.find(s => s.value === searchFilter.sortBy)?.labelKey || 'sortByStars', lang),
            action: () => (showSortMenu ? closeSortMenu() : openSortMenu()),
            content: (
                <>
                    <ArrowUpDown size={13} />
                    <span style={{ fontSize: 12 }}>
                        {t(SORT_SHORT_LABEL_KEYS[searchFilter.sortBy] || 'sortShortStars', lang)}
                        {searchFilter.sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                </>
            ),
        },
        {
            key: 'analyze',
            title: stats.pendingAnalyze > 0
                ? t('analyzePendingHint', lang, { count: stats.pendingAnalyze })
                : t('analyzeNow', lang),
            action: handleQuickAnalyze,
            iconOnly: true,
            content: <Sparkles size={14} />,
        },
        {
            key: 'tags',
            title: t('manageTags', lang),
            action: () => setCurrentPage('tags'),
            iconOnly: true,
            content: <Tags size={14} />,
        },
        {
            key: 'view',
            title: t('viewMode', lang),
            action: onViewModeToggle,
            iconOnly: true,
            content: viewMode === 'card' ? <LayoutGrid size={14} /> : <List size={14} />,
        },
        {
            key: 'batch',
            title: t('batchMode', lang),
            action: onToggleBatchMode,
            active: batchMode,
            iconOnly: true,
            content: <CheckSquare size={14} />,
        },
        {
            key: 'refresh',
            title: t('syncNow', lang),
            action: onRefresh,
            disabled: syncStatus === 'syncing',
            iconOnly: true,
            content: <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />,
        },
        {
            key: 'settings',
            title: t('settings', lang),
            action: () => setCurrentPage('settings'),
            iconOnly: true,
            content: <Settings size={14} />,
        },
    ], [
        activeFilterCount,
        batchMode,
        closeSortMenu,
        handleQuickAnalyze,
        hasFacetFilter,
        lang,
        onRefresh,
        onToggleBatchMode,
        onViewModeToggle,
        openSortMenu,
        searchFilter.sortBy,
        searchFilter.sortOrder,
        setCurrentPage,
        showFilterPopover,
        showSortMenu,
        stats.pendingAnalyze,
        syncStatus,
        toggleFilterPopover,
        viewMode,
    ]);

    const focusControl = useCallback((index: number) => {
        requestAnimationFrame(() => buttonRefs.current[index]?.focus());
    }, []);

    const activateControl = useCallback((index: number, shouldFocus = false) => {
        setActiveControlIndex(index);
        onRequestToolbarArea();
        if (shouldFocus) focusControl(index);
    }, [focusControl, onRequestToolbarArea]);

    const findNextEnabledIndex = useCallback((startIndex: number, direction: 1 | -1) => {
        if (toolbarControls.length === 0) return 0;
        let nextIndex = startIndex;
        for (let i = 0; i < toolbarControls.length; i++) {
            nextIndex = (nextIndex + direction + toolbarControls.length) % toolbarControls.length;
            if (!toolbarControls[nextIndex]?.disabled) return nextIndex;
        }
        return startIndex;
    }, [toolbarControls]);

    useImperativeHandle(ref, () => ({
        focusActiveControl: () => focusControl(activeControlIndex),
    }), [activeControlIndex, focusControl]);

    useEffect(() => {
        setActiveControlIndex((prev) => {
            const next = Math.min(prev, toolbarControls.length - 1);
            return !toolbarControls[next]?.disabled ? next : findNextEnabledIndex(next, 1);
        });
    }, [findNextEnabledIndex, toolbarControls]);

    useEffect(() => {
        if (!showSortMenu && !showFilterPopover) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setShowSortMenu(false);
            setShowFilterPopover(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showFilterPopover, showSortMenu]);

    useEffect(() => {
        if (!showSortMenu) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (sortMenuContainerRef.current && !sortMenuContainerRef.current.contains(event.target as Node)) {
                setShowSortMenu(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [showSortMenu]);

    useEffect(() => {
        if (!showFilterPopover) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (filterPopoverContainerRef.current && !filterPopoverContainerRef.current.contains(event.target as Node)) {
                setShowFilterPopover(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [showFilterPopover]);

    useEffect(() => {
        if (keyboardArea !== 'toolbar') return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldIgnoreGlobalKeydown(event)) return;

            if (showSortMenu) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveSortMenuIndex((prev) => Math.min(prev + 1, SORT_OPTIONS.length));
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveSortMenuIndex((prev) => Math.max(prev - 1, 0));
                } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (activeSortMenuIndex < SORT_OPTIONS.length) {
                        handleSortChange(SORT_OPTIONS[activeSortMenuIndex].value);
                    } else {
                        onToggleOrderAndClose();
                    }
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    closeSortMenu();
                    focusControl(activeControlIndex);
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                }
                return;
            }

            if (showFilterPopover) return;

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                activateControl(findNextEnabledIndex(activeControlIndex, 1), true);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                activateControl(findNextEnabledIndex(activeControlIndex, -1), true);
            } else if (event.key === 'ArrowDown') {
                if (!hasListResults) return;
                event.preventDefault();
                onRequestListArea();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const control = toolbarControls[activeControlIndex];
                if (!control?.disabled) control?.action();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activeControlIndex,
        activeSortMenuIndex,
        activateControl,
        closeSortMenu,
        findNextEnabledIndex,
        focusControl,
        handleSortChange,
        hasListResults,
        keyboardArea,
        onRequestListArea,
        onToggleOrderAndClose,
        showFilterPopover,
        showSortMenu,
        toolbarControls,
    ]);

    const getToolbarButtonStyle = useCallback((index: number): React.CSSProperties => ({
        boxShadow: keyboardArea === 'toolbar' && activeControlIndex === index
            ? '0 0 0 2px color-mix(in srgb, var(--color-primary) 40%, transparent)'
            : undefined,
        outline: 'none',
    }), [activeControlIndex, keyboardArea]);

    const handleClearAllFilters = useCallback(() => {
        setSearchFilter({
            smartView: 'all',
            languages: [],
            customTags: [],
            platforms: [],
            invertFilter: false,
            hasNotes: null,
            hasAlias: null,
            hasReleases: null,
        });
    }, [setSearchFilter]);

    const toggleInvertFilter = useCallback(() => {
        setSearchFilter({ invertFilter: !searchFilter.invertFilter });
    }, [searchFilter.invertFilter, setSearchFilter]);

    const handleQuickCreateTag = useCallback((name: string) => {
        const color = QUICK_TAG_COLORS[tags.length % QUICK_TAG_COLORS.length];
        const created = addTag({ name, color, icon: '🏷️', order: tags.length });
        setSearchFilter({ customTags: [...searchFilter.customTags, created.id] });
    }, [addTag, searchFilter.customTags, setSearchFilter, tags.length]);

    const toggleLanguage = useCallback((langItem: string) => {
        const next = searchFilter.languages.includes(langItem)
            ? searchFilter.languages.filter((l) => l !== langItem)
            : [...searchFilter.languages, langItem];
        setSearchFilter({ languages: next });
    }, [searchFilter.languages, setSearchFilter]);

    const toggleTag = useCallback((tagId: string) => {
        const next = searchFilter.customTags.includes(tagId)
            ? searchFilter.customTags.filter((id) => id !== tagId)
            : [...searchFilter.customTags, tagId];
        setSearchFilter({ customTags: next });
    }, [searchFilter.customTags, setSearchFilter]);

    const togglePlatform = useCallback((platform: string) => {
        const next = searchFilter.platforms.includes(platform)
            ? searchFilter.platforms.filter((p) => p !== platform)
            : [...searchFilter.platforms.filter((p) => p !== PLATFORM_NONE), platform];
        setSearchFilter({ platforms: next });
    }, [searchFilter.platforms, setSearchFilter]);

    const toggleUnanalyzedPlatform = useCallback(() => {
        const hasNone = searchFilter.platforms.includes(PLATFORM_NONE);
        setSearchFilter({ platforms: hasNone ? [] : [PLATFORM_NONE] });
    }, [searchFilter.platforms, setSearchFilter]);

    const toggleStatus = useCallback((key: 'hasNotes' | 'hasAlias' | 'hasReleases') => {
        setSearchFilter({ [key]: searchFilter[key] === true ? null : true });
    }, [searchFilter, setSearchFilter]);

    const handleManageTags = useCallback(() => {
        setShowFilterPopover(false);
        setCurrentPage('tags');
    }, [setCurrentPage]);

    return (
        <>
            {/* 主工具栏 */}
            <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
                <div className="smart-view-strip" role="tablist" aria-label={t('repositories', lang)}>
                    {smartViewItems.map((item) => {
                        const isActive = currentSmartView === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                className={`smart-view-pill${isActive ? ' active' : ''}`}
                                onClick={() => setSearchFilter({ smartView: item.id })}
                            >
                                <span>{item.label}</span>
                                <span className="text-[11px] opacity-70">{item.count}</span>
                                {item.id === 'subscribed' && <SubscribedUnreadDot />}
                            </button>
                        );
                    })}
                </div>

                <div
                    className="flex items-center gap-1 shrink-0 relative"
                    role="toolbar"
                    aria-label={t('repositories', lang)}
                >
                    {toolbarControls.map((control, index) => {
                        const divider = control.key === 'analyze' ? (
                            <span
                                key="toolbar-divider"
                                className="w-px h-4 bg-[var(--color-border)] mx-0.5 shrink-0"
                                aria-hidden="true"
                            />
                        ) : null;
                        if (control.key === 'analyze') {
                            return (
                                <React.Fragment key={control.key}>
                                    {divider}
                                    <AnalyzeToolbarButton
                                        lang={lang}
                                        pendingAnalyze={stats.pendingAnalyze}
                                        buttonRef={(element) => { buttonRefs.current[index] = element; }}
                                        tabIndex={activeControlIndex === index ? 0 : -1}
                                        onClick={control.action}
                                        onMouseEnter={() => activateControl(index)}
                                        onFocus={() => activateControl(index)}
                                        style={getToolbarButtonStyle(index)}
                                    />
                                </React.Fragment>
                            );
                        }

                        const button = (
                            <button
                                key={control.key}
                                ref={(element) => { buttonRefs.current[index] = element; }}
                                type="button"
                                className={`btn btn-filter btn-sm${control.iconOnly ? ' btn-icon-sm' : ''}${control.active ? ' active' : ''}`}
                                tabIndex={activeControlIndex === index ? 0 : -1}
                                onClick={control.action}
                                onMouseEnter={() => activateControl(index)}
                                onFocus={() => activateControl(index)}
                                title={control.title}
                                aria-label={control.title}
                                aria-pressed={control.active === undefined ? undefined : control.active}
                                disabled={control.disabled}
                                style={getToolbarButtonStyle(index)}
                            >
                                {control.content}
                            </button>
                        );

                        if (control.key === 'filter') {
                            return (
                                <div key={control.key} ref={filterPopoverContainerRef} className="relative">
                                    {button}
                                    {showFilterPopover && (
                                        <FilterPopover
                                            lang={lang}
                                            searchFilter={searchFilter}
                                            tags={tags}
                                            sortedLanguages={stats.sortedLanguages}
                                            platformCounts={stats.platformCounts}
                                            unanalyzedCount={stats.unanalyzed}
                                            notedCount={stats.noted}
                                            subscribedCount={stats.subscribed}
                                            hasFacetFilter={hasFacetFilter}
                                            onToggleLanguage={toggleLanguage}
                                            onToggleTag={toggleTag}
                                            onTogglePlatform={togglePlatform}
                                            onToggleUnanalyzedPlatform={toggleUnanalyzedPlatform}
                                            onToggleStatus={toggleStatus}
                                            onToggleInvertFilter={toggleInvertFilter}
                                            onQuickCreateTag={handleQuickCreateTag}
                                            onManageTags={handleManageTags}
                                            onClearAll={handleClearAllFilters}
                                        />
                                    )}
                                </div>
                            );
                        }

                        if (control.key === 'sort') {
                            return (
                                <div key={control.key} ref={sortMenuContainerRef} className="relative">
                                    {button}
                                    {showSortMenu && (
                                        <SortMenu
                                            sortBy={searchFilter.sortBy}
                                            sortOrder={searchFilter.sortOrder}
                                            activeIndex={activeSortMenuIndex}
                                            lang={lang}
                                            onSortChange={handleSortChange}
                                            onToggleOrder={onToggleOrderAndClose}
                                            onHoverItem={setActiveSortMenuIndex}
                                        />
                                    )}
                                </div>
                            );
                        }

                        return (
                            <React.Fragment key={control.key}>
                                {divider}
                                {button}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* 激活筛选条件胶囊条 */}
            {hasFacetFilter && (
                <div className="active-filter-strip">
                    {searchFilter.invertFilter && (
                        <button
                            type="button"
                            className="badge badge-warning shrink-0"
                            style={{ cursor: 'pointer', border: 'none' }}
                            onClick={toggleInvertFilter}
                            title={t('filterModeInclude', lang)}
                        >
                            <span>{t('filterExcludeBadge', lang)}</span>
                            <X size={11} />
                        </button>
                    )}
                    {searchFilter.languages.map((langItem) => (
                        <button
                            key={`lang:${langItem}`}
                            type="button"
                            className="chip active"
                            style={{ padding: '1px 8px', fontSize: 11 }}
                            onClick={() => toggleLanguage(langItem)}
                        >
                            <span>{langItem}</span>
                            <X size={11} />
                        </button>
                    ))}

                    {searchFilter.customTags.map((tagId) => {
                        const tag = tagById.get(tagId);
                        if (!tag) return null;
                        const bg = tag.color
                            ? (/^#[0-9a-fA-F]{6}$/.test(tag.color) ? `${tag.color}22` : tag.color)
                            : 'var(--color-surface)';
                        return (
                            <button
                                key={`tag:${tag.id}`}
                                type="button"
                                className="chip"
                                style={{
                                    padding: '1px 8px',
                                    fontSize: 11,
                                    background: bg,
                                    borderColor: tag.color || 'var(--color-border)',
                                    color: getTagTextColor(tag.color),
                                }}
                                onClick={() => toggleTag(tag.id)}
                            >
                                {tag.icon && <span>{tag.icon}</span>}
                                <span>{tag.name}</span>
                                <X size={11} />
                            </button>
                        );
                    })}

                    {searchFilter.platforms.map((platformId) => {
                        const label = platformId === PLATFORM_NONE
                            ? t('platformUnanalyzed', lang)
                            : (PLATFORM_OPTIONS.find((p) => p.id === platformId)?.label || platformId);
                        return (
                            <button
                                key={`platform:${platformId}`}
                                type="button"
                                className="chip active"
                                style={{ padding: '1px 8px', fontSize: 11 }}
                                onClick={() => togglePlatform(platformId)}
                            >
                                <span>{label}</span>
                                <X size={11} />
                            </button>
                        );
                    })}

                    {searchFilter.hasNotes === true && (
                        <button
                            type="button"
                            className="chip active"
                            style={{ padding: '1px 8px', fontSize: 11 }}
                            onClick={() => setSearchFilter({ hasNotes: null })}
                        >
                            <span>{t('hasNotesFilter', lang)}</span>
                            <X size={11} />
                        </button>
                    )}

                    {searchFilter.hasAlias === true && (
                        <button
                            type="button"
                            className="chip active"
                            style={{ padding: '1px 8px', fontSize: 11 }}
                            onClick={() => setSearchFilter({ hasAlias: null })}
                        >
                            <span>{t('hasAliasFilter', lang)}</span>
                            <X size={11} />
                        </button>
                    )}

                    {searchFilter.hasReleases === true && (
                        <button
                            type="button"
                            className="chip active"
                            style={{ padding: '1px 8px', fontSize: 11 }}
                            onClick={() => setSearchFilter({ hasReleases: null })}
                        >
                            <span>{t('statusFilterSubscribed', lang)}</span>
                            <X size={11} />
                        </button>
                    )}

                    <button
                        type="button"
                        className="btn btn-ghost btn-sm ml-auto whitespace-nowrap"
                        style={{ padding: '1px 8px', fontSize: 11, color: 'var(--color-primary)' }}
                        onClick={handleClearAllFilters}
                    >
                        {t('clearFilter', lang)}
                    </button>
                </div>
            )}
        </>
    );
});

FilterBarComponent.displayName = 'FilterBar';

export const FilterBar = memo(FilterBarComponent);
FilterBar.displayName = 'FilterBar';

export default FilterBar;
