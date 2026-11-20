import type { Furniture } from '../types';
import { t } from '../i18n';

export interface Daylight {
  hour: number;
  dark: number;
  label: string;
  sky: [string, string];
  stars: boolean;
  tint: [number, number, number];
}

const NIGHT = 0.6;
const LIGHTS: Record<string, { radius: number; color: string }> = {
  desk: { radius: 2.2, color: '255, 214, 150' },
  bossdesk: { radius: 3, color: '255, 214, 150' },
  console: { radius: 2.6, color: '140, 200, 255' },
  counter: { radius: 3.2, color: '255, 190, 120' },
  reception: { radius: 2.6, color: '255, 214, 150' },
  whiteboard: { radius: 2.2, color: '230, 236, 255' },
  globe: { radius: 1.8, color: '140, 200, 255' },
  jukebox: { radius: 2.6, color: '255, 126, 182' },
  arcade: { radius: 1.6, color: '125, 249, 200' },
  dancefloor: { radius: 3.2, color: '196, 155, 255' },
};

const override = (() => {
  const raw = new URLSearchParams(location.search).get('hora');
  const value = raw === null ? NaN : Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? ((value % 24) + 24) % 24 : null;
})();

const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

export function daylight(date = new Date()): Daylight {
  const hour = override ?? date.getHours() + date.getMinutes() / 60;
  if (hour >= 8 && hour < 18.5) return { hour, dark: 0, label: t('Día'), sky: ['#8fcdf4', '#c9e9fb'], stars: false, tint: [0, 0, 0] };
  if (hour >= 6.5 && hour < 8) {
    const k = (hour - 6.5) / 1.5;
    return { hour, dark: NIGHT * (1 - k), label: t('Amanecer'), sky: [mix('#2b3566', '#f2b49a', k), mix('#5a4d7a', '#fbe3c4', k)], stars: false, tint: [30, 22, 60] };
  }
  if (hour >= 18.5 && hour < 21.5) {
    const k = (hour - 18.5) / 3;
    return { hour, dark: NIGHT * k, label: t('Atardecer'), sky: [mix('#f39a52', '#1a2348', k), mix('#fbd29a', '#5b3d6b', k)], stars: k > 0.7, tint: [38, 18, 52] };
  }
  return { hour, dark: NIGHT, label: t('Noche'), sky: ['#0b1230', '#1c2850'], stars: true, tint: [10, 14, 40] };
}

export const clockText = (light: Daylight) => {
  const h = Math.floor(light.hour);
  const m = Math.floor((light.hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export interface Lamp {
  x: number;
  y: number;
  radius: number;
  color: string;
  strength: number;
}

export function lampsOf(furniture: Furniture[], T: number, working: Set<string>): Lamp[] {
  const lamps: Lamp[] = [];
  for (const f of furniture) {
    const light = LIGHTS[f.type];
    if (!light) continue;
    const on = f.type !== 'desk' || working.has(f.id);
    lamps.push({
      x: (f.x + f.w / 2) * T,
      y: (f.y + 0.2) * T,
      radius: light.radius * T * (on ? 1 : 0.7),
      color: light.color,
      strength: on ? 1 : 0.55,
    });
  }
  return lamps;
}

export function paintNight(layer: HTMLCanvasElement, w: number, h: number, ox: number, oy: number, scale: number, light: Daylight, lamps: Lamp[]) {
  layer.width = Math.ceil(w * scale);
  layer.height = Math.ceil(h * scale);
  const c = layer.getContext('2d')!;
  c.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale);
  c.fillStyle = `rgba(${light.tint.join(', ')}, ${light.dark})`;
  c.fillRect(ox, oy, w, h);
  c.globalCompositeOperation = 'destination-out';
  for (const lamp of lamps) {
    const g = c.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.radius);
    g.addColorStop(0, `rgba(0, 0, 0, ${0.92 * lamp.strength})`);
    g.addColorStop(0.55, `rgba(0, 0, 0, ${0.5 * lamp.strength})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    c.fillRect(lamp.x - lamp.radius, lamp.y - lamp.radius, lamp.radius * 2, lamp.radius * 2);
  }
  c.globalCompositeOperation = 'source-over';
}

export function paintGlow(ctx: CanvasRenderingContext2D, light: Daylight, lamps: Lamp[]) {
  if (light.dark <= 0.02) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const lamp of lamps) {
    const r = lamp.radius * 0.7;
    const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, r);
    g.addColorStop(0, `rgba(${lamp.color}, ${0.16 * lamp.strength * (light.dark / NIGHT)})`);
    g.addColorStop(1, `rgba(${lamp.color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(lamp.x - r, lamp.y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}
