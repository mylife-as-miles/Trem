import { DurableObject } from "cloudflare:workers";

export class ProjectCoordinatorDO extends DurableObject {
  private activeJobId: string | null = null;
  private progress: number = 0;
  private viewers: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/lock') {
      const body: { jobId: string } = await request.json();
      if (this.activeJobId && this.activeJobId !== body.jobId) {
        return new Response(JSON.stringify({ error: "Another job is already running for this project." }), { status: 409 });
      }
      this.activeJobId = body.jobId;
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/unlock') {
      this.activeJobId = null;
      this.progress = 100;
      this.broadcast({ type: 'job_completed' });
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/progress') {
      const body: { progress: number, message?: string } = await request.json();
      this.progress = body.progress;
      this.broadcast({ type: 'progress', progress: this.progress, message: body.message });
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/status') {
      return new Response(JSON.stringify({ activeJobId: this.activeJobId, progress: this.progress }));
    }

    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      this.ctx.acceptWebSocket(server);
      this.viewers.add(server);

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
    this.viewers.delete(ws);
  }

  private broadcast(data: any) {
    const msg = JSON.stringify(data);
    for (const ws of this.viewers) {
      try {
        ws.send(msg);
      } catch (e) {
        this.viewers.delete(ws);
      }
    }
  }
}
