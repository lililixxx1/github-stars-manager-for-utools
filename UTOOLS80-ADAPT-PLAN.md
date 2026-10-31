# uTools 8.0 适配优化方案

> 版本：v1.1 ／ 日期：2026-10-31 ／ 状态：审核有条件通过，条件已全部并入
> 目标版本：插件 1.7.0 → **1.8.0**；目标运行时：uTools 8.0.2（本机实测版本）
>
> **修订记录**
> - v1.1（2026-10-31）：并入 plan-code-reviewer 审核条件——补 DetailPage 单仓分析、ReleasesPage prop 供给两条透传链（原漏，开关静默失效）；`GithubStarsAPI.analyzeRepo` 接口签名同步（原漏，tsc 必失败）；`reasoning_effort` 类型改官方联合类型；§6 回退方向修正（原表述写反）；验证计划补 thinking=true 分支与翻译路径核对方案；git 推送状态表述修正；翻译缓存不区分思考模式记录为接受行为。
> - v1.0（2026-10-31）：初稿。

## 1. 背景与审计结论

用户要求「适配优化 uTools 8.0」。对 v1.7.0 全量 API 盘点 + dev-bridge 真机探测后结论如下。

### 1.1 实证探测（dev-bridge，uTools 8.0.2 真机）

探测脚本：`C:\Users\Administrator\Desktop\ccc\ccc\utools-8-probe\probe.js`（项目外，独立目录）。
证据：`dev_calls_log` seq 159-162——`utools.dbCryptoStorage.setItem/getItem/removeItem/getItem` 全部 `ok:true`、无 stub 标记、写日志留痕（真实执行，非沙箱模拟）。

| 项目 | 结论 |
| --- | --- |
| `dbCryptoStorage` | **8.0.2 运行时完整可用**（写/读/删往返通过）。8.0 官方文档移除仅是文档层面，未下线运行时。**Token/设置存储无需迁移** |
| `setExpandHeight` / `setExpendHeight` | 双轨并存（新旧名都存在） |
| `getCopiedFiles` / `getCopyedFiles` | 双轨并存（本插件未使用，仅记录） |
| `getPluginLocalDataPath` / `getPluginTempPath` / `requestSchedule` / `removeSchedule` / `registerTool` | 8.0 新 API 可用（本次不使用，见 §4） |
| 其余在用 API | `dbStorage` / `ai` / `allAiModels` / `setSubInput` 族 / `subInputBlur` / `copyText` / `showNotification` / `shellOpenExternal` / `onPluginEnter`（未用 `from`，无 `"reirect"` 笔误风险）全部兼容 |

### 1.2 真实适配缺口（3 项）

1. **`utools.ai` 未用 8.0 新参数 `reasoning_effort`**。8.0 官方文档：默认大模型通常启用思考模式，推理过程显著增加响应时间；常规文本处理任务建议优先 `reasoning_effort: "none"`，并建议在界面提供思考模式切换。本插件两处 AI 调用——批量仓库分析（`analyzeRepo`，并发最高 5）与 Release 翻译（`translateRelease`）——均为简单提取/翻译任务，默认思考模式拖慢批量分析。
2. **`plugin.json` 用 7.x `explain` 字段**。8.0 正名为 `description`（运行时双轨兼容）。补 `description` 并保留 `explain`，兼容两端。打包校验链（反编译实测）不拒未知字段，双字段安全。
3. **`src/vite-env.d.ts` 类型声明陈旧**：`setExpendHeight`（7.x 拼写）、`getWindowType` 返回含 `'browser'`（8.0 自定义窗口返回 `'custom'`）、`ai` 签名缺 `reasoning_effort`。均为纯声明（src 无调用），零运行时风险。

### 1.3 无需改动项（审计排除）

- preload 已用 `node:https` / `node:zlib`（Node 20 运行时 OK）；`main: dist/index.html` + logo + preload 目录结构合规；`cmds` 每功能 ≤5 条合规；`subInputBlur` 已 `?.` 防御调用。

## 2. 用户拍板记录（2026-10-31）

| 问题 | 决定 |
| --- | --- |
| `reasoning_effort` 默认值 | **默认关思考（发 `'none'`）** + 设置页「深度思考」开关；单次调用能量消耗不变（按模型计费），提速批量分析 |
| 验证深度 | **花约 3 点能量真实调一次 `utools.ai`**，确认默认模型接受该参数、返回可解析（提速仅为定性预期，不设 A/B 硬对照，见 §5.3）；另做零额度 stub 接线验证 |

## 3. 改动清单

### A. AI 思考模式（默认 `'none'` + 开关）

沿用现有 `model` 参数的显式透传模式（不引入 store 反向依赖，无循环引用）。
**用户触发链共 3 条，全部覆盖**：批量分析（SettingsPage/自动触发 → useStore → batchAnalyze → analyzeRepository → preload.analyzeRepo）、单仓分析（DetailPage → analyzeRepository → preload.analyzeRepo）、Release 翻译（ReleasesPage prop 供给 → ReleaseDetail → translateRelease → 渲染进程 utools.ai）。

| 文件 | 改动 |
| --- | --- |
| `src/types/index.ts` | `Settings` 加 `aiThinking?: boolean`（falsy = 发送 `'none'`）；**`GithubStarsAPI.analyzeRepo` 接口签名加第 5 参 `thinking?: boolean`**（漏改则 tsc TS2554） |
| `preload.js` | `analyzeRepo(readmeContent, repoInfo, language, model, thinking)`：`thinking` 为真**不发送**该字段（走模型默认思考）；否则 `aiOptions.reasoning_effort = 'none'` |
| `src/services/aiService.ts` | `analyzeRepository` / `batchAnalyze` 增加 `thinking?: boolean` 形参透传（排在 `model` 后、`signal` 前）；`translateRelease` 增加 `thinking` 参数，同逻辑拼 `aiOptions`，并在既有开始日志中带上 `reasoning_effort` 取值便于实机核对 |
| `src/stores/useStore.ts` | `startAutoAnalyze` 调 `batchAnalyze` 处补传 `!!settings.aiThinking` |
| `src/pages/DetailPage.tsx` | `executeAnalyze` 调 `analyzeRepository` 处补传 `!!settings.aiThinking`（**单仓分析链路，v1.0 漏**） |
| `src/pages/ReleasesPage.tsx` | `ReleaseDetail` 调用点补传 prop `aiThinking={!!settings.aiThinking}`（**prop 供给点，v1.0 漏**） |
| `src/components/ReleaseDetail.tsx` | props 加 `aiThinking?: boolean`；`handleTranslate` 调 `translateRelease` 处补传 |
| `src/pages/SettingsPage.tsx` | AI 分析区、AI 模型卡片下方加 Toggle 行（复用 `Toggle` 组件与 `autoAnalyzeOnOpen` 行同款结构 + `t()`） |
| `src/locales/index.ts` | 新键 `aiThinking` / `aiThinkingHint`（中英；说明默认快速模式，开启后深度思考、更慢但可能更细） |

### B. plugin.json 双轨描述 + 版本

- 三个 feature 各加 `description`（值同 `explain`），**保留** `explain` 兼容 7.x 客户端。
- `plugin.json` 与 `package.json` version `1.7.0` → `1.8.0`。

### C. 类型声明 8.0 正名（`src/vite-env.d.ts`）

- `setExpendHeight` → `setExpandHeight`
- `getWindowType` 返回类型 `'main' | 'detach' | 'custom'`
- `ai` 第一参加 `reasoning_effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`（官方联合类型，拼错值由 tsc 拦截）

## 4. 决策不做项（记录备查）

| 项 | 不做理由 |
| --- | --- |
| `aiTranslations` / `releases` 缓存迁 `getPluginLocalDataPath()`（8.0 存储规范「缓存不进同步库」） | 多设备命中翻译缓存 = **省 AI 额度**；对额度敏感用户，额度 > 同步流量。保留同步 db |
| MCP 工具注册（`registerTool` 暴露 search_stars 等） | 8.0 生态增值项，属新功能非适配；列为后续独立任务 |
| `requestSchedule` 定时检查 Release 订阅 | 同上，新功能；列为后续机会 |
| `dbCryptoStorage` 防御性降级 dbStorage | 实证 8.0.2 可用；静默降级 = Token 明文化，不可接受。若 9.0 公告移除再议 |
| 翻译缓存不区分思考模式（`translateRelease` 缓存键只比对内容哈希+model） | 切换 `aiThinking` 后已缓存的翻译照常命中，不重译——**省额度**，与缓存本意一致；记录为接受行为 |

## 5. 验证计划

1. `npm run build`（tsc + vite）零错误（dist 未被 gitignore，产物随提交）；tsc 同时验证 `GithubStarsAPI.analyzeRepo` 新签名与全部调用点形参匹配。
2. **零额度**（dev-bridge，utools.ai 被 stub）：
   - `dev_load` 本插件 preload → `dev_call analyzeRepo(短文本, 假 repoInfo, 'zh', undefined, false)` → `dev_calls_log` 核对发出的 options 含 `reasoning_effort:'none'`；
   - 再 `dev_call analyzeRepo(..., true)` → 核对 options **不含**该字段（thinking=true 分支）；
   - `dev_load mode=plugin` 验 plugin.json 解析（含新增 description 字段不报错）；
   - 测毕 `dev_cleanup`。
3. **实测**（用户已批准，约 3 点，仅一次）：dev-bridge `allowSideEffects:true` 真调 `analyzeRepo`（伪造 README 跳过 GitHub），确认默认模型接受参数、返回 JSON 可解析；记录耗时作参考（**不设 A/B 硬对照**——对照组需再花 3 点，未获批准；以官方「思考模式增加响应时间」口径为定性依据）。
4. **翻译路径核对**（渲染进程拼装，dev-bridge 无法拦截）：靠 tsc 类型约束 + §3.A 的日志增强（开始翻译时输出 `reasoning_effort` 取值）+ 实机手测②人工核对 console 日志值随开关变化。
5. UI：vite dev + 浏览器核对设置页 Toggle 中英文渲染。
6. 提交：单笔 `feat(utools8)`，**不推送**（遵循「仅在用户明确要求时推送」惯例；当前 master 实与 origin/master 同步，此前记忆中的「未推送提交」已过时）。实机手测清单追加：① 开启深度思考后**批量与单仓（DetailPage）**分析均正常且开关行为有别；② Release 翻译正常，console 中 `reasoning_effort` 随开关变化。

## 6. 风险与回退

- 风险：个别第三方模型对 `reasoning_effort` 处理未知 → **开启**「深度思考」开关即回到不发送该参数的请求形态（与 1.7.0 一致），这是 UI 层兜底；实测步骤 3 先行拦截默认模型问题。
- 语义澄清（v1.0 表述曾写反，此处更正）：开关**关闭**（默认）= 发送 `'none'`（快速模式，有意变更，§2 拍板）；开关**开启** = 不发送该字段（模型默认思考）。
- 回退：单笔提交，`git revert` 即整体回退到 1.7.0 请求形态。
