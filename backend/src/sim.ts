import { hub } from './hub.js';
import { findPath, type Cell } from './map.js';

export type Facing = 'down' | 'up' | 'left' | 'right';
export type Status = 'idle' | 'walking' | 'working' | 'thinking' | 'talking' | 'visiting' | 'waiting' | 'break';

export interface Actor {
  id: string;
  kind: 'player' | 'agent' | 'visitor';
  x: number;
  y: number;
  path: Cell[];
  speed: number;
  facing: Facing;
  moving: boolean;
  seated: boolean;
  seat: Cell | null;
  bubble: string;
  bubbleUntil: number;
  status: Status;
  onArrive: ((ok: boolean) => void) | null;
}

const actors = new Map<string, Actor>();
let dirty = true;

export function addActor(id: string, kind: Actor['kind'], at: Cell, seat: Cell | null): Actor {
  const actor: Actor = {
    id, kind, x: at[0], y: at[1], path: [], speed: kind === 'player' ? 7 : 4.2, facing: 'down',
    moving: false, seated: false, seat, bubble: '', bubbleUntil: 0, status: 'idle', onArrive: null,
  };
  actor.seated = isAtSeat(actor);
  actors.set(id, actor);
  dirty = true;
  return actor;
}

export function removeActor(id: string) {
  const actor = actors.get(id);
  actor?.onArrive?.(false);
  actors.delete(id);
  dirty = true;
}

export const cellOf = (a: Actor): Cell => [Math.round(a.x), Math.round(a.y)];

const isAtSeat = (a: Actor) => !!a.seat && Math.abs(a.x - a.seat[0]) < 0.01 && Math.abs(a.y - a.seat[1]) < 0.01;

export function walkTo(actor: Actor, to: Cell): Promise<boolean> {
  const previous = actor.onArrive;
  actor.onArrive = null;
  previous?.(false);
  const path = findPath(cellOf(actor), to);
  if (!path) {
    actor.path = [];
    actor.moving = false;
    return Promise.resolve(false);
  }
  if (!path.length && Math.abs(actor.x - to[0]) < 0.01 && Math.abs(actor.y - to[1]) < 0.01) {
    actor.seated = isAtSeat(actor);
    dirty = true;
    return Promise.resolve(true);
  }
  actor.path = path.length ? path : [to];
  actor.moving = true;
  actor.seated = false;
  dirty = true;
  return new Promise((resolve) => {
    actor.onArrive = resolve;
  });
}

export function say(actor: Actor, text: string, ms = 4500) {
  actor.bubble = text.length > 140 ? `${text.slice(0, 137)}…` : text;
  actor.bubbleUntil = Date.now() + ms;
  dirty = true;
}

export function setStatus(actor: Actor, status: Status) {
  if (actor.status === status) return;
  actor.status = status;
  dirty = true;
}

export function face(actor: Actor, facing: Facing) {
  actor.facing = facing;
  dirty = true;
}

function step(actor: Actor, dt: number) {
  let budget = actor.speed * dt;
  while (budget > 0 && actor.path.length) {
    const [tx, ty] = actor.path[0];
    const dx = tx - actor.x;
    const dy = ty - actor.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) actor.facing = dx > 0 ? 'right' : 'left';
    else if (dist > 0.001) actor.facing = dy > 0 ? 'down' : 'up';
    if (dist <= budget) {
      actor.x = tx;
      actor.y = ty;
      actor.path.shift();
      budget -= dist;
    } else {
      actor.x += (dx / dist) * budget;
      actor.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  if (!actor.path.length) {
    actor.moving = false;
    actor.seated = isAtSeat(actor);
    if (actor.seated) actor.facing = 'down';
    const done = actor.onArrive;
    actor.onArrive = null;
    done?.(true);
  }
}

export function snapshot() {
  return [...actors.values()].map((a) => ({
    id: a.id, kind: a.kind, x: Math.round(a.x * 100) / 100, y: Math.round(a.y * 100) / 100, facing: a.facing,
    moving: a.moving, seated: a.seated, bubble: a.bubble, status: a.status,
  }));
}

export function startSim() {
  let last = Date.now();
  let lastSent = 0;
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    for (const actor of actors.values()) {
      if (actor.moving) {
        step(actor, dt);
        dirty = true;
      }
      if (actor.bubble && now > actor.bubbleUntil) {
        actor.bubble = '';
        dirty = true;
      }
    }
    if (dirty || now - lastSent > 2000) {
      hub.broadcast({ type: 'state', actors: snapshot() });
      dirty = false;
      lastSent = now;
    }
  }, 80);
}
