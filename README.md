# GitHub Stars Manager For uTools

GitHub Stars Manager For uTools 是一个基于 uTools 的 GitHub 星标仓库管理插件，用于集中整理、搜索和分析你的 Star 仓库。

## 项目定位

这个插件面向已经积累了大量 GitHub Star 仓库的开发者，目标不是“再做一个收藏列表”，而是把 Star 仓库变成可同步、可搜索、可标注、可追踪更新的个人技术资源库。

## 技术栈

- React 19
- TypeScript
- Vite
- Zustand
- Tailwind CSS v4

## 功能亮点

- GitHub Star 仓库同步
- 关键词、多维度条件组合的智能搜索与筛选
- AI 仓库分析，自动生成摘要、标签和平台信息
- 自定义标签、别名、笔记，支持长期整理
- Release 追踪、订阅、未读标记和资产平台识别
- 中英文界面切换
- Token 验证后自动同步，减少首次使用摩擦

## 适用场景

- Star 仓库很多，GitHub 原生列表已经不够用
- 希望给项目补充标签、别名和笔记，形成个人知识索引
- 想快速找回“以前收藏过但记不清名字”的仓库
- 希望跟踪已收藏项目的 Release 更新，而不是手动逐个查看
- 想利用 uTools 的启动入口，把 GitHub 收藏管理集成进日常工作流

## uTools 入口

插件围绕 uTools 的快速启动能力设计，当前支持：

- 关键词入口：`github stars`、`gh stars`、`星标管理`、`GitHub收藏`
- 搜索入口：在 uTools 子输入框中搜索 Star 仓库
- 仓库直达：输入 `owner/repo` 直接在插件中打开对应仓库

## 核心模块

- `GitHub 同步`：通过 Personal Access Token 拉取 Starred 仓库，并支持增量管理
- `智能搜索`：支持关键词、语言、主题、AI 标签、自定义标签、平台等组合筛选
- `AI 分析`：基于 uTools AI 能力生成仓库摘要、标签和平台识别结果
- `标签与笔记`：支持自定义标签、别名、笔记，增强二次整理能力
- `版本追踪`：订阅 Release 更新，管理未读状态，并按平台筛选下载资产

## 架构概览

项目采用比较直接的三层结构：

- 表示层：`src/pages/`、`src/components/`
- 业务层：`src/services/`、`src/stores/`
- 数据访问层：`preload.js` + `utools.db` / `utools.dbCryptoStorage`

其中：

- `preload.js` 负责暴露 GitHub API、存储和系统能力
- `useStore.ts` 负责全局状态与页面行为协调
- `releaseService.ts`、`githubService.ts`、`aiService.ts` 分别处理版本追踪、GitHub 数据与 AI 分析

## 数据与存储

- 仓库、标签、版本信息等数据存储在 `utools.db`
- Token 和设置使用 `utools.dbCryptoStorage` 加密存储
- 大数据量仓库列表采用分片存储策略，降低单文档体积风险
- 当前仓库保留 `dist/`，便于插件打包与分发

## 目录结构

```text
src/                     前端源码
preload.js               uTools 预加载脚本
plugin.json              uTools 插件配置
dist/                    构建输出
```

## 本地开发

```bash
npm install
npm run dev
npm run build
npm run preview
```

## 仓库说明

- 当前仓库主要保留插件源码、构建产物和运行配置
- 设计文档与过程文档不再纳入版本控制

