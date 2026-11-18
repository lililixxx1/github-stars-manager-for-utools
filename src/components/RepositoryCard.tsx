import React, { memo, useCallback, useMemo } from 'react';
import { Bell, FileText } from 'lucide-react';
import type { Repository, SortBy, Tag } from '../types';
import { RepoRow } from './RepoRow';
import { getLanguageColor } from '../constants/languages';
import { useStore } from '../stores/useStore';
import { t } from '../locales';
import { getTagTextColor } from '../utils/tagColor';
import { getRepoSortTimeInfo } from '../utils/format';

interface RepositoryCardProps {
    repo: Repository;
    onClick: (repo: Repository) => void;
    language: 'zh' | 'en';
    isActive?: boolean;
    sortBy?: SortBy;
    hasNote?: boolean;
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (repo: Repository) => void;
}

/**
 * 仓库卡片组件
 */
export const RepositoryCard = memo<RepositoryCardProps>(({
    repo,
    onClick,
    language,
    isActive = false,
    sortBy = 'stars',
    hasNote = false,
    selectable = false,
    selected = false,
    onToggleSelect,
}) => {
    const tagById = useStore((s) => s.tagById);

    const displayName = useMemo(() => repo.alias || repo.name, [repo.alias, repo.name]);

    const customTagItems = useMemo(() => {
        const items: Tag[] = [];
        for (const id of repo.customTags || []) {
            const tag = tagById.get(id);
            if (tag) items.push(tag);
            if (items.length >= 2) break;
        }
        return items;
    }, [repo.customTags, tagById]);

    const aiTagItems = useMemo(
        () => (repo.aiTags || []).slice(0, customTagItems.length === 0 ? 3 : 2),
        [repo.aiTags, customTagItems.length]
    );

    const description = useMemo(
        () => repo.aiSummary || repo.description || t('noDescription', language),
        [repo.aiSummary, repo.description, language]
    );

    const languageColor = useMemo(
        () => (repo.language ? getLanguageColor(repo.language) : null),
        [repo.language]
    );

    const timeInfo = useMemo(
        () => getRepoSortTimeInfo(repo, sortBy, language),
        [repo, sortBy, language]
    );

    const handleFilterLanguage = useCallback((e: React.MouseEvent) => {
        if (selectable || !repo.language) return;
        e.stopPropagation();
        const { searchFilter, setSearchFilter } = useStore.getState();
        const exists = searchFilter.languages.includes(repo.language);
        const next = exists
            ? searchFilter.languages.filter((l) => l !== repo.language)
            : [...searchFilter.languages, repo.language];
        setSearchFilter({ languages: next });
    }, [repo.language, selectable]);

    const handleFilterTag = useCallback((e: React.MouseEvent, tagId: string) => {
        if (selectable) return;
        e.stopPropagation();
        const { searchFilter, setSearchFilter } = useStore.getState();
        const exists = searchFilter.customTags.includes(tagId);
        const next = exists
            ? searchFilter.customTags.filter((id) => id !== tagId)
            : [...searchFilter.customTags, tagId];
        setSearchFilter({ customTags: next });
    }, [selectable]);

    const handleClick = useCallback(() => {
        if (selectable && onToggleSelect) {
            onToggleSelect(repo);
            return;
        }
        onClick(repo);
    }, [onClick, onToggleSelect, repo, selectable]);

    return (
        <div
            className="card card-compact card-interactive"
            onClick={handleClick}
            style={selected ? {
                borderColor: 'var(--color-primary)',
                background: 'color-mix(in srgb, var(--color-primary) 7%, var(--color-surface))',
            } : isActive ? {
                borderColor: 'var(--color-primary)',
                boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent), var(--shadow-sm)',
                transform: 'translateY(-1px)',
            } : undefined}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {selectable && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect?.(repo)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={displayName}
                        style={{
                            marginTop: 12,
                            width: 15,
                            height: 15,
                            accentColor: 'var(--color-primary)',
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                    />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    <RepoRow
                        avatarUrl={repo.owner.avatarUrl}
                        ownerLogin={repo.owner.login}
                        displayName={displayName}
                        secondaryName={repo.alias ? repo.fullName : undefined}
                        stars={repo.stargazersCount}
                        forks={repo.forksCount}
                    >
                        <p style={{
                            fontSize: 13,
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.6,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            marginBottom: 12,
                        }}>
                            {description}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {repo.language && languageColor && (
                                <button
                                    type="button"
                                    onClick={handleFilterLanguage}
                                    title={`${t('filterTabLanguages', language)}: ${repo.language}`}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: 12,
                                        color: 'var(--color-text-secondary)',
                                        marginRight: 2,
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        cursor: selectable ? 'pointer' : 'pointer',
                                    }}
                                >
                                    <span className="lang-dot" style={{ backgroundColor: languageColor }} />
                                    <span>{repo.language}</span>
                                </button>
                            )}

                            {customTagItems.map((tag) => {
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
                                        className="tag"
                                        title={`${t('filterTabTags', language)}: ${tag.name}`}
                                        style={{
                                            fontSize: 11,
                                            padding: '2px 8px',
                                            background: tagBg,
                                            color: getTagTextColor(tag.color),
                                            borderColor,
                                            cursor: 'pointer',
                                        }}
                                        onClick={(e) => handleFilterTag(e, tag.id)}
                                    >
                                        {tag.icon && <span style={{ marginRight: 3 }}>{tag.icon}</span>}
                                        {tag.name}
                                    </button>
                                );
                            })}

                            {aiTagItems.map((tag, i) => (
                                <span
                                    key={`ai-${i}`}
                                    className="tag"
                                    style={{
                                        fontSize: 11,
                                        padding: '2px 8px',
                                        borderRadius: 6,
                                        background: 'var(--color-surface-secondary)',
                                        borderColor: 'transparent',
                                        color: 'var(--color-text-secondary)',
                                    }}
                                >
                                    {tag}
                                </span>
                            ))}

                            <div style={{
                                marginLeft: 'auto',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 12,
                                color: 'var(--color-text-muted)',
                            }}>
                                {hasNote && (
                                    <span title={t('notes', language)} style={{ display: 'inline-flex', color: 'var(--color-primary)' }}>
                                        <FileText size={12} />
                                    </span>
                                )}
                                {repo.isSubscribed && (
                                    <span title={t('releases', language)} style={{ display: 'inline-flex', color: 'var(--color-accent)' }}>
                                        <Bell size={12} />
                                    </span>
                                )}
                                {timeInfo.timeText && (
                                    <span>{timeInfo.prefix} {timeInfo.timeText}</span>
                                )}
                            </div>
                        </div>
                    </RepoRow>
                </div>
            </div>
        </div>
    );
});

RepositoryCard.displayName = 'RepositoryCard';
