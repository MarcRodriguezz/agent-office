import { useEffect, useState } from 'react';
import { go, refreshHub, selectAgent, switchOffice } from '../net';
import { setState, useStore, world } from '../store';
import type { Agent } from '../types';
import { levelOf } from '../game/creature';
import { Avatar, STATUS_LABEL } from './common';

function useActorStatus() {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 700);
    return () => clearInterval(timer);
  }, []);
  return (id: string) => world.actors.get(id)?.status ?? 'idle';
}

function OfficeSwitch() {
  const connected = useStore((s) => s.connected);
  const officeName = useStore((s) => s.settings.officeName);
  const officeId = useStore((s) => s.officeId);
  const hub = useStore((s) => s.hub);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    void refreshHub().catch(() => null);
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return (
    <div className="switch" onClick={(e) => e.stopPropagation()}>
      <button className="brand" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="mark" />
        <span>
          <strong>{officeName}</strong>
          <small className={connected ? 'ok' : 'bad'}>{connected ? 'en línea' : 'reconectando…'}</small>
        </span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu">
          <h4>Cambiar de oficina</h4>
          {hub.map((o) => (
            <button key={o.id} className={o.id === officeId ? 'on' : ''} disabled={!o.online}
              onClick={() => { setOpen(false); void switchOffice(o.id); }}>
              <strong>{o.name}</strong>
              <small>{o.id === officeId ? 'estás aquí' : `${o.people} personas`}</small>
            </button>
          ))}
          <button className="manage" onClick={() => { setOpen(false); setState({ modal: { kind: 'offices', tab: 'mine' } }); }}>
            Gestionar y enlazar oficinas
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const architect = useStore((s) => s.architect);
  const jobs = useStore((s) => s.jobs);
  const running = jobs.active + jobs.waiting;
  const linked = useStore((s) => s.offices.peers.filter((p) => p.online).length);
  const openTasks = useStore((s) => s.tasks.filter((t) => !t.parentId && (t.status === 'working' || t.status === 'delegating' || t.status === 'queued')).length);
  return (
    <div className="topbar">
      <OfficeSwitch />
      <div className="actions">
        <button onClick={() => { void go({ kind: 'spot', id: 'hr-desk' }); setState({ modal: { kind: 'people' } }); }}>
          Equipo
        </button>
        <button onClick={() => { void go({ kind: 'spot', id: 'meet-board' }); setState({ modal: { kind: 'tasks' } }); }}>
          Tareas {openTasks > 0 && <span className="badge">{openTasks}</span>}
        </button>
        <button onClick={() => setState({ modal: { kind: 'album' } })}>Compis</button>
        <button onClick={() => setState({ modal: { kind: 'offices' } })}>
          Oficinas {linked > 0 && <span className="badge">{linked}</span>}
        </button>
        <button onClick={() => { void go({ kind: 'spot', id: 'boss-desk' }); setState({ modal: { kind: 'settings' } }); }}>
          Modelos y ajustes
        </button>
        <button className={architect ? 'on' : ''} onClick={() => setState({ architect: !architect, roomId: null, selectedAgentId: null })}>
          Arquitecto
        </button>
        <button className={`jobs ${running ? 'busy' : ''}`} onClick={() => setState({ modal: { kind: 'settings', tab: 'jobs' } })}
          title="Ejecuciones en segundo plano">
          <span className="pulse" /> {running ? `${running} pensando` : 'En reposo'}
        </button>
      </div>
    </div>
  );
}

export function Roster() {
  const agents = useStore((s) => s.agents);
  const teams = useStore((s) => s.teams);
  const selected = useStore((s) => s.selectedAgentId);
  const managerId = useStore((s) => s.settings.managerId);
  const status = useActorStatus();
  const groups: { id: string; name: string; color: string; members: Agent[] }[] = [
    { id: 'manager', name: 'Dirección', color: '#1c1b19', members: agents.filter((a) => a.id === managerId) },
    ...teams.map((t) => ({ id: t.id, name: t.name, color: t.color, members: agents.filter((a) => a.teamId === t.id) })),
    { id: 'none', name: 'Sin departamento', color: '#6b7385', members: agents.filter((a) => a.id !== managerId && !teams.some((t) => t.id === a.teamId)) },
  ].filter((g) => g.members.length);
  return (
    <aside className="roster">
      {groups.map((g) => (
        <section key={g.id}>
          <h3><i style={{ background: g.color }} />{g.name}</h3>
          {g.members.map((a) => {
            const st = status(a.id);
            const lead = a.id === managerId || teams.some((t) => t.leadId === a.id);
            return (
              <button key={a.id} className={`person ${selected === a.id ? 'active' : ''}`} onClick={() => void selectAgent(a.id)}>
                <Avatar appearance={a.appearance} size={34} bg={`${g.color}55`} />
                <span>
                  <strong>{a.name}{lead && <em title="Responsable"> ★</em>}{a.nodeId && <span className="remote" title="Trabaja en un servidor remoto"> remoto</span>}</strong>
                  <small className={`st-${st}`}>Nv {levelOf(a.xp)} · {STATUS_LABEL[st]}</small>
                </span>
              </button>
            );
          })}
        </section>
      ))}
      <button className="hire" onClick={() => setState({ modal: { kind: 'agent' } })}>Contratar a alguien</button>
    </aside>
  );
}

export function Feed() {
  const feed = useStore((s) => s.feed);
  return (
    <div className="feed">
      {feed.slice(-4).map((e) => <div key={e.id}>{e.text}</div>)}
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button key={t.id} className={t.ok ? 'ok' : 'bad'} onClick={() => t.agentId && void selectAgent(t.agentId, false)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}
