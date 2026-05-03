# 服务层模块

[根目录](../../CLAUDE.md) > [src](../) > **services**

## 概述

服务层负责与外部 API 交互和数据持久化，是前端与 uTools 环境/后端服务的桥梁。

## 文件列表

| 文件 | 职责 |
|------|------|
| `githubService.ts` | GitHub API 调用 (全量/增量同步) |
| `aiService.ts` | AI 分析服务 (单个/批量/翻译) |
| `storageService.ts` | 数据持久化 (含分片存储) |
| `releaseService.ts` | 版本追踪服务 (平台识别/缓存) |

## githubService.ts

```typescript
export const githubService = {
  verifyToken(token): Promise<boolean>
  syncRepos(token, existingRepos, syncState, onProgress): Promise<SyncResult>
  buildSyncState(repos, previousState, mode): SyncState
  getReleases(owner, repo, token): Promise<any>
  checkRateLimit(token): Promise<any>
}
```

关键实现:
- `syncRepos`: 自动判断全量/增量同步，全量间隔 7 天
- `syncAllRepos`: 分页获取所有星标仓库，带限流保护 (100ms/页)
- `syncIncrementalRepos`: 基于 `latestStarredAt` 和 `latestRepoIds` 判断增量边界
- `transformRepo`: 将 GitHub API 响应转换为内部 `Repository` 类型

## aiService.ts

```typescript
export const aiService = {
  analyzeRepository(repo, token, language, model): Promise<AnalysisResult>
  batchAnalyze(repos, token, onProgress, language, concurrency, signal): Promise<Repository[]>
  translateRelease(releaseId, content, language, model, forceRefresh): Promise<TranslationResult>
  clearTranslationCache(releaseId?): void
}
```

分析流程:
1. 获取 README 内容
2. 调用 `window.githubStarsAPI.analyzeRepo`
3. 返回 `{ summary, tags, platforms }`

批量分析特性:
- 支持并发控制 (`PromiseQueue`)
- 支持 AbortSignal 中止
- 使用 Map 保证结果顺序和唯一性

翻译功能 (v1.6.0):
- 内存缓存 (7 天过期)
- 内容哈希校验 (DJB2 混合算法)
- 并发队列限制 (3 个)
- 重复请求复用
- 长内容截断 (8000 字符)

## storageService.ts

```typescript
export const storageService = {
  getSettings / setSettings
  getToken / setToken          // 加密存储
  getSyncState / setSyncState
  getRepositories / setRepositories  // 支持分片
  getReleases / setReleases
  getReadReleaseIds / setReadReleaseIds
  getReleaseSubscriptions / setReleaseSubscriptions
  getCategories / setCategories
}
```

分片存储机制:
- 阈值: 900KB (`MAX_CHUNK_SIZE`)
- 键名: `gh:repos:meta`, `gh:repos:shard:0`, `gh:repos:shard:1`...
- 自动清理旧分片
- `loadSharded`: 拼接分片 JSON 后解析

## releaseService.ts

```typescript
export const releaseService = {
  getReleases(owner, repo, token, page?, perPage?): Promise<Release[]>
  getLatestRelease(owner, repo, token): Promise<Release | null>
  checkSubscribedRepos(repoIds, token, repos, onProgress): Promise<{updates, errors}>
  identifyPlatform(asset): string
  getPlatformIcon / getPlatformLabel
  formatFileSize / formatDate
  cleanupCache(releases): Release[]
  filterAssetsByPlatform / groupAssetsByPlatform
}
```

平台识别: 基于文件名正则匹配，支持 mac/windows/linux/ios/android/docker/web/cli。

缓存策略: 最大 7 天 + 最大 100 条 + 按 release.id 去重。

批量检测: 3 个/批并发，对比本地已知最新 Release ID。

## 依赖关系

```
storageService.ts  (底层存储)
    ^
    |
useStore.ts  (状态管理)
    |
    +-- githubService.ts  (GitHub API)
    +-- aiService.ts      (AI 分析 + 翻译)
    +-- releaseService.ts (版本追踪)
```

## 变更记录

|日期|变更|
|--|--|
|2026-05-02|重新扫描：补充翻译功能、增量同步、分片存储、并发队列等实现细节|
|2026-03-07|添加相对路径面包屑导航|
