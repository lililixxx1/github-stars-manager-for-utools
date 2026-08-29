import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'new' | 'count';

interface BadgeProps {
    /** 变体：default=primary 软底 / success / error / warning=语义实底 / new=NEW 渐变 / count=小圆数字 */
    variant?: BadgeVariant;
    children: React.ReactNode;
    className?: string;
    /** 悬停提示文案 */
    title?: string;
}

/**
 * 通用徽章组件
 *
 * 语义变体对比度（配白字或深字，均按 WCAG AA 校验）：
 * - success: light #047857+白 5.49:1 / dark #34d399+深字 9.3:1
 * - error:   light #dc2626+白 4.83:1 / dark #b91c1c+白 6.47:1
 * - warning: light #b45309+白 5.02:1 / dark #fbbf24+深字 10.7:1
 *
 * @example
 * <Badge variant="count">3</Badge>
 * <Badge variant="new">NEW</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className, title }) => (
    <span
        className={`badge badge-${variant}${className ? ` ${className}` : ''}`}
        title={title}
    >
        {children}
    </span>
);
