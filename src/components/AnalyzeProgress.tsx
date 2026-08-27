import React from 'react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';

export const AnalyzeProgress: React.FC = () => {
    // 进度状态从 useProgressStore 精确订阅（高频 set 只重渲染本组件）；动作从 useStore 取
    const isAnalyzing = useProgressStore((state) => state.isAnalyzing);
    const analyzeProgress = useProgressStore((state) => state.analyzeProgress);
    const stopAnalyze = useStore((state) => state.stopAnalyze);
    const settings = useStore((state) => state.settings);
    const lang = (settings.language || 'zh') as 'zh' | 'en';

    if (!isAnalyzing || !analyzeProgress) return null;

    const { current, total, currentRepo } = analyzeProgress;
    const percent = Math.round((current / total) * 100);

    return (
        <div style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 16,
            width: 300,
            boxShadow: 'var(--shadow-md)',
            zIndex: 1000,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span>🤖</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {lang === 'zh' ? 'AI 分析中...' : 'Analyzing...'}
                </span>
            </div>

            <div style={{
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                marginBottom: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {lang === 'zh' ? '正在分析: ' : 'Analyzing: '}{currentRepo}
            </div>

            <div style={{
                height: 4,
                background: 'var(--color-surface-secondary)',
                borderRadius: 2,
                marginBottom: 8,
            }}>
                <div style={{
                    height: '100%',
                    width: `${percent}%`,
                    background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                }} />
            </div>

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {current}/{total} ({percent}%)
                </span>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={stopAnalyze}
                >
                    {lang === 'zh' ? '中止' : 'Stop'}
                </button>
            </div>
        </div>
    );
};