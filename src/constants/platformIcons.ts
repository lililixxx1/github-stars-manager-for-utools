// ==================== 平台 lucide 图标映射（v1.7.0 全站统一） ====================
// 与 constants/platforms.ts 的 PLATFORM_OPTIONS 八个平台对齐；
// lib/library/sdk 归 Package，未知平台兜底 Box。
// 注：原生 <select><option> 无法渲染组件，ReleasesPage 平台下拉仍用 emoji（platforms.ts 的 icon 字段）。

import type { LucideIcon } from 'lucide-react';
import {
    Laptop, Monitor, Terminal, Tablet, Smartphone,
    Container, Globe, SquareTerminal, Package, Box,
} from 'lucide-react';

const PLATFORM_ICON_MAP: Record<string, LucideIcon> = {
    mac: Laptop,
    windows: Monitor,
    linux: Terminal,
    ios: Tablet,
    android: Smartphone,
    docker: Container,
    web: Globe,
    cli: SquareTerminal,
};

export function getPlatformIcon(platformId: string): LucideIcon {
    const mapped = PLATFORM_ICON_MAP[platformId];
    if (mapped) return mapped;
    if (/^(lib|library|sdk)$/i.test(platformId)) return Package;
    return Box;
}
