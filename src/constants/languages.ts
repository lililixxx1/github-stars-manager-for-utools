/**
 * 编程语言颜色映射
 * 数据来源: GitHub 语言统计
 */

export const LANGUAGE_COLORS: Record<string, string> = {
    // 主流语言
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    Java: '#b07219',
    Go: '#00ADD8',
    Rust: '#dea584',
    'C++': '#f34b7d',
    C: '#555555',
    'C#': '#239120',

    // Web 相关
    HTML: '#e34c26',
    CSS: '#563d7c',
    Vue: '#41b883',
    Svelte: '#ff3e00',
    PHP: '#4F5D95',

    // 脚本语言
    Ruby: '#701516',
    Shell: '#89e051',
    Lua: '#000080',
    Perl: '#39457E',

    // 移动端
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    ObjectiveC: '#438eff',

    // 函数式语言
    Scala: '#c22d40',
    Elixir: '#6e4a7e',
    Haskell: '#5e5086',
    Clojure: '#db5855',
    'F#': '#b845fc',

    // 其他语言
    R: '#198CE7',
    MATLAB: '#e16737',
    Julia: '#a270ba',
    Zig: '#ec915c',
    Nim: '#ffc200',
    Crystal: '#000100',

    // 数据库
    SQL: '#e38c00',
    PLpgSQL: '#336790',

    // 配置/标记
    Markdown: '#083fa1',
    JSON: '#292929',
    YAML: '#cb171e',
    Dockerfile: '#384d54',
};

/**
 * 获取语言颜色，未知语言返回默认灰色
 */
export function getLanguageColor(language: string | null | undefined): string {
    if (!language) return '#8b8b8b';
    return LANGUAGE_COLORS[language] || '#8b8b8b';
}

/**
 * 语言列表（用于筛选等场景）
 */
export const LANGUAGE_LIST = Object.keys(LANGUAGE_COLORS);
