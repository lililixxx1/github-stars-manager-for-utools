import type {
    GithubStarsAPI,
    Release,
    Repository,
    RepositoryNote,
    Settings,
    SyncState,
    Tag,
} from '../types';

const STORAGE_PREFIX = 'gh-dev:';
const DEV_MOCK_FLAG = '__GH_STARS_DEV_MOCK__';

function readStorage<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function writeStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    } catch {
        // Ignore storage quota errors in dev mock
    }
}

function daysAgoIso(days: number): string {
    return new Date(Date.now() - days * 86_400_000).toISOString();
}

function createSeedTags(): Tag[] {
    const now = Date.now();
    return [
        { id: 'tag-frontend', name: '前端框架', icon: '⚡', color: '#3b82f6', order: 0, createdAt: now, updatedAt: now },
        { id: 'tag-rust', name: 'Rust 工具', icon: '🛠️', color: '#f59e0b', order: 1, createdAt: now, updatedAt: now },
        { id: 'tag-ai', name: 'AI & LLM', icon: '🚀', color: '#8b5cf6', order: 2, createdAt: now, updatedAt: now },
        { id: 'tag-efficiency', name: '开发效率', icon: '🎯', color: '#10b981', order: 3, createdAt: now, updatedAt: now },
        { id: 'tag-docs', name: '学习资料', icon: '📚', color: '#ec4899', order: 4, createdAt: now, updatedAt: now },
    ];
}

function createSeedRepos(): Repository[] {
    const now = Date.now();
    const specs: Array<{
        id: number;
        owner: string;
        name: string;
        lang: string | null;
        stars: number;
        forks: number;
        desc: string;
        aiSummary?: string;
        aiTags?: string[];
        aiPlatforms?: string[];
        customTags?: string[];
        alias?: string;
        isSubscribed?: boolean;
        starredDaysAgo: number;
        updatedDaysAgo: number;
        topics: string[];
        homepage?: string;
    }> = [
        {
            id: 1001, owner: 'facebook', name: 'react', lang: 'TypeScript', stars: 232400, forks: 47800,
            desc: 'The library for web and native user interfaces.',
            aiSummary: '用于构建 Web 与原生用户界面的声明式组件库，生态完善。',
            aiTags: ['UI框架', '前端', '组件化'],
            aiPlatforms: ['web'],
            customTags: ['tag-frontend'],
            alias: 'React 核心库',
            isSubscribed: true,
            starredDaysAgo: 2, updatedDaysAgo: 1, topics: ['react', 'ui', 'frontend', 'javascript'], homepage: 'https://react.dev',
        },
        {
            id: 1002, owner: 'astral-sh', name: 'uv', lang: 'Rust', stars: 44800, forks: 1290,
            desc: 'An extremely fast Python package and project manager, written in Rust.',
            aiSummary: '用 Rust 编写的超快 Python 包管理与虚拟环境工具，可直接替代 pip/poetry。',
            aiTags: ['包管理', 'Python工具', 'CLI'],
            aiPlatforms: ['mac', 'windows', 'linux', 'cli'],
            customTags: ['tag-rust', 'tag-efficiency'],
            alias: 'Python 极速包管理器',
            isSubscribed: true,
            starredDaysAgo: 4, updatedDaysAgo: 0, topics: ['python', 'rust', 'packaging', 'cli'], homepage: 'https://docs.astral.sh/uv',
        },
        {
            id: 1003, owner: 'langchain-ai', name: 'langgraph', lang: 'Python', stars: 10900, forks: 1750,
            desc: 'Build resilient language agents as graphs.',
            aiSummary: '基于状态图编排多智能体与长流程 AI Agent 工作流的框架。',
            aiTags: ['Agent', '工作流', 'LLM'],
            aiPlatforms: ['web', 'cli'],
            customTags: ['tag-ai'],
            isSubscribed: false,
            starredDaysAgo: 7, updatedDaysAgo: 2, topics: ['llm', 'agents', 'ai', 'python'],
        },
        {
            id: 1004, owner: 'vitejs', name: 'vite', lang: 'TypeScript', stars: 71500, forks: 6500,
            desc: 'Next generation frontend tooling. It\'s fast!',
            aiSummary: '基于原生 ESM 的下一代前端构建工具，支持毫秒级热更新与 Rollup 打包。',
            aiTags: ['构建工具', '前端工程化'],
            aiPlatforms: ['web', 'cli'],
            customTags: ['tag-frontend', 'tag-efficiency'],
            isSubscribed: true,
            starredDaysAgo: 12, updatedDaysAgo: 1, topics: ['vite', 'bundler', 'frontend'], homepage: 'https://vite.dev',
        },
        {
            id: 1005, owner: 'ollama', name: 'ollama', lang: 'Go', stars: 132000, forks: 10800,
            desc: 'Get up and running with Llama 3.3, DeepSeek-R1, Gemma 3, and other large language models.',
            aiSummary: '一键在本地部署和运行主流开源大模型的跨平台 CLI 与服务引擎。',
            aiTags: ['本地大模型', '推理引擎'],
            aiPlatforms: ['mac', 'windows', 'linux', 'docker', 'cli'],
            customTags: ['tag-ai', 'tag-efficiency'],
            alias: '本地大模型运行器',
            isSubscribed: true,
            starredDaysAgo: 15, updatedDaysAgo: 0, topics: ['llm', 'ollama', 'ai', 'go'], homepage: 'https://ollama.com',
        },
        {
            id: 1006, owner: 'tailwindlabs', name: 'tailwindcss', lang: 'TypeScript', stars: 86200, forks: 4420,
            desc: 'A utility-first CSS framework for rapid UI development.',
            aiSummary: '原子化 CSS 框架，v4 采用 Oxide 引擎并支持零配置 CSS 变量主题。',
            aiTags: ['CSS', '样式库'],
            aiPlatforms: ['web'],
            customTags: ['tag-frontend'],
            starredDaysAgo: 18, updatedDaysAgo: 3, topics: ['css', 'tailwind', 'design-system'], homepage: 'https://tailwindcss.com',
        },
        {
            id: 1007, owner: 'pmndrs', name: 'zustand', lang: 'TypeScript', stars: 51100, forks: 1620,
            desc: 'Bear necessities for state management in React.',
            aiSummary: '极简轻量、基于 Hook 的 React 状态管理库，无需 Provider 包裹。',
            aiTags: ['状态管理', 'React'],
            aiPlatforms: ['web'],
            customTags: ['tag-frontend'],
            starredDaysAgo: 25, updatedDaysAgo: 4, topics: ['react', 'state-management', 'typescript'],
        },
        {
            id: 1008, owner: 'junegunn', name: 'fzf', lang: 'Go', stars: 68900, forks: 2490,
            desc: 'A command-line fuzzy finder.',
            aiSummary: '高性能通用命令行模糊搜索过滤器，可无缝整合进 shell、Vim 与 Git。',
            aiTags: ['模糊搜索', '终端效率'],
            aiPlatforms: ['mac', 'linux', 'windows', 'cli'],
            customTags: ['tag-efficiency'],
            starredDaysAgo: 40, updatedDaysAgo: 5, topics: ['cli', 'fuzzy-finder', 'shell'],
        },
        {
            id: 1009, owner: 'zed-industries', name: 'zed', lang: 'Rust', stars: 55400, forks: 3720,
            desc: 'Code at the speed of thought – Zed is a high-performance, multiplayer code editor.',
            customTags: [], // intentionally unanalyzed & untagged
            starredDaysAgo: 3, updatedDaysAgo: 1, topics: ['editor', 'rust', 'ide'], homepage: 'https://zed.dev',
        },
        {
            id: 1010, owner: 'vuejs', name: 'core', lang: 'TypeScript', stars: 48600, forks: 8420,
            desc: 'Vue.js is a progressive, incrementally-adoptable JavaScript framework for building UI on the web.',
            customTags: ['tag-frontend'],
            starredDaysAgo: 55, updatedDaysAgo: 2, topics: ['vue', 'framework', 'typescript'],
        },
        {
            id: 1011, owner: 'sharkdp', name: 'bat', lang: 'Rust', stars: 51400, forks: 1280,
            desc: 'A cat(1) clone with wings.',
            aiSummary: '带语法高亮、Git 修改提示和自动分页的现代化 cat 替代工具。',
            aiTags: ['终端', '语法高亮'],
            aiPlatforms: ['mac', 'linux', 'windows', 'cli'],
            customTags: [],
            starredDaysAgo: 62, updatedDaysAgo: 8, topics: ['rust', 'cli', 'syntax-highlighting'],
        },
        {
            id: 1012, owner: 'oven-sh', name: 'bun', lang: 'Zig', stars: 76900, forks: 3010,
            desc: 'Incredibly fast JavaScript runtime, bundler, test runner, and package manager – all in one.',
            aiSummary: '集运行时、包管理器、打包器与测试运行器于一体的极速 JS 全家桶。',
            aiTags: ['JavaScript运行时', '打包器'],
            aiPlatforms: ['mac', 'linux', 'windows', 'cli'],
            customTags: ['tag-efficiency'],
            starredDaysAgo: 8, updatedDaysAgo: 1, topics: ['zig', 'javascript', 'runtime'], homepage: 'https://bun.sh',
        },
        {
            id: 1013, owner: 'neovim', name: 'neovim', lang: 'Vim Script', stars: 87400, forks: 5950,
            desc: 'Vim-fork focused on extensibility and usability.',
            customTags: [],
            starredDaysAgo: 90, updatedDaysAgo: 2, topics: ['neovim', 'lua', 'editor'],
        },
        {
            id: 1014, owner: 'TanStack', name: 'virtual', lang: 'TypeScript', stars: 6100, forks: 360,
            desc: 'Headless UI for Virtualizing Large Element Lists in JS/TS, React, Solid, Vue, Svelte and Lit.',
            aiSummary: '无头虚拟滚动引擎，支持动态测高与多框架适配，适合渲染万级列表。',
            aiTags: ['虚拟列表', '性能优化'],
            aiPlatforms: ['web'],
            customTags: ['tag-frontend'],
            starredDaysAgo: 11, updatedDaysAgo: 6, topics: ['virtualization', 'react', 'performance'],
        },
        {
            id: 1015, owner: 'BurntSushi', name: 'ripgrep', lang: 'Rust', stars: 50800, forks: 2080,
            desc: 'ripgrep recursively searches directories for a regex pattern while respecting your gitignore.',
            aiSummary: '极速跨平台正则代码搜索工具，自动遵循 .gitignore 规则。',
            aiTags: ['代码搜索', 'CLI'],
            aiPlatforms: ['mac', 'linux', 'windows', 'cli'],
            customTags: ['tag-rust', 'tag-efficiency'],
            starredDaysAgo: 110, updatedDaysAgo: 14, topics: ['rust', 'search', 'regex'],
        },
        {
            id: 1016, owner: 'modelcontextprotocol', name: 'servers', lang: 'TypeScript', stars: 34200, forks: 3910,
            desc: 'Model Context Protocol Servers.',
            customTags: ['tag-ai'],
            starredDaysAgo: 5, updatedDaysAgo: 1, topics: ['mcp', 'ai', 'llm'],
        },
        {
            id: 1017, owner: 'obsidianmd', name: 'obsidian-releases', lang: null, stars: 19400, forks: 980,
            desc: 'Community plugins list, theme list, and releases of Obsidian.',
            customTags: ['tag-docs'],
            isSubscribed: true,
            starredDaysAgo: 70, updatedDaysAgo: 1, topics: ['obsidian', 'notes', 'knowledge-base'],
        },
        {
            id: 1018, owner: 'microsoft', name: 'playwright', lang: 'TypeScript', stars: 70300, forks: 3980,
            desc: 'Playwright is a framework for Web Testing and Automation.',
            aiSummary: '支持 Chromium/Firefox/WebKit 的跨浏览器端到端自动化测试与截图回归框架。',
            aiTags: ['E2E测试', '自动化'],
            aiPlatforms: ['windows', 'mac', 'linux', 'cli'],
            customTags: ['tag-efficiency'],
            starredDaysAgo: 20, updatedDaysAgo: 2, topics: ['testing', 'automation', 'browser'], homepage: 'https://playwright.dev',
        },
        {
            id: 1019, owner: 'excalidraw', name: 'excalidraw', lang: 'TypeScript', stars: 95100, forks: 9340,
            desc: 'Virtual whiteboard for sketching hand-drawn like diagrams.',
            aiSummary: '手绘风格的开源虚拟白板，适合绘制架构图、流程图并导出 SVG/PNG。',
            aiTags: ['绘图白板', '架构图'],
            aiPlatforms: ['web', 'docker'],
            customTags: ['tag-efficiency'],
            alias: '手绘白板工具',
            starredDaysAgo: 35, updatedDaysAgo: 1, topics: ['diagramming', 'whiteboard', 'canvas'], homepage: 'https://excalidraw.com',
        },
        {
            id: 1020, owner: 'kamranahmedse', name: 'developer-roadmap', lang: 'TypeScript', stars: 311000, forks: 40500,
            desc: 'Interactive roadmaps, guides and other educational content to help developers grow in their careers.',
            customTags: ['tag-docs'],
            starredDaysAgo: 130, updatedDaysAgo: 1, topics: ['roadmap', 'learning', 'education'], homepage: 'https://roadmap.sh',
        },
        {
            id: 1021, owner: 'jesseduffield', name: 'lazygit', lang: 'Go', stars: 57200, forks: 1960,
            desc: 'simple terminal UI for git commands.',
            customTags: [],
            starredDaysAgo: 6, updatedDaysAgo: 2, topics: ['git', 'tui', 'cli'],
        },
        {
            id: 1022, owner: 'localsend', name: 'localsend', lang: 'Dart', stars: 58300, forks: 3110,
            desc: 'An open-source cross-platform alternative to AirDrop.',
            aiSummary: '开源跨平台局域网文件传输工具，无需联网即可在桌面与移动端间互传。',
            aiTags: ['局域网传输', '跨平台'],
            aiPlatforms: ['windows', 'mac', 'linux', 'ios', 'android'],
            customTags: ['tag-efficiency'],
            starredDaysAgo: 19, updatedDaysAgo: 3, topics: ['airdrop', 'file-sharing', 'flutter'], homepage: 'https://localsend.org',
        },
        {
            id: 1023, owner: 'ggml-org', name: 'llama.cpp', lang: 'C++', stars: 76500, forks: 11100,
            desc: 'LLM inference in C/C++.',
            customTags: ['tag-ai'],
            starredDaysAgo: 28, updatedDaysAgo: 0, topics: ['cpp', 'llm', 'inference'],
        },
        {
            id: 1024, owner: 'sindresorhus', name: 'awesome', lang: null, stars: 351000, forks: 28700,
            desc: 'Awesome lists about all kinds of interesting topics.',
            customTags: ['tag-docs'],
            starredDaysAgo: 200, updatedDaysAgo: 4, topics: ['awesome', 'lists', 'resources'],
        },
    ];

    return specs.map((s) => ({
        id: s.id,
        name: s.name,
        fullName: `${s.owner}/${s.name}`,
        owner: {
            login: s.owner,
            avatarUrl: `https://avatars.githubusercontent.com/${s.owner}?size=96`,
        },
        description: s.desc,
        homepage: s.homepage || '',
        htmlUrl: `https://github.com/${s.owner}/${s.name}`,
        language: s.lang,
        topics: s.topics,
        stargazersCount: s.stars,
        forksCount: s.forks,
        createdAt: daysAgoIso(400),
        updatedAt: daysAgoIso(s.updatedDaysAgo),
        pushedAt: daysAgoIso(s.updatedDaysAgo),
        starredAt: daysAgoIso(s.starredDaysAgo),
        aiSummary: s.aiSummary,
        aiTags: s.aiTags,
        aiPlatforms: s.aiPlatforms,
        analyzedAt: s.aiSummary ? daysAgoIso(2) : undefined,
        analysisFailed: false,
        alias: s.alias,
        customTags: s.customTags || [],
        isSubscribed: s.isSubscribed,
        lastSyncedAt: now,
    }));
}

function createSeedNotes(): RepositoryNote[] {
    const now = Date.now();
    return [
        {
            id: 'note-1002',
            repoId: 1002,
            content: '### 常用命令\n- `uv venv` 创建虚拟环境\n- `uv pip install -r requirements.txt`\n- 比传统 pip 快 10 倍以上，强烈推荐新项目标配。',
            createdAt: now - 86_400_000 * 3,
            updatedAt: now - 86_400_000,
        },
        {
            id: 'note-1005',
            repoId: 1005,
            content: '本地模型测试记录：\n1. `ollama run qwen2.5:14b` 响应速度很快\n2. 记得配置 `OLLAMA_HOST=0.0.0.0` 给局域网设备调用',
            createdAt: now - 86_400_000 * 10,
            updatedAt: now - 86_400_000 * 2,
        },
        {
            id: 'note-1019',
            repoId: 1019,
            content: '写技术文档配图首选工具，支持直接导出带嵌入式场景信息的 PNG。',
            createdAt: now - 86_400_000 * 15,
            updatedAt: now - 86_400_000 * 5,
        },
    ];
}

function createSeedReleases(): Release[] {
    return [
        {
            id: 9001,
            tagName: 'v0.6.10',
            name: 'uv 0.6.10 - Faster workspace resolution',
            body: '## Highlights\n\n- Improved lockfile resolution speed by **35%**\n- Fixed Windows path normalization in virtual environments\n\n```bash\nuv self update\n```',
            htmlUrl: 'https://github.com/astral-sh/uv/releases/tag/v0.6.10',
            publishedAt: daysAgoIso(1),
            assets: [
                { id: 1, name: 'uv-x86_64-pc-windows-msvc.zip', size: 14_200_000, downloadCount: 12400, browserDownloadUrl: 'https://github.com/astral-sh/uv/releases', contentType: 'application/zip', createdAt: daysAgoIso(1), updatedAt: daysAgoIso(1) },
                { id: 2, name: 'uv-aarch64-apple-darwin.tar.gz', size: 12_900_000, downloadCount: 9800, browserDownloadUrl: 'https://github.com/astral-sh/uv/releases', contentType: 'application/gzip', createdAt: daysAgoIso(1), updatedAt: daysAgoIso(1) },
            ],
            repository: { id: 1002, fullName: 'astral-sh/uv', name: 'uv' },
        },
        {
            id: 9002,
            tagName: 'v0.6.5',
            name: 'Ollama v0.6.5',
            body: '### What\'s Changed\n- Support new quantized models\n- Reduced memory overhead on Apple Silicon & Windows CUDA',
            htmlUrl: 'https://github.com/ollama/ollama/releases/tag/v0.6.5',
            publishedAt: daysAgoIso(2),
            assets: [
                { id: 3, name: 'OllamaSetup.exe', size: 220_000_000, downloadCount: 54000, browserDownloadUrl: 'https://github.com/ollama/ollama/releases', contentType: 'application/octet-stream', createdAt: daysAgoIso(2), updatedAt: daysAgoIso(2) },
                { id: 4, name: 'Ollama-darwin.zip', size: 195_000_000, downloadCount: 38000, browserDownloadUrl: 'https://github.com/ollama/ollama/releases', contentType: 'application/zip', createdAt: daysAgoIso(2), updatedAt: daysAgoIso(2) },
            ],
            repository: { id: 1005, fullName: 'ollama/ollama', name: 'ollama' },
        },
        {
            id: 9003,
            tagName: 'v6.2.1',
            name: 'Vite 6.2.1',
            body: 'Bug fixes and performance improvements for Environment API.',
            htmlUrl: 'https://github.com/vitejs/vite/releases/tag/v6.2.1',
            publishedAt: daysAgoIso(5),
            assets: [],
            repository: { id: 1004, fullName: 'vitejs/vite', name: 'vite' },
        },
    ];
}

function seedDevStorageIfNeeded(): void {
    const initialized = readStorage<boolean>('initialized', false);
    if (initialized) return;

    const repos = createSeedRepos();
    const tags = createSeedTags();
    const notes = createSeedNotes();
    const releases = createSeedReleases();
    const subs = repos.filter((r) => r.isSubscribed).map((r) => r.id);

    writeStorage('token', 'ghp_dev_mock_token_123456');
    writeStorage<Partial<Settings>>('settings', {
        theme: 'auto',
        defaultView: 'card',
        itemsPerPage: 20,
        language: 'zh',
        defaultSortBy: 'stars',
        defaultSortOrder: 'desc',
        syncMode: 'smart',
        autoSyncOnOpen: false,
        syncInterval: 24,
        fullSyncIntervalDays: 7,
        autoAnalyzeOnOpen: false,
        autoCheckReleaseUpdates: false,
    });
    writeStorage('tags', tags);
    writeStorage('repos', repos);
    writeStorage('notes', notes);
    writeStorage('releases', releases);
    writeStorage('readReleaseIds', [9003]);
    writeStorage('subscriptions', subs);
    writeStorage('syncState', {
        latestStarredAt: repos[0]?.starredAt || null,
        latestRepoIds: repos.map((r) => r.id),
        lastSyncAt: Date.now(),
        lastFullSyncAt: Date.now(),
    } satisfies SyncState);
    writeStorage('initialized', true);
}

function repoToGitHubRaw(repo: Repository) {
    return {
        starred_at: repo.starredAt,
        repo: {
            id: repo.id,
            name: repo.name,
            full_name: repo.fullName,
            owner: {
                login: repo.owner.login,
                avatar_url: repo.owner.avatarUrl,
            },
            description: repo.description,
            homepage: repo.homepage,
            html_url: repo.htmlUrl,
            language: repo.language,
            topics: repo.topics,
            stargazers_count: repo.stargazersCount,
            forks_count: repo.forksCount,
            created_at: repo.createdAt,
            updated_at: repo.updatedAt,
            pushed_at: repo.pushedAt,
        },
    };
}

export function isDevMockActive(): boolean {
    return typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>)[DEV_MOCK_FLAG]);
}

export function ensureDevMockApi(): void {
    if (typeof window === 'undefined') return;
    if (window.githubStarsAPI) return;

    seedDevStorageIfNeeded();
    (window as unknown as Record<string, unknown>)[DEV_MOCK_FLAG] = true;

    const api: GithubStarsAPI = {
        verifyToken: async (token: string) => ({ login: 'dev-user', tokenPreview: token.slice(0, 6) }),
        getStarredRepos: async (_token, page = 1, perPage = 100) => {
            const repos = readStorage<Repository[]>('repos', []);
            const start = (page - 1) * perPage;
            return repos.slice(start, start + perPage).map(repoToGitHubRaw);
        },
        getStarredReposPage: async (_token, page = 1, perPage = 100) => {
            const repos = readStorage<Repository[]>('repos', []);
            const start = (page - 1) * perPage;
            const slice = repos.slice(start, start + perPage).map(repoToGitHubRaw);
            const totalPages = Math.max(1, Math.ceil(repos.length / perPage));
            return {
                items: slice,
                page,
                perPage,
                totalPages,
                hasNext: page < totalPages,
                nextPage: page < totalPages ? page + 1 : null,
            };
        },
        getReadme: async (owner, repo) => {
            const repos = readStorage<Repository[]>('repos', []);
            const matched = repos.find((r) => r.fullName.toLowerCase() === `${owner}/${repo}`.toLowerCase());
            return [
                '<div align="center">',
                `<img src="resources/logo.png" width="80" alt="${repo} logo">`,
                `<h1>${owner}/${repo}</h1>`,
                '<p><em>Markdown, distilled.</em></p>',
                `<p>${matched?.description || 'A curated open-source project.'}</p>`,
                '<p>',
                `<a href="https://github.com/${owner}/${repo}/releases/latest">`,
                `<img src="https://img.shields.io/github/v/release/${owner}/${repo}?label=Release&style=for-the-badge" alt="Latest release">`,
                '</a>',
                '<a href="LICENSE">',
                '<img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT License">',
                '</a>',
                '</p>',
                '</div>',
                '<br>',
                '',
                matched?.description || 'A curated open-source project.',
                '',
                '<p align="center">',
                `<img src="https://avatars.githubusercontent.com/${owner}?size=240" width="49%" alt="${repo} light preview">`,
                `<img src="https://avatars.githubusercontent.com/${owner}?size=240" width="49%" alt="${repo} dark preview">`,
                '</p>',
                '',
                '## ✨ Features',
                '',
                '- [x] Fast and developer-friendly workflow ([Docs](./docs/guide.md))',
                '- [x] Clean architecture with modern TypeScript/Rust/Go tooling',
                '- [ ] Upcoming plugin ecosystem extensions',
                '',
                '## 📊 Overview',
                '',
                '| Metric | Value | Notes |',
                '| --- | --- | --- |',
                `| Language | ${matched?.language || 'Multi'} | Primary stack |`,
                `| Stars | ${matched?.stargazersCount?.toLocaleString() || '1,000'} | Community traction |`,
                '',
                '## 🚀 Quick Start',
                '',
                '```bash',
                `git clone https://github.com/${owner}/${repo}.git`,
                `cd ${repo}`,
                '```',
                '',
                '> Previewed in Browser Dev Mock Mode (`src/dev/mockApi.ts`).',
            ].join('\n');
        },
        getRepoReleases: async (owner, repo) => {
            const fullName = `${owner}/${repo}`.toLowerCase();
            const releases = readStorage<Release[]>('releases', []);
            const matched = releases.filter((r) => r.repository.fullName.toLowerCase() === fullName);
            const repos = readStorage<Repository[]>('repos', []);
            const repoObj = repos.find((r) => r.fullName.toLowerCase() === fullName);
            const repoMeta = {
                id: repoObj?.id || 9999,
                fullName: repoObj?.fullName || `${owner}/${repo}`,
                name: repoObj?.name || repo,
            };
            if (matched.length > 0) {
                return [
                    ...matched,
                    {
                        id: matched[0].id + 1000,
                        tagName: 'v0.6.0-rc.1',
                        name: `${repo} v0.6.0-rc.1`,
                        body: '### Pre-release Notes\n\n- Experimental performance improvements\n- Added diagnostic telemetry opt-out\n',
                        htmlUrl: `https://github.com/${repoMeta.fullName}/releases`,
                        publishedAt: daysAgoIso(18),
                        prerelease: true,
                        assets: [
                            {
                                id: 91,
                                name: `${repo}-linux-x64.tar.gz`,
                                size: 8_400_000,
                                downloadCount: 3120,
                                browserDownloadUrl: `https://github.com/${repoMeta.fullName}/releases`,
                                contentType: 'application/gzip',
                                createdAt: daysAgoIso(18),
                                updatedAt: daysAgoIso(18),
                            },
                        ],
                        repository: repoMeta,
                    },
                ];
            }
            return [
                {
                    id: repoMeta.id * 10 + 1,
                    tagName: 'v2.4.0',
                    name: `${repoMeta.name} v2.4.0`,
                    body: `## What's Changed in ${repoMeta.name} 2.4.0\n\n- Improved core stability and startup latency\n- Added Windows & macOS universal packaging\n\n| Artifact | Target |\n| --- | --- |\n| \`${repo}-win-x64.zip\` | Windows 10/11 |\n| \`${repo}-darwin-arm64.tar.gz\` | macOS Apple Silicon |\n`,
                    htmlUrl: `https://github.com/${repoMeta.fullName}/releases`,
                    publishedAt: daysAgoIso(4),
                    assets: [
                        {
                            id: repoMeta.id * 100 + 1,
                            name: `${repo}-win-x64.zip`,
                            size: 16_800_000,
                            downloadCount: 8420,
                            browserDownloadUrl: `https://github.com/${repoMeta.fullName}/releases`,
                            contentType: 'application/zip',
                            createdAt: daysAgoIso(4),
                            updatedAt: daysAgoIso(4),
                        },
                        {
                            id: repoMeta.id * 100 + 2,
                            name: `${repo}-darwin-arm64.tar.gz`,
                            size: 14_500_000,
                            downloadCount: 6210,
                            browserDownloadUrl: `https://github.com/${repoMeta.fullName}/releases`,
                            contentType: 'application/gzip',
                            createdAt: daysAgoIso(4),
                            updatedAt: daysAgoIso(4),
                        },
                    ],
                    repository: repoMeta,
                },
                {
                    id: repoMeta.id * 10 + 2,
                    tagName: 'v2.3.1',
                    name: `${repoMeta.name} v2.3.1`,
                    body: 'Patch release with bug fixes and dependency updates.',
                    htmlUrl: `https://github.com/${repoMeta.fullName}/releases`,
                    publishedAt: daysAgoIso(22),
                    assets: [],
                    repository: repoMeta,
                },
            ];
        },
        checkRateLimit: async () => ({ resources: { core: { limit: 5000, remaining: 4999, reset: Math.floor(Date.now() / 1000) + 3600 } } }),

        getSettings: () => readStorage<Partial<Settings>>('settings', {}),
        setSettings: (settings) => {
            const current = readStorage<Partial<Settings>>('settings', {});
            writeStorage('settings', { ...current, ...settings });
        },
        getToken: () => readStorage<string | null>('token', null),
        setToken: (token) => writeStorage('token', token),
        getRepos: () => readStorage<Repository[]>('repos', []),
        setRepos: (repos) => writeStorage('repos', repos),
        patchRepo: (id, patch) => {
            const repos = readStorage<Repository[]>('repos', []);
            writeStorage('repos', repos.map((r) => (r.id === id ? { ...r, ...patch } : r)));
        },
        patchReposBatch: (updates) => {
            const map = new Map(updates.map((u) => [u.id, u.patch]));
            const repos = readStorage<Repository[]>('repos', []);
            writeStorage('repos', repos.map((r) => (map.has(r.id) ? { ...r, ...map.get(r.id) } : r)));
        },
        getSyncState: () => readStorage<SyncState | null>('syncState', null),
        setSyncState: (state) => writeStorage('syncState', state),
        clearSyncState: () => localStorage.removeItem(`${STORAGE_PREFIX}syncState`),
        getStoredReleases: () => readStorage<Release[]>('releases', []),
        setStoredReleases: (releases) => writeStorage('releases', releases),
        getReadReleaseIds: () => readStorage<number[]>('readReleaseIds', []),
        setReadReleaseIds: (ids) => writeStorage('readReleaseIds', ids),
        getReleaseSubscriptions: () => readStorage<number[]>('subscriptions', []),
        setReleaseSubscriptions: (ids) => writeStorage('subscriptions', ids),

        getTags: () => readStorage<Tag[]>('tags', []),
        setTags: (tags) => writeStorage('tags', tags),
        addTag: (tagData) => {
            const tags = readStorage<Tag[]>('tags', []);
            const now = Date.now();
            const created: Tag = {
                ...tagData,
                id: `tag-${now}-${Math.random().toString(36).slice(2, 6)}`,
                createdAt: now,
                updatedAt: now,
            };
            writeStorage('tags', [...tags, created]);
            return created;
        },
        updateTag: (id, updates) => {
            const tags = readStorage<Tag[]>('tags', []);
            let updated: Tag | null = null;
            const next = tags.map((tag) => {
                if (tag.id !== id) return tag;
                updated = { ...tag, ...updates, updatedAt: Date.now() };
                return updated;
            });
            writeStorage('tags', next);
            return updated;
        },
        deleteTag: async (id) => {
            const tags = readStorage<Tag[]>('tags', []).filter((t) => t.id !== id);
            writeStorage('tags', tags);
            const repos = readStorage<Repository[]>('repos', []).map((r) => ({
                ...r,
                customTags: (r.customTags || []).filter((tid) => tid !== id),
            }));
            writeStorage('repos', repos);
        },
        reorderTags: (tagIds) => {
            const tags = readStorage<Tag[]>('tags', []);
            const byId = new Map(tags.map((t) => [t.id, t]));
            const reordered: Tag[] = [];
            tagIds.forEach((id, idx) => {
                const found = byId.get(id);
                if (found) reordered.push({ ...found, order: idx });
            });
            writeStorage('tags', reordered);
        },

        getNote: (repoId) => {
            const notes = readStorage<RepositoryNote[]>('notes', []);
            return notes.find((n) => n.repoId === repoId) || null;
        },
        setNote: (repoId, content) => {
            const notes = readStorage<RepositoryNote[]>('notes', []);
            const now = Date.now();
            const existing = notes.find((n) => n.repoId === repoId);
            const note: RepositoryNote = existing
                ? { ...existing, content, updatedAt: now }
                : { id: `note-${repoId}`, repoId, content, createdAt: now, updatedAt: now };
            const next = existing
                ? notes.map((n) => (n.repoId === repoId ? note : n))
                : [...notes, note];
            writeStorage('notes', next);
            return note;
        },
        deleteNote: (repoId) => {
            const notes = readStorage<RepositoryNote[]>('notes', []).filter((n) => n.repoId !== repoId);
            writeStorage('notes', notes);
        },
        getAllNotes: () => readStorage<RepositoryNote[]>('notes', []),
        setNotes: (notes) => writeStorage('notes', notes),

        openExternal: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
        showNotification: (body) => console.info('[DevMock Notification]', body),

        analyzeRepo: async (_readmeContent, repoInfo, language = 'zh') => {
            await new Promise((r) => setTimeout(r, 350));
            return {
                summary: language === 'zh'
                    ? `${repoInfo.fullName} 的 AI 模拟摘要：${repoInfo.description || '实用开源工具项目'}`
                    : `AI mock summary for ${repoInfo.fullName}: ${repoInfo.description || 'Useful open-source repository'}`,
                tags: [repoInfo.language || 'OpenSource', 'MockAI'].filter(Boolean),
                platforms: ['web', 'cli'],
            };
        },
        abortAiCall: () => { },
        getAiTranslations: () => readStorage<Record<string, unknown>>('aiTranslations', {}),
        setAiTranslations: (cache) => writeStorage('aiTranslations', cache),
        getAIModels: async () => [
            { id: 'mock-gpt-4o-mini', title: 'Mock Fast Model (Dev)' },
            { id: 'mock-claude-sonnet', title: 'Mock Reasoning Model (Dev)' },
        ],
        getLatestRelease: async (owner, repo) => {
            const releases = readStorage<Release[]>('releases', []);
            return releases.find((r) => r.repository.fullName.toLowerCase() === `${owner}/${repo}`.toLowerCase()) || null;
        },
    };

    window.githubStarsAPI = api;

    if (typeof (window as unknown as { utools?: unknown }).utools === 'undefined') {
        const mockUtools = {
            onPluginEnter: () => { },
            onPluginOut: () => { },
            onPluginDetach: () => { },
            onDbPull: () => { },
            setSubInput: () => true,
            setSubInputValue: () => true,
            removeSubInput: () => true,
            subInputBlur: () => true,
            setExpandHeight: () => true,
            hideMainWindow: () => true,
            showMainWindow: () => true,
            outPlugin: () => true,
            shellOpenExternal: (url: string) => window.open(url, '_blank', 'noopener,noreferrer'),
            showNotification: (body: string) => console.info('[DevMock uTools]', body),
            copyText: (text: string) => {
                navigator.clipboard?.writeText(text).catch(() => { });
                return true;
            },
            isDarkColors: () => window.matchMedia('(prefers-color-scheme: dark)').matches,
            getWindowType: () => 'main',
            showOpenDialog: () => undefined,
            showSaveDialog: () => undefined,
            redirect: () => true,
            dbStorage: {
                setItem: (k: string, v: unknown) => writeStorage(`db:${k}`, v),
                getItem: (k: string) => readStorage(`db:${k}`, null),
                removeItem: (k: string) => localStorage.removeItem(`${STORAGE_PREFIX}db:${k}`),
            },
            dbCryptoStorage: {
                setItem: (k: string, v: unknown) => writeStorage(`crypto:${k}`, v),
                getItem: (k: string) => readStorage(`crypto:${k}`, null),
                removeItem: (k: string) => localStorage.removeItem(`${STORAGE_PREFIX}crypto:${k}`),
            },
            ai: () => {
                const promise = Promise.resolve({ content: '{}' }) as Promise<{ content: string }> & { abort: () => void };
                promise.abort = () => { };
                return promise;
            },
            allAiModels: async () => [],
        };
        (window as unknown as { utools: unknown }).utools = mockUtools;
    }
}
