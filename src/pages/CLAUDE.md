# 页面组件模块

[根目录](../../CLAUDE.md) > [src](../) > **pages**

## 概述

5 个页面组件，由 `App.tsx` 根据 `currentPage` 状态路由。HomePage 已在 v1.7.0 拆分为子模块。

## 页面列表

| 页面 | 文件 | 功能 |
|------|------|------|
| 首页 | `HomePage.tsx` | 仓库列表、搜索、筛选、同步、键盘导航 |
| 详情 | `DetailPage.tsx` | 单仓库详情、AI 分析、笔记、标签、订阅 |
| 设置 | `SettingsPage.tsx` | Token、主题、语言、AI 设置、版本订阅管理 |
| 标签 | `TagsPage.tsx` | 标签管理、拖拽排序 |
| 版本 | `ReleasesPage.tsx` | 版本更新列表、订阅管理、平台筛选 |

## HomePage.tsx

**主页面**

主要功能:
- 仓库列表展示 (卡片/列表视图)
- 多维搜索过滤 (通过 FilterBar 组件)
- 排序控制 (stars/updated/name/starredAt)
- 分页
- 同步进度 / 错误提示
- 键盘导航 (ArrowUp/Down/Left/Right/Enter)
- 首次使用引导 (无 Token 时)

关键状态:
```typescript
const {
  repositories, token, settings,
  syncStatus, syncProgress, syncError,
  searchFilter, getFilteredRepos,
  currentPageNum, setCurrentPageNum,
  tags, loadTags, viewMode, setViewMode,
} = useStore();
```

### home/ 子模块 (v1.7.0)

```
pages/home/
├── index.ts              # 入口
├── components/
│   ├── index.ts
│   └── FilterBar/
│       └── index.tsx     # 筛选栏组件 (memo)
└── hooks/
    ├── index.ts
    ├── useHomePage.ts    # 主 Hook (封装业务逻辑)
    └── useFilterState.ts # 筛选状态 Hook
```

**FilterBar**: 包含版本追踪入口、未读标识、视图切换、排序菜单、标签筛选、平台筛选、同步按钮、设置按钮。支持键盘导航。

**useHomePage**: 封装 HomePage 的业务逻辑，返回数据、统计、状态、操作。

**useFilterState**: 管理筛选状态的 Hook。

搜索前缀:
- `owner:` - 作者筛选
- `lang:` / `language:` - 语言筛选
- `topic:` - 主题筛选
- `tag:` - 标签筛选
- `note:` - 笔记内容搜索
- `alias:` - 别名搜索

## DetailPage.tsx

**仓库详情页**

主要功能:
- 仓库基本信息 (头像、名称/别名、Star/Fork、语言)
- AI 分析触发与结果展示 (含重新分析确认弹窗)
- 别名设置 (模态弹窗)
- 笔记编辑 (Markdown，含删除确认)
- 自定义标签管理 (展开/折叠动画)
- Release 订阅切换
- Topics / Homepage 展示
- 键盘导航 (Backspace 返回)

关键实现:
- `escapeHtml` XSS 防护
- `checkAnalysisNeeded` 分析状态判断 (含 24 小时冷却)
- `subscriptionVersion` 响应式订阅状态

## SettingsPage.tsx

**设置页**

设置项:
- GitHub Token 配置与验证 (含 TokenHelp 帮助面板)
- AI 模型选择 (从 uTools 获取可用模型)
- AI 分析设置: 启动时自动分析、并发数 (1-5)、立即分析/停止
- 版本追踪设置: 启动时自动检测、订阅仓库管理
- 主题 (light/dark/auto)
- 语言 (zh/en)
- 每页数量 (10/20/50/100)
- 数据导入/导出
- 关于信息

Token 验证成功后自动触发同步 (通过 `trigger-sync` 事件)。

## TagsPage.tsx

**标签管理页** -- 包装 `TagManager` 组件 (mode="manage")。

## ReleasesPage.tsx

**版本列表页** -- 双 Tab 切换 (版本更新 / 订阅管理)。

版本更新 Tab:
- 筛选栏: 检查更新、全部已读、未读筛选、平台筛选
- 版本卡片列表 (含未读 NEW 标识)
- 点击展开版本详情弹窗 (含翻译功能)

订阅管理 Tab:
- 已订阅仓库列表
- 取消订阅 (带 5 秒撤销功能)
- 全部取消订阅 (确认弹窗)

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

在 `App.tsx` 中:

```typescript
utools.onPluginEnter(({ code, type, payload }) => {
  switch (code) {
    case 'github-stars':      // -> home + 子输入框
    case 'github-stars-search': // -> home + 关键词
    case 'github-stars-repo':  // -> detail 或 home + 搜索
    case 'github-stars-releases': // -> releases
  }
});
```

## 变更记录

|日期|变更|
|--|--|
|2026-05-02|重新扫描：新增 home/ 子模块文档，更新页面功能描述，补充键盘导航说明|
|2026-03-07|更新 ReleasesPage 功能描述，添加订阅管理 Tab 文档，添加相对路径面包屑导航|
