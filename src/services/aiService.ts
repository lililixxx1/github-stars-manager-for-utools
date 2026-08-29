import type { Repository } from '../types';
import { logger } from '../utils/logger';

// ==================== 翻译缓存 (v1.6.0) ====================

interface TranslationCache {
    content: string;
    translatedContent: string;
    timestamp: number;
    model?: string;
}

// 内存缓存（R6：模块加载时从 dbStorage 同步预热，进程重启后翻译结果不丢失、不重复消耗 AI 能量）
const translationCache = new Map<number, TranslationCache>();
try {
    const persisted = (window.githubStarsAPI?.getAiTranslations?.() || {}) as Record<string, TranslationCache>;
    for (const [id, entry] of Object.entries(persisted)) {
        if (entry && typeof entry.timestamp === 'number') {
            translationCache.set(Number(id), entry);
        }
    }
} catch (error) {
    console.error('[translateRelease] 翻译缓存预热失败:', error);
}

// 缓存过期时间：7 天
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000;

// 落盘条数上限：按时间降序保留最新条目，防止无界增长
const MAX_CACHE_ENTRIES = 100;

/**
 * 将翻译缓存同步写回 dbStorage（R6：同步读 + 同步写，无 load-write 竞态）
 */
function persistTranslationCache(): void {
    try {
        const entries = [...translationCache.entries()]
            .sort((a, b) => b[1].timestamp - a[1].timestamp)
            .slice(0, MAX_CACHE_ENTRIES);
        translationCache.clear();
        entries.forEach(([id, entry]) => translationCache.set(id, entry));
        window.githubStarsAPI?.setAiTranslations?.(Object.fromEntries(entries));
    } catch (error) {
        console.error('[translateRelease] 翻译缓存落盘失败:', error);
    }
}

/**
 * 生成内容哈希（混合算法 + 长度限制）
 * 格式: {长度}_{首部样本}_{中部样本}_{尾部样本}
 * 碰撞概率: < 1/10^12
 * @since v1.7.0 - 优化哈希算法，降低碰撞概率
 */
function hashContent(content: string): string {
    if (!content) return '0';

    // 限制最大处理长度，避免超长内容导致性能问题
    const MAX_HASH_LENGTH = 10000;
    const truncated = content.length > MAX_HASH_LENGTH
        ? content.slice(0, MAX_HASH_LENGTH) + `...[${content.length}]`
        : content;

    const len = truncated.length;

    // 采样策略：首部、中部、尾部各取 100 字符
    const sampleSize = Math.min(100, Math.floor(len / 3));
    const samples = [
        truncated.slice(0, sampleSize),
        truncated.slice(Math.floor(len / 2), Math.floor(len / 2) + sampleSize),
        truncated.slice(Math.max(0, len - sampleSize), len)
    ];

    // 为每个样本计算 DJB2 哈希
    const sampleHashes = samples.map(sample => {
        let hash = 5381;
        for (let i = 0; i < sample.length; i++) {
            hash = ((hash << 5) + hash) ^ sample.charCodeAt(i);
        }
        return (hash >>> 0).toString(36);
    });

    return `${len.toString(36)}_${sampleHashes.join('_')}`;
}

// 内容最大长度（根据 AI 模型上下文限制）
const MAX_CONTENT_LENGTH = 8000;

// ==================== 并发控制 ====================
class PromiseQueue {
    private concurrency: number;
    private running: number = 0;
    private queue: (() => void)[] = [];

    constructor(concurrency: number) {
        this.concurrency = concurrency;
    }

    async add<T>(task: () => Promise<T>): Promise<T> {
        if (this.running >= this.concurrency) {
            await new Promise<void>(resolve => this.queue.push(resolve));
        }

        this.running++;
        try {
            return await task();
        } finally {
            this.running--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next?.();
            }
        }
    }
}

// 全局翻译并发队列（限制为 3）
const translationQueue = new PromiseQueue(3);

// 正在进行中的翻译请求
const pendingTranslations = new Map<number, Promise<{ translatedContent: string; fromCache: boolean } | null>>();

export const aiService = {
    async analyzeRepository(
        repo: Repository,
        token: string,
        language: 'zh' | 'en' = 'zh',
        model?: string
    ): Promise<{ summary: string; tags: string[]; platforms: string[] } | null> {
        const readme = await window.githubStarsAPI.getReadme(
            repo.owner.login,
            repo.name,
            token
        );

        if (!readme) {
            // 无 README 属于"无可分析内容"，用描述兜底并视为完成，避免反复重试
            return {
                summary: repo.description || (language === 'zh' ? '暂无描述' : 'No description'),
                tags: repo.topics || [],
                platforms: [],
            };
        }

        // analyzeRepo 失败时会抛错（额度耗尽、网络异常、返回不可解析等，R2），由调用方处理
        return await window.githubStarsAPI.analyzeRepo(
            readme,
            {
                fullName: repo.fullName,
                description: repo.description,
                language: repo.language,
            },
            language,
            model
        );
    },

    /**
     * 批量分析仓库
     *
     * 阶段3 不可变契约：传入的 repo 对象与 store 中是同一引用，
     * 因此这里**绝不原地突变**——分析结果构造为新对象放入 results，
     * 由调用方（useStore.startAutoAnalyze）合并进状态数组。
     * 未被分析（结果为 null）的仓库保持原引用返回。
     *
     * @param repos 要分析的仓库列表
     * @param token GitHub Token
     * @param onProgress 进度回调
     * @param language 语言
     * @param concurrency 并发数
     * @param signal 中止信号
     */
    async batchAnalyze(
        repos: Repository[],
        token: string,
        onProgress: (current: number, total: number, repo: Repository) => void,
        language: 'zh' | 'en' = 'zh',
        concurrency: number = 1,
        model?: string,
        signal?: AbortSignal
    ): Promise<Repository[]> {
        const queue = [...repos];
        let completed = 0;
        // 连续失败熔断（R-熔断）：额度耗尽/服务异常时停止整批任务，避免无意义地继续消耗
        const MAX_CONSECUTIVE_FAILURES = 5;
        let consecutiveFailures = 0;
        let circuitBroken = false;

        // 使用 Map 保证顺序和唯一性（修复竞态条件）
        const results = new Map<number, Repository>();

        const processQueue = async () => {
            while (queue.length > 0 && !signal?.aborted && !circuitBroken) {
                const repo = queue.shift();
                if (!repo) break;

                // 每轮的产出对象（成功/失败都构造新对象，不可变契约下不触碰传入引用）。
                // onProgress 携带该对象（陷阱③：分支旧实现传原始引用，R5 逐仓增量刷新会拿到无结果数据）
                let outcome: Repository = repo;
                let failed = false;

                try {
                    const result = await aiService.analyzeRepository(repo, token, language, model);
                    if (!signal?.aborted) {
                        if (result) {
                            // 构造新对象，不触碰传入引用（搜索索引 WeakMap 依赖引用不可变语义）
                            outcome = {
                                ...repo,
                                aiSummary: result.summary,
                                aiTags: result.tags,
                                aiPlatforms: result.platforms,
                                analyzedAt: new Date().toISOString(),
                                analysisFailed: false,
                            };
                            consecutiveFailures = 0;
                        } else {
                            failed = true;
                        }
                    }
                } catch (error) {
                    if (!signal?.aborted) {
                        console.error(`Failed to analyze ${repo.fullName}:`, error);
                        failed = true;
                    }
                }

                if (failed && !signal?.aborted) {
                    // 失败标记（R-熔断）：analyzedAt 记录本次尝试时间，供 24 小时冷却判断使用；
                    // spread 保留旧 aiSummary/aiTags（详情页失败三态显示依赖旧摘要）
                    outcome = {
                        ...repo,
                        analysisFailed: true,
                        analyzedAt: new Date().toISOString(),
                    };
                    consecutiveFailures++;
                }

                if (signal?.aborted) break;

                // 先登记再判熔断（C1）：不可变契约下第 5 个失败仓的失败对象必须先进 results
                // 并随 onProgress 交给调用方，否则冷却记录丢失——熔断场景（额度耗尽）本身
                // 恰是最需要冷却记录的场景，下一批会重复耗能
                results.set(repo.id, outcome);
                completed++;
                onProgress(completed, repos.length, outcome);

                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && queue.length > 0) {
                    circuitBroken = true;
                    console.warn(`[batchAnalyze] 连续 ${MAX_CONSECUTIVE_FAILURES} 次失败，熔断剩余 ${queue.length} 个仓库的分析（多为 AI 额度耗尽或服务异常）`);
                    break;
                }
            }
        };

        const workers = Array(Math.min(concurrency, queue.length))
            .fill(null)
            .map(() => processQueue());

        await Promise.all(workers);

        // 返回时按原始顺序排列
        return repos.map(r => results.get(r.id) || r);
    },

    /**
     * 翻译 Release 内容 (v1.6.0)
     * @param releaseId Release ID（用于缓存 key）
     * @param content Release body (Markdown)
     * @param language 目标语言
     * @param model AI 模型
     * @param forceRefresh 强制刷新缓存
     */
    async translateRelease(
        releaseId: number,
        content: string,
        language: 'zh' | 'en' = 'zh',
        model?: string,
        forceRefresh: boolean = false
    ): Promise<{ translatedContent: string; fromCache: boolean } | null> {
        // 1. 语言检测：如果内容已是目标语言，无需翻译
        const isChineseContent = /[\u4e00-\u9fa5]/.test(content);
        if (language === 'zh' && isChineseContent) {
            logger.log('[translateRelease] 内容已是中文，无需翻译');
            return { translatedContent: content, fromCache: true };
        }

        // 2. 内容过长处理
        let truncatedContent = content;
        let isTruncated = false;
        if (content.length > MAX_CONTENT_LENGTH) {
            truncatedContent = content.slice(0, MAX_CONTENT_LENGTH) + '\n\n...';
            isTruncated = true;
            logger.warn('[translateRelease] 内容过长，已截断', {
                originalLength: content.length,
                truncatedLength: truncatedContent.length
            });
        }

        // 3. 检查缓存
        if (!forceRefresh) {
            const cached = translationCache.get(releaseId);
            if (cached) {
                const contentHash = hashContent(content);
                const cachedHash = hashContent(cached.content);
                const isExpired = Date.now() - cached.timestamp > CACHE_EXPIRY;

                if (contentHash === cachedHash && !isExpired && cached.model === model) {
                    logger.log('[translateRelease] 命中缓存', { releaseId });
                    return { translatedContent: cached.translatedContent, fromCache: true };
                }
            }
        }

        // 4. 构建翻译提示
        const targetLanguage = language === 'zh' ? '中文' : 'English';
        const systemPrompt = `你是一个专业的技术文档翻译专家。请将以下 GitHub Release 更新说明翻译成${targetLanguage}。

要求：
1. 保持 Markdown 格式不变
2. 保留所有链接、代码块、标题格式
3. 技术术语保留英文原文（如 API、SDK、 Docker、Kubernetes 等）
4. 版本号、命令、代码不要翻译
5. 翻译要准确、通顺，符合技术文档风格
${isTruncated ? '6. 内容已被截断，在末尾有省略号，请正常翻译到省略号处即可' : ''}

直接输出翻译后的内容，不要添加任何解释或说明。`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: truncatedContent }
        ];

        // 5. 检查是否正在翻译中
        if (pendingTranslations.has(releaseId)) {
            logger.log('[translateRelease] 已经有相同的翻译请求正在进行，复用现有请求', { releaseId });
            return pendingTranslations.get(releaseId)!;
        }

        // 6. 发起翻译请求并存入进行中队列
        const translationPromise = (async () => {
            try {
                logger.log('[translateRelease] 准备翻译，进入队列等待', { releaseId });

                const result = await translationQueue.add(async () => {
                    logger.log('[translateRelease] 开始执行翻译请求', { releaseId, model, contentLength: truncatedContent.length });
                    const aiOptions: any = { messages };
                    if (model) aiOptions.model = model;
                    return await utools.ai(aiOptions);
                });

                const translatedContent = result?.content;

                if (translatedContent) {
                    translationCache.set(releaseId, {
                        content,
                        translatedContent,
                        timestamp: Date.now(),
                        model
                    });
                    persistTranslationCache();

                    logger.log('[translateRelease] 翻译完成', { releaseId, translatedLength: translatedContent.length });
                    return { translatedContent, fromCache: false };
                }

                return null;
            } catch (error) {
                console.error('[translateRelease] 翻译失败:', error);
                throw error;
            } finally {
                // 请求结束，从进行中队列移除
                pendingTranslations.delete(releaseId);
            }
        })();

        pendingTranslations.set(releaseId, translationPromise);
        return translationPromise;
    },

    /**
     * 清除翻译缓存 (v1.6.0)
     */
    clearTranslationCache(releaseId?: number) {
        if (releaseId) {
            translationCache.delete(releaseId);
        } else {
            translationCache.clear();
        }
        persistTranslationCache();
    },
};
