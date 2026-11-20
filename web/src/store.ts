import { useSyncExternalStore } from 'react';
import type {
  ActorSnap, Agent, Appearance, ChatMessage, Companion, Connection, FeedEvent, HubOffice, JobsState, MapData, Meeting, NodeState, OfficesState, Project, Provider,
  Settings, StaffTemplate, Task, Team, ToolDef, Visitor, WorkSession,
} from './types';
import { t } from './i18n';

export type Modal =
  | { kind: 'settings'; tab?: 'providers' | 'tools' | 'nodes' | 'profile' | 'jobs' }
  | { kind: 'projects'; projectId?: string }
  | { kind: 'meetings'; meetingId?: string }
  | { kind: 'offices'; tab?: 'mine' | 'work' | 'outside' }
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
  dialog: Dialog | null;
  nodes: NodeState[];
  offices: OfficesState;
  visitors: Visitor[];
  hub: HubOffice[];
  templates: StaffTemplate[];
  projects: Project[];
  connections: Connection[];
  sessions: WorkSession[];
  tools: ToolDef[];
  meetings: Meeting[];
  party: number;
  officeId: string;
  architect: boolean;
  roomId: string | null;
}

export interface Dialog {
  agentId?: string;
  guest?: { name: string; appearance: Appearance; companion: Companion | null; xp: number };
  text: string;
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
  settings: { playerName: t('Jefe'), playerAppearance: null, playerCompanion: null, playerXp: 0, defaultProviderId: null, officeName: t('Mi oficina'), managerId: null },
  tasks: [],
  feed: [],
  jobs: { jobs: [], totals: { completed: 0, failed: 0 }, waiting: 0, active: 0 },
  messages: {},
  selectedAgentId: null,
  modal: null,
  toasts: [],
  dialog: null,
  nodes: [],
  offices: { office: { id: '', name: '', linkUrl: '', linkBase: '' }, peers: [], remoteTasks: [] },
  visitors: [],
  hub: [],
  templates: [],
  projects: [],
  connections: [],
  sessions: [],
  tools: [],
  meetings: [],
  party: 0,
  officeId: '',
  architect: false,
  roomId: null,
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
