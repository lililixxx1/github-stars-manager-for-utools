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

// ==================== 搜索索引缓存（阶段3 性能重构） ====================

/**
 * 仓库搜索索引：预计算的小写字段与数值时间戳
 *
 * 失效契约（本模块位于 filterSelectors 以保证 selectors 内依赖无环：
 * searchSelectors / sortSelectors 均单向依赖本文件）：
 * - 缓存以 Repository 对象引用为键（WeakMap）。store 层对仓库的任何更新
 *   （updateRepository / 批量 AI 分析合并 / 同步 merge）都必须是不可变更新
 *   （返回新对象），引用一换 WeakMap 自动失效——这正是选 WeakMap 的原因。
 * - AI 字段（aiTags/aiSummary/aiPlatforms）历史上被 batchAnalyze 原地突变过
 *   （阶段3 已修复为不可变，但保守起见），**不进缓存**，每轮搜索/筛选现算。
 */
export interface RepoSearchIndex {
    /** 小写的原始/用户字段 */
    name: string;
    fullName: string;
    alias: string;
    description: string;
    language: string;
    ownerLogin: string;
    topics: string[];        // 小写后的 topics
    customTags: string[];    // 小写后的自定义标签（存的是标签 ID）
    /** 排序用的数值时间戳（Date.parse 预计算；无 starredAt 为 0，非法为 NaN） */
    createdAt: number;
    updatedAt: number;
    pushedAt: number;
    starredAt: number;
}

const searchIndexCache = new WeakMap<Repository, RepoSearchIndex>();

/**
 * 获取（或懒构建）仓库的搜索索引
 * 同一仓库对象引用只在首次访问时计算一次小写/时间戳
 */
export function getSearchIndex(repo: Repository): RepoSearchIndex {
    let index = searchIndexCache.get(repo);
    if (!index) {
        index = {
            name: repo.name.toLowerCase(),
            fullName: repo.fullName.toLowerCase(),
            alias: (repo.alias || '').toLowerCase(),
            description: (repo.description || '').toLowerCase(),
            language: (repo.language || '').toLowerCase(),
            ownerLogin: repo.owner.login.toLowerCase(),
            topics: (repo.topics || []).map(t => t.toLowerCase()),
            customTags: (repo.customTags || []).map(t => t.toLowerCase()),
            createdAt: Date.parse(repo.createdAt),
            updatedAt: Date.parse(repo.updatedAt),
            pushedAt: Date.parse(repo.pushedAt),
            starredAt: repo.starredAt ? Date.parse(repo.starredAt) : 0,
        };
        searchIndexCache.set(repo, index);
    }
    return index;
}

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
            // 小写字段从 WeakMap 缓存索引取；AI 标签（aiTags）每轮现算不缓存
            const index = getSearchIndex(repo);
            switch (pf.type) {
                case 'owner':
                    return index.ownerLogin.includes(pf.value);
                case 'lang':
                case 'language':
                    return index.language.includes(pf.value);
                case 'topic':
                    return index.topics.some(t => t.includes(pf.value));
                case 'tag':
                    return (repo.aiTags || []).some(t => t.toLowerCase().includes(pf.value))
                        || index.customTags.some(t => t.includes(pf.value));
                case 'note':
                    return context.getNoteContent(repo.id).toLowerCase().includes(pf.value);
                case 'alias':
                    return index.alias.includes(pf.value);
                default:
                    return true;
            }
        });
    }, repos);
};
