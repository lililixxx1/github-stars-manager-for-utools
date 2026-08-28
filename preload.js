const https = require('node:https');

// ==================== GitHub API 封装 ====================
const githubAPI = {
    // 验证 Token
    verifyToken(token) {
        return requestGitHub('/user', token);
    },

    // 获取用户 Starred 仓库（支持 starred_at）
    async getStarredRepos(token, page = 1, perPage = 100) {
        console.log('[GitHub API] Fetching starred repos, page:', page);
        const result = await requestGitHub(
            `/user/starred?page=${page}&per_page=${perPage}&sort=created&direction=desc`,
            token,
            { accept: 'application/vnd.github.star+json' }
        );
        console.log('[GitHub API] Got', Array.isArray(result) ? result.length : 0, 'repos on page', page);
        return result;
    },

    // 获取用户 Starred 仓库分页数据（包含 Link header 元信息）
    async getStarredReposPage(token, page = 1, perPage = 100) {
        console.log('[GitHub API] Fetching starred repos page with meta, page:', page);
        const result = await requestGitHubRaw(
            `/user/starred?page=${page}&per_page=${perPage}&sort=created&direction=desc`,
            token,
            { accept: 'application/vnd.github.star+json' }
        );
        const items = Array.isArray(result.data) ? result.data : [];
        const links = parseGitHubLinkHeader(result.headers.link);
        const hasLinkPagination = links.nextPage !== null || links.lastPage !== null;

        return {
            items,
            page,
            perPage,
            totalPages: links.lastPage,
            hasNext: links.nextPage !== null || (!hasLinkPagination && items.length === perPage),
            nextPage: links.nextPage,
        };
    },

    // 获取仓库 README
    async getReadme(owner, repo, token) {
        try {
            const readme = await requestGitHub(
                `/repos/${owner}/${repo}/readme`,
                token
            );
            return Buffer.from(readme.content, 'base64').toString('utf-8');
        } catch {
            return null;
        }
    },

    // 获取仓库 Releases
    getReleases(owner, repo, token, page = 1, perPage = 30) {
        return requestGitHub(
            `/repos/${owner}/${repo}/releases?page=${page}&per_page=${perPage}`,
            token
        );
    },

    // 获取最新 Release 🆕 v1.4.0
    getLatestRelease(owner, repo, token) {
        return requestGitHub(
            `/repos/${owner}/${repo}/releases/latest`,
            token
        );
    },

    // 检查 API 限流状态
    checkRateLimit(token) {
        return requestGitHub('/rate_limit', token);
    }
};

// ==================== HTTP 请求工具 ====================
const zlib = require('node:zlib');
const MAX_REPOS_CHUNK_SIZE = 900 * 1024;
const REPOS_SHARD_KEY_PREFIX = 'gh:repos:shard';
const REPOS_META_KEY = 'gh:repos:meta';
const REPOS_FLAT_KEY = 'gh:repos';
const REPOS_FORMAT_VERSION = 2;
const REPOS_CACHE_FLAT_KEY = 'flat';
const NOTE_INDEX_KEY = 'gh:noteIndex';
const GITHUB_HTTP_RETRY_LIMIT = 3;

// 模块级复用的 HTTPS Agent（keep-alive 连接池）
const githubHttpAgent = new https.Agent({ keepAlive: true });

function getReposShardKey(prefix, index) {
    return `${prefix}:${index}`;
}

function getReposShardPrefix(meta) {
    return meta?.shardPrefix || REPOS_SHARD_KEY_PREFIX;
}

function parseGitHubLinkHeader(linkHeader) {
    const result = {
        nextPage: null,
        lastPage: null,
    };

    if (!linkHeader) {
        return result;
    }

    const regex = /<([^>]+)>;\s*rel="([^"]+)"/g;
    let match;

    while ((match = regex.exec(linkHeader)) !== null) {
        try {
            const url = new URL(match[1]);
            const page = Number(url.searchParams.get('page'));
            if (!Number.isFinite(page)) continue;

            if (match[2] === 'next') result.nextPage = page;
            if (match[2] === 'last') result.lastPage = page;
        } catch {
            continue;
        }
    }

    return result;
}

function requestGitHub(path, token, options = {}) {
    return requestGitHubRaw(path, token, options).then(result => result.data);
}

/**
 * 解析 retry-after 响应头（秒数或 HTTP 日期）为毫秒延迟
 * @param {string|undefined} headerValue
 * @returns {number|null} 毫秒；无法解析时返回 null
 */
function parseRetryDelayMs(headerValue) {
    if (!headerValue) return null;
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000);
    }
    const httpDate = Date.parse(headerValue);
    if (!Number.isNaN(httpDate)) {
        return Math.max(0, httpDate - Date.now());
    }
    return null;
}

function requestGitHubRaw(path, token, options = {}, attempt = 0) {
    return new Promise((resolve, reject) => {
        console.log('[GitHub API] Request:', path);
        const reqOptions = {
            hostname: 'api.github.com',
            path: path,
            method: 'GET',
            agent: githubHttpAgent,
            headers: {
                'User-Agent': 'GitHubStarsManager-uTools',
                'Authorization': `Bearer ${token}`,
                'Accept': options.accept || 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Accept-Encoding': 'gzip, deflate',
            }
        };

        const req = https.request(reqOptions, (res) => {
            const encoding = res.headers['content-encoding'];
            console.log('[GitHub API] Response status:', res.statusCode, 'encoding:', encoding || 'none');

            let stream = res;
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            }

            const chunks = [];
            stream.on('data', chunk => {
                chunks.push(chunk);
            });
            stream.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                console.log('[GitHub API] Response complete, data length:', body.length);
                try {
                    const json = JSON.parse(body);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ data: json, headers: res.headers });
                        return;
                    }

                    const status = res.statusCode;

                    // 403/429 限流：读 retry-after 头（秒数或 HTTP 日期），指数退避重试最多 3 次
                    if ((status === 403 || status === 429) && attempt < GITHUB_HTTP_RETRY_LIMIT) {
                        const headerDelay = parseRetryDelayMs(res.headers['retry-after']);
                        const delay = headerDelay !== null ? headerDelay : 1000 * Math.pow(2, attempt);
                        console.warn(`[GitHub API] ${status} limited, retry ${attempt + 1}/${GITHUB_HTTP_RETRY_LIMIT} in ${delay}ms for:`, path);
                        setTimeout(() => {
                            requestGitHubRaw(path, token, options, attempt + 1).then(resolve, reject);
                        }, delay);
                        return;
                    }

                    console.error('[GitHub API] Error:', status, json.message || body.substring(0, 300));
                    reject(new Error(json.message || `HTTP ${status}`));
                } catch (e) {
                    console.error('[GitHub API] Parse error:', e.message, 'data:', body.substring(0, 300));
                    reject(new Error('Invalid JSON response'));
                }
            });
            stream.on('error', (err) => {
                console.error('[GitHub API] Stream error:', err.message);
                reject(err);
            });
        });

        req.on('error', (err) => {
            console.error('[GitHub API] Network error:', err.message);
            reject(err);
        });
        req.setTimeout(30000, () => {
            console.error('[GitHub API] Request timeout after 30s for:', path);
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
        console.log('[GitHub API] Request sent, waiting for response...');
    });
}

// ==================== 仓库存储（v2 分片 + 内存缓存） ====================

/**
 * preload 内存缓存：repos 单一进出口。
 * key 由 meta 派生（`${sharded}|${shardPrefix}|${totalShards}`），未分片（扁平存储）用固定 key。
 * key 未变直接命中缓存；所有写路径写完磁盘后同步更新缓存。
 */
let reposCache = { key: null, repos: [], repoIndex: null };

function readReposMeta() {
    return utools.dbStorage.getItem(REPOS_META_KEY);
}

function computeReposCacheKey(meta) {
    if (!meta?.sharded) return REPOS_CACHE_FLAT_KEY;
    return `${meta.sharded}|${getReposShardPrefix(meta)}|${meta.totalShards}`;
}

/**
 * 读取仓库（带内存缓存）。所有内部读取路径一律走这里。
 * 兼容旧格式：盲切分片（无 formatVersion/repoIndex）按 join+parse 读取，repoIndex 置 null。
 * @returns {{ key: string, repos: Array, repoIndex: Object|null }}
 */
function readCachedRepos() {
    const meta = readReposMeta();
    const key = computeReposCacheKey(meta);
    if (reposCache.key === key) {
        return reposCache;
    }

    let repos = [];
    if (meta?.sharded) {
        const shardPrefix = getReposShardPrefix(meta);
        const chunks = [];
        for (let index = 0; index < meta.totalShards; index++) {
            const chunk = utools.dbStorage.getItem(getReposShardKey(shardPrefix, index));
            if (chunk) chunks.push(chunk);
        }
        try {
            repos = JSON.parse(chunks.join(''));
        } catch (error) {
            console.error('[ReposStorage] 分片数据解析失败:', error);
            repos = [];
        }
    } else {
        repos = utools.dbStorage.getItem(REPOS_FLAT_KEY) || [];
    }

    const repoIndex = (meta?.formatVersion === REPOS_FORMAT_VERSION
        && meta.repoIndex && typeof meta.repoIndex === 'object')
        ? meta.repoIndex
        : null;

    reposCache = { key, repos, repoIndex };
    return reposCache;
}

function removeRepoShards(totalShards, shardPrefix = REPOS_SHARD_KEY_PREFIX) {
    for (let index = 0; index < totalShards; index++) {
        utools.dbStorage.removeItem(getReposShardKey(shardPrefix, index));
    }
}

function byteLengthOf(text) {
    return Buffer.byteLength(text, 'utf8');
}

/**
 * 打包预留空间：装片时留出余量，后续 patchRepo/patchReposBatch 增量重写同一分片时
 * （如追加 aiSummary/alias 等字段）不必因小幅膨胀回退整库重写。
 * 分片重写上限仍是 MAX_REPOS_CHUNK_SIZE。
 */
const REPOS_PACK_HEADROOM = 64 * 1024;

/**
 * 按仓库边界打包分片文本（formatVersion 2）。
 * - 逐仓库 JSON.stringify，按累计字节（UTF-8，含 '['、','、']' 分隔符）装片，
 *   每片 ≤ MAX_REPOS_CHUNK_SIZE - REPOS_PACK_HEADROOM（为增量更新留余量）；
 * - 保证每个仓库完整落在单片内（单仓库 JSON 超限时单片独放，不切）；
 * - 所有分片按顺序 join('') 正好是完整 JSON 数组文本（首片以 '[' 开始，非末片以 ',' 结尾，
 *   末片以 ']' 结尾），因此新旧读法都能 join+parse —— 兼容性关键。
 * @param {Array} repos
 * @returns {{ chunks: string[], repoIndex: Object, totalBytes: number }}
 */
function packReposIntoShards(repos) {
    const packLimit = MAX_REPOS_CHUNK_SIZE - REPOS_PACK_HEADROOM;
    const shards = [];      // string[][]: 每片内各仓库的 JSON 文本
    const shardBytes = [];  // 每片累计字节数（含该片分隔符）
    const repoIndex = {};

    const beginShard = () => {
        shards.push([]);
        // 首片预留 '[' 与结束符（',' 或 ']'）各 1 字节；其余片预留结束符 1 字节
        shardBytes.push(shards.length === 1 ? 2 : 1);
    };

    for (const repo of repos) {
        const repoJson = JSON.stringify(repo);
        const repoBytes = byteLengthOf(repoJson);

        if (shards.length === 0) {
            beginShard();
        } else if (shards[shards.length - 1].length > 0
            && shardBytes[shards.length - 1] + 1 + repoBytes > packLimit) {
            beginShard();
        }

        const shardIndex = shards.length - 1;
        if (shards[shardIndex].length > 0) {
            shardBytes[shardIndex] += 1; // 与前一成员的 ','
        }
        shards[shardIndex].push(repoJson);
        shardBytes[shardIndex] += repoBytes;
        repoIndex[String(repo.id)] = shardIndex;
    }

    if (shards.length === 0) {
        beginShard(); // 空数组：占位单片（实际会走扁平路径）
    }

    const chunks = shards.map((parts, index) => {
        let text = parts.join(',');
        if (index === 0) {
            text = '[' + text;
        }
        text += (index === shards.length - 1) ? ']' : ',';
        return text;
    });

    const totalBytes = shardBytes.reduce((sum, bytes) => sum + bytes, 0);
    return { chunks, repoIndex, totalBytes };
}

/**
 * 全量写入仓库（v2 新格式：按仓库边界打包 + repoIndex）。
 * 仅供同步/导入/旧格式迁移等整体替换场景；单仓/批量增量请走 patchRepoById / patchReposByIdsBatch。
 * 写完磁盘后同步更新内存缓存。
 * @param {Array} repos
 */
function writeRepos(repos) {
    const oldMeta = readReposMeta();
    const { chunks, repoIndex, totalBytes } = packReposIntoShards(repos);

    if (totalBytes < MAX_REPOS_CHUNK_SIZE) {
        utools.dbStorage.setItem(REPOS_FLAT_KEY, repos);
        utools.dbStorage.removeItem(REPOS_META_KEY);
        if (oldMeta?.totalShards) {
            removeRepoShards(oldMeta.totalShards, getReposShardPrefix(oldMeta));
        }
        reposCache = { key: REPOS_CACHE_FLAT_KEY, repos, repoIndex: null };
        return;
    }

    // shardPrefix 每次轮换（含时间戳/随机串），防止误删旧分片
    const nextShardPrefix = `${REPOS_SHARD_KEY_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    chunks.forEach((chunk, index) => {
        utools.dbStorage.setItem(getReposShardKey(nextShardPrefix, index), chunk);
    });

    const meta = {
        sharded: true,
        totalShards: chunks.length,
        shardPrefix: nextShardPrefix,
        formatVersion: REPOS_FORMAT_VERSION,
        repoIndex,
    };
    utools.dbStorage.setItem(REPOS_META_KEY, meta);
    utools.dbStorage.removeItem(REPOS_FLAT_KEY);

    if (oldMeta?.totalShards) {
        removeRepoShards(oldMeta.totalShards, getReposShardPrefix(oldMeta));
    }

    reposCache = { key: computeReposCacheKey(meta), repos, repoIndex };
}

/**
 * 重写单个分片（同片成员集合不变，仅成员内容更新）。
 * @returns {boolean} 是否成功；分片超限（如 AI 总结使内容显著膨胀）时返回 false，调用方应回退整库重写
 */
function rewriteShard(repos, repoIndex, meta, shardIndex) {
    const members = repos.filter(repo => repoIndex[String(repo.id)] === shardIndex);
    const parts = members.map(repo => JSON.stringify(repo));

    let text = parts.join(',');
    if (shardIndex === 0) {
        text = '[' + text;
    }
    text += (shardIndex === meta.totalShards - 1) ? ']' : ',';

    if (byteLengthOf(text) > MAX_REPOS_CHUNK_SIZE) {
        return false;
    }
    utools.dbStorage.setItem(getReposShardKey(getReposShardPrefix(meta), shardIndex), text);
    return true;
}

function isShardIndexUsable(meta, repoIndex, id) {
    if (!meta?.sharded || meta.formatVersion !== REPOS_FORMAT_VERSION || !repoIndex) {
        return false;
    }
    const shardIndex = repoIndex[String(id)];
    return Number.isInteger(shardIndex)
        && shardIndex >= 0
        && shardIndex < meta.totalShards;
}

/**
 * 单仓库增量写（v2）：只重写目标仓库所在分片（同片成员集合不变）。
 * 旧格式（无 formatVersion/repoIndex）或扁平存储：整库升级写（一次性迁移到新格式/单键重写）。
 * @param {number} id
 * @param {Object} patch
 */
function patchRepoById(id, patch) {
    const cache = readCachedRepos();
    const exists = cache.repos.some(repo => repo.id === id);
    if (!exists) {
        console.warn('[ReposStorage] patchRepo: 未找到仓库', id);
        return;
    }

    const repos = cache.repos.map(repo => (repo.id === id ? { ...repo, ...patch } : repo));
    const meta = readReposMeta();

    if (isShardIndexUsable(meta, cache.repoIndex, id)) {
        const shardIndex = cache.repoIndex[String(id)];
        if (rewriteShard(repos, cache.repoIndex, meta, shardIndex)) {
            reposCache = { key: cache.key, repos, repoIndex: cache.repoIndex };
            return;
        }
        console.warn('[ReposStorage] patchRepo: 分片超限，回退整库重写');
    }

    writeRepos(repos);
}

/**
 * 批量增量写（v2）：一次读缓存 → 应用全部 patch → 按 repoIndex 分组，只重写受影响分片。
 * 未迁移旧格式则整库升级写。给批量 AI 分析等收尾场景使用（替代全量重写）。
 * @param {Array<{ id: number, patch: Object }>} updates
 */
function patchReposByIdsBatch(updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
        return;
    }

    const cache = readCachedRepos();
    const patchMap = new Map();
    for (const { id, patch } of updates) {
        patchMap.set(id, patch);
    }

    const exists = new Set(cache.repos.map(repo => repo.id));
    let changed = false;
    const repos = cache.repos.map(repo => {
        const patch = patchMap.get(repo.id);
        if (!patch) return repo;
        changed = true;
        return { ...repo, ...patch };
    });
    if (!changed) {
        return;
    }

    const meta = readReposMeta();

    if (meta?.sharded && meta.formatVersion === REPOS_FORMAT_VERSION && cache.repoIndex) {
        const affectedShards = new Set();
        let indexComplete = true;
        for (const id of patchMap.keys()) {
            if (!exists.has(id)) continue;
            if (!isShardIndexUsable(meta, cache.repoIndex, id)) {
                indexComplete = false;
                break;
            }
            affectedShards.add(cache.repoIndex[String(id)]);
        }

        if (indexComplete && affectedShards.size > 0) {
            try {
                for (const shardIndex of affectedShards) {
                    if (!rewriteShard(repos, cache.repoIndex, meta, shardIndex)) {
                        throw new Error(`分片 ${shardIndex} 重写超限`);
                    }
                }
                reposCache = { key: cache.key, repos, repoIndex: cache.repoIndex };
                return;
            } catch (error) {
                console.error('[ReposStorage] patchReposBatch: 增量写失败，回退整库重写:', error);
                // 已有部分分片落盘，缓存失效，强制整库重写以恢复一致性
                reposCache = { key: null, repos: [], repoIndex: null };
            }
        }
    }

    writeRepos(repos);
}

// ==================== 笔记索引（gh:noteIndex） ====================

function getNoteKey(repoId) {
    return `gh:note:${repoId}`;
}

function readNoteIndex() {
    const index = utools.dbStorage.getItem(NOTE_INDEX_KEY);
    return Array.isArray(index) ? index : null;
}

/**
 * 让出主线程，避免阻塞 UI
 * @returns {Promise<void>}
 */
function yieldToMain() {
    return new Promise(resolve => {
        if (typeof setImmediate !== 'undefined') {
            setImmediate(resolve);
        } else if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(resolve, { timeout: 50 });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

// ==================== 暴露给前端 ====================
window.githubStarsAPI = {
    // GitHub API
    verifyToken: (token) => githubAPI.verifyToken(token),
    getStarredRepos: (token, page, perPage) => githubAPI.getStarredRepos(token, page, perPage),
    getStarredReposPage: (token, page, perPage) => githubAPI.getStarredReposPage(token, page, perPage),
    getReadme: (owner, repo, token) => githubAPI.getReadme(owner, repo, token),
    getRepoReleases: (owner, repo, token, page, perPage) => githubAPI.getReleases(owner, repo, token, page, perPage),
    getLatestRelease: (owner, repo, token) => githubAPI.getLatestRelease(owner, repo, token), // 🆕 v1.4.0
    checkRateLimit: (token) => githubAPI.checkRateLimit(token),

    // 存储操作
    getSettings: () => utools.dbCryptoStorage.getItem('gh:settings') || {},
    setSettings: (settings) => utools.dbCryptoStorage.setItem('gh:settings', settings),
    getToken: () => utools.dbCryptoStorage.getItem('gh:token'),
    setToken: (token) => utools.dbCryptoStorage.setItem('gh:token', token),
    getRepos: () => {
        const cached = readCachedRepos();
        // 元素级拷贝：防止渲染层突变污染 preload 内存缓存。
        // 仅拷贝实际存在的数组字段，保持数据形状不变（不给未分析仓库凭空加 aiTags: []）
        return cached.repos.map(repo => {
            const copy = { ...repo };
            if (Array.isArray(repo.customTags)) copy.customTags = [...repo.customTags];
            if (Array.isArray(repo.topics)) copy.topics = [...repo.topics];
            if (Array.isArray(repo.aiTags)) copy.aiTags = [...repo.aiTags];
            return copy;
        });
    },
    setRepos: (repos) => writeRepos(repos),
    // 🆕 v2 单仓库增量写：只重写目标仓库所在分片（详情页 AI 回写、别名/标签修改等）
    patchRepo: (id, patch) => patchRepoById(id, patch),
    // 🆕 v2 批量增量写：按 repoIndex 分组只重写受影响分片（批量 AI 分析收尾等）
    patchReposBatch: (updates) => patchReposByIdsBatch(updates),
    getSyncState: () => utools.dbStorage.getItem('gh:syncState'),
    setSyncState: (state) => utools.dbStorage.setItem('gh:syncState', state),
    getStoredReleases: () => utools.dbStorage.getItem('gh:releases') || [],
    setStoredReleases: (releases) => utools.dbStorage.setItem('gh:releases', releases),
    getReadReleaseIds: () => utools.dbStorage.getItem('gh:readReleases') || [],
    setReadReleaseIds: (ids) => utools.dbStorage.setItem('gh:readReleases', ids),
    getReleaseSubscriptions: () => utools.dbStorage.getItem('gh:releaseSubscriptions') || [],
    setReleaseSubscriptions: (ids) => utools.dbStorage.setItem('gh:releaseSubscriptions', ids),

    // ========== 标签管理 🆕 v1.1.0 ==========
    getTags: () => utools.dbStorage.getItem('gh:tags') || [],

    setTags: (tags) => utools.dbStorage.setItem('gh:tags', tags),

    addTag: (tagData) => {
        const tags = window.githubStarsAPI.getTags();
        const newTag = {
            id: `tag-${Date.now()}`,
            ...tagData,
            order: tags.length,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        tags.push(newTag);
        window.githubStarsAPI.setTags(tags);
        return newTag;
    },

    updateTag: (id, updates) => {
        const tags = window.githubStarsAPI.getTags();
        const index = tags.findIndex(t => t.id === id);
        if (index !== -1) {
            tags[index] = {
                ...tags[index],
                ...updates,
                updatedAt: Date.now()
            };
            window.githubStarsAPI.setTags(tags);
            return tags[index];
        }
        return null;
    },

    /**
     * 删除标签（原子化版本 v2 重构）
     * 优化：单次读缓存 → 内存剥离标签 → yieldToMain → writeRepos 一次写（替代旧的分批 patch）
     * @param {string} id - 标签ID
     * @returns {Promise<{updated: number, errors: number}>} 写失败时 reject（不吞错）
     */
    deleteTag: async (id) => {
        // 1. 删除标签定义并重排（同步操作，很快）
        const tags = window.githubStarsAPI.getTags().filter(t => t.id !== id);
        tags.forEach((t, i) => { t.order = i; });
        window.githubStarsAPI.setTags(tags);

        // 2. 单次读取缓存，筛选受影响的仓库
        const cache = readCachedRepos();
        const affectedRepos = cache.repos.filter(repo =>
            repo.customTags && repo.customTags.includes(id)
        );

        if (affectedRepos.length === 0) {
            return { updated: 0, errors: 0 };
        }

        // 3. 写前让出主线程，随后一次写入
        await yieldToMain();

        const merged = cache.repos.map(repo =>
            repo.customTags && repo.customTags.includes(id)
                ? {
                    ...repo,
                    customTags: repo.customTags.filter(t => t !== id),
                    updatedAt: Date.now()
                }
                : repo
        );
        writeRepos(merged);

        return { updated: affectedRepos.length, errors: 0 };
    },

    reorderTags: (tagIds) => {
        const tags = window.githubStarsAPI.getTags();
        const tagMap = new Map(tags.map(t => [t.id, t]));
        const reordered = tagIds
            .map(id => tagMap.get(id))
            .filter(Boolean)
            .map((t, i) => ({ ...t, order: i, updatedAt: Date.now() }));
        window.githubStarsAPI.setTags(reordered);
    },

    // ========== 笔记管理 🆕 v1.1.0（v2 增加笔记索引 gh:noteIndex） ==========
    getNote: (repoId) => {
        return utools.dbStorage.getItem(getNoteKey(repoId));
    },

    setNote: (repoId, content) => {
        const existing = window.githubStarsAPI.getNote(repoId);
        const note = {
            id: `note-${repoId}`,
            repoId,
            content,
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now()
        };
        utools.dbStorage.setItem(getNoteKey(repoId), note);

        // 维护笔记索引；索引尚不存在（老用户未迁移）时不新建，避免漏掉未扫描的旧笔记，
        // 等 getAllNotes 首次全量扫描时再建立完整索引
        const index = readNoteIndex();
        if (index && !index.includes(repoId)) {
            index.push(repoId);
            utools.dbStorage.setItem(NOTE_INDEX_KEY, index);
        }
        return note;
    },

    deleteNote: (repoId) => {
        utools.dbStorage.removeItem(getNoteKey(repoId));
        const index = readNoteIndex();
        if (index) {
            const next = index.filter(id => id !== repoId);
            if (next.length !== index.length) {
                utools.dbStorage.setItem(NOTE_INDEX_KEY, next);
            }
        }
    },

    getAllNotes: () => {
        const cached = readCachedRepos();
        const validRepoIds = new Set(cached.repos.map(repo => repo.id));
        let index = readNoteIndex();
        let persistIndex = false;

        if (!index) {
            // 老用户：无索引 → 走旧全量扫描一次，随后持久化索引
            index = [];
            for (const repoId of validRepoIds) {
                if (utools.dbStorage.getItem(getNoteKey(repoId))) {
                    index.push(repoId);
                }
            }
            persistIndex = true;
        }

        const notes = [];
        const nextIndex = [];
        for (const repoId of index) {
            // 顺手清理孤儿笔记（repoId 不在当前 repos 里的 gh:note:<id>）。
            // 注：utools.dbStorage 仅提供 getItem/setItem/removeItem，无法枚举全部键，
            // 因此只能清理索引可发现的孤儿；索引建立前遗留的孤儿（仓库早已删除）不可枚举，保持原样。
            if (!validRepoIds.has(repoId)) {
                utools.dbStorage.removeItem(getNoteKey(repoId));
                persistIndex = true;
                continue;
            }
            const note = utools.dbStorage.getItem(getNoteKey(repoId));
            if (note) {
                notes.push(note);
                nextIndex.push(repoId);
            } else {
                persistIndex = true; // 索引项对应的笔记已被删，收缩索引
            }
        }

        if (persistIndex) {
            utools.dbStorage.setItem(NOTE_INDEX_KEY, nextIndex);
        }

        return notes;
    },

    // ========== 系统操作 ==========
    openExternal: (url) => utools.shellOpenExternal(url),
    showNotification: (body, clickFeatureCode) => utools.showNotification(body, clickFeatureCode),

    // ========== AI 分析 ==========
    analyzeRepo: async (readmeContent, repoInfo, language = 'zh', model) => {
        const systemPrompt = language === 'zh'
            ? `你是一个 GitHub 仓库分析专家。请分析以下仓库信息，生成：
1. 一个简洁的中文概述（不超过50字）
2. 3-5个相关标签（用中文）
3. 支持的平台类型（从 mac、windows、linux、ios、android、docker、web、cli 中选择）

请以 JSON 格式返回: {"summary": "...", "tags": [...], "platforms": [...]}`
            : `You are a GitHub repository analysis expert. Analyze the following repository and generate:
1. A concise English overview (no more than 50 words)
2. 3-5 relevant tags
3. Supported platforms (from: mac, windows, linux, ios, android, docker, web, cli)

Return in JSON format: {"summary": "...", "tags": [...], "platforms": [...]}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `仓库名称: ${repoInfo.fullName}\n描述: ${repoInfo.description || '无描述'}\n语言: ${repoInfo.language || '未知'}\n\nREADME (前2000字符):\n${readmeContent.substring(0, 2000)}`
            }
        ];

        try {
            const aiOptions = { messages };
            if (model) aiOptions.model = model;
            console.log('[AI分析] 开始调用 utools.ai，能量消耗中...', { repo: repoInfo.fullName, model });
            const result = await utools.ai(aiOptions);
            console.log('[AI分析] utools.ai 调用完成', { repo: repoInfo.fullName, result });
            const content = result.content || '';
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return null;
        } catch (error) {
            console.error('[AI分析] 调用失败:', error);
            return null;
        }
    },

    // 获取可用的 AI 模型列表
    getAIModels: async () => {
        try {
            const models = await utools.allAiModels();
            return models;
        } catch (error) {
            console.error('Failed to get AI models:', error);
            return [];
        }
    }
};
