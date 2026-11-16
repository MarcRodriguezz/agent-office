import { useEffect, useRef, useState } from 'react';
import { api, copy, openTerm } from '../net';
import { toast, useStore } from '../store';
import type { CliAuth, LoginAction, NodeState } from '../types';

export type Cli = 'claude' | 'codex';

export const CLI_LABEL: Record<Cli, string> = { claude: 'Claude Code', codex: 'Codex' };

const clean = (raw: string) => raw
  .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b./g, '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n{3,}/g, '\n\n');

export function LoginFlow({ node, action, onClose, onDone }: { node: NodeState; action: LoginAction; onClose: () => void; onDone?: () => void }) {
  const [output, setOutput] = useState('');
  const [state, setState] = useState<'starting' | 'running' | 'done' | 'error'>('starting');
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const term = useRef<{ input: (data: string) => void; kill: () => void } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const isClaude = action.startsWith('claude');
  const login = action.endsWith('login');

  useEffect(() => {
    let alive = true;
    const finish = (code: number) => {
      if (!alive) return;
      setState(code === 0 ? 'done' : 'error');
      if (code === 0) done.current?.();
    };
    void openTerm(node.id, action, (data) => alive && setOutput((o) => o + data), finish).then((t) => {
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

  const text = clean(output);
  const url = text.match(/https?:\/\/[^\s"'<>]+/)?.[0].replace(/[).,]+$/, '');
  const code = isClaude ? undefined : text.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/)?.[0];
  const send = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    term.current?.input(`${clean}\r`);
    setValue('');
    setSent(true);
  };
  const paste = () => navigator.clipboard.readText().then((t) => setValue(t.trim()), () => toast('Pega el código con Ctrl+V.', false));
  const title = `${login ? 'Iniciar sesión en' : 'Cerrar la sesión de'} ${isClaude ? 'Claude Code' : 'Codex'}${node.local ? '' : ` · ${node.name}`}`;

  return (
    <div className="login">
      <header>
        <strong>{title}</strong>
        <button className="icon" onClick={onClose} aria-label="Cerrar">✕</button>
      </header>
      {login && (state === 'starting' || state === 'running') && (
        <ol className="steps">
          <li className={url ? 'ready' : 'wait'}>
            <div>
              <b>Abre la página de inicio de sesión</b>
              <small>{url ? 'Se abre en una pestaña nueva. Entra con tu cuenta y autoriza el acceso.' : 'Preparando el enlace…'}</small>
            </div>
            <div className="row">
              <a className={`button primary ${url ? '' : 'off'}`} href={url} target="_blank" rel="noreferrer">Abrir página</a>
              <button disabled={!url} onClick={() => url && void copy(url, 'Enlace copiado')}>Copiar enlace</button>
            </div>
          </li>
          {isClaude ? (
            <li className={url ? 'ready' : 'wait'}>
              <div>
                <b>Pega aquí el código que te da la página</b>
                <small>{sent ? 'Código enviado. Comprobando…' : 'Aparece al terminar de autorizar.'}</small>
              </div>
              <div className="row">
                <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Código de la página" disabled={!url}
                  onKeyDown={(e) => e.key === 'Enter' && send(value)} />
                <button disabled={!url} onClick={() => void paste()}>Pegar</button>
                <button className="primary" disabled={!value.trim()} onClick={() => send(value)}>Enviar</button>
              </div>
            </li>
          ) : (
            <li className={code ? 'ready' : 'wait'}>
              <div>
                <b>Escribe este código en la página</b>
                <small>{code ? 'Esta ventana se entera sola cuando termines.' : 'Preparando el código…'}</small>
              </div>
              <div className="row">
                <code className="bigcode">{code ?? '····-·····'}</code>
                <button className="primary" disabled={!code} onClick={() => code && void copy(code, 'Código copiado')}>Copiar código</button>
              </div>
            </li>
          )}
        </ol>
      )}
      {!login && state !== 'done' && state !== 'error' && <p className="hint">Cerrando la sesión…</p>}
      {state === 'done' && <p className="result ok">{login ? 'Sesión iniciada. Ya puedes usarla en la oficina.' : 'Sesión cerrada.'}</p>}
      {state === 'error' && <p className="result bad">No ha salido bien. Abre el detalle para ver qué ha dicho el programa y vuelve a intentarlo.</p>}
      <details open={state === 'error'}>
        <summary>Ver lo que dice el programa</summary>
        <pre>{text || 'Conectando…'}</pre>
      </details>
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
          <em>{n.name}</em>
          <CliRow node={n} cli={cli} onAction={(action) => setOpen({ node: n, action })} />
        </div>
      ))}
      {open && <LoginFlow key={`${open.node.id}-${open.action}`} node={open.node} action={open.action} onClose={() => setOpen(null)} />}
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
      <p className="hint">En la otra máquina, con este repositorio clonado y Docker instalado, ejecuta este comando. El servidor aparecerá conectado aquí en unos segundos.</p>
      <div className="copybox">
        <code>{command}</code>
        <button className="primary" onClick={() => void copy(command, 'Comando copiado')}>Copiar comando</button>
      </div>
    </div>
  );
}

export function Servers() {
  const nodes = useStore((s) => s.nodes);
  const agents = useStore((s) => s.agents);
  const linkBase = useStore((s) => s.offices.office.linkBase);
  const [name, setName] = useState('');
  const [url, setUrl] = useState(linkBase);
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
        Los agentes piensan en este equipo o en otros servidores tuyos: una máquina con GPU, un VPS con tu sesión de Claude Code.
        Cada servidor se conecta a la oficina por sí mismo, sin abrir puertos. Al editar un agente eliges dónde se ejecuta.
      </p>
      {nodes.map((n) => {
        const here = agents.filter((a) => (a.nodeId ?? 'local') === n.id);
        return (
          <section key={n.id} className="servercard">
            <header>
              <i className={n.online ? 'on' : ''} />
              <strong>{n.name}</strong>
              <small>{n.online ? `${n.info?.host ?? ''} · hasta ${n.info?.concurrency ?? '?'} trabajos a la vez${n.active ? ` · ${n.active} en curso` : ''}` : 'desconectado'}</small>
              <span />
              <button onClick={() => void api('POST', `/nodes/${n.id}/refresh`)}>Comprobar de nuevo</button>
              {!n.local && <button className="danger" onClick={() => void remove(n)}>Quitar</button>}
            </header>
            <CliRow node={n} cli="claude" onAction={(action) => setOpen({ node: n, action })} />
            <CliRow node={n} cli="codex" onAction={(action) => setOpen({ node: n, action })} />
            <small className="who">{here.length ? `Trabajan aquí: ${here.map((a) => a.name).join(', ')}` : 'Ningún agente asignado.'}</small>
            {!n.local && !n.online && <Setup id={n.id} />}
            {open?.node.id === n.id && <LoginFlow key={open.action} node={n} action={open.action} onClose={() => setOpen(null)} />}
          </section>
        );
      })}
      <div className="addserver">
        <label>Añadir un servidor remoto
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre: GPU de casa, VPS…" onKeyDown={(e) => e.key === 'Enter' && void add()} />
            <button className="primary" disabled={!name.trim()} onClick={() => void add()}>Añadir</button>
          </div>
        </label>
        <label>Dirección por la que los servidores llegan hasta este equipo
          <div className="row">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://mi-equipo:8090" />
            <button disabled={url === linkBase} onClick={() => void api('PATCH', '/settings', { linkUrl: url }).then(() => toast('Dirección guardada')).catch((e) => toast(e.message, false))}>Guardar</button>
          </div>
        </label>
      </div>
    </div>
  );
}
