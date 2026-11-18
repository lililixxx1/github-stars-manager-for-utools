import React from 'react';

interface SectionCardProps {
    title?: React.ReactNode;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    compact?: boolean;
}

export const SectionCard: React.FC<SectionCardProps> = ({
    title,
    icon,
    action,
    children,
    className = '',
    compact = false,
}) => (
    <section className={`card ${compact ? 'card-compact ' : ''}${className}`.trim()}>
        {(title || action) && (
            <div className="section-card-header">
                {title && (
                    <h3 className="section-card-title">
                        {icon}
                        <span>{title}</span>
                    </h3>
                )}
                {action}
            </div>
        )}
        {children}
    </section>
);
