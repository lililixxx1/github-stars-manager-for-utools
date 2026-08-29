import React from 'react';
import { Star, GitFork, Box } from 'lucide-react';

function formatNumber(num: number): string {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return String(num);
}

interface RepoRowProps {
    /** 头像地址；缺省渲染 Box 占位块（ReleaseCard 无仓库数据时） */
    avatarUrl?: string;
    /** 头像 alt（owner login） */
    ownerLogin?: string;
    /** 主标题（别名优先显示，由调用方决定） */
    displayName: string;
    /** 标题旁浅色副标题（fullName）；不传不渲染 */
    secondaryName?: string;
    /** Star 数；与 forks 同时缺省时整组统计隐藏 */
    stars?: number;
    /** Fork 数 */
    forks?: number;
    /** 标题行下方的自定义内容（描述 / 底部信息），渲染在内容列内 */
    children?: React.ReactNode;
}

/**
 * 仓库行头部（阶段8 共享组件）
 *
 * 头像 + 名称/副标题 + Star/Fork 统计的通用卡片头部，
 * 供 RepositoryCard 与 ReleaseCard 复用；差异部分走 props 与 children 插槽。
 *
 * @example
 * <RepoRow
 *     avatarUrl={repo.owner.avatarUrl}
 *     ownerLogin={repo.owner.login}
 *     displayName={repo.alias || repo.name}
 *     secondaryName={repo.alias ? repo.fullName : undefined}
 *     stars={repo.stargazersCount}
 *     forks={repo.forksCount}
 * >
 *     <p>描述</p>
 * </RepoRow>
 */
export const RepoRow: React.FC<RepoRowProps> = ({
    avatarUrl,
    ownerLogin,
    displayName,
    secondaryName,
    stars,
    forks,
    children,
}) => (
    <div style={{ display: 'flex', gap: 12 }}>
        {avatarUrl ? (
            <img
                src={avatarUrl}
                alt={ownerLogin}
                style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    border: '1px solid var(--color-border)',
                }}
                loading="lazy"
            />
        ) : (
            <div style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: 'var(--color-surface-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Box size={20} style={{ color: 'var(--color-text-muted)' }} />
            </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
            {/* 标题行：名称 + 副标题 + 统计 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <h3 style={{
                        fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {displayName}
                    </h3>
                    {secondaryName && (
                        <span style={{
                            fontSize: 11, color: 'var(--color-text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {secondaryName}
                        </span>
                    )}
                </div>
                {stars !== undefined && forks !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                            <Star size={14} style={{ color: 'var(--color-accent)' }} />
                            {formatNumber(stars)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                            <GitFork size={14} />
                            {formatNumber(forks)}
                        </span>
                    </div>
                )}
            </div>
            {children}
        </div>
    </div>
);
