# Arquitectura

## Servicios (docker-compose.yml)

| Servicio | Imagen | Responsabilidad |
|---|---|---|
| `web` | nginx + build de Vite | Sirve el frontend y hace de proxy de `/api` y `/ws` hacia `server`. Único puerto publicado (`127.0.0.1:8080`). |
| `server` | `agent-office-backend` (`node dist/server.js`) | API REST, WebSocket, simulación, orquestación de agentes y persistencia en SQLite. |
| `worker` | `agent-office-backend` (`node dist/worker.js`) | Consume la cola `llm` y ejecuta las llamadas a los proveedores. |
| `redis` | `redis:7-alpine` | Backend de la cola BullMQ. |

`server` y `worker` comparten imagen y código (`backend/`), con distinto comando. Volúmenes: `office-data` (SQLite) y `workspace` (directorio de trabajo de los CLIs).

## Backend (`backend/src`)

| Archivo | Qué contiene |
|---|---|
| `server.ts` | Arranque, rutas REST y endpoint WebSocket. |
| `brain.ts` | El «cerebro» de la oficina: runtimes de agentes, chat, tareas, delegación en equipo, entregas, vida ociosa, contratar/despedir. |
| `sim.ts` | Actores (jugador y agentes), bucle de simulación (80 ms), movimiento, bocadillos y difusión del estado. |
| `map.ts` | Mapa de la oficina (paredes, salas, muebles, mesas, puntos de interés) y búsqueda de caminos (BFS). |
| `llm.ts` | Cliente de la cola: encola un trabajo, espera el resultado y publica el estado de los trabajos. |
| `worker.ts` | Proceso worker de BullMQ. |
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
- **settings**: nombre, aspecto, compi y experiencia del jefe, proveedor por defecto.

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
| `PATCH /api/settings` | Perfil del jefe y proveedor por defecto. |
| `GET /api/tasks`, `GET /api/jobs` | Tareas y trabajos en segundo plano. |
| `WS /ws` | Servidor → cliente: `state`, `agents`, `teams`, `providers`, `settings`, `message`, `task`, `feed`, `jobs`, `delivery`, `levelup`, `arrived`. Cliente → servidor: `go`, `step` (teclado), `say`. |

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
| `ui/*` | Barra superior, lista de equipo, panel del agente, editor de agente y aspecto, departamentos, tareas, ajustes y proveedores. `ui/Companions.tsx` reúne la elección inicial, el álbum, la barra de experiencia y el cuadro de diálogo. |

El orden de pintado es por profundidad (coordenada Y de la base de cada pared, mueble o personaje), lo que da la sensación de vista 3/4: un agente sentado queda detrás de su mesa y quien está al norte de una pared queda tapado por ella.
