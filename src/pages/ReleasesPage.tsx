import { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';
import { Bell, BellOff, Box, Check, ExternalLink, Inbox, Loader2, Plus, RefreshCw, Search, Star, X } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { ReleaseCard } from '../components/ReleaseCard';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';

const ReleaseDetail = lazy(() =>
    import('../components/ReleaseDetail').then((m) => ({ default: m.ReleaseDetail }))
);
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toast';
import { PLATFORM_OPTIONS } from '../constants/platforms';
import { getLanguageColor } from '../constants/languages';
import { getPlatformIcon } from '../constants/platformIcons';
import { releaseService } from '../services/releaseService';
import { t } from '../locales';
import type { Language } from '../locales';
import type { Release, Repository } from '../types';
import { useBackShortcut } from '../hooks/useBackShortcut';
import { PageHeader } from '../components/ui/PageHeader';
import { formatCompactNumber, formatRelativeTime as formatRelativeTimeUtil } from '../utils/format';

type TabType = 'updates' | 'subscriptions';

// 格式化 Star 数（复用全局紧凑数字格式化）
export const formatStars = (count: number): string => formatCompactNumber(count);

const SubAvatar: React.FC<{ avatarUrl?: string; login: string }> = ({ avatarUrl, login }) => {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [avatarUrl]);

    if (!avatarUrl || failed) {
        return (
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <Box size={16} style={{ color: 'var(--color-text-muted)' }} />
            </div>
        );
    }

    return (
        <img
            src={avatarUrl}
            alt={login}
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                flexShrink: 0,
            }}
        />
    );
};

export function ReleasesPage() {
    // 精确订阅（阶段2 性能重构）
    const releases = useStore((state) => state.releases);
    const releaseFilter = useStore((state) => state.releaseFilter);
    const settings = useStore((state) => state.settings);
    const token = useStore((state) => state.token);  // 🆕 v1.6.0 用于翻译功能
    const checkReleaseUpdates = useStore((state) => state.checkReleaseUpdates);
    const markReleaseRead = useStore((state) => state.markReleaseRead);
    const markAllReleasesRead = useStore((state) => state.markAllReleasesRead);
    const setReleaseFilter = useStore((state) => state.setReleaseFilter);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const setSelectedRepoId = useStore((state) => state.setSelectedRepoId);
    const toggleSubscription = useStore((state) => state.toggleSubscription);
    const clearAllSubscriptions = useStore((state) => state.clearAllSubscriptions);
    const releasesInitialTab = useStore((state) => state.releasesInitialTab);
    const setReleasesInitialTab = useStore((state) => state.setReleasesInitialTab);
    // 阶段3：Tab 持久化迁移到 settings（走既有 saveSettings 路径，删除 localStorage 用法）
    const saveSettings = useStore((state) => state.saveSettings);

    // 版本检查状态来自独立的 progress store
    const releaseCheckStatus = useProgressStore((state) => state.releaseCheckStatus);

    // 订阅 repositories 状态以触发响应式更新
    const repositories = useStore((state) => state.repositories);
    // 订阅单源：内存 subscribedRepoIds（阶段3 起不渲染期直读存储表）
    const subscribedRepoIds = useStore((state) => state.subscribedRepoIds);

    const lang = (settings.language || 'zh') as Language;
    const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        // 初始 Tab 优先级：跳转指定 > 上次停留（settings.lastReleasesTab）> 默认 updates
        return releasesInitialTab || useStore.getState().settings.lastReleasesTab || 'updates';
    });
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [subSearch, setSubSearch] = useState('');
    const [showAddSubModal, setShowAddSubModal] = useState(false);
    const [addSubSearch, setAddSubSearch] = useState('');

    useEffect(() => {
        if (releasesInitialTab) {
            setReleasesInitialTab(undefined);
        }
    }, [releasesInitialTab, setReleasesInitialTab]);

    const handleBack = useCallback(() => {
        setCurrentPage('home');
    }, [setCurrentPage]);

    // 如果加载后 releases 为空但 newCount > 0，重置 badge 避免误导
    useEffect(() => {
        if (releases.length === 0 && releaseCheckStatus.newCount > 0 && !releaseCheckStatus.checking) {
            useProgressStore.getState().patchReleaseCheckStatus({ newCount: 0 });
        }
    }, [releases.length, releaseCheckStatus.newCount, releaseCheckStatus.checking]);

    // 保存 Tab 状态（阶段3：走 settings 持久化）
    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        saveSettings({ lastReleasesTab: tab });
    };

    useBackShortcut({
        onBack: handleBack,
        beforeBack: () => {
            if (selectedRelease) {
                setSelectedRelease(null);
                return true;
            }

            if (showAddSubModal) {
                setShowAddSubModal(false);
                return true;
            }

            if (showConfirmDialog) {
                setShowConfirmDialog(false);
                return true;
            }

            return false;
        },
        deps: [handleBack, selectedRelease, showAddSubModal, showConfirmDialog],
    });

    // 筛选版本（阶段3：useMemo 化 + 订阅单源，去除渲染期存储读）
    const filteredReleases = useMemo(() => releases.filter((release) => {
        // 🆕 v1.6.0: 只显示仍处于订阅状态仓库的 Release（隐藏取消订阅后的"幽灵"卡片）
        if (!subscribedRepoIds.has(release.repository.id)) {
            return false;
        }

        if (releaseFilter.showUnreadOnly && release.isRead) {
            return false;
        }
        if (releaseFilter.platform) {
            const hasAsset = release.assets?.some(
                (a) => releaseService.identifyPlatform(a) === releaseFilter.platform
            );
            if (!hasAsset) return false;
        }
        return true;
    }), [releases, releaseFilter, subscribedRepoIds]);

    // 排序也 memo 化：发布时间比较只在这份数据变化时执行
    const sortedReleases = useMemo(() => [...filteredReleases].sort(
        (a, b) => new Date(b.publishedAt || b.published_at || '').getTime() - new Date(a.publishedAt || a.published_at || '').getTime()
    ), [filteredReleases]);

    // 使用 useMemo 构建仓库 Map，避免重复查找
    const repositoryMap = useMemo(() => {
        const map = new Map<number, Repository>();
        repositories.forEach(r => map.set(r.id, r));
        return map;
    }, [repositories]);

    // 使用 useMemo 计算已订阅仓库（订阅单源派生，响应式更新）
    const subscribedRepos = useMemo(() => {
        return repositories.filter(r => subscribedRepoIds.has(r.id));
    }, [repositories, subscribedRepoIds]);

    const unreadCount = useMemo(
        () => releases.filter((r) => !r.isRead && subscribedRepoIds.has(r.repository.id)).length,
        [releases, subscribedRepoIds]
    );

    const latestReleaseByRepoId = useMemo(() => {
        const map = new Map<number, Release>();
        for (const release of releases) {
            const repoId = release.repository.id;
            const ts = new Date(release.publishedAt || release.published_at || '').getTime() || 0;
            const existing = map.get(repoId);
            const existingTs = existing
                ? (new Date(existing.publishedAt || existing.published_at || '').getTime() || 0)
                : -Infinity;
            if (!existing || ts > existingTs) {
                map.set(repoId, release);
            }
        }
        return map;
    }, [releases]);

    const unreadSubRepoCount = useMemo(
        () => subscribedRepos.filter((repo) => {
            const latest = latestReleaseByRepoId.get(repo.id);
            return Boolean(latest && !latest.isRead);
        }).length,
        [subscribedRepos, latestReleaseByRepoId]
    );

    const filteredSubscribedRepos = useMemo(() => {
        const q = subSearch.trim().toLowerCase();
        const matched = q
            ? subscribedRepos.filter((repo) =>
                repo.fullName.toLowerCase().includes(q)
                || (repo.alias || '').toLowerCase().includes(q)
                || (repo.description || '').toLowerCase().includes(q)
                || (repo.aiSummary || '').toLowerCase().includes(q)
                || (repo.language || '').toLowerCase().includes(q)
            )
            : subscribedRepos;

        return [...matched].sort((a, b) => {
            const relA = latestReleaseByRepoId.get(a.id);
            const relB = latestReleaseByRepoId.get(b.id);
            const unreadA = relA && !relA.isRead ? 1 : 0;
            const unreadB = relB && !relB.isRead ? 1 : 0;
            if (unreadA !== unreadB) return unreadB - unreadA;

            const tsA = new Date(relA?.publishedAt || relA?.published_at || a.pushedAt || '').getTime() || 0;
            const tsB = new Date(relB?.publishedAt || relB?.published_at || b.pushedAt || '').getTime() || 0;
            if (tsA !== tsB) return tsB - tsA;

            return b.stargazersCount - a.stargazersCount;
        });
    }, [subscribedRepos, subSearch, latestReleaseByRepoId]);

    const candidateSubscribeRepos = useMemo(() => {
        const q = addSubSearch.trim().toLowerCase();
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
            if (subA !== subB) return subA - subB;
            return b.stargazersCount - a.stargazersCount;
        });
    }, [repositories, addSubSearch, subscribedRepoIds]);

    const handleCheckUpdates = async () => {
        // 先清上次残留错误：checkReleaseUpdates 在 guard 早退路径（checking/!token/无订阅）不触碰 error，
        // 若上次失败残留，本次早退会读到旧值误报 toast
        useProgressStore.getState().patchReleaseCheckStatus({ error: null });
        await checkReleaseUpdates();
        const { error } = useProgressStore.getState().releaseCheckStatus;
        if (error) {
            toast.show(error, { type: 'error', duration: 5000 });
        }
    };

    const handleMarkAllRead = () => {
        markAllReleasesRead();
    };

    const handleReleaseClick = (release: Release) => {
        setSelectedRelease(release);
        if (!release.isRead) {
            markReleaseRead(release.id);
        }
    };

    // 取消订阅（v2：全局 toast + 5 秒撤销）
    const handleUnsubscribe = (repo: Repository) => {
        // 立即更新 UI（store 统一维护 dbStorage + 内存订阅单源 + repositories.isSubscribed）
        toggleSubscription(repo.id);
        toast.show(t('unsubscribed', lang), {
            type: 'info',
            duration: 5000,
            action: {
                label: t('undo', lang),
                onClick: () => toggleSubscription(repo.id),
            },
        });
    };

    // 全部取消订阅
    const handleClearAll = () => {
        setShowConfirmDialog(true);
    };

    const confirmClearAll = () => {
        clearAllSubscriptions();
        setShowConfirmDialog(false);
    };

    // 格式化相对时间
    const formatRelativeTime = (dateString: string) => formatRelativeTimeUtil(dateString, lang);

    return (
        <div className="flex flex-col h-full">
            <PageHeader
                title={t('releases', lang)}
                backLabel={t('back', lang)}
                onBack={handleBack}
                right={
                    releaseCheckStatus.newCount > 0 && activeTab === 'updates' ? (
                        <Badge variant="default">
                            {releaseCheckStatus.newCount} {t('newReleases', lang)}
                        </Badge>
                    ) : undefined
                }
            />

            {/* 独立 Tab 栏：分段控件 */}
            <div className="px-5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between gap-2 flex-wrap">
                <div className="segmented w-fit">
                    <button
                        type="button"
                        className={`segmented-item${activeTab === 'updates' ? ' active' : ''}`}
                        style={{ padding: '4px 16px' }}
                        onClick={() => handleTabChange('updates')}
                        aria-pressed={activeTab === 'updates'}
                    >
                        {t('versionUpdates', lang)}
                        {unreadCount > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.2 text-[11px] rounded-full bg-[var(--color-primary)] text-white">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        className={`segmented-item${activeTab === 'subscriptions' ? ' active' : ''}`}
                        style={{ padding: '4px 16px' }}
                        onClick={() => handleTabChange('subscriptions')}
                        aria-pressed={activeTab === 'subscriptions'}
                    >
                        {t('subscriptionManage', lang)}
                        {subscribedRepos.length > 0 && (
                            <span className="ml-1.5 opacity-70">{subscribedRepos.length}</span>
                        )}
                    </button>
                </div>
                {releaseCheckStatus.lastCheckedAt && (
                    <span className="text-[12px] text-[var(--color-text-muted)] shrink-0">
                        {t('lastChecked', lang)}: {formatRelativeTime(releaseCheckStatus.lastCheckedAt)}
                    </span>
                )}
            </div>

            {/* 包含过滤器、统计信息以及主列表的滚动内容区 */}
            <div className="flex-1 overflow-y-auto p-5">
                {activeTab === 'updates' ? (
                    <div className="flex flex-col gap-4" style={{ minHeight: sortedReleases.length === 0 ? '100%' : undefined }}>
                        {releaseCheckStatus.checking ? (
                            <div className="flex items-center gap-2 text-[var(--color-primary)]">
                                <Loader2 size={14} className="animate-spin" />
                                <span className="text-[13px]">{t('checkingUpdates', lang)}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex gap-2">
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={handleCheckUpdates}
                                            disabled={!token || subscribedRepos.length === 0}
                                            title={!token ? t('tokenRequiredHint', lang) : subscribedRepos.length === 0 ? t('subscribeRequiredHint', lang) : undefined}
                                        >
                                            <RefreshCw size={14} />
                                            {t('checkUpdates', lang)}
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={handleMarkAllRead}
                                            disabled={sortedReleases.length === 0}
                                        >
                                            {t('markAllRead', lang)}
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        className={`chip${releaseFilter.showUnreadOnly ? ' active' : ''}`}
                                        onClick={() => setReleaseFilter({ showUnreadOnly: !releaseFilter.showUnreadOnly })}
                                        aria-pressed={releaseFilter.showUnreadOnly}
                                    >
                                        {t('showUnreadOnly', lang)}
                                    </button>
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
                                    icon={<Inbox size={48} strokeWidth={1.5} />}
                                    title={releaseFilter.showUnreadOnly ? t('noUnreadReleases', lang) : t('noReleases', lang)}
                                    description={t('noReleasesHint', lang)}
                                    action={
                                        // action 按优先级：只看未读筛选空 → 一键恢复全部；
                                        // 未订阅 → 去浏览仓库（复用订阅 Tab 空态模式）；已订阅未检查 → 引导检查更新
                                        releaseFilter.showUnreadOnly ? (
                                            <button className="btn btn-primary" onClick={() => setReleaseFilter({ showUnreadOnly: false })}>
                                                {t('showAllReleases', lang)}
                                            </button>
                                        ) : subscribedRepos.length === 0 ? (
                                            <button className="btn btn-primary" onClick={() => setCurrentPage('home')}>
                                                {t('browseRepos', lang)}
                                            </button>
                                        ) : (
                                            <button className="btn btn-primary" onClick={handleCheckUpdates} disabled={!token}>
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
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: subscribedRepos.length === 0 ? '100%' : undefined }}>
                        {/* 订阅管理操作栏与统计 */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="relative flex-1 min-w-[180px] max-w-[300px]">
                                    <Search
                                        size={13}
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
                                        style={{ padding: '5px 28px 5px 30px', fontSize: 12 }}
                                        value={subSearch}
                                        onChange={(e) => setSubSearch(e.target.value)}
                                        placeholder={t('searchSubscriptionsPlaceholder', lang)}
                                    />
                                    {subSearch && (
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
                                            onClick={() => setSubSearch('')}
                                            aria-label={t('clearFilter', lang)}
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() => {
                                            setAddSubSearch('');
                                            setShowAddSubModal(true);
                                        }}
                                    >
                                        <Plus size={13} />
                                        {t('addSubscription', lang)}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={handleCheckUpdates}
                                        disabled={!token || subscribedRepos.length === 0 || releaseCheckStatus.checking}
                                        title={!token ? t('tokenRequiredHint', lang) : subscribedRepos.length === 0 ? t('subscribeRequiredHint', lang) : undefined}
                                    >
                                        <RefreshCw size={13} className={releaseCheckStatus.checking ? 'animate-spin' : ''} />
                                        {releaseCheckStatus.checking ? t('checkingUpdates', lang) : t('checkUpdates', lang)}
                                    </button>
                                    {subscribedRepos.length > 0 && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            style={{ color: 'var(--color-error-text)' }}
                                            onClick={handleClearAll}
                                        >
                                            {t('unsubscribeAll', lang)}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
                                <span>{t('subscribedCount', lang, { count: subscribedRepos.length })}</span>
                                {unreadSubRepoCount > 0 && (
                                    <>
                                        <span>·</span>
                                        <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
                                            {t('subscriptionUnreadSummary', lang, { count: unreadSubRepoCount })}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* 订阅管理列表 */}
                        {subscribedRepos.length === 0 ? (
                            <div style={{ flex: 1 }}>
                                <EmptyState
                                    icon={<Bell size={48} strokeWidth={1.5} />}
                                    title={t('noSubscriptions', lang)}
                                    description={t('noSubscriptionsHint', lang)}
                                    action={
                                        <div className="flex items-center gap-2 justify-center">
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={() => {
                                                    setAddSubSearch('');
                                                    setShowAddSubModal(true);
                                                }}
                                            >
                                                <Plus size={14} />
                                                {t('addSubscription', lang)}
                                            </button>
                                            <button type="button" className="btn btn-secondary" onClick={() => setCurrentPage('home')}>
                                                {t('browseRepos', lang)}
                                            </button>
                                        </div>
                                    }
                                />
                            </div>
                        ) : filteredSubscribedRepos.length === 0 ? (
                            <div style={{ flex: 1 }}>
                                <EmptyState
                                    icon={<Search size={40} strokeWidth={1.5} />}
                                    title={t('noMatchingSubscriptions', lang)}
                                    action={
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSubSearch('')}>
                                            {t('clearFilter', lang)}
                                        </button>
                                    }
                                />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {filteredSubscribedRepos.map((repo) => {
                                    const latestRelease = latestReleaseByRepoId.get(repo.id);
                                    const langColor = repo.language ? getLanguageColor(repo.language) : null;
                                    const releaseTime = latestRelease
                                        ? (latestRelease.publishedAt || latestRelease.published_at || '')
                                        : '';

                                    return (
                                        <div
                                            key={repo.id}
                                            className="card card-compact card-interactive"
                                            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                                            onClick={() => {
                                                setSelectedRepoId(repo.id);
                                                setCurrentPage('detail');
                                            }}
                                        >
                                            <SubAvatar avatarUrl={repo.owner.avatarUrl} login={repo.owner.login} />

                                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        fontSize: 14,
                                                        fontWeight: 600,
                                                        color: 'var(--color-text-primary)',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {repo.alias || repo.name}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 12,
                                                        color: 'var(--color-text-muted)',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {repo.fullName}
                                                    </span>
                                                    {latestRelease ? (
                                                        <button
                                                            type="button"
                                                            className="tag"
                                                            style={{
                                                                padding: '1px 7px',
                                                                fontSize: 11,
                                                                fontFamily: 'monospace',
                                                                color: 'var(--color-primary-dark)',
                                                                borderColor: !latestRelease.isRead
                                                                    ? 'var(--color-primary)'
                                                                    : 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
                                                                background: !latestRelease.isRead
                                                                    ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                                                                    : undefined,
                                                                gap: 5,
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReleaseClick(latestRelease);
                                                            }}
                                                            title={latestRelease.name || latestRelease.tagName || latestRelease.tag_name}
                                                        >
                                                            {!latestRelease.isRead && <span className="unread-dot" />}
                                                            <span>{latestRelease.tagName || latestRelease.tag_name}</span>
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                            {t('noReleaseYet', lang)}
                                                        </span>
                                                    )}
                                                </div>

                                                <p style={{
                                                    fontSize: 12,
                                                    color: 'var(--color-text-secondary)',
                                                    margin: 0,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {repo.aiSummary || repo.description || t('noDescription', lang)}
                                                </p>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                                                    {repo.language && langColor && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-secondary)' }}>
                                                            <span className="lang-dot" style={{ width: 8, height: 8, backgroundColor: langColor }} />
                                                            {repo.language}
                                                        </span>
                                                    )}
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <Star size={12} style={{ color: 'var(--color-accent)' }} />
                                                        {formatStars(repo.stargazersCount)}
                                                    </span>
                                                    <span>·</span>
                                                    <span>
                                                        {latestRelease && releaseTime
                                                            ? `${t('publishedAt', lang)}: ${formatRelativeTime(releaseTime)}`
                                                            : `${t('repoPushedAt', lang)}: ${formatRelativeTime(repo.pushedAt)}`}
                                                    </span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm btn-icon-sm"
                                                    title={t('openReleasesOnGithub', lang)}
                                                    aria-label={t('openReleasesOnGithub', lang)}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.githubStarsAPI.openExternal(`${repo.htmlUrl}/releases`);
                                                    }}
                                                >
                                                    <ExternalLink size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ color: 'var(--color-error-text)' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUnsubscribe(repo);
                                                    }}
                                                >
                                                    <BellOff size={13} />
                                                    {t('unsubscribe', lang)}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

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
                        token={token || undefined}
                        aiModel={settings.aiModel}
                        aiThinking={!!settings.aiThinking}
                    />
                </Suspense>
            )}

            {/* 确认弹窗（ConfirmDialog：danger 实底 + 统一遮罩/焦点圈定） */}
            <ConfirmDialog
                isOpen={showConfirmDialog}
                title={t('unsubscribeConfirm', lang)}
                message={t('unsubscribeConfirmDesc', lang, { count: subscribedRepos.length })}
                confirmText={t('confirm', lang)}
                cancelText={t('cancel', lang)}
                variant="danger"
                onConfirm={confirmClearAll}
                onCancel={() => setShowConfirmDialog(false)}
            />

            {/* 添加版本订阅弹窗 */}
            <Modal
                isOpen={showAddSubModal}
                onClose={() => setShowAddSubModal(false)}
                title={t('addSubscriptionTitle', lang)}
                width={560}
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
                            value={addSubSearch}
                            onChange={(e) => setAddSubSearch(e.target.value)}
                            placeholder={t('searchReposToSubscribe', lang)}
                        />
                        {addSubSearch && (
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
                                onClick={() => setAddSubSearch('')}
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
                    ) : candidateSubscribeRepos.length === 0 ? (
                        <p className="text-[13px] text-[var(--color-text-muted)] text-center py-6">
                            {t('noResults', lang)}
                        </p>
                    ) : (
                        <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {candidateSubscribeRepos.slice(0, 60).map((repo) => {
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
                                                    {formatStars(repo.stargazersCount)}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className={`btn btn-sm ${isSub ? 'btn-secondary' : 'btn-primary'}`}
                                            style={{ flexShrink: 0 }}
                                            onClick={() => toggleSubscription(repo.id)}
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
        </div>
    );
}
