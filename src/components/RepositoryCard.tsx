import React, { memo, useCallback, useMemo } from 'react';
import type { Repository } from '../types';
import { Star, GitFork, ExternalLink } from 'lucide-react';
import { getLanguageColor } from '../constants/languages';

interface RepositoryCardProps {
    repo: Repository;
    onClick: (repo: Repository) => void;
    language: 'zh' | 'en';
}

function formatNumber(num: number): string {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return String(num);
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
 *
 * 注意：父组件必须使用 useCallback 稳定 onClick 引用
 * @example
 * const handleClick = useCallback((repo) => { ... }, []);
 * <RepositoryCard repo={repo} onClick={handleClick} language="zh" />
 */
export const RepositoryCard = memo<RepositoryCardProps>(({ repo, onClick, language }) => {
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
        <div className="card cursor-pointer animate-fade-in" onClick={handleClick}>
            <div style={{ display: 'flex', gap: '12px' }}>
                {/* 头像 */}
                <img
                    src={repo.owner.avatarUrl}
                    alt={repo.owner.login}
                    style={{
                        width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                        border: '1px solid var(--color-border)',
                    }}
                    loading="lazy"
                />

                {/* 内容 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 标题行 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <h3 style={{
                                fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {displayName}
                            </h3>
                            {repo.alias && (
                                <span style={{
                                    fontSize: 11, color: 'var(--color-text-muted)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {repo.fullName}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 8 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                <Star size={14} style={{ color: 'var(--color-accent)' }} />
                                {formatNumber(repo.stargazersCount)}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                <GitFork size={14} />
                                {formatNumber(repo.forksCount)}
                            </span>
                        </div>
                    </div>

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
                </div>
            </div>
        </div>
    );
});

RepositoryCard.displayName = 'RepositoryCard';
