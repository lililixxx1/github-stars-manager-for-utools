import React, { memo, useMemo } from 'react';
import { Release, Repository } from '../types';
import { releaseService } from '../services/releaseService';
import { t } from '../locales';
import type { Language } from '../locales';
import { RepoRow } from './RepoRow';
import { getLanguageColor } from '../constants/languages';
import { getPlatformIcon } from '../constants/platformIcons';

interface ReleaseCardProps {
    release: Release;
    repository?: Repository;
    lang: Language;
    onClick?: () => void;
}

/**
 * Release 卡片组件
 * @since v1.7.0 - 添加 memo 优化
 * @since 阶段8 - 头部收敛到 RepoRow；移除逐卡片入场动画；密度 .card-compact
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
            className="card card-compact cursor-pointer"
            onClick={onClick}
            style={cardStyle}
        >
            {isUnread && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', backgroundColor: 'var(--color-primary)' }} />
            )}
            <RepoRow
                avatarUrl={repository?.owner.avatarUrl}
                ownerLogin={repository?.owner.login}
                displayName={displayName}
                secondaryName={release.repository.fullName}
                stars={repository?.stargazersCount}
                forks={repository?.forksCount}
            >
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

                    {/* 🆕 v1.6.0 NEW 标识（配色沿用 NEW 徽章渐变 token） */}
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
                                boxShadow: '0 1px 3px color-mix(in srgb, var(--color-new-badge-end) 40%, transparent)',
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
                    {platformEntries.map(([platform, assets]) => {
                        const PlatformIcon = getPlatformIcon(platform);
                        return (
                            <span key={platform} className="tag" style={{ padding: '0 6px', fontSize: 11 }}>
                                <span style={{ marginRight: 2, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                    <PlatformIcon size={11} />
                                </span>
                                {assets.length}
                            </span>
                        );
                    })}
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
            </RepoRow>
        </div>
    );
});

ReleaseCard.displayName = 'ReleaseCard';
