import { useEffect, useState } from 'react';
import { DEFAULT_APPEARANCE } from '../game/character';
import { api } from '../net';
import { setState, toast, useStore } from '../store';
import type { Provider, ProviderKind } from '../types';
import { AppearanceEditor } from './AgentEditor';
import { Modal } from './common';
import { CompanionPicker } from './Companions';

interface Preset {
  key: string;
  label: string;
  group: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  help: string;
}

const PRESETS: Preset[] = [
  { key: 'anthropic', group: 'API en la nube', label: 'Anthropic · Claude API', kind: 'anthropic', baseUrl: '', model: 'claude-opus-5-5', help: 'API key de console.anthropic.com. Modelos: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5, claude-fable-5-2.' },
  { key: 'openai', group: 'API en la nube', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5', help: 'API key de platform.openai.com. Escribe el modelo exacto que quieras usar.' },
  { key: 'gemini', group: 'API en la nube', label: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', help: 'API key de Google AI Studio (endpoint compatible con OpenAI).' },
  { key: 'openrouter', group: 'API en la nube', label: 'OpenRouter (cientos de modelos)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', help: 'Una sola key para modelos de muchos proveedores.' },
  { key: 'groq', group: 'API en la nube', label: 'Groq (muy rápido)', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', help: 'API key de console.groq.com.' },
  { key: 'mistral', group: 'API en la nube', label: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', help: 'API key de console.mistral.ai.' },
  { key: 'deepseek', group: 'API en la nube', label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', help: 'API key de platform.deepseek.com.' },
  { key: 'ollama', group: 'Local', label: 'Ollama (local)', kind: 'openai', baseUrl: 'http://host.docker.internal:11434/v1', model: 'llama3.2', help: 'Ollama en tu máquina, sin API key. Usa un modelo que tengas descargado (ollama list).' },
  { key: 'lmstudio', group: 'Local', label: 'LM Studio (local)', kind: 'openai', baseUrl: 'http://host.docker.internal:1234/v1', model: 'local-model', help: 'Activa el servidor local de LM Studio. Sin API key.' },
  { key: 'custom', group: 'Local', label: 'Otro compatible con OpenAI', kind: 'openai', baseUrl: 'http://host.docker.internal:8000/v1', model: '', help: 'Cualquier servidor con /chat/completions: vLLM, llama.cpp, LiteLLM, Azure…' },
  { key: 'claude-code', group: 'Agentes CLI', label: 'Claude Code (tu suscripción)', kind: 'claude-code', baseUrl: '', model: '', help: 'Se ejecuta `claude -p` en el worker. Genera un token con `claude setup-token` y pégalo aquí (o ponlo en .env como CLAUDE_CODE_OAUTH_TOKEN). También acepta una API key de Anthropic.' },
  { key: 'codex', group: 'Agentes CLI', label: 'Codex CLI (OpenAI)', kind: 'codex', baseUrl: '', model: '', help: 'Se ejecuta `codex exec` en el worker con tu API key de OpenAI.' },
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
  const defaultId = useStore((s) => s.settings.defaultProviderId);
  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));
  const help = form.preset?.help ?? PRESETS.find((p) => p.kind === form.kind && p.baseUrl === form.baseUrl)?.help ?? PRESETS.find((p) => p.kind === form.kind)?.help;
  const needsKey = form.kind !== 'mock' && form.kind !== 'cli';

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
      const r = await api('POST', `/providers/${id}/test`).catch((e) => ({ ok: false, error: e.message, ms: 0 }));
      setResult(r.ok ? { ok: true, text: `Conexión correcta en ${(r.ms / 1000).toFixed(1)} s · «${r.answer}»` } : { ok: false, text: r.error });
    }
    setBusy(false);
  };

  return (
    <div className="providerform">
      {help && <p className="hint">{help}</p>}
      <label>Nombre<input value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
      {form.kind === 'openai' && (
        <label>URL base<input value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://…/v1" /></label>
      )}
      {form.kind === 'cli' && (
        <label>Comando<input value={form.command} onChange={(e) => set({ command: e.target.value })} placeholder="mi-agente --modo texto" /></label>
      )}
      {needsKey && (
        <label>{form.kind === 'claude-code' ? 'Token o API key' : 'API key'}
          <input type="password" value={form.apiKey} autoComplete="off" onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={hasKey ? '•••••••• guardada (escribe para cambiarla)' : 'Opcional si es local o está en .env'} />
        </label>
      )}
      {form.kind !== 'mock' && form.kind !== 'cli' && (
        <label>Modelo<input value={form.model} onChange={(e) => set({ model: e.target.value })}
          placeholder={form.kind === 'claude-code' || form.kind === 'codex' ? 'Vacío = el predeterminado del CLI' : 'nombre-del-modelo'} /></label>
      )}
      {result && <p className={`result ${result.ok ? 'ok' : 'bad'}`}>{result.ok ? '✅' : '❌'} {result.text}</p>}
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
        <button className="add" onClick={() => { setCurrent(null); setDraft(null); }}>＋ Conectar otro</button>
      </div>
      <div className="detail">
        {editing ? (
          <ProviderForm key={editing.id} draft={{ ...editing, apiKey: '' }} hasKey={editing.hasKey} onDone={() => setCurrent(null)} />
        ) : draft ? (
          <ProviderForm key={draft.preset?.key} draft={draft} hasKey={false} onDone={() => setDraft(null)} />
        ) : (
          <>
            <p className="hint">Elige con qué piensan tus agentes. Cada agente puede usar el proveedor por defecto de la oficina o uno propio.</p>
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
  const save = async () => {
    await api('PATCH', '/settings', { playerName: name, playerAppearance: appearance, playerCompanion: companion }).catch((e) => toast(e.message, false));
    toast('Perfil guardado');
  };
  return (
    <div className="editor">
      <AppearanceEditor value={appearance} onChange={setAppearance} />
      <div className="fields">
        <label>Tu nombre (así te llamarán los agentes)<input value={name} onChange={(e) => setName(e.target.value)} /></label>
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
      <p className="hint">Cada vez que un agente piensa, se encola un trabajo en Redis (BullMQ) y lo ejecuta el contenedor <code>worker</code> en segundo plano, sin bloquear la oficina.</p>
      <div className="counters">
        <div><strong>{jobs.waiting}</strong><small>en cola</small></div>
        <div><strong>{jobs.active}</strong><small>ejecutándose</small></div>
        <div><strong>{jobs.totals.completed}</strong><small>completados</small></div>
        <div><strong>{jobs.totals.failed}</strong><small>fallidos</small></div>
      </div>
      <table>
        <thead><tr><th>Estado</th><th>Agente</th><th>Tipo</th><th>Proveedor</th><th>Duración</th></tr></thead>
        <tbody>
          {jobs.jobs.map((j) => (
            <tr key={j.id} title={j.error}>
              <td><span className={`pill ${j.status === 'completed' ? 'green' : j.status === 'failed' ? 'red' : j.status === 'active' ? 'blue' : 'muted'}`}>
                {j.status === 'completed' ? 'Hecho' : j.status === 'failed' ? 'Error' : j.status === 'active' ? 'Ejecutando' : 'En cola'}</span></td>
              <td>{j.agentName}</td>
              <td>{INTENT[j.intent] ?? j.intent}</td>
              <td>{j.provider}</td>
              <td>{((j.ms ?? Date.now() - j.startedAt) / 1000).toFixed(1)} s</td>
            </tr>
          ))}
          {!jobs.jobs.length && <tr><td colSpan={5} className="empty">Sin actividad todavía.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsModal({ tab: initial }: { tab?: 'providers' | 'profile' | 'jobs' }) {
  const [tab, setTab] = useState(initial ?? 'providers');
  return (
    <Modal title="Tu ordenador" onClose={() => setState({ modal: null })} wide>
      <nav className="tabs">
        <button className={tab === 'providers' ? 'on' : ''} onClick={() => setTab('providers')}>🧠 Proveedores LLM</button>
        <button className={tab === 'jobs' ? 'on' : ''} onClick={() => setTab('jobs')}>⚡ Segundo plano</button>
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>🙂 Mi perfil</button>
      </nav>
      {tab === 'providers' && <Providers />}
      {tab === 'jobs' && <Jobs />}
      {tab === 'profile' && <Profile />}
    </Modal>
  );
}
