/**
 * 全局渲染错误边界（F4）
 * @module components/ErrorBoundary
 *
 * 任何组件 render 异常（如畸形导入数据导致 RepositoryCard 抛 TypeError），
 * 都会整树卸载白屏且 uTools 内无恢复手段——此处兜底展示错误信息与恢复入口。
 * 明确不提供"重置本地数据"按钮：破坏性操作需单独确认流程。
 */

import React from 'react';
import { logger } from '../utils/logger';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        logger.error('[ErrorBoundary] 渲染异常:', error, info.componentStack);
    }

    handleCopyDetail = () => {
        const { error } = this.state;
        const detail = error ? (error.stack || `${error.name}: ${error.message}`) : '';
        // 浏览器 dev 环境无 utools 对象，静默降级
        if (typeof utools !== 'undefined' && utools.copyText) {
            utools.copyText(detail);
        }
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        const message = (this.state.error.message || String(this.state.error)).slice(0, 500);

        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                background: 'var(--color-background, #f5f5f5)',
            }}>
                <div
                    className="card"
                    style={{
                        maxWidth: 480,
                        width: '100%',
                        padding: 20,
                        border: '1px solid var(--color-error, #ef4444)',
                    }}
                >
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--color-error, #ef4444)' }}>
                        插件渲染出错 / Render Error
                    </h3>
                    <p style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        color: 'var(--color-text-secondary, #666)',
                        margin: '0 0 16px',
                    }}>
                        {message}
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={this.handleCopyDetail}>
                            复制详情 / Copy
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={this.handleReload}>
                            重新加载 / Reload
                        </button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted, #999)', marginTop: 12, marginBottom: 0 }}>
                        若持续出现请联系开发者 / If this persists, please contact the developer
                    </p>
                </div>
            </div>
        );
    }
}
