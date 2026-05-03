import type { DependencyList } from 'react';
import { useGlobalShortcut } from './useGlobalShortcut';

interface BackShortcutOptions {
    enabled?: boolean;
    capture?: boolean;
    target?: Window | Document;
    deps?: DependencyList;
    onBack: () => void;
    beforeBack?: () => boolean;
}

export function useBackShortcut({
    enabled = true,
    capture = false,
    target,
    deps = [],
    onBack,
    beforeBack,
}: BackShortcutOptions): void {
    useGlobalShortcut((event) => {
        if (event.key !== 'Backspace') return;

        event.preventDefault();
        if (beforeBack?.()) return;

        onBack();
    }, {
        enabled,
        capture,
        target,
        deps: [onBack, beforeBack, ...deps],
    });
}
