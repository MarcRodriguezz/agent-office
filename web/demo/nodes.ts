import { TOOLS } from '../../backend/src/tools.js';
import { hub } from './hub';

export const LOCAL = 'local';
const ONLY_DOCKER = 'Esto necesita la instalación con Docker: la demo corre entera en tu navegador.';
const absent = { installed: false, version: '', loggedIn: false, detail: '' };

export const nodesState = () => [{
  id: LOCAL, name: 'Tu navegador', local: true, online: true, active: 0,
  info: { host: 'demo', concurrency: 4, tools: TOOLS.map((t) => ({ id: t.id, ...absent })) },
}];

export const publishNodes = () => hub.broadcast({ type: 'nodes', nodes: nodesState() });
export const isRemote = (_id: unknown): _id is string => false;
export const nodeName = () => 'Tu navegador';

export function createNode(): never {
  throw new Error(ONLY_DOCKER);
}

export const removeNode = () => {};
export const refreshNode = () => {};
export const startTerm = () => null;
export const termInput = () => {};
export const termKill = () => {};
export const dropClient = () => {};
