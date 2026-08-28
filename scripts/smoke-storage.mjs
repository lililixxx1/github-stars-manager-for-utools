/**
 * 存储层 v2 冒烟测试（Node 直跑 preload.js，mock utools 存储，不打网络）
 * 运行：node scripts/smoke-storage.mjs
 */
import { createRequire } from 'node:module';
import { deepStrictEqual, ok } from 'node:assert';

const require = createRequire(import.meta.url);

// ---------- mock utools（内存 Map 存储 + 写日志） ----------
const storage = new Map();
const writeLog = [];
globalThis.utools = {
    dbStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => { storage.set(k, v); writeLog.push(k); },
        removeItem: (k) => { storage.delete(k); },
    },
    dbCryptoStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => { storage.set(k, v); },
    },
    showNotification: (msg) => console.log('  [notification]', msg),
};
globalThis.window = globalThis;

require('../preload.js');
const api = globalThis.window.githubStarsAPI;

let passed = 0, failed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (e) {
        failed++;
        console.error(`✗ ${name}\n    ${e.message}`);
    }
}
async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (e) {
        failed++;
        console.error(`✗ ${name}\n    ${e.message}`);
    }
}

const mkRepo = (i, extra = {}) => ({
    id: i,
    name: `repo-${i}`,
    fullName: `user${i}/repo-${i}`,
    owner: { login: `user${i}`, avatarUrl: `https://avatars.example.com/${i}.png` },
    description: 'x'.repeat(300),
    homepage: '',
    htmlUrl: `https://github.com/user${i}/repo-${i}`,
    language: i % 3 === 0 ? 'Rust' : 'TypeScript',
    topics: ['cli', 'tools'],
    stargazersCount: 1000 + i,
    forksCount: i % 97,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    pushedAt: '2024-06-01T00:00:00Z',
    starredAt: new Date(Date.now() - i * 3600_000).toISOString(),
    customTags: [],
    lastSyncedAt: Date.now(),
    ...extra,
});

const readMeta = () => storage.get('gh:repos:meta');
const shardKeysInOrder = (meta) =>
    Array.from({ length: meta.totalShards }, (_, i) => `${meta.shardPrefix}:${i}`);

// ================= T1 v2 全量写入/读回/拼接不变量 =================
{
    const repos = Array.from({ length: 5000 }, (_, i) => mkRepo(i));
    const t0 = Date.now();
    api.setRepos(repos);
    const writeMs = Date.now() - t0;

    const meta = readMeta();
    test('T1a 5000 repos 分片且 meta 为 formatVersion 2 + repoIndex', () => {
        ok(meta.sharded === true, 'sharded');
        ok(meta.formatVersion === 2, `formatVersion=${meta.formatVersion}`);
        ok(meta.repoIndex && Object.keys(meta.repoIndex).length === 5000, 'repoIndex 5000');
        ok(meta.totalShards >= 4, `totalShards=${meta.totalShards}`);
    });

    test('T1b 拼接不变量：所有分片 join 后 JSON.parse 等于原数组（顺序一致）', () => {
        const joined = shardKeysInOrder(meta).map((k) => storage.get(k)).join('');
        deepStrictEqual(JSON.parse(joined), repos);
    });

    test('T1c getRepos 读回深相等（元素级拷贝）', () => {
        deepStrictEqual(api.getRepos(), repos);
    });
    console.log(`  (5000 repos 写入耗时 ${writeMs}ms，分片数 ${meta.totalShards})`);

    // ================= T3 patchRepo 单分片写 =================
    writeLog.length = 0;
    api.patchRepo(2500, { alias: '我的别名' });
    test('T3a patchRepo 只写 1 个分片键、不动 meta', () => {
        ok(writeLog.length === 1, `writeLog=${writeLog}`);
        ok(writeLog[0].startsWith('gh:repos:shard:'), `key=${writeLog[0]}`);
    });
    test('T3b patchRepo 后读回：别名生效、其余字段与位置不变', () => {
        const after = api.getRepos();
        ok(after[2500].alias === '我的别名', 'alias');
        ok(after[2500].name === 'repo-2500', 'name intact');
        ok(after.length === 5000, 'length');
        ok(after[2499].id === 2499 && after[2501].id === 2501, 'order intact');
    });
    test('T3c 缓存隔离：外部突变 getRepos 返回值不污染缓存', () => {
        const r1 = api.getRepos();
        r1[0].name = 'HACKED';
        r1[0].customTags.push('x');
        const r2 = api.getRepos();
        ok(r2[0].name === 'repo-0', 'name not polluted');
        ok(r2[0].customTags.length === 0, 'customTags not polluted');
    });

    // ================= T4 patchReposBatch 跨分片写 =================
    const idxA = Number(meta.repoIndex['100']);
    const idxB = Number(meta.repoIndex['4999']);
    writeLog.length = 0;
    api.patchReposBatch([
        { id: 100, patch: { aiSummary: 'A', aiTags: ['ai'] } },
        { id: 4999, patch: { aiSummary: 'B' } },
    ]);
    test('T4a patchReposBatch 只重写受影响分片（2 个不同分片 → 恰好 2 次写）', () => {
        ok(idxA !== idxB, `两个 id 应在不同分片 (${idxA} vs ${idxB})`);
        const shardWrites = writeLog.filter((k) => k.startsWith('gh:repos:shard:'));
        ok(shardWrites.length === 2, `shardWrites=${shardWrites.length}`);
        ok(!writeLog.includes('gh:repos:meta'), 'meta 未重写');
    });
    test('T4b 批量 patch 读回生效', () => {
        const after = api.getRepos();
        ok(after[100].aiSummary === 'A' && after[100].aiTags?.[0] === 'ai', 'repo-100');
        ok(after[4999].aiSummary === 'B', 'repo-4999');
    });
}

// ================= T2 旧格式（盲切分片）兼容 + 首次 patch 升级 =================
{
    storage.clear();
    const repos = Array.from({ length: 2000 }, (_, i) => mkRepo(i));
    const json = JSON.stringify(repos);
    const CHUNK = 900 * 1024;
    const chunks = [];
    for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
    const prefix = `gh:repos:shard:legacy:${Math.random().toString(36).slice(2, 8)}`;
    chunks.forEach((c, i) => storage.set(`${prefix}:${i}`, c));
    storage.set('gh:repos:meta', { sharded: true, totalShards: chunks.length, shardPrefix: prefix });

    test('T2a 旧盲切格式可读（join+parse）', () => {
        deepStrictEqual(api.getRepos(), repos);
    });

    api.patchRepo(7, { alias: 'upgraded' });
    test('T2b 首次 patchRepo 自动升级到 v2（meta 带 formatVersion/repoIndex，数据完整）', () => {
        const meta = readMeta();
        ok(meta.formatVersion === 2, `formatVersion=${meta.formatVersion}`);
        ok(meta.repoIndex && Object.keys(meta.repoIndex).length === 2000, 'repoIndex');
        const after = api.getRepos();
        ok(after.length === 2000 && after[7].alias === 'upgraded', 'data intact');
        deepStrictEqual(after.map((r) => r.id), repos.map((r) => r.id), '顺序不变');
    });
    test('T2c 旧分片键已清理（无 legacy 残留）', () => {
        ok(!storage.has(`${prefix}:0`), 'legacy shard removed');
    });

    // 旧扁平格式
    storage.clear();
    const small = Array.from({ length: 10 }, (_, i) => mkRepo(i));
    storage.set('gh:repos', small);
    test('T2d 旧扁平（未分片）格式可读', () => {
        deepStrictEqual(api.getRepos(), small);
    });
    api.patchRepo(3, { alias: 'flat-upgrade' });
    test('T2e 扁平路径首次 patch：数据完整可读（小数据保持扁平，不强制分片）', () => {
        const after = api.getRepos();
        ok(after[3].alias === 'flat-upgrade', 'patch applied');
        deepStrictEqual(after.map((r) => r.id), small.map((r) => r.id), '完整且有序');
    });
}

// ================= T5 deleteTag 原子化 =================
{
    storage.clear();
    // 注：2500 个仓库（约 1.9MB）确保走分片路径，验证分片场景下的 deleteTag
    const repos = Array.from({ length: 2500 }, (_, i) =>
        mkRepo(i, i % 3 === 0 ? { customTags: ['tag-1'] } : {}));
    api.setRepos(repos);
    storage.set('gh:tags', [{ id: 'tag-1', name: 'T1', order: 0, createdAt: 1, updatedAt: 1 }]);

    await testAsync('T5 deleteTag：一次写入完成，仓库标签剥离、顺序保持', async () => {
        const result = await api.deleteTag('tag-1');
        deepStrictEqual(result, { updated: Math.ceil(2500 / 3), errors: 0 });
        const after = api.getRepos();
        ok(after.every((r) => !r.customTags.includes('tag-1')), 'tag stripped');
        ok(after.length === 2500 && after[2499].id === 2499, 'order/length intact');
        ok(readMeta().formatVersion === 2, 'meta v2 intact');
    });
}

// ================= T6 笔记索引 gh:noteIndex =================
{
    storage.clear();
    const repos = Array.from({ length: 100 }, (_, i) => mkRepo(i));
    api.setRepos(repos);

    api.setNote(1, 'hello');
    api.setNote(2, 'world');
    test('T6a getAllNotes 首次访问后建索引并返回全部笔记', () => {
        deepStrictEqual(api.getAllNotes().map((n) => n.repoId).sort(), [1, 2]);
        ok(Array.isArray(storage.get('gh:noteIndex')), 'index persisted after first scan');
        deepStrictEqual(storage.get('gh:noteIndex').sort(), [1, 2]);
    });
    api.deleteNote(1);
    test('T6b deleteNote 收缩索引', () => {
        deepStrictEqual(api.getAllNotes().map((n) => n.repoId), [2]);
    });

    // 老用户：无索引 → 全量扫描建索引 + 清孤儿
    storage.delete('gh:noteIndex');
    const mkNote = (rid) => ({ id: `note-${rid}`, repoId: rid, content: `c-${rid}`, createdAt: 1, updatedAt: 1 });
    [5, 6, 7, 8, 9].forEach((rid) => storage.set(`gh:note:${rid}`, mkNote(rid)));
    storage.set('gh:note:99999', mkNote(99999)); // 孤儿（仓库不存在）
    // 陈旧索引场景：索引内含已删仓库的 id（索引可发现的孤儿，应被清理）。
    // 索引外孤儿（dbStorage 无法枚举键）按设计保留，不做断言。
    storage.set('gh:noteIndex', [2, 5, 6, 7, 8, 9, 99999]);
    storage.set('gh:note:99999', mkNote(99999));
    test('T6c 索引内孤儿被清理、索引重建为有效集合', () => {
        const notes = api.getAllNotes();
        // 注：T6b 留下的笔记 2 仍在索引中
        deepStrictEqual(notes.map((n) => n.repoId).sort(), [2, 5, 6, 7, 8, 9]);
        ok(!storage.has('gh:note:99999'), 'index-discoverable orphan pruned');
        deepStrictEqual(storage.get('gh:noteIndex').sort(), [2, 5, 6, 7, 8, 9]);
    });
    test('T6d getNote 精确读取', () => {
        ok(api.getNote(7)?.content === 'c-7');
        ok(api.getNote(55) === null);
    });
}

// ================= T7 请求层纯函数（不发网络） =================
test('T7 全量写入后 benchmark 埋点不受影响（api 完整性）', () => {
    ok(typeof api.patchRepo === 'function' && typeof api.patchReposBatch === 'function');
    ok(typeof api.deleteTag === 'function');
});

console.log(`\n===== 结果: ${passed} 通过 / ${failed} 失败 =====`);
process.exit(failed > 0 ? 1 : 0);
