import { randomUUID } from 'node:crypto';
import { store } from './db.js';
import { SPECIES } from './companions.js';
import type { Agent, Appearance } from './types.js';
import { m, N, t, tr } from './i18n.js';

const look = (skin: string, hair: string, hairColor: string, shirt: string, accessory = 'none', eyes = 'normal'): Appearance =>
  ({ skin, hair, hairColor, shirt, accessory, eyes });

interface Member {
  name: string;
  role: string;
  personality: string;
  instructions?: string;
  team: number;
  look: Appearance;
  species: string;
  xp?: number;
}

interface Template {
  id: string;
  name: string;
  summary: string;
  teams: [string, string, string][];
  people: Member[];
}

const MANAGER = -1;

export const TEMPLATES: Template[] = [
  {
    id: 'dev',
    name: N('Equipo de desarrollo'),
    summary: N('Una manager, tres desarrolladores por rango y dos personas de plataforma.'),
    teams: [
      [N('Desarrollo'), '#1c5fa8', N('Construir el producto: diseño técnico, código, pruebas y revisiones.')],
      [N('Plataforma'), '#2fa37a', N('Que el código llegue a producción y se mantenga en pie: repositorios, CI/CD, infraestructura y despliegues.')],
    ],
    people: [
      {
        name: 'Clara', role: 'Engineering manager', team: MANAGER, species: 'lumo', xp: 520,
        personality: N('Clara, ordenada y exigente con las prioridades. Protege al equipo del ruido y deja siempre por escrito quién hace qué.'),
        instructions: N('Diriges toda la oficina. Ante un encargo, decide a quién le corresponde cada parte según su puesto y su rango, reparte solo lo necesario e integra el resultado en una entrega única con decisiones, riesgos y siguientes pasos.'),
        look: look('#e8b48c', 'bun', '#3b2a20', '#2f3e5c', 'glasses'),
      },
      {
        name: 'Víctor', role: N('Desarrollador sénior · tech lead'), team: 0, species: 'bitxo', xp: 450,
        personality: N('Pragmático y con criterio. Piensa primero en la arquitectura y en lo que costará mantener.'),
        instructions: N('Eres el rango más alto de desarrollo. Te tocan el diseño técnico, las decisiones de arquitectura y la revisión del trabajo de los demás. Justifica cada decisión con sus alternativas y deja claro qué queda fuera de alcance.'),
        look: look('#c98d62', 'short', '#1f1a17', '#1c5fa8', 'beard'),
      },
      {
        name: 'Paula', role: N('Desarrolladora de nivel medio'), team: 0, species: 'nubi', xp: 220,
        personality: N('Constante y cuidadosa. Le gusta el código legible y con pruebas.'),
        instructions: N('Implementas funcionalidades completas de principio a fin. Entrega código que se pueda copiar y ejecutar, con sus pruebas y una nota breve de cómo comprobarlo. Si una decisión es de arquitectura, propónla y márcala para revisión del sénior.'),
        look: look('#f6d4b8', 'long', '#b5562b', '#e0668a'),
      },
      {
        name: 'Leo', role: N('Desarrollador júnior'), team: 0, species: 'brotin', xp: 0,
        personality: N('Curioso y con ganas. Pregunta poco y lo apunta todo.'),
        instructions: N('Te tocan tareas pequeñas y bien delimitadas: correcciones, pruebas, documentación y scripts. Explica paso a paso lo que has hecho, di qué supuestos has tomado y qué no tienes claro para que te lo revisen.'),
        look: look('#f1c9a5', 'cap', '#6b4a2f', '#38b6c9', 'none', 'happy'),
      },
      {
        name: 'Rubén', role: N('Ingeniero DevOps e infraestructura'), team: 1, species: 'ascuo', xp: 310,
        personality: N('Tranquilo y desconfiado de lo que no está medido. Automatiza todo lo que hace dos veces.'),
        instructions: N('Llevas Docker, redes, servidores, nube, observabilidad y copias de seguridad. Entrega configuraciones y comandos listos para usar, con el plan de vuelta atrás y lo que hay que vigilar después.'),
        look: look('#8d5a3b', 'curly', '#201512', '#2fa37a', 'headphones'),
      },
      {
        name: 'Aina', role: N('Ingeniera de CI/CD y GitHub'), team: 1, species: 'lumo', xp: 140,
        personality: N('Meticulosa con los procesos. Cree que una buena rama y un buen pipeline ahorran discusiones.'),
        instructions: N('Llevas los repositorios y la entrega: estrategia de ramas, pull requests, GitHub Actions, versiones y permisos. Entrega los ficheros de workflow completos y explica qué dispara cada uno.'),
        look: look('#e8b48c', 'side', '#5a3320', '#e0a13a'),
      },
    ],
  },
  {
    id: 'product',
    name: N('Producto y marketing'),
    summary: N('Tres personas de producto y dos de marketing.'),
    teams: [
      [N('Producto'), '#4f8cff', N('Diseñar y construir el producto: análisis, especificación y desarrollo.')],
      [N('Marketing'), '#ff7a59', N('Dar a conocer el producto: mensajes, contenidos y campañas.')],
    ],
    people: [
      { name: 'Lucía', role: N('Responsable de producto'), personality: N('Organizada, resolutiva y cercana. Le gusta repartir bien el trabajo.'), team: 0, look: look('#e8b48c', 'long', '#5a3320', '#d9534f'), species: 'lumo' },
      { name: 'Dani', role: N('Desarrollador full-stack'), personality: N('Pragmático y directo. Prefiere soluciones simples que funcionen.'), team: 0, look: look('#c98d62', 'short', '#1f1a17', '#2fa37a', 'headphones'), species: 'bitxo' },
      { name: 'Sara', role: N('Analista de investigación'), personality: N('Curiosa y rigurosa. Siempre contrasta los datos antes de concluir.'), team: 0, look: look('#f6d4b8', 'bun', '#b5562b', '#e0668a', 'glasses'), species: 'nubi' },
      { name: 'Nora', role: N('Responsable de marketing'), personality: N('Creativa, enérgica y con mucho olfato para el público.'), team: 1, look: look('#8d5a3b', 'curly', '#201512', '#ff9f43'), species: 'ascuo' },
      { name: 'Hugo', role: N('Redactor y diseñador'), personality: N('Detallista, con humor y buen gusto para las palabras.'), team: 1, look: look('#f1c9a5', 'cap', '#6b4a2f', '#38b6c9', 'beard', 'happy'), species: 'brotin' },
    ],
  },
  {
    id: 'support',
    name: N('Ingeniería y soporte'),
    summary: N('Dos personas de ingeniería y dos de atención al cliente.'),
    teams: [
      [N('Ingeniería'), '#2fa37a', N('Mantener los sistemas en pie: arquitectura, revisiones de código y despliegues.')],
      [N('Soporte'), '#e0a13a', N('Atender a los clientes: resolver incidencias y documentar las respuestas.')],
    ],
    people: [
      { name: 'Irene', role: N('Responsable de ingeniería'), personality: N('Metódica y tranquila. Explica las decisiones técnicas sin jerga.'), team: 0, look: look('#f1c9a5', 'bun', '#3b2a20', '#2fa37a', 'glasses'), species: 'bitxo' },
      { name: 'Pau', role: N('Ingeniero de plataforma'), personality: N('Meticuloso con la fiabilidad. Desconfía de lo que no está medido.'), team: 0, look: look('#c98d62', 'short', '#201512', '#38b6c9'), species: 'nubi' },
      { name: 'Marta', role: N('Responsable de soporte'), personality: N('Paciente y clara. Convierte un problema confuso en pasos concretos.'), team: 1, look: look('#e8b48c', 'long', '#b5562b', '#e0a13a'), species: 'lumo' },
      { name: 'Íker', role: N('Técnico de soporte'), personality: N('Rápido y amable. Siempre deja escrito cómo lo resolvió.'), team: 1, look: look('#8d5a3b', 'curly', '#1f1a17', '#e0668a', 'headphones', 'happy'), species: 'brotin' },
    ],
  },
  {
    id: 'sales',
    name: N('Ventas y finanzas'),
    summary: N('Dos personas de ventas y dos de finanzas.'),
    teams: [
      [N('Ventas'), '#d9534f', N('Encontrar clientes y cerrar acuerdos: propuestas, seguimiento y previsiones.')],
      [N('Finanzas'), '#5b8a72', N('Cuidar las cuentas: presupuestos, costes e informes.')],
    ],
    people: [
      { name: 'Carla', role: N('Responsable de ventas'), personality: N('Persuasiva y honesta. Prefiere perder una venta a prometer de más.'), team: 0, look: look('#f6d4b8', 'long', '#201512', '#d9534f'), species: 'ascuo' },
      { name: 'Álex', role: N('Ejecutivo de cuentas'), personality: N('Constante y ordenado. Lleva cada conversación apuntada.'), team: 0, look: look('#c98d62', 'side', '#5a3320', '#4f8cff', 'beard'), species: 'lumo' },
      { name: 'Elena', role: N('Responsable de finanzas'), personality: N('Prudente y precisa. Enseña los números con su contexto.'), team: 1, look: look('#e8b48c', 'bun', '#3b2a20', '#5b8a72', 'glasses'), species: 'nubi' },
      { name: 'Tomás', role: N('Analista financiero'), personality: N('Minucioso y escéptico. Repasa dos veces antes de firmar.'), team: 1, look: look('#f1c9a5', 'short', '#6b4a2f', '#ff9f43'), species: 'bitxo' },
    ],
  },
  { id: 'empty', name: N('Oficina vacía'), summary: N('Sin nadie: contratas tú a todo el equipo.'), teams: [], people: [] },
];

export const templateList = () => TEMPLATES.map(({ id, name, summary, people }) => ({ id, name: tr(name), summary: tr(summary), people: people.length }));

export const templateOf = (id: string) => TEMPLATES.find((t) => t.id === id);

export function staff(templateId: string): Agent[] {
  const template = templateOf(templateId) ?? TEMPLATES[0];
  const teams = template.teams.map(([name, color, mission]) => store.saveTeam({ name: tr(name), color, mission: tr(mission), leadId: null }));
  const leads: (string | null)[] = teams.map(() => null);
  let manager: string | null = null;
  const agents = template.people.map((p, desk) => {
    const id = randomUUID();
    if (p.team === MANAGER) manager ??= id;
    else leads[p.team] ??= id;
    return store.saveAgent({
      id, name: p.name, role: tr(p.role), personality: tr(p.personality), instructions: tr(p.instructions ?? ''), providerId: null, model: '',
      teamId: p.team === MANAGER ? null : teams[p.team].id, nodeId: null, projectId: null, access: 'read', connections: [], appearance: p.look, desk,
      companion: { species: p.species, name: SPECIES[p.species] }, xp: p.xp ?? 0, createdAt: Date.now() + desk,
    });
  });
  teams.forEach((team, i) => store.saveTeam({ ...team, leadId: leads[i] }));
  store.setSetting('managerId', manager);
  return agents;
}

export function seed() {
  if (store.setting('seeded', false)) return;
  const mock = store.saveProvider({
    name: t('Cerebro simulado'), kind: 'mock', baseUrl: '', apiKey: '', model: '', command: '',
  });
  store.setSetting('defaultProviderId', mock.id);
  store.setSetting('playerName', t('Jefe'));
  store.setSetting('playerAppearance', look('#f1c9a5', 'side', '#3b2a20', '#2f3e5c', 'glasses'));
  staff(process.env.OFFICE_TEMPLATE || 'dev');
  store.addFeed(m('La oficina abre sus puertas'));
  store.setSetting('seeded', true);
}
