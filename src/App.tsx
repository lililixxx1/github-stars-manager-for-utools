import React, { useEffect, useState } from 'react';
import { useStore } from './stores/useStore';
import { useProgressStore } from './stores/useProgressStore';
import { HomePage } from './pages/HomePage';
import { DetailPage } from './pages/DetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { TagsPage } from './pages/TagsPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { AnalyzeProgress } from './components/AnalyzeProgress';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastHost } from './components/Toast';
import { t } from './locales';
import { logger } from './utils/logger';

// ==================== 子输入框关键词防抖（阶段3 性能重构） ====================

/** 防抖间隔：每敲一个字符不再全量重算筛选管道 */
const SUBINPUT_DEBOUNCE_MS = 120;

/** 模块级防抖定时器（setSubInput 回调闭包不稳定，不能用 ref 挂在组件上） */
let subInputDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 取消挂起的防抖写入（程序化设置关键词前必须调用，避免旧词复活） */
function cancelPendingSubInputKeyword(): void {
    if (subInputDebounceTimer !== null) {
        clearTimeout(subInputDebounceTimer);
        subInputDebounceTimer = null;
    }
}

/** 防抖写入关键词（仅用于子输入框 onChange 打字路径） */
function scheduleSubInputKeyword(text: string): void {
    cancelPendingSubInputKeyword();
    subInputDebounceTimer = setTimeout(() => {
        subInputDebounceTimer = null;
        useStore.getState().setSearchFilter({ keyword: text });
    }, SUBINPUT_DEBOUNCE_MS);
}

function setupRepositorySearchSubInput(isFocus = true): void {
    if (typeof utools === 'undefined') return;

    utools.setSubInput(({ text }) => {
        // 打字路径走 120ms 防抖：筛选管道（搜索/排序）不再每键全量重算
        scheduleSubInputKeyword(text);
    }, '搜索仓库...', isFocus);
}

function releaseRepositorySearchSubInput(): void {
    if (typeof utools === 'undefined') return;

    utools.subInputBlur?.();
    utools.removeSubInput();
}

const App: React.FC = () => {
    // 精确订阅（阶段2 性能重构）：根组件只订阅页面路由与设置，进度类状态在 useProgressStore
    const currentPage = useStore((state) => state.currentPage);
    const settings = useStore((state) => state.settings);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const setSelectedRepo = useStore((state) => state.setSelectedRepo);
    const loadRepositories = useStore((state) => state.loadRepositories);
    const loadSettings = useStore((state) => state.loadSettings);
    const loadToken = useStore((state) => state.loadToken);
    const loadReleases = useStore((state) => state.loadReleases);

    // AI 分析确认弹窗状态 🆕 v1.6.0
    const [showAnalyzeConfirm, setShowAnalyzeConfirm] = useState(false);
    const [pendingAnalyzeCount, setPendingAnalyzeCount] = useState(0);

    // 主题应用逻辑
    useEffect(() => {
        const root = document.documentElement;

        // 移除旧主题 class
        root.classList.remove('light', 'dark');

        // 处理 settings 可能为 undefined 的情况（初始化时）
        const theme = settings?.theme || 'auto';

        if (theme === 'auto') {
            // 自动模式：检测系统偏好
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.classList.add(prefersDark ? 'dark' : 'light');
        } else {
            // 手动模式
            root.classList.add(theme);
        }
    }, [settings?.theme]);

    // 系统主题实时监听 (自动模式)
    useEffect(() => {
        const theme = settings?.theme || 'auto';
        if (theme !== 'auto') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handler = (e: MediaQueryListEvent) => {
            const root = document.documentElement;
            root.classList.remove('light', 'dark');
            root.classList.add(e.matches ? 'dark' : 'light');
        };

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, [settings?.theme]);

    // 初始化加载
    useEffect(() => {
        loadSettings();
        loadToken();
        loadRepositories();
        loadReleases(); // 🆕 v1.4.0 加载版本数据

        // 🆕 v1.4.0 自动检查版本更新
        const timer = setTimeout(() => {
            const state = useStore.getState();
            const { token: currentToken, settings: currentSettings } = state;

            // 防止重复检查
            if (useProgressStore.getState().releaseCheckStatus.checking) return;

            if (currentToken && currentSettings?.autoCheckReleaseUpdates !== false) {
                // 检查是否有订阅的仓库（订阅单源：store 内 subscribedRepoIds，loadRepositories 已装载）
                if (state.subscribedRepoIds.size > 0) {
                    state.checkReleaseUpdates();
                }
            }
        }, 2000); // 延迟 2 秒，避免与同步和分析冲突

        return () => clearTimeout(timer);
    }, []);

    // 🆕 v1.3.0 自动分析检查
    useEffect(() => {
        // 延迟检查自动分析（确保页面渲染完成）
        const timer = setTimeout(() => {
            const state = useStore.getState();
            const { settings: currentSettings, token: currentToken, repositories: currentRepos } = state;

            // 防止重复分析
            if (useProgressStore.getState().isAnalyzing) return;

            if (currentSettings?.autoAnalyzeOnOpen && currentToken) {
                // 筛选需要分析的仓库
                const toAnalyze = currentRepos.filter(r => !r.analyzedAt && !r.analysisFailed);

                if (toAnalyze.length > 0) {
                    // 如果数量太多，提示用户确认
                    if (toAnalyze.length > 50) {
                        setPendingAnalyzeCount(toAnalyze.length);
                        setShowAnalyzeConfirm(true);
                    } else {
                        state.startAutoAnalyze();
                    }
                }
            }
        }, 3000);  // 延迟 3 秒，在版本检查之后

        return () => clearTimeout(timer);
    }, []);

    // 监听导航事件
    useEffect(() => {
        const handleNavigate = (e: CustomEvent) => {
            setCurrentPage(e.detail.page);
        };

        const handleSearch = (e: CustomEvent) => {
            // 程序化设置关键词：不走防抖，并取消挂起的防抖定时器避免旧词复活
            cancelPendingSubInputKeyword();
            useStore.getState().setSearchFilter({ keyword: e.detail.query });
        };

        const handleOpenRepo = (e: CustomEvent) => {
            const fullName = e.detail.fullName;
            const repos = useStore.getState().repositories;
            const repo = repos.find((r) => r.fullName === fullName);
            if (repo) {
                setSelectedRepo(repo);
                setCurrentPage('detail');
            }
        };

        // 🆕 v1.6.3 全局监听 trigger-sync 事件（Token 验证成功后触发）
        const handleTriggerSync = () => {
            logger.log('[App] 收到 trigger-sync 事件，触发同步');
            useStore.getState().syncRepositories();
        };

        window.addEventListener('navigate', handleNavigate as EventListener);
        window.addEventListener('search', handleSearch as EventListener);
        window.addEventListener('open-repo', handleOpenRepo as EventListener);
        window.addEventListener('trigger-sync', handleTriggerSync as EventListener);

        return () => {
            window.removeEventListener('navigate', handleNavigate as EventListener);
            window.removeEventListener('search', handleSearch as EventListener);
            window.removeEventListener('open-repo', handleOpenRepo as EventListener);
            window.removeEventListener('trigger-sync', handleTriggerSync as EventListener);
        };
    }, []);

    // uTools 事件注册
    useEffect(() => {
        if (typeof utools !== 'undefined') {
            utools.onPluginEnter(({ code, type, payload }) => {
                switch (code) {
                    case 'github-stars':
                        if (useStore.getState().releasesInitialTab) {
                            setCurrentPage('releases');
                            break;
                        }

                        setCurrentPage('home');
                        // 🆕 v1.6.4 清空上次搜索词，使空子输入框与"全部仓库"列表保持一致
                        // 程序化路径：取消挂起的防抖定时器，避免旧关键词在清空后复活
                        cancelPendingSubInputKeyword();
                        useStore.getState().setSearchFilter({ keyword: '' });
                        // 设置子输入框
                        setupRepositorySearchSubInput(true);
                        break;
                    case 'github-stars-search':
                        setCurrentPage('home');
                        if (typeof payload === 'string') {
                            // 程序化路径：立即生效并取消挂起的防抖写入
                            cancelPendingSubInputKeyword();
                            useStore.getState().setSearchFilter({ keyword: payload });
                            setupRepositorySearchSubInput(true);
                            if (payload) {
                                utools.setSubInputValue(payload);
                            }
                        }
                        break;
                    case 'github-stars-repo':
                        if (typeof payload === 'string') {
                            const repos = useStore.getState().repositories;
                            const repo = repos.find((r) => r.fullName === payload);
                            if (repo) {
                                setSelectedRepo(repo);
                                setCurrentPage('detail');
                            } else {
                                setCurrentPage('home');
                                // 程序化路径：立即生效并取消挂起的防抖写入
                                cancelPendingSubInputKeyword();
                                useStore.getState().setSearchFilter({ keyword: payload });
                                setupRepositorySearchSubInput(true);
                            }
                        }
                        break;
                }
            });

            utools.onPluginOut((isKill) => {
                if (isKill) {
                    useStore.getState().saveRepositories();
                }
            });
        }
    }, []);

    useEffect(() => {
        // 🆕 v1.6.4 双向管理子输入框：进入 home 时挂载，离开 home 时移除
        if (currentPage === 'home') {
            // 返回首页时清空上次搜索词，与空子输入框保持一致（方案B 语义）
            // 程序化清空：取消挂起的防抖定时器，避免旧关键词复活
            cancelPendingSubInputKeyword();
            useStore.getState().setSearchFilter({ keyword: '' });
            setupRepositorySearchSubInput(true);
        } else {
            releaseRepositorySearchSubInput();
        }
    }, [currentPage]);

    // 获取语言设置
    const lang = (settings?.language || 'zh') as 'zh' | 'en';

    // 确认弹窗处理函数
    const handleAnalyzeConfirm = () => {
        setShowAnalyzeConfirm(false);
        useStore.getState().startAutoAnalyze();
    };

    return (
        <>
            <ConfirmDialog
                isOpen={showAnalyzeConfirm}
                title={t('analyzeConfirmTitle', lang)}
                message={t('analyzeConfirmMessage', lang, { count: pendingAnalyzeCount })}
                confirmText={t('startAnalyze', lang)}
                cancelText={t('cancel', lang)}
                onConfirm={handleAnalyzeConfirm}
                onCancel={() => setShowAnalyzeConfirm(false)}
            />
            <AnalyzeProgress />
            <ToastHost />
            {currentPage === 'detail' && <DetailPage />}
            {currentPage === 'settings' && <SettingsPage />}
            {currentPage === 'tags' && <TagsPage />}
            {currentPage === 'releases' && <ReleasesPage />}
            {currentPage !== 'detail' && currentPage !== 'settings' && currentPage !== 'tags' && currentPage !== 'releases' && <HomePage />}
        </>
    );
};

export default App;
