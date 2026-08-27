import React from 'react';

interface ToggleProps {
    /** 受控开关状态 */
    checked: boolean;
    /** 状态变化回调 */
    onChange: (checked: boolean) => void;
    /** 禁用态 */
    disabled?: boolean;
    /** 开关旁的可点击文字标签 */
    label?: string;
    /** 无可见文字时的无障碍名称（aria-label） */
    'aria-label'?: string;
    className?: string;
}

/**
 * 受控开关组件（供 SettingsPage 等设置项使用）
 *
 * 基于 <button role="switch">，键盘 Enter/Space 原生触发，
 * 焦点环由全局 :focus-visible 提供。
 *
 * @example
 * <Toggle checked={enabled} onChange={setEnabled} label={t('autoAnalyzeOnOpen', lang)} />
 */
export const Toggle: React.FC<ToggleProps> = ({
    checked,
    onChange,
    disabled = false,
    label,
    'aria-label': ariaLabel,
    className,
}) => {
    const switchElement = (
        <button
            type="button"
            role="switch"
            className={`toggle${className ? ` ${className}` : ''}`}
            data-checked={checked}
            aria-checked={checked}
            aria-label={ariaLabel ?? label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
        />
    );

    if (!label) {
        return switchElement;
    }

    return (
        <label
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: disabled ? 'not-allowed' : 'pointer',
                userSelect: 'none',
            }}
        >
            {switchElement}
            <span style={{ fontSize: 'var(--text-md)', color: 'var(--color-text-primary)' }}>
                {label}
            </span>
        </label>
    );
};
