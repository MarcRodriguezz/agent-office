import { useState } from 'react';
import { api, copy } from '../net';
import { toast, useStore } from '../store';
import type { Connection, NodeState, ToolAction, ToolDef } from '../types';
import { LoginFlow, ToolRow } from './Servers';

const CUSTOM: ToolDef = { id: 'custom', name: 'Otra herramienta', bin: '', summary: 'Cualquier CLI que lea sus credenciales de variables de entorno.', fields: [] };

function NodeTools({ tool }: { tool: ToolDef }) {
  const nodes = useStore((s) => s.nodes);
  const [open, setOpen] = useState<{ node: NodeState; action: ToolAction } | null>(null);
  if (tool.id === 'custom') return null;
  return (
    <div className="nodetools">
      {nodes.map((n) => (
        <div key={n.id} className="sessionrow">
          <em>{n.name}</em>
          <ToolRow node={n} tool={tool} onAction={(action) => setOpen({ node: n, action })} />
        </div>
      ))}
      {open && <LoginFlow key={`${open.node.id}-${open.action}`} node={open.node} tool={tool} action={open.action} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ConnectionForm({ tool, current, onDone }: { tool: ToolDef; current?: Connection; onDone: () => void }) {
  const [name, setName] = useState(current?.name ?? (tool.id === 'custom' ? '' : tool.name));
  const [bin, setBin] = useState(current?.bin ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<{ key: string; value: string }[]>(
    tool.id === 'custom' ? (current?.keys.map((key) => ({ key, value: '' })) ?? [{ key: '', value: '' }]) : [],
  );
  const [busy, setBusy] = useState(false);
  const fields = tool.id === 'custom' ? [] : tool.fields;

  const save = async () => {
    const env: Record<string, string> = { ...values };
    for (const row of extra) if (row.key.trim() && row.value.trim()) env[row.key.trim().toUpperCase()] = row.value;
    setBusy(true);
    try {
      if (current) await api('PATCH', `/connections/${current.id}`, { name, bin, env });
      else await api('POST', '/connections', { tool: tool.id, name, bin, env });
      toast(current ? 'Conexión guardada' : `${name} conectada: elige en cada agente si puede usarla`);
      onDone();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="providerform">
      <p className="hint">{tool.summary}{tool.login ? ' Puedes iniciar sesión en el servidor (abajo) o pegar un token: con cualquiera de las dos vale.' : ''}</p>
      {tool.tokenUrl && (
        <div className="keylink">
          <span>El token se crea en la web de {tool.name}.</span>
          <a className="button" href={tool.tokenUrl} target="_blank" rel="noreferrer">Abrir la página</a>
          <button onClick={() => void copy(tool.tokenUrl!, 'Enlace copiado')}>Copiar enlace</button>
        </div>
      )}
      <div className="row">
        <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} placeholder="GitHub de la empresa" /></label>
        {tool.id === 'custom' && (
          <label>Comando<input value={bin} onChange={(e) => setBin(e.target.value)} placeholder="flyctl, supabase, aws…" /></label>
        )}
      </div>
      {fields.map((f) => (
        <label key={f.key}>{f.label}{f.optional || tool.login ? ' (opcional)' : ''} <small><code>{f.key}</code></small>
          <input type="password" autoComplete="off" value={values[f.key] ?? ''}
            placeholder={current?.keys.includes(f.key) ? 'Guardado. Escribe para cambiarlo' : ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
        </label>
      ))}
      {tool.id === 'custom' && (
        <div className="envrows">
          <small>Variables de entorno que necesita la herramienta</small>
          {extra.map((row, i) => (
            <div key={i} className="row">
              <input value={row.key} placeholder="NOMBRE_VARIABLE" onChange={(e) => setExtra((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))} />
              <input type="password" autoComplete="off" value={row.value} placeholder={current?.keys.includes(row.key) ? 'Guardado' : 'valor'}
                onChange={(e) => setExtra((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
            </div>
          ))}
          <button onClick={() => setExtra((rows) => [...rows, { key: '', value: '' }])}>Añadir variable</button>
        </div>
      )}
      <NodeTools tool={tool} />
      <footer>
        {current && (
          <button className="danger" onClick={() => confirm(`¿Quitar la conexión «${current.name}»? Los agentes dejarán de tenerla.`)
            && void api('DELETE', `/connections/${current.id}`).then(onDone)}>Quitar</button>
        )}
        <span />
        <button onClick={onDone}>Cancelar</button>
        <button className="primary" disabled={busy || !name.trim() || (tool.id === 'custom' && !bin.trim())} onClick={() => void save()}>
          {current ? 'Guardar' : 'Conectar'}
        </button>
      </footer>
    </div>
  );
}

export function Tools() {
  const tools = useStore((s) => s.tools);
  const connections = useStore((s) => s.connections);
  const agents = useStore((s) => s.agents);
  const [editing, setEditing] = useState<{ tool: ToolDef; current?: Connection } | null>(null);
  const catalog = tools.filter((t) => !t.brain);
  const toolFor = (c: Connection) => tools.find((t) => t.id === c.tool) ?? { ...CUSTOM, bin: c.bin };

  return (
    <div className="providers">
      <div className="list">
        <h4>Conexiones</h4>
        {connections.map((c) => {
          const users = agents.filter((a) => a.connections.includes(c.id)).length;
          return (
            <button key={c.id} className={editing?.current?.id === c.id ? 'on' : ''} onClick={() => setEditing({ tool: toolFor(c), current: c })}>
              <strong>{c.name}</strong>
              <small>{c.bin || 'sin comando'} · {users ? `${users} ${users === 1 ? 'agente' : 'agentes'}` : 'nadie la usa'}</small>
            </button>
          );
        })}
        {!connections.length && <p className="empty">Todavía no hay ninguna.</p>}
        <button className="add" onClick={() => setEditing(null)}>Conectar otra</button>
      </div>
      <div className="detail">
        {editing ? (
          <ConnectionForm key={editing.current?.id ?? editing.tool.id} tool={editing.tool} current={editing.current} onDone={() => setEditing(null)} />
        ) : (
          <>
            <p className="hint">
              Herramientas de terminal externas para que los agentes trabajen fuera de la oficina: subir código, desplegar, gestionar dominios…
              Funcionan con cualquier cerebro (API, modelo local o CLI). Cada conexión guarda sus credenciales y en cada agente eliges cuáles puede usar.
              Las sesiones iniciadas y lo que instales se conservan entre reinicios.
            </p>
            <div className="presets">
              {[...catalog, CUSTOM].map((t) => (
                <button key={t.id} onClick={() => setEditing({ tool: t })}>
                  <strong>{t.name}</strong>
                  {t.bin && <small> · {t.bin}</small>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
