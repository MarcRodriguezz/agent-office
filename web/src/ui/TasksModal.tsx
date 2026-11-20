import { useState } from 'react';
import { setState, useStore } from '../store';
import type { Task } from '../types';
import { Markdown, Modal, TASK_STATUS, timeAgo } from './common';
import { t } from '../i18n';

export function TasksModal({ taskId }: { taskId?: string }) {
  const tasks = useStore((s) => s.tasks);
  const agents = useStore((s) => s.agents);
  const [openId, setOpenId] = useState<string | null>(taskId ?? null);
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? t('Ex-empleado');
  const roots = tasks.filter((t) => !t.parentId);
  const initial = tasks.find((t) => t.id === taskId);
  const rootOpen = initial?.parentId ?? openId;

  const row = (task: Task, child = false) => (
    <div key={task.id} className={`task ${child ? 'child' : ''} ${openId === task.id ? 'open' : ''}`}>
      <button className="taskrow" onClick={() => setOpenId(openId === task.id ? null : task.id)}>
        <span className={`pill ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label}</span>
        <strong>{task.title}</strong>
        <small>{task.origin ? `📨 ${task.origin.office} · ` : ''}{nameOf(task.agentId)} · {timeAgo(task.createdAt)}</small>
      </button>
      {openId === task.id && (
        <div className="taskbody">
          {task.description && task.description !== task.title && <p className="desc">{task.description}</p>}
          {task.result ? <Markdown text={task.result} /> : <p className="empty">{t('Todavía sin resultado: están en ello.')}</p>}
        </div>
      )}
    </div>
  );

  return (
    <Modal title={t('Tablón de tareas')} onClose={() => setState({ modal: null })} wide>
      <div className="tasks">
        {!roots.length && <p className="empty">{t('Aún no hay tareas. Habla con un agente o encarga un trabajo a un departamento.')}</p>}
        {roots.map((task) => {
          const children = tasks.filter((c) => c.parentId === task.id).reverse();
          const expanded = rootOpen === task.id || children.some((c) => c.id === openId);
          return (
            <div key={task.id} className="taskgroup">
              {row(task)}
              {children.length > 0 && (expanded
                ? children.map((c) => row(c, true))
                : <small className="subcount">{t('{v0} subtareas repartidas al equipo', { v0: children.length })}</small>)}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
