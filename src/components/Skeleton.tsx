import React from 'react';

interface SkeletonProps {
    /** 宽度，默认 100% */
    width?: number | string;
    /** 高度，默认 12px */
    height?: number | string;
    /** 圆形（头像等） */
    circle?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 骨架占位行（shimmer 动画见 index.css 的 .skeleton / @keyframes shimmer）
 *
 * @example
 * <Skeleton height={14} width="40%" />
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    width = '100%',
    height = 12,
    circle = false,
    className,
    style,
}) => (
    <div
        className={`skeleton${className ? ` ${className}` : ''}`}
        style={{
            width,
            height,
            borderRadius: circle ? '50%' : undefined,
            ...style,
        }}
        aria-hidden="true"
    />
);

/**
 * 仓库卡片骨架：头像圆角方块 + 标题行 + 描述两行条
 *
 * @example
 * <SkeletonCard />
 */
export const SkeletonCard: React.FC = () => (
    <div
        className="card"
        style={{ display: 'flex', gap: 12 }}
        aria-hidden="true"
    >
        <Skeleton width={40} height={40} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={14} width="40%" />
            <Skeleton height={12} width="88%" />
        </div>
    </div>
);
