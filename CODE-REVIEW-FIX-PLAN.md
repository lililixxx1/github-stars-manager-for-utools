# 全面代码审核缺陷修复方案（P1 批次）

> 版本：v1.4（定稿：v1.1 复审"通过" → v1.2 并入勘误 → plan-code-reviewer 终审"通过"（无 Blocker），已并入终审 M1–M3/G1–G4/L1 建议，见 §10；v1.4 并入实现期发现的 §4.5 算法边界条件修正，见 §11）
> 基准代码：master @ 367ccf6 + 未提交的 R1–R8 修复工作区（AI-QUOTA-FIX-PLAN.md v3.2，三轮审核通过）
> 输入：全量代码审核（45 文件 / ~8700 行）+ 二次复审定稿结论 + 一审（独立审核者）修正
> 硬约束：**不改变 R1–R8 的任何既有行为**（F1 仅使 R1 的失败冷却真正生效，属加强）；不引入新的数据结构迁移

---

## 1. 问题陈述

全面审核 + 复审确认 **6 个 P1 缺陷 + 3 个一行级缺陷**（F1–F9）。其中：

- **F1 直接削弱 R1 引入的失败冷却机制**（额度相关，最高优先）；
- F3 关系到用户数据完整性（备份丢失 + 畸形数据白屏）；
- F2/F5/F6 为状态正确性缺陷；
- F7/F8/F9 为一行级顺手修（一致性守卫 / 用户可见文本乱码 / 死导入）。

## 2. 审核结论定稿（复审 + 一审修正后）

| 分类 | 条目 |
|---|---|
| **成立，本批修复** | F1–F6、F8、F9（P1）；F7（降级为一行级一致性修，见 §3 F7 更正） |
| **误报撤回（不修）** | ① HomePage `hasRepoNote` 存储读取误报（实为内存 Set）；② `inFlightAiCalls` abort 泄漏误报（`abortAiCall` 末尾 `clear()` 已覆盖）；③ FilterBar 面板 setTimeout 清理误报（effect 有 cleanup）；④ **F7 原"import 阶段 TypeError 白屏"定性错误**（一审 H1：调用位于 `aiService.ts:15-24` 的 try/catch 内，异常被捕获仅 console.error，模块加载不失败） |
| **降级延后（见 §6）** | `buildNoteIndex` O(N) IO（仅启动/同步完成/导入时一次 ~100ms 级）；ReleasesPage 卸载后 timer（React 19 静默 no-op） |
| **一审新增事实修正** | F3 原声明"导入后 `shouldPerformFullSync` 判真 → 自动全量重建"不成立（H2，见 §4.3 第 4 步修正） |

## 3. 根因清单（定稿）

### F1 — DetailPage `selectedRepo` 快照绕过失败冷却 + 失败态显示为成功（P1，额度相关）
- **位置**：`src/pages/DetailPage.tsx:186-231`（executeAnalyze/markFailure）、`:783`（显示条件）
- **现象 A（冷却绕过）**：`markFailure` 只调 `updateRepository`，不更新 `selectedRepo`。失败后停留详情页时，页面持有旧快照（`analyzedAt` 为 undefined），再次点击"AI 分析"→ `checkAnalysisNeeded(repo)`（:163）读旧值 → 判定 `never`（utils/analysis.ts:40-41）→ **跳过 24h 冷却直接重发 AI 调用**。网络类失败形成"点击-失败-可再点"循环。
- **现象 B（失败显示为成功）**：`:783` 条件为 `repo.analyzedAt ?`。批量分析失败的仓库（R8 修复后 `markFailed` 会写 `analyzedAt=尝试时间 + analysisFailed=true`）从首页进入详情页，走绿色 ✓ "已分析于 X" 分支，红色失败分支（:817-821）不可达。
- **现象 C（本页失败无反馈）**：本页单发失败后 UI 停留在"点击分析"，与 store 实际状态脱节。
- **同根**：`selectedRepo` 快照模式 = 双数据源。

### F2 — 非 home 页经 uTools 指令进入时搜索关键字被清空（P1）
- **位置**：`src/App.tsx:220-229`（`[currentPage]` effect）vs `:181-203`（enter handler）
- **根因**：effect 无条件在到达 home 时 `setSearchFilter({keyword:''})`。从 detail/settings 等页触发 `github-stars-search`（或 `github-stars-repo` 未命中 fallback）时：handler 设 keyword → currentPage 变更 → effect 后置执行 → **清空**。子输入框被二次 `setSubInput` 重建，`setSubInputValue` 的值也可能丢失。
- **注意**：仅在"进入前不在 home"时触发（currentPage 无变化则 effect 不运行）。
- **已知冗余（不改，L1）**：`github-stars` 主 enter 分支（:175-179）从非 home 页进入时 handler 与 effect 会重复执行"清空+setup"各一次，行为等价，仅多一次冗余调用。

### F3 — 导出遗漏五类数据 + 导入零校验 + 导入后增量状态错配（P1，数据完整性）
- **位置**：`src/pages/SettingsPage.tsx:110-157`
- **导出**：仅含 `repositories + settings`，**丢失 tags / notes / subscriptions / readReleaseIds / categories**；`version: '1.4.0'` 写死。
- **导入**：`setRepositories(data.repositories)` 无任何 schema 校验。畸形条目（如缺 `owner.login`）→ `RepositoryCard` render 抛 TypeError → **整树卸载白屏**（全应用无 ErrorBoundary，见 F4）。
- **增量状态错配（一审 H2 确认）**：`shouldPerformFullSync`（githubService.ts:181-186）在"本机 7 天内同步过 + 导入的 repos 非空"时判**假** → 下次同步走增量，与本机残留的旧 `syncState`（`latestStarredAt`/`latestRepoIds`）错配，导入的异构数据无法被正确全量对账。

### F4 — 全应用无 ErrorBoundary（P1，与 F3 构成数据完整性防线）
- **位置**：`src/main.tsx:5`
- 任何 render 异常都会白屏且用户在 uTools 内无恢复手段。

### F5 — 分片阈值按字符数而非字节数（P1，中文数据溢出风险）
- **位置**：`preload.js:81,224,234`
- `json.length < MAX_REPOS_CHUNK_SIZE`（900×1024）统计 UTF-16 码元。仓库描述多含中文时：900K 字符 ≈ 2.7MB UTF-8，可突破 dbStorage 单文档 ~1MB 限制。
- **兼容性约束**：读取端（`loadStoredRepos` 的 `chunks.join('')`）不变；`saveStoredRepos` 每次全量重写（新 `shardPrefix` + 旧分片清除），新旧分片不会在同一 meta 下混存；旧分片是完整字符串切片，新写法必须保证每个 chunk 仍是合法 UTF-8 字符串。

### F6 — `syncRepositories` 闭包 `settings` 回滚用户中途修改（P1）
- **位置**：`src/stores/useStore.ts:297,338-349`
- 同步是长任务，期间用户改语言/主题 → 同步完成 `set({settings: nextSettings})` 用**开始时的快照**覆盖 → 用户修改被静默撤销（内存+落盘双重回滚）。
- 附带：函数内 `const lang = ...`（:298）是死变量。

### F7 — `aiService` 模块加载期访问守卫一致性（一行级一致性修；原 P1 定性经一审更正）
- **位置**：`src/services/aiService.ts:16`
- **定性更正（一审 H1）**：该调用位于 try/catch 内（:15-24），对象缺失时抛出的 TypeError 会被捕获并 console.error，**模块加载不会失败、不会白屏**——原"import 阶段白屏"属现象级误报。且仅修此处也无法让浏览器 dev 环境可渲染（`loadSettings → window.githubStarsAPI.getSettings()` 等多处运行期访问同样无守卫，那是系统性问题，超出本批）。
- **保留理由**：`window.githubStarsAPI?.getAiTranslations?.()` 与项目其余代码的守卫风格一致，属无害的一致性改进，随手并入。

### F8 — 笔记内容双重转义（一行修，用户可见乱码）
- **位置**：`src/pages/DetailPage.tsx:19-26,920`
- React 文本节点自动转义，再 `escapeHtml()` 会双重转义：笔记中的 `&` 显示为 `&amp;`、`<` 显示为 `&lt;`。（已核实 `escapeHtml` 全项目仅此一处使用，可随修删除。）

### F9 — `AnalyzeProgress` 死导入：批量分析期间无全局进度/中止入口（一行修）
- **位置**：`src/App.tsx:8`（导入）、`:240-257`（未渲染）
- 组件自带 `!isAnalyzing || !analyzeProgress` 返回 null 的守卫（已核实），渲染即可；当前批量分析进行中用户离开设置页后无任何进度与停止 UI。

---

## 4. 修复方案（按文件）

### 4.1 `src/types/index.ts` + `src/stores/useStore.ts` + `src/App.tsx` + `src/pages/HomePage.tsx` + `src/pages/home/hooks/useHomePage.ts` + `src/pages/DetailPage.tsx`（修 F1）

**方案：消灭快照，详情页仓库对象由 store 派生（单一数据源）。**

1. **store 字段替换**：`selectedRepo: Repository | null` → `selectedRepoId: number | null`；setter 同步更名。
2. **调用点清单（一审 M1 修正）**：
   - App.tsx `open-repo` handler 与 `github-stars-repo` 分支：`setSelectedRepo(repo)` → `setSelectedRepoId(repo.id)`；
   - HomePage.tsx `handleRepoClick`：同上；
   - **`src/pages/home/hooks/useHomePage.ts:82,141,143`**：该文件属 §6 待删死代码，但参与 tsc 编译——**同步机械改名**（`setSelectedRepo` → `setSelectedRepoId`、传参改 `repo.id`），保持可编译；随死代码清理提交一并消失；
   - DetailPage.tsx：内部多处（见下）。
3. **DetailPage 派生读取**：
```tsx
const selectedRepoId = useStore(s => s.selectedRepoId);
const repo = useStore(s =>
    s.selectedRepoId == null ? null : (s.repositories.find(r => r.id === s.selectedRepoId) ?? null)
);
```
   - zustand v5 selector 结果按 `Object.is` 比较：`find` 返回数组内条目引用，仅当该条目被替换（R8 的 onProgress 逐条替换、`updateRepository` 的 map 替换均产生新引用）时才重渲染 → 详情页实时刷新，预期改善。
   - 派生后**删除**成功路径/别名保存/标签切换里的 `setSelectedRepo(...)` 调用（`updateRepository` 已写 store，派生值自动刷新；三处调用点瘦身）。
4. **兜底 effect**（仓库被同步删除时不再显示幽灵页——本方案唯一全新行为）：
```tsx
useEffect(() => {
    if (selectedRepoId != null && !repo) {
        setSelectedRepoId(null);
        setCurrentPage('home');
    }
}, [selectedRepoId, repo, setCurrentPage, setSelectedRepoId]);
```
   - 无瞬态误跳风险（已核验 useStore 全部 `set({repositories})` 调用点）：`loadRepositories` 同步执行、sync 为合并完成后单次原子 set、其余均 map 替换，不存在先清空后填充的中间态。
5. **显示逻辑修正（现象 B，终审 M2 三态设计）**：`:783` 起改为三分支——
   - `repo.analyzedAt && !repo.analysisFailed` → 成功分支（现状 UI）；
   - `repo.analyzedAt && repo.analysisFailed` → **保留展示既有 aiSummary/aiTags/aiPlatforms**，区块底部附加红色横幅"最近一次分析失败，{getCooldownHours(repo)} 小时后可重试"（避免"曾成功 → 重分析失败"场景下旧摘要被整体隐藏）；
   - `!repo.analyzedAt` → 原失败/空分支（含 `analysisFailed` 红色 ✗）。
6. **`loadNote(selectedRepo.id)` 等 effect 依赖**改挂 `selectedRepoId`。

**修复后行为**：现象 A——失败后 `repo` 派生自 store（已含 `analysisFailed + analyzedAt`），再次点击即命中 `failed_cooldown` → 冷却提示（R1 真正生效）；现象 B/C 同步消失。

### 4.2 `src/App.tsx`（修 F2 + F9）

**F2——一次性保留标志（精确控制泄漏）：**
1. 组件内 `const preserveHomeKeywordRef = useRef(false);`
2. enter handler 两个设关键字的分支（`github-stars-search` 与 `github-stars-repo` fallback），在 `setCurrentPage('home')` **之前**（时序关键：zustand set 同步生效，之后 `getState().currentPage` 已变）：
```tsx
if (useStore.getState().currentPage !== 'home') {
    preserveHomeKeywordRef.current = true;  // 仅当确实会发生页切换（effect 将运行）才设标志
}
```
3. `[currentPage]` effect 改为：
```tsx
if (currentPage === 'home') {
    if (preserveHomeKeywordRef.current) {
        preserveHomeKeywordRef.current = false;  // 消费：仅本次跳过清空与重建
    } else {
        useStore.getState().setSearchFilter({ keyword: '' });
        setupRepositorySearchSubInput(true);
    }
} else {
    releaseRepositorySearchSubInput();
}
```
- **防泄漏设计**：已在 home 时 effect 不会运行 → 不设标志 → 后续真实的"返回首页"清空语义（v1.6.4）不受影响。
- **时序依据**：enter handler 是 uTools 回调（React 外同步执行），effect 必然在其后的提交阶段运行，顺序有保证。
- 顺手补齐：`github-stars-repo` fallback 分支增加 `utools.setSubInputValue(payload)`（与 search 分支一致，消除子输入框与 store 关键字不同步）。

**F9**：App JSX 中渲染 `<AnalyzeProgress />`（放在 ConfirmDialog 之前；组件 idle 时返回 null 无布局影响；与确认弹窗无同时可见窗口——弹窗出现于分析启动前）。

### 4.3 新增 `src/utils/backup.ts` + `preload.js` + `src/types/index.ts` + `src/pages/SettingsPage.tsx`（修 F3）

**导出格式（schemaVersion 2，加法式演进）：**
```json
{
  "schemaVersion": 2,
  "exportedAt": "ISO",
  "repositories": [...],
  "settings": {...},
  "tags": [...],
  "notes": [...],
  "releaseSubscriptions": [repoId...],
  "readReleaseIds": [releaseId...],
  "categories": [...]
}
```
- 刻意**不含 syncState**：改为由导入流程显式清除本机 syncState（见第 4 步，一审 H2 修正），下次同步必然全量重建，杜绝导入数据与旧增量状态错配。

**`src/utils/backup.ts` 导出两个可单测的工具函数（buildBackup 含 store/window 外部依赖，单测时需注入或 mock）：**
```ts
buildBackup(): BackupData            // 数据源（一审 M6）：repositories 取 useStore.getState().repositories（内存最新值，
                                      // 避开 R8 批量分析 20s 节流落盘窗口导致导出丢最近分析结果）；其余六类从 window.githubStarsAPI 读
validateBackup(raw: unknown):
  | { ok: true;  data: ValidatedBackup; skipped: { repos: number; tags: number; notes: number } }
  | { ok: false; error: string }
```
校验规则（**宽松规整 + 关键字段硬校验**，单条无效跳过并计数，不整批拒绝）：
- `raw` 非对象 → reject；
- `repositories`：存在则必须为数组。逐项硬校验 `id:number`、`name:string`、`fullName:string`、`owner` 为对象且 `owner.login:string`、`htmlUrl:string`，缺任一 → 跳过该条；软规整：`customTags/topics` 非数组 → `[]`，**`stargazersCount/forksCount` 非 number → `0`**（一审 M3 提出、终审 M1 更正引用：真正抛 TypeError 的是 `DetailPage.tsx:573/577` 与 `HomePage.tsx:330` 的直接 `.toLocaleString()` 调用；`RepositoryCard:111/115` 走 `formatNumber()` 不抛错但会显示 "undefined"。软规整同时防住两类问题）；
- `tags`：存在则必须为数组，硬校验 `id:string`、`name:string`，缺 → 跳过；`order` 缺省由导入顺序补；
- `notes`：硬校验 `repoId:number`、`content:string`；且 `repoId` 必须存在于有效 repositories（孤儿笔记丢弃）；
- `releaseSubscriptions` / `readReleaseIds`：过滤非 number 元素；subscriptions 再过滤不存在于有效 repositories 的 id；
- `categories`：对象数组，硬校验 `id`、`name`；
- `settings`：对象即接受（沿用现有 merge 语义）。

**preload.js 新增（types 同步声明）：**
```js
setNotes: (notes) => {
    // 逐条原样写入，保留备份中的 createdAt/updatedAt
    notes.forEach(n => utools.dbStorage.setItem(`gh:note:${n.repoId}`, n));
},
clearSyncState: () => {
    // 导入备份后清除本机增量同步状态，强制下次同步走全量对账（F3/H2）
    utools.dbStorage.removeItem('gh:syncState');
},
```

**SettingsPage（一审 M2：写入 API 明确走 preload 层 `window.githubStarsAPI.*`，store 层无这些 setter）：**
- `handleExport` → `buildBackup()`；
- `handleImport`：
  1. 入口检查 `useStore.getState().syncStatus === 'syncing'` → 通知"同步进行中，请稍后再导入"并中止（终审 M3：防导入与在途同步交错——sync 完成会重建 syncState，使第 4 步 clearSyncState 失效）；随后 `JSON.parse`（沿用现有 catch 提示）；**reader.onload 回调内再检查一次 syncStatus**（文件选择对话框期间同步可能已启动）；
  2. `validateBackup` → `!ok` → 通知 `error` 并中止；
  3. 逐类写入（**字段存在才写**；`repositories` 为数组即写入——包括空数组，属用户主动导入空备份的合法语义；字段缺失则跳过该类，天然兼容旧格式备份）：
     `window.githubStarsAPI.setRepos` / `.setTags` / `.setNotes`（新增）/ `.setReleaseSubscriptions` / `.setReadReleaseIds` / `.setCategories`；
  4. **若第 3 步写入了 repositories**：调用 `window.githubStarsAPI.clearSyncState()`（新增）清除本机 `gh:syncState`，下次同步 `shouldPerformFullSync` 必然判真走全量；
  5. `settings` 存在 → `saveSettings(data.settings)`；
  6. **状态刷新**：`loadRepositories()`（内含 isSubscribed 对齐 + note 索引重建）+ `loadTags()` + `loadReleases()`（重算 isRead）+ **`useStore.setState({ currentNote: null })`**（终审 G3：清残留的旧仓库笔记，DetailPage 按需重新 loadNote）；
  7. **bump `subscriptionVersion`**（`useStore.setState(s => ({ subscriptionVersion: s.subscriptionVersion + 1 }))`）——FilterBar 的 `subscribedCount` 仅依赖 `subscriptionVersion`，不 bump 则导入订阅后计数不刷新；
  8. 通知：`导入成功：X 个仓库（跳过 Y 条无效记录）、Z 个标签、N 条笔记、M 个订阅`。
- **宽松语义已知限制（L3，明示）**：导入为"字段缺失跳过、不删除本机既有数据"——导入一份较小备份后，本机多出的 tags/notes 会保留。属有意设计（防误删），完整替换需用户先清空本地数据。

### 4.4 新增 `src/components/ErrorBoundary.tsx` + `src/main.tsx`（修 F4）

- class 组件：`static getDerivedStateFromError` 置错误态；`componentDidCatch` 里 `logger.error` 上报。
- fallback UI：卡片显示"插件渲染出错"+ 错误 message（pre-wrap，截断 500 字）+ 两个按钮：**复制详情**（`typeof utools !== 'undefined' && utools.copyText(...)`，L2：浏览器 dev 下无 `utools` 时静默降级）、**重新加载**（`window.location.reload()`）；文案附注"若持续出现请联系开发者"（终审 L1：reload 在持续崩溃场景可能循环，明示出口）。
- `main.tsx`：`render(<ErrorBoundary><App /></ErrorBoundary>)`。
- **明确不做**"重置本地数据"按钮——破坏性操作需单独确认流程，超出本批范围（记录于 §6）。

### 4.5 `preload.js`（修 F5）

```js
const json = JSON.stringify(repos);
const buf = Buffer.from(json, 'utf8');

if (buf.length < MAX_REPOS_CHUNK_SIZE) { /* 原非分片路径不变 */ return; }

const chunks = [];
let offset = 0;
while (offset < buf.length) {
    let end = Math.min(offset + MAX_REPOS_CHUNK_SIZE, buf.length);
    // 回退到 UTF-8 字符边界：若切点后一字节(buf[end])是续字节(0b10xxxxxx)，
    // 说明切点落在多字节字符中间，回退至其领头字节之前（v1.4 修正，见 §11）
    while (end > offset && end < buf.length && (buf[end] & 0xc0) === 0x80) end--;
    if (end === offset) end = Math.min(offset + MAX_REPOS_CHUNK_SIZE, buf.length); // 防御分支（合法 UTF-8 下不可达）
    chunks.push(buf.slice(offset, end).toString('utf8'));
    offset = end;
}
```
- `MAX_REPOS_CHUNK_SIZE` 语义改为字节，数值不变（900KB < 1MB 限额，保留余量）。
- 前置事实：ES2019 起 `JSON.stringify` 输出 well-formed（孤立代理对被转义为 `\udXXX` 文本），故 `json` 必为合法 UTF-8，回退循环必然终止于字符边界。
- 读取端不变：旧字符分片与新字节分片都是合法字符串，`join('')` 后 `JSON.parse` 通用。

### 4.6 `src/stores/useStore.ts`（修 F6）

`syncRepositories` 内：
- `const nextSettings = { ...get().settings, lastSyncTime: Date.now() };`（合并基座取最新 state，与 R4 同思想）；
- 删除死变量 `const lang = ...`（:298）。
- 其余（`repositories` 闭包传给 `syncRepos` 作启发式判断）维持现状——合并基座已由 R4 修复取 `get().repositories`。

### 4.7 `src/services/aiService.ts`（修 F7，一致性）

`:16` 改为 `window.githubStarsAPI?.getAiTranslations?.() || {}`（补对象级可选链；防白屏价值已被 try/catch 覆盖，此处仅为与全项目守卫风格一致）。

### 4.8 `src/pages/DetailPage.tsx`（修 F8）

`{escapeHtml(currentNote.content)}` → `{currentNote.content}`；删除 `escapeHtml` 函数（全项目唯一使用点，React 文本节点自动转义，无 XSS 损失）。

---

## 5. 执行步骤

1. 按 §4.1–4.8 修改：**10 个既有文件**（types/index.ts、useStore.ts、App.tsx、HomePage.tsx、useHomePage.ts[仅机械改名]、DetailPage.tsx、SettingsPage.tsx、preload.js、aiService.ts、main.tsx）+ **2 个新文件**（utils/backup.ts、components/ErrorBoundary.tsx）。
2. `npm run build`（tsc 严格检查 + vite）通过。
3. `git diff` 逐文件复核 + grep 确认 `selectedRepo`/`setSelectedRepo` 无残留引用。
4. 人工核验清单（§7）。

## 6. 明确不修（本批范围外，记录备忘）

| 条目 | 理由 |
|---|---|
| 浏览器 dev 环境系统性无守卫访问（`loadSettings → getSettings()` 等多处） | 一审 H1 确认属系统性问题（preload 缺失时 App mount 即抛错），需统一的 API 访问层设计，独立成批 |
| N5 HomePage setState updater 内副作用 | P2，StrictMode 双调用仅影响 dev，需重构键盘导航逻辑，独立成批 |
| N6 删除 `hashContent` 改全等比较 | P2，缓存校验逻辑变更需独立验证（碰撞窗口极小） |
| L3 `buildNoteIndex` 缓存化 / L9+N7 `deleteTag` 单次写回 | P2 性能项，涉及 preload 存储层重构 |
| L10 syncStatus 3s timer 竞态 | P2，触发窗口窄（3 秒内二次同步） |
| L18 TagManager 非响应式 lang / L21 `getUnreadCount()()` 反模式 | P2，实际影响近零（有旁路订阅触发重渲染） |
| L19 版本号硬编码 | 需 vite define 配置，构建链变更独立处理 |
| 死代码清理（~610 行：benchmark/useHomePage/useFilterState/UnreadBadge/barrel） | 零风险但大 diff 混入逻辑修复有损评审粒度，独立 hygiene 提交（本批仅对 useHomePage.ts 做 F1 机械改名以保持可编译） |
| ErrorBoundary 的"重置数据"按钮 | 破坏性操作，需单独设计确认流程 |
| preload 生产环境日志守卫 | P2 体验项 |
| `src/pages/CLAUDE.md` 的 XSS 防护条目 | F8 删除 escapeHtml 后该条目失效，随死代码 hygiene 提交一并更新（终审 G4） |

## 7. 验证计划

**静态**：`npm run build` 零错误；`grep -rn "selectedRepo[^I]" src/` 确认旧字段无残留（排除 `selectedRepoId`）。

**逻辑推演（代码级，可离线验证）**：
- F1：模拟 `updateRepository(id, {analysisFailed:true, analyzedAt:now})` 后 → 派生 repo 含两字段 → `checkAnalysisNeeded` 返回 `failed_cooldown` → 详情页再点触发冷却提示而非重发；批量失败仓库进详情页 → 红色失败分支渲染；**兜底用例（一审 M5）：构造 `selectedRepoId` 指向的仓库不在 `repositories`（模拟同步删除）→ 断言自动 `setCurrentPage('home')` 且 `selectedRepoId` 复位为 null**；**M2 用例：曾成功分析的仓库重分析失败 → 断言旧摘要仍展示且附带失败/冷却横幅**。
- F2：构造 currentPage='detail' + enter(payload='react') → 断言 keyword 保留且子输入框不重建；随后用户 detail→home 导航 → 断言 keyword 被清空（标志已消费，无泄漏）；home 状态下再次 search 进入 → 无 effect 运行、无标志残留。
- F3：导出 JSON 含七类字段且 repositories 与内存态一致；导入 schemaVersion 2 全量恢复（含订阅计数刷新）；导入旧格式（无 tags 字段）仅恢复 repos+settings；畸形条目（缺 owner.login / stargazersCount 非数字）被跳过或规整且计数进通知；**导入写入 repositories 后断言 `gh:syncState` 已清除，随后触发同步断言 `shouldPerformFullSync === true` 走 full 模式（一审 H2 用例）**；**M3 用例：syncStatus='syncing' 时触发导入 → 断言被拒绝并提示（终审 M3）**。
- F5：构造含大量中文的 2MB 数据 → 断言**分片数 ≥ ceil(bytes/900KB) 且每片字节 ≤ 900KB**（字符边界回退可使片数 +1，一审 M5 放宽），每片 `toString('utf8')` 重新编码无替换字符（U+FFFD）；`loadStoredRepos` 完整还原；**G2 回读兼容用例：手工构造旧版字符分片（sharded meta + 字符串切片）→ 断言 `loadStoredRepos` 仍完整还原（终审 G2）**。
- F6：同步进行中切换语言 → 同步完成后断言语言保留。
- F4：在任一组件 render 中 throw → 断言 fallback UI 显示且可 reload；复制按钮在无 `utools` 环境不抛错。
- F7：浏览器环境（无 preload）`npm run dev` → 断言翻译缓存预热失败仅 console.error、模块加载正常（不承诺应用整体可渲染，见 §6 第一条）。
- F8：笔记含 `<b>&amp;</b>` 字面量 → 断言按原样显示。
- F9：批量分析进行中切到首页 → 断言右下角浮窗出现且可中止。

**uTools 手动清单（交付用户）**：
1. 分析失败后不离开详情页，再次点击"AI 分析"→ 应提示 24h 冷却而非重新发起；
2. 从设置页通过 uTools 搜索词/`owner/repo` 进入 → 关键词应生效且子输入框同步显示；
3. 导出 → 删除标签/笔记/订阅 → 导入 → 七类数据全部恢复，首页订阅计数正确；导入后再手动同步 → 应执行全量同步；
4. 导入含畸形记录的文件 → 通知显示跳过数量，应用不白屏；
5. 大量含中文描述的仓库同步 → 分片落盘后重启插件数据完整；
6. 同步进行中修改界面语言 → 同步完成后语言不被回滚；
7. 批量分析进行中切到首页 → 右下角出现进度浮窗且可中止；
8. 详情页停留期间（模拟）该仓库被同步移除 → 自动返回首页。

## 8. 风险与回滚

- **F1 是状态结构变更**（`selectedRepo` → `selectedRepoId`）：调用点已全量梳理（App×2 / HomePage×1 / useHomePage×3[机械改名] / DetailPage 内部），构建期即可验证无遗漏；行为差异（详情页数据实时刷新、被删仓库自动返回）均为预期改善；显示逻辑三分支化属 UI 行为变化（重分析失败保留旧摘要+横幅），终审 M2 要求注明。
- **F3 导出格式**为加法式：旧版插件导入新备份时只读取 `repositories/settings`（其余字段被忽略），**天然向后兼容**；新版导入旧备份走"字段缺失跳过"路径。导入的宽松语义（不删本机多余数据）为已知限制（§4.3）。导入后强制全量同步属预期行为（首次同步耗时增加），换取数据一致性。
- **F5 仅改写入端**：已落盘的旧字符分片仍可读；`saveStoredRepos` 每次全量重写分片（新前缀+旧分片清除），回滚后新字节分片同样可被旧代码读取（都是合法字符串切片）。
- **F2/F6/F7/F8/F9** 均为局部小改，无数据结构影响。
- 回滚：全部改动位于未提交工作区，`git checkout -- <file>` 即可恢复；无新增持久化 key（F3 的 `setNotes` 复用现有 `gh:note:*` 键空间；`clearSyncState` 仅删除现有 key）。

## 9. 一审意见落实说明（v1 → v1.1）

| 一审条目 | 落实 |
|---|---|
| H1（F7 定性错误：try/catch 已防白屏；dev 可渲染目标不可达） | §2 撤回表追加第 ④ 条误报记录；§3 F7 重写定性为一行级一致性修；§4.7 改注；§7 F7 用例改为"预热失败仅 console.error"；§6 新增"浏览器 dev 系统性无守卫访问"条目 |
| H2（导入后 `shouldPerformFullSync` 不必然判真，增量错配风险） | §3 F3 增补第三段根因；§4.3 新增 preload `clearSyncState` + 导入第 4 步显式清除；§7 增补"导入后同步走 full 模式"推演用例与手动清单第 3 条后半；§8 更正声明 |
| M1（useHomePage.ts 死代码引用 `setSelectedRepo` 会致编译失败） | §4.1 调用点清单补入（机械改名保持可编译）；§5 文件清单与 §6 死代码条目注明 |
| M2（写入 API 命名歧义） | §4.3 明确 `window.githubStarsAPI.*` 前缀并注明 store 层无这些 setter |
| M3（`stargazersCount/forksCount` 缺失仍可致渲染崩溃） | §4.3 校验规则补软规整"非 number → 0" |
| M4（文件计数错误） | §5 更正为 9 个既有 + 2 个新文件 |
| M5（F1 缺兜底用例；F5 分片数断言过严） | §7 F1 补"仓库被删自动返回"推演+手动用例；F5 放宽为"片数 ≥ ceil 且每片 ≤ 900KB 且无 U+FFFD" |
| M6（buildBackup 数据源取舍未说明） | §4.3 明确 repositories 取内存态、其余取 preload，并说明理由（R8 20s 节流窗口） |
| L1/L2/L3 | §3 F2 注明冗余不改；§4.4 复制按钮加 `typeof utools` 守卫；§4.3 末尾明示宽松导入语义为已知限制 |
| 复审勘误（v1.2，"通过"后非阻断项） | ① §5 文件计数 9 → 10（列表本就完整，仅汇总数字错）；② §4.3 buildBackup "纯函数"措辞更正为"可单测的工具函数（含 store/window 依赖）" |

## 10. plan-code-reviewer 终审意见落实说明（v1.2 → v1.3）

终审（专用审核代理，逐条对照源码独立核验）裁决"**通过**"（无 Blocker），以下建议项已全部并入：

| 终审条目 | 落实 |
|---|---|
| M1（`RepositoryCard:111/115` 实为 `formatNumber()` 不抛错；真正崩溃点是 `DetailPage:573/577` 与 `HomePage:330` 的直接 `.toLocaleString()`） | §4.3 校验规则更正引用，"非 number → 0"软规整结论不变 |
| M2（重分析失败会整体隐藏旧摘要） | §4.1 第 5 步改为三态显示（成功 / 保留旧摘要+失败冷却横幅 / 未分析）；§7 F1 补 M2 用例；§8 注明 UI 行为变化 |
| M3（导入与在途同步竞态） | §4.3 导入入口与 reader.onload 双重检查 syncStatus，'syncing' 即拒绝；§7 补 M3 用例 |
| G1（analysis.ts 行号错位约 5 行） | §3 F1 更正为 :40-41 |
| G2（缺旧分片回读用例） | §7 F5 补 G2 用例 |
| G3（导入后 currentNote 残留） | §4.3 第 6 步补 `set({ currentNote: null })` |
| G4（pages/CLAUDE.md XSS 条目将过期） | §6 增补 hygiene 条目 |
| L1（ErrorBoundary reload 循环提示） | §4.4 fallback 文案附注"若持续出现请联系开发者" |
| L2（AnalyzeProgress 与 ConfirmDialog 同 zIndex:1000） | 无同屏路径，维持现状（备忘） |

## 11. 实现期修正（v1.3 → v1.4）

**§4.5 分片回退条件方向写反（三轮审读均未发现，被 §7 F5 离线测试用例捕获）**：

- 原算法 `while (end > offset && (buf[end - 1] & 0xc0) === 0x80) end--;` 检查的是**切点前一字节**。但完整多字节字符的末字节本身就是续字节——合法边界同样满足该条件，导致每个边界都额外回退 1–3 字节，把上一个字符的领头字节留在片内，解码产生 U+FFFD，`join('')` 后数据损坏（中文密集数据约每 900KB 损坏 1 个字符，且因仍可 `JSON.parse` 而静默）。
- 修正为检查**切点后一字节**：`while (end > offset && end < buf.length && (buf[end] & 0xc0) === 0x80) end--;`——下一片以续字节开头才说明切点在字符中间。
- 离线验证（node，对修正后与 preload.js 落码一致的实施）：2.83MB 中文密集 JSON → 4 片，每片 ≤ 900KB、无 U+FFFD、`JSON.parse(chunks.join(''))` 与原文全等；emoji（4 字节）/纯中文（3 字节）/非 BMP（𝕏）/混合/组合字符（é）压力用例 join 全等；旧字符分片（G2）回读兼容。
- 教训记录：算法类修复的审核必须含可执行用例，纯读代码三轮均未识别此 off-by-one 方向错误。
