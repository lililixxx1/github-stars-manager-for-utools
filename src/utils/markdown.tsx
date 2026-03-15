/**
 * 简易 Markdown 渲染器
 * 支持: 标题、列表、引用、代码块、分隔线、加粗、内联代码、链接
 */
import React from 'react';

/**
 * 解析行内元素（图片、加粗、内联代码、链接）
 */
function parseInline(line: string, keyPrefix: string): React.ReactNode[] {
    const parts = line.split(/(!\[.*?\]\(.*?\)|\*\*.*?\*\*|`[^`]+`|\[.*?\]\(.*?\))/g);
    return parts.filter(Boolean).map((part, i) => {
        // 图片
        const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
            const urlAndTitle = imgMatch[2].split(/\s+["']/);
            const url = urlAndTitle[0];
            const title = urlAndTitle.length > 1 ? urlAndTitle[1].replace(/["']$/, '') : undefined;
            return (
                <img
                    key={`${keyPrefix}-${i}`}
                    src={url}
                    alt={imgMatch[1]}
                    title={title}
                    style={{ maxWidth: '100%', borderRadius: '4px', verticalAlign: 'middle' }}
                />
            );
        }

        // 加粗
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={`${keyPrefix}-${i}`} style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {part.slice(2, -2)}
                </strong>
            );
        }
        // 内联代码
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code
                    key={`${keyPrefix}-${i}`}
                    style={{
                        background: 'var(--color-surface-hover)',
                        color: 'var(--color-primary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '0.9em',
                    }}
                >
                    {part.slice(1, -1)}
                </code>
            );
        }
        // 链接
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
            const urlAndTitle = linkMatch[2].split(/\s+["']/);
            const url = urlAndTitle[0];
            return (
                <a
                    key={`${keyPrefix}-${i}`}
                    href={url}
                    style={{ color: 'var(--color-primary)', textDecoration: 'none', cursor: 'pointer', wordBreak: 'break-all' }}
                    onClick={(e) => {
                        e.preventDefault();
                        window.githubStarsAPI?.openExternal(url);
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                    {linkMatch[1]}
                </a>
            );
        }
        return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    });
}

/**
 * 代码块样式
 */
const CODE_BLOCK_STYLE: React.CSSProperties = {
    background: 'var(--color-surface-secondary)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '12px',
    borderRadius: '8px',
    overflowX: 'auto',
    fontSize: '13px',
    lineHeight: 1.5,
    marginTop: '8px',
    marginBottom: '12px',
    fontFamily: 'monospace',
};

/**
 * 渲染 Markdown 文本为 React 元素数组
 */
export function renderMarkdown(text: string): React.ReactNode[] {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 代码块
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                elements.push(
                    <pre key={`code-${i}`} style={CODE_BLOCK_STYLE}>
                        <code>{codeContent.join('\n')}</code>
                    </pre>
                );
                codeContent = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            continue;
        }

        // 标题
        if (line.match(/^#{1,6}\s+/)) {
            const levelMatch = line.match(/^(#{1,6})\s+/);
            const level = levelMatch ? levelMatch[1].length : 1;
            const content = line.replace(/^#{1,6}\s+/, '');
            const fontSize = level === 1 ? '1.5em' : level === 2 ? '1.3em' : level === 3 ? '1.1em' : '1em';
            elements.push(
                <div
                    key={i}
                    style={{
                        fontSize,
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        marginTop: level <= 2 ? '24px' : '16px',
                        marginBottom: '12px',
                        borderBottom: level <= 2 ? '1px solid var(--color-border)' : 'none',
                        paddingBottom: level <= 2 ? '8px' : '0',
                    }}
                >
                    {parseInline(content, `h${level}-${i}`)}
                </div>
            );
            continue;
        }

        // 列表项
        if (line.match(/^[-*]\s+/)) {
            elements.push(
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        gap: '8px',
                        marginLeft: '12px',
                        marginTop: '6px',
                        marginBottom: '6px',
                        color: 'var(--color-text-secondary)',
                        fontSize: '14px',
                    }}
                >
                    <span style={{ color: 'var(--color-text-muted)' }}>•</span>
                    <div style={{ flex: 1, lineHeight: 1.6 }}>
                        {parseInline(line.replace(/^[-*]\s+/, ''), `li-${i}`)}
                    </div>
                </div>
            );
            continue;
        }

        // 引用块
        if (line.match(/^>\s+/)) {
            elements.push(
                <div
                    key={i}
                    style={{
                        borderLeft: '4px solid var(--color-border)',
                        paddingLeft: '16px',
                        color: 'var(--color-text-muted)',
                        margin: '12px 0',
                        fontSize: '14px',
                        fontStyle: 'italic',
                        background: 'var(--color-surface-secondary)',
                        padding: '12px 16px',
                        borderRadius: '0 8px 8px 0',
                    }}
                >
                    {parseInline(line.replace(/^>\s+/, ''), `quote-${i}`)}
                </div>
            );
            continue;
        }

        // 分隔线
        if (line.match(/^---+|^\*\*\*+$/)) {
            elements.push(
                <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '24px 0' }} />
            );
            continue;
        }

        // 空行
        if (!line.trim()) {
            elements.push(<div key={i} style={{ height: '12px' }} />);
            continue;
        }

        // 普通段落
        elements.push(
            <div key={i} style={{ color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>
                {parseInline(line, `p-${i}`)}
            </div>
        );
    }

    // 未闭合的代码块
    if (inCodeBlock) {
        elements.push(
            <pre key="code-unclosed" style={CODE_BLOCK_STYLE}>
                <code>{codeContent.join('\n')}</code>
            </pre>
        );
    }

    return elements;
}
