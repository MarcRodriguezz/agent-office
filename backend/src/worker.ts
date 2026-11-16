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
    async (job) => ({ text: await runProvider(job.data) }),
    { connection, concurrency },
  );
  worker.on('ready', () => console.log(`worker listo (concurrencia ${concurrency})`));
  worker.on('completed', (job) => console.log(`✓ ${job.data.intent} · ${job.data.agentName} · ${job.data.provider.name}`));
  worker.on('failed', (job, err) => console.log(`✗ ${job?.data.intent} · ${job?.data.agentName}: ${err.message}`));
  startNodeClient(`ws://${process.env.SERVER_HOST ?? 'server'}:${process.env.PORT ?? 3000}/internal/node`, concurrency);

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
