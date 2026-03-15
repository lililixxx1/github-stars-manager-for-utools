import React, { useEffect, useState } from 'react';
import { useStore } from './stores/useStore';
import { HomePage } from './pages/HomePage';
import { DetailPage } from './pages/DetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { TagsPage } from './pages/TagsPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { AnalyzeProgress } from './components/AnalyzeProgress';
import { ConfirmDialog } from './components/ConfirmDialog';
import { t } from './locales';
import { logger } from './utils/logger';

const App: React.FC = () => {
    const { currentPage, loadRepositories, loadSettings, loadToken, loadReleases, setCurrentPage, setSelectedRepo, settings } = useStore();

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
            const { token: currentToken, releaseCheckStatus, settings: currentSettings } = state;

            // 防止重复检查
            if (releaseCheckStatus.checking) return;

            if (currentToken && currentSettings?.autoCheckReleaseUpdates !== false) {
                // 检查是否有订阅的仓库
                const subscriptions = window.githubStarsAPI.getReleaseSubscriptions();
                if (subscriptions.length > 0) {
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
            const { settings: currentSettings, token: currentToken, repositories: currentRepos, isAnalyzing } = state;

            // 防止重复分析
            if (isAnalyzing) return;

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
                        setCurrentPage('home');
                        // 设置子输入框
                        utools.setSubInput(({ text }) => {
                            useStore.getState().setSearchFilter({ keyword: text });
                        }, '搜索仓库...', true);
                        break;
                    case 'github-stars-search':
                        setCurrentPage('home');
                        if (typeof payload === 'string') {
                            useStore.getState().setSearchFilter({ keyword: payload });
                            utools.setSubInput(({ text }) => {
                                useStore.getState().setSearchFilter({ keyword: text });
                            }, '搜索仓库...', true);
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
                                useStore.getState().setSearchFilter({ keyword: payload });
                            }
                        }
                        break;
                    case 'github-stars-releases': // 🆕 v1.4.0 版本通知点击
                        setCurrentPage('releases');
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
            {currentPage === 'detail' && <DetailPage />}
            {currentPage === 'settings' && <SettingsPage />}
            {currentPage === 'tags' && <TagsPage />}
            {currentPage === 'releases' && <ReleasesPage />}
            {currentPage !== 'detail' && currentPage !== 'settings' && currentPage !== 'tags' && currentPage !== 'releases' && <HomePage />}
        </>
    );
};

export default App;
