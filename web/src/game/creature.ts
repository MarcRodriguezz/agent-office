import type { Companion, Facing } from '../types';

export interface Species {
  id: string;
  name: string;
  type: string;
  color: string;
  dark: string;
  light: string;
  blurb: string;
}

export const SPECIES: Species[] = [
  { id: 'brotin', name: 'Brotín', type: 'Planta', color: '#6fcf73', dark: '#3f9b5f', light: '#b7efc5', blurb: 'Crece un poco con cada tarea terminada.' },
  { id: 'ascuo', name: 'Ascuo', type: 'Fuego', color: '#ff8a3d', dark: '#e25b2a', light: '#ffd27a', blurb: 'Se aviva cuando hay prisa por entregar.' },
  { id: 'gotelo', name: 'Gotelo', type: 'Agua', color: '#4fb3ff', dark: '#2f86d6', light: '#c9e9fb', blurb: 'Mantiene la calma en las reuniones largas.' },
  { id: 'voltin', name: 'Voltín', type: 'Chispa', color: '#b58cff', dark: '#7c5cff', light: '#ffe66d', blurb: 'Da un chispazo cada vez que surge una idea.' },
  { id: 'pedrin', name: 'Pedrín', type: 'Roca', color: '#a9a093', dark: '#7d7468', light: '#7fe3e0', blurb: 'Lento pero incansable. No se le cae nada.' },
  { id: 'nubi', name: 'Nubi', type: 'Aire', color: '#f4f7ff', dark: '#c3cbe0', light: '#ffffff', blurb: 'Flota sobre los papeles sin desordenarlos.' },
  { id: 'bitxo', name: 'Bitxo', type: 'Dato', color: '#1f8f8a', dark: '#156662', light: '#7df9c8', blurb: 'Vive en la sala de servidores y come logs.' },
  { id: 'lumo', name: 'Lumo', type: 'Luz', color: '#ff8fc7', dark: '#e0668a', light: '#fff3b0', blurb: 'Brilla más cuanto mejor va el equipo.' },
];

export const speciesOf = (id: string) => SPECIES.find((s) => s.id === id) ?? SPECIES[0];
export const XP_PER_LEVEL = 100;
export const levelOf = (xp: number) => 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
export const stageOf = (level: number) => (level >= 6 ? 3 : level >= 3 ? 2 : 1);
export const nextEvolution = (level: number) => (level < 3 ? 3 : level < 6 ? 6 : null);
export const STAGE_LABEL = ['', 'Cría', 'Joven', 'Adulto'];

export const randomCompanion = (): Companion => {
  const s = SPECIES[Math.floor(Math.random() * SPECIES.length)];
  return { species: s.id, name: s.name };
};

type Ctx = CanvasRenderingContext2D;

export interface CreaturePose {
  time: number;
  seed: number;
  moving: boolean;
  facing: Facing;
}

function blob(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function teardrop(ctx: Ctx, x: number, y: number, r: number, tip: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r - tip);
  ctx.bezierCurveTo(x + r * 0.5, y - r * 0.9, x + r, y - r * 0.3, x + r, y + r * 0.1);
  ctx.arc(x, y + r * 0.1, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y - r * 0.3, x - r * 0.5, y - r * 0.9, x, y - r - tip);
  ctx.fill();
}

function star(ctx: Ctx, x: number, y: number, outer: number, inner: number, points: number, rot: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function face(ctx: Ctx, x: number, y: number, r: number, facing: Facing, blink: boolean, eye = '#2a2420') {
  if (facing === 'up') return;
  const shift = facing === 'left' ? -r * 0.28 : facing === 'right' ? r * 0.28 : 0;
  ctx.fillStyle = eye;
  ctx.strokeStyle = eye;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = x + side * r * 0.36 + shift;
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.12, y);
      ctx.lineTo(ex + r * 0.12, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(ex, y, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.arc(x + shift, y + r * 0.22, r * 0.16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

export function drawCreature(ctx: Ctx, x: number, y: number, speciesId: string, stage: number, pose: CreaturePose) {
  const s = speciesOf(speciesId);
  const r = 10 * [1, 1.2, 1.45][stage - 1];
  const t = pose.time + pose.seed;
  const floats = s.id === 'nubi' || s.id === 'lumo';
  const hop = pose.moving ? Math.abs(Math.sin(t * 11)) * 4.5 : floats ? 3 + Math.sin(t * 2.4) * 2 : Math.abs(Math.sin(t * 2.2)) * 1.2;
  const squash = pose.moving ? 1 : 1 + Math.sin(t * 2.2) * 0.03;
  const cx = x;
  const cy = y - r * 0.9 - hop;
  const blink = (t * 1.3) % 4 < 0.12;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, r * (floats ? 0.7 : 0.95), r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (s.id) {
    case 'brotin': {
      ctx.strokeStyle = s.dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.8);
      ctx.lineTo(cx, cy - r * 1.5);
      ctx.stroke();
      const sway = Math.sin(t * 3) * 0.2;
      for (let i = 0; i < Math.min(stage, 2); i++) {
        const side = i ? -1 : 1;
        ctx.save();
        ctx.translate(cx, cy - r * 1.45);
        ctx.rotate(side * (0.7 + sway));
        blob(ctx, side * r * 0.5, 0, r * 0.55, r * 0.26, s.dark);
        ctx.restore();
      }
      blob(ctx, cx, cy, r * squash, r * 0.9 / squash, s.color);
      blob(ctx, cx, cy + r * 0.3, r * 0.6, r * 0.42, s.light);
      if (stage === 3) {
        for (let i = 0; i < 5; i++) {
          const a = t * 0.6 + (i * Math.PI * 2) / 5;
          blob(ctx, cx + Math.cos(a) * r * 0.36, cy - r * 1.7 + Math.sin(a) * r * 0.36, r * 0.25, r * 0.25, '#ff9fb5');
        }
        blob(ctx, cx, cy - r * 1.7, r * 0.2, r * 0.2, '#ffd76a');
      }
      break;
    }
    case 'ascuo': {
      const flick = Math.sin(t * 9) * r * 0.12;
      if (stage >= 2) {
        teardrop(ctx, cx - r * 0.85, cy - r * 0.1, r * 0.38, r * 0.4 + flick, s.dark);
        teardrop(ctx, cx + r * 0.85, cy - r * 0.1, r * 0.38, r * 0.4 - flick, s.dark);
      }
      if (stage === 3) teardrop(ctx, cx, cy - r * 0.75, r * 0.45, r * 0.75 + flick, '#ffd27a');
      teardrop(ctx, cx, cy, r * squash, r * 0.55 + flick, s.color);
      blob(ctx, cx, cy + r * 0.35, r * 0.58, r * 0.45, s.light);
      break;
    }
    case 'gotelo': {
      ctx.fillStyle = s.dark;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.7, cy - r * 0.2);
        ctx.lineTo(cx + side * r * 1.45, cy - r * 0.55);
        ctx.lineTo(cx + side * r * 0.9, cy + r * 0.3);
        ctx.fill();
      }
      teardrop(ctx, cx, cy, r * squash, r * 0.3, s.color);
      blob(ctx, cx - r * 0.35, cy - r * 0.35, r * 0.22, r * 0.14, 'rgba(255, 255, 255, 0.7)');
      if (stage >= 2) {
        ctx.strokeStyle = s.light;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy - r * 1.35, r * 0.4, Math.PI * 0.9, Math.PI * 2.2);
        ctx.stroke();
      }
      if (stage === 3) {
        for (let i = 0; i < 3; i++) {
          const a = t * 1.5 + (i * Math.PI * 2) / 3;
          blob(ctx, cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 0.5, r * 0.18, r * 0.18, 'rgba(201, 233, 251, 0.9)');
        }
      }
      break;
    }
    case 'voltin': {
      const antennas = stage >= 2 ? [-0.45, 0.45] : [0];
      for (const a of antennas) {
        ctx.strokeStyle = s.dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + a * r, cy - r * 0.7);
        ctx.lineTo(cx + a * r * 1.5, cy - r * 1.45);
        ctx.stroke();
        star(ctx, cx + a * r * 1.5, cy - r * 1.55, r * 0.34, r * 0.14, 4, t * 4, s.light);
      }
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.roundRect(cx - r * 0.95, cy - r * 0.85, r * 1.9, r * 1.75, r * 0.5);
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(cx - r * 0.95, cy + r * 0.45, r * 1.9, r * 0.18);
      if (stage === 3) {
        for (let i = 0; i < 3; i++) {
          const a = -t * 2.4 + (i * Math.PI * 2) / 3;
          star(ctx, cx + Math.cos(a) * r * 1.55, cy + Math.sin(a) * r * 0.7, r * 0.26, r * 0.1, 4, t * 3, s.light);
        }
      }
      break;
    }
    case 'pedrin': {
      ctx.fillStyle = s.light;
      const crystals = [[-0.5, 0.75], [0.35, 1], [0, 1.25]].slice(0, stage);
      for (const [dx, h] of crystals) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * r - r * 0.28, cy - r * 0.6);
        ctx.lineTo(cx + dx * r, cy - r * 0.6 - h * r);
        ctx.lineTo(cx + dx * r + r * 0.28, cy - r * 0.6);
        ctx.fill();
      }
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy + r * 0.2);
      ctx.lineTo(cx - r * 0.7, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.1, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.85, cy - r * 0.55);
      ctx.lineTo(cx + r, cy + r * 0.35);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.9);
      ctx.lineTo(cx - r * 0.6, cy + r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(cx - r * 0.5, cy + r * 0.5, r * 0.5, r * 0.12);
      break;
    }
    case 'nubi': {
      if (stage === 3) {
        ['#ff8f8f', '#ffd76a', '#7fe3a0', '#7fb8ff'].forEach((color, i) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(cx, cy - r * 0.2, r * (1.75 - i * 0.14), Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        });
      }
      const flap = Math.sin(t * 8) * 0.35;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + side * r * 0.9, cy - r * 0.1);
        ctx.rotate(side * (0.3 + flap));
        blob(ctx, side * r * 0.35, 0, r * 0.45, r * 0.2, s.dark);
        ctx.restore();
      }
      blob(ctx, cx - r * 0.55, cy + r * 0.15, r * 0.6, r * 0.55, s.color);
      blob(ctx, cx + r * 0.55, cy + r * 0.15, r * 0.6, r * 0.55, s.color);
      blob(ctx, cx, cy - r * 0.2, r * 0.75, r * 0.72, s.color);
      if (stage >= 2) blob(ctx, cx + r * 0.25, cy - r * 0.8, r * 0.36, r * 0.34, s.color);
      break;
    }
    case 'bitxo': {
      if (stage >= 2) {
        ctx.strokeStyle = s.dark;
        ctx.lineWidth = 2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + side * r * 0.5, cy - r * 0.8);
          ctx.lineTo(cx + side * r * 0.8, cy - r * 1.4);
          ctx.stroke();
          blob(ctx, cx + side * r * 0.8, cy - r * 1.45, r * 0.16, r * 0.16, s.light);
        }
      }
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.roundRect(cx - r, cy - r * 0.9, r * 2, r * 1.8, r * 0.3);
      ctx.fill();
      ctx.fillStyle = '#0e2b2a';
      ctx.beginPath();
      ctx.roundRect(cx - r * 0.72, cy - r * 0.55, r * 1.44, r * 0.95, r * 0.2);
      ctx.fill();
      if (stage === 3) {
        ctx.fillStyle = s.light;
        for (let i = 0; i < 4; i++) {
          const a = t * 1.8 + (i * Math.PI) / 2;
          const p = r * 0.22;
          ctx.fillRect(cx + Math.cos(a) * r * 1.6 - p / 2, cy + Math.sin(a) * r * 0.9 - p / 2, p, p);
        }
      }
      face(ctx, cx, cy - r * 0.12, r * 0.85, pose.facing, blink, s.light);
      return;
    }
    case 'lumo': {
      if (stage === 3) {
        ctx.strokeStyle = 'rgba(255, 243, 176, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy - r * 1.15, r * 0.6, r * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      blob(ctx, cx, cy, r * 1.5, r * 1.5, `rgba(255, 243, 176, ${0.14 + Math.sin(t * 3) * 0.05})`);
      star(ctx, cx, cy, r * 1.25, r * 0.72, 4 + stage, -Math.PI / 2 + Math.sin(t * 1.5) * 0.12, s.color);
      blob(ctx, cx, cy, r * 0.62, r * 0.62, s.light);
      face(ctx, cx, cy - r * 0.05, r * 0.7, pose.facing, blink);
      return;
    }
  }
  face(ctx, cx, cy - r * 0.05, r, pose.facing, blink);
}
