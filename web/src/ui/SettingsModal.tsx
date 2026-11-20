import { useEffect, useState } from 'react';
import { DEFAULT_APPEARANCE } from '../game/character';
import { api, changeLang, copy } from '../net';
import { setState, toast, useStore } from '../store';
import { DEMO } from '../transport';
import type { Provider, ProviderKind, ToolAction } from '../types';
import { AppearanceEditor } from './AgentEditor';
import { Modal } from './common';
import { CompanionPicker } from './Companions';
import { LoginFlow, Servers, Session, statusOf, useTool } from './Servers';
import { Tools } from './Tools';
import { isLang, LANG, LANG_NAME, LANGS, t } from '../i18n';

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
  { key: 'anthropic', group: t('API en la nube'), label: 'Anthropic · Claude API', kind: 'anthropic', baseUrl: '', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', match: /^sk-ant-/, help: t('API key de console.anthropic.com. Modelos: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5, claude-fable-5-2.') },
  { key: 'openai', group: t('API en la nube'), label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5', keyUrl: 'https://platform.openai.com/api-keys', match: /^sk-(?!ant-|or-)/, help: t('API key de platform.openai.com. Escribe el modelo exacto que quieras usar.') },
  { key: 'gemini', group: t('API en la nube'), label: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey', match: /^AIza/, help: t('API key de Google AI Studio (endpoint compatible con OpenAI).') },
  { key: 'openrouter', group: t('API en la nube'), label: t('OpenRouter (cientos de modelos)'), kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', keyUrl: 'https://openrouter.ai/keys', match: /^sk-or-/, help: t('Una sola key para modelos de muchos proveedores.') },
  { key: 'groq', group: t('API en la nube'), label: t('Groq (muy rápido)'), kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', match: /^gsk_/, help: t('API key de console.groq.com.') },
  { key: 'mistral', group: t('API en la nube'), label: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', keyUrl: 'https://console.mistral.ai/api-keys', help: t('API key de console.mistral.ai.') },
  { key: 'deepseek', group: t('API en la nube'), label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys', help: t('API key de platform.deepseek.com.') },
  { key: 'ollama', group: 'Local', label: t('Ollama (local)'), kind: 'openai', baseUrl: 'http://host.docker.internal:11434/v1', model: 'llama3.2', help: t('Ollama en tu máquina, sin API key. Usa un modelo que tengas descargado (ollama list).') },
  { key: 'lmstudio', group: 'Local', label: t('LM Studio (local)'), kind: 'openai', baseUrl: 'http://host.docker.internal:1234/v1', model: 'local-model', help: t('Activa el servidor local de LM Studio. Sin API key.') },
  { key: 'custom', group: 'Local', label: t('Otro compatible con OpenAI'), kind: 'openai', baseUrl: 'http://host.docker.internal:8000/v1', model: '', help: t('Cualquier servidor con /chat/completions: vLLM, llama.cpp, LiteLLM, Azure…') },
  { key: 'claude-code', group: t('Agentes CLI'), label: t('Claude Code (tu suscripción)'), kind: 'claude-code', baseUrl: '', model: '', help: t('Usa tu suscripción de Claude. Inicia sesión aquí abajo: se abre la página de Claude, autorizas y pegas el código. El token o la API key son opcionales, por si prefieres no iniciar sesión.') },
  { key: 'codex', group: t('Agentes CLI'), label: 'Codex CLI (OpenAI)', kind: 'codex', baseUrl: '', model: '', help: t('Usa tu cuenta de ChatGPT. Inicia sesión aquí abajo con el código de dispositivo. La API key de OpenAI es opcional, por si prefieres no iniciar sesión.') },
  { key: 'cli', group: t('Agentes CLI'), label: t('Comando propio'), kind: 'cli', baseUrl: '', model: '', help: t('Cualquier comando instalado en el worker: recibe el prompt por stdin y su salida es la respuesta.') },
  { key: 'mock', group: t('Sin LLM'), label: t('Cerebro simulado'), kind: 'mock', baseUrl: '', model: '', help: t('Respuestas de mentira para probar la oficina sin gastar tokens.') },
];

const KIND_LABEL: Record<ProviderKind, string> = {
  mock: t('Simulado'), anthropic: 'Anthropic', openai: t('Compatible OpenAI'), 'claude-code': 'Claude Code CLI', codex: 'Codex CLI', cli: t('Comando'),
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
  const pasteKey = () => navigator.clipboard.readText().then((t) => set({ apiKey: t.trim() }), () => toast(t('Pega la key con Ctrl+V.'), false));

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
      setResult(r.ok ? { ok: true, text: t('Conexión correcta en {v0} s · «{answer}»', { v0: (r.ms / 1000).toFixed(1), answer: r.answer }) } : { ok: false, text: r.error });
    }
    setBusy(false);
  };

  return (
    <div className="providerform">
      {help && <p className="hint">{help}</p>}
      {keyUrl && (
        <div className="keylink">
          <span>{t('¿No tienes key? Se crea en la web del proveedor.')}</span>
          <a className="button" href={keyUrl} target="_blank" rel="noreferrer">{t('Abrir la página')}</a>
          <button onClick={() => void copy(keyUrl, t('Enlace copiado'))}>{t('Copiar enlace')}</button>
        </div>
      )}
      <label>{t('Nombre')}<input value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
      {form.kind === 'openai' && (
        <label>{t('URL base')}<input value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://…/v1" /></label>
      )}
      {form.kind === 'cli' && (
        <label>{t('Comando')}<input value={form.command} onChange={(e) => set({ command: e.target.value })} placeholder={t('mi-agente --modo texto')} /></label>
      )}
      {needsKey && (
        <label>{form.kind === 'claude-code' ? t('Token o API key') : 'API key'}
          <div className="row">
            <input type="password" value={form.apiKey} autoComplete="off" onChange={(e) => set({ apiKey: e.target.value })}
              placeholder={hasKey ? t('Guardada. Escribe para cambiarla') : form.kind === 'claude-code' || form.kind === 'codex' ? t('Opcional: no hace falta si inicias sesión') : t('Opcional si es local o está en .env')} />
            <button type="button" onClick={() => void pasteKey()}>{t('Pegar')}</button>
          </div>
        </label>
      )}
      {form.kind !== 'mock' && form.kind !== 'cli' && (
        <label>{t('Modelo')}<input value={form.model} onChange={(e) => set({ model: e.target.value })}
          placeholder={form.kind === 'claude-code' || form.kind === 'codex' ? t('Vacío = el predeterminado del CLI') : 'nombre-del-modelo'} /></label>
      )}
      {(form.kind === 'claude-code' || form.kind === 'codex') && <Session toolId={form.kind === 'codex' ? 'codex' : 'claude'} />}
      {nodes.length > 1 && (
        <label>{t('Probar la conexión desde')}<select value={testNode} onChange={(e) => setTestNode(e.target.value)}>
            {nodes.map((n) => <option key={n.id} value={n.local ? '' : n.id}>{n.local ? t('Esta oficina') : n.name}</option>)}
          </select>
        </label>
      )}
      {result && <p className={`result ${result.ok ? 'ok' : 'bad'}`}>{result.text}</p>}
      <footer>
        {form.id && <button className="danger" onClick={() => void api('DELETE', `/providers/${form.id}`).then(onDone)}>{t('Eliminar')}</button>}
        <span />
        {form.id && defaultId !== form.id && (
          <button onClick={() => void api('PATCH', '/settings', { defaultProviderId: form.id })}>{t('Usar por defecto')}</button>
        )}
        <button disabled={busy || !form.name.trim()} onClick={() => void test()}>{busy ? t('Probando…') : t('Guardar y probar')}</button>
        <button className="primary" disabled={busy || !form.name.trim()} onClick={() => void save().then((id) => id && onDone())}>{t('Guardar')}</button>
      </footer>
    </div>
  );
}

async function adopt(body: { name: string; kind: ProviderKind; baseUrl: string; apiKey: string; model: string }, existing?: Provider) {
  const saved = existing ?? await api<Provider>('POST', '/providers', { ...body, command: '' });
  await api('PATCH', '/settings', { defaultProviderId: saved.id });
  const r = await api('POST', `/providers/${saved.id}/test`, {}).catch((e) => ({ ok: false, error: e.message }));
  if (r.ok) toast(t('{name} conectado: la oficina ya piensa con él', { name: saved.name }));
  else toast(t('{name} queda por defecto, pero la prueba ha fallado: {error}', { name: saved.name, error: r.error }), false);
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
        <strong>{cli === 'claude' ? t('Tu cuenta de Claude') : t('Tu cuenta de ChatGPT')}</strong>
        <small>{t('{name} · sin API key', { name: tool?.name })}</small>
      </header>
      {!node?.online || !auth ? <p className="facts">{t('Esperando al worker de la oficina…')}</p>
        : !auth.installed ? <p className="facts">{DEMO ? t('Disponible al instalar Agent Office con Docker: inicias sesión con dos clics.') : t('{name} no está instalado en la imagen.', { name: tool?.name })}</p>
          : auth.loggedIn ? (
            <>
              <p className="facts"><span className="pill green">{t('Sesión iniciada')}</span> {auth.detail}</p>
              <div className="row">
                {inUse ? <span className="pill blue">{t('La oficina piensa con esta cuenta')}</span>
                  : <button className="primary" disabled={busy} onClick={() => void use()}>{busy ? t('Probando…') : t('Usar en esta oficina')}</button>}
                <button onClick={() => setAction('logout')}>{t('Cerrar sesión')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="facts">{t('Entras con tu cuenta en una pestaña y vuelves aquí. Dos pasos.')}</p>
              <button className="primary" onClick={() => setAction('login')}>{t('Iniciar sesión')}</button>
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
  const paste = () => navigator.clipboard.readText().then((t) => setKey(t.trim()), () => toast(t('Pega la key con Ctrl+V.'), false));
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
        <strong>{t('Una API key')}</strong>
        <small>Anthropic, OpenAI, Gemini, OpenRouter, Groq…</small>
      </header>
      <div className="row">
        <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t('Pega aquí tu API key')} />
        <button onClick={() => void paste()}>{t('Pegar')}</button>
      </div>
      {key.trim() && (detected
        ? <p className="facts">{t('Es una key de')} <b>{detected.label}</b>.</p>
        : (
          <label>{t('No reconozco el formato. ¿De quién es?')}<select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t('Elige el proveedor')}</option>
              {cloud.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        ))}
      <button className="primary" disabled={!key.trim() || !preset || busy} onClick={() => void connect()}>{busy ? t('Probando…') : t('Conectar y probar')}</button>
      <details>
        <summary>{t('¿Dónde consigo una key?')}</summary>
        {cloud.map((p) => (
          <div key={p.key} className="keylink">
            <span>{p.label}</span>
            <a className="button" href={p.keyUrl} target="_blank" rel="noreferrer">{t('Abrir')}</a>
            <button onClick={() => void copy(p.keyUrl!, t('Enlace copiado'))}>{t('Copiar enlace')}</button>
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
        <h4>{t('Conectados')}</h4>
        {providers.map((p) => (
          <button key={p.id} className={current === p.id ? 'on' : ''} onClick={() => { setDraft(null); setCurrent(p.id); }}>
            <strong>{p.name}</strong>
            <small>{KIND_LABEL[p.kind]}{p.model ? ` · ${p.model}` : ''}</small>
            {defaultId === p.id && <em>{t('por defecto')}</em>}
          </button>
        ))}
        <button className="add" onClick={() => { setCurrent(null); setDraft(null); }}>{t('Conectar otro')}</button>
      </div>
      <div className="detail">
        {editing ? (
          <ProviderForm key={editing.id} draft={{ ...editing, apiKey: '' }} hasKey={editing.hasKey} onDone={() => setCurrent(null)} />
        ) : draft ? (
          <ProviderForm key={draft.preset?.key} draft={draft} hasKey={false} onDone={() => setDraft(null)} />
        ) : (
          <>
            <h4>{t('Conectar en un paso')}</h4>
            <div className="quickgrid">
              <QuickCli cli="claude" />
              <QuickCli cli="codex" />
              <QuickKey />
            </div>
            <h4>{t('Todas las opciones')}</h4>
            <p className="hint">{t('Modelos locales, otros proveedores o un comando propio. Cada agente puede usar el de la oficina o uno suyo.')}</p>
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
    toast(t('Perfil guardado'));
  };
  return (
    <div className="editor">
      <AppearanceEditor value={appearance} onChange={setAppearance} />
      <div className="fields">
        <label>{t('Tu nombre (así te llamarán los agentes)')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{t('Nombre de esta oficina (así la verán las oficinas conectadas)')}<input value={office} onChange={(e) => setOffice(e.target.value)} /></label>
        <label>{t('Idioma de la interfaz y de los agentes')}
          <select value={LANG} onChange={(e) => isLang(e.target.value) && void changeLang(e.target.value)}>
            {LANGS.map((lang) => <option key={lang} value={lang}>{LANG_NAME[lang]}</option>)}
          </select>
        </label>
        {companion && <label>{t('Tu compi')}<CompanionPicker value={companion} onChange={setCompanion} /></label>}
        <footer><span /><button className="primary" onClick={() => void save()}>{t('Guardar perfil')}</button></footer>
      </div>
    </div>
  );
}

const INTENT: Record<string, string> = { chat: t('Conversación'), task: t('Tarea'), plan: t('Reparto'), synth: t('Síntesis'), test: t('Prueba'), meeting: t('Reunión'), minutes: t('Acta') };

function Jobs() {
  const jobs = useStore((s) => s.jobs);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="jobsview">
      <p className="hint">{t('Cada vez que un agente piensa, se crea un trabajo en segundo plano. Los de esta oficina pasan por la cola de Redis (BullMQ) y los ejecuta el contenedor')} <code>worker</code>{t('; los de agentes en servidores remotos se envían a su servidor.')}</p>
      <div className="counters">
        <div><strong>{jobs.waiting}</strong><small>{t('en cola')}</small></div>
        <div><strong>{jobs.active}</strong><small>{t('ejecutándose')}</small></div>
        <div><strong>{jobs.totals.completed}</strong><small>completados</small></div>
        <div><strong>{jobs.totals.failed}</strong><small>fallidos</small></div>
      </div>
      <table>
        <thead><tr><th>{t('Estado')}</th><th>{t('Agente')}</th><th>{t('Tipo')}</th><th>{t('Proveedor')}</th><th>{t('Dónde')}</th><th>{t('Duración')}</th></tr></thead>
        <tbody>
          {jobs.jobs.map((j) => (
            <tr key={j.id} title={j.error}>
              <td><span className={`pill ${j.status === 'completed' ? 'green' : j.status === 'failed' ? 'red' : j.status === 'active' ? 'blue' : 'muted'}`}>
                {j.status === 'completed' ? t('Hecho') : j.status === 'failed' ? 'Error' : j.status === 'active' ? t('Ejecutando') : t('En cola')}</span></td>
              <td>{j.agentName}</td>
              <td>{INTENT[j.intent] ?? j.intent}</td>
              <td>{j.provider}</td>
              <td>{j.node}</td>
              <td>{((j.ms ?? Date.now() - j.startedAt) / 1000).toFixed(1)} s</td>
            </tr>
          ))}
          {!jobs.jobs.length && <tr><td colSpan={6} className="empty">{t('Sin actividad todavía.')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsModal({ tab: initial }: { tab?: 'providers' | 'tools' | 'nodes' | 'profile' | 'jobs' }) {
  const [tab, setTab] = useState(initial ?? 'providers');
  return (
    <Modal title={t('Modelos y ajustes')} onClose={() => setState({ modal: null })} wide>
      <nav className="tabs">
        <button className={tab === 'providers' ? 'on' : ''} onClick={() => setTab('providers')}>{t('Modelos')}</button>
        <button className={tab === 'tools' ? 'on' : ''} onClick={() => setTab('tools')}>{t('Herramientas')}</button>
        <button className={tab === 'nodes' ? 'on' : ''} onClick={() => setTab('nodes')}>{t('Servidores y sesiones')}</button>
        <button className={tab === 'jobs' ? 'on' : ''} onClick={() => setTab('jobs')}>{t('Actividad')}</button>
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>{t('Mi perfil')}</button>
      </nav>
      {tab === 'providers' && <Providers />}
      {tab === 'tools' && <Tools />}
      {tab === 'nodes' && <Servers />}
      {tab === 'jobs' && <Jobs />}
      {tab === 'profile' && <Profile />}
    </Modal>
  );
}
