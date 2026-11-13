import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Agent, Appearance, ChatMessage, FeedEvent, Provider, Task, Team } from './types.js';

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
    provider_id TEXT, model TEXT, team_id TEXT, appearance TEXT, desk INTEGER, created_at INTEGER
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
`);

type Row = Record<string, any>;

const toProvider = (r: Row): Provider => ({
  id: r.id, name: r.name, kind: r.kind, baseUrl: r.base_url ?? '', apiKey: r.api_key ?? '',
  model: r.model ?? '', command: r.command ?? '',
});

const toAgent = (r: Row): Agent => ({
  id: r.id, name: r.name, role: r.role, personality: r.personality ?? '', instructions: r.instructions ?? '',
  providerId: r.provider_id ?? null, model: r.model ?? '', teamId: r.team_id ?? null,
  appearance: JSON.parse(r.appearance) as Appearance, desk: r.desk, createdAt: r.created_at,
});

const toMessage = (r: Row): ChatMessage => ({
  id: r.id, agentId: r.agent_id, sender: r.sender, text: r.text, createdAt: r.created_at,
});

const toTask = (r: Row): Task => ({
  id: r.id, agentId: r.agent_id, parentId: r.parent_id ?? null, title: r.title, description: r.description ?? '',
  status: r.status, result: r.result ?? '', createdAt: r.created_at, finishedAt: r.finished_at ?? null,
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
    db.prepare(`INSERT INTO agents (id, name, role, personality, instructions, provider_id, model, team_id, appearance, desk, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, personality = excluded.personality,
      instructions = excluded.instructions, provider_id = excluded.provider_id, model = excluded.model,
      team_id = excluded.team_id, appearance = excluded.appearance, desk = excluded.desk`)
      .run(a.id, a.name, a.role, a.personality, a.instructions, a.providerId, a.model, a.teamId,
        JSON.stringify(a.appearance), a.desk, a.createdAt);
    return a;
  },
  deleteAgent(id: string) {
    db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    db.prepare('UPDATE teams SET lead_id = NULL WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM messages WHERE agent_id = ?').run(id);
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
  addTask(agentId: string, parentId: string | null, title: string, description: string): Task {
    const t: Task = {
      id: randomUUID(), agentId, parentId, title, description, status: 'queued', result: '',
      createdAt: Date.now(), finishedAt: null,
    };
    db.prepare('INSERT INTO tasks (id, agent_id, parent_id, title, description, status, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(t.id, agentId, parentId, title, description, t.status, '', t.createdAt);
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

  setting<T>(key: string, fallback: T): T {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
    return r ? (JSON.parse(r.value) as T) : fallback;
  },
  setSetting(key: string, value: unknown) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  },
};
