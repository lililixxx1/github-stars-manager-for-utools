import React from 'react';
import { BackHintChip } from '../BackHintChip';

interface PageHeaderProps {
    title?: React.ReactNode;
    backLabel: string;
    onBack: () => void;
    center?: React.ReactNode;
    right?: React.ReactNode;
    backTabIndex?: number;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    backLabel,
    onBack,
    center,
    right,
    backTabIndex,
}) => (
    <header className="page-header">
        <BackHintChip label={backLabel} onClick={onBack} tabIndex={backTabIndex} />
        {title && <h2 className="page-header-title">{title}</h2>}
        {center}
        <div className="flex-1" />
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </header>
);
