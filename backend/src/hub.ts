import type { WebSocket } from 'ws';

const sockets = new Set<WebSocket>();

export const hub = {
  add(ws: WebSocket) {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
  },
  send(ws: WebSocket, msg: unknown) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  },
  broadcast(msg: unknown) {
    const data = JSON.stringify(msg);
    for (const ws of sockets) if (ws.readyState === 1) ws.send(data);
  },
};
