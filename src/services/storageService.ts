import type { Repository, Settings, Release, SyncState } from '../types';

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

    // ==================== Repositories (分片存储) ====================
    getRepositories(): Repository[] {
        return window.githubStarsAPI.getRepos() || [];
    },

    setRepositories(repos: Repository[]): void {
        window.githubStarsAPI.setRepos(repos);
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
};
