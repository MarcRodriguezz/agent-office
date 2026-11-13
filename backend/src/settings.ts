import { store } from './db.js';
import { hub } from './hub.js';
import type { Appearance, Companion } from './types.js';

export function settings() {
  return {
    playerName: store.setting('playerName', 'Jefe'),
    playerAppearance: store.setting<Appearance | null>('playerAppearance', null),
    playerCompanion: store.setting<Companion | null>('playerCompanion', null),
    playerXp: store.setting('playerXp', 0),
    defaultProviderId: store.setting<string | null>('defaultProviderId', null),
  };
}

export const publishSettings = () => hub.broadcast({ type: 'settings', settings: settings() });
