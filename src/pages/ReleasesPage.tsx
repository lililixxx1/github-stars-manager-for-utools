import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Box, ArrowLeft } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { ReleaseCard } from '../components/ReleaseCard';
import { ReleaseDetail } from '../components/ReleaseDetail';
import { PLATFORM_OPTIONS } from '../constants/platforms';
import { releaseService } from '../services/releaseService';
import { t } from '../locales';
import type { Language } from '../locales';
import type { Release, Repository } from '../types';
import { shouldIgnoreGlobalKeydown } from '../utils/keyboard';

type TabType = 'updates' | 'subscriptions';

// 常量
const UNDO_TIMEOUT_MS = 5000; // 撤销取消订阅的超时时间

// 格式化 Star 数
export const formatStars = (count: number): string => {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}k`; // 也可以选择 w
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
};

export function ReleasesPage() {
    const {
        releases,
        releaseFilter,
        releaseCheckStatus,
        settings,
        token,  // 🆕 v1.6.0 用于翻译功能
        loadReleases,
        checkReleaseUpdates,
        markReleaseRead,
        markAllReleasesRead,
        setReleaseFilter,
        setCurrentPage,
        toggleSubscription,
        clearAllSubscriptions,
        releasesInitialTab,
        setReleasesInitialTab,
    } = useStore();

    // 订阅 repositories 状态以触发响应式更新
    const repositories = useStore(state => state.repositories);
    const subscriptionVersion = useStore(state => state.subscriptionVersion);

    const lang = (settings.language || 'zh') as Language;
    const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        return releasesInitialTab || (localStorage.getItem('releasesTab') as TabType) || 'updates';
    });
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    useEffect(() => {
        if (releasesInitialTab) {
            setReleasesInitialTab(undefined);
        }
    }, [releasesInitialTab, setReleasesInitialTab]);

    // 撤销功能状态
    const [toast, setToast] = useState<{ message: string; showUndo: boolean } | null>(null);
    const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingUnsubscribeRef = useRef<{ repoId: number; repoName: string } | null>(null);
    const handleBack = useCallback(() => {
        setCurrentPage('home');
    }, [setCurrentPage]);

    useEffect(() => {
        loadReleases();
    }, [loadReleases]);

    // 如果加载后 releases 为空但 newCount > 0，重置 badge 避免误导
    useEffect(() => {
        if (releases.length === 0 && releaseCheckStatus.newCount > 0 && !releaseCheckStatus.checking) {
            useStore.setState((state) => ({
                releaseCheckStatus: { ...state.releaseCheckStatus, newCount: 0 },
            }));
        }
    }, [releases.length, releaseCheckStatus.newCount, releaseCheckStatus.checking]);

    // 保存 Tab 状态
    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        localStorage.setItem('releasesTab', tab);
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldIgnoreGlobalKeydown(event)) return;
            if (event.key !== 'Backspace') return;

            event.preventDefault();

            if (selectedRelease) {
                setSelectedRelease(null);
                return;
            }

            if (showConfirmDialog) {
                setShowConfirmDialog(false);
                return;
            }

            handleBack();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleBack, selectedRelease, showConfirmDialog]);

    // 筛选版本
    const subscribedRepoIds = window.githubStarsAPI.getReleaseSubscriptions();
    const filteredReleases = releases.filter((release) => {
        // 🆕 v1.6.0: 只显示仍处于订阅状态仓库的 Release（隐藏取消订阅后的"幽灵"卡片）
        if (!subscribedRepoIds.includes(release.repository.id)) {
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
    });

    const sortedReleases = [...filteredReleases].sort(
        (a, b) => new Date(b.publishedAt || b.published_at || '').getTime() - new Date(a.publishedAt || a.published_at || '').getTime()
    );

    // 使用 useMemo 构建仓库 Map，避免重复查找
    const repositoryMap = useMemo(() => {
        const map = new Map<number, Repository>();
        repositories.forEach(r => map.set(r.id, r));
        return map;
    }, [repositories]);

    // 使用 useMemo 计算已订阅仓库（响应式更新）
    const subscribedRepos = useMemo(() => {
        const ids = window.githubStarsAPI.getReleaseSubscriptions();
        return repositories.filter(r => ids.includes(r.id));
    }, [repositories, subscriptionVersion]);

    const handleCheckUpdates = async () => {
        await checkReleaseUpdates();
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

    // 取消订阅（带撤销功能）
    const handleUnsubscribe = (repo: Repository) => {
        // 清除之前的撤销计时器
        if (undoTimeoutRef.current) {
            clearTimeout(undoTimeoutRef.current);
            // 如果有待撤销的操作，确认执行（pending 已经在上次 toggle 时从 dbStorage 移除了，无需再次操作）
            pendingUnsubscribeRef.current = null;
        }

        // 存储待撤销数据
        pendingUnsubscribeRef.current = { repoId: repo.id, repoName: repo.fullName };

        // 立即更新 UI（通过 store 统一操作 dbStorage + subscriptionVersion）
        toggleSubscription(repo.id);

        // 显示 Toast
        setToast({ message: t('unsubscribed', lang), showUndo: true });

        // 5 秒后清除
        undoTimeoutRef.current = setTimeout(() => {
            pendingUnsubscribeRef.current = null;
            setToast(null);
        }, UNDO_TIMEOUT_MS);
    };

    // 撤销取消订阅
    const handleUndo = () => {
        if (undoTimeoutRef.current) {
            clearTimeout(undoTimeoutRef.current);
            undoTimeoutRef.current = null;
        }
        if (pendingUnsubscribeRef.current) {
            // 重新添加订阅（上次 toggle 已移除，再次 toggle 会添加回来）
            toggleSubscription(pendingUnsubscribeRef.current.repoId);
            pendingUnsubscribeRef.current = null;
        }
        setToast({ message: t('subscriptionRestored', lang), showUndo: false });
        setTimeout(() => setToast(null), 2000);
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
    const formatRelativeTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (lang === 'zh') {
            if (diffDays === 0) return diffHours <= 1 ? '刚刚' : `${diffHours} 小时前`;
            if (diffDays === 1) return '昨天';
            if (diffDays < 7) return `${diffDays} 天前`;
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
            return `${Math.floor(diffDays / 30)} 个月前`;
        } else {
            if (diffDays === 0) return diffHours <= 1 ? 'just now' : `${diffHours} hours ago`;
            if (diffDays === 1) return 'yesterday';
            if (diffDays < 7) return `${diffDays} days ago`;
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
            return `${Math.floor(diffDays / 30)} months ago`;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 顶栏 - 遵循 UI-Design-Guide.md §4.2 */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
            }}>
                <button className="btn btn-ghost btn-sm" onClick={handleBack}>
                    <ArrowLeft size={16} />
                    {t('back', lang)}
                </button>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {t('releases', lang)}
                </h2>
                <div style={{ flex: 1 }} />
                {releaseCheckStatus.newCount > 0 && activeTab === 'updates' && (
                    <span style={{
                        padding: '2px 8px', fontSize: 13, fontWeight: 500,
                        color: 'var(--color-primary)', background: 'var(--color-primary-light)', opacity: 0.9, borderRadius: 12
                    }}>
                        {releaseCheckStatus.newCount} {t('newReleases', lang)}
                    </span>
                )}
            </div>

            {/* 独立 Tab 栏 */}
            <div style={{
                display: 'flex', gap: 8,
                padding: '8px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface-secondary)',
            }}>
                <button
                    className={`tag ${activeTab === 'updates' ? 'tag-active' : ''}`}
                    onClick={() => handleTabChange('updates')}
                >
                    {t('versionUpdates', lang)}
                </button>
                <button
                    className={`tag ${activeTab === 'subscriptions' ? 'tag-active' : ''}`}
                    onClick={() => handleTabChange('subscriptions')}
                >
                    {t('subscriptionManage', lang)}
                    {subscribedRepos.length > 0 && (
                        <span style={{ marginLeft: 4, opacity: 0.8 }}>({subscribedRepos.length})</span>
                    )}
                </button>
            </div>

            {/* 包含过滤器、统计信息以及主列表的滚动内容区 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {activeTab === 'updates' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
                        {/* 筛选栏 (仅在有版本数据时显示) */}
                        {releaseCheckStatus.checking ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)' }}>
                                <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span style={{ fontSize: 13 }}>{t('checkingUpdates', lang)}</span>
                            </div>
                        ) : (
                            releases.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-secondary btn-sm" onClick={handleCheckUpdates}>
                                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            {t('checkUpdates', lang)}
                                        </button>
                                        <button className="btn btn-secondary btn-sm" onClick={handleMarkAllRead}>
                                            {t('markAllRead', lang)}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={releaseFilter.showUnreadOnly} onChange={(e) => setReleaseFilter({ showUnreadOnly: e.target.checked })} style={{ accentColor: 'var(--color-primary)' }} />
                                            {t('showUnreadOnly', lang)}
                                        </label>
                                        <select
                                            className="input"
                                            style={{ padding: '4px 8px', fontSize: 13, width: 'auto' }}
                                            value={releaseFilter.platform || ''}
                                            onChange={(e) => setReleaseFilter({ platform: e.target.value || null })}
                                        >
                                            <option value="">{t('allPlatforms', lang)}</option>
                                            {PLATFORM_OPTIONS.map((platform) => (
                                                <option key={platform.id} value={platform.id}>
                                                    {platform.icon} {platform.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )
                        )}
                        {/* 版本更新列表 */}
                        {sortedReleases.length === 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: 16, opacity: 0.5 }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                </svg>
                                <p style={{ fontSize: 16, fontWeight: 500 }}>
                                    {releaseFilter.showUnreadOnly ? t('noUnreadReleases', lang) : t('noReleases', lang)}
                                </p>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
                        {/* 订阅管理统计和操作 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                                {t('subscribedCount', lang, { count: subscribedRepos.length })}
                            </span>
                            {subscribedRepos.length > 0 && (
                                <button
                                    onClick={handleClearAll}
                                    style={{
                                        fontSize: 13, fontWeight: 500, color: 'var(--color-error)',
                                        background: 'transparent', border: 'none', cursor: 'pointer'
                                    }}
                                >
                                    {t('unsubscribeAll', lang)}
                                </button>
                            )}
                        </div>

                        {/* 订阅管理列表 */}
                        {subscribedRepos.length === 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: 16, opacity: 0.5 }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('noSubscriptions', lang)}</p>
                                <p style={{ fontSize: 13, marginTop: 8 }}>{t('noSubscriptionsHint', lang)}</p>
                                <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setCurrentPage('home')}>
                                    {t('browseRepos', lang)}
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {subscribedRepos.map((repo) => (
                                    <div key={repo.id} className="card" style={{ display: 'flex', alignItems: 'center', padding: 12 }}>
                                        <img src={repo.owner.avatarUrl} alt={repo.owner.login} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 12 }} />
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
                                                <span>★ {formatStars(repo.stargazersCount)}</span>
                                                <span>·</span>
                                                <span>{t('lastUpdated', lang)}: {formatRelativeTime(repo.pushedAt)}</span>
                                            </div>
                                        </div>
                                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleUnsubscribe(repo)}>
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
                <ReleaseDetail
                    release={selectedRelease}
                    lang={lang}
                    onClose={() => setSelectedRelease(null)}
                    token={token || undefined}
                    aiModel={settings.aiModel}
                />
            )}

            {/* 确认弹窗 */}
            {
                showConfirmDialog && (
                    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                        <div className="card" style={{ padding: 24, maxWidth: 360, width: '100%', margin: '0 16px' }}>
                            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                                {t('unsubscribeConfirm', lang)}
                            </h3>
                            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
                                {t('unsubscribeConfirmDesc', lang, { count: subscribedRepos.length })}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                                <button className="btn btn-secondary" onClick={() => setShowConfirmDialog(false)}>
                                    {t('cancel', lang)}
                                </button>
                                <button className="btn" style={{ background: 'var(--color-error)', color: 'white' }} onClick={confirmClearAll}>
                                    {t('confirm', lang)}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Toast 提示 */}
            {
                toast && (
                    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-text-primary)', color: 'var(--color-surface)', padding: '10px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                        <span style={{ fontSize: 13 }}>{toast.message}</span>
                        {toast.showUndo && (
                            <button style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-primary-light)', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={handleUndo}>
                                {t('undo', lang)}
                            </button>
                        )}
                    </div>
                )
            }
        </div >
    );
}
