import { useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { useProgressStore } from '../stores/useProgressStore';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { ReleaseUpdatesView } from '../components/ReleaseUpdatesView';
import { t } from '../locales';
import type { Language } from '../locales';
import { useBackShortcut } from '../hooks/useBackShortcut';

export function ReleasesPage() {
    const settings = useStore((state) => state.settings);
    const setCurrentPage = useStore((state) => state.setCurrentPage);
    const setSelectedRepoId = useStore((state) => state.setSelectedRepoId);
    const setDetailInitialTab = useStore((state) => state.setDetailInitialTab);
    const setSearchFilter = useStore((state) => state.setSearchFilter);
    const releaseCheckStatus = useProgressStore((state) => state.releaseCheckStatus);

    const lang = (settings.language || 'zh') as Language;

    const handleBack = useCallback(() => {
        setCurrentPage('home');
    }, [setCurrentPage]);

    useBackShortcut({
        onBack: handleBack,
        deps: [handleBack],
    });

    return (
        <div className="flex flex-col h-full">
            <PageHeader
                title={t('releases', lang)}
                backLabel={t('back', lang)}
                onBack={handleBack}
                right={
                    releaseCheckStatus.newCount > 0 ? (
                        <Badge variant="default">
                            {releaseCheckStatus.newCount} {t('newReleases', lang)}
                        </Badge>
                    ) : undefined
                }
            />

            <div className="flex-1 overflow-y-auto p-5">
                <ReleaseUpdatesView
                    onOpenRepo={(repoId, tab) => {
                        setDetailInitialTab(tab);
                        setSelectedRepoId(repoId);
                        setCurrentPage('detail');
                    }}
                    onNavigateAll={() => {
                        setSearchFilter({ smartView: 'all' });
                        setCurrentPage('home');
                    }}
                />
            </div>
        </div>
    );
}
