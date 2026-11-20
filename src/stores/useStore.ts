import { create } from 'zustand';
import type { Repository, PageName, SearchFilter, Settings, Tag, RepositoryNote, ViewMode, SortBy, SortOrder, Release, ReleaseFilter, DetailTab } from '../types';
import { storageService } from '../services/storageService';
import { githubService } from '../services/githubService';
import { aiService } from '../services/aiService';
import { releaseService } from '../services/releaseService';
import { checkAnalysisNeeded } from '../utils/analysis';
import { createFilteredReposPipeline } from './selectors';
import { useProgressStore } from './useProgressStore';
import { logger } from '../utils/logger';
import { Benchmark } from '../utils/benchmark';
import {
    mergeFullSyncedRepositories,
    mergeIncrementalRepositories,
    buildTagMap,
    buildNoteIndex,
} from './helpers/repoMerge';
import {
    clearAutoAnalyzeRetry,
    scheduleAutoAnalyzeRetry,
    clearPendingSyncIdle,
    scheduleSyncIdle,
    markAiBatchStart,
    flushAiPatches,
    queueAiPatch,
} from './helpers/jobTimers';

/**
 * syncRepositories / startAutoAnalyze 的触发结果：
 * - 'ok'：已受理并执行（含"已在进行中，无需重复动作"——进度 UI 已在展示）
 * - 'busy'：被长任务互斥挡住（同步为显式动作不重试，调用方负责提示；自动分析已排队重试）
 * - 'no-token'：缺 Token，未执行
 */
export type JobTriggerResult = 'ok' | 'busy' | 'no-token';

/** 首页滚动位置记忆（方案 SEARCH-RESTORE-BACKSPACE-PLAN v1.2 B1）：offset + 恢复指纹（会话级，不持久化） */
export interface HomeScrollMemory {
    offset: number;
    keyword: string;
    page: number;
    viewMode: ViewMode;
    itemsPerPage: number;
}

interface AppState {
    // 页面导航
    currentPage: PageName;
    setCurrentPage: (page: PageName) => void;

    // 仓库列表
    repositories: Repository[];
    setRepositories: (repos: Repository[]) => void;
    loadRepositories: () => void;
    saveRepositories: () => void;

    // 当前选中仓库（F1：仅存 ID，仓库对象由 repositories 派生，消灭快照双数据源）
    selectedRepoId: number | null;
    setSelectedRepoId: (id: number | null) => void;

    // 搜索过滤
    searchFilter: SearchFilter;
    setSearchFilter: (filter: Partial<SearchFilter>) => void;
    // 🆕 阶段3 排序偏好唯一写入口：原子地持久化 settings + 更新 searchFilter
    setSortPreference: (updates: { sortBy?: SortBy; sortOrder?: SortOrder }) => void;

    // 同步（进度状态 syncStatus/syncProgress/syncError 已迁至 useProgressStore，避免双源）
    syncRepositories: (options?: { forceFull?: boolean }) => Promise<JobTriggerResult>; // 🆕 v1.6.3 同步方法移至 store（支持全局调用）

    // 设置
    settings: Partial<Settings>;
    loadSettings: () => void;
    saveSettings: (settings: Partial<Settings>) => void;
    token: string | null;
    loadToken: () => void;

    // AI 分析
    analyzingRepo: string | null;
    setAnalyzingRepo: (fullName: string | null) => void;

    // 🆕 v1.3.0 批量 AI 分析（进度状态 isAnalyzing/analyzeProgress/analyzeStats/abortController 已迁至 useProgressStore）
    // isAutoTriggered：定时器自动触发传 true（互斥重试时复核 autoAnalyzeOnOpen 仍开启），用户手动触发省略
    startAutoAnalyze: (isAutoTriggered?: boolean) => Promise<JobTriggerResult>;
    stopAnalyze: () => void;
    getAvailablePlatforms: () => string[];

    // 分页
    currentPageNum: number;
    setCurrentPageNum: (page: number) => void;

    // 首页滚动位置记忆：HomePage 卸载时写入，重新挂载时按指纹恢复（方案 v1.2 B1）
    homeScrollMemory: HomeScrollMemory | null;
    setHomeScrollMemory: (memory: HomeScrollMemory | null) => void;

    // ========== 🆕 v1.1.0 标签管理 ==========
    tags: Tag[];
    tagById: Map<string, Tag>;
    loadTags: () => void;
    setTags: (tags: Tag[]) => void;
    addTag: (tag: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>) => Tag;
    updateTag: (id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>) => Tag | null;
    deleteTag: (id: string) => void;
    reorderTags: (tagIds: string[]) => void;

    // ========== 🆕 v1.1.0 笔记管理 ==========
    currentNote: RepositoryNote | null;
    noteRepoIds: Set<number>;
    noteContentByRepoId: Map<number, string>;
    noteByRepoId: Map<number, RepositoryNote>;
    loadNoteIndex: () => void;
    hasRepoNote: (repoId: number) => boolean;
    loadNote: (repoId: number) => void;
    saveNote: (repoId: number, content: string) => RepositoryNote;
    deleteNote: (repoId: number) => void;

    // ========== 🆕 v1.1.0 视图模式 ==========
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;

    // 过滤后的仓库
    getFilteredRepos: () => Repository[];

    // 更新仓库（用于别名、标签等）
    updateRepository: (id: number, updates: Partial<Repository>) => void;

    // 批量整理操作
    batchAddTag: (repoIds: number[], tagId: string) => void;
    batchRemoveTag: (repoIds: number[], tagId: string) => void;
    batchSetSubscription: (repoIds: number[], subscribed: boolean) => void;

    // ========== 🆕 v1.4.0 版本追踪 ==========
    releases: Release[];
    releaseFilter: ReleaseFilter; // releaseCheckStatus 已迁至 useProgressStore
    loadReleases: () => void;
    saveReleases: () => void;
    checkReleaseUpdates: () => Promise<void>;
    markReleaseRead: (releaseId: number) => void;
    markAllReleasesRead: () => void;
    getUnreadCount: () => number;
    setReleaseFilter: (filter: Partial<ReleaseFilter>) => void;

    // ========== 🆕 v1.5.0 订阅管理 ==========
    subscribedRepoIds: Set<number>;                 // 🆕 阶段3 订阅单源（内存态，来源 gh:releaseSubscriptions）
    getSubscribedRepos: () => Repository[];           // 获取已订阅仓库（派生）
    toggleSubscription: (repoId: number) => void;     // 切换订阅状态（v1.6.0 乐观更新）
    clearAllSubscriptions: () => void;                // 清空所有订阅
    togglingSubscriptions: Set<number>;               // 🆕 v1.6.0 正在切换订阅的仓库 ID（防竞态）
    releasesInitialTab?: 'updates' | 'subscriptions'; // 兼容旧引用
    setReleasesInitialTab: (tab?: 'updates' | 'subscriptions') => void;
    detailInitialTab?: DetailTab;
    setDetailInitialTab: (tab?: DetailTab) => void;
}

const defaultFilter: SearchFilter = {
    keyword: '',
    smartView: 'all',
    languages: [],
    topics: [],
    aiTags: [],
    customTags: [],
    platforms: [],  // 🆕 v1.3.0
    invertFilter: false,
    hasReleases: null,
    hasNotes: null,
    hasAlias: null,
    sortBy: 'stars',
    sortOrder: 'desc',
};

const defaultSettings: Partial<Settings> = {
    theme: 'auto',
    defaultView: 'card',
    itemsPerPage: 20,
    language: 'zh',
    syncInterval: 24,
    syncMode: 'smart',
    autoSyncOnOpen: false,
    fullSyncIntervalDays: 7,
    aiConcurrency: 1,
    defaultSortBy: 'stars',
    defaultSortOrder: 'desc',
    autoAnalyzeOnOpen: false,  // 🆕 v1.3.0
    autoCheckReleaseUpdates: true,   // 🆕 v1.4.0 启动时自动检查版本更新
};

// 🆕 v1.4.0 版本筛选默认值
const defaultReleaseFilter: ReleaseFilter = {
    showUnreadOnly: false,
    platform: null,
};

export const useStore = create<AppState>((set, get) => ({
    // 页面导航
    currentPage: 'home',
    setCurrentPage: (page) => set({ currentPage: page }),
    releasesInitialTab: undefined,
    setReleasesInitialTab: (tab) => set({ releasesInitialTab: tab }),
    detailInitialTab: undefined,
    setDetailInitialTab: (tab) => set({ detailInitialTab: tab }),

    // 仓库列表
    repositories: [],
    setRepositories: (repos) => set({ repositories: repos, ...buildNoteIndex(repos) }),
    loadRepositories: () => {
        Benchmark.timeOnce('startup:loadRepositories', () => {
            const repos = storageService.getRepositories();
            // 订阅状态同步机制说明:
            // - 主数据源: gh:releaseSubscriptions (独立数组存储)
            // - 内存单源: subscribedRepoIds (Set，阶段3 起组件一律从这里派生，渲染期不直读存储)
            // - 派生数据: Repository.isSubscribed (便于 UI 快速访问，由本处及订阅 actions 维护)
            // - 详见: docs/design/design-release-tracking.md §4.1 数据模型
            const subscriptionIds = storageService.getReleaseSubscriptions();
            const migrated = repos.map(r => ({
                ...r,
                customTags: r.customTags || [],
                isSubscribed: subscriptionIds.has(r.id),
            }));
            set({ repositories: migrated, subscribedRepoIds: subscriptionIds, ...buildNoteIndex(migrated) });
        });
    },
    saveRepositories: () => {
        storageService.setRepositories(get().repositories);
    },

    // 当前选中仓库
    selectedRepoId: null,
    setSelectedRepoId: (id) => set({ selectedRepoId: id }),

    // 搜索过滤
    searchFilter: { ...defaultFilter },
    setSearchFilter: (filter) => {
        set((state) => ({
            searchFilter: { ...state.searchFilter, ...filter },
            currentPageNum: 1,
        }));

        // 阶段3 排序收敛：setSearchFilter 不再持久化排序偏好。
        // 排序的唯一写入口是 setSortPreference（UI 操作），
        // 唯一回填读路径是 loadSettings（settings.defaultSortBy/Order → searchFilter）。
    },

    /**
     * 🆕 阶段3 排序偏好唯一写入口（替代 v1.6.2 在 setSearchFilter 内的持久化分支）
     *
     * 数据流向：UI 改排序 → 本 action 原子地
     *   1. 写 settings.defaultSortBy/defaultSortOrder（持久化）
     *   2. 写 searchFilter.sortBy/sortOrder（本次会话生效）
     * → 重启后 loadSettings 把 settings 回填 searchFilter。
     */
    setSortPreference: (updates) => {
        const state = get();
        const nextSortBy = updates.sortBy ?? state.searchFilter.sortBy;
        const nextSortOrder = updates.sortOrder ?? state.searchFilter.sortOrder;
        const nextSettings = {
            ...state.settings,
            defaultSortBy: nextSortBy,
            defaultSortOrder: nextSortOrder,
        };
        storageService.setSettings(nextSettings);
        set({
            settings: nextSettings,
            searchFilter: { ...state.searchFilter, sortBy: nextSortBy, sortOrder: nextSortOrder },
            currentPageNum: 1,
        });
    },

    // 🆕 v1.6.3 同步方法移至 store（支持从任意页面触发 + 可配置同步策略）
    syncRepositories: async (options) => {
        const { token, settings, repositories } = get();
        const progress = useProgressStore.getState();

        logger.log('[syncRepositories] 开始同步检查', {
            hasToken: !!token,
            syncStatus: progress.syncStatus,
            options,
        });

        if (!token) return 'no-token';
        if (progress.syncStatus === 'syncing') return 'busy';

        // busy 互斥：AI 分析 / 版本检查进行中时跳过，避免并发写 repos/releases 存储。
        // 同步是显式动作，不自动重试：返回 'busy' 交由调用方给出反馈
        if (progress.isJobBusy('sync')) {
            logger.log('[syncRepositories] AI 分析或版本检查进行中，跳过本次同步');
            return 'busy';
        }

        await Benchmark.timeOnceAsync('sync:syncRepositories', async () => {
            // 清上一轮 completed/error 残留的回 idle 挂起 timer，防其到期打断本轮同步
            clearPendingSyncIdle();
            useProgressStore.getState().setSyncStatus('syncing');
            useProgressStore.getState().setSyncProgress({ current: 0, total: 0 });
            useProgressStore.getState().setLastSyncSummary(null);

            try {
                const syncState = storageService.getSyncState();
                const syncOptions = {
                    mode: settings.syncMode || 'smart',
                    forceFull: options?.forceFull,
                    fullSyncIntervalDays: settings.fullSyncIntervalDays ?? 7,
                };
                const result = await githubService.syncRepos(
                    token,
                    repositories,
                    syncState,
                    (current, total) => {
                        useProgressStore.getState().setSyncProgress({ current, total });
                    },
                    syncOptions
                );

                logger.log('[Sync] 完成同步', {
                    mode: result.mode,
                    fetchedRepos: result.repos.length,
                    processedCount: result.processedCount,
                });

                // 取最新 state 作为合并基座（R4）：同步是长任务，期间批量分析/标签编辑可能已写入 store，
                // 用函数开头的闭包快照会用旧数据覆盖中途写入，导致 analyzedAt 丢失、触发重复分析
                const currentRepos = get().repositories;

                // 空结果守卫（R3）：全量同步"返回空列表但本地有数据"属异常（API 故障/限流误报），
                // 拦截以保护本地数据——否则所有仓库及 AI 分析状态会被整表清空。
                // 分支并发全量路径 syncAllRepos 首页为空时同样落入此守卫（该路径本体无守卫）
                if (result.mode === 'full' && result.repos.length === 0 && currentRepos.length > 0) {
                    throw new Error('同步返回空仓库列表，已中止以保护本地数据');
                }

                // 订阅单源：合并时从内存 subscribedRepoIds 取（loadRepositories/toggle 已与存储同步）
                const currentSubIds = get().subscribedRepoIds;
                const subscriptionIdList = Array.from(currentSubIds);

                const mergedRepos = result.mode === 'full'
                    ? mergeFullSyncedRepositories(result.repos, currentRepos, subscriptionIdList)
                    : mergeIncrementalRepositories(result.repos, currentRepos, subscriptionIdList);

                const prevIds = new Set(currentRepos.map((repo) => repo.id));
                const nextIds = new Set(mergedRepos.map((repo) => repo.id));
                const added = mergedRepos.reduce((acc, repo) => (prevIds.has(repo.id) ? acc : acc + 1), 0);
                const removed = currentRepos.reduce((acc, repo) => (nextIds.has(repo.id) ? acc : acc + 1), 0);

                // 全量同步时清理已取消 Star 仓库的残留订阅，避免幽灵订阅累积
                let nextSubscribedRepoIds = currentSubIds;
                if (result.mode === 'full') {
                    const prunedSubs = new Set(Array.from(currentSubIds).filter((id) => nextIds.has(id)));
                    if (prunedSubs.size !== currentSubIds.size) {
                        storageService.setReleaseSubscriptions(prunedSubs);
                        nextSubscribedRepoIds = prunedSubs;
                    }
                }

                const nextSyncState = githubService.buildSyncState(mergedRepos, syncState, result.mode);
                // F6：合并基座取最新 settings——同步是长任务，用开始时的闭包快照会
                // 静默回滚用户同步期间修改的语言/主题等设置（与 R4 同思想）
                const nextSettings = {
                    ...get().settings,
                    lastSyncTime: Date.now(),
                };

                storageService.setSettings(nextSettings);
                storageService.setSyncState(nextSyncState);

                set({
                    repositories: mergedRepos,
                    subscribedRepoIds: nextSubscribedRepoIds,
                    ...buildNoteIndex(mergedRepos),
                    settings: nextSettings,
                });
                useProgressStore.getState().setSyncError(null);
                useProgressStore.getState().setLastSyncSummary({
                    mode: result.mode,
                    added,
                    removed,
                    total: mergedRepos.length,
                });
                useProgressStore.getState().setSyncStatus('completed');
                useProgressStore.getState().setSyncProgress({
                    current: result.processedCount || mergedRepos.length,
                    total: result.processedCount || mergedRepos.length,
                });
                get().saveRepositories();

                scheduleSyncIdle(3000, () => useProgressStore.getState().setSyncStatus('idle'));
            } catch (error: any) {
                console.error('Sync failed:', error);
                useProgressStore.getState().setSyncError(error?.message || String(error));
                useProgressStore.getState().setSyncStatus('error');
                // error 态不可永驻：5s 后自动收敛回 idle
                scheduleSyncIdle(5000, () => useProgressStore.getState().setSyncStatus('idle'));
            }
        });

        return 'ok';
    },

    // 设置
    settings: { ...defaultSettings },
    loadSettings: () => {
        const saved = storageService.getSettings();
        const merged = { ...defaultSettings, ...saved };
        set({
            settings: merged,
            // 🆕 v1.6.4 同步持久化的排序设置到 searchFilter（修复排序不记忆）
            searchFilter: {
                ...get().searchFilter,
                sortBy: merged.defaultSortBy || 'stars',
                sortOrder: merged.defaultSortOrder || 'desc',
            },
        });
    },
    saveSettings: (settings) => {
        const merged = { ...get().settings, ...settings };
        storageService.setSettings(merged);
        set({ settings: merged });
    },
    token: null,
    loadToken: () => {
        const token = storageService.getToken();
        set({ token });
    },

    // AI 分析
    analyzingRepo: null,
    setAnalyzingRepo: (fullName) => set({ analyzingRepo: fullName }),

    // 🆕 v1.3.0 批量 AI 分析（进度状态在 useProgressStore）

    startAutoAnalyze: async (isAutoTriggered = false) => {
        const { repositories, token, settings } = get();
        const progress = useProgressStore.getState();

        // 防止重复分析
        if (progress.analyzeAbortController || progress.isAnalyzing) return 'ok';
        if (!token) return 'no-token';

        // busy 互斥：同步 / 版本检查进行中时不硬闯（避免并发写 repos/releases 存储）。
        // 自动分析"迟早要跑"：排队延时重试而非静默丢弃，互斥释放后自动补跑
        if (progress.isJobBusy('analyze')) {
            logger.log('[startAutoAnalyze] 同步或版本检查进行中，已排队稍后重试');
            scheduleAutoAnalyzeRetry({
                shouldContinue: () => !isAutoTriggered || Boolean(useStore.getState().settings?.autoAnalyzeOnOpen),
                run: () => useStore.getState().startAutoAnalyze(isAutoTriggered),
            });
            return 'busy';
        }
        clearAutoAnalyzeRetry(); // 真正开始分析，取消挂起的互斥重试

        // 🆕 v1.6.2 使用公共函数筛选需要分析的仓库
        const toAnalyze = repositories.filter(r => {
            const { needsAnalyze } = checkAnalysisNeeded(r);
            return needsAnalyze;
        });

        if (toAnalyze.length === 0) {
            window.githubStarsAPI.showNotification(
                settings.language === 'zh' ? '没有需要分析的仓库' : 'No repos to analyze'
            );
            return 'ok';
        }

        const controller = new AbortController();
        const startState = useProgressStore.getState();
        startState.setAnalyzing(true);
        startState.setAnalyzeAbortController(controller);
        startState.setAnalyzeProgress({ current: 0, total: toAnalyze.length, currentRepo: '' });

        try {
            const concurrency = settings.aiConcurrency || 1;
            const language = (settings.language || 'zh') as 'zh' | 'en';
            markAiBatchStart();
            const updated = await aiService.batchAnalyze(
                toAnalyze,
                token,
                (current, total, repo) => {
                    useProgressStore.getState().setAnalyzeProgress({
                        current,
                        total,
                        currentRepo: repo.fullName,
                    });

                    const aiPatch = {
                        aiSummary: repo.aiSummary,
                        aiTags: repo.aiTags,
                        aiPlatforms: repo.aiPlatforms,
                        analyzedAt: repo.analyzedAt,
                        analysisFailed: repo.analysisFailed,
                    };
                    const repos = get().repositories;
                    const idx = repos.findIndex(r => r.id === repo.id);
                    if (idx !== -1) {
                        const next = [...repos];
                        next[idx] = { ...repos[idx], ...aiPatch };
                        set({ repositories: next });
                    }

                    queueAiPatch(repo.id, aiPatch);
                },
                language,
                concurrency,
                settings.aiModel || undefined,
                !!settings.aiThinking,
                controller.signal
            );

            // 被中止的批次跳过收尾（R1）：stopAnalyze 已同步复位并冲刷部分结果；
            // 若 abort 后 promise 延迟 settle，此处无条件执行会用旧批次的 updated 覆盖
            // 新批次/已完成批次写入的状态与落盘数据（含误标 analysisFailed）
            if (!controller.signal.aborted) {
                // 合并 AI 分析结果到仓库数据。
                // 阶段3 起 batchAnalyze 返回新对象（不再原地突变传入的 repo），
                // 此处逐字段 spread 合并生成新的 repositories 数组/对象，
                // Zustand 订阅与 memo 组件按引用稳定刷新，搜索索引 WeakMap 同步失效。
                // R4：合并基座取最新 state（长任务期间同步/标签编辑可能已写入）
                const updatedById = new Map(updated.map(repo => [repo.id, repo]));
                const nextRepositories = get().repositories.map(repo => {
                    const updatedRepo = updatedById.get(repo.id);
                    if (!updatedRepo) return repo;

                    return {
                        ...repo,
                        aiSummary: updatedRepo.aiSummary,
                        aiTags: updatedRepo.aiTags,
                        aiPlatforms: updatedRepo.aiPlatforms,
                        analyzedAt: updatedRepo.analyzedAt,
                        analysisFailed: updatedRepo.analysisFailed,
                    };
                });

                set({ repositories: nextRepositories });
                // v2 批量增量落盘：只重写 AI 字段所在的受影响分片（替代全量 setRepositories）。
                // 批次收尾一并冲刷 C4 缓冲中尚未落盘的窗口
                storageService.patchReposBatch(
                    updated.map(repo => ({
                        id: repo.id,
                        patch: {
                            aiSummary: repo.aiSummary,
                            aiTags: repo.aiTags,
                            aiPlatforms: repo.aiPlatforms,
                            analyzedAt: repo.analyzedAt,
                            analysisFailed: repo.analysisFailed,
                        },
                    }))
                );
                flushAiPatches();

                // 更新统计信息
                const successCount = updated.filter(r => !r.analysisFailed).length;
                const failCount = updated.filter(r => r.analysisFailed).length;
                useProgressStore.getState().setAnalyzeStats({
                    lastAnalyzeAt: new Date().toISOString(),
                    totalAnalyzed: updated.length,
                    successCount,
                    failCount,
                });

                // 显示完成提示（quotaHint：连续失败熔断时提示疑似额度耗尽）
                const quotaHint = failCount >= 5
                    ? (settings.language === 'zh' ? '（连续失败已自动停止，疑似 AI 额度耗尽）' : ' (auto-stopped after repeated failures, AI quota may be exhausted)')
                    : '';
                window.githubStarsAPI.showNotification(
                    settings.language === 'zh'
                        ? `分析完成：${successCount} 成功，${failCount} 失败${quotaHint}`
                        : `Analysis complete: ${successCount} success, ${failCount} failed${quotaHint}`
                );
            }

        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                console.error('Auto analyze failed:', error);
            }
        } finally {
            // H1 token 守卫：仅当进度 store 中的 controller 仍是本次批次时才复位，
            // 避免被中止批次的收尾逻辑覆盖用户新启动批次的状态
            if (useProgressStore.getState().analyzeAbortController === controller) {
                const finishState = useProgressStore.getState();
                finishState.setAnalyzing(false);
                finishState.setAnalyzeAbortController(null);
                finishState.setAnalyzeProgress(null);
            }
        }

        return 'ok';
    },

    stopAnalyze: () => {
        const { settings } = get();
        const { analyzeAbortController } = useProgressStore.getState();
        if (!analyzeAbortController) return;

        // 1. 先中止批次循环（R1/H1）：此后被中止的 AI 调用 reject 时 signal.aborted 已为 true，不会误标 analysisFailed
        analyzeAbortController.abort();
        // 2. 中止进行中的 utools.ai 调用（官方 PromiseLike.abort()，最多并发 5 个）
        window.githubStarsAPI.abortAiCall?.();
        // 3. 同步复位状态（H1：官方未保证 abort 后 promise 会 settle，不能依赖 startAutoAnalyze 的 finally）
        useProgressStore.getState().setAnalyzing(false);
        useProgressStore.getState().setAnalyzeAbortController(null);
        useProgressStore.getState().setAnalyzeProgress(null);
        // 4. 落盘已分析的部分结果（R5/C4：中止时冲刷累积缓冲——已消耗能量的结果不能丢）
        flushAiPatches();
        window.githubStarsAPI.showNotification(
            settings.language === 'zh' ? '分析已中止' : 'Analysis stopped'
        );
    },

    getAvailablePlatforms: () => {
        const { repositories } = get();
        const platforms = new Set<string>();
        repositories.forEach(repo => {
            repo.aiPlatforms?.forEach(p => platforms.add(p));
        });
        return Array.from(platforms).sort();
    },

    // 分页
    currentPageNum: 1,
    setCurrentPageNum: (page) => set({ currentPageNum: page }),

    // 首页滚动位置记忆
    homeScrollMemory: null,
    setHomeScrollMemory: (memory) => set({ homeScrollMemory: memory }),

    // ========== 🆕 v1.1.0 标签管理 ==========
    tags: [],
    tagById: new Map<string, Tag>(),
    loadTags: () => {
        const tags = storageService.getTags();
        set({ tags, tagById: buildTagMap(tags) });
    },
    setTags: (tags) => {
        storageService.setTags(tags);
        set({ tags, tagById: buildTagMap(tags) });
    },
    addTag: (tagData) => {
        const newTag = storageService.addTag(tagData);
        set((state) => {
            const tags = [...state.tags, newTag];
            return { tags, tagById: buildTagMap(tags) };
        });
        return newTag;
    },
    updateTag: (id, updates) => {
        const updated = storageService.updateTag(id, updates);
        if (updated) {
            set((state) => {
                const tags = state.tags.map((t) => (t.id === id ? updated : t));
                return { tags, tagById: buildTagMap(tags) };
            });
        }
        return updated;
    },
    deleteTag: (id) => {
        // v2 preload 为 async（单次读 + 一次原子写入）；失败不吞，记录错误
        storageService.deleteTag(id).catch((error) => {
            console.error('[deleteTag] 删除标签失败:', error);
        });
        set((state) => {
            const tags = state.tags.filter((t) => t.id !== id);
            return {
                tags,
                tagById: buildTagMap(tags),
                // 直接更新仓库中的 customTags，避免重新加载导致页面闪烁
                repositories: state.repositories.map((r) => ({
                    ...r,
                    customTags: (r.customTags || []).filter((t) => t !== id),
                })),
            };
        });
    },
    reorderTags: (tagIds) => {
        storageService.reorderTags(tagIds);
        get().loadTags();
    },

    // ========== 🆕 v1.1.0 笔记管理 ==========
    currentNote: null,
    noteRepoIds: new Set<number>(),
    noteContentByRepoId: new Map<number, string>(),
    noteByRepoId: new Map<number, RepositoryNote>(),
    loadNoteIndex: () => {
        const { repositories } = get();
        set(buildNoteIndex(repositories));
    },
    hasRepoNote: (repoId) => get().noteRepoIds.has(repoId),
    loadNote: (repoId) => {
        const note = storageService.getNote(repoId);
        set({ currentNote: note });
    },
    saveNote: (repoId, content) => {
        const note = storageService.setNote(repoId, content);
        set((state) => {
            const noteRepoIds = new Set(state.noteRepoIds);
            const noteContentByRepoId = new Map(state.noteContentByRepoId);
            const noteByRepoId = new Map(state.noteByRepoId);
            noteRepoIds.add(repoId);
            noteContentByRepoId.set(repoId, note.content || '');
            noteByRepoId.set(repoId, note);
            return { currentNote: note, noteRepoIds, noteContentByRepoId, noteByRepoId };
        });
        return note;
    },
    deleteNote: (repoId) => {
        storageService.deleteNote(repoId);
        set((state) => {
            const noteRepoIds = new Set(state.noteRepoIds);
            const noteContentByRepoId = new Map(state.noteContentByRepoId);
            const noteByRepoId = new Map(state.noteByRepoId);
            noteRepoIds.delete(repoId);
            noteContentByRepoId.delete(repoId);
            noteByRepoId.delete(repoId);
            return { currentNote: null, noteRepoIds, noteContentByRepoId, noteByRepoId };
        });
    },

    // ========== 🆕 v1.1.0 视图模式 ==========
    viewMode: 'card',
    setViewMode: (mode) => {
        set({ viewMode: mode });
        get().saveSettings({ defaultView: mode });
    },

    // 更新仓库
    updateRepository: (id, updates) => {
        set((state) => ({
            repositories: state.repositories.map((r) =>
                r.id === id ? { ...r, ...updates } : r
            ),
        }));
        // v2 单仓库增量落盘：只重写该仓库所在分片（替代全量 saveRepositories）
        storageService.patchRepo(id, updates);
    },

    // 批量加标签
    batchAddTag: (repoIds, tagId) => {
        if (repoIds.length === 0) return;
        const targetIds = new Set(repoIds);
        const updates: Array<{ id: number; patch: Partial<Repository> }> = [];
        set((state) => ({
            repositories: state.repositories.map((repo) => {
                if (!targetIds.has(repo.id)) return repo;
                const current = repo.customTags || [];
                if (current.includes(tagId)) return repo;
                const customTags = [...current, tagId];
                updates.push({ id: repo.id, patch: { customTags } });
                return { ...repo, customTags };
            }),
        }));
        if (updates.length > 0) {
            storageService.patchReposBatch(updates);
        }
    },

    // 批量移除标签
    batchRemoveTag: (repoIds, tagId) => {
        if (repoIds.length === 0) return;
        const targetIds = new Set(repoIds);
        const updates: Array<{ id: number; patch: Partial<Repository> }> = [];
        set((state) => ({
            repositories: state.repositories.map((repo) => {
                if (!targetIds.has(repo.id)) return repo;
                const current = repo.customTags || [];
                if (!current.includes(tagId)) return repo;
                const customTags = current.filter((id) => id !== tagId);
                updates.push({ id: repo.id, patch: { customTags } });
                return { ...repo, customTags };
            }),
        }));
        if (updates.length > 0) {
            storageService.patchReposBatch(updates);
        }
    },

    // 批量设置版本订阅状态
    batchSetSubscription: (repoIds, subscribed) => {
        if (repoIds.length === 0) return;
        const targetIds = new Set(repoIds);
        const nextSubscribedIds = new Set(get().subscribedRepoIds);
        for (const id of repoIds) {
            if (subscribed) {
                nextSubscribedIds.add(id);
            } else {
                nextSubscribedIds.delete(id);
            }
        }
        storageService.setReleaseSubscriptions(nextSubscribedIds);
        set((state) => ({
            subscribedRepoIds: nextSubscribedIds,
            repositories: state.repositories.map((repo) =>
                targetIds.has(repo.id) ? { ...repo, isSubscribed: subscribed } : repo
            ),
        }));
    },

    // 过滤后的仓库（使用优化后的筛选管道 v1.7.0）
    getFilteredRepos: () => {
        const { repositories, searchFilter, noteRepoIds, noteContentByRepoId } = get();
        return Benchmark.timeOnce('render:getFilteredRepos', () => {
            const pipeline = createFilteredReposPipeline(searchFilter, {
                hasNote: (repoId) => noteRepoIds.has(repoId),
                getNoteContent: (repoId) => noteContentByRepoId.get(repoId) || '',
            });
            return pipeline(repositories);
        });
    },

    // ========== 🆕 v1.4.0 版本追踪 ==========
    releases: [],
    releaseFilter: { ...defaultReleaseFilter },
    subscribedRepoIds: new Set<number>(), // 🆕 阶段3 订阅单源（loadRepositories 时装载）
    togglingSubscriptions: new Set<number>(), // 🆕 v1.6.0 正在切换订阅的仓库 ID（防竞态）

    loadReleases: () => {
        const stored = storageService.getReleases();
        const readIds = storageService.getReadReleaseIds();
        // 计算已读状态
        const releasesWithReadStatus = stored.map(r => ({
            ...r,
            isRead: readIds.has(r.id),
        }));
        set({ releases: releasesWithReadStatus });
    },

    saveReleases: () => {
        const { releases } = get();
        // 清理过期缓存
        const cleaned = releaseService.cleanupCache(releases);
        storageService.setReleases(cleaned);
    },

    checkReleaseUpdates: async () => {
        const { token, repositories, settings } = get();
        const progress = useProgressStore.getState();
        const { releaseCheckStatus } = progress;

        logger.log('[ReleaseCheck] 开始检查版本更新', {
            checking: releaseCheckStatus.checking,
            hasToken: !!token,
        });

        if (releaseCheckStatus.checking) return;
        if (!token) return;

        // busy 互斥：同步 / AI 分析进行中时跳过，避免并发写 repos/releases 存储
        if (progress.isJobBusy('releaseCheck')) {
            logger.log('[ReleaseCheck] 同步或 AI 分析进行中，跳过本次版本检查');
            return;
        }

        // 获取订阅的仓库（订阅单源：内存 subscribedRepoIds）
        const subscribedRepoIds = get().subscribedRepoIds;
        logger.log('[ReleaseCheck] 订阅的仓库ID列表', Array.from(subscribedRepoIds));
        if (subscribedRepoIds.size === 0) return;

        useProgressStore.getState().patchReleaseCheckStatus({
            checking: true,
            error: null,
        });

        try {
            // 注：原 onProgress 回调内是 spread 等值的空 set（无实际效果），已删除
            const { updates, errors } = await releaseService.checkSubscribedRepos(
                Array.from(subscribedRepoIds),
                token,
                repositories.map(r => ({ id: r.id, fullName: r.fullName }))
            );

            logger.log('[ReleaseCheck] API返回结果', {
                updatesCount: updates.length,
                errorsCount: errors.length,
                updates: updates.map(u => ({
                    repoId: u.repository.id,
                    repoName: u.repository.fullName,
                    releaseId: u.id,
                    tagName: u.tagName,
                })),
            });

            if (updates.length > 0) {
                // 🆕 v1.5.1 方案3: 构建本地已知仓库 ID 集合，区分"首次获取"和"真正更新"
                const storedReleases = storageService.getReleases();
                const knownRepoIds = new Set(storedReleases.map(r => r.repository.id));

                logger.log('[ReleaseCheck] 本地已缓存的版本数据', {
                    storedCount: storedReleases.length,
                    knownRepoIds: Array.from(knownRepoIds),
                    storedReleases: storedReleases.map(r => ({
                        repoId: r.repository.id,
                        repoName: r.repository.fullName,
                        releaseId: r.id,
                        tagName: r.tagName,
                    })),
                });

                // 只通知真正的新版本（排除首次获取）
                const realUpdates = updates.filter(update => knownRepoIds.has(update.repository.id));

                logger.log('[ReleaseCheck] 过滤结果', {
                    updatesCount: updates.length,
                    knownRepoIdsCount: knownRepoIds.size,
                    realUpdatesCount: realUpdates.length,
                    realUpdates: realUpdates.map(u => ({
                        repoId: u.repository.id,
                        repoName: u.repository.fullName,
                        releaseId: u.id,
                        isKnown: knownRepoIds.has(u.repository.id),
                    })),
                });

                // 更新本地缓存
                const currentReleases = get().releases;
                const allReleases = [...updates, ...currentReleases];
                const cleaned = releaseService.cleanupCache(allReleases);

                // 保存到存储
                storageService.setReleases(cleaned);

                // 更新状态
                const readIds = storageService.getReadReleaseIds();
                const releasesWithReadStatus = cleaned.map(r => ({
                    ...r,
                    isRead: readIds.has(r.id),
                }));

                set({ releases: releasesWithReadStatus });
                useProgressStore.getState().setReleaseCheckStatus({
                    lastCheckedAt: new Date().toISOString(),
                    checking: false,
                    newCount: realUpdates.length, // 使用 realUpdates 计数
                    error: null,
                });

                // 🆕 v1.5.1: 只对真正的新版本发送通知
                if (realUpdates.length > 0) {
                    set({ releasesInitialTab: 'updates' });

                    if (realUpdates.length === 1) {
                        const release = realUpdates[0];
                        window.githubStarsAPI.showNotification(
                            settings.language === 'zh'
                                ? `${release.repository.fullName} 发布了新版本 ${release.tagName}`
                                : `${release.repository.fullName} released ${release.tagName}`,
                            'github-stars'
                        );
                    } else {
                        window.githubStarsAPI.showNotification(
                            settings.language === 'zh'
                                ? `${realUpdates.length} 个仓库有新版本更新`
                                : `${realUpdates.length} repos have new releases`,
                            'github-stars'
                        );
                    }
                }
            } else {
                useProgressStore.getState().setReleaseCheckStatus({
                    lastCheckedAt: new Date().toISOString(),
                    checking: false,
                    newCount: 0,
                    error: null,
                });
            }

            // 记录错误（如果有）
            if (errors.length > 0) {
                logger.warn('[Release Check] Some repos failed:', errors);
            }

        } catch (error) {
            console.error('[Release Check] Failed:', error);
            useProgressStore.getState().patchReleaseCheckStatus({
                checking: false,
                error: (error as Error).message,
            });
        }
    },

    markReleaseRead: (releaseId: number) => {
        const { releases } = get();
        const readIds = storageService.getReadReleaseIds();

        if (!readIds.has(releaseId)) {
            readIds.add(releaseId);
            storageService.setReadReleaseIds(readIds);
        }

        set({
            releases: releases.map(r =>
                r.id === releaseId ? { ...r, isRead: true } : r
            ),
        });
        useProgressStore.getState().patchReleaseCheckStatus({
            newCount: Math.max(0, useProgressStore.getState().releaseCheckStatus.newCount - 1),
        });
    },

    markAllReleasesRead: () => {
        const { releases } = get();
        // 🆕 v1.6.2 只将已订阅仓库的 Release 标记为已读（订阅单源：内存 Set）
        const subscribedRepoIds = get().subscribedRepoIds;
        const subscribedReleases = releases.filter(r => subscribedRepoIds.has(r.repository.id));
        const allIds = subscribedReleases.map(r => r.id);
        storageService.setReadReleaseIds(new Set(allIds));

        set({
            releases: releases.map(r => subscribedRepoIds.has(r.repository.id) ? { ...r, isRead: true } : r),
        });
        useProgressStore.getState().patchReleaseCheckStatus({ newCount: 0 });
    },

    getUnreadCount: () => {
        const { releases, subscribedRepoIds } = get();
        // 🆕 v1.6.2 仅统计已订阅仓库的未读更新，避免退订后仍有未读角标
        // 阶段3 起纯派生：releases + 内存订阅 Set，不读存储
        return releases.filter(r => !r.isRead && subscribedRepoIds.has(r.repository.id)).length;
    },

    setReleaseFilter: (filter: Partial<ReleaseFilter>) => {
        set((state) => ({
            releaseFilter: { ...state.releaseFilter, ...filter },
        }));
    },

    // ========== 🆕 v1.5.0 订阅管理 ==========
    getSubscribedRepos: () => {
        const { repositories, subscribedRepoIds } = get();
        // 过滤出存在的仓库（清理无效订阅）
        const validIds = Array.from(subscribedRepoIds).filter(id => repositories.some(r => r.id === id));
        // 如果有无效订阅，自动清理（存储 + 内存单源同步更新）
        if (validIds.length !== subscribedRepoIds.size) {
            const cleaned = new Set(validIds);
            storageService.setReleaseSubscriptions(cleaned);
            set({ subscribedRepoIds: cleaned });
            return repositories.filter(r => cleaned.has(r.id));
        }
        return repositories.filter(r => subscribedRepoIds.has(r.id));
    },

    // 🆕 v1.6.0: 乐观更新 + 后台异步获取基准版本（解决订阅按钮延迟问题）
    // 🔧 v1.6.2: 修复取消订阅被锁阻止的问题，将锁检查移至新订阅分支内部
    // 🔧 阶段3: 订阅单源化——同步维护内存 subscribedRepoIds 与 repositories[].isSubscribed
    //          （不可变更新），组件不再需要渲染期直读存储表或 subscriptionVersion
    toggleSubscription: (repoId: number) => {
        logger.log('[toggleSubscription] 开始', { repoId });

        const currentIds = get().subscribedRepoIds;
        const isSubscribed = currentIds.has(repoId);

        logger.log('[toggleSubscription] 当前订阅状态', {
            当前订阅列表: Array.from(currentIds),
            是否已订阅: isSubscribed,
            操作: isSubscribed ? '取消订阅' : '添加订阅',
        });

        if (!isSubscribed) {
            // ========== 新订阅：乐观更新 ==========

            // 🔧 只对新订阅检查锁（取消订阅是同步操作，不需要锁保护）
            const togglingSet = get().togglingSubscriptions;
            if (togglingSet.has(repoId)) {
                logger.log('[toggleSubscription] 新订阅正在处理中，跳过', { repoId });
                return;
            }

            // 1️⃣ 立即更新订阅状态（乐观更新：存储 + 内存单源 + 仓库派生字段）
            const nextIds = new Set(currentIds);
            nextIds.add(repoId);
            storageService.setReleaseSubscriptions(nextIds);
            logger.log('[toggleSubscription] 订阅列表已更新（乐观）', { 新订阅列表: Array.from(nextIds) });

            set((state) => ({
                subscribedRepoIds: nextIds,
                repositories: state.repositories.map(r =>
                    r.id === repoId ? { ...r, isSubscribed: true } : r
                ),
            }));

            // 2️⃣ 后台异步获取基准版本（不阻塞 UI）
            const repo = get().repositories.find(r => r.id === repoId);
            const token = get().token;

            if (repo && token) {
                // 设置状态锁
                set((state) => ({
                    togglingSubscriptions: new Set([...state.togglingSubscriptions, repoId])
                }));

                const [owner, name] = repo.fullName.split('/');
                releaseService.getLatestRelease(owner, name, token)
                    .then(latestRelease => {
                        if (latestRelease) {
                            logger.log('[toggleSubscription] 后台获取基准版本成功', {
                                repoFullName: repo.fullName,
                                releaseId: latestRelease.id,
                                tagName: latestRelease.tagName
                            });

                            const currentReleases = get().releases;
                            const newRelease = {
                                ...latestRelease,
                                repository: { id: repoId, fullName: repo.fullName, name }
                            };

                            const existingIndex = currentReleases.findIndex(r => r.repository.id === repoId);
                            let updatedReleases: Release[];

                            if (existingIndex !== -1) {
                                updatedReleases = [...currentReleases];
                                updatedReleases[existingIndex] = newRelease;
                            } else {
                                updatedReleases = [newRelease, ...currentReleases];
                            }

                            storageService.setReleases(updatedReleases);
                            set({ releases: updatedReleases });
                        }
                    })
                    .catch(error => {
                        logger.warn('[toggleSubscription] 后台获取基准版本失败:', error);
                        // 失败不影响订阅状态，静默降级
                    })
                    .finally(() => {
                        // 释放状态锁
                        set((state) => {
                            const newSet = new Set(state.togglingSubscriptions);
                            newSet.delete(repoId);
                            return { togglingSubscriptions: newSet };
                        });
                    });
            }
        } else {
            // ========== 取消订阅：立即生效（无锁检查）==========
            const nextIds = new Set(currentIds);
            nextIds.delete(repoId);
            storageService.setReleaseSubscriptions(nextIds);
            logger.log('[toggleSubscription] 取消订阅成功', { 新订阅列表: Array.from(nextIds) });

            set((state) => ({
                subscribedRepoIds: nextIds,
                repositories: state.repositories.map(r =>
                    r.id === repoId ? { ...r, isSubscribed: false } : r
                ),
            }));
        }
    },

    clearAllSubscriptions: () => {
        storageService.setReleaseSubscriptions(new Set<number>());
        // 同步清理内存单源与 Repository 对象上的 isSubscribed（不可变更新触发响应）
        set((state) => ({
            subscribedRepoIds: new Set<number>(),
            repositories: state.repositories.map(r => ({
                ...r,
                isSubscribed: false,
            })),
        }));
    },
}));
