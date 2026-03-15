import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../stores/useStore';
import { TagBadge } from './TagBadge';
import { t } from '../locales';
import type { Tag } from '../types';
import { Plus, Edit2, Trash2, GripVertical, X, Check } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 预定义颜色
const PREDEFINED_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
];

// 预定义图标
const PREDEFINED_ICONS = ['🏷️', '📁', '💻', '🛠️', '📚', '🎨', '🔧', '⚡', '🚀', '🌟', '💡', '🎯'];

interface TagManagerProps {
    onSelect?: (tagId: string) => void;
    selectedTags?: string[];
    mode?: 'select' | 'manage';
}

// 可排序标签项组件
interface SortableTagItemProps {
    tag: Tag;
    onEdit: (tag: Tag) => void;
    onDelete: (tagId: string) => void;
    getTagCount: (tagId: string) => number;
    lang: 'zh' | 'en';
}

const SortableTagItem: React.FC<SortableTagItemProps> = ({
    tag,
    onEdit,
    onDelete,
    getTagCount,
    lang,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tag.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            className="card"
            style={{
                ...style,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                opacity: isDragging ? 0.5 : 1,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* 拖拽手柄 - 使用 div 避免 button 嵌套问题 */}
                <div
                    style={{ cursor: 'move', touchAction: 'none', padding: 4, borderRadius: 4 }}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical size={16} style={{ color: 'var(--color-text-muted)' }} />
                </div>
                <TagBadge tag={tag} size="md" />
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {t('tagCount', lang, { count: getTagCount(tag.id) })}
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onEdit(tag)}
                    title={t('edit', lang)}
                >
                    <Edit2 size={14} />
                </button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onDelete(tag.id)}
                    title={t('delete', lang)}
                    style={{ color: 'var(--color-error)' }}
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
};

export const TagManager: React.FC<TagManagerProps> = ({
    onSelect,
    selectedTags = [],
    mode = 'select',
}) => {
    const { tags, addTag, updateTag, deleteTag, reorderTags, repositories } = useStore();
    const lang = (useStore.getState().settings.language || 'zh') as 'zh' | 'en';

    const [isEditing, setIsEditing] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(PREDEFINED_COLORS[0]);
    const [newTagIcon, setNewTagIcon] = useState(PREDEFINED_ICONS[0]);
    const [isAdding, setIsAdding] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

    // 使用 useMemo 计算排序后的标签（优化性能）
    const sortedTags = useMemo(() => {
        return [...tags].sort((a, b) => a.order - b.order);
    }, [tags]);

    // 本地拖拽状态（拖拽过程中覆盖 sortedTags）
    const [localTags, setLocalTags] = useState<Tag[] | null>(null);

    // 拖拽状态标记
    const [isDragging, setIsDragging] = useState(false);

    // tags 变化时重置本地状态
    useEffect(() => {
        setLocalTags(null);
    }, [tags]);

    // 显示时优先使用本地状态
    const displayTags = localTags ?? sortedTags;

    // 统计每个标签关联的仓库数量
    const getTagCount = (tagId: string) => {
        return repositories.filter(r => r.customTags?.includes(tagId)).length;
    };

    // 拖拽传感器配置
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 需要移动 8px 才触发拖拽，避免误触
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 拖拽开始
    const handleDragStart = () => {
        setIsDragging(true);
    };

    // 拖拽结束处理
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setIsDragging(false);

        if (over && active.id !== over.id) {
            try {
                const oldIndex = displayTags.findIndex((t) => t.id === active.id);
                const newIndex = displayTags.findIndex((t) => t.id === over.id);

                // 更新本地状态（即时反馈）
                const newTags = arrayMove(displayTags, oldIndex, newIndex);
                setLocalTags(newTags);

                // 添加轻微延迟，让动画完成后再保存
                setTimeout(() => {
                    reorderTags(newTags.map((t) => t.id));
                }, 100);
            } catch (error) {
                console.error('Drag sort failed:', error);
                // 恢复原状
                setLocalTags(null);
            }
        }
    };

    const handleAddTag = () => {
        if (!newTagName.trim()) return;
        addTag({
            name: newTagName.trim(),
            color: newTagColor,
            icon: newTagIcon,
            order: tags.length,
        });
        setNewTagName('');
        setIsAdding(false);
    };

    const handleUpdateTag = () => {
        if (!editingTag || !newTagName.trim()) return;
        updateTag(editingTag.id, {
            name: newTagName.trim(),
            color: newTagColor,
            icon: newTagIcon,
        });
        setEditingTag(null);
        setNewTagName('');
        setIsEditing(false);
    };

    const handleDeleteTag = (tagId: string) => {
        const tag = tags.find(t => t.id === tagId);
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
        setNewTagIcon(tag.icon || PREDEFINED_ICONS[0]);
        setIsEditing(true);
    };

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

    // 管理模式 - 支持拖拽
    return (
        <div className="flex flex-col gap-3">
            {/* 标签列表 - 拖拽排序 */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={displayTags.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, userSelect: isDragging ? 'none' : 'auto' }}>
                        {displayTags.map((tag) => (
                            <SortableTagItem
                                key={tag.id}
                                tag={tag}
                                onEdit={startEdit}
                                onDelete={handleDeleteTag}
                                getTagCount={getTagCount}
                                lang={lang}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* 添加/编辑表单 (变成模态弹窗) */}
            {(isAdding || isEditing) && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                    backdropFilter: 'blur(2px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 100
                }}>
                    <div className="card" style={{
                        borderRadius: 12,
                        border: '1px solid #818cf8',
                        padding: 24,
                        width: '90%',
                        maxWidth: 480,
                        boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
                        display: 'flex', flexDirection: 'column', gap: 14
                    }}>
                        <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium" style={{ fontSize: 16, color: 'var(--color-text-primary)' }}>
                                {isEditing ? t('editTag', lang) : t('addTag', lang)}
                            </h4>
                            <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: 4 }}
                                onClick={() => {
                                    setIsAdding(false);
                                    setIsEditing(false);
                                    setEditingTag(null);
                                    setNewTagName('');
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* 标签名称 */}
                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                                {t('tagName', lang)}
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder={t('tagPlaceholder', lang)}
                                style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
                                autoFocus
                            />
                        </div>

                        {/* 标签颜色 */}
                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                                {t('tagColor', lang)}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {PREDEFINED_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: '50%',
                                            backgroundColor: color,
                                            border: newTagColor === color
                                                ? `2px solid var(--color-primary)`
                                                : '2px solid transparent',
                                            boxShadow: newTagColor === color
                                                ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-primary)'
                                                : 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                        onClick={() => setNewTagColor(color)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* 标签图标 */}
                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                                {t('tagIcon', lang)}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {PREDEFINED_ICONS.map((icon) => (
                                    <button
                                        key={icon}
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
                                            transition: 'all 0.15s ease',
                                        }}
                                        onClick={() => setNewTagIcon(icon)}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 预览 */}
                        <div>
                            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                                预览
                            </label>
                            <div>
                                <TagBadge
                                    tag={{
                                        id: 'preview',
                                        name: newTagName || t('tagName', lang),
                                        color: newTagColor,
                                        icon: newTagIcon,
                                        order: 0,
                                        createdAt: Date.now(),
                                        updatedAt: Date.now(),
                                    }}
                                    size="md"
                                />
                            </div>
                        </div>

                        {/* 操作按钮组 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                            <button
                                className="btn"
                                style={{
                                    padding: '8px 24px',
                                    backgroundColor: '#f3f4f6',
                                    color: '#374151',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 8,
                                    fontSize: 14
                                }}
                                onClick={() => {
                                    setIsAdding(false);
                                    setIsEditing(false);
                                    setEditingTag(null);
                                    setNewTagName('');
                                }}
                            >
                                {t('cancel', lang)}
                            </button>
                            <button
                                className="btn"
                                style={{
                                    padding: '8px 24px',
                                    backgroundColor: '#6366f1',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 8,
                                    fontSize: 14,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    opacity: !newTagName.trim() ? 0.6 : 1,
                                    cursor: !newTagName.trim() ? 'not-allowed' : 'pointer'
                                }}
                                onClick={isEditing ? handleUpdateTag : handleAddTag}
                                disabled={!newTagName.trim()}
                            >
                                <Check size={16} />
                                {t('confirm', lang)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 添加按钮 */}
            {!isAdding && !isEditing && (
                <button
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setIsAdding(true)}
                >
                    <Plus size={16} />
                    {t('addTag', lang)}
                </button>
            )}

            {/* 提示 */}
            {tags.length > 1 && !isAdding && !isEditing && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    💡 {t('dragToSort', lang)}
                </p>
            )}

            {/* 删除确认弹窗 */}
            {tagToDelete && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 50
                }}>
                    <div className="card" style={{ width: 320, padding: 24, margin: '0 16px' }}>
                        <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>
                            {lang === 'zh' ? '删除标签' : 'Delete Tag'}
                        </h4>
                        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.5, wordBreak: 'break-all' }}>
                            {t('deleteTagConfirm', lang, { name: tagToDelete.name })}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setTagToDelete(null)}
                            >
                                {t('cancel', lang)}
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ backgroundColor: 'var(--color-error)' }}
                                onClick={confirmDeleteTag}
                            >
                                {t('confirm', lang)}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
