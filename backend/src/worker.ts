import { Worker } from 'bullmq';
import { QUEUE_NAME, connection } from './queue-config.js';
import { runProvider } from './providers.js';
import type { LlmJob, LlmResult } from './types.js';

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);

const worker = new Worker<LlmJob, LlmResult>(
  QUEUE_NAME,
  async (job) => ({ text: await runProvider(job.data) }),
  { connection, concurrency },
);

worker.on('ready', () => console.log(`worker listo (concurrencia ${concurrency})`));
worker.on('completed', (job) => console.log(`✓ ${job.data.intent} · ${job.data.agentName} · ${job.data.provider.name}`));
worker.on('failed', (job, err) => console.log(`✗ ${job?.data.intent} · ${job?.data.agentName}: ${err.message}`));

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
