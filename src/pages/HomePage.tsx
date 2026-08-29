import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { RepositoryCard } from '../components/RepositoryCard';
import { SyncProgress } from '../components/SyncProgress';
import { toast } from '../components/Toast';
import { t } from '../locales';
import { shouldIgnoreGlobalKeydown } from '../utils/keyboard';
import { getTagTextColor } from '../utils/tagColor';
import { FilterBar, type FilterBarHandle } from './home/components/FilterBar';
import { EmptyState } from '../components/EmptyState';
import {
    RefreshCw, ChevronLeft, ChevronRight,
    Star, Sparkles, FileText, Package, SearchX, AlertTriangle, X
} from 'lucide-react';

// 🆕 阶段6 虚拟滚动："全部"模式（itemsPerPage=0）的行高初始估计。
// 行高并不固定（卡片描述两行裁剪、标签换行；列表行内容单/双行），
// 实际高度一律由 virtualizer.measureElement 动态测量，这里仅作首帧/未测行的估计：
// 阶段8 密度调整后（.card-compact padding 13×2 + 行距 6）：卡片 ≈ 26 + 标题 22 + 描述两行 39 + 底栏 18 + 行距 6；
// 列表行 ≈ padding 12×2 + 两行内容 44 + margin 4 + 1px 分割线
const CARD_ROW_ESTIMATE = 122;
const LIST_ROW_ESTIMATE = 60;

export const HomePage: React.FC = () => {
    // 精确订阅（阶段2 性能重构）：每个字段单独 selector，避免全量订阅
    const repositories = useStore((state) => state.repositories);
    const token = useStore((state) => state.token);
    const settings = useStore((state) => state.settings);
    const searchFilter = useStore((state) => state.searchFilter);
    const getFilteredRepos = useStore((state) => state.getFilteredRepos);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const setSelectedRepoId = useStore((state) => state.setSelectedRepoId);
    const currentPageNum = useStore((state) => state.currentPageNum);
    const setCurrentPageNum = useStore((state) => state.setCurrentPageNum);
    const tags = useStore((state) => state.tags);
    const loadTags = useStore((state) => state.loadTags);
    const viewMode = useStore((state) => state.viewMode);
    const setViewMode = useStore((state) => state.setViewMode);
    const noteRepoIds = useStore((state) => state.noteRepoIds);
    const noteContentByRepoId = useStore((state) => state.noteContentByRepoId);
    const hasRepoNote = useStore((state) => state.hasRepoNote);

    // 同步进度来自独立的 progress store（高频 set 不再触发本组件）
    const syncStatus = useProgressStore((state) => state.syncStatus);
    const syncProgress = useProgressStore((state) => state.syncProgress);
    const syncError = useProgressStore((state) => state.syncError);
    const setSyncError = useProgressStore((state) => state.setSyncError);

    const lang = (settings.language || 'zh') as 'zh' | 'en';
    // 🆕 阶段6 itemsPerPage 语义：正数=每页条数（分页，现状不变）；0=全部（不 slice，整表进虚拟列表）。默认 20 不变。
    // 注意不能再用 `|| 20` 兜底——那会把 0 当 falsy 吞掉
    const itemsPerPageSetting = settings.itemsPerPage ?? 20;
    const isShowAllMode = itemsPerPageSetting === 0;
    const itemsPerPage = isShowAllMode ? 20 : itemsPerPageSetting;
    const filteredRepos = useMemo(
        () => getFilteredRepos(),
        [repositories, searchFilter, tags, noteRepoIds, noteContentByRepoId]
    );
    // "全部"模式恒为单页（分页条自然隐藏：totalPages > 1 不成立）
    const totalPages = isShowAllMode ? 1 : Math.max(1, Math.ceil(filteredRepos.length / itemsPerPage));
    // "全部"模式不 slice：整表引用直接交给虚拟列表，避免每次筛选变化复制大数组
    const currentRepos = isShowAllMode
        ? filteredRepos
        : filteredRepos.slice(
            (currentPageNum - 1) * itemsPerPage,
            currentPageNum * itemsPerPage
        );
    const [activeRepoIndex, setActiveRepoIndex] = useState<number | null>(null);
    const [keyboardArea, setKeyboardArea] = useState<'toolbar' | 'list'>('list');
    const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const listContainerRef = useRef<HTMLDivElement | null>(null);
    const filterBarRef = useRef<FilterBarHandle | null>(null);
    const activeRepo = activeRepoIndex === null ? null : currentRepos[activeRepoIndex] ?? null;

    // 🆕 阶段6 虚拟滚动："全部"模式下行级虚拟化，仅渲染视口附近的行。
    // - measureElement 动态测高（行高不固定，禁止固定 estimateSize 假设），estimateSize 仅首帧估计
    // - getItemKey 用 repo.id：筛选/排序变化后避免行错位复用
    // - overscan 5：上下多预备几行，滚动时不露白
    // - 分页模式（itemsPerPage>0）enabled:false 完全旁路，滚动容器/渲染与升级前一致
    const listVirtualizer = useVirtualizer({
        count: currentRepos.length,
        getScrollElement: () => listContainerRef.current,
        estimateSize: () => (viewMode === 'card' ? CARD_ROW_ESTIMATE : LIST_ROW_ESTIMATE),
        getItemKey: (index) => currentRepos[index]?.id ?? index,
        overscan: 5,
        enabled: isShowAllMode,
    });

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

    // 🆕 阶段6："全部"模式无分页语义，把页码归 1，避免切回分页模式时停留在越界页码
    useEffect(() => {
        if (isShowAllMode && currentPageNum !== 1) {
            setCurrentPageNum(1);
        }
    }, [isShowAllMode, currentPageNum, setCurrentPageNum]);

    // 🆕 阶段6：切换视图（卡片/列表）行高量级完全不同，清除已测缓存按新视图重测
    useEffect(() => {
        if (isShowAllMode) {
            listVirtualizer.measure();
        }
    }, [viewMode, isShowAllMode, listVirtualizer]);

    useEffect(() => {
        if (!activeRepo) return;

        if (isShowAllMode) {
            // 虚拟模式下未挂载行没有 DOM ref，统一走 scrollToIndex 跟随；
            // align:'auto' 仅在行未完全可见时滚动，等价原 scrollIntoView 的 block:'nearest'
            listVirtualizer.scrollToIndex(activeRepoIndex ?? 0, { align: 'auto' });
            return;
        }

        itemRefs.current[activeRepo.id]?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
        });
    }, [activeRepo?.id, activeRepoIndex, isShowAllMode, listVirtualizer]);

    const handleSync = useCallback(async () => {
        const result = await useStore.getState().syncRepositories();
        // 被长任务互斥挡住时给出反馈，避免点击同步无任何响应
        if (result === 'busy') {
            toast.show(t('syncSkippedBusy', lang));
        }
    }, [lang]);

    const handleRepoClick = useCallback((repo: typeof repositories[0]) => {
        setSelectedRepoId(repo.id);
        setCurrentPage('detail');
    }, [setCurrentPage, setSelectedRepoId]);

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
                        requestAnimationFrame(() => {
                            filterBarRef.current?.focusActiveControl();
                        });
                        return 0;
                    }
                    return Math.max(prev - 1, 0);
                });
                return;
            }

            if (event.key === 'ArrowRight') {
                // 🆕 阶段6："全部"模式无分页语义，左右翻页键直接忽略
                // （不改为滚动到首/末：与分页模式的按键预期不一致，且上下键已覆盖滚动跟随）
                if (isShowAllMode) return;
                if (currentPageNum >= totalPages) return;
                event.preventDefault();
                setCurrentPageNum(currentPageNum + 1);
                setActiveRepoIndex(0);
                return;
            }

            if (event.key === 'ArrowLeft') {
                // 🆕 阶段6：同上，"全部"模式忽略翻页键
                if (isShowAllMode) return;
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
    }, [activeRepo, currentPageNum, currentRepos.length, handleRepoClick, isShowAllMode, keyboardArea, totalPages]);

    // 阶段3 排序收敛：排序偏好只在两处流动——
    // ① UI 改排序 → store.setSortPreference（原子写 settings + searchFilter）
    // ② 启动 → loadSettings 把 settings.defaultSortBy/Order 回填 searchFilter
    // （原 v1.6.2 的 sortRestoredRef 兜底恢复块为第三条冗余路径，已删除）

    const toggleViewMode = useCallback(() => {
        setViewMode(viewMode === 'card' ? 'list' : 'card');
    }, [viewMode, setViewMode]);

    // 🆕 阶段6：列表视图行内容（分页/虚拟两种模式共用同一份 JSX，保证 DOM 输出一致）
    const renderListRowContent = (repo: typeof repositories[0]) => (
        <>
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
                {hasRepoNote(repo.id) && (
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
                    // 有自定义色：6 位 hex 追加 alpha（如 #3b82f6 → #3b82f620）；无色：color-mix 调出的 primary 软底
                    const tagBg = tag.color
                        ? (/^#[0-9a-fA-F]{6}$/.test(tag.color) ? `${tag.color}20` : tag.color)
                        : 'color-mix(in srgb, var(--color-primary) 12%, transparent)';
                    return (
                        <span
                            key={tag.id}
                            style={{
                                fontSize: 10, padding: '1px 6px', borderRadius: 999,
                                background: tagBg,
                                // 文字色走安全换算（light 深色变体 / dark 原色，未知色回退文字主色），描边保留原色
                                color: getTagTextColor(tag.color),
                                border: `1px solid ${tag.color || 'var(--color-primary)'}`,
                            }}
                        >
                            {tag.icon} {tag.name}
                        </span>
                    );
                })}
            </div>
        </>
    );

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
                    boxShadow: '0 8px 24px color-mix(in srgb, var(--color-primary) 35%, transparent)',
                }}>
                    <Star size={36} color="white" strokeWidth={1.8} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.2 }}>GitHub Stars Manager For uTools</h2>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
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
                ref={filterBarRef}
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
                    requestAnimationFrame(() => {
                        listContainerRef.current?.focus();
                    });
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

            {/* 错误提示（role="alert"：读屏即时播报；错误展示单源归此横幅） */}
            {syncError && (
                <div role="alert" style={{
                    padding: '8px 16px', background: 'var(--color-error-strong)',
                    color: 'white', fontSize: 13, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} />
                        {syncError}
                    </span>
                    <button
                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', padding: 2 }}
                        onClick={() => setSyncError(null)}
                        aria-label={t('commonClose', lang)}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* 仓库列表 */}
            <div
                ref={listContainerRef}
                style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'card' ? '6px 16px' : '0' }}
                role="listbox"
                aria-label={t('repositories', lang)}
                aria-activedescendant={keyboardArea === 'list' && activeRepo ? `repo-option-${activeRepo.id}` : undefined}
                tabIndex={keyboardArea === 'list' ? 0 : -1}
            >
                {currentRepos.length === 0 ? (
                    <EmptyState
                        icon={repositories.length === 0
                            ? <Package size={48} strokeWidth={1.5} />
                            : <SearchX size={48} strokeWidth={1.5} />}
                        title={repositories.length === 0 ? t('noRepos', lang) : t('noResults', lang)}
                        description={repositories.length > 0 ? t('noResultsHint', lang) : undefined}
                        action={repositories.length === 0 ? (
                            <button className="btn btn-primary" onClick={handleSync}>
                                <RefreshCw size={14} />
                                {t('syncNow', lang)}
                            </button>
                        ) : undefined}
                    />
                ) : isShowAllMode ? (
                    // 🆕 阶段6 "全部"模式：虚拟列表，仅渲染视口附近的行。
                    // 外层占位 div 撑起总高度；行绝对定位 + translateY 布局；
                    // ref=measureElement + data-index 动态测高，getItemKey=repo.id 防错位复用。
                    // aria-activedescendant 协议不变（行 id 命名沿用 repo-option-{id}，
                    // 未挂载行无 DOM 节点属浏览器可容忍行为）
                    <div style={{ position: 'relative', height: listVirtualizer.getTotalSize(), width: '100%' }}>
                        {listVirtualizer.getVirtualItems().map((virtualRow) => {
                            const repo = currentRepos[virtualRow.index];
                            if (!repo) return null;
                            const isActive = activeRepoIndex === virtualRow.index;
                            return (
                                <div
                                    key={virtualRow.key}
                                    id={`repo-option-${repo.id}`}
                                    role="option"
                                    aria-selected={isActive}
                                    data-index={virtualRow.index}
                                    ref={listVirtualizer.measureElement}
                                    onClick={viewMode === 'card' ? undefined : () => handleRepoClick(repo)}
                                    onMouseEnter={() => {
                                        setActiveRepoIndex(virtualRow.index);
                                        setKeyboardArea('list');
                                    }}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualRow.start}px)`,
                                        // 还原两种视图的原有行样式：卡片=6px 行距（原 flex gap，阶段8 密度），列表=原行内边距与高亮边
                                        ...(viewMode === 'card'
                                            ? { paddingBottom: 6 }
                                            : {
                                                padding: '12px 16px',
                                                borderBottom: '1px solid var(--color-border)',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                                background: isActive ? 'var(--color-surface-hover)' : 'transparent',
                                                borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                                            }),
                                    }}
                                >
                                    {viewMode === 'card' ? (
                                        // 阶段8：卡片自身不再播 animate-fade-in，避免虚拟行重挂载时动画重播闪烁
                                        <RepositoryCard
                                            repo={repo}
                                            onClick={handleRepoClick}
                                            language={lang}
                                            isActive={isActive}
                                        />
                                    ) : (
                                        renderListRowContent(repo)
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : viewMode === 'card' ? (
                    // 卡片视图（阶段8 密度：行距 8→6）
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                    // 列表视图（分页模式，行为与阶段6 前一致）
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
                                {renderListRowContent(repo)}
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
                        aria-label={t('prevPage', lang)}
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
                        aria-label={t('nextPage', lang)}
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </div>
    );
};
