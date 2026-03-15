import type { Repository } from '../types';

/**
 * 检查仓库是否需要 AI 分析
 * @param repo 仓库对象
 * @returns { needsAnalyze: boolean, reason: string }
 *
 * @example
 * const result = checkAnalysisNeeded(repo);
 * if (!result.needsAnalyze) {
 *   if (result.reason === 'analyzed') {
 *     // 显示确认弹窗
 *   } else if (result.reason === 'failed_cooldown') {
 *     // 显示冷却提示
 *   }
 * }
 */
export function checkAnalysisNeeded(repo: Repository): {
    needsAnalyze: boolean;
    reason: 'never' | 'cooldown' | 'analyzed' | 'failed_cooldown';
} {
    // 已成功分析
    if (repo.analyzedAt && !repo.analysisFailed) {
        return { needsAnalyze: false, reason: 'analyzed' };
    }

    // 分析失败，检查冷却时间（24小时）
    if (repo.analysisFailed) {
        const lastTry = repo.analyzedAt || repo.lastSyncedAt;
        if (lastTry) {
            const hoursSince = (Date.now() - new Date(lastTry).getTime()) / 3600000;
            if (hoursSince < 24) {
                return { needsAnalyze: false, reason: 'failed_cooldown' };
            }
        }
        // 超过冷却时间，可以重试
        return { needsAnalyze: true, reason: 'cooldown' };
    }

    // 从未分析
    return { needsAnalyze: true, reason: 'never' };
}

/**
 * 获取分析失败的剩余冷却时间（小时）
 * @param repo 仓库对象
 * @returns 剩余小时数，如果不在冷却期则返回 0
 */
export function getCooldownHours(repo: Repository): number {
    if (!repo.analysisFailed) return 0;

    const lastTry = repo.analyzedAt || repo.lastSyncedAt;
    if (!lastTry) return 0;

    const hoursSince = (Date.now() - new Date(lastTry).getTime()) / 3600000;
    if (hoursSince >= 24) return 0;

    return Math.ceil(24 - hoursSince);
}
