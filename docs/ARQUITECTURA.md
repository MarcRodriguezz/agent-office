# Arquitectura

## Servicios (docker-compose.yml)

| Servicio | Imagen | Responsabilidad |
|---|---|---|
| `web` | nginx + build de Vite | Sirve el frontend y hace de proxy de `/api` y `/ws` hacia `server` (`127.0.0.1:8080`). Un segundo puerto, el de enlace (`8090`), solo deja pasar `/link/`. |
| `server` | `agent-office-backend` (`node dist/server.js`) | API REST, WebSocket, simulación, orquestación de agentes y persistencia en SQLite. |
| `worker` | `agent-office-backend` (`node dist/worker.js`) | Consume la cola `llm` y ejecuta las llamadas a los proveedores. |
| `redis` | `redis:7-alpine` | Backend de la cola BullMQ. |

`server` y `worker` comparten imagen y código (`backend/`), con distinto comando. Volúmenes: `office-data` (SQLite), `workspace` (directorio de trabajo de los CLIs) y `agent-home` (sesiones de Claude Code y Codex).

`docker-compose.node.yml` levanta un **servidor remoto**: la misma imagen con `worker.js` y las variables `OFFICE_URL` y `NODE_TOKEN`. No usa Redis ni base de datos.

## Backend (`backend/src`)

| Archivo | Qué contiene |
|---|---|
| `server.ts` | Arranque, rutas REST y endpoint WebSocket. |
| `brain.ts` | El «cerebro» de la oficina: runtimes de agentes, chat, tareas, delegación en equipo, entregas, vida ociosa, contratar/despedir. |
| `sim.ts` | Actores (jugador y agentes), bucle de simulación (80 ms), movimiento, bocadillos y difusión del estado. |
| `map.ts` | Mapa de la oficina (paredes, salas, muebles, mesas, puntos de interés) y búsqueda de caminos (BFS). |
| `llm.ts` | Cliente de la cola: encola un trabajo, espera el resultado y publica el estado de los trabajos. |
| `worker.ts` | Proceso worker. En la oficina consume la cola de BullMQ; con `NODE_TOKEN` actúa como servidor remoto. |
| `node-client.ts` | Lado del worker: conexión con la oficina, ejecución de trabajos remotos, estado de las sesiones de los CLIs y terminal de inicio de sesión. |
| `nodes.ts` | Lado de la oficina: registro de servidores conectados, envío de trabajos y relevo del terminal de inicio de sesión. |
| `offices.ts` | Enlace entre oficinas: invitaciones, conexión, directorio compartido y encargos remotos. |
| `providers.ts` | Adaptadores de proveedor: Anthropic, compatible OpenAI, Claude Code, Codex, comando propio y simulado. |
| `db.ts` | Esquema y acceso a SQLite (`node:sqlite`). |
| `seed.ts` | Datos iniciales (proveedor simulado, dos departamentos, cinco agentes). |
| `companions.ts` | Especies de compis, niveles (100 de experiencia por nivel) y fases de evolución. |
| `settings.ts` | Ajustes del jefe: nombre, aspecto, compi, experiencia y proveedor por defecto. |
| `hub.ts` | Registro de sockets y difusión de mensajes. |
| `types.ts` | Tipos compartidos por server y worker. |

### Modelo de datos

- **providers**: nombre, tipo (`mock`, `anthropic`, `openai`, `claude-code`, `codex`, `cli`), URL base, API key, modelo, comando.
- **teams**: nombre, color, misión, responsable (`lead_id`).
- **agents**: nombre, puesto, personalidad, instrucciones, proveedor y modelo propios (opcionales), departamento, aspecto (JSON), compi (especie y mote), experiencia, mesa.
- **messages**: conversación jefe ↔ agente.
- **tasks**: encargo, estado (`queued`, `working`, `delegating`, `done`, `failed`), resultado y `parent_id` para subtareas.
- **feed**: eventos de la oficina.
- **settings**: nombre, aspecto, compi y experiencia del jefe, proveedor por defecto, nombre e identificador de la oficina y dirección de enlace.
- **nodes**: servidores remotos (nombre y token).
- **peers**: oficinas conectadas (nombre, dirección, token y sentido de la conexión).
- **remote_tasks**: encargos enviados a otras oficinas y su resultado.

Los agentes guardan además `node_id` (dónde se ejecutan) y las tareas `origin` (oficina que las encargó, si vienen de fuera).

### Simulación

El servidor es la autoridad. Cada 80 ms mueve a los actores por su camino y, si algo ha cambiado, difunde por WebSocket una instantánea (`state`) con posición, orientación, estado y bocadillo de cada actor. El cliente interpola. El jugador es un actor más: el navegador solo envía «quiero ir a esta celda / a este agente / a este mueble» y el servidor calcula el camino.

### Runtime de un agente

Cada agente tiene una **cadena serie de acciones** (`enqueue`): tareas, reuniones y visitas se ejecutan de una en una, en orden. Las esperas interrumpibles (descansos, visitas al despacho) se cortan cuando llega trabajo nuevo. El chat va por fuera de la cadena para que un agente pueda contestarte aunque esté ocupado.

Cuando la cadena queda vacía, el agente vuelve a su mesa y, pasado un rato, hace vida de oficina (café, charla con un compañero, paseo). Esa vida ociosa está guionizada: **no gasta tokens**.

### Flujo de una tarea

```
encargo (chat con [[TAREA: …]], formulario o encargo a departamento)
  └─ el agente va a su mesa
      ├─ ¿es responsable de un departamento y la tarea es de primer nivel?
      │    ├─ LLM «plan»  → JSON con subtareas por miembro
      │    ├─ reunión en la sala (todos caminan hasta allí)
      │    ├─ cada miembro hace su subtarea (LLM «task») y se la lleva al responsable
      │    └─ LLM «synth» → resultado integrado
      └─ si no: LLM «task» → resultado
  └─ camina hasta donde estés, te lo entrega (mensaje + aviso) y vuelve a su mesa
```

Cada llamada al LLM es un trabajo en la cola `llm` de BullMQ. `server` lo encola y espera (`waitUntilFinished`); `worker` lo ejecuta con el proveedor que corresponda.

### Servidores remotos

Cada worker abre un WebSocket hacia la oficina: el local a `/internal/node` (no publicado) y los remotos a `/link/node?token=…`. Por ese canal informa de su estado (CLIs instalados y sesión iniciada) y recibe órdenes.

`complete()` en `llm.ts` decide la ruta de cada trabajo: si el agente tiene un servidor remoto asignado, se le envía por su WebSocket y se espera el resultado; si no, va a la cola de BullMQ como siempre. Si el servidor está desconectado, el trabajo falla con un mensaje claro en lugar de ejecutarse en otro sitio.

### Inicio de sesión en los CLIs

La interfaz pide una acción de una lista cerrada (`claude-login`, `claude-logout`, `codex-login`, `codex-logout`). La oficina la reenvía al servidor elegido, que lanza el comando dentro de un pseudoterminal (`script`) y transmite la salida; lo que escribe el usuario (el código de autorización) viaja de vuelta. Al terminar, el servidor vuelve a comprobar el estado de las sesiones.

### Enlace entre oficinas

La oficina que se une abre un WebSocket a `/link/office?token=…` de la que invitó; el canal es simétrico y se reintenta solo. Mensajes: `hello` (identidad), `directory` (personas y departamentos), `task` (encargo), `task-update` (aceptado, terminado o fallido), `task-status` (reconciliación tras una caída) y `bye`.

Un encargo recibido se convierte en una tarea local con `origin`; el agente la hace igual que cualquier otra (reparto en equipo incluido) y, en lugar de llevársela al jefe local, la «envía» desde la entrada. En la oficina que lo pidió, la llegada del resultado crea un actor visitante con el aspecto de quien hizo el trabajo, que entra, lo entrega y se va.

### API

| Método y ruta | Uso |
|---|---|
| `GET /api/bootstrap` | Estado completo inicial (mapa, actores, agentes, departamentos, proveedores, ajustes, tareas, feed, trabajos). |
| `POST/PATCH/DELETE /api/agents[/:id]` | Contratar, editar, despedir. |
| `GET /api/agents/:id/messages`, `POST /api/agents/:id/chat` | Conversación. |
| `POST /api/agents/:id/tasks` | Encargar una tarea. |
| `POST /api/agents/:id/summon`, `/dismiss` | Llamar al despacho / mandar a su mesa. |
| `POST/PATCH/DELETE /api/teams[/:id]`, `POST /api/teams/:id/tasks` | Departamentos y encargos de equipo. |
| `POST/PATCH/DELETE /api/providers[/:id]`, `POST /api/providers/:id/test` | Proveedores y prueba de conexión. |
| `PATCH /api/settings` | Perfil del jefe, proveedor por defecto, nombre de la oficina y dirección de enlace. |
| `POST/DELETE /api/nodes[/:id]`, `GET /api/nodes/:id/setup`, `POST /api/nodes/:id/refresh` | Servidores remotos. |
| `POST /api/offices/invite`, `/join`, `DELETE /api/offices/:id`, `POST /api/offices/:id/tasks` | Conexión entre oficinas y encargos remotos. |
| `WS /link/node`, `WS /link/office`, `GET /link/health` | Puerto de enlace: servidores remotos y otras oficinas (con token). |
| `GET /api/tasks`, `GET /api/jobs` | Tareas y trabajos en segundo plano. |
| `WS /ws` | Servidor → cliente: `state`, `agents`, `teams`, `providers`, `settings`, `message`, `task`, `feed`, `jobs`, `delivery`, `levelup`, `arrived`, `nodes`, `offices`, `visitors`, `dialog`, `term`, `term-exit`. Cliente → servidor: `go`, `step` (teclado), `say`, `term-start`, `term-input`, `term-kill`. |

### Experiencia y niveles

`brain.ts` suma experiencia al agente cuando responde, entrega una tarea o coordina a su equipo, y al jefe cuando recibe una entrega. Si cambia el nivel, difunde `levelup` (con `evolved` si además cambia de fase) y lo anota en el feed. El cliente pinta el efecto sobre el personaje.

Los compis no existen en la simulación del servidor: el cliente los hace seguir a su dueño manteniéndolos a una distancia fija («correa») de su posición interpolada.

## Frontend (`web/src`)

| Archivo | Qué contiene |
|---|---|
| `game/OfficeCanvas.tsx` | Bucle de render, cámara, clics y hover. |
| `game/draw.ts` | Suelos, paredes y muebles (dibujados por código, sin assets). |
| `game/character.ts` | Personajes y caras procedurales a partir del aspecto; retratos. |
| `game/creature.ts` | Las ocho especies de compis y su dibujo en tres fases. |
| `store.ts` | Estado global mínimo (`useSyncExternalStore`) y `world` (actores interpolados, fuera de React). |
| `net.ts` | REST, WebSocket con reconexión y acciones (`go`, `selectAgent`). |
| `ui/*` | Barra superior, lista de equipo, panel del agente, editor de agente y aspecto, departamentos, tareas, ajustes y proveedores. `ui/Companions.tsx` reúne la elección inicial, el álbum, la barra de experiencia y el cuadro de diálogo. `ui/Servers.tsx` muestra los servidores y el inicio de sesión; `ui/OfficesModal.tsx`, las oficinas conectadas. |

El orden de pintado es por profundidad (coordenada Y de la base de cada pared, mueble o personaje), lo que da la sensación de vista 3/4: un agente sentado queda detrás de su mesa y quien está al norte de una pared queda tapado por ella.
