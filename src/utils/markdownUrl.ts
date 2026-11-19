import { marked } from 'marked';

const DANGEROUS_SCHEME_RE = /^(javascript|vbscript|data|file):/i;
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function stripControlAndSpace(value: string): string {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u0020]+/g, '');
}

function normalizeCandidateUrl(rawUrl: string): string | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    const compact = stripControlAndSpace(trimmed);
    if (DANGEROUS_SCHEME_RE.test(compact)) return null;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return trimmed;
}

/**
 * 将 Markdown 文本（含 GFM 表格、任务列表与内嵌 HTML）解析为原始 HTML 字符串
 */
export function parseMarkdownToHtml(markdown: string): string {
    return marked.parse(markdown, {
        gfm: true,
        breaks: false,
        async: false,
    }) as string;
}

/**
 * 解析 README/Release 中的图片 URL：
 * - 拦截 javascript:/vbscript:/data:/file:
 * - 将 github.com/{owner}/{repo}/blob/... 重写为 raw.githubusercontent.com
 * - 将相对路径基于 raw.githubusercontent.com/{repoFullName}/HEAD/ 补全
 */
export function resolveMarkdownImageUrl(rawUrl: string, repoFullName?: string): string | null {
    const candidate = normalizeCandidateUrl(rawUrl);
    if (!candidate || candidate.startsWith('#')) return null;

    if (HAS_SCHEME_RE.test(candidate)) {
        try {
            const parsed = new URL(candidate);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return null;
            }
            if (parsed.hostname === 'github.com') {
                const blobMatch = parsed.pathname.match(/^\/([^/]+\/[^/]+)\/blob\/(.+)$/);
                if (blobMatch) {
                    return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}${parsed.search}`;
                }
            }
            return parsed.href;
        } catch {
            return null;
        }
    }

    if (!repoFullName) return null;
    const cleanRelative = candidate.replace(/^\/+/, '');
    try {
        const base = `https://raw.githubusercontent.com/${repoFullName}/HEAD/`;
        const resolved = new URL(cleanRelative, base);
        if (resolved.origin !== 'https://raw.githubusercontent.com') return null;
        return resolved.href;
    } catch {
        return null;
    }
}

/**
 * 解析 README/Release 中的超链接 URL：
 * - #锚点 保留为页内跳转
 * - 相对路径基于 github.com/{repoFullName}/blob/HEAD/ 补全
 */
export function resolveMarkdownLinkUrl(
    rawUrl: string,
    repoFullName?: string
): { href: string; isAnchor: boolean } | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('#')) {
        return { href: trimmed, isAnchor: true };
    }

    const candidate = normalizeCandidateUrl(trimmed);
    if (!candidate) return null;

    if (HAS_SCHEME_RE.test(candidate)) {
        try {
            const parsed = new URL(candidate);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return null;
            }
            return { href: parsed.href, isAnchor: false };
        } catch {
            return null;
        }
    }

    if (!repoFullName) return null;
    const cleanRelative = candidate.replace(/^\/+/, '');
    try {
        const base = `https://github.com/${repoFullName}/blob/HEAD/`;
        const resolved = new URL(cleanRelative, base);
        if (resolved.origin !== 'https://github.com') return null;
        return { href: resolved.href, isAnchor: false };
    } catch {
        return null;
    }
}

/**
 * 解析并过滤 <source srcset="..."> 候选项
 */
export function resolveMarkdownSrcset(srcset: string, repoFullName?: string): string {
    if (!srcset.trim()) return '';
    return srcset
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const parts = entry.split(/\s+/);
            const url = resolveMarkdownImageUrl(parts[0], repoFullName);
            if (!url) return null;
            return parts.length > 1 ? `${url} ${parts.slice(1).join(' ')}` : url;
        })
        .filter((item): item is string => Boolean(item))
        .join(', ');
}

/**
 * 校验 HTML width/height 属性值，返回合法 CSS 长度（px / %）
 */
export function sanitizeHtmlDimension(raw: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return `${trimmed}px`;
    }
    if (/^\d+(\.\d+)?(px|%)$/i.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    return null;
}

/**
 * 为标题生成 GitHub 风格锚点 slug
 */
export function slugifyHeading(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '');
}
