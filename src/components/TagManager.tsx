import React, { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useStore } from '../stores/useStore';
import { TagBadge } from './TagBadge';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { toast } from './Toast';
import { getLanguageColor } from '../constants/languages';
import { formatCompactNumber } from '../utils/format';
import { t } from '../locales';
import type { Repository, Tag } from '../types';
import {
    Plus,
    Edit2,
    Trash2,
    GripVertical,
    Check,
    Lightbulb,
    ArrowUpRight,
    Search,
    X,
    ArrowDownWideNarrow,
    FolderPlus,
    Tags as TagsIcon,
    Star,
    Box,
} from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 12 个预设颜色（与 src/utils/tagColor.ts 对比度映射对齐）
const PREDEFINED_COLORS = [
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#ec4899',
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#84cc16',
    '#10b981',
    '#14b8a6',
    '#06b6d4',
    '#64748b',
];

// 20 个预设图标
const PREDEFINED_ICONS = [
    '🏷️', '📁', '💻', '🛠️', '📚',
    '🎨', '🔧', '⚡', '🚀', '🌟',
    '💡', '🎯', '🤖', '🔒', '📱',
    '🌐', '🧪', '📦', '🎮', '📝',
];

type TagUsageFilter = 'all' | 'used' | 'unused';

export interface TagManagerHandle {
    openCreateModal: () => void;
    hasOpenOverlay: () => boolean;
    closeTopOverlay: () => void;
}

interface TagManagerProps {
    onSelect?: (tagId: string) => void;
    selectedTags?: string[];
    mode?: 'select' | 'manage';
}

interface SortableTagItemProps {
    tag: Tag;
    repos: Repository[];
    maxCount: number;
    dragDisabled: boolean;
    onEdit: (tag: Tag) => void;
    onDelete: (tagId: string) => void;
    onAssignRepos: (tag: Tag) => void;
    onViewRepos: (tagId: string) => void;
    lang: 'zh' | 'en';
}

const RepoMiniThumb: React.FC<{ avatarUrl?: string; login: string }> = ({ avatarUrl, login }) => {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [avatarUrl]);

    if (!avatarUrl || failed) {
        return (
            <div style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Box size={14} style={{ color: 'var(--color-text-muted)' }} />
            </div>
        );
    }

    return (
        <img
            src={avatarUrl}
            alt={login}
            width={30}
            height={30}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                flexShrink: 0,
            }}
        />
    );
};

const SortableTagItem: React.FC<SortableTagItemProps> = ({
    tag,
    repos,
    maxCount,
    dragDisabled,
    onEdit,
    onDelete,
    onAssignRepos,
    onViewRepos,
    lang,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tag.id, disabled: dragDisabled });

    const count = repos.length;
    const fillPct = maxCount > 0 ? Math.max(count > 0 ? 8 : 0, Math.round((count / maxCount) * 100)) : 0;

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 10 : undefined,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    };

    return (
        <div ref={setNodeRef} className="card" style={style}>
            {/* 拖拽手柄 */}
            <div
                className={dragDisabled ? 'p-1 rounded opacity-35' : 'cursor-move p-1 rounded'}
                style={{ touchAction: 'none', flexShrink: 0 }}
                title={dragDisabled ? t('dragDisabledWhenFiltered', lang) : t('dragToSort', lang)}
                {...(dragDisabled ? {} : attributes)}
                {...(dragDisabled ? {} : listeners)}
            >
                <GripVertical size={16} style={{ color: 'var(--color-text-muted)' }} />
            </div>

            {/* 主信息区 */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <TagBadge tag={tag} size="md" />
                    <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                        {t('tagCount', lang, { count })}
                    </span>
                    <div
                        className="progress-bar"
                        style={{ width: 72, height: 4, flexShrink: 0 }}
                        aria-hidden="true"
                    >
                        <div
                            className="progress-bar-fill"
                            style={{
                                width: `${fillPct}%`,
                                background: tag.color || 'var(--color-primary)',
                            }}
                        />
                    </div>
                </div>

                {repos.length > 0 && (
                    <div style={{
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {repos.slice(0, 3).map((r) => r.alias || r.name).join(' · ')}
                        {repos.length > 3 ? ` +${repos.length - 3}` : ''}
                    </div>
                )}
            </div>

            {/* 操作按钮组 */}
            <div className="flex items-center gap-1 shrink-0">
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onAssignRepos(tag)}
                    title={t('assignRepos', lang)}
                >
                    <FolderPlus size={13} />
                    <span>{t('assignRepos', lang)}</span>
                </button>
                {count > 0 && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onViewRepos(tag.id)}
                        title={t('viewTagRepos', lang)}
                    >
                        <span>{t('viewTagRepos', lang)}</span>
                        <ArrowUpRight size={13} />
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon-sm"
                    onClick={() => onEdit(tag)}
                    title={t('edit', lang)}
                    aria-label={t('edit', lang)}
                >
                    <Edit2 size={14} />
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon-sm"
                    onClick={() => onDelete(tag.id)}
                    title={t('delete', lang)}
                    aria-label={t('delete', lang)}
                    style={{ color: 'var(--color-error-text)' }}
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
};

export const TagManager = forwardRef<TagManagerHandle, TagManagerProps>(({
    onSelect,
    selectedTags = [],
    mode = 'select',
}, ref) => {
    const tags = useStore((state) => state.tags);
    const addTag = useStore((state) => state.addTag);
    const updateTag = useStore((state) => state.updateTag);
    const deleteTag = useStore((state) => state.deleteTag);
    const reorderTags = useStore((state) => state.reorderTags);
    const batchAddTag = useStore((state) => state.batchAddTag);
    const batchRemoveTag = useStore((state) => state.batchRemoveTag);
    const repositories = useStore((state) => state.repositories);
    const setSearchFilter = useStore((state) => state.setSearchFilter);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const lang = useStore((state) => (state.settings?.language || 'zh') as 'zh' | 'en');

    const [isEditing, setIsEditing] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(PREDEFINED_COLORS[0]);
    const [newTagIcon, setNewTagIcon] = useState(PREDEFINED_ICONS[0]);
    const [isAdding, setIsAdding] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

    const [tagSearch, setTagSearch] = useState('');
    const deferredTagSearch = useDeferredValue(tagSearch);
    const [usageFilter, setUsageFilter] = useState<TagUsageFilter>('all');
    const [assigningTagId, setAssigningTagId] = useState<string | null>(null);
    const [assignSearch, setAssignSearch] = useState('');
    const deferredAssignSearch = useDeferredValue(assignSearch);

    const sortedTags = useMemo(() => {
        return [...tags].sort((a, b) => a.order - b.order);
    }, [tags]);

    const [localTags, setLocalTags] = useState<Tag[] | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        setLocalTags(null);
    }, [tags]);

    const displayTags = localTags ?? sortedTags;

    const { reposByTagId, taggedRepoCount, maxTagCount, unusedTagCount } = useMemo(() => {
        const map = new Map<string, Repository[]>();
        let taggedCount = 0;

        for (const repo of repositories) {
            const repoTags = repo.customTags || [];
            if (repoTags.length > 0) taggedCount++;
            for (const tagId of repoTags) {
                const list = map.get(tagId);
                if (list) list.push(repo);
                else map.set(tagId, [repo]);
            }
        }

        let maxCount = 0;
        let unused = 0;
        for (const tag of tags) {
            const len = map.get(tag.id)?.length || 0;
            if (len > maxCount) maxCount = len;
            if (len === 0) unused++;
        }

        return {
            reposByTagId: map,
            taggedRepoCount: taggedCount,
            maxTagCount: maxCount,
            unusedTagCount: unused,
        };
    }, [repositories, tags]);

    const filteredTags = useMemo(() => {
        const q = deferredTagSearch.trim().toLowerCase();
        return displayTags.filter((tag) => {
            const count = reposByTagId.get(tag.id)?.length || 0;
            if (usageFilter === 'used' && count === 0) return false;
            if (usageFilter === 'unused' && count > 0) return false;
            if (q && !tag.name.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [deferredTagSearch, displayTags, reposByTagId, usageFilter]);

    const isFiltered = tagSearch.trim().length > 0 || usageFilter !== 'all';

    const assigningTag = useMemo(
        () => (assigningTagId ? tags.find((t) => t.id === assigningTagId) ?? null : null),
        [assigningTagId, tags]
    );

    const assignCandidateRepos = useMemo(() => {
        if (!assigningTag) return [];
        const q = deferredAssignSearch.trim().toLowerCase();
        const matched = q
            ? repositories.filter((repo) =>
                repo.fullName.toLowerCase().includes(q)
                || (repo.alias || '').toLowerCase().includes(q)
                || (repo.description || '').toLowerCase().includes(q)
                || (repo.aiSummary || '').toLowerCase().includes(q)
            )
            : repositories;

        return [...matched].sort((a, b) => {
            const hasA = (a.customTags || []).includes(assigningTag.id) ? 1 : 0;
            const hasB = (b.customTags || []).includes(assigningTag.id) ? 1 : 0;
            if (hasA !== hasB) return hasB - hasA;
            return b.stargazersCount - a.stargazersCount;
        });
    }, [assigningTag, deferredAssignSearch, repositories]);

    const openCreateModal = useCallback(() => {
        setEditingTag(null);
        setIsEditing(false);
        setNewTagName('');
        setNewTagColor(PREDEFINED_COLORS[tags.length % PREDEFINED_COLORS.length]);
        setNewTagIcon(PREDEFINED_ICONS[tags.length % PREDEFINED_ICONS.length]);
        setIsAdding(true);
    }, [tags.length]);

    const closeTagForm = useCallback(() => {
        setIsAdding(false);
        setIsEditing(false);
        setEditingTag(null);
        setNewTagName('');
    }, []);

    useImperativeHandle(ref, () => ({
        openCreateModal,
        hasOpenOverlay: () => Boolean(tagToDelete || assigningTagId || isAdding || isEditing),
        closeTopOverlay: () => {
            if (tagToDelete) {
                setTagToDelete(null);
                return;
            }
            if (assigningTagId) {
                setAssigningTagId(null);
                return;
            }
            if (isAdding || isEditing) {
                closeTagForm();
            }
        },
    }), [assigningTagId, closeTagForm, isAdding, isEditing, openCreateModal, tagToDelete]);

    const handleViewTagRepos = useCallback((tagId: string) => {
        setSearchFilter({ customTags: [tagId], smartView: 'all', invertFilter: false });
        setCurrentPage('home');
    }, [setCurrentPage, setSearchFilter]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = () => {
        setIsDragging(true);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setIsDragging(false);

        if (isFiltered) return;

        if (over && active.id !== over.id) {
            try {
                const oldIndex = displayTags.findIndex((t) => t.id === active.id);
                const newIndex = displayTags.findIndex((t) => t.id === over.id);

                const newTags = arrayMove(displayTags, oldIndex, newIndex);
                setLocalTags(newTags);

                setTimeout(() => {
                    reorderTags(newTags.map((t) => t.id));
                }, 100);
            } catch (error) {
                console.error('Drag sort failed:', error);
                setLocalTags(null);
            }
        }
    };

    const handleSortByCount = () => {
        if (sortedTags.length <= 1) return;
        const nextIds = [...sortedTags]
            .sort((a, b) => {
                const diff = (reposByTagId.get(b.id)?.length || 0) - (reposByTagId.get(a.id)?.length || 0);
                return diff !== 0 ? diff : a.order - b.order;
            })
            .map((t) => t.id);
        reorderTags(nextIds);
        toast.show(t('tagsSortedByCount', lang), { type: 'info' });
    };

    const trimmedName = newTagName.trim();
    const isDuplicateName = Boolean(trimmedName) && tags.some(
        (tag) => tag.name.trim().toLowerCase() === trimmedName.toLowerCase() && tag.id !== editingTag?.id
    );

    const handleAddTag = () => {
        if (!trimmedName || isDuplicateName) return;
        addTag({
            name: trimmedName,
            color: newTagColor,
            icon: newTagIcon,
            order: tags.length,
        });
        setNewTagName('');
        setIsAdding(false);
    };

    const handleUpdateTag = () => {
        if (!editingTag || !trimmedName || isDuplicateName) return;
        updateTag(editingTag.id, {
            name: trimmedName,
            color: newTagColor,
            icon: newTagIcon,
        });
        setEditingTag(null);
        setNewTagName('');
        setIsEditing(false);
    };

    const handleDeleteTag = (tagId: string) => {
        const tag = tags.find((t) => t.id === tagId);
        if (tag) {
            setTagToDelete(tag);
        }
    };

    const confirmDeleteTag = () => {
        if (tagToDelete) {
            deleteTag(tagToDelete.id);
            setTagToDelete(null);
        }
    };

    const startEdit = (tag: Tag) => {
        setEditingTag(tag);
        setNewTagName(tag.name);
        setNewTagColor(tag.color || PREDEFINED_COLORS[0]);
        setNewTagIcon(tag.icon ?? '');
        setIsEditing(true);
    };

    const handleOpenAssignModal = (tag: Tag) => {
        setAssignSearch('');
        setAssigningTagId(tag.id);
    };

    const handleToggleRepoTag = (repo: Repository, tagId: string) => {
        const hasTag = (repo.customTags || []).includes(tagId);
        if (hasTag) {
            batchRemoveTag([repo.id], tagId);
        } else {
            batchAddTag([repo.id], tagId);
        }
    };

    const nameInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (isAdding || isEditing) {
            window.requestAnimationFrame(() => nameInputRef.current?.focus());
        }
    }, [isAdding, isEditing]);

    if (mode === 'select') {
        return (
            <div className="flex flex-wrap gap-2">
                {displayTags.map((tag) => (
                    <TagBadge
                        key={tag.id}
                        tag={tag}
                        size="md"
                        onClick={() => onSelect?.(tag.id)}
                        showRemove={selectedTags.includes(tag.id)}
                        onRemove={() => onSelect?.(tag.id)}
                    />
                ))}
                {displayTags.length === 0 && (
                    <span className="text-sm text-[var(--color-text-muted)]">
                        {t('noTags', lang)}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3" style={{ minHeight: tags.length === 0 ? '100%' : undefined }}>
            {/* 顶部统计概览条 */}
            <div className="tag-stats-grid">
                <div className="settings-stat-card" style={{ cursor: 'default' }}>
                    <span className="text-[11px] text-[var(--color-text-muted)]">{t('totalTagsStat', lang)}</span>
                    <span className="text-[14px] font-semibold text-[var(--color-text-primary)] tabular-nums">
                        {tags.length}
                    </span>
                </div>
                <button
                    type="button"
                    className="settings-stat-card"
                    onClick={() => setUsageFilter((prev) => (prev === 'used' ? 'all' : 'used'))}
                >
                    <span className="text-[11px] text-[var(--color-text-muted)]">{t('taggedReposStat', lang)}</span>
                    <span className="text-[14px] font-semibold text-[var(--color-primary)] tabular-nums">
                        {taggedRepoCount} / {repositories.length}
                    </span>
                </button>
                <button
                    type="button"
                    className="settings-stat-card"
                    onClick={() => setUsageFilter((prev) => (prev === 'unused' ? 'all' : 'unused'))}
                >
                    <span className="text-[11px] text-[var(--color-text-muted)]">{t('unusedTagsStat', lang)}</span>
                    <span
                        className="text-[14px] font-semibold tabular-nums"
                        style={{ color: unusedTagCount > 0 ? 'var(--color-warning-strong)' : 'var(--color-text-primary)' }}
                    >
                        {unusedTagCount}
                    </span>
                </button>
            </div>

            {/* 搜索、筛选与一键按数量排序工具栏 */}
            {tags.length > 0 && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search
                            size={13}
                            style={{
                                position: 'absolute',
                                left: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--color-text-muted)',
                            }}
                        />
                        <input
                            type="text"
                            className="input"
                            style={{ padding: '5px 28px 5px 30px', fontSize: 12 }}
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            placeholder={t('searchTagsPlaceholder', lang)}
                        />
                        {tagSearch && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{
                                    position: 'absolute',
                                    right: 4,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    padding: 2,
                                }}
                                onClick={() => setTagSearch('')}
                                aria-label={t('clearFilter', lang)}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <div className="segmented" style={{ width: 'fit-content' }}>
                            {(
                                [
                                    { id: 'all', label: t('tagFilterAll', lang) },
                                    { id: 'used', label: t('tagFilterUsed', lang) },
                                    { id: 'unused', label: t('tagFilterUnused', lang) },
                                ] as const
                            ).map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={`segmented-item${usageFilter === tab.id ? ' active' : ''}`}
                                    style={{ padding: '3px 10px', fontSize: 12 }}
                                    onClick={() => setUsageFilter(tab.id)}
                                    aria-pressed={usageFilter === tab.id}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {tags.length > 1 && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={handleSortByCount}
                                title={t('sortTagsByCount', lang)}
                            >
                                <ArrowDownWideNarrow size={13} />
                                {t('sortTagsByCount', lang)}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 标签列表 */}
            {tags.length === 0 ? (
                <div style={{ flex: 1 }}>
                    <EmptyState
                        icon={<TagsIcon size={44} strokeWidth={1.5} />}
                        title={t('noTagsYet', lang)}
                        action={
                            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateModal}>
                                <Plus size={14} />
                                {t('addFirstTag', lang)}
                            </button>
                        }
                    />
                </div>
            ) : filteredTags.length === 0 ? (
                <div style={{ flex: 1 }}>
                    <EmptyState
                        icon={<Search size={40} strokeWidth={1.5} />}
                        title={t('noMatchingTags', lang)}
                        action={
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                    setTagSearch('');
                                    setUsageFilter('all');
                                }}
                            >
                                {t('clearFilter', lang)}
                            </button>
                        }
                    />
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={filteredTags.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, userSelect: isDragging ? 'none' : 'auto' }}>
                            {filteredTags.map((tag) => (
                                <SortableTagItem
                                    key={tag.id}
                                    tag={tag}
                                    repos={reposByTagId.get(tag.id) || []}
                                    maxCount={maxTagCount}
                                    dragDisabled={isFiltered}
                                    onEdit={startEdit}
                                    onDelete={handleDeleteTag}
                                    onAssignRepos={handleOpenAssignModal}
                                    onViewRepos={handleViewTagRepos}
                                    lang={lang}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {/* 排序提示 */}
            {tags.length > 1 && !isAdding && !isEditing && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Lightbulb size={12} />
                    {isFiltered ? t('dragDisabledWhenFiltered', lang) : t('dragToSort', lang)}
                </p>
            )}

            {/* 添加/编辑标签弹窗 */}
            <Modal
                isOpen={isAdding || isEditing}
                onClose={closeTagForm}
                title={isEditing ? t('editTag', lang) : t('addTag', lang)}
                width={480}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={closeTagForm}>
                            {t('cancel', lang)}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={isEditing ? handleUpdateTag : handleAddTag}
                            disabled={!trimmedName || isDuplicateName}
                        >
                            <Check size={15} />
                            {t('confirm', lang)}
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                            {t('tagName', lang)}
                        </label>
                        <input
                            ref={nameInputRef}
                            type="text"
                            className="input"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder={t('tagPlaceholder', lang)}
                            style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && trimmedName && !isDuplicateName) {
                                    if (isEditing) handleUpdateTag();
                                    else handleAddTag();
                                }
                            }}
                        />
                        {isDuplicateName && (
                            <p className="text-[12px] mt-1" style={{ color: 'var(--color-error-text)' }}>
                                {t('duplicateTagName', lang)}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">
                            {t('tagColor', lang)}
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            {PREDEFINED_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    aria-label={color}
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        backgroundColor: color,
                                        border: newTagColor.toLowerCase() === color
                                            ? '2px solid var(--color-surface)'
                                            : '2px solid transparent',
                                        boxShadow: newTagColor.toLowerCase() === color
                                            ? `0 0 0 2px ${color}`
                                            : 'none',
                                        cursor: 'pointer',
                                        transition: 'transform 0.14s var(--ease-spring), box-shadow 0.14s ease, border-color 0.14s ease',
                                    }}
                                    onClick={() => setNewTagColor(color)}
                                />
                            ))}
                            <label
                                title={t('customColor', lang)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 11,
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="color"
                                    aria-label={t('customColor', lang)}
                                    value={/^#[0-9a-fA-F]{6}$/.test(newTagColor) ? newTagColor : '#3b82f6'}
                                    onChange={(e) => setNewTagColor(e.target.value)}
                                    style={{
                                        width: 26,
                                        height: 26,
                                        padding: 0,
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 6,
                                        background: 'transparent',
                                        cursor: 'pointer',
                                    }}
                                />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-[var(--color-text-secondary)] mb-1.5">
                            {t('tagIcon', lang)}
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <button
                                type="button"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 8px',
                                    height: 30,
                                    borderRadius: 6,
                                    fontSize: 12,
                                    border: `1px solid ${newTagIcon === '' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                    background: newTagIcon === '' ? 'var(--color-primary)' : 'var(--color-surface)',
                                    color: newTagIcon === '' ? 'white' : 'var(--color-text-secondary)',
                                    cursor: 'pointer',
                                }}
                                onClick={() => setNewTagIcon('')}
                            >
                                {t('noIconOption', lang)}
                            </button>
                            {PREDEFINED_ICONS.map((icon) => (
                                <button
                                    key={icon}
                                    type="button"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 30,
                                        height: 30,
                                        borderRadius: 6,
                                        fontSize: 14,
                                        border: `1px solid ${newTagIcon === icon ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                        background: newTagIcon === icon ? 'var(--color-primary)' : 'var(--color-surface)',
                                        color: newTagIcon === icon ? 'white' : 'var(--color-text-primary)',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease',
                                    }}
                                    onClick={() => setNewTagIcon(icon)}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                            {t('preview', lang)}
                        </label>
                        <div>
                            <TagBadge
                                tag={{
                                    id: 'preview',
                                    name: trimmedName || t('tagName', lang),
                                    color: newTagColor,
                                    icon: newTagIcon || undefined,
                                    order: 0,
                                    createdAt: Date.now(),
                                    updatedAt: Date.now(),
                                }}
                                size="md"
                            />
                        </div>
                    </div>
                </div>
            </Modal>

            {/* 关联仓库弹窗 */}
            <Modal
                isOpen={Boolean(assigningTag)}
                onClose={() => setAssigningTagId(null)}
                title={assigningTag ? t('assignReposTitle', lang, { name: assigningTag.name }) : ''}
                width={560}
                footer={
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setAssigningTagId(null)}>
                        {t('commonClose', lang)}
                    </button>
                }
            >
                {assigningTag && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                            <TagBadge tag={assigningTag} size="sm" />
                            <span className="text-[12px] text-[var(--color-text-muted)]">
                                {t('tagCount', lang, { count: reposByTagId.get(assigningTag.id)?.length || 0 })}
                            </span>
                        </div>

                        <div className="relative">
                            <Search
                                size={14}
                                style={{
                                    position: 'absolute',
                                    left: 10,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)',
                                }}
                            />
                            <input
                                type="text"
                                className="input"
                                style={{ padding: '7px 30px 7px 32px', fontSize: 13 }}
                                value={assignSearch}
                                onChange={(e) => setAssignSearch(e.target.value)}
                                placeholder={t('searchReposToAssign', lang)}
                            />
                            {assignSearch && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{
                                        position: 'absolute',
                                        right: 4,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        padding: 2,
                                    }}
                                    onClick={() => setAssignSearch('')}
                                    aria-label={t('clearFilter', lang)}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {repositories.length === 0 ? (
                            <p className="text-[13px] text-[var(--color-text-muted)] text-center py-6">
                                {t('noRepos', lang)}
                            </p>
                        ) : assignCandidateRepos.length === 0 ? (
                            <p className="text-[13px] text-[var(--color-text-muted)] text-center py-6">
                                {t('noResults', lang)}
                            </p>
                        ) : (
                            <div style={{ maxHeight: 330, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {assignCandidateRepos.slice(0, 80).map((repo) => {
                                    const assigned = (repo.customTags || []).includes(assigningTag.id);
                                    const langColor = repo.language ? getLanguageColor(repo.language) : null;
                                    return (
                                        <div
                                            key={repo.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '8px 10px',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--color-border)',
                                                background: 'var(--color-surface-secondary)',
                                            }}
                                        >
                                            <RepoMiniThumb avatarUrl={repo.owner.avatarUrl} login={repo.owner.login} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                    <span style={{
                                                        fontSize: 13,
                                                        fontWeight: 600,
                                                        color: 'var(--color-text-primary)',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {repo.alias || repo.name}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 11,
                                                        color: 'var(--color-text-muted)',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {repo.fullName}
                                                    </span>
                                                </div>
                                                <p style={{
                                                    fontSize: 12,
                                                    color: 'var(--color-text-secondary)',
                                                    margin: '2px 0',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {repo.aiSummary || repo.description || t('noDescription', lang)}
                                                </p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                    {repo.language && langColor && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <span className="lang-dot" style={{ width: 7, height: 7, backgroundColor: langColor }} />
                                                            {repo.language}
                                                        </span>
                                                    )}
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                                        <Star size={11} style={{ color: 'var(--color-accent)' }} />
                                                        {formatCompactNumber(repo.stargazersCount)}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className={`btn btn-sm ${assigned ? 'btn-secondary' : 'btn-primary'}`}
                                                style={{ flexShrink: 0 }}
                                                onClick={() => handleToggleRepoTag(repo, assigningTag.id)}
                                            >
                                                {assigned ? (
                                                    <>
                                                        <Check size={13} />
                                                        {t('assignedLabel', lang)}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus size={13} />
                                                        {t('addTag', lang)}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* 删除确认弹窗 */}
            <ConfirmDialog
                isOpen={!!tagToDelete}
                title={t('deleteTag', lang)}
                message={tagToDelete ? t('deleteTagConfirm', lang, { name: tagToDelete.name }) : ''}
                confirmText={t('confirm', lang)}
                cancelText={t('cancel', lang)}
                variant="danger"
                onConfirm={confirmDeleteTag}
                onCancel={() => setTagToDelete(null)}
            />
        </div>
    );
});

TagManager.displayName = 'TagManager';
