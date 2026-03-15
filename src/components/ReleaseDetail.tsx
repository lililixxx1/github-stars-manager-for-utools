import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Release } from '../types';
import { releaseService } from '../services/releaseService';
import { aiService } from '../services/aiService';
import { t } from '../locales';
import type { Language } from '../locales';
import { X, Languages, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { renderMarkdown } from '../utils/markdown.tsx';

interface ReleaseDetailProps {
    release: Release;
    lang: Language;
    onClose: () => void;
    token?: string;      // 🆕 v1.6.0 用于翻译
    aiModel?: string;    // 🆕 v1.6.0 AI 模型
}

type TranslationState = 'idle' | 'translating' | 'success' | 'error';

export function ReleaseDetail({ release, lang, onClose, token, aiModel }: ReleaseDetailProps) {
    // 支持标准化字段名和 GitHub API 原始字段名
    const htmlUrl = release.htmlUrl || release.html_url;
    const tagName = release.tagName || release.tag_name;
    const publishedAt = release.publishedAt || release.published_at;

    // 🆕 v1.6.0 翻译状态
    const [translationState, setTranslationState] = useState<TranslationState>('idle');
    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [showTranslated, setShowTranslated] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [fromCache, setFromCache] = useState(false);

    // 🆕 v1.6.0 组件卸载标记（防止内存泄漏）
    const mountedRef = useRef(true);
    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    // 🆕 v1.6.0 重置翻译状态（release 变化时）
    useEffect(() => {
        setTranslationState('idle');
        setTranslatedContent(null);
        setErrorMessage(null);
        setFromCache(false);
        setShowTranslated(true);
    }, [release.id]);

    const handleViewOnGithub = () => {
        const url = htmlUrl || `https://github.com/${release.repository.fullName}/releases/tag/${tagName}`;
        window.githubStarsAPI.openExternal(url);
    };

    // 🆕 v1.6.0 翻译处理
    const handleTranslate = async () => {
        if (!release.body || translationState === 'translating') return;

        // 如果已翻译，切换显示
        if (translatedContent) {
            setShowTranslated(!showTranslated);
            return;
        }

        setTranslationState('translating');
        setErrorMessage(null);

        try {
            const result = await aiService.translateRelease(
                release.id,
                release.body,
                lang,
                aiModel
            );

            // 检查组件是否已卸载
            if (!mountedRef.current) return;

            if (result) {
                setTranslatedContent(result.translatedContent);
                setFromCache(result.fromCache);
                setShowTranslated(true);
                setTranslationState('success');
            } else {
                setErrorMessage(lang === 'zh' ? '翻译结果为空' : 'Translation result is empty');
                setTranslationState('error');
            }
        } catch (error: any) {
            if (!mountedRef.current) return;

            console.error('[ReleaseDetail] Translation failed:', error);
            setErrorMessage(error?.message || (lang === 'zh' ? '翻译失败，请重试' : 'Translation failed, please retry'));
            setTranslationState('error');
        }
    };

    // 🆕 v1.6.0 重试翻译
    const handleRetry = () => {
        setTranslationState('idle');
        setErrorMessage(null);
        handleTranslate();
    };

    // 显示的内容
    const displayContent = (showTranslated && translatedContent) ? translatedContent : release.body;

    // 判断内容是否已是目标语言
    // 🆕 v1.6.0 使用 useMemo 优化中文检测
    const isChineseContent = useMemo(() => {
        return release.body && /[\u4e00-\u9fa5]/.test(release.body);
    }, [release.body]);

    const showTranslateButton = release.body && token && !(lang === 'zh' && isChineseContent);

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(2px)'
            }}
            onClick={onClose}
        >
            <div
                className="card animate-fade-in"
                style={{
                    width: '90%', maxWidth: '720px', maxHeight: '85vh',
                    display: 'flex', flexDirection: 'column',
                    padding: 0, overflow: 'hidden',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '24px', borderBottom: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    borderTopLeftRadius: '12px', borderTopRightRadius: '12px'
                }}>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {tagName}
                            {/* 🆕 v1.6.0 翻译状态指示器 (Badge) */}
                            {translatedContent && (
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: fromCache ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-surface-hover)',
                                    color: fromCache ? 'var(--color-success)' : 'var(--color-text-secondary)',
                                    border: `1px solid ${fromCache ? 'rgba(16, 185, 129, 0.2)' : 'var(--color-border)'}`
                                }}>
                                    {showTranslated ? t('translated', lang) : t('original', lang)}
                                    {fromCache && ' ✓'}
                                </span>
                            )}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                                {release.repository.fullName}
                            </p>
                            <span style={{ fontSize: '12px', color: 'var(--color-border)' }}>|</span>
                            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                {t('publishedAt', lang)}: {releaseService.formatDate(publishedAt || '', lang)}
                            </span>
                        </div>
                    </div>
                    <button className="btn btn-ghost" style={{ padding: '8px', borderRadius: '50%' }} onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                {/* 内容区域 */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '24px',
                    backgroundColor: 'var(--color-surface)',
                    wordWrap: 'break-word', overflowWrap: 'anywhere'
                }}>

                    {/* 更新内容 Markdown 渲染 */}
                    {displayContent && (
                        <div style={{ paddingBottom: '16px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '16px', letterSpacing: '0.5px' }}>
                                {t('releaseNotes', lang)}
                            </h3>
                            <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: '8px', lineHeight: 1.6 }}>
                                {renderMarkdown(displayContent)}
                            </div>
                        </div>
                    )}

                    {/* 🆕 v1.6.0 翻译错误提示 */}
                    {translationState === 'error' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '12px 16px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: 8,
                            marginBottom: 16,
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                        }}>
                            <AlertCircle size={16} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 14, color: 'var(--color-error)' }}>
                                {errorMessage}
                            </span>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={handleRetry}
                                style={{ color: 'var(--color-error)', flexShrink: 0 }}
                            >
                                <RefreshCw size={14} />
                                {t('retry', lang)}
                            </button>
                        </div>
                    )}
                </div>

                {/* 底部操作区 */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderTop: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface-secondary)'
                }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {/* 🆕 v1.6.0 翻译按钮 */}
                        {showTranslateButton && (
                            <button
                                className="btn btn-secondary"
                                onClick={handleTranslate}
                                disabled={translationState === 'translating'}
                            >
                                {translationState === 'translating' ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        {t('translating', lang)}
                                    </>
                                ) : translatedContent ? (
                                    <>
                                        <Languages size={14} />
                                        {showTranslated ? t('viewOriginal', lang) : t('viewTranslation', lang)}
                                    </>
                                ) : (
                                    <>
                                        <Languages size={14} />
                                        {t('translate', lang)}
                                    </>
                                )}
                            </button>
                        )}
                        {/* 🆕 v1.6.0 翻译消耗提示 */}
                        {showTranslateButton && translationState !== 'translating' && (
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                ({lang === 'zh' ? '消耗 AI 能量' : 'Uses AI credits'})
                            </span>
                        )}
                    </div>
                    <button className="btn btn-primary" onClick={handleViewOnGithub}>
                        {t('viewOnGithub', lang)}
                    </button>
                </div>
            </div>
        </div>
    );
}