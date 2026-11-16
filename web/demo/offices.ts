import { receiveVisitor } from '../../backend/src/brain.js';
import { SPECIES } from '../../backend/src/companions.js';
import { mock } from '../../backend/src/mock.js';
import { templateOf } from '../../backend/src/seed.js';
import { store } from './db';
import { hub } from './hub';

const ONLY_DOCKER = 'Esto necesita la instalación con Docker: la demo corre entera en tu navegador.';
const PEER = 'norte';
const template = templateOf('support')!;
const teams = template.teams.map(([name, color], i) => ({ id: `norte-equipo-${i}`, name, color, leadId: null as string | null }));
const agents = template.people.map((p, i) => {
  const id = `norte-${i}`;
  teams[p.team].leadId ??= id;
  return { id, name: p.name, role: p.role, teamId: teams[p.team].id, appearance: p.look, companion: { species: p.species, name: SPECIES[p.species] }, xp: 120 + i * 90 };
});
const remote: any[] = [];

const officeName = () => store.setting('officeName', 'Oficina de demostración');

export const linkUrl = () => 'http://tu-equipo:8090/o/3101';
export const setLinkBase = () => {};

export function officesState() {
  return {
    office: { id: 'demo', name: officeName(), linkUrl: linkUrl(), linkBase: 'http://tu-equipo:8090' },
    peers: [{ id: PEER, name: 'Oficina Norte', direction: 'out', url: '', online: true, pending: false, local: true, directory: { boss: 'Marc', agents, teams } }],
    remoteTasks: [...remote].reverse(),
  };
}

export const publishOffices = () => hub.broadcast({ type: 'offices', offices: officesState() });

export function officeSummary() {
  return {
    officeId: 'demo', name: officeName(), people: store.agents().length, teams: store.teams().length,
    working: store.tasks(60).filter((t: any) => !t.parentId && !t.finishedAt).length,
    peers: [{ id: PEER, officeId: 'norte', name: 'Oficina Norte', online: true, pending: false, local: true }],
  };
}

export function sendRemoteTask(_peerId: string, targetKind: 'agent' | 'team', targetId: string, title: string, description: string) {
  const team = teams.find((t) => t.id === targetId);
  const who = agents.find((a) => a.id === (targetKind === 'team' ? team?.leadId : targetId));
  if (!who) throw new Error('El destinatario no existe en esa oficina.');
  const task = {
    id: crypto.randomUUID(), peerId: PEER, targetKind, targetId, targetName: team?.name ?? who.name, title, description, status: 'sent', result: '',
    createdAt: Date.now(), finishedAt: null as number | null,
  };
  remote.push(task);
  hub.broadcast({ type: 'feed', event: store.addFeed(`Envías un encargo a ${task.targetName} (Oficina Norte): «${title}»`) });
  publishOffices();
  setTimeout(() => {
    task.status = 'working';
    publishOffices();
  }, 1500);
  setTimeout(() => void mock({ intent: 'task', agentName: who.name, messages: [], system: '', provider: {} as any }).then((result) => {
    Object.assign(task, { status: 'done', result, finishedAt: Date.now() });
    publishOffices();
    receiveVisitor({ name: who.name, office: 'Oficina Norte', appearance: who.appearance, companion: who.companion, xp: who.xp }, title, true, result);
  }), 7000);
  return task;
}

export function renameOffice(name: string) {
  store.setSetting('officeName', name);
  publishOffices();
}

const refuse = (): never => {
  throw new Error(ONLY_DOCKER);
};

export const createInvite = refuse;
export const inviteToken = refuse;
export const joinOffice = refuse;
export const joinWith = refuse;
export const leaveOffice = () => {};
export const closeAll = () => {};
export const startOffices = () => {};
