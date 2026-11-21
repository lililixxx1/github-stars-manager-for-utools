import React, { memo, useDeferredValue, useMemo, useState } from 'react';
import { Edit3, Search } from 'lucide-react';
import { t } from '@/locales';
import { PLATFORM_OPTIONS, PLATFORM_NONE } from '@/constants/platforms';
import { getPlatformIcon } from '@/constants/platformIcons';
import { getLanguageColor } from '@/constants/languages';
import type { SearchFilter, Tag as TagType } from '@/types';
import { TagChip } from '@/components/TagChip';

type FilterTab = 'languages' | 'tags' | 'platforms' | 'status';

interface FilterPopoverProps {
    lang: 'zh' | 'en';
    searchFilter: SearchFilter;
    tags: TagType[];
    sortedLanguages: Array<[string, number]>;
    platformCounts: Map<string, number>;
    unanalyzedCount: number;
    notedCount: number;
    subscribedCount: number;
    hasFacetFilter: boolean;
    onToggleLanguage: (langItem: string) => void;
    onToggleTag: (tagId: string) => void;
    onTogglePlatform: (platformId: string) => void;
    onToggleUnanalyzedPlatform: () => void;
    onToggleStatus: (key: 'hasNotes' | 'hasAlias' | 'hasReleases') => void;
    onToggleInvertFilter: () => void;
    onQuickCreateTag: (name: string) => void;
    onManageTags: () => void;
    onClearAll: () => void;
}

export const FilterPopover = memo<FilterPopoverProps>(({
    lang,
    searchFilter,
    tags,
    sortedLanguages,
    platformCounts,
    unanalyzedCount,
    notedCount,
    subscribedCount,
    hasFacetFilter,
    onToggleLanguage,
    onToggleTag,
    onTogglePlatform,
    onToggleUnanalyzedPlatform,
    onToggleStatus,
    onToggleInvertFilter,
    onQuickCreateTag,
    onManageTags,
    onClearAll,
}) => {
    const [filterTab, setFilterTab] = useState<FilterTab>('languages');
    const [langSearch, setLangSearch] = useState('');
    const deferredLangSearch = useDeferredValue(langSearch);
    const [quickTagName, setQuickTagName] = useState('');

    const filteredLanguages = useMemo(() => {
        const q = deferredLangSearch.trim().toLowerCase();
        if (!q) return sortedLanguages;
        return sortedLanguages.filter(([name]) => name.toLowerCase().includes(q));
    }, [deferredLangSearch, sortedLanguages]);

    const handleQuickCreateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        const name = quickTagName.trim();
        if (!name) return;
        onQuickCreateTag(name);
        setQuickTagName('');
    };

    const statusCount = (searchFilter.hasNotes ? 1 : 0)
        + (searchFilter.hasAlias ? 1 : 0)
        + (searchFilter.hasReleases ? 1 : 0);

    return (
        <div className="filter-popover" role="dialog" aria-label={t('addFilter', lang)}>
            {/* 顶部 Tab */}
            <div className="px-2.5 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
                <div className="segmented w-full">
                    {(
                        [
                            { id: 'languages', label: t('filterTabLanguages', lang), count: searchFilter.languages.length },
                            { id: 'tags', label: t('filterTabTags', lang), count: searchFilter.customTags.length },
                            { id: 'platforms', label: t('filterTabPlatforms', lang), count: searchFilter.platforms.length },
                            { id: 'status', label: t('filterTabStatus', lang), count: statusCount },
                        ] as const
                    ).map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`segmented-item${filterTab === tab.id ? ' active' : ''}`}
                            onClick={() => setFilterTab(tab.id)}
                        >
                            {tab.label}
                            {tab.count > 0 && <span className="ml-0.5 opacity-75">({tab.count})</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* 内容区 */}
            <div className="filter-popover-body">
                {filterTab === 'languages' && (
                    <div className="flex flex-col gap-2">
                        <div className="relative">
                            <Search
                                size={13}
                                style={{
                                    position: 'absolute',
                                    left: 9,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)',
                                }}
                            />
                            <input
                                type="text"
                                className="input"
                                style={{ padding: '5px 8px 5px 28px', fontSize: 12 }}
                                value={langSearch}
                                onChange={(e) => setLangSearch(e.target.value)}
                                placeholder={t('searchLanguagePlaceholder', lang)}
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {filteredLanguages.map(([langName, count]) => {
                                const selected = searchFilter.languages.includes(langName);
                                const color = getLanguageColor(langName);
                                return (
                                    <button
                                        key={langName}
                                        type="button"
                                        className={`chip${selected ? ' active' : ''}`}
                                        onClick={() => onToggleLanguage(langName)}
                                        aria-pressed={selected}
                                    >
                                        <span
                                            className="lang-dot"
                                            style={{
                                                width: 8,
                                                height: 8,
                                                backgroundColor: selected ? 'white' : color,
                                            }}
                                        />
                                        <span>{langName}</span>
                                        <span style={{ opacity: 0.7, fontSize: 11 }}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {filterTab === 'tags' && (
                    <div className="flex flex-col gap-2.5">
                        {tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {tags.map((tag) => (
                                    <TagChip
                                        key={tag.id}
                                        tag={tag}
                                        selected={searchFilter.customTags.includes(tag.id)}
                                        onClick={() => onToggleTag(tag.id)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-[12px] text-[var(--color-text-muted)] text-center py-2">
                                {t('noTags', lang)}
                            </p>
                        )}

                        <div className="flex gap-1.5 items-center pt-2 border-t border-[var(--color-border)]">
                            <input
                                type="text"
                                className="input flex-1"
                                style={{ padding: '4px 8px', fontSize: 12 }}
                                value={quickTagName}
                                onChange={(e) => setQuickTagName(e.target.value)}
                                onKeyDown={handleQuickCreateKeyDown}
                                placeholder={t('quickCreateTagPlaceholder', lang)}
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm whitespace-nowrap"
                                onClick={onManageTags}
                            >
                                <Edit3 size={12} />
                                {t('manageTags', lang)}
                            </button>
                        </div>
                    </div>
                )}

                {filterTab === 'platforms' && (
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            className={`chip${searchFilter.platforms.includes(PLATFORM_NONE) ? ' active' : ''}`}
                            onClick={onToggleUnanalyzedPlatform}
                            disabled={unanalyzedCount === 0}
                            aria-pressed={searchFilter.platforms.includes(PLATFORM_NONE)}
                        >
                            {t('platformUnanalyzed', lang)}
                            <span style={{ opacity: 0.7, fontSize: 11 }}>{unanalyzedCount}</span>
                        </button>
                        {PLATFORM_OPTIONS.map((platform) => {
                            const count = platformCounts.get(platform.id) || 0;
                            const selected = searchFilter.platforms.includes(platform.id);
                            const PlatformIcon = getPlatformIcon(platform.id);
                            return (
                                <button
                                    key={platform.id}
                                    type="button"
                                    className={`chip${selected ? ' active' : ''}`}
                                    onClick={() => onTogglePlatform(platform.id)}
                                    disabled={count === 0}
                                    aria-pressed={selected}
                                >
                                    <PlatformIcon size={12} />
                                    <span>{platform.label}</span>
                                    {count > 0 && <span style={{ opacity: 0.7, fontSize: 11 }}>{count}</span>}
                                </button>
                            );
                        })}
                    </div>
                )}

                {filterTab === 'status' && (
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            className={`chip${searchFilter.hasNotes === true ? ' active' : ''}`}
                            onClick={() => onToggleStatus('hasNotes')}
                            aria-pressed={searchFilter.hasNotes === true}
                        >
                            {t('hasNotesFilter', lang)}
                            <span style={{ opacity: 0.7, fontSize: 11 }}>{notedCount}</span>
                        </button>
                        <button
                            type="button"
                            className={`chip${searchFilter.hasAlias === true ? ' active' : ''}`}
                            onClick={() => onToggleStatus('hasAlias')}
                            aria-pressed={searchFilter.hasAlias === true}
                        >
                            {t('hasAliasFilter', lang)}
                        </button>
                        <button
                            type="button"
                            className={`chip${searchFilter.hasReleases === true ? ' active' : ''}`}
                            onClick={() => onToggleStatus('hasReleases')}
                            aria-pressed={searchFilter.hasReleases === true}
                        >
                            {t('statusFilterSubscribed', lang)}
                            <span style={{ opacity: 0.7, fontSize: 11 }}>{subscribedCount}</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
                <div className="segmented" style={{ width: 'fit-content' }}>
                    <button
                        type="button"
                        className={`segmented-item${!searchFilter.invertFilter ? ' active' : ''}`}
                        style={{ padding: '2px 10px', fontSize: 11 }}
                        onClick={() => {
                            if (searchFilter.invertFilter) onToggleInvertFilter();
                        }}
                        aria-pressed={!searchFilter.invertFilter}
                    >
                        {t('filterModeInclude', lang)}
                    </button>
                    <button
                        type="button"
                        className={`segmented-item${searchFilter.invertFilter ? ' active' : ''}`}
                        style={{ padding: '2px 10px', fontSize: 11 }}
                        onClick={() => {
                            if (!searchFilter.invertFilter) onToggleInvertFilter();
                        }}
                        aria-pressed={Boolean(searchFilter.invertFilter)}
                    >
                        {t('filterModeExclude', lang)}
                    </button>
                </div>

                {(hasFacetFilter || searchFilter.invertFilter) && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--color-primary)' }}
                        onClick={onClearAll}
                    >
                        {t('clearFilter', lang)}
                    </button>
                )}
            </div>
        </div>
    );
});

FilterPopover.displayName = 'FilterPopover';
