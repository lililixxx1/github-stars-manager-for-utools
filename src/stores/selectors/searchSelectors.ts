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
interface ScoredRepo {
    repo: Repository;
    score: number;
}

interface AiSearchEntry {
    rawSummary: string | undefined;
    summaryLower: string;
    rawTags: string[] | undefined;
    tagsLower: string[];
}

const aiSearchCache = new WeakMap<Repository, AiSearchEntry>();

function getAiSearchFields(repo: Repository): AiSearchEntry {
    const cached = aiSearchCache.get(repo);
    if (cached && cached.rawSummary === repo.aiSummary && cached.rawTags === repo.aiTags) {
        return cached;
    }
    const entry: AiSearchEntry = {
        rawSummary: repo.aiSummary,
        summaryLower: (repo.aiSummary || '').toLowerCase(),
        rawTags: repo.aiTags,
        tagsLower: (repo.aiTags || []).map((t) => t.toLowerCase()),
    };
    aiSearchCache.set(repo, entry);
    return entry;
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

        const scored: ScoredRepo[] = [];

        for (const repo of repos) {
            let score = 0;
            let allMatch = true;

            const index = getSearchIndex(repo);
            const aiFields = getAiSearchFields(repo);
            const noteContent = context.hasNote(repo.id)
                ? context.getNoteContent(repo.id).toLowerCase()
                : '';

            for (const kw of keywords) {
                let kwMatch = false;

                if (index.alias && index.alias.includes(kw)) {
                    score += index.alias === kw ? 30 : 20;
                    kwMatch = true;
                }

                if (index.name.includes(kw)) {
                    score += index.name === kw ? 15 : 10;
                    kwMatch = true;
                }

                if (index.fullName.includes(kw)) {
                    score += 8;
                    kwMatch = true;
                }

                if (index.ownerLogin.includes(kw)) {
                    score += 6;
                    kwMatch = true;
                }

                if (index.description.includes(kw)) {
                    score += 5;
                    kwMatch = true;
                }

                if (aiFields.summaryLower.includes(kw)) {
                    score += 5;
                    kwMatch = true;
                }

                if (noteContent && noteContent.includes(kw)) {
                    score += 4;
                    kwMatch = true;
                }

                if (aiFields.tagsLower.some((t) => t.includes(kw))) {
                    score += 4;
                    kwMatch = true;
                }

                if (index.customTags.some((t) => t.includes(kw))) {
                    score += 4;
                    kwMatch = true;
                }

                if (index.topics.some((t) => t.includes(kw))) {
                    score += 3;
                    kwMatch = true;
                }

                if (!kwMatch) {
                    allMatch = false;
                    break;
                }
            }

            if (allMatch) {
                scored.push({ repo, score });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.map((s) => s.repo);
    };
};
