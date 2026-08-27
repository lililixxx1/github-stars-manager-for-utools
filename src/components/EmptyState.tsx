import React from 'react';

interface EmptyStateProps {
    /** 图标节点（建议 48px、strokeWidth 1.5 的 lucide 图标，参照 ReleasesPage 空状态质感） */
    icon?: React.ReactNode;
    /** 主标题 */
    title: string;
    /** 辅助描述 */
    description?: string;
    /** 操作区（如引导按钮） */
    action?: React.ReactNode;
}

/**
 * 通用空状态组件：48px 描边风格图标位 + 标题 + 描述 + 操作
 *
 * @example
 * <EmptyState
 *     icon={<SearchX size={48} strokeWidth={1.5} />}
 *     title={t('noResults', lang)}
 *     description={t('emptyNoSearchResult', lang)}
 * />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
    <div className="empty-state">
        {icon && <div className="empty-state-icon">{icon}</div>}
        <p className="empty-state-title">{title}</p>
        {description && <p className="empty-state-desc">{description}</p>}
        {action && <div className="empty-state-action">{action}</div>}
    </div>
);
