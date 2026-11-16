import Fastify from 'fastify';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Entry {
  port: number;
  db: string;
  createdAt: number;
}

interface Summary {
  officeId: string;
  name: string;
  people: number;
  teams: number;
  working: number;
  peers: { id: string; officeId: string; name: string; online: boolean; pending: boolean; local: boolean }[];
}

const FIRST_PORT = 3101;
const MAX_OFFICES = 24;
const mainDb = process.env.DB_PATH ?? './data/office.db';
const dataDir = dirname(mainDb);
const registryFile = join(dataDir, 'offices.json');
const serverEntry = join(dirname(fileURLToPath(import.meta.url)), 'server.js');
const text = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

mkdirSync(join(dataDir, 'offices'), { recursive: true });
let registry: Entry[] = existsSync(registryFile)
  ? JSON.parse(readFileSync(registryFile, 'utf8'))
  : [{ port: FIRST_PORT, db: mainDb, createdAt: Date.now() }];
const save = () => writeFileSync(registryFile, JSON.stringify(registry, null, 2));
save();

const children = new Map<number, ChildProcess>();

function start(entry: Entry, template = '') {
  const child = spawn(process.execPath, [serverEntry], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(entry.port), DB_PATH: entry.db, LINK_PREFIX: `/o/${entry.port}`, OFFICE_TEMPLATE: template },
  });
  children.set(entry.port, child);
  child.on('exit', (code) => {
    if (children.get(entry.port) !== child) return;
    children.delete(entry.port);
    if (!registry.some((e) => e.port === entry.port)) return;
    console.log(`la oficina ${entry.port} se ha parado (código ${code}); se reinicia`);
    setTimeout(() => registry.some((e) => e.port === entry.port) && !children.has(entry.port) && start(entry), 1500);
  });
}

async function call<T = any>(port: number, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `Error ${res.status}`);
  return data as T;
}

async function ready(port: number) {
  for (let i = 0; i < 60; i++) {
    if (await call(port, 'GET', '/api/health').then(() => true, () => false)) return true;
    await sleep(400);
  }
  return false;
}

const summary = (port: number) => call<Summary>(port, 'GET', '/api/summary').catch(() => null);

async function list() {
  const rows = await Promise.all(registry.map(async (e) => ({ entry: e, info: await summary(e.port) })));
  const byOffice = new Map(rows.filter((r) => r.info).map((r) => [r.info!.officeId, r.entry.port]));
  return rows.map(({ entry, info }) => ({
    id: String(entry.port),
    name: info?.name ?? 'Oficina',
    online: !!info,
    people: info?.people ?? 0,
    teams: info?.teams ?? 0,
    working: info?.working ?? 0,
    links: (info?.peers ?? []).filter((p) => !p.pending).map((p) => ({
      peerId: p.id, name: p.name, online: p.online, office: byOffice.has(p.officeId) ? String(byOffice.get(p.officeId)) : null,
    })),
  }));
}

const entryOf = (id: unknown) => registry.find((e) => String(e.port) === String(id));

async function peerBetween(a: Entry, b: Entry) {
  const [sa, sb] = await Promise.all([summary(a.port), summary(b.port)]);
  if (!sa || !sb) throw new Error('Una de las dos oficinas no responde ahora mismo.');
  return sa.peers.find((p) => p.officeId === sb.officeId) ?? null;
}

for (const entry of registry) start(entry);

const app = Fastify({ logger: { level: 'warn' } });

app.get('/api/health', async () => ({ ok: true }));
app.get('/internal/offices', async () => registry.map((e) => e.port));
app.get('/api/hub/offices', async () => list());

app.post('/api/hub/offices', async (req, reply) => {
  const name = text((req.body as any)?.name);
  if (!name) return reply.code(400).send({ error: 'La oficina necesita un nombre.' });
  if (registry.length >= MAX_OFFICES) return reply.code(409).send({ error: `Como mucho caben ${MAX_OFFICES} oficinas en esta instalación.` });
  let port = FIRST_PORT;
  while (registry.some((e) => e.port === port)) port++;
  const entry: Entry = { port, db: join(dataDir, 'offices', `${port}.db`), createdAt: Date.now() };
  registry.push(entry);
  save();
  start(entry, text((req.body as any)?.template, 40) || 'product');
  if (!(await ready(port))) return reply.code(500).send({ error: 'La oficina nueva no ha arrancado a tiempo.' });
  await call(port, 'PATCH', '/api/settings', { officeName: name });
  return { id: String(port) };
});

app.delete('/api/hub/offices/:id', async (req, reply) => {
  const entry = entryOf((req.params as { id: string }).id);
  if (!entry) return reply.code(404).send({ error: 'Oficina no encontrada.' });
  if (registry.length === 1) return reply.code(409).send({ error: 'No puedes eliminar la única oficina.' });
  await call(entry.port, 'POST', '/internal/close', {}).catch(() => null);
  await sleep(500);
  registry = registry.filter((e) => e !== entry);
  save();
  const child = children.get(entry.port);
  children.delete(entry.port);
  child?.kill('SIGTERM');
  await sleep(800);
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${entry.db}${suffix}`, { force: true });
  return { ok: true };
});

app.post('/api/hub/links', async (req, reply) => {
  const a = entryOf((req.body as any)?.a);
  const b = entryOf((req.body as any)?.b);
  if (!a || !b || a === b) return reply.code(400).send({ error: 'Elige dos oficinas distintas.' });
  try {
    if (await peerBetween(a, b)) return { ok: true };
    const { token } = await call<{ token: string }>(a.port, 'POST', '/internal/invite', {});
    await call(b.port, 'POST', '/internal/join', { url: `http://127.0.0.1:${a.port}`, token });
    return { ok: true };
  } catch (err) {
    return reply.code(409).send({ error: (err as Error).message });
  }
});

app.delete('/api/hub/links', async (req, reply) => {
  const a = entryOf((req.query as any)?.a);
  const b = entryOf((req.query as any)?.b);
  if (!a || !b) return reply.code(400).send({ error: 'Elige dos oficinas.' });
  try {
    const peer = await peerBetween(a, b);
    if (peer) await call(a.port, 'DELETE', `/api/offices/${peer.id}`);
    return { ok: true };
  } catch (err) {
    return reply.code(409).send({ error: (err as Error).message });
  }
});

const shutdown = () => {
  for (const child of children.values()) child.kill('SIGTERM');
  children.clear();
  registry = [];
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: 3000 });
console.log(`centralita en marcha con ${children.size} oficina(s)`);
