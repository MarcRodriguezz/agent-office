import { useEffect, useRef, useState } from 'react';
import { api, openTerm } from '../net';
import { toast, useStore } from '../store';
import type { CliAuth, LoginAction, NodeState } from '../types';

type Cli = 'claude' | 'codex';

const CLI_LABEL: Record<Cli, string> = { claude: 'Claude Code', codex: 'Codex' };

const clean = (raw: string) => raw
  .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b./g, '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n{3,}/g, '\n\n');

function LoginTerminal({ node, action, onClose }: { node: NodeState; action: LoginAction; onClose: () => void }) {
  const [output, setOutput] = useState('');
  const [state, setState] = useState<'starting' | 'running' | 'done' | 'error'>('starting');
  const [value, setValue] = useState('');
  const term = useRef<{ input: (data: string) => void; kill: () => void } | null>(null);
  const box = useRef<HTMLPreElement>(null);
  const isClaude = action.startsWith('claude');

  useEffect(() => {
    let alive = true;
    void openTerm(node.id, action, (data) => alive && setOutput((o) => o + data), (code) => alive && setState(code === 0 ? 'done' : 'error'))
      .then((t) => {
        if (!alive) {
          t?.kill();
          return;
        }
        term.current = t;
        setState(t ? 'running' : 'error');
        if (!t) setOutput('No se ha podido abrir la sesión en este servidor.');
      });
    return () => {
      alive = false;
      term.current?.kill();
    };
  }, [node.id, action]);

  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [output]);

  const text = clean(output);
  const url = text.match(/https?:\/\/[^\s]+/)?.[0];
  const send = () => {
    if (!value.trim()) return;
    term.current?.input(`${value.trim()}\r`);
    setValue('');
  };

  return (
    <div className="login">
      <header>
        <strong>{action.endsWith('login') ? 'Iniciar sesión' : 'Cerrar sesión'} · {isClaude ? 'Claude Code' : 'Codex'} · {node.name}</strong>
        <button className="icon" onClick={onClose} aria-label="Cerrar">✕</button>
      </header>
      {action.endsWith('login') && state === 'running' && (
        <ol>
          <li>{url ? <a href={url} target="_blank" rel="noreferrer">Abre la página de inicio de sesión ↗</a> : 'Esperando el enlace de inicio de sesión…'}</li>
          <li>{isClaude ? 'Autoriza el acceso y copia el código que te muestra la página.' : 'Introduce allí el código que aparece abajo y autoriza el acceso.'}</li>
          <li>{isClaude ? 'Pégalo aquí debajo y pulsa Enviar.' : 'Espera: esta ventana detecta sola cuándo has terminado.'}</li>
        </ol>
      )}
      <pre ref={box}>{text || 'Conectando…'}</pre>
      {state === 'running' && isClaude && action.endsWith('login') && (
        <div className="row">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Pega aquí el código de la página" autoFocus
            onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="primary" onClick={send}>Enviar</button>
        </div>
      )}
      {state === 'done' && <p className="result ok">✅ Hecho. El estado de la sesión se actualiza solo.</p>}
      {state === 'error' && <p className="result bad">❌ El proceso ha terminado con error. Revisa el texto de arriba y vuelve a intentarlo.</p>}
    </div>
  );
}

function CliRow({ node, cli, onAction }: { node: NodeState; cli: Cli; onAction: (action: LoginAction) => void }) {
  const auth: CliAuth | undefined = node.info?.[cli];
  if (!node.online || !auth) return <div className="clirow"><b>{CLI_LABEL[cli]}</b><small>Sin datos: el servidor no está conectado.</small></div>;
  if (!auth.installed) return <div className="clirow"><b>{CLI_LABEL[cli]}</b><small>No está instalado en este servidor.</small></div>;
  return (
    <div className="clirow">
      <b>{CLI_LABEL[cli]} <small>{auth.version}</small></b>
      <span className={`pill ${auth.loggedIn ? 'green' : 'muted'}`}>{auth.loggedIn ? 'Sesión iniciada' : 'Sin sesión'}</span>
      <small>{auth.detail}</small>
      {auth.loggedIn
        ? <button onClick={() => onAction(`${cli}-logout`)}>Cerrar sesión</button>
        : <button className="primary" onClick={() => onAction(`${cli}-login`)}>Iniciar sesión</button>}
    </div>
  );
}

export function Session({ cli }: { cli: Cli }) {
  const nodes = useStore((s) => s.nodes);
  const [open, setOpen] = useState<{ node: NodeState; action: LoginAction } | null>(null);
  return (
    <div className="sessions">
      <h4>Sesión de {CLI_LABEL[cli]}</h4>
      {nodes.map((n) => (
        <div key={n.id} className="sessionrow">
          <em>{n.local ? '🏢' : '🛰'} {n.name}</em>
          <CliRow node={n} cli={cli} onAction={(action) => setOpen({ node: n, action })} />
        </div>
      ))}
      {open && <LoginTerminal key={`${open.node.id}-${open.action}`} node={open.node} action={open.action} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Setup({ id }: { id: string }) {
  const [setup, setSetup] = useState<{ officeUrl: string; token: string } | null>(null);
  useEffect(() => {
    void api('GET', `/nodes/${id}/setup`).then(setSetup).catch(() => setSetup(null));
  }, [id]);
  if (!setup) return null;
  const command = `OFFICE_URL=${setup.officeUrl} NODE_TOKEN=${setup.token} docker compose -f docker-compose.node.yml up -d --build`;
  return (
    <div className="setup">
      <p className="hint">En el servidor remoto, con este repositorio clonado y Docker instalado, ejecuta:</p>
      <pre>{command}</pre>
      <button onClick={() => void navigator.clipboard.writeText(command).then(() => toast('Comando copiado'))}>Copiar comando</button>
    </div>
  );
}

export function Servers() {
  const nodes = useStore((s) => s.nodes);
  const agents = useStore((s) => s.agents);
  const linkUrl = useStore((s) => s.offices.office.linkUrl);
  const [name, setName] = useState('');
  const [url, setUrl] = useState(linkUrl);
  const [open, setOpen] = useState<{ node: NodeState; action: LoginAction } | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    await api('POST', '/nodes', { name }).catch((e) => toast(e.message, false));
    setName('');
  };
  const remove = async (node: NodeState) => {
    if (!confirm(`¿Quitar el servidor «${node.name}»? Sus agentes volverán a ejecutarse en esta oficina.`)) return;
    await api('DELETE', `/nodes/${node.id}`).catch((e) => toast(e.message, false));
  };

  return (
    <div className="servers">
      <p className="hint">
        Los agentes pueden pensar en esta oficina o en otros servidores tuyos (una máquina con GPU, un VPS con tu sesión de Claude Code…).
        Cada servidor se conecta a la oficina por sí mismo, así que no necesita puertos abiertos. Elige dónde se ejecuta cada agente al editarlo.
      </p>
      {nodes.map((n) => {
        const here = agents.filter((a) => (a.nodeId ?? 'local') === n.id);
        return (
          <section key={n.id} className="servercard">
            <header>
              <i className={n.online ? 'on' : ''} />
              <strong>{n.local ? '🏢' : '🛰'} {n.name}</strong>
              <small>{n.online ? `${n.info?.host ?? ''} · hasta ${n.info?.concurrency ?? '?'} trabajos a la vez${n.active ? ` · ${n.active} en curso` : ''}` : 'desconectado'}</small>
              <span />
              <button onClick={() => void api('POST', `/nodes/${n.id}/refresh`)} title="Volver a comprobar las sesiones">↻</button>
              {!n.local && <button className="danger" onClick={() => void remove(n)}>Quitar</button>}
            </header>
            <CliRow node={n} cli="claude" onAction={(action) => setOpen({ node: n, action })} />
            <CliRow node={n} cli="codex" onAction={(action) => setOpen({ node: n, action })} />
            <small className="who">{here.length ? `Trabajan aquí: ${here.map((a) => a.name).join(', ')}` : 'Ningún agente asignado.'}</small>
            {!n.local && !n.online && <Setup id={n.id} />}
            {open?.node.id === n.id && <LoginTerminal key={open.action} node={n} action={open.action} onClose={() => setOpen(null)} />}
          </section>
        );
      })}
      <div className="addserver">
        <label>Añadir un servidor remoto
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre, p. ej. «GPU de casa»" onKeyDown={(e) => e.key === 'Enter' && void add()} />
            <button className="primary" disabled={!name.trim()} onClick={() => void add()}>Añadir</button>
          </div>
        </label>
        <label>Dirección de enlace de esta oficina (la que usan los servidores y otras oficinas para llegar hasta aquí)
          <div className="row">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://mi-equipo:8090" />
            <button disabled={url === linkUrl} onClick={() => void api('PATCH', '/settings', { linkUrl: url }).then(() => toast('Dirección guardada')).catch((e) => toast(e.message, false))}>Guardar</button>
          </div>
        </label>
      </div>
    </div>
  );
}
