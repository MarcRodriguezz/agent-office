import { randomUUID } from 'node:crypto';
import { store } from './db.js';
import type { Appearance } from './types.js';

const look = (skin: string, hair: string, hairColor: string, shirt: string, accessory = 'none', eyes = 'normal'): Appearance =>
  ({ skin, hair, hairColor, shirt, accessory, eyes });

export function seed() {
  if (store.setting('seeded', false)) return;
  const mock = store.saveProvider({
    name: 'Cerebro simulado', kind: 'mock', baseUrl: '', apiKey: '', model: '', command: '',
  });
  store.setSetting('defaultProviderId', mock.id);
  store.setSetting('playerName', 'Jefe');
  store.setSetting('playerAppearance', look('#f1c9a5', 'side', '#3b2a20', '#2f3e5c', 'glasses'));

  const product = store.saveTeam({ name: 'Producto', color: '#4f8cff', mission: 'Diseñar y construir el producto: análisis, especificación y desarrollo.', leadId: null });
  const marketing = store.saveTeam({ name: 'Marketing', color: '#ff7a59', mission: 'Dar a conocer el producto: mensajes, contenidos y campañas.', leadId: null });

  const people: [string, string, string, string, Appearance][] = [
    ['Lucía', 'Responsable de producto', 'Organizada, resolutiva y cercana. Le gusta repartir bien el trabajo.', product.id, look('#e8b48c', 'long', '#5a3320', '#7c5cff')],
    ['Dani', 'Desarrollador full-stack', 'Pragmático y directo. Prefiere soluciones simples que funcionen.', product.id, look('#c98d62', 'short', '#1f1a17', '#2fa37a', 'headphones')],
    ['Sara', 'Analista de investigación', 'Curiosa y rigurosa. Siempre contrasta los datos antes de concluir.', product.id, look('#f6d4b8', 'bun', '#b5562b', '#e0668a', 'glasses')],
    ['Nora', 'Responsable de marketing', 'Creativa, enérgica y con mucho olfato para el público.', marketing.id, look('#8d5a3b', 'curly', '#201512', '#ff9f43')],
    ['Hugo', 'Redactor y diseñador', 'Detallista, con humor y buen gusto para las palabras.', marketing.id, look('#f1c9a5', 'cap', '#6b4a2f', '#38b6c9', 'beard', 'happy')],
  ];
  const ids = people.map(([name, role, personality, teamId, appearance], desk) => {
    const id = randomUUID();
    store.saveAgent({
      id, name, role, personality, instructions: '', providerId: null, model: '', teamId, appearance, desk,
      createdAt: Date.now() + desk,
    });
    return id;
  });
  store.saveTeam({ ...product, leadId: ids[0] });
  store.saveTeam({ ...marketing, leadId: ids[3] });
  store.addFeed('La oficina abre sus puertas');
  store.setSetting('seeded', true);
}
