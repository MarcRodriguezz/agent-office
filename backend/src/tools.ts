import { N } from './i18n.js';
export type LoginFlow = 'code' | 'device';
export type ToolAction = 'login' | 'logout' | 'install';

export interface ToolField {
  key: string;
  label: string;
  optional?: boolean;
}

export interface ToolDef {
  id: string;
  name: string;
  bin: string;
  summary: string;
  npm?: string;
  login?: { command: string; flow: LoginFlow };
  logout?: string;
  status?: string;
  fields: ToolField[];
  tokenUrl?: string;
  brain?: boolean;
}

export const TOOLS: ToolDef[] = [
  {
    id: 'claude', name: 'Claude Code', bin: 'claude', brain: true,
    summary: N('Cerebro con tu suscripción de Claude. Edita ficheros y ejecuta comandos por su cuenta.'),
    login: { command: 'claude auth login', flow: 'code' }, logout: 'claude auth logout', fields: [],
  },
  {
    id: 'codex', name: 'Codex', bin: 'codex', brain: true,
    summary: N('Cerebro con tu cuenta de ChatGPT.'),
    login: { command: 'codex login --device-auth', flow: 'device' }, logout: 'codex logout', fields: [],
  },
  {
    id: 'github', name: 'GitHub', bin: 'gh',
    summary: N('Repositorios, issues, pull requests y releases con gh. El inicio de sesión también configura git.'),
    login: { command: 'gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key && gh auth setup-git', flow: 'device' },
    logout: 'gh auth logout --hostname github.com', status: 'gh auth status',
    fields: [{ key: 'GH_TOKEN', label: N('Token personal') }], tokenUrl: 'https://github.com/settings/tokens',
  },
  {
    id: 'cloudflare', name: 'Cloudflare', bin: 'wrangler', npm: 'wrangler',
    summary: N('Workers, Pages, R2 y DNS con wrangler.'),
    fields: [{ key: 'CLOUDFLARE_API_TOKEN', label: 'API token' }, { key: 'CLOUDFLARE_ACCOUNT_ID', label: N('ID de cuenta'), optional: true }],
    tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    id: 'vercel', name: 'Vercel', bin: 'vercel', npm: 'vercel',
    summary: N('Despliegues y dominios en Vercel.'),
    fields: [{ key: 'VERCEL_TOKEN', label: 'Token' }], tokenUrl: 'https://vercel.com/account/tokens',
  },
  {
    id: 'netlify', name: 'Netlify', bin: 'netlify', npm: 'netlify-cli',
    summary: N('Sitios y despliegues en Netlify.'),
    fields: [{ key: 'NETLIFY_AUTH_TOKEN', label: N('Token personal') }], tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
  },
];

export const toolOf = (id: string) => TOOLS.find((t) => t.id === id);

export function toolCommand(id: string, action: ToolAction): string | null {
  const tool = toolOf(id);
  if (!tool) return null;
  if (action === 'login') return tool.login?.command ?? null;
  if (action === 'logout') return tool.logout ?? null;
  return tool.npm ? `npm install -g --no-audit --no-fund ${tool.npm}` : null;
}

export const ENV_KEY = /^[A-Z_][A-Z0-9_]{0,63}$/;
export const BIN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
