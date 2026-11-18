import React, { useEffect, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { TagManager } from '../components/TagManager';
import { useT } from '../hooks/useT';
import { useBackShortcut } from '../hooks/useBackShortcut';
import { PageHeader } from '../components/ui/PageHeader';

export const TagsPage: React.FC = () => {
    const { t } = useT();
    const loadRepositories = useStore((state) => state.loadRepositories);
    const setCurrentPage = useStore((state) => state.setCurrentPage);

    const handleBack = useCallback(() => {
        setCurrentPage('home');
    }, [setCurrentPage]);

    useEffect(() => {
        if (useStore.getState().repositories.length === 0) {
            loadRepositories();
        }
    }, [loadRepositories]);

    useBackShortcut({
        onBack: handleBack,
        deps: [handleBack],
    });

    return (
        <div className="flex flex-col h-full">
            <PageHeader title={t('manageTags')} backLabel={t('back')} onBack={handleBack} />

            <div className="flex-1 overflow-y-auto p-4">
                <TagManager mode="manage" />
            </div>
        </div>
    );
};
