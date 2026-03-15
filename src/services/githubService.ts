import type { Repository } from '../types';

export const githubService = {
    async verifyToken(token: string): Promise<boolean> {
        try {
            await window.githubStarsAPI.verifyToken(token);
            return true;
        } catch {
            return false;
        }
    },

    async syncAllRepos(
        token: string,
        onProgress: (current: number, total: number) => void
    ): Promise<Repository[]> {
        const allRepos: Repository[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const repos = await window.githubStarsAPI.getStarredRepos(token, page, 100);

            if (!repos || repos.length === 0) {
                hasMore = false;
            } else {
                const transformedRepos = repos.map((item: any) => {
                    const repo = item.repo || item;
                    return transformRepo(repo, item.starred_at);
                });
                allRepos.push(...transformedRepos);
                onProgress(allRepos.length, allRepos.length + 100);
                page++;
                // 限流保护
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return allRepos;
    },

    async getReleases(owner: string, repo: string, token: string) {
        return window.githubStarsAPI.getRepoReleases(owner, repo, token);
    },

    async checkRateLimit(token: string) {
        return window.githubStarsAPI.checkRateLimit(token);
    }
};

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
