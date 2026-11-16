import { randomUUID } from 'node:crypto';
import { store } from './db.js';
import { SPECIES } from './companions.js';
import type { Appearance } from './types.js';

const look = (skin: string, hair: string, hairColor: string, shirt: string, accessory = 'none', eyes = 'normal'): Appearance =>
  ({ skin, hair, hairColor, shirt, accessory, eyes });

type Person = [string, string, string, 0 | 1, Appearance, string];

interface Staff {
  teams: [[string, string, string], [string, string, string]];
  people: Person[];
}

const STAFF: Staff[] = [
  {
    teams: [
      ['Producto', '#4f8cff', 'Diseñar y construir el producto: análisis, especificación y desarrollo.'],
      ['Marketing', '#ff7a59', 'Dar a conocer el producto: mensajes, contenidos y campañas.'],
    ],
    people: [
      ['Lucía', 'Responsable de producto', 'Organizada, resolutiva y cercana. Le gusta repartir bien el trabajo.', 0, look('#e8b48c', 'long', '#5a3320', '#7c5cff'), 'lumo'],
      ['Dani', 'Desarrollador full-stack', 'Pragmático y directo. Prefiere soluciones simples que funcionen.', 0, look('#c98d62', 'short', '#1f1a17', '#2fa37a', 'headphones'), 'bitxo'],
      ['Sara', 'Analista de investigación', 'Curiosa y rigurosa. Siempre contrasta los datos antes de concluir.', 0, look('#f6d4b8', 'bun', '#b5562b', '#e0668a', 'glasses'), 'nubi'],
      ['Nora', 'Responsable de marketing', 'Creativa, enérgica y con mucho olfato para el público.', 1, look('#8d5a3b', 'curly', '#201512', '#ff9f43'), 'ascuo'],
      ['Hugo', 'Redactor y diseñador', 'Detallista, con humor y buen gusto para las palabras.', 1, look('#f1c9a5', 'cap', '#6b4a2f', '#38b6c9', 'beard', 'happy'), 'brotin'],
    ],
  },
  {
    teams: [
      ['Ingeniería', '#2fa37a', 'Mantener los sistemas en pie: arquitectura, revisiones de código y despliegues.'],
      ['Soporte', '#e0a13a', 'Atender a los clientes: resolver incidencias y documentar las respuestas.'],
    ],
    people: [
      ['Irene', 'Responsable de ingeniería', 'Metódica y tranquila. Explica las decisiones técnicas sin jerga.', 0, look('#f1c9a5', 'bun', '#3b2a20', '#2fa37a', 'glasses'), 'bitxo'],
      ['Pau', 'Ingeniero de plataforma', 'Meticuloso con la fiabilidad. Desconfía de lo que no está medido.', 0, look('#c98d62', 'short', '#201512', '#38b6c9'), 'nubi'],
      ['Marta', 'Responsable de soporte', 'Paciente y clara. Convierte un problema confuso en pasos concretos.', 1, look('#e8b48c', 'long', '#b5562b', '#e0a13a'), 'lumo'],
      ['Íker', 'Técnico de soporte', 'Rápido y amable. Siempre deja escrito cómo lo resolvió.', 1, look('#8d5a3b', 'curly', '#1f1a17', '#e0668a', 'headphones', 'happy'), 'brotin'],
    ],
  },
  {
    teams: [
      ['Ventas', '#d9534f', 'Encontrar clientes y cerrar acuerdos: propuestas, seguimiento y previsiones.'],
      ['Finanzas', '#5b8a72', 'Cuidar las cuentas: presupuestos, costes e informes.'],
    ],
    people: [
      ['Carla', 'Responsable de ventas', 'Persuasiva y honesta. Prefiere perder una venta a prometer de más.', 0, look('#f6d4b8', 'long', '#201512', '#d9534f'), 'ascuo'],
      ['Álex', 'Ejecutivo de cuentas', 'Constante y ordenado. Lleva cada conversación apuntada.', 0, look('#c98d62', 'side', '#5a3320', '#4f8cff', 'beard'), 'lumo'],
      ['Elena', 'Responsable de finanzas', 'Prudente y precisa. Enseña los números con su contexto.', 1, look('#e8b48c', 'bun', '#3b2a20', '#5b8a72', 'glasses'), 'nubi'],
      ['Tomás', 'Analista financiero', 'Minucioso y escéptico. Repasa dos veces antes de firmar.', 1, look('#f1c9a5', 'short', '#6b4a2f', '#ff9f43'), 'bitxo'],
    ],
  },
];

export function seed() {
  if (store.setting('seeded', false)) return;
  const slot = Number(process.env.OFFICE_SLOT ?? 0);
  const staff = STAFF[slot % STAFF.length];
  const mock = store.saveProvider({
    name: 'Cerebro simulado', kind: 'mock', baseUrl: '', apiKey: '', model: '', command: '',
  });
  store.setSetting('defaultProviderId', mock.id);
  store.setSetting('playerName', 'Jefe');
  store.setSetting('playerAppearance', look('#f1c9a5', 'side', '#3b2a20', '#2f3e5c', 'glasses'));
  if (slot > 0) store.setSetting('playerCompanion', { species: 'lumo', name: SPECIES.lumo });

  const teams = staff.teams.map(([name, color, mission]) => store.saveTeam({ name, color, mission, leadId: null }));
  const leads: (string | null)[] = [null, null];
  staff.people.forEach(([name, role, personality, team, appearance, species], desk) => {
    const id = randomUUID();
    store.saveAgent({
      id, name, role, personality, instructions: '', providerId: null, model: '', teamId: teams[team].id, nodeId: null, appearance, desk,
      companion: { species, name: SPECIES[species] }, xp: 0, createdAt: Date.now() + desk,
    });
    leads[team] ??= id;
  });
  teams.forEach((team, i) => store.saveTeam({ ...team, leadId: leads[i] }));
  store.addFeed('La oficina abre sus puertas');
  store.setSetting('seeded', true);
}
