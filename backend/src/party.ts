import { hub } from './hub.js';
import { map, type Cell } from './map.js';
import { feed, gather, playerDance, presentIds, speak } from './brain.js';
import { m, N, t, tr } from './i18n.js';

const PARTY_MS = 45000;
const CHEERS = ['🎉', '🕺', '💃', '🎶', N('¡Eso es!'), N('¡Temazo!'), N('¡Bravo, equipo!'), '🥳', N('¡Otra, otra!'), '✨'];

let until = 0;

export const partyUntil = () => (Date.now() < until ? until : 0);

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function startParty(): number {
  if (partyUntil()) return until;
  until = Date.now() + PARTY_MS;
  const spots: Cell[] = shuffle(map.dance);
  const ids = presentIds();
  const floor = gather(ids, spots.slice(1).length ? spots.slice(1) : spots, 'dancing');
  void playerDance(spots[0], until);
  hub.broadcast({ type: 'party', until });
  feed(m('¡Fiesta en la zona lúdica! Todo el mundo a bailar'));
  const cheer = setInterval(() => {
    const here = floor.present();
    if (!here.length) return;
    speak(here[Math.floor(Math.random() * here.length)], tr(CHEERS[Math.floor(Math.random() * CHEERS.length)]), 2200);
  }, 1800);
  setTimeout(() => {
    clearInterval(cheer);
    floor.release();
    hub.broadcast({ type: 'party', until: 0 });
  }, PARTY_MS);
  return until;
}
