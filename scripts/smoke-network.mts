/**
 * 网络链路冒烟测试（真实 GitHub API，Node 直跑 preload 请求层 + githubService 同步算法）
 * 运行：GITHUB_TOKEN=xxx npx tsx scripts/smoke-network.mts
 */
import { createRequire } from 'node:module';
import { ok } from 'node:assert';

const require = createRequire(import.meta.url);

// ---------- mock utools（存储走内存，网络走真实 node:https） ----------
const storage = new Map();
globalThis.utools = {
    dbStorage: {
        getItem: (k: string) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k: string, v: unknown) => { storage.set(k, v); },
        removeItem: (k: string) => { storage.delete(k); },
    },
    dbCryptoStorage: {
        getItem: (k: string) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k: string, v: unknown) => { storage.set(k, v); },
    },
    showNotification: (msg: string) => console.log('  [notification]', msg),
};
globalThis.window = globalThis as any;
require('../preload.js');
const api = (globalThis as any).window.githubStarsAPI;

const { githubService } = await import('../src/services/githubService');

const TOKEN = process.env.GITHUB_TOKEN;
ok(TOKEN, '缺少 GITHUB_TOKEN 环境变量');
console.log(`token: ${TOKEN.slice(0, 12)}...${TOKEN.slice(-4)} (len=${TOKEN.length})`);

let passed = 0, failed = 0;
async function step(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (e: any) {
        failed++;
        console.error(`✗ ${name}\n    ${e.message}`);
    }
}

// ---------- 1. Token 校验与限流 ----------
await step('N1 checkRateLimit（认证身份 + 配额）', async () => {
    const rate = await api.checkRateLimit(TOKEN);
    console.log('  rate:', JSON.stringify(rate?.rate ?? rate));
    ok(rate, 'rate limit 响应非空');
});

await step('N2 坏 Token 被拒（verifyToken 返回 false）', async () => {
    ok((await githubService.verifyToken('github_pat_invalid_token')) === false, 'should be false');
});

// ---------- 2. 分页（Link header 解析） ----------
let page1: any;
await step('N3 getStarredReposPage 第 1 页 + Link 解析', async () => {
    page1 = await api.getStarredReposPage(TOKEN, 1, 100);
    console.log(`  items=${page1.items.length} totalPages=${page1.totalPages} hasNext=${page1.hasNext}`);
    ok(Array.isArray(page1.items), 'items array');
    ok(typeof page1.totalPages === 'number' || page1.totalPages === null, 'totalPages');
});

// ---------- 3. 全量同步（并发窗口 + 去重 + 进度） ----------
let fullResult: any;
await step('N4 全量同步 syncRepos（空库 → full 模式）', async () => {
    const t0 = Date.now();
    let lastProgress = '';
    fullResult = await githubService.syncRepos(TOKEN, [], null, (cur: number, total: number) => {
        lastProgress = `${cur}/${total}`;
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  mode=${fullResult.mode} repos=${fullResult.repos.length} 耗时=${secs}s 最后进度=${lastProgress}`);
    ok(fullResult.mode === 'full', 'full mode');
    ok(fullResult.repos.length > 0, 'repos non-empty');

    const ids = new Set(fullResult.repos.map((r: any) => r.id));
    ok(ids.size === fullResult.repos.length, 'repo id 无重复（去重生效）');

    // 页序 = created desc：starredAt 应大致非升序（允许相邻相等）
    let sortedOk = true;
    for (let i = 1; i < fullResult.repos.length; i++) {
        const a = new Date(fullResult.repos[i - 1].starredAt).getTime();
        const b = new Date(fullResult.repos[i].starredAt).getTime();
        if (a < b) { sortedOk = false; break; }
    }
    ok(sortedOk, '按收藏时间降序拼接');
    console.log(`  首仓库: ${fullResult.repos[0].fullName} (@${fullResult.repos[0].starredAt})`);
});

// ---------- 4. buildSyncState + 增量同步 ----------
await step('N5 buildSyncState（最新标记 + 前 100 id）', async () => {
    const state = githubService.buildSyncState(fullResult.repos, null, 'full');
    console.log(`  latestStarredAt=${state.latestStarredAt} latestRepoIds=${state.latestRepoIds.length} lastFullSyncAt=${state.lastFullSyncAt}`);
    ok(state.latestStarredAt === fullResult.repos[0].starredAt, 'latest = first repo');
    ok(state.latestRepoIds.length <= 100, 'marker capped');
});

await step('N6 增量同步（刚全量过 → incremental 模式，快速停止）', async () => {
    const state = githubService.buildSyncState(fullResult.repos, null, 'full');
    const result = await githubService.syncRepos(TOKEN, fullResult.repos, state, () => {});
    console.log(`  mode=${result.mode} repos=${result.repos.length} processed=${result.processedCount}`);
    ok(result.mode === 'incremental', 'incremental mode');
    // 增量按设计只返回"扫描窗口"（扫到已知边界即停），与全库合并是 store 层职责
    const knownIds = new Set(fullResult.repos.map((r: any) => r.id));
    ok(result.repos.length >= 1 && result.repos.every((r: any) => knownIds.has(r.id)), '扫描结果均为已知仓库（无新增 star 时第一页即停）');
});

// ---------- 5. 版本获取 ----------
await step('N7 getLatestRelease（取第一个仓库，原始 GitHub 字段）', async () => {
    const first = fullResult.repos[0];
    const [owner, name] = first.fullName.split('/');
    const rel = await api.getLatestRelease(owner, name, TOKEN);
    console.log(`  ${first.fullName} → ${rel?.tag_name ? `${rel.tag_name} (@${rel.published_at})` : '无 Release（falsy）'}`);
    ok(!rel || typeof rel.tag_name === 'string', 'release shape (raw tag_name)');
});

await step('N8 getRepoReleases（第 1 页，3 条）', async () => {
    const first = fullResult.repos[0];
    const [owner, name] = first.fullName.split('/');
    const rels = await api.getRepoReleases(owner, name, TOKEN, 1, 3);
    console.log(`  ${first.fullName} → ${(rels || []).length} 条`);
    ok(Array.isArray(rels), 'array');
});

console.log(`\n===== 结果: ${passed} 通过 / ${failed} 失败 =====`);
process.exit(failed > 0 ? 1 : 0);
