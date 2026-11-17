import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { toolBox, workRoot, type ToolBox } from './agent-tools.js';
import { mock } from './mock.js';
import type { LlmJob, LlmMessage, LlmResult } from './types.js';

const WORKSPACE = process.env.WORKSPACE_DIR ?? '/workspace';
const API_TIMEOUT_MS = 5 * 60 * 1000;
const CLI_TIMEOUT_MS = 12 * 60 * 1000;
const MAX_STEPS = 40;
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

function normalize(messages: LlmMessage[]): LlmMessage[] {
  const out = messages.filter((m) => m.content.trim());
  while (out.length && out[0].role !== 'user') out.shift();
  return out.length ? out : [{ role: 'user', content: 'Hola' }];
}

const cwdOf = (job: LlmJob) => (job.work ? workRoot(WORKSPACE, job.work.folder) : (mkdirSync(WORKSPACE, { recursive: true }), WORKSPACE));
const envOf = (job: LlmJob) => job.work?.env ?? {};
const boxOf = (job: LlmJob): ToolBox | null => (job.work ? toolBox(cwdOf(job), job.work.access, job.work.env, job.work.bins) : null);
const lastOf = (job: LlmJob) => normalize(job.messages).at(-1)?.content ?? '';

async function anthropic(job: LlmJob): Promise<LlmResult> {
  const { provider } = job;
  const client = new Anthropic({
    apiKey: provider.apiKey || process.env.ANTHROPIC_API_KEY,
    ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
  });
  const model = provider.model || 'claude-opus-5-5';
  const box = boxOf(job);
  const tools = box?.specs.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as Anthropic.Tool.InputSchema }));
  const system = box ? `${job.system}\n\n${box.guide}` : job.system;
  const messages: Anthropic.MessageParam[] = normalize(job.messages);
  const send = (last: boolean): Promise<Anthropic.Message> => {
    const base = {
      model, max_tokens: 32000, system, messages,
      ...(tools?.length ? { tools, ...(last ? { tool_choice: { type: 'none' as const } } : {}) } : {}),
    };
    return FALLBACK_MODELS.has(model) && !provider.baseUrl
      ? client.beta.messages.stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as any).finalMessage() as unknown as Promise<Anthropic.Message>
      : client.messages.stream(base).finalMessage();
  };
  try {
    for (let step = 0; ; step++) {
      const message = await send(step >= MAX_STEPS);
      if (message.stop_reason === 'refusal') throw new Error('El modelo ha rechazado la petición.');
      const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (message.stop_reason === 'tool_use' && uses.length && box && step < MAX_STEPS) {
        messages.push({ role: 'assistant', content: message.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const use of uses) results.push({ type: 'tool_result', tool_use_id: use.id, content: await box.call(use.name, use.input) });
        messages.push({ role: 'user', content: results });
        continue;
      }
      const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      if (!text) throw new Error('El modelo no ha devuelto texto.');
      return { text };
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Anthropic: API key inválida o ausente.');
    if (err instanceof Anthropic.NotFoundError) throw new Error(`Anthropic: el modelo "${model}" no existe.`);
    if (err instanceof Anthropic.RateLimitError) throw new Error('Anthropic: límite de peticiones alcanzado, inténtalo más tarde.');
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic ${err.status ?? ''}: ${err.message}`);
    throw err;
  }
}

async function openaiCompatible(job: LlmJob): Promise<LlmResult> {
  const { provider } = job;
  const baseUrl = (provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const key = provider.apiKey || process.env.OPENAI_API_KEY || '';
  let box = boxOf(job);
  const messages: any[] = [{ role: 'system', content: box ? `${job.system}\n\n${box.guide}` : job.system }, ...normalize(job.messages)];
  for (let step = 0; ; step++) {
    const tools = box && step < MAX_STEPS
      ? box.specs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }))
      : undefined;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model: provider.model, messages, ...(tools ? { tools } : {}) }),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`No se pudo conectar con ${baseUrl}: ${err instanceof Error ? err.message : err}`);
    }
    const body = await res.text();
    if (!res.ok && tools && step === 0 && /tool|function/i.test(body)) {
      box = null;
      messages[0].content = job.system;
      continue;
    }
    if (!res.ok) throw new Error(`${provider.name} respondió ${res.status}: ${body.slice(0, 300)}`);
    const message = JSON.parse(body)?.choices?.[0]?.message;
    const calls: any[] = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (calls.length && box && tools) {
      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let input: unknown = {};
        try {
          input = JSON.parse(call.function?.arguments || '{}');
        } catch {
          input = {};
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: await box.call(call.function?.name, input) });
      }
      continue;
    }
    const text = message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('El modelo no ha devuelto texto.');
    return { text: text.trim() };
  }
}

function flatten(job: LlmJob): string {
  const messages = normalize(job.messages);
  const parts = [`[INSTRUCCIONES]\n${job.system}`];
  if (messages.length === 1) parts.push(`[PETICIÓN]\n${messages[0].content}`);
  else {
    parts.push(`[CONVERSACIÓN]\n${messages.map((m) => `${m.role === 'user' ? 'Jefe' : 'Tú'}: ${m.content}`).join('\n\n')}`);
    parts.push('Responde ahora al último mensaje del jefe. Devuelve solo tu respuesta.');
  }
  return parts.join('\n\n');
}

const resumed = (job: LlmJob) => `[CONTEXTO ACTUAL]\n${job.system}\n\n[PETICIÓN]\n${lastOf(job)}`;

function runCli(cmd: string, args: string[], input: string, job: LlmJob, extra: Record<string, string> = {}): Promise<string> {
  const cwd = cwdOf(job);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...envOf(job), ...extra } });
    let out = '';
    let errOut = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd}: tiempo de espera agotado.`));
    }, CLI_TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (errOut += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`No se pudo ejecutar "${cmd}": ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`${cmd} terminó con código ${code}: ${(errOut || out).trim().slice(-400) || 'sin salida'}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function claudeSession(id: string): boolean {
  const root = join(homedir(), '.claude', 'projects');
  if (!existsSync(root)) return false;
  return readdirSync(root).some((dir) => existsSync(join(root, dir, `${id}.jsonl`)));
}

async function claudeCode(job: LlmJob): Promise<LlmResult> {
  const { provider, work } = job;
  const env: Record<string, string> = {};
  if (provider.apiKey.startsWith('sk-ant-oat')) env.CLAUDE_CODE_OAUTH_TOKEN = provider.apiKey;
  else if (provider.apiKey) env.ANTHROPIC_API_KEY = provider.apiKey;
  const args = ['-p', '--output-format', 'text'];
  if (provider.model) args.push('--model', provider.model);
  const access = work?.access ?? 'read';
  if (access === 'read') args.push('--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit');
  else if (access === 'full') args.push('--permission-mode', 'bypassPermissions');
  else {
    args.push('--permission-mode', 'acceptEdits');
    if (work?.bins.length) args.push('--allowedTools', ...work.bins.map((b) => `Bash(${b}:*)`));
  }
  const id = work?.session?.cliId;
  if (id && claudeSession(id)) return { text: await runCli('claude', [...args, '--resume', id], resumed(job), job, env) };
  if (id) args.push('--session-id', id);
  return { text: await runCli('claude', args, flatten(job), job, env) };
}

function codexEvents(stdout: string) {
  let thread = '';
  let text = '';
  for (const line of stdout.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'thread.started' && event.thread_id) thread = String(event.thread_id);
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) text = String(event.item.text);
    } catch {
      continue;
    }
  }
  return { thread, text };
}

async function codex(job: LlmJob): Promise<LlmResult> {
  const { provider, work } = job;
  const env: Record<string, string> = {};
  if (provider.apiKey) {
    env.OPENAI_API_KEY = provider.apiKey;
    env.CODEX_API_KEY = provider.apiKey;
  }
  const access = work?.access ?? 'read';
  const policy = access === 'full'
    ? ['--dangerously-bypass-approvals-and-sandbox']
    : access === 'edit'
      ? ['-c', 'sandbox_mode="workspace-write"', ...(work?.bins.length ? ['-c', 'sandbox_workspace_write.network_access=true'] : [])]
      : ['-c', 'sandbox_mode="read-only"'];
  const model = provider.model ? ['-m', provider.model] : [];
  const run = async (resume: string | null): Promise<LlmResult> => {
    const outFile = join(tmpdir(), `codex-${randomUUID()}.txt`);
    const head = resume ? ['exec', 'resume'] : ['exec'];
    const args = [...head, '--skip-git-repo-check', '--json', '-o', outFile, ...policy, ...model, ...(resume ? [resume] : []), '-'];
    try {
      const stdout = await runCli('codex', args, resume ? resumed(job) : flatten(job), job, env);
      const events = codexEvents(stdout);
      let text = '';
      try {
        text = readFileSync(outFile, 'utf8').trim();
      } catch {
        text = '';
      }
      text ||= events.text;
      if (!text) throw new Error('Codex no ha devuelto texto.');
      return { text, cliId: events.thread || resume || undefined };
    } finally {
      rmSync(outFile, { force: true });
    }
  };
  const id = work?.session?.cliId;
  if (!id) return run(null);
  try {
    return await run(id);
  } catch (err) {
    if (!/not found|no session|no rollout|unknown/i.test(err instanceof Error ? err.message : '')) throw err;
    return run(null);
  }
}

async function customCli(job: LlmJob): Promise<LlmResult> {
  if (!job.provider.command.trim()) throw new Error('Este proveedor no tiene ningún comando configurado.');
  return { text: await runCli('sh', ['-c', job.provider.command], flatten(job), job) };
}

export async function runProvider(job: LlmJob): Promise<LlmResult> {
  switch (job.provider.kind) {
    case 'anthropic':
      return anthropic(job);
    case 'openai':
      return openaiCompatible(job);
    case 'claude-code':
      return claudeCode(job);
    case 'codex':
      return codex(job);
    case 'cli':
      return customCli(job);
    default:
      return { text: await mock(job) };
  }
}
