import React, { useEffect, useCallback, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { TagManager, type TagManagerHandle } from '../components/TagManager';
import { useT } from '../hooks/useT';
import { useBackShortcut } from '../hooks/useBackShortcut';
import { PageHeader } from '../components/ui/PageHeader';

export const TagsPage: React.FC = () => {
    const { t } = useT();
    const loadRepositories = useStore((state) => state.loadRepositories);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const tagManagerRef = useRef<TagManagerHandle | null>(null);

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
        beforeBack: () => {
            if (tagManagerRef.current?.hasOpenOverlay()) {
                tagManagerRef.current.closeTopOverlay();
                return true;
            }
            return false;
        },
        deps: [handleBack],
    });

    return (
        <div className="flex flex-col h-full">
            <PageHeader
                title={t('manageTags')}
                backLabel={t('back')}
                onBack={handleBack}
                right={
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => tagManagerRef.current?.openCreateModal()}
                    >
                        <Plus size={14} />
                        {t('addTag')}
                    </button>
                }
            />

            <div className="flex-1 overflow-y-auto p-4">
                <TagManager ref={tagManagerRef} mode="manage" />
            </div>
        </div>
    );
};
