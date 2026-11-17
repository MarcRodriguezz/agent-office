import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it, mock } from 'node:test';
import type { LlmJob, Meeting } from '../src/types.js';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'office-')), 'office.db');

const { mock: mockBrain } = await import('../src/mock.js');
mock.module(new URL('../src/llm.js', import.meta.url).href, {
  exports: {
    complete: async (job: LlmJob) => ({ text: await mockBrain(job) }),
    jobsState: () => ({ jobs: [], totals: { completed: 0, failed: 0 }, waiting: 0, active: 0 }),
  },
});

const { store } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { initOffice } = await import('../src/brain.js');
const { startSim, snapshot } = await import('../src/sim.js');
const { interject, meetingTasks, startMeeting } = await import('../src/meetings.js');
const { partyUntil, startParty } = await import('../src/party.js');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(read: () => T | undefined, ms: number): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = read();
    if (value) return value;
    await sleep(250);
  }
  throw new Error('timed out');
}

describe('office with the mock brain', () => {
  before(() => {
    seed();
    initOffice();
    startSim();
  });

  it('runs a spec meeting, lets the boss step in and splits the work', { timeout: 120000 }, async () => {
    const [a, b, c] = store.agents();
    assert.throws(() => startMeeting({ title: 'Solo', brief: '', goal: 'spec', agentIds: [a.id], rounds: 1 }), /al menos dos/);

    const started = startMeeting({ title: 'Pedidos', brief: 'Primera versión.', goal: 'spec', agentIds: [a.id, b.id, c.id], rounds: 1 });
    assert.throws(() => startMeeting({ title: 'Otra', brief: '', goal: 'discuss', agentIds: [a.id, b.id], rounds: 1 }), /Ya hay una reunión/);
    assert.ok(interject(started.id, 'Centraos en lo mínimo.'));

    const done = await until<Meeting>(() => store.meetings().find((m) => m.id === started.id && m.status === 'done'), 100000);
    const speakers = done.lines.map((l) => l.speaker);
    assert.deepEqual(speakers.filter(Boolean), [a.id, b.id, c.id]);
    assert.ok(speakers.includes(null), 'the boss line is in the transcript');
    assert.match(done.result, /## Objetivo/);
    assert.match(done.result, /## Reparto del trabajo/);

    const planned = await meetingTasks(done.id);
    assert.ok(planned.taskIds.length >= 1);
    assert.ok(planned.taskIds.every((id) => store.task(id)?.description.includes('Pedidos')));
    await assert.rejects(meetingTasks(done.id), /ya está repartido/);
  });

  it('sends everyone to the dance floor when celebrating', { timeout: 60000 }, async () => {
    const end = startParty();
    assert.ok(end > Date.now());
    assert.equal(startParty(), end, 'a second press joins the same party');
    assert.equal(partyUntil(), end);
    const dancing = await until(() => {
      const count = snapshot().filter((a) => a.status === 'dancing').length;
      return count >= 2 ? count : undefined;
    }, 40000);
    assert.ok(dancing >= 2);
  });
});
