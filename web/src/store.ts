import { useSyncExternalStore } from 'react';
import type {
  ActorSnap, Agent, ChatMessage, FeedEvent, JobsState, MapData, Provider, Settings, Task, Team,
} from './types';

export type Modal =
  | { kind: 'settings'; tab?: 'providers' | 'profile' | 'jobs' }
  | { kind: 'people' }
  | { kind: 'album' }
  | { kind: 'agent'; id?: string; teamId?: string }
  | { kind: 'tasks'; taskId?: string }
  | null;

export interface Toast {
  id: string;
  text: string;
  ok: boolean;
  agentId?: string;
}

export interface State {
  ready: boolean;
  connected: boolean;
  map: MapData | null;
  agents: Agent[];
  teams: Team[];
  providers: Provider[];
  settings: Settings;
  tasks: Task[];
  feed: FeedEvent[];
  jobs: JobsState;
  messages: Record<string, ChatMessage[]>;
  selectedAgentId: string | null;
  modal: Modal;
  toasts: Toast[];
  dialog: { agentId: string; text: string } | null;
}

export interface RenderActor extends ActorSnap {
  rx: number;
  ry: number;
  px: number;
  py: number;
  pmoving: boolean;
  pfacing: 'left' | 'right';
  seed: number;
}

export interface Effect {
  actorId: string;
  at: number;
  level: number;
  evolved: boolean;
}

let state: State = {
  ready: false,
  connected: false,
  map: null,
  agents: [],
  teams: [],
  providers: [],
  settings: { playerName: 'Jefe', playerAppearance: null, playerCompanion: null, playerXp: 0, defaultProviderId: null },
  tasks: [],
  feed: [],
  jobs: { jobs: [], totals: { completed: 0, failed: 0 }, waiting: 0, active: 0 },
  messages: {},
  selectedAgentId: null,
  modal: null,
  toasts: [],
  dialog: null,
};

const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export const world = {
  actors: new Map<string, RenderActor>(),
  effects: [] as Effect[],
};

export function applyActors(snaps: ActorSnap[]) {
  const seen = new Set<string>();
  snaps.forEach((snap, i) => {
    seen.add(snap.id);
    const current = world.actors.get(snap.id);
    if (current) Object.assign(current, snap);
    else {
      world.actors.set(snap.id, {
        ...snap, rx: snap.x, ry: snap.y, px: snap.x + 0.8, py: snap.y, pmoving: false, pfacing: 'left', seed: i * 1.7,
      });
    }
  });
  for (const id of world.actors.keys()) if (!seen.has(id)) world.actors.delete(id);
}

export function toast(text: string, ok = true, agentId?: string) {
  const id = Math.random().toString(36).slice(2);
  setState((s) => ({ toasts: [...s.toasts, { id, text, ok, agentId }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 7000);
}
