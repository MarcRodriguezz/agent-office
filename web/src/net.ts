import { applyActors, getState, setState, toast, world } from './store';
import type { ChatMessage, GoTarget, LoginAction, Task } from './types';

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

let socket: WebSocket | null = null;
let tokenSeq = 0;
const waiting = new Map<number, (ok: boolean) => void>();
const termStarts = new Map<number, (sid: string | null) => void>();
const terms = new Map<string, { onData: (data: string) => void; onExit: (code: number) => void }>();

function addMessage(message: ChatMessage) {
  setState((s) => {
    const list = s.messages[message.agentId];
    if (!list || list.some((m) => m.id === message.id)) return {};
    return { messages: { ...s.messages, [message.agentId]: [...list, message] } };
  });
}

function upsertTask(task: Task) {
  setState((s) => ({
    tasks: s.tasks.some((t) => t.id === task.id) ? s.tasks.map((t) => (t.id === task.id ? task : t)) : [task, ...s.tasks],
  }));
}

function handle(msg: any) {
  switch (msg.type) {
    case 'state':
      applyActors(msg.actors);
      break;
    case 'arrived':
      waiting.get(msg.token)?.(msg.ok);
      waiting.delete(msg.token);
      break;
    case 'agents':
      setState((s) => ({
        agents: msg.agents,
        selectedAgentId: msg.agents.some((a: any) => a.id === s.selectedAgentId) ? s.selectedAgentId : null,
      }));
      break;
    case 'teams':
      setState({ teams: msg.teams });
      break;
    case 'providers':
      setState({ providers: msg.providers });
      break;
    case 'settings':
      setState({ settings: msg.settings });
      break;
    case 'message':
      addMessage(msg.message);
      if (msg.message.sender === 'agent' && getState().selectedAgentId !== msg.message.agentId) {
        setState({ dialog: { agentId: msg.message.agentId, text: msg.message.text } });
      }
      break;
    case 'nodes':
      setState({ nodes: msg.nodes });
      break;
    case 'offices':
      setState({ offices: msg.offices });
      break;
    case 'visitors':
      setState({ visitors: msg.visitors });
      break;
    case 'dialog':
      setState({ dialog: { guest: { name: msg.name, appearance: msg.appearance, companion: msg.companion, xp: msg.xp }, text: msg.text } });
      break;
    case 'term-started':
      termStarts.get(msg.ref)?.(msg.sid);
      termStarts.delete(msg.ref);
      break;
    case 'term':
      terms.get(msg.sid)?.onData(msg.data);
      break;
    case 'term-exit':
      terms.get(msg.sid)?.onExit(msg.code);
      terms.delete(msg.sid);
      break;
    case 'levelup':
      world.effects.push({ actorId: msg.actorId, at: performance.now(), level: msg.level, evolved: msg.evolved });
      break;
    case 'task':
      upsertTask(msg.task);
      break;
    case 'feed':
      setState((s) => ({ feed: [...s.feed.slice(-40), msg.event] }));
      break;
    case 'jobs':
      setState({ jobs: { jobs: msg.jobs, totals: msg.totals, waiting: msg.waiting, active: msg.active } });
      break;
    case 'delivery': {
      const agent = getState().agents.find((a) => a.id === msg.agentId);
      if (!msg.ok) toast(`${agent?.name ?? 'Un agente'} no pudo completar «${msg.title}»`, false, msg.agentId);
      break;
    }
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${proto}://${location.host}/ws`);
  socket.onopen = () => setState({ connected: true });
  socket.onmessage = (e) => handle(JSON.parse(e.data));
  socket.onclose = () => {
    setState({ connected: false });
    waiting.forEach((resolve) => resolve(false));
    waiting.clear();
    terms.forEach((t) => t.onExit(1));
    terms.clear();
    setTimeout(() => void bootstrap().catch(() => connect()), 1500);
  };
}

export async function bootstrap() {
  const data = await api('GET', '/bootstrap');
  applyActors(data.actors);
  setState({
    ready: true, map: data.map, agents: data.agents, teams: data.teams, providers: data.providers,
    settings: data.settings, tasks: data.tasks, feed: data.feed, jobs: data.jobs,
    nodes: data.nodes, offices: data.offices, visitors: data.visitors,
  });
  connect();
}

export function go(target: GoTarget): Promise<boolean> {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(false);
  const token = ++tokenSeq;
  socket.send(JSON.stringify({ type: 'go', token, target }));
  return new Promise((resolve) => waiting.set(token, resolve));
}

export async function openTerm(nodeId: string, action: LoginAction, onData: (data: string) => void, onExit: (code: number) => void) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return null;
  const ws = socket;
  const ref = ++tokenSeq;
  ws.send(JSON.stringify({ type: 'term-start', ref, nodeId, action }));
  const sid = await new Promise<string | null>((resolve) => {
    termStarts.set(ref, resolve);
    setTimeout(() => resolve(null), 8000);
  });
  if (!sid) return null;
  terms.set(sid, { onData, onExit });
  return {
    input: (data: string) => ws.send(JSON.stringify({ type: 'term-input', sid, data })),
    kill: () => ws.send(JSON.stringify({ type: 'term-kill', sid })),
  };
}

export function step(dx: number, dy: number) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'step', dx, dy }));
}

export function sayAsPlayer(text: string) {
  socket?.send(JSON.stringify({ type: 'say', text }));
}

export async function selectAgent(id: string, walk = true) {
  setState((s) => ({ selectedAgentId: id, dialog: s.dialog?.agentId === id ? null : s.dialog }));
  if (walk) void go({ kind: 'agent', id });
  if (!getState().messages[id]) {
    const list = await api<ChatMessage[]>('GET', `/agents/${id}/messages`).catch(() => []);
    setState((s) => ({ messages: { ...s.messages, [id]: list } }));
  }
}
