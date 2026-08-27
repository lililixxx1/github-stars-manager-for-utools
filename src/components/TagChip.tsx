import React from 'react';
import type { Tag } from '../types';

interface TagChipProps {
    /** 标签数据（color/icon 为用户自定义数据，允许直接作为颜色渲染） */
    tag: Tag;
    /** 选中态：tag.color（缺省 primary）实底 + 白字 */
    selected: boolean;
    onClick: (event: React.MouseEvent) => void;
    /** roving tabindex：可聚焦 0 / 非活跃 -1（DetailPage 键盘漫游透传） */
    tabIndex?: number;
    onFocus?: () => void;
    /** 键盘激活焦点环（由调用方 getControlStyle 产出，仅键盘激活时叠加） */
    style?: React.CSSProperties;
}

/**
 * 标签胶囊按钮（阶段8 共享组件）
 *
 * 统一 FilterBar 标签筛选 与 DetailPage 标签选择 两处近似拷贝的实现。
 * 语义差异（筛选切换 / 详情打标）由 onClick 回调与 selected 表达，
 * 键盘漫游 props（ref / tabIndex / onFocus / style）由调用方透传，
 * 焦点环走全局 :focus-visible，roving 激活环由 style 叠加。
 *
 * @example
 * <TagChip tag={tag} selected={isSelected} onClick={() => onToggle(tag.id)} onFocus={syncActiveIndex} />
 */
export const TagChip = React.forwardRef<HTMLButtonElement, TagChipProps>((
    { tag, selected, onClick, tabIndex, onFocus, style },
    ref,
) => (
    <button
        ref={ref}
        type="button"
        className="chip"
        style={{
            ...style,
            borderColor: tag.color || 'var(--color-border)',
            background: selected ? (tag.color || 'var(--color-primary)') : 'transparent',
            color: selected ? '#fff' : (tag.color || 'var(--color-text-primary)'),
        }}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onClick={onClick}
        aria-pressed={selected}
    >
        {tag.icon && <span>{tag.icon} </span>}
        {tag.name}
    </button>
));

TagChip.displayName = 'TagChip';
