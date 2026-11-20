import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { store } from './db.js';
import { hub } from './hub.js';
import { complete, jobsState } from './llm.js';
import { DEFAULT_LAYOUT, mapData } from './map.js';
import { snapshot } from './sim.js';
import {
  applyLayout, switchLang, assignTask, assignTeamTask, chat, dismiss, fire, hire, playerGo, playerSay, publishAgents,
  playerStep, publishTeams, restaff, summon, updateAgent, visitorList, type GoTarget,
} from './brain.js';
import { createNode, isRemote, nodesState, refreshNode, removeNode, startTerm, termInput, termKill } from './nodes.js';
import {
  closeAll, createInvite, inviteToken, joinOffice, joinWith, leaveOffice, linkUrl, officeSummary, officesState, publishOffices,
  renameOffice, sendRemoteTask, setLinkBase,
} from './offices.js';
import { cleanCompanion, randomCompanion } from './companions.js';
import { templateList } from './seed.js';
import { publishSettings, settings } from './settings.js';
import {
  closeCurrent, closeSession, forgetSession, projectFolder, publicConnection, publishConnections, publishProjects, publishSessions,
  reopenSession, sessionList,
} from './sessions.js';
import { BIN, ENV_KEY, TOOLS, toolOf } from './tools.js';
import { cancelMeeting, finishMeeting, forgetMeeting, interject, meetingList, meetingTasks, startMeeting } from './meetings.js';
import { partyUntil, startParty } from './party.js';
import type { Access, Provider, ProviderKind } from './types.js';
import { isLang, lang, relabel, t, tr } from './i18n.js';

const KINDS: ProviderKind[] = ['mock', 'anthropic', 'openai', 'claude-code', 'codex', 'cli'];
const ACCESS: Access[] = ['read', 'edit', 'full'];
const RESERVED = new Set(['PATH', 'HOME', 'USER', 'SHELL', 'PWD', 'NODE_OPTIONS', 'NODE_ENV', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'NPM_CONFIG_PREFIX', 'WORKSPACE_DIR']);
const text = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const access = (v: unknown): Access => (ACCESS.includes(v as Access) ? (v as Access) : 'read');
const projectId = (v: unknown) => (typeof v === 'string' && store.projects().some((p) => p.id === v) ? v : null);
const connectionIds = (v: unknown) => {
  const known = new Set(store.connections().map((c) => c.id));
  return Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && known.has(id)))] : [];
};
const publicProvider = (p: Provider) => ({ ...p, apiKey: '', hasKey: !!p.apiKey });

const publishProviders = () => hub.broadcast({ type: 'providers', providers: store.providers().map(publicProvider) });

export function clientMessage(socket: WebSocket, msg: any) {
  if (msg.type === 'go') {
    void playerGo(msg.target as GoTarget).then((ok) => hub.send(socket, { type: 'arrived', token: msg.token, ok }));
  } else if (msg.type === 'step') {
    const dx = Math.sign(Number(msg.dx) || 0);
    const dy = dx ? 0 : Math.sign(Number(msg.dy) || 0);
    if (dx || dy) playerStep(dx, dy);
  } else if (msg.type === 'say') {
    playerSay(text(msg.text, 60));
  } else if (msg.type === 'term-start') {
    hub.send(socket, { type: 'term-started', ref: msg.ref, sid: startTerm(socket, text(msg.nodeId, 80), text(msg.tool, 40), msg.action) });
  } else if (msg.type === 'term-input') {
    termInput(socket, text(msg.sid, 80), String(msg.data ?? '').slice(0, 2000));
  } else if (msg.type === 'term-kill') {
    termKill(socket, text(msg.sid, 80));
  }
}

export function registerRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/bootstrap', async () => ({
    map: mapData(),
    actors: snapshot(),
    agents: store.agents(),
    teams: store.teams(),
    providers: store.providers().map(publicProvider),
    settings: settings(),
    templates: templateList(),
    tasks: store.tasks(),
    feed: store.feed(),
    jobs: jobsState(),
    nodes: nodesState(),
    offices: officesState(),
    visitors: visitorList(),
    projects: store.projects(),
    connections: store.connections().map(publicConnection),
    sessions: sessionList(),
    tools: TOOLS.map((tool) => ({ ...tool, summary: tr(tool.summary), fields: tool.fields?.map((f) => ({ ...f, label: tr(f.label) })) })),
    meetings: meetingList(),
    party: partyUntil(),
  }));

  app.get('/api/summary', async () => officeSummary());

  app.post('/internal/invite', async () => ({ token: inviteToken(true) }));

  app.post('/internal/join', async (req, reply) => {
    try {
      joinWith(text((req.body as any).url, 300), text((req.body as any).token, 200));
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/internal/close', async () => {
    closeAll();
    return { ok: true };
  });

  app.post('/api/agents', async (req, reply) => {
    const b = req.body as any;
    if (!text(b.name) || !b.appearance) return reply.code(400).send({ error: t('Faltan el nombre o el aspecto.') });
    const agent = hire({
      name: text(b.name, 40), role: text(b.role, 80) || t('Generalista'), personality: text(b.personality),
      instructions: text(b.instructions), providerId: b.providerId || null, model: text(b.model, 120),
      teamId: b.teamId || null, nodeId: isRemote(b.nodeId) ? b.nodeId : null, appearance: b.appearance, companion: cleanCompanion(b.companion) ?? randomCompanion(),
      projectId: projectId(b.projectId), access: access(b.access), connections: connectionIds(b.connections),
    });
    if (!agent) return reply.code(409).send({ error: t('No quedan mesas libres: amplía la oficina en el modo arquitecto.') });
    return agent;
  });

  app.patch('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as any;
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'role', 'personality', 'instructions', 'model']) if (typeof b[key] === 'string') patch[key] = text(b[key]);
    for (const key of ['providerId', 'teamId']) if (key in b) patch[key] = b[key] || null;
    if (b.appearance) patch.appearance = b.appearance;
    if ('nodeId' in b) patch.nodeId = isRemote(b.nodeId) ? b.nodeId : null;
    if ('projectId' in b) patch.projectId = projectId(b.projectId);
    if ('access' in b) patch.access = access(b.access);
    if ('connections' in b) patch.connections = connectionIds(b.connections);
    const companion = cleanCompanion(b.companion);
    if (companion) patch.companion = companion;
    const agent = updateAgent(id, patch);
    if (!agent) return reply.code(404).send({ error: t('Agente no encontrado.') });
    if ('teamId' in patch) {
      for (const team of store.teams()) {
        if (team.leadId === id && team.id !== agent.teamId) store.saveTeam({ ...team, leadId: null });
      }
      publishTeams();
    }
    return agent;
  });

  app.delete('/api/agents/:id', async (req, reply) => {
    if (!fire((req.params as { id: string }).id)) return reply.code(404).send({ error: t('Agente no encontrado.') });
    publishSessions();
    return { ok: true };
  });

  app.post('/api/agents/:id/session/new', async (req, reply) => {
    const agent = store.agents().find((a) => a.id === (req.params as { id: string }).id);
    if (!agent) return reply.code(404).send({ error: t('Agente no encontrado.') });
    closeCurrent(agent);
    return { ok: true };
  });

  app.post('/api/projects', async (req, reply) => {
    const b = req.body as any;
    const name = text(b.name, 60);
    if (!name) return reply.code(400).send({ error: t('El proyecto necesita un nombre.') });
    const project = store.saveProject({ id: randomUUID(), name, folder: projectFolder(name), description: text(b.description, 2000), createdAt: Date.now() });
    publishProjects();
    return project;
  });

  app.patch('/api/projects/:id', async (req, reply) => {
    const current = store.projects().find((p) => p.id === (req.params as { id: string }).id);
    if (!current) return reply.code(404).send({ error: t('Proyecto no encontrado.') });
    const b = req.body as any;
    const project = store.saveProject({
      ...current,
      name: text(b.name, 60) || current.name,
      description: typeof b.description === 'string' ? text(b.description, 2000) : current.description,
    });
    publishProjects();
    publishAgents();
    return project;
  });

  app.delete('/api/projects/:id', async (req) => {
    store.deleteProject((req.params as { id: string }).id);
    publishProjects();
    publishSessions();
    publishAgents();
    return { ok: true };
  });

  function readEnv(input: unknown, current: Record<string, string> = {}): Record<string, string> {
    const env: Record<string, string> = { ...current };
    if (!input || typeof input !== 'object') return env;
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (!ENV_KEY.test(key) || RESERVED.has(key)) continue;
      if (value === null) delete env[key];
      else if (typeof value === 'string' && value.trim()) env[key] = value.trim().slice(0, 4000);
    }
    return env;
  }

  app.post('/api/connections', async (req, reply) => {
    const b = req.body as any;
    const tool = toolOf(text(b.tool, 40));
    const bin = tool?.bin ?? text(b.bin, 40).toLowerCase();
    const name = text(b.name, 60) || tool?.name || '';
    if (!name) return reply.code(400).send({ error: t('La conexión necesita un nombre.') });
    if (bin && !BIN.test(bin)) return reply.code(400).send({ error: t('El comando solo puede llevar letras, números, puntos y guiones.') });
    const connection = store.saveConnection({ id: randomUUID(), name, tool: tool?.id ?? 'custom', bin, env: readEnv(b.env), createdAt: Date.now() });
    publishConnections();
    return publicConnection(connection);
  });

  app.patch('/api/connections/:id', async (req, reply) => {
    const current = store.connections().find((c) => c.id === (req.params as { id: string }).id);
    if (!current) return reply.code(404).send({ error: t('Conexión no encontrada.') });
    const b = req.body as any;
    const bin = current.tool === 'custom' && typeof b.bin === 'string' ? text(b.bin, 40).toLowerCase() : current.bin;
    if (bin && !BIN.test(bin)) return reply.code(400).send({ error: t('El comando solo puede llevar letras, números, puntos y guiones.') });
    const connection = store.saveConnection({ ...current, name: text(b.name, 60) || current.name, bin, env: readEnv(b.env, current.env) });
    publishConnections();
    publishAgents();
    return publicConnection(connection);
  });

  app.delete('/api/connections/:id', async (req) => {
    const { id } = req.params as { id: string };
    store.deleteConnection(id);
    for (const agent of store.agents()) {
      if (agent.connections.includes(id)) updateAgent(agent.id, { connections: agent.connections.filter((c) => c !== id) });
    }
    publishConnections();
    return { ok: true };
  });

  app.post('/api/sessions/:id/close', async (req, reply) => {
    if (!closeSession((req.params as { id: string }).id)) return reply.code(404).send({ error: t('Sesión no encontrada.') });
    return { ok: true };
  });

  app.post('/api/sessions/:id/open', async (req, reply) => {
    const session = store.session((req.params as { id: string }).id);
    const agent = session && store.agents().find((a) => a.id === session.agentId);
    if (!session || !agent) return reply.code(404).send({ error: t('Sesión no encontrada.') });
    const provider = store.provider(agent.providerId ?? settings().defaultProviderId ?? '') ?? store.providers()[0];
    if (provider && provider.kind !== session.kind) {
      return reply.code(409).send({ error: t('Esta sesión se hizo con otro cerebro. Cambia el de {name} para continuarla.', { name: agent.name }) });
    }
    if ((agent.nodeId ?? null) !== session.nodeId) {
      return reply.code(409).send({ error: t('Esta sesión vive en otro servidor. Cambia dónde se ejecuta {name} para continuarla.', { name: agent.name }) });
    }
    reopenSession(session.id);
    if (agent.projectId !== session.projectId) updateAgent(agent.id, { projectId: session.projectId });
    return { ok: true };
  });

  app.delete('/api/sessions/:id', async (req) => {
    forgetSession((req.params as { id: string }).id);
    return { ok: true };
  });

  app.get('/api/agents/:id/messages', async (req) => store.messages((req.params as { id: string }).id));

  app.post('/api/meetings', async (req, reply) => {
    const b = req.body as any;
    if (!text(b.title, 200)) return reply.code(400).send({ error: t('La reunión necesita un tema.') });
    try {
      return startMeeting({
        title: text(b.title, 200), brief: text(b.brief, 6000), goal: b.goal === 'spec' ? 'spec' : 'discuss',
        agentIds: Array.isArray(b.agentIds) ? b.agentIds.filter((id: unknown): id is string => typeof id === 'string') : [],
        rounds: Number(b.rounds) || 1,
      });
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post('/api/meetings/:id/say', async (req, reply) => {
    const line = interject((req.params as { id: string }).id, text((req.body as any).text, 2000));
    if (!line) return reply.code(409).send({ error: t('Esta reunión ya no admite intervenciones.') });
    return line;
  });

  app.post('/api/meetings/:id/finish', async (req, reply) => {
    if (!finishMeeting((req.params as { id: string }).id)) return reply.code(409).send({ error: t('Esta reunión ya está terminando.') });
    return { ok: true };
  });

  app.post('/api/meetings/:id/cancel', async (req, reply) => {
    if (!cancelMeeting((req.params as { id: string }).id)) return reply.code(409).send({ error: t('Esta reunión no está en curso.') });
    return { ok: true };
  });

  app.post('/api/meetings/:id/tasks', async (req, reply) => {
    try {
      return await meetingTasks((req.params as { id: string }).id);
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.delete('/api/meetings/:id', async (req, reply) => {
    if (!forgetMeeting((req.params as { id: string }).id)) return reply.code(409).send({ error: t('No se puede borrar una reunión en curso.') });
    return { ok: true };
  });

  app.post('/api/party', async () => ({ until: startParty() }));

  app.post('/api/agents/:id/chat', async (req, reply) => {
    const message = chat((req.params as { id: string }).id, text((req.body as any).text, 8000));
    if (!message) return reply.code(404).send({ error: t('Agente no encontrado.') });
    return message;
  });

  app.post('/api/agents/:id/tasks', async (req, reply) => {
    const b = req.body as any;
    if (!text(b.title)) return reply.code(400).send({ error: t('La tarea necesita un título.') });
    const task = assignTask((req.params as { id: string }).id, text(b.title, 200), text(b.description, 8000));
    if (!task) return reply.code(404).send({ error: t('Agente no encontrado.') });
    return task;
  });

  app.post('/api/agents/:id/summon', async (req) => ({ ok: summon((req.params as { id: string }).id) }));
  app.post('/api/agents/:id/dismiss', async (req) => ({ ok: dismiss((req.params as { id: string }).id) }));

  app.get('/api/tasks', async () => store.tasks());

  app.post('/api/teams', async (req, reply) => {
    const b = req.body as any;
    if (!text(b.name)) return reply.code(400).send({ error: t('El departamento necesita un nombre.') });
    const team = store.saveTeam({ name: text(b.name, 40), color: text(b.color, 9) || '#4f8cff', mission: text(b.mission), leadId: null });
    publishTeams();
    return team;
  });

  app.patch('/api/teams/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const team = store.teams().find((t) => t.id === id);
    if (!team) return reply.code(404).send({ error: t('Departamento no encontrado.') });
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
    if (!text(b.title)) return reply.code(400).send({ error: t('La tarea necesita un título.') });
    const task = assignTeamTask((req.params as { id: string }).id, text(b.title, 200), text(b.description, 8000));
    if (!task) return reply.code(409).send({ error: t('El departamento no tiene miembros todavía.') });
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
    if (!data) return reply.code(400).send({ error: t('Faltan el nombre o el tipo del proveedor.') });
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
    if (!data) return reply.code(404).send({ error: t('Proveedor no encontrado.') });
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
    if (!provider) return reply.code(404).send({ error: t('Proveedor no encontrado.') });
    const started = Date.now();
    try {
      const answer = await complete({
        provider, system: t('Eres un asistente de pruebas de conexión.'), intent: 'test', agentName: t('Prueba de conexión'),
        messages: [{ role: 'user', content: t('Responde únicamente con la palabra: OK') }],
      }, text((req.body as any)?.nodeId, 80) || null);
      return { ok: true, ms: Date.now() - started, answer: answer.text.slice(0, 200) };
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
    if ('managerId' in b && (!b.managerId || store.agents().some((a) => a.id === b.managerId))) {
      store.setSetting('managerId', b.managerId || null);
      publishAgents();
    }
    if (isLang(b.lang) && b.lang !== lang()) {
      switchLang(b.lang);
      renameOffice(relabel(settings().officeName, b.lang));
      publishProviders();
    }
    if (typeof b.officeName === 'string' && text(b.officeName)) renameOffice(text(b.officeName, 60));
    if (typeof b.linkUrl === 'string' && /^https?:\/\/\S+$/.test(text(b.linkUrl))) {
      setLinkBase(text(b.linkUrl, 300));
      publishOffices();
    }
    publishSettings();
    return settings();
  });

  app.put('/api/layout', async (req, reply) => {
    try {
      applyLayout((req.body as any)?.reset ? structuredClone(DEFAULT_LAYOUT) : (req.body as any)?.layout);
      return mapData();
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/staff', async (req, reply) => {
    try {
      restaff(text((req.body as any)?.template, 40));
      return { ok: true };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.get('/api/jobs', async () => jobsState());

  const nodeSetup = (token: string) => ({ officeUrl: linkUrl(), token });

  app.post('/api/nodes', async (req, reply) => {
    const name = text((req.body as any).name, 40);
    if (!name) return reply.code(400).send({ error: t('El servidor necesita un nombre.') });
    const node = createNode(name);
    return { id: node.id, ...nodeSetup(node.token) };
  });

  app.get('/api/nodes/:id/setup', async (req, reply) => {
    const node = store.nodes().find((n) => n.id === (req.params as { id: string }).id);
    if (!node) return reply.code(404).send({ error: t('Servidor no encontrado.') });
    return nodeSetup(node.token);
  });

  app.post('/api/nodes/:id/refresh', async (req) => {
    refreshNode((req.params as { id: string }).id);
    return { ok: true };
  });

  app.delete('/api/nodes/:id', async (req) => {
    const { id } = req.params as { id: string };
    for (const agent of store.agents()) if (agent.nodeId === id) updateAgent(agent.id, { nodeId: null });
    removeNode(id);
    return { ok: true };
  });

  app.post('/api/offices/invite', async (req, reply) => {
    try {
      return { code: createInvite(text((req.body as any).url, 300)) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/offices/join', async (req, reply) => {
    try {
      joinOffice(text((req.body as any).code, 2000));
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.delete('/api/offices/:id', async (req) => {
    leaveOffice((req.params as { id: string }).id);
    return { ok: true };
  });

  app.post('/api/offices/:id/tasks', async (req, reply) => {
    const b = req.body as any;
    if (!text(b.title)) return reply.code(400).send({ error: t('La tarea necesita un título.') });
    try {
      return sendRemoteTask((req.params as { id: string }).id, b.targetKind === 'team' ? 'team' : 'agent', text(b.targetId, 80), text(b.title, 200), text(b.description, 8000));
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });
}
