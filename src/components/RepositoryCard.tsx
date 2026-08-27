import React, { memo, useCallback, useMemo } from 'react';
import type { Repository } from '../types';
import { RepoRow } from './RepoRow';
import { getLanguageColor } from '../constants/languages';

interface RepositoryCardProps {
    repo: Repository;
    onClick: (repo: Repository) => void;
    language: 'zh' | 'en';
    isActive?: boolean;
}

function timeAgo(dateStr: string, lang: 'zh' | 'en'): string {
    const now = Date.now();
    const diff = now - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return lang === 'zh' ? '今天' : 'today';
    if (days === 1) return lang === 'zh' ? '昨天' : 'yesterday';
    if (days < 30) return lang === 'zh' ? `${days} 天前` : `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return lang === 'zh' ? `${months} 个月前` : `${months}mo ago`;
    const years = Math.floor(months / 12);
    return lang === 'zh' ? `${years} 年前` : `${years}y ago`;
}

/**
 * 仓库卡片组件
 * @since v1.7.0 - 添加 memo 优化，减少不必要的重渲染
 * @since 阶段8 - 头部收敛到 RepoRow；移除逐卡片入场动画（页面级动画见 App.tsx）；密度 .card-compact
 *
 * 注意：父组件必须使用 useCallback 稳定 onClick 引用
 * @example
 * const handleClick = useCallback((repo) => { ... }, []);
 * <RepositoryCard repo={repo} onClick={handleClick} language="zh" />
 */
export const RepositoryCard = memo<RepositoryCardProps>(({ repo, onClick, language, isActive = false }) => {
    // 使用 useMemo 缓存计算结果
    const displayName = useMemo(() => repo.alias || repo.name, [repo.alias, repo.name]);

    const allTags = useMemo(() => [
        ...(repo.aiTags || []),
        ...(repo.customTags || []),
    ].slice(0, 4), [repo.aiTags, repo.customTags]);

    const description = useMemo(() =>
        repo.aiSummary || repo.description || (language === 'zh' ? '暂无描述' : 'No description'),
        [repo.aiSummary, repo.description, language]
    );

    const languageColor = useMemo(() =>
        repo.language ? getLanguageColor(repo.language) : null,
        [repo.language]
    );

    // 使用 useCallback 稳定事件处理
    const handleClick = useCallback(() => {
        onClick(repo);
    }, [onClick, repo]);

    return (
        <div
            className="card card-compact cursor-pointer"
            onClick={handleClick}
            style={isActive ? {
                borderColor: 'var(--color-primary)',
                boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent), var(--shadow-sm)',
                transform: 'translateY(-1px)',
            } : undefined}
        >
            <RepoRow
                avatarUrl={repo.owner.avatarUrl}
                ownerLogin={repo.owner.login}
                displayName={displayName}
                secondaryName={repo.alias ? repo.fullName : undefined}
                stars={repo.stargazersCount}
                forks={repo.forksCount}
            >
                {/* 描述 */}
                <p style={{
                    fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    marginBottom: 8,
                }}>
                    {description}
                </p>

                {/* 底部信息 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* 语言 */}
                    {repo.language && languageColor && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            <span className="lang-dot" style={{ backgroundColor: languageColor }} />
                            {repo.language}
                        </span>
                    )}

                    {/* Tags */}
                    {allTags.map((tag, i) => (
                        <span key={i} className="tag" onClick={(e) => e.stopPropagation()}>
                            {tag}
                        </span>
                    ))}

                    {/* 更新时间 */}
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                        {timeAgo(repo.updatedAt, language)}
                    </span>
                </div>
            </RepoRow>
        </div>
    );
});

RepositoryCard.displayName = 'RepositoryCard';
