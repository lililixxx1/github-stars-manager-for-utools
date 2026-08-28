import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { storageService } from '../services/storageService';
import { githubService } from '../services/githubService';
import { t } from '../locales';
import { TokenHelp, TokenHelpHeaderButton } from '../components/TokenHelp';
import { Toggle } from '../components/Toggle';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toast';
import { logger } from '../utils/logger';
import { useBackShortcut } from '../hooks/useBackShortcut';
import type { Repository, Settings } from '../types';
import {
    ArrowLeft, Key, Check, X, Loader2, Download, Upload,
    Sun, Moon, Monitor, Globe, Sparkles, Play, StopCircle, Zap, Bell,
    AlertTriangle, Link2, BrainCircuit, Rss, Palette, Database
} from 'lucide-react';
import pkg from '../../package.json';

/** 通过形状校验、等待用户确认导入的备份数据（运行时已校验，静态类型按目标形状标注） */
interface PendingImportData {
    repositories?: Repository[];
    settings?: Partial<Settings>;
}

export const SettingsPage: React.FC = () => {
    const projectRepositoryUrl = 'https://github.com/lililixxx1/github-stars-manager-for-utools';
    // 精确订阅（阶段2 性能重构）：进度类状态在 useProgressStore
    const settings = useStore((state) => state.settings);
    const saveSettings = useStore((state) => state.saveSettings);
    const token = useStore((state) => state.token);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const repositories = useStore((state) => state.repositories);
    const setRepositories = useStore((state) => state.setRepositories);
    const saveRepositories = useStore((state) => state.saveRepositories);
    const startAutoAnalyze = useStore((state) => state.startAutoAnalyze);
    const stopAnalyze = useStore((state) => state.stopAnalyze);
    const checkReleaseUpdates = useStore((state) => state.checkReleaseUpdates);
    const setReleasesInitialTab = useStore((state) => state.setReleasesInitialTab);

    const isAnalyzing = useProgressStore((state) => state.isAnalyzing);
    const releaseCheckStatus = useProgressStore((state) => state.releaseCheckStatus);

    const lang = (settings.language || 'zh') as 'zh' | 'en';
    const [tokenInput, setTokenInput] = useState(token || '');
    const [verifying, setVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState<'success' | 'error' | null>(null);
    const [verifyErrorReason, setVerifyErrorReason] = useState<'invalid' | 'rateLimited' | 'network' | null>(null);
    const [aiModels, setAiModels] = useState<any[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [tokenHelpExpanded, setTokenHelpExpanded] = useState(false);
    const [pendingImport, setPendingImport] = useState<PendingImportData | null>(null);
    const autoSyncTimerRef = useRef<number | null>(null);

    useEffect(() => {
        loadAIModels();
    }, []);

    useEffect(() => {
        return () => {
            if (autoSyncTimerRef.current !== null) {
                window.clearTimeout(autoSyncTimerRef.current);
            }
        };
    }, []);

    const loadAIModels = async () => {
        setLoadingModels(true);
        try {
            const models = await window.githubStarsAPI.getAIModels();
            setAiModels(models || []);
        } catch (e) {
            console.error('Failed to load AI models:', e);
        } finally {
            setLoadingModels(false);
        }
    };

    const handleBack = useCallback(() => {
        setCurrentPage('home');
    }, [setCurrentPage]);

    useBackShortcut({
        onBack: handleBack,
        deps: [handleBack],
    });

    const scheduleAutoSync = () => {
        const { syncStatus } = useProgressStore.getState();

        logger.log('[AutoSync] Token 验证成功，准备触发自动同步', {
            syncStatus,
            willSync: syncStatus !== 'syncing'
        });

        if (syncStatus === 'syncing') {
            return;
        }

        if (autoSyncTimerRef.current !== null) {
            window.clearTimeout(autoSyncTimerRef.current);
        }

        // 延迟触发同步，让用户先看到验证成功状态
        autoSyncTimerRef.current = window.setTimeout(() => {
            autoSyncTimerRef.current = null;
            logger.log('[AutoSync] 触发 trigger-sync 事件');
            window.dispatchEvent(new CustomEvent('trigger-sync'));
        }, 500);
    };

    const handleVerifyToken = async () => {
        if (!tokenInput.trim()) return;
        setVerifying(true);
        setVerifyResult(null);
        setVerifyErrorReason(null);
        try {
            const result = await githubService.verifyToken(tokenInput.trim());
            if (result.ok) {
                storageService.setToken(tokenInput.trim());
                useStore.setState({ token: tokenInput.trim() });
                setVerifyResult('success');
                scheduleAutoSync();
            } else {
                setVerifyErrorReason(result.reason ?? 'network');
                setVerifyResult('error');
            }
        } catch {
            // verifyToken 契约上不抛错；此处仅为 setToken 等意外异常兜底，防止 verifying 卡死
            setVerifyErrorReason('network');
            setVerifyResult('error');
        } finally {
            setVerifying(false);
        }
    };

    // 开始/停止批量分析：被长任务互斥挡住时提示已排队（store 内自动重试），而非静默无响应
    const handleAnalyzeToggle = async () => {
        if (isAnalyzing) {
            stopAnalyze();
            return;
        }
        const result = await startAutoAnalyze();
        if (result === 'busy') {
            toast.show(t('analyzeDeferredBusy', lang));
        }
    };

    const handleExport = () => {
        const data = {
            version: '1.4.0',
            exportedAt: new Date().toISOString(),
            repositories,
            settings,
        };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `github-stars-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target?.result as string);

                    // 形状深度校验：乱值不落盘、不弹确认（元素缺 id/owner 会让搜索索引与详情页崩溃）。
                    // every 全量扫描：仅查首元素时，后续 null/坏元素仍会在筛选管道 repo.id 处 TypeError
                    const repos = data?.repositories;
                    const reposValid = Array.isArray(repos)
                        && repos.every((el: any) => typeof el?.id === 'number'
                            && typeof el?.fullName === 'string'
                            && typeof el?.owner?.login === 'string');
                    const settingsValue = data?.settings;
                    const settingsValid = settingsValue == null
                        || (typeof settingsValue === 'object' && !Array.isArray(settingsValue));
                    if (!reposValid || !settingsValid) {
                        toast.show(t('importFailed', lang), { type: 'error' });
                        return;
                    }

                    // 校验通过先挂起，由 ConfirmDialog 二次确认后才落盘（覆盖导入不可逆）
                    setPendingImport(data);
                } catch {
                    toast.show(t('importFailed', lang), { type: 'error' });
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // 确认导入：落盘路径套 try/catch，失败不误报成功
    const confirmImport = () => {
        if (!pendingImport) return;
        try {
            if (pendingImport.repositories) {
                setRepositories(pendingImport.repositories);
                saveRepositories();
            }
            if (pendingImport.settings) {
                saveSettings(pendingImport.settings);
            }
            setPendingImport(null);
            toast.show(t('importSuccess', lang), { type: 'success' });
        } catch {
            setPendingImport(null);
            toast.show(t('importFailed', lang), { type: 'error' });
        }
    };

    const themeOptions = [
        { value: 'auto', icon: <Monitor size={14} />, label: t('autoTheme', lang) },
        { value: 'light', icon: <Sun size={14} />, label: t('lightTheme', lang) },
        { value: 'dark', icon: <Moon size={14} />, label: t('darkTheme', lang) },
    ] as const;

    // 订阅数从 store 派生（阶段3：订阅单源 repositories.isSubscribed，不渲染期直读存储）
    const subscribedCount = useMemo(
        () => repositories.reduce((count, r) => (r.isSubscribed ? count + 1 : count), 0),
        [repositories]
    );

    // AI 分析进度统计（阶段8：文字 + .progress-bar 进度条）
    const analyzedStats = useMemo(() => {
        const analyzed = repositories.filter(r => r.analyzedAt && !r.analysisFailed).length;
        const failed = repositories.filter(r => r.analysisFailed).length;
        const pct = repositories.length > 0 ? Math.round((analyzed / repositories.length) * 100) : 0;
        return { analyzed, failed, pct };
    }, [repositories]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
            }}>
                <button className="btn btn-ghost btn-sm" onClick={handleBack}>
                    <ArrowLeft size={16} />
                    {t('back', lang)}
                </button>
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>{t('settings', lang)}</h2>
            </div>

            {/* 阶段8：9 卡分 5 节（标题带图标），进入动画由 App.tsx 页面容器统一提供 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {/* ===== GitHub 连接 ===== */}
                <h4 className="settings-section-title"><Link2 size={14} />{t('settingsGroupConnection', lang)}</h4>

                {/* GitHub Token */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Key size={14} style={{ color: 'var(--color-primary)' }} />
                        {t('githubToken', lang)}
                        <TokenHelpHeaderButton
                            lang={lang}
                            expanded={tokenHelpExpanded}
                            onToggle={() => setTokenHelpExpanded(!tokenHelpExpanded)}
                        />
                    </h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="password"
                            className="input"
                            value={tokenInput}
                            onChange={(e) => { setTokenInput(e.target.value); setVerifyResult(null); }}
                            placeholder={t('tokenPlaceholder', lang)}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleVerifyToken}
                            disabled={verifying || !tokenInput.trim()}
                            style={{ flexShrink: 0 }}
                        >
                            {verifying ? <Loader2 size={14} className="animate-spin" /> : verifyResult === 'success' ? <Check size={14} /> : verifyResult === 'error' ? <X size={14} /> : <Key size={14} />}
                            {t('verifyToken', lang)}
                        </button>
                    </div>
                    {verifyResult && (
                        <p style={{ fontSize: 13, marginTop: 6, color: verifyResult === 'success' ? 'var(--color-success)' : 'var(--color-error-text)' }}>
                            {verifyResult === 'success'
                                ? t('tokenVerified', lang)
                                : verifyErrorReason === 'rateLimited'
                                    ? t('errorRateLimited', lang)
                                    : verifyErrorReason === 'network'
                                        ? t('errorNetwork', lang)
                                        : t('errorTokenInvalid', lang)}
                        </p>
                    )}

                    {/* Token 帮助面板 - 受控展开 */}
                    <TokenHelp
                        lang={lang}
                        expanded={tokenHelpExpanded}
                        onToggle={() => setTokenHelpExpanded(!tokenHelpExpanded)}
                    />
                </div>

                {/* ===== AI 分析 ===== */}
                <h4 className="settings-section-title"><BrainCircuit size={14} />{t('settingsGroupAI', lang)}</h4>

                {/* AI 模型 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
                        {lang === 'zh' ? 'AI 模型' : 'AI Model'}
                    </h3>
                    {loadingModels ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>
                            <Loader2 size={14} className="animate-spin" />
                            {lang === 'zh' ? '加载模型列表...' : 'Loading models...'}
                        </div>
                    ) : aiModels.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                            {lang === 'zh' ? '未找到可用的 AI 模型，请在 uTools 主设置中配置' : 'No AI models found. Please configure in uTools settings.'}
                        </p>
                    ) : (
                        <div>
                            <select className="input" value={settings.aiModel || ''} onChange={(e) => saveSettings({ aiModel: e.target.value })} style={{ cursor: 'pointer' }}>
                                <option value="">{lang === 'zh' ? '默认模型' : 'Default Model'}</option>
                                {aiModels.map((model: any) => {
                                    const modelId = typeof model === 'string' ? model : (model.id || model.name || String(model));
                                    const modelName = typeof model === 'string' ? model : (model.title || model.label || model.displayName || model.name || (model.id && !model.id.startsWith('aimodels/') ? model.id : null) || model.model || modelId);
                                    return <option key={modelId} value={modelId}>{modelName}</option>;
                                })}
                            </select>
                            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                                {lang === 'zh' ? '选择用于仓库分析的 AI 模型' : 'Select the AI model for repository analysis'}
                            </p>
                        </div>
                    )}
                </div>

                {/* AI 分析设置 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Zap size={14} style={{ color: 'var(--color-primary)' }} />
                        {t('aiAnalysisSettings', lang)}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('autoAnalyzeOnOpen', lang)}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('autoAnalyzeOnOpenHint', lang)}</div>
                        </div>
                        <Toggle
                            checked={!!settings.autoAnalyzeOnOpen}
                            onChange={(checked) => saveSettings({ autoAnalyzeOnOpen: checked })}
                            aria-label={t('autoAnalyzeOnOpen', lang)}
                        />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{t('concurrency', lang)}</div>
                        {/* 阶段8：等宽数字按钮收敛为分段控件 */}
                        <div className="segmented" style={{ width: '100%' }}>
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    className={`segmented-item${(settings.aiConcurrency || 1) === n ? ' active' : ''}`}
                                    onClick={() => saveSettings({ aiConcurrency: n })}
                                    aria-pressed={(settings.aiConcurrency || 1) === n}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{t('concurrencyHint', lang)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={handleAnalyzeToggle} disabled={!token || repositories.length === 0} style={{ flex: 1 }} title={!token ? (lang === 'zh' ? '请先配置 GitHub Token' : 'Please configure GitHub Token first') : repositories.length === 0 ? (lang === 'zh' ? '请先同步仓库' : 'Please sync repositories first') : undefined}>
                            {isAnalyzing ? <><StopCircle size={14} />{t('stopAnalysis', lang)}</> : <><Play size={14} />{t('analyzeNow', lang)}</>}
                        </button>
                    </div>
                    {!token && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-warning-strong)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={12} />
                            {lang === 'zh' ? '请先配置 GitHub Token 以使用 AI 分析功能' : 'Please configure GitHub Token to use AI analysis'}
                        </div>
                    )}
                    {!isAnalyzing && repositories.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                                {t('analyzedCount', lang, { count: analyzedStats.analyzed, total: repositories.length })}
                                {analyzedStats.failed > 0 && <span style={{ color: 'var(--color-error-text)', marginLeft: 8 }}>({lang === 'zh' ? '失败' : 'Failed'}: {analyzedStats.failed})</span>}
                            </div>
                            <div className="progress-bar">
                                <div className="progress-bar-fill" style={{ width: `${analyzedStats.pct}%` }} />
                            </div>
                        </div>
                    )}
                    {repositories.length === 0 && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>{lang === 'zh' ? '请先同步仓库后再进行分析' : 'Please sync repositories first'}</div>}
                </div>

                {/* ===== 版本追踪 ===== */}
                <h4 className="settings-section-title"><Rss size={14} />{t('settingsGroupReleases', lang)}</h4>

                {/* 版本追踪设置 🆕 v1.4.0 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Bell size={14} style={{ color: 'var(--color-primary)' }} />
                        {t('releaseSubscription', lang)}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('autoCheckUpdates', lang)}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{lang === 'zh' ? '打开插件时自动检查订阅仓库的版本更新' : 'Automatically check for updates on startup'}</div>
                        </div>
                        <Toggle
                            checked={settings.autoCheckReleaseUpdates !== false}
                            onChange={(checked) => saveSettings({ autoCheckReleaseUpdates: checked })}
                            aria-label={t('autoCheckUpdates', lang)}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('subscribedRepos', lang)}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('subscribedCount', lang, { count: subscribedCount })}</div>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => {
                            setReleasesInitialTab('subscriptions');
                            setCurrentPage('releases');
                        }}>{t('manageSubscriptions', lang)}</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => checkReleaseUpdates()} disabled={releaseCheckStatus.checking || !token || subscribedCount === 0} style={{ flex: 1 }} title={!token ? (lang === 'zh' ? '请先配置 GitHub Token' : 'Please configure GitHub Token first') : subscribedCount === 0 ? (lang === 'zh' ? '请先订阅仓库' : 'Please subscribe to repos first') : undefined}>
                            {releaseCheckStatus.checking ? <><Loader2 size={14} className="animate-spin" />{t('checkingUpdates', lang)}</> : <><Bell size={14} />{t('checkUpdates', lang)}</>}
                        </button>
                    </div>
                    {releaseCheckStatus.lastCheckedAt && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>{t('lastChecked', lang)}: {new Date(releaseCheckStatus.lastCheckedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</div>}
                    {releaseCheckStatus.error && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-error-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={12} />
                            {releaseCheckStatus.error}
                        </div>
                    )}
                </div>

                {/* ===== 外观与语言 ===== */}
                <h4 className="settings-section-title"><Palette size={14} />{t('settingsGroupAppearance', lang)}</h4>

                {/* 主题 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{t('theme', lang)}</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {themeOptions.map((opt) => (
                            <button key={opt.value} className={`btn ${settings.theme === opt.value ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => saveSettings({ theme: opt.value })} style={{ flex: 1 }}>{opt.icon} {opt.label}</button>
                        ))}
                    </div>
                </div>

                {/* 语言 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={14} />{t('language', lang)}</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className={`btn ${settings.language === 'zh' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => saveSettings({ language: 'zh' })} style={{ flex: 1 }}>中文</button>
                        <button className={`btn ${settings.language === 'en' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => saveSettings({ language: 'en' })} style={{ flex: 1 }}>English</button>
                    </div>
                </div>

                {/* 每页数量 🆕 阶段6：0 = 全部（首页虚拟滚动）；阶段8：分段控件 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{t('itemsPerPage', lang)}</h3>
                    <div className="segmented" style={{ width: '100%' }}>
                        {[10, 20, 50, 100].map((n) => (
                            <button
                                key={n}
                                type="button"
                                className={`segmented-item${settings.itemsPerPage === n ? ' active' : ''}`}
                                onClick={() => saveSettings({ itemsPerPage: n })}
                                aria-pressed={settings.itemsPerPage === n}
                            >
                                {n}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`segmented-item${settings.itemsPerPage === 0 ? ' active' : ''}`}
                            onClick={() => saveSettings({ itemsPerPage: 0 })}
                            aria-pressed={settings.itemsPerPage === 0}
                            title={lang === 'zh' ? '不分页，全部展示（虚拟滚动）' : 'Show all without pagination (virtualized)'}
                        >
                            {t('itemsPerPageAll', lang)}
                        </button>
                    </div>
                </div>

                {/* ===== 数据 ===== */}
                <h4 className="settings-section-title"><Database size={14} />{t('settingsGroupData', lang)}</h4>

                {/* 导入导出 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{t('dataManagement', lang)}</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary" onClick={handleExport} style={{ flex: 1 }}><Download size={14} />{t('exportData', lang)}</button>
                        <button className="btn btn-secondary" onClick={handleImport} style={{ flex: 1 }}><Upload size={14} />{t('importData', lang)}</button>
                    </div>
                </div>

                {/* 关于 */}
                <div className="card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('about', lang)}</h3>
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                        GitHub Stars Manager For uTools<br />
                        {t('version', lang)}: {pkg.version}<br />
                        <a href="#" onClick={(e) => { e.preventDefault(); window.githubStarsAPI.openExternal(projectRepositoryUrl); }} className="link">
                            {lang === 'zh' ? '项目地址' : 'Project Repository'}
                        </a>
                    </p>
                </div>
            </div>

            {/* C1：导入二次确认（覆盖导入不可逆，危险场景聚焦取消按钮防误触） */}
            <ConfirmDialog
                variant="danger"
                autoFocusButton="cancel"
                isOpen={!!pendingImport}
                title={t('importConfirmTitle', lang)}
                message={t('importConfirmDesc', lang, { count: pendingImport?.repositories?.length ?? 0 })}
                confirmText={t('importData', lang)}
                cancelText={t('cancel', lang)}
                onConfirm={confirmImport}
                onCancel={() => setPendingImport(null)}
            />
        </div>
    );
};
