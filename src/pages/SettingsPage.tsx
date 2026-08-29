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
import { buildBackup, validateBackup, type ValidatedBackup } from '../utils/backup';

// F3：validateBackup 错误码 → 用户语言文案（v1.7 合并：categories 已删除，无对应码）
const importErrorText = (code: string, lang: 'zh' | 'en'): string => {
    const zhMap: Record<string, string> = {
        invalid_file: '文件不是有效的备份',
        repositories_invalid: '仓库数据格式错误',
        tags_invalid: '标签数据格式错误',
        notes_invalid: '笔记数据格式错误',
        release_subscriptions_invalid: '订阅数据格式错误',
        read_release_ids_invalid: '已读记录格式错误',
    };
    const enMap: Record<string, string> = {
        invalid_file: 'Not a valid backup file',
        repositories_invalid: 'Invalid repositories data',
        tags_invalid: 'Invalid tags data',
        notes_invalid: 'Invalid notes data',
        release_subscriptions_invalid: 'Invalid subscription data',
        read_release_ids_invalid: 'Invalid read history data',
    };
    const map = lang === 'zh' ? zhMap : enMap;
    return map[code] || map.invalid_file;
};

// F3（有意加严）：长任务进行中拒绝导入——六类直写与在途同步/分析/版本检查交错会污染合并结果
const notifyJobBusy = (lang: 'zh' | 'en') => {
    window.githubStarsAPI.showNotification(
        lang === 'zh' ? '有任务正在进行，请稍后再导入' : 'A job is in progress, please import later'
    );
};

export const SettingsPage: React.FC = () => {
    const projectRepositoryUrl = 'https://github.com/lililixxx1/github-stars-manager-for-utools';
    // 精确订阅（阶段2 性能重构）：进度类状态在 useProgressStore
    const settings = useStore((state) => state.settings);
    const saveSettings = useStore((state) => state.saveSettings);
    const token = useStore((state) => state.token);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const repositories = useStore((state) => state.repositories);
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
    const [pendingImport, setPendingImport] = useState<{
        data: ValidatedBackup;
        skipped: { repos: number; tags: number; notes: number };
    } | null>(null);
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
        // F3：六类数据完整备份（repositories/tags/notes/subscriptions/readReleaseIds/settings）
        const data = buildBackup();
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
        // 长任务互斥（有意加严）：文件选择对话框期间任务可能启动，落地写入前还会再查一次
        if (useProgressStore.getState().isJobBusy()) {
            notifyJobBusy(lang);
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const raw = JSON.parse(ev.target?.result as string);
                    // F3：六类形状校验（validateBackup：单条无效跳过计数，字段级损坏整批拒绝），
                    // 乱值不落盘、不弹确认
                    const result = validateBackup(raw);
                    if (!result.ok) {
                        toast.show(
                            lang === 'zh'
                                ? `导入失败：${importErrorText(result.error, lang)}`
                                : `Import failed: ${importErrorText(result.error, lang)}`,
                            { type: 'error' }
                        );
                        return;
                    }

                    // 校验通过先挂起，由 ConfirmDialog 二次确认后才落盘（覆盖导入不可逆）；
                    // skipped 随行携带——成功提示须汇报跳过的无效条目数（F3：部分导入不能误报全量成功）
                    setPendingImport({ data: result.data, skipped: result.skipped });
                } catch {
                    toast.show(t('importFailed', lang), { type: 'error' });
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // 确认导入：六类直写 preload 层 + 清 syncState + store 状态刷新；落盘路径套 try/catch，失败不误报成功
    const confirmImport = () => {
        if (!pendingImport) return;
        // 文件选择对话框期间任务可能已启动，落地写入前再检查一次
        if (useProgressStore.getState().isJobBusy()) {
            setPendingImport(null);
            notifyJobBusy(lang);
            return;
        }
        try {
            const { data, skipped } = pendingImport;
            const api = window.githubStarsAPI;
            // 字段存在才写（缺失跳过，兼容旧格式备份）；repositories 为数组即写入（含空数组的合法语义）
            if (data.repositories !== undefined) {
                api.setRepos(data.repositories);
                // 清除本机增量同步状态：导入的异构数据与旧 syncState 错配，下次同步必须全量对账
                api.clearSyncState();
            }
            if (data.tags !== undefined) api.setTags(data.tags);
            if (data.notes !== undefined) api.setNotes(data.notes);
            if (data.releaseSubscriptions !== undefined) api.setReleaseSubscriptions(data.releaseSubscriptions);
            if (data.readReleaseIds !== undefined) api.setReadReleaseIds(data.readReleaseIds);
            if (data.settings !== undefined) {
                saveSettings(data.settings);
            }

            // store 状态刷新序列：导入已直写 preload 层，从存储重载六类对应的内存态
            // （loadRepositories 会重载订阅单源 subscribedRepoIds 与笔记索引；currentNote
            // 属旧选中仓库的悬空引用，一并复位）
            const state = useStore.getState();
            if (data.repositories !== undefined) state.loadRepositories();
            if (data.tags !== undefined) state.loadTags();
            if (data.readReleaseIds !== undefined) state.loadReleases();
            useStore.setState({ currentNote: null });

            setPendingImport(null);
            // F3：成功提示含各类数量与跳过的无效条目数——部分导入不能误报全量成功
            toast.show(
                lang === 'zh'
                    ? `导入成功：${data.repositories?.length ?? 0} 个仓库（跳过 ${skipped.repos} 条无效记录）、${data.tags?.length ?? 0} 个标签、${data.notes?.length ?? 0} 条笔记、${data.releaseSubscriptions?.length ?? 0} 个订阅`
                    : `Imported ${data.repositories?.length ?? 0} repos (skipped ${skipped.repos} invalid), ${data.tags?.length ?? 0} tags, ${data.notes?.length ?? 0} notes, ${data.releaseSubscriptions?.length ?? 0} subscriptions`,
                { type: 'success', duration: 6000 }
            );
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
                message={t('importConfirmDesc', lang, { count: pendingImport?.data.repositories?.length ?? 0 })}
                confirmText={t('importData', lang)}
                cancelText={t('cancel', lang)}
                onConfirm={confirmImport}
                onCancel={() => setPendingImport(null)}
            />
        </div>
    );
};
