import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DependencyList } from 'react';
import { useGlobalShortcut } from './useGlobalShortcut';

export type RovingControlGroup = 'topbar' | 'quick' | 'tags' | 'analysis' | 'notes' | 'links';

export interface RovingControl {
    id: string;
    group: RovingControlGroup;
    ref: { current: HTMLElement | null };
    action: () => void;
    visible?: boolean;
    disabled?: boolean;
}

interface UseRovingControlsOptions {
    enabled?: boolean;
    controls: RovingControl[];
    initialId?: string;
    deps?: DependencyList;
}

interface UseRovingControlsResult {
    activeId: string | null;
    setActiveId: (id: string) => void;
    isActive: (id: string) => boolean;
    getTabIndex: (id: string) => 0 | -1;
    focusActive: () => void;
    focusControl: (id: string) => void;
    moveHorizontal: (delta: -1 | 1) => void;
    moveVertical: (delta: -1 | 1) => void;
    activate: () => void;
}

function isControlAvailable(control: RovingControl): boolean {
    return control.visible !== false && control.disabled !== true;
}

export function useRovingControls({
    enabled = true,
    controls,
    initialId,
    deps = [],
}: UseRovingControlsOptions): UseRovingControlsResult {
    const [activeId, setActiveIdState] = useState<string | null>(initialId ?? null);

    const availableControls = useMemo(
        () => controls.filter(isControlAvailable),
        [controls]
    );

    const findControl = useCallback((id: string | null) => (
        id ? controls.find(control => control.id === id) ?? null : null
    ), [controls]);

    const findAvailableControl = useCallback((id: string | null) => (
        id ? availableControls.find(control => control.id === id) ?? null : null
    ), [availableControls]);

    const focusControl = useCallback((id: string) => {
        const control = findAvailableControl(id);
        if (!control) return;

        window.requestAnimationFrame(() => {
            const element = control.ref.current;
            if (!element) return;

            element.focus();
            element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
    }, [findAvailableControl]);

    const setActiveId = useCallback((id: string) => {
        if (!findAvailableControl(id)) return;
        setActiveIdState(id);
        focusControl(id);
    }, [findAvailableControl, focusControl]);

    const getFallbackControl = useCallback((currentId: string | null): RovingControl | null => {
        if (availableControls.length === 0) return null;

        const initialControl = findAvailableControl(initialId ?? null);
        if (!currentId && initialControl) return initialControl;

        const currentControl = findControl(currentId);
        if (currentControl) {
            const sameGroupControl = availableControls.find(control => control.group === currentControl.group);
            if (sameGroupControl) return sameGroupControl;

            const groupIndex = controls.findIndex(control => control.group === currentControl.group);
            const afterCurrentGroup = availableControls.find(control => (
                controls.findIndex(item => item.id === control.id) > groupIndex
            ));
            if (afterCurrentGroup) return afterCurrentGroup;
        }

        return initialControl ?? availableControls[0];
    }, [availableControls, controls, findAvailableControl, findControl, initialId]);

    useEffect(() => {
        if (!enabled) return;

        const currentControl = findAvailableControl(activeId);
        if (currentControl) {
            return;
        }

        const fallbackControl = getFallbackControl(activeId);
        const nextActiveId = fallbackControl?.id ?? null;
        setActiveIdState(nextActiveId);
    }, [activeId, enabled, findAvailableControl, getFallbackControl, ...deps]);

    const focusActive = useCallback(() => {
        if (!activeId) return;
        focusControl(activeId);
    }, [activeId, focusControl]);

    useEffect(() => {
        if (!enabled || !activeId) return;
        focusControl(activeId);
    }, [activeId, enabled, focusControl]);

    const moveHorizontal = useCallback((delta: -1 | 1) => {
        const currentControl = findAvailableControl(activeId) ?? getFallbackControl(activeId);
        if (!currentControl) return;

        const groupControls = availableControls.filter(control => control.group === currentControl.group);
        if (groupControls.length === 0) return;

        const currentIndex = groupControls.findIndex(control => control.id === currentControl.id);
        const nextIndex = (currentIndex + delta + groupControls.length) % groupControls.length;
        setActiveId(groupControls[nextIndex].id);
    }, [activeId, availableControls, findAvailableControl, getFallbackControl, setActiveId]);

    const moveVertical = useCallback((delta: -1 | 1) => {
        const currentControl = findAvailableControl(activeId) ?? getFallbackControl(activeId);
        if (!currentControl) return;

        const groupOrder = Array.from(new Set(availableControls.map(control => control.group)));
        const currentGroupIndex = groupOrder.indexOf(currentControl.group);
        if (currentGroupIndex === -1) return;

        const nextGroupIndex = (currentGroupIndex + delta + groupOrder.length) % groupOrder.length;
        const nextControl = availableControls.find(control => control.group === groupOrder[nextGroupIndex]);
        if (nextControl) {
            setActiveId(nextControl.id);
        }
    }, [activeId, availableControls, findAvailableControl, getFallbackControl, setActiveId]);

    const activate = useCallback(() => {
        const currentControl = findAvailableControl(activeId);
        currentControl?.action();
    }, [activeId, findAvailableControl]);

    useGlobalShortcut((event) => {
        if (!enabled) return;

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            moveHorizontal(-1);
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            moveHorizontal(1);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveVertical(-1);
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveVertical(1);
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
        }
    }, {
        enabled,
        capture: true,
        target: document,
        deps: [activeId, activate, moveHorizontal, moveVertical, ...deps],
    });

    return {
        activeId,
        setActiveId,
        isActive: useCallback((id: string) => activeId === id, [activeId]),
        getTabIndex: useCallback((id: string) => activeId === id ? 0 : -1, [activeId]),
        focusActive,
        focusControl,
        moveHorizontal,
        moveVertical,
        activate,
    };
}
