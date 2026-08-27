import React, { useEffect, useRef } from 'react';
import { useStore } from '../stores/useStore';
import { t } from '../locales';
import type { Language } from '../locales';
import { X } from 'lucide-react';

interface ModalProps {
    /** 受控开关 */
    isOpen: boolean;
    /** 关闭请求（Escape / 遮罩点击 / 关闭按钮） */
    onClose: () => void;
    /** 标题（同时作为 aria-label） */
    title?: string;
    children: React.ReactNode;
    /** 底部操作区（按钮等） */
    footer?: React.ReactNode;
    /** 最大宽度（px），默认 400 */
    width?: number;
}

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * 受控弹窗基础组件：遮罩淡入、卡片阴影、Escape 关闭、
 * 焦点圈定（Tab 循环）与关闭后焦点还原。
 *
 * 焦点管理参照 ConfirmDialog（全项目质量基准）演进。
 *
 * @example
 * <Modal isOpen={open} onClose={close} title="标题" footer={<button />}>
 *     内容
 * </Modal>
 */
export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    width = 400,
}) => {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const previousActiveElementRef = useRef<HTMLElement | null>(null);
    // onClose 用 latest-ref，避免调用方内联箭头函数导致焦点管理副作用反复重建
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const lang = (useStore((state) => state.settings)?.language || 'zh') as Language;

    useEffect(() => {
        if (!isOpen) return;

        previousActiveElementRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const getFocusableList = (): HTMLElement[] => {
            const panel = panelRef.current;
            if (!panel) return [];
            return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        };

        // 打开时初始聚焦第一个可聚焦元素
        window.requestAnimationFrame(() => {
            getFocusableList()[0]?.focus();
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = getFocusableList();
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            const insidePanel = panelRef.current?.contains(active) ?? false;

            if (event.shiftKey) {
                if (active === first || !insidePanel) {
                    event.preventDefault();
                    last.focus();
                }
            } else {
                if (active === last || !insidePanel) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            window.requestAnimationFrame(() => previousActiveElementRef.current?.focus());
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="modal-overlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    onCloseRef.current();
                }
            }}
        >
            <div
                ref={panelRef}
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                style={{ maxWidth: width, margin: '0 16px' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    {title ? (
                        <h3 className="modal-title">{title}</h3>
                    ) : (
                        <span style={{ flex: 1 }} />
                    )}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: 4 }}
                        aria-label={t('commonClose', lang)}
                        onClick={() => onCloseRef.current()}
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">{children}</div>
                {footer && <div className="modal-footer">{footer}</div>}
            </div>
        </div>
    );
};
