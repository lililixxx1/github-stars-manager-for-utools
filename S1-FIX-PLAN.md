# S1 修复方案：停止分析时 getReadme 在途窗口的额度损失

> 版本：v1.1（首轮"有条件通过"，条件 1-3 与建议已并入，待复审）
> 基准：master HEAD `2e54c51`（v1.7 合并 89d7c21 + audit-fix）
> 分类：AI 额度保护缺口（原 P2 方案 S1 最高优先项；P2 汇总文档 CODE-REVIEW-P2-FIX-PLAN.md 已删，其余历史方案文档 AI-QUOTA/CODE-REVIEW-FIX-PLAN 仍在，与本方案无依赖）
> 硬约束：不回退 R1-R8/F1-F9 及 v1.7 合并（89d7c21）的任何行为；不改 DetailPage 单仓手动分析行为

---

## 1. 问题

`aiService.batchAnalyze` 的 worker 调用 `analyzeRepository` 后，在 `await getReadme(...)`（GitHub API）期间用户点"停止分析"：

- `stopAnalyze`（useStore.ts）执行 `controller.abort()` + `abortAiCall()`；
- 但 getReadme 不在 `inFlightAiCalls` 跟踪范围（该集合只登记 `utools.ai` 调用），且不可取消；
- getReadme 返回后，`analyzeRepository` **无条件**发起 `analyzeRepo` → `utools.ai` → **能量照扣**；
- 结果虽被 processQueue 的事后 `!signal?.aborted` 守卫丢弃，损失已发生。

触发概率：`aiConcurrency=1`（默认）时每个仓库分析前都有 getReadme 窗口——正常响应约 1 秒；命中 GitHub 限流（403/429）时 preload 层重试最多 3 次、退避 1+2+4 秒叠加 30 秒超时，单仓窗口最长可达数十秒。窗口内点停止即命中；并发 N 时在途窗口按 N 倍放大。

**根因**：`signal` 只穿透到 batchAnalyze 循环层，未穿透进 `analyzeRepository` 内部两个 await 之间。

## 2. 修复设计

`src/services/aiService.ts` 两处改动：

1. **`analyzeRepository` 增加可选末参 `signal?: AbortSignal`**，`await getReadme` 之后、`if (!readme)` 兜底分支**之前**（条件 2：使"aborted ⇒ return null"成为字面单一来源）插入检查：

   ```ts
   const readme = await window.githubStarsAPI.getReadme(...);
   if (signal?.aborted) {
       // S1：getReadme 在途期间用户已停止——不再发起 utools.ai 调用（能量消耗不可逆）。
       // 返回 null：结果会被 processQueue 的 !signal?.aborted 守卫整体丢弃，不进失败标记/冷却。
       // 该仓库保持 needsAnalyze，下次批次重新分析（期望语义）
       return null;
   }
   if (!readme) { ... 兜底不变 ... }
   ```

2. **`batchAnalyze` 的调用点传入 signal**：`await aiService.analyzeRepository(repo, token, language, model, signal)`。

不需要的检查（论证，审核方已复核确认）：
- **getReadme 之前**：循环入口守卫到 getReadme 发起之间无 await（JS 单线程），无窗口。
- **检查通过到 utools.ai 登记之间**：检查 → analyzeRepo 调用 → preload 内 `utools.ai()` 与 `inFlightAiCalls.add()` 为相邻同步语句（无事件循环边界）——abort 先到则被新检查拦截，utools.ai 先发起则已登记可被 abortAiCall 中止，**不存在"既未拦截又不可中止"的第三态**。
- **DetailPage 单仓分析**：不传 signal（`undefined?.aborted` 恒 false），行为不变。

null 语义说明：非中止路径下 null 不可达（无 README 返回兜底对象；analyzeRepo 抛错而非返回 null）；中止路径下 null 的唯一消费者 batchAnalyze 将其包裹在 `!signal?.aborted` 守卫内整体丢弃，永不进入 markFailed/熔断计数。M2 合并时"null→markFailure"仅存在于 DetailPage 四参调用（无 signal），不可达，维持理论路径。语义自洽。

## 3. 验收

- 代码评审：signal 穿透链完整（stopAnalyze.abort → 循环守卫 → analyzeRepository 内部早退）；DetailPage 调用点四参不变。
- **负路径断言（条件 3）**：aborted 早退的仓库不进入 `results.set`/`onProgress`；返回数组经 `results.get(r.id) || r` 回退原引用；startAutoAnalyze 的 `if (!controller.signal.aborted)`（useStore.ts:597）跳过整段合并落盘——store 与该仓库完全无接触。
- `npx tsc --noEmit` 零错误；`npm run build` 成功；`node scripts/smoke-storage.mjs` 19/19。

## 4. 风险与回退

- 改动面 2 个函数、约 10 行，单文件；出问题 `git revert` 即回退。
- uTools 运行时不可离线验证面已缩至最小：本方案新增路径（getReadme 后早退）**不发起任何 utools.ai 调用、不产生任何计费可能**；唯一遗留的不可验项是既有 R1/H1 边界（在途 utools.ai 被 abort 后的计费时点），本方案未扩大其面。运行时核验留用户。

## 5. 审核记录

| 轮次 | 审核方 | 结论 | 版本 |
|---|---|---|---|
| 1 | plan-code-reviewer | 有条件通过（无阻断；条件：基线哈希纠错 2e54c51、检查位置固定于兜底之前、验收补负路径断言；另 2 条表述建议） | v1.0 |
| — | 条件并入 | 条件 1→头部基准、条件 2→§2 代码位置与"字面单一来源"论证、条件 3→§3 负路径断言、建议→§1 窗口幅度/§4 计费面收窄 | v1.1 |
| 2 | plan-code-reviewer | 通过（条件 1-3 落格逐条复核一致，无新问题） | v1.1 |
| — | 实施 | cc0af3f：aiService.ts 两处（+10/-2），严格在方案范围（reviewer 条款：超范围才需复审）；tsc/build/smoke 19/19 全绿；推送因 GitHub 网络中断暂缓，待恢复重推 | v1.1 |
