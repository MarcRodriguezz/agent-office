# Design decisions

Record of the decisions taken, with their reason and what was discarded. Decisions 1 to 12: 2026-11-13. Decisions 13 to 15: 2026-11-16. Decisions 19 to 25: 2026-11-17.

## 1. What the product is

**Decision:** a "living" virtual office where you are the boss and the employees are AI agents that do real work with an LLM (writing, analysing, planning) and deliver it in person.

**Reason:** the original idea was a simulated factory; when it was made concrete an office was asked for, with private offices, visits between desks and LLM configuration inside the space itself. It mixes the best of the two options considered: the visual side of a simulation and the usefulness of agents that produce something.

**Own aesthetic:** characters and furniture drawn in code, flat 3/4 view. It is an original management game, not a recreation of any existing title.

## 2. The LLM does not run the simulation

**Decision:** moving, sitting, having a coffee or chatting is normal server code. The LLM only steps in at a few moments: conversation, planning a split, doing a task, combining deliveries and speaking or writing minutes in a meeting.

**Reason:** if a model decided every step, it would be slow and expensive. This way a single task costs one call and a department task costs `2 + number of members involved`. Idle life costs nothing.

## 3. Authoritative server

**Decision:** positions and states live on the server and are broadcast over WebSocket; the browser interpolates and only sends intentions.

**Reason:** agents keep working when you close the tab, several tabs see the same thing and the map is defined in a single place (`backend/src/map.ts`).

**Discarded:** client-side simulation (simpler, but work would stop when the browser closes).

## 4. Background execution with BullMQ + Redis

**Decision:** each LLM call is a job in a BullMQ queue run by a separate `worker` container.

**Reason:** calls take from seconds to minutes (even more with the CLIs) and can fail. Outside the process that moves the office they block nothing, concurrency is limited (`WORKER_CONCURRENCY`) and workers can be scaled (`docker compose up --scale worker=3`).

**Details:**
- The worker is stateless and never touches the database: it receives provider + prompt and returns text. All logic lives in `server`.
- One attempt per job: the usual errors (invalid key, unknown model) do not get better by retrying, and the Anthropic SDK already retries transient ones.
- Jobs are removed from Redis when they end because their data carries the API key. The completed and failed counters are kept in server memory.

**Discarded:** `setTimeout`/promises inside the server (no concurrency limit or isolation) and Celery/Temporal (too much for a first version).

## 5. Providers

**Decision:** six adapter kinds that cover virtually any LLM:

| Kind | Covers |
|---|---|
| `anthropic` | Claude through the API, with the official SDK. |
| `openai` | Everything that speaks `/chat/completions`: OpenAI, Gemini, OpenRouter, Groq, Mistral, DeepSeek, Ollama, LM Studio, vLLM, llama.cpp, LiteLLM… |
| `claude-code` | Claude Code in non-interactive mode, to use a subscription. |
| `codex` | OpenAI's Codex CLI. |
| `cli` | Any command that reads stdin and writes stdout. |
| `mock` | Mock brain to try it for free. |

**Reason:** the OpenAI protocol is the de facto standard, so one generic adapter with presets supports a dozen providers without specific code. Anthropic has its own adapter to use its SDK. The CLIs are included because they allow using already authenticated agents and subscriptions.

**Default Anthropic model:** `claude-opus-5-5`. It can be changed per provider or per agent.

**Provider per agent:** each agent can use the office's or its own, and its own model. This allows mixing (for example, leads on a powerful model and the rest on a local one).

## 6. Departments

**Decision:** the hierarchy is expressed with departments (`teams`) that have a colour, a mission, members and a lead. There is no "reports to" field on the agent.

**Reason:** it is easier to understand and edit than an arbitrary org chart, and it enables the collaborative behaviour: meeting in the room, split, deliveries to the lead and synthesis.

**Firm rules in code (not in the prompt):**
- Only top-level tasks are delegated. A subtask is never split again, so there are no loops or endless chains.
- At most one subtask per member.
- If the lead's plan is not valid JSON or comes out empty, the lead does the task.
- The meeting waits for members for at most 45 seconds.

## 7. How a task is created from the chat

**Decision:** the agent decides whether a message is a job by adding `[[TAREA: …]]` at the end of its answer; the server detects it, creates the task and hides the tag.

**Reason:** it works with any provider, including local models and CLIs, which share no common *tool calling* mechanism. There is also the explicit form in the Tasks tab.

## 8. Persistence in SQLite with `node:sqlite`

**Decision:** one SQLite database in a volume, using the module included in Node 24.

**Reason:** a single process writes (the server), there is little data and there are no native dependencies to compile or another container to run.

**Discarded:** Postgres (unnecessary while only one process writes).

## 9. Frontend: React + Canvas 2D without a game engine

**Decision:** the office is painted on a `<canvas>` with our own functions; the panels are React. No assets: floors, furniture, characters and faces are generated in code.

**Reason:** customisable faces come for free (the same drawing serves the character, the portrait and the editor), there are no art licences to manage and the bundle is minimal. For ~10 characters an engine such as Phaser or PixiJS adds nothing.

## 10. One port, local only

**Decision:** nginx serves the frontend and proxies the API and the WebSocket. Only `127.0.0.1:8080` is published. There is no authentication.

**Reason:** it is a personal tool. Publishing only on loopback avoids exposing to the local network an API that stores keys and can run commands (`cli` provider).

## 11. Language

**Decision:** the interface and the prompts are in Spanish; the agents answer in the language they are spoken to. Documentation, code-related notes and commit messages are in English (changed on 2026-11-17, see decision 25).

## 12. Creature RPG layer: compis, experience and evolution

**Decision:** everyone in the office has a companion creature ("compi") that follows them, and delivered work gives experience. Every 100 points is a level and the compi evolves at levels 3 and 6. Keyboard movement, a key to interact, a dialog box with progressive text for what agents tell you, an initial compi choice and a collection album were also added.

**Reason:** a creature-collecting RPG feel was requested. It brings visible progression (you can see who has worked more), reasons to come back and personality for each agent, without touching the work flow.

**Original creatures:** the eight species, their names, types and designs belong to this project and are drawn in code (`web/src/game/creature.ts`). The mechanics of the genre are taken (companions, levels, evolutions, collection), not characters, names or art from any existing game.

**Experience is granted by the server**, never by the client or the LLM: it is added in `brain.ts` when a conversation, a task or a delivery completes. That way it cannot be inflated from the browser and does not depend on what a model says.

**Compis are only visual, in the client:** they follow their owner on a "leash" computed in the browser from the owner's position. They are not server actors, do not occupy cells and add no network traffic.

**The type is cosmetic.** There are no battles or type advantages: they do not fit an office and would add complexity without helping real work.

**Discarded for now:** wild creatures that appear and can be adopted, items, and having the level affect the agent's behaviour (for example, unlocking tools or a better model).

## 13. Remote servers that connect to the office

**Decision:** a remote server is the same worker with two variables (`OFFICE_URL`, `NODE_TOKEN`). It opens the connection (WebSocket) to the office and receives through it the jobs of the agents assigned to it. Each agent chooses where it runs.

**Reason:** it allows spreading agents across machines (one with a GPU, another with a different subscription) without exposing Redis or opening ports on the remote server: it only needs to reach the office. The image and provider adapters are reused.

**Details:**
- Local jobs still go through BullMQ; remote ones go through the server's WebSocket, which applies its own concurrency.
- If an agent's server is disconnected, its job fails with a clear message. It is not diverted to another machine, because the configured provider (a local model, a specific session) may not exist there.
- When a server is removed, its agents run in the office again.

**Discarded:** exposing Redis to remote workers (it would have to be protected and opened to the network) and controlling servers over SSH from the office (it requires storing credentials for other machines).

## 14. Real Claude Code and Codex login from the interface

**Decision:** the office runs each CLI's official login (`claude auth login`, `codex login --device-auth`) inside the chosen server, shows the output and forwards the code the user pastes. The session is stored in a volume.

**Reason:** using a subscription should not require entering the container or copying tokens. Each tool's official flow is used instead of reimplementing its OAuth, so it keeps working when they change.

**Details:**
- Only a fixed set of actions can be launched (log in and out of each CLI): the interface offers no free terminal.
- The pseudo-terminal comes from `script`, already in the image, to avoid compiling native modules.
- The image now installs `ca-certificates`: without them Codex could not connect over HTTPS.

## 15. Independent offices that connect to each other

**Decision:** each office is a complete, autonomous installation. Two offices link with an invitation code and a persistent WebSocket; they share their directory of people and departments and send each other jobs. There is no central server.

**Reason:** each office keeps its data, its keys and its spending, can be on another machine or belong to another person, and keeps working alone if the link drops.

**Details:**
- Only the joining office needs to reach the other; the channel is bidirectional.
- A remote job is a normal local task with an origin: it reuses the existing flow (including team split) and the anti-loop rules.
- The delivery is shown as a visitor walking into the office that sent the job.
- Results that cannot be delivered because of a drop are kept in memory and reconciled on reconnect.
- The link comes in through a separate port that only publishes `/link/` and requires a token, so it can be opened to other machines without exposing the interface or the API.

**Discarded:** several offices inside one server and database (couples data and keys of different teams) and a central office directory.

## 16. Several offices at the same address, one process per office

**Decision:** one installation hosts several offices. A gateway (`gateway.ts`) starts one `server.js` process per office, each with its internal port and its database, and nginx routes `/o/<port>/…` to the right one. The interface picks the office with a switcher and manages them from a panel.

**Reason:** managing several offices should not require another deployment on another port. One process per office keeps decision 15 (autonomous offices, separate data and keys) without rewriting the server to be multi-tenant: all in-memory state (simulation, runtimes, links) still belongs to a single office.

**Details:**
- Linking two local offices is the same protocol as with an outside one; only who hands out the token changes.
- The worker is shared: a Claude Code or Codex session works for every office in the installation.
- Each office's link address carries its prefix (`…:8090/o/3101`). `/link/` without prefix still reaches the first office so already deployed remote servers keep working.

**Discarded:** a multi-tenant server with a shared database (large rewrite and couples data) and one container per office created from the interface (requires access to the Docker socket).

## 17. The floor plan is data and furniture is derived

**Decision:** the office is described with rectangular rooms and doors. Walls, furniture, desks and points of interest are computed from that. Architect mode only edits rooms and doors, and the server validates and applies every change.

**Reason:** editing piece by piece is slow and lets you leave the office broken. With typed rooms, whoever edits thinks of "a private office" or "a zone for Marketing" and the result is always walkable.

**Details:**
- The server rejects plans with overlapping or unreachable rooms or without enough desks, and opens doors by itself when a room has no access.
- Desks are assigned by belonging: own private office, department zone, free desks. Moving someone to another department moves their seat.
- Changes apply live: characters recompute their path and walk to their new desk.

**Discarded:** a free furniture editor and a client-side draft saved at the end (it would duplicate validation in the browser).

## 18. Paper and ink interface

**Decision:** the interface uses a light background, ink borders, straight corners, one typeface with its monospace (IBM Plex) and a single accent colour. No emojis as icons, no frosted glass and no gradients. Buttons respond with an offset and a hard shadow.

**Reason:** the previous look (translucent dark panels, blue, everything rounded and full of emojis) read as a generic template. The drawn office is the showpiece; the interface should look like a tool with its own judgement and not compete with it.

**Details:** the principles of the `design-taste-frontend` skill that apply to an application were followed (one button system, one radius scale, flat colour, plain text). Its build and verification flow is meant for company websites and was not used.

## 19. Agents work in project folders with per-agent permissions

**Decision:** each agent has a project (a folder inside `/workspace` of the server where it runs, or the general folder) and a permission level: *read only*, *edit* or *full freedom*. It applies to any brain: CLIs get the permissions through their own options and API models (Anthropic, OpenAI-compatible and local) get tools from the office.

**Reason:** agents should do real work on files, not just text, without the model kind changing what they can do. Permissions are in code, not in the prompt.

**How each level is translated:**

| | Read only | Edit | Full freedom |
|---|---|---|---|
| Claude Code | `--disallowedTools Bash Edit Write NotebookEdit` | `--permission-mode acceptEdits` and `Bash(<command>:*)` for each of the agent's external tools | `--permission-mode bypassPermissions` |
| Codex | `sandbox_mode="read-only"` | `sandbox_mode="workspace-write"` (with network if it has external tools) | `--dangerously-bypass-approvals-and-sandbox` |
| API and local models | `list_files`, `read_file`, `search` | plus `write_file`, `replace_in_file` and `run_tool` (only its tools' commands, no shell) | plus `shell` |

- With read only and edit, the office tools never leave the project folder.
- The API tool loop is capped at 40 steps; at the cap the final answer is requested without tools.
- If an OpenAI-compatible model does not support tools, the call is repeated without them.
- Everything happens inside the worker container: that is the isolation. `/workspace` is a volume, so the work is kept.

**Discarded for now:** mounting folders from your machine into the worker and a worker without Docker. They can be added without changing this model, because the agent only knows a folder relative to `/workspace`.

## 20. External tools as connections

**Decision:** a catalogue in code (`backend/src/tools.ts`) describes the terminal tools the office knows how to install and log in to: GitHub (`gh`), Cloudflare (`wrangler`), Vercel and Netlify, plus Claude Code and Codex. A **connection** stores a tool's credentials (its environment variables) and each agent chooses which connections it uses. There are also "other tool" connections with a free command and variables.

**Reason:** real work goes through external services (pushing code, deploying). Credentials as environment variables work with any CLI and any brain, because the agent receives them in the process that runs the commands.

**Details:**
- Install, log in and log out remain a closed list of actions: the server takes them from the catalogue, not from the interface. There is no free terminal.
- `gh` ships in the image. The rest is installed with `npm` into `/home/node/.local` (`agent-home` volume), like the CLI sessions: it survives restarts and rebuilds.
- The `gh` login uses the device flow without prompts (`GH_PROMPT_DISABLED`) and ends with `gh auth setup-git`, so `git push` works.
- System variables (`PATH`, `HOME`, `NODE_OPTIONS`…) cannot be overwritten.
- Credentials are stored in SQLite like the API keys and never go back to the browser: the interface only sees the variable names.

## 21. Work sessions that can be continued or archived

**Decision:** each agent has one session per project where what was said and done accumulates (chat and tasks). Sessions are office objects: they are shown in the **Archivo** (the bookshelf in your office), and from there they are archived, continued or forgotten. The agent panel can "start over".

**Reason:** when you come back to the office the agent picks up where it left off, and the boss decides when to start clean.

**Details:**
- Claude Code resumes the real session (`--session-id` the first time and `--resume` afterwards; the office sets the id). Codex resumes with `codex exec resume`, using the id it returns in its JSON output. API models receive the last 30 turns stored in the session.
- On resume the current context (role, project, permissions) is sent again, in case it changed.
- A session belongs to an agent, a project, a brain kind and a server. If the brain or the server changes another one starts, because the previous one cannot be resumed there.
- Calls of one session run one at a time: if you talk to an agent while it does a task, it answers when it finishes. Team split and synthesis do not use the session; the final result is written into the lead's.
- When an agent moves to another project, the previous project's session stays open and is resumed on return.

## 22. The office follows the real time

**Decision:** the browser paints the office according to its local time: day, dawn, dusk or night. At night the windows show a dark sky with stars and the office darkens, except the areas lit by monitors, console, café, reception, whiteboard, jukebox, arcades and dance floor. A clock in the top bar shows the time and phase.

**Reason:** it brings the office to life and shows at a glance who is still at their desk at night. It is purely visual, so the client computes it and it costs the server nothing.

**Details:** the night layer is recomputed once per second at half resolution. `?hora=23` in the address forces a time to try it.

## 23. Multi-agent meetings and specs

**Decision:** the boss can call a meeting with 2 to 8 agents about a topic, with one of two goals: *discuss* (the result is minutes with decisions and next steps) or *spec* (the result is a working document with requirements, technical decisions, risks and who does what). The attendees walk to the meeting room and speak in turns; the boss can step in at any time. The chair writes the final document and, if asked, splits the agreed work into one task per attendee.

**Reason:** some work does not belong to one person: defining what to build, deciding between options or reviewing a plan needs several roles answering each other. A department job already has a team meeting, but it is a scripted split by the lead; here the agents really talk to each other and the boss takes part.

**Details:**
- Turns are round-robin and each turn is one stateless call (`ask`, intent `meeting`) with the transcript so far. The agent's work context goes with it, so an attendee with a project can look at its files while speaking. Meeting turns do not go into the agents' sessions; the final document does, so each attendee remembers the outcome.
- The chair is the office manager if present, otherwise a department lead, otherwise the first attendee. It writes the document with the `minutes` intent.
- Splitting the work reuses the plan format and parser of departments (`parsePlan`): at most one task per attendee, and each task carries the document as context.
- Limits in code, not in the prompt: one meeting at a time, 2 to 8 attendees, 1 to 3 turns each, lines clipped at 1,500 characters, the last 40 lines in each prompt, 60 seconds to gather.
- Agents reach the room through the same serial chain as tasks (`gather`): whoever is busy arrives when they finish. A meeting interrupted by a restart is marked as failed.

**Discarded:** a free-for-all where any agent may speak at any time (more calls, harder to follow and to cap) and having the LLM pick the next speaker (costs a call per turn and adds little with so few people).

## 24. Fun zone and celebrations

**Decision:** a new room kind, the *fun zone*, with a dance floor, jukebox, speakers, arcade machines, ping-pong table and beanbags. The **Celebrar** button (or the jukebox) starts a 45-second party: every agent and the boss go to the dance floor and dance, with lights, a disco ball, confetti and cheers.

**Reason:** the office should also celebrate finished work. It is a moment that involves everyone and makes the office feel alive.

**Details:**
- The party is code, not LLM: it costs no tokens. Dancing is a new actor status (`dancing`); the client animates the pose and turns.
- Agents join through `gather`, so whoever is in the middle of a task joins when they finish, if the party is still on. A party never interrupts work in progress.
- The boss walks to the dance floor too and stops dancing as soon as they move.
- The default plan grows to 44×34 with a lounge and a fun zone. Offices with a saved plan get a fun zone added once at startup, below the plan, if it fits; the `funRoomOffered` setting keeps it from reappearing if it is deleted. Without a fun zone, the party happens in the hangout spots.

## 25. Documentation in English

**Decision:** the README, the documents in `docs/`, the project skills and the commit messages are written in English. The interface and the prompts stay in Spanish.

**Reason:** the repository is meant to be shown and shared; English makes it readable for more people. The office itself is still used in Spanish, so the documentation quotes the interface labels as they appear on screen.

## Known limitations and next steps

- **No "ask me" mode.** Permissions are read only, edit or full freedom. Next step: the agent comes to your desk to ask before a sensitive action (Claude Code allows it with `--permission-prompt-tool`; Codex has no equivalent without a terminal).
- **Projects live inside the worker.** Folders from your machine are not mounted and there is no file browser in the interface: code comes in and out with git or the external tools.
- **No diff of what an agent changed** and no branch per task: two agents in the same project share the same folder.
- **npm blocks the install scripts** of tools installed from the office. Wrangler still deploys; anything that needs those scripts has to be installed with full freedom.
- **Memory per session, not long term.** A session keeps the last 30 turns (or the whole session in Claude Code and Codex). There are no summaries or memory carried from one session to another.
- **One meeting at a time**, and meeting turns are sequential: a meeting of 8 people and 3 turns is 25 calls.
- **No streaming** of answers in the chat or in meetings.
- **As many agents as desks** fit in the plan; for more, grow it in architect mode.
- **All offices of an installation share the worker and CLI sessions**: a different account per office is only possible with API keys or a remote server.
- **Architect mode does not allow loose furniture** or non-rectangular rooms.
- **Restarts:** tasks and meetings in progress when the server restarts are marked as failed; they do not resume.
- **No token budget** per agent and no cost counter.
- **One user per office**, without login in the interface.
- **The link is not encrypted by itself.** Between machines it has to go behind HTTPS or a VPN. A linked office can send unlimited work.
- **Offices do not share conversation or tasks live**: only directory, jobs and results. You cannot walk around the other office.
- **API keys are stored unencrypted** in SQLite (local volume).
- **Collisions:** characters walk through each other.
- **The level does not change what an agent can do.** Progression is visual; linking it to real capabilities (tools, memory, model) is a natural next step.
