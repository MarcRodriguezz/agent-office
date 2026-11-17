import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { store } from './db.js';
import { hub } from './hub.js';
import { toolCommand, type ToolAction } from './tools.js';
import type { LlmJob, LlmResult, NodeInfo } from './types.js';

export const LOCAL = 'local';

interface Live {
  sockets: Set<WebSocket>;
  info: NodeInfo | null;
}

interface Pending {
  nodeId: string;
  socket: WebSocket;
  resolve: (result: LlmResult) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface Term {
  node: WebSocket;
  client: WebSocket;
}

const live = new Map<string, Live>();
const pending = new Map<string, Pending>();
const terms = new Map<string, Term>();

const send = (ws: WebSocket, msg: unknown) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};
const first = (nodeId: string) => [...(live.get(nodeId)?.sockets ?? [])].find((s) => s.readyState === 1);
const activeOn = (nodeId: string) => [...pending.values()].filter((p) => p.nodeId === nodeId).length;

export function nodesState() {
  const row = (id: string, name: string, local: boolean) => ({
    id, name, local, online: !!first(id), info: live.get(id)?.info ?? null, active: activeOn(id),
  });
  return [row(LOCAL, 'Esta oficina', true), ...store.nodes().map((n) => row(n.id, n.name, false))];
}

export const publishNodes = () => hub.broadcast({ type: 'nodes', nodes: nodesState() });

export const isRemote = (nodeId: string | null | undefined): nodeId is string =>
  !!nodeId && nodeId !== LOCAL && store.nodes().some((n) => n.id === nodeId);

export const nodeName = (nodeId: string) => store.nodes().find((n) => n.id === nodeId)?.name ?? 'Servidor';

export function attachNode(nodeId: string, ws: WebSocket) {
  const entry = live.get(nodeId) ?? { sockets: new Set<WebSocket>(), info: null };
  live.set(nodeId, entry);
  entry.sockets.add(ws);
  publishNodes();

  ws.on('message', (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'info') {
      entry.info = msg.info;
      publishNodes();
    } else if (msg.type === 'result') {
      const job = pending.get(msg.id);
      if (!job) return;
      pending.delete(msg.id);
      clearTimeout(job.timer);
      if (msg.ok) job.resolve({ text: String(msg.text ?? ''), cliId: msg.cliId ? String(msg.cliId) : undefined });
      else job.reject(new Error(String(msg.error ?? 'Error en el servidor remoto.')));
      publishNodes();
    } else if (msg.type === 'term' || msg.type === 'term-exit') {
      const term = terms.get(msg.sid);
      if (!term || term.node !== ws) return;
      send(term.client, msg);
      if (msg.type === 'term-exit') terms.delete(msg.sid);
    }
  });

  ws.on('close', () => {
    entry.sockets.delete(ws);
    for (const [id, job] of pending) {
      if (job.socket !== ws) continue;
      pending.delete(id);
      clearTimeout(job.timer);
      job.reject(new Error(`Se perdió la conexión con el servidor «${nodeName(nodeId)}» durante el trabajo.`));
    }
    for (const [sid, term] of terms) {
      if (term.node !== ws) continue;
      terms.delete(sid);
      send(term.client, { type: 'term-exit', sid, code: 1 });
    }
    publishNodes();
  });
}

export function nodeByToken(token: string) {
  return token ? store.nodes().find((n) => n.token === token) : undefined;
}

export function runOnNode(nodeId: string, data: LlmJob, timeoutMs: number): Promise<LlmResult> {
  const socket = first(nodeId);
  if (!socket) return Promise.reject(new Error(`El servidor «${nodeName(nodeId)}» no está conectado.`));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`El servidor «${nodeName(nodeId)}» no ha respondido a tiempo.`));
    }, timeoutMs);
    pending.set(id, { nodeId, socket, resolve, reject, timer });
    send(socket, { type: 'job', id, data });
    publishNodes();
  });
}

export function createNode(name: string) {
  const node = { id: randomUUID(), name, token: randomBytes(24).toString('hex'), createdAt: Date.now() };
  store.saveNode(node);
  publishNodes();
  return node;
}

export function removeNode(id: string) {
  store.deleteNode(id);
  for (const socket of live.get(id)?.sockets ?? []) socket.close(4401);
  live.delete(id);
  publishNodes();
}

export function refreshNode(id: string) {
  for (const socket of live.get(id)?.sockets ?? []) send(socket, { type: 'refresh' });
}

export function startTerm(client: WebSocket, nodeId: string, tool: string, action: ToolAction): string | null {
  const node = first(nodeId);
  if (!node || !toolCommand(tool, action)) return null;
  const sid = randomUUID();
  terms.set(sid, { node, client });
  send(node, { type: 'term-start', sid, tool, action });
  return sid;
}

export function termInput(client: WebSocket, sid: string, data: string) {
  const term = terms.get(sid);
  if (term?.client === client) send(term.node, { type: 'term-input', sid, data });
}

export function termKill(client: WebSocket, sid: string) {
  const term = terms.get(sid);
  if (term?.client === client) send(term.node, { type: 'term-kill', sid });
}

export function dropClient(client: WebSocket) {
  for (const [sid, term] of terms) {
    if (term.client !== client) continue;
    send(term.node, { type: 'term-kill', sid });
    terms.delete(sid);
  }
}
