import { useEffect, useState } from 'react';
import { go, selectAgent } from '../net';
import { setState, useStore, world } from '../store';
import type { Agent } from '../types';
import { Avatar, STATUS_LABEL } from './common';

function useActorStatus() {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 700);
    return () => clearInterval(timer);
  }, []);
  return (id: string) => world.actors.get(id)?.status ?? 'idle';
}

export function TopBar() {
  const connected = useStore((s) => s.connected);
  const jobs = useStore((s) => s.jobs);
  const running = jobs.active + jobs.waiting;
  const openTasks = useStore((s) => s.tasks.filter((t) => !t.parentId && (t.status === 'working' || t.status === 'delegating' || t.status === 'queued')).length);
  return (
    <div className="topbar">
      <div className="brand">
        <span className="logo">🏢</span>
        <div>
          <strong>Agent Office</strong>
          <small className={connected ? 'ok' : 'bad'}>{connected ? 'en línea' : 'reconectando…'}</small>
        </div>
      </div>
      <div className="actions">
        <button onClick={() => { void go({ kind: 'spot', id: 'hr-desk' }); setState({ modal: { kind: 'people' } }); }}>
          👥 Equipo y departamentos
        </button>
        <button onClick={() => { void go({ kind: 'spot', id: 'meet-board' }); setState({ modal: { kind: 'tasks' } }); }}>
          📋 Tareas {openTasks > 0 && <span className="badge">{openTasks}</span>}
        </button>
        <button onClick={() => { void go({ kind: 'spot', id: 'boss-desk' }); setState({ modal: { kind: 'settings' } }); }}>
          ⚙️ LLM y ajustes
        </button>
        <button className={`jobs ${running ? 'busy' : ''}`} onClick={() => setState({ modal: { kind: 'settings', tab: 'jobs' } })}
          title="Ejecuciones en segundo plano">
          <span className="pulse" /> {running ? `${running} en segundo plano` : 'Cola en reposo'}
        </button>
      </div>
    </div>
  );
}

export function Roster() {
  const agents = useStore((s) => s.agents);
  const teams = useStore((s) => s.teams);
  const selected = useStore((s) => s.selectedAgentId);
  const status = useActorStatus();
  const groups: { id: string; name: string; color: string; members: Agent[] }[] = [
    ...teams.map((t) => ({ id: t.id, name: t.name, color: t.color, members: agents.filter((a) => a.teamId === t.id) })),
    { id: 'none', name: 'Sin departamento', color: '#6b7385', members: agents.filter((a) => !teams.some((t) => t.id === a.teamId)) },
  ].filter((g) => g.members.length);
  return (
    <aside className="roster">
      {groups.map((g) => (
        <section key={g.id}>
          <h3><i style={{ background: g.color }} />{g.name}</h3>
          {g.members.map((a) => {
            const st = status(a.id);
            const lead = teams.some((t) => t.leadId === a.id);
            return (
              <button key={a.id} className={`person ${selected === a.id ? 'active' : ''}`} onClick={() => void selectAgent(a.id)}>
                <Avatar appearance={a.appearance} size={34} bg={`${g.color}55`} />
                <span>
                  <strong>{a.name}{lead && <em title="Responsable"> ★</em>}</strong>
                  <small className={`st-${st}`}>{STATUS_LABEL[st]}</small>
                </span>
              </button>
            );
          })}
        </section>
      ))}
      <button className="hire" onClick={() => setState({ modal: { kind: 'agent' } })}>＋ Contratar agente</button>
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
          {t.ok ? '📦' : '⚠️'} {t.text}
        </button>
      ))}
    </div>
  );
}
