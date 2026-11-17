import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanCompanion, levelOf, stageOf } from '../src/companions.js';
import { BIN, ENV_KEY, TOOLS, toolCommand } from '../src/tools.js';

describe('tool catalogue', () => {
  it('only runs commands defined in the catalogue', () => {
    assert.equal(toolCommand('github', 'login'), TOOLS.find((t) => t.id === 'github')?.login?.command);
    assert.equal(toolCommand('cloudflare', 'install'), 'npm install -g --no-audit --no-fund wrangler');
    assert.equal(toolCommand('rm -rf /', 'login'), null);
    assert.equal(toolCommand('claude', 'install'), null);
  });

  it('validates command names and environment keys', () => {
    assert.ok(BIN.test('wrangler'));
    assert.ok(!BIN.test('gh; rm -rf /'));
    assert.ok(ENV_KEY.test('GH_TOKEN'));
    assert.ok(!ENV_KEY.test('lower-case'));
  });
});

describe('compis', () => {
  it('level up every 100 points and evolve at levels 3 and 6', () => {
    assert.equal(levelOf(0), 1);
    assert.equal(levelOf(199), 2);
    assert.deepEqual([1, 2, 3, 5, 6].map(stageOf), [1, 1, 2, 2, 3]);
  });

  it('only accept known species and trim nicknames', () => {
    assert.equal(cleanCompanion({ species: 'unknown', name: 'x' }), null);
    assert.deepEqual(cleanCompanion({ species: 'lumo', name: '  Faro  ' }), { species: 'lumo', name: 'Faro' });
    assert.deepEqual(cleanCompanion({ species: 'lumo', name: '' }), { species: 'lumo', name: 'Lumo' });
  });
});
