import { useState } from 'react';
import { setState, useStore } from '../store';
import type { Task } from '../types';
import { Markdown, Modal, TASK_STATUS, timeAgo } from './common';

export function TasksModal({ taskId }: { taskId?: string }) {
  const tasks = useStore((s) => s.tasks);
  const agents = useStore((s) => s.agents);
  const [openId, setOpenId] = useState<string | null>(taskId ?? null);
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? 'Ex-empleado';
  const roots = tasks.filter((t) => !t.parentId);
  const initial = tasks.find((t) => t.id === taskId);
  const rootOpen = initial?.parentId ?? openId;

  const row = (t: Task, child = false) => (
    <div key={t.id} className={`task ${child ? 'child' : ''} ${openId === t.id ? 'open' : ''}`}>
      <button className="taskrow" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
        <span className={`pill ${TASK_STATUS[t.status].cls}`}>{TASK_STATUS[t.status].label}</span>
        <strong>{t.title}</strong>
        <small>{nameOf(t.agentId)} · {timeAgo(t.createdAt)}</small>
      </button>
      {openId === t.id && (
        <div className="taskbody">
          {t.description && t.description !== t.title && <p className="desc">{t.description}</p>}
          {t.result ? <Markdown text={t.result} /> : <p className="empty">Todavía sin resultado: están en ello.</p>}
        </div>
      )}
    </div>
  );

  return (
    <Modal title="Tablón de tareas" onClose={() => setState({ modal: null })} wide>
      <div className="tasks">
        {!roots.length && <p className="empty">Aún no hay tareas. Habla con un agente o encarga un trabajo a un departamento.</p>}
        {roots.map((t) => {
          const children = tasks.filter((c) => c.parentId === t.id).reverse();
          const expanded = rootOpen === t.id || children.some((c) => c.id === openId);
          return (
            <div key={t.id} className="taskgroup">
              {row(t)}
              {children.length > 0 && (expanded
                ? children.map((c) => row(c, true))
                : <small className="subcount">{children.length} subtareas repartidas al equipo</small>)}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
