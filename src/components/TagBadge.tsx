import React, { memo, useCallback, useMemo } from 'react';
import type { Tag } from '../types';

interface TagBadgeProps {
    tag: Tag;
    onClick?: () => void;
    onRemove?: () => void;
    size?: 'sm' | 'md';
    showRemove?: boolean;
}

/**
 * 标签徽章组件
 * @since v1.7.0 - 添加 memo 优化
 */
export const TagBadge = memo<TagBadgeProps>(({
    tag,
    onClick,
    onRemove,
    size = 'sm',
    showRemove = false,
}) => {
    const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

    // 缓存样式计算
    const badgeStyle = useMemo(() => ({
        backgroundColor: tag.color ? `${tag.color}20` : 'var(--color-surface-hover)',
        color: tag.color || 'var(--color-text-primary)',
        border: `1px solid ${tag.color || 'var(--color-border)'}`,
    }), [tag.color]);

    // 稳定的事件处理
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onClick?.();
    }, [onClick]);

    const handleRemove = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove?.();
    }, [onRemove]);

    return (
        <span
            className={`tag ${sizeClasses} inline-flex items-center gap-1 rounded-full cursor-pointer transition-colors`}
            style={badgeStyle}
            onClick={handleClick}
        >
            {tag.icon && <span>{tag.icon}</span>}
            <span>{tag.name}</span>
            {showRemove && onRemove && (
                <button
                    className="ml-1 hover:opacity-70"
                    onClick={handleRemove}
                >
                    ×
                </button>
            )}
        </span>
    );
});

TagBadge.displayName = 'TagBadge';
