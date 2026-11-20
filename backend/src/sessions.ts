import { randomUUID } from 'node:crypto';
import { store } from './db.js';
import { hub } from './hub.js';
import type { Agent, Connection, LlmMessage, LlmResult, Provider, Work, WorkSession } from './types.js';
import { t } from './i18n.js';

const HISTORY = 30;
const CLIP = 6000;

const clip = (text: string) => (text.length > CLIP ? `${text.slice(0, CLIP)}…` : text);
const titleOf = (text: string) => {
  const line = text.trim().split('\n').find((l) => l.trim() && !l.startsWith(t('Tu jefe')) && !l.startsWith(t('Título:'))) ?? text;
  const clean = line.replace(/^(Título|Encargo):\s*/i, '').trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
};

export const publicConnection = ({ env, ...c }: Connection) => ({ ...c, keys: Object.keys(env) });

export const sessionList = () => store.sessions().map(({ history, ...s }) => ({
  ...s,
  last: [...history].reverse().find((m) => m.role === 'assistant')?.content.slice(0, 240) ?? '',
}));

export const publishSessions = () => hub.broadcast({ type: 'sessions', sessions: sessionList() });
export const publishProjects = () => hub.broadcast({ type: 'projects', projects: store.projects() });
export const publishConnections = () => hub.broadcast({ type: 'connections', connections: store.connections().map(publicConnection) });

const fits = (s: WorkSession, agent: Agent, provider: Provider) =>
  s.projectId === agent.projectId && s.kind === provider.kind && s.nodeId === (agent.nodeId ?? null);

export function currentSession(agent: Agent, provider: Provider): WorkSession {
  const open = store.sessions().filter((s) => s.agentId === agent.id && s.status === 'open' && s.projectId === agent.projectId);
  const match = open.find((s) => fits(s, agent, provider));
  for (const s of open) if (s !== match) store.saveSession({ ...s, status: 'closed' });
  if (match) return match;
  const id = randomUUID();
  const session: WorkSession = {
    id, agentId: agent.id, projectId: agent.projectId, kind: provider.kind, nodeId: agent.nodeId ?? null,
    cliId: provider.kind === 'claude-code' ? id : '', status: 'open', title: '', turns: 0, history: [],
    createdAt: Date.now(), lastUsedAt: Date.now(),
  };
  store.saveSession(session);
  publishSessions();
  return session;
}

export function recordTurn(id: string, prompt: string, result: LlmResult) {
  const session = store.session(id);
  if (!session) return;
  const history: LlmMessage[] = [...session.history, { role: 'user', content: clip(prompt) }, { role: 'assistant', content: clip(result.text) }];
  store.saveSession({
    ...session,
    cliId: result.cliId ?? session.cliId,
    title: session.title || titleOf(prompt),
    turns: session.turns + 1,
    history: history.slice(-HISTORY),
    lastUsedAt: Date.now(),
  });
  publishSessions();
}

export function closeSession(id: string): boolean {
  const session = store.session(id);
  if (!session) return false;
  store.saveSession({ ...session, status: 'closed' });
  publishSessions();
  return true;
}

export function closeCurrent(agent: Agent) {
  for (const s of store.sessions()) {
    if (s.agentId === agent.id && s.projectId === agent.projectId && s.status === 'open') store.saveSession({ ...s, status: 'closed' });
  }
  publishSessions();
}

export function reopenSession(id: string): WorkSession {
  const session = store.session(id);
  if (!session) throw new Error(t('Esa sesión ya no existe.'));
  for (const s of store.sessions()) {
    if (s.id !== id && s.agentId === session.agentId && s.projectId === session.projectId && s.status === 'open') {
      store.saveSession({ ...s, status: 'closed' });
    }
  }
  const next = { ...session, status: 'open' as const, lastUsedAt: Date.now() };
  store.saveSession(next);
  publishSessions();
  return next;
}

export function forgetSession(id: string) {
  store.deleteSession(id);
  publishSessions();
}

export function workFor(agent: Agent, session: WorkSession | null): Work {
  const project = agent.projectId ? store.projects().find((p) => p.id === agent.projectId) : undefined;
  const connections = store.connections().filter((c) => agent.connections.includes(c.id));
  return {
    folder: project?.folder ?? '',
    access: agent.access,
    env: Object.assign({}, ...connections.map((c) => c.env)),
    bins: [...new Set(connections.map((c) => c.bin).filter(Boolean))],
    session: session ? { cliId: session.cliId } : null,
  };
}

export function projectFolder(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proyecto';
  const taken = new Set(store.projects().map((p) => p.folder));
  let folder = base;
  for (let i = 2; taken.has(folder); i++) folder = `${base}-${i}`;
  return folder;
}
