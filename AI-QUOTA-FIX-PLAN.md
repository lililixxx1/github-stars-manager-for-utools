# AI 额度耗尽问题 — 完整分析与修复方案

> 版本：v3（v2 经 plan-code-reviewer 审核为"有条件通过"，已并入审核条件 H1（必须）与 M1/M2/L1（建议），详见 §5.7 与 §7）
> 基准代码：master @ 367ccf6 + 5 个未提交的第一轮修复文件（见 §4）

---

## 1. 问题陈述

用户现象：打开插件后放到后台，AI 分析持续消耗 uTools AI 能量，直至额度耗尽；且**已经分析过的仓库被重复分析**。

用户确认的约束：

- **C1**：插件退到后台时**继续**分析是可以接受的，不需要"隐藏即暂停"。
- **C2**：已分析（`analyzedAt` 且未失败）的仓库**绝不允许**再次消耗额度。
- **C3**：额度耗尽/连续失败后，必须立即停止无效调用（熔断）。

## 2. 官方 API 关键事实（utools-api-doc.md）

| 事实 | 文档位置 | 对本问题的意义 |
|---|---|---|
| `utools.ai()` 返回 `PromiseLike`，带 `abort()` 方法，可中止**进行中**的调用 | 文档 2643-2763 行 | 当前代码丢弃了该句柄，"停止分析"只能等当前调用自然结束 |
| `AiModel.cost` 字段标识每个模型的消耗；`utools.redirectAiModelsSetting()` 可跳转 AI 设置 | 2886-2932、2512 行 | 可用于额度相关提示（本次仅提示文案，不跳转） |
| `onPluginOut(false)` = 插件隐藏后台（进程存活）；`(true)` = 插件结束运行（进程结束） | 918-941 行 | 隐藏后 JS 继续执行 → 后台批量分析持续属预期（C1）；进程结束时 in-flight AI 调用随进程销毁 |
| `dbStorage`/`dbCryptoStorage` 为同步 KV 存储 | 3655-3776 行 | 翻译缓存可落盘（P5） |
| 文档未定义 `utools.ai` 的失败错误码 | — | 无法精确识别"额度耗尽"，只能用连续失败熔断近似（C3） |

## 3. 全量结构梳理结论（与额度相关的事实）

全项目仅 **2 处** `utools.ai` 调用：仓库分析（`preload.js:500`，经 `window.githubStarsAPI.analyzeRepo`）与 Release 翻译（`src/services/aiService.ts:294`，渲染进程直调）。无 setInterval，无隐藏 AI 入口。自动触发点只有 2 个一次性 setTimeout：启动 2s 检查版本更新（仅 GitHub API，不耗 AI，默认开）、启动 3s 自动 AI 分析（`autoAnalyzeOnOpen`，默认关）。

分析状态（`analyzedAt`/`analysisFailed`）内嵌在 `gh:repos` 仓库对象上，经 `mergeRepoWithExistingData`（useStore.ts:161-174）在同步时保留。

## 4. 根因清单

### R1 — AI 失败被伪装成成功（第一轮已修复，未提交）
`preload.js` 旧代码 catch 一切错误返回 `null`；`aiService.analyzeRepository` 把 `null` 包装成"成功结果"（用仓库描述当摘要）并写 `analyzedAt`。导致：(a) 失败不可见，额度耗尽后批次继续空转每个仓库；(b) `analysisFailed`+24h 冷却机制是死代码。
**第一轮修复**：preload 抛错；aiService 删除伪成功兜底；batchAnalyze 失败时 `analysisFailed=true` + `analyzedAt=尝试时间`（激活冷却）。**保留。**

### R2 — 无连续失败熔断（第一轮已修复，未提交）
即使失败可见，旧代码也会把剩余几百个仓库逐个打一遍失败请求。
**第一轮修复**：连续 5 次失败即停止整批。**保留。**

### R3 — 空 full-sync 整表清空（**第一轮未修复，现存最高危漏洞**）
`githubService.ts:122-130`：增量同步时 GitHub 第一页返回空（API 异常/网络抖动返回空数组），返回 `{mode:'full', repos:[]}`；`mergeFullSyncedRepositories` 以 fetched 为基映射 → 结果恒为 `[]` → `set({repositories:[]})` + 落盘 → **全部仓库及分析状态被清空**。下次打开若 `autoAnalyzeOnOpen` 开启 → 全量重分析 → 额度灾难。第一轮加的"从 storage 恢复 existingForMerge"防御对此**无效**（fetched 为空时映射结果仍为空），且对分片解析失败场景同样无效（storage 与 state 同源，见 R4 分析）。

### R4 — syncRepositories 闭包快照覆盖（**第一轮只修了一半**）
`useStore.ts:297` 在函数开头捕获 `repositories` 闭包变量；同步是长任务（分页拉取可达数十秒）。期间若批量分析完成并写入 store+storage，同步结束时 `set({repositories: mergedRepos})` 用**旧快照**覆盖、`saveRepositories()` 把旧数据落盘 → 分析结果丢失 → 重分析。第一轮只修了 `startAutoAnalyze` 侧（改用 `get().repositories`），`syncRepositories` 常规路径仍用闭包变量。
另：第一轮的 `existingForMerge`（state 为空时从 storage 重读）实际无效——`loadRepositories()` 在 App mount 时同步执行，之后 state 与 storage 恒同源；该防御应移除，换成真正有效的守卫（R3 守卫 + merge 基座取 `get().repositories`）。

### R5 — 停止分析无法中止进行中的 AI 调用（第一轮未涉及）
`stopAnalyze()` 只 `controller.abort()` 停止队列循环，**in-flight 的 `utools.ai` 调用会继续消耗直至自然结束**。官方 `PromiseLike.abort()` 可立即中止（§2）。并发最高 5（设置页 aiConcurrency 1-5），最坏情况点"停止"后仍有 5 个调用继续烧。

### R6 — 翻译缓存不落盘（第一轮未涉及，第二轮新增）
`translationCache` 是内存 Map（aiService.ts:14），插件进程被 kill 后失效。同一 Release 重进插件再点翻译 = 重复消耗。虽是手动触发（无"后台耗尽"风险），但违反额度节俭原则。缓存已有内容哈希 + 7 天过期 + 模型匹配三重校验，只需落盘到 `dbStorage`。

### R7 — 启动自动分析无确认门槛（低严重度，建议项）
`App.tsx:115`：仅当待分析数 **>50** 才弹确认框；≤50 个直接静默开跑。用户已开启 `autoAnalyzeOnOpen` 属于知情同意，但考虑到额度消耗不可逆，任何数量的自动触发都应有一次显式确认（弹窗组件与文案已存在，只改阈值）。

### R8 — AI 返回空结果仍计为成功 + 批处理期间界面零反馈（实测暴露，v3.2 新增）
实测日志显示：`utools.ai` 调用成功返回，但用户看到"没分析出内容却一直 3 点 3 点扣能量"。两个叠加缺陷：
1. **空结果伪成功**：`analyzeRepo` 只要有 `{...}` 就 `JSON.parse` 返回，若 AI 返回 `{}` 或缺 `summary` 字段，该对象仍为 truthy → 走成功路径 → 标记 `analyzedAt` 但 `aiSummary` 为空——能量已扣、无产出、且永不重试。
2. **批处理无增量反馈**：`startAutoAnalyze` 的 `onProgress` 只更新进度条，仓库摘要要等**整批结束**才写入 store/UI；长批次期间用户看到能量持续消耗却毫无产出，无法判断是否正常。同时批处理中途进程被杀会丢失全部已完成结果（能量白扣）。

### 明确不修（超出本次范围，记录备忘）
- `gh:readReleases` 只增不剪（存储膨胀，非额度问题）
- `releaseCheckStatus` 不落盘导致每次冷启动重复检查版本（消耗 GitHub API 配额，非 AI 额度）
- `plugin.json` 未声明 `github-stars-releases` feature（通知点击走 `github-stars` 可正常工作）
- 导入备份整表替换（用户主动操作，属预期行为，但导入旧备份会丢分析状态——文档记录）
- `TagManager.tsx:199` 100ms setTimeout 未清理（纯 UI 延迟，无害）
- `useHomePage.ts`/`useFilterState.ts` 与 HomePage 内联实现并存的死代码

## 5. 修复方案（按文件）

> 现存 5 个未提交文件为第一轮修复（R1/R2 及 R4 半个），本方案在其基础上继续，并在 §5.2 对其中无效部分做修正。

### 5.1 `src/services/githubService.ts`（修 R3）
`syncIncrementalRepos` 中，首页为空时的处理改为：
```ts
if (!repos || repos.length === 0) {
    if (page === 1) {
        // 本地有数据却返回空列表，视为异常（API 故障/限流误报），中止同步保护本地数据
        if (existingRepos.length > 0) {
            throw new Error('GitHub 返回空仓库列表，同步已中止（本地数据未受影响）');
        }
        return { mode: 'full', repos: [], processedCount: 0 };  // 本地也为空：账号确实无 star
    }
    break;
}
```

### 5.2 `src/stores/useStore.ts`（修 R3 双保险 + R4 + R5 联动）
`syncRepositories`：
1. **移除**第一轮的 `existingForMerge`（从 storage 重读的无效防御）。
2. fetch 完成后、合并前，取**最新** state：`const currentRepos = get().repositories;`
3. 新增空结果守卫（防其他路径的空 full-sync）：
```ts
if (result.mode === 'full' && result.repos.length === 0 && currentRepos.length > 0) {
    throw new Error('同步返回空仓库列表，已中止以保护本地数据');
}
```
4. 合并基座用 `currentRepos`（R4）；`buildSyncState`、进度等照旧。
错误会被现有 catch 捕获 → `syncStatus:'error'` + 错误信息，本地数据不动。

`stopAnalyze`（含 H1 防挂起设计）：
1. 先 `controller.abort()`（使 worker 循环与失败标记短路，被中止的 AI 调用 reject 后 `batchAnalyze` 的 catch 里 `!signal.aborted` 为 false，不会误标 `analysisFailed`）。
2. 再调用 `window.githubStarsAPI.abortAiCall()`（中止 in-flight 调用，见 5.3）。
3. **同步复位状态**（H1）：官方文档未保证 `abort()` 后 promise 必然 reject；若挂起，`startAutoAnalyze` 的 `finally` 永不执行会导致 `isAnalyzing`/`analyzeAbortController` 永久卡死（后续任何分析被防重入守卫拒绝）。因此 `stopAnalyze` 内同步 `set({ isAnalyzing:false, analyzeAbortController:null, analyzeProgress:null })`，不依赖 `finally`；并调用 `saveRepositories()` 落盘已完成的就地修改（partial 结果）。
4. **finally token 守卫**（H1 配套）：`startAutoAnalyze` 的 `finally` 只在 `get().analyzeAbortController === controller` 时才复位，避免旧批次（挂起后恢复）的 finally 覆盖新批次的运行状态。
5. 最后通知。

### 5.3 `preload.js`（修 R5）
`analyzeRepo` 中跟踪 in-flight 调用（并发最高 5，用 Set）：
```js
const inFlightAiCalls = new Set();
// analyzeRepo 内：
const req = utools.ai(aiOptions);
inFlightAiCalls.add(req);
try {
    const result = await req;
    ...
} catch (error) { ...throw... } finally {
    inFlightAiCalls.delete(req);
}
```
`window.githubStarsAPI` 新增：`abortAiCall: () => { inFlightAiCalls.forEach(r => { try { r.abort(); } catch {} }); inFlightAiCalls.clear(); }`
保留第一轮的"失败抛错"（R1）。

### 5.4 `src/services/aiService.ts`（修 R6；R2 已有）
翻译缓存落盘（M1 约束：全程同步，杜绝 load-write 竞态）：
1. preload 的 `window.githubStarsAPI` 新增 `getAiTranslations()` / `setAiTranslations(map)`，用**同步** `utools.dbStorage.getItem/setItem` 读写 key `gh:aiTranslations`（普通对象 `Record<number, TranslationCache>`，dbStorage 不支持 Map）。
2. aiService **模块加载期一次性同步预热**（非懒加载）：从 preload 读入填充 `translationCache`（try/catch 包裹，读取失败回退空 Map）。同步预热 + 同步写回消除"写回先落盘、懒加载后返回旧值再覆盖"的竞态窗口。
3. 每次新翻译成功后同步写回。
4. 容量控制：写回前按 `timestamp` 降序只保留最新 **100** 条（防止无界增长；Release 缓存本身 7 天过期、上限 100 条，覆盖度足够）。
5. 读取校验沿用现有的内容哈希 + 7 天过期 + 模型匹配逻辑，不改。
6. `clearTranslationCache()` 同步删除落盘副本。

### 5.5 `src/App.tsx`（修 R7；checkAnalysisNeeded 对齐已有）
启动自动分析的确认阈值从 `> 50` 改为 `> 0`：即任何数量的自动触发都先弹 ConfirmDialog（组件、i18n 文案 `analyzeConfirmTitle/Message` 均已存在），显示待分析数量。设置页手动"立即分析"按钮行为不变（用户点击即意图明确）。

### 5.7 审核条件落实说明（v3 新增）
- **H1（必须）**：abort 语义不确定 → §5.2 的同步复位 + finally token 守卫双保险，即使 `utools.ai().abort()` 后 promise 永不 settle，应用状态也不会卡死（最多浪费一次已发出的调用）。
- **M1**：§5.4 已改为同步预热 + 同步写回。
- **M2/L1**：§7 补充交错时序用例与 C1 端到端用例。

### 5.8 二审修正（v3.1）
二审（实现审核）指出 H1 只挡了一半：`startAutoAnalyze` 在 `await batchAnalyze` 之后的收尾段（合并 + 落盘 + 统计 + 通知）原先无条件执行。若 abort 后 promise 延迟 settle，旧批次收尾会在任意晚时刻运行，用旧 `updated` 覆盖新批次/已完成批次的状态与落盘数据（含把成功仓库误标 `analysisFailed`）。
**修正**：收尾整段前置 `if (!controller.signal.aborted)` 守卫。abort 场景下部分结果已由 `stopAnalyze` 内 `saveRepositories()` 落盘，跳过收尾不丢数据；同时消除了"未处理仓库被计入 successCount"的统计虚高问题（二审 Minor）。

### 5.6 不改动的部分（约束遵守）
- **不**在 `onPluginOut(false)`（隐藏）时中止分析 —— 约束 C1。
- `onPluginOut(true)`（进程结束）现有 `saveRepositories()` 保留；in-flight AI 调用随进程销毁，无需额外处理。
- 翻译链路不加熔断/中止（纯手动单发，已有并发队列 3 + 去重）。

### 5.9 实测热修（v3.2，修 R8）
1. **preload.js `analyzeRepo` 结果校验**：JSON 解析后校验 `summary` 为非空字符串，缺失/为空 → throw（进入失败路径：`analysisFailed` + 24h 冷却 + 连续 5 次熔断）；`tags`/`platforms` 强制规整为数组。
2. **useStore `startAutoAnalyze.onProgress` 增量刷新**：每个仓库完成后立即以**新对象引用**写入 `repositories`（浅拷贝数组 + 替换该条目），卡片实时显示摘要（注意：batchAnalyze 就地修改旧对象，React.memo 浅比较下不换引用不会重渲染）。
3. **周期性落盘（20s 节流，三审修正）**：每完成一个仓库检查距上次落盘是否超过 20 秒，超过才全量 `setRepositories`（原"每 10 个全量落盘"经三审指出有约百倍写放大与主线程同步阻塞风险）；批处理结束与中止时仍全量落盘（原有逻辑）。批处理中途崩溃最多丢失最近 20 秒的结果。
4. **tags/platforms 元素规整**（三审 Minor）：数组元素强制 `String()`，防 AI 返回数字/对象元素透传进 aiTags/aiPlatforms。

## 6. 执行步骤

1. 按 §5.1-5.5 修改 5 个文件（其中 3 个含第一轮未提交修复，在其上继续）。
2. `npm run build`（tsc 严格检查 + vite）通过。
3. 人工核验清单（需在 uTools 开发者模式中执行，见 §7）。

## 7. 验证计划

**静态**：`npm run build` 零错误；`git diff` 逐文件复核。

**逻辑推演（代码级，可离线验证）**：
- R3：构造 `getStarredRepos` 首页空 + 本地有仓库 → 断言 syncStatus='error' 且 `gh:repos` 未被清空。
- R4：模拟批处理写入了新 analyzedAt 后 sync 结束 → 断言合并基座含新值（读 `get().repositories`）。
- R4 交错时序（M2）：sync 进行中 analyze 完成写入 → sync 随后完成 → 断言最终 state 同时含 sync 的新仓库与 analyze 的 analyzedAt；反向（analyze 进行中 sync 完成）同理。
- R5/H1：断言 stopAnalyze 调用顺序 controller.abort() → abortAiCall() → 同步 set 复位 → saveRepositories；假设 abort 后 promise 永不 settle，断言 `isAnalyzing=false`（不依赖 finally）且可再次启动新批次（token 守卫防止旧 finally 覆盖新状态）。
- R6：翻译一次 → kill 进程重进 → 同一 Release 点翻译 → 断言 `fromCache=true`。

**uTools 手动清单**（交付给用户）：
1. 开启"启动时自动分析"重启插件 → 应弹确认框（任意数量）。
2. 分析进行中点"中止" → AI 调用立即停止（控制台 `[AI分析]` 不再新增），且可立即重新发起分析（无卡死）。
3. 断网/额度不足时分析 → 连续 5 次失败后批次自动停止，通知带"疑似额度耗尽"提示，失败仓库 24h 内不再分析（详情页点分析提示冷却）。
4. 同步正常完成后已分析仓库的 AI 摘要仍在（不被清空）。
5. 翻译一条 Release → 退出重进 → 再翻译同一条 → 显示"已翻译 ✓"（缓存命中，不再消耗）。
6. C1 端到端（L1）：开启自动分析 → 确认后把插件隐藏到后台 → 观察分析继续、已分析仓库未被重复分析、无异常批量中止；返回前台后摘要正常落盘。

## 8. 风险与回滚

- 全部改动无数据结构变更，`gh:repos` 等现有 key 兼容；新增 key 仅 `gh:aiTranslations`。
- R3 守卫的边界：用户真的取消所有 star 后同步会报错而非清空——数据安全优先于该极端场景的自动化（用户可清空本地数据重同步）。
- R7 的行为变化：老用户升级后首次自动分析多一步确认——预期内的摩擦。
- 回滚：改动全部在未提交工作区，`git checkout -- <file>` 即可恢复；`gh:aiTranslations` 可用 `utools.dbStorage.removeItem` 清除。
