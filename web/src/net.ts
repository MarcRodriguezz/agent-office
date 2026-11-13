import { applyActors, getState, setState, toast } from './store';
import type { ChatMessage, GoTarget, Task } from './types';

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
      toast(msg.ok ? `${agent?.name ?? 'Un agente'} te entrega «${msg.title}»` : `${agent?.name ?? 'Un agente'} no pudo completar «${msg.title}»`, msg.ok, msg.agentId);
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
    setTimeout(() => void bootstrap().catch(() => connect()), 1500);
  };
}

export async function bootstrap() {
  const data = await api('GET', '/bootstrap');
  applyActors(data.actors);
  setState({
    ready: true, map: data.map, agents: data.agents, teams: data.teams, providers: data.providers,
    settings: data.settings, tasks: data.tasks, feed: data.feed, jobs: data.jobs,
  });
  connect();
}

export function go(target: GoTarget): Promise<boolean> {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(false);
  const token = ++tokenSeq;
  socket.send(JSON.stringify({ type: 'go', token, target }));
  return new Promise((resolve) => waiting.set(token, resolve));
}

export function sayAsPlayer(text: string) {
  socket?.send(JSON.stringify({ type: 'say', text }));
}

export async function selectAgent(id: string, walk = true) {
  setState({ selectedAgentId: id });
  if (walk) void go({ kind: 'agent', id });
  if (!getState().messages[id]) {
    const list = await api<ChatMessage[]>('GET', `/agents/${id}/messages`).catch(() => []);
    setState((s) => ({ messages: { ...s.messages, [id]: list } }));
  }
}
