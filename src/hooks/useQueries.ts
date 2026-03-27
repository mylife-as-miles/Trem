import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, RepoData, AssetData } from '../utils/db'; // Adjust path if needed

// Keys
export const queryKeys = {
    repos: ['repos'] as const,
    repo: (id: number) => ['repos', id] as const,
    assets: (repoId: number) => ['repos', repoId, 'assets'] as const,
};

// --- Repositories ---

export const useRepos = () => {
    return useQuery({
        queryKey: queryKeys.repos,
        queryFn: async () => {
            return await db.getAllRepos();
        },
    });
};

export const useRepo = (id: number | undefined) => {
    return useQuery({
        queryKey: queryKeys.repo(id!),
        queryFn: async () => {
            if (!id) return null;
            return await db.getRepo(id);
        },
        enabled: !!id,
    });
};

export const useCreateRepo = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (repo: Omit<RepoData, 'id' | 'created'>) => {
            return await db.addRepo({ ...repo, created: Date.now() });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.repos });
        },
    });
};

export const useUpdateRepo = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, updates }: { id: number; updates: Partial<RepoData> }) => {
            return await db.updateRepo(id, updates);
        },
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.repo(id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.repos });
        },
    });
};

// --- Assets ---

// TODO: implementing asset hooks as needed
