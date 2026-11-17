import { useState } from 'react';
import { api } from '../net';
import { setState, toast, useStore } from '../store';
import type { Project, ProviderKind, WorkSession } from '../types';
import { ACCESS } from './AgentEditor';
import { Avatar, Modal, timeAgo } from './common';

const GENERAL = '';

const KIND: Record<ProviderKind, string> = {
  mock: 'Simulado', anthropic: 'Claude API', openai: 'API compatible', 'claude-code': 'Claude Code', codex: 'Codex', cli: 'Comando',
};

function SessionRow({ session }: { session: WorkSession }) {
  const agent = useStore((s) => s.agents.find((a) => a.id === session.agentId));
  if (!agent) return null;
  const open = session.status === 'open';
  const act = (method: string, path: string) => api(method, path).catch((e) => toast(e.message, false));
  return (
    <div className={`sessioncard ${open ? 'open' : ''}`}>
      <Avatar appearance={agent.appearance} size={34} />
      <div className="body">
        <strong>{session.title || 'Sesión sin estrenar'}</strong>
        <small>
          {agent.name} · {KIND[session.kind]} · {session.turns} {session.turns === 1 ? 'intercambio' : 'intercambios'} · {timeAgo(session.lastUsedAt)}
        </small>
        {session.last && <p>{session.last}</p>}
      </div>
      <span className={`pill ${open ? 'green' : 'muted'}`}>{open ? 'En curso' : 'Archivada'}</span>
      <div className="sessionactions">
        {open
          ? <button onClick={() => void act('POST', `/sessions/${session.id}/close`)}>Archivar</button>
          : <button className="primary" onClick={() => void act('POST', `/sessions/${session.id}/open`).then(() => toast(`${agent.name} retoma «${session.title || 'la sesión'}»`))}>Continuar</button>}
        {!open && <button className="danger" onClick={() => confirm('¿Olvidar esta sesión? El agente no podrá retomarla.') && void act('DELETE', `/sessions/${session.id}`)}>Olvidar</button>}
      </div>
    </div>
  );
}

function ProjectDetail({ project }: { project: Project | null }) {
  const agents = useStore((s) => s.agents);
  const sessions = useStore((s) => s.sessions);
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const id = project?.id ?? null;
  const mine = sessions.filter((s) => s.projectId === id);
  const team = agents.filter((a) => a.projectId === id);

  const assign = (agentId: string, on: boolean) =>
    api('PATCH', `/agents/${agentId}`, { projectId: on ? id : null }).catch((e) => toast(e.message, false));
  const save = () => project && api('PATCH', `/projects/${project.id}`, { name, description }).then(() => toast('Proyecto guardado'), (e) => toast(e.message, false));
  const remove = async () => {
    if (!project || !confirm(`¿Cerrar el proyecto «${project.name}»? Sus sesiones se archivan y la carpeta se conserva en el servidor.`)) return;
    await api('DELETE', `/projects/${project.id}`).catch((e) => toast(e.message, false));
    setState({ modal: { kind: 'projects' } });
  };

  return (
    <div className="projectdetail">
      {project ? (
        <>
          <div className="row">
            <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Carpeta<input value={`/workspace/${project.folder}`} readOnly /></label>
          </div>
          <label>De qué trata (lo leen los agentes)
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Web de la tienda en Astro. Repositorio: github.com/… Se despliega en Cloudflare Pages." />
          </label>
          <footer>
            <button className="danger" onClick={() => void remove()}>Cerrar proyecto</button>
            <span />
            <button className="primary" disabled={!name.trim()} onClick={() => void save()}>Guardar</button>
          </footer>
        </>
      ) : (
        <p className="hint">La carpeta general es donde trabaja quien no tiene proyecto asignado.</p>
      )}

      <h4>Quién trabaja aquí</h4>
      <div className="chips">
        {agents.map((a) => {
          const on = a.projectId === id;
          return (
            <button key={a.id} className={on ? 'on' : ''} disabled={on && !project} onClick={() => void assign(a.id, !on)}
              title={ACCESS.find((x) => x.id === a.access)?.label}>
              {a.name}
            </button>
          );
        })}
      </div>
      <small className="hint">
        {team.length
          ? team.map((a) => `${a.name}: ${ACCESS.find((x) => x.id === a.access)?.label.toLowerCase()}`).join(' · ')
          : 'Nadie todavía. Pulsa en un nombre para traerlo a este proyecto.'}
      </small>

      <h4>Sesiones</h4>
      <p className="hint">Cada agente recuerda lo hablado y hecho en su sesión. Archívala para que empiece de cero, o continúa una anterior.</p>
      <div className="sessionlist">
        {mine.map((s) => <SessionRow key={s.id} session={s} />)}
        {!mine.length && <p className="empty">Sin sesiones todavía: empiezan solas en cuanto alguien trabaja aquí.</p>}
      </div>
    </div>
  );
}

export function ProjectsModal({ projectId }: { projectId?: string }) {
  const projects = useStore((s) => s.projects);
  const sessions = useStore((s) => s.sessions);
  const [current, setCurrent] = useState<string>(projectId ?? projects[0]?.id ?? GENERAL);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const project = projects.find((p) => p.id === current) ?? null;
  const live = (id: string | null) => sessions.filter((s) => s.projectId === id && s.status === 'open').length;

  const create = async () => {
    try {
      const made = await api<Project>('POST', '/projects', { name, description });
      setCurrent(made.id);
      setCreating(false);
      setName('');
      setDescription('');
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  return (
    <Modal title="Archivo · Proyectos y sesiones" onClose={() => setState({ modal: null })} wide>
      <div className="providers">
        <div className="list">
          <h4>Proyectos</h4>
          {projects.map((p) => (
            <button key={p.id} className={!creating && current === p.id ? 'on' : ''} onClick={() => { setCreating(false); setCurrent(p.id); }}>
              <strong>{p.name}</strong>
              <small>/workspace/{p.folder}{live(p.id) ? ` · ${live(p.id)} en curso` : ''}</small>
            </button>
          ))}
          <button className={!creating && current === GENERAL ? 'on' : ''} onClick={() => { setCreating(false); setCurrent(GENERAL); }}>
            <strong>Carpeta general</strong>
            <small>/workspace{live(null) ? ` · ${live(null)} en curso` : ''}</small>
          </button>
          <button className="add" onClick={() => setCreating(true)}>Nuevo proyecto</button>
        </div>
        <div className="detail">
          {creating ? (
            <div className="providerform">
              <p className="hint">Un proyecto es una carpeta en el servidor donde trabajan los agentes que asignes. Lo que hagan y sus sesiones se conservan.</p>
              <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Web de la tienda" autoFocus /></label>
              <label>De qué trata (opcional)
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Qué es, dónde está el repositorio, cómo se despliega…" />
              </label>
              <footer>
                <span />
                <button onClick={() => setCreating(false)}>Cancelar</button>
                <button className="primary" disabled={!name.trim()} onClick={() => void create()}>Crear proyecto</button>
              </footer>
            </div>
          ) : (
            <ProjectDetail key={current} project={project} />
          )}
        </div>
      </div>
    </Modal>
  );
}
