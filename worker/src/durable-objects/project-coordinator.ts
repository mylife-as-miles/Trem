import { DurableObject } from "cloudflare:workers";

type AgentState = {
  slot: number;
  status: string;
  assetId: string | null;
  assetName: string | null;
  completedCount: number;
};

const createDefaultAgentStates = (): AgentState[] =>
  Array.from({ length: 4 }, (_, index) => ({
    slot: index + 1,
    status: 'idle',
    assetId: null,
    assetName: null,
    completedCount: 0,
  }));

export class ProjectCoordinatorDO extends DurableObject {
  private activeJobId: string | null = null;
  private progress: number = 0;
  private jobStatus: string = 'idle';
  private agentStates: AgentState[] = createDefaultAgentStates();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/lock') {
      const body: { jobId: string } = await request.json();
      if (this.activeJobId && this.activeJobId !== body.jobId) {
        return new Response(JSON.stringify({ error: "Another job is already running for this project." }), { status: 409 });
      }
      this.activeJobId = body.jobId;
      this.progress = 0;
      this.jobStatus = 'queued';
      this.agentStates = createDefaultAgentStates();
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/unlock') {
      this.activeJobId = null;
      this.progress = 100;
      this.jobStatus = 'completed';
      this.agentStates = this.agentStates.map((agent) => ({
        ...agent,
        status: 'idle',
        assetId: null,
        assetName: null,
      }));
      this.broadcast({ type: 'job_completed' });
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/reset') {
      let body: { jobStatus?: string; progress?: number } = {};
      try {
        body = await request.json<{ jobStatus?: string; progress?: number }>();
      } catch {
        body = {};
      }
      this.activeJobId = null;
      this.progress = typeof body.progress === 'number' ? body.progress : 0;
      this.jobStatus = body.jobStatus ?? 'idle';
      this.agentStates = createDefaultAgentStates();
      this.broadcast({
        type: 'job_reset',
        progress: this.progress,
        jobStatus: this.jobStatus,
        agents: this.agentStates,
      });
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/progress') {
      const body: { progress: number, message?: string, status?: string, jobStatus?: string, agents?: AgentState[] } = await request.json();
      if (typeof body.progress === 'number') this.progress = body.progress;
      if (body.status || body.jobStatus) this.jobStatus = body.status || body.jobStatus || this.jobStatus;
      if (Array.isArray(body.agents)) this.agentStates = body.agents;
      
      this.broadcast({ 
        type: 'progress', 
        progress: this.progress, 
        message: body.message,
        jobStatus: this.jobStatus,
        agents: this.agentStates,
      });
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/status') {
      return new Response(JSON.stringify({ 
        activeJobId: this.activeJobId, 
        progress: this.progress,
        jobStatus: this.jobStatus,
        agents: this.agentStates,
      }));
    }

    if (url.pathname.endsWith('/ws')) {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      this.ctx.acceptWebSocket(server);

      // Send initial state upon connection
      server.send(JSON.stringify({
        type: 'progress',
        progress: this.progress,
        jobStatus: this.jobStatus,
        message: 'Connected to coordinator',
        agents: this.agentStates,
      }));

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    // Handle incoming messages if needed
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // DO handles cleanup internally for ctx.getWebSockets()
  }

  async webSocketError(ws: WebSocket, error: any) {
    // DO handles cleanup internally
  }

  private broadcast(data: any) {
    const msg = JSON.stringify(data);
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(msg);
      } catch (e) {
        // Log error or let DO clean up disconnected socket
      }
    }
  }
}

