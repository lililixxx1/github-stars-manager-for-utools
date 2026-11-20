import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Edit2, ExternalLink, FileText, Star } from 'lucide-react';
import type { Repository, RepositoryNote, Tag } from '@/types';
import { getLanguageColor } from '@/constants/languages';
import { useStore } from '@/stores/useStore';
import { t } from '@/locales';
import { getTagTextColor } from '@/utils/tagColor';
import { formatCompactNumber, formatRelativeTime } from '@/utils/format';
import { MarkdownView } from '@/components/MarkdownView';

interface HomeNoteCardProps {
    repo: Repository;
    note?: RepositoryNote;
    noteContent?: string;
    lang: 'zh' | 'en';
    isActive?: boolean;
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (repo: Repository) => void;
    onOpenNote: (repo: Repository) => void;
    onOpenOverview: (repo: Repository) => void;
}

const COLLAPSED_MAX_HEIGHT = 156;

export const HomeNoteCard = memo<HomeNoteCardProps>(({
    repo,
    note,
    noteContent,
    lang,
    isActive = false,
    selectable = false,
    selected = false,
    onToggleSelect,
    onOpenNote,
    onOpenOverview,
}) => {
    const tagById = useStore((s) => s.tagById);
    const [expanded, setExpanded] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const previewRef = useRef<HTMLDivElement | null>(null);

    const content = note?.content ?? noteContent ?? '';
    const displayName = repo.alias || repo.name;
    const langColor = repo.language ? getLanguageColor(repo.language) : null;

    const customTagItems = useMemo(() => {
        const items: Tag[] = [];
        for (const id of repo.customTags || []) {
            const tag = tagById.get(id);
            if (tag) items.push(tag);
            if (items.length >= 2) break;
        }
        return items;
    }, [repo.customTags, tagById]);

    useEffect(() => {
        setExpanded(false);
    }, [repo.id, content]);

    useEffect(() => {
        const el = previewRef.current;
        if (!el) return;

        let rafId: number | null = null;
        const scheduleMeasure = () => {
            if (rafId !== null) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                if (!previewRef.current) return;
                setIsOverflowing(previewRef.current.scrollHeight > COLLAPSED_MAX_HEIGHT + 6);
            });
        };

        scheduleMeasure();
        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null;
        resizeObserver?.observe(el);
        const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(scheduleMeasure) : null;
        mutationObserver?.observe(el, { childList: true, subtree: true, characterData: true });

        return () => {
            if (rafId !== null) window.cancelAnimationFrame(rafId);
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
        };
    }, [content]);

    const updatedText = note?.updatedAt
        ? formatRelativeTime(new Date(note.updatedAt).toISOString(), lang)
        : '';

    const handleCardClick = () => {
        if (selectable && onToggleSelect) {
            onToggleSelect(repo);
            return;
        }
        onOpenNote(repo);
    };

    return (
        <div
            className="card card-compact card-interactive"
            onClick={handleCardClick}
            style={selected ? {
                borderColor: 'var(--color-primary)',
                background: 'color-mix(in srgb, var(--color-primary) 7%, var(--color-surface))',
            } : isActive ? {
                borderColor: 'var(--color-primary)',
                boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent), var(--shadow-sm)',
                transform: 'translateY(-1px)',
            } : undefined}
        >
            {/* 头部：项目标识 + 元数据 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {selectable && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect?.(repo)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={displayName}
                        style={{
                            width: 15,
                            height: 15,
                            accentColor: 'var(--color-primary)',
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                    />
                )}

                <FileText size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {displayName}
                    </span>
                    <span style={{
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {repo.fullName}
                    </span>
                </div>

                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    flexShrink: 0,
                }}>
                    {repo.language && langColor && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span className="lang-dot" style={{ width: 8, height: 8, backgroundColor: langColor }} />
                            <span>{repo.language}</span>
                        </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontVariantNumeric: 'tabular-nums' }}>
                        <Star size={12} style={{ color: 'var(--color-accent)' }} />
                        {formatCompactNumber(repo.stargazersCount)}
                    </span>
                    {repo.isSubscribed && <Bell size={12} style={{ color: 'var(--color-accent)' }} />}
                </div>
            </div>

            {/* 直接展示的 Markdown 笔记正文 */}
            <div
                ref={previewRef}
                className={`home-note-preview${!expanded && isOverflowing ? ' clamped' : ''}`}
                style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-secondary)',
                    border: '1px solid var(--color-border)',
                }}
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a')) {
                        e.stopPropagation();
                    }
                }}
            >
                {content ? (
                    <MarkdownView content={content} repoFullName={repo.fullName} />
                ) : (
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {t('noNotesYet', lang)}
                    </span>
                )}
            </div>

            {/* 底部栏：标签、更新时间与快捷跳转 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {customTagItems.map((tag) => (
                    <span
                        key={tag.id}
                        className="tag"
                        style={{
                            fontSize: 11,
                            padding: '1px 7px',
                            background: tag.color
                                ? (/^#[0-9a-fA-F]{6}$/.test(tag.color) ? `${tag.color}18` : tag.color)
                                : 'var(--color-surface-secondary)',
                            color: getTagTextColor(tag.color),
                            borderColor: tag.color
                                ? `color-mix(in srgb, ${tag.color} 38%, transparent)`
                                : 'var(--color-border)',
                        }}
                    >
                        {tag.icon ? `${tag.icon} ` : ''}{tag.name}
                    </span>
                ))}

                {updatedText && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {t('noteUpdatedAt', lang, { date: updatedText })}
                    </span>
                )}

                <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isOverflowing && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 8px', fontSize: 12 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpanded((prev) => !prev);
                            }}
                        >
                            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {expanded ? t('collapseNote', lang) : t('expandNote', lang)}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', fontSize: 12 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenOverview(repo);
                        }}
                    >
                        <ExternalLink size={12} />
                        {t('openRepoOverview', lang)}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: 12 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenNote(repo);
                        }}
                    >
                        <Edit2 size={12} />
                        {t('editNote', lang)}
                    </button>
                </div>
            </div>
        </div>
    );
});

HomeNoteCard.displayName = 'HomeNoteCard';
