import { useState } from 'react';
import { api, selectAgent } from '../net';
import { setState, toast, useStore } from '../store';
import type { Team } from '../types';
import { Avatar, Modal } from './common';

const COLORS = ['#4f8cff', '#ff7a59', '#2fa37a', '#7c5cff', '#e0668a', '#f2c14e', '#38b6c9', '#e25555'];

function TeamCard({ team }: { team: Team }) {
  const agents = useStore((s) => s.agents);
  const [name, setName] = useState(team.name);
  const [mission, setMission] = useState(team.mission);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const members = agents.filter((a) => a.teamId === team.id);
  const others = agents.filter((a) => a.teamId !== team.id);
  const patch = (body: Record<string, unknown>) => api('PATCH', `/teams/${team.id}`, body).catch((e) => toast(e.message, false));
  const setMembers = (ids: string[]) => patch({ memberIds: ids });

  const assign = async () => {
    try {
      await api('POST', `/teams/${team.id}/tasks`, { title, description });
      setTitle('');
      setDescription('');
      setState({ modal: null });
      toast(`Encargo enviado al departamento ${team.name}`);
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  return (
    <section className="teamcard" style={{ borderColor: team.color }}>
      <div className="teamhead">
        <div className="swatches small">
          {COLORS.map((c) => (
            <button key={c} className={team.color === c ? 'on' : ''} style={{ background: c }} onClick={() => void patch({ color: c })} aria-label={c} />
          ))}
        </div>
        <input className="teamname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== team.name && void patch({ name })} />
        <button className="danger ghost" onClick={() => confirm(`¿Eliminar el departamento ${team.name}?`) && void api('DELETE', `/teams/${team.id}`)}>Eliminar</button>
      </div>
      <input value={mission} placeholder="Misión del departamento: a qué se dedica y qué se espera de él"
        onChange={(e) => setMission(e.target.value)} onBlur={() => mission !== team.mission && void patch({ mission })} />
      <div className="members">
        {members.map((a) => (
          <div key={a.id} className={`member ${team.leadId === a.id ? 'lead' : ''}`}>
            <button className="face" onClick={() => { setState({ modal: null }); void selectAgent(a.id); }} title="Ir a hablar">
              <Avatar appearance={a.appearance} size={44} bg={`${team.color}55`} />
            </button>
            <strong>{a.name}</strong>
            <small>{a.role}</small>
            <div>
              <button title="Responsable del departamento" className={team.leadId === a.id ? 'on' : ''} onClick={() => void patch({ leadId: a.id })}>★</button>
              <button title="Sacar del departamento" onClick={() => void setMembers(members.filter((m) => m.id !== a.id).map((m) => m.id))}>✕</button>
            </div>
          </div>
        ))}
        <div className="member add">
          {others.length > 0 && (
            <select value="" onChange={(e) => e.target.value && void setMembers([...members.map((m) => m.id), e.target.value])}>
              <option value="">＋ Añadir…</option>
              {others.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </select>
          )}
          <button onClick={() => setState({ modal: { kind: 'agent', teamId: team.id } })}>＋ Contratar</button>
        </div>
      </div>
      <details>
        <summary>📌 Encargar un trabajo a todo el departamento</summary>
        <p className="hint">El responsable (★) convoca una reunión, reparte el trabajo entre el equipo, cada uno hace su parte en segundo plano y te trae el resultado integrado.</p>
        <input value={title} placeholder="Título del encargo" onChange={(e) => setTitle(e.target.value)} />
        <textarea rows={3} value={description} placeholder="Describe el objetivo…" onChange={(e) => setDescription(e.target.value)} />
        <button className="primary" disabled={!title.trim() || !members.length} onClick={() => void assign()}>Encargar a {team.name}</button>
      </details>
    </section>
  );
}

export function PeopleModal() {
  const teams = useStore((s) => s.teams);
  const agents = useStore((s) => s.agents);
  const [name, setName] = useState('');
  const loose = agents.filter((a) => !teams.some((t) => t.id === a.teamId));
  const create = async () => {
    if (!name.trim()) return;
    await api('POST', '/teams', { name, color: COLORS[teams.length % COLORS.length] }).catch((e) => toast(e.message, false));
    setName('');
  };
  return (
    <Modal title="RRHH · Equipo y departamentos" onClose={() => setState({ modal: null })} wide>
      <div className="people">
        <div className="toolbar">
          <button className="primary" onClick={() => setState({ modal: { kind: 'agent' } })}>＋ Contratar agente</button>
          <span />
          <input value={name} placeholder="Nuevo departamento (Ventas, Soporte, Legal…)" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()} />
          <button onClick={() => void create()} disabled={!name.trim()}>Crear departamento</button>
        </div>
        {teams.map((t) => <TeamCard key={t.id} team={t} />)}
        {loose.length > 0 && (
          <section className="teamcard loose">
            <h3>Sin departamento</h3>
            <div className="members">
              {loose.map((a) => (
                <div key={a.id} className="member">
                  <button className="face" onClick={() => setState({ modal: { kind: 'agent', id: a.id } })}><Avatar appearance={a.appearance} size={44} /></button>
                  <strong>{a.name}</strong>
                  <small>{a.role}</small>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
