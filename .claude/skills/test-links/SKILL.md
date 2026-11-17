---
name: test-links
description: Sets up locally a remote agent server and a second office to test Agent Office links (remote jobs, CLI login and jobs between offices). Use it when touching nodes.ts, node-client.ts, offices.ts or the link port.
---

# Test remote servers and linked offices

Everything can be tested on one machine with Docker. The main office must be running (`docker compose up -d --build`).

## Remote server

1. Create the server and copy its token:
   ```bash
   curl -s -X POST localhost:8080/o/3101/api/nodes -H 'content-type: application/json' -d '{"name":"Servidor de pruebas"}'
   ```
2. Start it pointing at the link port:
   ```bash
   OFFICE_URL=http://host.docker.internal:8090/o/3101 NODE_TOKEN=<token> docker compose -f docker-compose.node.yml up -d
   ```
3. In `GET /api/bootstrap`, `nodes` must show it with `online: true` and the CLI versions.
4. Try a remote job: `POST /api/providers/<id>/test` with `{"nodeId":"<server id>"}`. In `/api/jobs` the `node` field must be the server's name.
5. Assign an agent (`PATCH /api/agents/<id>` with `nodeId`) and give it a task.

To remove it: `docker compose -p agent-office-node down -v` and delete it in the interface.

## Second office

No other deployment is needed: the gateway opens offices in the same installation.

```bash
curl -X POST localhost:8080/api/hub/offices -H 'content-type: application/json' -d '{"name":"Oficina Norte"}'   # returns its id (3102…)
curl -X POST localhost:8080/api/hub/links -H 'content-type: application/json' -d '{"a":"3101","b":"3102"}'
curl localhost:8080/api/hub/offices
```

1. `GET /api/hub/offices` must show both with a link `online: true` to the other.
2. In the interface, the office name (top left) switches between them.
3. `GET /o/3101/api/bootstrap` must include the other's directory in `offices.peers`.
4. Send a job to a person and to a department. Check in the receiving office that the task carries the origin, and in the sending one that a visitor walks in to deliver it and the dialog box appears.
5. Restart the server (`docker compose up -d --force-recreate server`): every office must come back and relink by itself within seconds.

To remove it: `curl -X DELETE localhost:8080/api/hub/offices/3102` (or **Oficinas → Eliminar esta oficina**). The other office must lose the link.

A link with another team's office is tested with a second installation (`OFFICE_PORT=8081 LINK_PORT=8091 docker compose -p agent-office-2 up -d`) and an invitation from **Oficinas → Oficinas de fuera**.

## CLI login

In **Modelos y ajustes → Servidores y sesiones**, *Iniciar sesión* must show the link (Claude Code) or the link and the code (Codex) within a few seconds. Completing it requires a real account; without one, it is enough to check that the link appears and that closing the window ends the process.

From the command line:

```bash
docker compose exec worker claude auth status
docker compose exec worker codex login status
```
