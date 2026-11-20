# 🏢 Agent Office

[![Check and deploy demo](https://github.com/MarcRodriguezz/agent-office/actions/workflows/deploy-demo.yml/badge.svg)](https://github.com/MarcRodriguezz/agent-office/actions/workflows/deploy-demo.yml)
[![Demo](https://img.shields.io/badge/demo-agent--office--5cj.pages.dev-e8590c)](https://agent-office-5cj.pages.dev)
[![License: source-available](https://img.shields.io/badge/license-source--available-1c1b19)](LICENSE)

A virtual office where every employee is an AI agent. You are the boss: you walk around the office, go to an agent's desk to talk, call them to your office, hand them work, and they come back with the result when they are done. Agents are organised in departments, hold meetings, split tasks among themselves and work in the background with the LLM you choose (cloud, local, or a CLI such as Claude Code or Codex).

It also has the soul of a creature RPG: everyone in the office (you included) has an original **companion** that follows them around, earns experience from delivered work, levels up and evolves.

Agents can run on this machine or on your own **remote servers**, and several offices can **link to each other** to send each other work.

Everything runs in Docker with a single command.

**Browser demo:** https://agent-office-5cj.pages.dev (mock brain, nothing to install).

> The interface is available in **English and Spanish**: switch with **EN | ES** in the top bar or in *My profile*. The first visit follows your browser's language. This documentation quotes the English labels (in *italics* or **bold**).

## Languages

The whole office speaks English or Spanish: the interface, the activity feed, the messages from the server and the instructions the agents receive. Each office has a language, and the office you open follows the one you choose in your browser.

- **What changes:** every screen, the room names of the default plan, the ready-made team templates (roles, personalities, instructions, departments) and the agents' prompts, so they think and answer in that language.
- **What stays as you wrote it:** anything you typed or renamed yourself (an agent's role, a department, a room). Only texts the office knows are switched.
- **The activity feed** is stored as messages, not as text, so past entries switch language too. Chat conversations and delivered results stay in the language they were written in.

## Quick start

```bash
cp .env.example .env        # optional: only if you want API keys in the environment
docker compose up -d --build
```

Open **http://localhost:8080**.

Running your own installation is meant for contributors preparing a change, or for anyone with written permission: see [License](#license).

The office starts with the development team template (a manager, three developers by seniority and two platform engineers), two departments and a **mock brain** (no LLM), so you can try it without any API key. To make them really think, connect a provider from your computer (in your office) or from the console in the server room.

To stop: `docker compose down` (data is kept in volumes; `docker compose down -v` deletes it).

## How to use it

| You want to… | Do this |
|---|---|
| Move | **WASD** or arrow keys, or click on the floor. Mouse wheel to zoom. |
| Interact with what is next to you | **E** key (nearby agent or object). **Space** advances or closes the dialog box. |
| Talk to an agent | Click on them (or in the list on the left): you walk to their desk and the conversation opens. |
| Have them come to your office | **«Que venga a verme»** button in their panel. |
| Give them a job | Tell them in the chat ("prepare a plan for…") or use the **Tasks** tab. They go to their desk, work in the background and bring you the result. |
| Give a job to a whole department | **Team → Give a job to the whole department**. The lead calls a team meeting, splits the work, waits for the deliveries and brings you the combined result. |
| Hold a meeting or write a spec with several agents | **Meetings** (or the meeting table). See [Meetings and specs](#meetings-and-specs). |
| Celebrate | **Celebrate** (or the jukebox in the fun zone): everyone goes to the dance floor. |
| Hire / edit / fire | **HR** desk or **Hire someone** button. Name, role, personality, face, clothes, department and brain. |
| Create departments | **Team**: name, colour, mission, lead (★) and members. |
| Configure the LLM | **Models and settings** (or your computer, or the server room console). At the top, «Connect in one step»: your Claude account, your ChatGPT account or a pasted API key. |
| Log in to Claude Code or Codex | **Models and settings → Sign in**: a button opens the page, another copies the link or code, and when you finish the office starts using that account. |
| Switch office | Click the office name, top left. |
| Open, link or delete offices | **Offices → My offices**. |
| Switch the language | **EN | ES** in the top bar or *My profile*. The office and its agents switch too (see [Languages](#languages)). |
| Change the floor plan | **Architect**: move and resize rooms, open doors, add departments, offices and rooms. |
| Give an agent a project, permissions and tools | The **Archive** in your office (*Projects* button) for projects and their sessions; **Models and settings → Tools** for GitHub, Cloudflare…; and the *Work* section when editing the agent. |
| Run agents on another server | **Servers and sessions → Add a remote server**, then choose «Where it runs» when editing the agent. |
| Link with another team's office | **Offices → Outside offices**: one creates the invitation and the other pastes it. |
| See background executions | Indicator in the top bar or the **Activity** tab. |
| See all tasks and results | **Task board** in the meeting room. |
| See the companions, their level and discovered forms | **Companions** album. |

## Meetings and specs

Several agents can talk together about one topic. Open **Meetings** (or walk to the meeting table) and call a meeting:

- **Meeting**: they discuss and decide. The result is minutes with a summary, decisions, next steps and open questions.
- **Specification**: they define what will be built. The result is a working document with goal, scope, requirements, technical decisions, risks and who does what.

You choose the topic, optional context, who attends (2 to 8 people) and how many turns each person speaks (1 to 3). The attendees walk to the meeting room and speak in turns: each one reads what has been said so far and answers from their role. You can **step in** at any time from the window; the next speaker answers you. **Close the discussion and write up** ends the debate early and **Call off** cancels it.

When they finish, the chair (the office manager if present, otherwise a department lead, otherwise the first attendee) writes the document. From there you can copy it or press **Hand out the work**: the chair splits the agreed work among the attendees and each one starts their task with the document as context. Every attendee keeps the outcome in their work session, so they remember it later.

## Fun zone and celebrations

The office has a **fun zone** (*Fun zone*) with a dance floor, a jukebox, speakers, arcade machines and a ping-pong table. Press **Celebrate** in the top bar, or use the jukebox, and everyone goes there to dance for a while, including you: lights, a disco ball, confetti and cheers. Agents that are busy with a task join when they finish, if the party is still on.

Offices whose floor plan was saved before this zone existed get one added below the plan once. You can move it, resize it or delete it in architect mode.

## Compis, levels and evolution

The first time you enter you choose your compi among eight original species (Brotín, Ascuo, Gotelo, Voltín, Pedrín, Nubi, Bitxo and Lumo) and give it a nickname. Each agent has their own, which you can change when hiring or editing them.

| Action | Experience |
|---|---|
| Reply in a conversation | +4 |
| Deliver a subtask to the lead | +35 |
| Deliver an own task | +45 |
| Deliver a task coordinating the department | +60 |
| Receive a delivery (your own compi) | +20 |

Every 100 points is a level. Compis evolve at levels 3 and 6, and the album reveals the forms anyone in the office has reached.

## Projects, permissions and external tools

Agents do not only write text: they work on files and use terminal tools, with any brain (API, local model or CLI).

- **Projects.** In the **Archive** (the bookshelf in your office or the *Projects* button) you create a project: a folder under `/workspace` on the server where agents work. There you choose who works on it.
- **Permissions.** When editing an agent you choose *Read only* (reads, changes nothing), *Edit* (creates and edits files and uses its external tools) or *Full freedom* (any command, without asking). Everything happens inside the worker container.
- **External tools.** In **Models and settings → Tools** you connect GitHub, Cloudflare, Vercel, Netlify or any other CLI that reads its credentials from environment variables. You can paste a token or, for GitHub, log in with a code as with Codex. Whatever you install and the sessions you start survive restarts. On each agent you tick which tools it may use: usually one agent or department per tool.
- **Sessions.** Each agent remembers what was said and done in its project. In the Archive you see the sessions, archive them to start over or continue an earlier one. The agent panel has *Start from scratch*.

## Day and night

The office follows your local time: dawn, day, dusk, and at night only monitors and lamps stay on. The clock in the top bar shows the time and phase. To see it at another time, add `?hora=23` to the address.

## Logging in with your account (Claude Code and Codex)

No need to copy tokens by hand. In **Models and settings → Servers and sessions** each server shows whether Claude Code and Codex are logged in:

- **Claude Code**: press *Sign in*, open the link, authorise and paste in the office the code the page gives you.
- **Codex**: press *Sign in*, open the link and enter the one-time code shown; the office notices by itself when you are done.

The same works for GitHub and the other tools in the catalogue. The session is stored in a volume (`agent-home`), so it survives restarts and rebuilds. Then connect the «Claude Code» or «Codex CLI» provider in *Proveedores LLM* and make it the default.

## Remote servers

A remote server runs the work of the agents you assign to it (for example, a machine with a GPU and Ollama, or a VPS with its own Claude Code session).

1. In **Servers and sessions** add the server: the office gives you the command with its token.
2. On the remote machine, with this repository cloned:
   ```bash
   OFFICE_URL=http://office-address:8090/o/3101 NODE_TOKEN=<token> docker compose -f docker-compose.node.yml up -d --build
   ```
3. When editing an agent, pick the server in **Where it runs**.

The remote server connects to the office, so it needs no open ports. The office must be reachable through its **link port** (see below). From the office you can log in to Claude Code and Codex on each server.

## Several offices

One installation hosts as many offices as you like at the same address. In **Offices → My offices** you open a new one (it comes with its template, floor plan and settings), enter any of them, link them with a button or delete them. To switch quickly, click the office name in the top bar.

Two linked offices see each other's people and departments, send each other work and, when it is done, someone from that office walks in through the door to hand it to you in person (**Offices → Give work to another office**).

Another team's office is linked the same way, but with an invitation: one creates it in **Outside offices** and the other pastes it.

## Architect mode

The **Architect** button turns the office into an editable floor plan:

- **Drag** a room to move it and **pull a corner** to resize it.
- **Click a wall** between two rooms to open or close a door. If a room is left without access, one door is opened for it.
- **Add** department zones, private offices, meeting rooms, cafés, lounges, fun zones and server rooms. If they do not fit, the floor grows.
- A department zone is assigned to a department (or creates a new one): its people sit there. A private office can be given to one person.
- Furniture and desks are placed automatically from the room type and size. **Undo** undoes the last change and **Default plan** restores the original.

The office will not save a plan with overlapping or isolated rooms, or with fewer desks than people, and it always keeps your office, HR and one meeting room.

### Link port

Remote servers and other offices come in through a separate port (`LINK_PORT`, 8090) that only exposes the `/o/<office>/link/` routes, protected by a token. By default it only listens on `127.0.0.1`; to accept connections from other machines set `LINK_BIND=0.0.0.0` in `.env`. The interface and the API stay local only.

## LLM providers

Each agent uses the office's default provider or its own (and, optionally, its own model).

| Type | Providers | Notes |
|---|---|---|
| Cloud API | Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek | Anthropic uses the official SDK; the rest, the OpenAI-compatible protocol. |
| Local | Ollama, LM Studio, any OpenAI-compatible server (vLLM, llama.cpp, LiteLLM…) | Your machine is reached through `host.docker.internal`. No API key. |
| CLI agents | Claude Code (`claude -p`), Codex (`codex exec`), custom command | Preinstalled. You log in from the office itself. |
| No LLM | Mock brain | To try the office without spending tokens. |

Details for each one in [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Architecture at a glance

```
browser ──HTTP/WS──▶ web (nginx + React/Canvas)
                        │ /api, /ws
                        ▼
                     server (Fastify)            worker (BullMQ)
                     ├─ office simulation          ├─ Anthropic SDK
                     ├─ agent orchestration        ├─ OpenAI-compatible APIs
                     ├─ SQLite (volume)            ├─ claude / codex / command
                     └─ queues jobs ──▶ redis ──▶  └─ mock brain
```

- **server** owns the state: map, positions, agents, departments, tasks, meetings and conversations.
- **worker** only runs LLM calls. That is the slow part and the one that can fail, so it runs in the background with configurable concurrency.
- **web** draws the office on a `<canvas>` and receives the state over WebSocket.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the reason behind each decision in [docs/DECISIONS.md](docs/DECISIONS.md).

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `OFFICE_PORT` | `8080` | Local web port. |
| `WORKER_CONCURRENCY` | `4` | Simultaneous LLM calls. |
| `LINK_PORT` | `8090` | Link port for remote servers and other offices. |
| `LINK_BIND` | `127.0.0.1` | Interface the link port listens on. `0.0.0.0` to accept other machines. |
| `LINK_PUBLIC_URL` | empty | Address others use to reach this office (can also be set from the interface). |
| `OFFICE_URL`, `NODE_TOKEN` | empty | Only for `docker-compose.node.yml`: office a remote server connects to and its token. |
| `INSTALL_AGENT_CLIS` | `true` | Installs `claude` and `codex` in the image. Set to `false` for a lighter image. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` | empty | Credentials through the environment, as an alternative to saving them from the interface. |

## Continuous integration and demo deploy

`.github/workflows/deploy-demo.yml` runs on every push and pull request: it type checks the backend and the frontend, runs the tests and builds the browser demo. On `main` it then deploys the demo to Cloudflare Pages (project `agent-office`), so https://agent-office-5cj.pages.dev always shows the latest version. It can also be run by hand from the Actions tab.

It needs two repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account id (`npx wrangler whoami`). |
| `CLOUDFLARE_API_TOKEN` | An API token with the *Cloudflare Pages: Edit* permission. |

## Security

This is a **local, single-user** tool: there is no login and the port is only published on `127.0.0.1`. API keys saved from the interface are stored in the SQLite database in the `office-data` volume and are never sent back to the browser. Do not expose it to the Internet as is.

The link port is the only thing meant to be opened to other machines: it only accepts connections with a token generated by the office. Keep in mind that a linked office can give work to your agents (and spend your tokens), and that a remote server runs whatever its office sends, including the «custom command» provider. Only link offices and servers you trust and, outside a private network, put the link behind HTTPS or a VPN.

## Status

First version. Known limitations and next steps in [docs/DECISIONS.md](docs/DECISIONS.md#known-limitations-and-next-steps).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and report security problems privately as described in [SECURITY.md](SECURITY.md).

## License

Agent Office is **source-available, not open source**. You can read the code, use the [official demo](https://agent-office-5cj.pages.dev) and fork it on GitHub only to contribute back to this repository. Using, hosting, redistributing or building on it requires written permission. See [LICENSE](LICENSE).

Copyright (c) 2026 Marc Rodriguez. All rights reserved.
