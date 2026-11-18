import React, { memo } from 'react';
import { Check } from 'lucide-react';
import { t, type TranslationKey } from '@/locales';
import type { SortBy, SortOrder } from '@/types';

export const SORT_OPTIONS: { value: SortBy; labelKey: TranslationKey }[] = [
    { value: 'stars', labelKey: 'sortByStars' },
    { value: 'updated', labelKey: 'sortByUpdated' },
    { value: 'name', labelKey: 'sortByName' },
    { value: 'starredAt', labelKey: 'sortByStarredAt' },
    { value: 'pushedAt', labelKey: 'sortByPushedAt' },
];

interface SortMenuProps {
    sortBy: SortBy;
    sortOrder: SortOrder;
    activeIndex: number;
    lang: 'zh' | 'en';
    onSortChange: (sortBy: SortBy) => void;
    onToggleOrder: () => void;
    onHoverItem: (index: number) => void;
}

export const SortMenu = memo<SortMenuProps>(({
    sortBy,
    sortOrder,
    activeIndex,
    lang,
    onSortChange,
    onToggleOrder,
    onHoverItem,
}) => (
    <div
        className="panel-enter"
        style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-md)',
            minWidth: 164,
            zIndex: 120,
            overflow: 'hidden',
        }}
    >
        {SORT_OPTIONS.map((opt, index) => (
            <button
                key={opt.value}
                type="button"
                className="btn btn-ghost btn-sm w-full justify-start rounded-none"
                style={{
                    background: activeIndex === index
                        ? 'var(--color-surface-hover)'
                        : sortBy === opt.value ? 'var(--color-surface-secondary)' : 'transparent',
                    fontWeight: sortBy === opt.value ? 600 : undefined,
                }}
                onClick={() => onSortChange(opt.value)}
                onMouseEnter={() => onHoverItem(index)}
            >
                <span
                    className="w-5 inline-flex items-center justify-center"
                    style={{
                        color: 'var(--color-primary)',
                        opacity: sortBy === opt.value ? 1 : 0,
                    }}
                >
                    <Check size={14} />
                </span>
                <span className="ml-1">{t(opt.labelKey, lang)}</span>
            </button>
        ))}
        <div className="h-px bg-[var(--color-border)]" />
        <button
            type="button"
            className="btn btn-ghost btn-sm w-full justify-start rounded-none"
            style={{
                background: activeIndex === SORT_OPTIONS.length ? 'var(--color-surface-hover)' : 'transparent',
            }}
            onClick={onToggleOrder}
            onMouseEnter={() => onHoverItem(SORT_OPTIONS.length)}
        >
            <span className="w-5 inline-block" />
            {sortOrder === 'asc' ? t('sortAsc', lang) : t('sortDesc', lang)}
        </button>
    </div>
));

SortMenu.displayName = 'SortMenu';
