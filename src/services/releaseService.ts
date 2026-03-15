import { Release, ReleaseAsset } from '../types';
import { PLATFORM_OPTIONS } from '../constants/platforms';
import { logger } from '../utils/logger';

// 平台识别正则
const PLATFORM_PATTERNS: Record<string, RegExp[]> = {
    mac: [
        /darwin/i, /macos/i, /mac[-_.]os/i, /\.dmg$/i, /\.pkg$/i,
        /-mac[-._]/i, /-osx[-._]/i, /apple/i
    ],
    windows: [
        /win/i, /windows/i, /\.exe$/i, /\.msi$/i,
        /-win[-._]/i, /-windows[-._]/i
    ],
    linux: [
        /linux/i, /\.deb$/i, /\.rpm$/i, /\.AppImage$/i, /\.snap$/i,
        /-linux[-._]/i
    ],
    ios: [/ios/i, /iphone/i, /ipad/i, /\.ipa$/i],
    android: [/android/i, /\.apk$/i, /-android[-._]/i],
    docker: [/docker/i, /\.docker/i, /container/i],
    web: [/web/i, /browser/i, /\.html$/i],
    cli: [/cli/i, /command[-_.]line/i, /terminal/i]
};

// 缓存配置
const CACHE_CONFIG = {
    maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    maxReleaseCount: 100,
    cleanupOnStartup: true,
};

export const releaseService = {
    /**
     * 获取单个仓库的 Release 列表
     */
    async getReleases(
        owner: string,
        repo: string,
        token: string,
        page: number = 1,
        perPage: number = 10
    ): Promise<Release[]> {
        try {
            const releases = await window.githubStarsAPI.getRepoReleases(owner, repo, token, page, perPage);
            return releases || [];
        } catch (error) {
            console.error(`Failed to get releases for ${owner}/${repo}:`, error);
            return [];
        }
    },

    /**
     * 获取单个仓库的最新 Release
     */
    async getLatestRelease(
        owner: string,
        repo: string,
        token: string
    ): Promise<Release | null> {
        try {
            const release = await window.githubStarsAPI.getLatestRelease(owner, repo, token);
            return release || null;
        } catch (error) {
            console.error(`Failed to get latest release for ${owner}/${repo}:`, error);
            return null;
        }
    },

    /**
     * 批量检测订阅仓库的版本更新
     */
    async checkSubscribedRepos(
        repoIds: number[],
        token: string,
        repositories: { id: number; fullName: string }[],
        onProgress?: (current: number, total: number, repoName: string) => void
    ): Promise<{
        updates: Release[];
        errors: { repoId: number; error: string }[];
    }> {
        const updates: Release[] = [];
        const errors: { repoId: number; error: string }[] = [];
        const storedReleases = window.githubStarsAPI.getStoredReleases();

        logger.log('[ReleaseService] checkSubscribedRepos 开始', {
            订阅仓库数: repoIds.length,
            本地缓存版本数: storedReleases.length,
            订阅仓库IDs: repoIds,
        });

        // 构建仓库 ID -> 最新 Release ID 的映射（只保留每个仓库最新的一条）
        const repoLatestReleaseId = new Map<number, number>();
        for (const release of storedReleases) {
            const repoId = release.repository.id;
            const existingId = repoLatestReleaseId.get(repoId);
            const existingRelease = storedReleases.find(r => r.repository.id === repoId && r.id === existingId);
            // 支持标准化字段名和 GitHub API 原始字段名
            const releasePublishedAt = release.publishedAt || release.published_at || '';
            const existingPublishedAt = existingRelease ? (existingRelease.publishedAt || existingRelease.published_at || '') : '';
            if (!existingId || !existingRelease || new Date(releasePublishedAt).getTime() > new Date(existingPublishedAt).getTime()) {
                repoLatestReleaseId.set(repoId, release.id);
            }
        }

        logger.log('[ReleaseService] 本地已知版本映射', {
            映射条目数: repoLatestReleaseId.size,
            映射内容: Array.from(repoLatestReleaseId.entries()).map(([repoId, releaseId]) => {
                const release = storedReleases.find(r => r.repository.id === repoId && r.id === releaseId);
                return { repoId, releaseId, tagName: release?.tagName || release?.tag_name, repoName: release?.repository?.fullName };
            }),
        });

        // 并发控制：3 个/批
        const batchSize = 3;
        for (let i = 0; i < repoIds.length; i += batchSize) {
            const batch = repoIds.slice(i, i + batchSize);

            const results = await Promise.allSettled(
                batch.map(async (repoId) => {
                    const repo = repositories.find(r => r.id === repoId);
                    if (!repo) return null;

                    const [owner, repoName] = repo.fullName.split('/');
                    const release = await this.getLatestRelease(owner, repoName, token);

                    onProgress?.(i + batch.indexOf(repoId) + 1, repoIds.length, repo.fullName);

                    return { repoId, release, repoFullName: repo.fullName };
                })
            );

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    const { repoId, release, repoFullName } = result.value;
                    // 对比特定仓库的最新 Release ID，而不是所有仓库
                    const knownReleaseId = repoLatestReleaseId.get(repoId);

                    logger.log('[ReleaseService] 检查仓库', {
                        repoId,
                        repoFullName,
                        已知版本ID: knownReleaseId,
                        远程版本ID: release?.id,
                        远程tagName: release?.tagName || release?.tag_name,
                        是否新版本: release && release.id !== knownReleaseId,
                        原因: !release ? '无远程版本' : (knownReleaseId === undefined ? '本地无缓存' : (release.id !== knownReleaseId ? '版本ID不同' : '版本相同')),
                    });

                    if (release && release.id !== knownReleaseId) {
                        // 新版本（或本地没有该仓库的缓存）
                        updates.push({
                            ...release,
                            repository: {
                                id: repoId,
                                fullName: repoFullName,
                                name: repoFullName.split('/')[1],
                            },
                        });
                    }
                } else if (result.status === 'rejected') {
                    const batchIndex = results.indexOf(result);
                    errors.push({
                        repoId: batch[batchIndex],
                        error: result.reason?.message || 'Unknown error',
                    });
                }
            }
        }

        logger.log('[ReleaseService] checkSubscribedRepos 结果', {
            更新数: updates.length,
            错误数: errors.length,
            更新列表: updates.map(u => ({ repoId: u.repository.id, repoName: u.repository.fullName, releaseId: u.id, tagName: u.tagName || u.tag_name })),
        });

        return { updates, errors };
    },

    /**
     * 识别资产所属平台
     * 复用 v1.3.0 的 PLATFORM_OPTIONS
     */
    identifyPlatform(asset: ReleaseAsset): string {
        const name = asset.name.toLowerCase();

        for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
            for (const pattern of patterns) {
                if (pattern.test(name)) {
                    return platform;
                }
            }
        }

        return 'other';
    },

    /**
     * 获取平台图标
     */
    getPlatformIcon(platform: string): string {
        const found = PLATFORM_OPTIONS.find(p => p.id === platform);
        return found?.icon || '📦';
    },

    /**
     * 获取平台标签
     */
    getPlatformLabel(platform: string): string {
        const found = PLATFORM_OPTIONS.find(p => p.id === platform);
        return found?.label || platform;
    },

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    /**
     * 格式化发布时间
     */
    formatDate(dateString: string, lang: 'zh' | 'en' = 'zh'): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) {
            return lang === 'zh' ? '刚刚' : 'just now';
        } else if (diffMins < 60) {
            return lang === 'zh' ? `${diffMins} 分钟前` : `${diffMins} mins ago`;
        } else if (diffHours < 24) {
            return lang === 'zh' ? `${diffHours} 小时前` : `${diffHours} hours ago`;
        } else if (diffDays < 7) {
            return lang === 'zh' ? `${diffDays} 天前` : `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US');
        }
    },

    /**
     * 清理过期 Release 缓存并去重 (v1.6.0 增强)
     */
    cleanupCache(releases: Release[]): Release[] {
        const now = Date.now();

        // 1. 去重 (按 release.id 唯一保留最新记录)
        const uniqueReleasesMap = new Map<number, Release>();
        for (const r of releases) {
            uniqueReleasesMap.set(r.id, r);
        }

        // 2. 过滤过期，按时间排序，截断数量
        return Array.from(uniqueReleasesMap.values())
            .filter(r => now - new Date(r.publishedAt || r.published_at || '').getTime() < CACHE_CONFIG.maxCacheAge)
            .sort((a, b) => new Date(b.publishedAt || b.published_at || '').getTime() - new Date(a.publishedAt || a.published_at || '').getTime())
            .slice(0, CACHE_CONFIG.maxReleaseCount);
    },

    /**
     * 按平台过滤资产
     */
    filterAssetsByPlatform(assets: ReleaseAsset[], platform: string): ReleaseAsset[] {
        if (!platform || platform === 'all') {
            return assets;
        }
        return assets.filter(asset => this.identifyPlatform(asset) === platform);
    },

    /**
     * 获取资产按平台分组
     */
    groupAssetsByPlatform(assets: ReleaseAsset[]): Map<string, ReleaseAsset[]> {
        const groups = new Map<string, ReleaseAsset[]>();

        for (const asset of assets) {
            const platform = this.identifyPlatform(asset);
            if (!groups.has(platform)) {
                groups.set(platform, []);
            }
            groups.get(platform)!.push(asset);
        }

        return groups;
    },
};
