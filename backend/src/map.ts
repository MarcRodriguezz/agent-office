export const W = 44;
export const H = 26;

export type Cell = [number, number];

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
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

const wall = new Uint8Array(W * H);
const blocked = new Uint8Array(W * H);
const idx = (x: number, y: number) => y * W + x;

const wallH = (y: number, x1: number, x2: number) => {
  for (let x = x1; x <= x2; x++) wall[idx(x, y)] = 1;
};
const wallV = (x: number, y1: number, y2: number) => {
  for (let y = y1; y <= y2; y++) wall[idx(x, y)] = 1;
};
const door = (x: number, y: number) => {
  wall[idx(x, y)] = 0;
};

wallH(0, 0, W - 1);
wallH(H - 1, 0, W - 1);
wallV(0, 0, H - 1);
wallV(W - 1, 0, H - 1);
wallH(9, 0, W - 1);
wallV(11, 0, 9);
wallV(22, 0, 9);
wallV(31, 0, H - 1);
[[5, 9], [6, 9], [16, 9], [17, 9], [26, 9], [27, 9], [36, 9], [37, 9], [31, 16], [31, 17], [31, 18]]
  .forEach(([x, y]) => door(x, y));

export const rooms: Room[] = [
  { id: 'boss', name: 'TU DESPACHO', x: 1, y: 1, w: 10, h: 8, floor: 'wood' },
  { id: 'meeting', name: 'SALA DE REUNIONES', x: 12, y: 1, w: 10, h: 8, floor: 'carpet' },
  { id: 'server', name: 'SERVIDORES · LLM', x: 23, y: 1, w: 8, h: 8, floor: 'tech' },
  { id: 'hr', name: 'RRHH · CONTRATACIÓN', x: 32, y: 1, w: 11, h: 8, floor: 'tile' },
  { id: 'open', name: 'ZONA DE TRABAJO', x: 1, y: 10, w: 30, h: 15, floor: 'office' },
  { id: 'cafe', name: 'CAFETERÍA', x: 32, y: 10, w: 11, h: 15, floor: 'cafe' },
];

export const DESK_COUNT = 8;
const deskOrigin = (i: number): Cell => [3 + (i % 4) * 7, i < 4 ? 13 : 19];
export const deskSeat = (i: number): Cell => [deskOrigin(i)[0] + 1, deskOrigin(i)[1] - 1];
export const deskVisitor = (i: number): Cell => [deskOrigin(i)[0] + 1, deskOrigin(i)[1] + 1];

export const BOSS_SEAT: Cell = [5, 2];
export const BOSS_VISITOR_SPOTS: Cell[] = [[5, 4], [4, 4], [6, 4], [3, 5], [7, 5]];
export const MEETING_SEATS: Cell[] = [[16, 3], [15, 6], [18, 6], [14, 3], [18, 3], [16, 6], [13, 5], [20, 4], [19, 6]];
export const ENTRANCE: Cell = [36, 8];
export const COFFEE_SPOTS: Cell[] = [[36, 11], [38, 11], [40, 11]];
export const HANGOUT_SPOTS: Cell[] = [[29, 13], [34, 17], [37, 18], [38, 21], [41, 17], [14, 16], [22, 16], [20, 23]];

export const furniture: Furniture[] = [
  { id: 'boss-desk', type: 'bossdesk', x: 4, y: 3, w: 3, h: 1, block: true, interact: 'llm', label: 'Tu ordenador · Configurar LLM', spot: BOSS_SEAT },
  { id: 'boss-rug', type: 'rug', x: 3, y: 5, w: 5, h: 3, block: false },
  { id: 'boss-plant', type: 'plant', x: 1, y: 1, w: 1, h: 1, block: true },
  { id: 'boss-shelf', type: 'bookshelf', x: 8, y: 1, w: 3, h: 1, block: true },
  { id: 'boss-sofa', type: 'sofa', x: 1, y: 5, w: 1, h: 3, block: true },
  { id: 'boss-plant2', type: 'plant', x: 10, y: 8, w: 1, h: 1, block: true },

  { id: 'meet-table', type: 'table', x: 14, y: 4, w: 6, h: 2, block: true },
  { id: 'meet-board', type: 'whiteboard', x: 15, y: 1, w: 4, h: 1, block: true, interact: 'tasks', label: 'Tablón de tareas', spot: [16, 2] },
  { id: 'meet-plant', type: 'plant', x: 21, y: 1, w: 1, h: 1, block: true },

  { id: 'rack-1', type: 'rack', x: 23, y: 1, w: 1, h: 1, block: true },
  { id: 'rack-2', type: 'rack', x: 24, y: 1, w: 1, h: 1, block: true },
  { id: 'rack-3', type: 'rack', x: 29, y: 1, w: 1, h: 1, block: true },
  { id: 'rack-4', type: 'rack', x: 30, y: 1, w: 1, h: 1, block: true },
  { id: 'rack-5', type: 'rack', x: 23, y: 5, w: 1, h: 1, block: true },
  { id: 'rack-6', type: 'rack', x: 30, y: 5, w: 1, h: 1, block: true },
  { id: 'server-console', type: 'console', x: 26, y: 1, w: 2, h: 1, block: true, interact: 'llm', label: 'Consola · Proveedores LLM', spot: [26, 2] },

  { id: 'hr-desk', type: 'reception', x: 35, y: 3, w: 4, h: 1, block: true, interact: 'hire', label: 'RRHH · Contratar agente', spot: [36, 4] },
  { id: 'hr-plant', type: 'plant', x: 32, y: 1, w: 1, h: 1, block: true },
  { id: 'hr-cabinet', type: 'cabinet', x: 40, y: 1, w: 3, h: 1, block: true },
  { id: 'hr-bench', type: 'sofa', x: 32, y: 5, w: 1, h: 3, block: true },
  { id: 'link-globe', type: 'globe', x: 41, y: 6, w: 1, h: 1, block: true, interact: 'offices', label: 'Centralita · Otras oficinas', spot: [40, 6] },

  ...Array.from({ length: DESK_COUNT }, (_, i): Furniture => ({
    id: `desk-${i}`, type: 'desk', x: deskOrigin(i)[0], y: deskOrigin(i)[1], w: 3, h: 1, block: true,
  })),
  { id: 'cooler', type: 'cooler', x: 30, y: 12, w: 1, h: 1, block: true },
  { id: 'printer', type: 'printer', x: 1, y: 23, w: 2, h: 1, block: true },
  { id: 'open-plant1', type: 'plant', x: 1, y: 10, w: 1, h: 1, block: true },
  { id: 'open-plant2', type: 'plant', x: 30, y: 24, w: 1, h: 1, block: true },
  { id: 'open-plant3', type: 'plant', x: 30, y: 10, w: 1, h: 1, block: true },
  { id: 'open-rug', type: 'rug2', x: 12, y: 15, w: 9, h: 2, block: false },

  { id: 'cafe-counter', type: 'counter', x: 35, y: 10, w: 7, h: 1, block: true, interact: 'coffee', label: 'Máquina de café', spot: [38, 11] },
  { id: 'cafe-vending', type: 'vending', x: 32, y: 10, w: 1, h: 1, block: true },
  { id: 'cafe-table1', type: 'roundtable', x: 35, y: 16, w: 2, h: 2, block: true },
  { id: 'cafe-table2', type: 'roundtable', x: 39, y: 20, w: 2, h: 2, block: true },
  { id: 'cafe-sofa', type: 'sofa', x: 42, y: 14, w: 1, h: 3, block: true },
  { id: 'cafe-plant', type: 'plant', x: 42, y: 24, w: 1, h: 1, block: true },
];

for (const f of furniture) {
  if (!f.block) continue;
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) blocked[idx(x, y)] = 1;
}

export const walkable = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H && !wall[idx(x, y)] && !blocked[idx(x, y)];

export const mapData = {
  w: W,
  h: H,
  walls: Array.from(wall),
  rooms,
  furniture,
  bossSeat: BOSS_SEAT,
  desks: Array.from({ length: DESK_COUNT }, (_, i) => ({ seat: deskSeat(i), visitor: deskVisitor(i) })),
};

const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function findPath(from: Cell, to: Cell): Cell[] | null {
  if (!walkable(to[0], to[1])) return null;
  if (from[0] === to[0] && from[1] === to[1]) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const start = idx(from[0], from[1]);
  const goal = idx(to[0], to[1]);
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      const n = idx(nx, ny);
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
  for (let r = 0; r < 8; r++) {
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
