import { fmt, formatWith, isLang, LANGS, type Lang, type Msg, type Params } from '../../backend/src/i18n.js';
import { EN } from './i18n-en';

export { isLang, LANGS };
export type { Lang };

export const LANG_NAME: Record<Lang, string> = { es: 'Español', en: 'English' };
export type Key = keyof typeof EN;

const STORAGE = 'agent-office:lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (isLang(saved)) return saved;
  } catch {
    return 'en';
  }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export const LANG: Lang = initial();
document.documentElement.lang = LANG;

export const t = (key: Key, params?: Params) => formatWith(EN, LANG, key, params);
export const msg = (value: Msg | string) => (typeof value === 'string' ? value : fmt(LANG, value));
export const locale = LANG === 'es' ? 'es-ES' : 'en-GB';

export function rememberLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE, lang);
  } catch {
    return;
  }
}
