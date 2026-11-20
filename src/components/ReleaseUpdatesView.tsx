import React, { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Bell, Box, Check, Inbox, Loader2, Plus, RefreshCw, Search, Star, X } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { ReleaseCard } from './ReleaseCard';
import { EmptyState } from './EmptyState';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from './Toast';
import { PLATFORM_OPTIONS } from '../constants/platforms';
import { getLanguageColor } from '../constants/languages';
import { getPlatformIcon } from '../constants/platformIcons';
import { releaseService } from '../services/releaseService';
import { t } from '../locales';
import type { Language } from '../locales';
import type { DetailTab, Release } from '../types';
import { formatCompactNumber, formatRelativeTime as formatRelativeTimeUtil } from '../utils/format';

const ReleaseDetail = lazy(() =>
    import('./ReleaseDetail').then((m) => ({ default: m.ReleaseDetail }))
);

interface ReleaseUpdatesViewProps {
    keyword?: string;
    onOpenRepo?: (repoId: number, tab?: DetailTab) => void;
    onNavigateAll?: () => void;
}

const SubAvatar: React.FC<{ avatarUrl?: string; login: string }> = ({ avatarUrl, login }) => {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [avatarUrl]);

    if (!avatarUrl || failed) {
        return (
            <div
                style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <Box size={15} style={{ color: 'var(--color-text-muted)' }} />
            </div>
        );
    }

    return (
        <img
            src={avatarUrl}
            alt={login}
            width={34}
            height={34}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                flexShrink: 0,
            }}
        />
    );
};

export const ReleaseUpdatesView: React.FC<ReleaseUpdatesViewProps> = ({
    keyword = '',
    onOpenRepo,
    onNavigateAll,
}) => {
    const releases = useStore((state) => state.releases);
    const releaseFilter = useStore((state) => state.releaseFilter);
    const settings = useStore((state) => state.settings);
    const token = useStore((state) => state.token);
    const repositories = useStore((state) => state.repositories);
    const subscribedRepoIds = useStore((state) => state.subscribedRepoIds);
    const checkReleaseUpdates = useStore((state) => state.checkReleaseUpdates);
    const markReleaseRead = useStore((state) => state.markReleaseRead);
    const markAllReleasesRead = useStore((state) => state.markAllReleasesRead);
    const setReleaseFilter = useStore((state) => state.setReleaseFilter);
    const toggleSubscription = useStore((state) => state.toggleSubscription);
    const clearAllSubscriptions = useStore((state) => state.clearAllSubscriptions);

    const releaseCheckStatus = useProgressStore((state) => state.releaseCheckStatus);

    const lang = (settings.language || 'zh') as Language;
    const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
    const [showSubModal, setShowSubModal] = useState(false);
    const [subModalSearch, setSubModalSearch] = useState('');
    const deferredSubModalSearch = useDeferredValue(subModalSearch);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const repositoryMap = useMemo(() => {
        const map = new Map(repositories.map((repo) => [repo.id, repo]));
        return map;
    }, [repositories]);

    const subscribedCount = useMemo(
        () => repositories.reduce((acc, r) => (subscribedRepoIds.has(r.id) ? acc + 1 : acc), 0),
        [repositories, subscribedRepoIds]
    );

    const filteredReleases = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        return releases.filter((release) => {
            if (!subscribedRepoIds.has(release.repository.id)) return false;
            if (releaseFilter.showUnreadOnly && release.isRead) return false;
            if (releaseFilter.platform) {
                const hasAsset = release.assets?.some(
                    (asset) => releaseService.identifyPlatform(asset) === releaseFilter.platform
                );
                if (!hasAsset) return false;
            }
            if (q) {
                const repo = repositoryMap.get(release.repository.id);
                const haystack = [
                    release.repository.fullName,
                    repo?.alias || '',
                    release.tagName || release.tag_name || '',
                    release.name || '',
                    release.body || '',
                ].join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [keyword, releaseFilter.platform, releaseFilter.showUnreadOnly, releases, repositoryMap, subscribedRepoIds]);

    const sortedReleases = useMemo(() => [...filteredReleases].sort(
        (a, b) =>
            new Date(b.publishedAt || b.published_at || '').getTime()
            - new Date(a.publishedAt || a.published_at || '').getTime()
    ), [filteredReleases]);

    const candidateRepos = useMemo(() => {
        const q = deferredSubModalSearch.trim().toLowerCase();
        const matched = q
            ? repositories.filter((repo) =>
                repo.fullName.toLowerCase().includes(q)
                || (repo.alias || '').toLowerCase().includes(q)
                || (repo.description || '').toLowerCase().includes(q)
                || (repo.aiSummary || '').toLowerCase().includes(q)
            )
            : repositories;

        return [...matched].sort((a, b) => {
            const subA = subscribedRepoIds.has(a.id) ? 1 : 0;
            const subB = subscribedRepoIds.has(b.id) ? 1 : 0;
            if (subA !== subB) return subB - subA;
            return b.stargazersCount - a.stargazersCount;
        });
    }, [deferredSubModalSearch, repositories, subscribedRepoIds]);

    const handleCheckUpdates = async () => {
        useProgressStore.getState().patchReleaseCheckStatus({ error: null });
        await checkReleaseUpdates();
        const { error } = useProgressStore.getState().releaseCheckStatus;
        if (error) {
            toast.show(error, { type: 'error', duration: 5000 });
        }
    };

    const handleReleaseClick = (release: Release) => {
        setSelectedRelease(release);
        if (!release.isRead) {
            markReleaseRead(release.id);
        }
    };

    const handleToggleSub = (repoId: number) => {
        const wasSub = subscribedRepoIds.has(repoId);
        toggleSubscription(repoId);
        if (wasSub) {
            toast.show(t('unsubscribed', lang), {
                type: 'info',
                duration: 5000,
                action: {
                    label: t('undo', lang),
                    onClick: () => toggleSubscription(repoId),
                },
            });
        }
    };

    const confirmClearAll = () => {
        clearAllSubscriptions();
        setShowClearConfirm(false);
    };

    const openSubModal = () => {
        setSubModalSearch('');
        setShowSubModal(true);
    };

    return (
        <div className="flex flex-col gap-3.5" style={{ minHeight: sortedReleases.length === 0 ? '100%' : undefined }}>
            {/* 操作栏与平台筛选 */}
            {releaseCheckStatus.checking ? (
                <div className="flex items-center gap-2 text-[var(--color-primary)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-[13px]">{t('checkingUpdates', lang)}</span>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={handleCheckUpdates}
                                disabled={!token || subscribedCount === 0}
                                title={!token ? t('tokenRequiredHint', lang) : subscribedCount === 0 ? t('subscribeRequiredHint', lang) : undefined}
                            >
                                <RefreshCw size={13} />
                                {t('checkUpdates', lang)}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => markAllReleasesRead()}
                                disabled={sortedReleases.length === 0}
                            >
                                {t('markAllRead', lang)}
                            </button>
                            <button
                                type="button"
                                className={`chip${releaseFilter.showUnreadOnly ? ' active' : ''}`}
                                onClick={() => setReleaseFilter({ showUnreadOnly: !releaseFilter.showUnreadOnly })}
                                aria-pressed={releaseFilter.showUnreadOnly}
                            >
                                {t('showUnreadOnly', lang)}
                            </button>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap">
                            {releaseCheckStatus.lastCheckedAt && (
                                <span className="text-[12px] text-[var(--color-text-muted)]">
                                    {t('lastChecked', lang)}: {formatRelativeTimeUtil(releaseCheckStatus.lastCheckedAt, lang)}
                                </span>
                            )}
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={openSubModal}
                            >
                                <Bell size={13} />
                                <span>{t('manageSubscriptions', lang)}</span>
                                <span className="count-pill count-pill-soft" style={{ marginLeft: 0 }}>
                                    {subscribedCount}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* 平台胶囊筛选条 */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            className={`chip${!releaseFilter.platform ? ' active' : ''}`}
                            onClick={() => setReleaseFilter({ platform: null })}
                            aria-pressed={!releaseFilter.platform}
                        >
                            {t('allPlatforms', lang)}
                        </button>
                        {PLATFORM_OPTIONS.map((platform) => {
                            const PlatformIcon = getPlatformIcon(platform.id);
                            const selected = releaseFilter.platform === platform.id;
                            return (
                                <button
                                    key={platform.id}
                                    type="button"
                                    className={`chip${selected ? ' active' : ''}`}
                                    onClick={() => setReleaseFilter({ platform: selected ? null : platform.id })}
                                    aria-pressed={selected}
                                >
                                    <PlatformIcon size={12} />
                                    <span>{platform.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 版本更新列表 */}
            {sortedReleases.length === 0 ? (
                <div style={{ flex: 1 }}>
                    <EmptyState
                        icon={<Inbox size={44} strokeWidth={1.5} />}
                        title={releaseFilter.showUnreadOnly ? t('noUnreadReleases', lang) : t('noReleases', lang)}
                        description={subscribedCount === 0 ? t('noSubscriptionsHint', lang) : t('noReleasesHint', lang)}
                        action={
                            releaseFilter.showUnreadOnly ? (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setReleaseFilter({ showUnreadOnly: false })}
                                >
                                    {t('showAllReleases', lang)}
                                </button>
                            ) : subscribedCount === 0 ? (
                                <div className="flex items-center justify-center gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={openSubModal}
                                    >
                                        <Plus size={14} />
                                        {t('addSubscription', lang)}
                                    </button>
                                    {onNavigateAll && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={onNavigateAll}
                                        >
                                            {t('browseRepos', lang)}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleCheckUpdates}
                                    disabled={!token}
                                >
                                    <RefreshCw size={14} />
                                    {t('checkUpdates', lang)}
                                </button>
                            )
                        }
                    />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sortedReleases.map((release) => (
                        <ReleaseCard
                            key={release.id}
                            release={release}
                            repository={repositoryMap.get(release.repository.id)}
                            lang={lang}
                            onClick={() => handleReleaseClick(release)}
                        />
                    ))}
                </div>
            )}

            {/* 版本详情弹窗 */}
            {selectedRelease && (
                <Suspense
                    fallback={
                        <div className="modal-overlay">
                            <Loader2 size={24} className="animate-spin" style={{ color: 'white' }} />
                        </div>
                    }
                >
                    <ReleaseDetail
                        release={selectedRelease}
                        lang={lang}
                        onClose={() => setSelectedRelease(null)}
                        onOpenRepo={onOpenRepo
                            ? () => onOpenRepo(selectedRelease.repository.id, 'releases')
                            : undefined}
                        token={token || undefined}
                        aiModel={settings.aiModel}
                        aiThinking={!!settings.aiThinking}
                    />
                </Suspense>
            )}

            {/* 订阅管理弹窗（替代原版本追踪页内重复的“订阅管理”Tab） */}
            <Modal
                isOpen={showSubModal}
                onClose={() => setShowSubModal(false)}
                title={`${t('manageSubscriptions', lang)} (${subscribedCount})`}
                width={560}
                footer={
                    subscribedCount > 0 ? (
                        <>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--color-error-text)' }}
                                onClick={() => setShowClearConfirm(true)}
                            >
                                {t('unsubscribeAll', lang)}
                            </button>
                            <div style={{ flex: 1 }} />
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => setShowSubModal(false)}
                            >
                                {t('commonClose', lang)}
                            </button>
                        </>
                    ) : undefined
                }
            >
                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <Search
                            size={14}
                            style={{
                                position: 'absolute',
                                left: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--color-text-muted)',
                            }}
                        />
                        <input
                            type="text"
                            className="input"
                            style={{ padding: '7px 30px 7px 32px', fontSize: 13 }}
                            value={subModalSearch}
                            onChange={(e) => setSubModalSearch(e.target.value)}
                            placeholder={t('searchReposToSubscribe', lang)}
                        />
                        {subModalSearch && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{
                                    position: 'absolute',
                                    right: 4,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    padding: 2,
                                }}
                                onClick={() => setSubModalSearch('')}
                                aria-label={t('clearFilter', lang)}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {repositories.length === 0 ? (
                        <p className="text-[13px] text-[var(--color-text-muted)] text-center py-6">
                            {t('noRepos', lang)}
                        </p>
                    ) : candidateRepos.length === 0 ? (
                        <p className="text-[13px] text-[var(--color-text-muted)] text-center py-6">
                            {t('noResults', lang)}
                        </p>
                    ) : (
                        <div style={{ maxHeight: 330, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {candidateRepos.slice(0, 60).map((repo) => {
                                const isSub = subscribedRepoIds.has(repo.id);
                                const langColor = repo.language ? getLanguageColor(repo.language) : null;
                                return (
                                    <div
                                        key={repo.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 10px',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-surface-secondary)',
                                        }}
                                    >
                                        <SubAvatar avatarUrl={repo.owner.avatarUrl} login={repo.owner.login} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                <span style={{
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    color: 'var(--color-text-primary)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {repo.alias || repo.name}
                                                </span>
                                                <span style={{
                                                    fontSize: 11,
                                                    color: 'var(--color-text-muted)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {repo.fullName}
                                                </span>
                                            </div>
                                            <p style={{
                                                fontSize: 12,
                                                color: 'var(--color-text-secondary)',
                                                margin: '2px 0',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {repo.aiSummary || repo.description || t('noDescription', lang)}
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                {repo.language && langColor && (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <span className="lang-dot" style={{ width: 7, height: 7, backgroundColor: langColor }} />
                                                        {repo.language}
                                                    </span>
                                                )}
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                                    <Star size={11} style={{ color: 'var(--color-accent)' }} />
                                                    {formatCompactNumber(repo.stargazersCount)}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className={`btn btn-sm ${isSub ? 'btn-secondary' : 'btn-primary'}`}
                                            style={{ flexShrink: 0 }}
                                            onClick={() => handleToggleSub(repo.id)}
                                        >
                                            {isSub ? (
                                                <>
                                                    <Check size={13} />
                                                    {t('subscribedLabel', lang)}
                                                </>
                                            ) : (
                                                <>
                                                    <Plus size={13} />
                                                    {t('subscribe', lang)}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Modal>

            {/* 全部取消订阅确认弹窗 */}
            <ConfirmDialog
                isOpen={showClearConfirm}
                title={t('unsubscribeConfirm', lang)}
                message={t('unsubscribeConfirmDesc', lang, { count: subscribedCount })}
                confirmText={t('confirm', lang)}
                cancelText={t('cancel', lang)}
                variant="danger"
                onConfirm={confirmClearAll}
                onCancel={() => setShowClearConfirm(false)}
            />
        </div>
    );
};
