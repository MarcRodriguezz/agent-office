import { randomUUID } from 'node:crypto';
import { store } from './db.js';
import { hub } from './hub.js';
import { map } from './map.js';
import {
  ask, createTask, feed, gather, parsePlan, remember, runtimeAgent, speak, startTaskFor, titleOf,
} from './brain.js';
import type { Agent, Meeting, MeetingGoal, MeetingLine } from './types.js';

export const MEETING_LIMITS = { minPeople: 2, maxPeople: 8, maxRounds: 3 };
const GATHER_MS = 60000;
const LINE_MAX = 1500;
const OPEN: Meeting['status'][] = ['gathering', 'talking', 'writing'];

interface Live {
  meeting: Meeting;
  stop: 'none' | 'finish' | 'cancel';
  release: () => void;
}

let live: Live | null = null;
const planning = new Set<string>();

const GOAL_TEXT: Record<MeetingGoal, string> = {
  discuss: 'Debatir el tema y llegar a decisiones concretas.',
  spec: 'Definir entre todos una especificación: qué se construye, requisitos, decisiones técnicas, riesgos y quién hace qué.',
};

const MINUTES_TEXT: Record<MeetingGoal, string> = {
  discuss: 'Redacta el acta de la reunión en Markdown con estas secciones: ## Resumen, ## Decisiones, ## Siguientes pasos (cada uno con su responsable) y ## Temas abiertos.',
  spec: 'Redacta la especificación acordada en Markdown, lista para usarla como documento de trabajo, con estas secciones: ## Objetivo, ## Alcance, ## Requisitos, ## Decisiones técnicas, ## Riesgos y dudas abiertas y ## Reparto del trabajo (quién hace qué). Básate en lo hablado; lo que no se decidió, márcalo como pendiente.',
};

export const meetingList = () => store.meetings();

function publish(meeting: Meeting) {
  store.saveMeeting(meeting);
  hub.broadcast({ type: 'meeting', meeting });
}

function addLine(meeting: Meeting, speaker: string | null, text: string): MeetingLine {
  const line = { id: randomUUID(), speaker, text: text.trim().slice(0, LINE_MAX), at: Date.now() };
  meeting.lines.push(line);
  publish(meeting);
  return line;
}

const people = (meeting: Meeting) => meeting.agentIds.map(runtimeAgent).filter((a): a is Agent => !!a);

function nameOf(id: string | null): string {
  if (id === null) return `${store.setting('playerName', 'Jefe')} (jefe)`;
  return runtimeAgent(id)?.name ?? store.agents().find((a) => a.id === id)?.name ?? 'Alguien';
}

function chairOf(meeting: Meeting): Agent | undefined {
  const present = people(meeting);
  const manager = store.setting<string | null>('managerId', null);
  const leads = new Set(store.teams().map((t) => t.leadId));
  return present.find((a) => a.id === manager) ?? present.find((a) => leads.has(a.id)) ?? present[0];
}

function transcript(meeting: Meeting): string {
  if (!meeting.lines.length) return '(Nadie ha hablado todavía: abres tú la reunión.)';
  return meeting.lines.slice(-40).map((l) => `${nameOf(l.speaker)}: ${l.text}`).join('\n\n');
}

function header(meeting: Meeting): string {
  const boss = store.setting('playerName', 'Jefe');
  return [
    `Estás en una reunión que ha convocado tu jefe, ${boss}. Participan:\n${people(meeting).map((a) => `- ${a.name}: ${a.role}`).join('\n')}`,
    `Tema: ${meeting.title}`,
    meeting.brief ? `Contexto que da el jefe:\n${meeting.brief}` : '',
    `Objetivo: ${GOAL_TEXT[meeting.goal]}`,
  ].filter(Boolean).join('\n\n');
}

function turnPrompt(meeting: Meeting, round: number): string {
  return [
    header(meeting),
    `Ronda ${round} de ${meeting.rounds}.${round === meeting.rounds ? ' Es la última: cierra posturas y propón acuerdos.' : ''}`,
    `Conversación hasta ahora:\n\n${transcript(meeting)}`,
    'Te toca intervenir. Aporta desde tu rol en 2 a 5 frases: propuestas concretas, dudas o acuerdos. Responde a lo que hayan dicho los demás y, sobre todo, a lo que pida el jefe. No repitas lo ya dicho, no saludes ni te despidas y no uses encabezados. Escribe solo tu intervención, sin tu nombre delante.',
  ].join('\n\n');
}

function minutesPrompt(meeting: Meeting): string {
  return [
    header(meeting),
    `Conversación completa:\n\n${transcript(meeting)}`,
    `Has moderado la reunión. ${MINUTES_TEXT[meeting.goal]} Usa títulos, párrafos y listas; no uses tablas.`,
  ].join('\n\n');
}

const preview = (text: string) => (text.length > 130 ? `${text.slice(0, 127)}…` : text);

async function run(state: Live) {
  const { meeting } = state;
  const ids = meeting.agentIds;
  const cancelled = () => state.stop === 'cancel';
  const stopped = () => state.stop !== 'none';
  const room = gather(ids, map.meetingSeats, 'talking');
  state.release = room.release;
  feed(`Reunión en marcha: «${meeting.title}»`);
  try {
    await Promise.race([room.arrived, new Promise((r) => setTimeout(r, GATHER_MS))]);
    if (cancelled()) return;
    meeting.status = 'talking';
    publish(meeting);
    for (let round = 1; round <= meeting.rounds && !stopped(); round++) {
      for (const id of ids) {
        if (stopped()) break;
        const agent = runtimeAgent(id);
        if (!agent) continue;
        speak(id, '💭 …', 120000);
        const text = (await ask(agent, 'meeting', turnPrompt(meeting, round))).trim();
        if (cancelled()) return;
        addLine(meeting, id, text || 'Nada que añadir por mi parte.');
        speak(id, preview(text), 9000);
      }
    }
    if (cancelled()) return;
    const chair = chairOf(meeting);
    if (!chair) throw new Error('No queda nadie en la reunión para redactar el acta.');
    meeting.status = 'writing';
    publish(meeting);
    speak(chair.id, meeting.goal === 'spec' ? 'Redacto la especificación 📝' : 'Redacto el acta 📝', 120000);
    meeting.result = (await ask(chair, 'minutes', minutesPrompt(meeting))).trim();
    meeting.status = 'done';
    meeting.finishedAt = Date.now();
    publish(meeting);
    speak(chair.id, '¡Listo! Os lo dejo en la reunión', 4000);
    for (const agent of people(meeting)) remember(agent, `Reunión «${meeting.title}» (${GOAL_TEXT[meeting.goal]})`, meeting.result);
    feed(`${chair.name} cierra la reunión «${meeting.title}»`);
  } catch (err) {
    meeting.status = 'failed';
    meeting.result = err instanceof Error ? err.message : String(err);
    meeting.finishedAt = Date.now();
    publish(meeting);
    feed(`La reunión «${meeting.title}» no ha podido terminar`);
  } finally {
    if (cancelled() && OPEN.includes(meeting.status)) {
      meeting.status = 'cancelled';
      meeting.finishedAt = Date.now();
      publish(meeting);
      feed(`Se suspende la reunión «${meeting.title}»`);
    }
    room.release();
    if (live === state) live = null;
  }
}

export function startMeeting(input: { title: string; brief: string; goal: MeetingGoal; agentIds: string[]; rounds: number }): Meeting {
  if (live) throw new Error(`Ya hay una reunión en curso: «${live.meeting.title}». Termínala antes de convocar otra.`);
  const ids = [...new Set(input.agentIds)].filter((id) => runtimeAgent(id));
  if (ids.length < MEETING_LIMITS.minPeople) throw new Error('Una reunión necesita al menos dos personas.');
  if (ids.length > Math.min(MEETING_LIMITS.maxPeople, map.meetingSeats.length)) {
    throw new Error(`En la sala caben como mucho ${Math.min(MEETING_LIMITS.maxPeople, map.meetingSeats.length)} personas.`);
  }
  const meeting: Meeting = {
    id: randomUUID(), title: titleOf(input.title), brief: input.brief, goal: input.goal, agentIds: ids,
    rounds: Math.max(1, Math.min(MEETING_LIMITS.maxRounds, Math.round(input.rounds) || 1)),
    status: 'gathering', lines: [], result: '', taskIds: [], createdAt: Date.now(), finishedAt: null,
  };
  publish(meeting);
  live = { meeting, stop: 'none', release: () => {} };
  void run(live);
  return meeting;
}

const find = (id: string) => (live?.meeting.id === id ? live : null);

export function interject(id: string, text: string): MeetingLine | null {
  const state = find(id);
  if (!state || state.meeting.status === 'writing') return null;
  speak('player', preview(text), 6000);
  return addLine(state.meeting, null, text);
}

export function finishMeeting(id: string): boolean {
  const state = find(id);
  if (!state || state.stop !== 'none') return false;
  state.stop = 'finish';
  return true;
}

export function cancelMeeting(id: string): boolean {
  const state = find(id);
  if (!state) return false;
  state.stop = 'cancel';
  if (state.meeting.status === 'gathering') state.release();
  return true;
}

export function forgetMeeting(id: string): boolean {
  if (find(id)) return false;
  store.deleteMeeting(id);
  hub.broadcast({ type: 'meetings', meetings: meetingList() });
  return true;
}

export async function meetingTasks(id: string): Promise<Meeting> {
  const meeting = store.meetings(500).find((m) => m.id === id);
  if (!meeting || meeting.status !== 'done') throw new Error('La reunión todavía no tiene un documento final.');
  if (meeting.taskIds.length || planning.has(id)) throw new Error('El trabajo de esta reunión ya está repartido.');
  const team = people(meeting);
  const chair = chairOf(meeting);
  if (!chair) throw new Error('No queda nadie de la reunión en la oficina.');
  planning.add(id);
  try {
    const raw = await ask(chair, 'plan', [
      `De la reunión «${meeting.title}» salió este documento:\n\n${meeting.result}`,
      `Personas que estaban en la reunión:\n${team.map((a) => `- id "${a.id}" · ${a.name} · ${a.role}`).join('\n')}`,
      'Reparte el trabajo acordado entre ellas. Responde ÚNICAMENTE con JSON válido, sin texto alrededor, con esta forma:',
      '{"subtasks":[{"agentId":"<id>","title":"título corto","description":"instrucciones completas y autocontenidas"}]}',
      'Como máximo una tarea por persona y solo para quien tenga algo que hacer.',
    ].join('\n\n'), { reports: team.map((a) => ({ id: a.id, name: a.name, role: a.role })) });
    const plan = parsePlan(raw, team);
    if (!plan.length) throw new Error(`${chair.name} no ha sabido repartir el trabajo. Prueba otra vez o encárgalo a mano.`);
    for (const item of plan) {
      const task = createTask(item.agentId, null, item.title, `${item.description}\n\nContexto: documento de la reunión «${meeting.title}».\n\n${meeting.result}`);
      meeting.taskIds.push(task.id);
      void startTaskFor(item.agentId, task);
    }
    publish(meeting);
    feed(`Sale trabajo de la reunión «${meeting.title}» para ${plan.length} ${plan.length === 1 ? 'persona' : 'personas'}`);
    return meeting;
  } finally {
    planning.delete(id);
  }
}

export function closeStaleMeetings() {
  for (const meeting of store.meetings(500)) {
    if (!OPEN.includes(meeting.status)) continue;
    store.saveMeeting({ ...meeting, status: 'failed', result: 'Interrumpida por un reinicio del servidor.', finishedAt: Date.now() });
  }
}
