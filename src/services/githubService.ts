/**
 * GitHub 星标仓库同步服务
 *
 * 同步策略：
 * - 全量（首次 / 距上次全量 ≥ 7 天）：page=N 参数预推 + 有界并发窗口（FULL_SYNC_CONCURRENCY）
 *   抓取。先请求 page=1 从 Link header 取 lastPage 作为总页数估计，随后滑动窗口并发请求
 *   后续页，页间保留 ~100ms 发车间隔做节流。starred 列表按 created desc 排序，同步期间
 *   新增 star 会让相邻页快照漂移：任一页响应不足 PER_PAGE 条或为空数组即视为末页
 *   （短页即停兜底，lastPage 仅为估计值；若估计末页仍为满页则向后扩展一页）；
 *   漂移产生的首尾重复按 repo id 去重（保留更靠前页的记录）后按页序升序拼接。
 * - 增量：保持串行逐页扫描（页间存在顺序依赖，不做并发），直到
 *   「整页已知 + 含最新标记 + 最老 starredAt ≤ 已知」停止条件满足；结果同样按 id 去重
 *   （防御性，抵御快照漂移）。
 * - 限流退避（403/429 retry-after）与 keep-alive 由 preload 层请求层负责，本层不重试；
 *   任一页最终失败则整轮同步按原错误语义向上抛出（不吞、不部分返回）。
 */

import type { Repository, StarredReposPage, SyncState } from '../types';

const PER_PAGE = 100;
const FULL_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
// 全量同步并发窗口：同时在途的最大页请求数
const FULL_SYNC_CONCURRENCY = 3;
// 相邻页请求之间的发车间隔（ms），避免瞬时打满 API 配额
const PAGE_DISPATCH_INTERVAL_MS = 100;

type SyncMode = 'full' | 'incremental';

interface SyncResult {
    mode: SyncMode;
    repos: Repository[];
    processedCount: number;
}

export const githubService = {
    /**
     * 验证 Token，返回结构化结果（本方法不抛错）。
     * 失败原因按 preload reject 的 Error.status 分类：
     * - 401 → invalid；403/429（preload 限流退避重试后仍失败）→ rateLimited；
     * - 无 status（网络错误/超时/解析失败）→ network。
     */
    async verifyToken(token: string): Promise<{ ok: boolean; reason?: 'invalid' | 'rateLimited' | 'network' }> {
        try {
            await window.githubStarsAPI.verifyToken(token);
            return { ok: true };
        } catch (error) {
            // TS strict 下 error 为 unknown，安全收窄后读取可选 status
            const status = (error as { status?: number } | null | undefined)?.status;
            if (status === 401) {
                return { ok: false, reason: 'invalid' };
            }
            if (status === 403 || status === 429) {
                return { ok: false, reason: 'rateLimited' };
            }
            return { ok: false, reason: 'network' };
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

/**
 * 全量同步：page=N 预推 + 有界并发窗口分页抓取。
 *
 * - 进度语义：每按序确认一页回调一次 onProgress(current, total)，current 为去重后的
 *   累计仓库数，total 沿用 lastPage 估计值（页数 × PER_PAGE）；若最终实际页数与估计
 *   不同（同步期间列表增长/收缩或 Link 缺失），最后一次回调校正 total 为实际仓库数。
 * - 错误语义：窗口内任一页最终抛错（含 preload 重试后仍失败）时整轮同步向上抛出，
 *   不吞、不部分返回。
 */
async function syncAllRepos(
    token: string,
    onProgress: (current: number, total: number) => void
): Promise<SyncResult> {
    // 第 1 页串行请求：取得 Link header 的 lastPage 作为总页数估计
    const firstResult = await window.githubStarsAPI.getStarredReposPage(token, 1, PER_PAGE);
    const firstRepos = transformPageItems(firstResult.items);

    // 按页序升序拼接的结果 + repo id 去重：同步期间新增 star 会让相邻页快照漂移产生
    // 首尾重复，去重保留先出现者（即更靠前页的记录）
    const orderedRepos: Repository[] = [];
    const seenRepoIds = new Set<number>();
    const appendRepos = (repos: Repository[]): void => {
        repos.forEach((repo) => {
            if (seenRepoIds.has(repo.id)) return;
            seenRepoIds.add(repo.id);
            orderedRepos.push(repo);
        });
    };

    appendRepos(firstRepos);

    // Link lastPage 仅为估计值；缺失时退化为「满页即可能还有下一页」，由短页即停兜底
    const estimatedLastPage = firstResult.totalPages != null
        ? firstResult.totalPages
        : (firstRepos.length === PER_PAGE ? 2 : 1);
    const estimatedTotal = firstResult.totalPages != null
        ? firstResult.totalPages * PER_PAGE
        : 0;

    let lastConfirmedPage = 1;
    let lastPageWithItems = firstRepos.length > 0 ? 1 : 0;
    onProgress(orderedRepos.length, estimatedTotal);

    // 并发完成顺序可能与页序不一致：先暂存，按序确认后再拼接并回调进度
    const pendingPages = new Map<number, Repository[]>();
    const consumeConfirmedPages = (): void => {
        while (pendingPages.has(lastConfirmedPage + 1)) {
            const page = lastConfirmedPage + 1;
            const repos = pendingPages.get(page)!;
            pendingPages.delete(page);
            lastConfirmedPage = page;

            appendRepos(repos);
            if (repos.length > 0) {
                lastPageWithItems = page;
                onProgress(orderedRepos.length, estimatedTotal);
            }
        }
    };

    // 发车节流：所有页请求经同一队列串行发车，相邻发车时刻间隔 ~100ms。发车链在
    // 「发车时刻」即推进（不等待响应完成），因此窗口内页请求保持并发在途
    let dispatchTurn: Promise<void> = Promise.resolve();
    const dispatchPageRequest = (page: number): Promise<StarredReposPage> => {
        const depart = dispatchTurn.then(() => sleep(PAGE_DISPATCH_INTERVAL_MS));
        dispatchTurn = depart;
        return depart.then(() => window.githubStarsAPI.getStarredReposPage(token, page, PER_PAGE));
    };

    let nextDispatchPage = 2;
    let highestFullPage = firstRepos.length === PER_PAGE ? 1 : 0;
    // 第 1 页已短或其 Link 已指明无下一页时无需继续（与串行版一致：信任 hasNext）
    let reachedEnd = firstRepos.length < PER_PAGE || !firstResult.hasNext;
    let firstError: unknown = null;

    const runFetchWorker = async (): Promise<void> => {
        while (firstError === null && !reachedEnd) {
            // 页号预推：估计末页之内直接发车；估计末页之后仅在满页（同步期间列表增长）
            // 时向后扩展一页，直到出现短页/空页或 Link 指示无下一页
            const canDispatch = nextDispatchPage <= estimatedLastPage
                || nextDispatchPage <= highestFullPage + 1;
            if (!canDispatch) return;

            const page = nextDispatchPage;
            nextDispatchPage += 1;

            let result: StarredReposPage;
            try {
                result = await dispatchPageRequest(page);
            } catch (error) {
                // 窗口内任一页最终失败（preload 重试后仍失败）：记录首个错误并终止整轮
                if (firstError === null) firstError = error;
                return;
            }

            const repos = transformPageItems(result.items);
            if (repos.length < PER_PAGE || !result.hasNext) {
                reachedEnd = true; // 短页/空页 = 末页兜底；Link 无下一页则信任之
            } else {
                highestFullPage = Math.max(highestFullPage, page);
            }
            pendingPages.set(page, repos);
            consumeConfirmedPages();
        }
    };

    const workerCount = Math.min(FULL_SYNC_CONCURRENCY, Math.max(estimatedLastPage - 1, 1));
    await Promise.all(Array.from({ length: workerCount }, () => runFetchWorker()));

    if (firstError !== null) {
        throw firstError;
    }

    consumeConfirmedPages();

    // 实际页数与估计不同时，最后一次回调校正 total 为实际仓库数（进度收敛到 100%）
    if (lastPageWithItems !== estimatedLastPage) {
        onProgress(orderedRepos.length, orderedRepos.length);
    }

    return {
        mode: 'full',
        repos: orderedRepos,
        processedCount: orderedRepos.length,
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
    // 按 repo id 去重（防御性）：串行扫描下相邻页快照漂移同样可能产生重复
    const scannedRepos = new Map<number, Repository>();

    let page = 1;
    let processedCount = 0;

    while (true) {
        const repos = await window.githubStarsAPI.getStarredRepos(token, page, PER_PAGE);

        if (!repos || repos.length === 0) {
            if (page === 1) {
                // 本地有数据却返回空列表，视为异常（API 故障/限流误报），
                // 中止同步保护本地数据——否则会被当作空全量同步清空所有仓库及 AI 分析状态
                if (existingRepos.length > 0) {
                    throw new Error('GitHub 返回空仓库列表，同步已中止（本地数据未受影响）');
                }
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
        await sleep(PAGE_DISPATCH_INTERVAL_MS);
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

function transformPageItems(items: any[]): Repository[] {
    return items.map((item: any) => {
        const repo = item.repo || item;
        return transformRepo(repo, item.starred_at);
    });
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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function compareStarredAtDesc(a: Repository, b: Repository): number {
    const aTime = a.starredAt ? new Date(a.starredAt).getTime() : 0;
    const bTime = b.starredAt ? new Date(b.starredAt).getTime() : 0;
    return bTime - aTime;
}
