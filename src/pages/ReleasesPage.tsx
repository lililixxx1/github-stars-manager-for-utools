import { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Loader2, RefreshCw, Inbox, Bell, Star } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { ReleaseCard } from '../components/ReleaseCard';
import { EmptyState } from '../components/EmptyState';

const ReleaseDetail = lazy(() =>
    import('../components/ReleaseDetail').then((m) => ({ default: m.ReleaseDetail }))
);
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toast';
import { PLATFORM_OPTIONS } from '../constants/platforms';
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

            if (showConfirmDialog) {
                setShowConfirmDialog(false);
                return true;
            }

            return false;
        },
        deps: [handleBack, selectedRelease, showConfirmDialog],
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
            <div className="px-5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="segmented w-fit">
                    <button
                        type="button"
                        className={`segmented-item${activeTab === 'updates' ? ' active' : ''}`}
                        style={{ padding: '4px 16px' }}
                        onClick={() => handleTabChange('updates')}
                        aria-pressed={activeTab === 'updates'}
                    >
                        {t('versionUpdates', lang)}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: subscribedRepos.length === 0 ? '100%' : undefined }}>
                        {/* 订阅管理统计和操作 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                                {t('subscribedCount', lang, { count: subscribedRepos.length })}
                            </span>
                            {subscribedRepos.length > 0 && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--color-error-text)' }}
                                    onClick={handleClearAll}
                                >
                                    {t('unsubscribeAll', lang)}
                                </button>
                            )}
                        </div>

                        {/* 订阅管理列表 */}
                        {subscribedRepos.length === 0 ? (
                            <div style={{ flex: 1 }}>
                                <EmptyState
                                    icon={<Bell size={48} strokeWidth={1.5} />}
                                    title={t('noSubscriptions', lang)}
                                    description={t('noSubscriptionsHint', lang)}
                                    action={
                                        <button className="btn btn-primary" onClick={() => setCurrentPage('home')}>
                                            {t('browseRepos', lang)}
                                        </button>
                                    }
                                />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {subscribedRepos.map((repo) => (
                                    <div
                                        key={repo.id}
                                        className="card card-compact card-interactive"
                                        style={{ display: 'flex', alignItems: 'center' }}
                                        onClick={() => {
                                            setSelectedRepoId(repo.id);
                                            setCurrentPage('detail');
                                        }}
                                    >
                                        <img
                                            src={repo.owner.avatarUrl}
                                            alt={repo.owner.login}
                                            width={32}
                                            height={32}
                                            loading="lazy"
                                            decoding="async"
                                            style={{ width: 32, height: 32, borderRadius: 16, marginRight: 12, flexShrink: 0 }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Box size={14} style={{ color: 'var(--color-text-muted)' }} />
                                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                    {repo.alias || repo.fullName}
                                                </span>
                                                {repo.alias && (
                                                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>({repo.fullName})</span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                                {repo.language && <span className="tag" style={{ padding: '0 6px', fontSize: 11 }}>{repo.language}</span>}
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                    <Star size={12} style={{ color: 'var(--color-accent)' }} />
                                                    {formatStars(repo.stargazersCount)}
                                                </span>
                                                <span>·</span>
                                                <span>{t('lastUpdated', lang)}: {formatRelativeTime(repo.pushedAt)}</span>
                                            </div>
                                        </div>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ color: 'var(--color-error-text)' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUnsubscribe(repo);
                                            }}
                                        >
                                            {t('unsubscribe', lang)}
                                        </button>
                                    </div>
                                ))}
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
        </div>
    );
}
