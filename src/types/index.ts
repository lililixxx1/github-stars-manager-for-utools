// ==================== 排序类型 ====================

/**
 * 排序字段
 * @note 'created' 和 'alias' 已在 v1.5.0 移除
 * @since v1.0.0
 */
export type SortBy = 'stars' | 'updated' | 'name' | 'starredAt';

/**
 * 排序方向
 * @since v1.0.0
 */
export type SortOrder = 'asc' | 'desc';

// ==================== 视图模式 ====================
export type ViewMode = 'card' | 'list';

// ==================== 仓库信息 ====================
export interface Repository {
    id: number;
    name: string;
    fullName: string;
    owner: {
        login: string;
        avatarUrl: string;
    };
    description: string | null;
    homepage: string;
    htmlUrl: string;
    language: string | null;
    topics: string[];
    stargazersCount: number;
    forksCount: number;
    createdAt: string;                   // ISO 8601
    updatedAt: string;                   // ISO 8601
    pushedAt: string;                    // ISO 8601
    starredAt?: string;                  // ISO 8601 - 加入星标的时间

    // AI 生成字段
    aiSummary?: string;
    aiTags?: string[];
    aiPlatforms?: string[];
    analyzedAt?: string;                 // ISO 8601
    analysisFailed?: boolean;

    // 用户自定义字段 (v1.1.0)
    alias?: string;                      // 用户设置的别名
    customTags: string[];                // 用户自定义标签ID列表 (v1.1.0 必填，默认[])
    userNotes?: string;                  // 用户备注 (兼容旧字段)
    customDescription?: string;
    customCategory?: string;
    isSubscribed?: boolean;

    // 元数据
    lastSyncedAt: number;                // 时间戳
    readmeContent?: string;              // README 内容 (用于 AI 分析，不持久化)
}

// ==================== 标签分组 🆕 v1.1.0 ====================
export interface Tag {
    id: string;                          // 标签唯一ID，格式: tag-${timestamp}
    name: string;                        // 标签名称
    color?: string;                      // 标签颜色 (HEX，如 #3b82f6)
    icon?: string;                       // 标签图标 (emoji 或 lucide 图标名)
    order: number;                       // 排序顺序 (0-based)
    createdAt: number;                   // 创建时间戳
    updatedAt: number;                   // 更新时间戳
}

// ==================== 笔记 (独立存储) 🆕 v1.1.0 ====================
export interface RepositoryNote {
    id: string;                          // 笔记ID，格式: note-${repoId}
    repoId: number;                      // 关联的仓库ID
    content: string;                     // 笔记内容 (Markdown)
    createdAt: number;                   // 创建时间戳
    updatedAt: number;                   // 更新时间戳
}

// ==================== 版本信息 ====================
export interface Release {
    id: number;
    tagName: string;
    name: string;
    body: string;
    htmlUrl: string;
    publishedAt: string;
    isRead?: boolean;
    assets: ReleaseAsset[];
    repository: {
        id: number;
        fullName: string;
        name: string;
    };
    // GitHub API 原始字段名兼容（用于 API 响应）
    tag_name?: string;
    published_at?: string;
    html_url?: string;
}

export interface ReleaseAsset {
    id: number;
    name: string;
    size: number;
    downloadCount: number;
    browserDownloadUrl: string;
    contentType: string;
    createdAt: string;
    updatedAt: string;
}

// ==================== 配置信息 ====================
export interface Settings {
    githubToken: string;
    syncInterval: number;
    lastSyncTime: number;
    aiModel: string;
    aiCustomPrompt?: string;
    useCustomPrompt?: boolean;
    aiConcurrency?: number;
    theme: 'light' | 'dark' | 'auto';
    defaultView: ViewMode;
    itemsPerPage: number;
    language: 'zh' | 'en';
    defaultSortBy: SortBy;               // 默认排序字段 🆕 v1.1.0
    defaultSortOrder: SortOrder;         // 默认排序方向 🆕 v1.1.0
    autoAnalyzeOnOpen?: boolean;         // 🆕 v1.3.0 启动时自动分析
    autoCheckReleaseUpdates?: boolean;   // 🆕 v1.4.0 启动时自动检查版本更新
}

// ==================== 自定义分类 ====================
export interface Category {
    id: string;
    name: string;
    icon: string;
    keywords: string[];
    isCustom?: boolean;
}

// ==================== 搜索过滤 ====================
export interface SearchFilter {
    keyword: string;
    languages: string[];
    topics: string[];
    aiTags: string[];
    customTags: string[];                // 自定义标签筛选
    platforms: string[];                 // 🆕 v1.3.0 平台筛选
    hasReleases: boolean | null;
    hasNotes: boolean | null;            // 是否有笔记 🆕 v1.1.0
    hasAlias: boolean | null;            // 是否有别名 🆕 v1.1.0
    sortBy: SortBy;
    sortOrder: SortOrder;
}

// ==================== 页面导航 ====================
export type PageName = 'home' | 'detail' | 'settings' | 'tags' | 'releases'; // 🆕 v1.4.0 添加 releases

// ==================== 版本检测状态 🆕 v1.4.0 ====================
export interface ReleaseCheckStatus {
    lastCheckedAt: string | null;       // 最后检测时间
    checking: boolean;                   // 是否正在检测
    newCount: number;                    // 新版本数量
    error: string | null;                // 错误信息
}

// ==================== 版本筛选 🆕 v1.4.0 ====================
export interface ReleaseFilter {
    showUnreadOnly: boolean;             // 只显示未读
    platform: string | null;             // 平台过滤
}

// ==================== AI 分析状态 🆕 v1.3.0 ====================
export interface AnalyzeProgress {
    current: number;
    total: number;
    currentRepo: string;
}

export interface AnalyzeStats {
    lastAnalyzeAt: string | null;
    totalAnalyzed: number;
    successCount: number;
    failCount: number;
}

// ==================== Window API 类型 ====================
export interface GithubStarsAPI {
    // ========== GitHub API ==========
    verifyToken: (token: string) => Promise<any>;
    getStarredRepos: (token: string, page?: number, perPage?: number) => Promise<any[]>;
    getReadme: (owner: string, repo: string, token: string) => Promise<string | null>;
    getRepoReleases: (owner: string, repo: string, token: string, page?: number, perPage?: number) => Promise<any[]>;
    checkRateLimit: (token: string) => Promise<any>;

    // ========== 存储操作 (dbStorage) ==========
    getSettings: () => Partial<Settings>;
    setSettings: (settings: Partial<Settings>) => void;
    getToken: () => string | null;
    setToken: (token: string) => void;
    getRepos: () => Repository[];
    setRepos: (repos: Repository[]) => void;
    getStoredReleases: () => Release[];
    setStoredReleases: (releases: Release[]) => void;
    getReadReleaseIds: () => number[];
    setReadReleaseIds: (ids: number[]) => void;
    getReleaseSubscriptions: () => number[];
    setReleaseSubscriptions: (ids: number[]) => void;
    getCategories: () => Category[];
    setCategories: (categories: Category[]) => void;

    // ========== 分片存储 ==========
    getReposMeta: () => { sharded: boolean; totalShards: number } | null;
    setReposMeta: (meta: { sharded: boolean; totalShards: number }) => void;
    getReposShard: (index: number) => string | null;
    setReposShard: (index: number, data: string) => void;
    removeReposShard: (index: number) => void;
    removeReposMeta: () => void;

    // ========== 标签操作 🆕 v1.1.0 ==========
    getTags: () => Tag[];
    setTags: (tags: Tag[]) => void;
    addTag: (tag: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>) => Tag;
    updateTag: (id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>) => Tag | null;
    deleteTag: (id: string) => void;
    reorderTags: (tagIds: string[]) => void;

    // ========== 笔记操作 🆕 v1.1.0 ==========
    getNote: (repoId: number) => RepositoryNote | null;
    setNote: (repoId: number, content: string) => RepositoryNote;
    deleteNote: (repoId: number) => void;
    getAllNotes: () => RepositoryNote[];

    // ========== 系统操作 ==========
    openExternal: (url: string) => void;
    showNotification: (body: string, clickFeatureCode?: string) => void;

    // ========== AI 分析 ==========
    analyzeRepo: (
        readmeContent: string,
        repoInfo: { fullName: string; description: string | null; language: string | null },
        language?: string,
        model?: string
    ) => Promise<{ summary: string; tags: string[]; platforms: string[] } | null>;
    getAIModels: () => Promise<any[]>;

    // ========== 版本检测 🆕 v1.4.0 ==========
    getLatestRelease: (owner: string, repo: string, token: string) => Promise<Release | null>;
    getReleaseCheckStatus: () => ReleaseCheckStatus;
    setReleaseCheckStatus: (status: ReleaseCheckStatus) => void;
}

declare global {
    interface Window {
        githubStarsAPI: GithubStarsAPI;
    }
}
