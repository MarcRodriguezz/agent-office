import { Worker } from 'bullmq';
import { startNodeClient } from './node-client.js';
import { QUEUE_NAME, connection } from './queue-config.js';
import { runProvider } from './providers.js';
import type { LlmJob, LlmResult } from './types.js';

for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) {
  if (!process.env[key]) delete process.env[key];
}

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);
const token = process.env.NODE_TOKEN ?? '';

if (token) {
  const office = (process.env.OFFICE_URL ?? '').replace(/\/+$/, '').replace(/^http/, 'ws');
  if (!office) {
    console.error('Falta OFFICE_URL: la dirección de enlace de la oficina.');
    process.exit(1);
  }
  console.log(`servidor remoto de agentes → ${office} (concurrencia ${concurrency})`);
  startNodeClient(`${office}/link/node?token=${encodeURIComponent(token)}`, concurrency);
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
} else {
  const worker = new Worker<LlmJob, LlmResult>(
    QUEUE_NAME,
    (job) => runProvider(job.data),
    { connection, concurrency },
  );
  worker.on('ready', () => console.log(`worker listo (concurrencia ${concurrency})`));
  worker.on('completed', (job) => console.log(`✓ ${job.data.intent} · ${job.data.agentName} · ${job.data.provider.name}`));
  worker.on('failed', (job, err) => console.log(`✗ ${job?.data.intent} · ${job?.data.agentName}: ${err.message}`));
  const host = process.env.SERVER_HOST ?? 'server';
  const clients = new Map<number, () => void>();
  const sync = async () => {
    try {
      const ports = (await (await fetch(`http://${host}:3000/internal/offices`)).json()) as number[];
      for (const port of ports) {
        if (!clients.has(port)) clients.set(port, startNodeClient(`ws://${host}:${port}/internal/node`, concurrency));
      }
      for (const [port, stop] of clients) {
        if (ports.includes(port)) continue;
        stop();
        clients.delete(port);
      }
    } catch {
      return;
    }
  };
  setInterval(() => void sync(), 5000);
  void sync();

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
