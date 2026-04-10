export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;

    if (target.isContentEditable) return true;

    const editableSelector = 'input, textarea, select, [contenteditable="true"]';
    return Boolean(target.closest(editableSelector));
}

export function shouldIgnoreGlobalKeydown(event: KeyboardEvent): boolean {
    return event.defaultPrevented
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isEditableTarget(event.target);
}
