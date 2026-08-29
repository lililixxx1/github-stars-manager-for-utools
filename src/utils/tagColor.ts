/**
 * 标签自定义色的文字安全化（D3 / M11：8 预设色对比度失控）
 *
 * 背景：TagManager 的 8 预设色中 #84cc16(lime)/#f59e0b(amber) 等亮色
 * 直接作文字色、或在实底上配白字，对比度仅 1.5–2:1。本模块集中换算：
 * - 未选中态（透明底/软底 + 原色描边）：文字走 {@link getTagTextColor}——
 *   light 主题用深色变体，dark 主题用原色（暗底上原色对比达标）；
 *   未知色（非 8 预设的历史数据）一律回退 `var(--color-text-primary)`，描边仍由消费处保留原色。
 * - 实底选中态：前景走 {@link getTagSolidForeground}——按亮度公式在白字/深字间二选一。
 *
 * 主题判断：直读 `document.documentElement.classList.contains('dark')`
 * （App.tsx 即以该 class 切换主题），消费处零传参。
 */

/** 8 预设色（TagManager）→ light 主题下的深色文字变体（同色系 -700 档，保 AA 4.5:1） */
const TAG_TEXT_COLORS: Record<string, string> = {
    '#3b82f6': '#1d4ed8', // blue-500    → blue-700
    '#10b981': '#047857', // emerald-500 → emerald-700
    '#f59e0b': '#b45309', // amber-500   → amber-700
    '#ef4444': '#b91c1c', // red-500     → red-700
    '#8b5cf6': '#6d28d9', // violet-500  → violet-700
    '#ec4899': '#be185d', // pink-500    → pink-700
    '#06b6d4': '#0e7490', // cyan-500    → cyan-700
    '#84cc16': '#4d7c0f', // lime-500    → lime-700
};

/** 未选中态（透明底/软底）文字色：dark 用原色、light 用深色变体；未知色回退文字主色 */
export function getTagTextColor(color: string | null | undefined): string {
    if (!color) return 'var(--color-text-primary)';
    const variant = TAG_TEXT_COLORS[color.toLowerCase()];
    if (!variant) return 'var(--color-text-primary)';
    return document.documentElement.classList.contains('dark') ? color : variant;
}

/** 解析 3/6 位 hex 色值为 RGB；非法输入返回 null */
function parseHexColor(color: string): { r: number; g: number; b: number } | null {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
    if (!match) return null;
    const hex = match[1];
    if (hex.length === 3) {
        return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16),
        };
    }
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
}

/**
 * 实底前景色：按相对亮度公式（ITU-R BT.601 加权）判断——亮底配深字、暗底配白字。
 * 非法/缺省色返回 '#fff'（消费处实底此时回退 `var(--color-primary)`，白字即现状行为）。
 */
export function getTagSolidForeground(color: string | null | undefined): string {
    const rgb = color ? parseHexColor(color) : null;
    if (!rgb) return '#fff';
    const luma = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luma > 0.5 ? '#0f172a' : '#fff';
}
