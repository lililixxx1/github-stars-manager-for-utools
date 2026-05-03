# 状态管理模块

[根目录](../../CLAUDE.md) > [src](../) > **stores**

## 概述

使用 Zustand 进行全局状态管理，单一 store 模式，所有状态集中在 `useStore.ts`。v1.7.0 新增 `selectors/` 筛选管道模块。

## 文件列表

| 文件 | 职责 |
|------|------|
| `useStore.ts` | Zustand store 定义 (约 900 行) |
| `selectors/index.ts` | 筛选管道入口 |
| `selectors/filterSelectors.ts` | 基础筛选器 (语言、标签、平台、笔记、别名、订阅) |
| `selectors/searchSelectors.ts` | 关键词搜索 + 相关度计算 |
| `selectors/sortSelectors.ts` | 排序器 |

## 状态结构 (useStore.ts)

```typescript
interface AppState {
  // 页面导航
  currentPage: PageName
  setCurrentPage: (page) => void

  // 仓库数据
  repositories: Repository[]
  loadRepositories, saveRepositories, setRepositories, updateRepository

  // 选中仓库
  selectedRepo: Repository | null
  setSelectedRepo

  // 搜索过滤
  searchFilter: SearchFilter
  setSearchFilter: (filter) => void  // 同时持久化排序设置

  // 同步状态
  syncStatus: 'idle' | 'syncing' | 'completed' | 'error'
  syncProgress, syncError
  syncRepositories: () => Promise<void>  // v1.6.3 移至 store

  // 设置
  settings: Partial<Settings>
  token: string | null
  loadSettings, saveSettings, loadToken

  // AI 分析 (v1.3.0)
  isAnalyzing, analyzeProgress, analyzeAbortController, analyzeStats
  startAutoAnalyze, stopAnalyze, getAvailablePlatforms

  // 标签管理 (v1.1.0)
  tags: Tag[]
  loadTags, setTags, addTag, updateTag, deleteTag, reorderTags

  // 笔记管理 (v1.1.0)
  currentNote: RepositoryNote | null
  loadNote, saveNote, deleteNote

  // 视图模式 (v1.1.0)
  viewMode: ViewMode  // 'card' | 'list'
  setViewMode

  // 版本追踪 (v1.4.0)
  releases: Release[]
  releaseCheckStatus, releaseFilter
  loadReleases, saveReleases, checkReleaseUpdates
  markReleaseRead, markAllReleasesRead, getUnreadCount, setReleaseFilter

  // 订阅管理 (v1.5.0)
  getSubscribedRepos, toggleSubscription, clearAllSubscriptions
  subscriptionVersion, togglingSubscriptions
  releasesInitialTab, setReleasesInitialTab

  // 计算属性
  getFilteredRepos: () => Repository[]  // 使用 selectors 管道
}
```

## 筛选管道 (selectors/) -- v1.7.0

### 入口: `createFilteredReposPipeline(filter)`

```typescript
const pipeline = createFilteredReposPipeline(searchFilter);
const filtered = pipeline(repositories);
```

管道执行顺序:
1. 解析关键词 (前缀过滤 + 普通关键词)
2. 基础筛选: 语言 -> 标签 -> 平台 -> 笔记 -> 别名 -> 订阅
3. 关键词搜索 + 相关度计算 (仅在有关键词时)
4. 排序 (无关键词时使用用户排序设置)

### filterSelectors.ts

| 筛选器 | 函数 | 说明 |
|--------|------|------|
| 语言 | `createFilterByLanguages` | 按 repo.language 筛选 |
| 标签 | `createFilterByTags` | 按 repo.customTags 筛选 |
| 平台 | `createFilterByPlatforms` | 按 repo.aiPlatforms 筛选，支持 'none' |
| 笔记 | `createFilterByNotes` | 批量读取 notes 到内存 (性能优化) |
| 别名 | `createFilterByAlias` | 按 repo.alias 存在性筛选 |
| 订阅 | `createFilterBySubscription` | 按 repo.isSubscribed 筛选 |
| 前缀 | `parseSearchKeyword` + `applyPrefixFilters` | owner:/lang:/topic:/tag:/note:/alias: |

### searchSelectors.ts

`calculateRelevance(keywords)`: AND 匹配，多字段相关度打分。

评分权重: 别名(15/10) > 名称(15/10) > fullName(8) > owner(6) > 描述(5) > AI摘要(5) > 笔记(4) > 标签(4) > topics(3)

### sortSelectors.ts

`createSorter(sortBy, sortOrder)`: 支持 stars、updated、starredAt、name 四种排序。

## 默认值

```typescript
const defaultFilter: SearchFilter = {
  keyword: '', languages: [], topics: [], aiTags: [],
  customTags: [], platforms: [], hasReleases: null,
  hasNotes: null, hasAlias: null, sortBy: 'stars', sortOrder: 'desc',
}

const defaultSettings: Partial<Settings> = {
  theme: 'auto', defaultView: 'card', itemsPerPage: 20,
  language: 'zh', syncInterval: 24, aiConcurrency: 1,
  defaultSortBy: 'stars', defaultSortOrder: 'desc',
  autoAnalyzeOnOpen: false, autoCheckReleaseUpdates: true,
}
```

## 关键实现细节

### 同步机制 (syncRepositories)

1. 检查 token 和 syncStatus
2. 调用 `githubService.syncRepos` (自动判断全量/增量)
3. 合并仓库数据 (保留 AI 分析、标签、别名等用户数据)
4. 更新 syncState 和 settings
5. 保存到 storageService

### 订阅管理 (toggleSubscription)

- 新订阅: 乐观更新 -> 触发响应式 -> 后台异步获取基准版本 -> 释放锁
- 取消订阅: 立即生效，无锁检查
- 使用 `subscriptionVersion` 触发响应式更新
- 使用 `togglingSubscriptions` Set 防止竞态

### 状态持久化

| 状态 | 存储键 | 存储类型 |
|------|--------|----------|
| Token | `gh:token` | dbCryptoStorage |
| Settings | `gh:settings` | dbCryptoStorage |
| Repositories | `gh:repos` 或分片 | dbStorage |
| Tags | `gh:tags` | dbStorage |
| Notes | `gh:note:*` | dbStorage |
| Releases | `gh:releases` | dbStorage |
| ReleaseSubscriptions | `gh:releaseSubscriptions` | dbStorage |
| ReadReleaseIds | `gh:readReleases` | dbStorage |

## 变更记录

|日期|变更|
|--|--|
|2026-05-02|重新扫描：新增 selectors/ 筛选管道文档，补充同步/订阅机制说明，更新状态结构|
|2026-03-07|添加订阅管理状态 (v1.5.0)，添加相对路径面包屑导航|
