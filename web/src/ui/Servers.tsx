import { useEffect, useRef, useState } from 'react';
import { api, copy, openTerm } from '../net';
import { toast, useStore } from '../store';
import type { NodeState, ToolAction, ToolDef, ToolStatus } from '../types';

export const statusOf = (node: NodeState | undefined, id: string): ToolStatus | undefined => node?.info?.tools.find((t) => t.id === id);
export const useTool = (id: string) => useStore((s) => s.tools.find((t) => t.id === id));

const clean = (raw: string) => raw
  .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b./g, '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n{3,}/g, '\n\n');

export function LoginFlow({ node, tool, action, onClose, onDone }: { node: NodeState; tool: ToolDef; action: ToolAction; onClose: () => void; onDone?: () => void }) {
  const [output, setOutput] = useState('');
  const [state, setState] = useState<'starting' | 'running' | 'done' | 'error'>('starting');
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const term = useRef<{ input: (data: string) => void; kill: () => void } | null>(null);
  const pressed = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  const login = action === 'login';
  const flow = login ? tool.login?.flow : undefined;

  useEffect(() => {
    let alive = true;
    const finish = (code: number) => {
      if (!alive) return;
      setState(code === 0 ? 'done' : 'error');
      if (code === 0) done.current?.();
    };
    void openTerm(node.id, tool.id, action, (data) => alive && setOutput((o) => o + data), finish).then((t) => {
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
  }, [node.id, tool.id, action]);

  const text = clean(output);
  const url = [...text.matchAll(/https?:\/\/[^\s"'<>]+/g)].at(-1)?.[0].replace(/[).,]+$/, '');
  const code = flow === 'device' ? text.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/)?.[0] : undefined;

  useEffect(() => {
    if (flow !== 'device' || pressed.current || !/press enter/i.test(text)) return;
    pressed.current = true;
    term.current?.input('\r');
  }, [flow, text]);

  const send = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    term.current?.input(`${trimmed}\r`);
    setValue('');
    setSent(true);
  };
  const paste = () => navigator.clipboard.readText().then((t) => setValue(t.trim()), () => toast('Pega el código con Ctrl+V.', false));
  const verb = action === 'install' ? 'Instalar' : login ? 'Iniciar sesión en' : 'Cerrar la sesión de';
  const title = `${verb} ${tool.name}${node.local ? '' : ` · ${node.name}`}`;

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
          {flow === 'code' ? (
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
      {!login && state !== 'done' && state !== 'error' && <p className="hint">{action === 'install' ? 'Instalando… puede tardar un minuto.' : 'Cerrando la sesión…'}</p>}
      {state === 'done' && (
        <p className="result ok">
          {action === 'install' ? 'Instalada. Se queda guardada en este servidor.' : login ? 'Sesión iniciada. Se conserva aunque reinicies la oficina.' : 'Sesión cerrada.'}
        </p>
      )}
      {state === 'error' && <p className="result bad">No ha salido bien. Abre el detalle para ver qué ha dicho el programa y vuelve a intentarlo.</p>}
      <details open={state === 'error'}>
        <summary>Ver lo que dice el programa</summary>
        <pre>{text || 'Conectando…'}</pre>
      </details>
    </div>
  );
}

export function ToolRow({ node, tool, onAction }: { node: NodeState; tool: ToolDef; onAction: (action: ToolAction) => void }) {
  const status = statusOf(node, tool.id);
  if (!node.online || !status) return <div className="clirow"><b>{tool.name}</b><small>Sin datos: el servidor no está conectado.</small></div>;
  if (!status.installed) {
    return (
      <div className="clirow">
        <b>{tool.name}</b>
        <span className="pill muted">No instalada</span>
        <small>{tool.npm ? 'Se instala en este servidor y se conserva.' : 'No viene en la imagen de este servidor.'}</small>
        {tool.npm && <button className="primary" onClick={() => onAction('install')}>Instalar</button>}
      </div>
    );
  }
  return (
    <div className="clirow">
      <b>{tool.name} <small>{status.version}</small></b>
      {tool.login
        ? <span className={`pill ${status.loggedIn ? 'green' : 'muted'}`}>{status.loggedIn ? 'Sesión iniciada' : 'Sin sesión'}</span>
        : <span className="pill blue">Instalada</span>}
      <small>{status.detail || (tool.login ? '' : 'Usa el token de cada conexión.')}</small>
      {tool.login && (status.loggedIn
        ? <button onClick={() => onAction('logout')}>Cerrar sesión</button>
        : <button className="primary" onClick={() => onAction('login')}>Iniciar sesión</button>)}
    </div>
  );
}

export function Session({ toolId }: { toolId: string }) {
  const nodes = useStore((s) => s.nodes);
  const tool = useTool(toolId);
  const [open, setOpen] = useState<{ node: NodeState; action: ToolAction } | null>(null);
  if (!tool) return null;
  return (
    <div className="sessions">
      <h4>Sesión de {tool.name}</h4>
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
  const tools = useStore((s) => s.tools);
  const linkBase = useStore((s) => s.offices.office.linkBase);
  const [name, setName] = useState('');
  const [url, setUrl] = useState(linkBase);
  const [open, setOpen] = useState<{ node: NodeState; tool: ToolDef; action: ToolAction } | null>(null);

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
        Los agentes piensan y trabajan en este equipo o en otros servidores tuyos: una máquina con GPU, un VPS con tu sesión de Claude Code.
        Cada servidor guarda sus propias sesiones, herramientas y carpetas de proyecto. Al editar un agente eliges dónde se ejecuta.
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
            {tools.map((t) => <ToolRow key={t.id} node={n} tool={t} onAction={(action) => setOpen({ node: n, tool: t, action })} />)}
            <small className="who">{here.length ? `Trabajan aquí: ${here.map((a) => a.name).join(', ')}` : 'Ningún agente asignado.'}</small>
            {!n.local && !n.online && <Setup id={n.id} />}
            {open?.node.id === n.id && (
              <LoginFlow key={`${open.tool.id}-${open.action}`} node={n} tool={open.tool} action={open.action}
                onClose={() => setOpen(null)} onDone={() => void api('POST', `/nodes/${n.id}/refresh`)} />
            )}
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
