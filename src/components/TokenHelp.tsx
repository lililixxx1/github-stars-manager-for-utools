import React, { useState } from 'react';
import { HelpCircle, ExternalLink, CheckSquare, Square, ChevronUp } from 'lucide-react';
import { t } from '../locales';

interface TokenHelpProps {
    lang: 'zh' | 'en';
    expanded: boolean;
    onToggle: () => void;
}

type HelpTab = 'howToGet' | 'permissions' | 'security';

export const TokenHelp: React.FC<TokenHelpProps> = ({ lang, expanded, onToggle }) => {
    const [activeTab, setActiveTab] = useState<HelpTab>('howToGet');

    const openGithubTokenSettings = () => {
        window.githubStarsAPI.openExternal('https://github.com/settings/personal-access-tokens/new');
    };

    return (
        <>
            {/* 展开面板 - 保留 Tab 切换 */}
            {expanded && (
                <div className="token-help-panel card">
                    {/* Tab 切换 */}
                    <div className="token-help-tabs">
                        <button className={activeTab === 'howToGet' ? 'active' : ''} onClick={() => setActiveTab('howToGet')}>
                            {t('tokenHelpHowToGet', lang)}
                        </button>
                        <button className={activeTab === 'permissions' ? 'active' : ''} onClick={() => setActiveTab('permissions')}>
                            {t('tokenHelpPermissions', lang)}
                        </button>
                        <button className={activeTab === 'security' ? 'active' : ''} onClick={() => setActiveTab('security')}>
                            {t('tokenHelpSecurity', lang)}
                        </button>
                    </div>

                    {/* 内容区域 */}
                    <div className="token-help-content">
                        {/* howToGet 内容 */}
                        {activeTab === 'howToGet' && (
                            <div className="help-steps">
                                <ol>
                                    <li>{t('tokenHelpStep1', lang)}</li>
                                    <li>{t('tokenHelpStep2', lang)}</li>
                                    <li>{t('tokenHelpStep3', lang)}</li>
                                    <li>{t('tokenHelpStep4', lang)}</li>
                                </ol>
                                <button className="btn btn-primary btn-sm" onClick={openGithubTokenSettings}>
                                    <ExternalLink size={14} />
                                    {t('tokenHelpOpenGithub', lang)}
                                </button>
                            </div>
                        )}
                        {/* permissions 内容 */}
                        {activeTab === 'permissions' && (
                            <div className="help-permissions">
                                {/* Fine-grained Token 权限（推荐） */}
                                <div className="permission-section">
                                    <h4 className="permission-section-title">{t('tokenFineGrainedTitle', lang)}</h4>
                                    <p className="permission-section-desc">{t('tokenFineGrainedDesc', lang)}</p>
                                    <div className="permission-item required">
                                        <CheckSquare size={14} className="check" />
                                        <span>{t('tokenFineGrainedStarring', lang)}</span>
                                        <span className="badge required">{lang === 'zh' ? '必需' : 'Required'}</span>
                                    </div>
                                    <div className="permission-item required">
                                        <CheckSquare size={14} className="check" />
                                        <span>{t('tokenFineGrainedContents', lang)}</span>
                                        <span className="badge required">{lang === 'zh' ? '必需' : 'Required'}</span>
                                    </div>
                                </div>

                                {/* Classic Token 权限（兼容） */}
                                <div className="permission-section">
                                    <h4 className="permission-section-title">{t('tokenClassicTitle', lang)}</h4>
                                    <p className="permission-section-desc">{t('tokenClassicDesc', lang)}</p>
                                    <div className="permission-item required">
                                        <CheckSquare size={14} className="check" />
                                        <span>{t('tokenPermissionPublicRepo', lang)}</span>
                                        <span className="badge required">{lang === 'zh' ? '必需' : 'Required'}</span>
                                    </div>
                                    <div className="permission-item optional">
                                        <Square size={14} className="check" />
                                        <span>{t('tokenPermissionRepo', lang)}</span>
                                        <span className="badge optional">{lang === 'zh' ? '可选' : 'Optional'}</span>
                                    </div>
                                </div>

                                <p className="permission-note">💡 {t('tokenHelpPermissionNote', lang)}</p>
                            </div>
                        )}
                        {/* security 内容 */}
                        {activeTab === 'security' && (
                            <div className="help-security">
                                <p>🔐 {t('tokenHelpSecurityNote', lang)}</p>
                                <p className="warning">⚠️ {t('tokenHelpSecurityWarning', lang)}</p>
                                <p className="info">ℹ️ {t('tokenHelpSecurityExpiration', lang)}</p>
                                <p className="info">ℹ️ {t('tokenHelpSecurityOrgPolicy', lang)}</p>
                                <p className="info">ℹ️ {t('tokenFineGrainedLimit', lang)}</p>
                            </div>
                        )}
                    </div>

                    {/* 收起按钮 */}
                    <button className="btn btn-ghost btn-sm collapse-btn" onClick={onToggle}>
                        <ChevronUp size={14} />
                        {t('tokenHelpCollapse', lang)}
                    </button>
                </div>
            )}
        </>
    );
};

// 标题旁的按钮组件
export const TokenHelpHeaderButton: React.FC<{
    lang: 'zh' | 'en';
    expanded: boolean;
    onToggle: () => void;
}> = ({ lang, expanded, onToggle }) => {
    return (
        <button
            className="btn btn-ghost btn-sm token-header-btn"
            onClick={onToggle}
        >
            <HelpCircle size={14} />
            {expanded ? t('tokenHelpCollapse', lang) : (lang === 'zh' ? '如何获取?' : 'How to get?')}
        </button>
    );
};
