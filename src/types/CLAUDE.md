# 类型定义模块

[根目录](../../CLAUDE.md) > [src](../) > **types**

## 概述

所有 TypeScript 接口定义集中在 `src/types/index.ts`，导出供其他模块使用。

## 核心类型

### Repository

```typescript
interface Repository {
  id: number; name: string; fullName: string;
  owner: { login: string; avatarUrl: string };
  description: string | null; homepage: string; htmlUrl: string;
  language: string | null; topics: string[];
  stargazersCount: number; forksCount: number;
  createdAt: string; updatedAt: string; pushedAt: string;
  starredAt?: string;

  // AI 生成字段
  aiSummary?: string; aiTags?: string[]; aiPlatforms?: string[];
  analyzedAt?: string; analysisFailed?: boolean;

  // 用户自定义字段 (v1.1.0)
  alias?: string; customTags: string[];
  userNotes?: string; customDescription?: string; customCategory?: string;
  isSubscribed?: boolean;

  // 元数据
  lastSyncedAt: number;
  readmeContent?: string; // 不持久化
}
```

### Tag (v1.1.0)

```typescript
interface Tag {
  id: string;           // 格式: tag-${timestamp}
  name: string; color?: string; icon?: string;
  order: number; createdAt: number; updatedAt: number;
}
```

### RepositoryNote (v1.1.0)

```typescript
interface RepositoryNote {
  id: string; repoId: number; content: string;
  createdAt: number; updatedAt: number;
}
```

### Release (v1.4.0)

```typescript
interface Release {
  id: number; tagName: string; name: string; body: string;
  htmlUrl: string; publishedAt: string; isRead?: boolean;
  assets: ReleaseAsset[];
  repository: { id: number; fullName: string; name: string };
  // GitHub API 原始字段名兼容
  tag_name?: string; published_at?: string; html_url?: string;
}
```

### Settings

```typescript
interface Settings {
  githubToken: string; syncInterval: number; lastSyncTime: number;
  aiModel: string; aiCustomPrompt?: string; useCustomPrompt?: boolean;
  aiConcurrency?: number;
  theme: 'light' | 'dark' | 'auto';
  defaultView: ViewMode; itemsPerPage: number; language: 'zh' | 'en';
  defaultSortBy: SortBy; defaultSortOrder: SortOrder;
  autoAnalyzeOnOpen?: boolean; autoCheckReleaseUpdates?: boolean;
}
```

### SearchFilter

```typescript
interface SearchFilter {
  keyword: string;
  languages: string[]; topics: string[]; aiTags: string[];
  customTags: string[]; platforms: string[];
  hasReleases: boolean | null; hasNotes: boolean | null; hasAlias: boolean | null;
  sortBy: SortBy; sortOrder: SortOrder;
}
```

## 辅助类型

```typescript
type SortBy = 'stars' | 'updated' | 'name' | 'starredAt'
type SortOrder = 'asc' | 'desc'
type ViewMode = 'card' | 'list'
type PageName = 'home' | 'detail' | 'settings' | 'tags' | 'releases'
```

## 状态类型

```typescript
interface AnalyzeProgress { current: number; total: number; currentRepo: string }
interface AnalyzeStats { lastAnalyzeAt: string | null; totalAnalyzed: number; successCount: number; failCount: number }
interface ReleaseCheckStatus { lastCheckedAt: string | null; checking: boolean; newCount: number; error: string | null }
interface ReleaseFilter { showUnreadOnly: boolean; platform: string | null }
interface SyncState { latestStarredAt: string | null; latestRepoIds: number[]; lastSyncAt: number | null; lastFullSyncAt: number | null }
interface Category { id: string; name: string; icon: string; keywords: string[]; isCustom?: boolean }
```

## Window API 类型

`window.githubStarsAPI` 的 TypeScript 接口 `GithubStarsAPI` 定义了所有 preload.js 暴露的方法，包括:
- GitHub API: verifyToken, getStarredRepos, getReadme, getRepoReleases, getLatestRelease, checkRateLimit
- 存储操作: get/set Settings, Token, Repos, SyncState, Releases, Tags, Notes 等
- 分片存储: getReposMeta, setReposMeta, getReposShard, setReposShard 等
- 系统操作: openExternal, showNotification
- AI 分析: analyzeRepo, getAIModels

## 变更记录

|日期|变更|
|--|--|
|2026-05-02|重新扫描：补充 SyncState、Category、ReleaseAsset 类型，更新 SortBy 移除 created/alias|
|2026-03-07|添加相对路径面包屑导航|
