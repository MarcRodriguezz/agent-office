---
name: start-office
description: Starts Agent Office with Docker and checks it works end to end (API, background queue and browser). Use it to start the app, verify a change or diagnose why it does not respond.
---

# Start and verify the office

## 1. Start

```bash
docker compose up -d --build
docker compose ps
```

Four services must be running: `redis` (healthy), `server`, `worker` and `web`. If Docker Desktop is stopped, start it first.

## 2. Check the API and the queue

```bash
curl -s localhost:8080/api/health
curl -s localhost:8080/o/3101/api/bootstrap | head -c 300
```

Queue test with the mock provider (replace the id with one from `providers` in the bootstrap):

```bash
curl -s -X POST localhost:8080/o/3101/api/providers/<id>/test
```

It must answer `{"ok":true,...}` in 2–4 seconds. If it hangs, the worker is not consuming: `docker compose logs worker`.

## 3. Try the team flow

```bash
curl -s -X POST localhost:8080/o/3101/api/teams/<teamId>/tasks \
  -H "content-type: application/json" \
  -d '{"title":"Prueba","description":"Preparad un plan breve."}'
```

In `docker compose logs -f worker` you should see, in order: `plan`, one `task` per member and `synth`. With the mock brain it takes about a minute because the agents walk to the meeting room.

## 4. Try a meeting and a party

```bash
curl -s -X POST localhost:8080/o/3101/api/meetings -H "content-type: application/json" \
  -d '{"title":"Prueba","goal":"discuss","rounds":1,"agentIds":["<id1>","<id2>"]}'
curl -s -X POST localhost:8080/o/3101/api/party
```

The meeting goes `gathering` → `talking` → `writing` → `done` (watch `meetings` in the bootstrap); the worker logs show one `meeting` per turn and one `minutes`. The party sends everyone to the dance floor for 45 seconds. On Windows, send accented text from the browser rather than `curl`: the terminal may change its encoding. With a real brain, every meeting turn spends a call.

The browser demo (`cd web && npx vite build --mode demo && npx vite preview --outDir dist-demo`) runs everything with the mock brain, without Docker or spending tokens.

## 5. Try it in the browser

Open `http://localhost:8080` and check:

- The office is shown with the agents at their desks and the team list on the left.
- Clicking the floor moves the boss; clicking an agent opens its panel.
- A chat message gets an answer and the bubble appears over the agent.
- The background indicator in the top bar turns on while there are jobs.
- `?hora=23` in the address shows the office at night.

## Common problems

| Symptom | Likely cause |
|---|---|
| The web loads but says «reconectando…» | `server` is down: `docker compose logs server`. |
| Port 8080 is busy | Change `OFFICE_PORT` in `.env`. |
| A local provider does not connect | The URL must use `host.docker.internal`, not `localhost`. |
| `claude` or `codex` do not exist in the worker | The image was built with `INSTALL_AGENT_CLIS=false`. |
| I want to start from scratch | `docker compose down -v` deletes the database. |
