# AI 冷启动模型就绪 + 熔断日志去重方案（AI-MODEL-READY-PLAN）

> 版本：v1.2 ／ 日期：2026-11-02 ／ 状态：**审核通过（v1.1 复审通过；v1.2 并入复审疑问的唯一非阻塞措辞修正）**
> 目标版本：插件 1.8.1 → **1.8.2**；基线：commit 75a196d（1.8.1，复测 232/0 全绿）
> 依据：2026-11-02 用户真机 console 日志（uTools 8.0.2 实跑 1.8.1 产物 index-BpDuN_cd.js）
>
> v1.1 修订（并入审核意见，**复审通过**）：① 「不做」单仓理由改真——单仓失败同样进 5 分钟冷却且冷却内手动重试被 `failed_cooldown` 分支拒绝（DetailPage.tsx:185-214），但冷启动窗口仅数秒、用户在窗口内进详情页触发分析的概率极低，决策不变（原文「可重试」与代码不符）；② 探针 ID 提取与 SettingsPage.tsx:387 写入口径对齐（string/object 双形态）；③ 探针调用自包 try/catch，异常视为未命中继续轮询（防 contextBridge 级异常掀翻整批）；④ 首探前先查 signal.aborted；等待后 `if (signal?.aborted) return repos` 早退（显式化收尾路径，不再依赖 while 首查的隐式行为）；⑤ 风险节补「列表含 ID ⇔ ai 可用」假设及其双向安全降级。
> v1.2 修订（复审非阻塞疑问修正）：风险节核心假设的证据措辞改准——真机日志仅含 ai 调用失败→成功时序（间接支持），无 `allAiModels` 列表侧加载的直接观测，删去「列表渐次可见」表述。

## 1. 背景与证据

真机日志（用户实测，启动插件 → 自动同步 367 star → startAutoAnalyze 批量分析）暴露两类问题：

**A. 冷启动 AI 模型竞态（新发现）**
- 前波 9 仓 AI 调用全部失败：`Error: 自定义 AI 模型不存在`（抛自 uTools `apisdk.js` ipcInvoke）
- 失败集中在插件启动即刻自动分析的第一波；**随后同一 settings 下 30+ 次调用全部成功**（`[AI分析] utools.ai 调用完成`）——证明模型 ID 有效，是 uTools 模型注册表（含用户自定义模型配置）异步加载未完成时 `utools.ai({model})` 抢跑
- 官方文档口径（skill references/ai.md）：`model`「AI 模型 ID，未配置时使用默认模型」；`utools.allAiModels()`「获取**所有可用** AI 模型列表」→ 以列表是否含该 ID 作为就绪信号是正确探针；`preload.js:935-943` 已有 `getAIModels()`（异常时返回 `[]`，天然可轮询）
- 后果：9 仓被标 `analysisFailed`（5 分钟冷却），30 仓被熔断跳过，需下一轮补齐

**B. 熔断日志重复（既有小瑕疵首次实测暴露）**
- `[batchAnalyze] 连续 5 次失败，熔断剩余 30 个…` 打了 **5 条**
- 机理（`src/services/aiService.ts:202-267`）：并发 5 worker，第 5 连败的 worker 置 `circuitBroken=true` 并 break；其余 4 个**在途** worker 各自失败后再次命中 `:257` 的同一条件（`queue.length>0` 仍真）→ 置位+打日志+break 各来一遍 → 9 失败 5 条日志
- 行为本身正确（在途失败仓正确进 results 拿到冷却记录——C1 契约；剩余队列不再出队），纯日志噪音

**顺带（记录，不修）**：本次是「连续 5 次失败熔断」首次真机实战验证——恰在第 5 连败触发、在途失败仍登记冷却、剩余仓未被误标，REPORT.md §五.2 的「不可单测」项获得真机样本。

## 2. 修复设计

### 改进 A：批入口模型就绪等待（`src/services/aiService.ts`）

新增模块级私有 helper（含两个常量）：

```ts
const MODEL_READY_TIMEOUT_MS = 8000;
const MODEL_READY_POLL_INTERVAL_MS = 500;

/** 冷启动竞态防护：轮询 allAiModels 直到配置的模型出现（探针调用自包 try/catch，异常视为未命中继续轮询） */
async function waitForModelReady(model: string, signal?: AbortSignal): Promise<boolean>
```

- `batchAnalyze` 入口处：`if (model) { await waitForModelReady(model, signal); if (signal?.aborted) return repos; }`——**仅当指定了 model 才等待**（未指定走默认模型，默认路径无此报错且无法以列表判定）；等待后显式早退（返回原始数组，与批中途 abort 的收尾一致——useStore 侧既有 abort 守卫丢弃结果）
- 探针命中判定与 SettingsPage.tsx:387 写入 `settings.aiModel` 的口径对齐（双形态提取，兼容 string / AiModel 对象）：
  ```ts
  const idOf = (m: any) => typeof m === 'string' ? m : (m?.id ?? m?.name);
  models.some(m => idOf(m) === model)
  ```
  （`getAIModels` 声明为 `Promise<any[]>`，types/index.ts:257 / vite-env.d.ts:42，`any` 经 strict）
- 每次探针调用自包 try/catch：`try { models = await window.githubStarsAPI.getAIModels() } catch { models = [] }`——preload 层虽已有 catch→[]（preload.js:935-943），但 contextBridge 级异常（如桥未注入）会直接 throw，若不在此兜住会把整个 batchAnalyze 掀进 useStore 的静默 catch，引入新失败路径
- `signal.aborted` **在首次探针前先查一次**（已中止则零 IPC 直接过），轮询间隙继续检查，中止即返回 false（后续 worker 循环的既有 abort 检查自然收尾）
- 日志（仅在实际发生等待时）：
  - 首次探针未命中 → `log '[batchAnalyze] AI 模型未就绪，等待中: <model>'`（暖启动一次命中则零日志零延迟）
  - 等待后命中 → `log '[batchAnalyze] 模型已就绪，等待 Xms'`
  - 超时 → `warn '[batchAnalyze] 等待模型就绪超时(8s)，继续执行（模型可能不存在）'`
- **超时后照常执行**（不 abort）：保持现行为兜底——真配错模型时仍由既有 5 连败熔断 + 冷却接管，仅多付 8s
- 就绪等待不消耗 AI 能量（`getAIModels` 只读不计费，既有实测）

### 改进 B：熔断日志转捩守卫（`src/services/aiService.ts:257-261`）

```ts
if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && queue.length > 0) {
    if (!circuitBroken) {
        circuitBroken = true;
        console.warn(`[batchAnalyze] 连续 ${MAX_CONSECUTIVE_FAILURES} 次失败，熔断剩余 ${queue.length} 个仓库的分析（多为 AI 额度耗尽或服务异常）`);
    }
    break;
}
```

- 仅首个到达者置位+打日志；在途 worker 后到 → 跳过日志但仍 break（退出语义不变）
- **不改**：熔断阈值、C1「先登记再判熔断」、在途失败仓的冷却标记、onProgress 语义

### 不做（记录）

- **单仓分析（DetailPage）与 Release 翻译不加就绪等待**：两者失败后果不同——Release 翻译失败无冷却，即时报错可立即重试；单仓分析失败**同样进 5 分钟冷却且冷却内手动重试被拒**（DetailPage.tsx:185-214 `markFailure` + `failed_cooldown` 分支），但冷启动竞态窗口仅数秒、用户在该窗口内进详情页并触发分析的概率极低（自动批分析抢在前面），接受不加等待
- **不在 preload.analyzeRepo 做 per-call 重试**：批级入口一次等待优于每仓各等一次（避免 35 仓 × 重试延迟与重复消耗）
- **不检测「模型不存在」错误文本做重试**：错误串属 uTools 内部实现，不做字符串耦合；以列表探针从源头避免
- **model 未设置时不等待**：默认模型无法以列表判定成员资格，且默认路径无此报错证据
- **等待期不把进度面板 `currentRepo` 置「模型就绪中…」**（审核建议 #3 可选项，不采纳）：aiService 目前不触碰 progress store（进度由 useStore 经 onProgress 编排），为 ≤8s 的低频窗口引入 service→store 反向依赖不值；等待期内面板维持既有 0/N 态且停止按钮可用（abort 语义完整）

### 版本

`plugin.json` + `package.json`：`1.8.1` → `1.8.2`。

## 3. 验证

1. `npm run build`（tsc strict + vite）零错误。
2. 回归零影响抽查：`node ../gsm-test/selector-tests/run.cjs`（本次未触及 selectors/analysis 纯函数，预期仍 163 pass / 1 fail 不变）。
3. 代码级审查（plan-code-reviewer）覆盖：等待逻辑的 abort 语义、日志触发条件、熔断守卫的等价性。
4. **真机验证（待用户下次冷启动）**：重启 uTools → 进插件触发自动分析，console 期望——暖启动无新日志；若竞态再现则见「等待中/已就绪」一对日志且**不再出现 `自定义 AI 模型不存在` 连败波**；熔断（若触发）只打一条。
5. 提交：单笔 `fix(ai)`（不推送），add 清单：`src/services/aiService.ts`、`plugin.json`、`package.json`、重建 `dist/`、本方案文档。

## 4. 风险

- 8s 等待只在「model 指定 + 首探未命中」时发生；模型真配错时每批多付 8s（随后熔断照常），可接受
- **核心假设**：「`getAIModels` 列表含该 ID ⇔ `utools.ai({model})` 该模型可用」——两者共享 uTools 同一异步加载的模型注册表；真机日志由 ai 调用失败→成功的时序**间接**支持该假设（列表侧加载完成时点未直接观测）。假设失效的两个方向均安全降级：误报就绪（列表先到、ai 仍不可用）→ 走既有 5 连败熔断 + 冷却（即现行为）；误报未就绪（ai 可用但列表不含，如未来口径脱钩）→ 固定 8s 延迟后超时照常执行，不阻塞功能，届时再调整探针口径
- 探针为只读 `allAiModels`（不计 AI 能量），轮询 500ms 一次 × ≤16 次的 IPC 开销可忽略
- 熔断日志守卫理论上丢失「后续在途失败」的可见性——但 failures 本身有 `Failed to analyze` 逐仓日志，信息不丢失
