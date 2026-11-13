import type { Furniture, MapData } from '../types';
import { roundRect } from './character';

export const T = 48;
export const WALL_H = 30;

type Ctx = CanvasRenderingContext2D;

const FLOORS: Record<string, [string, string]> = {
  wood: ['#c79d70', '#bd9165'],
  carpet: ['#6f93a6', '#688a9d'],
  tech: ['#363c4b', '#313746'],
  tile: ['#e9e4dc', '#dfd9cf'],
  office: ['#d8d3c9', '#d1ccc1'],
  cafe: ['#e9cda6', '#dfbe92'],
};

const isWall = (map: MapData, x: number, y: number) =>
  x < 0 || y < 0 || x >= map.w || y >= map.h || map.walls[y * map.w + x] === 1;

function chair(ctx: Ctx, x: number, y: number, color: string) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  roundRect(ctx, x * T + 9, y * T + 12, 30, 32, 9);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x * T + 9, y * T + 8, 30, 32, 9);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  roundRect(ctx, x * T + 12, y * T + 10, 24, 9, 4);
  ctx.fill();
}

export function buildFloor(map: MapData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map.w * T;
  canvas.height = map.h * T;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#bdb6aa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const room of map.rooms) {
    const [a, b] = FLOORS[room.floor] ?? FLOORS.office;
    const x0 = room.x * T;
    const y0 = room.y * T;
    const w = room.w * T;
    const h = room.h * T;
    ctx.fillStyle = a;
    ctx.fillRect(x0, y0, w, h);
    if (room.floor === 'wood') {
      for (let j = 0; j < room.h * 2; j++) {
        if (j % 2) {
          ctx.fillStyle = b;
          ctx.fillRect(x0, y0 + j * 24, w, 24);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
        ctx.fillRect(x0, y0 + j * 24, w, 1);
        for (let x = (j % 3) * 40 + 30; x < w; x += 120) ctx.fillRect(x0 + x, y0 + j * 24, 1, 24);
      }
    } else if (room.floor === 'tile' || room.floor === 'cafe') {
      ctx.fillStyle = b;
      for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) if ((i + j) % 2) ctx.fillRect(x0 + i * T, y0 + j * T, T, T);
    } else {
      ctx.fillStyle = room.floor === 'tech' ? 'rgba(255, 255, 255, 0.055)' : 'rgba(0, 0, 0, 0.05)';
      for (let i = 1; i < room.w; i++) ctx.fillRect(x0 + i * T, y0, 1, h);
      for (let j = 1; j < room.h; j++) ctx.fillRect(x0, y0 + j * T, w, 1);
      if (room.floor === 'tech') {
        ctx.fillStyle = 'rgba(80, 220, 255, 0.16)';
        ctx.fillRect(x0 + T, y0 + h - T * 1.5, w - T * 2, 3);
      }
    }
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = room.floor === 'tech' ? 'rgba(255, 255, 255, 0.32)' : 'rgba(40, 30, 20, 0.3)';
    ctx.save();
    ctx.translate(x0 + 12, y0 + h - 12);
    [...room.name].forEach((ch, i) => ctx.fillText(ch, i * 9.5, 0));
    ctx.restore();
  }

  for (const f of map.furniture) {
    if (f.type !== 'rug' && f.type !== 'rug2') continue;
    const main = f.type === 'rug' ? '#a9473f' : '#6f86b3';
    ctx.fillStyle = main;
    roundRect(ctx, f.x * T + 4, f.y * T + 4, f.w * T - 8, f.h * T - 8, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, f.x * T + 12, f.y * T + 12, f.w * T - 24, f.h * T - 24, 6);
    ctx.stroke();
  }

  for (let y = 1; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (isWall(map, x, y) || !isWall(map, x, y - 1)) continue;
      const g = ctx.createLinearGradient(0, y * T, 0, y * T + 18);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x * T, y * T, T, 18);
    }
  }

  map.desks.forEach((d) => chair(ctx, d.seat[0], d.seat[1], '#444b5c'));
  chair(ctx, map.bossSeat[0], map.bossSeat[1], '#4a2f24');
  return canvas;
}

export function wallCells(map: MapData) {
  const cells: { x: number; y: number; front: boolean; window: boolean }[] = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!isWall(map, x, y)) continue;
      const front = y < map.h - 1 && !isWall(map, x, y + 1);
      const window = y === 0 && front && x % 4 === 1 && !isWall(map, x + 1, 1);
      cells.push({ x, y, front, window });
    }
  }
  return cells;
}

export function drawWall(ctx: Ctx, cell: { x: number; y: number; front: boolean; window: boolean }) {
  const px = cell.x * T;
  const py = cell.y * T;
  if (cell.front) {
    ctx.fillStyle = '#cbc1b2';
    ctx.fillRect(px, py + T - WALL_H, T, WALL_H);
    ctx.fillStyle = '#a2978a';
    ctx.fillRect(px, py + T - 5, T, 5);
  }
  ctx.fillStyle = '#f1ebe1';
  ctx.fillRect(px, py - WALL_H, T, T);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
  ctx.fillRect(px, py + T - WALL_H - 2, T, 2);
}

export function drawWindow(ctx: Ctx, cell: { x: number; y: number }) {
  const px = cell.x * T;
  const py = cell.y * T + T - WALL_H;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, px + 8, py + 4, T * 2 - 16, 17, 3);
  ctx.fill();
  const g = ctx.createLinearGradient(0, py + 6, 0, py + 19);
  g.addColorStop(0, '#8fcdf4');
  g.addColorStop(1, '#c9e9fb');
  ctx.fillStyle = g;
  ctx.fillRect(px + 11, py + 6, T - 14, 13);
  ctx.fillRect(px + T + 1, py + 6, T - 14, 13);
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, e: number, top: string, front: string, r = 4) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  roundRect(ctx, x + 1, y + h - 4, w - 2, 8, 4);
  ctx.fill();
  ctx.fillStyle = front;
  roundRect(ctx, x, y + h - e - r, w, e + r, r);
  ctx.fill();
  ctx.fillStyle = top;
  roundRect(ctx, x, y - e, w, h, r);
  ctx.fill();
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const BOOKS = ['#e25555', '#4f8cff', '#f2c14e', '#2fa37a', '#7c5cff', '#f2f2f2', '#ff9f43', '#38b6c9'];

export interface FurnitureInfo {
  time: number;
  working?: boolean;
  color?: string;
  wallRight?: boolean;
}

export function drawFurniture(ctx: Ctx, f: Furniture, info: FurnitureInfo) {
  const px = f.x * T;
  const py = f.y * T;
  const pw = f.w * T;
  const ph = f.h * T;
  const cx = px + pw / 2;
  const cy = py + ph / 2;
  const { time } = info;

  switch (f.type) {
    case 'desk': {
      box(ctx, px + 3, py + 6, pw - 6, ph - 10, 20, '#e4c69d', '#b8915f');
      ctx.fillStyle = info.color ?? 'rgba(0, 0, 0, 0.12)';
      roundRect(ctx, px + 12, py + ph - 14, pw - 24, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(px + 26, py + 2);
      ctx.rotate(-0.15);
      ctx.fillRect(-8, -10, 16, 20);
      ctx.restore();
      dot(ctx, px + pw - 24, py + 2, 6, '#ffffff');
      dot(ctx, px + pw - 24, py + 2, 4, '#6b4429');
      if (info.working) {
        ctx.fillStyle = `rgba(125, 249, 200, ${0.16 + Math.sin(time * 6) * 0.06})`;
        roundRect(ctx, cx - 20, py - 18, 40, 30, 8);
        ctx.fill();
      }
      ctx.fillStyle = '#c3c7d0';
      roundRect(ctx, cx - 14, py + 2, 28, 8, 2);
      ctx.fill();
      ctx.fillStyle = '#4a505e';
      roundRect(ctx, cx - 14, py - 12, 28, 18, 3);
      ctx.fill();
      dot(ctx, cx, py - 3, 2.5, info.working ? '#7df9c8' : '#8d93a1');
      break;
    }
    case 'bossdesk': {
      box(ctx, px - 5, py + 4, pw + 10, ph - 8, 22, '#9c6b46', '#6e452c', 6);
      ctx.fillStyle = '#e0b354';
      roundRect(ctx, cx - 16, py + ph - 20, 32, 8, 2);
      ctx.fill();
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(cx - 34, py - 2, 8, 6);
      roundRect(ctx, cx - 52, py - 26, 44, 26, 4);
      ctx.fill();
      dot(ctx, cx - 30, py - 13, 3, '#7df9c8');
      dot(ctx, cx + 40, py - 2, 7, '#3a3f4b');
      ctx.fillStyle = '#3a3f4b';
      ctx.fillRect(cx + 38.5, py - 22, 3, 20);
      dot(ctx, cx + 40, py - 24, 9, '#ffd76a');
      dot(ctx, cx + 40, py - 24, 16, 'rgba(255, 215, 106, 0.2)');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 4, py - 6, 16, 12);
      break;
    }
    case 'plant': {
      box(ctx, px + 14, py + 24, 20, 14, 12, '#cf8a62', '#a5633f', 3);
      const sway = Math.sin(time * 1.3 + f.x) * 1.2;
      dot(ctx, cx - 9 + sway, py + 6, 10, '#2f8550');
      dot(ctx, cx + 9 + sway, py + 6, 10, '#379a5c');
      dot(ctx, cx + sway * 1.4, py - 4, 13, '#4fb873');
      dot(ctx, cx - 3 + sway * 1.4, py - 8, 5, '#6fd08f');
      break;
    }
    case 'bookshelf': {
      box(ctx, px + 2, py + 8, pw - 4, ph - 14, 44, '#8a6444', '#6f4e33');
      for (let row = 0; row < 2; row++) {
        const y = py + 1 + row * 20;
        ctx.fillStyle = '#4f3622';
        ctx.fillRect(px + 6, y, pw - 12, 17);
        for (let x = px + 8, i = row * 3; x < px + pw - 14; i++) {
          const w = 5 + ((i * 7) % 5);
          const h = 11 + ((i * 5) % 5);
          ctx.fillStyle = BOOKS[(i * 3 + row) % BOOKS.length];
          ctx.fillRect(x, y + 16 - h, w, h);
          x += w + 1;
        }
      }
      break;
    }
    case 'sofa': {
      box(ctx, px + 6, py + 6, pw - 12, ph - 12, 10, '#6c8fc7', '#4f6fa3', 8);
      box(ctx, info.wallRight ? px + pw - 16 : px + 4, py + 6, 12, ph - 12, 20, '#5a7db8', '#4a699b', 5);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      for (let i = 1; i < f.h; i++) ctx.fillRect(px + 8, py + i * T - 8, pw - 16, 2);
      break;
    }
    case 'table': {
      box(ctx, px + 4, py + 8, pw - 8, ph - 14, 20, '#eedfc5', '#c4ad88', 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + 50, py + 6, 18, 24);
      ctx.fillRect(px + pw - 90, py + 18, 22, 16);
      ctx.fillStyle = '#4a505e';
      roundRect(ctx, cx - 16, py + 10, 32, 20, 3);
      ctx.fill();
      dot(ctx, px + pw - 40, py + 8, 6, '#ffffff');
      dot(ctx, px + pw - 40, py + 8, 4, '#6b4429');
      break;
    }
    case 'whiteboard': {
      box(ctx, px + 4, py + 26, pw - 8, 8, 46, '#aeb4bf', '#ffffff', 3);
      ctx.strokeStyle = '#aeb4bf';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 5, py - 11, pw - 10, 44);
      ctx.font = '700 9px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#4f8cff';
      ctx.fillText('TAREAS', px + 12, py + 1);
      ['#ffd76a', '#ff9fb5', '#9ad7ff', '#b7efc5', '#ffd76a', '#9ad7ff'].forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(px + 14 + (i % 3) * 22 + (i > 2 ? 78 : 0), py + 7 + Math.floor(i / 3) * 0 + (i % 2) * 11, 16, 9);
      });
      ctx.strokeStyle = '#e25555';
      ctx.beginPath();
      ctx.moveTo(px + pw - 60, py);
      ctx.lineTo(px + pw - 16, py);
      ctx.stroke();
      break;
    }
    case 'rack': {
      box(ctx, px + 5, py + 10, pw - 10, ph - 16, 48, '#3c4252', '#1d212b', 3);
      for (let row = 0; row < 6; row++) {
        ctx.fillStyle = '#2a2f3b';
        ctx.fillRect(px + 9, py - 2 + row * 7, pw - 18, 5);
        for (let i = 0; i < 3; i++) {
          const on = Math.sin(time * (2 + i) + row * 1.9 + f.x * 3 + f.y) > 0.1;
          dot(ctx, px + 13 + i * 6, py + 0.5 + row * 7, 1.6, on ? (row === 2 && i === 1 ? '#ffb347' : '#52e3a4') : '#1f5a45');
        }
      }
      break;
    }
    case 'console': {
      box(ctx, px + 4, py + 10, pw - 8, ph - 16, 22, '#4a5163', '#2a2f3b', 4);
      ctx.fillStyle = '#12151c';
      roundRect(ctx, cx - 30, py - 38, 60, 32, 4);
      ctx.fill();
      dot(ctx, cx, py - 22, 40, 'rgba(80, 220, 255, 0.07)');
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i === Math.floor(time * 2) % 4 ? '#7df9c8' : '#50dcff';
        ctx.fillRect(cx - 24, py - 33 + i * 6, 14 + ((i * 17 + Math.floor(time)) % 30), 2.5);
      }
      ctx.fillStyle = '#6b7385';
      roundRect(ctx, cx - 18, py - 1, 36, 8, 2);
      ctx.fill();
      break;
    }
    case 'reception': {
      box(ctx, px + 2, py + 6, pw - 4, ph - 10, 24, '#f6f3ee', '#3fa796', 6);
      ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('RRHH', cx, py + ph - 12);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d5d0c6';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(px + 20 + i * 14, py - 10 + i * 2, 20, 14);
        ctx.strokeRect(px + 20 + i * 14, py - 10 + i * 2, 20, 14);
      }
      dot(ctx, px + pw - 30, py - 4, 7, '#e0668a');
      dot(ctx, px + pw - 30, py - 4, 3, '#ffd76a');
      break;
    }
    case 'cabinet': {
      box(ctx, px + 3, py + 8, pw - 6, ph - 14, 36, '#b3bac6', '#8a919e', 3);
      for (let i = 0; i < 3; i++) {
        const x = px + 7 + i * ((pw - 14) / 3);
        ctx.fillStyle = '#7b8290';
        ctx.fillRect(x, py + 8, (pw - 14) / 3 - 3, 14);
        ctx.fillRect(x, py + 25, (pw - 14) / 3 - 3, 14);
        ctx.fillStyle = '#d7dbe2';
        ctx.fillRect(x + 12, py + 13, 14, 3);
        ctx.fillRect(x + 12, py + 30, 14, 3);
      }
      break;
    }
    case 'cooler': {
      box(ctx, px + 12, py + 16, 24, 22, 22, '#f2f5f8', '#cfd6de', 4);
      ctx.fillStyle = 'rgba(120, 195, 245, 0.85)';
      roundRect(ctx, cx - 8, py - 28, 16, 22, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(cx - 5, py - 24, 3, 12);
      dot(ctx, cx - 5, py + 24, 2, '#4f8cff');
      dot(ctx, cx + 5, py + 24, 2, '#e25555');
      break;
    }
    case 'printer': {
      box(ctx, px + 6, py + 10, pw - 12, ph - 18, 18, '#eceef2', '#bfc4cc', 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 18, py - 12, 36, 14);
      ctx.fillStyle = '#4a505e';
      ctx.fillRect(cx - 22, py + 6, 44, 4);
      dot(ctx, px + pw - 16, py + 26, 2, '#52e3a4');
      break;
    }
    case 'counter': {
      box(ctx, px, py + 4, pw, ph - 8, 24, '#f3eadb', '#8c6a4f', 3);
      ctx.fillStyle = '#30343f';
      roundRect(ctx, cx - 18, py - 44, 36, 34, 5);
      ctx.fill();
      ctx.fillStyle = '#4a505e';
      ctx.fillRect(cx - 12, py - 26, 24, 12);
      dot(ctx, cx + 10, py - 36, 2.2, Math.sin(time * 3) > 0 ? '#ff5d5d' : '#7a2d2d');
      ctx.fillStyle = '#c9ccd4';
      ctx.fillRect(cx - 2, py - 26, 4, 5);
      for (let i = 0; i < 3; i++) dot(ctx, cx + 40 + i * 13, py - 8, 5, '#ffffff');
      dot(ctx, px + 40, py - 8, 11, '#d98c4a');
      dot(ctx, px + 36, py - 12, 5, '#e25555');
      dot(ctx, px + 45, py - 11, 5, '#f2c14e');
      ctx.fillStyle = '#cfd6de';
      roundRect(ctx, px + pw - 60, py - 14, 40, 14, 4);
      ctx.fill();
      break;
    }
    case 'vending': {
      box(ctx, px + 5, py + 10, pw - 10, ph - 16, 50, '#dc5a5a', '#b53a3a', 4);
      ctx.fillStyle = '#20242e';
      ctx.fillRect(px + 9, py - 4, pw - 26, 30);
      for (let i = 0; i < 9; i++) dot(ctx, px + 13 + (i % 3) * 7, py + 1 + Math.floor(i / 3) * 9, 2.4, BOOKS[i % BOOKS.length]);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(px + pw - 14, py, 5, 10);
      break;
    }
    case 'roundtable': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 16, pw / 2 - 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a8f99';
      ctx.fillRect(cx - 4, cy - 12, 8, 28);
      ctx.fillStyle = '#c9ac80';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 12, pw / 2 - 6, ph / 2 - 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eedcbd';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 17, pw / 2 - 6, ph / 2 - 18, 0, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, cx - 14, cy - 18, 5, '#ffffff');
      dot(ctx, cx - 14, cy - 18, 3.3, '#6b4429');
      dot(ctx, cx + 16, cy - 14, 5, '#ffffff');
      dot(ctx, cx + 16, cy - 14, 3.3, '#6b4429');
      break;
    }
  }
}

export const INTERACT_ICON: Record<string, string> = { llm: '⚙️', hire: '🧑‍💼', tasks: '📋', coffee: '☕' };

export function wrapText(ctx: Ctx, text: string, maxWidth: number, maxLines = 5): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.replace(/\s+/g, ' ').split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{0,2}$/, '')}…`;
  }
  return lines;
}
