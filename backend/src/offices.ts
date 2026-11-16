import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket as ServerSocket } from 'ws';
import { assignRemoteTask, events, receiveVisitor } from './brain.js';
import { store } from './db.js';
import { hub } from './hub.js';
import type { Appearance, Directory, DirectoryAgent, PeerRecord, RemoteTask, Task } from './types.js';

interface Link {
  send: (msg: unknown) => void;
  close: (code?: number) => void;
  directory: Directory | null;
}

const links = new Map<string, Link>();
const outbox = new Map<string, unknown[]>();
const dialing = new Set<string>();
const FALLBACK_LOOK: Appearance = { skin: '#f1c9a5', hair: 'short', hairColor: '#3b2a20', shirt: '#4f8cff', eyes: 'normal', accessory: 'none' };

const feed = (text: string) => hub.broadcast({ type: 'feed', event: store.addFeed(text) });
const peerOf = (id: string) => store.peers().find((p) => p.id === id);

function officeId(): string {
  let id = store.setting('officeId', '');
  if (!id) {
    id = randomUUID();
    store.setSetting('officeId', id);
  }
  return id;
}

const officeName = () => store.setting('officeName', 'Mi oficina');

export const linkUrl = () =>
  store.setting('linkUrl', '') || process.env.LINK_PUBLIC_URL || `http://host.docker.internal:${process.env.LINK_PORT ?? 8090}`;

export function officesState() {
  return {
    office: { id: officeId(), name: officeName(), linkUrl: linkUrl() },
    peers: store.peers().map((p) => ({
      id: p.id, name: p.name, direction: p.direction, url: p.url, online: links.has(p.id), pending: !p.officeId,
      directory: links.get(p.id)?.directory ?? null,
    })),
    remoteTasks: store.remoteTasks(),
  };
}

export const publishOffices = () => hub.broadcast({ type: 'offices', offices: officesState() });

function directory(): Directory {
  return {
    boss: store.setting('playerName', 'Jefe'),
    agents: store.agents().map(({ id, name, role, teamId, appearance, companion, xp }) => ({ id, name, role, teamId, appearance, companion, xp })),
    teams: store.teams().map(({ id, name, color, leadId }) => ({ id, name, color, leadId })),
  };
}

function deliver(peerId: string, msg: unknown) {
  const link = links.get(peerId);
  if (link) link.send(msg);
  else outbox.set(peerId, [...(outbox.get(peerId) ?? []), msg].slice(-100));
}

function forget(peer: PeerRecord, reason: string) {
  links.get(peer.id)?.close();
  links.delete(peer.id);
  outbox.delete(peer.id);
  store.deletePeer(peer.id);
  if (peer.name) feed(reason);
  publishOffices();
}

function finishRemote(task: RemoteTask, peer: PeerRecord, status: 'done' | 'failed', result: string, agent?: DirectoryAgent) {
  store.saveRemoteTask(Object.assign(task, { status, result, finishedAt: Date.now() }));
  const known = links.get(peer.id)?.directory?.agents.find((a) => a.id === task.targetId);
  const who = agent ?? known;
  receiveVisitor({
    name: who?.name ?? task.targetName, office: peer.name, appearance: who?.appearance ?? FALLBACK_LOOK,
    companion: who?.companion ?? null, xp: who?.xp ?? 0,
  }, task.title, status === 'done', result);
}

function receive(peerId: string, msg: any) {
  const peer = peerOf(peerId);
  const link = links.get(peerId);
  if (!peer || !link) return;
  if (msg.type === 'hello') {
    if (msg.officeId === officeId() || (peer.officeId && peer.officeId !== msg.officeId)) {
      link.close(4401);
      return;
    }
    const first = !peer.officeId;
    store.savePeer({ ...peer, name: String(msg.name ?? 'Oficina').slice(0, 60), officeId: String(msg.officeId) });
    if (first) feed(`Conexión establecida con ${msg.name}`);
  } else if (msg.type === 'directory') {
    link.directory = msg.directory;
  } else if (msg.type === 'task') {
    const task = assignRemoteTask(
      { peerId, taskId: String(msg.id), office: peer.name || 'otra oficina' },
      msg.targetKind === 'team' ? 'team' : 'agent', String(msg.targetId), String(msg.title ?? '').slice(0, 200), String(msg.description ?? '').slice(0, 8000),
    );
    link.send(task
      ? { type: 'task-update', id: msg.id, status: 'working' }
      : { type: 'task-update', id: msg.id, status: 'failed', result: 'El destinatario ya no existe en esa oficina.' });
    return;
  } else if (msg.type === 'task-update') {
    const task = store.remoteTasks().find((t) => t.id === msg.id && t.peerId === peerId);
    if (!task || task.finishedAt) return;
    if (msg.status === 'done' || msg.status === 'failed') finishRemote(task, peer, msg.status, String(msg.result ?? ''), msg.agent);
    else store.saveRemoteTask(Object.assign(task, { status: 'working' }));
  } else if (msg.type === 'task-status') {
    const mine = store.tasks(500).filter((t) => t.origin?.peerId === peerId);
    for (const id of Array.isArray(msg.ids) ? msg.ids : []) {
      const task = mine.find((t) => t.origin?.taskId === id);
      if (!task) link.send({ type: 'task-update', id, status: 'failed', result: 'La otra oficina no tiene constancia de este encargo.' });
      else if (task.status === 'done' || task.status === 'failed') link.send(updateFor(task));
    }
    return;
  } else if (msg.type === 'bye') {
    forget(peer, `${peer.name} ha cerrado la conexión`);
    return;
  } else {
    return;
  }
  publishOffices();
}

function updateFor(task: Task) {
  const agent = directory().agents.find((a) => a.id === task.agentId);
  return { type: 'task-update', id: task.origin!.taskId, status: task.status, result: task.result, agent };
}

function established(peerId: string, link: Link) {
  links.get(peerId)?.close();
  links.set(peerId, link);
  link.send({ type: 'hello', officeId: officeId(), name: officeName() });
  link.send({ type: 'directory', directory: directory() });
  for (const msg of outbox.get(peerId) ?? []) link.send(msg);
  outbox.delete(peerId);
  const open = store.remoteTasks().filter((t) => t.peerId === peerId && !t.finishedAt).map((t) => t.id);
  if (open.length) link.send({ type: 'task-status', ids: open });
  publishOffices();
}

function dropped(peerId: string, link: Link) {
  if (links.get(peerId) !== link) return;
  links.delete(peerId);
  publishOffices();
}

const parse = (raw: unknown) => {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
};

export function acceptOffice(token: string, ws: ServerSocket) {
  const peer = token ? store.peers().find((p) => p.direction === 'in' && p.token === token) : undefined;
  if (!peer) {
    ws.close(4401);
    return;
  }
  const link: Link = {
    send: (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg)),
    close: (code) => ws.close(code ?? 1000),
    directory: null,
  };
  ws.on('message', (raw: Buffer) => {
    const msg = parse(raw);
    if (msg) receive(peer.id, msg);
  });
  ws.on('close', () => dropped(peer.id, link));
  established(peer.id, link);
}

function dial(peer: PeerRecord) {
  if (links.has(peer.id) || dialing.has(peer.id)) return;
  dialing.add(peer.id);
  const base = peer.url.replace(/\/+$/, '').replace(/^http/, 'ws');
  const ws = new WebSocket(`${base}/link/office?token=${encodeURIComponent(peer.token)}`);
  const link: Link = {
    send: (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
    close: () => ws.close(),
    directory: null,
  };
  ws.addEventListener('open', () => established(peer.id, link));
  ws.addEventListener('message', (e) => {
    const msg = parse(e.data);
    if (msg) receive(peer.id, msg);
  });
  ws.addEventListener('error', () => {});
  ws.addEventListener('close', (e) => {
    dialing.delete(peer.id);
    dropped(peer.id, link);
    const current = peerOf(peer.id);
    if (e.code === 4401 && current) forget(current, `${current.name} ya no acepta la conexión`);
  });
}

export function createInvite(url: string): string {
  const clean = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/.test(clean)) throw new Error('La dirección de enlace debe empezar por http:// o https://');
  store.setSetting('linkUrl', clean);
  const token = randomBytes(24).toString('hex');
  store.savePeer({ id: randomUUID(), name: '', url: '', token, direction: 'in', officeId: '', createdAt: Date.now() });
  publishOffices();
  return Buffer.from(JSON.stringify({ u: clean, t: token })).toString('base64url');
}

export function joinOffice(code: string) {
  let data: { u?: string; t?: string };
  try {
    data = JSON.parse(Buffer.from(code.trim(), 'base64url').toString('utf8'));
  } catch {
    throw new Error('El código de invitación no es válido.');
  }
  if (!data.u || !data.t || !/^https?:\/\//.test(data.u)) throw new Error('El código de invitación no es válido.');
  if (store.peers().some((p) => p.token === data.t)) throw new Error('Ese código ya está en uso en esta oficina.');
  const peer: PeerRecord = { id: randomUUID(), name: '', url: data.u, token: data.t, direction: 'out', officeId: '', createdAt: Date.now() };
  store.savePeer(peer);
  publishOffices();
  dial(peer);
}

export function leaveOffice(id: string) {
  const peer = peerOf(id);
  if (!peer) return;
  links.get(id)?.send({ type: 'bye' });
  setTimeout(() => forget(peer, `Has cerrado la conexión con ${peer.name}`), 150);
}

export function sendRemoteTask(peerId: string, targetKind: 'agent' | 'team', targetId: string, title: string, description: string): RemoteTask {
  const peer = peerOf(peerId);
  const link = links.get(peerId);
  if (!peer || !link) throw new Error('Esa oficina no está conectada ahora mismo.');
  const target = targetKind === 'team'
    ? link.directory?.teams.find((t) => t.id === targetId)
    : link.directory?.agents.find((a) => a.id === targetId);
  if (!target) throw new Error('El destinatario no existe en esa oficina.');
  const task: RemoteTask = {
    id: randomUUID(), peerId, targetKind, targetId, targetName: target.name, title, description, status: 'sent', result: '',
    createdAt: Date.now(), finishedAt: null,
  };
  store.saveRemoteTask(task);
  link.send({ type: 'task', id: task.id, targetKind, targetId, title, description });
  feed(`Envías un encargo a ${target.name} (${peer.name}): «${title}»`);
  publishOffices();
  return task;
}

export function renameOffice(name: string) {
  store.setSetting('officeName', name);
  for (const link of links.values()) link.send({ type: 'hello', officeId: officeId(), name });
  publishOffices();
}

export function startOffices() {
  let timer: NodeJS.Timeout | null = null;
  events.taskFinished = (task) => {
    if (task.origin) deliver(task.origin.peerId, updateFor(task));
  };
  events.directoryChanged = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const msg = { type: 'directory', directory: directory() };
      for (const link of links.values()) link.send(msg);
    }, 400);
  };
  const redial = () => store.peers().filter((p) => p.direction === 'out').forEach(dial);
  setInterval(redial, 8000);
  setInterval(() => {
    for (const link of links.values()) link.send({ type: 'ping' });
  }, 25000);
  redial();
}
