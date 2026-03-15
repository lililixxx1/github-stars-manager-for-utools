export const i18n = {
    zh: {
        // 通用
        search: '搜索仓库...',
        loading: '加载中...',
        error: '出错了',
        success: '成功',
        cancel: '取消',
        confirm: '确认',
        save: '保存',
        delete: '删除',
        edit: '编辑',
        back: '返回',
        repositories: '仓库',
        releases: '版本追踪',
        settings: '设置',
        stars: '星标',
        forks: '分支',
        language: '语言',
        lastUpdated: '最后更新',
        noDescription: '暂无描述',
        allCategories: '全部',

        // 同步相关
        syncNow: '立即同步',
        syncing: '同步中...',
        syncComplete: '同步完成',
        syncError: '同步失败',
        syncInterval: '同步间隔（小时）',
        firstUseHint: '首次使用请先配置 GitHub Token',
        configureToken: '配置 Token',

        // Token 相关
        githubToken: 'GitHub Token',
        tokenPlaceholder: '请输入 GitHub Personal Access Token',
        tokenRequired: '请输入 GitHub Token',
        tokenVerified: 'Token 验证成功',
        tokenInvalid: 'Token 无效',
        verifyToken: '验证 Token',

        // 主题
        theme: '主题',
        lightTheme: '浅色',
        darkTheme: '深色',
        autoTheme: '跟随系统',

        // 列表相关
        totalRepos: '共 {count} 个仓库',
        noRepos: '暂无仓库数据，请先同步',
        noResults: '没有找到匹配的仓库',
        itemsPerPage: '每页显示数量',

        // 仓库操作
        openInGithub: '在 GitHub 中打开',
        aiAnalyze: 'AI 分析',
        aiAnalyzing: 'AI 分析中...',
        aiAnalyzed: '已分析',
        aiNotAnalyzed: '未分析',
        subscribe: '订阅 Release',
        unsubscribe: '取消订阅',
        exportData: '导出数据',
        importData: '导入数据',

        // 排序相关
        sortByStars: '按 Star 排序',
        sortByUpdated: '按更新时间排序',
        sortByName: '按名称排序',
        sortByCreated: '按创建时间排序',
        sortByStarredAt: '按收藏时间排序',
        sortByAlias: '按别名排序',
        sortAsc: '升序',
        sortDesc: '降序',

        // 别名相关 🆕 v1.1.0
        alias: '别名',
        setAlias: '设置别名',
        editAlias: '编辑别名',
        aliasPlaceholder: '输入方便记忆的名称',
        aliasHint: '为仓库设置一个容易记住的别名',
        hasAlias: '有别名',
        noAlias: '无别名',

        // 笔记相关 🆕 v1.1.0
        notes: '笔记',
        addNote: '添加笔记',
        editNote: '编辑笔记',
        deleteNote: '删除笔记',
        notePlaceholder: '记录你的想法、使用心得、关键信息...',
        noteHint: '支持 Markdown 格式',
        hasNotes: '有笔记',
        noNotes: '无笔记',
        noNotesYet: '暂无笔记',
        addFirstNote: '添加第一条笔记',
        noteUpdatedAt: '更新于 {date}',

        // 标签相关 🆕 v1.1.0
        tags: '标签',
        manageTags: '管理标签',
        addTag: '添加标签',
        editTag: '编辑标签',
        deleteTag: '删除标签',
        tagName: '标签名称',
        tagColor: '标签颜色',
        tagIcon: '标签图标',
        tagPlaceholder: '输入标签名称',
        deleteTagConfirm: '确定删除标签 "{name}" 吗？删除后将从所有仓库中移除该标签。',
        noTags: '暂无标签，点击添加',
        noTagsYet: '暂无标签',
        addFirstTag: '添加第一个标签',
        tagCount: '{count} 个仓库',
        dragToSort: '拖拽标签可调整顺序',

        // 视图相关 🆕 v1.1.0
        viewMode: '视图模式',
        cardView: '卡片视图',
        listView: '列表视图',

        // 筛选相关 🆕 v1.1.0
        filter: '筛选',
        hasNotesFilter: '有笔记',
        hasAliasFilter: '有别名',
        clearFilter: '清除筛选',

        // AI 分析相关 🆕 v1.3.0
        aiAnalysisSettings: 'AI 分析设置',
        autoAnalyzeOnOpen: '启动时自动分析',
        autoAnalyzeOnOpenHint: '打开插件时自动分析未分析的仓库，每次分析消耗AI能量',
        concurrency: '并发数',
        concurrencyHint: '并发数越高分析越快，但可能触发限流',
        analyzeNow: '立即分析',
        stopAnalysis: '停止分析',
        analyzingProgress: '正在分析',
        analyzedCount: '已分析: {count} / {total} 个仓库',
        platformFilter: '平台筛选',
        platformUnanalyzed: '未分析',

        // 版本追踪 🆕 v1.4.0
        viewReleases: '查看版本',
        noTagsHint: '暂无标签，',
        createTag: '创建标签',
        newReleases: '个新版本',
        noReleases: '暂无版本更新',
        markAsRead: '标记已读',
        markAllRead: '全部已读',
        showUnreadOnly: '只看未读',
        noUnreadReleases: '没有未读版本',
        checkUpdates: '检查更新',
        checkingUpdates: '检查中...',
        lastChecked: '最后检查',
        allPlatforms: '全部平台',
        downloadAsset: '下载',
        viewOnGithub: '在 GitHub 查看',
        publishedAt: '发布于',
        releaseNotes: '更新内容',
        assets: '下载资产',
        noAssets: '无资产文件',
        releaseSubscription: '版本订阅',
        autoCheckUpdates: '启动时自动检测更新',
        checkInterval: '检测间隔',
        subscribedRepos: '订阅仓库',
        manageSubscriptions: '管理订阅',
        clearSubscriptions: '清空订阅',
        noSubscriptions: '暂无订阅的仓库',
        subscribedCount: '已订阅 {count} 个仓库',

        // 订阅管理 🆕 v1.5.0
        subscriptionManage: '订阅管理',
        versionUpdates: '版本更新',
        unsubscribeAll: '全部取消订阅',
        unsubscribeConfirm: '确定取消全部订阅？',
        unsubscribeConfirmDesc: '将取消 {count} 个仓库的版本订阅，此操作不可撤销。',
        unsubscribed: '已取消订阅',
        subscriptionRestored: '已恢复订阅',
        undo: '撤销',
        noSubscriptionsHint: '在仓库详情页点击"订阅 Release"即可追踪版本更新',
        browseRepos: '浏览仓库',
        goToHomePage: '返回首页',

        // AI 分析确认 🆕 v1.6.0
        analyzeConfirmTitle: '开始 AI 分析？',
        analyzeConfirmMessage: '有 {count} 个仓库需要 AI 分析，这可能需要一些时间。是否开始？',
        startAnalyze: '开始分析',

        // 翻译功能 🆕 v1.6.0
        translate: '翻译',
        translating: '翻译中...',
        translated: '已翻译',
        original: '原文',
        viewOriginal: '查看原文',
        viewTranslation: '查看翻译',
        retry: '重试',

        // 详情页 v1.6.1
        description: '描述',
        analysis: '分析',
        analyzedAt: '分析于',
        homepage: '主页',
        deleteNoteConfirm: '确定删除此笔记吗？',
        analysisFailed: '分析失败，请重试',
        clickToAnalyze: '点击上方按钮进行 AI 分析',

        // Token 帮助说明
        tokenHelpHowToGet: '如何获取',
        tokenHelpPermissions: '所需权限',
        tokenHelpSecurity: '安全说明',
        tokenHelpStep1: '1. 访问 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens',
        tokenHelpStep2: '2. 点击 "Generate new token"',
        tokenHelpStep3: '3. 设置 Token 名称（如：uTools GitHub Stars）',
        tokenHelpStep4: '4. 设置 Repository access，并在 Permissions 中按照下方说明勾选权限，最后点击 "Generate token"',
        tokenHelpOpenGithub: '打开 GitHub Token 设置页面',
        tokenHelpMinPermission: '最小权限：Starring (Read-only)',
        tokenHelpFullPermission: '完整权限：Contents + Releases (Read-only)',
        tokenHelpPermissionNote: '仅需 Stars 读取权限即可使用基本功能',
        tokenHelpSecurityNote: 'Token 将加密存储在本地，请勿分享给他人',
        tokenHelpSecurityWarning: '如 Token 泄露，请立即在 GitHub 中撤销',
        tokenPermissionPublicRepo: 'public_repo - 读取公开仓库信息',
        tokenPermissionRepo: 'repo - 完整仓库访问权限（含私有）',
        tokenPermissionReadUser: 'read:user - 读取用户基本信息',
        tokenFineGrainedTitle: 'Fine-grained Token（推荐）',
        tokenFineGrainedDesc: 'GitHub 推荐的新标准，提供更精细的权限控制',
        tokenFineGrainedStarring: 'Account permissions ➔ Starring (Read-only) - 读取星标列表',
        tokenFineGrainedContents: 'Repository permissions ➔ Contents (Read-only) - 读取仓库内容（含 README、Release）',
        tokenFineGrainedLimit: 'Fine-grained Token 最多可创建 50 个',
        tokenClassicTitle: 'Classic Token（兼容）',
        tokenClassicDesc: '传统 Token 类型，权限模型较粗粒度，GitHub 已不再推荐',
        tokenHelpSecurityExpiration: 'Classic Token 一年未使用将被自动移除',
        tokenHelpSecurityOrgPolicy: '部分组织可能禁止使用 Classic Token',
        tokenHelpCollapse: '收起',

        // 错误信息 🆕 v1.7.0
        errorFetchReposFailed: '获取仓库失败',
        errorNetwork: '网络错误，请检查网络连接',
        errorTokenInvalid: 'Token 无效或已过期',
        errorRateLimited: 'API 请求频率超限，请稍后重试',

        // 空状态提示 🆕 v1.7.0
        emptyNoRepos: '暂无仓库数据',
        emptyNoSearchResult: '未找到匹配的仓库',
        emptyNoTags: '暂无标签',
        emptyNoNotes: '暂无笔记',

        // 其他
        about: '关于',
        version: '版本',
    },
    en: {
        // Common
        search: 'Search repositories...',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        cancel: 'Cancel',
        confirm: 'Confirm',
        save: 'Save',
        delete: 'Delete',
        edit: 'Edit',
        back: 'Back',
        repositories: 'Repositories',
        releases: 'Releases',
        settings: 'Settings',
        stars: 'Stars',
        forks: 'Forks',
        language: 'Language',
        lastUpdated: 'Last Updated',
        noDescription: 'No description',
        allCategories: 'All',

        // Sync
        syncNow: 'Sync Now',
        syncing: 'Syncing...',
        syncComplete: 'Sync Complete',
        syncError: 'Sync Failed',
        syncInterval: 'Sync Interval (hours)',
        firstUseHint: 'Please configure GitHub Token first',
        configureToken: 'Configure Token',

        // Token
        githubToken: 'GitHub Token',
        tokenPlaceholder: 'Enter GitHub Personal Access Token',
        tokenRequired: 'Please enter GitHub Token',
        tokenVerified: 'Token verified',
        tokenInvalid: 'Invalid Token',
        verifyToken: 'Verify Token',

        // Theme
        theme: 'Theme',
        lightTheme: 'Light',
        darkTheme: 'Dark',
        autoTheme: 'Auto',

        // List
        totalRepos: '{count} repositories',
        noRepos: 'No repositories yet, please sync first',
        noResults: 'No matching repositories found',
        itemsPerPage: 'Items per Page',

        // Repository Actions
        openInGithub: 'Open in GitHub',
        aiAnalyze: 'AI Analyze',
        aiAnalyzing: 'AI Analyzing...',
        aiAnalyzed: 'Analyzed',
        aiNotAnalyzed: 'Not Analyzed',
        subscribe: 'Subscribe Release',
        unsubscribe: 'Unsubscribe',
        exportData: 'Export Data',
        importData: 'Import Data',

        // Sort
        sortByStars: 'Sort by Stars',
        sortByUpdated: 'Sort by Updated',
        sortByName: 'Sort by Name',
        sortByCreated: 'Sort by Created',
        sortByStarredAt: 'Sort by Starred Time',
        sortByAlias: 'Sort by Alias',
        sortAsc: 'Ascending',
        sortDesc: 'Descending',

        // Alias 🆕 v1.1.0
        alias: 'Alias',
        setAlias: 'Set Alias',
        editAlias: 'Edit Alias',
        aliasPlaceholder: 'Enter a memorable name',
        aliasHint: 'Set an easy-to-remember alias for this repository',
        hasAlias: 'Has Alias',
        noAlias: 'No Alias',

        // Notes 🆕 v1.1.0
        notes: 'Notes',
        addNote: 'Add Note',
        editNote: 'Edit Note',
        deleteNote: 'Delete Note',
        notePlaceholder: 'Record your thoughts, tips, key information...',
        noteHint: 'Markdown supported',
        hasNotes: 'Has Notes',
        noNotes: 'No Notes',
        noNotesYet: 'No notes yet',
        addFirstNote: 'Add first note',
        noteUpdatedAt: 'Updated {date}',

        // Tags 🆕 v1.1.0
        tags: 'Tags',
        manageTags: 'Manage Tags',
        addTag: 'Add Tag',
        editTag: 'Edit Tag',
        deleteTag: 'Delete Tag',
        tagName: 'Tag Name',
        tagColor: 'Tag Color',
        tagIcon: 'Tag Icon',
        tagPlaceholder: 'Enter tag name',
        deleteTagConfirm: 'Delete tag "{name}"? It will be removed from all repositories.',
        noTags: 'No tags yet, click to add',
        noTagsYet: 'No tags yet',
        addFirstTag: 'Add first tag',
        tagCount: '{count} repos',
        dragToSort: 'Drag tags to reorder',

        // View 🆕 v1.1.0
        viewMode: 'View Mode',
        cardView: 'Card View',
        listView: 'List View',

        // Filter 🆕 v1.1.0
        filter: 'Filter',
        hasNotesFilter: 'Has Notes',
        hasAliasFilter: 'Has Alias',
        clearFilter: 'Clear Filter',

        // AI Analysis 🆕 v1.3.0
        aiAnalysisSettings: 'AI Analysis Settings',
        autoAnalyzeOnOpen: 'Auto-analyze on startup',
        autoAnalyzeOnOpenHint: 'Analyze unanalyzed repos when plugin opens',
        concurrency: 'Concurrency',
        concurrencyHint: 'Higher concurrency is faster but may trigger rate limits',
        analyzeNow: 'Analyze Now',
        stopAnalysis: 'Stop Analysis',
        analyzingProgress: 'Analyzing',
        analyzedCount: 'Analyzed: {count} / {total} repos',
        platformFilter: 'Platform Filter',
        platformUnanalyzed: 'Unanalyzed',

        // Release Tracking 🆕 v1.4.0
        viewReleases: 'View Releases',
        noTagsHint: 'No tags, ',
        createTag: 'Create Tag',
        newReleases: 'new releases',
        noReleases: 'No releases yet',
        markAsRead: 'Mark as read',
        markAllRead: 'Mark all read',
        showUnreadOnly: 'Unread only',
        noUnreadReleases: 'No unread releases',
        checkUpdates: 'Check for updates',
        checkingUpdates: 'Checking...',
        lastChecked: 'Last checked',
        allPlatforms: 'All platforms',
        downloadAsset: 'Download',
        viewOnGithub: 'View on GitHub',
        publishedAt: 'Published',
        releaseNotes: 'Release Notes',
        assets: 'Assets',
        noAssets: 'No assets',
        releaseSubscription: 'Release Subscription',
        autoCheckUpdates: 'Auto-check updates on startup',
        checkInterval: 'Check interval',
        subscribedRepos: 'Subscribed repos',
        manageSubscriptions: 'Manage subscriptions',
        clearSubscriptions: 'Clear subscriptions',
        noSubscriptions: 'No subscribed repositories',
        subscribedCount: '{count} repos subscribed',

        // Subscription Management 🆕 v1.5.0
        subscriptionManage: 'Subscriptions',
        versionUpdates: 'Updates',
        unsubscribeAll: 'Unsubscribe all',
        unsubscribeConfirm: 'Unsubscribe all repositories?',
        unsubscribeConfirmDesc: 'This will unsubscribe {count} repos. This action cannot be undone.',
        unsubscribed: 'Unsubscribed',
        subscriptionRestored: 'Subscription restored',
        undo: 'Undo',
        noSubscriptionsHint: 'Click "Subscribe Release" on repo detail page to track updates',
        browseRepos: 'Browse repos',
        goToHomePage: 'Go to Home',

        // AI Analysis Confirm 🆕 v1.6.0
        analyzeConfirmTitle: 'Start AI Analysis?',
        analyzeConfirmMessage: '{count} repos need AI analysis. This may take a while. Continue?',
        startAnalyze: 'Start Analysis',

        // Translation 🆕 v1.6.0
        translate: 'Translate',
        translating: 'Translating...',
        translated: 'Translated',
        original: 'Original',
        viewOriginal: 'View Original',
        viewTranslation: 'View Translation',
        retry: 'Retry',

        // Detail Page v1.6.1
        description: 'Description',
        analysis: 'Analysis',
        analyzedAt: 'Analyzed',
        homepage: 'Homepage',
        deleteNoteConfirm: 'Delete this note?',
        analysisFailed: 'Analysis failed, please retry',
        clickToAnalyze: 'Click the button above to analyze with AI',

        // Token Help
        tokenHelpHowToGet: 'How to get',
        tokenHelpPermissions: 'Permissions',
        tokenHelpSecurity: 'Security',
        tokenHelpStep1: '1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens',
        tokenHelpStep2: '2. Click "Generate new token"',
        tokenHelpStep3: '3. Set token name (e.g., uTools GitHub Stars)',
        tokenHelpStep4: '4. Set Repository access and configure Permissions as below, then click "Generate token"',
        tokenHelpOpenGithub: 'Open GitHub Token Settings',
        tokenHelpMinPermission: 'Minimum: Starring (Read-only)',
        tokenHelpFullPermission: 'Full: Contents + Releases (Read-only)',
        tokenHelpPermissionNote: 'Starring read-only permission is sufficient for basic features',
        tokenHelpSecurityNote: 'Token is encrypted and stored locally, never share it',
        tokenHelpSecurityWarning: 'Revoke immediately if token is leaked',
        tokenPermissionPublicRepo: 'public_repo - Read public repository info',
        tokenPermissionRepo: 'repo - Full repository access (includes private)',
        tokenPermissionReadUser: 'read:user - Read basic user info',
        tokenFineGrainedTitle: 'Fine-grained Token (Recommended)',
        tokenFineGrainedDesc: 'GitHub recommended new standard with finer permission control',
        tokenFineGrainedStarring: 'Account permissions ➔ Starring (Read-only) - Read starred list',
        tokenFineGrainedContents: 'Repository permissions ➔ Contents (Read-only) - Read repository contents (including README, Releases)',
        tokenFineGrainedLimit: 'Maximum 50 fine-grained tokens per user',
        tokenClassicTitle: 'Classic Token (Legacy)',
        tokenClassicDesc: 'Legacy token type with coarse-grained permissions, no longer recommended by GitHub',
        tokenHelpSecurityExpiration: 'Classic tokens are automatically revoked after 1 year of inactivity',
        tokenHelpSecurityOrgPolicy: 'Some organizations may prohibit classic tokens',
        tokenHelpCollapse: 'Collapse',

        // Errors 🆕 v1.7.0
        errorFetchReposFailed: 'Failed to fetch repositories',
        errorNetwork: 'Network error, please check your connection',
        errorTokenInvalid: 'Token is invalid or expired',
        errorRateLimited: 'API rate limit exceeded, please try again later',

        // Empty States 🆕 v1.7.0
        emptyNoRepos: 'No repositories',
        emptyNoSearchResult: 'No matching repositories found',
        emptyNoTags: 'No tags',
        emptyNoNotes: 'No notes',

        // Other
        about: 'About',
        version: 'Version',
    },
} as const;

export type Language = 'zh' | 'en';
export type TranslationKey = keyof typeof i18n.zh;

export function t(key: TranslationKey, lang: Language = 'zh', params?: Record<string, string | number>): string {
    let text: string = i18n[lang][key] || i18n.zh[key] || key;
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            text = text.replace(`{${k}}`, String(v));
        });
    }
    return text;
}
