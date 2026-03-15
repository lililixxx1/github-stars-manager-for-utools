import { useStore } from '../stores/useStore';
import { t } from '../locales';
import type { Language } from '../locales';

interface UnreadBadgeProps {
    lang: Language;
    onClick?: () => void;
}

export function UnreadBadge({ lang, onClick }: UnreadBadgeProps) {
    const unreadCount = useStore((state) => state.getUnreadCount)();
    const releaseCheckStatus = useStore((state) => state.releaseCheckStatus);

    if (unreadCount === 0 && !releaseCheckStatus.checking) {
        return null;
    }

    return (
        <button
            onClick={onClick}
            className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                text-sm font-medium transition-colors duration-200
                bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300
                hover:bg-blue-200 dark:hover:bg-blue-800/40"
            title={t('releases', lang)}
        >
            {/* 铃铛图标 */}
            <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
            </svg>

            {/* 未读数量 */}
            {unreadCount > 0 && (
                <span className="font-semibold">
                    {unreadCount} {t('newReleases', lang)}
                </span>
            )}

            {/* 检测中状态 */}
            {releaseCheckStatus.checking && (
                <span className="text-xs opacity-75">
                    {t('checkingUpdates', lang)}
                </span>
            )}

            {/* 未读指示点 */}
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
        </button>
    );
}
