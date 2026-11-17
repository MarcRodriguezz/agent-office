import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { store } from './db.js';
import { hub } from './hub.js';
import { addFunRoom, loadLayout } from './map.js';
import { seed } from './seed.js';
import { snapshot, startSim } from './sim.js';
import { initOffice } from './brain.js';
import { closeStaleMeetings } from './meetings.js';
import { attachNode, dropClient, LOCAL, nodeByToken } from './nodes.js';
import { acceptOffice, startOffices } from './offices.js';
import { clientMessage, registerRoutes } from './routes.js';
import { settings } from './settings.js';

seed();
loadLayout(store.setting('layout', null));
if (store.setting('layout', null) && !store.setting('funRoomOffered', false)) {
  const layout = addFunRoom();
  if (layout) store.setSetting('layout', layout);
  store.setSetting('funRoomOffered', true);
}
store.failUnfinishedTasks();
closeStaleMeetings();
initOffice();
startSim();
startOffices();

const app = Fastify({ logger: { level: 'warn' } });
await app.register(websocket);
registerRoutes(app);

app.get('/link/health', async () => ({ ok: true, office: settings().officeName }));

app.get('/internal/node', { websocket: true }, (socket) => attachNode(LOCAL, socket));

app.get('/link/node', { websocket: true }, (socket, req) => {
  const token = String((req.query as { token?: string }).token ?? '').slice(0, 200);
  const node = nodeByToken(token);
  if (!node) socket.close(4401);
  else attachNode(node.id, socket);
});

app.get('/link/office', { websocket: true }, (socket, req) =>
  acceptOffice(String((req.query as { token?: string }).token ?? '').slice(0, 200), socket));

app.get('/ws', { websocket: true }, (socket) => {
  hub.add(socket);
  hub.send(socket, { type: 'state', actors: snapshot() });
  socket.on('close', () => dropClient(socket));
  socket.on('message', (raw: Buffer) => {
    try {
      clientMessage(socket, JSON.parse(raw.toString()));
    } catch {
      return;
    }
  });
});

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
console.log('servidor de la oficina en marcha');
