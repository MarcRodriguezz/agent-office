import { useState } from 'react';
import { levelOf } from '../game/creature';
import { api } from '../net';
import { setState, toast, useStore } from '../store';
import type { PeerState, RemoteTask } from '../types';
import { Avatar, Markdown, Modal, timeAgo } from './common';

const STATUS: Record<RemoteTask['status'], { label: string; cls: string }> = {
  sent: { label: 'Enviado', cls: 'muted' },
  working: { label: 'En curso', cls: 'blue' },
  done: { label: 'Entregado', cls: 'green' },
  failed: { label: 'Fallido', cls: 'red' },
};

function Connect() {
  const linkUrl = useStore((s) => s.offices.office.linkUrl);
  const [url, setUrl] = useState(linkUrl);
  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
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
  return (
    <div className="connect">
      <p className="hint">
        Cada oficina es una instalación independiente de Agent Office (en este equipo o en otro). Al conectarlas ves a su gente,
        puedes encargarles trabajo y recibir sus entregas en persona. Una oficina invita y la otra se une con el código.
      </p>
      <section>
        <h4>Invitar a otra oficina</h4>
        <label>Dirección de enlace de esta oficina
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://mi-equipo:8090" />
        </label>
        <p className="hint">Es la dirección por la que la otra oficina llega a esta (puerto de enlace, 8090 por defecto). Para dos oficinas en el mismo equipo con Docker vale <code>http://host.docker.internal:8090</code>.</p>
        <button className="primary" onClick={() => void create()}>Generar código de invitación</button>
        {invite && (
          <>
            <textarea readOnly rows={3} value={invite} onFocus={(e) => e.target.select()} />
            <button onClick={() => void navigator.clipboard.writeText(invite).then(() => toast('Código copiado'))}>Copiar código</button>
          </>
        )}
      </section>
      <section>
        <h4>Unirme con un código</h4>
        <textarea rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pega aquí el código que te ha pasado la otra oficina" />
        <button className="primary" disabled={!code.trim()} onClick={() => void join()}>Conectar</button>
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
  const leave = async () => {
    if (!confirm(`¿Cerrar la conexión con ${peer.name || 'esta oficina'}?`)) return;
    await api('DELETE', `/offices/${peer.id}`).catch((e) => toast(e.message, false));
  };

  const groups = dir ? [
    ...dir.teams.map((t) => ({ ...t, members: dir.agents.filter((a) => a.teamId === t.id) })),
    { id: '', name: 'Sin departamento', color: '#6b7385', leadId: null, members: dir.agents.filter((a) => !dir.teams.some((t) => t.id === a.teamId)) },
  ].filter((g) => g.members.length) : [];

  return (
    <div className="officeview">
      <header>
        <div>
          <strong>{peer.name || 'Invitación pendiente'}</strong>
          <small>{peer.pending ? 'Esperando a que la otra oficina use el código' : peer.online ? `En línea${dir ? ` · dirige ${dir.boss}` : ''}` : 'Sin conexión: se reintenta sola'}</small>
        </div>
        <button className="danger" onClick={() => void leave()}>{peer.pending ? 'Anular invitación' : 'Desconectar'}</button>
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
        <div className="newtask">
          <strong>Encargo para {target.name}</strong>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del encargo" autoFocus />
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalles: qué necesitas, formato de la entrega…" />
          <div className="row">
            <button onClick={() => setTarget(null)}>Cancelar</button>
            <button className="primary" disabled={!title.trim() || !peer.online} onClick={() => void send()}>Enviar encargo</button>
          </div>
        </div>
      )}
      {peer.online && !target && dir && <p className="hint">Elige a una persona o a un departamento para enviarle un encargo. Cuando terminen, alguien de esa oficina vendrá a entregártelo.</p>}
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

export function OfficesModal() {
  const offices = useStore((s) => s.offices);
  const [current, setCurrent] = useState<string | null>(offices.peers[0]?.id ?? null);
  const peer = offices.peers.find((p) => p.id === current);
  return (
    <Modal title={`Centralita · ${offices.office.name}`} onClose={() => setState({ modal: null })} wide>
      <div className="providers">
        <div className="list">
          <h4>Oficinas conectadas</h4>
          {offices.peers.map((p) => (
            <button key={p.id} className={current === p.id ? 'on' : ''} onClick={() => setCurrent(p.id)}>
              <strong>{p.name || 'Invitación pendiente'}</strong>
              <small>{p.pending ? 'sin usar todavía' : p.online ? `${p.directory?.agents.length ?? 0} personas` : 'sin conexión'}</small>
              {p.online && <em>en línea</em>}
            </button>
          ))}
          {!offices.peers.length && <small className="empty">Todavía no hay ninguna.</small>}
          <button className="add" onClick={() => setCurrent(null)}>＋ Conectar con otra oficina</button>
        </div>
        <div className="detail">{peer ? <Office key={peer.id} peer={peer} /> : <Connect />}</div>
      </div>
    </Modal>
  );
}
