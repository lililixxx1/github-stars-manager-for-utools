/**
 * 备份导出/导入校验工具（F3）
 * @module utils/backup
 *
 * 导出 schema（schemaVersion 2，加法式演进）：
 * 刻意不含 syncState——导入流程显式清除本机 syncState（preload.clearSyncState），
 * 下次同步必然全量重建，杜绝导入数据与旧增量状态错配。
 */

import { useStore } from '../stores/useStore';
import type { Category, Repository, RepositoryNote, Settings, Tag } from '../types';

/** 导出文件格式 */
export interface BackupData {
    schemaVersion: 2;
    exportedAt: string;
    repositories: Repository[];
    settings: Partial<Settings>;
    tags: Tag[];
    notes: RepositoryNote[];
    releaseSubscriptions: number[];
    readReleaseIds: number[];
    categories: Category[];
}

/**
 * 校验通过后的规整数据。除 schemaVersion/exportedAt 外字段均可选：
 * 字段缺失（旧格式备份）即跳过该类，天然向后兼容。
 */
export interface ValidatedBackup {
    repositories?: Repository[];
    settings?: Partial<Settings>;
    tags?: Tag[];
    notes?: RepositoryNote[];
    releaseSubscriptions?: number[];
    readReleaseIds?: number[];
    categories?: Category[];
}

export interface ValidateBackupError {
    ok: false;
    /** 稳定错误码，由调用方映射为用户语言文案 */
    error: 'invalid_file' | 'repositories_invalid' | 'tags_invalid' | 'notes_invalid'
    | 'release_subscriptions_invalid' | 'read_release_ids_invalid' | 'categories_invalid';
}

export interface ValidateBackupOk {
    ok: true;
    data: ValidatedBackup;
    skipped: { repos: number; tags: number; notes: number };
}

export type ValidateBackupResult = ValidateBackupOk | ValidateBackupError;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 单条仓库规整：关键字段硬校验（缺任一 → null 跳过），软字段规整。
 * 软规整 stargazersCount/forksCount 非 number → 0：DetailPage/HomePage 存在
 * 直接 .toLocaleString() 调用，非 number 会在 render 抛 TypeError 导致整树卸载。
 */
function normalizeRepository(item: unknown): Repository | null {
    if (!isPlainObject(item)) return null;
    const r = item;

    if (typeof r.id !== 'number') return null;
    if (typeof r.name !== 'string' || typeof r.fullName !== 'string') return null;
    if (!isPlainObject(r.owner) || typeof r.owner.login !== 'string') return null;
    if (typeof r.htmlUrl !== 'string') return null;

    return {
        ...(r as unknown as Repository),
        owner: {
            login: r.owner.login,
            avatarUrl: typeof r.owner.avatarUrl === 'string' ? r.owner.avatarUrl : '',
        },
        customTags: Array.isArray(r.customTags) ? r.customTags : [],
        topics: Array.isArray(r.topics) ? r.topics : [],
        stargazersCount: typeof r.stargazersCount === 'number' ? r.stargazersCount : 0,
        forksCount: typeof r.forksCount === 'number' ? r.forksCount : 0,
    };
}

/**
 * 构建完整备份（七类数据）。
 * repositories 取 store 内存态：R8 批量分析落盘有 20s 节流窗口，
 * 直接读存储可能丢失最近的分析结果；其余六类无内存态，从 preload 层读取。
 */
export function buildBackup(): BackupData {
    const { repositories, settings } = useStore.getState();
    const api = window.githubStarsAPI;

    return {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        repositories,
        settings,
        tags: api.getTags(),
        notes: api.getAllNotes(),
        releaseSubscriptions: api.getReleaseSubscriptions(),
        readReleaseIds: api.getReadReleaseIds(),
        categories: api.getCategories(),
    };
}

/**
 * 校验并规整导入数据：宽松规整 + 关键字段硬校验，单条无效跳过并计数，不整批拒绝。
 * 字段级类型错误（如 repositories 非数组）属文件损坏，整批拒绝。
 */
export function validateBackup(raw: unknown): ValidateBackupResult {
    if (!isPlainObject(raw)) {
        return { ok: false, error: 'invalid_file' };
    }

    const data: ValidatedBackup = {};
    const skipped = { repos: 0, tags: 0, notes: 0 };

    if (raw.repositories !== undefined) {
        if (!Array.isArray(raw.repositories)) return { ok: false, error: 'repositories_invalid' };
        const repositories: Repository[] = [];
        for (const item of raw.repositories) {
            const repo = normalizeRepository(item);
            if (repo) repositories.push(repo);
            else skipped.repos++;
        }
        data.repositories = repositories;
    }

    if (raw.tags !== undefined) {
        if (!Array.isArray(raw.tags)) return { ok: false, error: 'tags_invalid' };
        const tags: Tag[] = [];
        let fallbackOrder = 0;
        for (const item of raw.tags) {
            if (!isPlainObject(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
                skipped.tags++;
                continue;
            }
            tags.push({
                id: item.id,
                name: item.name,
                color: typeof item.color === 'string' ? item.color : undefined,
                icon: typeof item.icon === 'string' ? item.icon : undefined,
                order: typeof item.order === 'number' ? item.order : fallbackOrder++,
                createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
                updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
            });
        }
        data.tags = tags;
    }

    // 有效仓库 ID 集合：孤儿笔记与不存在仓库的订阅一并丢弃
    const validRepoIds = new Set((data.repositories ?? []).map(r => r.id));

    if (raw.notes !== undefined) {
        if (!Array.isArray(raw.notes)) return { ok: false, error: 'notes_invalid' };
        const notes: RepositoryNote[] = [];
        for (const item of raw.notes) {
            if (!isPlainObject(item)
                || typeof item.repoId !== 'number'
                || typeof item.content !== 'string'
                || !validRepoIds.has(item.repoId)) {
                skipped.notes++;
                continue;
            }
            notes.push({
                id: typeof item.id === 'string' ? item.id : `note-${item.repoId}`,
                repoId: item.repoId,
                content: item.content,
                createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
                updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
            });
        }
        data.notes = notes;
    }

    if (raw.releaseSubscriptions !== undefined) {
        if (!Array.isArray(raw.releaseSubscriptions)) return { ok: false, error: 'release_subscriptions_invalid' };
        data.releaseSubscriptions = raw.releaseSubscriptions
            .filter((id): id is number => typeof id === 'number')
            .filter(id => validRepoIds.has(id));
    }

    if (raw.readReleaseIds !== undefined) {
        if (!Array.isArray(raw.readReleaseIds)) return { ok: false, error: 'read_release_ids_invalid' };
        data.readReleaseIds = raw.readReleaseIds
            .filter((id): id is number => typeof id === 'number');
    }

    if (raw.categories !== undefined) {
        if (!Array.isArray(raw.categories)) return { ok: false, error: 'categories_invalid' };
        data.categories = raw.categories.filter(
            (item): item is Category => isPlainObject(item)
                && typeof item.id === 'string'
                && typeof item.name === 'string'
        );
    }

    if (isPlainObject(raw.settings)) {
        data.settings = raw.settings as Partial<Settings>;
    }

    return { ok: true, data, skipped };
}
