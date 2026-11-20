import { saveLayout } from '../net';
import { getState, setState } from '../store';
import type { Layout, MapData, RoomDef, RoomKind } from '../types';
import { T } from './draw';
import { t } from '../i18n';

type Rect = { x: number; y: number; w: number; h: number };
type Cell = [number, number];

interface Drag {
  mode: 'move' | 'resize' | 'pan';
  room?: RoomDef;
  rect: Rect;
  anchor: Cell;
  from: Cell;
  screen: Cell;
  cam: Cell;
  moved: boolean;
}

const ACCENT = '#e8590c';
const history: Layout[] = [];

export const layoutOf = (map: MapData): Layout => ({
  w: map.w,
  h: map.h,
  rooms: map.rooms.map(({ id, kind, name, x, y, w, h, teamId, agentId }) => ({ id, kind, name, x, y, w, h, teamId, agentId })),
  doors: map.doors,
});

export async function commit(next: Layout, quiet = false): Promise<boolean> {
  const map = getState().map;
  if (!map) return false;
  const before = layoutOf(map);
  const ok = await saveLayout(next, quiet);
  if (ok) {
    history.push(before);
    if (history.length > 40) history.shift();
  }
  return ok;
}

export const canUndo = () => history.length > 0;

export async function undo() {
  const previous = history.pop();
  if (previous) await saveLayout(previous);
}

function fits(map: MapData, id: string | null, kind: RoomKind, r: Rect): boolean {
  const [minW, minH] = map.kinds[kind].min;
  if (r.w < minW || r.h < minH || r.x < 1 || r.y < 1 || r.x + r.w > map.w - 1 || r.y + r.h > map.h - 1) return false;
  return !map.rooms.some((o) => o.id !== id && r.x < o.x + o.w + 1 && o.x < r.x + r.w + 1 && r.y < o.y + o.h + 1 && o.y < r.y + r.h + 1);
}

const touches = (a: Rect, b: Rect) => {
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  return ((a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) && overlapY >= 3) || ((a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) && overlapX >= 3);
};

function findSpot(map: MapData, kind: RoomKind, w: number, h: number): Cell | null {
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (let y = 1; y + h <= map.h - 1; y++) {
    for (let x = 1; x + w <= map.w - 1; x++) {
      const rect = { x, y, w, h };
      if (!fits(map, null, kind, rect) || !map.rooms.some((o) => touches(rect, o))) continue;
      const score = Math.hypot(x + w / 2 - map.w / 2, y + h / 2 - map.h / 2);
      if (score < bestScore) {
        best = [x, y];
        bestScore = score;
      }
    }
  }
  return best;
}

export async function addRoom(kind: RoomKind, extra: Partial<RoomDef> = {}): Promise<boolean> {
  const map = getState().map;
  if (!map) return false;
  const base = layoutOf(map);
  const [w, h] = map.kinds[kind].size;
  const room: RoomDef = {
    id: `sala-${Date.now().toString(36)}`, kind, name: map.kinds[kind].label, x: 1, y: 1, w, h, teamId: null, agentId: null, ...extra,
  };
  const spot = findSpot(map, kind, w, h);
  const tries: Layout[] = [];
  if (spot) tries.push({ ...base, rooms: [...base.rooms, { ...room, x: spot[0], y: spot[1] }] });
  for (const row of [1, ...map.rooms.map((r) => r.y)]) {
    if (map.w + w + 1 <= map.limits.maxW && row + h <= map.h - 1) tries.push({ ...base, w: map.w + w + 1, rooms: [...base.rooms, { ...room, x: map.w, y: row }] });
  }
  for (const col of [1, ...map.rooms.map((r) => r.x)]) {
    if (map.h + h + 1 <= map.limits.maxH && col + w <= map.w - 1) tries.push({ ...base, h: map.h + h + 1, rooms: [...base.rooms, { ...room, x: col, y: map.h }] });
  }
  for (let i = 0; i < tries.length; i++) {
    if (await commit(tries[i], i < tries.length - 1)) {
      setState({ roomId: room.id });
      return true;
    }
  }
  return false;
}

export function patchRoom(id: string, patch: Partial<RoomDef>) {
  const map = getState().map;
  if (!map) return Promise.resolve(false);
  const base = layoutOf(map);
  return commit({ ...base, rooms: base.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

export async function removeRoom(id: string) {
  const map = getState().map;
  if (!map) return;
  const base = layoutOf(map);
  if (await commit({ ...base, rooms: base.rooms.filter((r) => r.id !== id) })) setState({ roomId: null });
}

export function resizePlant(dw: number, dh: number) {
  const map = getState().map;
  if (!map) return Promise.resolve(false);
  return commit({ ...layoutOf(map), w: map.w + dw, h: map.h + dh });
}

export function createArchitect(canvas: HTMLCanvasElement, toWorld: (sx: number, sy: number) => Cell, zoom: () => number) {
  let drag: Drag | null = null;
  let hover: Cell | null = null;
  const cam: { at: Cell | null } = { at: null };

  const cellAt = (e: MouseEvent): Cell => {
    const rect = canvas.getBoundingClientRect();
    const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    return [Math.floor(wx / T), Math.floor(wy / T)];
  };
  const roomAt = (map: MapData, [cx, cy]: Cell) => map.rooms.find((r) => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h);
  const doorSpot = (map: MapData, [cx, cy]: Cell) => {
    if (cx < 1 || cy < 1 || cx >= map.w - 1 || cy >= map.h - 1 || roomAt(map, [cx, cy])) return false;
    const pair = (a: Cell, b: Cell) => !!roomAt(map, a) && !!roomAt(map, b);
    return pair([cx - 1, cy], [cx + 1, cy]) || pair([cx, cy - 1], [cx, cy + 1]);
  };
  const cornerAt = (room: RoomDef, e: MouseEvent): Cell | null => {
    const rect = canvas.getBoundingClientRect();
    const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const reach = 14 / zoom();
    for (const corner of [[0, 0], [1, 0], [0, 1], [1, 1]] as Cell[]) {
      const px = (room.x + corner[0] * room.w) * T;
      const py = (room.y + corner[1] * room.h) * T;
      if (Math.abs(wx - px) < reach && Math.abs(wy - py) < reach) return corner;
    }
    return null;
  };

  const onDown = (e: MouseEvent) => {
    const state = getState();
    const map = state.map;
    if (!state.architect || !map || e.button !== 0) return;
    const cell = cellAt(e);
    const selected = map.rooms.find((r) => r.id === state.roomId);
    const corner = selected && cornerAt(selected, e);
    const base = { from: cell, screen: [e.clientX, e.clientY] as Cell, cam: cam.at ?? [0, 0], moved: false };
    if (selected && corner) {
      const anchor: Cell = [corner[0] ? selected.x : selected.x + selected.w - 1, corner[1] ? selected.y : selected.y + selected.h - 1];
      drag = { ...base, mode: 'resize', room: selected, rect: { ...selected }, anchor };
      return;
    }
    const room = roomAt(map, cell);
    if (room) {
      setState({ roomId: room.id });
      drag = { ...base, mode: 'move', room, rect: { ...room }, anchor: [cell[0] - room.x, cell[1] - room.y] };
    } else {
      drag = { ...base, mode: 'pan', rect: { x: 0, y: 0, w: 0, h: 0 }, anchor: cell };
    }
  };

  const onMove = (e: MouseEvent) => {
    const state = getState();
    const map = state.map;
    if (!state.architect || !map) return;
    const cell = cellAt(e);
    hover = cell;
    if (!drag) {
      const selected = map.rooms.find((r) => r.id === state.roomId);
      canvas.style.cursor = selected && cornerAt(selected, e) ? 'nwse-resize' : roomAt(map, cell) ? 'move' : doorSpot(map, cell) ? 'pointer' : 'grab';
      return;
    }
    if (Math.abs(e.clientX - drag.screen[0]) + Math.abs(e.clientY - drag.screen[1]) > 4) drag.moved = true;
    if (drag.mode === 'pan') {
      cam.at = [drag.cam[0] - (e.clientX - drag.screen[0]) / zoom(), drag.cam[1] - (e.clientY - drag.screen[1]) / zoom()];
      canvas.style.cursor = 'grabbing';
    } else if (drag.mode === 'move' && drag.room) {
      drag.rect = { ...drag.rect, x: cell[0] - drag.anchor[0], y: cell[1] - drag.anchor[1] };
    } else if (drag.room) {
      const x0 = Math.min(cell[0], drag.anchor[0]);
      const y0 = Math.min(cell[1], drag.anchor[1]);
      drag.rect = { x: x0, y: y0, w: Math.abs(cell[0] - drag.anchor[0]) + 1, h: Math.abs(cell[1] - drag.anchor[1]) + 1 };
    }
  };

  const onUp = (e: MouseEvent) => {
    const state = getState();
    const map = state.map;
    const done = drag;
    drag = null;
    if (!state.architect || !map || !done) return;
    const base = layoutOf(map);
    if (!done.moved) {
      const cell = cellAt(e);
      if (done.mode === 'pan') {
        if (doorSpot(map, cell)) {
          const has = base.doors.some((d) => d[0] === cell[0] && d[1] === cell[1]);
          void commit({ ...base, doors: has ? base.doors.filter((d) => d[0] !== cell[0] || d[1] !== cell[1]) : [...base.doors, cell] });
        } else {
          setState({ roomId: null });
        }
      }
      return;
    }
    if (done.mode === 'pan' || !done.room) return;
    const { room, rect } = done;
    if (rect.x === room.x && rect.y === room.y && rect.w === room.w && rect.h === room.h) return;
    if (!fits(map, room.id, room.kind, rect)) return;
    void commit({ ...base, rooms: base.rooms.map((r) => (r.id === room.id ? { ...r, ...rect } : r)) });
  };

  const draw = (ctx: CanvasRenderingContext2D, map: MapData, font: string) => {
    const state = getState();
    const z = zoom();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([10 / z, 8 / z]);
    ctx.strokeRect(T, T, (map.w - 2) * T, (map.h - 2) * T);
    ctx.setLineDash([]);

    for (const [dx, dy] of map.doors) {
      ctx.fillStyle = 'rgba(232, 89, 12, 0.55)';
      ctx.fillRect(dx * T + 6, dy * T + 6, T - 12, T - 12);
    }
    if (hover && !drag && doorSpot(map, hover)) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3 / z;
      ctx.strokeRect(hover[0] * T + 3, hover[1] * T + 3, T - 6, T - 6);
    }

    for (const room of map.rooms) {
      const selected = room.id === state.roomId;
      const moving = drag && drag.room?.id === room.id && drag.moved;
      ctx.strokeStyle = selected ? ACCENT : 'rgba(20, 20, 20, 0.75)';
      ctx.lineWidth = (selected ? 4 : 2) / z;
      ctx.globalAlpha = moving ? 0.35 : 1;
      ctx.strokeRect(room.x * T, room.y * T, room.w * T, room.h * T);
      ctx.globalAlpha = 1;
      const desks = map.desks.filter((d) => d.roomId === room.id).length;
      const label = `${room.name} · ${room.w}×${room.h}${desks ? ` · ${desks} ${desks === 1 ? t('mesa') : t('mesas')}` : ''}`;
      ctx.font = `600 ${13 / Math.min(1, z)}px ${font}`;
      const w = ctx.measureText(label).width + 16 / Math.min(1, z);
      const h = 24 / Math.min(1, z);
      const max = room.w * T;
      ctx.save();
      ctx.beginPath();
      ctx.rect(room.x * T, room.y * T - h, max, h);
      ctx.clip();
      ctx.fillStyle = selected ? ACCENT : '#1c1b19';
      ctx.fillRect(room.x * T, room.y * T - h, Math.min(w, max), h);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(w > max ? room.name : label, room.x * T + 8 / Math.min(1, z), room.y * T - h / 2);
      ctx.restore();
      if (selected && !moving) {
        const s = 12 / z;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 3 / z;
        for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const px = (room.x + cx * room.w) * T;
          const py = (room.y + cy * room.h) * T;
          ctx.fillRect(px - s / 2, py - s / 2, s, s);
          ctx.strokeRect(px - s / 2, py - s / 2, s, s);
        }
      }
    }

    if (drag && drag.room && drag.moved) {
      const ok = fits(map, drag.room.id, drag.room.kind, drag.rect);
      ctx.fillStyle = ok ? 'rgba(47, 163, 122, 0.3)' : 'rgba(217, 72, 15, 0.3)';
      ctx.strokeStyle = ok ? '#2fa37a' : '#d9480f';
      ctx.lineWidth = 4 / z;
      ctx.fillRect(drag.rect.x * T, drag.rect.y * T, drag.rect.w * T, drag.rect.h * T);
      ctx.strokeRect(drag.rect.x * T, drag.rect.y * T, drag.rect.w * T, drag.rect.h * T);
      ctx.font = `700 ${15 / Math.min(1, z)}px ${font}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${drag.rect.w}×${drag.rect.h}`, drag.rect.x * T + 10, drag.rect.y * T + 26 / Math.min(1, z));
    }
    ctx.restore();
  };

  return { onDown, onMove, onUp, draw, cam };
}
