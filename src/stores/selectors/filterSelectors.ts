/**
 * 筛选器模块
 * @module stores/selectors/filterSelectors
 * @since v1.7.0
 *
 * 提供可组合的筛选函数，每个筛选器独立可测试
 */

import type { Repository } from '@/types';

/** 筛选函数类型 */
export type FilterFn = (repos: Repository[]) => Repository[];

export interface FilterContext {
    hasNote: (repoId: number) => boolean;
    getNoteContent: (repoId: number) => string;
}

export const emptyFilterContext: FilterContext = {
    hasNote: () => false,
    getNoteContent: () => '',
};

// ==================== 常量 ====================

/** 未分析/无平台标识 */
const PLATFORM_NONE = 'none';

// ==================== 基础筛选器 ====================

/**
 * 创建语言筛选器
 * @param languages - 要筛选的语言列表
 */
export const createFilterByLanguages = (languages: string[]): FilterFn => {
    if (!languages?.length) return (repos) => repos;

    return (repos) => repos.filter(repo =>
        repo.language && languages.includes(repo.language)
    );
};

/**
 * 创建自定义标签筛选器
 * @param tags - 要筛选的标签ID列表
 */
export const createFilterByTags = (tags: string[]): FilterFn => {
    if (!tags?.length) return (repos) => repos;

    return (repos) => repos.filter(repo =>
        (repo.customTags || []).some(t => tags.includes(t))
    );
};

/**
 * 创建平台筛选器
 * @param platforms - 要筛选的平台列表
 *
 * @note 🔧 v1.6.2 使用 analyzedAt 判断"未分析"，aiPlatforms 判断"无平台"
 */
export const createFilterByPlatforms = (platforms: string[]): FilterFn => {
    if (!platforms?.length) return (repos) => repos;

    const hasNone = platforms.includes(PLATFORM_NONE);
    const realPlatforms = platforms.filter(p => p !== PLATFORM_NONE);

    return (repos) => repos.filter(repo => {
        const hasPlatforms = repo.aiPlatforms && repo.aiPlatforms.length > 0;
        const isAnalyzed = !!repo.analyzedAt && !repo.analysisFailed;

        // 只选择 'none'（未分析 OR 已分析但无平台）
        if (hasNone && realPlatforms.length === 0) {
            return !isAnalyzed || !hasPlatforms;
        }

        // 选择 'none' + 其他平台
        if (hasNone) {
            return !isAnalyzed || !hasPlatforms || realPlatforms.some(p =>
                repo.aiPlatforms?.includes(p)
            );
        }

        // 只选择具体平台
        return hasPlatforms && realPlatforms.some(p => repo.aiPlatforms?.includes(p));
    });
};

/**
 * 创建笔记筛选器
 * @param hasNotes - 是否有笔记
 *
 * 依赖 store 中的运行时笔记索引，避免在筛选热路径逐个读取持久化存储。
 */
export const createFilterByNotes = (hasNotes: boolean | null, context: FilterContext = emptyFilterContext): FilterFn => {
    if (hasNotes === null) return (repos) => repos;

    return (repos) => repos.filter(repo => {
        const hasRepoNote = context.hasNote(repo.id);
        return hasNotes ? hasRepoNote : !hasRepoNote;
    });
};

/**
 * 创建别名筛选器
 * @param hasAlias - 是否有别名
 */
export const createFilterByAlias = (hasAlias: boolean | null): FilterFn => {
    if (hasAlias === null) return (repos) => repos;

    return (repos) => repos.filter(repo =>
        hasAlias ? !!repo.alias : !repo.alias
    );
};

/**
 * 创建订阅筛选器
 * @param hasReleases - 是否有订阅
 */
export const createFilterBySubscription = (hasReleases: boolean | null): FilterFn => {
    if (hasReleases === null) return (repos) => repos;

    return (repos) => repos.filter(repo =>
        hasReleases ? repo.isSubscribed === true : repo.isSubscribed !== true
    );
};

// ==================== 关键词筛选（高级） ====================

/** 前缀过滤类型 */
type PrefixType = 'owner' | 'lang' | 'language' | 'topic' | 'tag' | 'note' | 'alias';

/** 前缀过滤配置 */
interface PrefixFilter {
    type: PrefixType;
    value: string;
}

/**
 * 解析搜索关键词
 * @param keyword - 原始搜索关键词
 * @returns 前缀过滤和普通关键词
 */
export const parseSearchKeyword = (keyword: string): {
    prefixFilters: PrefixFilter[];
    keywords: string[];
} => {
    if (!keyword?.trim()) {
        return { prefixFilters: [], keywords: [] };
    }

    const tokens = keyword.trim().split(/\s+/).filter(Boolean);
    const prefixFilters: PrefixFilter[] = [];
    const keywords: string[] = [];

    const validPrefixes: PrefixType[] = ['owner', 'lang', 'language', 'topic', 'tag', 'note', 'alias'];

    for (const token of tokens) {
        const colonIdx = token.indexOf(':');
        if (colonIdx > 0 && colonIdx < token.length - 1) {
            const prefix = token.slice(0, colonIdx).toLowerCase() as PrefixType;
            const value = token.slice(colonIdx + 1).toLowerCase();
            if (validPrefixes.includes(prefix)) {
                prefixFilters.push({ type: prefix, value });
                continue;
            }
        }
        keywords.push(token.toLowerCase());
    }

    return { prefixFilters, keywords };
};

/**
 * 应用前缀过滤
 * @param repos - 仓库列表
 * @param prefixFilters - 前缀过滤配置
 */
export const applyPrefixFilters = (
    repos: Repository[],
    prefixFilters: PrefixFilter[],
    context: FilterContext = emptyFilterContext
): Repository[] => {
    if (!prefixFilters.length) return repos;

    return prefixFilters.reduce((filtered, pf) => {
        return filtered.filter(repo => {
            switch (pf.type) {
                case 'owner':
                    return repo.owner.login.toLowerCase().includes(pf.value);
                case 'lang':
                case 'language':
                    return (repo.language || '').toLowerCase().includes(pf.value);
                case 'topic':
                    return (repo.topics || []).some(t => t.toLowerCase().includes(pf.value));
                case 'tag':
                    return (repo.aiTags || []).concat(repo.customTags || [])
                        .some(t => t.toLowerCase().includes(pf.value));
                case 'note':
                    return context.getNoteContent(repo.id).toLowerCase().includes(pf.value);
                case 'alias':
                    return (repo.alias || '').toLowerCase().includes(pf.value);
                default:
                    return true;
            }
        });
    }, repos);
};
