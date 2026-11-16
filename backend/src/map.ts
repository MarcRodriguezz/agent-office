export type Cell = [number, number];

export type RoomKind = 'boss' | 'meeting' | 'server' | 'hr' | 'work' | 'cafe' | 'office' | 'lounge';

export interface RoomDef {
  id: string;
  kind: RoomKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  teamId: string | null;
  agentId: string | null;
}

export interface Layout {
  w: number;
  h: number;
  rooms: RoomDef[];
  doors: Cell[];
}

export interface Furniture {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  block: boolean;
  interact?: 'llm' | 'hire' | 'tasks' | 'coffee' | 'offices';
  label?: string;
  spot?: Cell;
}

export interface Desk {
  seat: Cell;
  visitor: Cell;
  roomId: string;
  teamId: string | null;
  agentId: string | null;
}

interface KindInfo {
  label: string;
  floor: string;
  min: [number, number];
  size: [number, number];
  prefix: string;
  unique?: boolean;
  required?: boolean;
}

export const KINDS: Record<RoomKind, KindInfo> = {
  boss: { label: 'Tu despacho', floor: 'wood', min: [7, 6], size: [10, 8], prefix: 'boss', unique: true, required: true },
  hr: { label: 'RRHH y entrada', floor: 'tile', min: [8, 6], size: [11, 8], prefix: 'hr', unique: true, required: true },
  meeting: { label: 'Sala de reuniones', floor: 'carpet', min: [8, 6], size: [10, 8], prefix: 'meet', required: true },
  work: { label: 'Zona de departamento', floor: 'office', min: [7, 5], size: [16, 9], prefix: 'open' },
  office: { label: 'Despacho', floor: 'wood', min: [5, 5], size: [6, 6], prefix: 'office' },
  cafe: { label: 'Cafetería', floor: 'cafe', min: [8, 6], size: [11, 9], prefix: 'cafe' },
  lounge: { label: 'Sala de descanso', floor: 'carpet', min: [5, 5], size: [7, 6], prefix: 'lounge' },
  server: { label: 'Sala de servidores', floor: 'tech', min: [6, 4], size: [8, 6], prefix: 'server' },
};

const LIMITS = { minW: 30, maxW: 84, minH: 20, maxH: 52, rooms: 32 };

export const DEFAULT_LAYOUT: Layout = {
  w: 44,
  h: 26,
  rooms: [
    { id: 'boss', kind: 'boss', name: 'TU DESPACHO', x: 1, y: 1, w: 10, h: 8, teamId: null, agentId: null },
    { id: 'meeting', kind: 'meeting', name: 'SALA DE REUNIONES', x: 12, y: 1, w: 10, h: 8, teamId: null, agentId: null },
    { id: 'server', kind: 'server', name: 'SERVIDORES · LLM', x: 23, y: 1, w: 8, h: 8, teamId: null, agentId: null },
    { id: 'hr', kind: 'hr', name: 'RRHH · CONTRATACIÓN', x: 32, y: 1, w: 11, h: 8, teamId: null, agentId: null },
    { id: 'open', kind: 'work', name: 'ZONA DE TRABAJO', x: 1, y: 10, w: 30, h: 15, teamId: null, agentId: null },
    { id: 'cafe', kind: 'cafe', name: 'CAFETERÍA', x: 32, y: 10, w: 11, h: 15, teamId: null, agentId: null },
  ],
  doors: [[5, 9], [6, 9], [16, 9], [17, 9], [26, 9], [27, 9], [33, 9], [34, 9], [31, 16], [31, 17], [31, 18]],
};

interface Compiled {
  layout: Layout;
  w: number;
  h: number;
  wall: Uint8Array;
  blocked: Uint8Array;
  roomAt: Int16Array;
  furniture: Furniture[];
  desks: Desk[];
  bossSeat: Cell;
  bossVisitors: Cell[];
  meetingSeats: Cell[];
  entrance: Cell;
  coffee: Cell[];
  hangouts: Cell[];
  keys: { room: number; cell: Cell }[];
}

const SIDES: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function compile(layout: Layout): Compiled {
  const { w: W, h: H } = layout;
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const roomAt = new Int16Array(W * H).fill(-1);
  const wall = new Uint8Array(W * H);
  const blocked = new Uint8Array(W * H);
  const reserved = new Uint8Array(W * H);
  const nearDoor = new Uint8Array(W * H);

  layout.rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomAt[idx(x, y)] = i;
  });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (roomAt[idx(x, y)] >= 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy) && roomAt[idx(x + dx, y + dy)] >= 0) near = true;
      }
      wall[idx(x, y)] = near ? 1 : 2;
    }
  }
  const room = (x: number, y: number) => (inside(x, y) ? roomAt[idx(x, y)] : -1);
  const doors: Cell[] = [];
  for (const [x, y] of layout.doors) {
    if (!inside(x, y) || wall[idx(x, y)] !== 1 || doors.some((d) => d[0] === x && d[1] === y)) continue;
    const across = (room(x - 1, y) >= 0 && room(x + 1, y) >= 0) || (room(x, y - 1) >= 0 && room(x, y + 1) >= 0);
    if (!across) continue;
    wall[idx(x, y)] = 0;
    doors.push([x, y]);
    for (const [dx, dy] of SIDES) if (inside(x + dx, y + dy)) nearDoor[idx(x + dx, y + dy)] = 1;
  }

  const furniture: Furniture[] = [];
  const desks: Desk[] = [];
  const keys: Compiled['keys'] = [];
  const bossVisitors: Cell[] = [];
  const meetingSeats: Cell[] = [];
  const coffee: Cell[] = [];
  const hangouts: Cell[] = [];
  let bossSeat: Cell = [1, 1];
  let entrance: Cell = [1, 1];
  const seen = new Set<RoomKind>();

  layout.rooms.forEach((r, ri) => {
    const first = !seen.has(r.kind);
    seen.add(r.kind);
    const p = first ? KINDS[r.kind].prefix : r.id;
    const { x, y, w, h } = r;
    const fits = (fx: number, fy: number, fw: number, fh: number) =>
      fw > 0 && fh > 0 && fx >= x && fy >= y && fx + fw <= x + w && fy + fh <= y + h;
    const free = (fx: number, fy: number, fw: number, fh: number, decor: boolean) => {
      for (let cy = fy; cy < fy + fh; cy++) {
        for (let cx = fx; cx < fx + fw; cx++) {
          const i = idx(cx, cy);
          if (blocked[i] || reserved[i] || (decor && nearDoor[i])) return false;
        }
      }
      return true;
    };
    const put = (id: string, type: string, fx: number, fy: number, fw: number, fh: number, extra: Partial<Furniture> = {}, decor = false) => {
      const block = extra.block ?? true;
      if (!fits(fx, fy, fw, fh) || (block && !free(fx, fy, fw, fh, decor))) return false;
      furniture.push({ id, type, x: fx, y: fy, w: fw, h: fh, block, ...extra });
      if (block) for (let cy = fy; cy < fy + fh; cy++) for (let cx = fx; cx < fx + fw; cx++) blocked[idx(cx, cy)] = 1;
      if (extra.spot) keep(extra.spot);
      return true;
    };
    const keep = (cell: Cell) => {
      if (!fits(cell[0], cell[1], 1, 1) || blocked[idx(cell[0], cell[1])]) return false;
      reserved[idx(cell[0], cell[1])] = 1;
      keys.push({ room: ri, cell });
      return true;
    };
    const decor = (id: string, type: string, fx: number, fy: number, fw = 1, fh = 1) => put(`${p}-${id}`, type, fx, fy, fw, fh, {}, true);
    const desk = (dx: number, dy: number, type: string, extra: Partial<Furniture> = {}) => {
      const seat: Cell = [dx + 1, dy - 1];
      const visitor: Cell = [dx + 1, dy + 1];
      if (!fits(dx, dy - 1, 3, 3) || !free(dx, dy - 1, 3, 3, false)) return false;
      put(extra.id ?? `desk-${desks.length}`, type, dx, dy, 3, 1, extra);
      keep(seat);
      keep(visitor);
      return { seat, visitor };
    };

    if (r.kind === 'boss') {
      const made = desk(x + 3, y + 2, 'bossdesk', { id: first ? 'boss-desk' : `${p}-desk`, interact: 'llm', label: 'Tu ordenador · Configurar LLM', spot: [x + 4, y + 1] });
      if (made) bossSeat = made.seat;
      for (const c of [[x + 4, y + 3], [x + 3, y + 3], [x + 5, y + 3], [x + 2, y + 4], [x + 6, y + 4]] as Cell[]) if (keep(c)) bossVisitors.push(c);
      put(`${p}-rug`, 'rug', x + 2, y + 4, 5, Math.min(3, h - 5), { block: false });
      decor('plant', 'plant', x, y);
      decor('shelf', 'bookshelf', x + w - 3, y, 3, 1);
      if (h >= 8) decor('sofa', 'sofa', x, y + 4, 1, 3);
      decor('plant2', 'plant', x + w - 1, y + h - 1);
    } else if (r.kind === 'meeting') {
      const tw = Math.min(6, w - 4);
      const tx = x + Math.floor((w - tw) / 2);
      const ty = y + Math.floor((h - 2) / 2);
      const bx = x + Math.floor((w - 4) / 2);
      put(`${p}-board`, 'whiteboard', bx, y, 4, 1, { interact: 'tasks', label: 'Tablón de tareas', spot: [bx + 1, y + 1] });
      put(`${p}-table`, 'table', tx, ty, tw, 2);
      const seats: Cell[] = [];
      const cols = Array.from({ length: tw }, (_, i) => i).filter((i) => i % 2 === 0).sort((a, b) => Math.abs(a - tw / 2 + 1) - Math.abs(b - tw / 2 + 1));
      for (const col of cols) seats.push([tx + col, ty - 1], [tx + col, ty + 2]);
      seats.push([tx - 1, ty + 1], [tx + tw, ty], [tx - 1, ty], [tx + tw, ty + 1]);
      if (!meetingSeats.length) for (const c of seats) if (keep(c)) meetingSeats.push(c);
      decor('plant', 'plant', x + w - 1, y);
    } else if (r.kind === 'server') {
      const cx = x + Math.floor((w - 2) / 2);
      put(`${p}-console`, 'console', cx, y, 2, 1, { interact: 'llm', label: 'Consola · Proveedores LLM', spot: [cx, y + 1] });
      [[x, y], [x + 1, y], [x + w - 2, y], [x + w - 1, y], [x, y + 4], [x + w - 1, y + 4]].forEach(([fx, fy], i) => decor(`rack${i}`, 'rack', fx, fy));
    } else if (r.kind === 'hr') {
      put(first ? 'hr-desk' : `${p}-desk`, 'reception', x + 3, y + 2, 4, 1, { interact: 'hire', label: 'RRHH · Contratar agente', spot: [x + 4, y + 3] });
      put(first ? 'link-globe' : `${p}-globe`, 'globe', x + w - 2, y + 5, 1, 1, { interact: 'offices', label: 'Centralita · Otras oficinas', spot: [x + w - 3, y + 5] });
      if (first) {
        entrance = [x + 4, y + h - 1];
        keep(entrance);
      }
      decor('plant', 'plant', x, y);
      decor('cabinet', 'cabinet', x + w - 3, y, 3, 1);
      if (h >= 8) decor('bench', 'sofa', x, y + 4, 1, 3);
    } else if (r.kind === 'work') {
      for (let dy = y + 3; dy + 1 < y + h; dy += 6) {
        for (let dx = x + 2; dx + 3 < x + w; dx += 7) {
          const made = desk(dx, dy, 'desk');
          if (made) desks.push({ ...made, roomId: r.id, teamId: r.teamId, agentId: null });
        }
      }
      if (w >= 22 && h >= 11) put(`${p}-rug`, 'rug2', x + 11, y + 5, 9, 2, { block: false });
      decor('plant1', 'plant', x, y);
      decor('plant2', 'plant', x + w - 1, y + h - 1);
      decor('plant3', 'plant', x + w - 1, y);
      if (w >= 12) {
        decor('cooler', 'cooler', x + w - 1, y + 2);
        decor('printer', 'printer', x, y + h - 2, 2, 1);
      }
    } else if (r.kind === 'office') {
      const made = desk(x + 1, y + 2, 'desk');
      if (made) desks.push({ ...made, roomId: r.id, teamId: r.teamId, agentId: r.agentId });
      decor('plant', 'plant', x + w - 1, y);
      decor('shelf', 'bookshelf', x + w - 3, y + h - 1, 3, 1);
    } else if (r.kind === 'cafe') {
      const cw = Math.min(5, w - 3);
      const cx = x + w - cw;
      put(first ? 'cafe-counter' : `${p}-counter`, 'counter', cx, y, cw, 1, { interact: 'coffee', label: 'Máquina de café', spot: [cx + Math.floor(cw / 2), y + 1] });
      for (let i = 0; i < cw; i += 2) {
        const c: Cell = [cx + i, y + 1];
        if (keep(c) || reserved[idx(c[0], c[1])]) coffee.push(c);
      }
      decor('vending', 'vending', x, y);
      if (h >= 9) decor('table1', 'roundtable', x + 3, y + 6, 2, 2);
      if (h >= 13) decor('table2', 'roundtable', x + w - 4, y + 10, 2, 2);
      if (h >= 8) decor('sofa', 'sofa', x + w - 1, y + 4, 1, 3);
      decor('plant', 'plant', x + w - 1, y + h - 1);
    } else {
      decor('sofa', 'sofa', x, y + 1, 1, 3);
      put(`${p}-rug`, 'rug2', x + 1, y + 1, Math.min(5, w - 2), Math.min(3, h - 2), { block: false });
      if (w >= 7 && h >= 6) decor('table', 'roundtable', x + w - 3, y + h - 3, 2, 2);
      decor('plant', 'plant', x + w - 1, y);
      decor('plant2', 'plant', x, y + h - 1);
    }
  });

  layout.rooms.forEach((r, ri) => {
    const open: Cell[] = [];
    for (let cy = r.y; cy < r.y + r.h; cy++) {
      for (let cx = r.x; cx < r.x + r.w; cx++) {
        const i = idx(cx, cy);
        if (!blocked[i] && !reserved[i] && !nearDoor[i]) open.push([cx, cy]);
      }
    }
    if (!keys.some((k) => k.room === ri) && open.length) keys.push({ room: ri, cell: open[0] });
    const count = r.kind === 'cafe' ? 4 : r.kind === 'work' || r.kind === 'lounge' ? 3 : 0;
    for (let k = 0; k < count && open.length; k++) hangouts.push(open[Math.floor((open.length * (k * 2 + 1)) / (count * 2))]);
  });
  if (!coffee.length) coffee.push(...(hangouts.length ? hangouts : [entrance]));
  if (!hangouts.length) hangouts.push(entrance);
  if (!meetingSeats.length) meetingSeats.push(entrance);
  if (!bossVisitors.length) bossVisitors.push(entrance);

  return {
    layout: { ...layout, doors }, w: W, h: H, wall, blocked, roomAt, furniture, desks, bossSeat, bossVisitors, meetingSeats, entrance, coffee,
    hangouts, keys,
  };
}

function reach(c: Compiled): Uint8Array {
  const seen = new Uint8Array(c.w * c.h);
  const start = c.bossSeat[1] * c.w + c.bossSeat[0];
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % c.w;
    const cy = (cur - cx) / c.w;
    for (const [dx, dy] of SIDES) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h) continue;
      const n = ny * c.w + nx;
      if (seen[n] || c.wall[n] || c.blocked[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

function isolated(c: Compiled): number[] {
  const seen = reach(c);
  const bad = new Set<number>();
  for (const k of c.keys) if (!seen[k.cell[1] * c.w + k.cell[0]]) bad.add(k.room);
  return [...bad];
}

function connect(layout: Layout): Compiled {
  let c = compile(layout);
  for (let round = 0; round < layout.rooms.length + 2; round++) {
    const bad = isolated(c);
    if (!bad.length) return c;
    const seen = reach(c);
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < c.w && y < c.h ? y * c.w + x : -1);
    const open = (i: number) => i >= 0 && c.roomAt[i] >= 0 && !c.blocked[i];
    let added = false;
    for (const ri of bad) {
      const runs: Cell[][] = [];
      for (let y = 1; y < c.h - 1; y++) {
        for (let x = 1; x < c.w - 1; x++) {
          if (c.wall[at(x, y)] !== 1) continue;
          for (const [dx, dy] of [[1, 0], [0, 1]] as Cell[]) {
            const a = at(x - dx, y - dy);
            const b = at(x + dx, y + dy);
            if (!open(a) || !open(b)) continue;
            const mine = c.roomAt[a] === ri ? a : c.roomAt[b] === ri ? b : -1;
            const other = mine === a ? b : a;
            if (mine < 0 || c.roomAt[other] === ri || !seen[other]) continue;
            const run = runs.find((r) => {
              const lastCell = r[r.length - 1];
              return lastCell[0] + dy === x && lastCell[1] + dx === y;
            });
            if (run) run.push([x, y]);
            else runs.push([[x, y]]);
          }
        }
      }
      const best = runs.sort((p, q) => q.length - p.length)[0];
      if (!best) continue;
      const mid = Math.floor((best.length - 1) / 2);
      layout = { ...layout, doors: [...c.layout.doors, best[mid], ...(best.length > 1 ? [best[mid + 1]] : [])] };
      added = true;
      break;
    }
    if (!added) break;
    c = compile(layout);
  }
  return c;
}

function clean(input: any): Layout {
  const int = (v: unknown) => Math.round(Number(v) || 0);
  const rooms: RoomDef[] = (Array.isArray(input?.rooms) ? input.rooms : []).slice(0, LIMITS.rooms + 1).map((r: any, i: number) => ({
    id: String(r?.id || `sala-${i}`).slice(0, 40),
    kind: (r?.kind in KINDS ? r.kind : 'lounge') as RoomKind,
    name: String(r?.name ?? '').trim().slice(0, 28).toUpperCase() || KINDS[(r?.kind in KINDS ? r.kind : 'lounge') as RoomKind].label.toUpperCase(),
    x: int(r?.x), y: int(r?.y), w: int(r?.w), h: int(r?.h),
    teamId: r?.teamId ? String(r.teamId) : null,
    agentId: r?.agentId ? String(r.agentId) : null,
  }));
  const doors: Cell[] = (Array.isArray(input?.doors) ? input.doors : []).slice(0, 200)
    .filter((d: any) => Array.isArray(d)).map((d: any) => [int(d[0]), int(d[1])] as Cell);
  return { w: int(input?.w), h: int(input?.h), rooms, doors };
}

function check(layout: Layout, people: number): Compiled {
  if (layout.w < LIMITS.minW || layout.w > LIMITS.maxW || layout.h < LIMITS.minH || layout.h > LIMITS.maxH) {
    throw new Error(`La planta debe medir entre ${LIMITS.minW}×${LIMITS.minH} y ${LIMITS.maxW}×${LIMITS.maxH} casillas.`);
  }
  if (layout.rooms.length > LIMITS.rooms) throw new Error(`Como mucho caben ${LIMITS.rooms} salas.`);
  const ids = new Set<string>();
  for (const r of layout.rooms) {
    const info = KINDS[r.kind];
    if (ids.has(r.id)) throw new Error('Hay dos salas con el mismo identificador.');
    ids.add(r.id);
    if (r.w < info.min[0] || r.h < info.min[1]) throw new Error(`«${r.name}» es demasiado pequeña: necesita al menos ${info.min[0]}×${info.min[1]} casillas.`);
    if (r.x < 1 || r.y < 1 || r.x + r.w > layout.w - 1 || r.y + r.h > layout.h - 1) throw new Error(`«${r.name}» se sale de la planta.`);
  }
  for (const [kind, info] of Object.entries(KINDS) as [RoomKind, KindInfo][]) {
    const count = layout.rooms.filter((r) => r.kind === kind).length;
    if (info.required && !count) throw new Error(`La oficina necesita una sala de tipo «${info.label}».`);
    if (info.unique && count > 1) throw new Error(`Solo puede haber una sala de tipo «${info.label}».`);
  }
  for (let i = 0; i < layout.rooms.length; i++) {
    for (let j = i + 1; j < layout.rooms.length; j++) {
      const a = layout.rooms[i];
      const b = layout.rooms[j];
      if (a.x < b.x + b.w + 1 && b.x < a.x + a.w + 1 && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1) {
        throw new Error(`«${a.name}» y «${b.name}» se pisan: deja al menos un muro entre ellas.`);
      }
    }
  }
  const c = connect(layout);
  const bad = isolated(c);
  if (bad.length) throw new Error(`«${layout.rooms[bad[0]].name}» queda aislada: pégala a otra sala para que se pueda abrir una puerta.`);
  if (c.desks.length < people) throw new Error(`Hacen falta ${people} mesas y solo caben ${c.desks.length}: amplía una zona de departamento o añade despachos.`);
  return c;
}

export let map: Compiled = connect(DEFAULT_LAYOUT);

export function loadLayout(saved: unknown) {
  if (!saved) return;
  try {
    map = check(clean(saved), 0);
  } catch (err) {
    console.error('distribución guardada no válida, se usa la de serie:', (err as Error).message);
  }
}

export function setLayout(input: unknown, people: number): Layout {
  map = check(clean(input), people);
  return map.layout;
}

export const deskSeat = (i: number): Cell => map.desks[i]?.seat ?? map.entrance;
export const deskVisitor = (i: number): Cell => map.desks[i]?.visitor ?? map.entrance;

export const walkable = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < map.w && y < map.h && !map.wall[y * map.w + x] && !map.blocked[y * map.w + x];

export const mapData = () => ({
  w: map.w,
  h: map.h,
  walls: Array.from(map.wall),
  rooms: map.layout.rooms.map((r) => ({ ...r, floor: KINDS[r.kind].floor })),
  doors: map.layout.doors,
  furniture: map.furniture,
  bossSeat: map.bossSeat,
  desks: map.desks,
  kinds: KINDS,
  limits: LIMITS,
});

export function findPath(from: Cell, to: Cell): Cell[] | null {
  const W = map.w;
  if (!walkable(to[0], to[1])) return null;
  if (from[0] === to[0] && from[1] === to[1]) return [];
  const prev = new Int32Array(W * map.h).fill(-1);
  const start = from[1] * W + from[0];
  const goal = to[1] * W + to[0];
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy] of SIDES) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      const n = ny * W + nx;
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (prev[goal] === -1) return null;
  const path: Cell[] = [];
  for (let cur = goal; cur !== start; cur = prev[cur]) path.push([cur % W, Math.floor(cur / W)]);
  return path.reverse();
}

export function nearestWalkable(x: number, y: number, exclude?: Cell): Cell | null {
  for (let r = 0; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = x + dx;
        const cy = y + dy;
        if (exclude && exclude[0] === cx && exclude[1] === cy) continue;
        if (walkable(cx, cy)) return [cx, cy];
      }
    }
  }
  return null;
}
