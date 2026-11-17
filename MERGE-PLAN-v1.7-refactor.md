# v1.7-refactor 分支合并方案（R/F 保护移植）

> 版本：v1.1（首轮"有条件通过"，条件项 C1–C4 与 G/L 建议已并入，待复审；修订记录见 §9）
> 基准：master @ 1a8a0d9（含 R1–R8 `1c87420`、F1–F9 `1a8a0d9`）⟷ origin/v1.7-refactor @ afbf59c（13 提交，stage-0~8，v1.7.0）
> 分叉点：21787ad（v1.6.4）。merge-tree 实测 9 个冲突文件；另 2 个自动合并文件（githubService.ts / types/index.ts）有语义坑 + 1 处冲突文件内契约移植坑（aiService onProgress，见 §4）。
> 硬约束：**不回退 master 侧 R1–R8 / F1–F9 的任何行为**；**不回退分支侧 v1.7 架构行为**（进度 store 拆分、任务互斥、增量落盘、并发同步、虚拟列表、设计系统）；无新持久化 key（复用 master 已引入的 `gh:aiTranslations`）。
> 执行方式：`git merge --no-commit origin/v1.7-refactor` 挂起于工作区，按 M1–M6 分阶段解冲突；每阶段完成即派 plan-code-reviewer 审核该阶段文件集（文件集互不相交，允许上一阶段审核与下一阶段解冲突并行）；M1–M5 挂起期间**不提交不推送任何中间状态**；若会话中断重开，先确认工作区仍处于挂起 merge（`git status` 应显示 "All conflicts fixed" 之前的中间态或 `You are currently merging`）。M6 统一构建、提交 merge commit。推送与 PR 由用户决定，不在本方案内。

---

## 1. 背景与目标

v1.7-refactor 是一次高质量架构重构（存储 v2 分片+增量写、useProgressStore 拆分+三任务互斥、并发全量同步、虚拟列表、设计系统组件、冒烟脚本），但它从 v1.6.4 分叉，**不含 master 上的全部 R（AI 额度保护）与 F（缺陷修复）**。直接合并或误选边会丢保护——尤其额度链路（熔断、抛错、周期落盘、中止保留部分结果）。

目标：以分支新架构为基底，把 master 的 R/F 保护逐条移植进去，产出通过审核的 merge commit。

## 2. 保护映射总表（移植清单与验收标准）

图例：基底=保留该侧架构重写版；移植=把另一侧行为搬进基底并适配。

| # | master 侧项 | 内容 | 移植决定 | 验收 |
|---|---|---|---|---|
| P-01 | R1 | 中止批次跳过收尾（`!controller.signal.aborted` 守卫包住合并/统计/通知） | 移植进 M3 useStore.startAutoAnalyze（分支版） | 代码评审确认守卫位置等价 |
| P-02 | R1/H1 | stopAnalyze 强化：abort→abortAiCall→同步复位进度态→落盘部分结果 | 移植 M3，落盘改用 `patchReposBatch`（见 §4 陷阱③） | 停止后 in-flight AI 调用被 abort、部分结果已落盘 |
| P-03 | R1/H1 | finally 中 controller 同一性守卫（仅当 store 中 controller 仍是本批次才复位） | 移植 M3，改读 useProgressStore | 代码评审确认 |
| P-04 | R2 | preload.analyzeRepo 结果校验：summary 非空、tags/platforms 数组字符串化、解析失败/异常一律 throw | 移植 M1 preload（分支 v2 为基底） | 空返回/坏 JSON 均抛错 |
| P-05 | R2 | aiService.analyzeRepository：analyzeRepo 抛错上抛，删除 null 兜底返回 | 移植 M2 aiService | 无 `return null` 兜底路径（无 README 用 description 兜底属正常完成语义，保留 master 行为） |
| P-06 | R3 | useStore 层空全量守卫：full 模式返回空 && 本地有数据 → throw | 移植 M3 | 该守卫位于 merge 之前、读 `get().repositories` |
| P-07 | R4/F6 | 长任务合并基座取最新 state：`get().repositories` / `get().settings`，不用函数开头闭包快照 | 移植 M3（分支版仍用闭包快照，需改） | 两处 merge 与 nextSettings 均读最新 |
| P-08 | R5 | 批量分析逐仓增量刷新：onProgress 回调内以新对象写 store | 移植 M3；前置改动见 §4 陷阱③ | 卡片实时出摘要 |
| P-09 | R7 | 周期落盘节流 ≥20s（崩溃不丢已耗能量结果） | 移植 M3，改为**跨 onProgress 窗口累积**：维护 `Map<id, patch>` 缓冲，每 ≥20s 以 `patchReposBatch(数组化缓冲)` 冲刷后清空；**批次正常收尾与 stopAnalyze 中止时均冲刷剩余缓冲**（C4：只落最近一仓会丢窗口内先前结果，崩溃恢复语义弱于 master 全量写） | 代码评审确认累积缓冲+冲刷时机 |
| P-10 | R-熔断 | batchAnalyze 连续 5 次失败熔断剩余队列；失败记 `analysisFailed+analyzedAt`（24h 冷却）；quotaHint 完成通知 | 移植 M2，适配分支不可变契约。**登记顺序（C1）**：markFailed 构造新对象（`{...repo, analysisFailed:true, analyzedAt:now}`，spread 保留旧 aiSummary/aiTags——P-15 三态显示依赖失败仓保留旧摘要）后**先 `results.set(repo.id, failedObj)` 并携带该对象调用 onProgress，再判定熔断 break**（与失败计数分离）；不可变契约下若照 master 顺序（break 在登记前），第 5 个失败仓无处安放、冷却记录丢失，恰在熔断场景（额度耗尽）重复耗能 | 熔断日志 + failCount≥5 提示文案在；**熔断触发时第 5 个失败仓的 analysisFailed/analyzedAt 已进入 store 与落盘** |
| P-11 | R6 | 翻译缓存 dbStorage 落盘（`gh:aiTranslations`，上限 100 条）+ 模块加载预热 + `?.` 防御 | 移植 M1（preload KV）+ M2（aiService） | 重启后命中缓存不重复翻译 |
| P-12 | R8 | githubService 增量路径空页守卫（本地有数据 && page1 空 → throw） | **自动并入**（git 可干净合并），M2 仅核验 | 代码评审确认 |
| P-13 | R7(App) | 自动触发分析一律先弹确认（删除 >50 阈值）；筛选用 `checkAnalysisNeeded().needsAnalyze` | 移植 M4 App.tsx（分支版仍是老阈值+老筛选） | 任意数量均先确认 |
| P-14 | F1 | `selectedRepoId` 单源 + DetailPage 派生 `repo` + 幽灵详情守卫（选中仓库消失→复位回首页） | 移植 M3（store）+ M4（App/HomePage/DetailPage，分支重写版为基底） | 全库无 `setSelectedRepo(` 调用 |
| P-15 | F1(Detail) | 详情页手动分析 markFailure（24h 冷却+通知）、AI 摘要三态显示（成功/失败留旧摘要+横幅/未分析） | 移植 M4 DetailPage | 三态渲染与 markFailure 在 |
| P-16 | F2 | uTools 指令切回 home 保留关键字机制 | **核验项，不移植**（C3：分支 App.tsx 已有 `enterKeywordApplied` 模块级标志 + `[currentPage]` effect 消费"跳过清空"，与 master F2 语义等价；master 的 preserveHomeKeywordRef 若移植会形成双机制）。M4 核验分支实现覆盖 F2 全部路径（含 repo fallback 分支带词） | 指令带词切页词不被清；全库仅存在一套保留机制 |
| P-17 | F3 | 七类数据备份导出/导入（buildBackup/validateBackup）+ 导入前同步互斥检查 + clearSyncState | 移植 M5：backup.ts 去 categories（分支已删该功能）成六类；SettingsPage 用分支的"校验+ConfirmDialog 确认"UX 承载 master 的六类写入与 clearSyncState；同步互斥检查读 `useProgressStore.isJobBusy`（**有意加严**：master F3 仅拦 syncing，此处同时拦分析/版本检查进行中的导入——六类直写与在途任务交错会污染合并结果；保护方向与 F3 一致且更强，非遗漏） | 导出六字段；导入校验失败不落盘；导入后 syncState 被清 |
| P-18 | F5 | 分片按 UTF-8 字节数切分防超限 | **不移植**：分支 v2 按整仓边界装片（byteLengthOf+64KB 余量），结构性不存在切错字符问题，master 的字符边界回退逻辑无适用位置 | 论证记录在案（§5） |
| P-19 | F9 | AnalyzeProgress 全局挂载 | **不移植**：分支 stage-0 已独立挂载，等价 | 二者不重复挂载 |
| P-20 | F4/F7/F8 等小项 | ErrorBoundary+main.tsx（自动并入）、backup.ts 文件本体（自动并入，M5 改造）、其余 F 批次文件 | 自动并入项在对应阶段核验 | tsc 通过 |
| P-21 | quota 相关 UI | SettingsPage 手动分析的 busy 反馈（`analyzeDeferredBusy` toast） | 分支已有（commit 9f0441c），核验即可 | — |

## 3. 不移植 / 双侧保留决定

- **分支架构全保留**：useProgressStore、isJobBusy 互斥、autoAnalyze 互斥重试、scheduleSyncIdle（注意：它已独立修复 P2-G1）、并发全量同步、虚拟列表、存储 v2、设计系统组件、locales。
- **master 侧 `escapeHtml` 删除**（F 批次死代码清理）随 F1 移植自然生效于 DetailPage 解冲突结果。
- **useHomePage.ts**：按分支删除处理（逻辑已内联进 HomePage），master 对它的 F1 改动不保留（同改动移植进 HomePage）。
- **UnreadBadge.tsx / CLAUDE.md ×5 / home/components/index.ts** 等：按分支删除处理。
- **plugin.json 1.7.0 / package.json（+@tanstack/react-virtual）**：自动并入，M6 执行 `npm install`。

## 4. 三个语义陷阱的处理（audit 已识别）

1. **githubService.ts 自动合并 ≠ 全路径安全**：R8 只护增量路径；新并发全量路径 `syncAllRepos` 首页空的保护由 M3 的 P-06（useStore 层 R3 守卫）承担。不改动分支 syncAllRepos 本体（其"任一页失败整轮上抛"语义已覆盖错误场景；空首页 + 本地有数据是唯一缺口，正是 R3 的靶子）。
2. **types/index.ts 自动合并**：master 新增 5 个 API 声明与分支删除 categories 互不触碰，git 可自动合并；但 `utils/backup.ts`（master 侧自动并入）引用已删除的 `Category` 类型与 `getCategories` API，M5 必须改造，否则 tsc 失败。
3. **aiService onProgress 传参**：分支 batchAnalyze 不可变契约下 `onProgress(completed, n, repo)` 传的是**原始引用**（无 AI 结果）。P-08 移植时须改为传合并后的结果对象（与 `results.set` 同构），否则 R5 增量刷新写入的是空数据。同理 P-10 熔断的失败标记也是构造新对象。

## 5. F5 不移植论证（P-18）

master F5 解决"按字符数切片会切开多字节 UTF-8 字符/超 dbStorage 单文档字节限额"。分支 v2 `packReposIntoShards` 按**整仓 JSON 边界**装片：`byteLengthOf`（UTF-8 字节）累计、单片 ≤ `MAX_REPOS_CHUNK_SIZE - 64KB` 余量、单仓超限时独占一片**不切**。旧问题在新结构中不存在切点，master 的边界回退算法无宿主。F5 的另一效果（字节数计量替代字符数）分支已原生满足。结论：以架构取代，非行为回退。

## 6. 阶段划分（每阶段后派 plan-code-reviewer 审该阶段文件集）

### M1 — 合并启动 + preload.js（最大单文件）
- `git checkout -b merge-v1.7-refactor`（自 master）；`git merge --no-commit origin/v1.7-refactor`。
- 解 preload.js：以分支 v2 全文为基底，在其 `window.githubStarsAPI` 对象与 analyzeRepo 内移植 P-04（校验+抛错）、P-02 的 `inFlightAiCalls`/`abortAiCall`、P-11 的 `getAiTranslations`/`setAiTranslations`、P-17 的 `clearSyncState`/`setNotes`。保持分支的 keep-alive/退避重试/分片 v2/patchRepo 不动。
- **setNotes 移植要求（C2）**：不只写 `gh:note:<id>` 键，还须把导入笔记的 repoId **合并进 `readNoteIndex()` 并持久化**——分支 getAllNotes 是索引驱动的，仅写键在老用户（索引已存在）环境里笔记不可见，P-17 功能性失败。
- dist/ 冲突暂以 master 侧占位（M6 重建），不手工解。

### M2 — aiService.ts + githubService.ts + types/index.ts
- aiService：分支不可变契约为基底；P-05（去 null 兜底）、P-10（熔断适配新对象构造）、P-11（缓存预热+落盘）、陷阱③（onProgress 传结果对象）。
- githubService：核验 R8 自动并入结果（P-12）。
- types：核验自动合并（P-20），确认 `deleteTag: Promise<void>` 等分支签名未被 master 侧干扰。

### M3 — useStore.ts（额度链路核心）
- 分支版为基底，移植 P-01/02/03/06/07/08/09 + F1（P-14 的 store 半边：`selectedRepoId`/`setSelectedRepoId`，删除 `selectedRepo`）。
- stopAnalyze 落盘部分结果：中止时刻用已分析结果 `patchReposBatch`；若中止发生在首批结果前则跳过写入。
- 同步/分析/版本检查互斥（分支）与 R 系守卫叠加时**互斥优先**（busy 时不启动新批次，守卫逻辑仅对已启动批次生效），无语义冲突。

### M4 — App.tsx + DetailPage.tsx + HomePage.tsx + useHomePage 处理
- App.tsx：分支版为基底，移植 P-13（一律确认+checkAnalysisNeeded）与 F1 调用点（`setSelectedRepoId(repo.id)`）；P-16 为核验项（C3：确认分支 `enterKeywordApplied` 覆盖 F2 全部路径，含 repo fallback 带词，不引入第二套机制）。
- DetailPage：分支重写版为基底，移植 P-14（派生 repo+幽灵守卫）与 P-15（markFailure+三态）。
- HomePage：分支版 `handleRepoClick` 改 `setSelectedRepoId(repo.id)`。
- useHomePage.ts：`git rm`（分支删除侧），确认无残余 import。

### M5 — SettingsPage.tsx + utils/backup.ts
- backup.ts：去 `Category`/categories（导出六类；导入对遗留 categories 字段**容忍并忽略**，schemaVersion 维持 2——读取端宽容额外字段，符合 master"加法式演进"约定，master 产出的旧备份仍可导入）。
- SettingsPage：分支版为基底；handleExport→`buildBackup()`；handleImport→`validateBackup()`（保留分支的形状校验作前置 + PendingImport 确认弹窗 UX）；confirmImport→六类直写 `window.githubStarsAPI` + `clearSyncState()`；**写盘后 store 状态刷新序列（G 建议，master SettingsPage.tsx:232-240 有半套）**：`loadRepositories()`/`loadTags()`/`loadReleases()`、`set({ currentNote: null })`（导入笔记替换后旧 currentNote 悬空）；同步互斥检查读 `useProgressStore.syncStatus`/`isJobBusy`；错误文案沿用 master `importErrorText`（去 categories_invalid）。
- 验收补充（C2）：导入含笔记的备份后，笔记在详情页/列表徽标可见（getAllNotes 索引驱动路径生效）。

### M6 — 构建、冒烟、提交（终审）
- `npm install`（新依赖）；`npx tsc --noEmit`；`npm run build`；先清空 dist 再构建（消除两侧历史 hash 资产）；可行时跑 `scripts/smoke-storage.mjs`（其已 mock utools dbStorage，可直接驱动 preload.js）。
- 全库回归 grep：`setSelectedRepo(`、analyzeRepo 尾部 `return null`、`getCategories` 残留为零；`enterKeywordApplied` 保留（C3 后仅一套机制）；`analyzeAbortController` 的读写均经 useProgressStore（防旧 useStore 引用复活）。
- 提交 merge commit（信息注明 R/F 移植映射表编号）。
- plan-code-reviewer 终审整体 diff（含额度链路专项：P-02/04/05/08/09/10 逐条复核）。

## 7. P2 方案交互（CODE-REVIEW-P2-FIX-PLAN.md，未执行）

| P2 项 | 合并后状态 |
|---|---|
| S1 停止分析 getReadme 在途竞态 | **仍开放**（两侧都无），P2 方案需重定向到合并后 aiService 的 signal 穿透点 |
| S2 订阅双真相源 | **分支已修复**（阶段3 订阅单源化），M3 核验后从 P2 清单划掉 |
| G1 syncStatus 定时器竞态 | **分支已修复**（scheduleSyncIdle/clearPendingSyncIdle） |
| G3 旧分片损坏静默空表 | 分支存储 v2 重写，行为变化，需对 v2 读路径**重新审计**后重定向 |
| G5/M1/M4/M5/G4/G6 等小项 | 文件重写/删除导致位置失效，P2 方案在合并完成后整体 re-base 一轮 |

结论：先合并、后 re-base P2 方案文档（S2/G1 划掉、其余重定向），不在本次范围内混做。

## 8. 风险与回退

- 全程 merge --no-commit 挂起，任何阶段失控可 `git merge --abort` 无损回退；merge-v1.7-refactor 分支不推送，master 不受影响。
- 每阶段审核不通过：仅修该阶段文件集，修完重审通过才进入下一阶段；审核与下一阶段解冲突并行时，reviewer 只读指定文件集（其他文件可能仍含冲突标记，明确告知）。
- 并发管理：单 reviewer 串行为默认；仅在待审文件集与在改文件集严格不相交时并行（M2 审 ∥ M3 改，M3 审 ∥ M4 改……），任一审核退回则暂停后续依赖项。
- uTools 运行时行为（utools.ai abort、dbStorage 限额）离线不可验，沿用 R/F 批次既定口径：以代码评审 + smoke 脚本为准，运行时核验项留给用户在 uTools 中确认（沿用 [[待核验清单]] 口径）。

## 9. 审核记录

| 轮次 | 审核方 | 结论 | 版本 |
|---|---|---|---|
| 1 | plan-code-reviewer | 有条件通过（C1 熔断登记顺序 / C2 setNotes 索引 / C3 P-16 改核验 / C4 落盘累积缓冲；另 4 条不阻断建议） | v1.0 |
| — | 条件并入 | C1→P-10、C2→M1/M5、C3→P-16/M4、C4→P-09；建议并入 M5（store 刷新序列）、M6（grep 两条）、§8（挂起纪律）；版本递增 | v1.1 |
| 2 | plan-code-reviewer | 通过（2 条 Minor 措辞已吸收：头部坑计数、P-17 有意加严注记） | v1.1 |

### 执行与阶段审核记录（merge-v1.7-refactor @ ab856fd）

| 阶段 | 文件集 | 结论 | 备注 |
|---|---|---|---|
| M1 | preload.js | 通过 | smoke-storage 19/19 + C2 专项场景 5/5；移植逐字节等价 |
| M2 | aiService/githubService/types | 通过 | C1 顺序核验成立；R8 逐字节一致；types 自动合并干净 |
| M3 | useStore.ts | 通过 | C4 跨批次安全完整推演闭环；R1/H1/R4 守卫等价或更严 |
| M4 | App/DetailPage/HomePage/useHomePage | 修后通过 | 唯一阻断项 DetailPage:307 setSelectedRepo 残留（tsc 捕获后删除，与审核发现一致）；P-16 单机制核验通过 |
| M5 | SettingsPage/backup.ts | 通过（Important 已修） | C2 链路闭环；Important"跳过条目未汇报"属 F3 行为回退，已修复（skipped 随行携带+成功提示含数量），tsc/build 复验通过 |
| M6 | 构建/冒烟/回归 grep/merge commit | **通过** | tsc 零错误、vite build 成功、smoke 19/19、grep 五项全绿；额度链路六项专项（P-02/04/05/08/09/10）+ M3 固化项全部复核成立；merge commit 89d7c21（含 package-lock 版本同步） |

执行注记：
- M4 阶段审核与解冲突并行期间，审核方基于暂存快照发现 DetailPage:307 残留，同一问题已被执行侧 tsc 捕获并修复——双通道冗余生效。
- M5 审核的 Important 项虽标非阻断，但判定为 F3 行为回退（违反硬约束），按约束修复后提交。
- Mimosa 钩子在 merge commit 时提示未完成完整扫描（library_source/callgraph 结论缺失），按兼容策略放行；完整安全审计待补跑，不在本方案范围。
