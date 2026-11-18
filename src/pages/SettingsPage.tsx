import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { storageService } from '../services/storageService';
import { githubService } from '../services/githubService';
import { useT } from '../hooks/useT';
import type { Language } from '../locales';
import { TokenHelp, TokenHelpHeaderButton } from '../components/TokenHelp';
import { Toggle } from '../components/Toggle';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionCard } from '../components/ui/SectionCard';
import { toast } from '../components/Toast';
import { logger } from '../utils/logger';
import { formatRelativeTime } from '../utils/format';
import { useBackShortcut } from '../hooks/useBackShortcut';
import type { ValidatedBackup } from '../utils/backup';
import { buildBackup, validateBackup } from '../utils/backup';
import pkg from '../../package.json';
import {
    Key, Check, X, Loader2, Download, Upload,
    Sun, Moon, Monitor, Globe, Sparkles, Play, StopCircle, Zap, Bell,
    AlertTriangle, Link2, BrainCircuit, Rss, Palette, Database, CheckCircle2,
} from 'lucide-react';

type SettingsSectionId = 'connection' | 'ai' | 'releases' | 'appearance' | 'data';

const IMPORT_ERROR_MESSAGES: Record<Language, Record<string, string>> = {
    zh: {
        invalid_file: '文件不是有效的备份',
        repositories_invalid: '仓库数据格式错误',
        tags_invalid: '标签数据格式错误',
        notes_invalid: '笔记数据格式错误',
        release_subscriptions_invalid: '订阅数据格式错误',
        read_release_ids_invalid: '已读记录格式错误',
    },
    en: {
        invalid_file: 'Not a valid backup file',
        repositories_invalid: 'Invalid repositories data',
        tags_invalid: 'Invalid tags data',
        notes_invalid: 'Invalid notes data',
        release_subscriptions_invalid: 'Invalid subscription data',
        read_release_ids_invalid: 'Invalid read history data',
    },
};

export const SettingsPage: React.FC = () => {
    const projectRepositoryUrl = 'https://github.com/lililixxx1/github-stars-manager-for-utools';
    const { t, lang } = useT();

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

    const [activeSection, setActiveSection] = useState<SettingsSectionId>('connection');
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
        loadAIModels();
    }, []);

    useEffect(() => {
        return () => {
            if (autoSyncTimerRef.current !== null) {
                window.clearTimeout(autoSyncTimerRef.current);
            }
        };
    }, []);

    const handleBack = useCallback(() => {
        setCurrentPage('home');
    }, [setCurrentPage]);

    useBackShortcut({
        onBack: handleBack,
        deps: [handleBack],
    });

    const scheduleAutoSync = () => {
        const { syncStatus } = useProgressStore.getState();
        logger.log('[AutoSync] Token verified, scheduling sync', { syncStatus });
        if (syncStatus === 'syncing') return;

        if (autoSyncTimerRef.current !== null) {
            window.clearTimeout(autoSyncTimerRef.current);
        }
        autoSyncTimerRef.current = window.setTimeout(() => {
            autoSyncTimerRef.current = null;
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
            setVerifyErrorReason('network');
            setVerifyResult('error');
        } finally {
            setVerifying(false);
        }
    };

    const handleAnalyzeToggle = async () => {
        if (isAnalyzing) {
            stopAnalyze();
            return;
        }
        const result = await startAutoAnalyze();
        if (result === 'busy') {
            toast.show(t('analyzeDeferredBusy'));
        }
    };

    const handleExport = () => {
        const data = buildBackup();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `github-stars-backup-${Date.now()}.json`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleImport = () => {
        if (useProgressStore.getState().isJobBusy()) {
            toast.show(t('importJobBusy'), { type: 'info' });
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
                    const result = validateBackup(raw);
                    if (!result.ok) {
                        const errMap = IMPORT_ERROR_MESSAGES[lang];
                        toast.show(
                            t('importFailedPrefix', { reason: errMap[result.error] || errMap.invalid_file }),
                            { type: 'error' }
                        );
                        return;
                    }
                    setPendingImport({ data: result.data, skipped: result.skipped });
                } catch {
                    toast.show(t('importFailed'), { type: 'error' });
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const confirmImport = () => {
        if (!pendingImport) return;
        if (useProgressStore.getState().isJobBusy()) {
            setPendingImport(null);
            toast.show(t('importJobBusy'), { type: 'info' });
            return;
        }
        try {
            const { data, skipped } = pendingImport;
            const api = window.githubStarsAPI;
            if (data.repositories !== undefined) {
                api.setRepos(data.repositories);
                api.clearSyncState();
            }
            if (data.tags !== undefined) api.setTags(data.tags);
            if (data.notes !== undefined) api.setNotes(data.notes);
            if (data.releaseSubscriptions !== undefined) api.setReleaseSubscriptions(data.releaseSubscriptions);
            if (data.readReleaseIds !== undefined) api.setReadReleaseIds(data.readReleaseIds);
            if (data.settings !== undefined) {
                saveSettings(data.settings);
            }

            const state = useStore.getState();
            if (data.repositories !== undefined) state.loadRepositories();
            if (data.tags !== undefined) state.loadTags();
            if (data.readReleaseIds !== undefined) state.loadReleases();
            useStore.setState({ currentNote: null });

            setPendingImport(null);
            toast.show(
                t('importSuccessDetail', {
                    repos: data.repositories?.length ?? 0,
                    skipped: skipped.repos,
                    tags: data.tags?.length ?? 0,
                    notes: data.notes?.length ?? 0,
                    subs: data.releaseSubscriptions?.length ?? 0,
                }),
                { type: 'success', duration: 6000 }
            );
        } catch {
            setPendingImport(null);
            toast.show(t('importFailed'), { type: 'error' });
        }
    };

    const themeOptions = [
        { value: 'auto', icon: <Monitor size={14} />, label: t('autoTheme') },
        { value: 'light', icon: <Sun size={14} />, label: t('lightTheme') },
        { value: 'dark', icon: <Moon size={14} />, label: t('darkTheme') },
    ] as const;

    const subscribedCount = useMemo(
        () => repositories.reduce((count, r) => (r.isSubscribed ? count + 1 : count), 0),
        [repositories]
    );

    const analyzedStats = useMemo(() => {
        let analyzed = 0;
        let failed = 0;
        for (const r of repositories) {
            if (r.analysisFailed) failed++;
            else if (r.analyzedAt) analyzed++;
        }
        const pct = repositories.length > 0 ? Math.round((analyzed / repositories.length) * 100) : 0;
        return { analyzed, failed, pct };
    }, [repositories]);

    const navItems: Array<{ id: SettingsSectionId; label: string; icon: React.ReactNode }> = [
        { id: 'connection', label: t('settingsGroupConnection'), icon: <Link2 size={14} /> },
        { id: 'ai', label: t('settingsGroupAI'), icon: <BrainCircuit size={14} /> },
        { id: 'releases', label: t('settingsGroupReleases'), icon: <Rss size={14} /> },
        { id: 'appearance', label: t('settingsGroupAppearance'), icon: <Palette size={14} /> },
        { id: 'data', label: t('settingsGroupDataAndAbout'), icon: <Database size={14} /> },
    ];

    const lastSyncText = settings.lastSyncTime
        ? formatRelativeTime(settings.lastSyncTime, lang)
        : t('overviewNeverSynced');

    return (
        <div className="flex flex-col h-full">
            <PageHeader title={t('settings')} backLabel={t('back')} onBack={handleBack} />

            {/* 顶部状态概览卡片 */}
            <div className="settings-overview-grid">
                <button
                    type="button"
                    className="settings-stat-card"
                    onClick={() => setActiveSection('connection')}
                >
                    <span className="text-[11px] text-[var(--color-text-muted)]">{t('overviewToken')}</span>
                    <span
                        className="text-[13px] font-semibold flex items-center gap-1"
                        style={{ color: token ? 'var(--color-success-strong)' : 'var(--color-warning-strong)' }}
                    >
                        {token ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                        {token ? t('overviewTokenConfigured') : t('overviewTokenMissing')}
                    </span>
                </button>

                <button
                    type="button"
                    className="settings-stat-card"
                    onClick={() => setActiveSection('connection')}
                >
                    <span className="text-[11px] text-[var(--color-text-muted)]">{t('overviewLastSync')}</span>
                    <span className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
                        {lastSyncText} · {repositories.length}
                    </span>
                </button>

                <button
                    type="button"
                    className="settings-stat-card"
                    onClick={() => setActiveSection('ai')}
                >
                    <span className="text-[11px] text-[var(--color-text-muted)]">{t('overviewAiProgress')}</span>
                    <span className="text-[13px] font-semibold text-[var(--color-text-primary)] tabular-nums">
                        {analyzedStats.analyzed} / {repositories.length} ({analyzedStats.pct}%)
                    </span>
                </button>

                <button
                    type="button"
                    className="settings-stat-card"
                    onClick={() => {
                        setReleasesInitialTab('subscriptions');
                        setCurrentPage('releases');
                    }}
                >
                    <span className="text-[11px] text-[var(--color-text-muted)]">{t('overviewSubscriptions')}</span>
                    <span className="text-[13px] font-semibold text-[var(--color-primary)] tabular-nums">
                        {subscribedCount}
                    </span>
                </button>
            </div>

            {/* 左侧导航 + 右侧分组详情 */}
            <div className="settings-layout">
                <nav className="settings-sidebar" aria-label={t('settings')}>
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`settings-nav-item${activeSection === item.id ? ' active' : ''}`}
                            onClick={() => setActiveSection(item.id)}
                            aria-current={activeSection === item.id ? 'page' : undefined}
                        >
                            {item.icon}
                            <span className="truncate">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="settings-content">
                    {activeSection === 'connection' && (
                        <SectionCard
                            title={t('githubToken')}
                            icon={<Key size={14} style={{ color: 'var(--color-primary)' }} />}
                            action={
                                <TokenHelpHeaderButton
                                    lang={lang}
                                    expanded={tokenHelpExpanded}
                                    onToggle={() => setTokenHelpExpanded(!tokenHelpExpanded)}
                                />
                            }
                        >
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    className="input"
                                    value={tokenInput}
                                    onChange={(e) => { setTokenInput(e.target.value); setVerifyResult(null); }}
                                    placeholder={t('tokenPlaceholder')}
                                />
                                <button
                                    className="btn btn-primary shrink-0"
                                    onClick={handleVerifyToken}
                                    disabled={verifying || !tokenInput.trim()}
                                >
                                    {verifying ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : verifyResult === 'success' ? (
                                        <Check size={14} />
                                    ) : verifyResult === 'error' ? (
                                        <X size={14} />
                                    ) : (
                                        <Key size={14} />
                                    )}
                                    {t('verifyToken')}
                                </button>
                            </div>
                            {verifyResult && (
                                <p
                                    className="text-[13px] mt-1.5"
                                    style={{ color: verifyResult === 'success' ? 'var(--color-success)' : 'var(--color-error-text)' }}
                                >
                                    {verifyResult === 'success'
                                        ? t('tokenVerified')
                                        : verifyErrorReason === 'rateLimited'
                                            ? t('errorRateLimited')
                                            : verifyErrorReason === 'network'
                                                ? t('errorNetwork')
                                                : t('errorTokenInvalid')}
                                </p>
                            )}
                            <TokenHelp
                                lang={lang}
                                expanded={tokenHelpExpanded}
                                onToggle={() => setTokenHelpExpanded(!tokenHelpExpanded)}
                            />
                        </SectionCard>
                    )}

                    {activeSection === 'ai' && (
                        <>
                            <SectionCard
                                title={t('aiModelTitle')}
                                icon={<Sparkles size={14} style={{ color: 'var(--color-primary)' }} />}
                            >
                                {loadingModels ? (
                                    <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
                                        <Loader2 size={14} className="animate-spin" />
                                        {t('aiModelLoading')}
                                    </div>
                                ) : aiModels.length === 0 ? (
                                    <p className="text-[13px] text-[var(--color-text-muted)]">{t('aiModelEmpty')}</p>
                                ) : (
                                    <div>
                                        <select
                                            className="input cursor-pointer"
                                            value={settings.aiModel || ''}
                                            onChange={(e) => saveSettings({ aiModel: e.target.value })}
                                        >
                                            <option value="">{t('aiModelDefault')}</option>
                                            {aiModels.map((model: any) => {
                                                const modelId = typeof model === 'string' ? model : (model.id || model.name || String(model));
                                                const modelName = typeof model === 'string'
                                                    ? model
                                                    : (model.title || model.label || model.displayName || model.name || (model.id && !model.id.startsWith('aimodels/') ? model.id : null) || model.model || modelId);
                                                return <option key={modelId} value={modelId}>{modelName}</option>;
                                            })}
                                        </select>
                                        <p className="text-[12px] text-[var(--color-text-muted)] mt-1.5">{t('aiModelHint')}</p>
                                    </div>
                                )}
                            </SectionCard>

                            <SectionCard
                                title={t('aiAnalysisSettings')}
                                icon={<Zap size={14} style={{ color: 'var(--color-primary)' }} />}
                            >
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <div className="text-[13px] font-medium">{t('autoAnalyzeOnOpen')}</div>
                                        <div className="text-[12px] text-[var(--color-text-muted)]">{t('autoAnalyzeOnOpenHint')}</div>
                                    </div>
                                    <Toggle
                                        checked={!!settings.autoAnalyzeOnOpen}
                                        onChange={(checked) => saveSettings({ autoAnalyzeOnOpen: checked })}
                                        aria-label={t('autoAnalyzeOnOpen')}
                                    />
                                </div>

                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <div className="text-[13px] font-medium">{t('aiThinking')}</div>
                                        <div className="text-[12px] text-[var(--color-text-muted)]">{t('aiThinkingHint')}</div>
                                    </div>
                                    <Toggle
                                        checked={!!settings.aiThinking}
                                        onChange={(checked) => saveSettings({ aiThinking: checked })}
                                        aria-label={t('aiThinking')}
                                    />
                                </div>

                                <div className="mb-3">
                                    <div className="text-[13px] font-medium mb-1.5">{t('concurrency')}</div>
                                    <div className="segmented w-full">
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
                                    <div className="text-[12px] text-[var(--color-text-muted)] mt-1">{t('concurrencyHint')}</div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        className="btn btn-primary btn-sm flex-1 justify-center"
                                        onClick={handleAnalyzeToggle}
                                        disabled={!token || repositories.length === 0}
                                        title={!token ? t('tokenRequiredHint') : repositories.length === 0 ? t('syncRequiredHint') : undefined}
                                    >
                                        {isAnalyzing ? <><StopCircle size={14} />{t('stopAnalysis')}</> : <><Play size={14} />{t('analyzeNow')}</>}
                                    </button>
                                </div>

                                {!token && (
                                    <div className="mt-2 text-[12px] flex items-center gap-1" style={{ color: 'var(--color-warning-strong)' }}>
                                        <AlertTriangle size={12} />
                                        {t('aiAnalyzeNeedTokenHint')}
                                    </div>
                                )}

                                {!isAnalyzing && repositories.length > 0 && (
                                    <div className="mt-3">
                                        <div className="text-[12px] text-[var(--color-text-muted)] mb-1.5">
                                            {t('analyzedCount', { count: analyzedStats.analyzed, total: repositories.length })}
                                            {analyzedStats.failed > 0 && (
                                                <span className="ml-2" style={{ color: 'var(--color-error-text)' }}>
                                                    ({t('failedLabel')}: {analyzedStats.failed})
                                                </span>
                                            )}
                                        </div>
                                        <div className="progress-bar">
                                            <div className="progress-bar-fill" style={{ width: `${analyzedStats.pct}%` }} />
                                        </div>
                                    </div>
                                )}

                                {repositories.length === 0 && (
                                    <div className="mt-3 text-[12px] text-[var(--color-text-muted)]">
                                        {t('aiAnalyzeNeedSyncHint')}
                                    </div>
                                )}
                            </SectionCard>
                        </>
                    )}

                    {activeSection === 'releases' && (
                        <SectionCard
                            title={t('releaseSubscription')}
                            icon={<Bell size={14} style={{ color: 'var(--color-primary)' }} />}
                        >
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <div className="text-[13px] font-medium">{t('autoCheckUpdates')}</div>
                                    <div className="text-[12px] text-[var(--color-text-muted)]">{t('autoCheckUpdatesHint')}</div>
                                </div>
                                <Toggle
                                    checked={settings.autoCheckReleaseUpdates !== false}
                                    onChange={(checked) => saveSettings({ autoCheckReleaseUpdates: checked })}
                                    aria-label={t('autoCheckUpdates')}
                                />
                            </div>

                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <div className="text-[13px] font-medium">{t('subscribedRepos')}</div>
                                    <div className="text-[12px] text-[var(--color-text-muted)]">
                                        {t('subscribedCount', { count: subscribedCount })}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                        setReleasesInitialTab('subscriptions');
                                        setCurrentPage('releases');
                                    }}
                                >
                                    {t('manageSubscriptions')}
                                </button>
                            </div>

                            <button
                                className="btn btn-primary btn-sm w-full justify-center"
                                onClick={() => checkReleaseUpdates()}
                                disabled={releaseCheckStatus.checking || !token || subscribedCount === 0}
                                title={!token ? t('tokenRequiredHint') : subscribedCount === 0 ? t('subscribeRequiredHint') : undefined}
                            >
                                {releaseCheckStatus.checking ? (
                                    <><Loader2 size={14} className="animate-spin" />{t('checkingUpdates')}</>
                                ) : (
                                    <><Bell size={14} />{t('checkUpdates')}</>
                                )}
                            </button>

                            {releaseCheckStatus.lastCheckedAt && (
                                <div className="mt-2 text-[12px] text-[var(--color-text-muted)]">
                                    {t('lastChecked')}: {new Date(releaseCheckStatus.lastCheckedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                                </div>
                            )}
                            {releaseCheckStatus.error && (
                                <div className="mt-2 text-[12px] flex items-center gap-1" style={{ color: 'var(--color-error-text)' }}>
                                    <AlertTriangle size={12} />
                                    {releaseCheckStatus.error}
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {activeSection === 'appearance' && (
                        <>
                            <SectionCard title={t('theme')}>
                                <div className="flex gap-2">
                                    {themeOptions.map((opt) => (
                                        <button
                                            key={opt.value}
                                            className={`btn ${settings.theme === opt.value ? 'btn-primary' : 'btn-secondary'} btn-sm flex-1 justify-center`}
                                            onClick={() => saveSettings({ theme: opt.value })}
                                        >
                                            {opt.icon} {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </SectionCard>

                            <SectionCard title={t('language')} icon={<Globe size={14} />}>
                                <div className="flex gap-2">
                                    <button
                                        className={`btn ${settings.language === 'zh' ? 'btn-primary' : 'btn-secondary'} btn-sm flex-1 justify-center`}
                                        onClick={() => saveSettings({ language: 'zh' })}
                                    >
                                        中文
                                    </button>
                                    <button
                                        className={`btn ${settings.language === 'en' ? 'btn-primary' : 'btn-secondary'} btn-sm flex-1 justify-center`}
                                        onClick={() => saveSettings({ language: 'en' })}
                                    >
                                        English
                                    </button>
                                </div>
                            </SectionCard>

                            <SectionCard title={t('itemsPerPage')}>
                                <div className="segmented w-full">
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
                                        title={t('itemsPerPageAllHint')}
                                    >
                                        {t('itemsPerPageAll')}
                                    </button>
                                </div>
                            </SectionCard>
                        </>
                    )}

                    {activeSection === 'data' && (
                        <>
                            <SectionCard title={t('dataManagement')}>
                                <div className="flex gap-2">
                                    <button className="btn btn-secondary flex-1 justify-center" onClick={handleExport}>
                                        <Download size={14} />{t('exportData')}
                                    </button>
                                    <button className="btn btn-secondary flex-1 justify-center" onClick={handleImport}>
                                        <Upload size={14} />{t('importData')}
                                    </button>
                                </div>
                            </SectionCard>

                            <SectionCard title={t('about')}>
                                <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                                    GitHub Stars Manager For uTools<br />
                                    {t('version')}: {pkg.version}<br />
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.githubStarsAPI.openExternal(projectRepositoryUrl);
                                        }}
                                        className="link"
                                    >
                                        {t('projectRepoLink')}
                                    </a>
                                </p>
                            </SectionCard>
                        </>
                    )}
                </div>
            </div>

            <ConfirmDialog
                variant="danger"
                autoFocusButton="cancel"
                isOpen={!!pendingImport}
                title={t('importConfirmTitle')}
                message={t('importConfirmDesc', { count: pendingImport?.data.repositories?.length ?? 0 })}
                confirmText={t('importData')}
                cancelText={t('cancel')}
                onConfirm={confirmImport}
                onCancel={() => setPendingImport(null)}
            />
        </div>
    );
};
