import { mock } from '../../backend/src/mock.js';
import { hub } from './hub';

const recent: any[] = [];
const totals = { completed: 0, failed: 0 };

export function jobsState() {
  return { jobs: recent, totals, waiting: 0, active: recent.filter((j) => j.status === 'active').length };
}

const publish = () => hub.broadcast({ type: 'jobs', ...jobsState() });

export async function complete(data: any): Promise<string> {
  const info = {
    id: crypto.randomUUID(), agentName: data.agentName, intent: data.intent, provider: data.provider.name, node: 'Tu navegador',
    status: 'active', startedAt: Date.now(), ms: null as number | null, error: '',
  };
  recent.unshift(info);
  if (recent.length > 40) recent.pop();
  publish();
  try {
    if (data.provider.kind !== 'mock') {
      throw new Error('La demo del navegador solo piensa con el cerebro simulado. Instala Agent Office con Docker para conectar modelos reales.');
    }
    const text = await mock(data);
    info.status = 'completed';
    totals.completed++;
    return text;
  } catch (err) {
    info.status = 'failed';
    info.error = err instanceof Error ? err.message : String(err);
    totals.failed++;
    throw new Error(info.error);
  } finally {
    info.ms = Date.now() - info.startedAt;
    publish();
  }
}
