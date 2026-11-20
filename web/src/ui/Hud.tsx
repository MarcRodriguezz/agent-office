import { useEffect, useState } from 'react';
import { celebrate, changeLang, go, refreshHub, selectAgent, switchOffice } from '../net';
import { setState, useStore, world } from '../store';
import type { Agent } from '../types';
import { levelOf } from '../game/creature';
import { clockText, daylight } from '../game/daylight';
import { Avatar, STATUS_LABEL } from './common';
import { LANG, LANG_NAME, LANGS, msg, t } from '../i18n';

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
          <small className={connected ? 'ok' : 'bad'}>{connected ? t('en línea') : t('reconectando…')}</small>
        </span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu">
          <h4>{t('Cambiar de oficina')}</h4>
          {hub.map((o) => (
            <button key={o.id} className={o.id === officeId ? 'on' : ''} disabled={!o.online}
              onClick={() => { setOpen(false); void switchOffice(o.id); }}>
              <strong>{o.name}</strong>
              <small>{o.id === officeId ? t('estás aquí') : `${o.people} personas`}</small>
            </button>
          ))}
          <button className="manage" onClick={() => { setOpen(false); setState({ modal: { kind: 'offices', tab: 'mine' } }); }}>
            {t('Gestionar y enlazar oficinas')}</button>
        </div>
      )}
    </div>
  );
}

function Clock() {
  const [light, setLight] = useState(daylight);
  useEffect(() => {
    const timer = setInterval(() => setLight(daylight()), 15000);
    return () => clearInterval(timer);
  }, []);
  return <span className={`clock ${light.dark > 0.3 ? 'night' : ''}`} title={t('Hora de tu equipo: la oficina se ilumina según el momento del día')}>{clockText(light)} · {light.label}</span>;
}

export function TopBar() {
  const architect = useStore((s) => s.architect);
  const jobs = useStore((s) => s.jobs);
  const running = jobs.active + jobs.waiting;
  const liveSessions = useStore((s) => new Set(s.sessions.filter((x) => x.status === 'open' && x.turns > 0).map((x) => x.projectId)).size);
  const linked = useStore((s) => s.offices.peers.filter((p) => p.online).length);
  const meeting = useStore((s) => s.meetings.some((m) => ['gathering', 'talking', 'writing'].includes(m.status)));
  const partying = useStore((s) => s.party > 0);
  const openTasks = useStore((s) => s.tasks.filter((t) => !t.parentId && (t.status === 'working' || t.status === 'delegating' || t.status === 'queued')).length);
  return (
    <div className="topbar">
      <OfficeSwitch />
      <div className="actions">
        <button onClick={() => { void go({ kind: 'spot', id: 'hr-desk' }); setState({ modal: { kind: 'people' } }); }}>
          {t('Equipo')}</button>
        <button onClick={() => { void go({ kind: 'spot', id: 'meet-board' }); setState({ modal: { kind: 'tasks' } }); }}>
          {t('Tareas')}{openTasks > 0 && <span className="badge">{openTasks}</span>}
        </button>
        <button onClick={() => { void go({ kind: 'spot', id: 'archive' }); setState({ modal: { kind: 'projects' } }); }}>
          {t('Proyectos')}{liveSessions > 0 && <span className="badge">{liveSessions}</span>}
        </button>
        <button onClick={() => { void go({ kind: 'spot', id: 'meet-table' }); setState({ modal: { kind: 'meetings' } }); }}>
          {t('Reuniones')}{meeting && <span className="badge">1</span>}
        </button>
        <button className={partying ? 'on' : ''} disabled={partying} onClick={() => void celebrate()}
          title={t('Todo el mundo a la zona lúdica a bailar')}>
          {partying ? t('De fiesta') : t('Celebrar')}
        </button>
        <button onClick={() => setState({ modal: { kind: 'album' } })}>{t('Compis')}</button>
        <button onClick={() => setState({ modal: { kind: 'offices' } })}>
          {t('Oficinas')}{linked > 0 && <span className="badge">{linked}</span>}
        </button>
        <button onClick={() => { void go({ kind: 'spot', id: 'boss-desk' }); setState({ modal: { kind: 'settings' } }); }}>
          {t('Modelos y ajustes')}</button>
        <button className={architect ? 'on' : ''} onClick={() => setState({ architect: !architect, roomId: null, selectedAgentId: null })}>
          {t('Arquitecto')}</button>
        <LangSwitch />
        <Clock />
        <button className={`jobs ${running ? 'busy' : ''}`} onClick={() => setState({ modal: { kind: 'settings', tab: 'jobs' } })}
          title={t('Ejecuciones en segundo plano')}>
          <span className="pulse" /> {running ? t('{running} pensando', { running }) : t('En reposo')}
        </button>
      </div>
    </div>
  );
}

function LangSwitch() {
  return (
    <div className="langswitch" role="group" aria-label={t('Idioma')}>
      {LANGS.map((lang) => (
        <button key={lang} className={lang === LANG ? 'on' : ''} aria-pressed={lang === LANG} title={LANG_NAME[lang]}
          onClick={() => lang !== LANG && void changeLang(lang)}>
          {lang.toUpperCase()}
        </button>
      ))}
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
    { id: 'manager', name: t('Dirección'), color: '#1c1b19', members: agents.filter((a) => a.id === managerId) },
    ...teams.map((t) => ({ id: t.id, name: t.name, color: t.color, members: agents.filter((a) => a.teamId === t.id) })),
    { id: 'none', name: t('Sin departamento'), color: '#6b7385', members: agents.filter((a) => a.id !== managerId && !teams.some((t) => t.id === a.teamId)) },
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
                  <strong>{a.name}{lead && <em title={t('Responsable')}> ★</em>}{a.nodeId && <span className="remote" title={t('Trabaja en un servidor remoto')}> remoto</span>}</strong>
                  <small className={`st-${st}`}>{t('Nv {v0} · {v1}', { v0: levelOf(a.xp), v1: STATUS_LABEL[st] })}</small>
                </span>
              </button>
            );
          })}
        </section>
      ))}
      <button className="hire" onClick={() => setState({ modal: { kind: 'agent' } })}>{t('Contratar a alguien')}</button>
    </aside>
  );
}

export function Feed() {
  const feed = useStore((s) => s.feed);
  return (
    <div className="feed">
      {feed.slice(-4).map((e) => <div key={e.id}>{msg(e.msg ?? e.text)}</div>)}
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
