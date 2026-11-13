import type { Companion } from './types.js';

export const SPECIES: Record<string, string> = {
  brotin: 'Brotín',
  ascuo: 'Ascuo',
  gotelo: 'Gotelo',
  voltin: 'Voltín',
  pedrin: 'Pedrín',
  nubi: 'Nubi',
  bitxo: 'Bitxo',
  lumo: 'Lumo',
};

export const XP_PER_LEVEL = 100;
export const levelOf = (xp: number) => 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
export const stageOf = (level: number) => (level >= 6 ? 3 : level >= 3 ? 2 : 1);

export function randomCompanion(): Companion {
  const ids = Object.keys(SPECIES);
  const species = ids[Math.floor(Math.random() * ids.length)];
  return { species, name: SPECIES[species] };
}

export function cleanCompanion(input: unknown): Companion | null {
  const c = input as Partial<Companion> | null;
  if (!c || typeof c.species !== 'string' || !SPECIES[c.species]) return null;
  const name = typeof c.name === 'string' ? c.name.trim().slice(0, 20) : '';
  return { species: c.species, name: name || SPECIES[c.species] };
}
