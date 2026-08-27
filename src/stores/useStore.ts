import { create } from 'zustand';
import type { Repository, PageName, SearchFilter, Settings, Tag, RepositoryNote, ViewMode, SortBy, SortOrder, Release, ReleaseFilter } from '../types';
import { storageService } from '../services/storageService';
import { githubService } from '../services/githubService';
import { aiService } from '../services/aiService';
import { releaseService } from '../services/releaseService';
import { PLATFORM_NONE } from '../constants/platforms';
import { checkAnalysisNeeded } from '../utils/analysis';
import { createFilteredReposPipeline } from './selectors';
import { useProgressStore } from './useProgressStore';
import { logger } from '../utils/logger';
import { Benchmark } from '../utils/benchmark';

interface AppState {
    // 页面导航
    currentPage: PageName;
    setCurrentPage: (page: PageName) => void;

    // 仓库列表
    repositories: Repository[];
    setRepositories: (repos: Repository[]) => void;
    loadRepositories: () => void;
    saveRepositories: () => void;

    // 当前选中仓库
    selectedRepo: Repository | null;
    setSelectedRepo: (repo: Repository | null) => void;

    // 搜索过滤
    searchFilter: SearchFilter;
    setSearchFilter: (filter: Partial<SearchFilter>) => void;

    // 同步（进度状态 syncStatus/syncProgress/syncError 已迁至 useProgressStore，避免双源）
    syncRepositories: () => Promise<void>; // 🆕 v1.6.3 同步方法移至 store（支持全局调用）

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
    startAutoAnalyze: () => Promise<void>;
    stopAnalyze: () => void;
    getAvailablePlatforms: () => string[];

    // 分页
    currentPageNum: number;
    setCurrentPageNum: (page: number) => void;

    // ========== 🆕 v1.1.0 标签管理 ==========
    tags: Tag[];
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
    getSubscribedRepos: () => Repository[];           // 获取已订阅仓库（派生）
    toggleSubscription: (repoId: number) => void;     // 切换订阅状态（v1.6.0 乐观更新）
    clearAllSubscriptions: () => void;                // 清空所有订阅
    subscriptionVersion: number;                       // 订阅版本号（用于触发响应式更新）
    togglingSubscriptions: Set<number>;               // 🆕 v1.6.0 正在切换订阅的仓库 ID（防竞态）
    releasesInitialTab?: 'updates' | 'subscriptions'; // 🆕 v1.5.0 设置页跳转到版本页时的初始 Tab
    setReleasesInitialTab: (tab?: 'updates' | 'subscriptions') => void;
}

const defaultFilter: SearchFilter = {
    keyword: '',
    languages: [],
    topics: [],
    aiTags: [],
    customTags: [],
    platforms: [],  // 🆕 v1.3.0
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

function mergeRepoWithExistingData(
    newRepo: Repository,
    existing: Repository | undefined,
    isSubscribed: boolean,
): Repository {
    if (!existing) {
        return {
            ...newRepo,
            customTags: newRepo.customTags || [],
            isSubscribed,
        };
    }

    return {
        ...newRepo,
        aiSummary: existing.aiSummary,
        aiTags: existing.aiTags,
        aiPlatforms: existing.aiPlatforms,
        analyzedAt: existing.analyzedAt,
        analysisFailed: existing.analysisFailed,
        alias: existing.alias,
        customTags: existing.customTags || [],
        customDescription: existing.customDescription,
        isSubscribed,
    };
}

function mergeFullSyncedRepositories(
    fetchedRepos: Repository[],
    existingRepos: Repository[],
    subscriptionIds: number[],
): Repository[] {
    const existingMap = new Map(existingRepos.map((repo) => [repo.id, repo]));
    return fetchedRepos.map((repo) =>
        mergeRepoWithExistingData(repo, existingMap.get(repo.id), subscriptionIds.includes(repo.id))
    );
}

function mergeIncrementalRepositories(
    fetchedRepos: Repository[],
    existingRepos: Repository[],
    subscriptionIds: number[],
): Repository[] {
    const existingMap = new Map(existingRepos.map((repo) => [repo.id, repo]));
    const fetchedMap = new Map(fetchedRepos.map((repo) => [repo.id, repo]));

    const newRepos = fetchedRepos
        .filter((repo) => !existingMap.has(repo.id))
        .map((repo) => mergeRepoWithExistingData(repo, undefined, subscriptionIds.includes(repo.id)));

    const mergedExisting = existingRepos.map((repo) => {
        const updatedRepo = fetchedMap.get(repo.id);
        if (!updatedRepo) {
            return {
                ...repo,
                isSubscribed: subscriptionIds.includes(repo.id),
            };
        }

        return mergeRepoWithExistingData(updatedRepo, repo, subscriptionIds.includes(repo.id));
    });

    return [...newRepos, ...mergedExisting];
}

function buildNoteIndex(repositories: Repository[]): {
    noteRepoIds: Set<number>;
    noteContentByRepoId: Map<number, string>;
} {
    const validRepoIds = new Set(repositories.map((repo) => repo.id));
    const noteRepoIds = new Set<number>();
    const noteContentByRepoId = new Map<number, string>();

    for (const note of storageService.getAllNotes()) {
        if (!validRepoIds.has(note.repoId)) continue;

        noteRepoIds.add(note.repoId);
        noteContentByRepoId.set(note.repoId, note.content || '');
    }

    return { noteRepoIds, noteContentByRepoId };
}

export const useStore = create<AppState>((set, get) => ({
    // 页面导航
    currentPage: 'home',
    setCurrentPage: (page) => set({ currentPage: page }),
    releasesInitialTab: undefined,
    setReleasesInitialTab: (tab) => set({ releasesInitialTab: tab }),

    // 仓库列表
    repositories: [],
    setRepositories: (repos) => set({ repositories: repos, ...buildNoteIndex(repos) }),
    loadRepositories: () => {
        Benchmark.timeOnce('startup:loadRepositories', () => {
            const repos = storageService.getRepositories();
            // 订阅状态同步机制说明:
            // - 主数据源: gh:releaseSubscriptions (独立数组存储)
            // - 派生数据: Repository.isSubscribed (便于 UI 快速访问)
            // - 此处从 dbStorage 同步订阅状态到 Repository 对象
            // - 详见: docs/design/design-release-tracking.md §4.1 数据模型
            const subscriptionIds = storageService.getReleaseSubscriptions();
            const migrated = repos.map(r => ({
                ...r,
                customTags: r.customTags || [],
                isSubscribed: subscriptionIds.has(r.id),
            }));
            set({ repositories: migrated, ...buildNoteIndex(migrated) });
        });
    },
    saveRepositories: () => {
        storageService.setRepositories(get().repositories);
    },

    // 当前选中仓库
    selectedRepo: null,
    setSelectedRepo: (repo) => set({ selectedRepo: repo }),

    // 搜索过滤
    searchFilter: { ...defaultFilter },
    setSearchFilter: (filter) => {
        set((state) => ({
            searchFilter: { ...state.searchFilter, ...filter },
            currentPageNum: 1,
        }));

        // 🆕 v1.6.2 持久化排序设置到 settings
        if (filter.sortBy !== undefined || filter.sortOrder !== undefined) {
            const currentSettings = get().settings;
            const newSettings = {
                ...currentSettings,
                defaultSortBy: filter.sortBy ?? currentSettings.defaultSortBy,
                defaultSortOrder: filter.sortOrder ?? currentSettings.defaultSortOrder,
            };
            storageService.setSettings(newSettings);
            set({ settings: newSettings });
        }
    },

    // 🆕 v1.6.3 同步方法移至 store（支持从任意页面触发）
    syncRepositories: async () => {
        const { token, settings, repositories } = get();
        const progress = useProgressStore.getState();

        logger.log('[syncRepositories] 开始同步检查', {
            hasToken: !!token,
            syncStatus: progress.syncStatus,
        });

        if (!token || progress.syncStatus === 'syncing') return;

        // busy 互斥：AI 分析 / 版本检查进行中时跳过，避免并发写 repos/releases 存储
        if (progress.isJobBusy('sync')) {
            logger.log('[syncRepositories] AI 分析或版本检查进行中，跳过本次同步');
            return;
        }

        await Benchmark.timeOnceAsync('sync:syncRepositories', async () => {
            useProgressStore.getState().setSyncStatus('syncing');
            useProgressStore.getState().setSyncProgress({ current: 0, total: 0 });

            try {
                const syncState = storageService.getSyncState();
                const result = await githubService.syncRepos(token, repositories, syncState, (current, total) => {
                    useProgressStore.getState().setSyncProgress({ current, total });
                });

                logger.log('[Sync] 完成同步', {
                    mode: result.mode,
                    fetchedRepos: result.repos.length,
                    processedCount: result.processedCount,
                });

                const subscriptionIds = storageService.getReleaseSubscriptions();
                const subscriptionIdList = Array.from(subscriptionIds);

                const mergedRepos = result.mode === 'full'
                    ? mergeFullSyncedRepositories(result.repos, repositories, subscriptionIdList)
                    : mergeIncrementalRepositories(result.repos, repositories, subscriptionIdList);

                const nextSyncState = githubService.buildSyncState(mergedRepos, syncState, result.mode);
                const nextSettings = {
                    ...settings,
                    lastSyncTime: Date.now(),
                };

                storageService.setSettings(nextSettings);
                storageService.setSyncState(nextSyncState);

                set({
                    repositories: mergedRepos,
                    ...buildNoteIndex(mergedRepos),
                    settings: nextSettings,
                });
                useProgressStore.getState().setSyncError(null);
                useProgressStore.getState().setSyncStatus('completed');
                useProgressStore.getState().setSyncProgress({
                    current: result.processedCount || mergedRepos.length,
                    total: result.processedCount || mergedRepos.length,
                });
                get().saveRepositories();

                setTimeout(() => useProgressStore.getState().setSyncStatus('idle'), 3000);
            } catch (error: any) {
                console.error('Sync failed:', error);
                useProgressStore.getState().setSyncError(error?.message || String(error));
                useProgressStore.getState().setSyncStatus('error');
            }
        });
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

    startAutoAnalyze: async () => {
        const { repositories, token, settings } = get();
        const progress = useProgressStore.getState();

        // 防止重复分析
        if (progress.analyzeAbortController || progress.isAnalyzing) return;
        if (!token) return;

        // busy 互斥：同步 / 版本检查进行中时跳过，避免并发写 repos/releases 存储
        if (progress.isJobBusy('analyze')) {
            logger.log('[startAutoAnalyze] 同步或版本检查进行中，跳过本次自动分析');
            return;
        }

        // 🆕 v1.6.2 使用公共函数筛选需要分析的仓库
        const toAnalyze = repositories.filter(r => {
            const { needsAnalyze } = checkAnalysisNeeded(r);
            return needsAnalyze;
        });

        if (toAnalyze.length === 0) {
            window.githubStarsAPI.showNotification(
                settings.language === 'zh' ? '没有需要分析的仓库' : 'No repos to analyze'
            );
            return;
        }

        const controller = new AbortController();
        const startState = useProgressStore.getState();
        startState.setAnalyzing(true);
        startState.setAnalyzeAbortController(controller);
        startState.setAnalyzeProgress({ current: 0, total: toAnalyze.length, currentRepo: '' });

        try {
            const concurrency = settings.aiConcurrency || 1;
            const language = (settings.language || 'zh') as 'zh' | 'en';
            const updated = await aiService.batchAnalyze(
                toAnalyze,
                token,
                (current, total, repo) => {
                    useProgressStore.getState().setAnalyzeProgress({
                        current,
                        total,
                        currentRepo: repo.fullName,
                    });
                },
                language,
                concurrency,
                settings.aiModel || undefined,
                controller.signal
            );

            // 不可变更新仓库数据，确保 Zustand 订阅和 memo 组件稳定刷新
            const updatedById = new Map(updated.map(repo => [repo.id, repo]));
            const nextRepositories = repositories.map(repo => {
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
            // v2 批量增量落盘：只重写 AI 字段所在的受影响分片（替代全量 setRepositories）
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

            // 更新统计信息
            const successCount = updated.filter(r => !r.analysisFailed).length;
            const failCount = updated.filter(r => r.analysisFailed).length;
            useProgressStore.getState().setAnalyzeStats({
                lastAnalyzeAt: new Date().toISOString(),
                totalAnalyzed: updated.length,
                successCount,
                failCount,
            });

            // 显示完成提示
            if (!controller.signal.aborted) {
                window.githubStarsAPI.showNotification(
                    settings.language === 'zh'
                        ? `分析完成：${successCount} 成功，${failCount} 失败`
                        : `Analysis complete: ${successCount} success, ${failCount} failed`
                );
            }

        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                console.error('Auto analyze failed:', error);
            }
        } finally {
            const finishState = useProgressStore.getState();
            finishState.setAnalyzing(false);
            finishState.setAnalyzeAbortController(null);
            finishState.setAnalyzeProgress(null);
        }
    },

    stopAnalyze: () => {
        const { settings } = get();
        const { analyzeAbortController } = useProgressStore.getState();
        if (analyzeAbortController) {
            analyzeAbortController.abort();
            window.githubStarsAPI.showNotification(
                settings.language === 'zh' ? '分析已中止' : 'Analysis stopped'
            );
        }
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

    // ========== 🆕 v1.1.0 标签管理 ==========
    tags: [],
    loadTags: () => {
        const tags = storageService.getTags();
        set({ tags });
    },
    setTags: (tags) => {
        storageService.setTags(tags);
        set({ tags });
    },
    addTag: (tagData) => {
        const newTag = storageService.addTag(tagData);
        set((state) => ({ tags: [...state.tags, newTag] }));
        return newTag;
    },
    updateTag: (id, updates) => {
        const updated = storageService.updateTag(id, updates);
        if (updated) {
            set((state) => ({
                tags: state.tags.map((t) => (t.id === id ? updated : t)),
            }));
        }
        return updated;
    },
    deleteTag: (id) => {
        // v2 preload 为 async（单次读 + 一次原子写入）；失败不吞，记录错误
        storageService.deleteTag(id).catch((error) => {
            console.error('[deleteTag] 删除标签失败:', error);
        });
        set((state) => ({
            tags: state.tags.filter((t) => t.id !== id),
            // 直接更新仓库中的 customTags，避免重新加载导致页面闪烁
            repositories: state.repositories.map((r) => ({
                ...r,
                customTags: (r.customTags || []).filter((t) => t !== id),
            })),
        }));
    },
    reorderTags: (tagIds) => {
        storageService.reorderTags(tagIds);
        get().loadTags();
    },

    // ========== 🆕 v1.1.0 笔记管理 ==========
    currentNote: null,
    noteRepoIds: new Set<number>(),
    noteContentByRepoId: new Map<number, string>(),
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
            noteRepoIds.add(repoId);
            noteContentByRepoId.set(repoId, note.content || '');
            return { currentNote: note, noteRepoIds, noteContentByRepoId };
        });
        return note;
    },
    deleteNote: (repoId) => {
        storageService.deleteNote(repoId);
        set((state) => {
            const noteRepoIds = new Set(state.noteRepoIds);
            const noteContentByRepoId = new Map(state.noteContentByRepoId);
            noteRepoIds.delete(repoId);
            noteContentByRepoId.delete(repoId);
            return { currentNote: null, noteRepoIds, noteContentByRepoId };
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
    subscriptionVersion: 0, // 订阅版本号，用于触发响应式更新
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

        // 获取订阅的仓库
        const subscribedRepoIds = storageService.getReleaseSubscriptions();
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
        // 🆕 v1.6.2 只将已订阅仓库的 Release 标记为已读
        const subscribedRepoIds = storageService.getReleaseSubscriptions();
        const subscribedReleases = releases.filter(r => subscribedRepoIds.has(r.repository.id));
        const allIds = subscribedReleases.map(r => r.id);
        storageService.setReadReleaseIds(new Set(allIds));

        set({
            releases: releases.map(r => subscribedRepoIds.has(r.repository.id) ? { ...r, isRead: true } : r),
        });
        useProgressStore.getState().patchReleaseCheckStatus({ newCount: 0 });
    },

    getUnreadCount: () => {
        const { releases } = get();
        // 🆕 v1.6.2 仅统计已订阅仓库的未读更新，避免退订后仍有未读角标
        const subscribedRepoIds = storageService.getReleaseSubscriptions();
        return releases.filter(r => !r.isRead && subscribedRepoIds.has(r.repository.id)).length;
    },

    setReleaseFilter: (filter: Partial<ReleaseFilter>) => {
        set((state) => ({
            releaseFilter: { ...state.releaseFilter, ...filter },
        }));
    },

    // ========== 🆕 v1.5.0 订阅管理 ==========
    getSubscribedRepos: () => {
        const { repositories } = get();
        const ids = storageService.getReleaseSubscriptions();
        // 过滤出存在的仓库（清理无效订阅）
        const validIds = Array.from(ids).filter(id => repositories.some(r => r.id === id));
        // 如果有无效订阅，自动清理
        if (validIds.length !== ids.size) {
            storageService.setReleaseSubscriptions(new Set(validIds));
        }
        const validIdSet = new Set(validIds);
        return repositories.filter(r => validIdSet.has(r.id));
    },

    // 🆕 v1.6.0: 乐观更新 + 后台异步获取基准版本（解决订阅按钮延迟问题）
    // 🔧 v1.6.2: 修复取消订阅被锁阻止的问题，将锁检查移至新订阅分支内部
    toggleSubscription: (repoId: number) => {
        logger.log('[toggleSubscription] 开始', { repoId });

        const ids = storageService.getReleaseSubscriptions();
        const isSubscribed = ids.has(repoId);

        logger.log('[toggleSubscription] 当前订阅状态', {
            当前订阅列表: Array.from(ids),
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

            // 1️⃣ 立即更新订阅状态（乐观更新）
            ids.add(repoId);
            storageService.setReleaseSubscriptions(ids);
            logger.log('[toggleSubscription] 订阅列表已更新（乐观）', { 新订阅列表: Array.from(ids) });

            // 2️⃣ 触发响应式更新
            set((state) => ({ subscriptionVersion: state.subscriptionVersion + 1 }));

            // 3️⃣ 后台异步获取基准版本（不阻塞 UI）
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
            ids.delete(repoId);
            storageService.setReleaseSubscriptions(ids);
            logger.log('[toggleSubscription] 取消订阅成功', { 新订阅列表: Array.from(ids) });
            set((state) => ({ subscriptionVersion: state.subscriptionVersion + 1 }));
        }
    },

    clearAllSubscriptions: () => {
        storageService.setReleaseSubscriptions(new Set<number>());
        // 同步清理 Repository 对象上的 isSubscribed 并触发响应式更新
        set((state) => ({
            subscriptionVersion: state.subscriptionVersion + 1,
            repositories: state.repositories.map(r => ({
                ...r,
                isSubscribed: false,
            })),
        }));
    },
}));
