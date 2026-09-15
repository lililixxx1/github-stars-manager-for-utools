import React from 'react';

interface BackHintChipProps {
    label: string;
    onClick: () => void;
    /** DetailPage 必传 -1：其 roving 全局 Enter/Space 处理器会劫持未注册的可聚焦按钮（方案 v1.2 C1） */
    tabIndex?: number;
}

/**
 * ⌫ 返回提示 chip：kbd 视觉、可点击（鼠标用户的逃生路径），键盘返回由全局 Backspace 承担（主路径）。
 * 方案 SEARCH-RESTORE-BACKSPACE-PLAN v1.2 C1/C3。
 */
export const BackHintChip: React.FC<BackHintChipProps> = ({ label, onClick, tabIndex }) => (
    <button
        type="button"
        onClick={onClick}
        tabIndex={tabIndex}
        title={label}
        style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--color-text-secondary)',
            background: 'var(--color-surface-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '2px 10px', cursor: 'pointer',
        }}
    >
        <kbd style={{
            fontFamily: 'inherit', fontSize: 11, lineHeight: '16px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderBottomWidth: 2, borderRadius: 4, padding: '0 5px',
            color: 'var(--color-text-secondary)',
        }}>⌫</kbd>
        {label}
    </button>
);
