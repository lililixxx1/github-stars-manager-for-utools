import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../stores/useStore';
import { aiService } from '../services/aiService';
import { t } from '../locales';
import { TagBadge } from '../components/TagBadge';
import { TagChip } from '../components/TagChip';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toast';
import { checkAnalysisNeeded, getCooldownHours } from '../utils/analysis';
import { useBackShortcut } from '../hooks/useBackShortcut';
import { useRovingControls } from '../hooks/useRovingControls';
import type { RovingControl } from '../hooks/useRovingControls';
import {
    ArrowLeft, ExternalLink, Star, GitFork, Sparkles,
    Bell, BellOff, Loader2, CheckCircle2, XCircle,
    Edit2, Save, X, Plus, FileText, Tag, Copy
} from 'lucide-react';
import { getPlatformIcon } from '../constants/platformIcons';
import type { RepositoryNote } from '../types';

export const DetailPage: React.FC = () => {
    // 精确订阅（阶段2 性能重构）：顺带清理了未使用的 repositories/setRepositories/saveRepositories
    const selectedRepo = useStore((state) => state.selectedRepo);
    const setSelectedRepo = useStore((state) => state.setSelectedRepo);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const settings = useStore((state) => state.settings);
    const token = useStore((state) => state.token);
    const tags = useStore((state) => state.tags);
    const loadTags = useStore((state) => state.loadTags);
    const updateRepository = useStore((state) => state.updateRepository);
    const toggleSubscription = useStore((state) => state.toggleSubscription);
    const currentNote = useStore((state) => state.currentNote);
    const loadNote = useStore((state) => state.loadNote);
    const saveNote = useStore((state) => state.saveNote);
    const deleteNote = useStore((state) => state.deleteNote);

    const [analyzing, setAnalyzing] = useState(false);
    const [editingAlias, setEditingAlias] = useState(false);
    const [aliasValue, setAliasValue] = useState('');
    const [editingNote, setEditingNote] = useState(false);
    const [noteValue, setNoteValue] = useState('');
    const [showTagSelector, setShowTagSelector] = useState(false);

    // 🆕 v1.6.1 标签/笔记区块展开状态（智能初始化）
    const hasTags = Boolean(selectedRepo && (selectedRepo.customTags?.length ?? 0) > 0);
    const hasNotes = Boolean(currentNote?.content);
    const [showTagsSection, setShowTagsSection] = useState(hasTags);
    const [showNotesSection, setShowNotesSection] = useState(hasNotes);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // 🆕 v1.6.2 重新分析确认弹窗
    const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false);

    const lang = (settings.language || 'zh') as 'zh' | 'en';
    const repo = selectedRepo;
    const controlRefs = useRef<Record<string, HTMLElement | null>>({});

    const getControlRef = useCallback((id: string) => ({
        get current() {
            return controlRefs.current[id] ?? null;
        },
    }), []);

    const bindControlRef = useCallback((id: string) => (element: HTMLElement | null) => {
        controlRefs.current[id] = element;
    }, []);

    // 订阅状态从 store 内存单源派生（阶段3：不渲染期直读存储表）
    const subscribedRepoIds = useStore((state) => state.subscribedRepoIds);

    useEffect(() => {
        loadTags();
    }, []);

    useEffect(() => {
        if (selectedRepo) {
            loadNote(selectedRepo.id);
        }
    }, [selectedRepo?.id]);

    // 🆕 v1.6.1 仓库切换时重置标签展开状态
    useEffect(() => {
        if (selectedRepo) {
            const newHasTags = (selectedRepo.customTags?.length ?? 0) > 0;
            setShowTagsSection(newHasTags);
        }
    }, [selectedRepo?.id]);

    // 🆕 v1.6.1 仓库切换时重置笔记展开状态
    useEffect(() => {
        if (selectedRepo) {
            const newHasNotes = !!currentNote?.content;
            setShowNotesSection(newHasNotes);
        }
    }, [selectedRepo?.id, currentNote?.id]);

    const handleBack = useCallback(() => {
        setSelectedRepo(null);
        setCurrentPage('home');
    }, [setCurrentPage, setSelectedRepo]);

    const isSubscribed = useMemo(() => {
        if (!repo) return false;
        return subscribedRepoIds.has(repo.id);
    }, [repo?.id, subscribedRepoIds]);

    useEffect(() => {
        if (!selectedRepo) {
            setCurrentPage('home');
        }
    }, [selectedRepo, setCurrentPage]);

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

        return false;
    }, [editingAlias, showDeleteConfirm, showReanalyzeConfirm]);

    useBackShortcut({
        enabled: !!selectedRepo,
        capture: true,
        target: document,
        onBack: handleBack,
        beforeBack: consumeDetailBackState,
        deps: [consumeDetailBackState, handleBack, selectedRepo],
    });

    const handleOpenGithub = () => {
        if (!repo) return;
        window.githubStarsAPI.openExternal(repo.htmlUrl);
    };

    // 🆕 v1.6.4 复制仓库地址
    const handleCopyRepoUrl = useCallback(() => {
        if (!repo?.htmlUrl) return;
        if (typeof utools !== 'undefined' && utools.copyText) {
            utools.copyText(repo.htmlUrl);
            window.githubStarsAPI.showNotification?.(
                lang === 'zh' ? '已复制仓库地址' : 'Repository URL copied'
            );
        }
    }, [repo?.htmlUrl, lang]);

    const handleAIAnalyze = async () => {
        // 拆分守卫：无仓库/分析中静默返回；无 token 单独提示（避免分析中点击误弹 Token 提示）
        if (!repo) return;
        if (!token) {
            toast.show(t('tokenRequired', lang), { type: 'error' });
            return;
        }
        if (analyzing) return;

        // 🆕 v1.6.2 使用公共函数检查分析状态
        const { needsAnalyze, reason } = checkAnalysisNeeded(repo);

        if (!needsAnalyze) {
            if (reason === 'analyzed') {
                // 已分析：显示确认弹窗
                setShowReanalyzeConfirm(true);
                return;
            } else if (reason === 'failed_cooldown') {
                // 冷却中：显示提示
                const cooldownHours = getCooldownHours(repo);
                window.githubStarsAPI.showNotification(
                    lang === 'zh'
                        ? `请等待 ${cooldownHours} 小时后重试`
                        : `Please retry after ${cooldownHours} hours`
                );
                return;
            }
        }

        await executeAnalyze();
    };

    // 🆕 v1.6.2 执行 AI 分析
    const executeAnalyze = async () => {
        if (!repo || !token || analyzing) return;
        setAnalyzing(true);

        try {
            const result = await aiService.analyzeRepository(repo, token, lang, settings.aiModel || undefined);
            if (result) {
                const updatedRepo = {
                    ...repo,
                    aiSummary: result.summary,
                    aiTags: result.tags,
                    aiPlatforms: result.platforms,
                    analyzedAt: new Date().toISOString(),
                    analysisFailed: false,
                };
                setSelectedRepo(updatedRepo);
                updateRepository(repo.id, {
                    aiSummary: result.summary,
                    aiTags: result.tags,
                    aiPlatforms: result.platforms,
                    analyzedAt: new Date().toISOString(),
                    analysisFailed: false,
                });
            }
        } catch (error) {
            console.error('AI analyze failed:', error);
            // 失败反馈：toast 报错 + analysisFailed 回写（与 aiService 24h 冷却策略一致）
            toast.show(
                error instanceof Error ? error.message : t('analysisFailed', lang),
                { type: 'error', duration: 5000 }
            );
            // 仅当用户仍停留在该仓库详情时才替换选中引用（异步失败期间可能已切换到其他仓库）
            if (useStore.getState().selectedRepo?.id === repo.id) {
                setSelectedRepo({ ...repo, analysisFailed: true });
            }
            updateRepository(repo.id, { analysisFailed: true });
        } finally {
            setAnalyzing(false);
        }
    };

    const handleToggleSubscribe = () => {
        if (!repo) return;
        toggleSubscription(repo.id);
    };

    // 别名操作
    const handleStartEditAlias = () => {
        if (!repo) return;
        setAliasValue(repo.alias || '');
        setEditingAlias(true);
    };

    const handleSaveAlias = () => {
        if (!repo) return;
        const trimmed = aliasValue.trim();
        setSelectedRepo({ ...repo, alias: trimmed || undefined });
        updateRepository(repo.id, { alias: trimmed || undefined });
        setEditingAlias(false);
    };

    const handleCancelAlias = () => {
        setAliasValue('');
        setEditingAlias(false);
    };

    // 笔记操作
    const handleStartEditNote = () => {
        setNoteValue(currentNote?.content || '');
        setEditingNote(true);
    };

    const handleSaveNote = () => {
        if (selectedRepo) {
            saveNote(selectedRepo.id, noteValue);
        }
        setEditingNote(false);
    };

    const handleCancelNote = () => {
        setNoteValue('');
        setEditingNote(false);
    };

    const handleDeleteNote = () => {
        if (selectedRepo) {
            setShowDeleteConfirm(true);
        }
    };

    const confirmDeleteNote = () => {
        if (selectedRepo) {
            deleteNote(selectedRepo.id);
            setShowDeleteConfirm(false);
            setEditingNote(false);
        }
    };

    // 标签操作
    const handleToggleTag = (tagId: string) => {
        if (!repo) return;
        const currentTags = repo.customTags || [];
        const newTags = currentTags.includes(tagId)
            ? currentTags.filter(id => id !== tagId)
            : [...currentTags, tagId];
        setSelectedRepo({ ...repo, customTags: newTags });
        updateRepository(repo.id, { customTags: newTags });
    };

    const handleOpenHomepage = useCallback(() => {
        if (!repo?.homepage) return;
        window.githubStarsAPI.openExternal(repo.homepage);
    }, [repo?.homepage]);

    const handleViewReleases = useCallback(() => {
        setCurrentPage('releases');
    }, [setCurrentPage]);

    const rovingControls = useMemo<RovingControl[]>(() => {
        if (!repo) return [];

        const controls: RovingControl[] = [
            { id: 'back', group: 'topbar', ref: getControlRef('back'), action: handleBack },
            { id: 'alias', group: 'topbar', ref: getControlRef('alias'), action: handleStartEditAlias },
            { id: 'subscribe', group: 'topbar', ref: getControlRef('subscribe'), action: handleToggleSubscribe },
            { id: 'releases', group: 'topbar', ref: getControlRef('releases'), action: handleViewReleases, visible: isSubscribed },
            { id: 'copy-url', group: 'topbar', ref: getControlRef('copy-url'), action: handleCopyRepoUrl },
            { id: 'open-github', group: 'topbar', ref: getControlRef('open-github'), action: handleOpenGithub },
            {
                id: 'tags-toggle',
                group: 'quick',
                ref: getControlRef('tags-toggle'),
                action: () => setShowTagsSection(value => !value),
            },
            {
                id: 'notes-toggle',
                group: 'quick',
                ref: getControlRef('notes-toggle'),
                action: () => setShowNotesSection(value => !value),
            },
            {
                id: 'tag-add',
                group: 'tags',
                ref: getControlRef('tag-add'),
                action: () => setShowTagSelector(value => !value),
                visible: showTagsSection,
            },
            ...((repo.customTags || []).map((tagId) => ({
                id: `tag-remove:${tagId}`,
                group: 'tags' as const,
                ref: getControlRef(`tag-remove:${tagId}`),
                action: () => handleToggleTag(tagId),
                visible: showTagsSection,
            }))),
            ...(tags.map((tagItem) => ({
                id: `tag-option:${tagItem.id}`,
                group: 'tags' as const,
                ref: getControlRef(`tag-option:${tagItem.id}`),
                action: () => handleToggleTag(tagItem.id),
                visible: showTagsSection && showTagSelector,
            }))),
            {
                id: 'tag-manage',
                group: 'tags',
                ref: getControlRef('tag-manage'),
                action: () => setCurrentPage('tags'),
                visible: showTagsSection && showTagSelector && tags.length === 0,
            },
            {
                id: 'analysis-run',
                group: 'analysis',
                ref: getControlRef('analysis-run'),
                action: handleAIAnalyze,
                disabled: analyzing,
            },
            {
                id: 'note-edit',
                group: 'notes',
                ref: getControlRef('note-edit'),
                action: handleStartEditNote,
                visible: showNotesSection && !editingNote,
            },
            {
                id: 'note-delete',
                group: 'notes',
                ref: getControlRef('note-delete'),
                action: handleDeleteNote,
                visible: showNotesSection && Boolean(currentNote) && editingNote,
            },
            {
                id: 'note-cancel',
                group: 'notes',
                ref: getControlRef('note-cancel'),
                action: handleCancelNote,
                visible: showNotesSection && editingNote,
            },
            {
                id: 'note-save',
                group: 'notes',
                ref: getControlRef('note-save'),
                action: handleSaveNote,
                visible: showNotesSection && editingNote,
            },
            {
                id: 'homepage',
                group: 'links',
                ref: getControlRef('homepage'),
                action: handleOpenHomepage,
                visible: Boolean(repo.homepage),
            },
        ];

        return controls;
    }, [
        analyzing,
        currentNote,
        editingNote,
        getControlRef,
        handleAIAnalyze,
        handleBack,
        handleCancelNote,
        handleCopyRepoUrl,
        handleDeleteNote,
        handleOpenGithub,
        handleOpenHomepage,
        handleSaveNote,
        handleStartEditAlias,
        handleStartEditNote,
        handleToggleSubscribe,
        handleToggleTag,
        handleViewReleases,
        isSubscribed,
        repo,
        setCurrentPage,
        showNotesSection,
        showTagSelector,
        showTagsSection,
        tags,
    ]);

    const roving = useRovingControls({
        enabled: Boolean(repo) && !editingAlias && !showDeleteConfirm && !showReanalyzeConfirm,
        controls: rovingControls,
        initialId: 'back',
        deps: [
            editingAlias,
            showDeleteConfirm,
            showReanalyzeConfirm,
            showTagsSection,
            showNotesSection,
            showTagSelector,
            editingNote,
            repo?.id,
        ],
    });

    const getControlStyle = useCallback((id: string, style: React.CSSProperties = {}): React.CSSProperties => (
        roving.isActive(id)
            ? {
                ...style,
                outline: 'none',
                // roving 激活焦点环：primary token 调出的软环 + 阴影标度
                boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-primary) 45%, transparent), var(--shadow-md)',
            }
            : style
    ), [roving]);

    // 别名弹窗：覆盖 Modal 默认初始焦点（关闭按钮），聚焦输入框
    const aliasInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (editingAlias) {
            window.requestAnimationFrame(() => aliasInputRef.current?.focus());
        }
    }, [editingAlias]);

    if (!repo) {
        return null;
    }

    // 平台图标走 constants/platformIcons.ts 全站统一映射
    const renderPlatformIcon = (platformId: string): React.ReactNode => {
        const Icon = getPlatformIcon(platformId);
        return <Icon size={14} />;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 顶部栏 */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
            }}>
                <button
                    ref={bindControlRef('back')}
                    className="btn btn-ghost btn-sm"
                    style={getControlStyle('back')}
                    tabIndex={roving.getTabIndex('back')}
                    onFocus={() => roving.setActiveId('back')}
                    onClick={handleBack}
                >
                    <ArrowLeft size={16} />
                    {t('back', lang)}
                </button>
                <div style={{ flex: 1 }} />
                {/* 别名按钮 */}
                <button
                    ref={bindControlRef('alias')}
                    className="btn btn-ghost btn-sm"
                    style={getControlStyle('alias')}
                    tabIndex={roving.getTabIndex('alias')}
                    onFocus={() => roving.setActiveId('alias')}
                    onClick={handleStartEditAlias}
                    title={t('editAlias', lang)}
                >
                    <Edit2 size={14} />
                    {t('alias', lang)}
                </button>
                <button
                    ref={bindControlRef('subscribe')}
                    className="btn btn-ghost btn-sm"
                    style={getControlStyle('subscribe')}
                    tabIndex={roving.getTabIndex('subscribe')}
                    onFocus={() => roving.setActiveId('subscribe')}
                    onClick={handleToggleSubscribe}
                >
                    {isSubscribed ? <BellOff size={14} /> : <Bell size={14} />}
                    {isSubscribed ? t('unsubscribe', lang) : t('subscribe', lang)}
                </button>
                {/* 查看版本按钮 - 订阅后显示 🆕 v1.4.1 */}
                {isSubscribed && (
                    <button
                        ref={bindControlRef('releases')}
                        className="btn btn-ghost btn-sm"
                        style={getControlStyle('releases')}
                        tabIndex={roving.getTabIndex('releases')}
                        onFocus={() => roving.setActiveId('releases')}
                        onClick={handleViewReleases}
                        title={t('viewReleases', lang)}
                        aria-label={t('viewReleases', lang)}
                    >
                        <FileText size={14} />
                        {t('viewReleases', lang)}
                    </button>
                )}
                <button
                    ref={bindControlRef('copy-url')}
                    className="btn btn-ghost btn-sm"
                    style={getControlStyle('copy-url')}
                    tabIndex={roving.getTabIndex('copy-url')}
                    onFocus={() => roving.setActiveId('copy-url')}
                    onClick={handleCopyRepoUrl}
                    title={t('copyRepoUrl', lang)}
                >
                    <Copy size={14} />
                    {t('copyRepoUrl', lang)}
                </button>
                <button
                    ref={bindControlRef('open-github')}
                    className="btn btn-primary btn-sm"
                    style={getControlStyle('open-github')}
                    tabIndex={roving.getTabIndex('open-github')}
                    onFocus={() => roving.setActiveId('open-github')}
                    onClick={handleOpenGithub}
                >
                    <ExternalLink size={14} />
                    {t('openInGithub', lang)}
                </button>
            </div>

            {/* 内容（进入动画由 App.tsx 页面容器统一提供） */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {/* 仓库信息头 */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                    <img
                        src={repo.owner.avatarUrl}
                        alt={repo.owner.login}
                        style={{ width: 56, height: 56, borderRadius: 12, border: '1px solid var(--color-border)' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                            {repo.alias || repo.name}
                        </h1>
                        {repo.alias && (
                            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                                {repo.fullName}
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: 16, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Star size={15} style={{ color: 'var(--color-accent)' }} />
                                {repo.stargazersCount.toLocaleString()}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <GitFork size={15} />
                                {repo.forksCount.toLocaleString()}
                            </span>
                            {repo.language && (
                                <span>{repo.language}</span>
                            )}
                        </div>
                    </div>
                    {/* 🆕 v1.6.1 标签/笔记快捷按钮 - 移至仓库头部右侧 */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <button
                            ref={bindControlRef('tags-toggle')}
                            className={`btn btn-sm ${showTagsSection ? 'btn-primary' : 'btn-ghost'}`}
                            style={getControlStyle('tags-toggle')}
                            tabIndex={roving.getTabIndex('tags-toggle')}
                            onFocus={() => roving.setActiveId('tags-toggle')}
                            onClick={() => setShowTagsSection(!showTagsSection)}
                            title={t('tags', lang)}
                            aria-pressed={showTagsSection}
                        >
                            <Tag size={14} />
                            {t('tags', lang)}
                            {hasTags && (
                                <span className={`count-pill ${showTagsSection ? 'count-pill-on-solid' : 'count-pill-soft'}`}>
                                    {(repo.customTags?.length ?? 0)}
                                </span>
                            )}
                        </button>
                        <button
                            ref={bindControlRef('notes-toggle')}
                            className={`btn btn-sm ${showNotesSection ? 'btn-primary' : 'btn-ghost'}`}
                            style={getControlStyle('notes-toggle')}
                            tabIndex={roving.getTabIndex('notes-toggle')}
                            onFocus={() => roving.setActiveId('notes-toggle')}
                            onClick={() => setShowNotesSection(!showNotesSection)}
                            title={t('notes', lang)}
                            aria-pressed={showNotesSection}
                        >
                            <FileText size={14} />
                            {t('notes', lang)}
                            {hasNotes && (
                                <span className={`count-pill ${showNotesSection ? 'count-pill-on-solid' : 'count-pill-soft'}`}>
                                    {currentNote ? 1 : 0}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* 描述 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                        {t('description', lang)}
                    </h3>
                    <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                        {repo.description || t('noDescription', lang)}
                    </p>
                </div>

                {/* 🆕 v1.6.1 标签分组（展开/折叠动画：grid 行高过渡，无高度硬截断） */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: showTagsSection ? '1fr' : '0fr',
                        opacity: showTagsSection ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'grid-template-rows 0.3s ease, opacity 0.3s ease, margin-bottom 0.3s ease',
                        marginBottom: showTagsSection ? 12 : 0,
                    }}
                >
                    <div style={{ minHeight: 0, overflow: 'hidden' }}>
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Tag size={14} />
                                {t('tags', lang)}
                            </h3>
                            <button
                                ref={bindControlRef('tag-add')}
                                className="btn btn-ghost btn-sm"
                                style={getControlStyle('tag-add')}
                                tabIndex={roving.getTabIndex('tag-add')}
                                onFocus={() => roving.setActiveId('tag-add')}
                                onClick={() => setShowTagSelector(!showTagSelector)}
                                aria-pressed={showTagSelector}
                            >
                                {showTagSelector ? t('confirm', lang) : <><Plus size={12} /> {t('addTag', lang)}</>}
                            </button>
                        </div>

                        {/* 已选标签 */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: showTagSelector ? 12 : 0 }}>
                            {(repo.customTags || []).map((tagId) => {
                                const tag = tags.find(t => t.id === tagId);
                                if (!tag) return null;
                                return (
                                    <TagBadge
                                        key={tag.id}
                                        tag={tag}
                                        size="md"
                                        showRemove
                                        removeButtonRef={bindControlRef(`tag-remove:${tag.id}`)}
                                        removeButtonStyle={getControlStyle(`tag-remove:${tag.id}`)}
                                        removeButtonTabIndex={roving.getTabIndex(`tag-remove:${tag.id}`)}
                                        onRemoveFocus={() => roving.setActiveId(`tag-remove:${tag.id}`)}
                                        onRemove={() => handleToggleTag(tag.id)}
                                    />
                                );
                            })}
                            {/* 🆕 v1.6.1 空状态 */}
                            {(repo.customTags || []).length === 0 && !showTagSelector && (
                                <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                                    {t('noTagsYet', lang)}
                                </span>
                            )}
                        </div>

                        {/* 标签选择器（TagChip 共享组件，roving props 透传） */}
                        {showTagSelector && tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                                {tags.map((tag) => (
                                    <TagChip
                                        key={tag.id}
                                        ref={bindControlRef(`tag-option:${tag.id}`)}
                                        tag={tag}
                                        selected={(repo.customTags || []).includes(tag.id)}
                                        onClick={() => handleToggleTag(tag.id)}
                                        tabIndex={roving.getTabIndex(`tag-option:${tag.id}`)}
                                        onFocus={() => roving.setActiveId(`tag-option:${tag.id}`)}
                                        style={getControlStyle(`tag-option:${tag.id}`)}
                                    />
                                ))}
                            </div>
                        )}

                        {tags.length === 0 && showTagSelector && (
                            <div style={{ textAlign: 'center', padding: 16 }}>
                                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                                    {t('noTags', lang)}
                                </p>
                                <button
                                    ref={bindControlRef('tag-manage')}
                                    className="btn btn-secondary btn-sm"
                                    style={getControlStyle('tag-manage')}
                                    tabIndex={roving.getTabIndex('tag-manage')}
                                    onFocus={() => roving.setActiveId('tag-manage')}
                                    onClick={() => setCurrentPage('tags')}
                                >
                                    {t('manageTags', lang)}
                                </button>
                            </div>
                        )}
                    </div>
                    </div>
                </div>

                {/* AI 分析 */}
                <div className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
                            AI {t('analysis', lang)}
                        </h3>
                        <button
                            ref={bindControlRef('analysis-run')}
                            className="btn btn-secondary btn-sm"
                            style={getControlStyle('analysis-run')}
                            tabIndex={roving.getTabIndex('analysis-run')}
                            onFocus={() => roving.setActiveId('analysis-run')}
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

                    {repo.analyzedAt ? (
                        <div>
                            <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                                {repo.aiSummary}
                            </p>

                            {repo.aiTags && repo.aiTags.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                    {repo.aiTags.map((tag, i) => (
                                        <span key={i} className="tag">{tag}</span>
                                    ))}
                                </div>
                            )}

                            {repo.aiPlatforms && repo.aiPlatforms.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {repo.aiPlatforms.map((p) => (
                                        <span key={p} style={{
                                            fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                                            color: 'var(--color-text-secondary)',
                                        }}>
                                            {renderPlatformIcon(p)} {p}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={12} style={{ color: 'var(--color-success)' }} />
                                {t('analyzedAt', lang)} {new Date(repo.analyzedAt).toLocaleDateString()}
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', padding: 16 }}>
                            {repo.analysisFailed ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                    <XCircle size={14} style={{ color: 'var(--color-error)' }} />
                                    {t('analysisFailed', lang)}
                                </span>
                            ) : (
                                <span>{t('clickToAnalyze', lang)}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* 🆕 v1.6.1 笔记（展开/折叠动画：grid 行高过渡，无高度硬截断） */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: showNotesSection ? '1fr' : '0fr',
                        opacity: showNotesSection ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'grid-template-rows 0.3s ease, opacity 0.3s ease, margin-bottom 0.3s ease',
                        marginBottom: showNotesSection ? 12 : 0,
                    }}
                >
                    <div style={{ minHeight: 0, overflow: 'hidden' }}>
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={14} />
                                {t('notes', lang)}
                            </h3>
                            {!editingNote && (
                                <button
                                    ref={bindControlRef('note-edit')}
                                    className="btn btn-ghost btn-sm"
                                    style={getControlStyle('note-edit')}
                                    tabIndex={roving.getTabIndex('note-edit')}
                                    onFocus={() => roving.setActiveId('note-edit')}
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
                                    placeholder={t('notePlaceholder', lang)}
                                    className="input"
                                    style={{
                                        width: '100%',
                                        minHeight: 120,
                                        padding: 12,
                                        lineHeight: 1.6,
                                        resize: 'vertical',
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                    {currentNote && (
                                        <button
                                            ref={bindControlRef('note-delete')}
                                            className="btn btn-ghost btn-sm"
                                            style={getControlStyle('note-delete', { color: 'var(--color-error-text)' })}
                                            tabIndex={roving.getTabIndex('note-delete')}
                                            onFocus={() => roving.setActiveId('note-delete')}
                                            onClick={handleDeleteNote}
                                        >
                                            {t('delete', lang)}
                                        </button>
                                    )}
                                    <div style={{ flex: 1 }} />
                                    <button
                                        ref={bindControlRef('note-cancel')}
                                        className="btn btn-ghost btn-sm"
                                        style={getControlStyle('note-cancel')}
                                        tabIndex={roving.getTabIndex('note-cancel')}
                                        onFocus={() => roving.setActiveId('note-cancel')}
                                        onClick={handleCancelNote}
                                    >
                                        <X size={12} />
                                        {t('cancel', lang)}
                                    </button>
                                    <button
                                        ref={bindControlRef('note-save')}
                                        className="btn btn-primary btn-sm"
                                        style={getControlStyle('note-save')}
                                        tabIndex={roving.getTabIndex('note-save')}
                                        onFocus={() => roving.setActiveId('note-save')}
                                        onClick={handleSaveNote}
                                    >
                                        <Save size={12} />
                                        {t('save', lang)}
                                    </button>
                                </div>
                            </div>
                        ) : currentNote ? (
                            <div>
                                <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {currentNote.content}
                                </p>
                                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                                    {t('noteUpdatedAt', lang, { date: new Date(currentNote.updatedAt).toLocaleString() })}
                                </p>
                            </div>
                        ) : (
                            /* 🆕 v1.6.1 空状态 */
                            <div style={{ padding: '8px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
                                {t('noNotesYet', lang)}
                            </div>
                        )}
                    </div>
                    </div>
                </div>

                {/* Topics */}
                {repo.topics && repo.topics.length > 0 && (
                    <div className="card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                            Topics
                        </h3>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {repo.topics.map((topic) => (
                                <span key={topic} className="tag">{topic}</span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 链接 */}
                {repo.homepage && (
                    <div className="card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                            {t('homepage', lang)}
                        </h3>
                        <button
                            ref={bindControlRef('homepage')}
                            className="link"
                            style={getControlStyle('homepage', {
                                fontSize: 14,
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                height: 'auto',
                                textAlign: 'left',
                            })}
                            tabIndex={roving.getTabIndex('homepage')}
                            onFocus={() => roving.setActiveId('homepage')}
                            onClick={handleOpenHomepage}
                        >
                            {repo.homepage}
                        </button>
                    </div>
                )}
            </div>

            {/* 🆕 别名编辑弹窗（统一收编 Modal：遮罩淡入/焦点圈定/Escape） */}
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

            {/* 🆕 笔记删除确认弹窗 */}
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

            {/* 🆕 v1.6.2 重新分析确认弹窗 */}
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
