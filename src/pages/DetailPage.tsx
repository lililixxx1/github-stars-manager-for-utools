import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../stores/useStore';
import { aiService } from '../services/aiService';
import { t } from '../locales';
import { TagBadge } from '../components/TagBadge';
import { TagChip } from '../components/TagChip';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { toast } from '../components/Toast';
import { checkAnalysisNeeded, getCooldownMinutes } from '../utils/analysis';
import { formatCompactNumber, formatRelativeTime } from '../utils/format';
import { MarkdownView } from '../components/MarkdownView';
import { shouldIgnoreGlobalKeydown } from '../utils/keyboard';
import { useBackShortcut } from '../hooks/useBackShortcut';
import { BackHintChip } from '../components/BackHintChip';
import { getLanguageColor } from '../constants/languages';
import { PLATFORM_OPTIONS } from '../constants/platforms';
import { getPlatformIcon } from '../constants/platformIcons';
import {
    ExternalLink,
    Star,
    GitFork,
    Sparkles,
    Bell,
    BellOff,
    Loader2,
    CheckCircle2,
    XCircle,
    Edit2,
    Save,
    X,
    Plus,
    FileText,
    Tag,
    Copy,
    ChevronLeft,
    ChevronRight,
    Globe,
    BookOpen,
    Box,
    Clock,
} from 'lucide-react';

type DetailTab = 'overview' | 'readme' | 'notes';

/** 模块级 README 缓存（避免同会话切回重复请求 GitHub API） */
const readmeCache = new Map<number, string | null>();

const QUICK_TAG_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const getPlatformLabel = (id: string): string => {
    const normalized = id.toLowerCase();
    const found = PLATFORM_OPTIONS.find((opt) => opt.id === normalized);
    return found?.label || id;
};

export const DetailPage: React.FC = () => {
    const selectedRepoId = useStore((s) => s.selectedRepoId);
    const setSelectedRepoId = useStore((s) => s.setSelectedRepoId);
    const repositories = useStore((s) => s.repositories);
    const searchFilter = useStore((s) => s.searchFilter);
    const noteRepoIds = useStore((s) => s.noteRepoIds);
    const noteContentByRepoId = useStore((s) => s.noteContentByRepoId);
    const getFilteredRepos = useStore((s) => s.getFilteredRepos);

    const repo = useStore((s) =>
        s.selectedRepoId == null ? null : (s.repositories.find((r) => r.id === s.selectedRepoId) ?? null)
    );
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const settings = useStore((state) => state.settings);
    const token = useStore((state) => state.token);
    const tags = useStore((state) => state.tags);
    const tagById = useStore((state) => state.tagById);
    const addTag = useStore((state) => state.addTag);
    const updateRepository = useStore((state) => state.updateRepository);
    const toggleSubscription = useStore((state) => state.toggleSubscription);
    const currentNote = useStore((state) => state.currentNote);
    const loadNote = useStore((state) => state.loadNote);
    const saveNote = useStore((state) => state.saveNote);
    const deleteNote = useStore((state) => state.deleteNote);
    const subscribedRepoIds = useStore((state) => state.subscribedRepoIds);

    const lang = (settings.language || 'zh') as 'zh' | 'en';

    const [activeTab, setActiveTab] = useState<DetailTab>('overview');
    const [analyzing, setAnalyzing] = useState(false);
    const [editingAlias, setEditingAlias] = useState(false);
    const [aliasValue, setAliasValue] = useState('');
    const [editingNote, setEditingNote] = useState(false);
    const [noteValue, setNoteValue] = useState('');
    const [showTagSelector, setShowTagSelector] = useState(false);
    const [quickTagName, setQuickTagName] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false);
    const [avatarError, setAvatarError] = useState(false);

    // README 状态
    const [readmeContent, setReadmeContent] = useState<string | null>(null);
    const [readmeLoading, setReadmeLoading] = useState(false);

    // 列表内上一个 / 下一个定位
    const filteredRepos = useMemo(
        () => getFilteredRepos(),
        [repositories, searchFilter, noteRepoIds, noteContentByRepoId, getFilteredRepos]
    );
    const currentIndex = useMemo(
        () => (repo ? filteredRepos.findIndex((r) => r.id === repo.id) : -1),
        [filteredRepos, repo]
    );
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex >= 0 && currentIndex < filteredRepos.length - 1;

    useEffect(() => {
        if (selectedRepoId != null) {
            loadNote(selectedRepoId);
        }
        setEditingAlias(false);
        setEditingNote(false);
        setShowTagSelector(false);
        setShowDeleteConfirm(false);
        setShowReanalyzeConfirm(false);
        setAvatarError(false);
    }, [selectedRepoId, loadNote]);

    // 加载 README（切到 README tab 或切换仓库时按需拉取）
    useEffect(() => {
        if (activeTab !== 'readme' || !repo) return;

        if (readmeCache.has(repo.id)) {
            setReadmeContent(readmeCache.get(repo.id) ?? null);
            setReadmeLoading(false);
            return;
        }

        let cancelled = false;
        setReadmeLoading(true);
        setReadmeContent(null);

        window.githubStarsAPI
            .getReadme(repo.owner.login, repo.name, token || '')
            .then((content) => {
                if (cancelled) return;
                const normalized = content?.trim() ? content : null;
                readmeCache.set(repo.id, normalized);
                setReadmeContent(normalized);
            })
            .catch(() => {
                if (!cancelled) {
                    setReadmeContent(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setReadmeLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, repo, token]);

    // 幽灵详情页兜底
    useEffect(() => {
        if (selectedRepoId == null) {
            setCurrentPage('home');
            return;
        }
        if (!repo) {
            setSelectedRepoId(null);
        }
    }, [selectedRepoId, repo, setCurrentPage, setSelectedRepoId]);

    const handleBack = useCallback(() => {
        setSelectedRepoId(null);
        setCurrentPage('home');
    }, [setCurrentPage, setSelectedRepoId]);

    const handlePrevRepo = useCallback(() => {
        if (!hasPrev) return;
        setSelectedRepoId(filteredRepos[currentIndex - 1].id);
    }, [currentIndex, filteredRepos, hasPrev, setSelectedRepoId]);

    const handleNextRepo = useCallback(() => {
        if (!hasNext) return;
        setSelectedRepoId(filteredRepos[currentIndex + 1].id);
    }, [currentIndex, filteredRepos, hasNext, setSelectedRepoId]);

    // J / K / [ / ] 切换上下仓库
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (editingAlias || editingNote || showDeleteConfirm || showReanalyzeConfirm) return;
            if (shouldIgnoreGlobalKeydown(event)) return;

            if (event.key === 'j' || event.key === 'J' || event.key === ']') {
                if (!hasNext) return;
                event.preventDefault();
                handleNextRepo();
            } else if (event.key === 'k' || event.key === 'K' || event.key === '[') {
                if (!hasPrev) return;
                event.preventDefault();
                handlePrevRepo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        editingAlias,
        editingNote,
        handleNextRepo,
        handlePrevRepo,
        hasNext,
        hasPrev,
        showDeleteConfirm,
        showReanalyzeConfirm,
    ]);

    const consumeDetailBackState = useCallback(() => {
        if (showDeleteConfirm) {
            setShowDeleteConfirm(false);
            return true;
        }
        if (showReanalyzeConfirm) {
            setShowReanalyzeConfirm(false);
            return true;
        }
        if (editingAlias) {
            setAliasValue('');
            setEditingAlias(false);
            return true;
        }
        if (editingNote) {
            setNoteValue('');
            setEditingNote(false);
            return true;
        }
        if (showTagSelector) {
            setShowTagSelector(false);
            return true;
        }
        return false;
    }, [editingAlias, editingNote, showDeleteConfirm, showReanalyzeConfirm, showTagSelector]);

    useBackShortcut({
        enabled: !!repo,
        capture: true,
        target: document,
        onBack: handleBack,
        beforeBack: consumeDetailBackState,
        deps: [consumeDetailBackState, handleBack, repo],
    });

    const isSubscribed = useMemo(
        () => (repo ? subscribedRepoIds.has(repo.id) : false),
        [repo, subscribedRepoIds]
    );

    const failedCooldownMinutes = repo?.analysisFailed ? getCooldownMinutes(repo) : 0;

    const aliasInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (editingAlias) {
            window.requestAnimationFrame(() => aliasInputRef.current?.focus());
        }
    }, [editingAlias]);

    const handleOpenGithub = () => {
        if (repo) window.githubStarsAPI.openExternal(repo.htmlUrl);
    };

    const handleOpenHomepage = () => {
        if (repo?.homepage) window.githubStarsAPI.openExternal(repo.homepage);
    };

    const handleCopyRepoUrl = useCallback(() => {
        if (!repo?.htmlUrl) return;
        if (typeof utools !== 'undefined' && utools.copyText) {
            utools.copyText(repo.htmlUrl);
        } else {
            navigator.clipboard?.writeText(repo.htmlUrl).catch(() => {});
        }
        toast.show(lang === 'zh' ? '已复制仓库地址' : 'Repository URL copied', { type: 'info' });
    }, [repo?.htmlUrl, lang]);

    const executeAnalyze = async () => {
        if (!repo || !token || analyzing) return;
        setAnalyzing(true);

        const markFailure = () => {
            updateRepository(repo.id, {
                analysisFailed: true,
                analyzedAt: new Date().toISOString(),
            });
        };

        try {
            const result = await aiService.analyzeRepository(
                repo,
                token,
                lang,
                settings.aiModel || undefined,
                !!settings.aiThinking
            );
            if (result) {
                updateRepository(repo.id, {
                    aiSummary: result.summary,
                    aiTags: result.tags,
                    aiPlatforms: result.platforms,
                    analyzedAt: new Date().toISOString(),
                    analysisFailed: false,
                });
                toast.show(t('aiAnalyzeSuccess', lang), { type: 'success' });
            } else {
                markFailure();
            }
        } catch (error) {
            console.error('AI analyze failed:', error);
            toast.show(
                error instanceof Error ? error.message : t('analysisFailed', lang),
                { type: 'error', duration: 5000 }
            );
            markFailure();
        } finally {
            setAnalyzing(false);
        }
    };

    const handleAIAnalyze = async () => {
        if (!repo) return;
        if (!token) {
            toast.show(t('tokenRequired', lang), { type: 'error' });
            return;
        }
        if (analyzing) return;

        const { needsAnalyze, reason } = checkAnalysisNeeded(repo);
        if (!needsAnalyze) {
            if (reason === 'analyzed') {
                setShowReanalyzeConfirm(true);
                return;
            }
            if (reason === 'failed_cooldown') {
                const cooldownMinutes = getCooldownMinutes(repo);
                toast.show(
                    lang === 'zh'
                        ? `请等待 ${cooldownMinutes} 分钟后重试`
                        : `Please retry after ${cooldownMinutes} minutes`,
                    { type: 'info' }
                );
                return;
            }
        }

        await executeAnalyze();
    };

    const handleStartEditAlias = () => {
        if (!repo) return;
        setAliasValue(repo.alias || '');
        setEditingAlias(true);
    };

    const handleSaveAlias = () => {
        if (!repo) return;
        updateRepository(repo.id, { alias: aliasValue.trim() || undefined });
        setEditingAlias(false);
    };

    const handleCancelAlias = () => {
        setAliasValue('');
        setEditingAlias(false);
    };

    const handleToggleTag = (tagId: string) => {
        if (!repo) return;
        const currentTags = repo.customTags || [];
        const newTags = currentTags.includes(tagId)
            ? currentTags.filter((id) => id !== tagId)
            : [...currentTags, tagId];
        updateRepository(repo.id, { customTags: newTags });
    };

    const handleQuickCreateTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || !repo) return;
        const name = quickTagName.trim();
        if (!name) return;
        const color = QUICK_TAG_COLORS[tags.length % QUICK_TAG_COLORS.length];
        const created = addTag({ name, color, icon: '🏷️', order: tags.length });
        setQuickTagName('');
        updateRepository(repo.id, { customTags: [...(repo.customTags || []), created.id] });
    };

    const handleStartEditNote = () => {
        setNoteValue(currentNote?.content || '');
        setEditingNote(true);
    };

    const handleSaveNote = () => {
        if (repo) {
            saveNote(repo.id, noteValue);
        }
        setEditingNote(false);
    };

    const confirmDeleteNote = () => {
        if (repo) {
            deleteNote(repo.id);
            setShowDeleteConfirm(false);
            setEditingNote(false);
        }
    };

    if (!repo) {
        return null;
    }

    const langColor = repo.language ? getLanguageColor(repo.language) : null;
    const hasNote = Boolean(currentNote?.content);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 顶栏 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                flexShrink: 0,
            }}>
                <BackHintChip label={t('back', lang)} onClick={handleBack} />

                {currentIndex >= 0 && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        marginLeft: 6,
                        padding: '2px 4px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-surface-secondary)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 4px' }}
                            disabled={!hasPrev}
                            onClick={handlePrevRepo}
                            title={t('prevRepo', lang)}
                            aria-label={t('prevRepo', lang)}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span style={{
                            fontSize: 12,
                            color: 'var(--color-text-secondary)',
                            fontVariantNumeric: 'tabular-nums',
                            padding: '0 4px',
                        }}>
                            {currentIndex + 1} / {filteredRepos.length}
                        </span>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 4px' }}
                            disabled={!hasNext}
                            onClick={handleNextRepo}
                            title={t('nextRepo', lang)}
                            aria-label={t('nextRepo', lang)}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}

                <div style={{ flex: 1 }} />

                <button
                    type="button"
                    className={`btn btn-sm ${isSubscribed ? 'btn-secondary' : 'btn-ghost'}`}
                    style={{ flexShrink: 0 }}
                    onClick={() => toggleSubscription(repo.id)}
                >
                    {isSubscribed ? <BellOff size={14} /> : <Bell size={14} />}
                    {isSubscribed ? t('unsubscribe', lang) : t('subscribe', lang)}
                </button>

                {isSubscribed && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ flexShrink: 0 }}
                        onClick={() => setCurrentPage('releases')}
                        title={t('viewReleases', lang)}
                    >
                        <FileText size={14} />
                        {t('viewReleases', lang)}
                    </button>
                )}

                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={handleCopyRepoUrl}
                    title={t('copyRepoUrl', lang)}
                    aria-label={t('copyRepoUrl', lang)}
                >
                    <Copy size={14} />
                </button>

                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={handleOpenGithub}
                >
                    <ExternalLink size={14} />
                    {t('openInGithub', lang)}
                </button>
            </div>

            {/* 内容滚动区 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {/* Hero 信息头 */}
                <div className="hero-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        {!avatarError && repo.owner.avatarUrl ? (
                            <img
                                src={repo.owner.avatarUrl}
                                alt={repo.owner.login}
                                width={48}
                                height={48}
                                decoding="async"
                                onError={() => setAvatarError(true)}
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 10,
                                    border: '1px solid var(--color-border)',
                                    flexShrink: 0,
                                }}
                            />
                        ) : (
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 10,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <Box size={22} style={{ color: 'var(--color-text-muted)' }} />
                            </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <h1 style={{ fontSize: 18, fontWeight: 700, wordBreak: 'break-word', margin: 0 }}>
                                    {repo.alias || repo.name}
                                </h1>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '2px 6px', color: 'var(--color-text-muted)' }}
                                    onClick={handleStartEditAlias}
                                    title={t('editAlias', lang)}
                                    aria-label={t('editAlias', lang)}
                                >
                                    <Edit2 size={13} />
                                </button>
                                <div style={{
                                    marginLeft: 'auto',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    fontSize: 13,
                                    color: 'var(--color-text-secondary)',
                                    flexShrink: 0,
                                }}>
                                    <span title={repo.stargazersCount.toLocaleString()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Star size={14} style={{ color: 'var(--color-accent)' }} />
                                        {formatCompactNumber(repo.stargazersCount)}
                                    </span>
                                    <span title={repo.forksCount.toLocaleString()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <GitFork size={14} />
                                        {formatCompactNumber(repo.forksCount)}
                                    </span>
                                    {repo.language && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            {langColor && <span className="lang-dot" style={{ width: 8, height: 8, backgroundColor: langColor }} />}
                                            {repo.language}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                flexWrap: 'wrap',
                                marginTop: 2,
                                fontSize: 12,
                                color: 'var(--color-text-muted)',
                            }}>
                                <span>{repo.fullName}</span>
                                {repo.homepage && (
                                    <button
                                        type="button"
                                        className="link"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 12,
                                            border: 'none',
                                            background: 'none',
                                            padding: 0,
                                        }}
                                        onClick={handleOpenHomepage}
                                    >
                                        <Globe size={12} />
                                        <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {repo.homepage}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 仓库原始描述 */}
                    <div style={{ marginTop: 14 }}>
                        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: 0 }}>
                            {repo.description || repo.aiSummary || t('noDescription', lang)}
                        </p>
                    </div>

                    {/* 行内标签编辑栏 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: '1px solid var(--color-border)',
                    }}>
                        <Tag size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                        {(repo.customTags || []).map((tagId) => {
                            const tag = tagById.get(tagId);
                            if (!tag) return null;
                            return (
                                <TagBadge
                                    key={tag.id}
                                    tag={tag}
                                    size="sm"
                                    showRemove
                                    onRemove={() => handleToggleTag(tag.id)}
                                />
                            );
                        })}

                        <button
                            type="button"
                            className={`btn btn-sm ${showTagSelector ? 'btn-secondary' : 'btn-ghost'}`}
                            style={{ padding: '2px 8px', fontSize: 12 }}
                            onClick={() => setShowTagSelector((v) => !v)}
                            aria-pressed={showTagSelector}
                        >
                            {showTagSelector ? t('tokenHelpCollapse', lang) : <><Plus size={12} /> {t('addTag', lang)}</>}
                        </button>
                    </div>

                    {showTagSelector && (
                        <div className="panel-enter" style={{
                            marginTop: 10,
                            padding: 10,
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--color-surface-secondary)',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}>
                            {tags.length > 0 ? (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {tags.map((tag) => (
                                        <TagChip
                                            key={tag.id}
                                            tag={tag}
                                            selected={(repo.customTags || []).includes(tag.id)}
                                            onClick={() => handleToggleTag(tag.id)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                    {t('noTags', lang)}
                                </span>
                            )}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                    type="text"
                                    className="input"
                                    style={{ padding: '4px 8px', fontSize: 12, flex: 1 }}
                                    value={quickTagName}
                                    onChange={(e) => setQuickTagName(e.target.value)}
                                    onKeyDown={handleQuickCreateTag}
                                    placeholder={t('quickCreateTagPlaceholder', lang)}
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setCurrentPage('tags')}
                                >
                                    {t('manageTags', lang)}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 分段 Tab 栏 */}
                <div className="detail-tabs">
                    <div className="segmented" style={{ width: 'fit-content' }} role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'overview'}
                            className={`segmented-item${activeTab === 'overview' ? ' active' : ''}`}
                            style={{ padding: '5px 16px' }}
                            onClick={() => setActiveTab('overview')}
                        >
                            {t('tabOverview', lang)}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'readme'}
                            className={`segmented-item${activeTab === 'readme' ? ' active' : ''}`}
                            style={{ padding: '5px 16px' }}
                            onClick={() => setActiveTab('readme')}
                        >
                            {t('tabReadme', lang)}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'notes'}
                            className={`segmented-item${activeTab === 'notes' ? ' active' : ''}`}
                            style={{ padding: '5px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => setActiveTab('notes')}
                        >
                            <span>{t('tabNotes', lang)}</span>
                            {hasNote && (
                                <span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: 'var(--color-primary)',
                                }} />
                            )}
                        </button>
                    </div>
                </div>

                {/* Tab 1: 概览 & AI */}
                {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* AI 分析面板 */}
                        <div className="card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <h3 style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: 'var(--color-text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}>
                                    <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
                                    AI {t('analysis', lang)}
                                </h3>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleAIAnalyze}
                                    disabled={analyzing}
                                >
                                    {analyzing ? (
                                        <>
                                            <Loader2 size={12} className="animate-spin" />
                                            {t('aiAnalyzing', lang)}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={12} />
                                            {t('aiAnalyze', lang)}
                                        </>
                                    )}
                                </button>
                            </div>

                            {repo.analyzedAt && !repo.analysisFailed ? (
                                <div>
                                    <p style={{
                                        fontSize: 14,
                                        lineHeight: 1.65,
                                        color: 'var(--color-text-primary)',
                                        margin: '0 0 12px',
                                        whiteSpace: 'pre-wrap',
                                    }}>
                                        {repo.aiSummary || repo.description || t('noDescription', lang)}
                                    </p>
                                    {repo.aiTags && repo.aiTags.length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                                            {repo.aiTags.map((tag, i) => (
                                                <span key={i} className="tag">{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                    {repo.aiPlatforms && repo.aiPlatforms.length > 0 && (
                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                                            {repo.aiPlatforms.map((p) => {
                                                const Icon = getPlatformIcon(p.toLowerCase());
                                                return (
                                                    <span key={p} style={{
                                                        fontSize: 13,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        color: 'var(--color-text-secondary)',
                                                    }}>
                                                        <Icon size={14} /> {getPlatformLabel(p)}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div style={{
                                        fontSize: 12,
                                        color: 'var(--color-text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}>
                                        <CheckCircle2 size={12} style={{ color: 'var(--color-success)' }} />
                                        {t('analyzedAt', lang)} {new Date(repo.analyzedAt).toLocaleDateString()}
                                    </div>
                                </div>
                            ) : repo.analyzedAt && repo.analysisFailed ? (
                                <div>
                                    {repo.aiSummary && (
                                        <p style={{
                                            fontSize: 14,
                                            lineHeight: 1.65,
                                            color: 'var(--color-text-primary)',
                                            margin: '0 0 10px',
                                            whiteSpace: 'pre-wrap',
                                        }}>
                                            {repo.aiSummary}
                                        </p>
                                    )}
                                    {repo.aiTags && repo.aiTags.length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                            {repo.aiTags.map((tag, i) => (
                                                <span key={i} className="tag">{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                    {repo.aiPlatforms && repo.aiPlatforms.length > 0 && (
                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                                            {repo.aiPlatforms.map((p) => {
                                                const Icon = getPlatformIcon(p.toLowerCase());
                                                return (
                                                    <span key={p} style={{
                                                        fontSize: 13,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        color: 'var(--color-text-secondary)',
                                                    }}>
                                                        <Icon size={14} /> {getPlatformLabel(p)}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div style={{
                                        fontSize: 12,
                                        color: 'var(--color-error)',
                                        marginTop: 6,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}>
                                        <XCircle size={12} style={{ color: 'var(--color-error)' }} />
                                        {failedCooldownMinutes > 0
                                            ? (lang === 'zh'
                                                ? `最近一次分析失败，${failedCooldownMinutes} 分钟后可重试`
                                                : `Last analysis failed. Retry in ${failedCooldownMinutes}min`)
                                            : (lang === 'zh' ? '最近一次分析失败，可重试' : 'Last analysis failed. You can retry now')}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 0' }}>
                                    {repo.analysisFailed ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-error)' }}>
                                            <XCircle size={14} />
                                            {t('analysisFailed', lang)}
                                        </span>
                                    ) : (
                                        <span>{t('clickToAnalyze', lang)}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Topics 与时间线 */}
                        <div className="card">
                            {repo.topics && repo.topics.length > 0 && (
                                <div style={{ marginBottom: 14 }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                                        Topics
                                    </h3>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {repo.topics.map((topic) => (
                                            <span key={topic} className="tag">{topic}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                gap: 10,
                                paddingTop: repo.topics?.length ? 12 : 0,
                                borderTop: repo.topics?.length ? '1px solid var(--color-border)' : 'none',
                            }}>
                                <TimelineItem
                                    label={t('repoCreatedAt', lang)}
                                    value={formatRelativeTime(repo.createdAt, lang)}
                                    title={new Date(repo.createdAt).toLocaleString()}
                                />
                                <TimelineItem
                                    label={t('lastUpdated', lang)}
                                    value={formatRelativeTime(repo.updatedAt, lang)}
                                    title={new Date(repo.updatedAt).toLocaleString()}
                                />
                                <TimelineItem
                                    label={t('repoPushedAt', lang)}
                                    value={formatRelativeTime(repo.pushedAt, lang)}
                                    title={new Date(repo.pushedAt).toLocaleString()}
                                />
                                {repo.starredAt && (
                                    <TimelineItem
                                        label={t('repoStarredAt', lang)}
                                        value={formatRelativeTime(repo.starredAt, lang)}
                                        title={new Date(repo.starredAt).toLocaleString()}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab 2: README 预览 */}
                {activeTab === 'readme' && (
                    <div className="card" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {readmeLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                    {t('readmeLoading', lang)}
                                </span>
                                <Skeleton width="45%" height={20} />
                                <Skeleton width="100%" height={14} />
                                <Skeleton width="92%" height={14} />
                                <Skeleton width="78%" height={14} />
                                <Skeleton width="88%" height={80} />
                            </div>
                        ) : readmeContent ? (
                            <MarkdownView content={readmeContent} repoFullName={repo.fullName} />
                        ) : (
                            <EmptyState
                                icon={<BookOpen size={40} strokeWidth={1.5} />}
                                title={t('readmeEmpty', lang)}
                            />
                        )}
                    </div>
                )}

                {/* Tab 3: Markdown 笔记 */}
                {activeTab === 'notes' && (
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <h3 style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}>
                                <FileText size={14} />
                                {t('notes', lang)}
                            </h3>
                            {!editingNote && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleStartEditNote}
                                >
                                    <Edit2 size={12} />
                                    {currentNote ? t('edit', lang) : t('addNote', lang)}
                                </button>
                            )}
                        </div>

                        {editingNote ? (
                            <div>
                                <textarea
                                    value={noteValue}
                                    onChange={(e) => setNoteValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSaveNote();
                                        }
                                    }}
                                    placeholder={t('notePlaceholder', lang)}
                                    className="input"
                                    style={{
                                        width: '100%',
                                        minHeight: 160,
                                        padding: 12,
                                        lineHeight: 1.6,
                                        resize: 'vertical',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, alignItems: 'center' }}>
                                    {currentNote && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            style={{ color: 'var(--color-error-text)' }}
                                            onClick={() => setShowDeleteConfirm(true)}
                                        >
                                            {t('delete', lang)}
                                        </button>
                                    )}
                                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                        {t('noteHint', lang)} · Ctrl+Enter
                                    </span>
                                    <div style={{ flex: 1 }} />
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => {
                                            setNoteValue('');
                                            setEditingNote(false);
                                        }}
                                    >
                                        <X size={12} />
                                        {t('cancel', lang)}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={handleSaveNote}
                                    >
                                        <Save size={12} />
                                        {t('save', lang)}
                                    </button>
                                </div>
                            </div>
                        ) : currentNote ? (
                            <div>
                                <div style={{ overflowWrap: 'anywhere', lineHeight: 1.6 }}>
                                    <MarkdownView content={currentNote.content} repoFullName={repo.fullName} />
                                </div>
                                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
                                    {t('noteUpdatedAt', lang, { date: new Date(currentNote.updatedAt).toLocaleString() })}
                                </p>
                            </div>
                        ) : (
                            <EmptyState
                                icon={<FileText size={36} strokeWidth={1.5} />}
                                title={t('noNotesYet', lang)}
                                description={t('noteHint', lang)}
                                action={
                                    <button type="button" className="btn btn-primary btn-sm" onClick={handleStartEditNote}>
                                        <Plus size={14} />
                                        {t('addFirstNote', lang)}
                                    </button>
                                }
                            />
                        )}
                    </div>
                )}
            </div>

            {/* 别名编辑弹窗 */}
            <Modal
                isOpen={editingAlias}
                onClose={handleCancelAlias}
                title={t('editAlias', lang)}
                footer={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={handleCancelAlias}>
                            {t('cancel', lang)}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveAlias}>
                            {t('save', lang)}
                        </button>
                    </>
                }
            >
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                    {t('aliasHint', lang)}
                </p>
                <input
                    ref={aliasInputRef}
                    type="text"
                    className="input"
                    value={aliasValue}
                    onChange={(e) => setAliasValue(e.target.value)}
                    placeholder={t('aliasPlaceholder', lang)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveAlias();
                    }}
                />
            </Modal>

            {/* 笔记删除确认弹窗 */}
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title={t('delete', lang)}
                message={t('deleteNoteConfirm', lang)}
                confirmText={t('delete', lang)}
                cancelText={t('cancel', lang)}
                variant="danger"
                onConfirm={confirmDeleteNote}
                onCancel={() => setShowDeleteConfirm(false)}
            />

            {/* 重新分析确认弹窗 */}
            <ConfirmDialog
                isOpen={showReanalyzeConfirm}
                title={lang === 'zh' ? '重新分析' : 'Re-analyze'}
                message={lang === 'zh'
                    ? `该仓库已于 ${new Date(repo.analyzedAt!).toLocaleDateString()} 完成分析。确定要重新分析吗？`
                    : `This repository was analyzed on ${new Date(repo.analyzedAt!).toLocaleDateString()}. Are you sure you want to re-analyze?`
                }
                confirmText={lang === 'zh' ? '重新分析' : 'Re-analyze'}
                cancelText={t('cancel', lang)}
                onConfirm={() => {
                    setShowReanalyzeConfirm(false);
                    executeAnalyze();
                }}
                onCancel={() => setShowReanalyzeConfirm(false)}
            />
        </div>
    );
};

const TimelineItem: React.FC<{ label: string; value: string; title: string }> = ({ label, value, title }) => (
    <div title={title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} />
            {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {value || '—'}
        </span>
    </div>
);
