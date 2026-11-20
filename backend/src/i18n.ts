import { EN } from './i18n-en.js';

export type Lang = 'es' | 'en';
export type Key = keyof typeof EN;
export type Params = Record<string, unknown>;
export type Dict = Readonly<Record<string, string>>;

export interface Msg {
  k: string;
  p?: Params;
}

export const LANGS: Lang[] = ['es', 'en'];
export const isLang = (value: unknown): value is Lang => value === 'es' || value === 'en';

let source: () => Lang = () => 'es';
let override: () => Lang | undefined = () => undefined;

export const setLangOverride = (fn: () => Lang | undefined) => {
  override = fn;
};

export const setLangSource = (fn: () => Lang) => {
  source = fn;
};

export const lang = (): Lang => override() ?? source();

export function formatWith(dict: Dict, l: Lang, key: string, params?: Params): string {
  const text = l === 'en' ? dict[key] ?? key : key;
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}

export const tl = (l: Lang, key: Key, params?: Params) => formatWith(EN, l, key, params);
export const t = (key: Key, params?: Params) => tl(lang(), key, params);
export const tr = (text: string, params?: Params) => formatWith(EN, lang(), text, params);
export const N = <K extends Key>(key: K): K => key;
export const m = (key: Key, params?: Params): Msg => (params ? { k: key, p: params } : { k: key });
export const fmt = (l: Lang, msg: Msg) => formatWith(EN, l, msg.k, msg.p);

const spanish = new Map<string, string>(Object.entries(EN).map(([es, en]) => [en, es]));

export function relabel(text: string, to: Lang): string {
  if (to === 'en') return (EN as Dict)[text] ?? text;
  return spanish.get(text) ?? text;
}
