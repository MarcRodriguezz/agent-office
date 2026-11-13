import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LlmJob, LlmMessage } from './types.js';

const WORKSPACE = process.env.WORKSPACE_DIR ?? '/workspace';
const API_TIMEOUT_MS = 5 * 60 * 1000;
const CLI_TIMEOUT_MS = 12 * 60 * 1000;
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalize(messages: LlmMessage[]): LlmMessage[] {
  const out = messages.filter((m) => m.content.trim());
  while (out.length && out[0].role !== 'user') out.shift();
  return out.length ? out : [{ role: 'user', content: 'Hola' }];
}

async function anthropic(job: LlmJob): Promise<string> {
  const { provider } = job;
  const client = new Anthropic({
    apiKey: provider.apiKey || process.env.ANTHROPIC_API_KEY,
    ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
  });
  const model = provider.model || 'claude-opus-5-5';
  const base = { model, max_tokens: 32000, system: job.system, messages: normalize(job.messages) };
  try {
    const message = FALLBACK_MODELS.has(model) && !provider.baseUrl
      ? await client.beta.messages.stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage()
      : await client.messages.stream(base).finalMessage();
    if (message.stop_reason === 'refusal') throw new Error('El modelo ha rechazado la petición.');
    const blocks: { type: string; text?: string }[] = message.content;
    const text = blocks.map((b) => (b.type === 'text' ? b.text ?? '' : '')).join('').trim();
    if (!text) throw new Error('El modelo no ha devuelto texto.');
    return text;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Anthropic: API key inválida o ausente.');
    if (err instanceof Anthropic.NotFoundError) throw new Error(`Anthropic: el modelo "${model}" no existe.`);
    if (err instanceof Anthropic.RateLimitError) throw new Error('Anthropic: límite de peticiones alcanzado, inténtalo más tarde.');
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic ${err.status ?? ''}: ${err.message}`);
    throw err;
  }
}

async function openaiCompatible(job: LlmJob): Promise<string> {
  const { provider } = job;
  const baseUrl = (provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const key = provider.apiKey || process.env.OPENAI_API_KEY || '';
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'system', content: job.system }, ...normalize(job.messages)],
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`No se pudo conectar con ${baseUrl}: ${err instanceof Error ? err.message : err}`);
  }
  const body = await res.text();
  if (!res.ok) throw new Error(`${provider.name} respondió ${res.status}: ${body.slice(0, 300)}`);
  const text = JSON.parse(body)?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('El modelo no ha devuelto texto.');
  return text.trim();
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

function runCli(cmd: string, args: string[], input: string, env: Record<string, string>): Promise<string> {
  mkdirSync(WORKSPACE, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: WORKSPACE, env: { ...process.env, ...env } });
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

function claudeCode(job: LlmJob): Promise<string> {
  const { provider } = job;
  const env: Record<string, string> = {};
  if (provider.apiKey.startsWith('sk-ant-oat')) env.CLAUDE_CODE_OAUTH_TOKEN = provider.apiKey;
  else if (provider.apiKey) env.ANTHROPIC_API_KEY = provider.apiKey;
  const args = ['-p', '--output-format', 'text'];
  if (provider.model) args.push('--model', provider.model);
  return runCli('claude', args, flatten(job), env);
}

async function codex(job: LlmJob): Promise<string> {
  const { provider } = job;
  const env: Record<string, string> = {};
  if (provider.apiKey) {
    env.OPENAI_API_KEY = provider.apiKey;
    env.CODEX_API_KEY = provider.apiKey;
  }
  const outFile = join(tmpdir(), `codex-${randomUUID()}.txt`);
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-o', outFile];
  if (provider.model) args.push('-m', provider.model);
  args.push('-');
  try {
    const stdout = await runCli('codex', args, flatten(job), env);
    try {
      const last = readFileSync(outFile, 'utf8').trim();
      return last || stdout;
    } catch {
      return stdout;
    }
  } finally {
    rmSync(outFile, { force: true });
  }
}

function customCli(job: LlmJob): Promise<string> {
  if (!job.provider.command.trim()) throw new Error('Este proveedor no tiene ningún comando configurado.');
  return runCli('sh', ['-c', job.provider.command], flatten(job), {});
}

const LOOKS_LIKE_TASK = /\b(haz|hazme|prepara|prepárame|escribe|escríbeme|redacta|crea|créame|analiza|investiga|diseña|planifica|resume|necesito que|encárgate|quiero que|puedes hacer|genera|monta|organiza)\b/i;

async function mock(job: LlmJob): Promise<string> {
  await sleep(1500 + Math.random() * 2500);
  const last = [...job.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  switch (job.intent) {
    case 'test':
      return 'OK';
    case 'plan': {
      const reports = job.hint?.reports ?? [];
      return JSON.stringify({
        subtasks: reports.slice(0, 3).map((r, i) => ({
          agentId: r.id,
          title: `Parte ${i + 1} (${r.role})`,
          description: `Desde tu especialidad como ${r.role}, prepara tu parte del siguiente encargo:\n${last.slice(0, 600)}`,
        })),
      });
    }
    case 'task':
      return [
        `**Entrega de ${job.agentName} (modo simulado)**`,
        '',
        'He revisado el encargo y este es mi resultado:',
        '',
        '1. Análisis del objetivo y de las restricciones.',
        '2. Propuesta de solución con los pasos principales.',
        '3. Riesgos detectados y siguientes pasos recomendados.',
        '',
        '_Este texto lo genera el cerebro simulado. Configura un proveedor LLM en tu despacho o en la sala de servidores para obtener trabajo real._',
      ].join('\n');
    case 'synth':
      return [
        `**Resumen del equipo (modo simulado)** — coordinado por ${job.agentName}`,
        '',
        'He reunido las entregas de todo el equipo y las he integrado en un único resultado. Todas las partes están completas y son coherentes entre sí.',
        '',
        '_Configura un proveedor LLM real para que la síntesis sea auténtica._',
      ].join('\n');
    default:
      if (LOOKS_LIKE_TASK.test(last)) return `¡Claro, jefe! Me pongo con ello ahora mismo.\n[[TAREA: ${last.trim()}]]`;
      if (/hola|buenas|qué tal|que tal|hey/i.test(last)) return `¡Hola! Soy ${job.agentName}. Todo en orden por aquí. ¿En qué te ayudo?`;
      return `Entendido. Ahora mismo pienso con el cerebro simulado, así que mis respuestas son limitadas. Conéctame a un LLM desde tu ordenador o la sala de servidores y hablamos en serio. Si me encargas algo ("prepara…", "analiza…"), me pongo a ello.`;
  }
}

export function runProvider(job: LlmJob): Promise<string> {
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
      return mock(job);
  }
}
