import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomCompanion } from './companions.js';
import type {
  Agent, Appearance, ChatMessage, Connection, FeedEvent, NodeRecord, PeerRecord, Project, Provider, RemoteTask, Task, Team, WorkSession,
} from './types.js';

const file = process.env.DB_PATH ?? './data/office.db';
mkdirSync(dirname(file), { recursive: true });
const db = new DatabaseSync(file);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY, name TEXT, kind TEXT, base_url TEXT, api_key TEXT, model TEXT, command TEXT
  );
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, name TEXT, role TEXT, personality TEXT, instructions TEXT,
    provider_id TEXT, model TEXT, team_id TEXT, appearance TEXT, desk INTEGER, created_at INTEGER, companion TEXT, xp INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY, name TEXT, color TEXT, mission TEXT, lead_id TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, agent_id TEXT, sender TEXT, text TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, agent_id TEXT, parent_id TEXT, title TEXT, description TEXT,
    status TEXT, result TEXT, created_at INTEGER, finished_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS feed (
    id TEXT PRIMARY KEY, text TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, name TEXT, token TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS peers (
    id TEXT PRIMARY KEY, name TEXT, url TEXT, token TEXT, direction TEXT, office_id TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, folder TEXT, description TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, name TEXT, tool TEXT, bin TEXT, env TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, agent_id TEXT, project_id TEXT, kind TEXT, node_id TEXT, cli_id TEXT, status TEXT, title TEXT,
    turns INTEGER, history TEXT, created_at INTEGER, last_used_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS remote_tasks (
    id TEXT PRIMARY KEY, peer_id TEXT, target_kind TEXT, target_id TEXT, target_name TEXT, title TEXT, description TEXT,
    status TEXT, result TEXT, created_at INTEGER, finished_at INTEGER
  );
`);

type Row = Record<string, any>;

const agentColumns = (db.prepare('PRAGMA table_info(agents)').all() as Row[]).map((r) => r.name);
if (!agentColumns.includes('companion')) db.exec('ALTER TABLE agents ADD COLUMN companion TEXT');
if (!agentColumns.includes('xp')) db.exec('ALTER TABLE agents ADD COLUMN xp INTEGER DEFAULT 0');
if (!agentColumns.includes('node_id')) db.exec('ALTER TABLE agents ADD COLUMN node_id TEXT');
if (!agentColumns.includes('project_id')) db.exec('ALTER TABLE agents ADD COLUMN project_id TEXT');
if (!agentColumns.includes('access')) db.exec("ALTER TABLE agents ADD COLUMN access TEXT DEFAULT 'read'");
if (!agentColumns.includes('connections')) db.exec("ALTER TABLE agents ADD COLUMN connections TEXT DEFAULT '[]'");
const peerColumns = (db.prepare('PRAGMA table_info(peers)').all() as Row[]).map((r) => r.name);
if (!peerColumns.includes('local')) db.exec('ALTER TABLE peers ADD COLUMN local INTEGER DEFAULT 0');
const taskColumns = (db.prepare('PRAGMA table_info(tasks)').all() as Row[]).map((r) => r.name);
if (!taskColumns.includes('origin')) db.exec('ALTER TABLE tasks ADD COLUMN origin TEXT');
for (const row of db.prepare('SELECT id FROM agents WHERE companion IS NULL').all() as Row[]) {
  db.prepare('UPDATE agents SET companion = ? WHERE id = ?').run(JSON.stringify(randomCompanion()), row.id);
}

const toProvider = (r: Row): Provider => ({
  id: r.id, name: r.name, kind: r.kind, baseUrl: r.base_url ?? '', apiKey: r.api_key ?? '',
  model: r.model ?? '', command: r.command ?? '',
});

const toAgent = (r: Row): Agent => ({
  id: r.id, name: r.name, role: r.role, personality: r.personality ?? '', instructions: r.instructions ?? '',
  providerId: r.provider_id ?? null, model: r.model ?? '', teamId: r.team_id ?? null, nodeId: r.node_id ?? null,
  appearance: JSON.parse(r.appearance) as Appearance, desk: r.desk, createdAt: r.created_at,
  companion: JSON.parse(r.companion), xp: r.xp ?? 0,
  projectId: r.project_id ?? null, access: r.access ?? 'read', connections: JSON.parse(r.connections ?? '[]'),
});

const toSession = (r: Row): WorkSession => ({
  id: r.id, agentId: r.agent_id, projectId: r.project_id ?? null, kind: r.kind, nodeId: r.node_id ?? null, cliId: r.cli_id ?? '',
  status: r.status, title: r.title ?? '', turns: r.turns ?? 0, history: JSON.parse(r.history ?? '[]'),
  createdAt: r.created_at, lastUsedAt: r.last_used_at,
});

const toMessage = (r: Row): ChatMessage => ({
  id: r.id, agentId: r.agent_id, sender: r.sender, text: r.text, createdAt: r.created_at,
});

const toTask = (r: Row): Task => ({
  id: r.id, agentId: r.agent_id, parentId: r.parent_id ?? null, title: r.title, description: r.description ?? '',
  status: r.status, result: r.result ?? '', createdAt: r.created_at, finishedAt: r.finished_at ?? null,
  origin: r.origin ? JSON.parse(r.origin) : null,
});

export const store = {
  providers(): Provider[] {
    return db.prepare('SELECT * FROM providers ORDER BY rowid').all().map(toProvider);
  },
  provider(id: string): Provider | undefined {
    const r = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
    return r ? toProvider(r) : undefined;
  },
  saveProvider(p: Omit<Provider, 'id'> & { id?: string }): Provider {
    const id = p.id ?? randomUUID();
    db.prepare(`INSERT INTO providers (id, name, kind, base_url, api_key, model, command) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, base_url = excluded.base_url,
      api_key = excluded.api_key, model = excluded.model, command = excluded.command`)
      .run(id, p.name, p.kind, p.baseUrl, p.apiKey, p.model, p.command);
    return { ...p, id };
  },
  deleteProvider(id: string) {
    db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    db.prepare('UPDATE agents SET provider_id = NULL WHERE provider_id = ?').run(id);
  },

  agents(): Agent[] {
    return db.prepare('SELECT * FROM agents ORDER BY created_at').all().map(toAgent);
  },
  saveAgent(a: Agent): Agent {
    db.prepare(`INSERT INTO agents (id, name, role, personality, instructions, provider_id, model, team_id, appearance, desk, created_at, companion, xp, node_id,
      project_id, access, connections)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, personality = excluded.personality,
      instructions = excluded.instructions, provider_id = excluded.provider_id, model = excluded.model,
      team_id = excluded.team_id, appearance = excluded.appearance, desk = excluded.desk,
      companion = excluded.companion, xp = excluded.xp, node_id = excluded.node_id,
      project_id = excluded.project_id, access = excluded.access, connections = excluded.connections`)
      .run(a.id, a.name, a.role, a.personality, a.instructions, a.providerId, a.model, a.teamId,
        JSON.stringify(a.appearance), a.desk, a.createdAt, JSON.stringify(a.companion), a.xp, a.nodeId,
        a.projectId, a.access, JSON.stringify(a.connections));
    return a;
  },
  deleteAgent(id: string) {
    db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    db.prepare('UPDATE teams SET lead_id = NULL WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM messages WHERE agent_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE agent_id = ?').run(id);
  },

  projects(): Project[] {
    return (db.prepare('SELECT * FROM projects ORDER BY created_at').all() as Row[])
      .map((r) => ({ id: r.id, name: r.name, folder: r.folder, description: r.description ?? '', createdAt: r.created_at }));
  },
  saveProject(p: Project): Project {
    db.prepare(`INSERT INTO projects (id, name, folder, description, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description`)
      .run(p.id, p.name, p.folder, p.description, p.createdAt);
    return p;
  },
  deleteProject(id: string) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    db.prepare('UPDATE agents SET project_id = NULL WHERE project_id = ?').run(id);
    db.prepare("UPDATE sessions SET status = 'closed' WHERE project_id = ?").run(id);
  },

  connections(): Connection[] {
    return (db.prepare('SELECT * FROM connections ORDER BY created_at').all() as Row[]).map((r) => ({
      id: r.id, name: r.name, tool: r.tool, bin: r.bin ?? '', env: JSON.parse(r.env ?? '{}'), createdAt: r.created_at,
    }));
  },
  saveConnection(c: Connection): Connection {
    db.prepare(`INSERT INTO connections (id, name, tool, bin, env, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, bin = excluded.bin, env = excluded.env`)
      .run(c.id, c.name, c.tool, c.bin, JSON.stringify(c.env), c.createdAt);
    return c;
  },
  deleteConnection(id: string) {
    db.prepare('DELETE FROM connections WHERE id = ?').run(id);
  },

  sessions(limit = 300): WorkSession[] {
    return db.prepare('SELECT * FROM sessions ORDER BY last_used_at DESC LIMIT ?').all(limit).map(toSession);
  },
  session(id: string): WorkSession | undefined {
    const r = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    return r ? toSession(r) : undefined;
  },
  saveSession(s: WorkSession): WorkSession {
    db.prepare(`INSERT INTO sessions (id, agent_id, project_id, kind, node_id, cli_id, status, title, turns, history, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET cli_id = excluded.cli_id, status = excluded.status, title = excluded.title,
      turns = excluded.turns, history = excluded.history, last_used_at = excluded.last_used_at`)
      .run(s.id, s.agentId, s.projectId, s.kind, s.nodeId, s.cliId, s.status, s.title, s.turns, JSON.stringify(s.history), s.createdAt, s.lastUsedAt);
    return s;
  },
  deleteSession(id: string) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },

  teams(): Team[] {
    return (db.prepare('SELECT * FROM teams ORDER BY rowid').all() as Row[])
      .map((r) => ({ id: r.id, name: r.name, color: r.color, mission: r.mission ?? '', leadId: r.lead_id ?? null }));
  },
  saveTeam(t: Omit<Team, 'id'> & { id?: string }): Team {
    const id = t.id ?? randomUUID();
    db.prepare(`INSERT INTO teams (id, name, color, mission, lead_id) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, mission = excluded.mission, lead_id = excluded.lead_id`)
      .run(id, t.name, t.color, t.mission, t.leadId);
    return { ...t, id };
  },
  deleteTeam(id: string) {
    db.prepare('DELETE FROM teams WHERE id = ?').run(id);
    db.prepare('UPDATE agents SET team_id = NULL WHERE team_id = ?').run(id);
  },

  messages(agentId: string, limit = 200): ChatMessage[] {
    return db.prepare('SELECT * FROM (SELECT *, rowid AS seq FROM messages WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at, seq')
      .all(agentId, limit).map(toMessage);
  },
  addMessage(agentId: string, sender: 'user' | 'agent', text: string): ChatMessage {
    const m: ChatMessage = { id: randomUUID(), agentId, sender, text, createdAt: Date.now() };
    db.prepare('INSERT INTO messages (id, agent_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(m.id, agentId, sender, text, m.createdAt);
    return m;
  },

  tasks(limit = 200): Task[] {
    return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit).map(toTask);
  },
  task(id: string): Task | undefined {
    const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return r ? toTask(r) : undefined;
  },
  addTask(agentId: string, parentId: string | null, title: string, description: string, origin: Task['origin'] = null): Task {
    const t: Task = {
      id: randomUUID(), agentId, parentId, title, description, status: 'queued', result: '',
      createdAt: Date.now(), finishedAt: null, origin,
    };
    db.prepare('INSERT INTO tasks (id, agent_id, parent_id, title, description, status, result, created_at, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(t.id, agentId, parentId, title, description, t.status, '', t.createdAt, origin ? JSON.stringify(origin) : null);
    return t;
  },
  updateTask(t: Task) {
    db.prepare('UPDATE tasks SET status = ?, result = ?, finished_at = ? WHERE id = ?')
      .run(t.status, t.result, t.finishedAt, t.id);
  },
  failUnfinishedTasks() {
    db.prepare(`UPDATE tasks SET status = 'failed', result = 'Interrumpida por un reinicio del servidor.', finished_at = ?
      WHERE status IN ('queued', 'working', 'delegating')`).run(Date.now());
  },

  feed(limit = 30): FeedEvent[] {
    return (db.prepare('SELECT * FROM feed ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit) as Row[])
      .map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at })).reverse();
  },
  addFeed(text: string): FeedEvent {
    const e: FeedEvent = { id: randomUUID(), text, createdAt: Date.now() };
    db.prepare('INSERT INTO feed (id, text, created_at) VALUES (?, ?, ?)').run(e.id, text, e.createdAt);
    return e;
  },

  nodes(): NodeRecord[] {
    return (db.prepare('SELECT * FROM nodes ORDER BY created_at').all() as Row[])
      .map((r) => ({ id: r.id, name: r.name, token: r.token, createdAt: r.created_at }));
  },
  saveNode(n: NodeRecord) {
    db.prepare(`INSERT INTO nodes (id, name, token, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name`).run(n.id, n.name, n.token, n.createdAt);
  },
  deleteNode(id: string) {
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    db.prepare('UPDATE agents SET node_id = NULL WHERE node_id = ?').run(id);
  },

  peers(): PeerRecord[] {
    return (db.prepare('SELECT * FROM peers ORDER BY created_at').all() as Row[]).map((r) => ({
      id: r.id, name: r.name ?? '', url: r.url ?? '', token: r.token, direction: r.direction, officeId: r.office_id ?? '',
      createdAt: r.created_at, local: !!r.local,
    }));
  },
  savePeer(p: PeerRecord) {
    db.prepare(`INSERT INTO peers (id, name, url, token, direction, office_id, created_at, local) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, office_id = excluded.office_id`)
      .run(p.id, p.name, p.url, p.token, p.direction, p.officeId, p.createdAt, p.local ? 1 : 0);
  },
  deletePeer(id: string) {
    db.prepare('DELETE FROM peers WHERE id = ?').run(id);
    db.prepare('DELETE FROM remote_tasks WHERE peer_id = ?').run(id);
  },

  remoteTasks(): RemoteTask[] {
    return (db.prepare('SELECT * FROM remote_tasks ORDER BY created_at DESC LIMIT 200').all() as Row[]).map((r) => ({
      id: r.id, peerId: r.peer_id, targetKind: r.target_kind, targetId: r.target_id, targetName: r.target_name, title: r.title,
      description: r.description ?? '', status: r.status, result: r.result ?? '', createdAt: r.created_at,
      finishedAt: r.finished_at ?? null,
    }));
  },
  saveRemoteTask(t: RemoteTask) {
    db.prepare(`INSERT INTO remote_tasks (id, peer_id, target_kind, target_id, target_name, title, description, status, result, created_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, result = excluded.result, finished_at = excluded.finished_at`)
      .run(t.id, t.peerId, t.targetKind, t.targetId, t.targetName, t.title, t.description, t.status, t.result, t.createdAt, t.finishedAt);
  },

  setting<T>(key: string, fallback: T): T {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
    return r ? (JSON.parse(r.value) as T) : fallback;
  },
  setSetting(key: string, value: unknown) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  },
};
