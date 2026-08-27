import React, { useEffect, useRef } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: 'default' | 'danger';
    loading?: boolean;
    autoFocusButton?: 'confirm' | 'cancel';
}

/**
 * 确认弹窗（基于 Modal 的焦点圈定/还原能力）
 *
 * 对外 props 与旧版完全兼容：
 * - Escape / 遮罩点击 / 关闭按钮 → onCancel
 * - autoFocusButton 缺省时：danger 聚焦取消、default 聚焦确认
 * - loading 期间禁止关闭与提交
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    onConfirm,
    onCancel,
    variant = 'default',
    loading = false,
    autoFocusButton,
}) => {
    const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

    // 初始焦点目标（Modal 的通用初始聚焦之后执行，覆盖为其结果）
    useEffect(() => {
        if (!isOpen) return;

        const focusTarget = (autoFocusButton ?? (variant === 'danger' ? 'cancel' : 'confirm')) === 'confirm'
            ? confirmButtonRef.current
            : cancelButtonRef.current;
        window.requestAnimationFrame(() => focusTarget?.focus());
    }, [autoFocusButton, isOpen, variant]);

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={loading ? () => undefined : onCancel}
            title={title}
            footer={
                <>
                    <button
                        ref={cancelButtonRef}
                        className="btn btn-secondary"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        {cancelText}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? '处理中...' : confirmText}
                    </button>
                </>
            }
        >
            <p style={{ fontSize: 'var(--text-md)', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {message}
            </p>
        </Modal>
    );
};
