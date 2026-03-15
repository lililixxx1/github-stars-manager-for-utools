import React, { useEffect } from 'react';
import { useStore } from '../stores/useStore';
import { TagManager } from '../components/TagManager';
import { t } from '../locales';
import { ArrowLeft } from 'lucide-react';

export const TagsPage: React.FC = () => {
    const { settings, loadTags, loadRepositories, setCurrentPage } = useStore();
    const lang = (settings.language || 'zh') as 'zh' | 'en';

    useEffect(() => {
        loadTags();
        loadRepositories();  // TagManager 需要统计标签关联的仓库数量
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 顶部导航栏 - 遵循 §4.2 */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
            }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCurrentPage('home')}
                >
                    <ArrowLeft size={16} />
                    {t('back', lang)}
                </button>
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>{t('manageTags', lang)}</h2>
                <div style={{ width: 64 }} /> {/* 占位，与返回按钮对齐 */}
            </div>

            {/* 内容区 - 遵循 §4.3 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <TagManager mode="manage" />
            </div>
        </div>
    );
};
