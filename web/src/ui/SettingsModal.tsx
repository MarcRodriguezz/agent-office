import { useEffect, useState } from 'react';
import { DEFAULT_APPEARANCE } from '../game/character';
import { api, copy } from '../net';
import { setState, toast, useStore } from '../store';
import { DEMO } from '../transport';
import type { Provider, ProviderKind, ToolAction } from '../types';
import { AppearanceEditor } from './AgentEditor';
import { Modal } from './common';
import { CompanionPicker } from './Companions';
import { LoginFlow, Servers, Session, statusOf, useTool } from './Servers';
import { Tools } from './Tools';

interface Preset {
  key: string;
  label: string;
  group: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  help: string;
  keyUrl?: string;
  match?: RegExp;
}

const PRESETS: Preset[] = [
  { key: 'anthropic', group: 'API en la nube', label: 'Anthropic · Claude API', kind: 'anthropic', baseUrl: '', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', match: /^sk-ant-/, help: 'API key de console.anthropic.com. Modelos: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5, claude-fable-5-2.' },
  { key: 'openai', group: 'API en la nube', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5', keyUrl: 'https://platform.openai.com/api-keys', match: /^sk-(?!ant-|or-)/, help: 'API key de platform.openai.com. Escribe el modelo exacto que quieras usar.' },
  { key: 'gemini', group: 'API en la nube', label: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey', match: /^AIza/, help: 'API key de Google AI Studio (endpoint compatible con OpenAI).' },
  { key: 'openrouter', group: 'API en la nube', label: 'OpenRouter (cientos de modelos)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', keyUrl: 'https://openrouter.ai/keys', match: /^sk-or-/, help: 'Una sola key para modelos de muchos proveedores.' },
  { key: 'groq', group: 'API en la nube', label: 'Groq (muy rápido)', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', match: /^gsk_/, help: 'API key de console.groq.com.' },
  { key: 'mistral', group: 'API en la nube', label: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', keyUrl: 'https://console.mistral.ai/api-keys', help: 'API key de console.mistral.ai.' },
  { key: 'deepseek', group: 'API en la nube', label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys', help: 'API key de platform.deepseek.com.' },
  { key: 'ollama', group: 'Local', label: 'Ollama (local)', kind: 'openai', baseUrl: 'http://host.docker.internal:11434/v1', model: 'llama3.2', help: 'Ollama en tu máquina, sin API key. Usa un modelo que tengas descargado (ollama list).' },
  { key: 'lmstudio', group: 'Local', label: 'LM Studio (local)', kind: 'openai', baseUrl: 'http://host.docker.internal:1234/v1', model: 'local-model', help: 'Activa el servidor local de LM Studio. Sin API key.' },
  { key: 'custom', group: 'Local', label: 'Otro compatible con OpenAI', kind: 'openai', baseUrl: 'http://host.docker.internal:8000/v1', model: '', help: 'Cualquier servidor con /chat/completions: vLLM, llama.cpp, LiteLLM, Azure…' },
  { key: 'claude-code', group: 'Agentes CLI', label: 'Claude Code (tu suscripción)', kind: 'claude-code', baseUrl: '', model: '', help: 'Usa tu suscripción de Claude. Inicia sesión aquí abajo: se abre la página de Claude, autorizas y pegas el código. El token o la API key son opcionales, por si prefieres no iniciar sesión.' },
  { key: 'codex', group: 'Agentes CLI', label: 'Codex CLI (OpenAI)', kind: 'codex', baseUrl: '', model: '', help: 'Usa tu cuenta de ChatGPT. Inicia sesión aquí abajo con el código de dispositivo. La API key de OpenAI es opcional, por si prefieres no iniciar sesión.' },
  { key: 'cli', group: 'Agentes CLI', label: 'Comando propio', kind: 'cli', baseUrl: '', model: '', help: 'Cualquier comando instalado en el worker: recibe el prompt por stdin y su salida es la respuesta.' },
  { key: 'mock', group: 'Sin LLM', label: 'Cerebro simulado', kind: 'mock', baseUrl: '', model: '', help: 'Respuestas de mentira para probar la oficina sin gastar tokens.' },
];

const KIND_LABEL: Record<ProviderKind, string> = {
  mock: 'Simulado', anthropic: 'Anthropic', openai: 'Compatible OpenAI', 'claude-code': 'Claude Code CLI', codex: 'Codex CLI', cli: 'Comando',
};

type Draft = Omit<Provider, 'hasKey'> & { preset?: Preset };

function ProviderForm({ draft, hasKey, onDone }: { draft: Draft; hasKey: boolean; onDone: () => void }) {
  const [form, setForm] = useState(draft);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testNode, setTestNode] = useState('');
  const nodes = useStore((s) => s.nodes);
  const defaultId = useStore((s) => s.settings.defaultProviderId);
  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));
  const help = form.preset?.help ?? PRESETS.find((p) => p.kind === form.kind && p.baseUrl === form.baseUrl)?.help ?? PRESETS.find((p) => p.kind === form.kind)?.help;
  const needsKey = form.kind !== 'mock' && form.kind !== 'cli';
  const keyUrl = form.preset?.keyUrl ?? PRESETS.find((p) => p.kind === form.kind && p.baseUrl === form.baseUrl)?.keyUrl;
  const pasteKey = () => navigator.clipboard.readText().then((t) => set({ apiKey: t.trim() }), () => toast('Pega la key con Ctrl+V.', false));

  const save = async (): Promise<string | null> => {
    const body = { name: form.name, kind: form.kind, baseUrl: form.baseUrl, apiKey: form.apiKey, model: form.model, command: form.command };
    try {
      const saved = form.id ? await api('PATCH', `/providers/${form.id}`, body) : await api('POST', '/providers', body);
      set({ id: saved.id, apiKey: '' });
      return saved.id;
    } catch (e) {
      toast((e as Error).message, false);
      return null;
    }
  };
  const test = async () => {
    setBusy(true);
    setResult(null);
    const id = await save();
    if (id) {
      const r = await api('POST', `/providers/${id}/test`, { nodeId: testNode }).catch((e) => ({ ok: false, error: e.message, ms: 0 }));
      setResult(r.ok ? { ok: true, text: `Conexión correcta en ${(r.ms / 1000).toFixed(1)} s · «${r.answer}»` } : { ok: false, text: r.error });
    }
    setBusy(false);
  };

  return (
    <div className="providerform">
      {help && <p className="hint">{help}</p>}
      {keyUrl && (
        <div className="keylink">
          <span>¿No tienes key? Se crea en la web del proveedor.</span>
          <a className="button" href={keyUrl} target="_blank" rel="noreferrer">Abrir la página</a>
          <button onClick={() => void copy(keyUrl, 'Enlace copiado')}>Copiar enlace</button>
        </div>
      )}
      <label>Nombre<input value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
      {form.kind === 'openai' && (
        <label>URL base<input value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://…/v1" /></label>
      )}
      {form.kind === 'cli' && (
        <label>Comando<input value={form.command} onChange={(e) => set({ command: e.target.value })} placeholder="mi-agente --modo texto" /></label>
      )}
      {needsKey && (
        <label>{form.kind === 'claude-code' ? 'Token o API key' : 'API key'}
          <div className="row">
            <input type="password" value={form.apiKey} autoComplete="off" onChange={(e) => set({ apiKey: e.target.value })}
              placeholder={hasKey ? 'Guardada. Escribe para cambiarla' : form.kind === 'claude-code' || form.kind === 'codex' ? 'Opcional: no hace falta si inicias sesión' : 'Opcional si es local o está en .env'} />
            <button type="button" onClick={() => void pasteKey()}>Pegar</button>
          </div>
        </label>
      )}
      {form.kind !== 'mock' && form.kind !== 'cli' && (
        <label>Modelo<input value={form.model} onChange={(e) => set({ model: e.target.value })}
          placeholder={form.kind === 'claude-code' || form.kind === 'codex' ? 'Vacío = el predeterminado del CLI' : 'nombre-del-modelo'} /></label>
      )}
      {(form.kind === 'claude-code' || form.kind === 'codex') && <Session toolId={form.kind === 'codex' ? 'codex' : 'claude'} />}
      {nodes.length > 1 && (
        <label>Probar la conexión desde
          <select value={testNode} onChange={(e) => setTestNode(e.target.value)}>
            {nodes.map((n) => <option key={n.id} value={n.local ? '' : n.id}>{n.local ? 'Esta oficina' : n.name}</option>)}
          </select>
        </label>
      )}
      {result && <p className={`result ${result.ok ? 'ok' : 'bad'}`}>{result.text}</p>}
      <footer>
        {form.id && <button className="danger" onClick={() => void api('DELETE', `/providers/${form.id}`).then(onDone)}>Eliminar</button>}
        <span />
        {form.id && defaultId !== form.id && (
          <button onClick={() => void api('PATCH', '/settings', { defaultProviderId: form.id })}>Usar por defecto</button>
        )}
        <button disabled={busy || !form.name.trim()} onClick={() => void test()}>{busy ? 'Probando…' : 'Guardar y probar'}</button>
        <button className="primary" disabled={busy || !form.name.trim()} onClick={() => void save().then((id) => id && onDone())}>Guardar</button>
      </footer>
    </div>
  );
}

async function adopt(body: { name: string; kind: ProviderKind; baseUrl: string; apiKey: string; model: string }, existing?: Provider) {
  const saved = existing ?? await api<Provider>('POST', '/providers', { ...body, command: '' });
  await api('PATCH', '/settings', { defaultProviderId: saved.id });
  const r = await api('POST', `/providers/${saved.id}/test`, {}).catch((e) => ({ ok: false, error: e.message }));
  if (r.ok) toast(`${saved.name} conectado: la oficina ya piensa con él`);
  else toast(`${saved.name} queda por defecto, pero la prueba ha fallado: ${r.error}`, false);
}

function QuickCli({ cli }: { cli: 'claude' | 'codex' }) {
  const node = useStore((s) => s.nodes[0]);
  const providers = useStore((s) => s.providers);
  const defaultId = useStore((s) => s.settings.defaultProviderId);
  const tool = useTool(cli);
  const [action, setAction] = useState<ToolAction | null>(null);
  const [busy, setBusy] = useState(false);
  const kind: ProviderKind = cli === 'claude' ? 'claude-code' : 'codex';
  const provider = providers.find((p) => p.kind === kind);
  const auth = statusOf(node, cli);
  const inUse = !!provider && provider.id === defaultId;
  const use = async () => {
    setBusy(true);
    await adopt({ name: cli === 'claude' ? 'Claude Code' : 'Codex', kind, baseUrl: '', apiKey: '', model: '' }, provider).catch((e) => toast(e.message, false));
    setBusy(false);
  };
  return (
    <div className="quickcard">
      <header>
        <strong>{cli === 'claude' ? 'Tu cuenta de Claude' : 'Tu cuenta de ChatGPT'}</strong>
        <small>{tool?.name} · sin API key</small>
      </header>
      {!node?.online || !auth ? <p className="facts">Esperando al worker de la oficina…</p>
        : !auth.installed ? <p className="facts">{DEMO ? 'Disponible al instalar Agent Office con Docker: inicias sesión con dos clics.' : `${tool?.name} no está instalado en la imagen.`}</p>
          : auth.loggedIn ? (
            <>
              <p className="facts"><span className="pill green">Sesión iniciada</span> {auth.detail}</p>
              <div className="row">
                {inUse ? <span className="pill blue">La oficina piensa con esta cuenta</span>
                  : <button className="primary" disabled={busy} onClick={() => void use()}>{busy ? 'Probando…' : 'Usar en esta oficina'}</button>}
                <button onClick={() => setAction('logout')}>Cerrar sesión</button>
              </div>
            </>
          ) : (
            <>
              <p className="facts">Entras con tu cuenta en una pestaña y vuelves aquí. Dos pasos.</p>
              <button className="primary" onClick={() => setAction('login')}>Iniciar sesión</button>
            </>
          )}
      {action && node && tool && <LoginFlow key={action} node={node} tool={tool} action={action} onClose={() => setAction(null)} onDone={() => action === 'login' && void use()} />}
    </div>
  );
}

function QuickKey() {
  const [key, setKey] = useState('');
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const cloud = PRESETS.filter((p) => p.keyUrl);
  const detected = cloud.find((p) => p.match?.test(key.trim()));
  const preset = detected ?? cloud.find((p) => p.key === choice);
  const paste = () => navigator.clipboard.readText().then((t) => setKey(t.trim()), () => toast('Pega la key con Ctrl+V.', false));
  const connect = async () => {
    if (!preset) return;
    setBusy(true);
    await adopt({ name: preset.label, kind: preset.kind, baseUrl: preset.baseUrl, apiKey: key.trim(), model: preset.model })
      .then(() => setKey(''), (e) => toast(e.message, false));
    setBusy(false);
  };
  return (
    <div className="quickcard">
      <header>
        <strong>Una API key</strong>
        <small>Anthropic, OpenAI, Gemini, OpenRouter, Groq…</small>
      </header>
      <div className="row">
        <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Pega aquí tu API key" />
        <button onClick={() => void paste()}>Pegar</button>
      </div>
      {key.trim() && (detected
        ? <p className="facts">Es una key de <b>{detected.label}</b>.</p>
        : (
          <label>No reconozco el formato. ¿De quién es?
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Elige el proveedor</option>
              {cloud.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        ))}
      <button className="primary" disabled={!key.trim() || !preset || busy} onClick={() => void connect()}>{busy ? 'Probando…' : 'Conectar y probar'}</button>
      <details>
        <summary>¿Dónde consigo una key?</summary>
        {cloud.map((p) => (
          <div key={p.key} className="keylink">
            <span>{p.label}</span>
            <a className="button" href={p.keyUrl} target="_blank" rel="noreferrer">Abrir</a>
            <button onClick={() => void copy(p.keyUrl!, 'Enlace copiado')}>Copiar enlace</button>
          </div>
        ))}
      </details>
    </div>
  );
}

function Providers() {
  const providers = useStore((s) => s.providers);
  const defaultId = useStore((s) => s.settings.defaultProviderId);
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const editing = providers.find((p) => p.id === current);
  const groups = [...new Set(PRESETS.map((p) => p.group))];
  return (
    <div className="providers">
      <div className="list">
        <h4>Conectados</h4>
        {providers.map((p) => (
          <button key={p.id} className={current === p.id ? 'on' : ''} onClick={() => { setDraft(null); setCurrent(p.id); }}>
            <strong>{p.name}</strong>
            <small>{KIND_LABEL[p.kind]}{p.model ? ` · ${p.model}` : ''}</small>
            {defaultId === p.id && <em>por defecto</em>}
          </button>
        ))}
        <button className="add" onClick={() => { setCurrent(null); setDraft(null); }}>Conectar otro</button>
      </div>
      <div className="detail">
        {editing ? (
          <ProviderForm key={editing.id} draft={{ ...editing, apiKey: '' }} hasKey={editing.hasKey} onDone={() => setCurrent(null)} />
        ) : draft ? (
          <ProviderForm key={draft.preset?.key} draft={draft} hasKey={false} onDone={() => setDraft(null)} />
        ) : (
          <>
            <h4>Conectar en un paso</h4>
            <div className="quickgrid">
              <QuickCli cli="claude" />
              <QuickCli cli="codex" />
              <QuickKey />
            </div>
            <h4>Todas las opciones</h4>
            <p className="hint">Modelos locales, otros proveedores o un comando propio. Cada agente puede usar el de la oficina o uno suyo.</p>
            {groups.map((g) => (
              <div key={g} className="presetgroup">
                <h4>{g}</h4>
                <div className="presets">
                  {PRESETS.filter((p) => p.group === g).map((p) => (
                    <button key={p.key} onClick={() => setDraft({ id: '', name: p.label, kind: p.kind, baseUrl: p.baseUrl, apiKey: '', model: p.model, command: '', preset: p })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Profile() {
  const settings = useStore((s) => s.settings);
  const [name, setName] = useState(settings.playerName);
  const [appearance, setAppearance] = useState(settings.playerAppearance ?? DEFAULT_APPEARANCE);
  const [companion, setCompanion] = useState(settings.playerCompanion);
  const [office, setOffice] = useState(settings.officeName);
  const save = async () => {
    await api('PATCH', '/settings', { playerName: name, playerAppearance: appearance, playerCompanion: companion, officeName: office }).catch((e) => toast(e.message, false));
    toast('Perfil guardado');
  };
  return (
    <div className="editor">
      <AppearanceEditor value={appearance} onChange={setAppearance} />
      <div className="fields">
        <label>Tu nombre (así te llamarán los agentes)<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Nombre de esta oficina (así la verán las oficinas conectadas)<input value={office} onChange={(e) => setOffice(e.target.value)} /></label>
        {companion && <label>Tu compi<CompanionPicker value={companion} onChange={setCompanion} /></label>}
        <footer><span /><button className="primary" onClick={() => void save()}>Guardar perfil</button></footer>
      </div>
    </div>
  );
}

const INTENT: Record<string, string> = { chat: 'Conversación', task: 'Tarea', plan: 'Reparto', synth: 'Síntesis', test: 'Prueba' };

function Jobs() {
  const jobs = useStore((s) => s.jobs);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="jobsview">
      <p className="hint">Cada vez que un agente piensa, se crea un trabajo en segundo plano. Los de esta oficina pasan por la cola de Redis (BullMQ) y los ejecuta el contenedor <code>worker</code>; los de agentes en servidores remotos se envían a su servidor.</p>
      <div className="counters">
        <div><strong>{jobs.waiting}</strong><small>en cola</small></div>
        <div><strong>{jobs.active}</strong><small>ejecutándose</small></div>
        <div><strong>{jobs.totals.completed}</strong><small>completados</small></div>
        <div><strong>{jobs.totals.failed}</strong><small>fallidos</small></div>
      </div>
      <table>
        <thead><tr><th>Estado</th><th>Agente</th><th>Tipo</th><th>Proveedor</th><th>Dónde</th><th>Duración</th></tr></thead>
        <tbody>
          {jobs.jobs.map((j) => (
            <tr key={j.id} title={j.error}>
              <td><span className={`pill ${j.status === 'completed' ? 'green' : j.status === 'failed' ? 'red' : j.status === 'active' ? 'blue' : 'muted'}`}>
                {j.status === 'completed' ? 'Hecho' : j.status === 'failed' ? 'Error' : j.status === 'active' ? 'Ejecutando' : 'En cola'}</span></td>
              <td>{j.agentName}</td>
              <td>{INTENT[j.intent] ?? j.intent}</td>
              <td>{j.provider}</td>
              <td>{j.node}</td>
              <td>{((j.ms ?? Date.now() - j.startedAt) / 1000).toFixed(1)} s</td>
            </tr>
          ))}
          {!jobs.jobs.length && <tr><td colSpan={6} className="empty">Sin actividad todavía.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsModal({ tab: initial }: { tab?: 'providers' | 'tools' | 'nodes' | 'profile' | 'jobs' }) {
  const [tab, setTab] = useState(initial ?? 'providers');
  return (
    <Modal title="Modelos y ajustes" onClose={() => setState({ modal: null })} wide>
      <nav className="tabs">
        <button className={tab === 'providers' ? 'on' : ''} onClick={() => setTab('providers')}>Modelos</button>
        <button className={tab === 'tools' ? 'on' : ''} onClick={() => setTab('tools')}>Herramientas</button>
        <button className={tab === 'nodes' ? 'on' : ''} onClick={() => setTab('nodes')}>Servidores y sesiones</button>
        <button className={tab === 'jobs' ? 'on' : ''} onClick={() => setTab('jobs')}>Actividad</button>
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Mi perfil</button>
      </nav>
      {tab === 'providers' && <Providers />}
      {tab === 'tools' && <Tools />}
      {tab === 'nodes' && <Servers />}
      {tab === 'jobs' && <Jobs />}
      {tab === 'profile' && <Profile />}
    </Modal>
  );
}
