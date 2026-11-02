# 测试报告 R 项处置方案（R-FIX-PLAN）

> 版本：v1.2 ／ 日期：2026-11-02 ／ 状态：待复审
> 目标版本：插件 1.8.2 → **1.8.3**；基线：commit 830e684（1.8.2）
> 依据：gsm-test/REPORT.md §三 R1-R9 + 2026-11-02 本会话对 830e684 的逐项复核（7 项全部仍在）
> 用户指示：「按你推荐的来」——采纳推荐口径：**修 R1/R2/R4，R3/R5/R6/R7 记录不修理由**
>
> v1.1 修订（并入审核意见）：① **条件项**——§3 表补 run.ts:282-283 两条 ⚠ 脏数据行为断言的改写去向（修后期望 []）；② R7 不修理由改真——原方案驳斥了稻草人（「改为 throw」非原建议），改为如实权衡（原建议是加一次性降级提示）；③ §3 行号校准（阶梯 :446-450 + 注释 :429-438、意图 :453-464、pushedAt :567-568、NaN 先例 :557-559）；④ 预期计数改为「164 例 + 新增约 4 条 ≈ 168」；⑤ §4.1 esbuild 命令改绝对路径形态；⑥ R1 注释补「跨字段累加可越位」说明。
> v1.2 修订（复审剩余条件，按审核者修法 (b)）：R7 理由两处支撑表述再改真——如实记录实现仅约 3 行（preload.js:851 已有 showNotification，v1.1 的「跨 preload→UI 层」成本高估不实），权衡改为「极低概率场景引入通知逻辑与防重弹状态不值」；删去 §六 错位引证（那是测试网关挂起的恢复方式），恢复路径改为「数据为空是暂态，列表可经下次同步从 GitHub 全量重建（已实测）」。决策（不修）不变。

## 1. 范围与复核结论（2026-11-02，对照 830e684）

| 项 | 复核证据 | 处置 |
| --- | --- | --- |
| R1 别名权重名不副实 | `searchSelectors.ts:56-71`：alias 完全=15 < name 部分=18（name 10 + fullName 连带 8）< name 完全=23 | **修** |
| R2 平台筛选双标 | `filterSelectors.ts:142` 显式平台分支只查 `aiPlatforms` 不查 `isAnalyzed`；none 分支（:127-131）按 `analyzedAt && !analysisFailed` 判 → 脏数据（未分析/分析失败但残留平台）同时落入互斥筛选 | **修** |
| R3 有关键词时排序失效 | `selectors/index.ts:78-82` keywords 非空 → 相关度排序后直接 return，跳过用户 sortBy | 不修（记录） |
| R4 pushedAt 半成品 | 采集✓（`githubService.ts:340`）、索引✓（`filterSelectors.ts:74`）、`SortBy` 联合类型无 `'pushedAt'`（`types/index.ts:8`）→ UI 无法选它排序 | **修** |
| R5 SearchFilter.topics/aiTags 死字段 | `types/index.ts:143-144` 声明；管道不消费、UI 无写入（全仓 grep 仅 useStore 初始空数组） | 不修（记录） |
| R6 dbCryptoStorage 无降级 | `preload.js:633-636` 直连无回退；真机 8.0.2 实测 API 仍在 | 不修（记录） |
| R7 坏分片空库观感 | `preload.js:327-336` 缺片静默跳过 → JSON.parse 失败 → `[]` + console.error | 不修（记录） |

### 不修理由（记录）

- **R3**：关键词搜索时按相关度排序是搜索场景的标准交互范式（用户输入关键词即表达"按匹配程度找"意图）；强制套用用户排序反而损害查找效率。保持现状，注释已在 `index.ts:80` 自认此行为。
- **R5**：两个字段是「按 AI 标签/topics 筛选」的合理预留（AI 标签是本插件核心功能，customTags 筛选已有完整管道先例 `index.ts:67`），纯类型声明零运行时成本；删除后将来做该功能还要加回。保留。
- **R6**：与既有「存储不迁移」决策一致（v1.7 审计已定）；且真加降级意味着 token 落 `dbStorage`（非加密），安全上是降级而非升级。真机实测 8.0.2 `dbCryptoStorage` 完整可用，风险仅在未发生的未来版本。
- **R7**：原建议是**加一次性降级提示**（针对用户观感「数据全没了」）。如实记录成本：preload 已有 `showNotification` 能力（preload.js:851），实现仅约 3 行（getRepos catch 分支 + 一次性标记）。经权衡仍不修：触发条件是本地存储损坏/截断，极罕见（1.8.0 全功能测试也无法构造该场景），为极低概率场景引入通知逻辑与防重弹状态不值；且数据为空是**暂态**——仓库列表可经下次同步从 GitHub 全量重建（空库→全量同步已实测）。console.error 留痕仅作开发者侧取证，不作为用户侧方案。

## 2. 修复设计

### R1：别名真正高权重（`src/stores/selectors/searchSelectors.ts:56-58`）

用户自定义别名是最强的个人化相关性信号（用户用自己的话给仓库起的名），搜索该别名应排最前。分值调整：

```ts
// 别名匹配（真正高权重：用户自定义别名是最强个人化信号，完全命中压过 name 完全+fullName 连带的 23）
if (fields.alias && fields.alias.includes(kw)) {
    score += fields.alias === kw ? 30 : 20;
    kwMatch = true;
}
```

修后计分阶梯：**alias 完全(30) > name 完全+fullName(23) > alias 部分(20) > name 部分+fullName(18)** > fullName(8) > owner(6) > 描述/摘要(5) > AI标签/自定义标签(4) > topics(3)。语义：别名完全 > 仓库名完全 > 别名部分 > 仓库名部分（精确压过部分、个人化压过原始名）。其余分值不动。

> 注（写入代码注释）：该阶梯是**单字段、单关键词**的贡献值；既有累加语义下跨字段累加可越位（如 name 完全 + owner + 描述 = 34 > 30 的 alias 完全）——修前 15/23 时代同样存在，非本次引入，阶梯不构成全局排序保证。

### R2：平台筛选统一 isAnalyzed 口径（`src/stores/selectors/filterSelectors.ts:141-143`）

```ts
// 只选择具体平台（与 none 分支同口径：未分析/分析失败的仓不按残留 aiPlatforms 命中，归入 none 语义）
return isAnalyzed && hasPlatforms && realPlatforms.some(p =>
    repo.aiPlatforms?.includes(p)
);
```

- none+others 混合分支（:134-139）**不动**：脏数据经 `!isAnalyzed` 项已命中，行为不变（数学上 some() 加不加 isAnalyzed 守卫结果相同——`!isAnalyzed` 为真时短路）
- 效果：脏数据仓（未分析/分析失败但残留 aiPlatforms）只落 `none`，不再同时命中 `['cli']` 等显式平台——互斥筛选恢复互斥
- `@note` 注释同步更新为统一口径表述

### R4：补全 pushedAt 排序（四处一行级改动 + 类型收紧）

| 文件 | 改动 |
| --- | --- |
| `types/index.ts:8` | `SortBy` 联合类型 += `'pushedAt'` |
| `sortSelectors.ts` getSortKey | `case 'pushedAt': return getSearchIndex(repo).pushedAt;`（索引 :74 已预计算；缺失→NaN，与 updatedAt 非法值同为既有容忍路径，NaN 比较被 sort 当 0 处理不崩——已有测试先例 run.ts:557-559） |
| `sortSelectors.ts` getSortByLabel | `pushedAt: { zh: '按推送时间排序', en: 'Sort by Pushed Time' }`（`Record<SortBy,...>` 完整性由 tsc 强制） |
| `FilterBar/index.tsx` SORT_OPTIONS | += `{ value: 'pushedAt', labelKey: 'sortByPushedAt' }`；labelKey 类型从 `string` 收紧为 `TranslationKey`（漏配文案键变编译错误） |
| `locales/index.ts` zh + en | += `sortByPushedAt: '按推送时间排序'` / `'Sort by Pushed Time'` |

- 无 SettingsPage 改动：defaultSortBy 无独立设置 UI（由 FilterBar 排序菜单原子写 settings，`useStore.ts:385-395`）
- 数据侧无改动：同步已采集 `pushed_at`（`githubService.ts:340`），存量数据即用

### 版本

`plugin.json` + `package.json`：`1.8.2` → `1.8.3`。

## 3. 测试同步（gsm-test/selector-tests/run.ts，随修复更新意图）

| 现断言 | 更新为 |
| --- | --- |
| :446-450 阶梯顺序断言 + :429-438 行内分数注释（`// name 15 + fullName 8 = 23` 等） | 新阶梯 `[aliasExact(30), nameExact(23), namePartial(18), fullNameOnly(8), …]`（无 alias 部分用例，顺序仅 aliasExact 前移；注释改新分值） |
| :453-464 意图检查（现行唯一 fail，:460 else 文案含旧分值 15） | 逻辑不变（aliasExact 应在 namePartial 前），修后转绿；else 分支失败文案同步新分值表述 |
| :278 `['cli'] → [1,2,6]`（含未分析残留 6，⚠ 记录真实行为） | `[1,2]`——意图改为「显式平台只含已分析且含该平台者」，6（未分析残留）不再命中 |
| :279 `['cli','web'] → [1,2,5,6]` | `[1,2]`——5（分析失败残留 web）同理不再命中 |
| :280 `['none','web'] → [2,3,4,5,6]` | **不变**（审核者独立推演确认：脏仓经 `!isAnalyzed` 项命中，行为不变，验证性保留） |
| :281 ⚠ 注释「显式平台分支完全不看 analyzedAt」 | 改为统一口径记录 |
| :282-283 两条 ⚠ deepEq（`['cli']` 命中脏仓 6 → 期望 [6]；`['web']` 命中失败仓 5 → 期望 [5]，固化旧缺陷行为） | 改写为统一口径正向记录：两者期望各为 `[]`，断言名去掉「命中…不一致」表述（如「⚠ 统一口径：脏数据(6) 不命中显式平台」） |
| :567-568 `⚠ sortBy='pushedAt' 不在联合类型 → default 0 顺序不变` | 替换为真断言：sortRepos（:504-508）补 pushedAt 值后断言 `createSorter('pushedAt','desc'/'asc')` 顺序；另补 `getSortByLabel('pushedAt', zh/en)` 两条 eq |

**预期结果：既有 164 例全绿（唯一 fail 的意图检查转绿、更新项全部转绿）+ 新增 pushedAt 断言约 4 条，总数约 168**。

## 4. 验证

1. esbuild 重打包 harness（**必须先打包再跑**，run.cjs 内联源码；alias 用绝对路径，照抄 selector-tests/REPORT.md §1 既有命令形态）：`node_modules/.bin/esbuild ../gsm-test/selector-tests/run.ts --bundle --platform=node --format=cjs --outfile=../gsm-test/selector-tests/run.cjs --alias:@=C:/Users/Administrator/Desktop/ccc/ccc/github-stars-manager-for-utools/src && node ../gsm-test/selector-tests/run.cjs` 预期全绿（总数约 168）。
2. `npm run build`（tsc strict + vite）零错误——`Record<SortBy>` 与 `TranslationKey` 收紧由编译器把关。
3. R4 UI 抽查（可选）：vite preview/dev + 桩宿主，确认排序菜单出现第 5 项「按推送时间排序」且可选中生效。
4. 复测后更新 gsm-test/REPORT.md：§三 R 表 R1/R2/R4 标记已修（1.8.3）；头部复测结论区「前端纯函数 163/164（唯一失败仍是 R1 设计项）」表述同步更新为新口径。
5. 提交：单笔 `fix(selectors)`（不推送），add 清单：`src/types/index.ts`、`src/stores/selectors/searchSelectors.ts`、`src/stores/selectors/filterSelectors.ts`、`src/stores/selectors/sortSelectors.ts`、`src/pages/home/components/FilterBar/index.tsx`、`src/locales/index.ts`、`plugin.json`、`package.json`、重建 `dist/`、本方案文档。（run.ts 在 gsm-test/ 仓库外，不入库。）

## 5. 风险

- R1 分值变化会改变**所有含别命中场景**的搜索排序——这是缺陷本义（兑现「别名高权重」注释与用户预期），在文档记录新阶梯。
- R2 行为变化：依赖「分析失败但残留旧平台」的筛选用户会看到这些仓从显式平台筛选中消失、归入 none——与 none 分支的既有归类一致，属纠偏。
- R4 的 NaN 边界：存量极旧数据（无 pushedAt）在 pushedAt 排序下 NaN 当 0（同 updatedAt 既有容忍路径），不崩但顺序退化为稳定序——GitHub API 恒返回 pushed_at，正常数据不受影响。
- labelKey 收紧为 TranslationKey：若现 SORT_OPTIONS 四键均存在于 zh 词条则编译零影响（已预核 zh:76 有 sortByStarredAt 等）。
