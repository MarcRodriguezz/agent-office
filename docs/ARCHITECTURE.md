# Architecture

## Services (docker-compose.yml)

| Service | Image | Responsibility |
|---|---|---|
| `web` | nginx + Vite build | Serves the frontend and routes requests (`127.0.0.1:8080`): `/api/hub` goes to the gateway and `/o/<port>/api` and `/o/<port>/ws` to the office on that port. A second port, the link port (`8090`), only lets `/o/<port>/link/` through. |
| `server` | `agent-office-backend` (`node dist/gateway.js`) | The gateway and, as child processes, one office per port (3101, 3102…): REST API, WebSocket, simulation, agent orchestration and its SQLite. |
| `worker` | `agent-office-backend` (`node dist/worker.js`) | Consumes the `llm` queue and runs the provider calls. |
| `redis` | `redis:7-alpine` | BullMQ queue backend. |

`server` and `worker` share the image and code (`backend/`) with different commands. Volumes: `office-data` (SQLite), `workspace` (project folders) and `agent-home` (Claude Code, Codex and external tool sessions, plus whatever is installed from the office).

`docker-compose.node.yml` starts a **remote server**: the same image with `worker.js` and the `OFFICE_URL` and `NODE_TOKEN` variables. It uses no Redis and no database.

## Backend (`backend/src`)

| File | Contents |
|---|---|
| `gateway.ts` | Gateway: office registry (`offices.json`), starting and restarting one `server.js` process per office, and the `/api/hub` API to list, open, delete and link them. |
| `server.ts` | One office: startup, REST routes and WebSocket endpoint. |
| `brain.ts` | The office "brain": agent runtimes, chat, tasks, team delegation, deliveries, idle life, hiring/firing, and `gather` to bring several agents to one place. |
| `meetings.ts` | Multi-agent meetings and specs: gathering, turns, the boss stepping in, minutes and splitting the agreed work. |
| `party.ts` | Celebrations: everyone to the dance floor for a while. |
| `sim.ts` | Actors (player and agents), simulation loop (80 ms), movement, speech bubbles and state broadcast. |
| `map.ts` | Office floor plan as data (rooms and doors), its compilation to walls, furniture, desks and points of interest, its validation and path finding (BFS). |
| `llm.ts` | Queue client: enqueues a job, waits for the result and publishes job state. |
| `worker.ts` | Worker process. In the office it consumes the BullMQ queue; with `NODE_TOKEN` it acts as a remote server. |
| `node-client.ts` | Worker side: connection to the office, running remote jobs, CLI session status and the login terminal. |
| `nodes.ts` | Office side: registry of connected servers, sending jobs and relaying the login terminal. |
| `offices.ts` | Links between offices: invitations, connection, shared directory and remote jobs. |
| `providers.ts` | Provider adapters: Anthropic, OpenAI-compatible, Claude Code, Codex, custom command and mock. They translate the agent's permissions and resume its session. |
| `agent-tools.ts` | Tools the office gives to API models (read, search, write, run), limited to the project folder according to the permissions. |
| `sessions.ts` | Work sessions per agent and project, and what each job receives from the agent (`workFor`: folder, permissions, credentials and session). |
| `tools.ts` | Catalogue of external tools (brain CLIs, GitHub, Cloudflare, Vercel, Netlify) with their install and login commands. |
| `db.ts` | SQLite schema and access (`node:sqlite`). |
| `seed.ts` | Initial data (mock provider, two departments, five agents). |
| `companions.ts` | Compi species, levels (100 experience per level) and evolution stages. |
| `settings.ts` | Boss settings: name, appearance, compi, experience and default provider. |
| `hub.ts` | Socket registry and message broadcast. |
| `types.ts` | Types shared by server and worker. |

### Data model

- **providers**: name, kind (`mock`, `anthropic`, `openai`, `claude-code`, `codex`, `cli`), base URL, API key, model, command.
- **teams**: name, colour, mission, lead (`lead_id`).
- **agents**: name, role, personality, instructions, own provider and model (optional), department, appearance (JSON), compi (species and nickname), experience, desk.
- **messages**: boss ↔ agent conversation.
- **tasks**: job, status (`queued`, `working`, `delegating`, `done`, `failed`), result and `parent_id` for subtasks.
- **feed**: office events.
- **settings**: boss name, appearance, compi and experience, default provider, office name and id, link address and floor plan.
- **nodes**: remote servers (name and token).
- **peers**: linked offices (name, address, token and direction of the connection).
- **remote_tasks**: jobs sent to other offices and their result.
- **projects**: name, folder (relative to `/workspace`) and description.
- **connections**: external tool, command and credentials (environment variables, as JSON).
- **sessions**: agent, project, brain kind, server, CLI session id, status (`open` or `closed`), title, number of turns and recent history.
- **meetings**: the whole meeting as JSON: topic, context, goal (`discuss` or `spec`), attendees, turns, status (`gathering`, `talking`, `writing`, `done`, `failed`, `cancelled`), transcript, final document and the tasks it produced.

Agents also store `node_id` (where they run), `project_id`, `access` (`read`, `edit` or `full`) and `connections` (ids), and tasks store `origin` (the office that sent them, if they come from outside).

### Simulation

The server is the authority. Every 80 ms it moves actors along their path and, if something changed, broadcasts over WebSocket a snapshot (`state`) with each actor's position, facing, status and speech bubble. The client interpolates. The player is just another actor: the browser only sends "I want to go to this cell / this agent / this piece of furniture" and the server computes the path.

### An agent's runtime

Each agent has a **serial chain of actions** (`enqueue`): tasks, meetings, parties and visits run one at a time, in order. Interruptible waits (breaks, visits to your office) are cut short when new work arrives. Chat runs outside that chain, but shares with tasks the **thinking chain** (`think`): calls that use the agent's session run one at a time, so if you talk to them while they work they answer when they finish.

`gather(ids, spots, status)` puts one action in the chain of each agent: walk to a spot, take a status and wait until released. Meetings and parties use it; whoever is busy arrives when they finish their current work, and whoever arrives after the release does not move.

### Work, permissions and sessions

Each LLM call carries a `work` with the project folder, the permissions, the credentials of its connections (as environment variables), the commands it may run and, in chat and tasks, the session. The worker stays stateless: it creates the folder if missing and runs the CLI or the tool loop there. A session lives in two places: the recent history in the office database and, for Claude Code and Codex, their own session in the server's `agent-home`.

When the chain is empty, the agent goes back to its desk and, after a while, lives office life (coffee, a chat with a colleague, a walk). That idle life is scripted: **it spends no tokens**.

### Flow of a task

```
job (chat with [[TAREA: …]], form or department job)
  └─ the agent goes to its desk
      ├─ is it a department lead and a top-level task?
      │    ├─ LLM "plan"  → JSON with subtasks per member
      │    ├─ meeting in the room (everyone walks there)
      │    ├─ each member does its subtask (LLM "task") and takes it to the lead
      │    └─ LLM "synth" → combined result
      └─ otherwise: LLM "task" → result
  └─ walks to where you are, delivers it (message + notice) and goes back to its desk
```

Each LLM call is a job in the BullMQ `llm` queue. `server` enqueues it and waits (`waitUntilFinished`); `worker` runs it with the right provider.

### Meetings

```
the boss calls a meeting (topic, context, goal, attendees, turns)
  └─ gather: the attendees walk to the meeting room seats (up to 60 s)
  └─ for each turn and each attendee: LLM "meeting" with the transcript so far
       └─ the boss can add lines at any time; the next speaker reads them
  └─ the chair (manager > department lead > first attendee): LLM "minutes" → minutes or spec
  └─ every attendee stores the document in its session; everyone goes back to their desk
  └─ optional: LLM "plan" over the document → one task per attendee, with the document as context
```

Meeting turns are stateless calls (`ask`) with the agent's work context, so an attendee with a project can read its files while it speaks. Only one meeting can run at a time (there is one meeting room in the default plan) and the limits are in code: 2 to 8 attendees, 1 to 3 turns each, lines clipped at 1,500 characters and the last 40 lines in each prompt. A meeting interrupted by a restart is marked as failed.

### Remote servers

Each worker opens a WebSocket to the office: the local one to `/internal/node` (not published) and remote ones to `/link/node?token=…`. Through that channel it reports its status (installed CLIs and logins) and receives orders.

`complete()` in `llm.ts` decides the route of each job: if the agent has a remote server assigned, it is sent through its WebSocket and the result awaited; otherwise it goes to the BullMQ queue as usual. If the server is disconnected, the job fails with a clear message instead of running somewhere else.

### Installing and logging in to tools

The interface asks for a catalogue tool and an action (`login`, `logout` or `install`). The office checks that the catalogue defines it and forwards it to the chosen server, which takes the command from the same catalogue, runs it inside a pseudo-terminal (`script`) and streams the output; what the user types (the authorisation code) travels back. When it ends, the server checks again which tools are installed and logged in. Installs go to `/home/node/.local` and sessions to `/home/node`, both in the `agent-home` volume.

### Links between offices

The joining office opens a WebSocket to `/link/office?token=…` on the inviting one; the channel is symmetric and reconnects by itself. Messages: `hello` (identity), `directory` (people and departments), `task` (job), `task-update` (accepted, finished or failed), `task-status` (reconciliation after a drop) and `bye`.

A received job becomes a local task with `origin`; the agent does it like any other (team split included) and, instead of taking it to the local boss, "sends" it from the entrance. In the office that asked for it, the arrival of the result creates a visitor actor with the appearance of whoever did the work, who walks in, delivers it and leaves.

### API

An office's routes are served under `/o/<port>` (for example `GET /o/3101/api/bootstrap`). The gateway's have no prefix.

| Method and route | Use |
|---|---|
| `GET/POST /api/hub/offices`, `DELETE /api/hub/offices/:id` | Gateway: list, open and delete offices. |
| `POST/DELETE /api/hub/links` | Gateway: link or unlink two offices of the installation. |
| `PUT /api/layout` | Apply a floor plan (`{layout}`) or restore the default (`{reset: true}`). Answers with the compiled map or `400` with the reason. |
| `GET /api/summary` | Office summary for the gateway. |
| `GET /api/bootstrap` | Full initial state (map, actors, agents, departments, providers, settings, tasks, feed, jobs, projects, connections, sessions, tool catalogue, meetings and party). |
| `POST/PATCH/DELETE /api/agents[/:id]` | Hire, edit, fire. |
| `GET /api/agents/:id/messages`, `POST /api/agents/:id/chat` | Conversation. |
| `POST /api/agents/:id/tasks` | Give a task. |
| `POST /api/agents/:id/summon`, `/dismiss` | Call to your office / send back to its desk. |
| `POST /api/agents/:id/session/new` | Archive the agent's current session so it starts over. |
| `POST/PATCH/DELETE /api/projects[/:id]` | Projects (the folder is derived from the name and never changes). |
| `POST/PATCH/DELETE /api/connections[/:id]` | Connections to external tools. Credentials go in but never come out. |
| `POST /api/sessions/:id/open`, `/close`, `DELETE /api/sessions/:id` | Continue, archive or forget a session. |
| `POST /api/meetings` | Call a meeting (`title`, `brief`, `goal`, `agentIds`, `rounds`). `409` if another one is running. |
| `POST /api/meetings/:id/say`, `/finish`, `/cancel` | Step in, close the debate and write, or cancel. |
| `POST /api/meetings/:id/tasks`, `DELETE /api/meetings/:id` | Split the agreed work into tasks; delete a finished meeting. |
| `POST /api/party` | Start a celebration (or return the current one). |
| `POST/PATCH/DELETE /api/teams[/:id]`, `POST /api/teams/:id/tasks` | Departments and department jobs. |
| `POST/PATCH/DELETE /api/providers[/:id]`, `POST /api/providers/:id/test` | Providers and connection test. |
| `PATCH /api/settings` | Boss profile, default provider, office name and link address. |
| `POST/DELETE /api/nodes[/:id]`, `GET /api/nodes/:id/setup`, `POST /api/nodes/:id/refresh` | Remote servers. |
| `POST /api/offices/invite`, `/join`, `DELETE /api/offices/:id`, `POST /api/offices/:id/tasks` | Links between offices and remote jobs. |
| `WS /link/node`, `WS /link/office`, `GET /link/health` | Link port: remote servers and other offices (with token). |
| `GET /api/tasks`, `GET /api/jobs` | Tasks and background jobs. |
| `WS /ws` | Server → client: `state`, `agents`, `teams`, `providers`, `settings`, `message`, `task`, `feed`, `jobs`, `delivery`, `levelup`, `arrived`, `nodes`, `offices`, `visitors`, `projects`, `connections`, `sessions`, `meeting`, `meetings`, `party`, `dialog`, `term`, `term-exit`. Client → server: `go`, `step` (keyboard), `say`, `term-start`, `term-input`, `term-kill`. |

### Experience and levels

`brain.ts` adds experience to the agent when it replies, delivers a task or coordinates its team, and to the boss when receiving a delivery. If the level changes, it broadcasts `levelup` (with `evolved` if the stage also changes) and writes it to the feed. The client draws the effect on the character.

Compis do not exist in the server simulation: the client makes them follow their owner, keeping them at a fixed distance ("leash") from the interpolated position.

### Several offices in one installation

`gateway.ts` stores in `offices.json` the port and database of each office and starts one `server.js` for each, with `PORT`, `DB_PATH` and `LINK_PREFIX=/o/<port>`. The first one uses the original database, so an older installation keeps its data. Offices share no state: the BullMQ queue is common, but each process only waits for its own jobs.

The worker asks the gateway which offices exist and opens its local server connection with each, so a Claude Code or Codex session started from one office works for all.

Linking two offices of the same installation uses the same channel as with an outside one: the gateway asks one for a token (`/internal/invite`) and gives it to the other (`/internal/join`) with the internal address `http://127.0.0.1:<port>`. The `/internal` routes are not exposed by nginx.

### Editable floor plan

The plan is a `Layout` (`w`, `h`, `rooms`, `doors`) stored in the office settings. `compile` turns it into what the simulation uses: walls around each room, valid doors, furniture by room type and size (`KINDS`), desks and points of interest (meeting seats, coffee spots, hangouts and dance floor cells). `check` rejects a plan out of bounds, with overlapping rooms, without the required rooms, with unreachable rooms or with fewer desks than people; before that it tries to open doors in shared walls.

Applying a plan (`applyLayout` in `brain.ts`) moves actors left inside a wall, recomputes ongoing paths and assigns desks: first the own private office, then each person's department zones, then the free ones.

A saved plan without a fun zone gets one once at startup (`addFunRoom`), below the widest room at the bottom of the plan, if it fits and passes `check`. The `funRoomOffered` setting keeps it from coming back if the user deletes it.

## Frontend (`web/src`)

| File | Contents |
|---|---|
| `game/OfficeCanvas.tsx` | Render loop, camera, clicks and hover. |
| `game/architect.ts` | Architect mode: dragging, resizing, doors, adding rooms and undo. Each change is sent whole to the server, which validates and broadcasts the plan. |
| `game/draw.ts` | Floors, walls and furniture (drawn in code, no assets), plus the dance floor, disco ball and confetti. |
| `game/character.ts` | Procedural characters and faces from the appearance, including the dancing pose; portraits. |
| `game/creature.ts` | The eight compi species and their drawing in three stages. |
| `game/daylight.ts` | Light from the browser's time: day phase, window sky, night layer and light sources. |
| `store.ts` | Minimal global state (`useSyncExternalStore`) and `world` (interpolated actors, outside React). |
| `net.ts` | REST and WebSocket against the chosen office (`/o/<port>`), gateway API, office switching and actions (`go`, `selectAgent`, `celebrate`). |
| `ui/*` | Top bar, team list, agent panel, agent and appearance editor, departments, tasks, settings and providers. `ui/Companions.tsx` holds the first choice, the album, the experience bar and the dialog box. `ui/Servers.tsx` shows the servers and the guided login of any tool; `ui/Tools.tsx`, the connections; `ui/ProjectsModal.tsx`, the archive of projects and sessions; `ui/MeetingsModal.tsx`, the meeting room; `ui/OfficesModal.tsx`, the offices panel; `ui/Architect.tsx`, the architect mode panel. |

Drawing order is by depth (Y coordinate of the base of each wall, piece of furniture or character), which gives the 3/4 view: a seated agent stays behind its desk and whoever is north of a wall is hidden by it.

The browser demo (`web/demo`, `vite build --mode demo`) runs this same backend inside the browser: it swaps the database, the queue, the hub, the nodes and the offices for in-memory versions and only thinks with the mock brain.
