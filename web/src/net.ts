import { applyActors, getState, setState, toast, world } from './store';
import { openLink, request, type Link } from './transport';
import type { ChatMessage, GoTarget, HubOffice, Layout, LoginAction, MapData, Task } from './types';

const OFFICE_KEY = 'agent-office:oficina';

export const apiOf = <T = any>(officeId: string, method: string, path: string, body?: unknown) =>
  request<T>(`/o/${officeId}/api${path}`, method, body);

export const api = <T = any>(method: string, path: string, body?: unknown) => apiOf<T>(getState().officeId, method, path, body);

export const hubApi = <T = any>(method: string, path: string, body?: unknown) => request<T>(`/api/hub${path}`, method, body);

export async function refreshHub(): Promise<HubOffice[]> {
  const hub = await hubApi<HubOffice[]>('GET', '/offices');
  setState({ hub });
  return hub;
}

let socket: Link | null = null;
let generation = 0;
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
    case 'map':
      setState({ map: msg.map });
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
  const mine = generation;
  socket = openLink(getState().officeId, {
    open: () => mine === generation && setState({ connected: true }),
    message: (msg) => mine === generation && handle(msg),
    close: () => {
      if (mine !== generation) return;
      setState({ connected: false });
      waiting.forEach((resolve) => resolve(false));
      waiting.clear();
      terms.forEach((t) => t.onExit(1));
      terms.clear();
      setTimeout(() => void bootstrap().catch(() => connect()), 1500);
    },
  });
}

export async function bootstrap() {
  const hub = await refreshHub();
  const wanted = getState().officeId || localStorage.getItem(OFFICE_KEY) || '';
  const office = hub.find((o) => o.id === wanted && o.online) ?? hub.find((o) => o.online);
  if (!office) throw new Error('ninguna oficina responde todavía');
  generation++;
  socket?.close();
  setState({ officeId: office.id });
  localStorage.setItem(OFFICE_KEY, office.id);
  const data = await api('GET', '/bootstrap');
  applyActors(data.actors);
  setState({
    ready: true, map: data.map, agents: data.agents, teams: data.teams, providers: data.providers,
    settings: data.settings, tasks: data.tasks, feed: data.feed, jobs: data.jobs,
    nodes: data.nodes, offices: data.offices, visitors: data.visitors, templates: data.templates ?? [],
  });
  connect();
}

export async function switchOffice(id: string) {
  if (id === getState().officeId) return;
  world.actors.clear();
  world.effects = [];
  setState({ officeId: id, ready: false, connected: false, selectedAgentId: null, dialog: null, messages: {}, architect: false, roomId: null, modal: null });
  await bootstrap().catch((e) => toast(e.message, false));
}

export async function saveLayout(layout: Layout | { reset: true }, quiet = false): Promise<boolean> {
  try {
    const map = await api<MapData>('PUT', '/layout', 'reset' in layout ? layout : { layout });
    setState({ map });
    return true;
  } catch (e) {
    if (!quiet) toast((e as Error).message, false);
    return false;
  }
}

export const copy = (text: string, done = 'Copiado') =>
  navigator.clipboard.writeText(text).then(() => toast(done), () => toast('El navegador no ha dejado copiar. Selecciona el texto y cópialo a mano.', false));

export function go(target: GoTarget): Promise<boolean> {
  if (!socket?.isOpen()) return Promise.resolve(false);
  const token = ++tokenSeq;
  socket.send({ type: 'go', token, target });
  return new Promise((resolve) => waiting.set(token, resolve));
}

export async function openTerm(nodeId: string, action: LoginAction, onData: (data: string) => void, onExit: (code: number) => void) {
  if (!socket?.isOpen()) return null;
  const ws = socket;
  const ref = ++tokenSeq;
  ws.send({ type: 'term-start', ref, nodeId, action });
  const sid = await new Promise<string | null>((resolve) => {
    termStarts.set(ref, resolve);
    setTimeout(() => resolve(null), 8000);
  });
  if (!sid) return null;
  terms.set(sid, { onData, onExit });
  return {
    input: (data: string) => ws.send({ type: 'term-input', sid, data }),
    kill: () => ws.send({ type: 'term-kill', sid }),
  };
}

export function step(dx: number, dy: number) {
  socket?.send({ type: 'step', dx, dy });
}

export function sayAsPlayer(text: string) {
  socket?.send({ type: 'say', text });
}

export async function selectAgent(id: string, walk = true) {
  setState((s) => ({ selectedAgentId: id, dialog: s.dialog?.agentId === id ? null : s.dialog }));
  if (walk) void go({ kind: 'agent', id });
  if (!getState().messages[id]) {
    const list = await api<ChatMessage[]>('GET', `/agents/${id}/messages`).catch(() => []);
    setState((s) => ({ messages: { ...s.messages, [id]: list } }));
  }
}
