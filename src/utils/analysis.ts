import type { Repository } from '../types';

// 失败冷却窗口（P-15）：失败后短时间内禁止重试，避免反复重试消耗 AI 额度；
// 批量侧另有"连续失败 5 次熔断"（R-熔断）兜底
const FAILED_COOLDOWN_MS = 5 * 60 * 1000;

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

    // 分析失败，检查冷却时间
    if (repo.analysisFailed) {
        const lastTry = repo.analyzedAt || repo.lastSyncedAt;
        if (lastTry && Date.now() - new Date(lastTry).getTime() < FAILED_COOLDOWN_MS) {
            return { needsAnalyze: false, reason: 'failed_cooldown' };
        }
        // 超过冷却时间，可以重试
        return { needsAnalyze: true, reason: 'cooldown' };
    }

    // 从未分析
    return { needsAnalyze: true, reason: 'never' };
}

/**
 * 获取分析失败的剩余冷却时间（分钟）
 * @param repo 仓库对象
 * @returns 剩余分钟数，如果不在冷却期则返回 0
 */
export function getCooldownMinutes(repo: Repository): number {
    if (!repo.analysisFailed) return 0;

    const lastTry = repo.analyzedAt || repo.lastSyncedAt;
    if (!lastTry) return 0;

    const remainingMs = FAILED_COOLDOWN_MS - (Date.now() - new Date(lastTry).getTime());
    return remainingMs > 0 ? Math.ceil(remainingMs / 60000) : 0;
}
