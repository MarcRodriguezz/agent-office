import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { toolBox, workRoot } from '../src/agent-tools.js';

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'agent-tools-'));
  const root = workRoot(base, 'project');
  writeFileSync(join(root, 'notes.txt'), 'hola desde el proyecto\n');
  writeFileSync(join(base, 'secret.txt'), 'fuera del proyecto');
  return { base, root };
}

const names = (access: 'read' | 'edit' | 'full', bins: string[] = []) => toolBox(sandbox().root, access, {}, bins).specs.map((s) => s.name);

describe('agent tools', () => {
  it('offer more tools as the permission level grows', () => {
    assert.deepEqual(names('read'), ['list_files', 'read_file', 'search']);
    assert.deepEqual(names('edit', ['node']), ['list_files', 'read_file', 'search', 'write_file', 'replace_in_file', 'run_tool']);
    assert.ok(names('full').includes('shell'));
    assert.ok(!names('edit').includes('shell'));
  });

  it('let a read-only agent read inside the project but not write', async () => {
    const { root } = sandbox();
    const box = toolBox(root, 'read', {}, []);
    assert.match(await box.call('read_file', { path: 'notes.txt' }), /hola desde el proyecto/);
    assert.match(await box.call('search', { pattern: 'proyecto' }), /notes\.txt:1/);
    assert.match(await box.call('write_file', { path: 'new.txt', content: 'x' }), /no está disponible/);
    assert.equal(existsSync(join(root, 'new.txt')), false);
  });

  it('keep read and edit agents inside the project folder', async () => {
    const { root } = sandbox();
    for (const access of ['read', 'edit'] as const) {
      const box = toolBox(root, access, {}, []);
      assert.match(await box.call('read_file', { path: '../secret.txt' }), /fuera de la carpeta/);
      assert.match(await box.call('list_files', { path: '..' }), /fuera de la carpeta/);
    }
    const edit = toolBox(root, 'edit', {}, []);
    assert.match(await edit.call('write_file', { path: '../escape.txt', content: 'x' }), /fuera de la carpeta/);
  });

  it('let an edit agent write and replace inside the project', async () => {
    const { root } = sandbox();
    const box = toolBox(root, 'edit', {}, []);
    await box.call('write_file', { path: 'src/app.txt', content: 'versión uno' });
    assert.equal(readFileSync(join(root, 'src/app.txt'), 'utf8'), 'versión uno');
    await box.call('replace_in_file', { path: 'src/app.txt', old: 'uno', new: 'dos' });
    assert.equal(readFileSync(join(root, 'src/app.txt'), 'utf8'), 'versión dos');
  });

  it('let an edit agent run only the commands of its tools, never a shell', async () => {
    const { root } = sandbox();
    const box = toolBox(root, 'edit', {}, ['node']);
    assert.match(await box.call('run_tool', { tool: 'node', args: ['-e', 'console.log(40 + 2)'] }), /42/);
    assert.match(await box.call('run_tool', { tool: 'git', args: ['--version'] }), /no está disponible/);
    assert.match(await box.call('shell', { command: 'echo hola' }), /no está disponible/);
  });

  it('give a full-freedom agent a shell and access outside the project', async () => {
    const { root, base } = sandbox();
    const box = toolBox(root, 'full', {}, []);
    assert.match(await box.call('read_file', { path: join(base, 'secret.txt') }), /fuera del proyecto/);
    assert.match(await box.call('shell', { command: 'echo hola' }), /hola/);
  });
});
