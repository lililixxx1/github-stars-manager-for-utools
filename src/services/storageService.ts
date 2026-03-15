import type { Repository, Settings, Release, Category } from '../types';

const MAX_CHUNK_SIZE = 900 * 1024; // 900KB 安全阈值

export const storageService = {
    // ==================== Settings ====================
    getSettings(): Partial<Settings> {
        return window.githubStarsAPI.getSettings();
    },

    setSettings(settings: Partial<Settings>): void {
        window.githubStarsAPI.setSettings(settings as Settings);
    },

    // ==================== Token ====================
    getToken(): string | null {
        return window.githubStarsAPI.getToken();
    },

    setToken(token: string): void {
        window.githubStarsAPI.setToken(token);
    },

    // ==================== Repositories (分片存储) ====================
    getRepositories(): Repository[] {
        const meta = window.githubStarsAPI.getReposMeta();
        if (meta?.sharded) {
            return loadSharded(meta.totalShards);
        }
        return window.githubStarsAPI.getRepos() || [];
    },

    setRepositories(repos: Repository[]): void {
        const json = JSON.stringify(repos);
        if (json.length < MAX_CHUNK_SIZE) {
            window.githubStarsAPI.setRepos(repos);
            window.githubStarsAPI.removeReposMeta();
        } else {
            saveSharded(repos);
        }
    },

    // ==================== Releases ====================
    getReleases(): Release[] {
        return window.githubStarsAPI.getStoredReleases();
    },

    setReleases(releases: Release[]): void {
        window.githubStarsAPI.setStoredReleases(releases);
    },

    getReadReleaseIds(): Set<number> {
        return new Set(window.githubStarsAPI.getReadReleaseIds());
    },

    setReadReleaseIds(ids: Set<number>): void {
        window.githubStarsAPI.setReadReleaseIds(Array.from(ids));
    },

    getReleaseSubscriptions(): Set<number> {
        return new Set(window.githubStarsAPI.getReleaseSubscriptions());
    },

    setReleaseSubscriptions(ids: Set<number>): void {
        window.githubStarsAPI.setReleaseSubscriptions(Array.from(ids));
    },

    // ==================== Categories ====================
    getCategories(): Category[] {
        return window.githubStarsAPI.getCategories();
    },

    setCategories(categories: Category[]): void {
        window.githubStarsAPI.setCategories(categories);
    },
};

// ==================== 分片辅助函数 ====================
function saveSharded(data: Repository[]): void {
    const json = JSON.stringify(data);
    const chunks: string[] = [];

    for (let i = 0; i < json.length; i += MAX_CHUNK_SIZE) {
        chunks.push(json.slice(i, i + MAX_CHUNK_SIZE));
    }

    // 清理旧分片
    const oldMeta = window.githubStarsAPI.getReposMeta();
    if (oldMeta?.totalShards) {
        for (let i = 0; i < oldMeta.totalShards; i++) {
            window.githubStarsAPI.removeReposShard(i);
        }
    }

    // 存储新分片
    chunks.forEach((chunk, index) => {
        window.githubStarsAPI.setReposShard(index, chunk);
    });
    window.githubStarsAPI.setReposMeta({ sharded: true, totalShards: chunks.length });
}

function loadSharded(totalShards: number): Repository[] {
    const chunks: string[] = [];
    for (let i = 0; i < totalShards; i++) {
        const chunk = window.githubStarsAPI.getReposShard(i);
        if (chunk) chunks.push(chunk);
    }
    try {
        return JSON.parse(chunks.join(''));
    } catch {
        return [];
    }
}
