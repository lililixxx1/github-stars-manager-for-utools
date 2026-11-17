# UI 与插件性能优化方案（v1.1）

> 日期：2026-11-13  
> 修订记录：v1.1（吸纳 `plan-code-reviewer` 初审两项 Blocker 与 Gaps/Suggestions，统一类名与边界说明）  
> 目标：在不改变既有核心业务语义（R1–R8 / F1–F9 / 键盘导航 / AI 额度保护）的前提下，全面优化 uTools 插件的冷启动体积、运行时渲染性能与桌面端 UI/交互质感。

---

## 1. 现状诊断（基于代码实查）

### 1.1 性能与包体积问题
1. **首屏单包过大（`461.55 kB`）**：`src/App.tsx` 同步导入 `DetailPage`、`SettingsPage`、`TagsPage`（携带 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`）、`ReleasesPage`（携带 `ReleaseDetail`、`markdown.tsx`），导致冷启动时必须解析全部二级页面与拖拽库。
2. **页面切换时冗余存储读取与缓存失效**：
   - `HomePage.tsx`、`DetailPage.tsx` 每次挂载都重复 `loadTags()`，产生新的 `tags` 引用，触发 `HomePage` 内 `filteredRepos` 与每张 `RepositoryCard` 的重算。
   - `TagsPage.tsx` 每次挂载调用 `loadRepositories()`，重新从 preload 反序列化/拷贝全部仓库并重建笔记索引，同时替换 `repositories` 对象引用，导致 `filterSelectors.ts` 中的 `WeakMap` 搜索索引全量失效。
   - `ReleasesPage.tsx` 每次挂载调用 `loadReleases()`，在启动已加载且各变更动作已同步更新 store 的情况下重复读盘并重置 `releases` 引用。
3. **首页高频路径 memo 失效与重复计算**：
   - `HomePage.tsx` 向 `memo(FilterBar)` 传入内联箭头函数 `onRequestListArea`、`onRequestToolbarArea`，每次列表项 `onMouseEnter` 改变 `activeRepoIndex` 都会击穿 `FilterBar` 的 `React.memo`，导致 `FilterBar` 整组件 VDOM 重渲染与 `toolbarControls` 重建（`subscribedCount` 虽有 `useMemo([repositories])` 保护，但仍白白重跑 JSX 构建与 `useEffect`/`getToolbarButtonStyle` 等逻辑）。
   - `HomePage.tsx` 的 `filteredRepos` `useMemo` 依赖数组中包含未参与筛选计算的 `tags`。
   - 每张 `RepositoryCard` 内部每次标签变更都各自 `new Map(tags.map(...))`；列表视图 `renderListRowContent` 未抽离为 `memo` 组件，每次鼠标移动切换 `activeRepoIndex` 都重算全部可见行（含 `tags.find`、数字格式化等）。
   - 分页模式选择 `50` / `100` 条时，视口外卡片同样参与完整布局与绘制，未使用 `content-visibility: auto`。
4. **生产环境 Benchmark 杂讯与图片解码**：
   - `src/utils/benchmark.ts` 的 `timeOnce` / `timeOnceAsync` 在生产环境仍持续输出 `[benchmark]` 日志。
   - `DetailPage.tsx`、`ReleasesPage.tsx`、`RepoRow.tsx` 头像 `<img>` 缺少 `decoding="async"`（前两者缺少 `loading="lazy"`）与尺寸属性。
   - `SettingsPage.tsx` 中 `analyzedStats` 对 `repositories` 执行了两次 `.filter()` 遍历；`handleExport` 同步 `revokeObjectURL` 存在极短窗口风险。

### 1.2 UI 与交互细节问题
1. **深色模式原生控件与聚焦框瑕疵（`src/index.css`）**：
   - `:root` / `:root.dark` 未声明 `color-scheme: light` / `color-scheme: dark`，导致深色模式下 `<select>` 下拉弹窗与原生复选框呈现白底或对比异常。
   - `HomePage` 列表容器 `role="listbox"` 使用全局 `outline-offset: 2px`，全宽容器外扩焦点环会被视口边缘裁剪。
   - 缺少 `@media (prefers-reduced-motion: reduce)` 支持；未读版本卡片上的 `badge-pulse` 无限动画未随系统降动效偏好收敛。
2. **首页筛选栏交互缺陷（`src/pages/home/components/FilterBar/index.tsx` & `HomePage.tsx`）**：
   - `SortMenu` 为绝对定位浮层菜单，当前缺少点击外部自动关闭（`mousedown` 监听），点开后点击空白处无法收起。
   - `HomePage` 中 `allLanguages` 按字母排序后在 `FilterBar` 硬截断前 12 个（`slice(0, 12)`），导致 `TypeScript`、`Vue`、`Zig` 等高频语言在语言种类较多时直接不可见；且语言胶囊缺少 `whiteSpace: 'nowrap'` 与 `flexShrink: 0`，长语言名（如 `Jupyter Notebook`）容易折行挤压。
   - 当语言/标签/平台筛选生效时，缺少便捷的一键清除筛选入口。
3. **版本追踪与详情页 UI 缺陷**：
   - **Bug 修复**：`ReleasesPage.tsx:23` 中 `formatStars` 对 `>= 10000` 错误地除以 `10000` 并拼接 `k`（例如 50,000 星显示成 `5.0k`），与 `RepoRow.tsx` 不一致。
   - `ReleasesPage.tsx` 内容区外层容器整理为仅在空态时撑满高度，列表有数据时由内容自然流式排布。
   - `ReleaseDetail.tsx` 每次重渲染都重复调用 `renderMarkdown(displayContent)`。
   - `src/utils/markdown.tsx` 中图片 `![alt](url)` 未做 `getSafeExternalUrl` 协议校验，且缺少有序列表、斜体、删除线支持。
   - `DetailPage.tsx` 在 uTools 默认 800px 宽度下，顶栏多按钮缺少 `flexWrap: 'wrap'` / `flexShrink: 0` 保护，长仓库名 `h1` 缺少 `wordBreak: 'break-word'`。
4. **骨架屏复用**：已有 `SkeletonCard` 组件未接入页面切换加载兜底。

---

## 2. 优化实施方案

### 2.1 路由级代码分割与加载兜底（`src/App.tsx`, `src/pages/ReleasesPage.tsx`）
- 使用 `React.lazy` 懒加载 `DetailPage`、`SettingsPage`、`TagsPage`、`ReleasesPage`（适配命名导出：`lazy(() => import('./pages/DetailPage').then(m => ({ default: m.DetailPage })))`）。
- 包裹 `<Suspense fallback={<PageLoadingFallback />}>`：复用 `SkeletonCard` 构建轻量页面骨架占位（带简单顶栏骨架条 + 3 张 `SkeletonCard`），保证切页流畅且不阻塞 `HomePage` 首屏渲染。
- `ReleasesPage` 内部对 `ReleaseDetail` 使用 `React.lazy` 懒加载，弹窗打开时按需加载 Markdown 渲染器；`<Suspense>` fallback 采用轻量居中加载遮罩（`.modal-overlay` + `<Loader2 className="animate-spin" />`），避免弹窗骨架闪烁。

### 2.2 状态初始化收敛与 O(1) 标签索引（`src/App.tsx`, `src/stores/useStore.ts`, `src/pages/*`, `src/components/RepositoryCard.tsx`）
- **标签索引单源化**：在 `useStore` 中新增派生字段 `tagById: Map<string, Tag>`，在 `loadTags` / `setTags` / `addTag` / `updateTag` / `deleteTag` / `reorderTags` 时同步维护 `buildTagMap(tags)`。
  - `RepositoryCard` 订阅 `tagById`（而非每张卡片 `new Map(tags.map(...))`）。
  - `HomePage` 列表行与 `DetailPage` 通过 `tagById.get(id)` 进行 O(1) 查询，消灭 `tags.find(...)`。
- **消除重复装载**：
  - `App.tsx` 初始化阶段与 `loadRepositories()`、`loadReleases()` 一并调用 `loadTags()`。
  - `HomePage.tsx` 与 `DetailPage.tsx` **彻底移除**挂载时的 `loadTags()` 调用（依赖 `App` 启动装载 + store 变更同步 + 备份导入重载 `loadTags()`）。
  - `TagsPage.tsx` 移除 `loadTags()` 调用，将 `loadRepositories()` 收敛为仅当 `useStore.getState().repositories.length === 0` 时按需兜底加载（不破坏已加载数据与 `WeakMap` 搜索索引）。
  - `ReleasesPage.tsx` 移除挂载时的无条件 `loadReleases()`（启动已加载，且所有变更动作已同步更新 store，备份导入后亦会调用 `loadReleases()`）。

### 2.3 首页列表渲染与 FilterBar 性能优化（`src/pages/HomePage.tsx`, `src/pages/home/components/FilterBar/index.tsx`）
- **稳定 FilterBar props**：将 `onRequestListArea`、`onRequestToolbarArea` 用 `useCallback` 固定引用（内部通过 `currentReposRef` 或稳定逻辑避免随渲染重建），确保 `memo(FilterBar)` 真正生效；`filteredRepos` 的 `useMemo` 依赖数组移除未使用的 `tags`。
- **抽离 `memo` 化列表行组件 `ListRepoRow` 与稳定行回调**：
  - 抽离 `ListRepoRow = memo(...)`，接收 `repo`、`index`、`isActive`、`hasNote`、`tagById`、`lang`、`className`、`onSelect`、`onHover`（以及 `rowRef` 若需要；或者保持外层 `div` 负责 `ref`/`id`/`role="option"`/`onMouseEnter`/`onClick`，内层 `<ListRepoRowContent>` `memo` 化且不接收变动回调）。
  - 统一采取更干净且双视图（卡片/列表）一致的方式：
    - 声明稳定的 `handleRowMouseEnter = useCallback((index: number) => { setActiveRepoIndex(index); setKeyboardArea('list'); }, [])` 与既有的 `handleRepoClick`（`useCallback`）。
    - `ListRepoRow` 接收 `(repo, index, isActive, hasNote, tagById, lang, className, onSelect, onHover)`，内部用 `useCallback` 或直接调用 `onSelect(repo)` / `onHover(index)`——**禁止**在父组件 `map` 中传递内联箭头函数 `() => ...` 给 `memo` 子组件。卡片视图同样传 `onHover` 或将 `ListRepoRow` 仅作纯 `memo` 行组件，保证每次 `activeRepoIndex` 变更时仅新旧两行重渲染。
- **非虚拟化分页模式启用 `content-visibility: auto`**：
  - 仅在 `!isShowAllMode`（非虚拟化分页模式）下，为卡片外层容器挂 `.list-card-cv`，为列表行外层容器挂 `.list-row-cv`；虚拟化分支（`isShowAllMode === true`）保持原有布局样式，不加 `content-visibility`，确保不干扰 `@tanstack/react-virtual` 的 `measureElement`。
- **列表容器聚焦框类名**：`HomePage` 的 `role="listbox"` 容器增加 `className="repo-listbox"`，配合 `index.css` 修正内嵌焦点环。
- **语言筛选排序与可见性优化**：
  - `HomePage.tsx` 中 `allLanguages` 改为按仓库数量降序排序（数量相同时按字母序升序），确保常用主语言始终排在前面。
  - `FilterBar` 语言栏支持横向滚动（上限提升至 20，且若已选语言不在前 20 内则追加保留在列表末尾，防止已选状态丢失），每个语言胶囊设置 `whiteSpace: 'nowrap'` 与 `flexShrink: 0`。
  - 当语言/标签/平台任一筛选生效时，在工具栏统计数旁或语言栏提供轻量「清除筛选」按钮（复用 `t('clearFilter', lang)`，调用 `setSearchFilter({ languages: [], customTags: [], platforms: [] })`）。
- **SortMenu 点击外部关闭**：
  - 在 `FilterBar` 中用 `sortMenuContainerRef` 包裹排序按钮与 `SortMenu`，当 `showSortMenu` 为 `true` 时监听 `document` 的 `mousedown`，点击容器外部自动关闭 `SortMenu`。
  - 注：`TagFilterBar` 与 `PlatformFilterBar` 属于推入文档流的折叠筛选面板（非遮挡内容的浮层菜单），用户常需边展开边点击列表查看结果，故不加点击外部关闭，保持 Escape 与工具栏按钮切换关闭。

### 2.4 其他组件、服务与样式细节优化
- **`src/index.css`**：
  - `:root` 增加 `color-scheme: light;`，`:root.dark` 增加 `color-scheme: dark;`。
  - 增加 `.repo-listbox:focus-visible { outline-offset: -2px; }`。
  - 增加 `.list-card-cv { content-visibility: auto; contain-intrinsic-size: auto 122px; }` 与 `.list-row-cv { content-visibility: auto; contain-intrinsic-size: auto 60px; }`。
  - 为 `.lang-filter-bar` 增加紧凑型横向细滚动条样式（`scrollbar-width: thin` / `::-webkit-scrollbar` 高度 4px）。
  - 增加 `@media (prefers-reduced-motion: reduce)`，将动画/过渡收敛至 `0.01ms` 并停止无限循环动画（含 `.badge-pulse`）。
- **`src/pages/ReleasesPage.tsx` & `src/components/ReleaseDetail.tsx` & `src/utils/markdown.tsx`**：
  - 修复 `formatStars`：移除错误的 `/ 10000` 分支，对齐 `RepoRow.formatNumber` 两段式逻辑（`>= 1000` 返回 `${(count / 1000).toFixed(1)}k`，否则返回 `count.toString()`）。
  - `ReleasesPage` 列表有数据时外层容器取消固定 `height: '100%'`（仅空态容器保留撑满居中）。
  - `ReleaseDetail.tsx` 使用 `useMemo(() => displayContent ? renderMarkdown(displayContent) : null, [displayContent])` 缓存 Markdown 渲染树。
  - `markdown.tsx`：
    - 图片节点 `![alt](url)` 对 `url` 执行 `getSafeExternalUrl(url)` 校验，非 `http:`/`https:` 协议回退为纯文本 `[alt]`，补充 `loading="lazy"` 与 `decoding="async"`。
    - `parseInline` 正则严格保持 `\*\*.*?\*\*` 在斜体之前，斜体采用 `\*[^\s*](?:[^*]*[^\s*])?\*` 避免匹配 `5 * 3 * 2` 这类含空格星号（接受纯紧贴文本星号为既有边界），并补充删除线 `~~.*?~~`；块级解析补充有序列表 `^\d+\.\s+`（保留原序号前缀）。
- **`src/pages/DetailPage.tsx`**：
  - 使用 `tagById.get(tagId)` 替代 `tags.find(...)`。
  - 顶栏补充 `flexWrap: 'wrap'` 与按钮 `flexShrink: 0`，仓库标题 `h1` 增加 `wordBreak: 'break-word'`，头像补充 `decoding="async"`。
- **`src/components/RepoRow.tsx`**：
  - 头像 `<img>` 补充 `width={40}`、`height={40}`、`decoding="async"`，并添加加载失败标记（`onError` 状态按 `avatarUrl` 重置，失败时回退渲染 `<Box>` 占位图标）。
- **`src/pages/SettingsPage.tsx`**：
  - `analyzedStats` 合并为单次遍历 `for (const r of repositories)`。
  - `handleExport` 将 `URL.revokeObjectURL(url)` 延迟 `1000ms` 释放。
- **`src/utils/benchmark.ts`**：
  - `timeOnce` / `timeOnceAsync` 在 `!import.meta.env.DEV` 时直接执行并返回 `fn()`，消除生产环境控制台日志与计时开销。

---

## 3. 不修改边界与风险说明

### 3.1 不修改边界
- 不修改 `preload.js` 数据存储格式（v2 分片格式、`dbCryptoStorage` key）与 `aiService.ts` AI 额度防护逻辑（熔断、5 分钟冷却、非空校验、20s 增量落盘）。
- 不修改 `SEARCH-RESTORE-BACKSPACE-PLAN` 已确定的返回快捷键（Backspace + `⌫` chip）、滚动恢复指纹与 `subInput` 防抖/抑制逻辑。
- 不修改 `@tanstack/react-virtual` 虚拟列表的行为分支（`itemsPerPage === 0` 时维持现有 `measureElement` 与 `getItemKey`）。

### 3.2 已知边界与风险备案
1. **`content-visibility: auto` 与 B3 滚动恢复的交互**：分页 50/100 模式下，首次返回首页恢复 `scrollTop` 时，未挂载到视口的行使用 `contain-intrinsic-size: auto 122px`（卡片）/ `auto 60px`（列表）估算占位；由于带多行标签或两行描述的卡片实际高度可能略高于 122px，首次恢复可能有轻微像素偏移（已渲染过的行因 `auto` 记忆实际高度，且键盘 `scrollIntoView` 时行会即时物化）。
2. **`React.lazy` 首次切页窗口**：首次打开 `DetailPage`/`SettingsPage`/`TagsPage`/`ReleasesPage` 时存在毫秒级本地异步加载窗口，加载完成前 `useBackShortcut` 尚未挂载；由于 uTools 本地文件读取在数毫秒内完成，且页面已通过 `Suspense` 呈现明确加载状态，属于可接受范围。

---

## 4. 验证计划

### 4.1 自动化检查
1. `npx tsc --noEmit` 零类型错误。
2. `npm run build` 成功构建，核对主包体积显著下降且按二级页面拆分出独立 lazy chunk。
3. `node scripts/smoke-storage.mjs` 全部通过（确保存储与既有逻辑未受影响）。

### 4.2 人工回归清单（实施后必核）
1. **返回与滚动恢复**：分别在分页模式（50/100 条）与"全部"模式（虚拟滚动）下滚动列表 → 进入仓库详情页 → 按 `Backspace` 或点击 `⌫ 返回` chip → 确认回到原滚动位置与搜索关键词/页码一致。
2. **键盘导航与跟随**：首页使用 `ArrowUp` / `ArrowDown` 切换焦点行、`Enter` 进入详情、`ArrowLeft` / `ArrowRight` 翻页，确认列表容器焦点框不被裁切且选中行稳定滚入视口。
3. **标签跨页一致性**：进入 `TagsPage` 新建、编辑、拖拽排序、删除标签后返回首页与详情页，确认标签顺序、颜色、计数及卡片显示实时同步，且不丢失搜索索引。
4. **筛选与 SortMenu**：点击 SortMenu 外部空白区域确认菜单自动收起；切换热门语言、标签、平台筛选后点击「清除筛选」确认全部复位；暗色模式下检查 `<select>` 下拉框颜色正常。
5. **备份导入往返**：在设置页导出备份并重新导入，确认 `repositories`、`tags`、`releases` 与 `token` 状态一致刷新。
6. **子输入框进出恢复**：uTools 关键词进入 / 带词搜索进入 / 返回首页后子输入框值与 store 一致。
