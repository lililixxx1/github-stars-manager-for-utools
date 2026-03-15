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
            `/user/starred?page=${page}&per_page=${perPage}`,
            token,
            { accept: 'application/vnd.github.star+json' }
        );
        console.log('[GitHub API] Got', Array.isArray(result) ? result.length : 0, 'repos on page', page);
        return result;
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

function requestGitHub(path, token, options = {}) {
    return new Promise((resolve, reject) => {
        console.log('[GitHub API] Request:', path);
        const reqOptions = {
            hostname: 'api.github.com',
            path: path,
            method: 'GET',
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

            let data = '';
            stream.on('data', chunk => {
                data += chunk.toString();
            });
            stream.on('end', () => {
                console.log('[GitHub API] Response complete, data length:', data.length);
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        console.error('[GitHub API] Error:', res.statusCode, json.message || data.substring(0, 300));
                        reject(new Error(json.message || `HTTP ${res.statusCode}`));
                    }
                } catch (e) {
                    console.error('[GitHub API] Parse error:', e.message, 'data:', data.substring(0, 300));
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

// ==================== 异步辅助函数 (v1.7.0) ====================

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

/**
 * 增量更新仓库数据
 * @param {Array} updatedRepos - 要更新的仓库列表
 */
async function patchRepos(updatedRepos) {
    const allRepos = window.githubStarsAPI.getRepos();
    const updatedMap = new Map(updatedRepos.map(r => [r.id, r]));

    const merged = allRepos.map(repo =>
        updatedMap.has(repo.id) ? updatedMap.get(repo.id) : repo
    );

    window.githubStarsAPI.setRepos(merged);
}

// ==================== 暴露给前端 ====================
window.githubStarsAPI = {
    // GitHub API
    verifyToken: (token) => githubAPI.verifyToken(token),
    getStarredRepos: (token, page, perPage) => githubAPI.getStarredRepos(token, page, perPage),
    getReadme: (owner, repo, token) => githubAPI.getReadme(owner, repo, token),
    getRepoReleases: (owner, repo, token, page, perPage) => githubAPI.getReleases(owner, repo, token, page, perPage),
    getLatestRelease: (owner, repo, token) => githubAPI.getLatestRelease(owner, repo, token), // 🆕 v1.4.0
    checkRateLimit: (token) => githubAPI.checkRateLimit(token),

    // 存储操作
    getSettings: () => utools.dbCryptoStorage.getItem('gh:settings') || {},
    setSettings: (settings) => utools.dbCryptoStorage.setItem('gh:settings', settings),
    getToken: () => utools.dbCryptoStorage.getItem('gh:token'),
    setToken: (token) => utools.dbCryptoStorage.setItem('gh:token', token),
    getRepos: () => utools.dbStorage.getItem('gh:repos') || [],
    setRepos: (repos) => utools.dbStorage.setItem('gh:repos', repos),
    getStoredReleases: () => utools.dbStorage.getItem('gh:releases') || [],
    setStoredReleases: (releases) => utools.dbStorage.setItem('gh:releases', releases),
    getReadReleaseIds: () => utools.dbStorage.getItem('gh:readReleases') || [],
    setReadReleaseIds: (ids) => utools.dbStorage.setItem('gh:readReleases', ids),
    getReleaseSubscriptions: () => utools.dbStorage.getItem('gh:releaseSubscriptions') || [],
    setReleaseSubscriptions: (ids) => utools.dbStorage.setItem('gh:releaseSubscriptions', ids),
    getCategories: () => utools.dbStorage.getItem('gh:categories') || [],
    setCategories: (categories) => utools.dbStorage.setItem('gh:categories', categories),
    getReposMeta: () => utools.dbStorage.getItem('gh:repos:meta'),
    setReposMeta: (meta) => utools.dbStorage.setItem('gh:repos:meta', meta),
    getReposShard: (index) => utools.dbStorage.getItem(`gh:repos:shard:${index}`),
    setReposShard: (index, data) => utools.dbStorage.setItem(`gh:repos:shard:${index}`, data),
    removeReposShard: (index) => utools.dbStorage.removeItem(`gh:repos:shard:${index}`),
    removeReposMeta: () => utools.dbStorage.removeItem('gh:repos:meta'),

    // ========== 版本检测状态 🆕 v1.4.0 ==========
    getReleaseCheckStatus: () => utools.dbStorage.getItem('gh:releaseCheckStatus') || {
        lastCheckedAt: null,
        checking: false,
        newCount: 0,
        error: null,
    },
    setReleaseCheckStatus: (status) => utools.dbStorage.setItem('gh:releaseCheckStatus', status),

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
     * 删除标签（异步分片版本 v1.7.0）
     * 优化：分片更新 + 让出主线程 + 错误处理
     * @param {string} id - 标签ID
     * @returns {Promise<{updated: number, errors: number}>}
     */
    deleteTag: async (id) => {
        // 1. 删除标签并重新排序（同步操作，很快）
        const tags = window.githubStarsAPI.getTags().filter(t => t.id !== id);
        tags.forEach((t, i) => { t.order = i; });
        window.githubStarsAPI.setTags(tags);

        // 2. 只筛选受影响的仓库
        const repos = window.githubStarsAPI.getRepos();
        const affectedRepos = repos.filter(repo =>
            repo.customTags && repo.customTags.includes(id)
        );

        if (affectedRepos.length === 0) {
            return { updated: 0, errors: 0 };
        }

        // 3. 分片处理
        const CHUNK_SIZE = 50;
        let updatedCount = 0;
        const errors = [];

        for (let i = 0; i < affectedRepos.length; i += CHUNK_SIZE) {
            const chunk = affectedRepos.slice(i, i + CHUNK_SIZE);

            try {
                // 让出主线程，避免阻塞 UI
                await yieldToMain();

                // 更新这一批仓库
                const updatedChunk = chunk.map(repo => ({
                    ...repo,
                    customTags: (repo.customTags || []).filter(t => t !== id),
                    updatedAt: Date.now()
                }));

                // 合并更新
                await patchRepos(updatedChunk);
                updatedCount += updatedChunk.length;
            } catch (error) {
                errors.push({ chunk: i, error });
                // 继续处理其他批次，不中断
                console.error(`[deleteTag] 批次 ${i} 更新失败:`, error);
            }
        }

        if (errors.length > 0) {
            console.error('[deleteTag] 部分批次更新失败:', errors);
        }

        return {
            updated: updatedCount,
            errors: errors.length
        };
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

    // ========== 笔记管理 🆕 v1.1.0 ==========
    getNote: (repoId) => {
        return utools.dbStorage.getItem(`gh:note:${repoId}`);
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
        utools.dbStorage.setItem(`gh:note:${repoId}`, note);
        return note;
    },

    deleteNote: (repoId) => {
        utools.dbStorage.removeItem(`gh:note:${repoId}`);
    },

    getAllNotes: () => {
        // 通过遍历仓库获取所有笔记
        const repos = window.githubStarsAPI.getRepos();
        return repos
            .map(r => window.githubStarsAPI.getNote(r.id))
            .filter(Boolean);
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
