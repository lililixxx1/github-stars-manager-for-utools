import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../stores/useStore';
import { storageService } from '../services/storageService';
import { githubService } from '../services/githubService';
import { t } from '../locales';
import { TokenHelp, TokenHelpHeaderButton } from '../components/TokenHelp';
import { logger } from '../utils/logger';
import {
    ArrowLeft, Key, Check, X, Loader2, Download, Upload,
    Sun, Moon, Monitor, Globe, Sparkles, Play, StopCircle, Zap, Bell
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
    const projectRepositoryUrl = 'https://github.com/lililixxx1/github-stars-manager-for-utools';
    const {
        settings, saveSettings, token, setCurrentPage,
        repositories, setRepositories, saveRepositories,
        isAnalyzing, analyzeProgress, startAutoAnalyze, stopAnalyze,
        releaseCheckStatus, checkReleaseUpdates, setReleasesInitialTab,
    } = useStore();

    const lang = (settings.language || 'zh') as 'zh' | 'en';
    const [tokenInput, setTokenInput] = useState(token || '');
    const [verifying, setVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState<'success' | 'error' | null>(null);
    const [aiModels, setAiModels] = useState<any[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [tokenHelpExpanded, setTokenHelpExpanded] = useState(false);
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

    const handleBack = () => setCurrentPage('home');

    const scheduleAutoSync = () => {
        const { syncStatus } = useStore.getState();

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
        try {
            const valid = await githubService.verifyToken(tokenInput.trim());
            if (valid) {
                storageService.setToken(tokenInput.trim());
                useStore.setState({ token: tokenInput.trim() });
                setVerifyResult('success');
                scheduleAutoSync();
            } else {
                setVerifyResult('error');
            }
        } catch {
            setVerifyResult('error');
        } finally {
            setVerifying(false);
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
                    if (data.repositories) {
                        setRepositories(data.repositories);
                        saveRepositories();
                    }
                    if (data.settings) {
                        saveSettings(data.settings);
                    }
                    window.githubStarsAPI.showNotification(
                        lang === 'zh' ? '数据导入成功' : 'Data imported successfully'
                    );
                } catch {
                    window.githubStarsAPI.showNotification(
                        lang === 'zh' ? '导入失败：文件格式错误' : 'Import failed: invalid file format'
                    );
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const themeOptions = [
        { value: 'auto', icon: <Monitor size={14} />, label: t('autoTheme', lang) },
        { value: 'light', icon: <Sun size={14} />, label: t('lightTheme', lang) },
        { value: 'dark', icon: <Moon size={14} />, label: t('darkTheme', lang) },
    ] as const;

    const subscribedCount = window.githubStarsAPI.getReleaseSubscriptions().length;

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

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="animate-fade-in">
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
                        <p style={{ fontSize: 13, marginTop: 6, color: verifyResult === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
                            {verifyResult === 'success' ? t('tokenVerified', lang) : t('tokenInvalid', lang)}
                        </p>
                    )}

                    {/* Token 帮助面板 - 受控展开 */}
                    <TokenHelp
                        lang={lang}
                        expanded={tokenHelpExpanded}
                        onToggle={() => setTokenHelpExpanded(!tokenHelpExpanded)}
                    />
                </div>

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
                        {lang === 'zh' ? 'AI 分析设置' : 'AI Analysis Settings'}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{lang === 'zh' ? '启动时自动分析' : 'Auto-analyze on startup'}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{lang === 'zh' ? '打开插件时自动分析未分析的仓库，每次分析消耗AI能量' : 'Analyze unanalyzed repos when plugin opens'}</div>
                        </div>
                        <button className={`btn ${settings.autoAnalyzeOnOpen ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => saveSettings({ autoAnalyzeOnOpen: !settings.autoAnalyzeOnOpen })} style={{ minWidth: 60 }}>
                            {settings.autoAnalyzeOnOpen ? (lang === 'zh' ? '开' : 'On') : (lang === 'zh' ? '关' : 'Off')}
                        </button>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{lang === 'zh' ? '并发数' : 'Concurrency'}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button key={n} className={`btn ${(settings.aiConcurrency || 1) === n ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => saveSettings({ aiConcurrency: n })} style={{ flex: 1 }}>{n}</button>
                            ))}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{lang === 'zh' ? '并发数越高分析越快，但可能触发限流' : 'Higher concurrency is faster but may trigger rate limits'}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => isAnalyzing ? stopAnalyze() : startAutoAnalyze()} disabled={!token || repositories.length === 0} style={{ flex: 1 }} title={!token ? (lang === 'zh' ? '请先配置 GitHub Token' : 'Please configure GitHub Token first') : repositories.length === 0 ? (lang === 'zh' ? '请先同步仓库' : 'Please sync repositories first') : undefined}>
                            {isAnalyzing ? <><StopCircle size={14} />{lang === 'zh' ? '停止分析' : 'Stop Analysis'}</> : <><Play size={14} />{lang === 'zh' ? '立即分析' : 'Analyze Now'}</>}
                        </button>
                    </div>
                    {!token && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-warning)' }}>{lang === 'zh' ? '⚠️ 请先配置 GitHub Token 以使用 AI 分析功能' : '⚠️ Please configure GitHub Token to use AI analysis'}</div>}
                    {isAnalyzing && analyzeProgress && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{lang === 'zh' ? '正在分析: ' : 'Analyzing: '}{analyzeProgress.currentRepo}</div>
                            <div style={{ height: 4, background: 'var(--color-surface-secondary)', borderRadius: 2 }}>
                                <div style={{ height: '100%', width: `${Math.round((analyzeProgress.current / analyzeProgress.total) * 100)}%`, background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))', borderRadius: 2, transition: 'width 0.3s ease' }} />
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{analyzeProgress.current}/{analyzeProgress.total}</div>
                        </div>
                    )}
                    {!isAnalyzing && repositories.length > 0 && (
                        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
                            {lang === 'zh' ? `已分析: ${repositories.filter(r => r.analyzedAt && !r.analysisFailed).length} / ${repositories.length} 个仓库` : `Analyzed: ${repositories.filter(r => r.analyzedAt && !r.analysisFailed).length} / ${repositories.length} repos`}
                            {repositories.filter(r => r.analysisFailed).length > 0 && <span style={{ color: 'var(--color-error)', marginLeft: 8 }}>({lang === 'zh' ? '失败' : 'Failed'}: {repositories.filter(r => r.analysisFailed).length})</span>}
                        </div>
                    )}
                    {repositories.length === 0 && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>{lang === 'zh' ? '请先同步仓库后再进行分析' : 'Please sync repositories first'}</div>}
                </div>

                {/* 版本追踪设置 🆕 v1.4.0 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Bell size={14} style={{ color: 'var(--color-primary)' }} />
                        {t('releaseSubscription', lang)}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('autoCheckUpdates', lang)}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{lang === 'zh' ? '打开插件时自动检查订阅仓库的版本更新' : 'Automatically check for updates on startup'}</div>
                        </div>
                        <button className={`btn ${(settings.autoCheckReleaseUpdates !== false) ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => saveSettings({ autoCheckReleaseUpdates: settings.autoCheckReleaseUpdates === false })} style={{ minWidth: 60 }}>
                            {(settings.autoCheckReleaseUpdates !== false) ? (lang === 'zh' ? '开' : 'On') : (lang === 'zh' ? '关' : 'Off')}
                        </button>
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
                    {releaseCheckStatus.error && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-error)' }}>⚠️ {releaseCheckStatus.error}</div>}
                </div>

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

                {/* 每页数量 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{t('itemsPerPage', lang)}</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {[10, 20, 50, 100].map((n) => (
                            <button key={n} className={`btn ${settings.itemsPerPage === n ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => saveSettings({ itemsPerPage: n })} style={{ flex: 1 }}>{n}</button>
                        ))}
                    </div>
                </div>

                {/* 导入导出 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{lang === 'zh' ? '数据管理' : 'Data Management'}</h3>
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
                        {t('version', lang)}: 1.6.2<br />
                        <a href="#" onClick={(e) => { e.preventDefault(); window.githubStarsAPI.openExternal(projectRepositoryUrl); }} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                            {lang === 'zh' ? '项目地址' : 'Project Repository'}
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};
