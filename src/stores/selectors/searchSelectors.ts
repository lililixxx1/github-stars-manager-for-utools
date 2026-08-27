/**
 * 搜索相关度模块
 * @module stores/selectors/searchSelectors
 * @since v1.7.0
 *
 * 提供关键词搜索和相关度计算功能
 */

import type { Repository } from '@/types';
import type { FilterContext } from './filterSelectors';
import { emptyFilterContext, getSearchIndex } from './filterSelectors';

/** 相关度评分结果 */
interface RelevanceScore {
    repo: Repository;
    score: number;
    match: boolean;
}

/**
 * 计算相关度并筛选匹配的仓库
 * @param keywords - 关键词列表（AND 匹配）
 * @returns 筛选和排序后的仓库列表
 *
 * @example
 * const results = calculateRelevance(['react', 'hooks'])(repos);
 */
export const calculateRelevance = (keywords: string[], context: FilterContext = emptyFilterContext) => {
    return (repos: Repository[]): Repository[] => {
        if (!keywords?.length) return repos;

        const scored: RelevanceScore[] = repos.map(repo => {
            let score = 0;
            let allMatch = true;

            // 预计算搜索字段：原始/用户字段走 WeakMap 缓存索引；
            // AI 字段（aiSummary/aiTags）每轮现算，不缓存
            const index = getSearchIndex(repo);
            const fields = {
                name: index.name,
                fullName: index.fullName,
                alias: index.alias,
                description: index.description,
                aiSummary: (repo.aiSummary || '').toLowerCase(),
                topics: index.topics,
                aiTags: (repo.aiTags || []).map(t => t.toLowerCase()),
                customTags: index.customTags,
                owner: index.ownerLogin,
            };

            const noteContent = context.getNoteContent(repo.id).toLowerCase();

            for (const kw of keywords) {
                let kwMatch = false;

                // 别名匹配（高权重）
                if (fields.alias && fields.alias.includes(kw)) {
                    score += fields.alias === kw ? 15 : 10;
                    kwMatch = true;
                }

                // 名称匹配
                if (fields.name.includes(kw)) {
                    score += fields.name === kw ? 15 : 10;
                    kwMatch = true;
                }

                if (fields.fullName.includes(kw)) {
                    score += 8;
                    kwMatch = true;
                }

                // owner 匹配
                if (fields.owner.includes(kw)) {
                    score += 6;
                    kwMatch = true;
                }

                // 描述匹配
                if (fields.description.includes(kw)) {
                    score += 5;
                    kwMatch = true;
                }

                if (fields.aiSummary.includes(kw)) {
                    score += 5;
                    kwMatch = true;
                }

                // 笔记匹配
                if (noteContent && noteContent.includes(kw)) {
                    score += 4;
                    kwMatch = true;
                }

                // 标签匹配
                if (fields.aiTags.some(t => t.includes(kw))) {
                    score += 4;
                    kwMatch = true;
                }

                if (fields.customTags.some(t => t.includes(kw))) {
                    score += 4;
                    kwMatch = true;
                }

                // topics 匹配
                if (fields.topics.some(t => t.includes(kw))) {
                    score += 3;
                    kwMatch = true;
                }

                if (!kwMatch) {
                    allMatch = false;
                    break;
                }
            }

            return { repo, score, match: allMatch };
        });

        // 按匹配和相关度排序
        return scored
            .filter(s => s.match)
            .sort((a, b) => b.score - a.score)
            .map(s => s.repo);
    };
};
