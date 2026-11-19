/**
 * 前端核心纯逻辑冒烟与单元测试（基于 esbuild 内存编译 TS，无需启动浏览器）
 * 运行：node scripts/smoke-unit.mjs
 */
import { createRequire } from 'node:module';
import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

globalThis.window = globalThis;

const entryCode = `
export * from './stores/selectors';
export * from './utils/format';
export * from './utils/analysis';
export * from './utils/backup';
export * from './utils/markdownUrl';
export { i18n, t } from './locales';
`;

const result = await esbuild.build({
    stdin: {
        contents: entryCode,
        resolveDir: srcDir,
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    define: {
        'import.meta.env.DEV': 'false',
    },
    alias: {
        '@': srcDir,
    },
});

const mod = { exports: {} };
const fn = new Function('exports', 'require', 'module', result.outputFiles[0].text);
fn(mod.exports, require, mod);

const {
    parseSearchKeyword,
    createFilteredReposPipeline,
    createFilterBySmartView,
    formatCompactNumber,
    formatRelativeTime,
    getRepoSortTimeInfo,
    checkAnalysisNeeded,
    getCooldownMinutes,
    validateBackup,
    parseMarkdownToHtml,
    resolveMarkdownImageUrl,
    resolveMarkdownLinkUrl,
    resolveMarkdownSrcset,
    sanitizeHtmlDimension,
    slugifyHeading,
    i18n,
    t,
} = mod.exports;

let passed = 0;
let failed = 0;

function test(name, body) {
    try {
        body();
        passed++;
        console.log(`✓ ${name}`);
    } catch (err) {
        failed++;
        console.error(`✗ ${name}\n    ${err.message}`);
    }
}

const now = Date.now();
const isoDaysAgo = (days) => new Date(now - days * 86_400_000).toISOString();

const sampleRepos = [
    {
        id: 1,
        name: 'react',
        fullName: 'facebook/react',
        owner: { login: 'facebook', avatarUrl: '' },
        description: 'UI library',
        homepage: '',
        htmlUrl: 'https://github.com/facebook/react',
        language: 'TypeScript',
        topics: ['ui', 'frontend'],
        stargazersCount: 230000,
        forksCount: 45000,
        createdAt: isoDaysAgo(400),
        updatedAt: isoDaysAgo(2),
        pushedAt: isoDaysAgo(1),
        starredAt: isoDaysAgo(5),
        aiSummary: 'Declarative UI library',
        aiTags: ['UI'],
        aiPlatforms: ['web'],
        analyzedAt: isoDaysAgo(1),
        analysisFailed: false,
        alias: 'React Core',
        customTags: ['tag-1'],
        isSubscribed: true,
        lastSyncedAt: now,
    },
    {
        id: 2,
        name: 'uv',
        fullName: 'astral-sh/uv',
        owner: { login: 'astral-sh', avatarUrl: '' },
        description: 'Fast Python package manager',
        homepage: '',
        htmlUrl: 'https://github.com/astral-sh/uv',
        language: 'Rust',
        topics: ['python', 'cli'],
        stargazersCount: 44000,
        forksCount: 1200,
        createdAt: isoDaysAgo(300),
        updatedAt: isoDaysAgo(10),
        pushedAt: isoDaysAgo(3),
        starredAt: isoDaysAgo(50),
        customTags: [],
        isSubscribed: false,
        lastSyncedAt: now,
    },
    {
        id: 3,
        name: 'tiny-tool',
        fullName: 'dev/tiny-tool',
        owner: { login: 'dev', avatarUrl: '' },
        description: 'A CLI helper',
        homepage: '',
        htmlUrl: 'https://github.com/dev/tiny-tool',
        language: 'Go',
        topics: ['cli'],
        stargazersCount: 850,
        forksCount: 12,
        createdAt: isoDaysAgo(100),
        updatedAt: isoDaysAgo(1),
        pushedAt: isoDaysAgo(1),
        starredAt: isoDaysAgo(10),
        analyzedAt: isoDaysAgo(1),
        analysisFailed: true,
        customTags: [],
        isSubscribed: false,
        lastSyncedAt: now,
    },
];

const noteCtx = {
    hasNote: (id) => id === 2,
    getNoteContent: (id) => (id === 2 ? 'use uv venv' : ''),
};

const baseFilter = {
    keyword: '',
    smartView: 'all',
    languages: [],
    topics: [],
    aiTags: [],
    customTags: [],
    platforms: [],
    hasReleases: null,
    hasNotes: null,
    hasAlias: null,
    sortBy: 'stars',
    sortOrder: 'desc',
};

// 1. 搜索语法解析
test('U1 parseSearchKeyword 分离前缀过滤与关键词', () => {
    const parsed = parseSearchKeyword('lang:Rust tag:cli react hooks');
    deepStrictEqual(parsed.prefixFilters, [
        { type: 'lang', value: 'rust' },
        { type: 'tag', value: 'cli' },
    ]);
    deepStrictEqual(parsed.keywords, ['react', 'hooks']);
});

// 2. 智能视图筛选
test('U2 createFilterBySmartView 覆盖全部 6 种视图', () => {
    strictEqual(createFilterBySmartView('all', noteCtx)(sampleRepos).length, 3);
    deepStrictEqual(createFilterBySmartView('untagged', noteCtx)(sampleRepos).map((r) => r.id), [2, 3]);
    deepStrictEqual(createFilterBySmartView('unanalyzed', noteCtx)(sampleRepos).map((r) => r.id), [2, 3]);
    deepStrictEqual(createFilterBySmartView('noted', noteCtx)(sampleRepos).map((r) => r.id), [2]);
    deepStrictEqual(createFilterBySmartView('subscribed', noteCtx)(sampleRepos).map((r) => r.id), [1]);
    deepStrictEqual(createFilterBySmartView('recent', noteCtx)(sampleRepos).map((r) => r.id), [1, 3]);
});

// 3. 筛选组合管道与相关度
test('U3 createFilteredReposPipeline 组合筛选 + 排序 + 别名搜索权重', () => {
    const byStarsAsc = createFilteredReposPipeline({ ...baseFilter, sortBy: 'stars', sortOrder: 'asc' }, noteCtx)(sampleRepos);
    deepStrictEqual(byStarsAsc.map((r) => r.id), [3, 2, 1]);

    const byPrefix = createFilteredReposPipeline({ ...baseFilter, keyword: 'note:venv' }, noteCtx)(sampleRepos);
    deepStrictEqual(byPrefix.map((r) => r.id), [2]);

    const byAlias = createFilteredReposPipeline({ ...baseFilter, keyword: 'Core' }, noteCtx)(sampleRepos);
    deepStrictEqual(byAlias.map((r) => r.id), [1]);
});

// 4. 格式化工具
test('U4 formatCompactNumber / formatRelativeTime / getRepoSortTimeInfo', () => {
    strictEqual(formatCompactNumber(850), '850');
    strictEqual(formatCompactNumber(1250), '1.3k');
    strictEqual(formatCompactNumber(230000), '230.0k');
    strictEqual(formatRelativeTime(isoDaysAgo(1), 'zh'), '昨天');
    strictEqual(formatRelativeTime(isoDaysAgo(1), 'en'), 'yesterday');

    const starredInfo = getRepoSortTimeInfo(sampleRepos[0], 'starredAt', 'zh');
    strictEqual(starredInfo.prefix, '收藏于');
    const pushedInfo = getRepoSortTimeInfo(sampleRepos[0], 'pushedAt', 'en');
    strictEqual(pushedInfo.prefix, 'Pushed');
});

// 5. AI 分析冷却判定
test('U5 checkAnalysisNeeded & getCooldownMinutes 三态冷却保护', () => {
    deepStrictEqual(checkAnalysisNeeded(sampleRepos[0]), { needsAnalyze: false, reason: 'analyzed' });
    deepStrictEqual(checkAnalysisNeeded(sampleRepos[1]), { needsAnalyze: true, reason: 'never' });

    const recentFail = { ...sampleRepos[2], analyzedAt: new Date(now - 60_000).toISOString(), analysisFailed: true };
    deepStrictEqual(checkAnalysisNeeded(recentFail), { needsAnalyze: false, reason: 'failed_cooldown' });
    ok(getCooldownMinutes(recentFail) >= 3 && getCooldownMinutes(recentFail) <= 5);

    const expiredFail = { ...sampleRepos[2], analyzedAt: new Date(now - 10 * 60_000).toISOString(), analysisFailed: true };
    deepStrictEqual(checkAnalysisNeeded(expiredFail), { needsAnalyze: true, reason: 'cooldown' });
    strictEqual(getCooldownMinutes(expiredFail), 0);
});

// 6. 备份校验
test('U6 validateBackup 校验形状、跳过坏记录并清理孤儿引用', () => {
    deepStrictEqual(validateBackup('bad'), { ok: false, error: 'invalid_file' });
    deepStrictEqual(validateBackup({ repositories: 'not-array' }), { ok: false, error: 'repositories_invalid' });

    const res = validateBackup({
        repositories: [sampleRepos[0], { bad: true }],
        tags: [{ id: 't1', name: 'Tag1' }, { bad: true }],
        notes: [
            { repoId: 1, content: 'ok' },
            { repoId: 9999, content: 'orphan' },
        ],
        releaseSubscriptions: [1, 9999],
        readReleaseIds: [10, 'bad'],
    });
    ok(res.ok);
    strictEqual(res.data.repositories.length, 1);
    strictEqual(res.skipped.repos, 1);
    strictEqual(res.skipped.tags, 1);
    strictEqual(res.skipped.notes, 1);
    deepStrictEqual(res.data.releaseSubscriptions, [1]);
    deepStrictEqual(res.data.readReleaseIds, [10]);
});

// 7. i18n 中英文键一致性
test('U7 i18n.zh 与 i18n.en 键集合完全对齐', () => {
    const zhKeys = Object.keys(i18n.zh).sort();
    const enKeys = Object.keys(i18n.en).sort();
    deepStrictEqual(zhKeys, enKeys);
    strictEqual(t('totalRepos', 'zh', { count: 5 }), '共 5 个仓库');
    strictEqual(t('totalRepos', 'en', { count: 5 }), '5 repositories');
});

// 8. README HTML + GFM 解析与相对路径/XSS 校验
test('U8 markdownUrl 支持 GFM + HTML 解析与相对 URL 安全补全', () => {
    strictEqual(
        resolveMarkdownImageUrl('resources/tinta.ico', 'oipoistar/tinta'),
        'https://raw.githubusercontent.com/oipoistar/tinta/HEAD/resources/tinta.ico'
    );
    strictEqual(
        resolveMarkdownImageUrl('https://github.com/a/b/blob/main/img.png', 'a/b'),
        'https://raw.githubusercontent.com/a/b/main/img.png'
    );
    strictEqual(resolveMarkdownImageUrl('javascript:alert(1)', 'a/b'), null);
    strictEqual(resolveMarkdownImageUrl('data:text/html,<script>alert(1)</script>', 'a/b'), null);

    deepStrictEqual(
        resolveMarkdownLinkUrl('LICENSE', 'oipoistar/tinta'),
        { href: 'https://github.com/oipoistar/tinta/blob/HEAD/LICENSE', isAnchor: false }
    );
    deepStrictEqual(
        resolveMarkdownLinkUrl('#install', 'oipoistar/tinta'),
        { href: '#install', isAnchor: true }
    );
    strictEqual(resolveMarkdownLinkUrl('javascript:alert(1)', 'oipoistar/tinta'), null);

    strictEqual(
        resolveMarkdownSrcset('resources/a.png 1x, https://example.com/b.png 2x, javascript:bad 3x', 'oipoistar/tinta'),
        'https://raw.githubusercontent.com/oipoistar/tinta/HEAD/resources/a.png 1x, https://example.com/b.png 2x'
    );

    strictEqual(sanitizeHtmlDimension('80'), '80px');
    strictEqual(sanitizeHtmlDimension('49%'), '49%');
    strictEqual(sanitizeHtmlDimension('expression(1)'), null);
    strictEqual(slugifyHeading('✨ Features & Usage!'), 'features-usage');

    const sampleReadme = `<div align="center">
<img src="resources/tinta.ico" width="80">
<h1>Tinta</h1>
<p><em>Markdown, distilled.</em></p>
</div>

| Feature | Status |
| --- | --- |
| GFM Table | Ready |

- [x] Parsed checkbox
`;
    const html = parseMarkdownToHtml(sampleReadme);
    ok(html.includes('<div align="center">'));
    ok(html.includes('<h1>Tinta</h1>'));
    ok(html.includes('<table>'));
    ok(html.includes('type="checkbox"'));
});

console.log(`\n===== 单元测试结果: ${passed} 通过 / ${failed} 失败 =====`);
process.exit(failed > 0 ? 1 : 0);
