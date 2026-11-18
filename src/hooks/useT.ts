import { useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { t, type Language, type TranslationKey } from '../locales';

export function useT() {
    const lang = useStore((state) => (state.settings?.language || 'zh') as Language);
    const translate = useCallback(
        (key: TranslationKey, params?: Record<string, string | number>) => t(key, lang, params),
        [lang]
    );
    return { t: translate, lang };
}
