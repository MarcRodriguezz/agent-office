import { useEffect, useRef, type ReactNode } from 'react';
import { drawPortrait } from '../game/character';
import type { Appearance, Task } from '../types';

export function Avatar({ appearance, size = 40, bg = '#2a2f3e' }: { appearance: Appearance; size?: number; bg?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const scale = 2;
    canvas.width = size * scale;
    canvas.height = size * scale;
    drawPortrait(canvas.getContext('2d')!, size * scale, appearance, bg);
  }, [appearance, size, bg]);
  return <canvas ref={ref} className="avatar" style={{ width: size, height: size }} />;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function markdown(source: string): string {
  const inline = (s: string) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let code = false;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of escapeHtml(source).split('\n')) {
    if (raw.trim().startsWith('```')) {
      closeList();
      out.push(code ? '</pre>' : '<pre>');
      code = !code;
      continue;
    }
    if (code) {
      out.push(`${raw}\n`);
      continue;
    }
    const heading = raw.match(/^(#{1,4})\s+(.*)$/);
    const bullet = raw.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = raw.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) {
      closeList();
      out.push(`<h4>${inline(heading[2])}</h4>`);
    } else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
    } else if (!raw.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(raw)}</p>`);
    }
  }
  closeList();
  if (code) out.push('</pre>');
  return out.join('');
}

export function Markdown({ text }: { text: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: markdown(text) }} />;
}

export const TASK_STATUS: Record<Task['status'], { label: string; cls: string }> = {
  queued: { label: 'En cola', cls: 'muted' },
  working: { label: 'En curso', cls: 'blue' },
  delegating: { label: 'Repartida al equipo', cls: 'purple' },
  done: { label: 'Entregada', cls: 'green' },
  failed: { label: 'Fallida', cls: 'red' },
};

export const STATUS_LABEL: Record<string, string> = {
  idle: 'En su mesa', walking: 'Caminando', working: 'Trabajando', thinking: 'Pensando', talking: 'En reunión',
  visiting: 'Contigo', waiting: 'Esperando a su equipo', break: 'De descanso',
};

export const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleDateString();
};
