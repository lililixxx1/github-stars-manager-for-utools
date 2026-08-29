import { create } from 'zustand';
import type { AnalyzeProgress, AnalyzeStats, ReleaseCheckStatus } from '../types';

/**
 * 长任务进度专用 store（阶段2 状态与订阅性能重构）
 *
 * 收纳三类高频 set 的进度状态，避免进度写入触发 useStore 的全量订阅组件重渲染：
 * - 同步：syncStatus / syncProgress / syncError
 * - 批量 AI 分析：isAnalyzing / analyzeProgress / analyzeStats / analyzeAbortController
 * - 版本检查：releaseCheckStatus
 *
 * 依赖方向：useStore 单向依赖 useProgressStore（动作内通过 getState() 写入），
 * 本文件不得反向 import useStore，避免循环依赖。
 */

export type LongJobName = 'sync' | 'analyze' | 'releaseCheck';

export interface ProgressState {
    // ========== 同步进度 ==========
    syncStatus: 'idle' | 'syncing' | 'completed' | 'error';
    syncProgress: { current: number; total: number };
    syncError: string | null;
    setSyncStatus: (status: ProgressState['syncStatus']) => void;
    setSyncProgress: (progress: { current: number; total: number }) => void;
    setSyncError: (error: string | null) => void;

    // ========== 批量 AI 分析进度（含中断控制器） ==========
    isAnalyzing: boolean;
    analyzeProgress: AnalyzeProgress | null;
    analyzeStats: AnalyzeStats | null;
    analyzeAbortController: AbortController | null;
    setAnalyzing: (analyzing: boolean) => void;
    setAnalyzeProgress: (progress: AnalyzeProgress | null) => void;
    setAnalyzeStats: (stats: AnalyzeStats | null) => void;
    setAnalyzeAbortController: (controller: AbortController | null) => void;

    // ========== 版本检查状态 ==========
    releaseCheckStatus: ReleaseCheckStatus;
    setReleaseCheckStatus: (status: ReleaseCheckStatus) => void;
    patchReleaseCheckStatus: (partial: Partial<ReleaseCheckStatus>) => void;

    /**
     * 长任务互斥判定：sync / analyze / releaseCheck 是否有任务进行中
     * @param except 排除的任务（任务入口自查"其他任务"是否进行中时传入自身）
     */
    isJobBusy: (except?: LongJobName) => boolean;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
    syncStatus: 'idle',
    syncProgress: { current: 0, total: 0 },
    syncError: null,
    setSyncStatus: (status) => set({ syncStatus: status }),
    setSyncProgress: (progress) => set({ syncProgress: progress }),
    setSyncError: (error) => set({ syncError: error }),

    isAnalyzing: false,
    analyzeProgress: null,
    analyzeStats: null,
    analyzeAbortController: null,
    setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
    setAnalyzeProgress: (progress) => set({ analyzeProgress: progress }),
    setAnalyzeStats: (stats) => set({ analyzeStats: stats }),
    setAnalyzeAbortController: (controller) => set({ analyzeAbortController: controller }),

    releaseCheckStatus: {
        lastCheckedAt: null,
        checking: false,
        newCount: 0,
        error: null,
    },
    setReleaseCheckStatus: (status) => set({ releaseCheckStatus: status }),
    patchReleaseCheckStatus: (partial) =>
        set((state) => ({ releaseCheckStatus: { ...state.releaseCheckStatus, ...partial } })),

    isJobBusy: (except) => {
        const { syncStatus, isAnalyzing, analyzeAbortController, releaseCheckStatus } = get();
        if (except !== 'sync' && syncStatus === 'syncing') return true;
        if (except !== 'analyze' && (isAnalyzing || analyzeAbortController !== null)) return true;
        if (except !== 'releaseCheck' && releaseCheckStatus.checking) return true;
        return false;
    },
}));
