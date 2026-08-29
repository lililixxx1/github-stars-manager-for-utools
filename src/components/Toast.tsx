import React, { useEffect, useState } from 'react';
import { Info, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { t } from '../locales';
import type { Language } from '../locales';

export type ToastType = 'info' | 'success' | 'error';

export interface ToastAction {
    /** 按钮文案（如「撤销」） */
    label: string;
    /** 点击回调；点击后 toast 自动关闭 */
    onClick: () => void;
}

export interface ToastOptions {
    /** 提示类型，默认 info */
    type?: ToastType;
    /** 展示时长（毫秒），默认 3000；传 0 表示常驻（需手动 dismiss） */
    duration?: number;
    /** 可选操作按钮（如撤销），点击后关闭并执行 */
    action?: ToastAction;
}

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    leaving: boolean;
    action?: ToastAction;
}

type ToastListener = (items: ToastItem[]) => void;

const EXIT_ANIMATION_MS = 180;

/** 模块级订阅状态（不走 React state，任意模块可直接调用） */
let toastItems: ToastItem[] = [];
const listeners = new Set<ToastListener>();
let nextToastId = 1;

const notify = (): void => {
    listeners.forEach((listener) => listener(toastItems));
};

const removeToast = (id: number): void => {
    toastItems = toastItems.filter((item) => item.id !== id);
    notify();
};

const dismiss = (id: number): void => {
    const target = toastItems.find((item) => item.id === id);
    if (!target || target.leaving) return;
    target.leaving = true;
    notify();
    window.setTimeout(() => removeToast(id), EXIT_ANIMATION_MS);
};

/**
 * 全局 toast API（命令式调用）
 *
 * @example
 * toast.show('同步完成', { type: 'success' });
 * toast.show('导出失败', { type: 'error', duration: 5000 });
 */
export const toast = {
    /** 显示一条提示，返回 id（可用于手动 dismiss） */
    show(message: string, options: ToastOptions = {}): number {
        const { type = 'info', duration = 3000, action } = options;
        const id = nextToastId++;
        toastItems = [...toastItems, { id, message, type, leaving: false, action }];
        notify();
        if (duration > 0) {
            window.setTimeout(() => dismiss(id), duration);
        }
        return id;
    },
    /** 手动关闭指定提示 */
    dismiss,
    /** 清空全部提示 */
    clear(): void {
        toastItems = [];
        notify();
    },
};

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
    info: <Info size={16} />,
    success: <CheckCircle2 size={16} />,
    error: <AlertCircle size={16} />,
};

/**
 * Toast 渲染宿主：在 App 根部挂载一次（右下角、进出 180ms 过渡）。
 * 容器 pointer-events: none 不阻塞页面交互；不监听 Escape（不吞快捷键）。
 */
export const ToastHost: React.FC = () => {
    const [items, setItems] = useState<ToastItem[]>(toastItems);
    const lang = (useStore((state) => state.settings)?.language || 'zh') as Language;

    useEffect(() => {
        const listener: ToastListener = (next) => setItems([...next]);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);

    // live region 常驻 DOM（不随首条 toast 动态插入），保证读屏播报初始内容；
    // .toast-stack 已设 pointer-events: none，空容器无视觉/交互副作用。
    return (
        <div className="toast-stack" role="status" aria-live="polite">
            {items.map((item) => (
                <div
                    key={item.id}
                    className={`toast ${item.leaving ? 'toast-exit' : 'toast-enter'}`}
                >
                    <span className={`toast-icon-${item.type}`}>{TOAST_ICONS[item.type]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{item.message}</span>
                    {item.action && (
                        <button
                            type="button"
                            className="toast-action"
                            onClick={() => {
                                const { onClick } = item.action!;
                                toast.dismiss(item.id);
                                onClick();
                            }}
                        >
                            {item.action.label}
                        </button>
                    )}
                    <button
                        type="button"
                        className="toast-close"
                        aria-label={t('toastDismiss', lang)}
                        onClick={() => toast.dismiss(item.id)}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};
