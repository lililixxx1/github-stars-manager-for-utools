/**
 * 统一日志工具
 * @module utils/logger
 * @since v1.7.0
 *
 * 开发环境输出详细日志，生产环境仅输出错误日志
 */

const isDev = import.meta.env.DEV;

/**
 * 日志工具对象
 */
export const logger = {
    /**
     * 调试日志（仅开发环境）
     */
    log: (...args: unknown[]) => {
        if (isDev) {
            console.log('[DEBUG]', new Date().toISOString(), ...args);
        }
    },

    /**
     * 警告日志（仅开发环境）
     */
    warn: (...args: unknown[]) => {
        if (isDev) {
            console.warn('[WARN]', new Date().toISOString(), ...args);
        }
    },

    /**
     * 错误日志（始终输出）
     */
    error: (...args: unknown[]) => {
        console.error('[ERROR]', new Date().toISOString(), ...args);
    },

    /**
     * 分组日志开始（仅开发环境）
     */
    group: (label: string) => {
        if (isDev) {
            console.group(`[${label}]`);
        }
    },

    /**
     * 分组日志结束（仅开发环境）
     */
    groupEnd: () => {
        if (isDev) {
            console.groupEnd();
        }
    },

    /**
     * 计时开始（仅开发环境）
     */
    time: (label: string) => {
        if (isDev) {
            console.time(label);
        }
    },

    /**
     * 计时结束（仅开发环境）
     */
    timeEnd: (label: string) => {
        if (isDev) {
            console.timeEnd(label);
        }
    },

    /**
     * 性能分析辅助函数
     * 测量异步函数执行时间并自动记录
     *
     * @param label - 标签名称
     * @param fn - 要测量的异步函数
     * @returns 函数执行结果
     *
     * @example
     * const result = await logger.profile('fetchRepos', () => api.getRepos());
     * // 输出: [PROFILE] fetchRepos: 123.45ms
     */
    profile: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
        if (!isDev) {
            return fn();
        }

        const start = performance.now();
        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            console.log(`[PROFILE] ${label}: ${duration.toFixed(2)}ms`);
        }
    },

    /**
     * 同步函数性能分析
     *
     * @param label - 标签名称
     * @param fn - 要测量的同步函数
     * @returns 函数执行结果
     */
    profileSync: <T>(label: string, fn: () => T): T => {
        if (!isDev) {
            return fn();
        }

        const start = performance.now();
        try {
            return fn();
        } finally {
            const duration = performance.now() - start;
            console.log(`[PROFILE] ${label}: ${duration.toFixed(2)}ms`);
        }
    },
};

export default logger;
