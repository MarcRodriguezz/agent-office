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
  status: 'waiting' | 'active' | 'completed' | 'failed';
  startedAt: number;
  ms: number | null;
  error: string;
}
