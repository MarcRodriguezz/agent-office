import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Access } from './types.js';
import { t } from './i18n.js';

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

const clip = (text: string) => (text.length > MAX_OUTPUT ? t('{v0}\n… (salida recortada)', { v0: text.slice(0, MAX_OUTPUT) }) : text);
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required });
const str = (description: string) => ({ type: 'string', description });

function exec(cmd: string, args: string[], cwd: string, env: Record<string, string>): Promise<string> {
  return new Promise((done) => {
    execFile(cmd, args, { cwd, env: { ...process.env, ...env }, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = `${stdout}${stderr ? `\n${stderr}` : ''}`.trim();
      const code = err ? ((err as { code?: unknown }).code ?? 1) : 0;
      done(clip(t('{v0}\n[código de salida: {code}]', { v0: out || t('(sin salida)'), code })));
    });
  });
}

export function toolBox(root: string, access: Access, env: Record<string, string>, bins: string[]): ToolBox {
  const inside = (path: unknown) => {
    const raw = typeof path === 'string' && path.trim() ? path.trim() : '.';
    const full = resolve(root, raw);
    if (access !== 'full' && (isAbsolute(relative(root, full)) || relative(root, full).startsWith('..'))) {
      throw new Error(t('«{raw}» está fuera de la carpeta del proyecto.', { raw }));
    }
    return full;
  };

  const list = (path: unknown) => {
    const dir = inside(path);
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => !SKIP.has(e.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
    return entries.length ? clip(entries.slice(0, 500).join('\n')) : t('(carpeta vacía)');
  };

  const search = (pattern: unknown, path: unknown) => {
    const needle = String(pattern ?? '');
    if (!needle) throw new Error(t('Falta el texto a buscar.'));
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
    return hits.length ? hits.join('\n') : t('Sin resultados.');
  };

  const specs: ToolSpec[] = [
    { name: 'list_files', description: t('Lista el contenido de una carpeta del proyecto.'), schema: obj({ path: str(t('Ruta relativa a la carpeta del proyecto. Vacío = raíz.')) }, []) },
    { name: 'read_file', description: t('Lee un fichero de texto.'), schema: obj({ path: str(t('Ruta del fichero.')) }, ['path']) },
    { name: 'search', description: t('Busca un texto o expresión regular en los ficheros del proyecto.'), schema: obj({ pattern: str(t('Texto o regex.')), path: str(t('Carpeta donde buscar (opcional).')) }, ['pattern']) },
  ];
  if (access !== 'read') {
    specs.push(
      { name: 'write_file', description: t('Crea o sobrescribe un fichero con el contenido dado.'), schema: obj({ path: str(t('Ruta del fichero.')), content: str(t('Contenido completo.')) }, ['path', 'content']) },
      { name: 'replace_in_file', description: t('Sustituye un fragmento exacto de un fichero por otro.'), schema: obj({ path: str(t('Ruta del fichero.')), old: str(t('Texto exacto a sustituir (debe aparecer una sola vez).')), new: str(t('Texto nuevo.')) }, ['path', 'old', 'new']) },
    );
  }
  if (access === 'full') {
    specs.push({ name: 'shell', description: t('Ejecuta un comando de shell en la carpeta del proyecto y devuelve la salida.'), schema: obj({ command: str(t('Comando completo.')) }, ['command']) });
  } else if (access === 'edit' && bins.length) {
    specs.push({
      name: 'run_tool',
      description: t('Ejecuta una de tus herramientas de terminal ({v0}) con los argumentos indicados.', { v0: bins.join(', ') }),
      schema: obj({ tool: { type: 'string', enum: bins }, args: { type: 'array', items: { type: 'string' }, description: t('Argumentos, uno por elemento.') } }, ['tool', 'args']),
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
          return t('Guardado {v0}.', { v0: relative(root, file) || file });
        }
        case 'replace_in_file': {
          if (access === 'read') break;
          const file = inside(input?.path);
          const text = readFileSync(file, 'utf8');
          const old = String(input?.old ?? '');
          const count = old ? text.split(old).length - 1 : 0;
          if (count !== 1) return t('El fragmento aparece {count} veces: debe aparecer exactamente una.', { count });
          writeFileSync(file, text.replace(old, () => String(input?.new ?? '')));
          return t('Modificado {v0}.', { v0: relative(root, file) });
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
      return t('La herramienta «{name}» no está disponible con tus permisos.', { name });
    } catch (err) {
      return t('Error: {v0}', { v0: err instanceof Error ? err.message : String(err) });
    }
  };

  const can = access === 'read'
    ? t('Puedes leer y buscar en los ficheros, pero no modificarlos.')
    : access === 'edit'
      ? t('Puedes leer, crear y modificar ficheros{v0}.', { v0: bins.length ? t(' y usar estas herramientas de terminal: {v0}', { v0: bins.join(', ') }) : '' })
      : t('Puedes leer y modificar ficheros y ejecutar cualquier comando de shell.');
  return { specs, call, guide: t('Trabajas en la carpeta {root}. {can} Usa las herramientas cuando el encargo lo necesite y termina con tu respuesta final en texto.', { root, can }) };
}

export function workRoot(base: string, folder: string): string {
  const root = resolve(base, folder || '.');
  mkdirSync(root, { recursive: true });
  return root;
}
