# 页面组件模块

[根目录](../../CLAUDE.md) > [src](../) > **pages**

## 概述

5 个页面组件，由 `App.tsx` 根据 `currentPage` 状态路由。

## 页面列表

| 页面 | 文件 | 功能 |
|------|------|------|
| 首页 | `HomePage.tsx` | 仓库列表、搜索、筛选、同步 |
| 详情 | `DetailPage.tsx` | 单仓库详情、AI 分析、笔记、订阅 |
| 设置 | `SettingsPage.tsx` | Token、主题、语言、AI 设置、版本订阅管理 |
| 标签 | `TagsPage.tsx` | 标签管理、拖拽排序 |
| 版本 | `ReleasesPage.tsx` | 版本更新列表、订阅管理、平台筛选 |

## HomePage.tsx

**主页面** (~26KB)

**主要功能**:
- 仓库列表展示 (卡片/列表视图)
- 多维搜索过滤
- 排序控制
- 分页
- 同步进度
- AI 分析进度
- 平台筛选
- 标签筛选

**关键状态**:
```typescript
const {
  repositories, searchFilter, setSearchFilter,
  syncStatus, syncProgress, isAnalyzing, analyzeProgress,
  viewMode, tags, loadTags, getAvailablePlatforms,
} = useStore();
```

**搜索前缀**:
- `owner:` - 作者筛选
- `lang:` / `language:` - 语言筛选
- `topic:` - 主题筛选
- `tag:` - 标签筛选
- `note:` - 笔记内容搜索
- `alias:` - 别名搜索

**排序选项**:
- `stars` - Star 数
- `updated` - 更新时间
- `created` - 创建时间
- `name` - 名称
- `starredAt` - 收藏时间
- `alias` - 别名

## DetailPage.tsx

**仓库详情页** (~25KB)

**主要功能**:
- 仓库基本信息展示
- README 预览
- AI 分析触发与结果展示
- 别名设置
- 笔记编辑 (Markdown)
- 自定义标签管理
- Release 订阅
- 在 GitHub 打开

**关键状态**:
```typescript
const { selectedRepo, updateRepository, saveNote, tags, addTag } = useStore();
```

## SettingsPage.tsx

**设置页** (~21KB)

**设置项**:
- GitHub Token 配置与验证
- 同步间隔
- 主题 (light/dark/auto)
- 语言 (zh/en)
- 默认视图模式
- 每页数量
- 默认排序
- AI 分析设置
  - 启动时自动分析
  - 并发数
  - 模型选择
  - 自定义提示词
- 版本追踪设置 (v1.4.0)
  - 启动时自动检测
  - 订阅仓库管理
- 数据导入/导出

## TagsPage.tsx

**标签管理页** (~1.4KB)

**功能**:
- 标签列表
- 拖拽排序 (使用 @dnd-kit)
- 标签增删改

**依赖组件**: `TagManager.tsx`

## ReleasesPage.tsx

**版本列表页** (~19KB) - v1.4.0 ~ v1.4.1

**功能**:
- 已订阅仓库的版本更新列表
- 未读/已读标记
- 平台筛选
- 一键全部已读
- 手动检查更新
- 订阅管理 Tab (v1.5.0)
  - 已订阅仓库列表
  - 取消订阅 (带撤销功能)
  - 全部取消订阅

**关键状态**:
```typescript
const {
  releases, releaseCheckStatus, releaseFilter,
  checkReleaseUpdates, markReleaseRead, markAllReleasesRead,
  repositories, subscriptionVersion, toggleSubscription, clearAllSubscriptions
} = useStore();
```

**撤销订阅功能**:
- 5 秒内可撤销
- Toast 提示

## 页面导航

```typescript
// 导航到页面
useStore.getState().setCurrentPage('home' | 'detail' | 'settings' | 'tags' | 'releases');

// 自定义事件导航
window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'settings' } }));

// 打开仓库详情
useStore.getState().setSelectedRepo(repo);
useStore.getState().setCurrentPage('detail');
```

## uTools 入口处理

在 `App.tsx` 中：

```typescript
utools.onPluginEnter(({ code, type, payload }) => {
  switch (code) {
    case 'github-stars':
      setCurrentPage('home');
      utools.setSubInput(/*...*/);
      break;
    case 'github-stars-search':
      setCurrentPage('home');
      setSearchFilter({ keyword: payload });
      break;
    case 'github-stars-repo':
      // 打开仓库详情或搜索
      break;
    case 'github-stars-releases':
      setCurrentPage('releases');
      break;
  }
});
```

## 变更记录

|日期|变更|
|--|--|
|2026-03-07|更新 ReleasesPage 功能描述，添加订阅管理 Tab 文档，添加相对路径面包屑导航|
