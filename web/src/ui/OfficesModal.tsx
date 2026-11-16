import { useEffect, useState } from 'react';
import { levelOf } from '../game/creature';
import { api, apiOf, copy, hubApi, refreshHub, switchOffice } from '../net';
import { DEMO } from '../transport';
import { setState, toast, useStore } from '../store';
import type { HubOffice, PeerState, RemoteTask } from '../types';
import { Avatar, Markdown, Modal, timeAgo } from './common';

const STATUS: Record<RemoteTask['status'], { label: string; cls: string }> = {
  sent: { label: 'Enviado', cls: 'muted' },
  working: { label: 'En curso', cls: 'blue' },
  done: { label: 'Entregado', cls: 'green' },
  failed: { label: 'Fallido', cls: 'red' },
};

function useHub() {
  const hub = useStore((s) => s.hub);
  useEffect(() => {
    void refreshHub().catch(() => null);
    const timer = setInterval(() => void refreshHub().catch(() => null), 2500);
    return () => clearInterval(timer);
  }, []);
  return hub;
}

const run = async (work: () => Promise<unknown>, done?: string) => {
  try {
    await work();
    await refreshHub();
    if (done) toast(done);
    return true;
  } catch (e) {
    toast((e as Error).message, false);
    return false;
  }
};

function OfficeCard({ office, all }: { office: HubOffice; all: HubOffice[] }) {
  const current = useStore((s) => s.officeId);
  const [name, setName] = useState(office.name);
  useEffect(() => setName(office.name), [office.name]);
  const here = office.id === current;
  const others = all.filter((o) => o.id !== office.id);
  const outside = office.links.filter((l) => !l.office);

  const rename = () => {
    if (!name.trim() || name.trim() === office.name) return;
    void run(() => apiOf(office.id, 'PATCH', '/settings', { officeName: name.trim() }));
  };
  const remove = () => {
    if (!confirm(`¿Eliminar «${office.name}»? Se borran su gente, sus tareas y sus conversaciones. No se puede deshacer.`)) return;
    void run(() => hubApi('DELETE', `/offices/${office.id}`), 'Oficina eliminada');
  };

  return (
    <section className={`officecard ${here ? 'here' : ''}`}>
      <header>
        <input className="teamname" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Nombre de la oficina" />
        {here
          ? <span className="pill green">Estás aquí</span>
          : <button className="primary" disabled={!office.online} onClick={() => void switchOffice(office.id)}>Entrar</button>}
      </header>
      <p className="facts">
        {office.online
          ? `${office.people} personas · ${office.teams} departamentos · ${office.working ? `${office.working} encargos en curso` : 'sin encargos en curso'}`
          : 'Arrancando…'}
      </p>
      {others.length > 0 && (
        <div className="linkrows">
          {others.map((other) => {
            const link = office.links.find((l) => l.office === other.id);
            return (
              <div key={other.id} className="linkrow">
                <i className={link ? (link.online ? 'on' : 'wait') : ''} />
                <span>{other.name}</span>
                <small>{link ? (link.online ? 'enlazadas' : 'reconectando') : 'sin enlace'}</small>
                {link
                  ? <button onClick={() => void run(() => hubApi('DELETE', `/links?a=${office.id}&b=${other.id}`))}>Desenlazar</button>
                  : <button onClick={() => void run(() => hubApi('POST', '/links', { a: office.id, b: other.id }), `${office.name} y ${other.name} ya trabajan juntas`)}>Enlazar</button>}
              </div>
            );
          })}
        </div>
      )}
      {outside.length > 0 && <p className="facts">De fuera: {outside.map((l) => `${l.name}${l.online ? '' : ' (sin conexión)'}`).join(', ')}</p>}
      {all.length > 1 && !here && <button className="danger ghost small" onClick={remove}>Eliminar esta oficina</button>}
    </section>
  );
}

function Mine() {
  const hub = useHub();
  const templates = useStore((s) => s.templates);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('dev');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    if (await run(() => hubApi('POST', '/offices', { name, template }), `«${name}» está lista`)) setName('');
    setBusy(false);
  };
  return (
    <div className="minepanel">
      <p className="hint">
        Todas tus oficinas viven en esta misma dirección. Entra en cualquiera desde aquí o desde el nombre de la oficina, arriba a la izquierda.
        Dos oficinas enlazadas se ven la plantilla y se encargan trabajo.
      </p>
      <div className="officegrid">
        {hub.map((o) => <OfficeCard key={o.id} office={o} all={hub} />)}
        <section className="officecard new">
          <h4>Abrir otra oficina</h4>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre: Oficina Norte, Estudio…" maxLength={60}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && void create()} />
          <label>Equipo con el que empieza
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <p className="facts">{templates.find((t) => t.id === template)?.summary}</p>
          <button className="primary" disabled={!name.trim() || busy || DEMO} onClick={() => void create()}>{busy ? 'Abriendo…' : 'Abrir oficina'}</button>
          {DEMO && <p className="facts">En la demo del navegador solo hay una oficina. Con la instalación en Docker abres las que quieras.</p>}
        </section>
      </div>
    </div>
  );
}

function Outside() {
  const office = useStore((s) => s.offices.office);
  const peers = useStore((s) => s.offices.peers);
  const [url, setUrl] = useState(office.linkBase);
  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
  const pending = peers.filter((p) => p.pending);
  const create = async () => {
    const r = await api('POST', '/offices/invite', { url }).catch((e) => toast(e.message, false));
    if (r) setInvite(r.code);
  };
  const join = async () => {
    const ok = await api('POST', '/offices/join', { code }).catch((e) => toast(e.message, false));
    if (ok) {
      setCode('');
      toast('Conectando con la otra oficina…');
    }
  };
  const paste = () => navigator.clipboard.readText().then(setCode, () => toast('Pega el código con Ctrl+V.', false));
  return (
    <div className="connect">
      <p className="hint">
        Para enlazar «{office.name}» con una oficina que vive en otro equipo. Una de las dos crea una invitación y la otra la pega.
        Las oficinas de esta misma instalación se enlazan con un botón en «Mis oficinas».
      </p>
      <section>
        <h4>Invitar a una oficina de fuera</h4>
        <label>Dirección por la que llegan hasta este equipo
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://mi-equipo:8090" />
        </label>
        <button className="primary" onClick={() => void create()}>Crear invitación</button>
        {invite && (
          <div className="copybox">
            <code>{invite}</code>
            <button className="primary" onClick={() => void copy(invite, 'Invitación copiada')}>Copiar invitación</button>
          </div>
        )}
        {pending.map((p) => (
          <div key={p.id} className="linkrow">
            <i className="wait" /><span>Invitación sin usar</span><small>esperando a la otra oficina</small>
            <button onClick={() => void api('DELETE', `/offices/${p.id}`)}>Anular</button>
          </div>
        ))}
      </section>
      <section>
        <h4>Tengo una invitación</h4>
        <div className="row">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pega aquí la invitación" />
          <button onClick={() => void paste()}>Pegar</button>
          <button className="primary" disabled={!code.trim()} onClick={() => void join()}>Conectar</button>
        </div>
      </section>
    </div>
  );
}

function Office({ peer }: { peer: PeerState }) {
  const tasks = useStore((s) => s.offices.remoteTasks);
  const [target, setTarget] = useState<{ kind: 'agent' | 'team'; id: string; name: string } | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const dir = peer.directory;
  const mine = tasks.filter((t) => t.peerId === peer.id);

  const send = async () => {
    if (!target || !title.trim()) return;
    const ok = await api('POST', `/offices/${peer.id}/tasks`, { targetKind: target.kind, targetId: target.id, title, description })
      .catch((e) => toast(e.message, false));
    if (ok) {
      setTitle('');
      setDescription('');
      setTarget(null);
    }
  };

  const groups = dir ? [
    ...dir.teams.map((t) => ({ ...t, members: dir.agents.filter((a) => a.teamId === t.id) })),
    { id: '', name: 'Sin departamento', color: '#8a8478', leadId: null, members: dir.agents.filter((a) => !dir.teams.some((t) => t.id === a.teamId)) },
  ].filter((g) => g.members.length) : [];

  return (
    <div className="officeview">
      <header>
        <div>
          <strong>{peer.name}</strong>
          <small>{peer.online ? `En línea${dir ? ` · la dirige ${dir.boss}` : ''}` : 'Sin conexión: se reintenta sola'}</small>
        </div>
        {!peer.local && <button className="danger" onClick={() => confirm(`¿Cerrar la conexión con ${peer.name}?`) && void api('DELETE', `/offices/${peer.id}`)}>Desconectar</button>}
      </header>
      {groups.map((g) => (
        <section key={g.id} className="teamcard" style={{ borderLeftColor: g.color }}>
          <div className="teamhead">
            <strong>{g.name}</strong>
            <span />
            {g.id && <button className={target?.id === g.id ? 'primary' : ''} onClick={() => setTarget({ kind: 'team', id: g.id, name: `departamento ${g.name}` })}>Encargar al departamento</button>}
          </div>
          <div className="members">
            {g.members.map((a) => (
              <button key={a.id} className={`member ${target?.id === a.id ? 'picked' : ''}`} onClick={() => setTarget({ kind: 'agent', id: a.id, name: a.name })}>
                <Avatar appearance={a.appearance} size={46} bg={`${g.color}55`} />
                <strong>{a.name}{g.leadId === a.id ? ' ★' : ''}</strong>
                <small>{a.role} · Nv {levelOf(a.xp)}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
      {target && (
        <div className="newtask boxed">
          <strong>Encargo para {target.name}</strong>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del encargo" autoFocus />
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué necesitas y en qué formato lo quieres" />
          <div className="row end">
            <button onClick={() => setTarget(null)}>Cancelar</button>
            <button className="primary" disabled={!title.trim() || !peer.online} onClick={() => void send()}>Enviar encargo</button>
          </div>
        </div>
      )}
      {peer.online && !target && dir && <p className="hint">Elige a una persona o a un departamento. Cuando terminen, alguien de esa oficina vendrá a entregártelo.</p>}
      {mine.length > 0 && <h4>Encargos enviados</h4>}
      {mine.map((t) => (
        <div key={t.id} className={`task ${openId === t.id ? 'open' : ''}`}>
          <button className="taskrow" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
            <span className={`pill ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
            <strong>{t.title}</strong>
            <small>{t.targetName} · {timeAgo(t.createdAt)}</small>
          </button>
          {openId === t.id && (
            <div className="taskbody">
              {t.description && <p className="desc">{t.description}</p>}
              {t.result ? <Markdown text={t.result} /> : <p className="empty">Todavía sin resultado: están en ello.</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Work({ goMine }: { goMine: () => void }) {
  const peers = useStore((s) => s.offices.peers);
  const linked = peers.filter((p) => !p.pending);
  const [current, setCurrent] = useState<string | null>(linked[0]?.id ?? null);
  const peer = linked.find((p) => p.id === current) ?? linked[0];
  if (!linked.length) {
    return (
      <div className="emptystate">
        <strong>Esta oficina todavía no está enlazada con ninguna.</strong>
        <p>Enlázala con otra de las tuyas y podrás encargar trabajo a su gente desde aquí.</p>
        <button className="primary" onClick={goMine}>Ir a mis oficinas</button>
      </div>
    );
  }
  return (
    <div className="providers">
      <div className="list">
        <h4>Enlazadas con esta</h4>
        {linked.map((p) => (
          <button key={p.id} className={peer?.id === p.id ? 'on' : ''} onClick={() => setCurrent(p.id)}>
            <strong>{p.name}</strong>
            <small>{p.online ? `${p.directory?.agents.length ?? 0} personas` : 'sin conexión'}{p.local ? '' : ' · de fuera'}</small>
          </button>
        ))}
      </div>
      <div className="detail">{peer && <Office key={peer.id} peer={peer} />}</div>
    </div>
  );
}

export function OfficesModal({ tab: initial }: { tab?: 'mine' | 'work' | 'outside' }) {
  const name = useStore((s) => s.settings.officeName);
  const [tab, setTab] = useState(initial ?? 'mine');
  return (
    <Modal title="Oficinas" onClose={() => setState({ modal: null })} wide>
      <nav className="tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Mis oficinas</button>
        <button className={tab === 'work' ? 'on' : ''} onClick={() => setTab('work')}>Encargar a otra oficina</button>
        <button className={tab === 'outside' ? 'on' : ''} onClick={() => setTab('outside')}>Oficinas de fuera</button>
        <span />
        <small>Estás en {name}</small>
      </nav>
      {tab === 'mine' && <Mine />}
      {tab === 'work' && <Work goMine={() => setTab('mine')} />}
      {tab === 'outside' && <Outside />}
    </Modal>
  );
}
