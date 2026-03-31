import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, RepoData, AssetData } from '../utils/db'; // Adjust path if needed
import { apiClient } from '../api-client';

// Keys
export const queryKeys = {
    repos: ['repos'] as const,
    repo: (id: number) => ['repos', id] as const,
    assets: (repoId: number) => ['repos', repoId, 'assets'] as const,
    cfProjects: ['cfProjects'] as const,
    cfProjectPayload: (id: string) => ['cfProjectPayload', id] as const,
};

// --- Repositories (Legacy SQLite/IndexedDB) ---

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

// ==========================================
// Cloudflare Backend API Hooks
// ==========================================

export const useProjects = () => {
    return useQuery({
        queryKey: queryKeys.cfProjects,
        queryFn: async () => {
            return await apiClient.getProjects();
        },
    });
};

export const useProjectPayload = (id: string | undefined) => {
    return useQuery({
        queryKey: queryKeys.cfProjectPayload(id!),
        queryFn: async () => {
            if (!id) return null;
            return await apiClient.getProjectPayload(id);
        },
        enabled: !!id,
        refetchInterval: (data: any) => {
            // Refetch every 2s if there's an active job running
            if (data?.activeJob && ['queued', 'running', 'transcribing', 'analyzing', 'synthesizing', 'generating_artifacts'].includes(data.activeJob.status)) {
                return 2000;
            }
            return false;
        }
    });
};

export const useCreateCFProject = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ name, brief }: { name: string; brief?: string }) => {
            return await apiClient.createProject(name, brief);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.cfProjects });
        },
    });
};

export const useStartIngestion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (projectId: string) => {
            return await apiClient.startIngestion(projectId);
        },
        onSuccess: (_, projectId) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.cfProjectPayload(projectId) });
        },
    });
};
