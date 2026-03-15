# 类型定义模块

[根目录](../../CLAUDE.md) > [src](../) > **types**

## 概述

所有 TypeScript 接口定义集中在 `src/types/index.ts`，导出供其他模块使用。

## 核心类型

### Repository

```typescript
interface Repository {
  id: number;
  name: string;
  fullName: string;
  owner: { login: string; avatarUrl: string };
  description: string | null;
  homepage: string;
  htmlUrl: string;
  language: string | null;
  topics: string[];
  stargazersCount: number;
  forksCount: number;
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
  pushedAt: string;       // ISO 8601
  starredAt?: string;     // ISO 8601 - 收藏时间

  // AI 生成字段
  aiSummary?: string;
  aiTags?: string[];
  aiPlatforms?: string[];
  analyzedAt?: string;
  analysisFailed?: boolean;

  // 用户自定义字段 (v1.1.0)
  alias?: string;
  customTags: string[];
  userNotes?: string;
  customDescription?: string;
  customCategory?: string;
  isSubscribed?: boolean;

  // 元数据
  lastSyncedAt: number;   // 时间戳
  readmeContent?: string; // 不持久化
}
```

### Tag (v1.1.0)

```typescript
interface Tag {
  id: string;           // 格式: tag-${timestamp}
  name: string;
  color?: string;       // HEX, 如 #3b82f6
  icon?: string;        // emoji 或 lucide 图标名
  order: number;        // 排序 (0-based)
  createdAt: number;
  updatedAt: number;
}
```

### Release (v1.4.0)

```typescript
interface Release {
  id: number;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  isRead?: boolean;
  assets: ReleaseAsset[];
  repository: { id: number; fullName: string; name: string };
}

interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  browserDownloadUrl: string;
  contentType: string;
  createdAt: string;
  updatedAt: string;
}
```

### Settings

```typescript
interface Settings {
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
  defaultSortBy: SortBy;       // v1.1.0
  defaultSortOrder: SortOrder; // v1.1.0
  autoAnalyzeOnOpen?: boolean; // v1.3.0
  autoCheckReleaseUpdates?: boolean; // v1.4.0
}
```

### SearchFilter

```typescript
interface SearchFilter {
  keyword: string;
  languages: string[];
  topics: string[];
  aiTags: string[];
  customTags: string[];        // v1.1.0
  platforms: string[];         // v1.3.0
  hasReleases: boolean | null;
  hasNotes: boolean | null;    // v1.1.0
  hasAlias: boolean | null;    // v1.1.0
  sortBy: SortBy;
  sortOrder: SortOrder;
}
```

## 辅助类型

```typescript
type SortBy = 'stars' | 'updated' | 'created' | 'name' | 'starredAt' | 'alias'
type SortOrder = 'asc' | 'desc'
type ViewMode = 'card' | 'list'
type PageName = 'home' | 'detail' | 'settings' | 'tags' | 'releases'
```

## 状态类型

```typescript
interface AnalyzeProgress {
  current: number;
  total: number;
  currentRepo: string;
}

interface AnalyzeStats {
  lastAnalyzeAt: string | null;
  totalAnalyzed: number;
  successCount: number;
  failCount: number;
}

interface ReleaseCheckStatus {
  lastCheckedAt: string | null;
  checking: boolean;
  newCount: number;
  error: string | null;
}

interface ReleaseFilter {
  showUnreadOnly: boolean;
  platform: string | null;
}
```

## Window API 类型

`window.githubStarsAPI` 的 TypeScript 接口：

```typescript
interface GithubStarsAPI {
  // GitHub API
  verifyToken(token: string): Promise<any>
  getStarredRepos(token, page?, perPage?): Promise<any[]>
  getReadme(owner, repo, token): Promise<string | null>
  getRepoReleases(owner, repo, token, page?, perPage?): Promise<any[]>
  getLatestRelease(owner, repo, token): Promise<Release | null>  // v1.4.0
  checkRateLimit(token): Promise<any>

  // 存储操作
  getSettings(): Partial<Settings>
  setSettings(settings): void
  getToken(): string | null
  setToken(token): void
  getRepos(): Repository[]
  setRepos(repos): void
  getStoredReleases(): Release[]
  setStoredReleases(releases): void

  // 分片存储
  getReposMeta(): { sharded: boolean; totalShards: number } | null
  setReposMeta(meta): void
  getReposShard(index): string | null
  setReposShard(index, data): void
  removeReposShard(index): void

  // 标签操作 (v1.1.0)
  getTags(): Tag[]
  setTags(tags): void
  addTag(tag): Tag
  updateTag(id, updates): Tag | null
  deleteTag(id): void
  reorderTags(tagIds): void

  // 笔记操作 (v1.1.0)
  getNote(repoId): RepositoryNote | null
  setNote(repoId, content): RepositoryNote
  deleteNote(repoId): void
  getAllNotes(): RepositoryNote[]

  // AI 分析
  analyzeRepo(readme, repoInfo, language?, model?): Promise<{summary, tags, platforms} | null>
  getAIModels(): Promise<any[]>

  // 版本检测 (v1.4.0)
  getLatestRelease(owner, repo, token): Promise<Release | null>
  getReleaseCheckStatus(): ReleaseCheckStatus
  setReleaseCheckStatus(status): void

  // 系统操作
  openExternal(url): void
  showNotification(body, clickFeatureCode?): void
}
```

## 使用示例

```typescript
import type { Repository, Settings, Tag, Release } from '../types';

// 类型守卫
function isRepository(obj: any): obj is Repository {
  return typeof obj.id === 'number' && typeof obj.fullName === 'string';
}
```

## 变更记录

|日期|变更|
|--|--|
|2026-03-07|添加相对路径面包屑导航|
