import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { store } from './db.js';
import { hub } from './hub.js';
import { complete, jobsState } from './llm.js';
import { mapData } from './map.js';
import { seed } from './seed.js';
import { snapshot, startSim } from './sim.js';
import {
  assignTask, assignTeamTask, chat, dismiss, fire, hire, initOffice, playerGo, playerSay, publishAgents,
  playerStep, publishTeams, summon, updateAgent, type GoTarget,
} from './brain.js';
import { cleanCompanion, randomCompanion } from './companions.js';
import { publishSettings, settings } from './settings.js';
import type { Provider, ProviderKind } from './types.js';

const KINDS: ProviderKind[] = ['mock', 'anthropic', 'openai', 'claude-code', 'codex', 'cli'];
const text = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const publicProvider = (p: Provider) => ({ ...p, apiKey: '', hasKey: !!p.apiKey });

const publishProviders = () => hub.broadcast({ type: 'providers', providers: store.providers().map(publicProvider) });

seed();
store.failUnfinishedTasks();
initOffice();
startSim();

const app = Fastify({ logger: { level: 'warn' } });
await app.register(websocket);

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/bootstrap', async () => ({
  map: mapData,
  actors: snapshot(),
  agents: store.agents(),
  teams: store.teams(),
  providers: store.providers().map(publicProvider),
  settings: settings(),
  tasks: store.tasks(),
  feed: store.feed(),
  jobs: jobsState(),
}));

app.get('/ws', { websocket: true }, (socket) => {
  hub.add(socket);
  hub.send(socket, { type: 'state', actors: snapshot() });
  socket.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'go') {
        void playerGo(msg.target as GoTarget).then((ok) => hub.send(socket, { type: 'arrived', token: msg.token, ok }));
      } else if (msg.type === 'step') {
        const dx = Math.sign(Number(msg.dx) || 0);
        const dy = dx ? 0 : Math.sign(Number(msg.dy) || 0);
        if (dx || dy) playerStep(dx, dy);
      } else if (msg.type === 'say') {
        playerSay(text(msg.text, 60));
      }
    } catch {
      return;
    }
  });
});

app.post('/api/agents', async (req, reply) => {
  const b = req.body as any;
  if (!text(b.name) || !b.appearance) return reply.code(400).send({ error: 'Faltan el nombre o el aspecto.' });
  const agent = hire({
    name: text(b.name, 40), role: text(b.role, 80) || 'Generalista', personality: text(b.personality),
    instructions: text(b.instructions), providerId: b.providerId || null, model: text(b.model, 120),
    teamId: b.teamId || null, appearance: b.appearance, companion: cleanCompanion(b.companion) ?? randomCompanion(),
  });
  if (!agent) return reply.code(409).send({ error: 'La oficina está llena: no quedan mesas libres.' });
  return agent;
});

app.patch('/api/agents/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = req.body as any;
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'role', 'personality', 'instructions', 'model']) if (typeof b[key] === 'string') patch[key] = text(b[key]);
  for (const key of ['providerId', 'teamId']) if (key in b) patch[key] = b[key] || null;
  if (b.appearance) patch.appearance = b.appearance;
  const companion = cleanCompanion(b.companion);
  if (companion) patch.companion = companion;
  const agent = updateAgent(id, patch);
  if (!agent) return reply.code(404).send({ error: 'Agente no encontrado.' });
  if ('teamId' in patch) {
    for (const team of store.teams()) {
      if (team.leadId === id && team.id !== agent.teamId) store.saveTeam({ ...team, leadId: null });
    }
    publishTeams();
  }
  return agent;
});

app.delete('/api/agents/:id', async (req, reply) => {
  if (!fire((req.params as { id: string }).id)) return reply.code(404).send({ error: 'Agente no encontrado.' });
  return { ok: true };
});

app.get('/api/agents/:id/messages', async (req) => store.messages((req.params as { id: string }).id));

app.post('/api/agents/:id/chat', async (req, reply) => {
  const message = chat((req.params as { id: string }).id, text((req.body as any).text, 8000));
  if (!message) return reply.code(404).send({ error: 'Agente no encontrado.' });
  return message;
});

app.post('/api/agents/:id/tasks', async (req, reply) => {
  const b = req.body as any;
  if (!text(b.title)) return reply.code(400).send({ error: 'La tarea necesita un título.' });
  const task = assignTask((req.params as { id: string }).id, text(b.title, 200), text(b.description, 8000));
  if (!task) return reply.code(404).send({ error: 'Agente no encontrado.' });
  return task;
});

app.post('/api/agents/:id/summon', async (req) => ({ ok: summon((req.params as { id: string }).id) }));
app.post('/api/agents/:id/dismiss', async (req) => ({ ok: dismiss((req.params as { id: string }).id) }));

app.get('/api/tasks', async () => store.tasks());

app.post('/api/teams', async (req, reply) => {
  const b = req.body as any;
  if (!text(b.name)) return reply.code(400).send({ error: 'El departamento necesita un nombre.' });
  const team = store.saveTeam({ name: text(b.name, 40), color: text(b.color, 9) || '#4f8cff', mission: text(b.mission), leadId: null });
  publishTeams();
  return team;
});

app.patch('/api/teams/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const team = store.teams().find((t) => t.id === id);
  if (!team) return reply.code(404).send({ error: 'Departamento no encontrado.' });
  const b = req.body as any;
  const next = {
    ...team,
    name: text(b.name, 40) || team.name,
    color: text(b.color, 9) || team.color,
    mission: typeof b.mission === 'string' ? text(b.mission) : team.mission,
    leadId: 'leadId' in b ? b.leadId || null : team.leadId,
  };
  store.saveTeam(next);
  if (Array.isArray(b.memberIds)) {
    const members = new Set<string>(b.memberIds);
    if (next.leadId) members.add(next.leadId);
    for (const agent of store.agents()) {
      if (members.has(agent.id) && agent.teamId !== id) updateAgent(agent.id, { teamId: id });
      else if (!members.has(agent.id) && agent.teamId === id) updateAgent(agent.id, { teamId: null });
    }
    for (const other of store.teams()) {
      if (other.id !== id && other.leadId && members.has(other.leadId)) store.saveTeam({ ...other, leadId: null });
    }
  }
  publishAgents();
  publishTeams();
  return next;
});

app.delete('/api/teams/:id', async (req) => {
  const { id } = req.params as { id: string };
  for (const agent of store.agents()) if (agent.teamId === id) updateAgent(agent.id, { teamId: null });
  store.deleteTeam(id);
  publishTeams();
  return { ok: true };
});

app.post('/api/teams/:id/tasks', async (req, reply) => {
  const b = req.body as any;
  if (!text(b.title)) return reply.code(400).send({ error: 'La tarea necesita un título.' });
  const task = assignTeamTask((req.params as { id: string }).id, text(b.title, 200), text(b.description, 8000));
  if (!task) return reply.code(409).send({ error: 'El departamento no tiene miembros todavía.' });
  return task;
});

function readProvider(b: any, current?: Provider): Omit<Provider, 'id'> | null {
  const kind = KINDS.includes(b.kind) ? (b.kind as ProviderKind) : current?.kind;
  if (!kind || !text(b.name ?? current?.name)) return null;
  return {
    name: text(b.name ?? current?.name, 60),
    kind,
    baseUrl: text(b.baseUrl ?? current?.baseUrl, 300),
    apiKey: text(b.apiKey, 500) || (b.clearKey ? '' : current?.apiKey ?? ''),
    model: text(b.model ?? current?.model, 120),
    command: text(b.command ?? current?.command, 500),
  };
}

app.post('/api/providers', async (req, reply) => {
  const data = readProvider(req.body);
  if (!data) return reply.code(400).send({ error: 'Faltan el nombre o el tipo del proveedor.' });
  const provider = store.saveProvider(data);
  if (!settings().defaultProviderId) store.setSetting('defaultProviderId', provider.id);
  publishProviders();
  publishSettings();
  return publicProvider(provider);
});

app.patch('/api/providers/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const current = store.provider(id);
  const data = current && readProvider(req.body, current);
  if (!data) return reply.code(404).send({ error: 'Proveedor no encontrado.' });
  const provider = store.saveProvider({ ...data, id });
  publishProviders();
  return publicProvider(provider);
});

app.delete('/api/providers/:id', async (req) => {
  const { id } = req.params as { id: string };
  store.deleteProvider(id);
  if (settings().defaultProviderId === id) store.setSetting('defaultProviderId', store.providers()[0]?.id ?? null);
  publishProviders();
  publishSettings();
  publishAgents();
  return { ok: true };
});

app.post('/api/providers/:id/test', async (req, reply) => {
  const provider = store.provider((req.params as { id: string }).id);
  if (!provider) return reply.code(404).send({ error: 'Proveedor no encontrado.' });
  const started = Date.now();
  try {
    const answer = await complete({
      provider, system: 'Eres un asistente de pruebas de conexión.', intent: 'test', agentName: 'Prueba de conexión',
      messages: [{ role: 'user', content: 'Responde únicamente con la palabra: OK' }],
    });
    return { ok: true, ms: Date.now() - started, answer: answer.slice(0, 200) };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
});

app.patch('/api/settings', async (req) => {
  const b = req.body as any;
  if (typeof b.playerName === 'string' && text(b.playerName)) store.setSetting('playerName', text(b.playerName, 40));
  if (b.playerAppearance) store.setSetting('playerAppearance', b.playerAppearance);
  const companion = cleanCompanion(b.playerCompanion);
  if (companion) store.setSetting('playerCompanion', companion);
  if ('defaultProviderId' in b && store.provider(b.defaultProviderId)) store.setSetting('defaultProviderId', b.defaultProviderId);
  publishSettings();
  return settings();
});

app.get('/api/jobs', async () => jobsState());

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
console.log('servidor de la oficina en marcha');
