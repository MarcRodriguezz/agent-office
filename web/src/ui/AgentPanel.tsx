import { useEffect, useRef, useState } from 'react';
import { api } from '../net';
import { setState, toast, useStore, world } from '../store';
import { levelOf, speciesOf, stageOf } from '../game/creature';
import { Avatar, Markdown, STATUS_LABEL, TASK_STATUS, timeAgo } from './common';
import { CreatureView, XpBar } from './Companions';

export function AgentPanel() {
  const id = useStore((s) => s.selectedAgentId);
  const agent = useStore((s) => s.agents.find((a) => a.id === id));
  const team = useStore((s) => s.teams.find((t) => t.id === agent?.teamId));
  const provider = useStore((s) => s.providers.find((p) => p.id === (agent?.providerId ?? s.settings.defaultProviderId)));
  const messages = useStore((s) => (id ? s.messages[id] : undefined));
  const tasks = useStore((s) => s.tasks);
  const [tab, setTab] = useState<'chat' | 'tasks'>('chat');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [, tick] = useState(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 700);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length, tab, id]);

  if (!agent) return null;
  const actor = world.actors.get(agent.id);
  const mine = tasks.filter((t) => t.agentId === agent.id);
  const waitingReply = messages?.length ? messages[messages.length - 1].sender === 'user' : false;

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    await api('POST', `/agents/${agent.id}/chat`, { text: value }).catch((e) => toast(e.message, false));
  };
  const assign = async () => {
    if (!title.trim()) return;
    await api('POST', `/agents/${agent.id}/tasks`, { title, description }).catch((e) => toast(e.message, false));
    setTitle('');
    setDescription('');
  };

  return (
    <aside className="panel">
      <header>
        <Avatar appearance={agent.appearance} size={56} bg={team ? `${team.color}55` : '#2a2f3e'} />
        <div className="who">
          <strong>{agent.name}</strong>
          <span>{agent.role}</span>
          <small>
            {team ? <b style={{ color: team.color }}>{team.name}{team.leadId === agent.id ? ' · responsable' : ''}</b> : 'Sin departamento'}
            {' · '}{STATUS_LABEL[actor?.status ?? 'idle']}
          </small>
        </div>
        <button className="icon" onClick={() => setState({ selectedAgentId: null })} aria-label="Cerrar">✕</button>
      </header>
      <div className="quick">
        <button onClick={() => void api('POST', `/agents/${agent.id}/summon`)}>Que venga</button>
        <button onClick={() => void api('POST', `/agents/${agent.id}/dismiss`)}>A su mesa</button>
        <button onClick={() => setState({ modal: { kind: 'agent', id: agent.id } })}>Editar</button>
      </div>
      <div className="compi">
        <CreatureView species={agent.companion.species} stage={stageOf(levelOf(agent.xp))} size={46} />
        <div>
          <strong>{agent.companion.name} <small>{speciesOf(agent.companion.species).type}</small></strong>
          <XpBar xp={agent.xp} color={speciesOf(agent.companion.species).color} />
        </div>
      </div>
      <div className="brainline">Piensa con {provider ? `${provider.name}${agent.model || provider.model ? ` · ${agent.model || provider.model}` : ''}` : 'Sin proveedor'}</div>
      <nav className="tabs">
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Conversación</button>
        <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>Tareas ({mine.length})</button>
      </nav>

      {tab === 'chat' ? (
        <>
          <div className="chat">
            {!messages?.length && <p className="empty">Salúdale o encárgale algo: «prepárame un plan de lanzamiento…»</p>}
            {messages?.map((m) => (
              <div key={m.id} className={`msg ${m.sender}`}>
                <Markdown text={m.text} />
              </div>
            ))}
            {waitingReply && <div className="msg agent typing"><span /><span /><span /></div>}
            <div ref={end} />
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <textarea value={text} placeholder={`Habla con ${agent.name}…`} rows={2}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
            <button className="primary" type="submit">Enviar</button>
          </form>
        </>
      ) : (
        <div className="tasklist">
          <div className="newtask">
            <input value={title} placeholder="Título de la tarea" onChange={(e) => setTitle(e.target.value)} />
            <textarea value={description} rows={3} placeholder="Describe el encargo con el detalle que necesite…"
              onChange={(e) => setDescription(e.target.value)} />
            <button className="primary" onClick={() => void assign()} disabled={!title.trim()}>Encargar a {agent.name}</button>
          </div>
          {mine.map((t) => (
            <button key={t.id} className="taskrow" onClick={() => setState({ modal: { kind: 'tasks', taskId: t.id } })}>
              <span className={`pill ${TASK_STATUS[t.status].cls}`}>{TASK_STATUS[t.status].label}</span>
              <strong>{t.title}</strong>
              <small>{timeAgo(t.createdAt)}</small>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
