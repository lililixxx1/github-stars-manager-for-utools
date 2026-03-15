# UI 组件模块

[根目录](../../CLAUDE.md) > [src](../) > **components**

## 概述

9 个可复用 UI 组件，用于构建页面界面。

## 组件列表

| 组件 | 文件 | 用途 |
|------|------|------|
| RepositoryCard | `RepositoryCard.tsx` | 仓库卡片/列表项 |
| TagBadge | `TagBadge.tsx` | 标签徽章 |
| TagManager | `TagManager.tsx` | 标签管理器 |
| SyncProgress | `SyncProgress.tsx` | 同步进度条 |
| AnalyzeProgress | `AnalyzeProgress.tsx` | AI 分析进度 |
| ReleaseCard | `ReleaseCard.tsx` | 版本卡片 |
| ReleaseDetail | `ReleaseDetail.tsx` | 版本详情弹窗 |
| UnreadBadge | `UnreadBadge.tsx` | 未读数量徽章 |
| TokenHelp | `TokenHelp.tsx` | Token 配置帮助面板 |

## RepositoryCard.tsx

**仓库展示组件** (~4KB)

**Props**:
```typescript
interface RepositoryCardProps {
  repo: Repository;
  onClick: () => void;
  language: 'zh' | 'en';
}
```

**显示内容**:
- 仓库图标 (owner avatar)
- 名称 / 别名
- 描述 / AI 摘要
- Star/Fork 数
- 语言标签 (带颜色标识)
- AI 标签
- 更新时间

**语言颜色映射**:
```typescript
const langColors: Record<string, string> = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    Java: '#b07219', Go: '#00ADD8', Rust: '#dea584',
    // ... 更多语言
};
```

## TagBadge.tsx

**标签徽章组件** (~1.5KB)

**Props**:
```typescript
interface TagBadgeProps {
  tag: Tag;
  onClick?: () => void;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}
```

**特性**:
- 支持自定义颜色
- 支持图标 (emoji 或 lucide 图标名)
- 可删除按钮

## TagManager.tsx

**标签管理组件** (~16KB)

**Props**:
```typescript
interface TagManagerProps {
  repoId: number;
  selectedTags: string[];
  onTagsChange: (tagIds: string[]) => void;
}
```

**功能**:
- 创建新标签
- 选择现有标签
- 删除标签
- 编辑标签 (名称、颜色、图标)
- 拖拽排序 (@dnd-kit)

**依赖**:
```typescript
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
```

## SyncProgress.tsx

**同步进度组件** (~1.7KB)

**Props**:
```typescript
interface SyncProgressProps {
  current: number;
  total: number;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  language: 'zh' | 'en';
}
```

**显示**:
- 进度条
- "同步中 X/Y"
- 完成状态
- 错误信息 (如果有)

## AnalyzeProgress.tsx

**AI 分析进度组件** (~2.7KB) - v1.3.0

**Props**:
```typescript
interface AnalyzeProgressProps {
  progress: AnalyzeProgress;
  onStop: () => void;
  language: 'zh' | 'en';
}
```

**显示**:
- 进度条
- 当前分析的仓库名
- 已完成/总数
- 停止按钮

## ReleaseCard.tsx

**版本卡片组件** (~4KB) - v1.4.0

**Props**:
```typescript
interface ReleaseCardProps {
  release: Release;
  onClick: () => void;
  language: 'zh' | 'en';
}
```

**显示**:
- 仓库名
- 版本标签
- 发布时间
- 是否已读 (未读徽章)
- 点击展开详情

## ReleaseDetail.tsx

**版本详情组件** (~12.5KB) - v1.4.0

**Props**:
```typescript
interface ReleaseDetailProps {
  release: Release;
  onClose: () => void;
  onMarkRead: () => void;
  language: 'zh' | 'en';
}
```

**功能**:
- Markdown 渲染更新说明
- 资产列表按平台分组
- 平台图标显示
- 文件大小格式化
- 下载链接
- 在 GitHub 查看
- 标记已读

**平台识别**:
```typescript
// 使用 releaseService.identifyPlatform(asset)
// 支持识别: mac, windows, linux, ios, android, docker, web, cli
```

## UnreadBadge.tsx

**未读徽章组件** (~2.2KB) - v1.4.0

**Props**:
```typescript
interface UnreadBadgeProps {
  language: 'zh' | 'en';
  onClick: () => void;
}
```

**显示**:
- 红色圆点 + 数字
- "{count} 个新版本" 文案
- 点击跳转到版本页

## TokenHelp.tsx

**Token 配置帮助组件** (~10KB)

**Props**:
```typescript
interface TokenHelpProps {
  language: 'zh' | 'en';
}
```

**功能**:
- 分步骤指引获取 GitHub Token
- Fine-grained Token 权限说明
- Classic Token 权限说明
- 安全提示
- 打开 GitHub Token 设置页面按钮

## 共享模式

### 主题支持

所有组件通过 CSS 变量支持主题切换：

```css
/* 使用 CSS 变量 */
background: var(--color-surface);
color: var(--color-text-primary);
border: 1px solid var(--color-border);
```

主题变量定义在 `index.css`:
- 浅色主题 (默认)
- 深色主题 (`:root.dark`)
- 自动模式 (`prefers-color-scheme: dark`)

### 国际化

使用 `locales/index.ts` 的 `t()` 函数：

```tsx
import { t } from '../locales';

const text = t('syncNow', language);
```

支持语言:
- `zh` - 中文
- `en` - English

### 状态访问

组件通过 Zustand hooks 访问状态：

```tsx
const viewMode = useStore(state => state.viewMode);
const settings = useStore(state => state.settings);
```

## 变更记录

|日期|变更|
|--|--|
|2026-03-07|新增 TokenHelp 组件文档，更新组件数量为 9 个|
