/**
 * 功能开关配置
 * @module config/features
 * @since v1.7.0
 *
 * 用于控制新功能的灰度发布和快速回滚
 *
 * 使用方式:
 * 1. 新功能开发完成后，默认关闭开关
 * 2. 经过测试后逐步开启
 * 3. 如发现问题，可快速关闭开关回滚
 */

/**
 * 功能开关配置对象
 *
 * true: 使用新实现
 * false: 使用旧实现（默认）
 */
export const FEATURES = {
    // ==================== v1.7.0 优化项 ====================

    /**
     * 筛选器重构开关
     * - true: 使用新的 filterSelectors 模块
     * - false: 使用 useStore 中的旧实现
     */
    USE_NEW_FILTER_PIPELINE: false,

    /**
     * HomePage 组件拆分开关
     * - true: 使用拆分后的 home/ 目录组件
     * - false: 使用原始 HomePage.tsx
     */
    USE_NEW_HOME_PAGE: false,

    /**
     * 哈希算法开关
     * - true: 使用混合哈希算法（碰撞率 < 10^-12）
     * - false: 使用简单哈希（碰撞率 1/65536）
     */
    USE_NEW_HASH_ALGORITHM: true,

    /**
     * deleteTag 异步优化开关
     * - true: 使用分片异步更新
     * - false: 使用同步遍历更新
     */
    USE_ASYNC_DELETE_TAG: true,

    /**
     * React.memo 优化开关
     * - true: 使用 memo 包装的组件
     * - false: 使用原始组件
     */
    USE_MEMO_COMPONENTS: true,

    // ==================== 开发调试 ====================

    /**
     * 性能监控开关
     * - true: 启用渲染时间监控
     * - false: 禁用
     */
    ENABLE_PERFORMANCE_MONITORING: import.meta.env.DEV,

    /**
     * 调试日志开关
     * - true: 输出详细调试日志
     * - false: 仅输出错误日志
     */
    ENABLE_DEBUG_LOGS: import.meta.env.DEV,
} as const;

/**
 * 功能开关类型
 */
export type FeatureFlag = keyof typeof FEATURES;

/**
 * 检查功能是否启用
 * @param flag - 功能开关名称
 * @returns 是否启用
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
    return FEATURES[flag] === true;
}

/**
 * 获取所有功能开关状态
 * @returns 功能开关状态对象
 */
export function getAllFeatures(): Record<string, boolean> {
    return { ...FEATURES };
}

export default FEATURES;
