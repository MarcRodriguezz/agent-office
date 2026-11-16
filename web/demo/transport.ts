import { initOffice } from '../../backend/src/brain.js';
import { loadLayout } from '../../backend/src/map.js';
import { clientMessage, registerRoutes } from '../../backend/src/routes.js';
import { seed } from '../../backend/src/seed.js';
import { snapshot, startSim } from '../../backend/src/sim.js';
import { store } from './db';
import { hub, type Sock } from './hub';
import { officeSummary } from './offices';

export const DEMO = true;

export interface Link {
  send: (msg: unknown) => void;
  close: () => void;
  isOpen: () => boolean;
}

export interface LinkEvents {
  open: () => void;
  message: (msg: any) => void;
  close: () => void;
}

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: (req: any, reply: any) => unknown;
}

const OFFICE = '3101';
const ONLY_DOCKER = 'Esto necesita la instalación con Docker: la demo corre entera en tu navegador.';
const routes: Route[] = [];
const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const add = (method: string) => (path: string, ...rest: any[]) => {
  const keys: string[] = [];
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_m, key) => {
    keys.push(key);
    return '([^/]+)';
  })}$`);
  routes.push({ method, pattern, keys, handler: rest[rest.length - 1] });
};

let started = false;
function start() {
  if (started) return;
  started = true;
  seed();
  store.setSetting('officeName', 'Oficina de demostración');
  loadLayout(null);
  initOffice();
  startSim();
  registerRoutes({ get: add('GET'), post: add('POST'), patch: add('PATCH'), put: add('PUT'), delete: add('DELETE') } as any);
}

async function hubRequest(method: string) {
  if (method !== 'GET') throw new Error(ONLY_DOCKER);
  const s = officeSummary();
  return [{
    id: OFFICE, name: s.name, online: true, people: s.people, teams: s.teams, working: s.working,
    links: s.peers.map((p) => ({ peerId: p.id, name: p.name, online: true, office: null })),
  }];
}

export async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  start();
  await new Promise((r) => setTimeout(r, 30));
  if (url.startsWith('/api/hub')) return (await hubRequest(method)) as T;
  const [path, search = ''] = url.replace(/^\/o\/\d+/, '').split('?');
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (!match) continue;
    const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
    const reply = {
      status: 200,
      payload: undefined as unknown,
      code(status: number) {
        this.status = status;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return payload;
      },
    };
    let result: any;
    try {
      result = await route.handler({ params, body: copy(body) ?? {}, query: Object.fromEntries(new URLSearchParams(search)) }, reply);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
    const data = copy(result === reply ? reply.payload : result ?? reply.payload);
    if (reply.status >= 400) throw new Error((data as any)?.error ?? `Error ${reply.status}`);
    return data as T;
  }
  throw new Error('Error 404');
}

export function openLink(_officeId: string, on: LinkEvents): Link {
  start();
  let open = true;
  const sock: Sock = { deliver: (msg) => open && on.message(msg) };
  hub.add(sock);
  setTimeout(() => {
    if (!open) return;
    on.open();
    hub.send(sock, { type: 'state', actors: snapshot() });
  }, 0);
  return {
    send: (msg) => open && clientMessage(sock as any, copy(msg)),
    close: () => {
      open = false;
      hub.remove(sock);
    },
    isOpen: () => open,
  };
}
