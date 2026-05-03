# UI 组件模块

[根目录](../../CLAUDE.md) > [src](../) > **components**

## 概述

11 个可复用 UI 组件，用于构建页面界面。关键组件已使用 `React.memo` 优化。

## 组件列表

| 组件 | 文件 | 用途 | memo |
|------|------|------|------|
| RepositoryCard | `RepositoryCard.tsx` | 仓库卡片/列表项 | Yes |
| TagBadge | `TagBadge.tsx` | 标签徽章 | Yes |
| TagManager | `TagManager.tsx` | 标签管理器 (拖拽排序) | No |
| SyncProgress | `SyncProgress.tsx` | 同步进度条 | No |
| AnalyzeProgress | `AnalyzeProgress.tsx` | AI 分析进度 (浮动面板) | No |
| ReleaseCard | `ReleaseCard.tsx` | 版本卡片 | Yes |
| ReleaseDetail | `ReleaseDetail.tsx` | 版本详情弹窗 (含翻译) | No |
| UnreadBadge | `UnreadBadge.tsx` | 未读数量徽章 | No |
| TokenHelp | `TokenHelp.tsx` | Token 配置帮助面板 | No |
| ConfirmDialog | `ConfirmDialog.tsx` | 通用确认弹窗 | No |
| FilterBar | `../pages/home/components/FilterBar/index.tsx` | 首页筛选栏 (v1.7.0) | Yes |

## RepositoryCard.tsx

**仓库展示组件**

Props:
```typescript
interface RepositoryCardProps {
  repo: Repository;
  onClick: (repo: Repository) => void;
  language: 'zh' | 'en';
  isActive?: boolean;  // 键盘导航高亮
}
```

显示内容: 头像、名称/别名、描述/AI 摘要、Star/Fork 数、语言标签 (带颜色)、AI 标签、更新时间。

使用 `useMemo` 缓存 `displayName`、`allTags`、`description`、`languageColor`。

## TagBadge.tsx

**标签徽章组件**

Props:
```typescript
interface TagBadgeProps {
  tag: Tag;
  onClick?: () => void;
  onRemove?: () => void;
  size?: 'sm' | 'md';
  showRemove?: boolean;
}
```

支持自定义颜色、emoji 图标、可删除按钮。使用 `useMemo` 缓存样式。

## TagManager.tsx

**标签管理组件** -- 支持 select / manage 两种模式。

manage 模式使用 `@dnd-kit` 实现拖拽排序。内部包含添加/编辑模态弹窗和删除确认弹窗。

Props:
```typescript
interface TagManagerProps {
  onSelect?: (tagId: string) => void;
  selectedTags?: string[];
  mode?: 'select' | 'manage';
}
```

## SyncProgress.tsx

**同步进度组件** -- 显示进度条、同步状态文案、完成/错误信息。status 为 idle 时不渲染。

## AnalyzeProgress.tsx

**AI 分析进度组件** -- 浮动在右下角，显示当前分析仓库名、进度条、中止按钮。

## ReleaseCard.tsx

**版本卡片组件** -- 显示仓库头像、名称、版本标签、发布时间、平台资产标签、未读 NEW 标识。

使用 `useMemo` 缓存 `platformGroups`、`tagName`、`publishedAt` 等。

## ReleaseDetail.tsx

**版本详情弹窗** -- Markdown 渲染更新说明、资产列表按平台分组、翻译功能 (v1.6.0)。

翻译使用 `aiService.translateRelease`，支持缓存、重试、原文/译文切换。使用 `mountedRef` 防止内存泄漏。

## UnreadBadge.tsx

**未读徽章组件** -- 铃铛图标 + 未读数量 + 检测中状态。使用 store 的 `getUnreadCount()` 派生。

## TokenHelp.tsx

**Token 配置帮助组件** -- 三个 Tab: 如何获取、所需权限、安全说明。包含 `TokenHelpHeaderButton` 子组件。

## ConfirmDialog.tsx

**通用确认弹窗** -- 支持 default/danger 变体、loading 状态。用于 AI 分析确认、笔记删除确认等场景。

Props:
```typescript
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'danger';
  loading?: boolean;
}
```

## 共享模式

### 主题支持

所有组件通过 CSS 变量支持主题切换 (`var(--color-surface)`, `var(--color-text-primary)` 等)。

### 国际化

使用 `locales/index.ts` 的 `t()` 函数，支持 `zh` / `en`。

### 状态访问

组件通过 Zustand hooks 访问状态: `useStore(state => state.xxx)`。

## 变更记录

|日期|变更|
|--|--|
|2026-05-02|重新扫描：修正组件数量为 11，补充 ConfirmDialog 文档，添加 memo 标记列，更新 Props 接口|
|2026-03-07|新增 TokenHelp 组件文档，更新组件数量为 9 个|
