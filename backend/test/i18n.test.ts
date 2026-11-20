import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it, mock } from 'node:test';
import type { LlmJob } from '../src/types.js';

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'office-')), 'office.db');

const { mock: mockBrain } = await import('../src/mock.js');
mock.module(new URL('../src/llm.js', import.meta.url).href, {
  exports: {
    complete: async (job: LlmJob) => ({ text: await mockBrain(job) }),
    jobsState: () => ({ jobs: [], totals: { completed: 0, failed: 0 }, waiting: 0, active: 0 }),
  },
});

const { EN } = await import('../src/i18n-en.js');
const { relabel, setLangSource, t } = await import('../src/i18n.js');
const { store } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { initOffice, switchLang } = await import('../src/brain.js');
const { mapData } = await import('../src/map.js');
const { officeLang } = await import('../src/settings.js');

const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function webDictionary(): Record<string, string> {
  const source = readFileSync(join(process.cwd(), '..', 'web', 'src', 'i18n-en.ts'), 'utf8');
  const body = source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
  return new Function(`return ${body}`)();
}

const job = (intent: LlmJob['intent'], content: string): LlmJob => ({
  provider: { id: 'm', name: 'mock', kind: 'mock', baseUrl: '', apiKey: '', model: '', command: '' },
  system: '', intent, agentName: 'Leo', messages: [{ role: 'user', content }],
});

describe('languages', () => {
  before(() => {
    seed();
    initOffice();
  });

  it('keeps every placeholder in the English texts', () => {
    for (const [name, dict] of [['backend', EN as Record<string, string>], ['web', webDictionary()]] as const) {
      for (const [es, en] of Object.entries(dict)) {
        assert.ok(en.trim(), `${name}: empty translation for «${es}»`);
        assert.deepEqual(holes(en), holes(es), `${name}: placeholders differ in «${es}»`);
      }
    }
  });

  it('translates in both directions only the texts it knows', () => {
    assert.equal(relabel('Desarrollador júnior', 'en'), 'Junior developer');
    assert.equal(relabel('Junior developer', 'es'), 'Desarrollador júnior');
    assert.equal(relabel('Mi propio puesto', 'en'), 'Mi propio puesto');
  });

  it('answers in the language of the office', async () => {
    setLangSource(() => 'en');
    try {
      assert.match(await mockBrain(job('chat', 'hello')), /^Hi! I'm Leo/);
      assert.match(await mockBrain(job('chat', 'prepare a release checklist')), /\[\[TASK: prepare a release checklist\]\]/);
      assert.equal(t('Jefe'), 'Boss');
    } finally {
      setLangSource(officeLang);
    }
    assert.match(await mockBrain(job('chat', 'hola')), /^¡Hola! Soy Leo/);
  });

  it('switches the staff, the departments and the floor plan to English and back', () => {
    const before = store.agents().find((a) => a.name === 'Leo');
    assert.equal(before?.role, 'Desarrollador júnior');

    switchLang('en');
    assert.equal(officeLang(), 'en');
    assert.equal(store.agents().find((a) => a.name === 'Leo')?.role, 'Junior developer');
    assert.deepEqual(store.teams().map((team) => team.name).sort(), ['Development', 'Platform']);
    assert.ok(mapData().rooms.some((room) => room.name === 'MEETING ROOM'));
    assert.equal(store.providers()[0].name, 'Simulated brain');

    switchLang('es');
    assert.equal(store.agents().find((a) => a.name === 'Leo')?.role, 'Desarrollador júnior');
    assert.ok(mapData().rooms.some((room) => room.name === 'SALA DE REUNIONES'));
  });

  it('keeps the activity feed as messages that each browser shows in its own language', () => {
    const event = store.feed().find((e) => e.msg?.k === 'La oficina abre sus puertas');
    assert.ok(event?.msg, 'the opening event is stored as a message');
    assert.equal(event.text, 'La oficina abre sus puertas');
  });
});
