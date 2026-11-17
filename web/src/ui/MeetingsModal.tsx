import { useEffect, useRef, useState } from 'react';
import { DEFAULT_APPEARANCE } from '../game/character';
import { api, copy } from '../net';
import { setState, toast, useStore } from '../store';
import type { Meeting, MeetingGoal } from '../types';
import { Avatar, Markdown, Modal, timeAgo } from './common';

const MAX_PEOPLE = 8;
const OPEN = ['gathering', 'talking', 'writing'];

const GOALS: { id: MeetingGoal; label: string; text: string }[] = [
  { id: 'discuss', label: 'Reunión', text: 'Debaten el tema y deciden. Sale un acta con decisiones y siguientes pasos.' },
  { id: 'spec', label: 'Especificación', text: 'Definen qué se construye. Sale un documento con requisitos, decisiones y reparto.' },
];

const STATUS: Record<Meeting['status'], { label: string; cls: string }> = {
  gathering: { label: 'Reuniéndose', cls: 'blue' },
  talking: { label: 'En debate', cls: 'blue' },
  writing: { label: 'Redactando', cls: 'purple' },
  done: { label: 'Terminada', cls: 'green' },
  failed: { label: 'Fallida', cls: 'red' },
  cancelled: { label: 'Suspendida', cls: 'muted' },
};

const fail = (e: Error) => toast(e.message, false);

function NewMeeting({ onDone }: { onDone: (id: string) => void }) {
  const agents = useStore((s) => s.agents);
  const busy = useStore((s) => s.meetings.some((m) => OPEN.includes(m.status)));
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [goal, setGoal] = useState<MeetingGoal>('discuss');
  const [rounds, setRounds] = useState(2);
  const [ids, setIds] = useState<string[]>([]);
  const toggle = (id: string) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < MAX_PEOPLE ? [...list, id] : list));

  const start = () => api<Meeting>('POST', '/meetings', { title, brief, goal, rounds, agentIds: ids }).then((m) => onDone(m.id), fail);

  return (
    <div className="providerform">
      <p className="hint">Los agentes que elijas van a la sala de reuniones y hablan por turnos. Puedes intervenir cuando quieras. Al final, quien modera lo pone por escrito.</p>
      <label>Tema<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva sección de pedidos en la web" autoFocus /></label>
      <div className="access goals">
        {GOALS.map((g) => (
          <button key={g.id} type="button" className={goal === g.id ? 'on' : ''} onClick={() => setGoal(g.id)}>
            <b>{g.label}</b>
            <small>{g.text}</small>
          </button>
        ))}
      </div>
      <label>Contexto (opcional)
        <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)}
          placeholder="Qué sabemos ya, qué limita la decisión, qué esperas que salga…" />
      </label>
      <label>Quién viene <small className="count">{ids.length} de {MAX_PEOPLE}</small></label>
      <div className="chips">
        {agents.map((a) => (
          <button key={a.id} type="button" className={ids.includes(a.id) ? 'on' : ''} onClick={() => toggle(a.id)} title={a.role}>{a.name}</button>
        ))}
      </div>
      <label>Turnos de palabra por persona</label>
      <div className="chips">
        {[1, 2, 3].map((n) => <button key={n} type="button" className={rounds === n ? 'on' : ''} onClick={() => setRounds(n)}>{n}</button>)}
      </div>
      <footer>
        <span className="hint">{busy ? 'Ya hay una reunión en curso: termínala antes de convocar otra.' : ''}</span>
        <button className="primary" disabled={busy || !title.trim() || ids.length < 2} onClick={() => void start()}>Convocar</button>
      </footer>
    </div>
  );
}

function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const boss = useStore((s) => s.settings);
  const [text, setText] = useState('');
  const [planning, setPlanning] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const open = OPEN.includes(meeting.status);
  const person = (id: string | null) => (id === null ? null : agents.find((a) => a.id === id));
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [meeting.lines.length]);

  const say = () => {
    if (!text.trim()) return;
    void api('POST', `/meetings/${meeting.id}/say`, { text }).then(() => setText(''), fail);
  };
  const plan = () => {
    setPlanning(true);
    void api('POST', `/meetings/${meeting.id}/tasks`).then(() => toast('Trabajo repartido: cada uno va a su mesa'), fail).finally(() => setPlanning(false));
  };
  const forget = () => confirm('¿Borrar esta reunión y su documento?')
    && void api('DELETE', `/meetings/${meeting.id}`).then(() => setState({ modal: { kind: 'meetings' } }), fail);
  const made = tasks.filter((t) => meeting.taskIds.includes(t.id));

  return (
    <div className="meeting">
      <header>
        <div>
          <h3>{meeting.title}</h3>
          <small>{GOALS.find((g) => g.id === meeting.goal)?.label} · {meeting.rounds} {meeting.rounds === 1 ? 'turno' : 'turnos'} por persona · {timeAgo(meeting.createdAt)}</small>
        </div>
        <span className={`pill ${STATUS[meeting.status].cls}`}>{STATUS[meeting.status].label}</span>
      </header>
      <div className="attendees">
        {meeting.agentIds.map((id) => {
          const a = person(id);
          return a ? <span key={id} title={a.role}><Avatar appearance={a.appearance} size={26} />{a.name}</span> : null;
        })}
      </div>
      {meeting.brief && <p className="desc">{meeting.brief}</p>}

      <div className="transcript">
        {meeting.lines.map((l) => {
          const a = person(l.speaker);
          return (
            <div key={l.id} className={`line ${l.speaker === null ? 'boss' : ''}`}>
              <Avatar appearance={a?.appearance ?? boss.playerAppearance ?? DEFAULT_APPEARANCE} size={30} />
              <div>
                <strong>{l.speaker === null ? `${boss.playerName} (tú)` : a?.name ?? 'Ex-empleado'}</strong>
                <p>{l.text}</p>
              </div>
            </div>
          );
        })}
        {meeting.status === 'gathering' && <p className="empty">Van llegando a la sala…</p>}
        {meeting.status === 'talking' && !meeting.lines.length && <p className="empty">Se sientan y empieza el primero.</p>}
        {meeting.status === 'writing' && <p className="empty">Están poniendo por escrito lo hablado.</p>}
        <div ref={end} />
      </div>

      {open && meeting.status !== 'writing' && (
        <div className="composer">
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Interviene: pregunta, corrige o pide que se centren en algo…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say(); } }} />
          <button className="primary" disabled={!text.trim()} onClick={say}>Decir</button>
        </div>
      )}
      {open && (
        <footer>
          <button className="danger" onClick={() => void api('POST', `/meetings/${meeting.id}/cancel`).catch(fail)}>Suspender</button>
          <span />
          {meeting.status !== 'writing' && (
            <button onClick={() => void api('POST', `/meetings/${meeting.id}/finish`).then(() => toast('Terminan el turno en curso y lo ponen por escrito'), fail)}>
              Cerrar debate y redactar
            </button>
          )}
        </footer>
      )}

      {meeting.status === 'failed' && <p className="hint">No ha podido terminar: {meeting.result}</p>}
      {meeting.status === 'done' && (
        <section className="outcome">
          <h4>{meeting.goal === 'spec' ? 'Especificación' : 'Acta'}</h4>
          <Markdown text={meeting.result} />
          {made.length > 0 && (
            <>
              <h4>Trabajo que ha salido</h4>
              <ul className="made">
                {made.map((t) => (
                  <li key={t.id}>
                    <button className="link" onClick={() => setState({ modal: { kind: 'tasks', taskId: t.id } })}>{t.title}</button>
                    <small> · {agents.find((a) => a.id === t.agentId)?.name ?? 'Ex-empleado'}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
          <footer>
            <button className="danger" onClick={forget}>Borrar</button>
            <span />
            <button onClick={() => void copy(meeting.result, 'Documento copiado')}>Copiar</button>
            {!meeting.taskIds.length && (
              <button className="primary" disabled={planning} onClick={plan}>{planning ? 'Repartiendo…' : 'Repartir el trabajo'}</button>
            )}
          </footer>
        </section>
      )}
      {(meeting.status === 'failed' || meeting.status === 'cancelled') && (
        <footer><span /><button className="danger" onClick={forget}>Borrar</button></footer>
      )}
    </div>
  );
}

export function MeetingsModal({ meetingId }: { meetingId?: string }) {
  const meetings = useStore((s) => s.meetings);
  const [current, setCurrent] = useState<string | null>(meetingId ?? meetings.find((m) => OPEN.includes(m.status))?.id ?? null);
  const meeting = meetings.find((m) => m.id === current) ?? null;

  return (
    <Modal title="Sala de reuniones" onClose={() => setState({ modal: null })} wide>
      <div className="providers">
        <div className="list">
          <button className={`add ${!meeting ? 'on' : ''}`} onClick={() => setCurrent(null)}>Convocar reunión</button>
          {meetings.map((m) => (
            <button key={m.id} className={current === m.id ? 'on' : ''} onClick={() => setCurrent(m.id)}>
              <strong>{m.title}</strong>
              <small>{GOALS.find((g) => g.id === m.goal)?.label} · {STATUS[m.status].label.toLowerCase()} · {timeAgo(m.createdAt)}</small>
            </button>
          ))}
        </div>
        <div className="detail">
          {meeting ? <MeetingDetail key={meeting.id} meeting={meeting} /> : <NewMeeting onDone={setCurrent} />}
        </div>
      </div>
    </Modal>
  );
}
