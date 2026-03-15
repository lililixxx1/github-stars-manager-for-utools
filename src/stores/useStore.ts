import { create } from 'zustand';
import type { Repository, PageName, SearchFilter, Settings, Tag, RepositoryNote, ViewMode, SortBy, SortOrder, AnalyzeProgress, AnalyzeStats, Release, ReleaseCheckStatus, ReleaseFilter } from '../types';
import { storageService } from '../services/storageService';
import { githubService } from '../services/githubService';
import { aiService } from '../services/aiService';
import { releaseService } from '../services/releaseService';
import { PLATFORM_NONE } from '../constants/platforms';
import { checkAnalysisNeeded } from '../utils/analysis';
import { createFilteredReposPipeline } from './selectors';
import { logger } from '../utils/logger';

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

    // 同步状态
    syncStatus: 'idle' | 'syncing' | 'completed' | 'error';
    syncProgress: { current: number; total: number };
    syncError: string | null;
    setSyncStatus: (status: 'idle' | 'syncing' | 'completed' | 'error') => void;
    setSyncProgress: (progress: { current: number; total: number }) => void;
    setSyncError: (error: string | null) => void;
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

    // 🆕 v1.3.0 批量 AI 分析
    isAnalyzing: boolean;
    analyzeProgress: AnalyzeProgress | null;
    analyzeAbortController: AbortController | null;
    analyzeStats: AnalyzeStats | null;
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
    releaseCheckStatus: ReleaseCheckStatus;
    releaseFilter: ReleaseFilter;
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

export const useStore = create<AppState>((set, get) => ({
    // 页面导航
    currentPage: 'home',
    setCurrentPage: (page) => set({ currentPage: page }),
    releasesInitialTab: undefined,
    setReleasesInitialTab: (tab) => set({ releasesInitialTab: tab }),

    // 仓库列表
    repositories: [],
    setRepositories: (repos) => set({ repositories: repos }),
    loadRepositories: () => {
        const repos = storageService.getRepositories();
        // 订阅状态同步机制说明:
        // - 主数据源: gh:releaseSubscriptions (独立数组存储)
        // - 派生数据: Repository.isSubscribed (便于 UI 快速访问)
        // - 此处从 dbStorage 同步订阅状态到 Repository 对象
        // - 详见: docs/design/design-release-tracking.md §4.1 数据模型
        const subscriptionIds = window.githubStarsAPI.getReleaseSubscriptions();
        const migrated = repos.map(r => ({
            ...r,
            customTags: r.customTags || [],
            isSubscribed: subscriptionIds.includes(r.id),
        }));
        set({ repositories: migrated });
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

    // 同步状态
    syncStatus: 'idle',
    syncProgress: { current: 0, total: 0 },
    syncError: null,
    setSyncStatus: (status) => set({ syncStatus: status }),
    setSyncProgress: (progress) => set({ syncProgress: progress }),
    setSyncError: (error) => set({ syncError: error }),

    // 🆕 v1.6.3 同步方法移至 store（支持从任意页面触发）
    syncRepositories: async () => {
        const { token, syncStatus, settings, repositories } = get();
        const lang = (settings.language || 'zh') as 'zh' | 'en';

        logger.log('[syncRepositories] 开始同步检查', {
            hasToken: !!token,
            syncStatus,
        });

        if (!token || syncStatus === 'syncing') return;

        set({ syncStatus: 'syncing', syncProgress: { current: 0, total: 0 } });

        try {
            const repos = await githubService.syncAllRepos(token, (current, total) => {
                set({ syncProgress: { current, total } });
            });

            logger.log('[Sync] Got', repos.length, 'repos total');

            if (repos.length === 0) {
                set({
                    syncError: lang === 'zh'
                        ? '同步完成但未获取到仓库，请检查 Token 权限是否包含 Starring'
                        : 'Sync completed but no repos found. Check if your Token has Starring permission.',
                    syncStatus: 'error',
                });
                return;
            }

            // 合并已有的数据
            const existingMap = new Map(repositories.map((r) => [r.id, r]));
            const subscriptionIds = window.githubStarsAPI.getReleaseSubscriptions();
            const mergedRepos = repos.map((newRepo) => {
                const existing = existingMap.get(newRepo.id);
                if (existing) {
                    return {
                        ...newRepo,
                        aiSummary: existing.aiSummary,
                        aiTags: existing.aiTags,
                        aiPlatforms: existing.aiPlatforms,
                        analyzedAt: existing.analyzedAt,
                        analysisFailed: existing.analysisFailed,
                        alias: existing.alias,
                        customTags: existing.customTags || [],
                        customCategory: existing.customCategory,
                        userNotes: existing.userNotes,
                        customDescription: existing.customDescription,
                        isSubscribed: subscriptionIds.includes(newRepo.id),
                    };
                }
                return { ...newRepo, customTags: [], isSubscribed: subscriptionIds.includes(newRepo.id) };
            });

            set({ repositories: mergedRepos, syncError: null, syncStatus: 'completed' });
            get().saveRepositories();

            setTimeout(() => set({ syncStatus: 'idle' }), 3000);
        } catch (error: any) {
            console.error('Sync failed:', error);
            set({ syncError: error?.message || String(error), syncStatus: 'error' });
        }
    },

    // 设置
    settings: { ...defaultSettings },
    loadSettings: () => {
        const saved = storageService.getSettings();
        set({ settings: { ...defaultSettings, ...saved } });
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

    // 🆕 v1.3.0 批量 AI 分析
    isAnalyzing: false,
    analyzeProgress: null,
    analyzeAbortController: null,
    analyzeStats: null,

    startAutoAnalyze: async () => {
        const { repositories, token, settings, analyzeAbortController, isAnalyzing } = get();

        // 防止重复分析
        if (analyzeAbortController || isAnalyzing) return;

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
        set({
            isAnalyzing: true,
            analyzeAbortController: controller,
            analyzeProgress: { current: 0, total: toAnalyze.length, currentRepo: '' }
        });

        try {
            const concurrency = settings.aiConcurrency || 1;
            const language = (settings.language || 'zh') as 'zh' | 'en';
            const updated = await aiService.batchAnalyze(
                toAnalyze,
                token!,
                (current, total, repo) => {
                    set({
                        analyzeProgress: {
                            current,
                            total,
                            currentRepo: repo.fullName
                        }
                    });
                },
                language,
                concurrency,
                controller.signal
            );

            // 更新仓库数据
            const repoMap = new Map(repositories.map(r => [r.id, r]));
            updated.forEach(updatedRepo => {
                const existing = repoMap.get(updatedRepo.id);
                if (existing) {
                    Object.assign(existing, {
                        aiSummary: updatedRepo.aiSummary,
                        aiTags: updatedRepo.aiTags,
                        aiPlatforms: updatedRepo.aiPlatforms,
                        analyzedAt: updatedRepo.analyzedAt,
                        analysisFailed: updatedRepo.analysisFailed,
                    });
                }
            });

            // 保存到存储
            get().saveRepositories();

            // 更新统计信息
            const successCount = updated.filter(r => !r.analysisFailed).length;
            const failCount = updated.filter(r => r.analysisFailed).length;
            set({
                analyzeStats: {
                    lastAnalyzeAt: new Date().toISOString(),
                    totalAnalyzed: updated.length,
                    successCount,
                    failCount,
                }
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
            set({
                isAnalyzing: false,
                analyzeAbortController: null,
                analyzeProgress: null
            });
        }
    },

    stopAnalyze: () => {
        const { analyzeAbortController, settings } = get();
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
        const tags = window.githubStarsAPI.getTags();
        set({ tags });
    },
    setTags: (tags) => {
        window.githubStarsAPI.setTags(tags);
        set({ tags });
    },
    addTag: (tagData) => {
        const newTag = window.githubStarsAPI.addTag(tagData);
        set((state) => ({ tags: [...state.tags, newTag] }));
        return newTag;
    },
    updateTag: (id, updates) => {
        const updated = window.githubStarsAPI.updateTag(id, updates);
        if (updated) {
            set((state) => ({
                tags: state.tags.map((t) => (t.id === id ? updated : t)),
            }));
        }
        return updated;
    },
    deleteTag: (id) => {
        window.githubStarsAPI.deleteTag(id);
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
        window.githubStarsAPI.reorderTags(tagIds);
        get().loadTags();
    },

    // ========== 🆕 v1.1.0 笔记管理 ==========
    currentNote: null,
    loadNote: (repoId) => {
        const note = window.githubStarsAPI.getNote(repoId);
        set({ currentNote: note });
    },
    saveNote: (repoId, content) => {
        const note = window.githubStarsAPI.setNote(repoId, content);
        set({ currentNote: note });
        return note;
    },
    deleteNote: (repoId) => {
        window.githubStarsAPI.deleteNote(repoId);
        set({ currentNote: null });
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
        get().saveRepositories();
    },

    // 过滤后的仓库（使用优化后的筛选管道 v1.7.0）
    getFilteredRepos: () => {
        const { repositories, searchFilter } = get();
        const pipeline = createFilteredReposPipeline(searchFilter);
        return pipeline(repositories);
    },

    // ========== 🆕 v1.4.0 版本追踪 ==========
    releases: [],
    releaseCheckStatus: {
        lastCheckedAt: null,
        checking: false,
        newCount: 0,
        error: null,
    },
    releaseFilter: { ...defaultReleaseFilter },
    subscriptionVersion: 0, // 订阅版本号，用于触发响应式更新
    togglingSubscriptions: new Set<number>(), // 🆕 v1.6.0 正在切换订阅的仓库 ID（防竞态）

    loadReleases: () => {
        const stored = window.githubStarsAPI.getStoredReleases();
        const readIds = new Set(window.githubStarsAPI.getReadReleaseIds());
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
        window.githubStarsAPI.setStoredReleases(cleaned);
    },

    checkReleaseUpdates: async () => {
        const { token, repositories, releaseCheckStatus, settings } = get();

        logger.log('[ReleaseCheck] 开始检查版本更新', {
            checking: releaseCheckStatus.checking,
            hasToken: !!token,
        });

        if (releaseCheckStatus.checking) return;
        if (!token) return;

        // 获取订阅的仓库
        const subscribedRepoIds = window.githubStarsAPI.getReleaseSubscriptions();
        logger.log('[ReleaseCheck] 订阅的仓库ID列表', subscribedRepoIds);
        if (subscribedRepoIds.length === 0) return;

        set({
            releaseCheckStatus: {
                ...releaseCheckStatus,
                checking: true,
                error: null,
            }
        });

        try {
            const { updates, errors } = await releaseService.checkSubscribedRepos(
                subscribedRepoIds,
                token,
                repositories.map(r => ({ id: r.id, fullName: r.fullName })),
                (current, total, repoName) => {
                    set({
                        releaseCheckStatus: {
                            ...get().releaseCheckStatus,
                            // 可用于显示进度
                        }
                    });
                }
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
                const storedReleases = window.githubStarsAPI.getStoredReleases();
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
                window.githubStarsAPI.setStoredReleases(cleaned);

                // 更新状态
                const readIds = new Set(window.githubStarsAPI.getReadReleaseIds());
                const releasesWithReadStatus = cleaned.map(r => ({
                    ...r,
                    isRead: readIds.has(r.id),
                }));

                set({
                    releases: releasesWithReadStatus,
                    releaseCheckStatus: {
                        lastCheckedAt: new Date().toISOString(),
                        checking: false,
                        newCount: realUpdates.length, // 使用 realUpdates 计数
                        error: null,
                    }
                });

                // 🆕 v1.5.1: 只对真正的新版本发送通知
                if (realUpdates.length > 0) {
                    if (realUpdates.length === 1) {
                        const release = realUpdates[0];
                        window.githubStarsAPI.showNotification(
                            settings.language === 'zh'
                                ? `${release.repository.fullName} 发布了新版本 ${release.tagName}`
                                : `${release.repository.fullName} released ${release.tagName}`,
                            'github-stars-releases'
                        );
                    } else {
                        window.githubStarsAPI.showNotification(
                            settings.language === 'zh'
                                ? `${realUpdates.length} 个仓库有新版本更新`
                                : `${realUpdates.length} repos have new releases`,
                            'github-stars-releases'
                        );
                    }
                }
            } else {
                set({
                    releaseCheckStatus: {
                        lastCheckedAt: new Date().toISOString(),
                        checking: false,
                        newCount: 0,
                        error: null,
                    }
                });
            }

            // 记录错误（如果有）
            if (errors.length > 0) {
                logger.warn('[Release Check] Some repos failed:', errors);
            }

        } catch (error) {
            console.error('[Release Check] Failed:', error);
            set({
                releaseCheckStatus: {
                    ...get().releaseCheckStatus,
                    checking: false,
                    error: (error as Error).message,
                }
            });
        }
    },

    markReleaseRead: (releaseId: number) => {
        const { releases } = get();
        const readIds = window.githubStarsAPI.getReadReleaseIds();

        if (!readIds.includes(releaseId)) {
            readIds.push(releaseId);
            window.githubStarsAPI.setReadReleaseIds(readIds);
        }

        set({
            releases: releases.map(r =>
                r.id === releaseId ? { ...r, isRead: true } : r
            ),
            releaseCheckStatus: {
                ...get().releaseCheckStatus,
                newCount: Math.max(0, get().releaseCheckStatus.newCount - 1),
            }
        });
    },

    markAllReleasesRead: () => {
        const { releases } = get();
        // 🆕 v1.6.2 只将已订阅仓库的 Release 标记为已读
        const subscribedRepoIds = window.githubStarsAPI.getReleaseSubscriptions();
        const subscribedReleases = releases.filter(r => subscribedRepoIds.includes(r.repository.id));
        const allIds = subscribedReleases.map(r => r.id);
        window.githubStarsAPI.setReadReleaseIds(allIds);

        set({
            releases: releases.map(r => subscribedRepoIds.includes(r.repository.id) ? { ...r, isRead: true } : r),
            releaseCheckStatus: {
                ...get().releaseCheckStatus,
                newCount: 0,
            }
        });
    },

    getUnreadCount: () => {
        const { releases } = get();
        // 🆕 v1.6.2 仅统计已订阅仓库的未读更新，避免退订后仍有未读角标
        const subscribedRepoIds = window.githubStarsAPI.getReleaseSubscriptions();
        return releases.filter(r => !r.isRead && subscribedRepoIds.includes(r.repository.id)).length;
    },

    setReleaseFilter: (filter: Partial<ReleaseFilter>) => {
        set((state) => ({
            releaseFilter: { ...state.releaseFilter, ...filter },
        }));
    },

    // ========== 🆕 v1.5.0 订阅管理 ==========
    getSubscribedRepos: () => {
        const { repositories } = get();
        const ids = window.githubStarsAPI.getReleaseSubscriptions();
        // 过滤出存在的仓库（清理无效订阅）
        const validIds = ids.filter(id => repositories.some(r => r.id === id));
        // 如果有无效订阅，自动清理
        if (validIds.length !== ids.length) {
            window.githubStarsAPI.setReleaseSubscriptions(validIds);
        }
        return repositories.filter(r => validIds.includes(r.id));
    },

    // 🆕 v1.6.0: 乐观更新 + 后台异步获取基准版本（解决订阅按钮延迟问题）
    // 🔧 v1.6.2: 修复取消订阅被锁阻止的问题，将锁检查移至新订阅分支内部
    toggleSubscription: (repoId: number) => {
        logger.log('[toggleSubscription] 开始', { repoId });

        const ids = window.githubStarsAPI.getReleaseSubscriptions();
        const index = ids.indexOf(repoId);

        logger.log('[toggleSubscription] 当前订阅状态', {
            当前订阅列表: ids,
            是否已订阅: index !== -1,
            操作: index === -1 ? '添加订阅' : '取消订阅',
        });

        if (index === -1) {
            // ========== 新订阅：乐观更新 ==========

            // 🔧 只对新订阅检查锁（取消订阅是同步操作，不需要锁保护）
            const togglingSet = get().togglingSubscriptions;
            if (togglingSet.has(repoId)) {
                logger.log('[toggleSubscription] 新订阅正在处理中，跳过', { repoId });
                return;
            }

            // 1️⃣ 立即更新订阅状态（乐观更新）
            ids.push(repoId);
            window.githubStarsAPI.setReleaseSubscriptions(ids);
            logger.log('[toggleSubscription] 订阅列表已更新（乐观）', { 新订阅列表: ids });

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

                            window.githubStarsAPI.setStoredReleases(updatedReleases);
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
            ids.splice(index, 1);
            window.githubStarsAPI.setReleaseSubscriptions(ids);
            logger.log('[toggleSubscription] 取消订阅成功', { 新订阅列表: ids });
            set((state) => ({ subscriptionVersion: state.subscriptionVersion + 1 }));
        }
    },

    clearAllSubscriptions: () => {
        window.githubStarsAPI.setReleaseSubscriptions([]);
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
