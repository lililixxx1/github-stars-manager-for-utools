/**
 * 排序器模块
 * @module stores/selectors/sortSelectors
 * @since v1.7.0
 *
 * 提供仓库排序功能
 */

import type { Repository, SortBy, SortOrder } from '@/types';

/** 排序函数类型 */
export type SortFn = (repos: Repository[]) => Repository[];

/**
 * 创建排序器
 * @param sortBy - 排序字段
 * @param sortOrder - 排序方向
 * @returns 排序函数
 *
 * @note v1.6.2 移除 created 和 alias 排序选项
 */
export const createSorter = (sortBy: SortBy, sortOrder: SortOrder): SortFn => {
    return (repos) => {
        const sorted = [...repos].sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'stars':
                    comparison = b.stargazersCount - a.stargazersCount;
                    break;

                case 'updated':
                    comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                    break;

                case 'starredAt':
                    // 收藏时间排序，没有 starredAt 的排到后面
                    const aStarred = a.starredAt ? new Date(a.starredAt).getTime() : 0;
                    const bStarred = b.starredAt ? new Date(b.starredAt).getTime() : 0;
                    comparison = bStarred - aStarred;
                    break;

                case 'name':
                    // 优先使用别名，没有别名则使用仓库名
                    comparison = (a.alias || a.name).localeCompare(b.alias || b.name);
                    break;

                default:
                    comparison = 0;
            }

            return sortOrder === 'desc' ? comparison : -comparison;
        });

        return sorted;
    };
};

/**
 * 获取排序字段的显示名称
 * @param sortBy - 排序字段
 * @param lang - 语言
 */
export const getSortByLabel = (sortBy: SortBy, lang: 'zh' | 'en'): string => {
    const labels: Record<SortBy, { zh: string; en: string }> = {
        stars: { zh: '按 Star 排序', en: 'Sort by Stars' },
        updated: { zh: '按更新时间排序', en: 'Sort by Updated' },
        starredAt: { zh: '按收藏时间排序', en: 'Sort by Starred Time' },
        name: { zh: '按名称排序', en: 'Sort by Name' },
    };
    return labels[sortBy]?.[lang] || sortBy;
};
