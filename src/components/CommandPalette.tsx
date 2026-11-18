import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowRight,
    Bell,
    FolderGit2,
    LayoutGrid,
    Moon,
    RefreshCw,
    Search,
    Settings,
    Sparkles,
    Tag,
} from 'lucide-react';
import { useStore } from '../stores/useStore';
import { useT } from '../hooks/useT';
import { toast } from './Toast';

interface CommandItem {
    id: string;
    group: string;
    label: string;
    hint?: string;
    icon: React.ReactNode;
    run: () => void;
}

export const CommandPalette: React.FC = () => {
    const { t } = useT();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const repositories = useStore((s) => s.repositories);
    const settings = useStore((s) => s.settings);
    const viewMode = useStore((s) => s.viewMode);
    const setCurrentPage = useStore((s) => s.setCurrentPage);
    const setSelectedRepoId = useStore((s) => s.setSelectedRepoId);
    const setSearchFilter = useStore((s) => s.setSearchFilter);
    const setViewMode = useStore((s) => s.setViewMode);
    const saveSettings = useStore((s) => s.saveSettings);
    const syncRepositories = useStore((s) => s.syncRepositories);
    const startAutoAnalyze = useStore((s) => s.startAutoAnalyze);

    useEffect(() => {
        const handleGlobalKey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen((prev) => !prev);
            }
        };
        const handleOpenEvent = () => setIsOpen(true);

        window.addEventListener('keydown', handleGlobalKey, true);
        window.addEventListener('open-command-palette', handleOpenEvent);
        return () => {
            window.removeEventListener('keydown', handleGlobalKey, true);
            window.removeEventListener('open-command-palette', handleOpenEvent);
        };
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setActiveIndex(0);
        const timer = window.requestAnimationFrame(() => inputRef.current?.focus());

        const handleOpenKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleOpenKeyDown, true);
        return () => {
            window.cancelAnimationFrame(timer);
            window.removeEventListener('keydown', handleOpenKeyDown, true);
        };
    }, [isOpen]);

    const items = useMemo<CommandItem[]>(() => {
        if (!isOpen) return [];
        const q = query.trim().toLowerCase();

        const staticCommands: CommandItem[] = [
            {
                id: 'view-all',
                group: t('cmdGroupViews'),
                label: t('smartViewAll'),
                icon: <FolderGit2 size={14} />,
                run: () => {
                    setSearchFilter({ smartView: 'all' });
                    setCurrentPage('home');
                },
            },
            {
                id: 'view-untagged',
                group: t('cmdGroupViews'),
                label: t('smartViewUntagged'),
                icon: <Tag size={14} />,
                run: () => {
                    setSearchFilter({ smartView: 'untagged' });
                    setCurrentPage('home');
                },
            },
            {
                id: 'view-unanalyzed',
                group: t('cmdGroupViews'),
                label: t('smartViewUnanalyzed'),
                icon: <Sparkles size={14} />,
                run: () => {
                    setSearchFilter({ smartView: 'unanalyzed' });
                    setCurrentPage('home');
                },
            },
            {
                id: 'view-subscribed',
                group: t('cmdGroupViews'),
                label: t('smartViewSubscribed'),
                icon: <Bell size={14} />,
                run: () => {
                    setSearchFilter({ smartView: 'subscribed' });
                    setCurrentPage('home');
                },
            },
            {
                id: 'nav-releases',
                group: t('cmdGroupPages'),
                label: t('releases'),
                icon: <Bell size={14} />,
                run: () => setCurrentPage('releases'),
            },
            {
                id: 'nav-tags',
                group: t('cmdGroupPages'),
                label: t('manageTags'),
                icon: <Tag size={14} />,
                run: () => setCurrentPage('tags'),
            },
            {
                id: 'nav-settings',
                group: t('cmdGroupPages'),
                label: t('settings'),
                icon: <Settings size={14} />,
                run: () => setCurrentPage('settings'),
            },
            {
                id: 'act-sync',
                group: t('cmdGroupActions'),
                label: t('syncNow'),
                icon: <RefreshCw size={14} />,
                run: () => {
                    syncRepositories().then((res) => {
                        if (res === 'busy') toast.show(t('syncSkippedBusy'));
                    });
                },
            },
            {
                id: 'act-analyze',
                group: t('cmdGroupActions'),
                label: t('analyzeNow'),
                icon: <Sparkles size={14} />,
                run: () => {
                    startAutoAnalyze().then((res) => {
                        if (res === 'busy') toast.show(t('analyzeDeferredBusy'));
                    });
                },
            },
            {
                id: 'act-view-mode',
                group: t('cmdGroupActions'),
                label: t('cmdToggleViewMode'),
                icon: <LayoutGrid size={14} />,
                run: () => setViewMode(viewMode === 'card' ? 'list' : 'card'),
            },
            {
                id: 'act-theme',
                group: t('cmdGroupActions'),
                label: t('cmdToggleTheme'),
                icon: <Moon size={14} />,
                run: () => {
                    const isDark = document.documentElement.classList.contains('dark');
                    saveSettings({ theme: isDark ? 'light' : 'dark' });
                },
            },
        ];

        const matchedCommands = q
            ? staticCommands.filter((item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q))
            : staticCommands;

        if (!q) return matchedCommands;

        const repoMatches: CommandItem[] = [];
        for (const repo of repositories) {
            const haystack = `${repo.alias || ''} ${repo.fullName} ${repo.aiSummary || ''} ${repo.description || ''}`.toLowerCase();
            if (haystack.includes(q)) {
                repoMatches.push({
                    id: `repo-${repo.id}`,
                    group: t('cmdGroupRepos'),
                    label: repo.alias ? `${repo.alias} (${repo.fullName})` : repo.fullName,
                    hint: repo.language || undefined,
                    icon: <ArrowRight size={13} />,
                    run: () => {
                        setSelectedRepoId(repo.id);
                        setCurrentPage('detail');
                    },
                });
                if (repoMatches.length >= 6) break;
            }
        }

        return [...repoMatches, ...matchedCommands];
    }, [
        isOpen,
        query,
        repositories,
        saveSettings,
        setCurrentPage,
        setSearchFilter,
        setSelectedRepoId,
        setViewMode,
        settings.theme,
        startAutoAnalyze,
        syncRepositories,
        t,
        viewMode,
    ]);

    useEffect(() => {
        setActiveIndex((prev) => (items.length === 0 ? 0 : Math.min(prev, items.length - 1)));
    }, [items.length]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (items.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((prev) => (prev + 1) % items.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const target = items[activeIndex];
            if (target) {
                target.run();
                setIsOpen(false);
            }
        }
    };

    if (!isOpen) return null;

    let lastGroup = '';

    return (
        <div
            className="cmd-palette-overlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
            }}
        >
            <div className="cmd-palette" role="dialog" aria-modal="true" aria-label="Command Palette">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
                    <Search size={15} className="text-[var(--color-text-muted)] shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="cmd-input w-full bg-transparent border-none outline-none text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={t('cmdPalettePlaceholder')}
                    />
                </div>

                <div className="max-h-[340px] overflow-y-auto p-1.5">
                    {items.length === 0 ? (
                        <div className="py-6 text-center text-[13px] text-[var(--color-text-muted)]">
                            {t('cmdEmpty')}
                        </div>
                    ) : (
                        items.map((item, idx) => {
                            const showGroupHeader = item.group !== lastGroup;
                            lastGroup = item.group;
                            return (
                                <React.Fragment key={item.id}>
                                    {showGroupHeader && (
                                        <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
                                            {item.group}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        className={`cmd-item${idx === activeIndex ? ' active' : ''}`}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                        onClick={() => {
                                            item.run();
                                            setIsOpen(false);
                                        }}
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="text-[var(--color-text-secondary)] shrink-0">{item.icon}</span>
                                            <span className="truncate">{item.label}</span>
                                        </span>
                                        {item.hint && (
                                            <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">
                                                {item.hint}
                                            </span>
                                        )}
                                    </button>
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
