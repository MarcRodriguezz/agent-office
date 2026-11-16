export type ProviderKind = 'mock' | 'anthropic' | 'openai' | 'claude-code' | 'codex' | 'cli';

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
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

export type TaskStatus = 'queued' | 'working' | 'delegating' | 'done' | 'failed';

export interface Task {
  id: string;
  agentId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  result: string;
  createdAt: number;
  finishedAt: number | null;
  origin: TaskOrigin | null;
}

export interface TaskOrigin {
  peerId: string;
  taskId: string;
  office: string;
}

export interface FeedEvent {
  id: string;
  text: string;
  createdAt: number;
}

export type Intent = 'chat' | 'task' | 'plan' | 'synth' | 'test';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmJob {
  provider: Provider;
  system: string;
  messages: LlmMessage[];
  intent: Intent;
  agentName: string;
  hint?: { reports?: { id: string; name: string; role: string }[] };
}

export interface LlmResult {
  text: string;
}

export interface JobInfo {
  id: string;
  agentName: string;
  intent: Intent;
  provider: string;
  node: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  startedAt: number;
  ms: number | null;
  error: string;
}

export interface NodeRecord {
  id: string;
  name: string;
  token: string;
  createdAt: number;
}

export interface CliAuth {
  installed: boolean;
  version: string;
  loggedIn: boolean;
  detail: string;
}

export interface NodeInfo {
  host: string;
  concurrency: number;
  claude: CliAuth;
  codex: CliAuth;
}

export type LoginAction = 'claude-login' | 'claude-logout' | 'codex-login' | 'codex-logout';

export interface PeerRecord {
  id: string;
  name: string;
  url: string;
  token: string;
  direction: 'in' | 'out';
  officeId: string;
  createdAt: number;
}

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

export interface Visitor {
  id: string;
  name: string;
  office: string;
  appearance: Appearance;
  companion: Companion | null;
  xp: number;
}
