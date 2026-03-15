/**
 * 筛选栏组件
 * @module pages/home/components/FilterBar
 * @since v1.7.0
 */

import React, { memo, useState, useCallback } from 'react';
import { useStore } from '@/stores/useStore';
import { t, type TranslationKey } from '@/locales';
import { PLATFORM_OPTIONS, PLATFORM_NONE } from '@/constants/platforms';
import type { SortBy, SortOrder, Tag as TagType, Repository } from '@/types';
import {
    ArrowUpDown, Tag as TagIcon, Filter, RefreshCw, Settings,
    LayoutGrid, List, Bell, Edit3, Plus
} from 'lucide-react';
import { UnreadBadge } from '@/components/UnreadBadge';

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
export const FilterBar = memo<FilterBarProps>(({
    lang,
    repositories,
    filteredCount,
    tags,
    allLanguages,
    onRefresh,
    syncStatus,
    viewMode,
    onViewModeToggle
}) => {
    const { searchFilter, setSearchFilter, setCurrentPage } = useStore();

    // UI 状态
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [showPlatformFilter, setShowPlatformFilter] = useState(false);

    // 排序操作
    const handleSortChange = useCallback((sortBy: SortBy) => {
        setSearchFilter({ sortBy });
        setShowSortMenu(false);
    }, [setSearchFilter]);

    const toggleSortOrder = useCallback(() => {
        setSearchFilter({ sortOrder: searchFilter.sortOrder === 'asc' ? 'desc' : 'asc' });
    }, [searchFilter.sortOrder, setSearchFilter]);

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
                <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
                    {/* 版本追踪入口 - 显示订阅数量 */}
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCurrentPage('releases')}
                        title={t('releases', lang)}
                        aria-label={t('releases', lang)}
                    >
                        <Bell size={14} />
                        {(() => {
                            const subs = window.githubStarsAPI?.getReleaseSubscriptions?.() || [];
                            return subs.length > 0 && (
                                <span style={{ fontSize: 11, marginLeft: 2 }}>{subs.length}</span>
                            );
                        })()}
                    </button>

                    {/* 未读标识 */}
                    <UnreadBadge lang={lang} onClick={() => setCurrentPage('releases')} />

                    {/* 视图切换 */}
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={onViewModeToggle}
                        title={t('viewMode', lang)}
                    >
                        {viewMode === 'card' ? <LayoutGrid size={14} /> : <List size={14} />}
                    </button>

                    {/* 排序 */}
                    <div style={{ position: 'relative' }}>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowSortMenu(!showSortMenu)}
                            title={t((SORT_OPTIONS.find(s => s.value === searchFilter.sortBy)?.labelKey || 'sortByStars') as TranslationKey, lang)}
                        >
                            <ArrowUpDown size={14} />
                            <span style={{ fontSize: 12, marginLeft: 2 }}>
                                {searchFilter.sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                        </button>
                        {showSortMenu && (
                            <SortMenu
                                sortBy={searchFilter.sortBy}
                                sortOrder={searchFilter.sortOrder}
                                lang={lang}
                                onSortChange={handleSortChange}
                                onToggleOrder={toggleSortOrder}
                                onClose={() => setShowSortMenu(false)}
                            />
                        )}
                    </div>

                    {/* 标签筛选 */}
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowTagFilter(!showTagFilter)}
                        title={t('tags', lang)}
                        style={{
                            background: searchFilter.customTags.length > 0 ? 'var(--color-primary)' : undefined,
                            color: searchFilter.customTags.length > 0 ? 'white' : undefined,
                        }}
                    >
                        <TagIcon size={14} />
                        {searchFilter.customTags.length > 0 && (
                            <span style={{ fontSize: 11, marginLeft: 2 }}>{searchFilter.customTags.length}</span>
                        )}
                    </button>

                    {/* 平台筛选 */}
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowPlatformFilter(!showPlatformFilter)}
                        title={lang === 'zh' ? '平台筛选' : 'Platform Filter'}
                        style={{
                            background: searchFilter.platforms.length > 0 ? 'var(--color-primary)' : undefined,
                            color: searchFilter.platforms.length > 0 ? 'white' : undefined,
                        }}
                    >
                        <Filter size={14} />
                        {searchFilter.platforms.length > 0 && (
                            <span style={{ fontSize: 11, marginLeft: 2 }}>{searchFilter.platforms.length}</span>
                        )}
                    </button>

                    {/* 同步 */}
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={onRefresh}
                        disabled={syncStatus === 'syncing'}
                    >
                        <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                    </button>

                    {/* 设置 */}
                    <button className="btn btn-ghost btn-sm" onClick={() => setCurrentPage('settings')}>
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            {/* 标签筛选区 */}
            {showTagFilter && (
                <TagFilterBar
                    tags={tags}
                    selectedTags={searchFilter.customTags}
                    lang={lang}
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

FilterBar.displayName = 'FilterBar';

// ==================== 子组件 ====================

/** 排序菜单 */
const SortMenu = memo<{
    sortBy: SortBy;
    sortOrder: SortOrder;
    lang: 'zh' | 'en';
    onSortChange: (sortBy: SortBy) => void;
    onToggleOrder: () => void;
    onClose: () => void;
}>(({ sortBy, sortOrder, lang, onSortChange, onToggleOrder, onClose }) => (
    <div style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 4,
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        minWidth: 160, zIndex: 100, overflow: 'hidden',
    }}>
        {SORT_OPTIONS.map((opt) => (
            <button
                key={opt.value}
                className="btn btn-ghost btn-sm"
                style={{
                    width: '100%', justifyContent: 'flex-start',
                    background: sortBy === opt.value ? 'var(--color-surface-hover)' : 'transparent',
                }}
                onClick={() => onSortChange(opt.value)}
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
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => { onToggleOrder(); onClose(); }}
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
    onTagToggle: (tagId: string) => void;
    onClear: () => void;
    onManage: () => void;
}>(({ tags, selectedTags, lang, onTagToggle, onClear, onManage }) => (
    <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)', display: 'flex', flexWrap: 'wrap', gap: 6,
        alignItems: 'center',
    }}>
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
                    >
                        {t('clearFilter', lang)}
                    </button>
                )}
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 8px', fontSize: 12 }}
                    onClick={onManage}
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
                <button className="btn btn-primary btn-sm" onClick={onManage}>
                    <Plus size={12} />
                    {t('createTag', lang)}
                </button>
            </div>
        )}
    </div>
));

TagFilterBar.displayName = 'TagFilterBar';

/** 平台筛选栏 */
const PlatformFilterBar = memo<{
    repositories: Repository[];
    selectedPlatforms: string[];
    lang: 'zh' | 'en';
    onPlatformToggle: (platform: string) => void;
    onClear: () => void;
}>(({ repositories, selectedPlatforms, lang, onPlatformToggle, onClear }) => {
    const unanalyzedCount = repositories.filter(r =>
        !r.analyzedAt && !r.analysisFailed
    ).length;

    return (
        <div style={{
            padding: '8px 16px', borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface)', display: 'flex', flexWrap: 'wrap', gap: 6,
            alignItems: 'center',
        }}>
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
                >
                    {t('clearFilter', lang)}
                </button>
            )}
        </div>
    );
});

PlatformFilterBar.displayName = 'PlatformFilterBar';

export default FilterBar;
