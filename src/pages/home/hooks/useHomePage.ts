/**
 * HomePage 主 Hook
 * @module pages/home/hooks/useHomePage
 * @since v1.7.0
 *
 * 封装 HomePage 的业务逻辑，使组件更简洁
 */

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useStore } from '@/stores/useStore';
import { githubService } from '@/services/githubService';
import { t } from '@/locales';
import { logger } from '@/utils/logger';
import type { SortBy, SortOrder, Repository, ViewMode, Tag, Settings, SearchFilter, PageName } from '@/types';

/** 同步状态 */
type SyncStatus = 'idle' | 'syncing' | 'completed' | 'error';

/**
 * HomePage Hook 返回值
 */
export interface UseHomePageResult {
    // 数据
    repositories: Repository[];
    filteredRepos: Repository[];
    currentRepos: Repository[];
    tags: Tag[];
    searchFilter: SearchFilter;
    settings: Partial<Settings>;

    // 统计
    stats: {
        total: number;
        filtered: number;
        totalPages: number;
        currentPage: number;
    };

    // 语言和平台
    allLanguages: string[];

    // 状态
    syncStatus: SyncStatus;
    syncProgress: { current: number; total: number };
    syncError: string | null;
    viewMode: ViewMode;
    lang: 'zh' | 'en';
    token: string | null;

    // UI 状态
    showSortMenu: boolean;
    setShowSortMenu: (show: boolean) => void;
    showTagFilter: boolean;
    setShowTagFilter: (show: boolean) => void;
    showPlatformFilter: boolean;
    setShowPlatformFilter: (show: boolean) => void;

    // 操作
    handleSync: () => Promise<void>;
    handleRepoClick: (repo: Repository) => void;
    handleSortChange: (sortBy: SortBy) => void;
    toggleSortOrder: () => void;
    toggleViewMode: () => void;
    setCurrentPageNum: (page: number) => void;
    setSearchFilter: (filter: Partial<SearchFilter>) => void;
    setSyncError: (error: string | null) => void;
    setCurrentPage: (page: PageName) => void;

    // 排序选项
    sortOptions: { value: SortBy; label: string }[];
}

/**
 * HomePage 主 Hook
 */
export const useHomePage = (): UseHomePageResult => {
    const {
        repositories, setRepositories, saveRepositories, token, settings,
        syncStatus, setSyncStatus, syncProgress, setSyncProgress,
        syncError, setSyncError,
        searchFilter, setSearchFilter, getFilteredRepos,
        setCurrentPage, setSelectedRepo,
        currentPageNum, setCurrentPageNum,
        tags, loadTags, viewMode, setViewMode,
    } = useStore();

    // UI 状态
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [showPlatformFilter, setShowPlatformFilter] = useState(false);

    // 语言
    const lang = (settings.language || 'zh') as 'zh' | 'en';
    const itemsPerPage = settings.itemsPerPage || 20;

    // 计算属性
    const filteredRepos = useMemo(() => getFilteredRepos(), [repositories, searchFilter, tags]);
    const totalPages = Math.max(1, Math.ceil(filteredRepos.length / itemsPerPage));
    const currentRepos = useMemo(() =>
        filteredRepos.slice(
            (currentPageNum - 1) * itemsPerPage,
            currentPageNum * itemsPerPage
        ),
        [filteredRepos, currentPageNum, itemsPerPage]
    );

    // 获取所有语言
    const allLanguages = useMemo(() => {
        const langs = new Set<string>();
        repositories.forEach((r) => r.language && langs.add(r.language));
        return Array.from(langs).sort();
    }, [repositories]);

    // 统计信息
    const stats = useMemo(() => ({
        total: repositories.length,
        filtered: filteredRepos.length,
        totalPages,
        currentPage: currentPageNum,
    }), [repositories.length, filteredRepos.length, totalPages, currentPageNum]);

    // 加载标签
    useEffect(() => {
        loadTags();
    }, [loadTags]);

    // ✅ 同步操作（使用 useCallback 稳定引用）
    const handleSync = useCallback(async () => {
    await useStore.getState().syncRepositories();
}, []);

    // 🔧 v1.6.3 trigger-sync 事件监听已移至 App.tsx（全局监听，解决 SettingsPage 验证 Token 时 HomePage 未挂载的问题）
    // 此处不再需要重复监听

    // ✅ 仓库点击（使用 useCallback 稳定引用）
    const handleRepoClick = useCallback((repo: Repository) => {
        setSelectedRepo(repo);
        setCurrentPage('detail');
    }, [setSelectedRepo, setCurrentPage]);

    // 排序选项
    const sortOptions: { value: SortBy; label: string }[] = useMemo(() => [
        { value: 'stars', label: t('sortByStars', lang) },
        { value: 'updated', label: t('sortByUpdated', lang) },
        { value: 'name', label: t('sortByName', lang) },
        { value: 'starredAt', label: t('sortByStarredAt', lang) },
    ], [lang]);

    // 🆕 v1.6.2 初始化时从 settings 恢复排序设置
    const sortRestoredRef = useRef(false);
    useEffect(() => {
        if (sortRestoredRef.current) return;
        if (!settings.defaultSortBy) return;

        sortRestoredRef.current = true;
        const { searchFilter, setSearchFilter } = useStore.getState();
        if (settings.defaultSortBy && settings.defaultSortBy !== searchFilter.sortBy) {
            setSearchFilter({ sortBy: settings.defaultSortBy as SortBy });
        }
        if (settings.defaultSortOrder && settings.defaultSortOrder !== searchFilter.sortOrder) {
            setSearchFilter({ sortOrder: settings.defaultSortOrder });
        }
    }, [settings.defaultSortBy, settings.defaultSortOrder]);

    // 排序操作
    const handleSortChange = useCallback((sortBy: SortBy) => {
        setSearchFilter({ sortBy });
        setShowSortMenu(false);
    }, [setSearchFilter]);

    const toggleSortOrder = useCallback(() => {
        setSearchFilter({ sortOrder: searchFilter.sortOrder === 'asc' ? 'desc' : 'asc' });
    }, [setSearchFilter, searchFilter.sortOrder]);

    // 视图切换
    const toggleViewMode = useCallback(() => {
        setViewMode(viewMode === 'card' ? 'list' : 'card');
    }, [viewMode, setViewMode]);

    return {
        // 数据
        repositories,
        filteredRepos,
        currentRepos,
        tags,
        searchFilter,
        settings,

        // 统计
        stats,
        allLanguages,

        // 状态
        syncStatus,
        syncProgress,
        syncError,
        viewMode,
        lang,
        token,

        // UI 状态
        showSortMenu,
        setShowSortMenu,
        showTagFilter,
        setShowTagFilter,
        showPlatformFilter,
        setShowPlatformFilter,

        // 操作
        handleSync,
        handleRepoClick,
        handleSortChange,
        toggleSortOrder,
        toggleViewMode,
        setCurrentPageNum,
        setSearchFilter,
        setSyncError,
        setCurrentPage,

        // 排序选项
        sortOptions,
    };
};

export default useHomePage;
