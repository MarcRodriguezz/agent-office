# Arquitectura

## Servicios (docker-compose.yml)

| Servicio | Imagen | Responsabilidad |
|---|---|---|
| `web` | nginx + build de Vite | Sirve el frontend y reparte las peticiones (`127.0.0.1:8080`): `/api/hub` va a la centralita y `/o/<puerto>/api` y `/o/<puerto>/ws` a la oficina de ese puerto. Un segundo puerto, el de enlace (`8090`), solo deja pasar `/o/<puerto>/link/`. |
| `server` | `agent-office-backend` (`node dist/gateway.js`) | La centralita y, como procesos hijos, una oficina por puerto (3101, 3102…): API REST, WebSocket, simulación, orquestación de agentes y su SQLite. |
| `worker` | `agent-office-backend` (`node dist/worker.js`) | Consume la cola `llm` y ejecuta las llamadas a los proveedores. |
| `redis` | `redis:7-alpine` | Backend de la cola BullMQ. |

`server` y `worker` comparten imagen y código (`backend/`), con distinto comando. Volúmenes: `office-data` (SQLite), `workspace` (carpetas de los proyectos) y `agent-home` (sesiones de Claude Code, Codex y herramientas externas, y lo que se instala desde la oficina).

`docker-compose.node.yml` levanta un **servidor remoto**: la misma imagen con `worker.js` y las variables `OFFICE_URL` y `NODE_TOKEN`. No usa Redis ni base de datos.

## Backend (`backend/src`)

| Archivo | Qué contiene |
|---|---|
| `gateway.ts` | Centralita: registro de oficinas (`offices.json`), arranque y reinicio de un proceso `server.js` por oficina, y API `/api/hub` para listarlas, abrirlas, eliminarlas y enlazarlas. |
| `server.ts` | Una oficina: arranque, rutas REST y endpoint WebSocket. |
| `brain.ts` | El «cerebro» de la oficina: runtimes de agentes, chat, tareas, delegación en equipo, entregas, vida ociosa, contratar/despedir. |
| `sim.ts` | Actores (jugador y agentes), bucle de simulación (80 ms), movimiento, bocadillos y difusión del estado. |
| `map.ts` | Plano de la oficina como datos (salas y puertas), su compilación a paredes, muebles, mesas y puntos de interés, su validación y la búsqueda de caminos (BFS). |
| `llm.ts` | Cliente de la cola: encola un trabajo, espera el resultado y publica el estado de los trabajos. |
| `worker.ts` | Proceso worker. En la oficina consume la cola de BullMQ; con `NODE_TOKEN` actúa como servidor remoto. |
| `node-client.ts` | Lado del worker: conexión con la oficina, ejecución de trabajos remotos, estado de las sesiones de los CLIs y terminal de inicio de sesión. |
| `nodes.ts` | Lado de la oficina: registro de servidores conectados, envío de trabajos y relevo del terminal de inicio de sesión. |
| `offices.ts` | Enlace entre oficinas: invitaciones, conexión, directorio compartido y encargos remotos. |
| `providers.ts` | Adaptadores de proveedor: Anthropic, compatible OpenAI, Claude Code, Codex, comando propio y simulado. Traducen los permisos del agente y retoman su sesión. |
| `agent-tools.ts` | Herramientas que la oficina da a los modelos por API (leer, buscar, escribir, ejecutar), limitadas a la carpeta del proyecto según los permisos. |
| `sessions.ts` | Sesiones de trabajo por agente y proyecto, y lo que cada trabajo recibe del agente (`workFor`: carpeta, permisos, credenciales y sesión). |
| `tools.ts` | Catálogo de herramientas externas (CLIs de los cerebros, GitHub, Cloudflare, Vercel, Netlify) con sus comandos de instalación e inicio de sesión. |
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

- **projects**: nombre, carpeta (relativa a `/workspace`) y descripción.
- **connections**: herramienta externa, comando y credenciales (variables de entorno, en JSON).
- **sessions**: agente, proyecto, tipo de cerebro, servidor, id de la sesión en el CLI, estado (`open` o `closed`), título, número de turnos e historial reciente.

Los agentes guardan además `node_id` (dónde se ejecutan), `project_id`, `access` (`read`, `edit` o `full`) y `connections` (ids), y las tareas `origin` (oficina que las encargó, si vienen de fuera).

### Simulación

El servidor es la autoridad. Cada 80 ms mueve a los actores por su camino y, si algo ha cambiado, difunde por WebSocket una instantánea (`state`) con posición, orientación, estado y bocadillo de cada actor. El cliente interpola. El jugador es un actor más: el navegador solo envía «quiero ir a esta celda / a este agente / a este mueble» y el servidor calcula el camino.

### Runtime de un agente

Cada agente tiene una **cadena serie de acciones** (`enqueue`): tareas, reuniones y visitas se ejecutan de una en una, en orden. Las esperas interrumpibles (descansos, visitas al despacho) se cortan cuando llega trabajo nuevo. El chat va por fuera de esa cadena, pero comparte con las tareas la **cadena de pensamiento** (`think`): las llamadas que usan la sesión del agente van de una en una, así que si le hablas mientras trabaja te contesta al terminar.

### Trabajo, permisos y sesiones

Cada llamada al LLM lleva un `work` con la carpeta del proyecto, los permisos, las credenciales de sus conexiones (como variables de entorno), los comandos que puede ejecutar y, en chat y tareas, la sesión. El worker sigue sin estado: crea la carpeta si no existe y ejecuta ahí el CLI o el bucle de herramientas. Lo que guarda una sesión vive en dos sitios: el historial reciente en la base de datos de la oficina y, para Claude Code y Codex, su propia sesión en `agent-home` del servidor.

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

### Instalación e inicio de sesión de herramientas

La interfaz pide una herramienta del catálogo y una acción (`login`, `logout` o `install`). La oficina comprueba que el catálogo la define y la reenvía al servidor elegido, que saca el comando del mismo catálogo, lo lanza dentro de un pseudoterminal (`script`) y transmite la salida; lo que escribe el usuario (el código de autorización) viaja de vuelta. Al terminar, el servidor vuelve a comprobar qué herramientas tiene instaladas y con sesión. Lo instalado va a `/home/node/.local` y las sesiones a `/home/node`, ambos en el volumen `agent-home`.

### Enlace entre oficinas

La oficina que se une abre un WebSocket a `/link/office?token=…` de la que invitó; el canal es simétrico y se reintenta solo. Mensajes: `hello` (identidad), `directory` (personas y departamentos), `task` (encargo), `task-update` (aceptado, terminado o fallido), `task-status` (reconciliación tras una caída) y `bye`.

Un encargo recibido se convierte en una tarea local con `origin`; el agente la hace igual que cualquier otra (reparto en equipo incluido) y, en lugar de llevársela al jefe local, la «envía» desde la entrada. En la oficina que lo pidió, la llegada del resultado crea un actor visitante con el aspecto de quien hizo el trabajo, que entra, lo entrega y se va.

### API

Las rutas de una oficina se sirven bajo `/o/<puerto>` (por ejemplo `GET /o/3101/api/bootstrap`). Las de la centralita no llevan prefijo.

| Método y ruta | Uso |
|---|---|
| `GET/POST /api/hub/offices`, `DELETE /api/hub/offices/:id` | Centralita: listar, abrir y eliminar oficinas. |
| `POST/DELETE /api/hub/links` | Centralita: enlazar o desenlazar dos oficinas de la instalación. |
| `PUT /api/layout` | Aplicar un plano (`{layout}`) o volver al de serie (`{reset: true}`). Responde con el mapa compilado o `400` con el motivo. |
| `GET /api/summary` | Resumen de la oficina para la centralita. |
| `GET /api/bootstrap` | Estado completo inicial (mapa, actores, agentes, departamentos, proveedores, ajustes, tareas, feed, trabajos, proyectos, conexiones, sesiones y catálogo de herramientas). |
| `POST/PATCH/DELETE /api/agents[/:id]` | Contratar, editar, despedir. |
| `GET /api/agents/:id/messages`, `POST /api/agents/:id/chat` | Conversación. |
| `POST /api/agents/:id/tasks` | Encargar una tarea. |
| `POST /api/agents/:id/summon`, `/dismiss` | Llamar al despacho / mandar a su mesa. |
| `POST /api/agents/:id/session/new` | Archivar la sesión en curso del agente para que empiece de cero. |
| `POST/PATCH/DELETE /api/projects[/:id]` | Proyectos (la carpeta se deriva del nombre y no cambia). |
| `POST/PATCH/DELETE /api/connections[/:id]` | Conexiones con herramientas externas. Las credenciales entran pero nunca salen. |
| `POST /api/sessions/:id/open`, `/close`, `DELETE /api/sessions/:id` | Continuar, archivar u olvidar una sesión. |
| `POST/PATCH/DELETE /api/teams[/:id]`, `POST /api/teams/:id/tasks` | Departamentos y encargos de equipo. |
| `POST/PATCH/DELETE /api/providers[/:id]`, `POST /api/providers/:id/test` | Proveedores y prueba de conexión. |
| `PATCH /api/settings` | Perfil del jefe, proveedor por defecto, nombre de la oficina y dirección de enlace. |
| `POST/DELETE /api/nodes[/:id]`, `GET /api/nodes/:id/setup`, `POST /api/nodes/:id/refresh` | Servidores remotos. |
| `POST /api/offices/invite`, `/join`, `DELETE /api/offices/:id`, `POST /api/offices/:id/tasks` | Conexión entre oficinas y encargos remotos. |
| `WS /link/node`, `WS /link/office`, `GET /link/health` | Puerto de enlace: servidores remotos y otras oficinas (con token). |
| `GET /api/tasks`, `GET /api/jobs` | Tareas y trabajos en segundo plano. |
| `WS /ws` | Servidor → cliente: `state`, `agents`, `teams`, `providers`, `settings`, `message`, `task`, `feed`, `jobs`, `delivery`, `levelup`, `arrived`, `nodes`, `offices`, `visitors`, `projects`, `connections`, `sessions`, `dialog`, `term`, `term-exit`. Cliente → servidor: `go`, `step` (teclado), `say`, `term-start`, `term-input`, `term-kill`. |

### Experiencia y niveles

`brain.ts` suma experiencia al agente cuando responde, entrega una tarea o coordina a su equipo, y al jefe cuando recibe una entrega. Si cambia el nivel, difunde `levelup` (con `evolved` si además cambia de fase) y lo anota en el feed. El cliente pinta el efecto sobre el personaje.

Los compis no existen en la simulación del servidor: el cliente los hace seguir a su dueño manteniéndolos a una distancia fija («correa») de su posición interpolada.

### Varias oficinas en una instalación

`gateway.ts` guarda en `offices.json` el puerto y la base de datos de cada oficina y lanza un `server.js` por cada una, con `PORT`, `DB_PATH` y `LINK_PREFIX=/o/<puerto>`. La primera usa la base de datos original, así que una instalación anterior conserva sus datos. Las oficinas no comparten estado: la cola de BullMQ es común, pero cada proceso espera solo sus trabajos.

El worker pregunta a la centralita qué oficinas hay y abre con cada una su conexión de servidor local, de modo que la sesión de Claude Code o Codex iniciada desde una oficina sirve para todas.

Enlazar dos oficinas de la misma instalación usa el mismo canal que con una de fuera: la centralita pide un token a una (`/internal/invite`) y se lo entrega a la otra (`/internal/join`) con la dirección interna `http://127.0.0.1:<puerto>`. Las rutas `/internal` no salen por nginx.

### Plano editable

El plano es un `Layout` (`w`, `h`, `rooms`, `doors`) guardado en los ajustes de la oficina. `compile` lo convierte en lo que usa la simulación: muros alrededor de cada sala, puertas válidas, muebles según el tipo y tamaño de la sala (`KINDS`), mesas y puntos de interés. `check` rechaza un plano fuera de límites, con salas solapadas, sin las salas obligatorias, con salas inaccesibles o con menos mesas que personas; antes intenta abrir puertas en los muros compartidos.

Al aplicar un plano (`applyLayout` en `brain.ts`) se recolocan los actores que hayan quedado dentro de un muro, se recalculan los caminos en curso y se reparten las mesas: primero el despacho propio, luego las zonas del departamento de cada persona, luego las libres.

## Frontend (`web/src`)

| Archivo | Qué contiene |
|---|---|
| `game/OfficeCanvas.tsx` | Bucle de render, cámara, clics y hover. |
| `game/architect.ts` | Modo arquitecto: arrastre, redimensionado, puertas, alta de salas y deshacer. Cada cambio se envía entero al servidor, que valida y difunde el plano. |
| `game/draw.ts` | Suelos, paredes y muebles (dibujados por código, sin assets). |
| `game/character.ts` | Personajes y caras procedurales a partir del aspecto; retratos. |
| `game/creature.ts` | Las ocho especies de compis y su dibujo en tres fases. |
| `game/daylight.ts` | Luz según la hora del navegador: fase del día, cielo de las ventanas, capa de noche y focos de luz. |
| `store.ts` | Estado global mínimo (`useSyncExternalStore`) y `world` (actores interpolados, fuera de React). |
| `net.ts` | REST y WebSocket contra la oficina elegida (`/o/<puerto>`), API de la centralita, cambio de oficina y acciones (`go`, `selectAgent`). |
| `ui/*` | Barra superior, lista de equipo, panel del agente, editor de agente y aspecto, departamentos, tareas, ajustes y proveedores. `ui/Companions.tsx` reúne la elección inicial, el álbum, la barra de experiencia y el cuadro de diálogo. `ui/Servers.tsx` muestra los servidores y el inicio de sesión guiado de cualquier herramienta; `ui/Tools.tsx`, las conexiones; `ui/ProjectsModal.tsx`, el archivo de proyectos y sesiones; `ui/OfficesModal.tsx`, el panel de oficinas; `ui/Architect.tsx`, el panel del modo arquitecto. |

El orden de pintado es por profundidad (coordenada Y de la base de cada pared, mueble o personaje), lo que da la sensación de vista 3/4: un agente sentado queda detrás de su mesa y quien está al norte de una pared queda tapado por ella.
