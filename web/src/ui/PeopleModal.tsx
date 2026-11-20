import { useState } from 'react';
import { api, selectAgent } from '../net';
import { setState, toast, useStore } from '../store';
import type { Agent, Team } from '../types';
import { Avatar, Modal } from './common';
import { t } from '../i18n';

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
      toast(t('Encargo enviado al departamento {name}', { name: team.name }));
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  return (
    <section className="teamcard" style={{ borderLeftColor: team.color }}>
      <div className="teamhead">
        <div className="swatches small">
          {COLORS.map((c) => (
            <button key={c} className={team.color === c ? 'on' : ''} style={{ background: c }} onClick={() => void patch({ color: c })} aria-label={c} />
          ))}
        </div>
        <input className="teamname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== team.name && void patch({ name })} />
        <button className="danger ghost" onClick={() => confirm(t('¿Eliminar el departamento {name}?', { name: team.name })) && void api('DELETE', `/teams/${team.id}`)}>{t('Eliminar')}</button>
      </div>
      <input value={mission} placeholder={t('Misión del departamento: a qué se dedica y qué se espera de él')}
        onChange={(e) => setMission(e.target.value)} onBlur={() => mission !== team.mission && void patch({ mission })} />
      <div className="members">
        {members.map((a) => (
          <div key={a.id} className={`member ${team.leadId === a.id ? 'lead' : ''}`}>
            <button className="face" onClick={() => { setState({ modal: null }); void selectAgent(a.id); }} title={t('Ir a hablar')}>
              <Avatar appearance={a.appearance} size={44} bg={`${team.color}55`} />
            </button>
            <strong>{a.name}</strong>
            <small>{a.role}</small>
            <div>
              <button title={t('Responsable del departamento')} className={team.leadId === a.id ? 'on' : ''} onClick={() => void patch({ leadId: a.id })}>★</button>
              <button title={t('Sacar del departamento')} onClick={() => void setMembers(members.filter((m) => m.id !== a.id).map((m) => m.id))}>✕</button>
            </div>
          </div>
        ))}
        <div className="member add">
          {others.length > 0 && (
            <select value="" onChange={(e) => e.target.value && void setMembers([...members.map((m) => m.id), e.target.value])}>
              <option value="">{t('Añadir…')}</option>
              {others.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </select>
          )}
          <button onClick={() => setState({ modal: { kind: 'agent', teamId: team.id } })}>{t('Contratar')}</button>
        </div>
      </div>
      <details>
        <summary>{t('Encargar un trabajo a todo el departamento')}</summary>
        <p className="hint">{t('El responsable (★) convoca una reunión, reparte el trabajo entre el equipo, cada uno hace su parte en segundo plano y te trae el resultado integrado.')}</p>
        <input value={title} placeholder={t('Título del encargo')} onChange={(e) => setTitle(e.target.value)} />
        <textarea rows={3} value={description} placeholder={t('Describe el objetivo…')} onChange={(e) => setDescription(e.target.value)} />
        <button className="primary" disabled={!title.trim() || !members.length} onClick={() => void assign()}>{t('Encargar a {name}', { name: team.name })}</button>
      </details>
    </section>
  );
}

function ManagerCard({ agents }: { agents: Agent[] }) {
  const managerId = useStore((s) => s.settings.managerId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const manager = agents.find((a) => a.id === managerId);
  const assign = async () => {
    if (!manager) return;
    try {
      await api('POST', `/agents/${manager.id}/tasks`, { title, description });
      setTitle('');
      setDescription('');
      setState({ modal: null });
      toast(t('Encargo enviado a {name}: lo repartirá entre toda la oficina', { name: manager.name }));
    } catch (e) {
      toast((e as Error).message, false);
    }
  };
  return (
    <section className="teamcard manager">
      <div className="teamhead">
        <strong className="teamtitle">{t('Dirección')}</strong>
        <span />
        <label className="inline">{t('Manager de la oficina')}<select value={managerId ?? ''} onChange={(e) => void api('PATCH', '/settings', { managerId: e.target.value || null }).catch((err) => toast(err.message, false))}>
            <option value="">{t('Nadie: tú repartes el trabajo')}</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </select>
        </label>
      </div>
      {manager ? (
        <>
          <div className="members">
            <div className="member lead">
              <button className="face" onClick={() => { setState({ modal: null }); void selectAgent(manager.id); }} title={t('Ir a hablar')}>
                <Avatar appearance={manager.appearance} size={44} />
              </button>
              <strong>{manager.name}</strong>
              <small>{manager.role}</small>
            </div>
            <p className="facts">{t('Recibe tus encargos, decide a quién le toca cada parte entre toda la oficina, espera las entregas y te trae un único resultado.')}</p>
          </div>
          <details>
            <summary>{t('Encargar un trabajo a toda la oficina')}</summary>
            <input value={title} placeholder={t('Título del encargo')} onChange={(e) => setTitle(e.target.value)} />
            <textarea rows={3} value={description} placeholder={t('Describe el objetivo…')} onChange={(e) => setDescription(e.target.value)} />
            <button className="primary" disabled={!title.trim()} onClick={() => void assign()}>{t('Encargar a {name}', { name: manager.name })}</button>
          </details>
        </>
      ) : <p className="facts">{t('Sin manager, cada encargo va a una persona o a un departamento. Elige a alguien para que coordine a toda la oficina.')}</p>}
    </section>
  );
}

function Templates() {
  const templates = useStore((s) => s.templates);
  const people = useStore((s) => s.agents.length);
  const [choice, setChoice] = useState('');
  const load = async () => {
    const template = templates.find((t) => t.id === choice);
    if (!template) return;
    if (!confirm(t('¿Sustituir a las {people} personas actuales por «{name}»? Se pierden sus conversaciones, sus niveles y sus departamentos.', { people, name: template.name }))) return;
    await api('POST', '/staff', { template: choice }).then(() => toast(t('«{name}» ya está en la oficina', { name: template.name })), (e) => toast(e.message, false));
    setChoice('');
  };
  return (
    <details className="templates">
      <summary>{t('Empezar con otro equipo')}</summary>
      <p className="hint">{t('Cambia toda la plantilla por un equipo ya montado. Tus proveedores, tu plano y tu perfil no se tocan.')}</p>
      <div className="row">
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{t('Elige un equipo')}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.summary}</option>)}
        </select>
        <button className="danger" disabled={!choice} onClick={() => void load()}>{t('Sustituir plantilla')}</button>
      </div>
    </details>
  );
}

export function PeopleModal() {
  const teams = useStore((s) => s.teams);
  const agents = useStore((s) => s.agents);
  const managerId = useStore((s) => s.settings.managerId);
  const [name, setName] = useState('');
  const loose = agents.filter((a) => a.id !== managerId && !teams.some((t) => t.id === a.teamId));
  const create = async () => {
    if (!name.trim()) return;
    await api('POST', '/teams', { name, color: COLORS[teams.length % COLORS.length] }).catch((e) => toast(e.message, false));
    setName('');
  };
  return (
    <Modal title={t('Equipo y departamentos')} onClose={() => setState({ modal: null })} wide>
      <div className="people">
        <div className="toolbar">
          <button className="primary" onClick={() => setState({ modal: { kind: 'agent' } })}>{t('Contratar a alguien')}</button>
          <span />
          <input value={name} placeholder={t('Nuevo departamento (Ventas, Soporte, Legal…)')} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()} />
          <button onClick={() => void create()} disabled={!name.trim()}>{t('Crear departamento')}</button>
        </div>
        <ManagerCard agents={agents} />
        {teams.map((t) => <TeamCard key={t.id} team={t} />)}
        {loose.length > 0 && (
          <section className="teamcard loose">
            <h3>{t('Sin departamento')}</h3>
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
        <Templates />
      </div>
    </Modal>
  );
}
