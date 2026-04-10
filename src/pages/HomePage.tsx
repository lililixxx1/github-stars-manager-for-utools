import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { RepositoryCard } from '../components/RepositoryCard';
import { SyncProgress } from '../components/SyncProgress';
import { t } from '../locales';
import type { SortBy } from '../types';
import { shouldIgnoreGlobalKeydown } from '../utils/keyboard';
import { FilterBar } from './home/components/FilterBar';
import {
    RefreshCw, ChevronLeft, ChevronRight,
    Star, Sparkles, FileText
} from 'lucide-react';

export const HomePage: React.FC = () => {
    const {
        repositories, token, settings,
        syncStatus, syncProgress,
        syncError, setSyncError,
        searchFilter, getFilteredRepos,
        setCurrentPage, setSelectedRepo,
        currentPageNum, setCurrentPageNum,
        tags, loadTags, viewMode, setViewMode,
    } = useStore();

    const lang = (settings.language || 'zh') as 'zh' | 'en';
    const itemsPerPage = settings.itemsPerPage || 20;
    const filteredRepos = useMemo(() => getFilteredRepos(), [repositories, searchFilter, tags]);
    const totalPages = Math.max(1, Math.ceil(filteredRepos.length / itemsPerPage));
    const currentRepos = filteredRepos.slice(
        (currentPageNum - 1) * itemsPerPage,
        currentPageNum * itemsPerPage
    );
    const [activeRepoIndex, setActiveRepoIndex] = useState<number | null>(null);
    const [keyboardArea, setKeyboardArea] = useState<'toolbar' | 'list'>('list');
    const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const listContainerRef = useRef<HTMLDivElement | null>(null);
    const activeRepo = activeRepoIndex === null ? null : currentRepos[activeRepoIndex] ?? null;

    // 获取所有语言
    const allLanguages = useMemo(() => {
        const langs = new Set<string>();
        repositories.forEach((r) => r.language && langs.add(r.language));
        return Array.from(langs).sort();
    }, [repositories]);

    // 加载标签
    useEffect(() => {
        loadTags();
    }, [loadTags]);

    useEffect(() => {
        if (currentRepos.length === 0) {
            setActiveRepoIndex(null);
            setKeyboardArea('toolbar');
            return;
        }

        setActiveRepoIndex((prev) => {
            if (prev === null) return 0;
            return Math.min(prev, currentRepos.length - 1);
        });
    }, [currentRepos.length, currentPageNum, viewMode]);

    useEffect(() => {
        if (!activeRepo) return;

        itemRefs.current[activeRepo.id]?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
        });
    }, [activeRepo?.id]);

    const handleSync = useCallback(async () => {
        await useStore.getState().syncRepositories();
    }, []);

    const handleRepoClick = useCallback((repo: typeof repositories[0]) => {
        setSelectedRepo(repo);
        setCurrentPage('detail');
    }, [setCurrentPage, setSelectedRepo]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (shouldIgnoreGlobalKeydown(event)) return;
            if (keyboardArea !== 'list') return;

            if (event.key === 'ArrowDown') {
                if (currentRepos.length === 0) return;
                event.preventDefault();
                setActiveRepoIndex((prev) => {
                    if (prev === null) return 0;
                    return Math.min(prev + 1, currentRepos.length - 1);
                });
                return;
            }

            if (event.key === 'ArrowUp') {
                if (currentRepos.length === 0) return;
                event.preventDefault();
                setActiveRepoIndex((prev) => {
                    if (prev === null || prev <= 0) {
                        setKeyboardArea('toolbar');
                        return 0;
                    }
                    return Math.max(prev - 1, 0);
                });
                return;
            }

            if (event.key === 'ArrowRight') {
                if (currentPageNum >= totalPages) return;
                event.preventDefault();
                setCurrentPageNum(currentPageNum + 1);
                setActiveRepoIndex(0);
                return;
            }

            if (event.key === 'ArrowLeft') {
                if (currentPageNum <= 1) return;
                event.preventDefault();
                setCurrentPageNum(currentPageNum - 1);
                setActiveRepoIndex(0);
                return;
            }

            if (event.key === 'Enter' && activeRepo) {
                event.preventDefault();
                handleRepoClick(activeRepo);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeRepo, currentPageNum, currentRepos.length, handleRepoClick, keyboardArea, totalPages]);

    // 🆕 v1.6.2 初始化时从 settings 恢复排序设置
    // 使用 useRef 确保只恢复一次，避免每次 settings 变化都重置
    const sortRestoredRef = useRef(false);
    useEffect(() => {
        // 避免重复恢复
        if (sortRestoredRef.current) return;
        // 确保 settings 已加载（检查是否有有效的 defaultSortBy）
        if (!settings.defaultSortBy) return;

        sortRestoredRef.current = true;
        const { searchFilter, setSearchFilter } = useStore.getState();
        if (settings.defaultSortBy && settings.defaultSortBy !== searchFilter.sortBy) {
            setSearchFilter({ sortBy: settings.defaultSortBy as SortBy });
        }
        if (settings.defaultSortOrder && settings.defaultSortOrder !== searchFilter.sortOrder) {
            setSearchFilter({ sortOrder: settings.defaultSortOrder });
        }
    }, [settings.defaultSortBy, settings.defaultSortOrder]); // 监听 settings 变化

    const toggleViewMode = useCallback(() => {
        setViewMode(viewMode === 'card' ? 'list' : 'card');
    }, [viewMode, setViewMode]);

    // 首次使用引导
    if (!token) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 16, padding: 32,
            }}>
                <div style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 8,
                }}>
                    <Star size={36} color="white" />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 600 }}>GitHub Stars Manager For uTools</h2>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                    {t('firstUseHint', lang)}
                </p>
                <button className="btn btn-primary" onClick={() => setCurrentPage('settings')}>
                    <Sparkles size={16} />
                    {t('configureToken', lang)}
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 筛选栏组件 🆕 v1.7.0 */}
            <FilterBar
                lang={lang}
                repositories={repositories}
                filteredCount={filteredRepos.length}
                tags={tags}
                allLanguages={allLanguages}
                onRefresh={handleSync}
                syncStatus={syncStatus}
                viewMode={viewMode}
                onViewModeToggle={toggleViewMode}
                keyboardArea={keyboardArea}
                onRequestListArea={() => {
                    if (currentRepos.length === 0) return;
                    setKeyboardArea('list');
                    setActiveRepoIndex((prev) => prev ?? 0);
                    listContainerRef.current?.focus();
                }}
                onRequestToolbarArea={() => setKeyboardArea('toolbar')}
                hasListResults={currentRepos.length > 0}
            />

            {/* 同步进度 */}
            <SyncProgress
                current={syncProgress.current}
                total={syncProgress.total}
                status={syncStatus}
                language={lang}
            />

            {/* 错误提示 */}
            {syncError && (
                <div style={{
                    padding: '8px 16px', background: 'var(--color-error)',
                    color: 'white', fontSize: 13, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span>⚠️ {syncError}</span>
                    <button
                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14 }}
                        onClick={() => setSyncError(null)}
                    >✕</button>
                </div>
            )}

            {/* 仓库列表 */}
            <div
                ref={listContainerRef}
                style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'card' ? '8px 16px' : '0' }}
                role="listbox"
                aria-label={t('repositories', lang)}
                aria-activedescendant={activeRepo ? `repo-option-${activeRepo.id}` : undefined}
                tabIndex={0}
            >
                {currentRepos.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)',
                    }}>
                        <p>{repositories.length === 0 ? t('noRepos', lang) : t('noResults', lang)}</p>
                        {repositories.length === 0 && (
                            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleSync}>
                                <RefreshCw size={14} />
                                {t('syncNow', lang)}
                            </button>
                        )}
                    </div>
                ) : viewMode === 'card' ? (
                    // 卡片视图
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {currentRepos.map((repo, index) => {
                            const isActive = activeRepoIndex === index;
                            return (
                                <div
                                    key={repo.id}
                                    id={`repo-option-${repo.id}`}
                                    role="option"
                                    aria-selected={isActive}
                                    ref={(element) => { itemRefs.current[repo.id] = element; }}
                                    onMouseEnter={() => {
                                        setActiveRepoIndex(index);
                                        setKeyboardArea('list');
                                    }}
                                >
                                    <RepositoryCard
                                        repo={repo}
                                        onClick={handleRepoClick}
                                        language={lang}
                                        isActive={isActive}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // 列表视图
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {currentRepos.map((repo, index) => {
                            const isActive = activeRepoIndex === index;
                            return (
                            <div
                                key={repo.id}
                                id={`repo-option-${repo.id}`}
                                role="option"
                                aria-selected={isActive}
                                ref={(element) => { itemRefs.current[repo.id] = element; }}
                                onClick={() => handleRepoClick(repo)}
                                onMouseEnter={() => {
                                    setActiveRepoIndex(index);
                                    setKeyboardArea('list');
                                }}
                                style={{
                                    padding: '12px 16px',
                                    borderBottom: '1px solid var(--color-border)',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                    background: isActive ? 'var(--color-surface-hover)' : 'transparent',
                                    borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                                        {repo.alias || repo.name}
                                    </span>
                                    {repo.alias && (
                                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                            ({repo.fullName})
                                        </span>
                                    )}
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                        <Star size={12} style={{ color: 'var(--color-accent)' }} />
                                        {repo.stargazersCount.toLocaleString()}
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                        {repo.language}
                                    </span>
                                    {/* 笔记标识 */}
                                    {window.githubStarsAPI.getNote(repo.id) && (
                                        <FileText size={12} style={{ color: 'var(--color-primary)' }} />
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {repo.description || t('noDescription', lang)}
                                    </span>
                                    {/* 标签 */}
                                    {(repo.customTags || []).slice(0, 3).map((tagId) => {
                                        const tag = tags.find(t => t.id === tagId);
                                        if (!tag) return null;
                                        return (
                                            <span
                                                key={tag.id}
                                                style={{
                                                    fontSize: 10, padding: '1px 6px', borderRadius: 999,
                                                    background: (tag.color || 'var(--color-primary)') + '20',
                                                    color: tag.color || 'var(--color-primary)',
                                                    border: `1px solid ${tag.color || 'var(--color-primary)'}`,
                                                }}
                                            >
                                                {tag.icon} {tag.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '8px 16px', borderTop: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                }}>
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={currentPageNum <= 1}
                        onClick={() => setCurrentPageNum(currentPageNum - 1)}
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {currentPageNum} / {totalPages}
                    </span>
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={currentPageNum >= totalPages}
                        onClick={() => setCurrentPageNum(currentPageNum + 1)}
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </div>
    );
};
