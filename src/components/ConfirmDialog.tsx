import React, { useEffect, useRef } from 'react';

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
    const previousActiveElementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        previousActiveElementRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const focusTarget = (autoFocusButton ?? (variant === 'danger' ? 'cancel' : 'confirm')) === 'confirm'
            ? confirmButtonRef.current
            : cancelButtonRef.current;
        window.requestAnimationFrame(() => focusTarget?.focus());

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            event.preventDefault();
            onCancel();
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            window.requestAnimationFrame(() => previousActiveElementRef.current?.focus());
        };
    }, [autoFocusButton, isOpen, onCancel, variant]);

    if (!isOpen) return null;

    const confirmBtnStyle = variant === 'danger'
        ? { background: 'var(--color-error)', color: 'white' }
        : {};

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
        >
            <div
                className="card animate-fade-in"
                style={{ padding: 24, maxWidth: 400, width: '100%', margin: '0 16px' }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                    {title}
                </h3>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
                    {message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button ref={cancelButtonRef} className="btn btn-secondary" onClick={onCancel} disabled={loading}>
                        {cancelText}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        className="btn"
                        style={confirmBtnStyle}
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? '处理中...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
