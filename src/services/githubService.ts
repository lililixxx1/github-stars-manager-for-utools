import type { Repository, SyncState } from '../types';

const PER_PAGE = 100;
const FULL_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

type SyncMode = 'full' | 'incremental';

interface SyncResult {
    mode: SyncMode;
    repos: Repository[];
    processedCount: number;
}

export const githubService = {
    async verifyToken(token: string): Promise<boolean> {
        try {
            await window.githubStarsAPI.verifyToken(token);
            return true;
        } catch {
            return false;
        }
    },

    async syncRepos(
        token: string,
        existingRepos: Repository[],
        syncState: SyncState | null,
        onProgress: (current: number, total: number) => void
    ): Promise<SyncResult> {
        const shouldRunFullSync = shouldPerformFullSync(existingRepos, syncState);

        if (shouldRunFullSync) {
            return syncAllRepos(token, onProgress);
        }

        return syncIncrementalRepos(token, existingRepos, syncState, onProgress);
    },

    buildSyncState(
        repos: Repository[],
        previousState: SyncState | null,
        mode: SyncMode
    ): SyncState {
        const sorted = [...repos].sort(compareStarredAtDesc);
        const latestStarredAt = sorted[0]?.starredAt || null;

        return {
            latestStarredAt,
            latestRepoIds: sorted
                .slice(0, PER_PAGE)
                .map((repo) => repo.id),
            lastSyncAt: Date.now(),
            lastFullSyncAt: mode === 'full'
                ? Date.now()
                : previousState?.lastFullSyncAt || null,
        };
    },

    async getReleases(owner: string, repo: string, token: string) {
        return window.githubStarsAPI.getRepoReleases(owner, repo, token);
    },

    async checkRateLimit(token: string) {
        return window.githubStarsAPI.checkRateLimit(token);
    }
};

async function syncAllRepos(
    token: string,
    onProgress: (current: number, total: number) => void
): Promise<SyncResult> {
    const allRepos: Repository[] = [];
    let page = 1;
    let totalPages: number | null = null;

    while (true) {
        const result = await window.githubStarsAPI.getStarredReposPage(token, page, PER_PAGE);
        totalPages = result.totalPages ?? totalPages;

        const transformedRepos = result.items.map((item: any) => {
            const repo = item.repo || item;
            return transformRepo(repo, item.starred_at);
        });

        allRepos.push(...transformedRepos);
        onProgress(allRepos.length, totalPages ? totalPages * PER_PAGE : 0);

        if (!result.hasNext || result.items.length < PER_PAGE) {
            break;
        }

        page = result.nextPage ?? page + 1;
        // 限流保护
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
        mode: 'full',
        repos: allRepos,
        processedCount: allRepos.length,
    };
}

async function syncIncrementalRepos(
    token: string,
    existingRepos: Repository[],
    syncState: SyncState | null,
    onProgress: (current: number, total: number) => void
): Promise<SyncResult> {
    const existingRepoIds = new Set(existingRepos.map((repo) => repo.id));
    const latestKnownStarredAt = syncState?.latestStarredAt
        ? new Date(syncState.latestStarredAt).getTime()
        : 0;
    const latestKnownRepoIds = new Set(syncState?.latestRepoIds || []);
    const scannedRepos = new Map<number, Repository>();

    let page = 1;
    let processedCount = 0;

    while (true) {
        const repos = await window.githubStarsAPI.getStarredRepos(token, page, PER_PAGE);

        if (!repos || repos.length === 0) {
            if (page === 1) {
                return {
                    mode: 'full',
                    repos: [],
                    processedCount: 0,
                };
            }

            break;
        }

        const transformedRepos = repos.map((item: any) => {
            const repo = item.repo || item;
            return transformRepo(repo, item.starred_at);
        });

        processedCount += transformedRepos.length;
        onProgress(processedCount, 0);

        transformedRepos.forEach((repo) => {
            scannedRepos.set(repo.id, repo);
        });

        const pageAllKnown = transformedRepos.every((repo) => existingRepoIds.has(repo.id));
        const oldestStarredAt = transformedRepos[transformedRepos.length - 1]?.starredAt
            ? new Date(transformedRepos[transformedRepos.length - 1].starredAt!).getTime()
            : 0;
        const containsLatestMarker = latestKnownRepoIds.size === 0
            || transformedRepos.some((repo) => latestKnownRepoIds.has(repo.id));

        if (
            transformedRepos.length < PER_PAGE
            || (
                pageAllKnown
                && containsLatestMarker
                && oldestStarredAt <= latestKnownStarredAt
            )
        ) {
            break;
        }

        page++;
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
        mode: 'incremental',
        repos: Array.from(scannedRepos.values()).sort(compareStarredAtDesc),
        processedCount,
    };
}

function shouldPerformFullSync(existingRepos: Repository[], syncState: SyncState | null): boolean {
    if (existingRepos.length === 0) return true;
    if (!syncState?.latestStarredAt || !syncState.lastFullSyncAt) return true;

    return Date.now() - syncState.lastFullSyncAt >= FULL_SYNC_INTERVAL_MS;
}

function transformRepo(raw: any, starredAt?: string): Repository {
    return {
        id: raw.id,
        name: raw.name,
        fullName: raw.full_name,
        owner: {
            login: raw.owner.login,
            avatarUrl: raw.owner.avatar_url,
        },
        description: raw.description,
        homepage: raw.homepage || '',
        htmlUrl: raw.html_url,
        language: raw.language,
        topics: raw.topics || [],
        stargazersCount: raw.stargazers_count,
        forksCount: raw.forks_count,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        pushedAt: raw.pushed_at,
        starredAt: starredAt || raw.starred_at,
        customTags: [], // v1.1.0: 初始化为空数组
        lastSyncedAt: Date.now(),
    };
}

function compareStarredAtDesc(a: Repository, b: Repository): number {
    const aTime = a.starredAt ? new Date(a.starredAt).getTime() : 0;
    const bTime = b.starredAt ? new Date(b.starredAt).getTime() : 0;
    return bTime - aTime;
}
