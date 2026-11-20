import { store } from './db.js';
import { hub } from './hub.js';
import type { Appearance, Companion } from './types.js';
import { isLang, setLangSource, t, type Lang } from './i18n.js';

const ENV_LANG: Lang = isLang(process.env.OFFICE_LANG) ? process.env.OFFICE_LANG : 'es';

export const officeLang = (): Lang => {
  const saved = store.setting<string>('lang', ENV_LANG);
  return isLang(saved) ? saved : ENV_LANG;
};

setLangSource(officeLang);

export function settings() {
  return {
    playerName: store.setting('playerName', t('Jefe')),
    playerAppearance: store.setting<Appearance | null>('playerAppearance', null),
    playerCompanion: store.setting<Companion | null>('playerCompanion', null),
    playerXp: store.setting('playerXp', 0),
    defaultProviderId: store.setting<string | null>('defaultProviderId', null),
    officeName: store.setting('officeName', t('Mi oficina')),
    managerId: store.setting<string | null>('managerId', null),
    lang: officeLang(),
  };
}

export const publishSettings = () => hub.broadcast({ type: 'settings', settings: settings() });
