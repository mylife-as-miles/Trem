type BranchingEnv = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

export type CommitSummary = {
  id: string;
  parent: string | null;
  parents: string[];
  message: string;
  author: string;
  timestamp: string | number;
  branch: string;
  hashtags: string[];
  artifacts?: Record<string, unknown>;
  state?: Record<string, unknown>;
};

export type BranchSummary = {
  name: string;
  headCommitId: string | null;
  sourceBranch: string | null;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
};

type BranchRow = {
  name: string;
  head_commit_id: string | null;
  source_branch: string | null;
  created_at: number;
  updated_at: number;
};

type ArtifactRow = {
  job_id: string | null;
  name: string;
  storage_key: string;
  content_type: string | null;
  size: number | null;
};

const MAIN_BRANCH = 'main';
const COMMIT_ARTIFACT_PATTERN = /^commits\/(\d{4})\.json$/;

const optionalStatements = [
  "ALTER TABLE projects ADD COLUMN active_branch TEXT DEFAULT 'main'",
  "ALTER TABLE jobs ADD COLUMN branch_name TEXT DEFAULT 'main'",
  "ALTER TABLE event_logs ADD COLUMN branch_name TEXT DEFAULT 'main'",
  "ALTER TABLE artifacts ADD COLUMN branch_name TEXT DEFAULT 'main'",
] as const;

const normalizeBranchName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^-+|-+$/g, '')
    .replace(/^\/+|\/+$/g, '');

const isDuplicateColumnError = (message: string) =>
  /duplicate column name|already exists/i.test(message);

const toBranchStorageSegment = (branchName: string) => encodeURIComponent(branchName);

const parseCommitSequence = (name: string) => {
  const normalized = name.replace(/\\/g, '/');
  const match = normalized.match(COMMIT_ARTIFACT_PATTERN);
  return match ? Number(match[1]) : 0;
};

const sortCommitsDesc = (commits: CommitSummary[]) =>
  commits.slice().sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();

    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }

    return parseCommitSequence(b.id) - parseCommitSequence(a.id);
  });

const getCommitParents = (parsed: any) => {
  const explicitParents = Array.isArray(parsed?.parents)
    ? parsed.parents.map((parent: unknown) => String(parent)).filter(Boolean)
    : [];

  if (explicitParents.length > 0) {
    return explicitParents;
  }

  if (typeof parsed?.parent === 'string' && parsed.parent.trim()) {
    return [parsed.parent];
  }

  return [];
};

const buildCommitMap = (commits: CommitSummary[]) =>
  new Map(commits.map((commit) => [commit.id, commit]));

export const collectCommitIdsForHead = (
  commits: CommitSummary[],
  headCommitId: string | null,
) => {
  if (!headCommitId) return new Set<string>();

  const commitMap = buildCommitMap(commits);
  const visited = new Set<string>();
  const stack = [headCommitId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const commit = commitMap.get(currentId);
    if (!commit) {
      continue;
    }

    commit.parents.forEach((parentId) => {
      if (parentId && !visited.has(parentId)) {
        stack.push(parentId);
      }
    });
  }

  return visited;
};

const runOptionalStatement = async (env: BranchingEnv, statement: string) => {
  try {
    await env.DB.prepare(statement).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isDuplicateColumnError(message)) {
      throw error;
    }
  }
};

export const ensureBranchSchema = async (env: BranchingEnv) => {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      head_commit_id TEXT,
      source_branch TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(project_id, name)
    )
  `).run();

  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id, updated_at DESC)"
  ).run();

  for (const statement of optionalStatements) {
    await runOptionalStatement(env, statement);
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE projects SET active_branch = COALESCE(active_branch, 'main')"),
    env.DB.prepare("UPDATE jobs SET branch_name = COALESCE(branch_name, 'main')"),
    env.DB.prepare("UPDATE event_logs SET branch_name = COALESCE(branch_name, 'main')"),
    env.DB.prepare("UPDATE artifacts SET branch_name = COALESCE(branch_name, 'main')"),
  ]);
};

export const getProjectCommits = async (
  env: BranchingEnv,
  projectId: string,
): Promise<CommitSummary[]> => {
  await ensureBranchSchema(env);

  const { results } = await env.DB.prepare(
    "SELECT name, storage_key FROM artifacts WHERE project_id = ? AND name GLOB 'commits/[0-9][0-9][0-9][0-9].json' ORDER BY name DESC"
  ).bind(projectId).all<{ name: string; storage_key: string }>();

  const seen = new Set<string>();
  const commits = await Promise.all(
    results.map(async (artifact): Promise<CommitSummary | null> => {
      const object = await env.BUCKET.get(artifact.storage_key);
      if (!object) return null;

      try {
        const parsed = await object.json<any>();
        const fallbackId = artifact.name.split('/').pop()?.replace('.json', '') || artifact.name;
        const id = typeof parsed?.id === 'string' ? parsed.id : fallbackId;

        if (seen.has(id)) {
          return null;
        }
        seen.add(id);

        return {
          id,
          parent: typeof parsed?.parent === 'string' ? parsed.parent : null,
          parents: getCommitParents(parsed),
          message: typeof parsed?.message === 'string' ? parsed.message : 'feat: update repository analysis',
          author: typeof parsed?.author === 'string' ? parsed.author : 'Trem-AI',
          timestamp: parsed?.timestamp || Date.now(),
          branch: typeof parsed?.branch === 'string' ? parsed.branch : MAIN_BRANCH,
          hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.map((tag: unknown) => String(tag)) : [],
          artifacts: parsed?.artifacts ?? parsed?.state,
          state: parsed?.state,
        } satisfies CommitSummary;
      } catch {
        return null;
      }
    }),
  );

  return sortCommitsDesc(commits.filter((commit): commit is CommitSummary => commit !== null));
};

export const getNextCommitId = async (env: BranchingEnv, projectId: string) => {
  const commits = await getProjectCommits(env, projectId);
  const nextSequence = commits.length > 0
    ? Math.max(...commits.map((commit) => parseCommitSequence(commit.id))) + 1
    : 1;

  return String(nextSequence).padStart(4, '0');
};

export const getProjectActiveBranch = async (env: BranchingEnv, projectId: string) => {
  await ensureBranchSchema(env);

  const project = await env.DB.prepare(
    "SELECT active_branch FROM projects WHERE id = ?"
  ).bind(projectId).first<{ active_branch: string | null }>();

  const activeBranch = normalizeBranchName(project?.active_branch || MAIN_BRANCH) || MAIN_BRANCH;
  await env.DB.prepare(
    "UPDATE projects SET active_branch = ? WHERE id = ?"
  ).bind(activeBranch, projectId).run();

  return activeBranch;
};

export const getBranchHead = async (
  env: BranchingEnv,
  projectId: string,
  branchName: string,
) => {
  const row = await env.DB.prepare(
    "SELECT head_commit_id FROM branches WHERE project_id = ? AND name = ?"
  ).bind(projectId, branchName).first<{ head_commit_id: string | null }>();

  return row?.head_commit_id ?? null;
};

export const setProjectActiveBranch = async (
  env: BranchingEnv,
  projectId: string,
  branchName: string,
) => {
  await env.DB.prepare(
    "UPDATE projects SET active_branch = ?, updated_at = ? WHERE id = ?"
  ).bind(branchName, Math.floor(Date.now() / 1000), projectId).run();
};

export const updateBranchHead = async (
  env: BranchingEnv,
  projectId: string,
  branchName: string,
  headCommitId: string | null,
) => {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "UPDATE branches SET head_commit_id = ?, updated_at = ? WHERE project_id = ? AND name = ?"
  ).bind(headCommitId, now, projectId, branchName).run();
};

export const ensureProjectBranches = async (
  env: BranchingEnv,
  projectId: string,
) => {
  await ensureBranchSchema(env);

  const activeBranch = await getProjectActiveBranch(env, projectId);
  const commits = await getProjectCommits(env, projectId);
  const mainHead = commits.find((commit) => commit.branch === MAIN_BRANCH)?.id ?? commits[0]?.id ?? null;
  const activeHead = commits.find((commit) => commit.branch === activeBranch)?.id ?? mainHead;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO branches (id, project_id, name, head_commit_id, source_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    projectId,
    MAIN_BRANCH,
    mainHead,
    null,
    now,
    now,
  ).run();

  if (activeBranch !== MAIN_BRANCH) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, project_id, name, head_commit_id, source_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      projectId,
      activeBranch,
      activeHead,
      MAIN_BRANCH,
      now,
      now,
    ).run();
  }

  return activeBranch;
};

export const listProjectBranches = async (
  env: BranchingEnv,
  projectId: string,
) => {
  const activeBranch = await ensureProjectBranches(env, projectId);
  const { results } = await env.DB.prepare(
    "SELECT name, head_commit_id, source_branch, created_at, updated_at FROM branches WHERE project_id = ? ORDER BY CASE WHEN name = 'main' THEN 0 ELSE 1 END, updated_at DESC, name ASC"
  ).bind(projectId).all<BranchRow>();

  return results.map((branch) => ({
    name: branch.name,
    headCommitId: branch.head_commit_id ?? null,
    sourceBranch: branch.source_branch ?? null,
    createdAt: branch.created_at,
    updatedAt: branch.updated_at,
    isActive: branch.name === activeBranch,
  })) satisfies BranchSummary[];
};

export const getBranchHeads = async (
  env: BranchingEnv,
  projectId: string,
) => {
  const branches = await listProjectBranches(env, projectId);
  return Object.fromEntries(branches.map((branch) => [branch.name, branch.headCommitId]));
};

export const sanitizeBranchName = (value: string) => {
  const normalized = normalizeBranchName(value);
  if (!normalized) {
    throw new Error('Branch name is required');
  }
  return normalized;
};

export const buildBranchArtifactStorageKey = (
  projectId: string,
  branchName: string,
  artifactName: string,
) => `projects/${projectId}/branches/${toBranchStorageSegment(branchName)}/artifacts/${artifactName}`;

const listBranchArtifacts = async (
  env: BranchingEnv,
  projectId: string,
  branchName: string,
) => {
  const { results } = await env.DB.prepare(
    "SELECT job_id, name, storage_key, content_type, size FROM artifacts WHERE project_id = ? AND branch_name = ? AND name NOT GLOB 'commits/[0-9][0-9][0-9][0-9].json' ORDER BY name ASC"
  ).bind(projectId, branchName).all<ArtifactRow>();

  return results;
};

export const cloneBranchArtifacts = async (
  env: BranchingEnv,
  projectId: string,
  sourceBranch: string,
  targetBranch: string,
  options?: { overwrite?: boolean },
) => {
  if (sourceBranch === targetBranch) return;

  await ensureProjectBranches(env, projectId);
  const overwrite = options?.overwrite ?? false;

  if (overwrite) {
    await clearGeneratedArtifactsForBranch(env, projectId, targetBranch);
  }

  const sourceArtifacts = await listBranchArtifacts(env, projectId, sourceBranch);
  if (sourceArtifacts.length === 0) return;

  const existing = await env.DB.prepare(
    "SELECT name FROM artifacts WHERE project_id = ? AND branch_name = ?"
  ).bind(projectId, targetBranch).all<{ name: string }>();
  const existingNames = new Set(existing.results.map((artifact) => artifact.name));

  for (const artifact of sourceArtifacts) {
    if (!overwrite && existingNames.has(artifact.name)) {
      continue;
    }

    await env.DB.prepare(
      "INSERT INTO artifacts (id, project_id, job_id, branch_name, name, storage_key, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      projectId,
      artifact.job_id,
      targetBranch,
      artifact.name,
      artifact.storage_key,
      artifact.content_type || 'application/octet-stream',
      artifact.size,
    ).run();
  }
};

export const clearGeneratedArtifactsForBranch = async (
  env: BranchingEnv,
  projectId: string,
  branchName: string,
) => {
  await ensureProjectBranches(env, projectId);

  const encodedBranch = toBranchStorageSegment(branchName);
  const { results } = await env.DB.prepare(
    "SELECT storage_key FROM artifacts WHERE project_id = ? AND branch_name = ? AND name NOT GLOB 'commits/[0-9][0-9][0-9][0-9].json'"
  ).bind(projectId, branchName).all<{ storage_key: string }>();

  await Promise.all(
    results
      .map((artifact) => artifact.storage_key)
      .filter((storageKey) => storageKey.startsWith(`projects/${projectId}/branches/${encodedBranch}/`))
      .map((storageKey) => env.BUCKET.delete(storageKey)),
  );

  await env.DB.prepare(
    "DELETE FROM artifacts WHERE project_id = ? AND branch_name = ? AND name NOT GLOB 'commits/[0-9][0-9][0-9][0-9].json'"
  ).bind(projectId, branchName).run();
};

export const ensureBranchExists = async (
  env: BranchingEnv,
  projectId: string,
  branchName: string,
  sourceBranch = MAIN_BRANCH,
) => {
  const normalizedBranch = sanitizeBranchName(branchName);
  const normalizedSource = sanitizeBranchName(sourceBranch);
  await ensureProjectBranches(env, projectId);

  const existing = await env.DB.prepare(
    "SELECT name FROM branches WHERE project_id = ? AND name = ?"
  ).bind(projectId, normalizedBranch).first<{ name: string }>();

  if (existing?.name) {
    return normalizedBranch;
  }

  const sourceExists = await env.DB.prepare(
    "SELECT name, head_commit_id FROM branches WHERE project_id = ? AND name = ?"
  ).bind(projectId, normalizedSource).first<{ name: string; head_commit_id: string | null }>();

  if (!sourceExists?.name) {
    throw new Error(`Source branch "${normalizedSource}" does not exist`);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO branches (id, project_id, name, head_commit_id, source_branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    projectId,
    normalizedBranch,
    sourceExists.head_commit_id,
    normalizedSource,
    now,
    now,
  ).run();

  await cloneBranchArtifacts(env, projectId, normalizedSource, normalizedBranch);

  return normalizedBranch;
};

export const getCommitLineage = async (
  env: BranchingEnv,
  projectId: string,
  branchName: string,
) => {
  const normalizedBranch = await ensureBranchExists(env, projectId, branchName, MAIN_BRANCH);
  const nextCommitId = await getNextCommitId(env, projectId);
  const parentCommitId = await getBranchHead(env, projectId, normalizedBranch);

  return {
    branchName: normalizedBranch,
    nextCommitId,
    parentCommitId,
  };
};

export const filterCommitsForBranch = (
  commits: CommitSummary[],
  headCommitId: string | null,
) => {
  const visibleIds = collectCommitIdsForHead(commits, headCommitId);
  return sortCommitsDesc(commits.filter((commit) => visibleIds.has(commit.id)));
};

export const createMergeCommitRecord = ({
  commitId,
  targetBranch,
  targetHead,
  sourceHead,
  message,
}: {
  commitId: string;
  targetBranch: string;
  targetHead: string | null;
  sourceHead: string | null;
  message: string;
}) => {
  const parents = [targetHead, sourceHead].filter((value): value is string => Boolean(value));

  return {
    id: commitId,
    parent: targetHead,
    parents,
    branch: targetBranch,
    timestamp: new Date().toISOString(),
    author: 'Trem-AI',
    message,
    hashtags: ['#branch', '#merge', '#trem'],
    state: {
      repo: 'repo.json',
      timeline: 'timeline/base.otio.json',
      scenes: 'scenes/scenes.json',
      captions: 'captions/captions.srt',
      metadata: ['metadata/video.md', 'metadata/scenes.md'],
      dag: 'dag/ingest.json',
    },
  };
};
