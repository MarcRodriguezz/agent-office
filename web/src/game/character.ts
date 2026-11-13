import type { Appearance, Facing } from '../types';

export const SKINS = ['#f6d4b8', '#f1c9a5', '#e8b48c', '#c98d62', '#8d5a3b', '#5c3a25'];
export const HAIRS = ['short', 'side', 'long', 'bun', 'curly', 'cap', 'bald'];
export const HAIR_COLORS = ['#1f1a17', '#3b2a20', '#5a3320', '#6b4a2f', '#b5562b', '#d9a441', '#e8e1d5', '#7c5cff', '#e0668a'];
export const SHIRTS = ['#4f8cff', '#7c5cff', '#2fa37a', '#e0668a', '#ff9f43', '#38b6c9', '#e25555', '#2f3e5c', '#f2f2f2', '#3a3a3a'];
export const ACCESSORIES = ['none', 'glasses', 'sunglasses', 'headphones', 'beard', 'mustache'];
export const EYES = ['normal', 'happy', 'sleepy'];

export const LABELS: Record<string, string> = {
  short: 'Corto', side: 'De lado', long: 'Largo', bun: 'Moño', curly: 'Rizado', cap: 'Gorra', bald: 'Calvo',
  none: 'Nada', glasses: 'Gafas', sunglasses: 'Gafas de sol', headphones: 'Cascos', beard: 'Barba', mustache: 'Bigote',
  normal: 'Normales', happy: 'Alegres', sleepy: 'Tranquilos',
};

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export const randomAppearance = (): Appearance => ({
  skin: pick(SKINS), hair: pick(HAIRS), hairColor: pick(HAIR_COLORS), shirt: pick(SHIRTS),
  eyes: pick(EYES), accessory: Math.random() < 0.5 ? 'none' : pick(ACCESSORIES),
});

export const DEFAULT_APPEARANCE: Appearance = {
  skin: SKINS[1], hair: 'side', hairColor: HAIR_COLORS[1], shirt: SHIRTS[7], eyes: 'normal', accessory: 'none',
};

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amount));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

type Ctx = CanvasRenderingContext2D;

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function drawHead(ctx: Ctx, cx: number, cy: number, r: number, ap: Appearance, facing: Facing, blink: boolean) {
  const back = facing === 'up';
  const shift = facing === 'left' ? -r * 0.3 : facing === 'right' ? r * 0.3 : 0;
  const hairFill = ap.hair === 'cap' ? ap.shirt : ap.hairColor;

  ctx.fillStyle = ap.hairColor;
  if (ap.hair === 'long') {
    roundRect(ctx, cx - r * 1.14, cy - r * 0.4, r * 2.28, r * 1.85, r * 0.55);
    ctx.fill();
  }
  if (ap.hair === 'bun') circle(ctx, cx, cy - r * 1.12, r * 0.46);
  if (ap.hair === 'curly') {
    for (let i = 0; i <= 7; i++) {
      const a = Math.PI * (0.88 + (i / 7) * 1.24);
      circle(ctx, cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, r * 0.42);
    }
  }

  if (!back && shift === 0) {
    ctx.fillStyle = shade(ap.skin, -14);
    circle(ctx, cx - r * 0.98, cy + r * 0.12, r * 0.2);
    circle(ctx, cx + r * 0.98, cy + r * 0.12, r * 0.2);
  }

  ctx.fillStyle = back && ap.hair !== 'bald' ? hairFill : ap.skin;
  circle(ctx, cx, cy, r);

  if (!back && ap.hair !== 'bald') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.07, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = hairFill;
    ctx.beginPath();
    if (ap.hair === 'side') {
      ctx.moveTo(cx - r * 1.2, cy - r * 1.2);
      ctx.lineTo(cx + r * 1.2, cy - r * 1.2);
      ctx.lineTo(cx + r * 1.2, cy - r * 0.5);
      ctx.quadraticCurveTo(cx + r * 0.1, cy - r * 0.55, cx - r * 1.2, cy + r * 0.1);
    } else if (ap.hair === 'long' || ap.hair === 'bun') {
      ctx.moveTo(cx - r * 1.2, cy - r * 1.2);
      ctx.lineTo(cx + r * 1.2, cy - r * 1.2);
      ctx.lineTo(cx + r * 1.2, cy + r * 0.15);
      ctx.quadraticCurveTo(cx + r * 0.75, cy - r * 0.6, cx, cy - r * 0.62);
      ctx.quadraticCurveTo(cx - r * 0.75, cy - r * 0.6, cx - r * 1.2, cy + r * 0.15);
    } else {
      ctx.rect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * (ap.hair === 'cap' ? 0.86 : 0.8));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (ap.hair === 'cap') {
      ctx.fillStyle = shade(ap.shirt, -40);
      roundRect(ctx, cx - r * 0.8 + shift, cy - r * 0.42, r * 1.6, r * 0.26, r * 0.13);
      ctx.fill();
    }
  }

  if (ap.accessory === 'headphones') {
    ctx.strokeStyle = '#2b2f3a';
    ctx.lineWidth = r * 0.17;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = '#ff5d5d';
    roundRect(ctx, cx - r * 1.24, cy - r * 0.28, r * 0.34, r * 0.7, r * 0.15);
    ctx.fill();
    roundRect(ctx, cx + r * 0.9, cy - r * 0.28, r * 0.34, r * 0.7, r * 0.15);
    ctx.fill();
  }
  if (back) return;

  if (ap.accessory === 'beard') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = ap.hairColor;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.1, cy + r * 0.1);
    ctx.quadraticCurveTo(cx + shift, cy + r * 0.62, cx + r * 1.1, cy + r * 0.1);
    ctx.lineTo(cx + r * 1.1, cy + r * 1.1);
    ctx.lineTo(cx - r * 1.1, cy + r * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const ex = r * 0.38;
  const ey = cy + r * 0.14;
  ctx.fillStyle = 'rgba(255, 110, 110, 0.22)';
  circle(ctx, cx - r * 0.58 + shift, cy + r * 0.44, r * 0.15);
  circle(ctx, cx + r * 0.58 + shift, cy + r * 0.44, r * 0.15);

  ctx.strokeStyle = '#2a2420';
  ctx.fillStyle = '#2a2420';
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const x = cx + side * ex + shift;
    if (ap.accessory === 'sunglasses') continue;
    if (blink || ap.eyes === 'sleepy') {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.12, ey);
      ctx.lineTo(x + r * 0.12, ey);
      ctx.stroke();
    } else if (ap.eyes === 'happy') {
      ctx.beginPath();
      ctx.arc(x, ey + r * 0.06, r * 0.13, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      circle(ctx, x, ey, r * 0.115);
      ctx.fillStyle = '#ffffff';
      circle(ctx, x + r * 0.04, ey - r * 0.04, r * 0.04);
      ctx.fillStyle = '#2a2420';
    }
  }

  if (ap.accessory === 'mustache') {
    ctx.fillStyle = ap.hairColor;
    ctx.beginPath();
    ctx.ellipse(cx + shift, cy + r * 0.4, r * 0.3, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = ap.accessory === 'beard' ? '#f3d9cc' : '#7a3b2e';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(cx + shift, cy + r * (ap.accessory === 'mustache' ? 0.46 : 0.38), r * 0.2, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();

  if (ap.accessory === 'glasses') {
    ctx.strokeStyle = '#22252e';
    ctx.lineWidth = Math.max(1, r * 0.09);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * ex + shift, ey, r * 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - ex + r * 0.25 + shift, ey);
    ctx.lineTo(cx + ex - r * 0.25 + shift, ey);
    ctx.stroke();
  }
  if (ap.accessory === 'sunglasses') {
    ctx.fillStyle = '#16181f';
    for (const side of [-1, 1]) {
      roundRect(ctx, cx + side * ex + shift - r * 0.28, ey - r * 0.18, r * 0.56, r * 0.38, r * 0.14);
      ctx.fill();
    }
    ctx.fillRect(cx - ex + shift, ey - r * 0.08, ex * 2, r * 0.08);
  }
}

export interface PoseOptions {
  facing: Facing;
  moving: boolean;
  seated: boolean;
  time: number;
  seed: number;
}

export function drawCharacter(ctx: Ctx, fx: number, fy: number, ap: Appearance, o: PoseOptions) {
  const walk = o.moving ? Math.sin(o.time * 13 + o.seed) : 0;
  const bob = o.moving ? Math.abs(walk) * 1.6 : Math.sin(o.time * 2.2 + o.seed) * 0.5;
  const blink = (o.time + o.seed * 3) % 4.2 < 0.13;

  if (!o.seated) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(fx, fy, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      const lift = Math.max(0, walk * side) * 4;
      ctx.fillStyle = '#2b2f3a';
      roundRect(ctx, fx + (side < 0 ? -9 : 2), fy - 13 - lift, 7, 12, 2);
      ctx.fill();
      ctx.fillStyle = '#1a1c22';
      roundRect(ctx, fx + (side < 0 ? -10 : 2), fy - 4 - lift, 8, 4, 2);
      ctx.fill();
    }
  }

  const top = fy - 33 - bob;
  for (const side of [-1, 1]) {
    const swing = walk * side * 2.5;
    ctx.fillStyle = shade(ap.shirt, -22);
    roundRect(ctx, fx + (side < 0 ? -16 : 11), top + 3 + swing, 5.5, 15, 2.5);
    ctx.fill();
    ctx.fillStyle = ap.skin;
    circle(ctx, fx + side * 13.5, top + 19 + swing, 2.8);
  }
  ctx.fillStyle = ap.shirt;
  roundRect(ctx, fx - 12, top, 24, 23, 7);
  ctx.fill();
  if (o.facing !== 'up') {
    ctx.fillStyle = shade(ap.shirt, 28);
    ctx.beginPath();
    ctx.moveTo(fx - 4, top);
    ctx.lineTo(fx, top + 5);
    ctx.lineTo(fx + 4, top);
    ctx.closePath();
    ctx.fill();
  }
  drawHead(ctx, fx, top - 10, 13, ap, o.facing, blink);
}

export function drawPortrait(ctx: Ctx, size: number, ap: Appearance, bg: string) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = ap.shirt;
  roundRect(ctx, size * 0.16, size * 0.74, size * 0.68, size * 0.5, size * 0.2);
  ctx.fill();
  ctx.fillStyle = shade(ap.skin, -14);
  ctx.fillRect(size * 0.43, size * 0.66, size * 0.14, size * 0.12);
  drawHead(ctx, size / 2, size * 0.46, size * 0.27, ap, 'down', false);
  ctx.restore();
}
