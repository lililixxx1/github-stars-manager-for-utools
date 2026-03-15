# 服务层模块

[根目录](../../CLAUDE.md) > [src](../) > **services**

## 概述

服务层负责与外部 API 交互和数据持久化，是前端与 uTools 环境/后端服务的桥梁。

## 文件列表

| 文件 | 职责 |
|------|------|
| `githubService.ts` | GitHub API 调用 |
| `aiService.ts` | AI 分析服务 |
| `storageService.ts` | 数据持久化 |
| `releaseService.ts` | 版本追踪服务 |

## githubService.ts

**GitHub API 封装**

```typescript
export const githubService = {
  verifyToken(token): Promise<boolean>
  syncAllRepos(token, onProgress): Promise<Repository[]>
  getReleases(owner, repo, token): Promise<any>
  checkRateLimit(token): Promise<any>
}
```

**关键实现**:
- `syncAllRepos`: 分页获取所有星标仓库，带限流保护 (100ms/页)
- `transformRepo`: 将 GitHub API 响应转换为内部 `Repository` 类型

## aiService.ts

**AI 分析服务**

```typescript
export const aiService = {
  analyzeRepository(repo, token, language, model): Promise<AnalysisResult>
  batchAnalyze(repos, token, onProgress, language, concurrency, signal): Promise<Repository[]>
}
```

**分析流程**:
1. 获取 README 内容
2. 调用 `window.githubStarsAPI.analyzeRepo`
3. 返回 `{ summary, tags, platforms }`

**批量分析特性**:
- 支持并发控制 (`concurrency` 参数)
- 支持 AbortSignal 中止
- 使用 Map 保证结果顺序和唯一性

## storageService.ts

**数据持久化服务**

```typescript
export const storageService = {
  // 设置
  getSettings(): Partial<Settings>
  setSettings(settings): void

  // Token (加密存储)
  getToken(): string | null
  setToken(token): void

  // 仓库 (支持分片)
  getRepositories(): Repository[]
  setRepositories(repos): void

  // 版本数据
  getReleases(): Release[]
  setReleases(releases): void

  getReadReleaseIds(): Set<number>
  setReadReleaseIds(ids): void

  getReleaseSubscriptions(): Set<number>
  setReleaseSubscriptions(ids): void
}
```

**分片存储机制**:
- 阈值: 900KB
- 键名: `gh:repos:meta`, `gh:repos:shard:0`, `gh:repos:shard:1`...
- 自动清理旧分片

## releaseService.ts

**版本追踪服务** (v1.4.0)

```typescript
export const releaseService = {
  getReleases(owner, repo, token): Promise<Release[]>
  getLatestRelease(owner, repo, token): Promise<Release | null>
  checkSubscribedRepos(repoIds, token, repos, onProgress): Promise<{updates, errors}>
  identifyPlatform(asset): string
  getPlatformIcon(platform): string
  getPlatformLabel(platform): string
  formatFileSize(bytes): string
  formatDate(dateString, lang): string
  cleanupCache(releases): Release[]
  filterAssetsByPlatform(assets, platform): ReleaseAsset[]
  groupAssetsByPlatform(assets): Map<string, ReleaseAsset[]>
}
```

**平台识别**:
- 支持识别: macOS, Windows, Linux, iOS, Android, Docker, Web, CLI
- 基于文件名正则匹配

**缓存策略**:
- 最大缓存时间: 7 天
- 最大缓存数量: 100 条

## 依赖关系

```
storageService.ts
    ↓
useStore.ts
    ↓
githubService.ts, aiService.ts, releaseService.ts
```

## 使用示例

```typescript
// 同步仓库
const repos = await githubService.syncAllRepos(token, (current, total) => {
  console.log(`进度: ${current}/${total}`);
});

// 批量 AI 分析
const results = await aiService.batchAnalyze(
  repos.filter(r => !r.analyzedAt),
  token,
  (current, total, repo) => setProgress({ current, total, repo: repo.fullName }),
  'zh',
  3, // 并发数
  abortController.signal
);

// 检查版本更新
const { updates, errors } = await releaseService.checkSubscribedRepos(
  subscribedIds,
  token,
  repos.map(r => ({ id: r.id, fullName: r.fullName })),
  onProgress
);
```

## 变更记录

|日期|变更|
|--|--|
|2026-03-07|添加相对路径面包屑导航|
