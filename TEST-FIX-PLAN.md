# 测试报告缺陷修复方案（TEST-FIX-PLAN）

> 版本：v1.2 ／ 日期：2026-11-01 ／ 状态：**审核通过**（v1.1 复审裁决「通过」；v1.2 仅落实复审 nitpick 半句，审核者已声明不影响裁决，不再送审）
> 目标版本：插件 1.8.0 → **1.8.1**；被测基线：commit 90c429d（uTools 8.0 适配版）
> 依据：`../gsm-test/REPORT.md`（2026-11-01 20:14–21:05 全功能测试）
>
> v1.1 修订（并入审核意见，2026-11-01）：① P1 补规格——3xx 判定位于响应回调入口（gzip 管道与 JSON.parse 之前）、同域校验改用 `origin`、超限/跨域 reject 的错误契约带 `err.status`；② P3 补 `.slice(0,4)` 保留且置于映射/过滤之后；③ §4 验证步骤 2 改为「先 esbuild 重打包再跑」两步式（`run.cjs` 是 esbuild 产物，旧比较器内联其中，直接跑测的是旧代码）；④ 残留失败数更正为 1 例（BUG-2 意图检查，run.log 5 条 FAIL = name 4 条 + 意图检查 1 条）；⑤ §5 P2 风险表述修正为「用户显式选 name 排序时」。

## 1. 背景

全功能测试结论：preload 逻辑层 209 断言全绿、8.0 适配（reasoning_effort 双分支等）实测确认、生产构建可渲染；发现 **3 个真实缺陷（1 中 2 低——P2 实测定为中）+ 9 条设计/风险提示（R1-R9）**。三处缺陷代码均已二次核实属实。

## 2. 缺陷与修复

### P1（中）仓库改名/转移时 GitHub 301 未被跟随

**证据**：`preload.js` `requestGitHubRaw` 只按 2xx 判定成功，无 3xx 分支。实测 `facebook/react`（已迁 `react/react`）所有子路径返回 301 + `location: /repositories/10270250`：`getReadme` 静默 null、`getRepoReleases`/`getLatestRelease` 抛 `Error: Moved Permanently (err.status=301)`。星标库最易积累改名/转移仓库，受影响仓库永远抓不到 README / Release / 最新版本。

**修复**（`preload.js`）：
- `requestGitHubRaw(path, …)` 改为薄入口：`requestGitHubUrl(new URL(path, 'https://api.github.com'), …)`；主体逻辑移入新函数 `requestGitHubUrl(url, token, options, attempt, redirectsLeft)`。
- **3xx 判定位于响应回调入口**（gzip 管道与 `JSON.parse` 之前）——3xx 响应体（当前是 JSON）不被依赖、不进入解析路径；先排空再决定是否跟随。
- 响应 301/302/307/308 且带 `location` 头：`res.resume()` 排空响应体（keep-alive 连接复用语义）→ 解析 `new URL(location, url)`（绝对/相对两种形态都覆盖；已实测 GitHub 的 location 保留子路径与 query）→ **同域校验**（`url.origin !== 'https://api.github.com'` 直接 reject，origin 一并校验协议与端口，防 Authorization 头泄漏到外部域）→ 递归重发（`redirectsLeft-1`）。**3xx 但无/坏 location → 同超限路径 reject（`err.status` = 该响应码）**，不落入后续 JSON 解析（防呆——现实 GitHub 3xx 必带 Location，探测 4/4 证实）。
- 上限 2 跳（常量 `GITHUB_HTTP_REDIRECT_LIMIT = 2`）。**错误契约**：超限/跨域/坏 location 的 reject 沿用既有约定「HTTP 类错误带 `err.status`」——附 `err.status = 301`（最后响应码），错误信息带最后请求的 path 与已跳数，保持 `verifyToken` 等按 status 分类逻辑可读。`attempt` 计数沿用到重定向后的最终响应（其 403/429 仍走既有退避重试）。
- 既有 gzip 解压 / 2xx 解析 / 403-429 退避 / 30s 超时 / 错误体 JSON 结构化逻辑**全部不动**。

**不做**（记录）：不改为「无 token 时不发 Authorization 头」（行为变更超缺陷范围）；不做 `/repositories/<id>` 主动兜底（跟随 location 已覆盖）。

### P2（中）按名称排序 asc/desc 方向反转

**证据**：`src/stores/selectors/sortSelectors.ts:58-63`——数值分支 `b-a` 本身降序、字符串分支 `localeCompare` 本身升序，共用同一套 `sortOrder === 'desc' ? comparison : -comparison` 翻转。实测 name asc 得 `[charlie, bravo, alpha]`（降序）、desc 得升序；UI 语义 asc=↑（FilterBar）、「升序」（locales）。数值键（stars/updated/starredAt）现行为正确，不受影响。

**修复**：比较器统一**升序语义**产出——数值改 `(a.key as number) - (b.key as number)`，字符串 `localeCompare` 不变；方向行改 `sortOrder === 'desc' ? -comparison : comparison`。数值 desc 仍=大/新优先（行为不变），字符串修正为 asc=A→Z / desc=Z→A。

### P3（低）首页卡片把自定义标签 ID 当文本渲染

**证据**：`src/components/RepositoryCard.tsx:40-43` 将 `aiTags`（中文串）与 `customTags`（标签 **ID**，如 `tag-1`）拼同一数组直接渲染；实测显示 `tag-1`/`tag-2`。对照：标签筛选面板显示正确名称，store 已有标签定义，是卡片侧缺 ID→名称映射。

**修复**：卡片内订阅 `const tags = useStore((s) => s.tags)`（组件层订阅先例：`TagManager.tsx:134`、`Modal.tsx:62`），`useMemo` 建 `id→name` Map；`allTags` 改为 `aiTags + customTags.map(查表).filter(Boolean)`（未知 id 丢弃，不渲染死 ID），**`.slice(0,4)` 截断保留且置于映射/过滤之后**（先截断会让未知 id 白占名额，可见标签不足 4）。`memo` 与其余 props 不动。

### 版本

`plugin.json` + `package.json`：`1.8.0` → `1.8.1`。

## 3. R 项处置（不在本轮范围，记录结论）

| 项 | 处置 |
| --- | --- |
| R1 别名权重（name 命中必连带 fullName 累加，「高权重」注释失真；selector 测试 BUG-2 即此，P2 修后其意图检查 1 例仍 fail 属预期） | 待用户定夺（搜索权重是产品决策） |
| R2 平台筛选双标（`['cli']` 不看 analyzedAt、`none` 看） | 待用户定夺 |
| R3 有关键词时 sortBy 失效 | 待用户确认是否预期 |
| R4 `pushedAt` 不在 SortBy 联合类型（半成品字段） | 待用户定夺（补选项或删字段） |
| R5 `SearchFilter.topics/aiTags` 无消费点 | 待用户定夺 |
| R6 dbCryptoStorage 无降级 | 与 UTOOLS80-ADAPT-PLAN §4「不迁移、不做静默降级」决策一致 |
| R7 分片损坏降级无用户提示 | 不做（console.error 留痕已是设计内行为，UI 提示属增强） |
| R8 `patchReposBatch` 同 id 后者整体覆盖 | 语义备忘，调用方（useStore）现有用法无合并需求 |
| R9 各错误路径语义（401/getReadme null/AI 上抛） | 语义备忘，与 R2 熔断设计一致 |

## 4. 验证

1. `npm run build`（tsc strict + vite）零错误。
2. **P2 回归**（两步——`run.cjs` 是 `run.ts` 的 esbuild 打包产物，旧比较器内联其中，直接跑测的是旧代码）：
   ① 重打包（工作目录 `../gsm-test`，按 `selector-tests/REPORT.md` §1 实测通过的形式；`.bin/esbuild` 是 POSIX shim 须直接执行、不能用 `node` 调）：
   ```bash
   "C:/Users/Administrator/Desktop/ccc/ccc/github-stars-manager-for-utools/node_modules/.bin/esbuild" \
     selector-tests/run.ts --bundle --platform=node --format=cjs \
     --outfile=selector-tests/run.cjs \
     --alias:@=C:/Users/Administrator/Desktop/ccc/ccc/github-stars-manager-for-utools/src
   ```
   ② `node selector-tests/run.cjs`——name asc/desc 4 条失败用例**转绿**，其余通过项零回归；**预期 163 pass / 1 fail**（唯一残留 = BUG-2 意图检查「alias 完全匹配应优于 name 部分匹配」，R1 设计项，不在本轮范围；run.log 原 5 条 FAIL = name 方向 4 条 + 意图检查 1 条）。
3. **P3 UI**：vite dev + 浏览器桩宿主（ui-probe 同法，临时文件不入库）——`getRepos` 假数据带 `customTags:['tag-1']`、`getTags` 返回 `[{id:'tag-1',name:'前端',…}]`，快照核对卡片显示「前端」而非 `tag-1`。
4. **P1**：本轮做代码级验证（tsc）；**实机验证待 dev-bridge 网关恢复**（测试会话末尾网关挂起，恢复需用户在 uTools 开发者工具重载开发桥插件或重启 uTools）——桥恢复后先 `dev_cleanup` 补上次未完成的还原，再注入 token 实测 `getReadme('facebook','react')` 非 null、`getRepoReleases` 返回数组（301→`/repositories/10270250` 跟随成功；审核者已用只读探测独立证实 location 保留子路径与 query，跟随后正常返回）。
5. 提交：单笔 `fix(test-report)`（不推送）。**add 用明确清单**：`preload.js`、`src/stores/selectors/sortSelectors.ts`、`src/components/RepositoryCard.tsx`、`plugin.json`、`package.json`、重建后的 `dist/`（tracked，产物随提交，UTOOLS80-ADAPT-PLAN §5.1 先例）+ 本方案文档；勿把未跟踪的 `.v2c/`、`.video_agent/`、其他历史 PLAN 文档卷入。实机手测清单追加：打开已改名仓库（如 facebook/react）详情页，README/Release 正常加载。

## 5. 风险

- P1 同域限制遇 GitHub 未来跨域重定向会 reject——保守正确（宁可报错不泄凭证）。
- P2 修后**用户显式选 name 排序**时结果与 1.8.0 相反——缺陷本义（对齐 UI 箭头语义），已知会变更；默认排序是 `stars/desc`（`useStore.ts:221-222`），默认视图不受影响。
- P3 订阅 tags 使卡片在标签 CRUD 时整体重渲染——低频操作，可接受（TagManager 同款）。
