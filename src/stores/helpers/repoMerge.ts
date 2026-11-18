import type { Repository, Tag } from '../../types';
import { storageService } from '../../services/storageService';

export function mergeRepoWithExistingData(
    newRepo: Repository,
    existing: Repository | undefined,
    isSubscribed: boolean
): Repository {
    if (!existing) {
        return {
            ...newRepo,
            customTags: newRepo.customTags || [],
            isSubscribed,
        };
    }

    return {
        ...newRepo,
        aiSummary: existing.aiSummary,
        aiTags: existing.aiTags,
        aiPlatforms: existing.aiPlatforms,
        analyzedAt: existing.analyzedAt,
        analysisFailed: existing.analysisFailed,
        alias: existing.alias,
        customTags: existing.customTags || [],
        customDescription: existing.customDescription,
        isSubscribed,
    };
}

export function mergeFullSyncedRepositories(
    fetchedRepos: Repository[],
    existingRepos: Repository[],
    subscriptionIds: number[]
): Repository[] {
    const existingMap = new Map(existingRepos.map((repo) => [repo.id, repo]));
    const subSet = new Set(subscriptionIds);
    return fetchedRepos.map((repo) =>
        mergeRepoWithExistingData(repo, existingMap.get(repo.id), subSet.has(repo.id))
    );
}

export function mergeIncrementalRepositories(
    fetchedRepos: Repository[],
    existingRepos: Repository[],
    subscriptionIds: number[]
): Repository[] {
    const existingMap = new Map(existingRepos.map((repo) => [repo.id, repo]));
    const fetchedMap = new Map(fetchedRepos.map((repo) => [repo.id, repo]));
    const subSet = new Set(subscriptionIds);

    const newRepos = fetchedRepos
        .filter((repo) => !existingMap.has(repo.id))
        .map((repo) => mergeRepoWithExistingData(repo, undefined, subSet.has(repo.id)));

    const mergedExisting = existingRepos.map((repo) => {
        const updatedRepo = fetchedMap.get(repo.id);
        if (!updatedRepo) {
            return {
                ...repo,
                isSubscribed: subSet.has(repo.id),
            };
        }
        return mergeRepoWithExistingData(updatedRepo, repo, subSet.has(repo.id));
    });

    return [...newRepos, ...mergedExisting];
}

export function buildTagMap(tags: Tag[]): Map<string, Tag> {
    return new Map(tags.map((tag) => [tag.id, tag]));
}

export function buildNoteIndex(repositories: Repository[]): {
    noteRepoIds: Set<number>;
    noteContentByRepoId: Map<number, string>;
} {
    const validRepoIds = new Set(repositories.map((repo) => repo.id));
    const noteRepoIds = new Set<number>();
    const noteContentByRepoId = new Map<number, string>();

    for (const note of storageService.getAllNotes()) {
        if (!validRepoIds.has(note.repoId)) continue;
        noteRepoIds.add(note.repoId);
        noteContentByRepoId.set(note.repoId, note.content || '');
    }

    return { noteRepoIds, noteContentByRepoId };
}
