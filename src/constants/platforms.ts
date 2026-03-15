// ==================== 平台常量定义 🆕 v1.3.0 ====================

export const PLATFORM_OPTIONS = [
    { id: 'mac', label: 'macOS', icon: '🍎' },
    { id: 'windows', label: 'Windows', icon: '🪟' },
    { id: 'linux', label: 'Linux', icon: '🐧' },
    { id: 'ios', label: 'iOS', icon: '📱' },
    { id: 'android', label: 'Android', icon: '🤖' },
    { id: 'docker', label: 'Docker', icon: '🐳' },
    { id: 'web', label: 'Web', icon: '🌐' },
    { id: 'cli', label: 'CLI', icon: '⌨️' },
] as const;

export type PlatformId = typeof PLATFORM_OPTIONS[number]['id'];

export const PLATFORM_NONE = 'none';  // 未分析筛选选项
