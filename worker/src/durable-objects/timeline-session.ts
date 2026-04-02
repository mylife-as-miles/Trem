import { DurableObject } from 'cloudflare:workers';



export class TimelineSessionDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/workflow-complete' && request.method === 'POST') {
      const data = await request.json();
      const sockets = this.ctx.getWebSockets();
      for (const socket of sockets) {
        socket.send(JSON.stringify({ type: 'workflow_complete', ...data as any }));
      }
      return new Response('OK');
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const msgStr = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let data;
    try {
      data = JSON.parse(msgStr);
    } catch (e) {
      ws.send(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Broadcast message to all connected clients
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      if (socket !== ws) {
        socket.send(JSON.stringify(data));
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: Error) {
    console.error('WebSocket Error in DO:', error);
  }
}
