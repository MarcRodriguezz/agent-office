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

export interface Companion {
  species: string;
  name: string;
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
  nodeId: string | null;
  appearance: Appearance;
  companion: Companion;
  xp: number;
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
  origin: { peerId: string; taskId: string; office: string } | null;
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
  node: string;
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
  playerCompanion: Companion | null;
  playerXp: number;
  defaultProviderId: string | null;
  officeName: string;
}

export interface ActorSnap {
  id: string;
  kind: 'player' | 'agent' | 'visitor';
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  seated: boolean;
  bubble: string;
  status: Status;
}

export type RoomKind = 'boss' | 'meeting' | 'server' | 'hr' | 'work' | 'cafe' | 'office' | 'lounge';

export interface RoomDef {
  id: string;
  kind: RoomKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  teamId: string | null;
  agentId: string | null;
}

export interface Room extends RoomDef {
  floor: string;
}

export interface Layout {
  w: number;
  h: number;
  rooms: RoomDef[];
  doors: [number, number][];
}

export interface KindInfo {
  label: string;
  floor: string;
  min: [number, number];
  size: [number, number];
  unique?: boolean;
  required?: boolean;
}

export interface HubOffice {
  id: string;
  name: string;
  online: boolean;
  people: number;
  teams: number;
  working: number;
  links: { peerId: string; name: string; online: boolean; office: string | null }[];
}

export interface Furniture {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  block: boolean;
  interact?: 'llm' | 'hire' | 'tasks' | 'coffee' | 'offices';
  label?: string;
  spot?: [number, number];
}

export interface MapData {
  w: number;
  h: number;
  walls: number[];
  rooms: Room[];
  doors: [number, number][];
  furniture: Furniture[];
  bossSeat: [number, number];
  desks: { seat: [number, number]; visitor: [number, number]; roomId: string }[];
  kinds: Record<RoomKind, KindInfo>;
  limits: { minW: number; maxW: number; minH: number; maxH: number; rooms: number };
}

export type GoTarget =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'agent'; id: string }
  | { kind: 'spot'; id: string };

export interface CliAuth {
  installed: boolean;
  version: string;
  loggedIn: boolean;
  detail: string;
}

export interface NodeState {
  id: string;
  name: string;
  local: boolean;
  online: boolean;
  active: number;
  info: { host: string; concurrency: number; claude: CliAuth; codex: CliAuth } | null;
}

export type LoginAction = 'claude-login' | 'claude-logout' | 'codex-login' | 'codex-logout';

export interface DirectoryAgent {
  id: string;
  name: string;
  role: string;
  teamId: string | null;
  appearance: Appearance;
  companion: Companion;
  xp: number;
}

export interface Directory {
  boss: string;
  agents: DirectoryAgent[];
  teams: { id: string; name: string; color: string; leadId: string | null }[];
}

export interface PeerState {
  id: string;
  name: string;
  direction: 'in' | 'out';
  url: string;
  online: boolean;
  pending: boolean;
  local: boolean;
  directory: Directory | null;
}

export interface RemoteTask {
  id: string;
  peerId: string;
  targetKind: 'agent' | 'team';
  targetId: string;
  targetName: string;
  title: string;
  description: string;
  status: 'sent' | 'working' | 'done' | 'failed';
  result: string;
  createdAt: number;
  finishedAt: number | null;
}

export interface OfficesState {
  office: { id: string; name: string; linkUrl: string; linkBase: string };
  peers: PeerState[];
  remoteTasks: RemoteTask[];
}

export interface Visitor {
  id: string;
  name: string;
  office: string;
  appearance: Appearance;
  companion: Companion | null;
  xp: number;
}
