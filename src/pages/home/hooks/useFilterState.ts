/**
 * 筛选状态 Hook
 * @module pages/home/hooks/useFilterState
 * @since v1.7.0
 *
 * 管理筛选状态
 */

import { useState, useCallback } from 'react';
import { useStore } from '@/stores/useStore';
import type { SortBy, SortOrder } from '@/types';

export interface FilterState {
    keyword: string;
    languages: string[];
    customTags: string[];
    platforms: string[];
    hasNotes: boolean | null;
    hasAlias: boolean | null;
    hasReleases: boolean | null;
    sortBy: SortBy;
    sortOrder: SortOrder;
}

export const useFilterState = () => {
    const { searchFilter, setSearchFilter } = useStore();

    const handleKeywordChange = useCallback((keyword: string) => {
        setSearchFilter({ keyword });
    }, [setSearchFilter]);

    const handleLanguageToggle = useCallback((language: string) => {
        const newLanguages = searchFilter.languages.includes(language)
            ? searchFilter.languages.filter(l => l !== language)
            : [...searchFilter.languages, language];
        setSearchFilter({ languages: newLanguages });
    }, [searchFilter.languages, setSearchFilter]);

    const handleTagToggle = useCallback((tagId: string) => {
        const newTags = searchFilter.customTags.includes(tagId)
            ? searchFilter.customTags.filter(t => t !== tagId)
            : [...searchFilter.customTags, tagId];
        setSearchFilter({ customTags: newTags });
    }, [searchFilter.customTags, setSearchFilter]);

    const handlePlatformToggle = useCallback((platform: string) => {
        const newPlatforms = searchFilter.platforms.includes(platform)
            ? searchFilter.platforms.filter(p => p !== platform)
            : [...searchFilter.platforms, platform];
        setSearchFilter({ platforms: newPlatforms });
    }, [searchFilter.platforms, setSearchFilter]);

    const clearFilters = useCallback(() => {
        setSearchFilter({
            keyword: '',
            languages: [],
            customTags: [],
            platforms: [],
            hasNotes: null,
            hasAlias: null,
            hasReleases: null,
        });
    }, [setSearchFilter]);

    return {
        searchFilter,
        handleKeywordChange,
        handleLanguageToggle,
        handleTagToggle,
        handlePlatformToggle,
        clearFilters,
    };
};
