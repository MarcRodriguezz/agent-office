import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { hostname } from 'node:os';
import { runProvider } from './providers.js';
import { TOOLS, toolCommand, type ToolAction, type ToolDef } from './tools.js';
import type { CliAuth, LlmJob, NodeInfo, ToolStatus } from './types.js';

const TERM_TIMEOUT_MS = 15 * 60 * 1000;

function run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout}${stderr}`.trim() });
    });
  });
}

async function claudeAuth(): Promise<CliAuth> {
  const version = await run('claude', ['--version']);
  if (!version.ok) return { installed: false, version: '', loggedIn: false, detail: '' };
  const status = await run('claude', ['auth', 'status']);
  let loggedIn = false;
  let detail = '';
  try {
    const data = JSON.parse(status.out.slice(status.out.indexOf('{')));
    loggedIn = !!data.loggedIn;
    detail = [data.email, data.subscriptionType ?? data.authMethod].filter((v) => v && v !== 'none').join(' · ');
  } catch {
    detail = status.out.split('\n')[0] ?? '';
  }
  return { installed: true, version: version.out.split(' ')[0], loggedIn, detail };
}

async function codexAuth(): Promise<CliAuth> {
  const version = await run('codex', ['--version']);
  if (!version.ok) return { installed: false, version: '', loggedIn: false, detail: '' };
  const status = await run('codex', ['login', 'status']);
  const line = status.out.split('\n').find((l) => l.trim()) ?? '';
  const loggedIn = status.ok && !/not logged in/i.test(status.out);
  return { installed: true, version: version.out.replace(/^codex-cli\s*/, ''), loggedIn, detail: loggedIn ? line : '' };
}

async function generic(tool: ToolDef): Promise<CliAuth> {
  const version = await run(tool.bin, ['--version']);
  if (!version.ok) return { installed: false, version: '', loggedIn: false, detail: '' };
  const number = version.out.match(/\d+\.\d+[\w.-]*/)?.[0] ?? version.out.split('\n')[0].slice(0, 30);
  if (!tool.status) return { installed: true, version: number, loggedIn: false, detail: '' };
  const [cmd, ...args] = tool.status.split(' ');
  const status = await run(cmd, args);
  const account = status.out.match(/account\s+(\S+)/i)?.[1] ?? '';
  return { installed: true, version: number, loggedIn: status.ok, detail: status.ok ? account : '' };
}

async function describe(concurrency: number): Promise<NodeInfo> {
  const tools: ToolStatus[] = await Promise.all(TOOLS.map(async (tool) => ({
    id: tool.id,
    ...(await (tool.id === 'claude' ? claudeAuth() : tool.id === 'codex' ? codexAuth() : generic(tool))),
  })));
  return { host: hostname(), concurrency, tools };
}

export function startNodeClient(url: string, concurrency: number) {
  let ws: WebSocket | null = null;
  let stopped = false;
  let active = 0;
  const waiting: (() => void)[] = [];
  const terms = new Map<string, ChildProcess>();

  const send = (msg: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const report = async () => send({ type: 'info', info: await describe(concurrency) });

  const runJob = async (id: string, job: LlmJob) => {
    if (active >= concurrency) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      const result = await runProvider(job);
      console.log(`✓ ${job.intent} · ${job.agentName} · ${job.provider.name}`);
      send({ type: 'result', id, ok: true, text: result.text, cliId: result.cliId });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${job.intent} · ${job.agentName}: ${error}`);
      send({ type: 'result', id, ok: false, error });
    } finally {
      active--;
      waiting.shift()?.();
    }
  };

  const startTerm = (sid: string, tool: string, action: ToolAction) => {
    const command = toolCommand(tool, action);
    if (!command) return;
    const child = spawn('script', ['-qfc', `stty cols 1000 rows 40; ${command}`, '/dev/null'], {
      env: { ...process.env, TERM: 'xterm-256color', GH_BROWSER: 'true', BROWSER: 'true', GH_PROMPT_DISABLED: '1' },
    });
    terms.set(sid, child);
    const timer = setTimeout(() => child.kill('SIGKILL'), TERM_TIMEOUT_MS);
    const forward = (data: Buffer) => send({ type: 'term', sid, data: data.toString('utf8') });
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.stdin.on('error', () => {});
    child.on('error', (err) => send({ type: 'term', sid, data: `\n${err.message}\n` }));
    child.on('close', (code) => {
      clearTimeout(timer);
      terms.delete(sid);
      send({ type: 'term-exit', sid, code: code ?? 1 });
      void report();
    });
  };

  const handle = (msg: any) => {
    if (msg.type === 'job') void runJob(msg.id, msg.data);
    else if (msg.type === 'refresh') void report();
    else if (msg.type === 'term-start') startTerm(msg.sid, msg.tool, msg.action);
    else if (msg.type === 'term-input') terms.get(msg.sid)?.stdin?.write(String(msg.data));
    else if (msg.type === 'term-kill') terms.get(msg.sid)?.kill('SIGKILL');
  };

  const connect = () => {
    if (stopped) return;
    const socket = new WebSocket(url);
    ws = socket;
    socket.addEventListener('open', () => {
      console.log('conectado a la oficina');
      void report();
    });
    socket.addEventListener('message', (e) => {
      try {
        handle(JSON.parse(String(e.data)));
      } catch {
        return;
      }
    });
    socket.addEventListener('error', () => {});
    socket.addEventListener('close', (e) => {
      if (e.code === 4401) console.log('la oficina ha rechazado el token de este servidor');
      for (const child of terms.values()) child.kill('SIGKILL');
      setTimeout(connect, 4000);
    });
  };

  const beat = setInterval(() => send({ type: 'ping' }), 25000);
  connect();
  return () => {
    stopped = true;
    clearInterval(beat);
    ws?.close();
  };
}
