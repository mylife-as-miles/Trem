// ============================================================
// Shared TypeScript Contracts for Trem-AI
// Used by both Cloudflare Worker backend and frontend client
// ============================================================

// ---- Status Enums ----

export const ProjectStatus = {
  CREATED: 'created',
  UPLOADING: 'uploading',
  INGESTING: 'ingesting',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const AssetStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  TRANSCRIBING: 'transcribing',
  ANALYZING: 'analyzing',
  READY: 'ready',
  ERROR: 'error',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const AssetType = {
  VIDEO: 'video',
  AUDIO: 'audio',
  IMAGE: 'image',
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const JobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  TRANSCRIBING: 'transcribing',
  ANALYZING: 'analyzing',
  SYNTHESIZING: 'synthesizing',
  GENERATING_ARTIFACTS: 'generating_artifacts',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const EventLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
export type EventLevel = (typeof EventLevel)[keyof typeof EventLevel];

// ---- Entity Types ----

export interface Project {
  id: string;
  name: string;
  brief: string;
  status: ProjectStatus;
  created_at: number;
  updated_at: number;
}

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  storage_key: string | null;
  size: number | null;
  duration: number | null;
  metadata: AssetMetadata | null;
  created_at: number;
}

export interface AssetMetadata {
  description?: string;
  tags?: string[];
  transcript?: string;
  srt?: string;
  mimeType?: string;
  error?: string;
  [key: string]: unknown;
}

export interface Job {
  id: string;
  project_id: string;
  workflow_id: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
  created_at: number;
  completed_at: number | null;
}

export interface EventLog {
  id: string;
  project_id: string;
  job_id: string | null;
  message: string;
  level: EventLevel;
  created_at: number;
}

export interface Artifact {
  id: string;
  project_id: string;
  job_id: string | null;
  name: string;
  storage_key: string;
  content_type: string;
  size: number | null;
  created_at: number;
}

// ---- API Request Types ----

export interface CreateProjectRequest {
  name: string;
  brief?: string;
}

export interface RegisterAssetRequest {
  name: string;
  type: AssetType;
  size?: number;
}

export interface RegisterAssetResponse {
  asset: Asset;
  uploadUrl: string;
}

export interface StartIngestionResponse {
  jobId: string;
  workflowId: string;
}

// ---- API Response Types ----

export interface ProjectDetailResponse {
  project: Project;
  assets: Asset[];
  activeJob: Job | null;
  logs: EventLog[];
  artifacts: Artifact[];
  liveProgress: number | null;
}

export interface ProjectListItem {
  id: string;
  name: string;
  status: ProjectStatus;
  asset_count: number;
  created_at: number;
}

// ---- WebSocket Message Types ----

export const WSMessageType = {
  PROGRESS: 'progress',
  JOB_COMPLETED: 'job_completed',
  JOB_FAILED: 'job_failed',
  ASSET_UPDATE: 'asset_update',
  LOG: 'log',
} as const;
export type WSMessageType = (typeof WSMessageType)[keyof typeof WSMessageType];

export interface WSProgressMessage {
  type: typeof WSMessageType.PROGRESS;
  progress: number;
  message?: string;
  jobStatus?: JobStatus;
}

export interface WSJobCompletedMessage {
  type: typeof WSMessageType.JOB_COMPLETED;
}

export interface WSJobFailedMessage {
  type: typeof WSMessageType.JOB_FAILED;
  error: string;
}

export interface WSAssetUpdateMessage {
  type: typeof WSMessageType.ASSET_UPDATE;
  assetId: string;
  status: AssetStatus;
  progress?: number;
}

export interface WSLogMessage {
  type: typeof WSMessageType.LOG;
  message: string;
  level: EventLevel;
}

export type WSMessage =
  | WSProgressMessage
  | WSJobCompletedMessage
  | WSJobFailedMessage
  | WSAssetUpdateMessage
  | WSLogMessage;

// ---- Error Codes ----

export const ErrorCode = {
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
  NO_ASSETS_TO_INGEST: 'NO_ASSETS_TO_INGEST',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  WORKFLOW_START_FAILED: 'WORKFLOW_START_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  error: string;
  code: ErrorCode;
}

// ---- Artifact Names (canonical) ----

export const ArtifactName = {
  REPO_JSON: 'repo.json',
  SCENES_JSON: 'scenes.json',
  TIMELINE_JSON: 'main.otio.json',
  GRAPH_JSON: 'graph.json',
} as const;
export type ArtifactName = (typeof ArtifactName)[keyof typeof ArtifactName];

// ---- R2 Key Helpers ----

export const r2Keys = {
  assetKey: (projectId: string, assetId: string, filename: string) =>
    `projects/${projectId}/assets/${assetId}-${filename}`,
  artifactKey: (projectId: string, name: string) =>
    `projects/${projectId}/artifacts/${name}`,
  transcriptKey: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/transcripts/${assetId}.${ext}`,
};
