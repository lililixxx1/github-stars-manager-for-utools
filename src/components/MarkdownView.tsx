import React, { useCallback, useEffect, useRef } from 'react';
import {
    parseMarkdownToHtml,
    resolveMarkdownImageUrl,
    resolveMarkdownLinkUrl,
    resolveMarkdownSrcset,
    sanitizeHtmlDimension,
    slugifyHeading,
} from '../utils/markdownUrl';

const ALLOWED_ELEMENTS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'div', 'span', 'br', 'hr',
    'a', 'img', 'picture', 'source',
    'strong', 'b', 'em', 'i', 'del', 's', 'ins', 'u', 'sub', 'sup', 'kbd', 'mark', 'abbr',
    'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'details', 'summary', 'figure', 'figcaption',
    'input',
];

const ALLOWED_ATTRIBUTES = [
    'href', 'src', 'srcset', 'media', 'alt', 'title',
    'width', 'height', 'align', 'colspan', 'rowspan',
    'open', 'start', 'type', 'checked', 'disabled',
    'id', 'class',
];

type DOMPurifyStatic = (typeof import('dompurify'))['default'];
let cachedDOMPurify: DOMPurifyStatic | null = null;
let domPurifyPromise: Promise<DOMPurifyStatic> | null = null;

function loadDOMPurify(): Promise<DOMPurifyStatic> {
    if (cachedDOMPurify) return Promise.resolve(cachedDOMPurify);
    domPurifyPromise ??= import('dompurify').then((mod) => {
        const instance = (mod.default ?? mod) as DOMPurifyStatic;
        cachedDOMPurify = instance;
        return instance;
    });
    return domPurifyPromise;
}

function normalizeSanitizedTree(root: ParentNode, repoFullName?: string): void {
    // 1. 仅保留任务列表 checkbox，禁止任何其他表单控件
    root.querySelectorAll('input').forEach((input) => {
        if ((input.getAttribute('type') || '').toLowerCase() !== 'checkbox') {
            input.remove();
            return;
        }
        input.setAttribute('disabled', '');
    });

    // 2. 过滤 class：仅允许 <code class="language-...">
    root.querySelectorAll('[class]').forEach((el) => {
        if (el.tagName === 'CODE') {
            const safeClasses = Array.from(el.classList).filter((cls) =>
                /^language-[a-z0-9_+-]+$/i.test(cls)
            );
            if (safeClasses.length > 0) {
                el.setAttribute('class', safeClasses.join(' '));
            } else {
                el.removeAttribute('class');
            }
            return;
        }
        el.removeAttribute('class');
    });

    // 3. 规范 align 属性
    root.querySelectorAll('[align]').forEach((el) => {
        const val = (el.getAttribute('align') || '').trim().toLowerCase();
        if (val === 'left' || val === 'center' || val === 'right') {
            el.setAttribute('align', val);
        } else {
            el.removeAttribute('align');
        }
    });

    // 4. 图片相对路径/blob 重写、安全策略与尺寸转换
    root.querySelectorAll('img').forEach((img) => {
        const safeSrc = resolveMarkdownImageUrl(img.getAttribute('src') || '', repoFullName);
        if (safeSrc) {
            img.setAttribute('src', safeSrc);
        } else {
            img.removeAttribute('src');
        }
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('referrerpolicy', 'no-referrer');

        const width = sanitizeHtmlDimension(img.getAttribute('width'));
        const height = sanitizeHtmlDimension(img.getAttribute('height'));
        img.removeAttribute('width');
        img.removeAttribute('height');

        if (width) {
            img.style.width = width;
        }
        if (width?.endsWith('%') || !height) {
            img.style.height = 'auto';
        } else {
            img.style.height = height;
        }
    });

    // 5. <source srcset> 路径补全与过滤
    root.querySelectorAll('source').forEach((source) => {
        const safeSrcset = resolveMarkdownSrcset(source.getAttribute('srcset') || '', repoFullName);
        if (safeSrcset) {
            source.setAttribute('srcset', safeSrcset);
        } else {
            source.remove();
        }
    });

    // 6. 链接路径补全与安全属性
    root.querySelectorAll('a').forEach((anchor) => {
        const resolved = resolveMarkdownLinkUrl(anchor.getAttribute('href') || '', repoFullName);
        if (!resolved) {
            anchor.removeAttribute('href');
            anchor.removeAttribute('rel');
            return;
        }
        anchor.setAttribute('href', resolved.href);
        if (!resolved.isAnchor) {
            anchor.setAttribute('rel', 'noopener noreferrer');
        }
    });

    // 7. 表格外包横向滚动容器，适配 800px 窗口
    root.querySelectorAll('table').forEach((table) => {
        if (table.parentElement?.classList.contains('markdown-table-wrap')) return;
        const doc = table.ownerDocument || document;
        const wrap = doc.createElement('div');
        wrap.className = 'markdown-table-wrap';
        table.parentNode?.insertBefore(wrap, table);
        wrap.appendChild(table);
    });

    // 8. 标题锚点 id 补齐（与 #heading 锚点跳转匹配）
    const usedSlugs = new Map<string, number>();
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
        const base = slugifyHeading(heading.textContent || '');
        if (!base) return;
        const count = usedSlugs.get(base) || 0;
        usedSlugs.set(base, count + 1);
        heading.id = count === 0 ? base : `${base}-${count}`;
    });
}

function renderWithDOMPurify(
    container: HTMLElement,
    DOMPurify: DOMPurifyStatic,
    rawHtml: string,
    repoFullName?: string
): void {
    const fragment = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [...ALLOWED_ELEMENTS, '#text'],
        ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
        KEEP_CONTENT: false,
        RETURN_DOM_FRAGMENT: true,
    });
    normalizeSanitizedTree(fragment, repoFullName);
    container.replaceChildren(fragment);
}

interface MarkdownViewProps {
    content: string;
    repoFullName?: string;
    className?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, repoFullName, className }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let cancelled = false;
        const rawHtml = parseMarkdownToHtml(content);

        if ('setHTML' in Element.prototype) {
            const temp = document.createElement('div');
            (temp as unknown as {
                setHTML: (html: string, options?: { sanitizer?: { elements: string[]; attributes: string[] } }) => void;
            }).setHTML(rawHtml, {
                sanitizer: {
                    elements: ALLOWED_ELEMENTS,
                    attributes: ALLOWED_ATTRIBUTES,
                },
            });
            normalizeSanitizedTree(temp, repoFullName);
            container.replaceChildren(...temp.childNodes);
            return () => {
                cancelled = true;
            };
        }

        if (cachedDOMPurify) {
            renderWithDOMPurify(container, cachedDOMPurify, rawHtml, repoFullName);
            return () => {
                cancelled = true;
            };
        }

        loadDOMPurify()
            .then((DOMPurify) => {
                if (cancelled || !containerRef.current) return;
                renderWithDOMPurify(containerRef.current, DOMPurify, rawHtml, repoFullName);
            })
            .catch((err) => {
                console.error('[MarkdownView] Failed to initialize DOMPurify:', err);
            });

        return () => {
            cancelled = true;
        };
    }, [content, repoFullName]);

    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const anchor = (e.target as HTMLElement | null)?.closest('a');
        if (!anchor) return;
        e.preventDefault();

        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return;

        if (rawHref.startsWith('#')) {
            let targetId = rawHref.slice(1);
            try {
                targetId = decodeURIComponent(targetId);
            } catch {
                // 保持原始锚点
            }
            const normalizedTarget = targetId.toLowerCase();
            if (!normalizedTarget || !containerRef.current) return;
            const headings = containerRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
            for (const heading of headings) {
                if (heading.id.toLowerCase() === normalizedTarget) {
                    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                }
            }
            return;
        }

        try {
            const parsed = new URL(rawHref);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                window.githubStarsAPI?.openExternal(parsed.href);
            }
        } catch {
            // 忽略非法 URL
        }
    }, []);

    return (
        <div
            ref={containerRef}
            className={`markdown-body${className ? ` ${className}` : ''}`}
            onClick={handleClick}
        />
    );
};
