import type { Repository, SortBy } from '../types';

/**
 * 统一紧凑数字格式化（如 1250 -> 1.3k，999 -> 999）
 */
export function formatCompactNumber(num: number): string {
    if (!Number.isFinite(num)) return '0';
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}k`;
    }
    return String(num);
}

/**
 * 统一相对时间格式化（支持 ISO 字符串与时间戳）
 */
export function formatRelativeTime(
    dateInput: string | number | undefined | null,
    lang: 'zh' | 'en' = 'zh'
): string {
    if (dateInput == null || dateInput === '') return '';
    const timestamp = typeof dateInput === 'number' ? dateInput : Date.parse(dateInput);
    if (!Number.isFinite(timestamp)) return '';

    const diffMs = Math.max(0, Date.now() - timestamp);
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
        return lang === 'zh' ? '刚刚' : 'just now';
    }
    if (diffHours < 24) {
        return lang === 'zh' ? `${diffHours} 小时前` : `${diffHours}h ago`;
    }
    if (diffDays === 1) {
        return lang === 'zh' ? '昨天' : 'yesterday';
    }
    if (diffDays < 30) {
        return lang === 'zh' ? `${diffDays} 天前` : `${diffDays}d ago`;
    }
    const months = Math.floor(diffDays / 30);
    if (months < 12) {
        return lang === 'zh' ? `${months} 个月前` : `${months}mo ago`;
    }
    const years = Math.floor(months / 12);
    return lang === 'zh' ? `${years} 年前` : `${years}y ago`;
}

/**
 * 根据当前排序字段返回最贴切的仓库时间展示标签
 */
export function getRepoSortTimeInfo(
    repo: Repository,
    sortBy: SortBy,
    lang: 'zh' | 'en' = 'zh'
): { prefix: string; timeText: string } {
    if (sortBy === 'starredAt' && repo.starredAt) {
        return {
            prefix: lang === 'zh' ? '收藏于' : 'Starred',
            timeText: formatRelativeTime(repo.starredAt, lang),
        };
    }
    if (sortBy === 'pushedAt' && repo.pushedAt) {
        return {
            prefix: lang === 'zh' ? '推送于' : 'Pushed',
            timeText: formatRelativeTime(repo.pushedAt, lang),
        };
    }
    return {
        prefix: lang === 'zh' ? '更新于' : 'Updated',
        timeText: formatRelativeTime(repo.updatedAt, lang),
    };
}
