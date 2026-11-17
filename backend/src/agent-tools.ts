import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Access } from './types.js';

export interface ToolSpec {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface ToolBox {
  specs: ToolSpec[];
  call: (name: string, input: any) => Promise<string>;
  guide: string;
}

const MAX_OUTPUT = 30000;
const COMMAND_TIMEOUT_MS = 3 * 60 * 1000;
const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.venv', '__pycache__']);

const clip = (text: string) => (text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (salida recortada)` : text);
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required });
const str = (description: string) => ({ type: 'string', description });

function exec(cmd: string, args: string[], cwd: string, env: Record<string, string>): Promise<string> {
  return new Promise((done) => {
    execFile(cmd, args, { cwd, env: { ...process.env, ...env }, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = `${stdout}${stderr ? `\n${stderr}` : ''}`.trim();
      const code = err ? ((err as { code?: unknown }).code ?? 1) : 0;
      done(clip(`${out || '(sin salida)'}\n[código de salida: ${code}]`));
    });
  });
}

export function toolBox(root: string, access: Access, env: Record<string, string>, bins: string[]): ToolBox {
  const inside = (path: unknown) => {
    const raw = typeof path === 'string' && path.trim() ? path.trim() : '.';
    const full = resolve(root, raw);
    if (access !== 'full' && (isAbsolute(relative(root, full)) || relative(root, full).startsWith('..'))) {
      throw new Error(`«${raw}» está fuera de la carpeta del proyecto.`);
    }
    return full;
  };

  const list = (path: unknown) => {
    const dir = inside(path);
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => !SKIP.has(e.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
    return entries.length ? clip(entries.slice(0, 500).join('\n')) : '(carpeta vacía)';
  };

  const search = (pattern: unknown, path: unknown) => {
    const needle = String(pattern ?? '');
    if (!needle) throw new Error('Falta el texto a buscar.');
    let regex: RegExp;
    try {
      regex = new RegExp(needle, 'i');
    } catch {
      regex = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (hits.length >= 200 || SKIP.has(e.name)) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && statSync(full).size < 1024 * 1024) {
          readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
            if (hits.length < 200 && regex.test(line)) hits.push(`${relative(root, full)}:${i + 1}: ${line.trim().slice(0, 200)}`);
          });
        }
      }
    };
    walk(inside(path));
    return hits.length ? hits.join('\n') : 'Sin resultados.';
  };

  const specs: ToolSpec[] = [
    { name: 'list_files', description: 'Lista el contenido de una carpeta del proyecto.', schema: obj({ path: str('Ruta relativa a la carpeta del proyecto. Vacío = raíz.') }, []) },
    { name: 'read_file', description: 'Lee un fichero de texto.', schema: obj({ path: str('Ruta del fichero.') }, ['path']) },
    { name: 'search', description: 'Busca un texto o expresión regular en los ficheros del proyecto.', schema: obj({ pattern: str('Texto o regex.'), path: str('Carpeta donde buscar (opcional).') }, ['pattern']) },
  ];
  if (access !== 'read') {
    specs.push(
      { name: 'write_file', description: 'Crea o sobrescribe un fichero con el contenido dado.', schema: obj({ path: str('Ruta del fichero.'), content: str('Contenido completo.') }, ['path', 'content']) },
      { name: 'replace_in_file', description: 'Sustituye un fragmento exacto de un fichero por otro.', schema: obj({ path: str('Ruta del fichero.'), old: str('Texto exacto a sustituir (debe aparecer una sola vez).'), new: str('Texto nuevo.') }, ['path', 'old', 'new']) },
    );
  }
  if (access === 'full') {
    specs.push({ name: 'shell', description: 'Ejecuta un comando de shell en la carpeta del proyecto y devuelve la salida.', schema: obj({ command: str('Comando completo.') }, ['command']) });
  } else if (access === 'edit' && bins.length) {
    specs.push({
      name: 'run_tool',
      description: `Ejecuta una de tus herramientas de terminal (${bins.join(', ')}) con los argumentos indicados.`,
      schema: obj({ tool: { type: 'string', enum: bins }, args: { type: 'array', items: { type: 'string' }, description: 'Argumentos, uno por elemento.' } }, ['tool', 'args']),
    });
  }

  const call = async (name: string, input: any): Promise<string> => {
    try {
      switch (name) {
        case 'list_files':
          return list(input?.path);
        case 'read_file':
          return clip(readFileSync(inside(input?.path), 'utf8'));
        case 'search':
          return search(input?.pattern, input?.path);
        case 'write_file': {
          if (access === 'read') break;
          const file = inside(input?.path);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, String(input?.content ?? ''));
          return `Guardado ${relative(root, file) || file}.`;
        }
        case 'replace_in_file': {
          if (access === 'read') break;
          const file = inside(input?.path);
          const text = readFileSync(file, 'utf8');
          const old = String(input?.old ?? '');
          const count = old ? text.split(old).length - 1 : 0;
          if (count !== 1) return `El fragmento aparece ${count} veces: debe aparecer exactamente una.`;
          writeFileSync(file, text.replace(old, () => String(input?.new ?? '')));
          return `Modificado ${relative(root, file)}.`;
        }
        case 'shell':
          if (access !== 'full') break;
          return exec('sh', ['-c', String(input?.command ?? '')], root, env);
        case 'run_tool': {
          if (access !== 'edit' || !bins.includes(input?.tool)) break;
          const args = Array.isArray(input?.args) ? input.args.map(String) : [];
          return exec(input.tool, args, root, env);
        }
      }
      return `La herramienta «${name}» no está disponible con tus permisos.`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  const can = access === 'read'
    ? 'Puedes leer y buscar en los ficheros, pero no modificarlos.'
    : access === 'edit'
      ? `Puedes leer, crear y modificar ficheros${bins.length ? ` y usar estas herramientas de terminal: ${bins.join(', ')}` : ''}.`
      : 'Puedes leer y modificar ficheros y ejecutar cualquier comando de shell.';
  return { specs, call, guide: `Trabajas en la carpeta ${root}. ${can} Usa las herramientas cuando el encargo lo necesite y termina con tu respuesta final en texto.` };
}

export function workRoot(base: string, folder: string): string {
  const root = resolve(base, folder || '.');
  mkdirSync(root, { recursive: true });
  return root;
}
