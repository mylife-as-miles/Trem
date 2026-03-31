// Frontend API Client for Cloudflare Worker Backend

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8787';

export const apiClient = {
  async getProjects() {
    const res = await fetch(`${API_BASE}/api/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async getProject(id: string) {
    const res = await fetch(`${API_BASE}/api/projects/${id}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    return res.json();
  },

  async getProjectPayload(id: string) {
    const res = await fetch(`${API_BASE}/api/projects/${id}/payload`);
    if (!res.ok) throw new Error('Failed to fetch project payload');
    return res.json();
  },

  getArtifactUrl(projectId: string, artifactName: string) {
    return `${API_BASE}/api/projects/${projectId}/artifacts/${artifactName}`;
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

  async startIngestion(projectId: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/ingest`, {
      method: 'POST',
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
};
