import React, { memo, useMemo, useCallback } from 'react';
import { Release, Repository } from '../types';
import { releaseService } from '../services/releaseService';
import { t } from '../locales';
import type { Language } from '../locales';
import { Star, GitFork, Box } from 'lucide-react';
import { getLanguageColor } from '../constants/languages';

function formatNumber(num: number): string {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return String(num);
}

interface ReleaseCardProps {
    release: Release;
    repository?: Repository;
    lang: Language;
    onClick?: () => void;
}

/**
 * Release 卡片组件
 * @since v1.7.0 - 添加 memo 优化
 */
export const ReleaseCard = memo<ReleaseCardProps>(({ release, repository, lang, onClick }) => {
    const isUnread = !release.isRead;

    // 使用 useMemo 缓存计算结果
    const platformGroups = useMemo(() =>
        releaseService.groupAssetsByPlatform(release.assets || []),
        [release.assets]
    );

    const tagName = useMemo(() =>
        release.tagName || release.tag_name,
        [release.tagName, release.tag_name]
    );

    const publishedAt = useMemo(() =>
        release.publishedAt || release.published_at,
        [release.publishedAt, release.published_at]
    );

    const displayName = useMemo(() =>
        repository?.alias || release.repository.name,
        [repository?.alias, release.repository.name]
    );

    const cardStyle = useMemo(() => ({
        borderColor: isUnread ? 'var(--color-primary)' : undefined,
        position: 'relative' as const,
        overflow: 'hidden' as const
    }), [isUnread]);

    const languageColor = useMemo(() =>
        repository?.language ? getLanguageColor(repository.language) : null,
        [repository?.language]
    );

    const formattedDate = useMemo(() =>
        releaseService.formatDate(publishedAt || '', lang),
        [publishedAt, lang]
    );

    const platformEntries = useMemo(() =>
        Array.from(platformGroups.entries()).slice(0, 4),
        [platformGroups]
    );

    return (
        <div
            className="card cursor-pointer animate-fade-in"
            onClick={onClick}
            style={cardStyle}
        >
            {isUnread && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', backgroundColor: 'var(--color-primary)' }} />
            )}
            <div style={{ display: 'flex', gap: 12 }}>
                {/* 左侧头像 */}
                {repository ? (
                    <img
                        src={repository.owner.avatarUrl}
                        alt={repository.owner.login}
                        style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, border: '1px solid var(--color-border)' }}
                        loading="lazy"
                    />
                ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: 'var(--color-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box size={20} style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                )}

                {/* 右侧内容 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 标题行 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <h3 style={{
                                fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                                {displayName}
                            </h3>
                            <span style={{
                                fontSize: 12, color: 'var(--color-text-muted)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                                {release.repository.fullName}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 8 }}>
                            {repository && (
                                <>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                        <Star size={14} style={{ color: 'var(--color-accent)' }} />
                                        {formatNumber(repository.stargazersCount)}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                        <GitFork size={14} />
                                        {formatNumber(repository.forksCount)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 描述 / Release Name */}
                    {release.name && (
                        <p style={{
                            fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                            marginBottom: 8
                        }}>
                            {release.name}
                        </p>
                    )}

                    {/* 底部信息 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: release.name ? 0 : 4 }}>
                        {/* 语言 */}
                        {repository?.language && languageColor && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                <span className="lang-dot" style={{ backgroundColor: languageColor, width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                                {repository.language}
                            </span>
                        )}

                        {/* 🆕 v1.6.0 NEW 标识 */}
                        {isUnread && (
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: '#fff',
                                    background: 'linear-gradient(135deg, var(--color-new-badge-start), var(--color-new-badge-end))',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: '0.5px',
                                    boxShadow: '0 1px 3px rgba(238, 90, 36, 0.3)',
                                    animation: 'badge-pulse 2s ease-in-out infinite',
                                }}
                                aria-label={lang === 'zh' ? '未读新版本' : 'Unread new release'}
                                title={lang === 'zh' ? '未读新版本' : 'Unread new release'}
                            >
                                NEW
                            </span>
                        )}

                        {/* 版本号 Tag */}
                        <span className="tag" style={{ padding: '0 6px', fontSize: 11, fontFamily: 'monospace', color: 'var(--color-primary)', borderColor: 'var(--color-primary-light)' }}>
                            {tagName}
                        </span>

                        {/* 平台资产标签 */}
                        {platformEntries.map(([platform, assets]) => (
                            <span key={platform} className="tag" style={{ padding: '0 6px', fontSize: 11 }}>
                                <span style={{ marginRight: 2, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                    {releaseService.getPlatformIcon(platform)}
                                </span>
                                {assets.length}
                            </span>
                        ))}
                        {platformGroups.size > 4 && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                +{platformGroups.size - 4}
                            </span>
                        )}

                        {(!release.assets || release.assets.length === 0) && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                {t('noAssets', lang)}
                            </span>
                        )}

                        {/* 右下时间 */}
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                            {t('publishedAt', lang)}: {formattedDate}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

ReleaseCard.displayName = 'ReleaseCard';
