/**
 * 排序器模块
 * @module stores/selectors/sortSelectors
 * @since v1.7.0
 *
 * 提供仓库排序功能
 */

import type { Repository, SortBy, SortOrder } from '@/types';
import { getSearchIndex } from './filterSelectors';

/** 排序函数类型 */
export type SortFn = (repos: Repository[]) => Repository[];

/**
 * 计算单个仓库的排序 key（decorate 阶段调用一次）
 * - 数值型：stars / 日期时间戳（时间戳来自搜索索引 WeakMap 缓存，Date.parse 预计算）
 * - 字符串型：name 排序用（别名优先）
 */
function getSortKey(repo: Repository, sortBy: SortBy): number | string {
    switch (sortBy) {
        case 'stars':
            return repo.stargazersCount;

        case 'updated':
            return getSearchIndex(repo).updatedAt;

        case 'starredAt':
            // 收藏时间排序，没有 starredAt 的（索引中为 0）排到 desc 末尾
            return getSearchIndex(repo).starredAt;

        case 'pushedAt':
            // 最近推送时间排序（仓库活跃度），索引预计算缺失时为 NaN（sort 当 0 处理，同 updated 非法值路径）
            return getSearchIndex(repo).pushedAt;

        case 'name':
            // 优先使用别名，没有别名则使用仓库名
            return repo.alias || repo.name;

        default:
            return 0;
    }
}

/**
 * 创建排序器（decorate-sort-undecorate 版）
 *
 * 先一次性为每个仓库计算排序 key（数值/字符串），比较器只做 key 间的
 * 数值相减或 localeCompare，禁止在比较器内 new Date/Date.parse——
 * 原实现 O(n log n) 次日期字符串解析在万级仓库下是排序的主要开销。
 *
 * @param sortBy - 排序字段
 * @param sortOrder - 排序方向
 * @returns 排序函数
 *
 * @note v1.6.2 移除 created 和 alias 排序选项
 */
export const createSorter = (sortBy: SortBy, sortOrder: SortOrder): SortFn => {
    return (repos) => {
        const decorated = repos.map(repo => ({ repo, key: getSortKey(repo, sortBy) }));

        decorated.sort((a, b) => {
            // 比较结果统一按升序语义产出（数值 a-b、字符串 localeCompare），
            // 方向只在最后一行翻转——两分支方向必须一致，否则字符串/数值
            // 的 asc/desc 会各自反转（v1.8.0 的 name 排序反向即此因）
            const comparison = typeof a.key === 'string' || typeof b.key === 'string'
                ? String(a.key).localeCompare(String(b.key))
                : (a.key as number) - (b.key as number);

            return sortOrder === 'desc' ? -comparison : comparison;
        });

        return decorated.map(item => item.repo);
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
        pushedAt: { zh: '按推送时间排序', en: 'Sort by Pushed Time' },
    };
    return labels[sortBy]?.[lang] || sortBy;
};
