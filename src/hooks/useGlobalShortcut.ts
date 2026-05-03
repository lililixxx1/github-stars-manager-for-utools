import { useEffect, useRef } from 'react';
import type { DependencyList } from 'react';
import { shouldIgnoreGlobalKeydown } from '../utils/keyboard';

interface GlobalShortcutOptions {
    enabled?: boolean;
    capture?: boolean;
    ignoreEditable?: boolean;
    target?: Window | Document;
    deps?: DependencyList;
}

function shouldIgnoreKeydown(event: KeyboardEvent, ignoreEditable: boolean): boolean {
    if (ignoreEditable) {
        return shouldIgnoreGlobalKeydown(event);
    }

    return event.defaultPrevented
        || event.ctrlKey
        || event.metaKey
        || event.altKey;
}

export function useGlobalShortcut(
    handler: (event: KeyboardEvent) => void,
    options: GlobalShortcutOptions = {}
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    const {
        enabled = true,
        capture = false,
        ignoreEditable = true,
        target,
        deps = [],
    } = options;

    useEffect(() => {
        if (!enabled) return;

        const eventTarget = target ?? window;
        const handleKeyDown: EventListener = (event) => {
            const keyboardEvent = event as KeyboardEvent;
            if (shouldIgnoreKeydown(keyboardEvent, ignoreEditable)) return;
            handlerRef.current(keyboardEvent);
        };

        eventTarget.addEventListener('keydown', handleKeyDown, capture);
        return () => eventTarget.removeEventListener('keydown', handleKeyDown, capture);
    }, [enabled, capture, ignoreEditable, target, ...deps]);
}
