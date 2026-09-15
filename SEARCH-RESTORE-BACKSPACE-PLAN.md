# 方案：返回首页恢复搜索状态 + 返回操作统一为 Backspace

版本：v1.4（v1.3 实测修正后经第三轮审核"有条件通过"，v1.4 并入其三条件：restorePendingRef 守卫入档、§7 注明滚动注入方式、P2-2 翻页追踪加固；冷却 5min 改动拆出至 COOLDOWN-5MIN-CHANGE.md 单独授权）
目标："子页 → 首页"单层导航的状态恢复（措辞降级自"压栈/出栈"：本插件导航模型是单层，Detail→releases/tags 后返回落 home 而非详情，返回栈留作后续）；插件内返回操作统一为 Backspace 键，原"返回"按钮改为**可点击的 ⌫ 提示 chip**（视觉为键盘提示，功能等同小按钮——保留鼠标用户逃生路径，Backspace 仍为主路径）。

## 0. 现状结论（摸底）

1. **Backspace 返回已经全量存在**：`useBackShortcut`（监听 Backspace，`useGlobalShortcut` 提供"输入框/组合键不触发"守卫）已被 Detail/Settings/Tags/Releases 四页接入；Releases 与 Detail 还有 `beforeBack` 分层语义（先关弹层/退出编辑，再返回）。ESC 因与 uTools 窗口层冲突，不用于页面返回（弹窗层既有 ESC 关闭行为保留）。**本方案不新增任何键盘监听**。
2. **搜索状态丢失的根源**：App.tsx `[currentPage]` effect（v1.6.4 方案B）——离开 home 移除子输入框；返回 home 时无条件 `setSearchFilter({ keyword: '' })` 清空并重挂空子输入框。
3. **滚动位置丢失的根源**：App.tsx 条件渲染页面，进子页时 HomePage 整体卸载。
4. **分页页码**：`currentPageNum` 在 store 中可存活，但 `setSearchFilter` 无条件重置为 1；`utools.setSubInputValue()` 触发 subInput onChange 回调属**运行时待验证假设**（仓库内仅有自建类型声明，无官方行为保证），需实测。

## 1. 改动点 A：搜索状态恢复（推翻方案B）

文件：`src/App.tsx`

- **A1** `[currentPage]` effect 重写：进入 home 时**先置位 A3b 抑制上下文**，再 `setupRepositorySearchSubInput(true)`，最后**无条件** `utools.setSubInputValue(useStore.getState().searchFilter.keyword)`（含空串，保证显示值与 store 一致，不赌 uTools 重挂载是否保留旧值）；不再清空关键词。keyword 用 `getState()` 实时读。
- **A2** 删除 `enterKeywordApplied` 标志（其唯一意义是防 effect 清空入口词；恢复语义下不再清空）。三分支回归：
  - `github-stars`：handler 先 `setCurrentPage('home')` 再同步清空 keyword；effect 后行读到 '' → 回填空串，无副作用 ✓（新会话干净开始保留）
  - `github-stars-search` 带词：handler 已写 store 并 setValue；若此前已在 home，`setCurrentPage('home')` 同值不触发 effect（zustand selector 精确订阅），handler 已完成一切 ✓；若此前在子页，effect 回填同值（幂等）✓
  - `github-stars-repo` 落空转搜索：同上 ✓
- **A3** `scheduleSubInputKeyword` 加同值守卫：`text === useStore.getState().searchFilter.keyword` 时跳过写入（阻断回填→onChange→`setSearchFilter`→页码归 1 的连锁；顺带消除同值重算）。
- **A3b（防注册期空回调 + 回显，复核必改 2）** 模块级一次性抑制上下文 `subInputSuppress: { until: number; value: string } | null`。**在调用 `setupRepositorySearchSubInput` 之前置位**（`until = Date.now() + 250`，`value` = 即将回填的关键词——若 uTools 在 setSubInput 注册瞬间同步回调，该回调也落在抑制范围内）。subInput onChange 回调开头判定：处于窗口内且为**首个**回调时——文本为空串或等于 `value` 则吞掉（消费，一次性）；文本为其他值（用户真实编辑）则放行并解除抑制；窗口过期后抑制自动失效。后续若仍有等于 store 当前关键词的回调，由 A3 同值守卫兜住。该"一次性消费 + 内容判定"语义避免"250ms 全吞"造成的输入滞后（用户窗口内输入并停止时，列表不更新到下一次击键）。**三条 uTools 运行时假设（注册期回调、setSubInputValue 回调、removeSubInput 行为）列入交付实测清单，实测不符时按本备用设计调整。**

## 2. 改动点 B：滚动位置恢复（虚拟模式为**近似恢复**）

文件：`src/stores/useStore.ts`、`src/pages/HomePage.tsx`

- **B1** store 新增运行时状态（不持久化）：`homeScrollMemory: { offset: number; keyword: string; page: number; viewMode: 'card' | 'list'; itemsPerPage: number } | null` + setter。
- **B2（v1.3 实测修正版）** 滚动位置**滚动时持续追踪**：容器加 `onScroll` 写入 `lastScrollTopRef`；卸载 cleanup 只读追踪值，**不触碰 DOM**。原设计（cleanup 读容器 `el.scrollTop`）经浏览器实测证伪：React passive cleanup 运行时元素已脱离文档，脱离文档的元素 `scrollTop` 读作 0，保存值恒为 0。追踪法同时天然消解审核 P0-1 的 ref 置空时序问题（不再需要镜像 ref）。StrictMode 约束仍适用（当前未启用；若启用，假卸载会以追踪值覆盖记忆，需改为滚动时节流写 store）。
- **B3（v1.3 实测修正版）** 挂载恢复 effect（`[]` 依赖，运行一次）：**指纹匹配**（keyword + page + viewMode + itemsPerPage 四项一致）**且 `currentPageNum <= totalPages`**（P1-2 防越界恢复）才恢复；effect 内**立即赋值** `el.scrollTop = offset` + rAF 复校一次（页面不可见时渲染循环暂停、rAF 永不触发，立即赋值强制同步布局同样生效），**并同时同步 `lastScrollTopRef = offset`**——程序化赋值不保证派发 scroll 事件（不可见页面浏览器不派发），不能依赖 onScroll 回填，否则下一次卸载保存会用旧值覆盖恢复前位置。不用 virtualizer.scrollTo（避免引入 `_intendedScrollOffset` 匹配逻辑）。分页模式精确；超界由浏览器钳制。
- **B4** 虚拟模式 `useVirtualizer` 增加 `initialOffset`（B3 同源取值：指纹匹配且页码在界内取记忆 offset，否则 0），与 B3 赋值同值收敛，不抖动。**精度语义降级（P1-3）**：虚拟器实例随卸载销毁、实测行高缓存丢失，重挂载按估算行高渲染，深滚动时恢复位置可偏差数行——本方案接受"近似恢复"（分页模式为默认且精确）；锚点行（repo id + 行内偏移）方案留作后续优化。
- **B5** 不恢复（静默跳过）属预期：全新进入插件（keyword 被清→指纹失配）、离开期间筛选上下文变化、页码越界。**有意行为（P2-4）**：记忆不主动清空，用户日后以相同 keyword+page+viewMode+itemsPerPage 回到列表时会恢复当时 offset，接受。
- **B6（P1-2 防护）** 页码越界收敛 effect（常驻，非仅挂载）：`filteredRepos.length > 0 && 非全部模式 && currentPageNum > totalPages` 时 `setCurrentPageNum(totalPages)`。覆盖三条越界路径：设置页改每页数量、导入备份整表替换、后台同步缩减结果。与 B3 无顺序依赖（B3 自身校验页码在界内，收敛先跑只会令指纹失配→跳过恢复，语义正确）。
- **B7（v1.4 入档，第三轮审核 P1-2）恢复跟随守卫 `restorePendingRef`**：HomePage 挂载时 `useRef(restoreOffset > 0)` 初始化；键盘跟随 effect 首次运行时若守卫为真则消费并跳过本次跟随。**必要性**：挂载后 active-index effect 会把 activeRepoIndex 从 null 置 0，跟随 effect 对第 0 行 scrollIntoView/scrollToIndex——行 0 通常在恢复位置上方，会把列表拉回顶部、直接抵消 B3/B4 的恢复。**语义**：仅跳过一次；无恢复路径（restoreOffset=0）守卫初值 false、不误伤正常跟随。**边界**：挂载时列表为空（如导入替换表后）activeRepo 恒 null、守卫不被消费，留待列表恢复后第一次跟随被跳一次——彼时容器 scrollTop 必为 0，跳过的是 no-op，无实际影响。
- **B8（v1.4，第三轮审核 P2-2 加固）翻页后追踪同步**：`[currentPageNum]` effect（定义于跟随 effect 之后，键盘翻页的同步 scrollIntoView 已生效）直接回读容器 scrollTop 写入追踪值，封堵"翻页引起的滚动变化事件尚未派发就卸载"的次帧竞态。

## 3. 改动点 C：返回按钮 → 可点击 ⌫ chip

- **C1** `DetailPage.tsx`：顶栏返回 button（495-505）替换为 ⌫ chip；`rovingControls` 删 `id: 'back'` 条目（324）；`useRovingControls` `initialId` 改 `'alias'`（进入详情页焦点默认落别名按钮，Enter 打开别名编辑——已知行为变化，写入交付说明）；memo deps 中移除不再被 rovingControls 引用的 `handleBack`（函数本身保留，useBackShortcut 仍用）。**（复核必改 1）DetailPage 的 chip 必须 `tabIndex={-1}`**：`useRovingControls` 以 capture 在 document 上拦截 Enter/Space 并派发给当前激活控件，未注册的可聚焦按钮会被劫持（Tab 聚焦 chip 按 Enter 实际触发 'alias' 控件）。`tabIndex={-1}` 保留鼠标点击，键盘路径由 Backspace 承担，与删 roving 条目的设计自洽。其余三页无全局 Enter/Space 处理器，chip 保持正常 tab 序。
- **C2** `SettingsPage.tsx` / `TagsPage.tsx` / `ReleasesPage.tsx`：顶栏返回 button 各替换为 ⌫ chip。
- **C3（P1-4 决策）** chip 为**真实 `<button>`**、kbd 风格内联样式、label `⌫ {t('back')}`——复用既有 locale key（zh「返回」/en「Back」），**无需新增 i18n key**；点击执行原 handleBack，Backspace 为主路径。鼠标用户保留逃生路径（避免"导航本身鼠标驱动、返回却唯一键盘化"的自相矛盾，含读屏器可达性）。
- **C4** 保留（非返回按钮）：ReleaseDetail 弹窗关闭 X（Modal 语义）、Releases 空态 CTA"浏览仓库"、HomePage 分页前/后翻、SettingsPage 跳转版本页、DetailPage 跳转 releases/tags、首页无 token 引导 CTA。
- **C5** 键盘守卫零改动：`shouldIgnoreGlobalKeydown` 与各页 `beforeBack` 沿用。
- **C6（P2-1 清理）** 删除四页不再使用的 `ArrowLeft` import（HomePage 的 ChevronLeft 分页按钮保留）。

## 4. 明确不做（边界）

- ReleasesPage 自身列表滚动/Tab 恢复（无搜索子输入框，后续单独做）。
- ESC 不绑定页面返回（uTools 冲突；弹窗既有 ESC 关闭保留）。
- 滚动/搜索状态不落盘（会话级）。
- 多层返回栈（Detail→releases 后 Backspace 落 home 而非详情）。

## 5. 风险与回归点

| # | 风险 | 缓解 |
|---|------|------|
| R1 | setSubInputValue/注册期回调连锁清词、重置页码 | A3 同值守卫 + A3b 250ms 吞吐窗口；实测三条假设 |
| R2 | 卸载 cleanup 时元素已脱离文档，读 scrollTop 恒为 0（v1.3 实测发现） | B2 滚动时持续追踪 + cleanup 只读追踪值 |
| R7a | 挂载后键盘跟随把列表拉回顶部、抵消恢复 | B7 恢复跟随守卫（一次性消费） |
| R7b | 无渲染环境（页面不可见）下程序化赋值不派发事件，追踪值短暂滞后 | B3 恢复赋值同步追踪值；可见页面事件自纠 |
| R3 | 越界页码→空列表（改每页数量/导入/同步缩减） | B6 常驻收敛 + B3 页码在界校验 + 指纹含 itemsPerPage |
| R4 | enterKeywordApplied 移除后入口路径回归 | A2 三分支推演；实测清单覆盖 |
| R5 | roving 初始焦点落别名按钮 | 已知行为变化，交付说明披露 |
| R6 | 虚拟模式恢复为近似（估算行高偏差） | 接受并披露；锚点方案留后续 |
| R7 | StrictMode 未来启用破坏 B2 | 代码注释注明约束 |

## 7. 浏览器实测记录（v1.3，2026-09-15）

环境：vite dev + 临时 `window.githubStarsAPI` shim（60 个 mock 仓库，仅 preload 缺失时生效，已随测删除）。**滚动注入方式说明（第三轮审核 P1-3）**：测试标签页处于 `document.hidden` 状态（渲染循环暂停），程序化 `scrollTop` 赋值不派发 scroll 事件、rAF 不触发——因此每步"滚动到 X"的操作均为「程序化赋值 + 手动 `el.dispatchEvent(new Event('scroll'))` 模拟浏览器派发」，onScroll 追踪值由此更新；生产环境（可见页面）该事件由浏览器原生派发。由此暴露并修正了 B2/B3 的两处实现缺陷（见上）。实测通过项：

1. ✅ 关键词恢复：搜索"双行"（20 命中）→ 详情 → Backspace 返回，仍 20 条且首个结果不变（旧方案B会变 60 条）；
2. ✅ 滚动恢复（分页模式）：滚动 500 → 往返 → 恢复 500；连续两轮（Backspace + chip 交替）均恢复 240；
3. ✅ 页码恢复：全量 3 页翻到第 2 页（ArrowRight）→ 往返 → 仍 2/3、首个仓库 repo-21 不变、滚动 200 恢复；
4. ✅ ⌫ chip：详情/设置页渲染正常，点击可返回（鼠标路径）；
5. ✅ 输入框守卫：设置页 token 输入框聚焦时 Backspace 不返回；失焦后 Backspace 正常返回；
6. ✅ 虚拟模式（itemsPerPage=0）：视口仅渲染 12 行、总高 7140px；滚动 1500 → 往返 → 恢复 1420（偏差约一行，符合"近似恢复"披露）。

uTools 实机仍待用户核验的项（浏览器无法覆盖）：subInput 回填/回调抑制（A1/A3b 三条假设）、`github-stars` 全新进入清空语义、真实数据量下的表现。

## 8. uTools 实机手动清单（待用户核验）

- 手动清单（交付说明列出）：
  1. 搜索→进详情→Backspace：关键词在框、列表过滤、页码保持、滚动位置保持；
  2. 四子页 Backspace 返回；chip 可点击返回；
  3. 输入框内 Backspace 删字符不返回；弹窗开时先关弹窗；
  4. uTools 主搜带词进入插件：过滤正常（A2 回归）；
  5. 设置页改每页数量 / 导入备份后返回：无空列表、页码收敛（B6/B3）；
  6. 虚拟列表深滚动（混排单/双行描述）→详情→返回：位置近似恢复，偏差可接受（R6）；
  7. 三条 uTools 假设实测：注册期是否回调空串、setSubInputValue 是否触发 onChange、removeSubInput 后重挂载是否残留旧值——不符则调整 A3b；
  8. 返回后立刻（250ms 窗口内）输入并**停止**（不再击键）：列表应实时对齐（A3b 一次性消费语义下真实编辑即时放行）；若观察到滞后，记录为 A3b 残差。

已知 UX 行为（第三轮审核 P2-1，接受并披露）：恢复滚动后键盘 active 行仍在第 0 行（视口外、无高亮），用户第一次按 ArrowDown 时跟随会把该行滚入视口、列表从恢复位置跳走——后续可优化为恢复时按 offset 播种 active 行。
