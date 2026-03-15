# 状态管理模块

[根目录](../../CLAUDE.md) > [src](../) > **stores**

## 概述

使用 Zustand 进行全局状态管理，单一 store 模式，所有状态集中在 `useStore.ts`。

## 状态结构

```typescript
interface AppState {
  // 页面导航
  currentPage: PageName  // 'home' | 'detail' | 'settings' | 'tags' | 'releases'
  setCurrentPage: (page) => void

  // 仓库数据
  repositories: Repository[]
  setRepositories: (repos) => void
  loadRepositories: () => void
  saveRepositories: () => void

  // 选中仓库
  selectedRepo: Repository | null
  setSelectedRepo: (repo) => void

  // 搜索过滤
  searchFilter: SearchFilter
  setSearchFilter: (filter) => void

  // 同步状态
  syncStatus: 'idle' | 'syncing' | 'completed' | 'error'
  syncProgress: { current: number; total: number }
  syncError: string | null

  // 设置
  settings: Partial<Settings>
  token: string | null

  // AI 分析 (v1.3.0)
  isAnalyzing: boolean
  analyzeProgress: AnalyzeProgress | null
  analyzeAbortController: AbortController | null
  startAutoAnalyze: () => Promise<void>
  stopAnalyze: () => void

  // 标签管理 (v1.1.0)
  tags: Tag[]
  addTag, updateTag, deleteTag, reorderTags

  // 笔记管理 (v1.1.0)
  currentNote: RepositoryNote | null
  loadNote, saveNote, deleteNote

  // 视图模式 (v1.1.0)
  viewMode: ViewMode  // 'card' | 'list'
  setViewMode: (mode) => void

  // 版本追踪 (v1.4.0)
  releases: Release[]
  releaseCheckStatus: ReleaseCheckStatus
  releaseFilter: ReleaseFilter
  checkReleaseUpdates, markReleaseRead, markAllReleasesRead

  // 订阅管理 (v1.5.0)
  getSubscribedRepos: () => Repository[]
  toggleSubscription: (repoId: number) => void
  clearAllSubscriptions: () => void
  subscriptionVersion: number

  // 计算属性
  getFilteredRepos: () => Repository[]
  updateRepository: (id, updates) => void
}
```

## 默认值

```typescript
const defaultFilter: SearchFilter = {
  keyword: '',
  languages: [],
  topics: [],
  aiTags: [],
  customTags: [],
  platforms: [],
  hasReleases: null,
  hasNotes: null,
  hasAlias: null,
  sortBy: 'stars',
  sortOrder: 'desc',
}

const defaultSettings: Partial<Settings> = {
  theme: 'auto',
  defaultView: 'card',
  itemsPerPage: 20,
  language: 'zh',
  syncInterval: 24,
  aiConcurrency: 1,
  defaultSortBy: 'stars',
  defaultSortOrder: 'desc',
  autoAnalyzeOnOpen: false,
  autoCheckReleaseUpdates: true,
}
```

## 搜索过滤逻辑

`getFilteredRepos()` 实现：

1. **语言筛选**: `searchFilter.languages`
2. **自定义标签筛选**: `searchFilter.customTags`
3. **平台筛选** (v1.3.0): `searchFilter.platforms`
4. **笔记筛选**: `searchFilter.hasNotes`
5. **别名列筛**: `searchFilter.hasAlias`
6. **关键词搜索**:
   - 多关键词 AND 匹配
   - 前缀过滤: `owner:`, `lang:`, `language:`, `topic:`, `tag:`, `note:`, `alias:`
   - 相关度打分: 别名(15/10), 名称(15/10), fullName(8), owner(6), 描述(5), 标签(4), topics(3)
7. **排序**: stars, updated, created, name, starredAt, alias

## 派生状态

```typescript
// 过滤后的仓库
const filteredRepos = useStore(state => state.getFilteredRepos())

// 未读版本数
const unreadCount = useStore(state => state.getUnreadCount())

// 可用平台列表
const platforms = useStore(state => state.getAvailablePlatforms())

// 已订阅仓库 (v1.5.0)
const subscribedRepos = useStore(state => state.getSubscribedRepos())
```

## 使用模式

```typescript
// 组件中使用
import { useStore } from './stores/useStore';

function MyComponent() {
  const repositories = useStore(state => state.repositories);
  const loadRepositories = useStore(state => state.loadRepositories);

  useEffect(() => {
    loadRepositories();
  }, []);

  return <div>{repositories.length} repos</div>;
}

// 在组件外使用
const state = useStore.getState();
state.loadRepositories();
state.saveRepositories();
```

## 状态持久化

通过 `storageService` 调用 `window.githubStarsAPI`：

| 状态 | 存储键 | 存储类型 |
|------|--------|----------|
| Token | `gh:token` | dbCryptoStorage |
| Settings | `gh:settings` | dbCryptoStorage |
| Repositories | `gh:repos` 或分片 | dbStorage |
| Tags | `gh:tags` | dbStorage |
| Notes | `gh:notes:*` | dbStorage |
| Releases | `gh:releases` | dbStorage |
| ReleaseSubscriptions | `gh:releaseSubscriptions` | dbStorage |
| ReadReleaseIds | `gh:readReleases` | dbStorage |

## 变更记录

|日期|变更|
|--|--|
|2026-03-07|添加订阅管理状态 (v1.5.0)，添加相对路径面包屑导航|
