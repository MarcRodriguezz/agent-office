export type ProviderKind = 'mock' | 'anthropic' | 'openai' | 'claude-code' | 'codex' | 'cli';
export type Facing = 'down' | 'up' | 'left' | 'right';
export type Status = 'idle' | 'walking' | 'working' | 'thinking' | 'talking' | 'visiting' | 'waiting' | 'break';

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  hasKey: boolean;
  model: string;
  command: string;
}

export interface Appearance {
  skin: string;
  hair: string;
  hairColor: string;
  shirt: string;
  eyes: string;
  accessory: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  personality: string;
  instructions: string;
  providerId: string | null;
  model: string;
  teamId: string | null;
  appearance: Appearance;
  desk: number;
  createdAt: number;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  mission: string;
  leadId: string | null;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  sender: 'user' | 'agent';
  text: string;
  createdAt: number;
}

export interface Task {
  id: string;
  agentId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: 'queued' | 'working' | 'delegating' | 'done' | 'failed';
  result: string;
  createdAt: number;
  finishedAt: number | null;
}

export interface FeedEvent {
  id: string;
  text: string;
  createdAt: number;
}

export interface JobInfo {
  id: string;
  agentName: string;
  intent: string;
  provider: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  startedAt: number;
  ms: number | null;
  error: string;
}

export interface JobsState {
  jobs: JobInfo[];
  totals: { completed: number; failed: number };
  waiting: number;
  active: number;
}

export interface Settings {
  playerName: string;
  playerAppearance: Appearance | null;
  defaultProviderId: string | null;
}

export interface ActorSnap {
  id: string;
  kind: 'player' | 'agent';
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  seated: boolean;
  bubble: string;
  status: Status;
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
}

export interface Furniture {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  block: boolean;
  interact?: 'llm' | 'hire' | 'tasks' | 'coffee';
  label?: string;
  spot?: [number, number];
}

export interface MapData {
  w: number;
  h: number;
  walls: number[];
  rooms: Room[];
  furniture: Furniture[];
  bossSeat: [number, number];
  desks: { seat: [number, number]; visitor: [number, number] }[];
}

export type GoTarget =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'agent'; id: string }
  | { kind: 'spot'; id: string };
