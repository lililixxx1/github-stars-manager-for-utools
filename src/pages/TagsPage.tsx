import React, { useEffect, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { TagManager } from '../components/TagManager';
import { t } from '../locales';
import { useBackShortcut } from '../hooks/useBackShortcut';
import { ArrowLeft } from 'lucide-react';

export const TagsPage: React.FC = () => {
    // 精确订阅（阶段2 性能重构）
    const settings = useStore((state) => state.settings);
    const loadTags = useStore((state) => state.loadTags);
    const loadRepositories = useStore((state) => state.loadRepositories);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const lang = (settings.language || 'zh') as 'zh' | 'en';
    const handleBack = useCallback(() => {
        setCurrentPage('home');
    }, [setCurrentPage]);

    useEffect(() => {
        loadTags();
        loadRepositories();  // TagManager 需要统计标签关联的仓库数量
    }, [loadRepositories, loadTags]);

    useBackShortcut({
        onBack: handleBack,
        deps: [handleBack],
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 顶部导航栏：与 Settings/Releases 页统一（返回 + 标题左对齐） */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
            }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleBack}
                >
                    <ArrowLeft size={16} />
                    {t('back', lang)}
                </button>
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>{t('manageTags', lang)}</h2>
            </div>

            {/* 内容区 - 遵循 §4.3 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <TagManager mode="manage" />
            </div>
        </div>
    );
};
