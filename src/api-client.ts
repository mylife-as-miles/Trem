// Frontend API Client for Cloudflare Worker Backend

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8787';

const withBranchQuery = (url: string, branchName?: string | null) => {
  if (!branchName) return url;
  const nextUrl = new URL(url);
  nextUrl.searchParams.set('branch', branchName);
  return nextUrl.toString();
};

export const apiClient = {
  async getProjects() {
    const res = await fetch(`${API_BASE}/api/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async getProject(id: string, branchName?: string | null) {
    const res = await fetch(withBranchQuery(`${API_BASE}/api/projects/${id}`, branchName));
    if (!res.ok) throw new Error('Failed to fetch project');
    return res.json();
  },

  async deleteProject(id: string) {
    const res = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete project');
    return res.json();
  },

  async updateProject(id: string, updates: { name?: string; brief?: string }) {
    const res = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update project');
    return res.json();
  },

  async getProjectPayload(id: string, branchName?: string | null) {
    const res = await fetch(withBranchQuery(`${API_BASE}/api/projects/${id}/payload`, branchName));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch project payload');
    return res.json();
  },

  getArtifactUrl(projectId: string, artifactName: string, branchName?: string | null) {
    return withBranchQuery(`${API_BASE}/api/projects/${projectId}/artifacts/${artifactName}`, branchName);
  },

  getArtifactContentUrl(projectId: string, artifactName: string, branchName?: string | null) {
    return withBranchQuery(`${API_BASE}/api/projects/${projectId}/artifact?name=${encodeURIComponent(artifactName)}`, branchName);
  },

  getAssetContentUrl(assetId: string) {
    return `${API_BASE}/api/assets/${assetId}/content`;
  },

  async getArtifactText(projectId: string, artifactName: string, branchName?: string | null) {
    const res = await fetch(withBranchQuery(`${API_BASE}/api/projects/${projectId}/artifact?name=${encodeURIComponent(artifactName)}`, branchName));
    if (!res.ok) throw new Error('Failed to fetch artifact content');
    return res.text();
  },

  async createProject(name: string, brief?: string) {
    const res = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, brief }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    return res.json();
  },

  async createAsset(projectId: string, name: string, type: string, file: File) {
    // 1. Get Presigned URL
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    });
    if (!res.ok) throw new Error('Failed to create asset');
    const { asset, uploadUrl } = await res.json();

    // 2. Upload to R2 (Direct PUT)
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });
    if (!uploadRes.ok) throw new Error('Upload to R2 failed');

    // 3. Mark Uploaded
    const confirmRes = await fetch(`${API_BASE}/api/assets/${asset.id}/uploaded`, {
      method: 'POST'
    });
    if (!confirmRes.ok) throw new Error('Failed to confirm upload');

    return asset;
  },

  async getBranches(projectId: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/branches`);
    if (!res.ok) throw new Error('Failed to fetch branches');
    return res.json();
  },

  async createBranch(projectId: string, name: string, sourceBranch?: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sourceBranch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create branch');
    }
    return res.json();
  },

  async switchBranch(projectId: string, branchName: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/branches/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to switch branch');
    }
    return res.json();
  },

  async mergeBranches(projectId: string, sourceBranch: string, targetBranch: string, message?: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/branches/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceBranch, targetBranch, message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to merge branches');
    }
    return res.json();
  },

  async startIngestion(projectId: string, branchName?: string | null) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(branchName ? { branchName } : {}),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to start ingestion');
    }
    return res.json();
  },

  connectWebSocket(projectId: string, onMessage: (msg: any) => void) {
    const wsUrl = new URL(`${API_BASE}/api/projects/${projectId}/ws`);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const ws = new WebSocket(wsUrl.toString());
    ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    return ws;
  }
,

  // --- Agent Planning Methods ---
  async generatePlan(projectId: string, prompt: string, branchName?: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, branchName }),
    });
    if (!res.ok) throw new Error('Failed to generate plan');
    return res.json();
  },

  async getPlanStatus(projectId: string, planId: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/plans/${planId}`);
    if (!res.ok) throw new Error('Failed to fetch plan status');
    return res.json();
  }

};
