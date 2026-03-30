// Shared TypeScript Contracts for Trem-AI Migration

export type ProjectStatus = 'idle' | 'ingesting' | 'ready_to_commit' | 'completed' | 'failed';
export type AssetType = 'video' | 'audio' | 'image';
export type AssetStatus = 'pending' | 'uploading' | 'uploaded' | 'processing' | 'ready' | 'error';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Project {
  id: string;
  name: string;
  brief: string;
  status: ProjectStatus;
  createdAt: number;
}

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  storageKey?: string;
  duration?: number;
  metadata?: {
    tags?: string[];
    description?: string;
    srt?: string;
    [key: string]: any;
  };
  createdAt: number;
}

export interface Job {
  id: string;
  projectId: string;
  workflowId?: string;
  status: JobStatus;
  progress: number;
  createdAt: number;
  completedAt?: number;
}

export interface EventLog {
  id: string;
  projectId: string;
  message: string;
  level: 'info' | 'warn' | 'error';
  createdAt: number;
}

// API Payloads
export interface CreateProjectRequest {
  name: string;
  brief: string;
}

export interface CreateAssetRequest {
  projectId: string;
  name: string;
  type: AssetType;
}

export interface CreateAssetResponse {
  asset: Asset;
  uploadUrl: string; // Presigned URL
}

export interface StartIngestionRequest {
  projectId: string;
}

export interface StartIngestionResponse {
  jobId: string;
  workflowId: string;
}

export interface ProjectStatusResponse {
  project: Project;
  assets: Asset[];
  activeJob?: Job;
  logs: EventLog[];
  liveProgress?: number; // Fetched from Durable Object
}
