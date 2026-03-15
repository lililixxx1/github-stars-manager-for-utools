import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../stores/useStore';
import { aiService } from '../services/aiService';
import { t } from '../locales';
import { TagBadge } from '../components/TagBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { checkAnalysisNeeded, getCooldownHours } from '../utils/analysis';
import {
    ArrowLeft, ExternalLink, Star, GitFork, Sparkles,
    Bell, BellOff, Loader2, CheckCircle2, XCircle,
    Edit2, Save, X, Plus, FileText, Tag
} from 'lucide-react';
import type { RepositoryNote } from '../types';

// XSS 防护：转义 HTML 特殊字符
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export const DetailPage: React.FC = () => {
    const {
        selectedRepo, setSelectedRepo, setCurrentPage,
        settings, token, repositories, setRepositories, saveRepositories,
        tags, loadTags, updateRepository, toggleSubscription,
        currentNote, loadNote, saveNote, deleteNote,
    } = useStore();

    const [analyzing, setAnalyzing] = useState(false);
    const [editingAlias, setEditingAlias] = useState(false);
    const [aliasValue, setAliasValue] = useState('');
    const [editingNote, setEditingNote] = useState(false);
    const [noteValue, setNoteValue] = useState('');
    const [showTagSelector, setShowTagSelector] = useState(false);

    // 🆕 v1.6.1 标签/笔记区块展开状态（智能初始化）
    const hasTags = selectedRepo && (selectedRepo.customTags?.length ?? 0) > 0;
    const hasNotes = !!currentNote?.content;
    const [showTagsSection, setShowTagsSection] = useState(hasTags);
    const [showNotesSection, setShowNotesSection] = useState(hasNotes);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // 🆕 v1.6.2 重新分析确认弹窗
    const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false);

    const lang = (settings.language || 'zh') as 'zh' | 'en';

    // 订阅状态从 dbStorage 派生（单一数据源）
    const subscriptionVersion = useStore(state => state.subscriptionVersion);

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

    if (!selectedRepo) {
        setCurrentPage('home');
        return null;
    }

    const repo = selectedRepo;

    const isSubscribed = useMemo(() => {
        const ids = window.githubStarsAPI.getReleaseSubscriptions();
        return ids.includes(repo.id);
    }, [repo.id, subscriptionVersion]);

    const handleBack = () => {
        setSelectedRepo(null);
        setCurrentPage('home');
    };

    const handleOpenGithub = () => {
        window.githubStarsAPI.openExternal(repo.htmlUrl);
    };

    const handleAIAnalyze = async () => {
        if (!token || analyzing) return;

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
        if (!token || analyzing) return;
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
        } finally {
            setAnalyzing(false);
        }
    };

    const handleToggleSubscribe = () => {
        toggleSubscription(repo.id);
    };

    // 别名操作
    const handleStartEditAlias = () => {
        setAliasValue(repo.alias || '');
        setEditingAlias(true);
    };

    const handleSaveAlias = () => {
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
        const currentTags = repo.customTags || [];
        const newTags = currentTags.includes(tagId)
            ? currentTags.filter(id => id !== tagId)
            : [...currentTags, tagId];
        setSelectedRepo({ ...repo, customTags: newTags });
        updateRepository(repo.id, { customTags: newTags });
    };

    const platformIcons: Record<string, string> = {
        mac: '🍎', windows: '🪟', linux: '🐧', ios: '📱',
        android: '🤖', docker: '🐳', web: '🌐', cli: '⌨️',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 顶部栏 */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
            }}>
                <button className="btn btn-ghost btn-sm" onClick={handleBack}>
                    <ArrowLeft size={16} />
                    {t('back', lang)}
                </button>
                <div style={{ flex: 1 }} />
                {/* 别名按钮 */}
                <button className="btn btn-ghost btn-sm" onClick={handleStartEditAlias} title={t('editAlias', lang)}>
                    <Edit2 size={14} />
                    {t('alias', lang)}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleToggleSubscribe}>
                    {isSubscribed ? <BellOff size={14} /> : <Bell size={14} />}
                    {isSubscribed ? t('unsubscribe', lang) : t('subscribe', lang)}
                </button>
                {/* 查看版本按钮 - 订阅后显示 🆕 v1.4.1 */}
                {isSubscribed && (
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCurrentPage('releases')}
                        title={t('viewReleases', lang)}
                        aria-label={t('viewReleases', lang)}
                    >
                        <FileText size={14} />
                        {t('viewReleases', lang)}
                    </button>
                )}
                <button className="btn btn-primary btn-sm" onClick={handleOpenGithub}>
                    <ExternalLink size={14} />
                    {t('openInGithub', lang)}
                </button>
            </div>

            {/* 内容 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="animate-slide-in">
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
                            className={`btn btn-sm ${showTagsSection ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setShowTagsSection(!showTagsSection)}
                            title={t('tags', lang)}
                        >
                            <Tag size={14} />
                            {t('tags', lang)}
                            {hasTags && (
                                <span style={{
                                    marginLeft: 4,
                                    padding: '0 6px',
                                    fontSize: 11,
                                    borderRadius: 10,
                                    background: showTagsSection ? 'rgba(255,255,255,0.3)' : 'var(--color-primary)',
                                    color: showTagsSection ? '#fff' : 'var(--color-primary)',
                                }}>
                                    {(repo.customTags?.length ?? 0)}
                                </span>
                            )}
                        </button>
                        <button
                            className={`btn btn-sm ${showNotesSection ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setShowNotesSection(!showNotesSection)}
                            title={t('notes', lang)}
                        >
                            <FileText size={14} />
                            {t('notes', lang)}
                            {hasNotes && (
                                <span style={{
                                    marginLeft: 4,
                                    padding: '0 6px',
                                    fontSize: 11,
                                    borderRadius: 10,
                                    background: showNotesSection ? 'rgba(255,255,255,0.3)' : 'var(--color-primary)',
                                    color: showNotesSection ? '#fff' : 'var(--color-primary)',
                                }}>
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

                {/* 🆕 v1.6.1 标签分组（展开/折叠动画） */}
                <div
                    style={{
                        maxHeight: showTagsSection ? '500px' : '0',
                        opacity: showTagsSection ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'all 0.3s ease',
                        marginBottom: showTagsSection ? 12 : 0,
                    }}
                >
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                🏷️ {t('tags', lang)}
                            </h3>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowTagSelector(!showTagSelector)}
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

                        {/* 标签选择器 */}
                        {showTagSelector && tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                                {tags.map((tag) => {
                                    const isSelected = (repo.customTags || []).includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: 999,
                                                border: `1px solid ${tag.color || 'var(--color-border)'}`,
                                                backgroundColor: isSelected ? (tag.color || 'var(--color-primary)') : 'transparent',
                                                color: isSelected ? '#fff' : (tag.color || 'var(--color-text-primary)'),
                                            }}
                                            onClick={() => handleToggleTag(tag.id)}
                                        >
                                            {tag.icon && <span>{tag.icon} </span>}
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {tags.length === 0 && showTagSelector && (
                            <div style={{ textAlign: 'center', padding: 16 }}>
                                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                                    {t('noTags', lang)}
                                </p>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setCurrentPage('tags')}
                                >
                                    {t('manageTags', lang)}
                                </button>
                            </div>
                        )}
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
                                            {platformIcons[p] || '📦'} {p}
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

                {/* 🆕 v1.6.1 笔记（展开/折叠动画） */}
                <div
                    style={{
                        maxHeight: showNotesSection ? '500px' : '0',
                        opacity: showNotesSection ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'all 0.3s ease',
                        marginBottom: showNotesSection ? 12 : 0,
                    }}
                >
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={14} />
                                {t('notes', lang)}
                            </h3>
                            {!editingNote && (
                                <button className="btn btn-ghost btn-sm" onClick={handleStartEditNote}>
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
                                    style={{
                                        width: '100%',
                                        minHeight: 120,
                                        padding: 12,
                                        borderRadius: 8,
                                        border: '1px solid var(--color-border)',
                                        background: 'var(--color-background)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: 14,
                                        lineHeight: 1.6,
                                        resize: 'vertical',
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                    {currentNote && (
                                        <button className="btn btn-ghost btn-sm" onClick={handleDeleteNote} style={{ color: 'var(--color-error)' }}>
                                            {t('delete', lang)}
                                        </button>
                                    )}
                                    <div style={{ flex: 1 }} />
                                    <button className="btn btn-ghost btn-sm" onClick={handleCancelNote}>
                                        <X size={12} />
                                        {t('cancel', lang)}
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={handleSaveNote}>
                                        <Save size={12} />
                                        {t('save', lang)}
                                    </button>
                                </div>
                            </div>
                        ) : currentNote ? (
                            <div>
                                <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {escapeHtml(currentNote.content)}
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
                        <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); window.githubStarsAPI.openExternal(repo.homepage); }}
                            style={{ fontSize: 14, color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                            {repo.homepage}
                        </a>
                    </div>
                )}
            </div>

            {/* 🆕 别名编辑弹窗 */}
            {editingAlias && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: 'var(--color-surface)',
                        borderRadius: 12,
                        padding: 20,
                        width: '90%',
                        maxWidth: 400,
                    }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                            {t('editAlias', lang)}
                        </h3>
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                            {t('aliasHint', lang)}
                        </p>
                        <input
                            type="text"
                            value={aliasValue}
                            onChange={(e) => setAliasValue(e.target.value)}
                            placeholder={t('aliasPlaceholder', lang)}
                            style={{
                                width: '100%', padding: 10, borderRadius: 8,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-background)',
                                color: 'var(--color-text-primary)',
                                fontSize: 14,
                            }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                            <button className="btn btn-ghost btn-sm" onClick={handleCancelAlias}>
                                {t('cancel', lang)}
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={handleSaveAlias}>
                                {t('save', lang)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🆕 笔记删除确认弹窗 */}
            {showDeleteConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: 'var(--color-surface)',
                        borderRadius: 12,
                        padding: 20,
                        width: '90%',
                        maxWidth: 320,
                    }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                            {t('delete', lang)}
                        </h3>
                        <p style={{ fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 20 }}>
                            {t('deleteNoteConfirm', lang)}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm(false)}>
                                {t('cancel', lang)}
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={confirmDeleteNote} style={{ background: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                                {t('delete', lang)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
