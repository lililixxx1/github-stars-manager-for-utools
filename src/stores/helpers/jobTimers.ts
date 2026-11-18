import type { Repository } from '../../types';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';

// ==================== 自动分析互斥重试 ====================
let autoAnalyzeRetryTimer: ReturnType<typeof setTimeout> | null = null;
let autoAnalyzeRetryCount = 0;
const AUTO_ANALYZE_RETRY_MS = 15_000;
const AUTO_ANALYZE_RETRY_MAX = 20;

export function clearAutoAnalyzeRetry(): void {
    if (autoAnalyzeRetryTimer !== null) {
        clearTimeout(autoAnalyzeRetryTimer);
        autoAnalyzeRetryTimer = null;
    }
    autoAnalyzeRetryCount = 0;
}

export function scheduleAutoAnalyzeRetry(options: {
    shouldContinue: () => boolean;
    run: () => Promise<'ok' | 'busy' | 'no-token'>;
}): void {
    if (autoAnalyzeRetryTimer !== null) return;
    if (autoAnalyzeRetryCount >= AUTO_ANALYZE_RETRY_MAX) {
        logger.log('[startAutoAnalyze] 互斥等待超时，放弃本次自动分析');
        return;
    }
    autoAnalyzeRetryCount++;
    autoAnalyzeRetryTimer = setTimeout(() => {
        autoAnalyzeRetryTimer = null;
        if (!options.shouldContinue()) {
            autoAnalyzeRetryCount = 0;
            return;
        }
        options.run().then((result) => {
            if (result === 'no-token') {
                autoAnalyzeRetryCount = 0;
            }
        });
    }, AUTO_ANALYZE_RETRY_MS);
}

// ==================== 同步状态回 idle 定时器 ====================
let syncResetTimer: number | null = null;

export function clearPendingSyncIdle(): void {
    if (syncResetTimer !== null) {
        window.clearTimeout(syncResetTimer);
        syncResetTimer = null;
    }
}

export function scheduleSyncIdle(delay: number, onIdle: () => void): void {
    clearPendingSyncIdle();
    syncResetTimer = window.setTimeout(() => {
        syncResetTimer = null;
        onIdle();
    }, delay);
}

// ==================== 批量分析增量落盘缓冲 ====================
const AI_PERSIST_INTERVAL_MS = 20_000;
const pendingAiPatches = new Map<number, Partial<Repository>>();
let lastAiPersistAt = 0;

export function markAiBatchStart(): void {
    lastAiPersistAt = Date.now();
}

export function flushAiPatches(): void {
    if (pendingAiPatches.size === 0) return;
    const updates = [...pendingAiPatches.entries()].map(([id, patch]) => ({ id, patch }));
    pendingAiPatches.clear();
    storageService.patchReposBatch(updates);
}

export function queueAiPatch(repoId: number, patch: Partial<Repository>): void {
    pendingAiPatches.set(repoId, patch);
    const now = Date.now();
    if (now - lastAiPersistAt > AI_PERSIST_INTERVAL_MS) {
        lastAiPersistAt = now;
        flushAiPatches();
    }
}
