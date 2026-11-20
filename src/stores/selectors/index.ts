/**
 * 筛选器组合入口
 * @module stores/selectors
 * @since v1.7.0
 *
 * 提供可组合的筛选管道，用于替代 useStore 中的 getFilteredRepos 函数
 *
 * @example
 * import { createFilteredReposPipeline } from '@/stores/selectors';
 *
 * const pipeline = createFilteredReposPipeline(searchFilter);
 * const filtered = pipeline(repos);
 */

import type { Repository, SearchFilter } from '@/types';
import type { FilterContext } from './filterSelectors';
import {
    createFilterBySmartView,
    createFilterByLanguages,
    createFilterByTags,
    createFilterByPlatforms,
    createFilterByNotes,
    createFilterByAlias,
    createFilterBySubscription,
    parseSearchKeyword,
    applyPrefixFilters,
    emptyFilterContext,
} from './filterSelectors';
import { createSorter } from './sortSelectors';
import { calculateRelevance } from './searchSelectors';

// 导出子模块
export * from './filterSelectors';
export * from './sortSelectors';
export * from './searchSelectors';

/**
 * 创建筛选管道（优化版）
 *
 * 优化点：
 * 1. 先执行基础筛选（减少计算量）
 * 2. 仅在关键词搜索时计算相关度
 * 3. 最后排序
 *
 * @param filter - 搜索筛选条件
 * @returns 筛选函数
 */
export const createFilteredReposPipeline = (
    filter: SearchFilter,
    context: FilterContext = emptyFilterContext
) => {
    return (repos: Repository[]): Repository[] => {
        // 1. 解析关键词
        const { prefixFilters, keywords } = parseSearchKeyword(filter.keyword);

        // 2. 基础筛选（减少计算量）
        let result = repos;

        // 应用前缀过滤
        if (prefixFilters.length > 0) {
            result = applyPrefixFilters(result, prefixFilters, context);
        }

        // 智能视图筛选
        const baseResult = createFilterBySmartView(filter.smartView, context)(result);

        const hasFacetFilter = Boolean(
            (filter.languages && filter.languages.length > 0)
            || (filter.customTags && filter.customTags.length > 0)
            || (filter.platforms && filter.platforms.length > 0)
            || filter.hasNotes !== null
            || filter.hasAlias !== null
            || filter.hasReleases !== null
        );

        let facetResult = baseResult;
        // 语言筛选
        facetResult = createFilterByLanguages(filter.languages)(facetResult);

        // 自定义标签筛选
        facetResult = createFilterByTags(filter.customTags)(facetResult);

        // 平台筛选
        facetResult = createFilterByPlatforms(filter.platforms)(facetResult);

        // 条件筛选
        facetResult = createFilterByNotes(filter.hasNotes, context)(facetResult);
        facetResult = createFilterByAlias(filter.hasAlias)(facetResult);
        facetResult = createFilterBySubscription(filter.hasReleases)(facetResult);

        if (filter.invertFilter && hasFacetFilter) {
            const matchedIds = new Set(facetResult.map((repo) => repo.id));
            result = baseResult.filter((repo) => !matchedIds.has(repo.id));
        } else {
            result = facetResult;
        }

        // 3. 关键词搜索 + 相关度计算（仅在有关键词时）
        if (keywords.length > 0) {
            result = calculateRelevance(keywords, context)(result);
            // 关键词搜索后直接返回（已按相关度排序）
            return result;
        }

        // 4. 排序（无关键词时使用用户排序设置）
        result = createSorter(filter.sortBy, filter.sortOrder)(result);

        return result;
    };
};

/**
 * 默认导出：管道创建函数
 */
export default createFilteredReposPipeline;
