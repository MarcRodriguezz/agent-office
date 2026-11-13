import { Queue, QueueEvents } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { hub } from './hub.js';
import { QUEUE_NAME, connection } from './queue-config.js';
import type { JobInfo, LlmJob, LlmResult } from './types.js';

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 15 * 60 * 1000);

const queue = new Queue<LlmJob, LlmResult>(QUEUE_NAME, { connection });
const events = new QueueEvents(QUEUE_NAME, { connection });
const recent: JobInfo[] = [];
const byJobId = new Map<string, JobInfo>();
const totals = { completed: 0, failed: 0 };

const publish = () => hub.broadcast({ type: 'jobs', ...jobsState() });

events.on('active', ({ jobId }) => {
  const info = byJobId.get(jobId);
  if (!info || info.status !== 'waiting') return;
  info.status = 'active';
  publish();
});

export function jobsState() {
  return {
    jobs: recent,
    totals,
    waiting: recent.filter((j) => j.status === 'waiting').length,
    active: recent.filter((j) => j.status === 'active').length,
  };
}

export async function complete(data: LlmJob): Promise<string> {
  const info: JobInfo = {
    id: randomUUID(), agentName: data.agentName, intent: data.intent,
    provider: `${data.provider.name}${data.provider.model ? ` · ${data.provider.model}` : ''}`,
    status: 'waiting', startedAt: Date.now(), ms: null, error: '',
  };
  recent.unshift(info);
  if (recent.length > 40) recent.pop();
  publish();
  let jobId = '';
  try {
    const job = await queue.add(data.intent, data, { attempts: 1, removeOnComplete: true, removeOnFail: true });
    jobId = job.id ?? '';
    byJobId.set(jobId, info);
    const result = await job.waitUntilFinished(events, TIMEOUT_MS);
    info.status = 'completed';
    totals.completed++;
    return result.text;
  } catch (err) {
    info.status = 'failed';
    info.error = err instanceof Error ? err.message : String(err);
    totals.failed++;
    throw new Error(info.error);
  } finally {
    info.ms = Date.now() - info.startedAt;
    byJobId.delete(jobId);
    publish();
  }
}
