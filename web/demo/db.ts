const uid = () => crypto.randomUUID();
const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const tables = {
  providers: new Map<string, any>(),
  agents: new Map<string, any>(),
  teams: new Map<string, any>(),
  nodes: new Map<string, any>(),
  peers: new Map<string, any>(),
  remoteTasks: new Map<string, any>(),
  projects: new Map<string, any>(),
  connections: new Map<string, any>(),
  sessions: new Map<string, any>(),
  tasks: new Map<string, any>(),
  meetings: new Map<string, any>(),
};
const messages: any[] = [];
const feed: any[] = [];
const settings = new Map<string, string>();

const all = (table: Map<string, any>) => copy([...table.values()]);

export const store = {
  providers: () => all(tables.providers),
  provider: (id: string) => copy(tables.providers.get(id)),
  saveProvider(p: any) {
    const saved = { ...p, id: p.id ?? uid() };
    tables.providers.set(saved.id, copy(saved));
    return saved;
  },
  deleteProvider(id: string) {
    tables.providers.delete(id);
    for (const a of tables.agents.values()) if (a.providerId === id) a.providerId = null;
  },

  agents: () => all(tables.agents).sort((a: any, b: any) => a.createdAt - b.createdAt),
  saveAgent(a: any) {
    tables.agents.set(a.id, copy(a));
    return a;
  },
  deleteAgent(id: string) {
    tables.agents.delete(id);
    for (const [sid, s] of tables.sessions) if (s.agentId === id) tables.sessions.delete(sid);
    for (const t of tables.teams.values()) if (t.leadId === id) t.leadId = null;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].agentId === id) messages.splice(i, 1);
  },

  teams: () => all(tables.teams),
  saveTeam(t: any) {
    const saved = { ...t, id: t.id ?? uid() };
    tables.teams.set(saved.id, copy(saved));
    return saved;
  },
  deleteTeam(id: string) {
    tables.teams.delete(id);
    for (const a of tables.agents.values()) if (a.teamId === id) a.teamId = null;
  },

  messages: (agentId: string, limit = 200) => copy(messages.filter((m) => m.agentId === agentId).slice(-limit)),
  addMessage(agentId: string, sender: 'user' | 'agent', text: string) {
    const m = { id: uid(), agentId, sender, text, createdAt: Date.now() };
    messages.push(m);
    return copy(m);
  },

  tasks: (limit = 200) => all(tables.tasks).reverse().slice(0, limit),
  task: (id: string) => copy(tables.tasks.get(id)),
  addTask(agentId: string, parentId: string | null, title: string, description: string, origin: any = null) {
    const t = { id: uid(), agentId, parentId, title, description, status: 'queued', result: '', createdAt: Date.now(), finishedAt: null, origin };
    tables.tasks.set(t.id, t);
    return copy(t);
  },
  updateTask(t: any) {
    const row = tables.tasks.get(t.id);
    if (row) Object.assign(row, { status: t.status, result: t.result, finishedAt: t.finishedAt });
  },
  failUnfinishedTasks() {},

  feed: (limit = 30) => copy(feed.slice(-limit)),
  addFeed(text: string) {
    const e = { id: uid(), text, createdAt: Date.now() };
    feed.push(e);
    return copy(e);
  },

  nodes: () => all(tables.nodes),
  saveNode(n: any) {
    tables.nodes.set(n.id, copy(n));
  },
  deleteNode(id: string) {
    tables.nodes.delete(id);
  },

  peers: () => all(tables.peers),
  savePeer(p: any) {
    tables.peers.set(p.id, copy(p));
  },
  deletePeer(id: string) {
    tables.peers.delete(id);
  },

  projects: () => all(tables.projects),
  saveProject(p: any) {
    tables.projects.set(p.id, copy(p));
    return p;
  },
  deleteProject(id: string) {
    tables.projects.delete(id);
    for (const a of tables.agents.values()) if (a.projectId === id) a.projectId = null;
    for (const s of tables.sessions.values()) if (s.projectId === id) s.status = 'closed';
  },

  connections: () => all(tables.connections),
  saveConnection(c: any) {
    tables.connections.set(c.id, copy(c));
    return c;
  },
  deleteConnection(id: string) {
    tables.connections.delete(id);
  },

  sessions: (limit = 300) => all(tables.sessions).sort((a: any, b: any) => b.lastUsedAt - a.lastUsedAt).slice(0, limit),
  session: (id: string) => copy(tables.sessions.get(id)),
  saveSession(s: any) {
    tables.sessions.set(s.id, copy(s));
    return s;
  },
  deleteSession(id: string) {
    tables.sessions.delete(id);
  },

  remoteTasks: () => all(tables.remoteTasks).reverse(),
  saveRemoteTask(t: any) {
    tables.remoteTasks.set(t.id, copy(t));
  },

  meetings: (limit = 60) => all(tables.meetings).sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, limit),
  saveMeeting(m: any) {
    tables.meetings.set(m.id, copy(m));
    return m;
  },
  deleteMeeting(id: string) {
    tables.meetings.delete(id);
  },

  setting<T>(key: string, fallback: T): T {
    const raw = settings.get(key);
    return raw === undefined ? fallback : (JSON.parse(raw) as T);
  },
  setSetting(key: string, value: unknown) {
    settings.set(key, JSON.stringify(value ?? null));
  },
};
