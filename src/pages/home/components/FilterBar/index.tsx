/**
 * 筛选栏组件
 * @module pages/home/components/FilterBar
 * @since v1.7.0
 */

import React, {
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState
} from 'react';
import { useStore } from '@/stores/useStore';
import { t, type TranslationKey } from '@/locales';
import { PLATFORM_OPTIONS, PLATFORM_NONE } from '@/constants/platforms';
import type { SortBy, SortOrder, Tag as TagType, Repository } from '@/types';
import { shouldIgnoreGlobalKeydown } from '@/utils/keyboard';
import {
    ArrowUpDown, Tag as TagIcon, Filter, RefreshCw, Settings,
    LayoutGrid, List, Bell, Edit3, Plus
} from 'lucide-react';

interface FilterBarProps {
    lang: 'zh' | 'en';
    repositories: Repository[];
    filteredCount: number;  // 筛选后的数量
    tags: TagType[];
    allLanguages: string[];
    onRefresh: () => void;
    syncStatus: string;
    viewMode: 'card' | 'list';
    onViewModeToggle: () => void;
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
    style?: React.CSSProperties;
    content: React.ReactNode;
}

/**
 * 排序选项
 */
const SORT_OPTIONS: { value: SortBy; labelKey: string }[] = [
    { value: 'stars', labelKey: 'sortByStars' },
    { value: 'updated', labelKey: 'sortByUpdated' },
    { value: 'name', labelKey: 'sortByName' },
    { value: 'starredAt', labelKey: 'sortByStarredAt' },
];

/**
 * 筛选栏组件
 * 包含：版本追踪、未读标识、视图切换、排序、标签筛选、平台筛选、同步、设置
 */
const FilterBarComponent = forwardRef<FilterBarHandle, FilterBarProps>(({
    lang,
    repositories,
    filteredCount,
    tags,
    allLanguages,
    onRefresh,
    syncStatus,
    viewMode,
    onViewModeToggle,
    keyboardArea,
    onRequestListArea,
    onRequestToolbarArea,
    hasListResults
}, ref) => {
    const { searchFilter, setSearchFilter, setCurrentPage } = useStore();
    const unreadCount = useStore((state) => state.getUnreadCount)();
    const releaseCheckStatus = useStore((state) => state.releaseCheckStatus);
    const subscriptionVersion = useStore((state) => state.subscriptionVersion);

    // UI 状态
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [showPlatformFilter, setShowPlatformFilter] = useState(false);
    const [activeControlIndex, setActiveControlIndex] = useState(0);
    const [activeSortMenuIndex, setActiveSortMenuIndex] = useState(0);
    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const showUnreadBadge = unreadCount > 0 || releaseCheckStatus.checking;
    const subscribedCount = useMemo(
        () => window.githubStarsAPI?.getReleaseSubscriptions?.().length || 0,
        [subscriptionVersion]
    );

    // 排序操作
    const handleSortChange = useCallback((sortBy: SortBy) => {
        setSearchFilter({ sortBy });
        setShowSortMenu(false);
    }, [setSearchFilter]);

    const toggleSortOrder = useCallback(() => {
        setSearchFilter({ sortOrder: searchFilter.sortOrder === 'asc' ? 'desc' : 'asc' });
    }, [searchFilter.sortOrder, setSearchFilter]);

    const handleOpenReleases = useCallback(() => {
        setCurrentPage('releases');
    }, [setCurrentPage]);

    const openSortMenu = useCallback(() => {
        const currentSortIndex = SORT_OPTIONS.findIndex((option) => option.value === searchFilter.sortBy);
        setActiveSortMenuIndex(currentSortIndex >= 0 ? currentSortIndex : 0);
        setShowSortMenu(true);
    }, [searchFilter.sortBy]);

    const closeSortMenu = useCallback(() => {
        setShowSortMenu(false);
    }, []);

    const onToggleOrderAndClose = useCallback(() => {
        toggleSortOrder();
        closeSortMenu();
    }, [closeSortMenu, toggleSortOrder]);

    const toolbarControls = useMemo<ToolbarControl[]>(() => [
        {
            key: 'releases',
            title: t('releases', lang),
            action: handleOpenReleases,
            content: (
                <>
                    <Bell size={14} />
                    {subscribedCount > 0 && (
                        <span style={{ fontSize: 11, marginLeft: 2 }}>{subscribedCount}</span>
                    )}
                </>
            ),
        },
        ...(showUnreadBadge ? [{
            key: 'unread',
            title: t('releases', lang),
            action: handleOpenReleases,
            style: {
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
            },
            content: (
                <>
                    <Bell size={14} />
                    {unreadCount > 0 && (
                        <span style={{ fontSize: 11, marginLeft: 2 }}>{unreadCount}</span>
                    )}
                    {releaseCheckStatus.checking && (
                        <span style={{ fontSize: 11, marginLeft: 2 }}>{t('checkingUpdates', lang)}</span>
                    )}
                </>
            ),
        }] : []),
        {
            key: 'view',
            title: t('viewMode', lang),
            action: onViewModeToggle,
            content: viewMode === 'card' ? <LayoutGrid size={14} /> : <List size={14} />,
        },
        {
            key: 'sort',
            title: t((SORT_OPTIONS.find(s => s.value === searchFilter.sortBy)?.labelKey || 'sortByStars') as TranslationKey, lang),
            action: () => {
                if (showSortMenu) {
                    closeSortMenu();
                    return;
                }
                openSortMenu();
            },
            content: (
                <>
                    <ArrowUpDown size={14} />
                    <span style={{ fontSize: 12, marginLeft: 2 }}>
                        {searchFilter.sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                </>
            ),
        },
        {
            key: 'tags',
            title: t('tags', lang),
            action: () => setShowTagFilter((prev) => !prev),
            style: {
                background: searchFilter.customTags.length > 0 ? 'var(--color-primary)' : undefined,
                color: searchFilter.customTags.length > 0 ? 'white' : undefined,
            },
            content: (
                <>
                    <TagIcon size={14} />
                    {searchFilter.customTags.length > 0 && (
                        <span style={{ fontSize: 11, marginLeft: 2 }}>{searchFilter.customTags.length}</span>
                    )}
                </>
            ),
        },
        {
            key: 'platforms',
            title: lang === 'zh' ? '平台筛选' : 'Platform Filter',
            action: () => setShowPlatformFilter((prev) => !prev),
            style: {
                background: searchFilter.platforms.length > 0 ? 'var(--color-primary)' : undefined,
                color: searchFilter.platforms.length > 0 ? 'white' : undefined,
            },
            content: (
                <>
                    <Filter size={14} />
                    {searchFilter.platforms.length > 0 && (
                        <span style={{ fontSize: 11, marginLeft: 2 }}>{searchFilter.platforms.length}</span>
                    )}
                </>
            ),
        },
        {
            key: 'refresh',
            title: lang === 'zh' ? '同步' : 'Sync',
            action: onRefresh,
            disabled: syncStatus === 'syncing',
            content: <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />,
        },
        {
            key: 'settings',
            title: t('settings', lang),
            action: () => setCurrentPage('settings'),
            content: <Settings size={14} />,
        },
    ], [
        closeSortMenu,
        handleOpenReleases,
        lang,
        onRefresh,
        onViewModeToggle,
        openSortMenu,
        releaseCheckStatus.checking,
        searchFilter.customTags.length,
        searchFilter.platforms.length,
        searchFilter.sortBy,
        searchFilter.sortOrder,
        setCurrentPage,
        showSortMenu,
        showUnreadBadge,
        subscribedCount,
        syncStatus,
        unreadCount,
        viewMode,
    ]);

    const focusControl = useCallback((index: number) => {
        requestAnimationFrame(() => {
            buttonRefs.current[index]?.focus();
        });
    }, []);

    const activateControl = useCallback((index: number, shouldFocus = false) => {
        setActiveControlIndex(index);
        onRequestToolbarArea();
        if (shouldFocus) {
            focusControl(index);
        }
    }, [focusControl, onRequestToolbarArea]);

    const findNextEnabledIndex = useCallback((startIndex: number, direction: 1 | -1) => {
        if (toolbarControls.length === 0) return 0;

        let nextIndex = startIndex;
        for (let i = 0; i < toolbarControls.length; i++) {
            nextIndex = (nextIndex + direction + toolbarControls.length) % toolbarControls.length;
            if (!toolbarControls[nextIndex]?.disabled) {
                return nextIndex;
            }
        }

        return startIndex;
    }, [toolbarControls]);

    useImperativeHandle(ref, () => ({
        focusActiveControl: () => {
            focusControl(activeControlIndex);
        },
    }), [activeControlIndex, focusControl]);

    useEffect(() => {
        setActiveControlIndex((prev) => {
            const next = Math.min(prev, toolbarControls.length - 1);
            if (!toolbarControls[next]?.disabled) return next;
            return findNextEnabledIndex(next, 1);
        });
    }, [findNextEnabledIndex, toolbarControls]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldIgnoreGlobalKeydown(event)) return;
            if (event.key !== 'Escape') return;
            if (!showSortMenu && !showTagFilter && !showPlatformFilter) return;

            event.preventDefault();
            setShowSortMenu(false);
            setShowTagFilter(false);
            setShowPlatformFilter(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showPlatformFilter, showSortMenu, showTagFilter]);

    useEffect(() => {
        if (keyboardArea !== 'toolbar') return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldIgnoreGlobalKeydown(event)) return;

            if (showSortMenu) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveSortMenuIndex((prev) => Math.min(prev + 1, SORT_OPTIONS.length));
                    return;
                }

                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveSortMenuIndex((prev) => Math.max(prev - 1, 0));
                    return;
                }

                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (activeSortMenuIndex < SORT_OPTIONS.length) {
                        handleSortChange(SORT_OPTIONS[activeSortMenuIndex].value);
                        return;
                    }

                    onToggleOrderAndClose();
                    return;
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeSortMenu();
                    focusControl(activeControlIndex);
                    return;
                }

                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                }

                return;
            }

            // 🆕 v1.6.4 标签/平台筛选区展开时，方向键交给筛选区处理，工具栏让位
            if (showTagFilter || showPlatformFilter) {
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                const nextIndex = findNextEnabledIndex(activeControlIndex, 1);
                activateControl(nextIndex, true);
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                const nextIndex = findNextEnabledIndex(activeControlIndex, -1);
                activateControl(nextIndex, true);
                return;
            }

            if (event.key === 'ArrowDown') {
                if (!hasListResults) return;
                event.preventDefault();
                onRequestListArea();
                return;
            }

            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const control = toolbarControls[activeControlIndex];
                if (!control?.disabled) {
                    control?.action();
                }
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
        showPlatformFilter,
        showSortMenu,
        showTagFilter,
        toolbarControls
    ]);

    const getToolbarButtonStyle = useCallback((index: number, style?: React.CSSProperties): React.CSSProperties => ({
        ...style,
        boxShadow: keyboardArea === 'toolbar' && activeControlIndex === index
            ? '0 0 0 2px rgba(99, 102, 241, 0.22)'
            : style?.boxShadow,
        outline: 'none',
    }), [activeControlIndex, keyboardArea]);

    return (
        <>
            {/* 顶部栏 */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
            }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                    {t('totalRepos', lang, { count: filteredCount })}
                </span>
                <div style={{ display: 'flex', gap: 4, position: 'relative' }} role="toolbar" aria-label={lang === 'zh' ? '首页工具栏' : 'Home toolbar'}>
                    {toolbarControls.map((control, index) => {
                        const button = (
                            <button
                                key={control.key}
                                ref={(element) => { buttonRefs.current[index] = element; }}
                                className="btn btn-ghost btn-sm"
                                tabIndex={activeControlIndex === index ? 0 : -1}
                                onClick={control.action}
                                onMouseEnter={() => activateControl(index)}
                                onFocus={() => activateControl(index)}
                                title={control.title}
                                aria-label={control.title}
                                disabled={control.disabled}
                                style={getToolbarButtonStyle(index, control.style)}
                            >
                                {control.content}
                            </button>
                        );

                        if (control.key !== 'sort') {
                            return button;
                        }

                        return (
                            <div key={control.key} style={{ position: 'relative' }}>
                                {button}
                                {showSortMenu && (
                                    <SortMenu
                                        sortBy={searchFilter.sortBy}
                                        sortOrder={searchFilter.sortOrder}
                                        activeIndex={activeSortMenuIndex}
                                        lang={lang}
                                        onSortChange={handleSortChange}
                                        onToggleOrder={onToggleOrderAndClose}
                                        onClose={closeSortMenu}
                                        onHoverItem={setActiveSortMenuIndex}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 标签筛选区 */}
            {showTagFilter && (
                <TagFilterBar
                    tags={tags}
                    selectedTags={searchFilter.customTags}
                    lang={lang}
                    onClose={() => setShowTagFilter(false)}
                    onTagToggle={(tagId) => {
                        const newTags = searchFilter.customTags.includes(tagId)
                            ? searchFilter.customTags.filter(id => id !== tagId)
                            : [...searchFilter.customTags, tagId];
                        setSearchFilter({ customTags: newTags });
                    }}
                    onClear={() => setSearchFilter({ customTags: [] })}
                    onManage={() => setCurrentPage('tags')}
                />
            )}

            {/* 平台筛选区 */}
            {showPlatformFilter && (
                <PlatformFilterBar
                    repositories={repositories}
                    selectedPlatforms={searchFilter.platforms}
                    lang={lang}
                    onClose={() => setShowPlatformFilter(false)}
                    onPlatformToggle={(platform) => {
                        const newPlatforms = searchFilter.platforms.includes(platform)
                            ? searchFilter.platforms.filter(p => p !== platform)
                            : [...searchFilter.platforms.filter(p => p !== PLATFORM_NONE), platform];
                        setSearchFilter({ platforms: newPlatforms });
                    }}
                    onClear={() => setSearchFilter({ platforms: [] })}
                />
            )}

            {/* 语言筛选标签 */}
            {allLanguages.length > 0 && (
                <div style={{
                    display: 'flex', gap: 4, padding: '6px 16px', overflowX: 'auto',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    flexShrink: 0,
                }}>
                    <button
                        className={`tag ${searchFilter.languages.length === 0 ? 'tag-active' : ''}`}
                        onClick={() => setSearchFilter({ languages: [] })}
                    >
                        {t('allCategories', lang)}
                    </button>
                    {allLanguages.slice(0, 12).map((langItem) => (
                        <button
                            key={langItem}
                            className={`tag ${searchFilter.languages.includes(langItem) ? 'tag-active' : ''}`}
                            onClick={() => {
                                const langs = searchFilter.languages.includes(langItem)
                                    ? searchFilter.languages.filter((l) => l !== langItem)
                                    : [...searchFilter.languages, langItem];
                                setSearchFilter({ languages: langs });
                            }}
                        >
                            {langItem}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
});

FilterBarComponent.displayName = 'FilterBar';

export const FilterBar = memo(FilterBarComponent);
FilterBar.displayName = 'FilterBar';

// ==================== 子组件 ====================

/**
 * 筛选面板横向键盘导航
 * @since v1.6.4
 *
 * 为标签/平台筛选面板提供左右键移动、Enter/Space 触发、Escape 关闭的键盘支持。
 * 收集容器内所有可聚焦按钮（非 disabled），用 roving tabindex 模式管理焦点。
 *
 * 实现：keydown 同时挂在 window（捕获阶段，确保优先于工具栏监听）和容器上，
 * 不依赖"工具栏让位"逻辑，任何环境下都能稳定响应方向键。
 */
function useFilterPanelNav(options: {
    enabled: boolean;
    onClose: () => void;
}) {
    const { enabled, onClose } = options;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const activeIndexRef = useRef(0);

    // 收集容器内可聚焦的按钮
    const getButtons = useCallback((): HTMLButtonElement[] => {
        const container = containerRef.current;
        if (!container) return [];
        return Array.from(container.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    }, []);

    const focusButton = useCallback((index: number) => {
        const buttons = getButtons();
        if (buttons.length === 0) return;
        const wrapped = ((index % buttons.length) + buttons.length) % buttons.length;
        activeIndexRef.current = wrapped;
        buttons[wrapped]?.focus();
    }, [getButtons]);

    // 同步当前焦点对应的 index（鼠标点击/Tab 聚焦时校正）
    const syncActiveIndex = useCallback(() => {
        const buttons = getButtons();
        const focused = document.activeElement as HTMLButtonElement | null;
        const idx = buttons.findIndex(b => b === focused);
        if (idx >= 0) activeIndexRef.current = idx;
    }, [getButtons]);

    // 捕获阶段优先拦截方向键，避免被工具栏/列表监听抢走
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            // 仅当焦点在本容器内时响应（避免影响工具栏/列表的其它操作）
            const container = containerRef.current;
            if (!container) return;
            if (!container.contains(document.activeElement)) return;

            const key = event.key;
            if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Escape') {
                return;
            }

            if (key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }

            const buttons = getButtons();
            if (buttons.length === 0) return;

            event.preventDefault();
            event.stopPropagation();

            if (key === 'ArrowRight' || key === 'ArrowDown') {
                focusButton(activeIndexRef.current + 1);
            } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
                focusButton(activeIndexRef.current - 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [enabled, focusButton, getButtons, onClose]);

    // 面板打开时自动聚焦第一个按钮
    // 用 setTimeout 延迟到点击事件之后，避免被点击按钮的默认聚焦覆盖
    useEffect(() => {
        if (!enabled) return;
        activeIndexRef.current = 0;
        const timer = setTimeout(() => focusButton(0), 0);
        return () => clearTimeout(timer);
    }, [enabled, focusButton]);

    return { containerRef, syncActiveIndex };
}

/** 排序菜单 */
const SortMenu = memo<{
    sortBy: SortBy;
    sortOrder: SortOrder;
    activeIndex: number;
    lang: 'zh' | 'en';
    onSortChange: (sortBy: SortBy) => void;
    onToggleOrder: () => void;
    onClose: () => void;
    onHoverItem: (index: number) => void;
}>(({ sortBy, sortOrder, activeIndex, lang, onSortChange, onToggleOrder, onClose, onHoverItem }) => (
    <div style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 4,
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        minWidth: 160, zIndex: 100, overflow: 'hidden',
    }}>
        {SORT_OPTIONS.map((opt, index) => (
            <button
                key={opt.value}
                className="btn btn-ghost btn-sm"
                style={{
                    width: '100%', justifyContent: 'flex-start',
                    background: activeIndex === index
                        ? 'var(--color-surface-hover)'
                        : sortBy === opt.value ? 'var(--color-surface-secondary)' : 'transparent',
                }}
                onClick={() => onSortChange(opt.value)}
                onMouseEnter={() => onHoverItem(index)}
            >
                <span style={{
                    width: 20, display: 'inline-block', textAlign: 'center',
                    color: 'var(--color-primary)', fontWeight: 'bold',
                    opacity: sortBy === opt.value ? 1 : 0,
                }}>
                    ✓
                </span>
                <span style={{ marginLeft: 4 }}>{t(opt.labelKey as TranslationKey, lang)}</span>
            </button>
        ))}
        <div style={{ height: 1, background: 'var(--color-border)' }} />
        <button
            className="btn btn-ghost btn-sm"
            style={{
                width: '100%',
                justifyContent: 'flex-start',
                background: activeIndex === SORT_OPTIONS.length ? 'var(--color-surface-hover)' : 'transparent',
            }}
            onClick={onToggleOrder}
            onMouseEnter={() => onHoverItem(SORT_OPTIONS.length)}
        >
            <span style={{ width: 20, display: 'inline-block' }} />
            {sortOrder === 'asc' ? t('sortAsc', lang) : t('sortDesc', lang)}
        </button>
    </div>
));

SortMenu.displayName = 'SortMenu';

/** 标签筛选栏 */
const TagFilterBar = memo<{
    tags: TagType[];
    selectedTags: string[];
    lang: 'zh' | 'en';
    onClose: () => void;
    onTagToggle: (tagId: string) => void;
    onClear: () => void;
    onManage: () => void;
}>(({ tags, selectedTags, lang, onClose, onTagToggle, onClear, onManage }) => {
    const { containerRef, syncActiveIndex } = useFilterPanelNav({ enabled: true, onClose });

    return (
        <div
            ref={containerRef}
            style={{
                padding: '8px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)', display: 'flex', flexWrap: 'wrap', gap: 6,
                alignItems: 'center',
            }}
        >
            {tags.length > 0 ? (
                <>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('tags', lang)}:</span>
                    {tags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.id);
                        return (
                            <button
                                key={tag.id}
                                className="btn btn-sm"
                                style={{
                                    padding: '2px 8px', borderRadius: 999,
                                    border: `1px solid ${tag.color || 'var(--color-border)'}`,
                                    background: isSelected ? (tag.color || 'var(--color-primary)') : 'transparent',
                                    color: isSelected ? '#fff' : (tag.color || 'var(--color-text-primary)'),
                                    fontSize: 12,
                                }}
                                onClick={() => onTagToggle(tag.id)}
                                onFocus={syncActiveIndex}
                            >
                                {tag.icon && <span>{tag.icon} </span>}
                                {tag.name}
                            </button>
                        );
                    })}
                    {selectedTags.length > 0 && (
                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 8px', fontSize: 12 }}
                            onClick={onClear}
                            onFocus={syncActiveIndex}
                        >
                            {t('clearFilter', lang)}
                        </button>
                    )}
                    <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', fontSize: 12 }}
                        onClick={onManage}
                        onFocus={syncActiveIndex}
                    >
                        <Edit3 size={12} />
                        {t('manageTags', lang)}
                    </button>
                </>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {t('noTagsHint', lang)}
                    </span>
                    <button className="btn btn-primary btn-sm" onClick={onManage} onFocus={syncActiveIndex}>
                        <Plus size={12} />
                        {t('createTag', lang)}
                    </button>
                </div>
            )}
        </div>
    );
});

TagFilterBar.displayName = 'TagFilterBar';

/** 平台筛选栏 */
const PlatformFilterBar = memo<{
    repositories: Repository[];
    selectedPlatforms: string[];
    lang: 'zh' | 'en';
    onClose: () => void;
    onPlatformToggle: (platform: string) => void;
    onClear: () => void;
}>(({ repositories, selectedPlatforms, lang, onClose, onPlatformToggle, onClear }) => {
    const { containerRef, syncActiveIndex } = useFilterPanelNav({ enabled: true, onClose });
    const unanalyzedCount = repositories.filter(r =>
        !r.analyzedAt && !r.analysisFailed
    ).length;

    return (
        <div
            ref={containerRef}
            style={{
                padding: '8px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)', display: 'flex', flexWrap: 'wrap', gap: 6,
                alignItems: 'center',
            }}
        >
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {lang === 'zh' ? '平台:' : 'Platform:'}
            </span>

            {/* 未分析选项 */}
            <button
                className="btn btn-sm"
                style={{
                    padding: '2px 8px', borderRadius: 999,
                    border: '1px solid var(--color-border)',
                    background: selectedPlatforms.includes(PLATFORM_NONE) ? 'var(--color-text-muted)' : 'transparent',
                    color: selectedPlatforms.includes(PLATFORM_NONE) ? '#fff' : 'var(--color-text-primary)',
                    fontSize: 12,
                    opacity: unanalyzedCount === 0 ? 0.5 : 1,
                }}
                onClick={() => onPlatformToggle(PLATFORM_NONE)}
                onFocus={syncActiveIndex}
                disabled={unanalyzedCount === 0}
            >
                {lang === 'zh' ? '未分析' : 'Unanalyzed'}
                {unanalyzedCount > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({unanalyzedCount})</span>}
            </button>

            {/* 平台选项 */}
            {PLATFORM_OPTIONS.map((platform) => {
                const count = repositories.filter(r => r.aiPlatforms?.includes(platform.id)).length;
                const isSelected = selectedPlatforms.includes(platform.id);
                return (
                    <button
                        key={platform.id}
                        className="btn btn-sm"
                        style={{
                            padding: '2px 8px', borderRadius: 999,
                            border: '1px solid var(--color-primary)',
                            background: isSelected ? 'var(--color-primary)' : 'transparent',
                            color: isSelected ? '#fff' : 'var(--color-primary)',
                            fontSize: 12,
                            opacity: count === 0 ? 0.5 : 1,
                        }}
                        onClick={() => onPlatformToggle(platform.id)}
                        onFocus={syncActiveIndex}
                        disabled={count === 0}
                    >
                        {platform.icon} {platform.label}
                        {count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({count})</span>}
                    </button>
                );
            })}

            {selectedPlatforms.length > 0 && (
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                    onClick={onClear}
                    onFocus={syncActiveIndex}
                >
                    {t('clearFilter', lang)}
                </button>
            )}
        </div>
    );
});

PlatformFilterBar.displayName = 'PlatformFilterBar';

export default FilterBar;
