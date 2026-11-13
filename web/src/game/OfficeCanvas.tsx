import { useEffect, useRef } from 'react';
import { getState, setState, world, type RenderActor } from '../store';
import { go, sayAsPlayer, selectAgent } from '../net';
import type { Furniture, MapData } from '../types';
import { DEFAULT_APPEARANCE, drawCharacter, roundRect } from './character';
import { INTERACT_ICON, T, WALL_H, buildFloor, drawFurniture, drawWall, drawWindow, wallCells, wrapText } from './draw';

const PANEL_W = 420;
const ROSTER_W = 220;
const STATUS_ICON: Record<string, string> = { working: '💻', waiting: '⏳', talking: '💬', break: '☕', visiting: '🙋' };
const FONT = '"Segoe UI", system-ui, sans-serif';

interface View {
  camX: number;
  camY: number;
  zoom: number;
  userZoom: number;
  cx: number;
  cy: number;
}

export function runInteraction(f: Furniture) {
  if (f.interact === 'llm') setState({ modal: { kind: 'settings' } });
  else if (f.interact === 'hire') setState({ modal: { kind: 'people' } });
  else if (f.interact === 'tasks') setState({ modal: { kind: 'tasks' } });
  else if (f.interact === 'coffee') sayAsPlayer('☕ Mmm, café');
}

function feet(a: RenderActor): [number, number] {
  return [(a.rx + 0.5) * T, (a.ry + 0.5) * T + 14 + (a.seated ? 10 : 0)];
}

export function OfficeCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const view: View = { camX: 0, camY: 0, zoom: 1, userZoom: 1, cx: 0, cy: 0 };
    let map: MapData | null = null;
    let floor: HTMLCanvasElement | null = null;
    let walls: ReturnType<typeof wallCells> = [];
    let raf = 0;
    let last = performance.now();
    let hoverAgent: string | null = null;
    let hoverFurniture: Furniture | null = null;
    let marker: { x: number; y: number; at: number } | null = null;
    let firstFrame = true;

    const toWorld = (sx: number, sy: number): [number, number] => [
      (sx - view.cx) / view.zoom + view.camX,
      (sy - view.cy) / view.zoom + view.camY,
    ];

    const pickAt = (wx: number, wy: number) => {
      let agent: string | null = null;
      let best = -Infinity;
      for (const a of world.actors.values()) {
        if (a.kind !== 'agent') continue;
        const [fx, fy] = feet(a);
        if (Math.abs(wx - fx) < 18 && wy > fy - 62 && wy < fy + 6 && fy > best) {
          agent = a.id;
          best = fy;
        }
      }
      let furniture: Furniture | null = null;
      if (!agent && map) {
        furniture = map.furniture.find((f) => f.interact
          && wx > f.x * T && wx < (f.x + f.w) * T && wy > f.y * T - 46 && wy < (f.y + f.h) * T) ?? null;
      }
      return { agent, furniture };
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = pickAt(wx, wy);
      hoverAgent = hit.agent;
      hoverFurniture = hit.furniture;
      canvas.style.cursor = hit.agent || hit.furniture ? 'pointer' : 'default';
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = pickAt(wx, wy);
      if (hit.agent) {
        void selectAgent(hit.agent);
        return;
      }
      if (hit.furniture) {
        const f = hit.furniture;
        void go({ kind: 'spot', id: f.id }).then((ok) => ok && runInteraction(f));
        return;
      }
      const x = Math.floor(wx / T);
      const y = Math.floor(wy / T);
      marker = { x, y, at: performance.now() };
      void go({ kind: 'cell', x, y });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.userZoom = Math.max(0.6, Math.min(1.8, view.userZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const drawTag = (a: RenderActor, name: string, color: string | null, selected: boolean) => {
      const [fx, fy] = feet(a);
      const icon = STATUS_ICON[a.status] ?? '';
      const label = icon ? `${name} ${icon}` : name;
      ctx.font = `600 11px ${FONT}`;
      const w = ctx.measureText(label).width + (color ? 22 : 14);
      const x = fx - w / 2;
      const y = fy - 78;
      ctx.fillStyle = selected ? 'rgba(79, 140, 255, 0.95)' : 'rgba(22, 24, 32, 0.78)';
      roundRect(ctx, x, y, w, 17, 8.5);
      ctx.fill();
      if (color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + 9, y + 8.5, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + (color ? 16 : 7), y + 9);
      ctx.textBaseline = 'alphabetic';
    };

    const drawBubble = (a: RenderActor) => {
      const [fx, fy] = feet(a);
      ctx.font = `500 12px ${FONT}`;
      const lines = wrapText(ctx, a.bubble, 190);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
      const h = lines.length * 15 + 12;
      const x = fx - w / 2;
      const y = fy - 86 - h;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      roundRect(ctx, x + 1, y + 3, w, h, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx - 6, y + h - 1);
      ctx.lineTo(fx, y + h + 7);
      ctx.lineTo(fx + 6, y + h - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1d2030';
      lines.forEach((line, i) => ctx.fillText(line, x + 10, y + 19 + i * 15));
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const state = getState();
      if (!state.map) return;
      if (state.map !== map) {
        map = state.map;
        floor = buildFloor(map);
        walls = wallCells(map);
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const time = now / 1000;

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }

      const k = 1 - Math.exp(-dt * 16);
      for (const a of world.actors.values()) {
        if (Math.abs(a.x - a.rx) + Math.abs(a.y - a.ry) > 4) {
          a.rx = a.x;
          a.ry = a.y;
        } else {
          a.rx += (a.x - a.rx) * k;
          a.ry += (a.y - a.ry) * k;
        }
      }

      const left = cw > 900 ? ROSTER_W : 0;
      const usable = cw - left - (state.selectedAgentId && cw > 900 ? PANEL_W : 0);
      view.zoom = Math.max(0.8, Math.min(1.25, usable / (30 * T))) * view.userZoom;
      view.cx += (left + usable / 2 - view.cx) * (firstFrame ? 1 : k * 0.5);
      view.cy = ch / 2 + 20;
      const player = world.actors.get('player');
      const mapW = map.w * T;
      const mapH = map.h * T;
      const halfW = usable / 2 / view.zoom;
      const halfH = ch / 2 / view.zoom;
      const clamp = (v: number, half: number, size: number) =>
        half * 2 >= size + 160 ? size / 2 : Math.max(half - 80, Math.min(size - half + 80, v));
      const tx = clamp(player ? (player.rx + 0.5) * T : mapW / 2, halfW, mapW);
      const ty = clamp(player ? (player.ry + 0.5) * T : mapH / 2, halfH, mapH);
      const ck = firstFrame ? 1 : 1 - Math.exp(-dt * 5);
      view.camX += (tx - view.camX) * ck;
      view.camY += (ty - view.camY) * ck;
      firstFrame = false;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#14161f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom,
        dpr * (view.cx - view.camX * view.zoom), dpr * (view.cy - view.camY * view.zoom));
      ctx.fillStyle = '#0f1118';
      roundRect(ctx, -14, -WALL_H - 14, mapW + 28, mapH + WALL_H + 28, 18);
      ctx.fill();
      ctx.drawImage(floor!, 0, 0);

      if (marker) {
        const age = (now - marker.at) / 600;
        if (age > 1) marker = null;
        else {
          ctx.strokeStyle = `rgba(79, 140, 255, ${1 - age})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse((marker.x + 0.5) * T, (marker.y + 0.5) * T + 12, 8 + age * 14, 4 + age * 7, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const agents = new Map(state.agents.map((a) => [a.id, a]));
      const teams = new Map(state.teams.map((t) => [t.id, t]));
      const deskOwner = new Map(state.agents.map((a) => [a.desk, a]));

      for (const a of world.actors.values()) {
        const mine = a.kind === 'player';
        if (!mine && a.id !== state.selectedAgentId && a.id !== hoverAgent) continue;
        const [fx, fy] = feet(a);
        ctx.strokeStyle = mine ? 'rgba(255, 215, 106, 0.9)' : 'rgba(79, 140, 255, 0.95)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(fx, fy, 17 + Math.sin(time * 4) * 1.2, 7.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const drawables: { y: number; draw: () => void }[] = [];
      for (const cell of walls) drawables.push({ y: (cell.y + 1) * T, draw: () => drawWall(ctx, cell) });
      for (const cell of walls) if (cell.window) drawables.push({ y: (cell.y + 1) * T + 1, draw: () => drawWindow(ctx, cell) });
      for (const f of map.furniture) {
        if (!f.block) continue;
        let working = false;
        let color: string | undefined;
        if (f.type === 'desk') {
          const owner = deskOwner.get(Number(f.id.split('-')[1]));
          const actor = owner && world.actors.get(owner.id);
          working = !!actor && actor.seated && actor.status === 'working';
          color = owner?.teamId ? teams.get(owner.teamId)?.color : undefined;
        }
        const wallRight = map.walls[f.y * map.w + f.x + 1] === 1;
        drawables.push({ y: (f.y + f.h) * T - 4, draw: () => drawFurniture(ctx, f, { time, working, color, wallRight }) });
      }
      for (const a of world.actors.values()) {
        const appearance = a.kind === 'player'
          ? state.settings.playerAppearance ?? DEFAULT_APPEARANCE
          : agents.get(a.id)?.appearance ?? DEFAULT_APPEARANCE;
        const [fx, fy] = feet(a);
        drawables.push({
          y: (a.ry + 0.5) * T + 14,
          draw: () => drawCharacter(ctx, fx, fy, appearance, {
            facing: a.facing, moving: a.moving, seated: a.seated, time, seed: a.seed,
          }),
        });
      }
      drawables.sort((p, q) => p.y - q.y);
      for (const d of drawables) d.draw();

      for (const f of map.furniture) {
        if (!f.interact) continue;
        const cx = (f.x + f.w / 2) * T + (f.type === 'bossdesk' ? 118 : 0);
        const top = f.y * T - 62 + Math.sin(time * 2.4 + f.x) * 3;
        const hovered = hoverFurniture === f;
        ctx.fillStyle = hovered ? 'rgba(79, 140, 255, 0.95)' : 'rgba(22, 24, 32, 0.8)';
        ctx.font = `600 12px ${FONT}`;
        const text = hovered ? `${INTERACT_ICON[f.interact]} ${f.label ?? ''}` : INTERACT_ICON[f.interact];
        const w = ctx.measureText(text).width + 16;
        roundRect(ctx, cx - w / 2, top, w, 24, 12);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(text, cx, top + 13);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }

      const sorted = [...world.actors.values()].sort((p, q) => p.ry - q.ry);
      for (const a of sorted) {
        if (a.kind === 'player') drawTag(a, `${state.settings.playerName} (tú)`, '#ffd76a', false);
        else {
          const agent = agents.get(a.id);
          if (agent) drawTag(a, agent.name, agent.teamId ? teams.get(agent.teamId)?.color ?? null : null, a.id === state.selectedAgentId);
        }
      }
      for (const a of sorted) if (a.bubble) drawBubble(a);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return <canvas ref={ref} className="office-canvas" />;
}
