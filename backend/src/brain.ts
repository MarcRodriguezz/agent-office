import { randomUUID } from 'node:crypto';
import { levelOf, stageOf } from './companions.js';
import { store } from './db.js';
import { hub } from './hub.js';
import { complete } from './llm.js';
import { deskSeat, deskVisitor, map, mapData, nearestWalkable, setLayout, walkable, type Cell, type Desk } from './map.js';
import { addActor, cellOf, face, remap, removeActor, say, setStatus, walkTo, type Actor } from './sim.js';
import { staff, templateOf } from './seed.js';
import { currentSession, recordTurn, workFor } from './sessions.js';
import { publishSettings } from './settings.js';
import { toolOf } from './tools.js';
import type { Agent, Intent, LlmJob, Provider, Task, TaskOrigin, Team, Visitor } from './types.js';

interface Runtime {
  agent: Agent;
  actor: Actor;
  chain: Promise<unknown>;
  mind: Promise<unknown>;
  thinking: number;
  pending: number;
  epoch: number;
  wake: (() => void) | null;
  idling: boolean;
  nextIdleAt: number;
}

interface PlanItem {
  agentId: string;
  title: string;
  description: string;
}

const runtimes = new Map<string, Runtime>();
const visitors = new Map<string, Visitor>();
let visits: Promise<unknown> = Promise.resolve();
let player: Actor;

export const events = {
  taskFinished: (_task: Task) => {},
  directoryChanged: () => {},
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
const TASK_TAG = /\[\[\s*TAREA\s*:\s*([\s\S]+?)\]\]/i;

function feed(text: string) {
  hub.broadcast({ type: 'feed', event: store.addFeed(text) });
}

function celebrate(id: string, who: string, pet: string, before: number, after: number) {
  const level = levelOf(after);
  if (level <= levelOf(before)) return;
  const evolved = stageOf(level) > stageOf(levelOf(before));
  hub.broadcast({ type: 'levelup', actorId: id, level, evolved });
  feed(evolved ? `¡${pet}, el compi de ${who}, ha evolucionado!` : `${who} y ${pet} suben al nivel ${level}`);
}

function award(rt: Runtime, amount: number) {
  if (runtimes.get(rt.agent.id) !== rt) return;
  const before = rt.agent.xp;
  rt.agent.xp += amount;
  store.saveAgent(rt.agent);
  celebrate(rt.agent.id, rt.agent.name, rt.agent.companion.name, before, rt.agent.xp);
  publishAgents();
}

function awardPlayer(amount: number) {
  const before = store.setting('playerXp', 0);
  store.setSetting('playerXp', before + amount);
  const pet = store.setting<{ name: string } | null>('playerCompanion', null);
  if (pet) celebrate('player', store.setting('playerName', 'Jefe'), pet.name, before, before + amount);
  publishSettings();
}

function interrupt(rt: Runtime) {
  rt.epoch++;
  const wake = rt.wake;
  rt.wake = null;
  wake?.();
}

function pause(rt: Runtime, ms: number): Promise<boolean> {
  const epoch = rt.epoch;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      rt.wake = null;
      resolve(rt.epoch === epoch);
    }, ms);
    rt.wake = () => {
      clearTimeout(timer);
      resolve(false);
    };
  });
}

function settle(rt: Runtime) {
  if (rt.pending > 0 || runtimes.get(rt.agent.id) !== rt) return;
  const epoch = rt.epoch;
  setStatus(rt.actor, 'walking');
  void walkTo(rt.actor, deskSeat(rt.agent.desk)).then((ok) => {
    if (ok && rt.epoch === epoch) setStatus(rt.actor, 'idle');
  });
}

function enqueue<T>(rt: Runtime, fn: () => Promise<T>): Promise<T> {
  rt.pending++;
  interrupt(rt);
  const run = rt.chain.then(fn);
  rt.chain = run.catch((err) => console.error(`[${rt.agent.name}]`, err)).then(() => {
    rt.pending--;
    settle(rt);
  });
  return run;
}

function providerFor(agent: Agent): Provider {
  const id = agent.providerId ?? store.setting<string | null>('defaultProviderId', null);
  const provider = (id && store.provider(id)) || store.providers()[0];
  if (!provider) throw new Error('No hay ningún proveedor LLM configurado.');
  return agent.model ? { ...provider, model: agent.model } : provider;
}

function teamOf(agent: Agent): Team | undefined {
  return store.teams().find((t) => t.id === agent.teamId);
}

const managerId = () => store.setting<string | null>('managerId', null);

function reportsOf(agent: Agent): Agent[] {
  if (agent.id === managerId()) return store.agents().filter((a) => a.id !== agent.id && runtimes.has(a.id));
  const led = store.teams().filter((t) => t.leadId === agent.id).map((t) => t.id);
  return store.agents().filter((a) => a.id !== agent.id && a.teamId && led.includes(a.teamId) && runtimes.has(a.id));
}

function systemPrompt(agent: Agent): string {
  const boss = store.setting('playerName', 'Jefe');
  const team = teamOf(agent);
  const teams = store.teams();
  const manager = managerId();
  const mates = store.agents().filter((a) => a.id !== agent.id).map((a) => {
    const t = teams.find((x) => x.id === a.teamId);
    return `- ${a.name}: ${a.role}${t ? ` (${t.name}${t.leadId === a.id ? ', responsable' : ''})` : ''}${a.id === manager ? ' (dirige la oficina)' : ''}`;
  });
  return [
    `Eres ${agent.name}, ${agent.role} en una oficina. Tu jefe directo se llama ${boss} y es quien habla contigo.`,
    agent.personality ? `Personalidad: ${agent.personality}` : '',
    agent.id === manager ? 'Eres manager de toda la oficina: coordinas a todas las personas y departamentos, y respondes ante tu jefe.' : '',
    team ? `Perteneces al departamento «${team.name}»${team.leadId === agent.id ? ' y eres su responsable' : ''}.${team.mission ? ` Misión del departamento: ${team.mission}` : ''}` : '',
    mates.length ? `Compañeros de oficina:\n${mates.join('\n')}` : '',
    workContext(agent),
    agent.instructions ? `Instrucciones adicionales:\n${agent.instructions}` : '',
    'Habla como una persona real de la oficina: natural, directa y sin relleno. Responde en el idioma en el que te hablen.',
  ].filter(Boolean).join('\n\n');
}

const ACCESS_TEXT = {
  read: 'Puedes consultar los ficheros, pero no modificarlos ni ejecutar comandos.',
  edit: 'Puedes leer, crear y modificar ficheros.',
  full: 'Tienes libertad total: puedes modificar ficheros, ejecutar comandos e instalar lo que necesites.',
};

function workContext(agent: Agent): string {
  const project = agent.projectId ? store.projects().find((p) => p.id === agent.projectId) : undefined;
  const tools = store.connections().filter((c) => agent.connections.includes(c.id)).map((c) => {
    const def = toolOf(c.tool);
    return `- ${c.name}${c.bin ? ` (comando ${c.bin})` : ''}${def ? `: ${def.summary}` : ''}`;
  });
  return [
    project
      ? `Trabajas en el proyecto «${project.name}», cuya carpeta es tu directorio de trabajo.${project.description ? ` ${project.description}` : ''}`
      : 'Trabajas en la carpeta general de la oficina.',
    ACCESS_TEXT[agent.access],
    tools.length ? `Tienes acceso a estas herramientas externas (las credenciales ya están en tu entorno):\n${tools.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

const CHAT_RULES = [
  'Estás conversando en persona con tu jefe. Responde de forma breve (1 a 4 frases) salvo que te pida detalle.',
  'Si te encarga un trabajo que requiere elaboración (un informe, código, un análisis, un plan, un texto…), confirma en una frase y añade al final, en una línea aparte, exactamente: [[TAREA: descripción completa y autocontenida del encargo]]. Entonces irás a tu mesa a hacerlo y se lo entregarás al terminar.',
  'Para preguntas rápidas o charla, responde directamente y no uses esa etiqueta.',
].join('\n');

async function ask(agent: Agent, intent: Intent, prompt: string, hint?: LlmJob['hint']): Promise<string> {
  const result = await complete({
    provider: providerFor(agent), system: systemPrompt(agent), messages: [{ role: 'user', content: prompt }],
    intent, agentName: agent.name, hint, work: workFor(agent, null),
  }, agent.nodeId);
  return result.text;
}

function think(rt: Runtime, intent: Intent, prompt: string, rules = ''): Promise<string> {
  rt.thinking++;
  const run = rt.mind.then(async () => {
    const provider = providerFor(rt.agent);
    const session = currentSession(rt.agent, provider);
    const result = await complete({
      provider, system: rules ? `${systemPrompt(rt.agent)}\n\n${rules}` : systemPrompt(rt.agent),
      messages: [...session.history, { role: 'user', content: prompt }],
      intent, agentName: rt.agent.name, work: workFor(rt.agent, session),
    }, rt.agent.nodeId);
    recordTurn(session.id, prompt, result);
    return result.text;
  });
  rt.mind = run.catch(() => {}).finally(() => rt.thinking--);
  return run;
}

function remember(agent: Agent, prompt: string, text: string) {
  try {
    recordTurn(currentSession(agent, providerFor(agent)).id, prompt, { text });
  } catch {
    return;
  }
}

function post(rt: Runtime, text: string) {
  const message = store.addMessage(rt.agent.id, 'agent', text);
  hub.broadcast({ type: 'message', message });
  say(rt.actor, text, 6500);
}

export function createTask(agentId: string, parentId: string | null, title: string, description: string, origin: TaskOrigin | null = null): Task {
  const task = store.addTask(agentId, parentId, title, description, origin);
  hub.broadcast({ type: 'task', task });
  return task;
}

function updateTask(task: Task, patch: Partial<Task>) {
  Object.assign(task, patch);
  store.updateTask(task);
  hub.broadcast({ type: 'task', task });
}

const titleOf = (text: string) => {
  const line = text.trim().split('\n')[0];
  return line.length > 70 ? `${line.slice(0, 67)}…` : line;
};

async function reply(rt: Runtime, text: string) {
  say(rt.actor, rt.thinking ? 'Termino lo que tengo entre manos y te contesto' : '💭 …', 120000);
  try {
    const raw = await think(rt, 'chat', text, CHAT_RULES);
    const tag = raw.match(TASK_TAG);
    post(rt, raw.replace(TASK_TAG, '').trim() || 'Me pongo con ello.');
    award(rt, 4);
    if (tag && runtimes.get(rt.agent.id) === rt) {
      const task = createTask(rt.agent.id, null, titleOf(tag[1]), tag[1].trim());
      feed(`${rt.agent.name} acepta el encargo «${task.title}»`);
      void startTask(rt, task);
    }
  } catch (err) {
    post(rt, `⚠️ No he podido responder: ${err instanceof Error ? err.message : err}`);
  }
}

export function chat(agentId: string, text: string) {
  const rt = runtimes.get(agentId);
  if (!rt) return null;
  const message = store.addMessage(agentId, 'user', text);
  hub.broadcast({ type: 'message', message });
  say(player, text, 3500);
  void reply(rt, text);
  return message;
}

function spotNearPlayer(self: Actor): Cell {
  const cell = cellOf(player);
  if (sameCell(cell, map.bossSeat)) {
    const others = [...runtimes.values()].map((r) => r.actor).filter((a) => a !== self);
    return map.bossVisitors.find((s) => !others.some((a) => sameCell(cellOf(a), s))) ?? map.bossVisitors[0];
  }
  return nearestWalkable(cell[0], cell[1] + 1, cell) ?? cell;
}

function faceTowards(actor: Actor, target: Actor) {
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  if (Math.abs(dx) > Math.abs(dy)) face(actor, dx > 0 ? 'right' : 'left');
  else face(actor, dy > 0 ? 'down' : 'up');
}

async function goDesk(rt: Runtime) {
  setStatus(rt.actor, 'walking');
  await walkTo(rt.actor, deskSeat(rt.agent.desk));
}

function taskPrompt(task: Task): string {
  const parent = task.parentId ? store.task(task.parentId) : undefined;
  const lead = parent ? store.agents().find((a) => a.id === parent.agentId) : undefined;
  return [
    parent
      ? `${lead?.name ?? 'Tu responsable'} te encarga esta parte del proyecto «${parent.title}».`
      : task.origin
        ? `La oficina «${task.origin.office}», con la que colabora la vuestra, os ha encargado este trabajo.`
        : 'Tu jefe te ha encargado este trabajo.',
    `Título: ${task.title}`,
    `Encargo:\n${task.description || task.title}`,
    'Hazlo ahora y devuelve directamente el resultado final, completo y listo para entregar, en Markdown. No pidas aclaraciones: si falta algún dato, asume lo razonable e indícalo.',
  ].join('\n\n');
}

function planPrompt(task: Task, reports: Agent[]): string {
  return [
    'Tu jefe te ha encargado este trabajo y tú diriges un equipo.',
    `Título: ${task.title}`,
    `Encargo:\n${task.description || task.title}`,
    `Personas a tu cargo:\n${reports.map((r) => `- id "${r.id}" · ${r.name} · ${r.role}`).join('\n')}`,
    'Reparte el trabajo entre quienes aporten valor. Responde ÚNICAMENTE con JSON válido, sin texto alrededor, con esta forma:',
    '{"subtasks":[{"agentId":"<id>","title":"título corto","description":"instrucciones completas y autocontenidas"}]}',
    'Como máximo una subtarea por persona. Si el encargo es trivial y prefieres hacerlo tú, devuelve {"subtasks":[]}.',
  ].join('\n\n');
}

function parsePlan(raw: string, reports: Agent[]): PlanItem[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const seen = new Set<string>();
    const items: PlanItem[] = [];
    for (const item of Array.isArray(parsed?.subtasks) ? parsed.subtasks : []) {
      const ref = String(item?.agentId ?? item?.agent ?? '').toLowerCase();
      const target = reports.find((r) => r.id.toLowerCase() === ref || r.name.toLowerCase() === ref);
      if (!target || seen.has(target.id) || !item?.title) continue;
      seen.add(target.id);
      items.push({ agentId: target.id, title: titleOf(String(item.title)), description: String(item.description ?? item.title) });
    }
    return items;
  } catch {
    return [];
  }
}

async function delegate(rt: Runtime, task: Task, reports: Agent[]): Promise<string> {
  const { agent, actor } = rt;
  const plan = parsePlan(await ask(agent, 'plan', planPrompt(task, reports), {
    reports: reports.map((r) => ({ id: r.id, name: r.name, role: r.role })),
  }), reports).filter((item) => runtimes.has(item.agentId));
  if (!plan.length) return think(rt, 'task', taskPrompt(task));

  updateTask(task, { status: 'delegating' });
  feed(`${agent.name} convoca una reunión de equipo para «${task.title}»`);
  let over = false;
  let release = () => {};
  const released = new Promise<void>((r) => (release = r));
  const arrivals = plan.map((item, i) => new Promise<void>((arrived) => {
    const member = runtimes.get(item.agentId)!;
    void enqueue(member, async () => {
      if (over) return;
      setStatus(member.actor, 'walking');
      await walkTo(member.actor, map.meetingSeats[(i + 1) % map.meetingSeats.length]);
      setStatus(member.actor, 'talking');
      arrived();
      await released;
    });
  }));

  setStatus(actor, 'walking');
  say(actor, '📣 ¡Reunión de equipo!', 3500);
  await walkTo(actor, map.meetingSeats[0]);
  face(actor, 'down');
  setStatus(actor, 'talking');
  await Promise.race([Promise.all(arrivals), sleep(45000)]);

  const pending: Promise<Task>[] = [];
  for (const item of plan) {
    const member = runtimes.get(item.agentId);
    if (!member) continue;
    say(actor, `${member.agent.name}: ${item.title}`, 3400);
    await sleep(2800);
    say(member.actor, pick(['¡Hecho!', 'Me pongo con ello', 'Vale, lo tengo', 'Entendido 👍', 'Cuenta conmigo']), 2600);
    await sleep(1300);
    const sub = createTask(member.agent.id, task.id, item.title, item.description);
    feed(`${agent.name} encarga a ${member.agent.name}: «${item.title}»`);
    pending.push(startTask(member, sub));
  }
  over = true;
  release();

  await goDesk(rt);
  setStatus(actor, 'waiting');
  const subs = await Promise.all(pending);
  setStatus(actor, 'working');
  const names = new Map(store.agents().map((a) => [a.id, a.name]));
  const body = subs.map((s) =>
    `## ${names.get(s.agentId) ?? 'Compañero'} — ${s.title}\n${s.status === 'done' ? s.result : `NO ENTREGADO: ${s.result}`}`,
  ).join('\n\n');
  const text = await ask(agent, 'synth', [
    `Tu jefe te encargó: «${task.title}».`,
    `Encargo original:\n${task.description || task.title}`,
    `Tu equipo ha entregado estas partes:\n\n${body}`,
    'Intégralo todo en un único resultado final coherente y completo, en Markdown, listo para entregar al jefe. Corrige incoherencias y completa lo que falte.',
  ].join('\n\n'));
  remember(agent, taskPrompt(task), text);
  return text;
}

async function deliver(rt: Runtime, task: Task) {
  const { agent, actor } = rt;
  const ok = task.status === 'done';
  setStatus(actor, 'walking');
  if (task.parentId) {
    const parent = store.task(task.parentId);
    const lead = parent ? runtimes.get(parent.agentId) : undefined;
    if (!lead) return;
    await walkTo(actor, deskVisitor(lead.agent.desk));
    face(actor, 'up');
    setStatus(actor, 'talking');
    say(actor, ok ? `${lead.agent.name}, aquí tienes: ${task.title}` : `${lead.agent.name}, no he podido con «${task.title}»`, 3500);
    await sleep(2600);
    return;
  }
  if (task.origin) {
    await walkTo(actor, map.entrance);
    face(actor, 'down');
    setStatus(actor, 'talking');
    say(actor, ok ? `📨 Enviado a ${task.origin.office}: «${task.title}»` : `📨 Aviso a ${task.origin.office}: no ha salido «${task.title}»`, 4000);
    feed(ok ? `${agent.name} envía «${task.title}» a ${task.origin.office}` : `${agent.name} no ha podido completar el encargo de ${task.origin.office}`);
    await sleep(2600);
    return;
  }
  await walkTo(actor, spotNearPlayer(actor));
  faceTowards(actor, player);
  setStatus(actor, 'visiting');
  const message = store.addMessage(agent.id, 'agent', ok
    ? `✅ **${task.title}**\n\n${task.result}`
    : `❌ No he podido completar «${task.title}»: ${task.result}`);
  hub.broadcast({ type: 'message', message });
  hub.broadcast({ type: 'delivery', agentId: agent.id, taskId: task.id, title: task.title, ok });
  say(actor, ok ? `¡Listo! Te traigo «${task.title}»` : `Jefe, he tenido un problema con «${task.title}»`, 6000);
  feed(ok ? `${agent.name} entrega «${task.title}»` : `${agent.name} no ha podido completar «${task.title}»`);
  if (ok) awardPlayer(20);
  await pause(rt, 7000);
}

async function runTask(rt: Runtime, task: Task): Promise<Task> {
  const { agent, actor } = rt;
  updateTask(task, { status: 'working' });
  await goDesk(rt);
  setStatus(actor, 'working');
  try {
    const reports = task.parentId ? [] : reportsOf(agent);
    const result = reports.length ? await delegate(rt, task, reports) : await think(rt, 'task', taskPrompt(task));
    updateTask(task, { status: 'done', result, finishedAt: Date.now() });
    award(rt, task.parentId ? 35 : reports.length ? 60 : 45);
  } catch (err) {
    updateTask(task, { status: 'failed', result: err instanceof Error ? err.message : String(err), finishedAt: Date.now() });
  }
  if (task.origin) events.taskFinished(task);
  if (runtimes.get(agent.id) === rt) await deliver(rt, task);
  return task;
}

export function startTask(rt: Runtime, task: Task): Promise<Task> {
  return enqueue(rt, () => runTask(rt, task));
}

export function assignTask(agentId: string, title: string, description: string): Task | null {
  const rt = runtimes.get(agentId);
  if (!rt) return null;
  const task = createTask(agentId, null, titleOf(title), description);
  feed(`Encargas a ${rt.agent.name}: «${task.title}»`);
  void startTask(rt, task);
  return task;
}

function leadOf(teamId: string): { team: Team; lead: Agent } | null {
  const team = store.teams().find((t) => t.id === teamId);
  if (!team) return null;
  const members = store.agents().filter((a) => a.teamId === teamId);
  const lead = members.find((a) => a.id === team.leadId) ?? members[0];
  if (!lead) return null;
  if (team.leadId !== lead.id) {
    store.saveTeam({ ...team, leadId: lead.id });
    publishTeams();
  }
  return { team, lead };
}

export function assignTeamTask(teamId: string, title: string, description: string): Task | null {
  const found = leadOf(teamId);
  if (!found) return null;
  feed(`Encargo para el departamento ${found.team.name}: «${titleOf(title)}»`);
  return assignTask(found.lead.id, title, description);
}

export function assignRemoteTask(origin: TaskOrigin, kind: 'agent' | 'team', targetId: string, title: string, description: string): Task | null {
  const agentId = kind === 'team' ? leadOf(targetId)?.lead.id : targetId;
  const rt = agentId ? runtimes.get(agentId) : undefined;
  if (!rt) return null;
  const task = createTask(rt.agent.id, null, titleOf(title), description, origin);
  feed(`${origin.office} encarga a ${rt.agent.name}: «${task.title}»`);
  void startTask(rt, task);
  return task;
}

export const visitorList = () => [...visitors.values()];

async function visit(who: Omit<Visitor, 'id'>, title: string, ok: boolean, result: string) {
  const id = `visitor-${randomUUID()}`;
  visitors.set(id, { ...who, id });
  hub.broadcast({ type: 'visitors', visitors: visitorList() });
  const actor = addActor(id, 'visitor', map.entrance, null);
  try {
    setStatus(actor, 'walking');
    say(actor, `👋 Vengo de ${who.office}`, 3000);
    await walkTo(actor, spotNearPlayer(actor));
    faceTowards(actor, player);
    setStatus(actor, 'visiting');
    say(actor, ok ? `¡Hola! Te traigo «${title}»` : `Lo siento, no ha salido «${title}»`, 6000);
    hub.broadcast({
      type: 'dialog', name: `${who.name} · ${who.office}`, appearance: who.appearance, companion: who.companion, xp: who.xp,
      text: ok ? `✅ ${title}\n\n${result}` : `❌ No hemos podido completar «${title}»: ${result}`,
    });
    feed(ok ? `${who.name}, de ${who.office}, entrega «${title}»` : `${who.office} no ha podido completar «${title}»`);
    if (ok) awardPlayer(20);
    await sleep(8000);
    setStatus(actor, 'walking');
    await walkTo(actor, map.entrance);
  } finally {
    removeActor(id);
    visitors.delete(id);
    hub.broadcast({ type: 'visitors', visitors: visitorList() });
  }
}

export function receiveVisitor(who: Omit<Visitor, 'id'>, title: string, ok: boolean, result: string) {
  visits = visits.then(() => visit(who, title, ok, result)).catch((err) => console.error('[visita]', err));
}

export function summon(agentId: string): boolean {
  const rt = runtimes.get(agentId);
  if (!rt) return false;
  void enqueue(rt, async () => {
    setStatus(rt.actor, 'walking');
    say(rt.actor, '¡Voy!', 2000);
    await walkTo(rt.actor, spotNearPlayer(rt.actor));
    faceTowards(rt.actor, player);
    setStatus(rt.actor, 'visiting');
    say(rt.actor, pick(['¿Me llamabas?', 'Dime, jefe', 'Aquí estoy', '¿Qué necesitas?']), 4000);
    await pause(rt, 120000);
  });
  return true;
}

export function dismiss(agentId: string): boolean {
  const rt = runtimes.get(agentId);
  if (!rt) return false;
  interrupt(rt);
  settle(rt);
  return true;
}

const SMALL_TALK: [string, string][] = [
  ['¿Qué tal vas con lo tuyo?', 'Bien, avanzando poco a poco'],
  ['¿Un café luego?', '¡Venga, me apunto!'],
  ['¿Viste el correo del jefe?', 'Sí… habrá que ponerse 😅'],
  ['¿Me echas un ojo a una cosa?', 'Claro, enséñame'],
  ['Menudo día llevamos', 'Ya te digo, no paro'],
  ['¿Comemos juntos hoy?', 'Hecho, a las dos'],
];

async function idle(rt: Runtime) {
  rt.idling = true;
  const epoch = rt.epoch;
  const { actor } = rt;
  const alive = () => rt.epoch === epoch && rt.pending === 0 && runtimes.get(rt.agent.id) === rt;
  try {
    const roll = Math.random();
    if (roll < 0.4) {
      setStatus(actor, 'break');
      if (!(await walkTo(actor, pick(map.coffee))) || !alive()) return;
      face(actor, 'up');
      say(actor, '☕', 4000);
      if (!(await pause(rt, 5000))) return;
    } else if (roll < 0.75) {
      const free = [...runtimes.values()].filter((r) => r !== rt && r.actor.seated && r.pending === 0 && !r.idling);
      if (!free.length) return;
      const mate = pick(free);
      const [question, answer] = pick(SMALL_TALK);
      setStatus(actor, 'break');
      if (!(await walkTo(actor, deskVisitor(mate.agent.desk))) || !alive()) return;
      face(actor, 'up');
      say(actor, question, 3000);
      if (!(await pause(rt, 2600))) return;
      if (mate.actor.seated) say(mate.actor, answer, 3000);
      if (!(await pause(rt, 3200))) return;
    } else {
      setStatus(actor, 'break');
      if (!(await walkTo(actor, pick(map.hangouts))) || !alive()) return;
      say(actor, pick(['🤔', '📱', '🎧', '💡', '😌']), 3500);
      if (!(await pause(rt, 4500))) return;
    }
  } finally {
    rt.idling = false;
    settle(rt);
    rt.nextIdleAt = Date.now() + 20000 + Math.random() * 45000;
  }
}

function spawn(agent: Agent, at: Cell) {
  const seat = deskSeat(agent.desk);
  const actor = addActor(agent.id, 'agent', at, seat);
  const rt: Runtime = {
    agent, actor, chain: Promise.resolve(), mind: Promise.resolve(), thinking: 0, pending: 0, epoch: 0, wake: null, idling: false,
    nextIdleAt: Date.now() + 8000 + Math.random() * 40000,
  };
  runtimes.set(agent.id, rt);
  if (!sameCell(at, seat)) settle(rt);
}

export function publishAgents() {
  hub.broadcast({ type: 'agents', agents: store.agents() });
  events.directoryChanged();
}

export function publishTeams() {
  hub.broadcast({ type: 'teams', teams: store.teams() });
  events.directoryChanged();
}

export function hire(data: Omit<Agent, 'id' | 'desk' | 'createdAt' | 'xp'>): Agent | null {
  const others = store.agents();
  if (others.length >= map.desks.length) return null;
  const agent: Agent = { ...data, id: randomUUID(), desk: -1, xp: 0, createdAt: Date.now() };
  agent.desk = seats([...others, agent]).get(agent.id) ?? -1;
  if (agent.desk < 0) return null;
  store.saveAgent(agent);
  spawn(agent, map.entrance);
  reseat();
  say(runtimes.get(agent.id)!.actor, '¡Hola a todos! 👋', 4000);
  feed(`${agent.name} se incorpora como ${agent.role}`);
  publishAgents();
  return agent;
}

export function updateAgent(id: string, patch: Partial<Agent>): Agent | null {
  const rt = runtimes.get(id);
  if (!rt) return null;
  Object.assign(rt.agent, patch, { id, desk: rt.agent.desk, createdAt: rt.agent.createdAt, xp: rt.agent.xp });
  store.saveAgent(rt.agent);
  if ('teamId' in patch) reseat();
  publishAgents();
  return rt.agent;
}

export function fire(id: string): boolean {
  const rt = runtimes.get(id);
  if (!rt) return false;
  runtimes.delete(id);
  interrupt(rt);
  removeActor(id);
  store.deleteAgent(id);
  if (managerId() === id) {
    store.setSetting('managerId', null);
    publishSettings();
  }
  feed(`${rt.agent.name} deja la oficina`);
  publishAgents();
  publishTeams();
  return true;
}

const rank = (desk: Desk, agent: Agent) =>
  desk.agentId ? (desk.agentId === agent.id ? 0 : 4) : desk.teamId ? (desk.teamId === agent.teamId ? 1 : 3) : 2;

function seats(agents: Agent[]): Map<string, number> {
  const taken = new Set<number>();
  const plan = new Map<string, number>();
  const owners = new Set(map.desks.map((d) => d.agentId));
  const order = [...agents].sort((a, b) => Number(owners.has(b.id)) - Number(owners.has(a.id)) || a.createdAt - b.createdAt);
  for (const agent of order) {
    let best = -1;
    map.desks.forEach((desk, i) => {
      if (taken.has(i)) return;
      const better = best < 0 || rank(desk, agent) < rank(map.desks[best], agent);
      const same = best >= 0 && rank(desk, agent) === rank(map.desks[best], agent) && i === agent.desk;
      if (better || same) best = i;
    });
    if (best < 0) continue;
    taken.add(best);
    plan.set(agent.id, best);
  }
  return plan;
}

function reseat() {
  const plan = seats([...runtimes.values()].map((rt) => rt.agent));
  for (const rt of runtimes.values()) {
    const desk = plan.get(rt.agent.id) ?? rt.agent.desk;
    const seat = deskSeat(desk);
    const moved = desk !== rt.agent.desk || !rt.actor.seat || !sameCell(rt.actor.seat, seat);
    if (desk !== rt.agent.desk) {
      rt.agent.desk = desk;
      store.saveAgent(rt.agent);
    }
    rt.actor.seat = seat;
    if (moved && !rt.actor.moving && ['idle', 'working', 'waiting'].includes(rt.actor.status)) void walkTo(rt.actor, seat);
  }
}

export function applyLayout(input: unknown) {
  const teams = new Set(store.teams().map((t) => t.id));
  const people = new Set(store.agents().map((a) => a.id));
  const draft = input as { rooms?: { teamId?: string | null; agentId?: string | null }[] };
  for (const room of Array.isArray(draft?.rooms) ? draft.rooms : []) {
    if (room.teamId && !teams.has(room.teamId)) room.teamId = null;
    if (room.agentId && !people.has(room.agentId)) room.agentId = null;
  }
  store.setSetting('layout', setLayout(input, runtimes.size));
  player.seat = map.bossSeat;
  remap();
  reseat();
  hub.broadcast({ type: 'map', map: mapData() });
  publishAgents();
}

export function restaff(templateId: string) {
  const template = templateOf(templateId);
  if (!template) throw new Error('Esa plantilla de equipo no existe.');
  if (template.people.length > map.desks.length) {
    throw new Error(`La plantilla trae ${template.people.length} personas y el plano tiene ${map.desks.length} mesas: amplíalo en el modo arquitecto.`);
  }
  for (const [id, rt] of [...runtimes]) {
    runtimes.delete(id);
    interrupt(rt);
    removeActor(id);
    store.deleteAgent(id);
  }
  for (const team of store.teams()) store.deleteTeam(team.id);
  const agents = staff(template.id);
  const plan = seats(agents);
  for (const agent of agents) {
    agent.desk = plan.get(agent.id) ?? agent.desk;
    store.saveAgent(agent);
    spawn(agent, map.entrance);
  }
  feed(`Se incorpora la plantilla «${template.name}»`);
  publishAgents();
  publishTeams();
  publishSettings();
}

export type GoTarget =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'agent'; id: string }
  | { kind: 'spot'; id: string };

export function playerGo(target: GoTarget): Promise<boolean> {
  let cell: Cell | null = null;
  if (target.kind === 'cell') {
    const x = Math.round(target.x);
    const y = Math.round(target.y);
    cell = walkable(x, y) ? [x, y] : nearestWalkable(x, y);
  } else if (target.kind === 'agent') {
    const rt = runtimes.get(target.id);
    if (rt) {
      const at = cellOf(rt.actor);
      cell = rt.actor.seated ? deskVisitor(rt.agent.desk) : nearestWalkable(at[0], at[1] + 1, at);
    }
  } else {
    cell = map.furniture.find((f) => f.id === target.id)?.spot ?? null;
  }
  return cell ? walkTo(player, cell) : Promise.resolve(false);
}

export function playerStep(dx: number, dy: number) {
  const at = cellOf(player);
  if (walkable(at[0] + dx, at[1] + dy)) void walkTo(player, [at[0] + dx, at[1] + dy]);
  else if (!player.moving) face(player, dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
}

export function playerSay(text: string) {
  say(player, text, 3000);
}

export function initOffice() {
  player = addActor('player', 'player', map.bossSeat, map.bossSeat);
  const plan = seats(store.agents());
  for (const agent of store.agents()) {
    const desk = plan.get(agent.id) ?? agent.desk;
    if (desk !== agent.desk) store.saveAgent(Object.assign(agent, { desk }));
    spawn(agent, deskSeat(agent.desk));
  }
  setInterval(() => {
    const now = Date.now();
    for (const rt of runtimes.values()) {
      if (rt.pending === 0 && !rt.idling && !rt.actor.moving && rt.actor.seated && now > rt.nextIdleAt) void idle(rt);
    }
  }, 1000);
}
