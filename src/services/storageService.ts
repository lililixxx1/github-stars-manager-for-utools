import type { Repository, Settings, Release, SyncState, Tag, RepositoryNote } from '../types';

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

    // ==================== Sync State ====================
    getSyncState(): SyncState | null {
        return window.githubStarsAPI.getSyncState();
    },

    setSyncState(state: SyncState): void {
        window.githubStarsAPI.setSyncState(state);
    },

    // ==================== Repositories (v2 分片存储 + 增量写) ====================
    getRepositories(): Repository[] {
        return window.githubStarsAPI.getRepos() || [];
    },

    /** 全量写入（仅同步/导入等整体替换场景使用） */
    setRepositories(repos: Repository[]): void {
        window.githubStarsAPI.setRepos(repos);
    },

    /** 单仓库增量写：只重写目标仓库所在分片 */
    patchRepo(id: number, patch: Partial<Repository>): void {
        window.githubStarsAPI.patchRepo(id, patch);
    },

    /** 批量增量写：按分片索引只重写受影响分片 */
    patchReposBatch(updates: Array<{ id: number; patch: Partial<Repository> }>): void {
        window.githubStarsAPI.patchReposBatch(updates);
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

    // ==================== Tags 🆕 v1.1.0 ====================
    getTags(): Tag[] {
        return window.githubStarsAPI.getTags();
    },

    setTags(tags: Tag[]): void {
        window.githubStarsAPI.setTags(tags);
    },

    addTag(tag: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>): Tag {
        return window.githubStarsAPI.addTag(tag);
    },

    updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): Tag | null {
        return window.githubStarsAPI.updateTag(id, updates);
    },

    /** v2 preload 侧为 async（单次读缓存 + 一次写入，原子化） */
    deleteTag(id: string): Promise<void> {
        return window.githubStarsAPI.deleteTag(id);
    },

    reorderTags(tagIds: string[]): void {
        window.githubStarsAPI.reorderTags(tagIds);
    },

    // ==================== Notes 🆕 v1.1.0（v2 走 gh:noteIndex 索引） ====================
    getNote(repoId: number): RepositoryNote | null {
        return window.githubStarsAPI.getNote(repoId);
    },

    setNote(repoId: number, content: string): RepositoryNote {
        return window.githubStarsAPI.setNote(repoId, content);
    },

    deleteNote(repoId: number): void {
        window.githubStarsAPI.deleteNote(repoId);
    },

    getAllNotes(): RepositoryNote[] {
        return window.githubStarsAPI.getAllNotes();
    },
};
