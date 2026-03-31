import { DurableObject } from "cloudflare:workers";

export class ProjectCoordinatorDO extends DurableObject {
  private activeJobId: string | null = null;
  private progress: number = 0;
  private jobStatus: string = 'idle';

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
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/unlock') {
      this.activeJobId = null;
      this.progress = 100;
      this.jobStatus = 'completed';
      this.broadcast({ type: 'job_completed' });
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/progress') {
      const body: { progress: number, message?: string, status?: string } = await request.json();
      if (typeof body.progress === 'number') this.progress = body.progress;
      if (body.status) this.jobStatus = body.status;
      
      this.broadcast({ 
        type: 'progress', 
        progress: this.progress, 
        message: body.message,
        jobStatus: this.jobStatus
      });
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/status') {
      return new Response(JSON.stringify({ 
        activeJobId: this.activeJobId, 
        progress: this.progress,
        jobStatus: this.jobStatus
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
        message: 'Connected to coordinator'
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

