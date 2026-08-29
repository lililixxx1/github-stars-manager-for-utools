import React from 'react';
import { Check } from 'lucide-react';
import { t } from '../locales';

interface SyncProgressProps {
    current: number;
    total: number;
    status: 'idle' | 'syncing' | 'completed' | 'error';
    language: 'zh' | 'en';
}

export const SyncProgress: React.FC<SyncProgressProps> = ({ current, total, status, language }) => {
    // 过程进度条只管 syncing/completed；error 由 HomePage 可关闭横幅单源展示（B4）
    if (status === 'idle' || status === 'error') return null;

    const hasKnownTotal = total > 0;
    const pct = hasKnownTotal ? Math.round((current / total) * 100) : 0;
    const syncingText = hasKnownTotal
        ? `${current} / ${total}`
        : current > 0
            ? (language === 'zh' ? `已扫描 ${current} 个` : `Scanned ${current}`)
            : '...';

    return (
        <div style={{
            padding: '8px 16px',
            background: 'var(--color-surface-secondary)',
            borderBottom: '1px solid var(--color-border)',
            animation: 'fadeIn 0.3s ease-out',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {status === 'syncing' && t('syncing', language)}
                    {status === 'completed' && t('syncComplete', language)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {status === 'syncing' && syncingText}
                    {status === 'completed' && (
                        <>
                            {current}
                            <Check size={12} style={{ color: 'var(--color-success-strong)' }} />
                        </>
                    )}
                </span>
            </div>
            {status === 'syncing' && (
                <div className="progress-bar">
                    <div
                        className={`progress-bar-fill ${hasKnownTotal ? '' : 'progress-bar-fill-indeterminate'}`}
                        style={{ width: hasKnownTotal ? `${Math.min(pct, 95)}%` : '35%' }}
                    />
                </div>
            )}
        </div>
    );
};
