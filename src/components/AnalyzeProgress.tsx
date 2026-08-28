import React from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { t } from '../locales';

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
            borderRadius: 'var(--radius-lg)',
            padding: 16,
            width: 300,
            boxShadow: 'var(--shadow-md)',
            zIndex: 1000,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Sparkles size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {t('aiAnalyzing', lang)}
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
                {t('analyzeCurrent', lang, { repo: currentRepo })}
            </div>

            <div className="progress-bar" style={{ marginBottom: 8 }}>
                <div
                    className="progress-bar-fill"
                    style={{ width: `${percent}%` }}
                />
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
                    {t('stopAnalysis', lang)}
                </button>
            </div>
        </div>
    );
};
